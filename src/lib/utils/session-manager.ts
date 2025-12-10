/**
 * Session Manager for Multi-Tab Search Isolation
 *
 * This utility manages unique session keys for each browser tab,
 * allowing multiple simultaneous searches without conflicts.
 *
 * How it works:
 * - Each browser tab gets a unique sessionKey (stored in sessionStorage)
 * - SessionStorage is isolated per-tab (unlike localStorage)
 * - The sessionKey is sent with each API request
 * - Backend uses sessionKey to isolate search sessions
 */

const SESSION_KEY = 'youtube_search_session_key';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create a session key for the current browser tab
 * Session keys are stored in sessionStorage (tab-isolated)
 */
export function getSessionKey(): string {
  // Check if we're in a browser environment
  if (typeof sessionStorage === 'undefined') {
    // Server-side: generate temporary key
    return generateUUID();
  }

  // Try to get existing session key
  let sessionKey = sessionStorage.getItem(SESSION_KEY);

  if (!sessionKey) {
    // Generate new session key for this tab
    sessionKey = generateUUID();
    sessionStorage.setItem(SESSION_KEY, sessionKey);
    console.log(`[SessionManager] Created new session key for this tab: ${sessionKey}`);
  } else {
    console.log(`[SessionManager] Using existing session key: ${sessionKey}`);
  }

  return sessionKey;
}

/**
 * Clear the session key (useful for testing or logout)
 */
export function clearSessionKey(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
    console.log('[SessionManager] Cleared session key');
  }
}

/**
 * Generate a client ID (optional, for additional tracking)
 * This could be based on browser fingerprinting, but for now we'll use a simple approach
 */
export function getClientId(): string | null {
  // In a production app, you might use a library like fingerprintjs2
  // For now, we'll return null and let the backend generate it if needed
  return null;
}

/**
 * Debug: Log current session info
 */
export function debugSessionInfo(): void {
  if (typeof sessionStorage !== 'undefined') {
    console.log('[SessionManager] Session Info:', {
      sessionKey: sessionStorage.getItem(SESSION_KEY),
      storageType: 'sessionStorage (tab-isolated)',
      tabId: Math.random().toString(36).substring(7), // Random ID for this tab
    });
  }
}
