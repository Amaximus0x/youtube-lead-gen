import type { SearchFilters } from '$lib/types/api';
import type { ClientFilters } from './clientFilters';

export interface StoredSearchState {
	keyword: string;
	searchLimit: number;
	serverFilters: SearchFilters | null;
	clientFilters: ClientFilters | null;
	sessionId?: string;
}

const STORAGE_KEY = 'youtube_search_filters';

export function saveSearchState(state: StoredSearchState): void {
	try {
		sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
		console.log('[FilterStorage] Saved search state:', state);
	} catch (error) {
		console.error('[FilterStorage] Error saving search state:', error);
	}
}

export function loadSearchState(): StoredSearchState | null {
	try {
		const stored = sessionStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		const state = JSON.parse(stored) as StoredSearchState;
		console.log('[FilterStorage] Loaded search state:', state);
		return state;
	} catch (error) {
		console.error('[FilterStorage] Error loading search state:', error);
		return null;
	}
}

export function clearSearchState(): void {
	try {
		sessionStorage.removeItem(STORAGE_KEY);
		console.log('[FilterStorage] Cleared search state');
	} catch (error) {
		console.error('[FilterStorage] Error clearing search state:', error);
	}
}

export function loadRestoreSearch(): any | null {
	try {
		const stored = sessionStorage.getItem('restoreSearch');
		if (!stored) return null;

		const data = JSON.parse(stored);
		console.log('[FilterStorage] Loaded restore search:', data);
		
		sessionStorage.removeItem('restoreSearch');
		return data;
	} catch (error) {
		console.error('[FilterStorage] Error loading restore search:', error);
		return null;
	}
}
