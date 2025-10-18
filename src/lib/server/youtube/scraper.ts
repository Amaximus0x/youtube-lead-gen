import { chromium, type Browser, type Page } from 'playwright';

export interface ChannelSearchResult {
	channelId: string;
	name: string;
	url: string;
	description?: string;
	subscriberCount?: number;
	viewCount?: number;
	videoCount?: number;
	thumbnailUrl?: string;
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

		this.browser = await chromium.launch({
			headless: true,
			args: [
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-blink-features=AutomationControlled',
				'--disable-dev-shm-usage'
			]
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

	async searchChannels(keyword: string, limit: number = 50): Promise<ChannelSearchResult[]> {
		if (!this.browser) {
			await this.initialize();
		}

		const page = await this.browser!.newPage();
		const channels: ChannelSearchResult[] = [];

		try {
			// Set user agent to avoid detection
			await page.setExtraHTTPHeaders({
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept-Language': 'en-US,en;q=0.9'
			});

			// Build search URL with channel filter
			// sp=EgIQAg%253D%253D is the filter for channels only
			const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`;
			console.log('Searching YouTube:', searchUrl);

			await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

			// Wait longer for results to load and try multiple selectors
			console.log('Waiting for channel results to load...');
			const selectorFound = await Promise.race([
				page.waitForSelector('ytd-channel-renderer', { timeout: 10000 }).then(() => 'ytd-channel-renderer'),
				page.waitForSelector('ytd-item-section-renderer', { timeout: 10000 }).then(() => 'ytd-item-section-renderer'),
				new Promise((resolve) => setTimeout(() => resolve('timeout'), 10000))
			]);

			console.log('Selector found:', selectorFound);

			// Random delay to appear more human-like
			await this.randomDelay(2000, 3000);

			// Take a screenshot for debugging (only in development)
			if (process.env.NODE_ENV !== 'production') {
				await page.screenshot({ path: 'youtube-search-debug.png', fullPage: false });
				console.log('Screenshot saved to youtube-search-debug.png');
			}

			// Extract initial results
			let extractedChannels = await this.extractChannelsFromPage(page);
			console.log(`Extracted ${extractedChannels.length} channels from initial page load`);
			channels.push(...extractedChannels);

			// Scroll to load more results if needed
			let scrollAttempts = 0;
			const maxScrolls = Math.ceil(limit / 10); // Typically 10-15 results per scroll

			while (channels.length < limit && scrollAttempts < maxScrolls) {
				await page.evaluate(() => window.scrollBy(0, window.innerHeight));
				await this.randomDelay(1500, 2500);

				const newChannels = await this.extractChannelsFromPage(page);
				const uniqueNewChannels = newChannels.filter(
					(nc) => !channels.some((c) => c.channelId === nc.channelId)
				);

				channels.push(...uniqueNewChannels);
				scrollAttempts++;

				// Break if no new channels found
				if (uniqueNewChannels.length === 0) {
					console.log('No more new channels found, stopping scroll');
					break;
				}
			}

			console.log(`Found ${channels.length} channels for keyword: ${keyword}`);
			return channels.slice(0, limit);
		} catch (error) {
			console.error('Error searching channels:', error);
			throw new Error(`Failed to search channels: ${error instanceof Error ? error.message : 'Unknown error'}`);
		} finally {
			await page.close();
		}
	}

	private async extractChannelsFromPage(page: Page): Promise<ChannelSearchResult[]> {
		// First, log what we can see on the page
		const debugInfo = await page.evaluate(() => {
			const channelRenderers = document.querySelectorAll('ytd-channel-renderer');
			const allYtdElements = document.querySelectorAll('[id*="channel"]');
			return {
				channelRenderers: channelRenderers.length,
				allChannelElements: allYtdElements.length,
				bodyText: document.body.innerText.substring(0, 500)
			};
		});

		console.log('Debug info:', JSON.stringify(debugInfo, null, 2));

		return await page.evaluate(() => {
			const channelElements = document.querySelectorAll('ytd-channel-renderer');
			const channels: any[] = [];

			console.log('Found channel elements:', channelElements.length);

			channelElements.forEach((el, index) => {
				try {
					// Extract channel URL and ID - try multiple selectors
					const linkElement = (el.querySelector('a[href*="/channel/"]') ||
						el.querySelector('a[href*="/@"]') ||
						el.querySelector('#main-link')) as HTMLAnchorElement;

					if (!linkElement) {
						console.log(`Channel ${index}: No link found`);
						return;
					}

					const url = linkElement.href;
					const channelIdMatch = url.match(/\/(channel|c|@|user)\/([^/?]+)/);
					if (!channelIdMatch) {
						console.log(`Channel ${index}: No ID match in URL ${url}`);
						return;
					}

					// Extract channel name - try multiple selectors
					const nameElement = (el.querySelector('#channel-title #text') ||
						el.querySelector('#channel-title') ||
						el.querySelector('#text')) as HTMLElement;
					const name = nameElement?.textContent?.trim() || '';

					if (!name) {
						console.log(`Channel ${index}: No name found`);
						return;
					}

					// Extract subscriber count
					const subElement = (el.querySelector('#subscribers #text') ||
						el.querySelector('#subscriber-count')) as HTMLElement;
					const subText = subElement?.textContent?.trim() || '';
					const subscriberCount = parseSubscriberCount(subText);

					// Extract description
					const descElement = (el.querySelector('#description-text') ||
						el.querySelector('#description')) as HTMLElement;
					const description = descElement?.textContent?.trim() || '';

					// Extract video count
					const videoCountElement = el.querySelector('#video-count') as HTMLElement;
					const videoCountText = videoCountElement?.textContent?.trim() || '';
					const videoCount = parseVideoCount(videoCountText);

					// Extract thumbnail
					const thumbnailElement = el.querySelector('img') as HTMLImageElement;
					const thumbnailUrl = thumbnailElement?.src || '';

					channels.push({
						channelId: channelIdMatch[2],
						name,
						url,
						description,
						subscriberCount,
						videoCount,
						thumbnailUrl
					});
				} catch (error) {
					console.error(`Error extracting channel ${index}:`, error);
				}
			});

			// Helper function to parse subscriber count
			function parseSubscriberCount(text: string): number | undefined {
				if (!text) return undefined;

				const match = text.match(/([\d.]+)\s*([KMB]?)/i);
				if (!match) return undefined;

				const num = parseFloat(match[1]);
				const suffix = match[2].toUpperCase();

				switch (suffix) {
					case 'K':
						return Math.floor(num * 1000);
					case 'M':
						return Math.floor(num * 1000000);
					case 'B':
						return Math.floor(num * 1000000000);
					default:
						return Math.floor(num);
				}
			}

			// Helper function to parse video count
			function parseVideoCount(text: string): number | undefined {
				if (!text) return undefined;
				const match = text.match(/(\d+)/);
				return match ? parseInt(match[1]) : undefined;
			}

			return channels;
		});
	}

	private async randomDelay(min: number, max: number): Promise<void> {
		const delay = Math.floor(Math.random() * (max - min + 1)) + min;
		await new Promise((resolve) => setTimeout(resolve, delay));
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
