/**
 * Multi-Source Email and Contact Extraction
 * Extracts emails and contact info from multiple legitimate sources:
 * - YouTube video descriptions
 * - Instagram bio
 * - LinkedIn company pages
 * - Linked websites
 */

import type { Page } from 'puppeteer';
import { extractEmails, extractSocialLinks, type ContactInfo } from './contact-extractor';

export interface MultiSourceResult {
	emails: string[];
	emailSources: Record<string, string>; // email -> source mapping
	socialLinks: ContactInfo['socialLinks'];
	subscriberCount?: number;
	videoCount?: number;
	viewCount?: number;
	country?: string;
	description?: string;
}

/**
 * Extract subscriber count and video count from /about page with multiple strategies
 */
export async function extractChannelStats(page: Page): Promise<{
	subscriberCount?: number;
	videoCount?: number;
	viewCount?: number;
	country?: string;
	description?: string;
}> {
	return await page.evaluate(() => {
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
		console.log(`[MULTI-SOURCE STRATEGY 1] Found ${statsElements.length} yt-formatted-string elements`);
		for (const el of Array.from(statsElements)) {
			const text = el.textContent?.trim() || '';

			// Check for subscribers
			if (text.includes('subscriber') && !result.subscriberCount) {
				const match = text.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
				if (match) {
					result.subscriberCount = parseCount(match[1]);
					console.log(`[MULTI-SOURCE STRATEGY 1 - SUBS] Text: "${text}" | Match: "${match[1]}" | Parsed: ${result.subscriberCount}`);
				}
			}

			// Check for videos
			if (text.includes('video') && !result.videoCount) {
				const match = text.match(/([\d,.]+[KMB]?)\s*videos?/i);
				if (match) {
					result.videoCount = parseCount(match[1]);
					console.log(`[MULTI-SOURCE STRATEGY 1 - VIDEOS] Text: "${text}" | Match: "${match[1]}" | Parsed: ${result.videoCount}`);
				}
			}
		}

		// Strategy 2: Page text parsing (FALLBACK - kept for reliability)
		if (!result.subscriberCount || !result.videoCount) {
			console.log(`[MULTI-SOURCE STRATEGY 2] Starting page text parsing (missing subs: ${!result.subscriberCount}, missing videos: ${!result.videoCount})`);
			const pageText = document.body.innerText;
			const lines = pageText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

			console.log(`[MULTI-SOURCE STRATEGY 2] Parsing ${lines.length} lines from page text`);
			for (const line of lines) {
				if (!result.subscriberCount && line.includes('subscriber')) {
					const match = line.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
					if (match) {
						result.subscriberCount = parseCount(match[1]);
						console.log(`[MULTI-SOURCE STRATEGY 2 - SUBS] Line: "${line}" | Match: "${match[1]}" | Parsed: ${result.subscriberCount}`);
					}
				}
				if (!result.videoCount && line.includes('video')) {
					const match = line.match(/([\d,.]+[KMB]?)\s*videos?/i);
					if (match) {
						result.videoCount = parseCount(match[1]);
						console.log(`[MULTI-SOURCE STRATEGY 2 - VIDEOS] Line: "${line}" | Match: "${match[1]}" | Parsed: ${result.videoCount}`);
					}
				}
			}
		}

		// REMOVED: Strategy 3 - Meta tags (0% usage in testing)
		// Strategy 1 had 100% success rate, making this fallback unnecessary
		// if (!result.subscriberCount) {
		//   const metaElements = document.querySelectorAll('meta');
		//   for (const meta of Array.from(metaElements)) {
		//     const content = meta.getAttribute('content') || '';
		//     if (content.includes('subscriber')) {
		//       const match = content.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
		//       if (match) result.subscriberCount = parseCount(match[1]);
		//       break;
		//     }
		//   }
		// }

		// Extract description
		const descriptionEl = document.querySelector('#description');
		if (descriptionEl) {
			result.description = descriptionEl.textContent?.trim() || '';
		}

		// ===== EXTRACT VIEW COUNT AND COUNTRY FROM "MORE INFO" SECTION =====
		// The stats appear in order: subscribers → videos → views (with chart icon)
		// We need to find the view count that appears RIGHT AFTER the video count

		// Strategy 1: Sequential parsing - find "videos" then next "views" is channel views
		const pageText = document.body.innerText;
		const lines = pageText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

		let foundVideosLine = false;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Track when we find the videos count
			if (line.match(/^\d[\d,]*\s*videos?$/i)) {
				foundVideosLine = true;
				continue;
			}

			// The NEXT line with "views" after "videos" is the channel view count
			if (foundVideosLine && !result.viewCount && line.match(/^\d[\d,]*\s*views?$/i)) {
				const viewMatch = line.match(/([\d,.]+)\s*views?/i);
				if (viewMatch) {
					result.viewCount = parseCount(viewMatch[1]);
					break; // Stop after finding it
				}
			}

			// Look for country - appears before "Joined" line
			if (!result.country && i < lines.length - 1) {
				const nextLine = lines[i + 1];
				if (nextLine.match(/^Joined\s+/i)) {
					// Check if current line looks like a country name
					if (line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/) && !line.match(/subscriber|video|view|http/i)) {
						result.country = line;
					}
				}
			}
		}

		// Strategy 2: Fallback - look for view count with large numbers in table/tr elements
		if (!result.viewCount) {
			const tables = document.querySelectorAll('table tr, #right-column');
			for (const table of Array.from(tables)) {
				const rows = table.querySelectorAll('td, yt-formatted-string');
				const rowTexts = Array.from(rows).map(r => r.textContent?.trim() || '');

				// Find index of videos
				const videoIndex = rowTexts.findIndex(t => t.match(/^\d[\d,]*\s*videos?$/i));
				if (videoIndex >= 0 && videoIndex < rowTexts.length - 1) {
					// Check next row for views
					const nextText = rowTexts[videoIndex + 1];
					if (nextText.match(/^\d[\d,]*\s*views?$/i)) {
						const viewMatch = nextText.match(/([\d,.]+)\s*views?/i);
						if (viewMatch) {
							result.viewCount = parseCount(viewMatch[1]);
							break;
						}
					}
				}
			}
		}

		// Strategy 3: Look specifically in #right-column for sequential order
		if (!result.viewCount || !result.country) {
			const rightColumn = document.querySelector('#right-column');
			if (rightColumn) {
				const allText = rightColumn.innerText;
				const rightLines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

				let foundVids = false;
				for (let i = 0; i < rightLines.length; i++) {
					const line = rightLines[i];

					// Track videos line
					if (line.match(/^\d[\d,]*\s*videos?$/i)) {
						foundVids = true;
					}

					// Next views after videos
					if (foundVids && !result.viewCount && line.match(/^\d[\d,]*\s*views?$/i)) {
						const viewMatch = line.match(/([\d,.]+)\s*views?/i);
						if (viewMatch) {
							result.viewCount = parseCount(viewMatch[1]);
							break;
						}
					}

					// Country before Joined
					if (!result.country && i < rightLines.length - 1) {
						const nextLine = rightLines[i + 1];
						if (nextLine.match(/^Joined\s+/i) && line.match(/^[A-Z][a-z]+(\s+[A-Z][a-z]+)*$/)) {
							result.country = line;
						}
					}
				}
			}
		}

		return result;
	});
}

/**
 * Extract emails from video descriptions (top N videos)
 */
export async function extractFromVideoDescriptions(
	page: Page,
	channelUrl: string,
	maxVideos: number = 3
): Promise<{ emails: string[]; source: string }> {
	const emails = new Set<string>();

	try {
		console.log(`[MultiSource] Extracting from video descriptions for ${channelUrl}`);

		// Navigate to videos tab
		const videosUrl = channelUrl.endsWith('/') ? `${channelUrl}videos` : `${channelUrl}/videos`;
		await page.goto(videosUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Get video URLs (top N videos)
		const videoLinks = await page.evaluate((max) => {
			const links = Array.from(document.querySelectorAll('a#video-title-link'));
			return links
				.slice(0, max)
				.map((link) => (link as HTMLAnchorElement).href)
				.filter((href) => href && href.includes('/watch?v='));
		}, maxVideos);

		console.log(`[MultiSource] Found ${videoLinks.length} video links to check`);

		// Visit each video and extract description
		for (let i = 0; i < videoLinks.length; i++) {
			try {
				await page.goto(videoLinks[i], { waitUntil: 'domcontentloaded', timeout: 15000 });
				await new Promise((resolve) => setTimeout(resolve, 1500));

				// Try to click "Show more" button to expand description
				try {
					const expandButton = await page.$('#expand');
					if (expandButton) {
						await expandButton.click();
						await new Promise((resolve) => setTimeout(resolve, 500));
					}
				} catch (e) {
					// Expand button not found or already expanded
				}

				// Extract description text
				const description = await page.evaluate(() => {
					const descEl = document.querySelector(
						'#description-inline-expander, #description, ytd-text-inline-expander'
					);
					return descEl?.textContent || '';
				});

				// Extract emails from description
				const foundEmails = extractEmails(description);
				foundEmails.forEach((email) => emails.add(email));

				console.log(
					`[MultiSource] Video ${i + 1}/${videoLinks.length}: Found ${foundEmails.length} emails`
				);
			} catch (error) {
				console.log(`[MultiSource] Error processing video ${i + 1}:`, error);
			}
		}
	} catch (error) {
		console.error('[MultiSource] Error extracting from video descriptions:', error);
	}

	return {
		emails: Array.from(emails),
		source: 'youtube_videos'
	};
}

/**
 * Extract email from Instagram bio
 */
export async function extractFromInstagram(
	page: Page,
	instagramUrl: string
): Promise<{ emails: string[]; source: string }> {
	const emails = new Set<string>();

	try {
		console.log(`[MultiSource] Extracting from Instagram: ${instagramUrl}`);

		await page.goto(instagramUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Extract bio and page text
		const bioData = await page.evaluate(() => {
			// Try to find bio in common selectors
			const bioSelectors = [
				'header section div',
				'header h1 + div',
				'.-vDIg span',
				'span[dir="auto"]'
			];

			let bioText = '';
			for (const selector of bioSelectors) {
				const elements = document.querySelectorAll(selector);
				for (const el of Array.from(elements)) {
					const text = el.textContent || '';
					if (text.includes('@') || text.includes('contact')) {
						bioText += text + '\n';
					}
				}
			}

			// Also check meta tags
			const metaDescription = document.querySelector('meta[name="description"]');
			if (metaDescription) {
				bioText += metaDescription.getAttribute('content') || '';
			}

			return bioText;
		});

		// Extract emails from bio
		const foundEmails = extractEmails(bioData);
		foundEmails.forEach((email) => emails.add(email));

		console.log(`[MultiSource] Instagram: Found ${foundEmails.length} emails`);
	} catch (error) {
		console.error('[MultiSource] Error extracting from Instagram:', error);
	}

	return {
		emails: Array.from(emails),
		source: 'instagram'
	};
}

/**
 * Extract email from LinkedIn company page
 */
export async function extractFromLinkedIn(
	page: Page,
	linkedinUrl: string
): Promise<{ emails: string[]; source: string }> {
	const emails = new Set<string>();

	try {
		console.log(`[MultiSource] Extracting from LinkedIn: ${linkedinUrl}`);

		await page.goto(linkedinUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Extract company info and page text
		const linkedinData = await page.evaluate(() => {
			// Check for email in page text
			const pageText = document.body.innerText;

			// Also check meta tags
			let metaText = '';
			const metaDescription = document.querySelector('meta[name="description"]');
			if (metaDescription) {
				metaText = metaDescription.getAttribute('content') || '';
			}

			return pageText + '\n' + metaText;
		});

		// Extract emails
		const foundEmails = extractEmails(linkedinData);
		foundEmails.forEach((email) => emails.add(email));

		console.log(`[MultiSource] LinkedIn: Found ${foundEmails.length} emails`);
	} catch (error) {
		console.error('[MultiSource] Error extracting from LinkedIn:', error);
	}

	return {
		emails: Array.from(emails),
		source: 'linkedin'
	};
}

/**
 * Extract email from website contact page
 */
export async function extractFromWebsite(
	page: Page,
	websiteUrl: string
): Promise<{ emails: string[]; source: string }> {
	const emails = new Set<string>();

	try {
		console.log(`[MultiSource] Extracting from website: ${websiteUrl}`);

		// First, try the main URL
		await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
		await new Promise((resolve) => setTimeout(resolve, 1500));

		// Extract emails from main page
		let pageText = await page.evaluate(() => document.body.innerText);
		let foundEmails = extractEmails(pageText);
		foundEmails.forEach((email) => emails.add(email));

		// Look for contact page links
		const contactPageUrls = await page.evaluate((baseUrl) => {
			const links = Array.from(document.querySelectorAll('a[href]'));
			const contactKeywords = ['contact', 'about', 'team', 'reach', 'email'];

			return links
				.map((link) => (link as HTMLAnchorElement).href)
				.filter((href) => {
					const lowerHref = href.toLowerCase();
					return contactKeywords.some((keyword) => lowerHref.includes(keyword));
				})
				.filter((href) => {
					try {
						const url = new URL(href);
						const base = new URL(baseUrl);
						return url.hostname === base.hostname;
					} catch {
						return false;
					}
				})
				.slice(0, 3); // Check first 3 contact-related pages
		}, websiteUrl);

		console.log(`[MultiSource] Found ${contactPageUrls.length} potential contact pages`);

		// Visit contact pages
		for (const contactUrl of contactPageUrls) {
			try {
				await page.goto(contactUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
				await new Promise((resolve) => setTimeout(resolve, 1000));

				pageText = await page.evaluate(() => document.body.innerText);
				foundEmails = extractEmails(pageText);
				foundEmails.forEach((email) => emails.add(email));
			} catch (error) {
				console.log(`[MultiSource] Error visiting contact page ${contactUrl}`);
			}
		}

		console.log(`[MultiSource] Website: Found ${emails.size} total emails`);
	} catch (error) {
		console.error('[MultiSource] Error extracting from website:', error);
	}

	return {
		emails: Array.from(emails),
		source: 'website'
	};
}

/**
 * Main orchestrator: Extract from all available sources
 */
export async function extractFromAllSources(
	page: Page,
	channelUrl: string,
	socialLinks: ContactInfo['socialLinks']
): Promise<MultiSourceResult> {
	const allEmails = new Map<string, string>(); // email -> source
	const result: MultiSourceResult = {
		emails: [],
		emailSources: {},
		socialLinks
	};

	// 1. Extract from /about page (already done in enrichment service, but get stats)
	try {
		const aboutUrl = channelUrl.endsWith('/') ? `${channelUrl}about` : `${channelUrl}/about`;
		await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const stats = await extractChannelStats(page);
		result.subscriberCount = stats.subscriberCount;
		result.videoCount = stats.videoCount;
		result.viewCount = stats.viewCount;
		result.country = stats.country;
		result.description = stats.description;

		// Also extract emails from about page
		const aboutPageText = await page.evaluate(() => document.body.innerText);
		const aboutEmails = extractEmails(aboutPageText);
		aboutEmails.forEach((email) => {
			if (!allEmails.has(email)) {
				allEmails.set(email, 'youtube_about');
			}
		});
	} catch (error) {
		console.error('[MultiSource] Error extracting from about page:', error);
	}

	// 2. Extract from video descriptions
	try {
		const videoResult = await extractFromVideoDescriptions(page, channelUrl, 3);
		videoResult.emails.forEach((email) => {
			if (!allEmails.has(email)) {
				allEmails.set(email, videoResult.source);
			}
		});
	} catch (error) {
		console.error('[MultiSource] Error in video extraction:', error);
	}

	// 3. Extract from Instagram if available
	if (socialLinks.instagram) {
		try {
			const igResult = await extractFromInstagram(page, socialLinks.instagram);
			igResult.emails.forEach((email) => {
				if (!allEmails.has(email)) {
					allEmails.set(email, igResult.source);
				}
			});
		} catch (error) {
			console.error('[MultiSource] Error in Instagram extraction:', error);
		}
	}

	// 4. Extract from LinkedIn if available
	if (socialLinks.linkedin) {
		try {
			const liResult = await extractFromLinkedIn(page, socialLinks.linkedin);
			liResult.emails.forEach((email) => {
				if (!allEmails.has(email)) {
					allEmails.set(email, liResult.source);
				}
			});
		} catch (error) {
			console.error('[MultiSource] Error in LinkedIn extraction:', error);
		}
	}

	// 5. Extract from website if available
	if (socialLinks.website) {
		try {
			const websiteResult = await extractFromWebsite(page, socialLinks.website);
			websiteResult.emails.forEach((email) => {
				if (!allEmails.has(email)) {
					allEmails.set(email, websiteResult.source);
				}
			});
		} catch (error) {
			console.error('[MultiSource] Error in website extraction:', error);
		}
	}

	// Compile results
	result.emails = Array.from(allEmails.keys());
	result.emailSources = Object.fromEntries(allEmails);

	console.log(`[MultiSource] Total emails found: ${result.emails.length}`);
	console.log(`[MultiSource] Sources: ${JSON.stringify(result.emailSources, null, 2)}`);

	return result;
}
