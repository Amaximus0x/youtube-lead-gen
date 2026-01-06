<script lang="ts">
  import { channelsStore } from '$lib/stores/channels';
  import { fetchPage } from '$lib/api/pagination';
  import type { ChannelSearchResult } from '$lib/types/api';

  // Accept channels as prop (for filtered channels from parent)
  export let channels: ChannelSearchResult[] = [];
  export let searchFormHandlers: any = null;

  // Fallback to store if no prop provided (backward compatibility)
  $: displayChannels = channels.length > 0 ? channels : $channelsStore.channels;
  $: stats = $channelsStore.stats;
  $: pagination = $channelsStore.pagination;
  $: isLoadingMore = $channelsStore.isLoadingMore;
  $: isEnriching = $channelsStore.isEnriching;
  $: currentKeyword = $channelsStore.currentKeyword;
  $: searchLimit = $channelsStore.searchLimit;
  $: searchFilters = $channelsStore.searchFilters;

  let selectedChannel: ChannelSearchResult | null = null;
  let showEmailModal = false;
  let showToast = false;
  let toastMessage = '';
  let isLoadingMoreChannels = false;
  let isEnrichingVideoData = false;
  let isSearchingMore = false;

  async function handleLoadMore() {
    if (!pagination || !currentKeyword) return;

    channelsStore.setLoadingMore(true);

    try {
      const nextPage = pagination.currentPage + 1;
      console.log('[LoadMore] Fetching page', nextPage);

      const data = await fetchPage(
        currentKeyword,
        nextPage,
        pagination.pageSize,
        pagination.searchSessionId,
        searchLimit || undefined,
        searchFilters || undefined
      );

      console.log('[LoadMore] Page', nextPage, 'loaded successfully');
      console.log('[LoadMore] Response data:', data);
      console.log('[LoadMore] New channels count:', data.channels?.length);
      console.log('[LoadMore] New pagination:', data.pagination);

      // Validate response
      if (!data.channels || !Array.isArray(data.channels)) {
        throw new Error('Invalid response: channels data is missing or not an array');
      }

      // Append new channels to existing list
      console.log('[LoadMore] Appending', data.channels.length, 'channels to store');
      channelsStore.appendChannels(data.channels, data.stats, data.pagination);
      console.log('[LoadMore] Store updated successfully');
    } catch (error) {
      console.error('[LoadMore] Error loading more channels:', error);
      channelsStore.setError(
        error instanceof Error ? error.message : 'Failed to load more channels'
      );
    } finally {
      // Ensure loading state is reset even if there's an error
      channelsStore.setLoadingMore(false);
    }
  }

  /**
   * Search 50 More - Comprehensive function that:
   * 1. Loads enriched channels from database (if any remaining)
   * 2. Enriches unscraped channels from database (if any)
   * 3. Scrapes new channels from YouTube (if needed to reach 50)
   */
  async function handleSearchMore() {
    if (!pagination || !pagination.searchSessionId) {
      console.error('[SearchMore] Missing required data');
      showToastMessage('Unable to search more: session not found');
      return;
    }

    if (!searchFormHandlers) {
      console.error('[SearchMore] Missing searchFormHandlers');
      showToastMessage('Unable to search more: handlers not available');
      return;
    }

    isSearchingMore = true;
    let totalNewChannels = 0;

    try {
      console.log(`[SearchMore] Starting comprehensive search for session ${pagination.searchSessionId}`);

      // Step 1: Load enriched channels from database that haven't been displayed yet
      if (stats && stats.filtered > displayChannels.length) {
        const remainingInDb = stats.filtered - displayChannels.length;
        const toLoad = Math.min(remainingInDb, 50);

        console.log(`[SearchMore] Step 1: Loading ${toLoad} enriched channels from database`);

        try {
          const offset = displayChannels.length;
          const data = await searchFormHandlers.handleLoadMoreChannels(
            pagination.searchSessionId,
            offset,
            toLoad
          );

          if (data && data.channels && data.channels.length > 0) {
            console.log(`[SearchMore] Loaded ${data.channels.length} enriched channels from DB`);

            channelsStore.appendChannels(
              data.channels,
              {
                ...stats,
                displayed: displayChannels.length + data.channels.length,
              },
              {
                ...pagination,
                hasMore: data.hasMore,
              }
            );

            totalNewChannels += data.channels.length;

            // If we got 50 channels, we're done
            if (totalNewChannels >= 50) {
              showToastMessage(`Loaded ${totalNewChannels} channels from database!`);
              return;
            }
          }
        } catch (error) {
          console.error('[SearchMore] Error loading from database:', error);
          // Continue to next step even if this fails
        }
      }

      // Step 2: Enrich unscraped channels from database (channels without video data)
      // Note: This enriches existing channels, doesn't add new ones to the total count
      const channelsNeedingEnrichment = displayChannels.filter(
        (ch) => !ch.lastPostedVideoDate || !ch.avgRecentViews
      );

      if (channelsNeedingEnrichment.length > 0 && totalNewChannels < 50) {
        const toEnrich = Math.min(channelsNeedingEnrichment.length, 10); // Limit to 10 to avoid long wait times
        console.log(`[SearchMore] Step 2: Enriching ${toEnrich} channels with video data`);

        try {
          const channelIds = channelsNeedingEnrichment.slice(0, toEnrich).map((ch) => ch.channelId);

          showToastMessage(`Enriching ${channelIds.length} channels... This may take a moment.`, 5000);

          await searchFormHandlers.handleEnrichVideoData(channelIds);

          // Fetch updated data
          const updatedData = await searchFormHandlers.handleLoadMoreChannels(
            pagination.searchSessionId,
            0,
            displayChannels.length
          );

          if (updatedData && updatedData.channels) {
            channelsStore.setChannels(
              updatedData.channels,
              stats,
              pagination,
              searchLimit,
              searchFilters
            );

            console.log(`[SearchMore] Enriched ${channelIds.length} channels with video data`);
          }
        } catch (error) {
          console.error('[SearchMore] Error enriching channels:', error);
          // Continue to next step even if this fails
        }
      }

      // Step 3: Scrape new channels from YouTube if we still need more
      if (totalNewChannels < 50) {
        const needed = 50 - totalNewChannels;
        console.log(`[SearchMore] Step 3: Scraping ${needed} new channels from YouTube`);

        let response = await fetch(`/api/youtube/search/continue/${pagination.searchSessionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            additionalChannels: needed,
          }),
        });

        // If session not found (404), create a new search session
        if (response.status === 404 && currentKeyword) {
          console.log(`[SearchMore] Session expired, creating new search session for keyword: ${currentKeyword}`);
          showToastMessage('Session expired. Creating new search session...', 3000);

          // Start a new search with the current keyword and limit
          const newSearchResponse = await fetch('/api/youtube/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              keyword: currentKeyword,
              limit: needed,  // Only search for the needed amount
              filters: searchFilters,
            }),
          });

          if (!newSearchResponse.ok) {
            throw new Error('Failed to create new search session');
          }

          const newSearchData = await newSearchResponse.json();

          if (newSearchData.success && newSearchData.data) {
            console.log(`[SearchMore] New session created: ${newSearchData.data.jobId}`);

            // Poll the new job to completion
            if (searchFormHandlers && newSearchData.data.jobId) {
              // Wait for the new search to complete by polling
              showToastMessage('Searching for more channels...', 5000);

              // Simple polling loop for the new search
              let pollCount = 0;
              const maxPolls = 60; // 60 polls * 2s = 2 minutes max

              while (pollCount < maxPolls) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

                const jobStatus = await fetch(`/api/youtube/search/${newSearchData.data.jobId}`);
                const jobData = await jobStatus.json();

                if (jobData.status === 'completed' || jobData.isComplete) {
                  console.log(`[SearchMore] New search completed with ${jobData.channels?.length || 0} channels`);

                  if (jobData.channels && jobData.channels.length > 0) {
                    // Append the new channels
                    channelsStore.appendChannels(
                      jobData.channels,
                      jobData.stats,
                      {
                        ...pagination,
                        searchSessionId: jobData.sessionId || pagination.searchSessionId,
                        hasMore: !jobData.isComplete,
                      }
                    );

                    totalNewChannels += jobData.channels.length;
                  }
                  break;
                }

                if (jobData.status === 'failed') {
                  throw new Error('New search failed');
                }

                pollCount++;
              }

              if (pollCount >= maxPolls) {
                throw new Error('New search timed out');
              }
            }
          }
        } else if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to search more channels from YouTube');
        } else {
          // Normal flow - session still valid
          const data = await response.json();

          if (data.success && data.channels) {
            console.log(`[SearchMore] Received ${data.channels.length} new channels from YouTube`);

            channelsStore.appendChannels(data.channels, data.stats, data.pagination);

            totalNewChannels += data.channels.length;
          }
        }
      }

      // Update the search limit to reflect the new total
      // This ensures the limit is saved correctly for history restore
      if (totalNewChannels > 0 && searchLimit) {
        const newLimit = searchLimit + totalNewChannels;
        console.log(`[SearchMore] Updating search limit from ${searchLimit} to ${newLimit}`);

        // Update the store with the new limit
        channelsStore.setChannels(
          displayChannels,
          stats,
          pagination,
          newLimit,  // Updated limit
          searchFilters
        );
      }

      // Show final success message
      if (totalNewChannels > 0) {
        showToastMessage(`Found ${totalNewChannels} more channels!`, 5000);
      } else {
        showToastMessage('No more channels available at this time.', 5000);
      }

    } catch (error) {
      console.error('[SearchMore] Error:', error);
      showToastMessage(
        error instanceof Error ? error.message : 'Failed to search more channels',
        5000
      );
    } finally {
      isSearchingMore = false;
    }
  }

  /**
   * Load more enriched channels from database
   */
  async function handleLoadMoreFromDatabase() {
    if (!searchFormHandlers || !pagination || !pagination.searchSessionId) {
      console.error('[LoadMoreDB] Missing required data');
      return;
    }

    isLoadingMoreChannels = true;

    try {
      const offset = displayChannels.length;
      const limit = 20; // Fetch 20 more channels at a time

      console.log(`[LoadMoreDB] Fetching ${limit} channels from offset ${offset}`);

      const data = await searchFormHandlers.handleLoadMoreChannels(
        pagination.searchSessionId,
        offset,
        limit
      );

      if (data && data.channels && data.channels.length > 0) {
        console.log(`[LoadMoreDB] Received ${data.channels.length} channels`);

        // Track the count before appending
        const beforeCount = displayChannels.length;

        // Append to store (will filter duplicates internally)
        channelsStore.appendChannels(
          data.channels,
          {
            ...stats,
            displayed: displayChannels.length + data.channels.length,
          },
          {
            ...pagination,
            hasMore: data.hasMore,
          }
        );

        // Wait a tick for the store to update, then calculate actual added count
        setTimeout(() => {
          const afterCount = displayChannels.length;
          const actualAdded = afterCount - beforeCount;
          const duplicatesFiltered = data.channels.length - actualAdded;

          toastMessage = `Loaded ${actualAdded} new channel${actualAdded !== 1 ? 's' : ''}!${duplicatesFiltered > 0 ? ` (${duplicatesFiltered} duplicate${duplicatesFiltered !== 1 ? 's' : ''} filtered)` : ''}`;
          showToast = true;
          setTimeout(() => {
            showToast = false;
          }, 3000);
        }, 100);
      }
    } catch (error) {
      console.error('[LoadMoreDB] Error:', error);
      toastMessage = 'Failed to load more channels';
      showToast = true;
      setTimeout(() => {
        showToast = false;
      }, 3000);
    } finally {
      isLoadingMoreChannels = false;
    }
  }

  /**
   * Enrich video data for channels missing it
   */
  async function handleGetVideoData() {
    if (!searchFormHandlers || !pagination || !pagination.searchSessionId) {
      console.error('[GetVideoData] Missing searchFormHandlers or pagination');
      return;
    }

    // Find channels missing video data
    const channelsNeedingVideoData = displayChannels.filter(
      (ch) => !ch.lastPostedVideoDate || !ch.avgRecentViews
    );

    if (channelsNeedingVideoData.length === 0) {
      toastMessage = 'All channels already have video data!';
      showToast = true;
      setTimeout(() => {
        showToast = false;
      }, 3000);
      return;
    }

    isEnrichingVideoData = true;

    try {
      const channelIds = channelsNeedingVideoData.map((ch) => ch.channelId);
      console.log(`[GetVideoData] Enriching ${channelIds.length} channels`);

      toastMessage = `Enriching video data for ${channelIds.length} channels... This may take a few minutes.`;
      showToast = true;

      const result = await searchFormHandlers.handleEnrichVideoData(channelIds);

      // After enrichment completes, fetch updated data from database
      console.log(`[GetVideoData] Fetching updated channel data...`);

      try {
        // Fetch updated data for the enriched channels
        const updatedData = await searchFormHandlers.handleLoadMoreChannels(
          pagination.searchSessionId,
          0, // Start from beginning
          displayChannels.length // Fetch all current channels
        );

        if (updatedData && updatedData.channels) {
          console.log(`[GetVideoData] Received ${updatedData.channels.length} updated channels`);

          // Update the store with fresh data (replacing existing channels)
          channelsStore.setChannels(
            updatedData.channels,
            stats,
            pagination,
            searchLimit,
            searchFilters
          );

          // Show success message
          showToast = false;
          setTimeout(() => {
            toastMessage = `${result.message} - Data refreshed automatically!`;
            showToast = true;
            setTimeout(() => {
              showToast = false;
            }, 5000);
          }, 100);
        }
      } catch (refreshError) {
        console.error('[GetVideoData] Failed to refresh data:', refreshError);
        // Show partial success message
        showToast = false;
        setTimeout(() => {
          toastMessage = `${result.message} - Please refresh page to see updates.`;
          showToast = true;
          setTimeout(() => {
            showToast = false;
          }, 8000);
        }, 100);
      }
    } catch (error) {
      console.error('[GetVideoData] Error:', error);
      showToast = false;
      setTimeout(() => {
        toastMessage = 'Failed to enrich video data. Check console for details.';
        showToast = true;
        setTimeout(() => {
          showToast = false;
        }, 5000);
      }, 100);
    } finally {
      isEnrichingVideoData = false;
    }
  }

  function formatSubscribers(count: number | undefined): string {
    if (!count) return 'Unknown';
    if (count >= 1000000) {
      // Better rounding: 1.25M stays 1.25M, not 1.3M
      const value = count / 1000000;
      // Round to 2 decimal places, then remove trailing zeros
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}M`;
    }
    if (count >= 1000) {
      const value = count / 1000;
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}K`;
    }
    return count.toString();
  }

  function formatVideos(count: number | undefined): string {
    if (!count) return 'Unknown';
    return `${count.toLocaleString()}`;
  }

  function formatViews(count: number | undefined): string {
    if (!count) return 'Unknown';
    if (count >= 1000000000) {
      const value = count / 1000000000;
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}B`;
    }
    if (count >= 1000000) {
      const value = count / 1000000;
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}M`;
    }
    if (count >= 1000) {
      const value = count / 1000;
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}K`;
    }
    return count.toLocaleString();
  }

  function formatRelevance(score: number | undefined): string {
    if (!score) return '0%';
    return `${Math.round(score)}%`;
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return 'Unknown';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - date.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return '1 day ago';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
      }
      if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return months === 1 ? '1 month ago' : `${months} months ago`;
      }
      const years = Math.floor(diffDays / 365);
      return years === 1 ? '1 year ago' : `${years} years ago`;
    } catch {
      return dateStr;
    }
  }

  function formatAvgViews(views: number | undefined): string {
    if (!views) return 'Unknown';
    // Reuse the same formatting logic as formatViews
    if (views >= 1000000000) {
      const value = views / 1000000000;
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}B`;
    }
    if (views >= 1000000) {
      const value = views / 1000000;
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}M`;
    }
    if (views >= 1000) {
      const value = views / 1000;
      const rounded = Math.round(value * 100) / 100;
      return `${rounded}K`;
    }
    return views.toLocaleString();
  }

  function getVideoCountText(count: number): string {
    if (count === 1) return '1 video';
    return `${count} videos`;
  }

  function getEmailStatus(channel: ChannelSearchResult): { text: string; class: string } {
    if (channel.emails && channel.emails.length > 0) {
      return {
        text: `${channel.emails.length} found`,
        class: 'bg-green-100 text-green-800',
      };
    }
    return {
      text: 'Not found',
      class: 'bg-gray-100 text-gray-800',
    };
  }

  function showEmailDetails(channel: ChannelSearchResult) {
    selectedChannel = channel;
    showEmailModal = true;
  }

  function closeModal() {
    showEmailModal = false;
    selectedChannel = null;
  }

  async function copyEmailToClipboard(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      toastMessage = 'Email copied to clipboard!';
      showToast = true;
      setTimeout(() => {
        showToast = false;
      }, 3000);
    } catch (error) {
      console.error('Failed to copy email:', error);
      toastMessage = 'Failed to copy email';
      showToast = true;
      setTimeout(() => {
        showToast = false;
      }, 3000);
    }
  }

  function showToastMessage(message: string, duration: number = 3000) {
    toastMessage = message;
    showToast = true;
    setTimeout(() => {
      showToast = false;
    }, duration);
  }
</script>

{#if displayChannels.length > 0}
  <!-- Results Header -->
  {#if stats}
    <div class="sticky top-0 z-20 p-4 border-b border-blue-200 bg-blue-50">
      <div class="flex items-center gap-4">
        <div>
          <span class="font-semibold">Search Results</span>
        </div>
        <div>
          <span class="font-semibold">Keyword:</span>
          <span class="text-blue-700">{stats.keyword}</span>
        </div>
        <div>
          <span class="font-semibold">Found:</span>
          <span class="text-green-700">{stats.displayed}</span>
        </div>
      </div>
    </div>
  {/if}

  <!-- Single Table with Sticky Header and Scrollable Body -->
  <div
    class="overflow-x-auto overflow-y-auto bg-white rounded-b-lg shadow"
    style="max-height: 600px;"
  >
    <table class="min-w-full divide-y divide-gray-200 table-fixed">
      <thead class="sticky top-0 z-10 bg-gray-50">
        <tr>
          <th
            class="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[280px]"
          >
            Channel
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[120px]"
          >
            Subscribers
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[100px]"
          >
            Videos
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[120px]"
          >
            Views
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[130px]"
          >
            Last Posted
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[120px]"
            title="Average views of recent videos"
          >
            Avg Views
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[100px]"
          >
            Country
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[140px]"
          >
            Relevance
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[180px]"
          >
            Email Status
          </th>
          <th
            class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase bg-gray-50 w-[120px]"
          >
            Actions
          </th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {#each displayChannels as channel (channel.channelId)}
          <tr class="transition-colors hover:bg-gray-50">
            <td class="px-4 py-3 w-[280px]">
              <div class="flex items-center">
                {#if channel.thumbnailUrl}
                  <img
                    src={channel.thumbnailUrl}
                    alt={channel.name}
                    class="flex-shrink-0 w-10 h-10 mr-3 rounded-full"
                  />
                {/if}
                <div class="min-w-0">
                  <div class="text-sm font-medium text-gray-900 truncate max-w-[180px]">
                    {channel.name}
                  </div>
                </div>
              </div>
            </td>
            <td class="px-3 py-3 whitespace-nowrap w-[120px]">
              <div class="text-sm text-gray-900">
                {formatSubscribers(channel.subscriberCount)}
              </div>
            </td>
            <td class="px-3 py-3 whitespace-nowrap w-[100px]">
              <div class="text-sm text-gray-900">
                {formatVideos(channel.videoCount)}
              </div>
            </td>
            <td class="px-3 py-3 whitespace-nowrap w-[120px]">
              <div class="text-sm text-gray-900">
                {formatViews(channel.viewCount)}
              </div>
            </td>
            <td class="px-3 py-3 whitespace-nowrap w-[130px]">
              <div class="text-sm text-gray-900">
                {formatDate(channel.lastPostedVideoDate)}
              </div>
            </td>
            <td class="px-3 py-3 whitespace-nowrap w-[120px]">
              {#if channel.avgRecentViews && channel.latestVideos && channel.latestVideos.length > 0}
                <div class="flex items-center gap-1.5">
                  <span class="text-sm font-medium text-gray-900">
                    {formatAvgViews(channel.avgRecentViews)}
                  </span>
                  <span
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                    title="Average of {getVideoCountText(channel.latestVideos.length)}"
                  >
                    {channel.latestVideos.length}
                  </span>
                </div>
              {:else if channel.avgRecentViews}
                <div class="text-sm text-gray-900">
                  {formatAvgViews(channel.avgRecentViews)}
                </div>
              {:else}
                <div class="text-sm text-gray-500">Unknown</div>
              {/if}
            </td>
            <td class="px-3 py-3 whitespace-nowrap w-[100px]">
              <div class="text-sm text-gray-900">
                {channel.country || 'Unknown'}
              </div>
            </td>
            <td class="px-3 py-3 whitespace-nowrap w-[140px]">
              <div class="flex items-center">
                <div class="w-full bg-gray-200 rounded-full h-2.5 mr-2" style="width: 50px;">
                  <div
                    class="bg-blue-600 h-2.5 rounded-full"
                    style="width: {channel.relevanceScore}%"
                  ></div>
                </div>
                <span class="text-sm text-gray-900">{formatRelevance(channel.relevanceScore)}</span>
              </div>
            </td>
            <td class="px-3 py-3 w-[180px]">
              {#if channel.emails && channel.emails.length > 0}
                <div class="flex flex-col gap-1">
                  {#each channel.emails as email}
                    <div
                      class="inline-flex items-center gap-1 px-2 text-xs font-semibold leading-5 text-green-800 bg-green-100 rounded"
                    >
                      <span class="truncate" title={email}>
                        {email}
                      </span>
                      <button
                        on:click={() => copyEmailToClipboard(email)}
                        class="flex-shrink-0 text-green-700 transition-colors hover:text-green-900"
                        title="Copy email"
                      >
                        <svg
                          class="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  {/each}
                </div>
              {:else}
                <span
                  class="inline-flex px-2 text-xs font-semibold leading-5 text-gray-800 bg-gray-100 rounded-full"
                >
                  Not found
                </span>
              {/if}
            </td>
            <td class="px-3 py-3 text-sm font-medium whitespace-nowrap w-[120px]">
              <a
                href={channel.url}
                target="_blank"
                rel="noopener noreferrer"
                class="mr-2 text-blue-600 hover:text-blue-900"
              >
                Visit
              </a>
              <button
                on:click={() => showEmailDetails(channel)}
                class="text-green-600 hover:text-green-900 hover:underline"
              >
                Details
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="flex flex-col items-center gap-3 mt-4">
    <div class="text-sm text-center text-gray-500">
      Showing {displayChannels.length} channel{displayChannels.length !== 1 ? 's' : ''}
      {#if stats && stats.keyword}
        for "{stats.keyword}"
      {/if}
    </div>

    <!-- Action Buttons -->
    <div class="flex flex-wrap gap-3">
      <!-- Search 50 More Button - Only show after search is complete (not searching and not enriching) -->
      {#if pagination && pagination.searchSessionId && !$channelsStore.isSearching && !$channelsStore.isEnriching}
        <button
          on:click={handleSearchMore}
          disabled={isSearchingMore}
          class="flex items-center gap-2 px-6 py-3 font-semibold text-white transition-colors bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {#if isSearchingMore}
            <svg class="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
                fill="none"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Searching...
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search 50 More
          {/if}
        </button>
      {/if}

      <!-- Get Video Data Button -->
      <!-- {#if displayChannels.some((ch) => !ch.lastPostedVideoDate || !ch.avgRecentViews)}
        <button
          on:click={handleGetVideoData}
          disabled={isEnrichingVideoData}
          class="flex items-center gap-2 px-6 py-3 font-semibold text-white transition-colors bg-green-600 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {#if isEnrichingVideoData}
            <svg class="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
                fill="none"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Enriching...
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Get Video Data
          {/if}
        </button>
      {/if} -->
    </div>
  </div>
{:else}
  <div class="py-12 text-center rounded-lg bg-gray-50">
    <svg
      class="w-12 h-12 mx-auto text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
    <h3 class="mt-2 text-sm font-medium text-gray-900">No channels found</h3>
    <p class="mt-1 text-sm text-gray-500">
      Try searching with a different keyword or adjusting your filters.
    </p>
  </div>
{/if}

<!-- Email & Contact Details Modal -->
{#if showEmailModal && selectedChannel}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75"
    on:click={closeModal}
    on:keydown={(e) => e.key === 'Escape' && closeModal()}
    role="button"
    tabindex="-1"
  >
    <div
      class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
      on:click|stopPropagation
      on:keydown|stopPropagation
      role="dialog"
      tabindex="-1"
    >
      <!-- Modal Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div class="flex items-center">
          {#if selectedChannel.thumbnailUrl}
            <img
              src={selectedChannel.thumbnailUrl}
              alt={selectedChannel.name}
              class="w-12 h-12 mr-3 rounded-full"
            />
          {/if}
          <div>
            <h3 class="text-lg font-medium text-gray-900">{selectedChannel.name}</h3>
            <p class="text-sm text-gray-500">Contact Information</p>
          </div>
        </div>
        <button on:click={closeModal} class="text-gray-400 hover:text-gray-500" aria-label="Close">
          <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Modal Body -->
      <div class="px-6 py-4">
        <!-- Channel Stats -->
        <div class="grid grid-cols-2 gap-4 mb-6 md:grid-cols-3 lg:grid-cols-5">
          <div class="p-3 rounded-lg bg-blue-50">
            <div class="text-sm text-gray-600">Subscribers</div>
            <div class="text-lg font-semibold text-blue-700">
              {formatSubscribers(selectedChannel.subscriberCount)}
            </div>
          </div>
          <div class="p-3 rounded-lg bg-green-50">
            <div class="text-sm text-gray-600">Videos</div>
            <div class="text-lg font-semibold text-green-700">
              {formatVideos(selectedChannel.videoCount)}
            </div>
          </div>
          <div class="p-3 rounded-lg bg-orange-50">
            <div class="text-sm text-gray-600">Views</div>
            <div class="text-lg font-semibold text-orange-700">
              {formatViews(selectedChannel.viewCount)}
            </div>
          </div>
          <div class="p-3 rounded-lg bg-indigo-50">
            <div class="text-sm text-gray-600">Country</div>
            <div class="text-lg font-semibold text-indigo-700">
              {selectedChannel.country || 'Unknown'}
            </div>
          </div>
          <div class="p-3 rounded-lg bg-purple-50">
            <div class="text-sm text-gray-600">Relevance</div>
            <div class="text-lg font-semibold text-purple-700">
              {formatRelevance(selectedChannel.relevanceScore)}
            </div>
          </div>
        </div>

        <!-- Email Addresses -->
        <div class="mb-6">
          <h4 class="flex items-center mb-2 text-sm font-semibold text-gray-700">
            <svg
              class="w-5 h-5 mr-2 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Email Addresses
          </h4>
          {#if selectedChannel.emails && selectedChannel.emails.length > 0}
            <div class="space-y-2">
              {#each selectedChannel.emails as email}
                <div class="p-3 rounded-lg bg-gray-50">
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-sm text-gray-900">{email}</span>
                    <button
                      on:click={() => navigator.clipboard.writeText(email)}
                      class="px-2 py-1 text-xs text-blue-600 rounded hover:text-blue-800 hover:bg-blue-50"
                      title="Copy to clipboard"
                    >
                      Copy
                    </button>
                  </div>
                  {#if selectedChannel.email_sources && selectedChannel.email_sources[email]}
                    <div class="mt-1 text-xs text-gray-500">
                      Source: <span class="font-medium capitalize"
                        >{selectedChannel.email_sources[email].replace('_', ' ')}</span
                      >
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="p-3 text-sm text-gray-500 rounded-lg bg-gray-50">
              No email addresses found for this channel.
            </p>
          {/if}
        </div>

        <!-- Social Links -->
        <div class="mb-6">
          <h4 class="flex items-center mb-2 text-sm font-semibold text-gray-700">
            <svg
              class="w-5 h-5 mr-2 text-blue-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
              />
            </svg>
            Social Media Links
          </h4>
          {#if selectedChannel.socialLinks && Object.keys(selectedChannel.socialLinks).length > 0}
            <div class="space-y-2">
              {#each Object.entries(selectedChannel.socialLinks) as [platform, url]}
                <div class="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <div class="flex items-center">
                    <span class="w-24 text-sm font-semibold text-gray-700 capitalize"
                      >{platform}:</span
                    >
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="max-w-md text-sm text-blue-600 truncate hover:text-blue-800"
                    >
                      {url}
                    </a>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Visit
                  </a>
                </div>
              {/each}
            </div>
          {:else}
            <p class="p-3 text-sm text-gray-500 rounded-lg bg-gray-50">
              No social media links found for this channel.
            </p>
          {/if}
        </div>

        <!-- Description -->
        {#if selectedChannel.description}
          <div class="mb-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-700">Description</h4>
            <p class="p-3 text-sm text-gray-600 rounded-lg bg-gray-50">
              {selectedChannel.description}
            </p>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-between px-6 py-4 border-t border-gray-200">
        <a
          href={selectedChannel.url}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
        >
          Visit YouTube Channel
        </a>
        <button
          on:click={closeModal}
          class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Toast Notification -->
{#if showToast}
  <div class="fixed z-50 bottom-4 right-4 animate-slide-up">
    <div class="flex items-center gap-2 px-4 py-3 text-white bg-green-600 rounded-lg shadow-lg">
      <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
      </svg>
      <span class="text-sm font-medium">{toastMessage}</span>
    </div>
  </div>
{/if}

<style>
  @keyframes slide-up {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .animate-slide-up {
    animation: slide-up 0.3s ease-out;
  }
</style>
