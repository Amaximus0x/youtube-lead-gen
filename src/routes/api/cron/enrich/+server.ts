import { json, type RequestHandler } from '@sveltejs/kit';
import { EnrichmentService } from '$lib/server/queue/enrichment-service';

/**
 * Vercel Cron endpoint
 * This will be called by Vercel Cron Jobs
 */
export const GET: RequestHandler = async () => {
	try {
		console.log('[Cron] Enrichment cron job triggered');

		const processed = await EnrichmentService.processQueue(5);

		console.log(`[Cron] Processed ${processed} jobs`);

		return json({
			success: true,
			processed,
			message: `Cron job processed ${processed} enrichment job(s)`
		});
	} catch (error) {
		console.error('[Cron] Error processing enrichment queue:', error);
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
