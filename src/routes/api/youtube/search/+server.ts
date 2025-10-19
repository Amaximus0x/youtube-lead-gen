import { json, type RequestHandler } from '@sveltejs/kit';
import { getScraperInstance } from '$lib/server/youtube/scraper-puppeteer';
import { ChannelFilter } from '$lib/server/youtube/filters';
import { supabase, tables } from '$lib/server/db/supabase';
import type { FilterConfig, ChannelInsert } from '$lib/types/models';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { keyword, filters, limit = 50 } = body;

		// Validate input
		if (!keyword || typeof keyword !== 'string') {
			return json({ error: 'Keyword is required' }, { status: 400 });
		}

		console.log(`Searching YouTube for: ${keyword}`);

		// Get scraper instance
		const scraper = await getScraperInstance();

		// Search for channels (with enrichment enabled)
		console.log(`Calling searchChannels with keyword="${keyword}", limit=${limit}, enrichData=true`);
		const rawChannels = await scraper.searchChannels(keyword, limit, true);

		// Apply filters
		const filter = new ChannelFilter();
		const filterConfig: FilterConfig = {
			minSubscribers: filters?.minSubscribers,
			maxSubscribers: filters?.maxSubscribers,
			excludeMusicChannels: filters?.excludeMusicChannels ?? false,
			excludeBrands: filters?.excludeBrands ?? false,
			language: filters?.language,
			uploadFrequency: filters?.uploadFrequency,
			engagementThreshold: filters?.engagementThreshold
		};

		const filteredChannels = filter.applyFilters(rawChannels, filterConfig);

		// Calculate relevance scores
		const channelsWithScores = filteredChannels.map((channel) => ({
			...channel,
			relevanceScore: filter.calculateRelevanceScore(channel, keyword)
		}));

		// Sort by relevance score
		channelsWithScores.sort((a, b) => b.relevanceScore - a.relevanceScore);

		// Save channels to database if Supabase is available
		if (supabase) {
			try {
				const channelsToInsert = channelsWithScores.map((channel) => ({
					channel_id: channel.channelId,
					name: channel.name,
					url: channel.url,
					description: channel.description || null,
					subscriber_count: channel.subscriberCount || null,
					video_count: channel.videoCount || null,
					search_keyword: keyword,
					relevance_score: channel.relevanceScore,
					status: 'pending' as const,
					email_verified: false
				}));

				// Upsert channels (insert or update if exists)
				const { error: dbError } = await supabase
					.from('channels')
					// @ts-ignore - Supabase types inference issue with upsert
					.upsert(channelsToInsert, { onConflict: 'channel_id', ignoreDuplicates: false });

				if (dbError) {
					console.error('Error saving channels to database:', dbError);
					// Don't fail the request if DB save fails
				} else {
					console.log(`Saved ${channelsToInsert.length} channels to database`);
				}
			} catch (dbError) {
				console.error('Database error:', dbError);
				// Continue even if DB save fails
			}
		}

		return json({
			success: true,
			channels: channelsWithScores,
			stats: {
				total: rawChannels.length,
				filtered: filteredChannels.length,
				keyword
			}
		});
	} catch (error) {
		console.error('Search error:', error);
		return json(
			{
				error: 'Failed to search channels',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
