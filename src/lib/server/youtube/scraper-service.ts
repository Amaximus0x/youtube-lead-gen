/**
 * Scraper Service with Browser Pool Support
 *
 * This service wraps the YouTubeScraper to support multiple simultaneous searches
 * using a browser instance pool.
 */

import { getBrowserPool } from './browser-pool';
import type { ChannelSearchResult } from './scraper-puppeteer';
import type { FilterConfig } from '$lib/types/models';

interface ScraperSession {
  sessionKey: string;
  browserInstanceId: number;
  startTime: number;
}

const activeSessions = new Map<string, ScraperSession>();

/**
 * Search for YouTube channels using the browser pool
 * Each search gets its own browser instance from the pool
 */
export async function searchChannelsWithPool(
  keyword: string,
  limit: number,
  enrichData: boolean,
  filters: Partial<FilterConfig>,
  sessionKey: string
): Promise<ChannelSearchResult[]> {
  const pool = getBrowserPool();

  // Initialize pool if not already done
  await pool.initialize();

  let browserInstanceId: number | null = null;

  try {
    console.log(`[ScraperService] Starting search for session: ${sessionKey}`);

    // Acquire a browser from the pool
    const { browser, instanceId } = await pool.acquire(sessionKey);
    browserInstanceId = instanceId;

    // Track active session
    activeSessions.set(sessionKey, {
      sessionKey,
      browserInstanceId,
      startTime: Date.now()
    });

    console.log(
      `[ScraperService] Acquired browser ${instanceId + 1} for session ${sessionKey}`
    );
    console.log(`[BrowserPool Status]`, pool.getStatus());

    // Perform the search using the acquired browser
    const results = await performSearch(browser, keyword, limit, enrichData, filters);

    console.log(
      `[ScraperService] Search completed for session ${sessionKey}: ${results.length} channels`
    );

    return results;
  } catch (error) {
    console.error(`[ScraperService] Search failed for session ${sessionKey}:`, error);
    throw error;
  } finally {
    // Always release the browser instance back to the pool
    if (browserInstanceId !== null) {
      pool.release(browserInstanceId);
      activeSessions.delete(sessionKey);
      console.log(`[ScraperService] Released browser ${browserInstanceId + 1}`);
    }
  }
}

/**
 * Perform the actual search using the provided browser instance
 * This is similar to YouTubeScraper.searchChannels but uses an existing browser
 */
async function performSearch(
  browser: any,
  keyword: string,
  limit: number,
  enrichData: boolean,
  filters: Partial<FilterConfig>
): Promise<ChannelSearchResult[]> {
  // Import the scraper modules
  const { batchGetChannelDetails } = await import('./channel-details');
  const { extractEmails, extractSocialLinks } = await import('./contact-extractor');

  const page = await browser.newPage();

  try {
    // Set user agent to avoid detection
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Navigate to YouTube search
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`;
    console.log(`[Search] Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract channel IDs from search results
    const channelUrls: string[] = [];
    let scrollAttempts = 0;
    const maxScrolls = Math.ceil(limit / 10); // Estimate: ~10 channels per page

    while (channelUrls.length < limit && scrollAttempts < maxScrolls * 2) {
      // Extract channel links
      const newUrls = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/channel/"]'));
        return links
          .map((link) => (link as HTMLAnchorElement).href)
          .filter((url) => url.includes('/channel/'));
      });

      // Add unique URLs
      newUrls.forEach((url) => {
        if (!channelUrls.includes(url) && channelUrls.length < limit) {
          channelUrls.push(url);
        }
      });

      // Scroll to load more
      if (channelUrls.length < limit) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await new Promise((resolve) => setTimeout(resolve, 1000));
        scrollAttempts++;
      } else {
        break;
      }
    }

    console.log(`[Search] Found ${channelUrls.length} channel URLs`);

    // Extract channel IDs
    const channelIds = channelUrls
      .map((url) => {
        const match = url.match(/\/channel\/([^/?]+)/);
        return match ? match[1] : null;
      })
      .filter((id): id is string => id !== null);

    // Get channel details
    const channels: ChannelSearchResult[] = channelIds.map((id) => ({
      channelId: id,
      name: '',
      url: `https://www.youtube.com/channel/${id}`,
      description: '',
      subscriberCount: 0,
      videoCount: 0,
      relevanceScore: 0
    }));

    // Enrich with detailed data if requested
    if (enrichData) {
      await batchGetChannelDetails(channels, browser);

      // Apply filters
      const filteredChannels = applyFilters(channels, filters);

      // Extract emails and social links
      for (const channel of filteredChannels) {
        if (channel.description) {
          channel.emails = extractEmails(channel.description);
          channel.socialLinks = extractSocialLinks(channel.description);
        }
      }

      return filteredChannels;
    }

    return channels;
  } finally {
    await page.close();
  }
}

/**
 * Apply filters to channels
 */
function applyFilters(
  channels: ChannelSearchResult[],
  filters: Partial<FilterConfig>
): ChannelSearchResult[] {
  return channels.filter((channel) => {
    // Min subscribers filter
    if (
      filters.minSubscribers &&
      channel.subscriberCount &&
      channel.subscriberCount < filters.minSubscribers
    ) {
      return false;
    }

    // Max subscribers filter
    if (
      filters.maxSubscribers &&
      channel.subscriberCount &&
      channel.subscriberCount > filters.maxSubscribers
    ) {
      return false;
    }

    // Exclude music channels
    if (filters.excludeMusicChannels) {
      const musicKeywords = ['music', 'official', 'vevo', 'records'];
      const nameOrDesc = `${channel.name} ${channel.description}`.toLowerCase();
      if (musicKeywords.some((keyword) => nameOrDesc.includes(keyword))) {
        return false;
      }
    }

    // Exclude brand channels
    if (filters.excludeBrands) {
      const brandKeywords = ['official', 'inc', 'llc', 'corporation', 'brand'];
      const nameOrDesc = `${channel.name} ${channel.description}`.toLowerCase();
      if (brandKeywords.some((keyword) => nameOrDesc.includes(keyword))) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get status of all active sessions
 */
export function getActiveSessionsStatus(): ScraperSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Cancel a specific session (if possible)
 */
export function cancelSession(sessionKey: string): boolean {
  const session = activeSessions.get(sessionKey);
  if (session) {
    console.log(`[ScraperService] Canceling session: ${sessionKey}`);
    // In a real implementation, you might want to add a cancellation mechanism
    activeSessions.delete(sessionKey);
    return true;
  }
  return false;
}
