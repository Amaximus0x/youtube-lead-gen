/**
 * Polling with Restart Logic for SvelteKit
 *
 * Solves the issue where polling hits the 300-poll limit
 * but the backend is still processing (enriching channels).
 *
 * This utility restarts the polling counter every maxPollsPerCycle
 * while continuing to check the same job ID, allowing unlimited
 * polling while respecting Vercel's serverless constraints.
 */

import { apiGet } from '$lib/api/client';

export interface PollConfig {
  jobId: string;
  apiEndpoint?: string;
  targetLimit?: number;
  maxPollsPerCycle?: number;
  initialInterval?: number;
  maxCycles?: number;
  onProgress?: (progress: PollProgress) => void;
  onUpdate?: (data: any) => void;
  isActive?: () => boolean; // Function to check if polling should continue
}

export interface PollProgress {
  currentCycle: number;
  pollsInCycle: number;
  totalPolls: number;
  channelsFound: number;
  phase: string;
  status: string;
  percentComplete: number;
}

export interface PollResult {
  success: boolean;
  channelsFound: number;
  cyclesUsed: number;
  totalPolls: number;
  duration: number;
  finalData?: any;
  error?: string;
}

/**
 * Poll with automatic restart when hitting poll limit
 */
export async function pollWithRestart(config: PollConfig): Promise<PollResult> {
  const {
    jobId,
    apiEndpoint = '/youtube/search',
    targetLimit = 100,
    maxPollsPerCycle = 300,
    initialInterval = 1500,
    maxCycles = 5,
    onProgress,
    onUpdate,
    isActive = () => true
  } = config;

  const startTime = Date.now();
  let cycle = 0;
  let totalChannelsFound = 0;
  let totalPolls = 0;
  let consecutiveNoChange = 0;
  let currentInterval = initialInterval;
  let lastChannelCount = 0;
  let finalData: any = null;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('[PollRestart] 🚀 Starting polling with restart capability');
  console.log(`[PollRestart] Job ID: ${jobId}`);
  console.log(`[PollRestart] Max polls per cycle: ${maxPollsPerCycle}`);
  console.log(`[PollRestart] Max cycles: ${maxCycles}`);
  console.log(`[PollRestart] Total allowed polls: ${maxPollsPerCycle * maxCycles}`);
  console.log('═══════════════════════════════════════════════════════════');

  try {
    while (cycle < maxCycles) {
      // Check if we should continue (e.g., job was cancelled)
      if (!isActive()) {
        console.log('[PollRestart] ❌ Polling cancelled by caller');
        return {
          success: false,
          channelsFound: totalChannelsFound,
          cyclesUsed: cycle + 1,
          totalPolls,
          duration: Date.now() - startTime,
          error: 'Cancelled'
        };
      }

      console.log(`\n[PollRestart] 🔄 Cycle ${cycle + 1}/${maxCycles} starting...`);

      const cycleStartChannels = totalChannelsFound;
      const cycleStartTime = Date.now();

      // Poll within this cycle
      for (let pollInCycle = 0; pollInCycle < maxPollsPerCycle; pollInCycle++) {
        // Check again if we should continue
        if (!isActive()) {
          console.log('[PollRestart] ❌ Polling cancelled during cycle');
          return {
            success: false,
            channelsFound: totalChannelsFound,
            cyclesUsed: cycle + 1,
            totalPolls,
            duration: Date.now() - startTime,
            finalData,
            error: 'Cancelled'
          };
        }

        try {
          const res = await apiGet<any>(`${apiEndpoint}/${jobId}`);
          const data = res?.data || res;

          const previousCount = totalChannelsFound;
          totalChannelsFound = data.channels?.length || data.channelsFound || 0;
          totalPolls++;

          // Calculate progress
          const percentComplete = targetLimit
            ? Math.min(100, Math.round((totalChannelsFound / targetLimit) * 100))
            : 0;

          // Call progress callback
          if (onProgress) {
            onProgress({
              currentCycle: cycle + 1,
              pollsInCycle: pollInCycle + 1,
              totalPolls,
              channelsFound: totalChannelsFound,
              phase: data.phase || data.status || 'unknown',
              status: data.status || 'processing',
              percentComplete
            });
          }

          // Call update callback with full data
          if (onUpdate) {
            onUpdate(data);
          }

          console.log(
            `[PollRestart] Poll #${totalPolls} (Cycle ${cycle + 1}, Poll ${pollInCycle + 1}): ` +
            `${totalChannelsFound}/${targetLimit} channels (${percentComplete}%) | ` +
            `Status: ${data.status}`
          );

          // Store final data
          finalData = data;

          // Check if job is complete
          if (data.status === 'completed') {
            const duration = Date.now() - startTime;
            console.log('\n═══════════════════════════════════════════════════════════');
            console.log(`[PollRestart] ✅ Job completed successfully!`);
            console.log(`[PollRestart] Found: ${totalChannelsFound} channels`);
            console.log(`[PollRestart] Duration: ${(duration / 1000).toFixed(1)}s`);
            console.log(`[PollRestart] Total polls: ${totalPolls}`);
            console.log(`[PollRestart] Cycles used: ${cycle + 1}`);
            console.log('═══════════════════════════════════════════════════════════');

            return {
              success: true,
              channelsFound: totalChannelsFound,
              cyclesUsed: cycle + 1,
              totalPolls,
              duration,
              finalData
            };
          }

          // Check for failure
          if (data.status === 'failed' || data.error) {
            throw new Error(data.error || 'Job failed');
          }

          // Adaptive interval logic
          if (totalChannelsFound > previousCount) {
            // New channels found - poll faster
            consecutiveNoChange = 0;
            currentInterval = initialInterval;
            lastChannelCount = totalChannelsFound;
          } else {
            // No new channels - slow down
            consecutiveNoChange++;
            if (consecutiveNoChange > 10) {
              currentInterval = Math.min(5000, currentInterval * 1.2);
            }
          }

          await sleep(currentInterval);

        } catch (error: any) {
          console.error(`[PollRestart] Poll #${totalPolls} error:`, error.message);

          // Don't fail immediately on network errors - continue polling
          if (error.message?.includes('fetch') || error.message?.includes('network')) {
            console.log('[PollRestart] Network error, continuing...');
            await sleep(currentInterval);
            continue;
          }

          // For other errors, fail
          console.error('[PollRestart] ❌ Fatal error');
          return {
            success: false,
            channelsFound: totalChannelsFound,
            cyclesUsed: cycle + 1,
            totalPolls,
            duration: Date.now() - startTime,
            finalData,
            error: error.message
          };
        }
      }

      // End of cycle
      const channelsGainedThisCycle = totalChannelsFound - cycleStartChannels;
      const cycleDuration = Date.now() - cycleStartTime;

      console.log(`\n[PollRestart] 📊 Cycle ${cycle + 1} complete:`);
      console.log(`  • Duration: ${(cycleDuration / 1000).toFixed(1)}s`);
      console.log(`  • Channels gained: +${channelsGainedThisCycle}`);
      console.log(`  • Total channels: ${totalChannelsFound}/${targetLimit}`);

      // Check if we should continue
      if (channelsGainedThisCycle === 0 && consecutiveNoChange > 20) {
        console.log('[PollRestart] No progress detected. Assuming job complete.');
        return {
          success: true,
          channelsFound: totalChannelsFound,
          cyclesUsed: cycle + 1,
          totalPolls,
          duration: Date.now() - startTime,
          finalData
        };
      }

      cycle++;

      // Pause between cycles
      if (cycle < maxCycles) {
        console.log(`[PollRestart] ⏸️  Pausing 2s before cycle ${cycle + 1}...`);
        await sleep(2000);
      }
    }

    // Max cycles reached
    const duration = Date.now() - startTime;
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log(`[PollRestart] ⚠️  Max cycles reached (${maxCycles})`);
    console.log(`[PollRestart] Found: ${totalChannelsFound} channels`);
    console.log(`[PollRestart] Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`[PollRestart] Total polls: ${totalPolls}`);
    console.log('═══════════════════════════════════════════════════════════');

    return {
      success: false,
      channelsFound: totalChannelsFound,
      cyclesUsed: cycle,
      totalPolls,
      duration,
      finalData,
      error: 'Max cycles reached'
    };

  } catch (error: any) {
    console.error('[PollRestart] ❌ Fatal error:', error);
    return {
      success: false,
      channelsFound: totalChannelsFound,
      cyclesUsed: cycle + 1,
      totalPolls,
      duration: Date.now() - startTime,
      finalData,
      error: error.message
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
