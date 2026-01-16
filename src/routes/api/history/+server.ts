import { json, type RequestHandler } from "@sveltejs/kit";
import { env } from "$env/dynamic/public";

// API endpoint for fetching search history
// Simplified route to avoid nested path issues
export const GET: RequestHandler = async ({ url }) => {
	try {
		const page = url.searchParams.get("page") || "1";
		const pageSize = url.searchParams.get("pageSize") || "20";
		const userId = url.searchParams.get("userId") || undefined;

		console.log(`[API] Fetching search history: page=${page}, pageSize=${pageSize}, userId=${userId}`);

		// Use dynamic env for runtime access to environment variables
		const backendUrl = env.PUBLIC_API_URL || "https://api.youversity.io";
		console.log(`[API] PUBLIC_API_URL value: "${env.PUBLIC_API_URL}"`);
		console.log(`[API] Backend URL (with fallback): ${backendUrl}`);

		const queryParams = new URLSearchParams({
			page,
			pageSize,
		});

		if (userId) {
			queryParams.append("userId", userId);
		}

		const fullUrl = `${backendUrl}/youtube/search-history?${queryParams.toString()}`;
		console.log(`[API] Full backend URL: ${fullUrl}`);

		const backendResponse = await fetch(
			fullUrl,
			{
				method: "GET",
				headers: {
					"Content-Type": "application/json",
				},
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

		console.log(`[API] Retrieved ${backendData.data?.history?.length || 0} history items`);

		return json({
			success: true,
			...backendData.data,
		});
	} catch (error) {
		console.error("[API] Search history error:", error);
		return json(
			{
				error: "Failed to fetch search history",
				message: error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
};
