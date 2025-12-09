import { json, type RequestHandler } from '@sveltejs/kit';
import { searchChannelsWithPool } from '$lib/server/youtube/scraper-service';
import { ChannelFilter } from '$lib/server/youtube/filters';
import { supabase, tables } from '$lib/server/db/supabase';
import type { FilterConfig, ChannelInsert } from '$lib/types/models';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { keyword, filters, limit = 50, sessionKey } = body;

		// Validate input
		if (!keyword || typeof keyword !== 'string') {
			return json({ error: 'Keyword is required' }, { status: 400 });
		}

		if (!sessionKey || typeof sessionKey !== 'string') {
			return json({ error: 'Session key is required for multi-tab support' }, { status: 400 });
		}

		console.log(`[API] Searching YouTube for: ${keyword} (session: ${sessionKey})`);

		const enableEnrichment = true; // Always enable enrichment (needed for filtering)
		console.log(`[API] Limit: ${limit}, Enrichment: ${enableEnrichment}`);

		// Prepare filters for the scraper
		const scraperFilters = {
			minSubscribers: filters?.minSubscribers,
			maxSubscribers: filters?.maxSubscribers,
			country: filters?.country,
			excludeMusicChannels: filters?.excludeMusicChannels ?? false,
			excludeBrands: filters?.excludeBrands ?? false
		};

		// Search for channels using browser pool (supports multi-tab)
		console.log(
			`[API] Calling searchChannelsWithPool with keyword="${keyword}", limit=${limit}, enrichData=${enableEnrichment}, sessionKey=${sessionKey}`
		);
		const rawChannels = await searchChannelsWithPool(
			keyword,
			limit,
			enableEnrichment,
			scraperFilters,
			sessionKey
		);

		// Apply remaining filters that couldn't be applied during scraping (like language)
		const filter = new ChannelFilter();
		const filterConfig: FilterConfig = {
			minSubscribers: filters?.minSubscribers,
			maxSubscribers: filters?.maxSubscribers,
			country: filters?.country,
			excludeMusicChannels: filters?.excludeMusicChannels ?? false,
			excludeBrands: filters?.excludeBrands ?? false,
			language: filters?.language,
			uploadFrequency: filters?.uploadFrequency,
			engagementThreshold: filters?.engagementThreshold
		};

		// Only apply language filter here (other filters already applied)
		let filteredChannels = rawChannels;
		if (filters?.language) {
			filteredChannels = filter.applyFilters(rawChannels, {
				...filterConfig,
				minSubscribers: undefined, // Already filtered
				maxSubscribers: undefined, // Already filtered
				country: undefined, // Already filtered
				excludeMusicChannels: false, // Already filtered
				excludeBrands: false // Already filtered
			});
		}

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
					view_count: channel.viewCount || null,
					video_count: channel.videoCount || null,
					country: channel.country || null,
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
					console.log(`[API] Saved ${channelsToInsert.length} channels to database`);
				}
			} catch (dbError) {
				console.error('Database error:', dbError);
				// Continue even if DB save fails
			}
		}

		// Return ALL channels immediately (no pagination needed since we already filtered to limit)
		console.log(`[API] Returning ${channelsWithScores.length} channels to client`);

		return json({
			success: true,
			channels: channelsWithScores, // Return all channels
			stats: {
				total: filteredChannels.length, // Total matching channels (already filtered)
				filtered: filteredChannels.length, // Same as total since filtering is done during scraping
				keyword,
				displayed: channelsWithScores.length,
				remaining: 0 // No remaining since we return all
			},
			pagination: {
				currentPage: 1,
				pageSize: channelsWithScores.length,
				totalChannels: channelsWithScores.length,
				hasMore: false // No more pages needed
			}
		});
	} catch (error) {
		console.error('[API] Search error:', error);
		console.error('[API] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
		return json(
			{
				error: 'Failed to search channels',
				message: error instanceof Error ? error.message : 'Unknown error',
				stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : null) : null
			},
			{ status: 500 }
		);
	}
};
