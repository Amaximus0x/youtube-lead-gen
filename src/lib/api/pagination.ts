import { apiPost } from './client';
import type { ApiResponse, SearchResponse, SearchRequest } from '$lib/types/api';

/**
 * Fetch a specific page of search results
 */
export async function fetchPage(
	keyword: string,
	page: number,
	pageSize: number = 15,
	searchSessionId?: string,
	limit?: number,
	filters?: SearchRequest['filters'],
	offset?: number  // Add offset parameter for accurate pagination with dynamic pageSize
): Promise<SearchResponse> {
	const requestBody: SearchRequest = {
		keyword,
		page,
		pageSize,
		limit: limit || 15, // Default to 15 for on-demand fetching
		filters,
		offset  // Send the actual offset (current channel count)
	};

	// Add searchSessionId for subsequent pages
	if (searchSessionId) {
		requestBody.searchSessionId = searchSessionId;
	}

	const response = await apiPost<ApiResponse<SearchResponse>>('/youtube/search', requestBody);

	if (response.status === 'success' && response.data) {
		return response.data;
	}

	throw new Error(response.message || 'Failed to fetch page');
}
