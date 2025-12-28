<script lang="ts">
  import { channelsStore } from '$lib/stores/channels';
  import { toastStore } from '$lib/stores/toast';
  import { apiPost, apiGet } from '$lib/api/client';
  import type { ApiResponse, SearchResponse, SearchRequest } from '$lib/types/api';
  import { onMount, onDestroy } from 'svelte';
  import { getSessionKey } from '$lib/utils/session-manager';
  import { loadRestoreSearch } from '$lib/utils/filterStorage';
  import { authStore } from '$lib/stores/authStore';

  let keyword = '';
  let totalChannelsLimit = 50; // Total channels user wants to find

  // Streaming progress
  let searchProgress = 0;
  let statusMessage = '';

  // Track active job to cancel previous searches
  let activeJobId: string | null = null;

  // Track if we've done the initial keyword sync (to prevent auto-filling after user clears input)
  let hasInitialKeywordSync = false;

  // Keep local UI state in sync with store (but don't override user input)
  $: {
    const state = $channelsStore;
    // Only sync keyword on the FIRST time we see a keyword from the store
    // This prevents auto-filling when user is trying to clear the input
    if (state.currentKeyword && !keyword && !hasInitialKeywordSync) {
      keyword = state.currentKeyword;
      hasInitialKeywordSync = true;
    }
    searchProgress = state.searchProgress;
    statusMessage = state.statusMessage;
  }

  // Get API URL from environment or use default
  const API_URL = import.meta.env.VITE_PUBLIC_API_URL || 'http://localhost:8090';

  // LocalStorage key for tracking active jobs
  const ACTIVE_JOB_KEY = 'youtube-lead-gen-active-job';

  // Function to check if a job is still active on the backend
  async function isJobStillActive(jobId: string): Promise<boolean> {
    try {
      const res = await apiGet<any>(`/youtube/search/${jobId}`);
      const data = res?.data || res;
      // Job is active if status is not 'completed' or 'failed'
      return data.status && !['completed', 'failed'].includes(data.status);
    } catch (error) {
      console.warn(`[Cleanup] Could not check status of job ${jobId}:`, error);
      return false; // If we can't check, assume it's not active
    }
  }

  // Function to cancel job via regular API call
  async function cancelJobViaApi(jobId: string) {
    try {
      console.log(`[Cleanup] Canceling orphaned job ${jobId} via API`);
      await apiPost('/youtube/search/cancel', { jobId });
      console.log(`[Cleanup] Successfully canceled orphaned job ${jobId}`);
    } catch (error) {
      console.warn('[Cleanup] Failed to cancel orphaned job:', error);
    }
  }

  // Setup beforeunload listener when component mounts
  onMount(async () => {
    // Restore UI state from store if search is already running
    const currentState = $channelsStore;
    if (currentState.isSearching || currentState.currentKeyword) {
      console.log('[SearchForm] Restoring UI state from store:', currentState);
      keyword = currentState.currentKeyword || keyword;
      searchProgress = currentState.searchProgress || 0;
      statusMessage = currentState.statusMessage || '';

      // If there's a limit in the store, restore it too
      if (currentState.searchLimit) {
        totalChannelsLimit = currentState.searchLimit;
      }
    }

    // Check if we're restoring a search from history
    const restoreData = loadRestoreSearch();
    if (restoreData) {
      console.log('[SearchForm] Restoring search from history:', restoreData);
      keyword = restoreData.keyword || '';

      // Restore the search limit if provided
      if (restoreData.searchLimit) {
        totalChannelsLimit = restoreData.searchLimit;
      }

      // If we should restore full results (not just keyword)
      if (restoreData.restoreResults && restoreData.sessionId) {
        // Import the restore function
        const { restoreSearchSession } = await import('$lib/api/client');

        try {
          console.log('[SearchForm] Loading results from session:', restoreData.sessionId);

          // Set loading state
          channelsStore.setSearching(true, keyword, totalChannelsLimit);
          channelsStore.setProgress(10, 'Restoring search results...');

          // Load results from backend
          const response = await restoreSearchSession(restoreData.sessionId, totalChannelsLimit);

          if (response.status === 'success' && response.data) {
            const { channels, stats, pagination } = response.data;

            console.log('[SearchForm] Restored', channels?.length || 0, 'channels');

            // Update store with restored results
            channelsStore.setChannels(
              channels || [],
              stats || { total: 0, filtered: 0, keyword: keyword },
              pagination || {
                searchSessionId: restoreData.sessionId,
                hasMore: false,
                currentPage: 1,
                pageSize: totalChannelsLimit,
                totalChannels: channels?.length || 0,
                totalPages: 1
              },
              totalChannelsLimit,
              restoreData.filters || undefined
            );

            channelsStore.setProgress(100, 'Search restored successfully!');

            // Show success toast
            toastStore.show(
              `Restored ${channels?.length || 0} channels for "${keyword}"`,
              'success',
              5000
            );
          } else {
            throw new Error(response.message || 'Failed to restore search results');
          }
        } catch (error) {
          console.error('[SearchForm] Error restoring search:', error);

          // Fall back to just pre-filling the keyword
          channelsStore.setSearching(false);

          toastStore.show(
            `Failed to restore search results. You can search again for "${keyword}".`,
            'error',
            5000
          );
        }
      } else {
        // Old behavior: just pre-fill keyword
        toastStore.show(
          `Restored search for "${restoreData.keyword}". Click Search to reload results.`,
          'info',
          5000
        );
      }
    }

    // Check if there's a job from a previous session (page was refreshed/closed)
    const savedJobId = localStorage.getItem(ACTIVE_JOB_KEY);
    if (savedJobId) {
      // IMPORTANT: Don't cancel if this is just an HMR remount and the job is still active
      // Check if the saved job ID matches the current activeJobId (HMR case)
      if (activeJobId === savedJobId) {
        console.log(`[Mount] Job ${savedJobId} is still active (HMR remount), keeping it running`);
        // Clear the localStorage flag since the job is still active
        localStorage.removeItem(ACTIVE_JOB_KEY);
      } else {
        // Double-check if the job is actually still running before canceling
        const stillActive = await isJobStillActive(savedJobId);
        if (stillActive) {
          console.log(`[Mount] Job ${savedJobId} is still running on backend, not canceling (likely HMR)`);
          // The job is still running, so restore it as the active job
          activeJobId = savedJobId;
          // Clear localStorage since we've restored it
          localStorage.removeItem(ACTIVE_JOB_KEY);

          // Resume polling for this job
          const filters = {}; // Use empty filters for resume
          console.log(`[Mount] Resuming polling for job ${savedJobId}`);
          pollSearchJob(savedJobId, filters, totalChannelsLimit).catch(err => {
            console.error('[Mount] Error resuming polling:', err);
          });
        } else {
          console.log(`[Mount] Found orphaned job from previous session: ${savedJobId}`);
          // Cancel the orphaned job using regular API call (not beacon)
          await cancelJobViaApi(savedJobId);
          localStorage.removeItem(ACTIVE_JOB_KEY);
        }
      }
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (activeJobId) {
        // Show browser confirmation dialog
        const message = 'A search is currently in progress. Are you sure you want to leave? The search will be stopped.';
        event.preventDefault();
        event.returnValue = message; // Modern browsers ignore custom message but still show dialog

        console.log(`[BeforeUnload] Active search detected, showing confirmation dialog`);

        // DON'T cancel the job here - we can't tell if user chose "Leave" or "Stay"
        // Instead, save to localStorage. If they leave, we'll cancel on next mount.
        // If they stay, we'll clear it when search completes.
        localStorage.setItem(ACTIVE_JOB_KEY, activeJobId);

        return message; // For some browsers
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // If user chose "Stay" in the dialog, clear the localStorage flag
    // This runs when the page regains focus after the dialog is dismissed
    const handleVisibilityChange = () => {
      if (!document.hidden && activeJobId) {
        const savedJobId = localStorage.getItem(ACTIVE_JOB_KEY);
        if (savedJobId === activeJobId) {
          // User stayed on page, clear the flag
          console.log(`[Visibility] User stayed on page, clearing localStorage flag`);
          localStorage.removeItem(ACTIVE_JOB_KEY);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup listeners on unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  // onDestroy - no need to cancel here, localStorage approach handles it
  onDestroy(() => {
    // The beforeunload event already saved to localStorage if needed
    // If page actually closes/refreshes, onMount will handle cleanup
    if (activeJobId) {
      console.log(`[Cleanup] Component destroyed with active job ${activeJobId}`);
    }
  });

  async function handleSearch() {
    // Validate input
    if (!keyword.trim()) {
      channelsStore.setError('Please enter a keyword');
      return;
    }


    // If there's an active search, show confirmation dialog
    if (activeJobId) {
      const confirmed = confirm(
        'A search is currently in progress. Starting a new search will stop the current one. Do you want to continue?'
      );

      if (!confirmed) {
        console.log('[Search] User canceled new search - keeping current search running');
        return; // User clicked "Cancel", don't start new search
      }

      // User confirmed, cancel previous search job on the backend
      try {
        console.log(`[Search] User confirmed, canceling previous job ${activeJobId} on backend`);
        await apiPost('/youtube/search/cancel', { jobId: activeJobId });
        console.log(`[Search] Successfully canceled job ${activeJobId} on backend`);
      } catch (error) {
        console.warn('[Search] Failed to cancel previous job on backend:', error);
        // Continue anyway - frontend cancellation still works
      }
    }

    // Cancel any previous search by clearing activeJobId
    // This will cause the previous polling loop to exit
    activeJobId = null;

    // Clear any existing enrichment polling
    if (enrichmentPollingInterval) {
      console.log('[Search] Clearing previous enrichment polling');
      clearInterval(enrichmentPollingInterval);
      enrichmentPollingInterval = null;
    }

    // Reset progress before starting new search
    searchProgress = 0;
    statusMessage = '';

    // Reset error state and set searching state (store keyword and limit)
    channelsStore.setSearching(true, keyword.trim(), totalChannelsLimit);

    try {
      console.log('[Search] Starting search for:', keyword.trim());

      // Get session key for this browser tab (enables multi-tab support)
      const sessionKey = getSessionKey();
      console.log(`[Search] Using session key: ${sessionKey}`);

      // Get user ID if authenticated
      const auth = $authStore;
      const userId = auth.user?.id || null;
      console.log(`[Search] User ID: ${userId || 'anonymous'}`);

      const requestBody: SearchRequest = {
        keyword: keyword.trim(),
        page: 1,
        pageSize: totalChannelsLimit, // Request all results at once (user's desired limit)
        limit: totalChannelsLimit, // Total channels to scrape from YouTube
        sessionKey, // Add session key for multi-tab isolation
        userId, // Add user ID for user-specific searches
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

          // Set this job as the active one
          activeJobId = jobId;
          // Save to localStorage so we can cancel it if page is refreshed/closed
          localStorage.setItem(ACTIVE_JOB_KEY, jobId);

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

        // If enrichment is queued, start polling for enriched updates
        if (enrichmentQueued && pagination?.searchSessionId) {
          console.log('[Search] Starting enrichment polling for session:', pagination.searchSessionId);
          startEnrichmentProgressPolling(pagination.searchSessionId, keyword.trim(), requestBody.filters, totalChannelsLimit);
        }
      } else {
        // This shouldn't happen if the API client is working correctly, but just in case
        throw new Error('Unexpected response format from server');
      }
    } catch (error) {
      console.error('[Search] Error:', error);

      // Set error state with a user-friendly message
      const errorMessage =
        error instanceof Error ? error.message : 'An unexpected error occurred while searching';

      // Show user-friendly toast notification
      if (errorMessage.includes('ERR_NAME_NOT_RESOLVED') || errorMessage.includes('net::')) {
        toastStore.show(
          'Network error: Unable to reach YouTube. Please check your internet connection.',
          'error',
          8000
        );
      } else if (errorMessage.includes('ERR_INTERNET_DISCONNECTED')) {
        toastStore.show(
          'No internet connection. Please connect to the internet and try again.',
          'error',
          8000
        );
      } else if (errorMessage.includes('Failed to fetch')) {
        toastStore.show(
          'Failed to connect to server. Please ensure the backend is running.',
          'error',
          8000
        );
      } else {
        toastStore.show(
          `Search failed: ${errorMessage}`,
          'error',
          7000
        );
      }

      channelsStore.setError(errorMessage);
    } finally {
      // Always reset searching state, even if there's an error
      // This is handled in the catch block via setError, but we ensure it here too
      console.log('[Search] Search completed');
    }
  }

  let enrichmentPollingInterval: number | null = null;

  /**
   * Poll for enrichment progress by re-fetching the search session
   * This fetches updated channel data as enrichment completes in the background
   */
  function startEnrichmentProgressPolling(sessionId: string, searchKeyword: string, filters: any, searchLimit: number) {
    // Clear any existing polling
    if (enrichmentPollingInterval) {
      clearInterval(enrichmentPollingInterval);
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('[Enrichment Polling] 🚀 Starting for session:', sessionId);
    console.log('[Enrichment Polling] ⏱️ Poll interval: 3 seconds');
    console.log('[Enrichment Polling] 🎯 Target channels:', searchLimit);
    console.log('═══════════════════════════════════════════════════════════');

    let pollCount = 0;
    const pollStartTime = Date.now();

    // Poll every 3 seconds for enrichment updates
    enrichmentPollingInterval = window.setInterval(async () => {
      try {
        pollCount++;
        const elapsedTime = ((Date.now() - pollStartTime) / 1000).toFixed(1);

        console.log(`\n[Enrichment Polling] 🔄 Poll #${pollCount} (${elapsedTime}s elapsed)`);

        // Re-fetch page 1 to get enriched channels
        const response = await apiPost<ApiResponse<SearchResponse>>('/youtube/search', {
          keyword: searchKeyword, // Backend requires keyword even for pagination
          page: 1,
          pageSize: searchLimit,
          limit: searchLimit,
          searchSessionId: sessionId,
          filters: filters,
        });

        console.log(`[Enrichment Polling] 📡 Response status:`, response.status);

        if (response.status === 'success' && response.data) {
          const { channels, stats, pagination, enrichmentQueued } = response.data as any;

          // Count how many channels are enriched (have subscriber count)
          const enrichedCount = channels.filter((ch: any) => ch.subscriberCount !== undefined && ch.subscriberCount !== null).length;
          const enrichmentProgress = ((enrichedCount / channels.length) * 100).toFixed(1);

          console.log(`[Enrichment Polling] 📊 Progress: ${enrichedCount}/${channels.length} channels (${enrichmentProgress}%)`);
          console.log(`[Enrichment Polling] 📈 Stats:`, {
            total: stats?.total,
            filtered: stats?.filtered,
            displayed: stats?.displayed,
          });
          console.log(`[Enrichment Polling] 🔔 Enrichment queued:`, enrichmentQueued);

          // Log sample enriched channel
          const firstEnriched = channels.find((ch: any) => ch.subscriberCount);
          if (firstEnriched) {
            console.log(`[Enrichment Polling] ✅ Sample enriched:`, {
              name: firstEnriched.name,
              subs: firstEnriched.subscriberCount?.toLocaleString(),
              country: firstEnriched.country || 'N/A',
            });
          }

          // Update the store with latest enriched data
          channelsStore.setChannels(
            channels,
            stats,
            pagination,
            searchLimit,
            filters
          );

          // Stop polling if enrichment is complete
          if (!enrichmentQueued || enrichedCount === channels.length) {
            const totalTime = ((Date.now() - pollStartTime) / 1000).toFixed(1);
            console.log('\n═══════════════════════════════════════════════════════════');
            console.log(`[Enrichment Polling] ✅ COMPLETE! All ${channels.length} channels enriched`);
            console.log(`[Enrichment Polling] ⏱️ Total time: ${totalTime}s`);
            console.log(`[Enrichment Polling] 🔄 Total polls: ${pollCount}`);
            console.log('═══════════════════════════════════════════════════════════\n');

            if (enrichmentPollingInterval) {
              clearInterval(enrichmentPollingInterval);
              enrichmentPollingInterval = null;
            }
          }
        }
      } catch (error) {
        console.error('[Enrichment Polling] ❌ Error:', error);
        console.log('[Enrichment Polling] 🔄 Continuing polling despite error...');
        // Don't stop polling on error - server might be temporarily busy
      }
    }, 3000); // Poll every 3 seconds

    // Stop polling after 10 minutes (enrichment should complete by then)
    window.setTimeout(() => {
      if (enrichmentPollingInterval) {
        const totalTime = ((Date.now() - pollStartTime) / 1000).toFixed(1);
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log(`[Enrichment Polling] ⏰ TIMEOUT reached after ${totalTime}s`);
        console.log(`[Enrichment Polling] 🔄 Total polls: ${pollCount}`);
        console.log('[Enrichment Polling] 🛑 Stopping polling');
        console.log('═══════════════════════════════════════════════════════════\n');

        clearInterval(enrichmentPollingInterval as any);
        enrichmentPollingInterval = null;
      }
    }, 600000); // 10 minutes
  }

  // Legacy enrichment polling (kept for compatibility)
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

  // Poll a search job until completion or timeout (STREAMING VERSION WITH RESTART)
  async function pollSearchJob(jobId: string, filters: any, searchLimit: number) {
    const { pollWithRestart } = await import('$lib/utils/pollWithRestart');

    let lastChannelCount = 0;

    channelsStore.setSearching(true);
    channelsStore.setEnriching(true);

    try {
      const result = await pollWithRestart({
        jobId,
        targetLimit: searchLimit,
        maxPollsPerCycle: 300,  // Reset counter every 300 polls
        initialInterval: 1500,   // 1.5s between polls
        maxCycles: 5,            // Up to 1500 total polls (5 × 300)

        // Check if job is still active
        isActive: () => activeJobId === jobId,

        // Progress callback
        onProgress: (progress) => {
          // Update status message
          const message = getStatusMessage(progress.status, null);

          // Update the store (which will update local variables via reactive statement)
          channelsStore.setProgress(progress.percentComplete, message);

          console.log(
            `[Polling] Cycle ${progress.currentCycle}, Poll #${progress.totalPolls}: ` +
            `${progress.channelsFound}/${searchLimit} channels (${progress.percentComplete}%)`
          );
        },

        // Update callback - called on each poll with full data
        onUpdate: (data) => {
          // Double-check job is still active before updating UI
          if (activeJobId !== jobId) {
            console.log(`[Polling] Job ${jobId} canceled during update - skipping UI update`);
            return;
          }

          // IMPORTANT: Don't update progress from backend data.progress
          // The backend's progress values are hardcoded (10, 20, 30, 100) and don't reflect
          // actual enrichment progress. The onProgress callback already calculates accurate
          // progress based on channelsFound / targetLimit.
          // Only use backend progress when status is 'completed' to ensure we hit 100%
          if (data.status === 'completed' && data.progress !== undefined) {
            searchProgress = data.progress;
            channelsStore.setProgress(data.progress, data.message || statusMessage);
          }

          // Update status message
          if (data.status) {
            statusMessage = getStatusMessage(data.status, data.stats);
          }

          // Handle streaming updates
          if (data.status === 'streaming' && data.channels && Array.isArray(data.channels)) {
            const currentCount = data.channels.length;

            // Check if backend sent incremental new channels
            if (data.newChannels && Array.isArray(data.newChannels) && data.newChannels.length > 0) {
              console.log(
                `[Streaming] Received ${data.newChannels.length} NEW channels (total: ${currentCount})`
              );

              // APPEND only new channels (incremental update)
              channelsStore.appendChannels(
                data.newChannels,
                data.stats,
                {
                  searchSessionId: data.sessionId,
                  hasMore: !data.isComplete,
                  currentPage: 1,
                  pageSize: searchLimit,
                  totalChannels: currentCount,
                  totalPages: 1
                }
              );

              lastChannelCount = currentCount;
            } else if (currentCount > lastChannelCount) {
              // Fallback: if no newChannels field, use old logic (replace all)
              console.log(
                `[Streaming] Received ${currentCount} channels (${currentCount - lastChannelCount} new) - using full update`
              );

              // Update UI with all channels (old behavior)
              channelsStore.setChannels(
                data.channels,
                data.stats,
                {
                  searchSessionId: data.sessionId,
                  hasMore: !data.isComplete,
                  currentPage: 1,
                  pageSize: searchLimit,
                  totalChannels: currentCount,
                  totalPages: 1
                },
                searchLimit,
                filters
              );

              lastChannelCount = currentCount;
            }

            // Keep enriching indicator visible
            channelsStore.setEnriching(!data.isComplete);
            channelsStore.setSearching(false); // Hide main search spinner
          }

          // Handle collecting status
          if (data.status === 'collecting' || data.status === 'collecting_more') {
            console.log(`[Streaming] ${data.status}...`);
            statusMessage = getStatusMessage(data.status, data.stats);
          }
        }
      });

      // Handle result
      if (result.success && result.finalData) {
        const data = result.finalData;

        console.log('[Polling] ✅ Search completed successfully!');

        channelsStore.setChannels(
          data.channels,
          data.stats,
          {
            searchSessionId: data.sessionId,
            hasMore: false,
            currentPage: 1,
            pageSize: searchLimit,
            totalChannels: data.channels?.length || result.channelsFound,
            totalPages: 1
          },
          searchLimit,
          filters
        );

        channelsStore.setSearching(false);
        channelsStore.setEnriching(false);
        channelsStore.setProgress(100, data.stats?.message || 'Search complete!');

        // Clear active job and localStorage since job completed successfully
        activeJobId = null;
        localStorage.removeItem(ACTIVE_JOB_KEY);

        // Show success message
        toastStore.show(
          `Search complete! Found ${result.channelsFound} channels in ${Math.round(result.duration / 1000)}s (${result.totalPolls} polls, ${result.cyclesUsed} cycles)`,
          'success',
          5000
        );

      } else if (result.error === 'Cancelled') {
        console.log('[Polling] Search cancelled by user');
        // Don't show error - user cancelled

      } else if (result.error === 'Max cycles reached') {
        console.log(`[Polling] ⚠️  Max polling cycles reached. Found ${result.channelsFound} channels`);

        // Update with partial results if available
        if (result.finalData && result.finalData.channels) {
          channelsStore.setChannels(
            result.finalData.channels,
            result.finalData.stats,
            {
              searchSessionId: result.finalData.sessionId,
              hasMore: false,
              currentPage: 1,
              pageSize: searchLimit,
              totalChannels: result.channelsFound,
              totalPages: 1
            },
            searchLimit,
            filters
          );
        }

        channelsStore.setSearching(false);
        channelsStore.setEnriching(false);

        // Show warning with partial results
        toastStore.show(
          `Search timed out. Found ${result.channelsFound} channels (partial results). Backend may still be processing.`,
          'warning',
          8000
        );

        activeJobId = null;
        localStorage.removeItem(ACTIVE_JOB_KEY);

      } else {
        // Other errors
        throw new Error(result.error || 'Polling failed');
      }

    } catch (err) {
      console.error('[Polling] Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Polling error';

      // Show user-friendly toast notification
      if (errorMessage.includes('ERR_NAME_NOT_RESOLVED') || errorMessage.includes('net::')) {
        toastStore.show(
          'Network error: Please check your internet connection and try again.',
          'error',
          8000
        );
      } else if (errorMessage.includes('ERR_INTERNET_DISCONNECTED')) {
        toastStore.show(
          'No internet connection. Please connect to the internet and try again.',
          'error',
          8000
        );
      } else if (errorMessage.includes('timeout')) {
        toastStore.show(
          'Request timed out. Please try again.',
          'error',
          7000
        );
      } else {
        toastStore.show(
          `Search error: ${errorMessage}`,
          'error',
          7000
        );
      }

      channelsStore.setError(errorMessage);
      channelsStore.setSearching(false);
      channelsStore.setEnriching(false);
    }
  }

  function getStatusMessage(status: string, stats: any): string {
    switch (status) {
      case 'collecting':
        return 'Collecting channels from YouTube...';
      case 'streaming':
        return stats
          ? `Found ${stats.passing}/${stats.target} channels, searching for more...`
          : 'Processing channels...';
      case 'collecting_more':
        return 'Collecting additional channels...';
      case 'completed':
        return 'Search complete!';
      default:
        return 'Processing...';
    }
  }

  async function handleReset() {
    // If there's an active search, show confirmation dialog
    if (activeJobId) {
      const confirmed = confirm(
        'A search is currently in progress. Are you sure you want to stop it and reset all data?'
      );

      if (!confirmed) {
        console.log('[Reset] User canceled reset operation');
        return; // User clicked "Cancel", don't reset
      }

      // User confirmed, cancel the job on backend
      try {
        console.log(`[Reset] User confirmed, canceling active job ${activeJobId} on backend`);
        await apiPost('/youtube/search/cancel', { jobId: activeJobId });
        console.log(`[Reset] Successfully canceled job ${activeJobId}`);
      } catch (error) {
        console.warn('[Reset] Failed to cancel job on backend:', error);
      }
    }

    // Clear active job ID
    activeJobId = null;
    // Clear from localStorage
    localStorage.removeItem(ACTIVE_JOB_KEY);

    // Clear any existing enrichment polling
    if (enrichmentPollingInterval) {
      console.log('[Reset] Clearing enrichment polling');
      clearInterval(enrichmentPollingInterval);
      enrichmentPollingInterval = null;
    }

    // Reset form fields
    keyword = '';
    totalChannelsLimit = 50;
    minSubscribers = undefined;
    maxSubscribers = undefined;
    minAvgViews = undefined;
    maxAvgViews = undefined;
    country = '';

    // Reset progress
    searchProgress = 0;
    statusMessage = '';

    // Reset store
    channelsStore.reset();
  }

  // Stop search - keeps results and form data, just stops backend processing
  async function handleStopSearch() {
    if (!activeJobId) {
      console.log('[Stop] No active search to stop');
      return;
    }

    try {
      console.log(`[Stop] Stopping search for job ${activeJobId}`);
      await apiPost('/youtube/search/cancel', { jobId: activeJobId });
      console.log(`[Stop] Successfully stopped job ${activeJobId}`);
    } catch (error) {
      console.warn('[Stop] Failed to stop job on backend:', error);
    }

    // Clear active job ID and localStorage
    activeJobId = null;
    localStorage.removeItem(ACTIVE_JOB_KEY);

    // Clear any existing enrichment polling
    if (enrichmentPollingInterval) {
      console.log('[Stop] Clearing enrichment polling');
      clearInterval(enrichmentPollingInterval);
      enrichmentPollingInterval = null;
    }

    // Stop the searching/enriching state but KEEP all results and form data
    channelsStore.setSearching(false);
    channelsStore.setEnriching(false);

    // Update status message to indicate search was stopped
    statusMessage = 'Search stopped by user';

    console.log('[Stop] Search stopped - results and form data preserved');
  }

  // Export functions for use in parent components
  export { handleLoadMoreChannels, handleEnrichVideoData };

  /**
   * Load more enriched channels from database
   */
  async function handleLoadMoreChannels(sessionId: string, offset: number, limit: number) {
    try {
      console.log(`[LoadMore] Fetching ${limit} more channels from offset ${offset}`);

      const response = await apiPost<any>('/youtube/search/load-more', {
        sessionId,
        offset,
        limit,
      });

      if (response.status === 'success' && response.data) {
        console.log(`[LoadMore] Received ${response.data.channels.length} channels`);
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to load more channels');
      }
    } catch (error) {
      console.error('[LoadMore] Error:', error);
      toastStore.show(
        error instanceof Error ? error.message : 'Failed to load more channels',
        'error',
        5000
      );
      throw error;
    }
  }

  /**
   * Enrich video data for channels missing it
   */
  async function handleEnrichVideoData(channelIds: string[]) {
    try {
      console.log(`[EnrichVideoData] Starting enrichment for ${channelIds.length} channels`);

      const response = await apiPost<any>('/youtube/channels/enrich-video-data', {
        channelIds,
      });

      if (response.status === 'success' && response.data) {
        console.log(`[EnrichVideoData] Completed: ${response.data.message}`);
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to enrich video data');
      }
    } catch (error) {
      console.error('[EnrichVideoData] Error:', error);
      throw error;
    }
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
        min="5"
        max="200"
        step="5"
        class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <p class="mt-1 text-sm text-gray-500">
        Maximum number of channels to scrape from YouTube. Use "Load More" to fetch additional
        results.
      </p>
    </div>


    <!-- Action Buttons -->
    <div class="flex gap-3 pt-4">
      {#if $channelsStore.isSearching || $channelsStore.isEnriching}
        <!-- Stop Search Button (shown when search is active) -->
        <button
          type="button"
          on:click={handleStopSearch}
          class="flex items-center justify-center flex-1 gap-2 px-6 py-3 font-semibold text-white transition-colors bg-red-600 rounded-md hover:bg-red-700"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 10h6v4H9z"
            />
          </svg>
          Stop Search
        </button>
      {:else}
        <!-- Search Button (shown when not searching) -->
        <button
          type="submit"
          class="flex items-center justify-center flex-1 gap-2 px-6 py-3 font-semibold text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          Search Channels
        </button>
      {/if}

      <button
        type="button"
        on:click={handleReset}
        class="px-6 py-3 font-semibold text-gray-700 transition-colors border border-gray-300 rounded-md hover:bg-gray-50"
      >
        Reset
      </button>
    </div>
  </form>

  <!-- Progress Bar UI -->
  {#if $channelsStore.isSearching || $channelsStore.isEnriching}
    <div class="p-4 mt-4 border border-blue-200 rounded-lg bg-blue-50">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm font-medium text-blue-700">{statusMessage}</span>
        <span class="text-sm text-blue-600">{Math.round(searchProgress)}%</span>
      </div>
      <div class="w-full bg-blue-200 rounded-full h-2.5">
        <div
          class="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
          style="width: {searchProgress}%"
        ></div>
      </div>
      {#if $channelsStore.stats}
        <p class="mt-2 text-xs text-blue-600">
          Enriched {$channelsStore.stats.enriched} channels,
          {$channelsStore.stats.passing} passed filters
        </p>
      {/if}
    </div>
  {/if}

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
