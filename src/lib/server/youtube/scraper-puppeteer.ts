import type { Browser, Page } from 'puppeteer-core';
import { batchGetChannelDetails } from './channel-details';
import { extractEmails, extractSocialLinks } from './contact-extractor';

export interface ChannelSearchResult {
  channelId: string;
  name: string;
  url: string;
  description?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  country?: string;
  thumbnailUrl?: string;
  relevanceScore?: number;
  emails?: string[];
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    tiktok?: string;
    discord?: string;
    twitch?: string;
    linkedin?: string;
    website?: string;
  };
}

export class YouTubeScraper {
  private browser: Browser | null = null;

  async initialize() {
    if (this.browser) return;

    const proxyUrl = process.env.PROXY_URL;

    // Prepare common args
    const commonArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ];

    // Add proxy if configured
    if (proxyUrl) {
      commonArgs.push(`--proxy-server=${proxyUrl}`);
      console.log(`Using proxy: ${proxyUrl}`);
    }

    // Use regular puppeteer for local development
    const puppeteer = await import('puppeteer');

    this.browser = await puppeteer.launch({
      headless: true,
      args: commonArgs,
    });

    console.log('YouTube scraper initialized');
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('YouTube scraper closed');
    }
  }

  async searchChannels(
    keyword: string,
    limit: number = 50,
    enrichData: boolean = true,
    filters?: {
      minSubscribers?: number;
      maxSubscribers?: number;
      country?: string;
      excludeMusicChannels?: boolean;
      excludeBrands?: boolean;
    }
  ): Promise<ChannelSearchResult[]> {
    // Use Innertube API method for better performance
    return this.searchChannelsWithInnertube(keyword, limit, filters);
  }

  /**
   * Search channels using YouTube Innertube API (continuation tokens)
   * This is much faster and can retrieve many more results than scrolling
   */
  private async searchChannelsWithInnertube(
    keyword: string,
    limit: number = 50,
    filters?: {
      minSubscribers?: number;
      maxSubscribers?: number;
      country?: string;
      excludeMusicChannels?: boolean;
      excludeBrands?: boolean;
    }
  ): Promise<ChannelSearchResult[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();

    try {
      const searchQuery = encodeURIComponent(keyword);
      const url = `https://www.youtube.com/results?search_query=${searchQuery}&sp=EgIQAg%253D%253D`;
      console.log(`[Innertube] Searching YouTube: ${url}`);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Extract Innertube data
      const { extractInnertubeData, collectChannelsFromInnertubeData, getContinuationToken, fetchNextPage } = await import('./innertube-scraper');
      const innertubeData = await extractInnertubeData(page);
      console.log(`[Innertube] Extracted API key and context`);

      // Collect channels from initial page
      let allChannels = collectChannelsFromInnertubeData(innertubeData.ytInitialData);
      console.log(`[Innertube] Found ${allChannels.length} channels in initial page`);

      // Get continuation token
      let continuation = getContinuationToken(innertubeData.ytInitialData);

      // Fetch more pages using continuation tokens
      let attempts = 0;
      const maxAttempts = 20;
      // If we have filters, get 5x the limit to ensure we have enough after filtering
      // (accounting for both filtering and enrichment failures)
      const targetChannels = filters && (filters.minSubscribers || filters.maxSubscribers || filters.country) ? limit * 5 : limit;

      while (allChannels.length < targetChannels && continuation && attempts < maxAttempts) {
        attempts++;
        console.log(
          `[Innertube] Fetching page ${attempts + 1} (have ${allChannels.length} channels, targeting ${targetChannels})`
        );

        try {
          const response = await fetchNextPage(
            page,
            innertubeData.apiKey,
            innertubeData.context,
            continuation
          );

          const newChannels = collectChannelsFromInnertubeData(response);
          console.log(`[Innertube] Found ${newChannels.length} new channels in page ${attempts + 1}`);

          // Add unique channels
          const existingUrls = new Set(allChannels.map((c) => c.url));
          for (const channel of newChannels) {
            if (!existingUrls.has(channel.url)) {
              allChannels.push(channel);
            }
          }

          continuation = getContinuationToken(response);

          if (!continuation) {
            console.log(`[Innertube] No more continuation tokens, stopping`);
            break;
          }
        } catch (error) {
          console.error(`[Innertube] Error fetching page ${attempts + 1}:`, error);
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      console.log(
        `[Innertube] Total collected: ${allChannels.length} channels after ${attempts} continuation requests`
      );

      // Enrich and filter if needed
      if (filters && (filters.minSubscribers || filters.maxSubscribers || filters.country)) {
        console.log(`[Filter] Starting batch enrichment and filtering to get ${limit} matching channels...`);

        const matchingChannels: ChannelSearchResult[] = [];
        const batchSize = 10;
        let processedCount = 0;

        for (let i = 0; i < allChannels.length && matchingChannels.length < limit; i += batchSize) {
          const batch = allChannels.slice(i, i + batchSize);

          console.log(
            `[Filter] Enriching batch ${Math.floor(i / batchSize) + 1} (channels ${i + 1}-${i + batch.length})`
          );

          try {
            await this.enrichChannelStats(page, batch, true); // Pass retry flag for filters
          } catch (enrichError) {
            console.error('Error enriching batch:', enrichError);
            continue;
          }

          for (const channel of batch) {
            processedCount++;

            // Skip channels that failed enrichment (no subscriber data)
            if (channel.subscriberCount === undefined || channel.subscriberCount === null) {
              console.log(
                `[Filter] ⚠ Skipped: ${channel.name} (failed to get subscriber count)`
              );
              continue;
            }

            const matches = this.channelMatchesFilters(channel, filters);

            if (matches) {
              matchingChannels.push(channel);
              console.log(
                `[Filter] ${matchingChannels.length}/${limit} - ✓ ${channel.name} (${channel.subscriberCount?.toLocaleString() || 'N/A'} subs, ${channel.country || 'N/A'})`
              );

              if (matchingChannels.length >= limit) {
                break;
              }
            } else {
              console.log(
                `[Filter] ✗ Filtered out: ${channel.name} (${channel.subscriberCount?.toLocaleString() || 'N/A'} subs, ${channel.country || 'N/A'})`
              );
            }
          }
        }

        console.log(
          `[Filter] Result: ${matchingChannels.length} matching channels out of ${processedCount} checked (${allChannels.length} total found)`
        );

        return matchingChannels;
      } else {
        // No filters - just enrich and return
        const channelsToReturn = allChannels.slice(0, limit);

        if (channelsToReturn.length > 0) {
          console.log(`Getting accurate stats for all ${channelsToReturn.length} channels...`);
          try {
            await this.enrichChannelStats(page, channelsToReturn);
          } catch (enrichError) {
            console.error('Error enriching channel stats:', enrichError);
          }
        }

        return channelsToReturn;
      }
    } catch (error) {
      console.error('[Innertube] Search error:', error);
      throw new Error(
        `Failed to search channels: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await page.close();
    }
  }

  /**
   * Legacy scrolling method (kept for reference, not used)
   */
  private async searchChannelsWithScrolling(
    keyword: string,
    limit: number = 50,
    filters?: {
      minSubscribers?: number;
      maxSubscribers?: number;
      country?: string;
      excludeMusicChannels?: boolean;
      excludeBrands?: boolean;
    }
  ): Promise<ChannelSearchResult[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    const channels: ChannelSearchResult[] = [];
    const waitTime = 1500;

    try {
      // Set user agent to avoid detection
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      });

      // Build search URL with channel filter
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`;
      console.log('Searching YouTube:', searchUrl);

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Wait for content
      console.log('Waiting for channel results...');
      await page.waitForSelector('ytd-channel-renderer', { timeout: 10000 });

      // IMPORTANT: Scroll slowly to trigger lazy-loading of subscriber counts
      console.log('Triggering lazy-load by scrolling...');
      await page.evaluate(() => {
        window.scrollBy(0, 500);
      });
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      await page.evaluate(() => {
        window.scrollBy(0, 500);
      });
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Scroll back to top to ensure all elements are in view
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await new Promise((resolve) => setTimeout(resolve, waitTime)); // Wait for content to fully load

      // Extract channels using the working approach from test-scraper.js
      let extractedChannels = await this.extractChannels(page);
      console.log(`Extracted ${extractedChannels.length} channels`);
      channels.push(...extractedChannels);

      // Scroll for more results if needed
      let scrollAttempts = 0;
      const maxScrolls = 30; // Increased to allow for filtering
      let noNewChannelsCount = 0; // Track consecutive failures
      let previousHeight = 0;

      console.log(`[Filter] Active filters: ${JSON.stringify(filters || {})}`);
      console.log(`[Filter] Target: ${limit} matching channels`);

      while (channels.length < limit && scrollAttempts < maxScrolls) {
        // Get current scroll height
        const currentHeight = await page.evaluate(() => document.body.scrollHeight);

        // Scroll to bottom using multiple methods
        await page.evaluate(() => {
          // Method 1: Scroll to absolute bottom
          window.scrollTo(0, document.body.scrollHeight);

          // Method 2: Also try scrolling the main content div
          const scrollContainer = document.querySelector('ytd-app');
          if (scrollContainer) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
          }
        });

        // Wait for YouTube to load more content
        // Increase wait time significantly for more reliable loading
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // Check if page height increased (indicates new content loaded)
        const newHeight = await page.evaluate(() => document.body.scrollHeight);
        const heightIncreased = newHeight > currentHeight;

        if (heightIncreased) {
          console.log(`Page height increased: ${currentHeight} -> ${newHeight}`);
        }

        const newChannels = await this.extractChannels(page);
        const uniqueNewChannels = newChannels.filter(
          (nc) => !channels.some((c) => c.channelId === nc.channelId)
        );

        if (uniqueNewChannels.length === 0) {
          noNewChannelsCount++;
          console.log(
            `No new channels found (attempt ${noNewChannelsCount}/5) - Height increased: ${heightIncreased}`
          );

          // Give YouTube more chances (5 attempts instead of 3)
          if (noNewChannelsCount >= 5) {
            console.log('No more new channels after 5 attempts, stopping scroll');
            break;
          }

          // If height isn't increasing, YouTube might be done
          if (!heightIncreased && noNewChannelsCount >= 3) {
            console.log('Page height stopped increasing, likely no more results');
            break;
          }
        } else {
          noNewChannelsCount = 0; // Reset counter when we find new channels
          channels.push(...uniqueNewChannels);
          console.log(
            `Found ${uniqueNewChannels.length} new channels (total: ${channels.length}/${limit})`
          );
        }

        previousHeight = newHeight;
        scrollAttempts++;
      }

      console.log(`Scroll attempts: ${scrollAttempts}, Max allowed: ${maxScrolls}`);

      console.log(`Total found: ${channels.length} channels (before filtering) for keyword: ${keyword}`);

      // If filters are active, we need to enrich channels in batches and filter as we go
      if (filters && (filters.minSubscribers || filters.maxSubscribers || filters.country)) {
        console.log(`[Filter] Starting batch enrichment and filtering to get ${limit} matching channels...`);

        const matchingChannels: ChannelSearchResult[] = [];
        const batchSize = 10; // Enrich 10 channels at a time
        let processedCount = 0;

        // Process channels in batches
        for (let i = 0; i < channels.length && matchingChannels.length < limit; i += batchSize) {
          const batch = channels.slice(i, i + batchSize);

          console.log(
            `[Filter] Enriching batch ${Math.floor(i / batchSize) + 1} (channels ${i + 1}-${i + batch.length})`
          );

          // Enrich this batch
          try {
            await this.enrichChannelStats(page, batch, true); // Pass retry flag for filters
          } catch (enrichError) {
            console.error('Error enriching batch:', enrichError);
            continue;
          }

          // Filter the enriched batch
          for (const channel of batch) {
            processedCount++;

            // Skip channels that failed enrichment (no subscriber data)
            if (channel.subscriberCount === undefined || channel.subscriberCount === null) {
              console.log(
                `[Filter] ⚠ Skipped: ${channel.name} (failed to get subscriber count)`
              );
              continue;
            }

            const matches = this.channelMatchesFilters(channel, filters);

            if (matches) {
              matchingChannels.push(channel);
              console.log(
                `[Filter] ${matchingChannels.length}/${limit} - ✓ ${channel.name} (${channel.subscriberCount?.toLocaleString() || 'N/A'} subs, ${channel.country || 'N/A'})`
              );

              // Stop once we have enough matching channels
              if (matchingChannels.length >= limit) {
                break;
              }
            } else {
              console.log(
                `[Filter] ✗ Filtered out: ${channel.name} (${channel.subscriberCount?.toLocaleString() || 'N/A'} subs, ${channel.country || 'N/A'})`
              );
            }
          }
        }

        console.log(
          `[Filter] Result: ${matchingChannels.length} matching channels out of ${processedCount} checked (${channels.length} total found)`
        );

        return matchingChannels;
      } else {
        // No subscriber/country filters - just enrich and return
        const channelsToReturn = channels.slice(0, limit);

        if (channelsToReturn.length > 0) {
          console.log(`Getting accurate stats for all ${channelsToReturn.length} channels...`);
          try {
            await this.enrichChannelStats(page, channelsToReturn);
          } catch (enrichError) {
            console.error('Error enriching channel stats:', enrichError);
          }
        }

        return channelsToReturn;
      }
    } catch (error) {
      console.error('Error searching channels:', error);
      throw new Error(
        `Failed to search channels: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      await page.close();
    }
  }

  private async extractChannels(page: Page): Promise<ChannelSearchResult[]> {
    // First get debug info
    const debugInfo = await page.evaluate(() => {
      const renderers = document.querySelectorAll('ytd-channel-renderer');
      const debug: any = {
        rendererCount: renderers.length,
        samples: [],
      };

      // Sample first 2 renderers
      for (let i = 0; i < Math.min(2, renderers.length); i++) {
        const el = renderers[i];
        const sample: any = {
          index: i,
          html: el.innerHTML.substring(0, 500),
        };

        // Try different selectors
        const linkSelectors = ['a[href*="/@"]', 'a[href*="/channel/"]', 'a#main-link', 'a'];

        sample.linkTests = linkSelectors.map((sel) => ({
          selector: sel,
          found: el.querySelector(sel) ? 'YES' : 'NO',
          href: (el.querySelector(sel) as any)?.href || 'N/A',
        }));

        const nameSelectors = ['#channel-title', '#text', '.yt-formatted-string'];

        sample.nameTests = nameSelectors.map((sel) => ({
          selector: sel,
          found: el.querySelector(sel) ? 'YES' : 'NO',
          text: el.querySelector(sel)?.textContent?.trim().substring(0, 50) || 'N/A',
        }));

        // Test subscriber selectors - get ALL text to see what's available
        const subsContainer = el.querySelector('#subscribers');
        sample.subscriberDebug = {
          containerFound: subsContainer ? 'YES' : 'NO',
          containerFullText: subsContainer?.textContent?.trim() || 'N/A',
          containerHTML: subsContainer?.innerHTML?.substring(0, 300) || 'N/A',
        };

        // NEW: Get ALL text content from the entire channel card to find subscriber count
        const allText = el.textContent || '';
        const lines = allText
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && l.length < 100);

        // Look for text that looks like subscriber counts
        const potentialSubCounts = lines.filter((line) => {
          const lower = line.toLowerCase();
          return (
            lower.includes('subscriber') ||
            lower.match(/\d+\.?\d*\s*[kmb]/i) ||
            lower.match(/\d{1,3}(,\d{3})*/) ||
            lower.includes('subs')
          );
        });

        sample.fullTextDebug = {
          allLines: lines.slice(0, 50), // First 50 lines of text
          potentialSubCounts: potentialSubCounts,
          totalLines: lines.length,
        };

        const subSelectors = [
          '#subscribers',
          '#subscriber-count',
          '#subscribers #text',
          '#subscribers yt-formatted-string',
          'yt-formatted-string#subscribers',
        ];

        sample.subTests = subSelectors.map((sel) => ({
          selector: sel,
          found: el.querySelector(sel) ? 'YES' : 'NO',
          text: el.querySelector(sel)?.textContent?.trim() || 'N/A',
        }));

        // Test thumbnail
        sample.thumbnailDebug = {
          imgFound: el.querySelector('img') ? 'YES' : 'NO',
          imgSrc: (el.querySelector('img') as any)?.src || 'N/A',
          allImgCount: el.querySelectorAll('img').length,
        };

        debug.samples.push(sample);
      }

      return debug;
    });

    console.log('\n=== EXTRACTION DEBUG ===');
    console.log(JSON.stringify(debugInfo, null, 2));
    console.log('========================\n');

    // Now do actual extraction
    const results = await page.evaluate(() => {
      const results: any[] = [];
      const renderers = document.querySelectorAll('ytd-channel-renderer');

      renderers.forEach((el, index) => {
        // Find channel link - try all possible selectors
        let linkEl = el.querySelector('a[href*="/@"]') as HTMLAnchorElement;
        if (!linkEl) linkEl = el.querySelector('a[href*="/channel/"]') as HTMLAnchorElement;
        if (!linkEl) linkEl = el.querySelector('a#main-link') as HTMLAnchorElement;
        if (!linkEl) linkEl = el.querySelector('a') as HTMLAnchorElement;

        if (!linkEl || !linkEl.href) {
          return; // Skip if no link
        }

        const url = linkEl.href;
        // Match patterns: /channel/ID, /@handle, /user/ID, /c/ID
        const channelIdMatch = url.match(
          /\/@([^/?]+)|\/channel\/([^/?]+)|\/user\/([^/?]+)|\/c\/([^/?]+)/
        );
        if (!channelIdMatch) {
          return; // Skip if can't extract ID
        }

        // Extract the ID from whichever group matched
        const channelId =
          channelIdMatch[1] || channelIdMatch[2] || channelIdMatch[3] || channelIdMatch[4];
        if (!channelId) {
          return;
        }

        // Find channel name - use #text inside #channel-title for clean name
        let name = '';

        // Try #channel-title #text first (most specific)
        let nameEl = el.querySelector('#channel-title #text');
        if (nameEl) {
          name = nameEl.textContent?.trim() || '';
        }

        // If still no name, try just #text
        if (!name) {
          nameEl = el.querySelector('#text');
          if (nameEl) {
            name = nameEl.textContent?.trim() || '';
          }
        }

        // If still no name, try #channel-title but clean it up
        if (!name) {
          nameEl = el.querySelector('#channel-title');
          if (nameEl) {
            // Get text and split by newlines, take first non-empty part
            const rawText = nameEl.textContent?.trim() || '';
            const parts = rawText
              .split('\n')
              .map((p) => p.trim())
              .filter((p) => p.length > 0);
            name = parts[0] || '';
          }
        }

        if (!name) {
          return; // Skip if no name found
        }

        // NOTE: Search results no longer show subscriber counts on initial load
        // All subscriber/video counts are fetched from /about pages during enrichment
        // These approaches have been removed as they had 0% success rate in testing
        let subscriberCount: number | undefined = undefined;

        // REMOVED: APPROACH 1-4 - Search result extraction (0% success rate)
        // YouTube search results only show channel handles like "@ChannelName"
        // Actual counts are only available on /about pages (handled in enrichment phase)

        // Find description
        let description = '';
        const descEl = el.querySelector('#description-text, #description') as HTMLElement;
        if (descEl) {
          description = descEl.textContent?.trim() || '';
        }

        // Find thumbnail - try to get the best quality image
        let thumbnailUrl = '';
        const images = el.querySelectorAll('img');

        // Look for channel avatar/thumbnail
        if (images.length > 0) {
          // Try to find the channel avatar (usually the first image)
          for (const img of Array.from(images)) {
            const src = (img as HTMLImageElement).src;
            // Skip placeholder or data URLs
            if (src && src.startsWith('http') && !src.includes('data:image')) {
              thumbnailUrl = src;
              break;
            }
          }

          // If still no thumbnail, try the first image
          if (!thumbnailUrl && images[0]) {
            const src = (images[0] as HTMLImageElement).src;
            if (src) thumbnailUrl = src;
          }
        }

        results.push({
          channelId: channelId,
          name,
          url,
          description,
          subscriberCount,
          thumbnailUrl,
          videoCount: undefined,
        });
      });

      function parseSubCount(text: string): number | undefined {
        if (!text) return undefined;

        // Remove common words
        const cleaned = text
          .toLowerCase()
          .replace(/subscribers?/gi, '')
          .replace(/subs?/gi, '')
          .trim();

        // Match patterns like: "190K", "1.5M", "800", "1.2B"
        const match = cleaned.match(/([\d,]+\.?\d*)\s*([kmb]?)/i);
        if (!match) return undefined;

        // Remove commas from number
        const numStr = match[1].replace(/,/g, '');
        const num = parseFloat(numStr);
        if (isNaN(num)) return undefined;

        const suffix = match[2].toUpperCase();

        const multipliers: Record<string, number> = {
          K: 1000,
          M: 1000000,
          B: 1000000000,
          '': 1,
        };

        return Math.floor(num * (multipliers[suffix] || 1));
      }

      return results;
    });

    console.log(`Extraction returned ${results.length} channels`);
    return results;
  }

  private async randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Check if a channel matches the given filters
   */
  private channelMatchesFilters(
    channel: ChannelSearchResult,
    filters?: {
      minSubscribers?: number;
      maxSubscribers?: number;
      country?: string;
      excludeMusicChannels?: boolean;
      excludeBrands?: boolean;
    }
  ): boolean {
    if (!filters) return true;

    // Check subscriber range (only if channel has subscriber data)
    if (channel.subscriberCount !== undefined && channel.subscriberCount !== null) {
      if (filters.minSubscribers !== undefined && channel.subscriberCount < filters.minSubscribers) {
        return false;
      }
      if (filters.maxSubscribers !== undefined && channel.subscriberCount > filters.maxSubscribers) {
        return false;
      }
    }

    // Check country (strict filtering - exclude if country filter is set but channel has no country)
    if (filters.country) {
      if (!channel.country) {
        // If country filter is active but channel has no country data, exclude it
        return false;
      }
      if (channel.country.toLowerCase() !== filters.country.toLowerCase()) {
        return false;
      }
    }

    // Check music channel exclusion
    if (filters.excludeMusicChannels && this.isMusicChannel(channel)) {
      return false;
    }

    // Check brand channel exclusion
    if (filters.excludeBrands && this.isBrandChannel(channel)) {
      return false;
    }

    return true;
  }

  /**
   * Detect if channel is a music channel
   */
  private isMusicChannel(channel: ChannelSearchResult): boolean {
    const musicKeywords = [
      'music',
      'vevo',
      'records',
      'entertainment',
      'audio',
      'songs',
      'official music',
      'topic',
      'hits',
      'soundtrack',
      'official artist channel'
    ];

    const lowerName = channel.name.toLowerCase();
    const lowerDesc = (channel.description || '').toLowerCase();

    for (const keyword of musicKeywords) {
      if (lowerName.includes(keyword)) {
        // Exception: channels that have music in context
        if (
          lowerName.includes('tutorial') ||
          lowerName.includes('lesson') ||
          lowerName.includes('education') ||
          lowerName.includes('production') ||
          lowerName.includes('theory')
        ) {
          continue;
        }
        return true;
      }
    }

    if (lowerDesc.includes('official music video') || lowerDesc.includes('vevo')) {
      return true;
    }

    return false;
  }

  /**
   * Detect if channel is a brand/corporate channel
   */
  private isBrandChannel(channel: ChannelSearchResult): boolean {
    const brandIndicators = [
      'official',
      'verified',
      'corp',
      'inc.',
      'llc',
      'ltd',
      'company',
      'corporation',
      'enterprises',
      'global',
      'worldwide',
      'international'
    ];

    const lowerName = channel.name.toLowerCase();
    const lowerDesc = (channel.description || '').toLowerCase();

    for (const indicator of brandIndicators) {
      if (lowerName.includes(indicator) || lowerDesc.includes(indicator)) {
        // Exception: personal brands
        if (
          lowerDesc.includes('creator') ||
          lowerDesc.includes('youtuber') ||
          lowerDesc.includes('content creator') ||
          lowerDesc.includes('influencer')
        ) {
          continue;
        }
        return true;
      }
    }

    // Check for very high subscriber count (likely brands)
    if (channel.subscriberCount && channel.subscriberCount > 5000000) {
      if (
        lowerDesc.includes('creator') ||
        lowerDesc.includes('personal') ||
        lowerName.split(' ').length <= 3
      ) {
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Enrich channels with accurate subscriber and video counts from /about pages
   * This is a lightweight version that ONLY gets stats, not emails or social links
   */
  private async enrichChannelStats(page: Page, channels: ChannelSearchResult[], retryOnFailure: boolean = false): Promise<void> {
    const delay = 1000;
    const maxRetries = retryOnFailure ? 2 : 0; // Retry up to 2 times when filters are active

    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      let retryCount = 0;
      let enrichmentSuccess = false;

      while (!enrichmentSuccess && retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            console.log(`[Stats ${i + 1}/${channels.length}] Retry ${retryCount}/${maxRetries} for: ${channel.name}`);
          } else {
            console.log(`[Stats ${i + 1}/${channels.length}] Fetching stats for: ${channel.name}`);
          }

          // Visit /about page
          const aboutUrl = channel.url.endsWith('/') ? `${channel.url}about` : `${channel.url}/about`;

          // Listen to browser console logs
          page.on('console', (msg) => {
            const text = msg.text();
            if (text.includes('[DEBUG]')) {
              console.log(`  ${text}`);
            }
          });

          await page.goto(aboutUrl, {
            waitUntil: 'networkidle0',
            timeout: 20000, // Increased timeout
          });

          // Wait for the page to fully load and render
          await new Promise((resolve) => setTimeout(resolve, delay * 2));

          // Scroll down to trigger lazy-loaded content
          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight / 2);
          });
          await new Promise((resolve) => setTimeout(resolve, 500));

          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });
          await new Promise((resolve) => setTimeout(resolve, 500));

        // Extract subscriber and video count using multiple strategies
        const stats = await page.evaluate(() => {
          const result: any = {};

          // Helper function to parse number with K/M/B suffix
          function parseCount(text: string): number | null {
            if (!text) return null;
            const match = text.match(/([\d,.]+)\s*([KMB]?)/i);
            if (match) {
              const numStr = match[1].replace(/,/g, '');
              const num = parseFloat(numStr);
              const suffix = match[2]?.toUpperCase() || '';
              const multipliers: Record<string, number> = {
                K: 1000,
                M: 1000000,
                B: 1000000000,
                '': 1,
              };
              return Math.floor(num * (multipliers[suffix] || 1));
            }
            return null;
          }

          // Strategy 1: Try to find stats in structured elements
          const statsElements = document.querySelectorAll('yt-formatted-string');
          console.log(`[ENRICHMENT STRATEGY 1] Found ${statsElements.length} yt-formatted-string elements`);
          for (const el of Array.from(statsElements)) {
            const text = el.textContent?.trim() || '';

            // Check for subscribers
            if (text.includes('subscriber') && !result.subscriberCount) {
              const match = text.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
              if (match) {
                result.subscriberCount = parseCount(match[1]);
                console.log(`[ENRICHMENT STRATEGY 1 - SUBS] Text: "${text}" | Match: "${match[1]}" | Parsed: ${result.subscriberCount}`);
              }
            }

            // Check for videos
            if (text.includes('video') && !result.videoCount) {
              const match = text.match(/([\d,.]+[KMB]?)\s*videos?/i);
              if (match) {
                result.videoCount = parseCount(match[1]);
                console.log(`[ENRICHMENT STRATEGY 1 - VIDEOS] Text: "${text}" | Match: "${match[1]}" | Parsed: ${result.videoCount}`);
              }
            }
          }

          // Strategy 2: Page text parsing (FALLBACK - kept for reliability)
          // Uncommented as fallback when Strategy 1 fails due to YouTube layout changes
          if (!result.subscriberCount || !result.videoCount) {
            console.log(`[ENRICHMENT STRATEGY 2] Starting page text parsing (missing subs: ${!result.subscriberCount}, missing videos: ${!result.videoCount})`);
            const pageText = document.body.innerText;
            const lines = pageText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

            console.log(`[ENRICHMENT STRATEGY 2] Parsing ${lines.length} lines from page text`);
            for (const line of lines) {
              if (!result.subscriberCount && line.includes('subscriber')) {
                const match = line.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
                if (match) {
                  result.subscriberCount = parseCount(match[1]);
                  console.log(`[ENRICHMENT STRATEGY 2 - SUBS] Line: "${line}" | Match: "${match[1]}" | Parsed: ${result.subscriberCount}`);
                }
              }
              if (!result.videoCount && line.includes('video')) {
                const match = line.match(/([\d,.]+[KMB]?)\s*videos?/i);
                if (match) {
                  result.videoCount = parseCount(match[1]);
                  console.log(`[ENRICHMENT STRATEGY 2 - VIDEOS] Line: "${line}" | Match: "${match[1]}" | Parsed: ${result.videoCount}`);
                }
              }
            }
          }

          // REMOVED: Strategy 3 - Table structures (0% usage in testing)
          // Strategy 1 had 100% success rate, making this fallback unnecessary
          // if (!result.subscriberCount || !result.videoCount) {
          //   const tables = document.querySelectorAll('table, .about-stats, #right-column');
          //   for (const table of Array.from(tables)) {
          //     const text = table.textContent || '';
          //     if (!result.subscriberCount && text.includes('subscriber')) {
          //       const match = text.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
          //       if (match) result.subscriberCount = parseCount(match[1]);
          //     }
          //     if (!result.videoCount && text.includes('video')) {
          //       const match = text.match(/([\d,.]+[KMB]?)\s*videos?/i);
          //       if (match) result.videoCount = parseCount(match[1]);
          //     }
          //   }
          // }

          console.log(
            `[DEBUG] Final extracted stats - Subs: ${result.subscriberCount || 'null'}, Videos: ${result.videoCount || 'null'}`
          );

          // ===== EXTRACT VIEW COUNT AND COUNTRY FROM "MORE INFO" SECTION =====
          // The stats appear in order: subscribers → videos → views (with chart icon)
          // We need to find the view count that appears RIGHT AFTER the video count
          // IMPORTANT: Skip the FIRST "views" after "videos" if it's too far (likely pinned video)

          // Strategy 1: Sequential parsing - find "videos" then next "views" is channel views
          const pageText = document.body.innerText;
          const lines = pageText
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

          let foundVideosLine = false;
          let videosLineIndex = -1;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Track when we find the videos count
            if (line.match(/^\d[\d,]*\s*videos?$/i)) {
              foundVideosLine = true;
              videosLineIndex = i;
              console.log(`[DEBUG] Found videos line at index ${i}`);
              continue;
            }

            // The NEXT line with "views" after "videos" is the channel view count
            // BUT: It must be within 3 lines to avoid pinned video views
            if (foundVideosLine && !result.viewCount && line.match(/^\d[\d,]*\s*views?$/i)) {
              const distance = i - videosLineIndex;
              // Only accept if it's close (within 3 lines)
              if (distance <= 3) {
                const viewMatch = line.match(/([\d,.]+)\s*views?/i);
                if (viewMatch) {
                  result.viewCount = parseCount(viewMatch[1]);
                  console.log(
                    `[DEBUG] Found channel views (${distance} lines after videos): ${viewMatch[1]} = ${result.viewCount}`
                  );
                  break; // Stop after finding it
                }
              } else {
                console.log(`[DEBUG] Skipped views at distance ${distance} (likely pinned video)`);
              }
            }

            // Look for country - appears before "Joined" line
            if (!result.country && i < lines.length - 1) {
              const nextLine = lines[i + 1];
              if (nextLine.match(/^Joined\s+/i)) {
                // Check if current line looks like a country name
                if (
                  line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/) &&
                  !line.match(/subscriber|video|view|http/i)
                ) {
                  result.country = line;
                  console.log(`[DEBUG] Found country before 'Joined': ${result.country}`);
                }
              }
            }
          }

          // Strategy 2: Fallback - look for view count with large numbers in table/tr elements
          if (!result.viewCount) {
            console.log(`[DEBUG] Strategy 1 failed, trying table elements`);
            const tables = document.querySelectorAll('table tr, #right-column');
            for (const table of Array.from(tables)) {
              const rows = table.querySelectorAll('td, yt-formatted-string');
              const rowTexts = Array.from(rows).map((r) => r.textContent?.trim() || '');

              // Find index of videos
              const videoIndex = rowTexts.findIndex((t) => t.match(/^\d[\d,]*\s*videos?$/i));
              if (videoIndex >= 0 && videoIndex < rowTexts.length - 1) {
                // Check next row for views (must be immediately next, within 2 positions)
                for (let offset = 1; offset <= 2; offset++) {
                  const nextText = rowTexts[videoIndex + offset];
                  if (nextText && nextText.match(/^\d[\d,]*\s*views?$/i)) {
                    const viewMatch = nextText.match(/([\d,.]+)\s*views?/i);
                    if (viewMatch) {
                      result.viewCount = parseCount(viewMatch[1]);
                      console.log(`[DEBUG] Found views in table after videos: ${viewMatch[1]}`);
                      break;
                    }
                  }
                }
                if (result.viewCount) break;
              }
            }
          }

          // Strategy 3: Look specifically in #right-column for sequential order
          if (!result.viewCount || !result.country) {
            const rightColumn = document.querySelector('#right-column');
            if (rightColumn) {
              console.log(`[DEBUG] Trying #right-column`);
              const allText = (rightColumn as HTMLElement).innerText;
              const rightLines = allText
                .split('\n')
                .map((l: string) => l.trim())
                .filter((l: string) => l.length > 0);

              let foundVids = false;
              let vidsIndex = -1;
              for (let i = 0; i < rightLines.length; i++) {
                const line = rightLines[i];

                // Track videos line
                if (line.match(/^\d[\d,]*\s*videos?$/i)) {
                  foundVids = true;
                  vidsIndex = i;
                  console.log(`[DEBUG] Found videos in right-column at line ${i}`);
                }

                // Next views after videos (must be within 3 lines)
                if (foundVids && !result.viewCount && line.match(/^\d[\d,]*\s*views?$/i)) {
                  const distance = i - vidsIndex;
                  if (distance <= 3) {
                    const viewMatch = line.match(/([\d,.]+)\s*views?/i);
                    if (viewMatch) {
                      result.viewCount = parseCount(viewMatch[1]);
                      console.log(`[DEBUG] Found views in right-column: ${viewMatch[1]}`);
                      break;
                    }
                  }
                }

                // Country before Joined
                if (!result.country && i < rightLines.length - 1) {
                  const nextLine = rightLines[i + 1];
                  if (
                    nextLine.match(/^Joined\s+/i) &&
                    line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/)
                  ) {
                    result.country = line;
                    console.log(`[DEBUG] Found country in right-column: ${result.country}`);
                  }
                }
              }
            }
          }

          console.log(
            `[DEBUG] Final extracted - Country: ${result.country || 'null'}, View count: ${result.viewCount || 'null'}`
          );

          // ===== EXTRACT FULL DESCRIPTION TEXT =====
          // Try multiple selectors to get the complete description
          let descriptionText = '';

          // Strategy 1: Look for yt-attributed-string elements (newer YouTube layout)
          const attributedStrings = document.querySelectorAll('yt-attributed-string');
          console.log(`[DEBUG] Found ${attributedStrings.length} yt-attributed-string elements`);
          if (attributedStrings.length > 0) {
            // The description is usually in the first or second yt-attributed-string
            for (const el of Array.from(attributedStrings)) {
              const text = el.textContent?.trim() || '';
              if (text.length > 50) {
                // Description is usually longer than 50 chars
                descriptionText = text;
                console.log(
                  `[DEBUG] Found description in yt-attributed-string (${descriptionText.length} chars)`
                );
                break;
              }
            }
          }

          // Strategy 2: #description-container
          if (!descriptionText) {
            const descContainer = document.querySelector('#description-container');
            if (descContainer) {
              descriptionText = descContainer.textContent?.trim() || '';
              console.log(
                `[DEBUG] Found description in #description-container (${descriptionText.length} chars)`
              );
            }
          }

          // Strategy 3: #description
          if (!descriptionText) {
            const descEl = document.querySelector('#description');
            if (descEl) {
              descriptionText = descEl.textContent?.trim() || '';
              console.log(
                `[DEBUG] Found description in #description (${descriptionText.length} chars)`
              );
            }
          }

          // Strategy 4: ytd-channel-about-metadata-renderer #description
          if (!descriptionText) {
            const descEl = document.querySelector(
              'ytd-channel-about-metadata-renderer #description'
            );
            if (descEl) {
              descriptionText = descEl.textContent?.trim() || '';
              console.log(
                `[DEBUG] Found description in ytd-channel-about-metadata-renderer (${descriptionText.length} chars)`
              );
            }
          }

          // Strategy 5: Look in the description section specifically
          if (!descriptionText) {
            const descSection = document.querySelector(
              '#description-container yt-formatted-string'
            );
            if (descSection) {
              descriptionText = descSection.textContent?.trim() || '';
              console.log(
                `[DEBUG] Found description in #description-container yt-formatted-string (${descriptionText.length} chars)`
              );
            }
          }

          // Strategy 6: Get all text from about page metadata section
          if (!descriptionText) {
            const metadataEl = document.querySelector('ytd-channel-about-metadata-renderer');
            if (metadataEl) {
              // Get the main content area, excluding stats
              const contentArea = metadataEl.querySelector('#content');
              if (contentArea) {
                descriptionText = contentArea.textContent?.trim() || '';
                console.log(
                  `[DEBUG] Found description in metadata content area (${descriptionText.length} chars)`
                );
              }
            }
          }

          // Strategy 7: Last resort - look for any large text block
          if (!descriptionText) {
            const allText = document.body.innerText;
            console.log(`[DEBUG] Page innerText length: ${allText.length} chars`);
            console.log(`[DEBUG] First 500 chars of page: ${allText.substring(0, 500)}`);
          }

          result.description = descriptionText;
          console.log(`[DEBUG] Final description text length: ${descriptionText.length} chars`);

          // ===== EXTRACT SOCIAL LINKS WITH IMPROVED SELECTORS =====
          const socialLinks: Record<string, string> = {};

          // Strategy 1: Look in the links section specifically
          const linksSectionSelectors = [
            '#link-list-container a[href]',
            'ytd-channel-about-metadata-renderer #link-list-container a',
            '#links-section a[href]',
            '#channel-header-links a[href]',
            'yt-formatted-string.ytd-channel-about-metadata-renderer a[href]',
          ];

          let linksFound: Element[] = [];
          for (const selector of linksSectionSelectors) {
            const foundLinks = document.querySelectorAll(selector);
            if (foundLinks.length > 0) {
              console.log(`[DEBUG] Found ${foundLinks.length} links using selector: ${selector}`);
              linksFound = Array.from(foundLinks);
              break;
            }
          }

          // Strategy 2: If no links found in specific sections, don't filter - use all links found
          // YouTube wraps external links through their redirect system, so we can't filter by domain
          if (linksFound.length === 0) {
            console.log(`[DEBUG] No links found in specific sections, using all found links`);
          }

          // Extract social media links
          console.log(`[DEBUG] Processing ${linksFound.length} links for social media extraction`);
          linksFound.forEach((link, idx) => {
            let href = (link as HTMLAnchorElement).href;
            console.log(`[DEBUG] Link ${idx + 1}: ${href}`);
            if (!href || !href.startsWith('http')) {
              console.log(`[DEBUG] Link ${idx + 1}: Skipped (not HTTP)`);
              return;
            }

            // Decode YouTube redirect URLs
            if (href.includes('youtube.com/redirect')) {
              try {
                const url = new URL(href);
                const actualUrl = url.searchParams.get('q');
                if (actualUrl) {
                  href = decodeURIComponent(actualUrl);
                  console.log(`[DEBUG] Link ${idx + 1}: Decoded redirect to: ${href}`);
                }
              } catch (_e) {
                console.log(`[DEBUG] Link ${idx + 1}: Failed to decode redirect`);
              }
            }

            if (href.includes('instagram.com/') && !socialLinks.instagram) {
              socialLinks.instagram = href;
              console.log(`[DEBUG] Found Instagram: ${href}`);
            }
            if (
              (href.includes('twitter.com/') || href.includes('x.com/')) &&
              !socialLinks.twitter
            ) {
              socialLinks.twitter = href;
              console.log(`[DEBUG] Found Twitter/X: ${href}`);
            }
            if (href.includes('facebook.com/') && !socialLinks.facebook) {
              socialLinks.facebook = href;
              console.log(`[DEBUG] Found Facebook: ${href}`);
            }
            if (href.includes('tiktok.com/') && !socialLinks.tiktok) {
              socialLinks.tiktok = href;
              console.log(`[DEBUG] Found TikTok: ${href}`);
            }
            if (
              (href.includes('discord.gg/') || href.includes('discord.com/')) &&
              !socialLinks.discord
            ) {
              socialLinks.discord = href;
              console.log(`[DEBUG] Found Discord: ${href}`);
            }
            if (href.includes('twitch.tv/') && !socialLinks.twitch) {
              socialLinks.twitch = href;
              console.log(`[DEBUG] Found Twitch: ${href}`);
            }
            if (href.includes('linkedin.com/') && !socialLinks.linkedin) {
              socialLinks.linkedin = href;
              console.log(`[DEBUG] Found LinkedIn: ${href}`);
            }

            // Extract website (first non-social media link found)
            if (
              !socialLinks.website &&
              href.startsWith('http') &&
              !href.includes('youtube.com') &&
              !href.includes('instagram.com') &&
              !href.includes('twitter.com') &&
              !href.includes('x.com') &&
              !href.includes('facebook.com') &&
              !href.includes('tiktok.com') &&
              !href.includes('discord.') &&
              !href.includes('twitch.tv') &&
              !href.includes('linkedin.com')
            ) {
              socialLinks.website = href;
              console.log(`[DEBUG] Found Website: ${href}`);
            }
          });

          console.log(`[DEBUG] Total social links extracted: ${Object.keys(socialLinks).length}`);
          if (Object.keys(socialLinks).length > 0) {
            console.log(`[DEBUG] Social links:`, JSON.stringify(socialLinks, null, 2));
          }

          result.socialLinks = socialLinks;

          return result;
        });

        // Log what we got from the page
        console.log(`[Stats ${i + 1}/${channels.length}] Raw stats from page:`, {
          subscriberCount: stats.subscriberCount,
          videoCount: stats.videoCount,
          viewCount: stats.viewCount,
          country: stats.country,
          descriptionLength: stats.description?.length || 0,
          socialLinksCount: Object.keys(stats.socialLinks || {}).length,
          socialLinks: stats.socialLinks,
        });

        // Update channel with stats
        if (stats.subscriberCount !== null && stats.subscriberCount !== undefined) {
          channel.subscriberCount = stats.subscriberCount;
        }
        if (stats.videoCount !== null && stats.videoCount !== undefined) {
          channel.videoCount = stats.videoCount;
        }
        if (stats.viewCount !== null && stats.viewCount !== undefined) {
          channel.viewCount = stats.viewCount;
        }
        if (stats.country) {
          channel.country = stats.country;
        }
        if (stats.description) {
          channel.description = stats.description;

          // Extract emails from the description text
          const emails = extractEmails(stats.description);
          console.log(
            `[Stats ${i + 1}/${channels.length}] Description text (first 200 chars): "${stats.description.substring(0, 200)}"`
          );
          if (emails.length > 0) {
            channel.emails = emails;
            console.log(
              `[Stats ${i + 1}/${channels.length}] Found ${emails.length} email(s) in description: ${emails.join(', ')}`
            );
          } else {
            console.log(`[Stats ${i + 1}/${channels.length}] No emails found in description`);
          }

          // Extract social links from the description text
          const socialLinksFromDescription = extractSocialLinks(stats.description);
          if (Object.keys(socialLinksFromDescription).length > 0) {
            console.log(
              `[Stats ${i + 1}/${channels.length}] Found ${Object.keys(socialLinksFromDescription).length} social link(s) in description:`,
              socialLinksFromDescription
            );
            // Merge with existing social links from the page (description takes priority)
            channel.socialLinks = { ...stats.socialLinks, ...socialLinksFromDescription };
          }
        } else {
          console.log(`[Stats ${i + 1}/${channels.length}] No description text extracted`);
        }

        // If no social links from description, use the ones from page links
        if (
          stats.socialLinks &&
          Object.keys(stats.socialLinks).length > 0 &&
          !channel.socialLinks
        ) {
          channel.socialLinks = stats.socialLinks;
        }

        // Check if enrichment was successful (got subscriber count)
        if (channel.subscriberCount !== undefined && channel.subscriberCount !== null) {
          enrichmentSuccess = true;
          console.log(
            `[Stats ${i + 1}/${channels.length}] ✓ ${channel.name}: ${channel.subscriberCount.toLocaleString()} subs, ${channel.videoCount || 'Unknown'} videos, ${channel.viewCount || 'Unknown'} views, country: ${channel.country || 'Unknown'}, ${Object.keys(stats.socialLinks || {}).length} social links, ${channel.emails?.length || 0} emails`
          );
        } else {
          console.log(
            `[Stats ${i + 1}/${channels.length}] ⚠ Failed to get subscriber count for ${channel.name}`
          );
          retryCount++;
          if (retryCount > maxRetries) {
            console.log(
              `[Stats ${i + 1}/${channels.length}] ✗ Max retries reached for ${channel.name}, skipping`
            );
          }
        }
      } catch (error) {
        console.error(
          `[Stats ${i + 1}/${channels.length}] Error fetching stats for ${channel.name}:`,
          error
        );
        retryCount++;
        if (retryCount > maxRetries) {
          console.log(
            `[Stats ${i + 1}/${channels.length}] ✗ Max retries reached for ${channel.name}, skipping`
          );
        } else {
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, delay * 2));
        }
      }
      } // End while loop

      // Small delay between requests to avoid rate limiting
      if (i < channels.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    console.log(`[Stats] Enrichment complete. Processed ${channels.length} channels.`);
  }
}

// Singleton instance
let scraperInstance: YouTubeScraper | null = null;

export async function getScraperInstance(): Promise<YouTubeScraper> {
  if (!scraperInstance) {
    scraperInstance = new YouTubeScraper();
    await scraperInstance.initialize();
  }
  return scraperInstance;
}

export async function closeScraperInstance(): Promise<void> {
  if (scraperInstance) {
    await scraperInstance.close();
    scraperInstance = null;
  }
}
