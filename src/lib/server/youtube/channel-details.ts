import type { Page } from 'puppeteer-core';
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

		// First, visit the /videos tab to get video count
		const videosUrl = channelUrl.endsWith('/') ? `${channelUrl}videos` : `${channelUrl}/videos`;
		await page.goto(videosUrl, { waitUntil: 'networkidle0', timeout: 15000 });
		await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for dynamic content

		const details = await page.evaluate(() => {
			const result: any = {};

			// Helper function to parse number with K/M/B suffix
			function parseCount(text: string): number | null {
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

			// Get full page text for parsing
			const pageText = document.body.innerText;
			const lines = pageText
				.split('\n')
				.map((l) => l.trim())
				.filter((l) => l.length > 0);

			// Method 1: Parse the channel header format
			// Format: "@GameTechReviews • 18.2K subscribers • 1.7K videos"
			// This appears in the first few lines of the page
			for (let i = 0; i < Math.min(20, lines.length); i++) {
				const line = lines[i];

				// Look for line containing both "subscribers" and "videos" with bullet points
				if (line.includes('subscriber') && line.includes('video')) {
					// Extract subscribers: "18.2K subscribers"
					const subMatch = line.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
					if (subMatch && !result.subscriberCount) {
						result.subscriberCount = parseCount(subMatch[1]);
					}

					// Extract videos: "1.7K videos"
					const vidMatch = line.match(/([\d,.]+[KMB]?)\s*videos?/i);
					if (vidMatch && !result.videoCount) {
						result.videoCount = parseCount(vidMatch[1]);
					}

					// If we found both, we're done
					if (result.subscriberCount && result.videoCount) {
						break;
					}
				}
			}

			// Method 2: Try to find subscriber count in the metadata span elements
			if (!result.subscriberCount) {
				const subscriberEl = document.querySelector('#subscriber-count');
				if (subscriberEl) {
					const text = subscriberEl.textContent?.trim() || '';
					result.subscriberCount = parseCount(text);
				}
			}

			// Method 3: Search for subscriber pattern separately
			if (!result.subscriberCount) {
				for (let i = 0; i < Math.min(100, lines.length); i++) {
					const line = lines[i];
					// Match "18.2K subscribers" or "1.9 M subscribers"
					const match = line.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
					if (match) {
						const count = parseCount(match[1]);
						if (count && count > 0 && count < 10000000000) {
							result.subscriberCount = count;
							break;
						}
					}
				}
			}

			// Method 4: Search for video count separately
			if (!result.videoCount) {
				for (let i = 0; i < Math.min(150, lines.length); i++) {
					const line = lines[i];
					// Match "1.7K videos" or "688 videos"
					const match = line.match(/([\d,.]+[KMB]?)\s*videos?/i);
					if (match) {
						const count = parseCount(match[1]);
						if (count && count > 0 && count < 100000) {
							result.videoCount = count;
							break;
						}
					}
				}
			}

			// Method 5: Try to get description from About tab metadata
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
			await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000)); // 1-3 seconds
		} catch (error) {
			console.error(`Failed to fetch details for ${channel.channelId}:`, error);
		}
	}

	return results;
}
