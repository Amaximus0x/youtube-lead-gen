import { json, type RequestHandler } from '@sveltejs/kit';
import { EnrichmentService } from '$lib/server/queue/enrichment-service';

/**
 * POST /api/youtube/enrichment-status
 * Get enrichment status for multiple channels
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { channelIds } = await request.json();

		if (!Array.isArray(channelIds) || channelIds.length === 0) {
			return json({ error: 'channelIds array is required' }, { status: 400 });
		}

		const statusMap = await EnrichmentService.getEnrichmentStatus(channelIds);

		return json({
			success: true,
			statuses: statusMap
		});
	} catch (error) {
		console.error('[EnrichmentStatus] Error:', error);
		return json(
			{
				success: false,
				error: 'Failed to get enrichment status',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
