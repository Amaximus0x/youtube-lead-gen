import { PUBLIC_API_URL } from '$env/static/public';

const API_URL = PUBLIC_API_URL || 'http://localhost:8090';

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
 * @param sessionId - The search session ID to restore
 * @param limit - Number of channels to load (default: 50)
 * @returns Promise with channels, stats, and pagination data
 */
export async function restoreSearchSession(sessionId: string, limit: number = 50) {
  // Call the backend API directly (not the SvelteKit proxy)
  // The backend endpoint supports sessionId-based loading
  try {
    const response = await fetch(`${API_URL}/youtube/search/load-more`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId,
        offset: 0,
        limit
      }),
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
    if (data.status === 'error') {
      throw new Error(data.message || 'Failed to restore search session');
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
