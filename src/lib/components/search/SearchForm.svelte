<script lang="ts">
  import { channelsStore } from '$lib/stores/channels';
  import { apiPost, apiGet } from '$lib/api/client';
  import type { ApiResponse, SearchResponse, SearchRequest } from '$lib/types/api';

  let keyword = '';
  let totalChannelsLimit = 50; // Total channels user wants to find
  let showAdvanced = false;

  // Filter options
  let minSubscribers: number | undefined = undefined;
  let maxSubscribers: number | undefined = undefined;
  let minAvgViews: number | undefined = undefined;
  let maxAvgViews: number | undefined = undefined;
  let country = '';
  let englishOnly = false;

  async function handleSearch() {
    // Validate input
    if (!keyword.trim()) {
      channelsStore.setError('Please enter a keyword');
      return;
    }

    // Auto-close advanced filters for better UX
    showAdvanced = false;

    // Reset error state and set searching state
    channelsStore.setSearching(true);

    try {
      console.log('[Search] Starting search for:', keyword.trim());

      const requestBody: SearchRequest = {
        keyword: keyword.trim(),
        page: 1,
        pageSize: 15, // Fixed page size for initial load
        limit: totalChannelsLimit, // Total channels to scrape from YouTube
        filters: {
          minSubscribers: minSubscribers || undefined,
          maxSubscribers: maxSubscribers || undefined,
          minAvgViews: minAvgViews || undefined,
          maxAvgViews: maxAvgViews || undefined,
          country: country || undefined,
          englishOnly: englishOnly ? true : undefined,
          // Backend automatically excludes music and brand channels
        },
      };

      const response = await apiPost<ApiResponse<SearchResponse>>('/youtube/search', requestBody);

      console.log('[Search] Response received:', response);

      // New flow: backend may return a jobId for asynchronous searches
      // Example initial response: { status: 'success', data: { jobId: '1' } }
      if (response.status === 'success' && response.data) {
        // If server returned jobId, start polling for results
        if ((response.data as any).jobId) {
          const jobId = (response.data as any).jobId as string;
          console.log('[Search] Received jobId:', jobId, 'starting polling');
          await pollSearchJob(jobId, requestBody.filters, totalChannelsLimit);
          return;
        }

        // Otherwise assume server returned final search data directly
        const { channels, stats, pagination, enrichmentQueued } = response.data as any;

        // Validate response data
        if (!channels || !Array.isArray(channels)) {
          throw new Error('Invalid response format: channels data is missing or invalid');
        }

        console.log('[Search] Found', channels.length, 'channels');

        // Update store with successful data
        channelsStore.setChannels(
          channels,
          stats,
          pagination,
          totalChannelsLimit,
          requestBody.filters
        );

        // If enrichment is queued, start polling for updates
        // DISABLED: Enrichment polling temporarily disabled
        // if (enrichmentQueued && channels.length > 0) {
        // 	const channelIds = channels.map((c) => c.channelId);
        // 	console.log('[Search] Starting enrichment polling for', channelIds.length, 'channels');
        // 	startEnrichmentPolling(channelIds);
        // }
      } else {
        // This shouldn't happen if the API client is working correctly, but just in case
        throw new Error('Unexpected response format from server');
      }
    } catch (error) {
      console.error('[Search] Error:', error);

      // Set error state with a user-friendly message
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred while searching';

      channelsStore.setError(errorMessage);
    } finally {
      // Always reset searching state, even if there's an error
      // This is handled in the catch block via setError, but we ensure it here too
      console.log('[Search] Search completed');
    }
  }

  let enrichmentPollingInterval: number | null = null;

  function startEnrichmentPolling(channelIds: string[]) {
    // Clear any existing polling
    if (enrichmentPollingInterval) {
      clearInterval(enrichmentPollingInterval);
    }

    console.log('[Polling] Starting enrichment polling for', channelIds.length, 'channels');

    // Poll every 10 seconds
    enrichmentPollingInterval = window.setInterval(async () => {
      try {
        const data = await apiPost<any>('/enrichment/status', { channelIds });

        if (data.success && data.statuses) {
          // Update channels with enrichment data
          channelsStore.updateEnrichmentData(data.statuses);

          // Check if all channels are enriched
          const allEnriched = Object.values(data.statuses).every(
            (status: any) => status.status === 'enriched' || status.status === 'failed'
          );

          if (allEnriched) {
            console.log('[Polling] All channels enriched, stopping polling');
            if (enrichmentPollingInterval) {
              clearInterval(enrichmentPollingInterval);
              enrichmentPollingInterval = null;
            }
          }
        }
      } catch (error) {
        console.error('[Polling] Error fetching enrichment status:', error);
      }
    }, 10000); // Poll every 10 seconds

    // Stop polling after 5 minutes
    window.setTimeout(() => {
      if (enrichmentPollingInterval) {
        console.log('[Polling] Timeout reached, stopping polling');
        clearInterval(enrichmentPollingInterval as any);
        enrichmentPollingInterval = null;
      }
    }, 300000); // 5 minutes
  }

  // Poll a search job until completion or timeout
  async function pollSearchJob(jobId: string, filters: any, searchLimit: number) {
    const pollInterval = 2000; // 2 seconds
    const timeoutMs = 2 * 60 * 1000; // 2 minutes
    let elapsed = 0;

    // Ensure the UI indicates searching
    channelsStore.setSearching(true);

    while (elapsed < timeoutMs) {
      try {
        console.log('[Polling] Checking search job', jobId);
        // Poll the job endpoint using GET (server expects GET for job polling)
        const res = await apiGet<any>(`/youtube/search/${jobId}`);

        // If backend returns status field inside data, read it
        const data = res?.data || res;

        if (data?.status === 'processing') {
          // Still processing - wait and continue
          console.log('[Polling] Job still processing');
        } else if (data?.status === 'done' || data?.channels) {
          // Job completed - server may return final payload directly
          const channels = data.channels || res.channels || [];
          const stats = data.stats || res.stats || null;
          const pagination = data.pagination || res.pagination || null;

          console.log('[Polling] Job done, received', channels.length, 'channels');

          // Update store and stop polling
          channelsStore.setChannels(channels, stats, pagination, searchLimit, filters);
          channelsStore.setSearching(false);
          return;
        } else if (
          (res as any).status === 'success' &&
          (res as any).data &&
          (res as any).data.channels
        ) {
          // Some endpoints return {status: 'success', data: {channels...}}
          const payload = (res as any).data;
          channelsStore.setChannels(
            payload.channels,
            payload.stats,
            payload.pagination,
            searchLimit,
            filters
          );
          channelsStore.setSearching(false);
          return;
        } else {
          // Unexpected response format - throw to surface error
          throw new Error('Unexpected polling response format');
        }
      } catch (err) {
        console.error('[Polling] Error while polling search job:', err);
        // If network or server error, surface to user and stop polling
        channelsStore.setError(err instanceof Error ? err.message : 'Polling error');
        return;
      }

      // Wait before next poll
      await new Promise((r) => setTimeout(r, pollInterval));
      elapsed += pollInterval;
    }

    // Timeout reached
    channelsStore.setError('Search timed out. Please try again later.');
    channelsStore.setSearching(false);
    console.log('[Polling] Timeout reached for job', jobId);
  }

  function handleReset() {
    keyword = '';
    totalChannelsLimit = 50;
    minSubscribers = undefined;
    maxSubscribers = undefined;
    minAvgViews = undefined;
    maxAvgViews = undefined;
    country = '';
    channelsStore.reset();
  }
</script>

<div class="p-6 bg-white rounded-lg shadow-md">
  <h2 class="mb-4 text-2xl font-bold text-gray-800">Search YouTube Channels</h2>

  <form on:submit|preventDefault={handleSearch} class="space-y-4">
    <!-- Keyword Input -->
    <div>
      <label for="keyword" class="block mb-2 text-sm font-medium text-gray-700">
        Keyword or Niche *
      </label>
      <input
        type="text"
        id="keyword"
        bind:value={keyword}
        placeholder="e.g., tech reviews, cooking, gaming"
        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        required
      />
      <p class="mt-1 text-sm text-gray-500">Enter a keyword to search for relevant channels</p>
    </div>

    <!-- Total Channels Limit Input -->
    <div>
      <label for="totalChannelsLimit" class="block mb-2 text-sm font-medium text-gray-700">
        Total Channels to Find
      </label>
      <input
        type="number"
        id="totalChannelsLimit"
        bind:value={totalChannelsLimit}
        min="10"
        max="100"
        step="10"
        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <p class="mt-1 text-sm text-gray-500">
        Maximum number of channels to scrape from YouTube. Use "Load More" to fetch additional
        results.
      </p>
    </div>

    <!-- Advanced Filters Toggle -->
    <button
      type="button"
      on:click={() => (showAdvanced = !showAdvanced)}
      class="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
    >
      <svg
        class="w-4 h-4 transform transition-transform {showAdvanced ? 'rotate-90' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
      Advanced Filters
    </button>

    <!-- Advanced Filters -->
    {#if showAdvanced}
      <div class="pl-6 space-y-4 border-l-2 border-blue-200">
        <!-- Subscriber Range -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="minSubs" class="block mb-2 text-sm font-medium text-gray-700">
              Min Subscribers
            </label>
            <input
              type="number"
              id="minSubs"
              bind:value={minSubscribers}
              placeholder="e.g., 1000"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label for="maxSubs" class="block mb-2 text-sm font-medium text-gray-700">
              Max Subscribers
            </label>
            <input
              type="number"
              id="maxSubs"
              bind:value={maxSubscribers}
              placeholder="e.g., 100000"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <!-- Average Views Range -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="minAvgViews" class="block mb-2 text-sm font-medium text-gray-700">
              Min Avg Views
            </label>
            <input
              type="number"
              id="minAvgViews"
              bind:value={minAvgViews}
              placeholder="e.g., 500"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p class="mt-1 text-xs text-gray-500">Minimum average views per video</p>
          </div>
          <div>
            <label for="maxAvgViews" class="block mb-2 text-sm font-medium text-gray-700">
              Max Avg Views
            </label>
            <input
              type="number"
              id="maxAvgViews"
              bind:value={maxAvgViews}
              placeholder="e.g., 50000"
              class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p class="mt-1 text-xs text-gray-500">Maximum average views per video</p>
          </div>
        </div>

        <!-- Note about automatic exclusions -->
        <!-- <div class="p-3 text-sm text-gray-600 rounded-md bg-blue-50">
					<strong>Note:</strong> Music and brand channels are automatically excluded to provide better lead quality.
				</div> -->

        <!-- Country Filter -->
        <div>
          <label for="country" class="block mb-2 text-sm font-medium text-gray-700">
            Country (optional)
          </label>
          <select
            id="country"
            bind:value={country}
            class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Any country</option>
            <option value="United States">United States</option>
            <option value="India">India</option>
            <option value="United Kingdom">United Kingdom</option>
            <option value="Canada">Canada</option>
            <option value="Australia">Australia</option>
            <option value="Germany">Germany</option>
            <option value="France">France</option>
            <option value="Brazil">Brazil</option>
            <option value="Mexico">Mexico</option>
            <option value="Japan">Japan</option>
            <option value="South Korea">South Korea</option>
            <option value="Spain">Spain</option>
            <option value="Italy">Italy</option>
            <option value="Netherlands">Netherlands</option>
            <option value="Philippines">Philippines</option>
            <option value="Indonesia">Indonesia</option>
          </select>
        </div>

        <!-- English Only Filter -->
        <div class="flex items-start gap-3 p-4 border border-gray-200 rounded-md bg-gray-50">
          <input
            type="checkbox"
            id="englishOnly"
            bind:checked={englishOnly}
            class="w-4 h-4 mt-1 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          />
          <div class="flex-1">
            <label for="englishOnly" class="text-sm font-medium text-gray-700 cursor-pointer">
              English Language Only
            </label>
            <p class="mt-1 text-xs text-gray-500">
              Filter to show only English-speaking YouTube channels
            </p>
          </div>
        </div>
      </div>
    {/if}

    <!-- Action Buttons -->
    <div class="flex gap-3 pt-4">
      <button
        type="submit"
        disabled={$channelsStore.isSearching}
        class="flex items-center justify-center flex-1 gap-2 px-6 py-3 font-semibold text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {#if $channelsStore.isSearching}
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
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Search Channels
        {/if}
      </button>

      <button
        type="button"
        on:click={handleReset}
        class="px-6 py-3 font-semibold text-gray-700 transition-colors border border-gray-300 rounded-md hover:bg-gray-50"
      >
        Reset
      </button>
    </div>
  </form>

  <!-- Error Display -->
  {#if $channelsStore.error}
    <div class="p-4 mt-4 border border-red-200 rounded-md bg-red-50">
      <div class="flex items-center">
        <svg class="w-5 h-5 mr-2 text-red-400" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clip-rule="evenodd"
          />
        </svg>
        <span class="text-sm text-red-700">{$channelsStore.error}</span>
      </div>
    </div>
  {/if}
</div>
