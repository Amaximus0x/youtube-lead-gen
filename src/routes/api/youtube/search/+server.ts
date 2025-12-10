import { json, type RequestHandler } from '@sveltejs/kit';
import { PUBLIC_API_URL } from '$env/static/public';

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

		console.log(`[API] Forwarding search to backend: ${keyword} (session: ${sessionKey})`);

		// Get backend URL from environment variable
		const backendUrl = PUBLIC_API_URL || 'http://localhost:3000';

		console.log(`[API] Backend URL: ${backendUrl}`);

		// Forward request to backend API (which has concurrency: 5 for parallel searches)
		const backendResponse = await fetch(`${backendUrl}/api/youtube/search`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				keyword,
				limit,
				pageSize: limit,
				sessionKey,
				userId: null, // Optional: add user authentication here
				clientId: null,
				filters: {
					minSubscribers: filters?.minSubscribers,
					maxSubscribers: filters?.maxSubscribers,
					countries: filters?.countries,
					englishOnly: filters?.englishOnly,
					excludeMusicChannels: filters?.excludeMusicChannels,
					excludeBrands: filters?.excludeBrands,
					uploadDateRange: filters?.uploadDateRange,
					minRecentAvgViews: filters?.minRecentAvgViews,
					maxRecentAvgViews: filters?.maxRecentAvgViews,
				},
			}),
		});

		if (!backendResponse.ok) {
			const errorText = await backendResponse.text();
			console.error('[API] Backend error:', errorText);
			return json(
				{
					error: 'Backend request failed',
					details: errorText,
					backendUrl
				},
				{ status: backendResponse.status }
			);
		}

		const backendData = await backendResponse.json();

		console.log('[API] Backend response status:', backendData.status);

		// Check if backend returned a jobId (async job)
		if (backendData.data?.jobId) {
			const jobId = backendData.data.jobId;
			console.log(`[API] Backend created job: ${jobId}`);

			// Return jobId so frontend can poll for results
			return json({
				success: true,
				jobId,
				message: 'Search job created on backend',
			});
		}

		// If backend returned results directly, return them
		if (backendData.data?.channels) {
			console.log(`[API] Backend returned ${backendData.data.channels.length} channels`);
			return json({
				success: true,
				channels: backendData.data.channels,
				stats: backendData.data.stats,
				pagination: backendData.data.pagination,
			});
		}

		// Fallback: return whatever backend sent
		return json({
			success: true,
			...backendData,
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
