import { json, type RequestHandler } from '@sveltejs/kit';
import { getScraperInstance } from '$lib/server/youtube/scraper-puppeteer';
import { ChannelFilter } from '$lib/server/youtube/filters';
import { supabase, tables } from '$lib/server/db/supabase';
import type { FilterConfig, ChannelInsert } from '$lib/types/models';
import { EnrichmentService } from '$lib/server/queue/enrichment-service';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { keyword, filters, limit = 50 } = body;

		// Validate input
		if (!keyword || typeof keyword !== 'string') {
			return json({ error: 'Keyword is required' }, { status: 400 });
		}

		console.log(`[API] Searching YouTube for: ${keyword}`);

		// Detect if running in serverless (Vercel)
		const isServerless = !!process.env.VERCEL;

		// Use faster settings for serverless to avoid timeout
		const searchLimit = isServerless ? Math.min(limit, 20) : limit; // Max 20 on serverless
		const enableEnrichment = !isServerless; // Disable enrichment on serverless for speed

		console.log(`[API] Environment: ${isServerless ? 'Serverless' : 'Local'}`);
		console.log(`[API] Limit: ${searchLimit}, Enrichment: ${enableEnrichment}`);

		// Get scraper instance
		console.log('[API] Getting scraper instance...');
		const scraper = await getScraperInstance();

		// Search for channels (enrichment disabled on serverless for performance)
		console.log(`[API] Calling searchChannels with keyword="${keyword}", limit=${searchLimit}, enrichData=${enableEnrichment}`);
		const rawChannels = await scraper.searchChannels(keyword, searchLimit, enableEnrichment);

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
					console.log(`[API] Saved ${channelsToInsert.length} channels to database`);

					// Queue enrichment jobs for all channels (background processing)
					if (isServerless) {
						console.log(`[API] Queueing ${channelsWithScores.length} channels for background enrichment...`);
						const channelIds = channelsWithScores.map((c) => c.channelId);
						await EnrichmentService.queueChannels(channelIds, 1);
						console.log('[API] Enrichment jobs queued successfully');
					}
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
			},
			// Indicate if enrichment is queued
			enrichmentQueued: isServerless
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
