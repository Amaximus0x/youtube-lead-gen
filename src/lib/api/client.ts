import { PUBLIC_API_URL } from '$env/static/public';

const API_URL = PUBLIC_API_URL;

export async function apiPost<T>(endpoint: string, body: any): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    // Check if the response is ok (status 200-299)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`
      }));
      throw new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
    }

    // Parse the JSON response
    const data = await response.json();

    // Backend returns {status: "success" | "error", data?: ..., message?: ...}
    // Check if the backend returned an error status
    if (data.status === 'error') {
      throw new Error(data.message || 'An error occurred during the request');
    }

    return data;
  } catch (error) {
    // Re-throw if it's already an Error object
    if (error instanceof Error) {
      throw error;
    }
    // Handle network errors or other issues
    throw new Error('Network error: Failed to connect to the server');
  }
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  try {
    const response = await fetch(`${API_URL}${endpoint}`);

    // Check if the response is ok (status 200-299)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`
      }));
      throw new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
    }

    // Parse the JSON response
    const data = await response.json();

    // Backend returns {status: "success" | "error", data?: ..., message?: ...}
    // Check if the backend returned an error status
    if (data.status === 'error') {
      throw new Error(data.message || 'An error occurred during the request');
    }

    return data;
  } catch (error) {
    // Re-throw if it's already an Error object
    if (error instanceof Error) {
      throw error;
    }
    // Handle network errors or other issues
    throw new Error('Network error: Failed to connect to the server');
  }
}

/**
 * Restore a search session by loading channels from the database
 * This is used when user clicks "Restore Search" from dashboard
 *
 * Note: The searchSessionId is the permanent UUID from search_sessions.id table,
 * NOT a temporary session ID. It persists in the database.
 *
 * @param searchSessionId - The permanent search_sessions.id UUID from database
 * @param limit - Number of channels to load (default: 50)
 * @param keyword - Keyword (for fallback if needed)
 * @returns Promise with channels, stats, and pagination data
 */
export async function restoreSearchSession(searchSessionId: string, limit: number = 50, keyword?: string) {
  console.log(`[RestoreSession] Loading ${limit} channels for search_session_id: ${searchSessionId}`);

  try {
    // Use new GET endpoint that simply fetches enriched channels from DB
    // NO enrichment job - instant restore!
    const response = await fetch(`${API_URL}/youtube/search-sessions/${searchSessionId}/channels?limit=${limit}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Check if the response is ok (status 200-299)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({
        message: `HTTP ${response.status}: ${response.statusText}`
      }));

      throw new Error(errorData.message || errorData.error || `Request failed with status ${response.status}`);
    }

    // Parse the JSON response
    const data = await response.json();

    // Backend returns {status: "success" | "error", data?: ..., message?: ...}
    if (data.status === 'error' || data.error) {
      throw new Error(data.message || data.error || 'Failed to restore search');
    }

    return data;
  } catch (error) {
    // Re-throw if it's already an Error object
    if (error instanceof Error) {
      throw error;
    }
    // Handle network errors or other issues
    throw new Error('Network error: Failed to restore search session');
  }
}
