import { json, type RequestHandler } from '@sveltejs/kit';
import { PUBLIC_API_URL } from '$env/static/public';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { jobId } = body;

		// Validate input
		if (!jobId || typeof jobId !== 'string') {
			return json({ error: 'jobId is required' }, { status: 400 });
		}

		console.log(`[API] Forwarding cancel request to backend for job: ${jobId}`);

		// Get backend URL from environment variable
		const backendUrl = PUBLIC_API_URL || 'http://localhost:8090';

		console.log(`[API] Backend URL: ${backendUrl}`);

		// Forward cancel request to backend (no /api prefix - backend routes are /youtube/*)
		const backendResponse = await fetch(`${backendUrl}/youtube/search/cancel`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ jobId }),
		});

		if (!backendResponse.ok) {
			const errorText = await backendResponse.text();
			console.error('[API] Backend cancel error:', errorText);
			return json(
				{
					error: 'Backend cancel request failed',
					details: errorText,
				},
				{ status: backendResponse.status }
			);
		}

		const backendData = await backendResponse.json();
		console.log('[API] Backend cancel response:', backendData);

		return json(backendData);
	} catch (error) {
		console.error('[API] Cancel error:', error);
		return json(
			{
				error: 'Failed to cancel job',
				message: error instanceof Error ? error.message : 'Unknown error',
			},
			{ status: 500 }
		);
	}
};
