import { json, type RequestHandler } from "@sveltejs/kit";
import { PUBLIC_API_URL } from "$env/static/public";

export const POST: RequestHandler = async ({ params, request }) => {
	try {
		const { sessionId } = params;
		const body = await request.json();
		const { additionalChannels = 50 } = body;

		console.log(`[API] Continuing search for session ${sessionId}, fetching ${additionalChannels} more channels`);

		const backendUrl = PUBLIC_API_URL || "http://localhost:8090";

		const backendResponse = await fetch(
			`${backendUrl}/youtube/search/continue/${sessionId}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					additionalChannels,
				}),
			}
		);

		if (!backendResponse.ok) {
			const errorText = await backendResponse.text();
			console.error("[API] Backend error:", errorText);
			return json(
				{
					error: "Backend request failed",
					details: errorText,
				},
				{ status: backendResponse.status }
			);
		}

		const backendData = await backendResponse.json();

		console.log(`[API] Retrieved ${backendData.data?.channels?.length || 0} new channels`);

		return json({
			success: true,
			...backendData.data,
		});
	} catch (error) {
		console.error("[API] Continue search error:", error);
		return json(
			{
				error: "Failed to continue search",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
};
