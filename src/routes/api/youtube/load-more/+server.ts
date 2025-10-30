import { json, type RequestHandler } from '@sveltejs/kit';
import { supabase } from '$lib/server/db/supabase';
import { getScraperInstance } from '$lib/server/youtube/scraper-puppeteer';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { keyword, page = 2, pageSize = 15 } = body;

		if (!keyword || typeof keyword !== 'string') {
			return json({ error: 'Keyword is required' }, { status: 400 });
		}

		console.log(`[LoadMore] Loading page ${page} for keyword: ${keyword}`);

		// Fetch channels from database that were already scraped
		if (!supabase) {
			console.error('[LoadMore] Supabase client is null!');
			console.error('[LoadMore] SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
			console.error(
				'[LoadMore] SUPABASE_SERVICE_ROLE_KEY:',
				process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET'
			);
			return json(
				{
					error: 'Database not available. Please restart the dev server to load environment variables.'
				},
				{ status: 500 }
			);
		}

		const offset = (page - 1) * pageSize;

		const { data: channels, error: dbError } = await supabase
			.from('channels')
			.select('*')
			.eq('search_keyword', keyword)
			.order('relevance_score', { ascending: false })
			.range(offset, offset + pageSize - 1);

		if (dbError) {
			console.error('[LoadMore] Database error:', dbError);
			return json({ error: 'Failed to load channels' }, { status: 500 });
		}

		if (!channels || channels.length === 0) {
			return json({
				success: true,
				channels: [],
				pagination: {
					currentPage: page,
					pageSize,
					hasMore: false
				}
			});
		}

		// Check if channels need stats enrichment
		const channelsNeedingEnrichment = channels.filter(
			(ch) => !ch.subscriber_count || !ch.video_count
		);

		if (channelsNeedingEnrichment.length > 0) {
			console.log(
				`[LoadMore] ${channelsNeedingEnrichment.length} channels need stats enrichment`
			);

			try {
				const scraper = await getScraperInstance();
				const browser = (scraper as any).browser;

				if (browser) {
					const page = await browser.newPage();

					try {
						// Enrich stats for channels that need it
						for (const channel of channelsNeedingEnrichment) {
							try {
								const aboutUrl = channel.url.endsWith('/')
									? `${channel.url}about`
									: `${channel.url}/about`;

								await page.goto(aboutUrl, {
									waitUntil: 'domcontentloaded',
									timeout: 10000
								});
								await new Promise((resolve) => setTimeout(resolve, 1000));

								const stats = await page.evaluate(() => {
									const result: any = {};

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

									const statsElements = document.querySelectorAll('yt-formatted-string');
									console.log(`[LOAD-MORE EXTRACTION] Found ${statsElements.length} yt-formatted-string elements`);
									for (const el of Array.from(statsElements)) {
										const text = el.textContent?.trim() || '';

										if (text.includes('subscriber') && !result.subscriberCount) {
											const match = text.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
											if (match) {
												result.subscriberCount = parseCount(match[1]);
												console.log(`[LOAD-MORE - SUBS] Text: "${text}" | Match: "${match[1]}" | Parsed: ${result.subscriberCount}`);
											}
										}

										if (text.includes('video') && !result.videoCount) {
											const match = text.match(/([\d,.]+[KMB]?)\s*videos?/i);
											if (match) {
												result.videoCount = parseCount(match[1]);
												console.log(`[LOAD-MORE - VIDEOS] Text: "${text}" | Match: "${match[1]}" | Parsed: ${result.videoCount}`);
											}
										}
									}

									console.log(`[LOAD-MORE EXTRACTION] Final stats - Subs: ${result.subscriberCount || 'null'}, Videos: ${result.videoCount || 'null'}`);
									return result;
								});

								// Update channel in database
								if (stats.subscriberCount || stats.videoCount) {
									const updateData: any = {};
									if (stats.subscriberCount)
										updateData.subscriber_count = stats.subscriberCount;
									if (stats.videoCount) updateData.video_count = stats.videoCount;

									await supabase
										.from('channels')
										.update(updateData)
										.eq('channel_id', channel.channel_id);

									// Update in-memory object
									if (stats.subscriberCount) channel.subscriber_count = stats.subscriberCount;
									if (stats.videoCount) channel.video_count = stats.videoCount;
								}
							} catch (error) {
								console.error(`[LoadMore] Error enriching ${channel.name}:`, error);
							}
						}
					} finally {
						await page.close();
					}
				}
			} catch (error) {
				console.error('[LoadMore] Error during enrichment:', error);
			}
		}

		// Check if there are more channels
		const { count } = await supabase
			.from('channels')
			.select('*', { count: 'exact', head: true })
			.eq('search_keyword', keyword);

		const totalChannels = count || 0;
		const hasMore = offset + pageSize < totalChannels;

		// Transform to match frontend format
		const formattedChannels = channels.map((ch) => ({
			channelId: ch.channel_id,
			name: ch.name,
			url: ch.url,
			description: ch.description,
			subscriberCount: ch.subscriber_count,
			videoCount: ch.video_count,
			relevanceScore: ch.relevance_score,
			emails: ch.emails,
			email_sources: ch.email_sources,
			socialLinks: ch.social_links,
			enrichmentStatus: ch.enrichment_status,
			enrichedAt: ch.enriched_at
		}));

		return json({
			success: true,
			channels: formattedChannels,
			pagination: {
				currentPage: page,
				pageSize,
				totalChannels,
				hasMore
			}
		});
	} catch (error) {
		console.error('[LoadMore] Error:', error);
		return json(
			{
				error: 'Failed to load more channels',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
