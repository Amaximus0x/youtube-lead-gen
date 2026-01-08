import { json, type RequestHandler } from "@sveltejs/kit";
import { PUBLIC_API_URL } from "$env/static/public";

/**
 * GET /api/youtube/search/[jobId]
 * Polls the backend for job status and results
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { jobId } = params;

		if (!jobId) {
			return json({ error: "Job ID is required" }, { status: 400 });
		}

		const backendUrl = PUBLIC_API_URL || "http://localhost:8090";

		// Poll backend for job status
		const backendResponse = await fetch(
			`${backendUrl}/youtube/search/${jobId}`,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
			}
		);

		if (!backendResponse.ok) {
			const errorText = await backendResponse.text();
			console.error(`[API] Backend error polling job ${jobId}:`, errorText);
			return json(
				{
					error: "Backend request failed",
					details: errorText,
				},
				{ status: backendResponse.status }
			);
		}

		const backendData = await backendResponse.json();

		console.log(`[API] Job ${jobId} status: ${backendData.status}, newChannels: ${backendData.newChannels?.length || 0}`);

		// Backend returns job data directly (not wrapped in 'data')
		// Return it as-is so frontend can access status, newChannels, etc.
		return json({
			success: true,
			...backendData, // Spread the entire job data (status, newChannels, sessionId, etc.)
		});
	} catch (error) {
		console.error("[API] Job polling error:", error);
		return json(
			{
				error: "Failed to poll job status",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
};
