import type { Page } from 'playwright';
import { extractContactInfo } from './contact-extractor';

export interface ChannelDetails {
	subscriberCount?: number;
	videoCount?: number;
	viewCount?: number;
	description?: string;
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

/**
 * Visit a channel page and extract detailed information
 */
export async function getChannelDetails(page: Page, channelUrl: string): Promise<ChannelDetails> {
	try {
		console.log(`Fetching details for: ${channelUrl}`);

		await page.goto(channelUrl, { waitUntil: 'networkidle', timeout: 15000 });
		await page.waitForTimeout(2000); // Wait for dynamic content

		const details = await page.evaluate(() => {
			const result: any = {};

			// Try to find subscriber count in channel header using structured data
			// Look for specific elements that contain subscriber information

			// Method 1: Try to find subscriber count in the metadata span elements
			const subscriberEl = document.querySelector('#subscriber-count');
			if (subscriberEl) {
				const text = subscriberEl.textContent?.trim() || '';
				// Try to parse the number from text (handles K, M, B, etc.)
				const match = text.match(/([\d,.]+)\s*([KMB]?)/i);
				if (match) {
					const numStr = match[1].replace(/,/g, '');
					const num = parseFloat(numStr);
					const suffix = match[2]?.toUpperCase() || '';
					const multipliers: Record<string, number> = { K: 1000, M: 1000000, B: 1000000000, '': 1 };
					result.subscriberCount = Math.floor(num * (multipliers[suffix] || 1));
				}
			}

			// Method 2: Search full page text for subscriber pattern (works in any language)
			if (!result.subscriberCount) {
				const pageText = document.body.innerText;
				// Split into lines and look for lines containing numbers with K/M/B suffixes
				const lines = pageText.split('\n').map(l => l.trim());

				// Look for subscriber count - usually appears near the start of the page
				// Format examples: "1.9 M subscribers", "1.9 লা জন", "190K", etc.
				for (let i = 0; i < Math.min(100, lines.length); i++) {
					const line = lines[i];
					// Match number + optional decimal + space/text + K/M/B pattern
					const match = line.match(/([\d,.]+)\s*[^\d\s]*\s*([KMB])/i);
					if (match) {
						const numStr = match[1].replace(/,/g, '');
						const num = parseFloat(numStr);
						if (!isNaN(num) && num > 0 && num < 10000) { // Sanity check: 0-10000M subscribers
							const suffix = match[2].toUpperCase();
							const multipliers: Record<string, number> = { K: 1000, M: 1000000, B: 1000000000 };
							result.subscriberCount = Math.floor(num * multipliers[suffix]);
							break; // Found it, stop looking
						}
					}
				}
			}

			// Method 3: Look for video count
			if (!result.videoCount) {
				const pageText = document.body.innerText;
				const lines = pageText.split('\n').map(l => l.trim());

				// Look for video count - format examples: "688 videos", "688টি ভিডিও", etc.
				for (const line of lines.slice(0, 100)) {
					// Match a standalone number (likely video count) - usually 2-5 digits
					const match = line.match(/^([\d,.]+)টি\s/); // Bengali format "688টি ভিডিও"
					if (!match) {
						continue;
					}
					const numStr = match[1].replace(/,/g, '');
					const num = parseInt(numStr);
					if (!isNaN(num) && num > 0 && num < 100000) { // Sanity check: 0-100k videos
						result.videoCount = num;
						break;
					}
				}
			}

			// Method 4: Try to get description from About tab metadata
			const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement;
			if (metaDesc) {
				result.description = metaDesc.content;
			}

			// Collect full page text and HTML for contact extraction
			result.fullPageText = document.body.innerText;
			result.pageHTML = document.body.innerHTML.substring(0, 50000); // Limit HTML size

			return result;
		});

		// Extract contact information from description and page content
		const contactInfo = extractContactInfo(
			`${details.description || ''}\n${details.fullPageText || ''}`,
			details.pageHTML
		);

		// Clean up temporary fields and add contact info
		const finalDetails: ChannelDetails = {
			subscriberCount: details.subscriberCount,
			videoCount: details.videoCount,
			description: details.description,
			emails: contactInfo.emails.length > 0 ? contactInfo.emails : undefined,
			socialLinks:
				Object.keys(contactInfo.socialLinks).length > 0 ? contactInfo.socialLinks : undefined
		};

		console.log(`Got details:`, finalDetails);
		return finalDetails;
	} catch (error) {
		console.error(`Error fetching channel details for ${channelUrl}:`, error);
		return {};
	}
}

/**
 * Batch fetch channel details for multiple channels
 */
export async function batchGetChannelDetails(
	page: Page,
	channels: Array<{ url: string; channelId: string }>,
	maxChannels: number = 10
): Promise<Map<string, ChannelDetails>> {
	const results = new Map<string, ChannelDetails>();
	const channelsToFetch = channels.slice(0, maxChannels);

	console.log(`Fetching detailed info for ${channelsToFetch.length} channels...`);

	for (const channel of channelsToFetch) {
		try {
			const details = await getChannelDetails(page, channel.url);
			results.set(channel.channelId, details);

			// Random delay to avoid rate limiting
			await page.waitForTimeout(Math.random() * 2000 + 1000); // 1-3 seconds
		} catch (error) {
			console.error(`Failed to fetch details for ${channel.channelId}:`, error);
		}
	}

	return results;
}
