import type { Browser, Page } from 'puppeteer-core';
import { batchGetChannelDetails } from './channel-details';

export interface ChannelSearchResult {
	channelId: string;
	name: string;
	url: string;
	description?: string;
	subscriberCount?: number;
	viewCount?: number;
	videoCount?: number;
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

		// Detect if we're running in production (Vercel/serverless) or local
		const isProduction = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
		const proxyUrl = process.env.PROXY_URL;

		// Prepare common args
		const commonArgs = [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-blink-features=AutomationControlled',
			'--disable-dev-shm-usage'
		];

		// Add proxy if configured
		if (proxyUrl) {
			commonArgs.push(`--proxy-server=${proxyUrl}`);
			console.log(`Using proxy: ${proxyUrl}`);
		}

		if (isProduction) {
			// Use @sparticuz/chromium for serverless environments
			const chromium = (await import('@sparticuz/chromium')).default;
			const puppeteer = await import('puppeteer-core');

			// Configure chromium for serverless
			const executablePath = await chromium.executablePath();

			// Combine chromium's recommended args with our custom args
			const serverlessArgs = [
				...chromium.args,
				'--no-sandbox',
				'--disable-setuid-sandbox',
				'--disable-dev-shm-usage',
				'--disable-blink-features=AutomationControlled',
				'--single-process',
				'--no-zygote'
			];

			// Add proxy if configured
			if (proxyUrl) {
				serverlessArgs.push(`--proxy-server=${proxyUrl}`);
				console.log(`Using proxy: ${proxyUrl}`);
			}

			console.log('Launching Chromium in serverless mode...');
			console.log('Executable path:', executablePath);

			this.browser = await puppeteer.launch({
				args: serverlessArgs,
				defaultViewport: chromium.defaultViewport,
				executablePath,
				headless: chromium.headless,
			});

			console.log('YouTube scraper initialized (serverless mode)');
		} else {
			// Use regular puppeteer for local development
			const puppeteer = await import('puppeteer');

			this.browser = await puppeteer.launch({
				headless: true,
				args: commonArgs
			});

			console.log('YouTube scraper initialized (local mode)');
		}
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
		enrichData: boolean = true
	): Promise<ChannelSearchResult[]> {
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
			const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`;
			console.log('Searching YouTube:', searchUrl);

			await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });

			// Wait for content
			console.log('Waiting for channel results...');
			await page.waitForSelector('ytd-channel-renderer', { timeout: 10000 });

			// IMPORTANT: Scroll slowly to trigger lazy-loading of subscriber counts
			console.log('Triggering lazy-load by scrolling...');
			await page.evaluate(() => {
				window.scrollBy(0, 500);
			});
			await new Promise(resolve => setTimeout(resolve, 1500));

			await page.evaluate(() => {
				window.scrollBy(0, 500);
			});
			await new Promise(resolve => setTimeout(resolve, 1500));

			// Scroll back to top to ensure all elements are in view
			await page.evaluate(() => {
				window.scrollTo(0, 0);
			});
			await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for content to fully load

			// Extract channels using the working approach from test-scraper.js
			let extractedChannels = await this.extractChannels(page);
			console.log(`Extracted ${extractedChannels.length} channels`);
			channels.push(...extractedChannels);

			// Scroll for more results if needed
			let scrollAttempts = 0;
			const maxScrolls = Math.ceil(limit / 10);

			while (channels.length < limit && scrollAttempts < maxScrolls) {
				await page.evaluate(() => window.scrollBy(0, window.innerHeight));
				await new Promise(resolve => setTimeout(resolve, 2000));

				const newChannels = await this.extractChannels(page);
				const uniqueNewChannels = newChannels.filter(
					(nc) => !channels.some((c) => c.channelId === nc.channelId)
				);

				if (uniqueNewChannels.length === 0) {
					console.log('No more new channels, stopping scroll');
					break;
				}

				channels.push(...uniqueNewChannels);
				scrollAttempts++;
			}

			console.log(`Total found: ${channels.length} channels for keyword: ${keyword}`);

			// DEBUG: Log enrichment parameters
			console.log(`DEBUG: enrichData = ${enrichData}, channels.length = ${channels.length}`);

			// Enrich data by visiting channel pages (if enabled and we have channels)
			if (enrichData && channels.length > 0) {
				console.log('Enriching channel data by visiting channel pages...');

				try {
					// Fetch detailed info for first 10 channels
					const channelsToEnrich = channels.slice(0, Math.min(10, channels.length));
					const detailsMap = await batchGetChannelDetails(
						page,
						channelsToEnrich.map((c) => ({ url: c.url, channelId: c.channelId })),
						10
					);

					// Merge the detailed data
					for (const channel of channels) {
						const details = detailsMap.get(channel.channelId);
						if (details) {
							if (details.subscriberCount) channel.subscriberCount = details.subscriberCount;
							if (details.videoCount) channel.videoCount = details.videoCount;
							if (details.viewCount) channel.viewCount = details.viewCount;
							if (details.description && !channel.description) channel.description = details.description;
						if (details.emails && details.emails.length > 0) channel.emails = details.emails;
						if (details.socialLinks) channel.socialLinks = details.socialLinks;
						}
					}

					console.log(`Enriched ${detailsMap.size} channels with detailed data`);
				} catch (enrichError) {
					console.error('Error enriching channel data:', enrichError);
					// Continue even if enrichment fails
				}
			}

			return channels.slice(0, limit);
		} catch (error) {
			console.error('Error searching channels:', error);
			throw new Error(`Failed to search channels: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
				samples: []
			};

			// Sample first 2 renderers
			for (let i = 0; i < Math.min(2, renderers.length); i++) {
				const el = renderers[i];
				const sample: any = {
					index: i,
					html: el.innerHTML.substring(0, 500)
				};

				// Try different selectors
				const linkSelectors = [
					'a[href*="/@"]',
					'a[href*="/channel/"]',
					'a#main-link',
					'a'
				];

				sample.linkTests = linkSelectors.map(sel => ({
					selector: sel,
					found: el.querySelector(sel) ? 'YES' : 'NO',
					href: (el.querySelector(sel) as any)?.href || 'N/A'
				}));

				const nameSelectors = [
					'#channel-title',
					'#text',
					'.yt-formatted-string'
				];

				sample.nameTests = nameSelectors.map(sel => ({
					selector: sel,
					found: el.querySelector(sel) ? 'YES' : 'NO',
					text: el.querySelector(sel)?.textContent?.trim().substring(0, 50) || 'N/A'
				}));

				// Test subscriber selectors - get ALL text to see what's available
				const subsContainer = el.querySelector('#subscribers');
				sample.subscriberDebug = {
					containerFound: subsContainer ? 'YES' : 'NO',
					containerFullText: subsContainer?.textContent?.trim() || 'N/A',
					containerHTML: subsContainer?.innerHTML?.substring(0, 300) || 'N/A'
				};

				// NEW: Get ALL text content from the entire channel card to find subscriber count
				const allText = el.textContent || '';
				const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.length < 100);

				// Look for text that looks like subscriber counts
				const potentialSubCounts = lines.filter(line => {
					const lower = line.toLowerCase();
					return (lower.includes('subscriber') ||
					        lower.match(/\d+\.?\d*\s*[kmb]/i) ||
					        lower.match(/\d{1,3}(,\d{3})*/) ||
					        lower.includes('subs'));
				});

				sample.fullTextDebug = {
					allLines: lines.slice(0, 50),  // First 50 lines of text
					potentialSubCounts: potentialSubCounts,
					totalLines: lines.length
				};

				const subSelectors = [
					'#subscribers',
					'#subscriber-count',
					'#subscribers #text',
					'#subscribers yt-formatted-string',
					'yt-formatted-string#subscribers'
				];

				sample.subTests = subSelectors.map(sel => ({
					selector: sel,
					found: el.querySelector(sel) ? 'YES' : 'NO',
					text: el.querySelector(sel)?.textContent?.trim() || 'N/A'
				}));

				// Test thumbnail
				sample.thumbnailDebug = {
					imgFound: el.querySelector('img') ? 'YES' : 'NO',
					imgSrc: (el.querySelector('img') as any)?.src || 'N/A',
					allImgCount: el.querySelectorAll('img').length
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
				const channelIdMatch = url.match(/\/@([^/?]+)|\/channel\/([^/?]+)|\/user\/([^/?]+)|\/c\/([^/?]+)/);
				if (!channelIdMatch) {
					return; // Skip if can't extract ID
				}

				// Extract the ID from whichever group matched
				const channelId = channelIdMatch[1] || channelIdMatch[2] || channelIdMatch[3] || channelIdMatch[4];
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
						const parts = rawText.split('\n').map(p => p.trim()).filter(p => p.length > 0);
						name = parts[0] || '';
					}
				}

				if (!name) {
					return; // Skip if no name found
				}

				// Find subscriber count - try multiple approaches
				let subscriberCount: number | undefined = undefined;
				let subText = '';

				// Try approach 1: #subscribers yt-formatted-string
				let subEl = el.querySelector('#subscribers yt-formatted-string') as HTMLElement;
				if (subEl) {
					subText = subEl.textContent?.trim() || '';
					subscriberCount = parseSubCount(subText);
				}

				// Try approach 2: #subscribers #text
				if (subscriberCount === undefined) {
					subEl = el.querySelector('#subscribers #text') as HTMLElement;
					if (subEl) {
						subText = subEl.textContent?.trim() || '';
						subscriberCount = parseSubCount(subText);
					}
				}

				// Try approach 3: just #subscribers, then parse the text
				if (subscriberCount === undefined) {
					subEl = el.querySelector('#subscribers') as HTMLElement;
					if (subEl) {
						subText = subEl.textContent?.trim() || '';
						// The text might be like "190K subscribers" - extract just the number part
						const cleanText = subText.split('subscribers')[0].trim();
						subscriberCount = parseSubCount(cleanText);
					}
				}

				// Try approach 4: #subscriber-count
				if (subscriberCount === undefined) {
					subEl = el.querySelector('#subscriber-count') as HTMLElement;
					if (subEl) {
						subText = subEl.textContent?.trim() || '';
						subscriberCount = parseSubCount(subText);
					}
				}

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
					videoCount: undefined
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
					'': 1
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
