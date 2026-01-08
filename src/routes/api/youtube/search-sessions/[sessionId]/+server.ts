import { json, type RequestHandler } from "@sveltejs/kit";
import { PUBLIC_API_URL } from "$env/static/public";

// PATCH endpoint for updating search session (client filters, status, last displayed rank)
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		const sessionId = params.sessionId;

		if (!sessionId) {
			return json(
				{
					error: "Session ID is required",
				},
				{ status: 400 }
			);
		}

		const body = await request.json();
		console.log(`[API] Updating search session ${sessionId}:`, body);

		const backendUrl = PUBLIC_API_URL || "http://localhost:8090";

		const backendResponse = await fetch(
			`${backendUrl}/youtube/search-sessions/${sessionId}`,
			{
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
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
		console.log(`[API] Search session ${sessionId} updated successfully`);

		return json({
			success: true,
			...backendData.data,
		});
	} catch (error) {
		console.error("[API] Update search session error:", error);
		return json(
			{
				error: "Failed to update search session",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
};
