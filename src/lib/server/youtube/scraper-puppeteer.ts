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

		// Detect if running in serverless
		const isServerless = !!process.env.VERCEL;
		const waitTime = isServerless ? 500 : 1500; // Faster on serverless

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

			await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

			// Wait for content
			console.log('Waiting for channel results...');
			await page.waitForSelector('ytd-channel-renderer', { timeout: 10000 });

			// IMPORTANT: Scroll slowly to trigger lazy-loading of subscriber counts
			console.log('Triggering lazy-load by scrolling...');
			await page.evaluate(() => {
				window.scrollBy(0, 500);
			});
			await new Promise(resolve => setTimeout(resolve, waitTime));

			await page.evaluate(() => {
				window.scrollBy(0, 500);
			});
			await new Promise(resolve => setTimeout(resolve, waitTime));

			// Scroll back to top to ensure all elements are in view
			await page.evaluate(() => {
				window.scrollTo(0, 0);
			});
			await new Promise(resolve => setTimeout(resolve, waitTime)); // Wait for content to fully load

			// Extract channels using the working approach from test-scraper.js
			let extractedChannels = await this.extractChannels(page);
			console.log(`Extracted ${extractedChannels.length} channels`);
			channels.push(...extractedChannels);

			// Scroll for more results if needed
			let scrollAttempts = 0;
			const maxScrolls = isServerless ? 3 : 15; // More scrolls to get 50+ channels
			let noNewChannelsCount = 0; // Track consecutive failures
			let previousHeight = 0;

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
				await new Promise(resolve => setTimeout(resolve, isServerless ? 1500 : 3000));

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
					console.log(`No new channels found (attempt ${noNewChannelsCount}/5) - Height increased: ${heightIncreased}`);

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
					console.log(`Found ${uniqueNewChannels.length} new channels (total: ${channels.length}/${limit})`);
				}

				previousHeight = newHeight;
				scrollAttempts++;
			}

			console.log(`Scroll attempts: ${scrollAttempts}, Max allowed: ${maxScrolls}`);

			console.log(`Total found: ${channels.length} channels for keyword: ${keyword}`);

			// For better UX: Only enrich first batch immediately (10-15 channels)
			// Rest will be enriched on-demand or in background
			const initialBatchSize = 15;
			const channelsToEnrichNow = channels.slice(0, Math.min(initialBatchSize, channels.length));

			if (channelsToEnrichNow.length > 0) {
				console.log(`Getting accurate stats for first ${channelsToEnrichNow.length} channels...`);
				try {
					await this.enrichChannelStats(page, channelsToEnrichNow);
				} catch (enrichError) {
					console.error('Error enriching channel stats:', enrichError);
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

	/**
	 * Enrich channels with accurate subscriber and video counts from /about pages
	 * This is a lightweight version that ONLY gets stats, not emails or social links
	 */
	private async enrichChannelStats(
		page: Page,
		channels: ChannelSearchResult[]
	): Promise<void> {
		const isServerless = !!process.env.VERCEL;
		const delay = isServerless ? 500 : 1000; // Faster on serverless

		for (let i = 0; i < channels.length; i++) {
			const channel = channels[i];

			try {
				console.log(
					`[Stats ${i + 1}/${channels.length}] Fetching stats for: ${channel.name}`
				);

				// Visit /about page
				const aboutUrl = channel.url.endsWith('/')
					? `${channel.url}about`
					: `${channel.url}/about`;

				// Listen to browser console logs
				page.on('console', (msg) => {
					const text = msg.text();
					if (text.includes('[DEBUG]')) {
						console.log(`  ${text}`);
					}
				});

				await page.goto(aboutUrl, {
					waitUntil: 'networkidle0',
					timeout: 15000
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
								'': 1
							};
							return Math.floor(num * (multipliers[suffix] || 1));
						}
						return null;
					}

					// Strategy 1: Try to find stats in structured elements
					const statsElements = document.querySelectorAll('yt-formatted-string');
					for (const el of Array.from(statsElements)) {
						const text = el.textContent?.trim() || '';

						// Check for subscribers
						if (text.includes('subscriber') && !result.subscriberCount) {
							const match = text.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
							if (match) {
								result.subscriberCount = parseCount(match[1]);
							}
						}

						// Check for videos
						if (text.includes('video') && !result.videoCount) {
							const match = text.match(/([\d,.]+[KMB]?)\s*videos?/i);
							if (match) {
								result.videoCount = parseCount(match[1]);
							}
						}
					}

					// Strategy 2: Parse from page text if not found
					if (!result.subscriberCount || !result.videoCount) {
						const pageText = document.body.innerText;
						const lines = pageText
							.split('\n')
							.map((l) => l.trim())
							.filter((l) => l.length > 0);

						for (const line of lines) {
							// Extract subscriber count
							if (!result.subscriberCount && line.includes('subscriber')) {
								const match = line.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
								if (match) {
									result.subscriberCount = parseCount(match[1]);
								}
							}

							// Extract video count
							if (!result.videoCount && line.includes('video')) {
								const match = line.match(/([\d,.]+[KMB]?)\s*videos?/i);
								if (match) {
									result.videoCount = parseCount(match[1]);
								}
							}
						}
					}

					// Strategy 3: Check table-like structures (Stats section)
					if (!result.subscriberCount || !result.videoCount) {
						const tables = document.querySelectorAll('table, .about-stats, #right-column');
						console.log(`[DEBUG] Found ${tables.length} table/stats elements to check`);

						for (const table of Array.from(tables)) {
							const text = table.textContent || '';

							if (!result.subscriberCount && text.includes('subscriber')) {
								const match = text.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
								if (match) {
									result.subscriberCount = parseCount(match[1]);
									console.log(`[DEBUG] Found subscribers in table: ${match[1]}`);
								}
							}

							if (!result.videoCount && text.includes('video')) {
								const match = text.match(/([\d,.]+[KMB]?)\s*videos?/i);
								if (match) {
									result.videoCount = parseCount(match[1]);
									console.log(`[DEBUG] Found videos in table: ${match[1]}`);
								}
							}
						}
					}

					console.log(`[DEBUG] Final extracted stats - Subs: ${result.subscriberCount || 'null'}, Videos: ${result.videoCount || 'null'}`)

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
							if (text.length > 50) { // Description is usually longer than 50 chars
								descriptionText = text;
								console.log(`[DEBUG] Found description in yt-attributed-string (${descriptionText.length} chars)`);
								break;
							}
						}
					}

					// Strategy 2: #description-container
					if (!descriptionText) {
						const descContainer = document.querySelector('#description-container');
						if (descContainer) {
							descriptionText = descContainer.textContent?.trim() || '';
							console.log(`[DEBUG] Found description in #description-container (${descriptionText.length} chars)`);
						}
					}

					// Strategy 3: #description
					if (!descriptionText) {
						const descEl = document.querySelector('#description');
						if (descEl) {
							descriptionText = descEl.textContent?.trim() || '';
							console.log(`[DEBUG] Found description in #description (${descriptionText.length} chars)`);
						}
					}

					// Strategy 4: ytd-channel-about-metadata-renderer #description
					if (!descriptionText) {
						const descEl = document.querySelector('ytd-channel-about-metadata-renderer #description');
						if (descEl) {
							descriptionText = descEl.textContent?.trim() || '';
							console.log(`[DEBUG] Found description in ytd-channel-about-metadata-renderer (${descriptionText.length} chars)`);
						}
					}

					// Strategy 5: Look in the description section specifically
					if (!descriptionText) {
						const descSection = document.querySelector('#description-container yt-formatted-string');
						if (descSection) {
							descriptionText = descSection.textContent?.trim() || '';
							console.log(`[DEBUG] Found description in #description-container yt-formatted-string (${descriptionText.length} chars)`);
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
								console.log(`[DEBUG] Found description in metadata content area (${descriptionText.length} chars)`);
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
						'yt-formatted-string.ytd-channel-about-metadata-renderer a[href]'
					];

					let linksFound = [];
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
							} catch (e) {
								console.log(`[DEBUG] Link ${idx + 1}: Failed to decode redirect`);
							}
						}

						if (href.includes('instagram.com/') && !socialLinks.instagram) {
							socialLinks.instagram = href;
							console.log(`[DEBUG] Found Instagram: ${href}`);
						}
						if ((href.includes('twitter.com/') || href.includes('x.com/')) && !socialLinks.twitter) {
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
						if ((href.includes('discord.gg/') || href.includes('discord.com/')) && !socialLinks.discord) {
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
					descriptionLength: stats.description?.length || 0,
					socialLinksCount: Object.keys(stats.socialLinks || {}).length,
					socialLinks: stats.socialLinks
				});

				// Update channel with stats
				if (stats.subscriberCount !== null && stats.subscriberCount !== undefined) {
					channel.subscriberCount = stats.subscriberCount;
				}
				if (stats.videoCount !== null && stats.videoCount !== undefined) {
					channel.videoCount = stats.videoCount;
				}
				if (stats.description) {
					channel.description = stats.description;

					// Extract emails from the description text
					const emails = extractEmails(stats.description);
					console.log(`[Stats ${i + 1}/${channels.length}] Description text (first 200 chars): "${stats.description.substring(0, 200)}"`);
					if (emails.length > 0) {
						channel.emails = emails;
						console.log(`[Stats ${i + 1}/${channels.length}] Found ${emails.length} email(s) in description: ${emails.join(', ')}`);
					} else {
						console.log(`[Stats ${i + 1}/${channels.length}] No emails found in description`);
					}

					// Extract social links from the description text
					const socialLinksFromDescription = extractSocialLinks(stats.description);
					if (Object.keys(socialLinksFromDescription).length > 0) {
						console.log(`[Stats ${i + 1}/${channels.length}] Found ${Object.keys(socialLinksFromDescription).length} social link(s) in description:`, socialLinksFromDescription);
						// Merge with existing social links from the page (description takes priority)
						channel.socialLinks = { ...stats.socialLinks, ...socialLinksFromDescription };
					}
				} else {
					console.log(`[Stats ${i + 1}/${channels.length}] No description text extracted`);
				}

				// If no social links from description, use the ones from page links
				if (stats.socialLinks && Object.keys(stats.socialLinks).length > 0 && !channel.socialLinks) {
					channel.socialLinks = stats.socialLinks;
				}

				console.log(
					`[Stats ${i + 1}/${channels.length}] ${channel.name}: ${channel.subscriberCount || 'Unknown'} subs, ${channel.videoCount || 'Unknown'} videos, ${Object.keys(stats.socialLinks || {}).length} social links, ${channel.emails?.length || 0} emails`
				);
			} catch (error) {
				console.error(
					`[Stats ${i + 1}/${channels.length}] Error fetching stats for ${channel.name}:`,
					error
				);
				// Continue with next channel
			}

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
