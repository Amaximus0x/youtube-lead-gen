import { json, type RequestHandler } from '@sveltejs/kit';
import { EnrichmentService } from '$lib/server/queue/enrichment-service';

/**
 * POST /api/youtube/enrich
 * Process enrichment queue (processes up to 5 jobs)
 * This endpoint should be called by Vercel Cron or manually triggered
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const { maxJobs = 5 } = await request.json().catch(() => ({ maxJobs: 5 }));

		console.log(`[Enrich] Starting enrichment processing (max ${maxJobs} jobs)...`);

		const processed = await EnrichmentService.processQueue(maxJobs);

		console.log(`[Enrich] Processed ${processed} jobs`);

		return json({
			success: true,
			processed,
			message: `Successfully processed ${processed} enrichment job(s)`
		});
	} catch (error) {
		console.error('[Enrich] Error processing enrichment queue:', error);
		return json(
			{
				success: false,
				error: 'Failed to process enrichment queue',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};

/**
 * GET /api/youtube/enrich
 * Manually trigger enrichment processing
 */
export const GET: RequestHandler = async () => {
	try {
		console.log('[Enrich] Manual enrichment trigger via GET');

		const processed = await EnrichmentService.processQueue(5);

		console.log(`[Enrich] Processed ${processed} jobs`);

		return json({
			success: true,
			processed,
			message: `Successfully processed ${processed} enrichment job(s)`
		});
	} catch (error) {
		console.error('[Enrich] Error processing enrichment queue:', error);
		return json(
			{
				success: false,
				error: 'Failed to process enrichment queue',
				message: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
