import { writable } from 'svelte/store';
import type { ChannelSearchResult } from '$lib/server/youtube/scraper-puppeteer';

export interface SearchState {
	isSearching: boolean;
	channels: Array<ChannelSearchResult & { relevanceScore: number }>;
	error: string | null;
	stats: {
		total: number;
		filtered: number;
		keyword: string;
	} | null;
}

const initialState: SearchState = {
	isSearching: false,
	channels: [],
	error: null,
	stats: null
};

function createChannelsStore() {
	const { subscribe, set, update } = writable<SearchState>(initialState);

	return {
		subscribe,
		setSearching: (isSearching: boolean) => {
			update((state) => ({ ...state, isSearching, error: null }));
		},
		setChannels: (
			channels: Array<ChannelSearchResult & { relevanceScore: number }>,
			stats: SearchState['stats']
		) => {
			update((state) => ({
				...state,
				channels,
				stats,
				isSearching: false,
				error: null
			}));
		},
		setError: (error: string) => {
			update((state) => ({
				...state,
				error,
				isSearching: false
			}));
		},
		reset: () => {
			set(initialState);
		}
	};
}

export const channelsStore = createChannelsStore();
