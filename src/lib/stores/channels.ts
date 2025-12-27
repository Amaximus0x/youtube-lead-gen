import { writable } from 'svelte/store';
import type { ChannelSearchResult, SearchStats, Pagination, SearchFilters } from '$lib/types/api';

export interface SearchState {
	isSearching: boolean;
	isLoadingMore: boolean;
	isEnriching: boolean; // NEW: Shows spinner at bottom of results
	channels: ChannelSearchResult[];
	error: string | null;
	stats: SearchStats | null;
	pagination: Pagination | null;
	currentKeyword: string | null;
	searchLimit: number | null;
	searchFilters: SearchFilters | null;
	searchProgress: number; // NEW: 0-100 progress
	statusMessage: string; // NEW: "Found 15/20 channels..."
}

const initialState: SearchState = {
	isSearching: false,
	isLoadingMore: false,
	isEnriching: false,
	channels: [],
	error: null,
	stats: null,
	pagination: null,
	currentKeyword: null,
	searchLimit: null,
	searchFilters: null,
	searchProgress: 0,
	statusMessage: ''
};

function createChannelsStore() {
	const { subscribe, set, update } = writable<SearchState>(initialState);

	return {
		subscribe,
		setSearching: (isSearching: boolean, keyword?: string, searchLimit?: number) => {
			update((state) => ({
				...state,
				isSearching,
				error: null,
				// Reset progress and stats when starting a new search
				searchProgress: isSearching ? 0 : state.searchProgress,
				statusMessage: isSearching ? '' : state.statusMessage,
				stats: isSearching ? null : state.stats, // Clear old stats when starting new search
				// Store keyword and limit when starting a search
				currentKeyword: keyword !== undefined ? keyword : state.currentKeyword,
				searchLimit: searchLimit !== undefined ? searchLimit : state.searchLimit
			}));
		},
		setChannels: (
			channels: ChannelSearchResult[],
			stats: SearchStats | null,
			pagination: Pagination | null
		,
			searchLimit?: number,
			searchFilters?: SearchFilters
		) => {
			// Fix for missing totalPages in backend response (fallback calculation)
			let fixedPagination = pagination;
			if (pagination && !pagination.totalPages && pagination.totalChannels && pagination.pageSize) {
				fixedPagination = {
					...pagination,
					totalPages: Math.ceil(pagination.totalChannels / pagination.pageSize)
				};
			}

			update((state) => ({
				...state,
				channels,
				stats,
				pagination: fixedPagination,
				currentKeyword: stats?.keyword || state.currentKeyword,
				searchLimit: searchLimit !== undefined ? searchLimit : state.searchLimit,
				searchFilters: searchFilters !== undefined ? searchFilters : state.searchFilters,
				isSearching: false,
				isLoadingMore: false,
				error: null
			}));
		},
		appendChannels: (
			channels: ChannelSearchResult[],
			stats: SearchStats | null,
			pagination: Pagination | null
		) => {
			console.log('[Store] appendChannels called with:', channels.length, 'new channels');

			// Fix for missing totalPages in backend response (fallback calculation)
			let fixedPagination = pagination;
			if (pagination && !pagination.totalPages && pagination.totalChannels && pagination.pageSize) {
				fixedPagination = {
					...pagination,
					totalPages: Math.ceil(pagination.totalChannels / pagination.pageSize)
				};
			}

			update((state) => {
				// Create a set of existing channel IDs for duplicate prevention
				const existingIds = new Set(state.channels.map(ch => ch.channelId));

				// Filter out any duplicates (just in case)
				const uniqueNewChannels = channels.filter(ch => !existingIds.has(ch.channelId));

				if (uniqueNewChannels.length < channels.length) {
					console.log('[Store] Filtered out', channels.length - uniqueNewChannels.length, 'duplicate channels');
				}

				const newState = {
					...state,
					channels: [...state.channels, ...uniqueNewChannels],
					stats,
					pagination: fixedPagination,
					isLoadingMore: false,
					error: null
				};
				console.log('[Store] State updated. Total channels now:', newState.channels.length);
				return newState;
			});
		},
		setLoadingMore: (isLoadingMore: boolean) => {
			update((state) => ({ ...state, isLoadingMore, error: null }));
		},
		updateEnrichmentData: (statuses: Record<string, any>) => {
			update((state) => {
				const updatedChannels = state.channels.map((channel) => {
					const status = statuses[channel.channelId];
					if (status && status.status === 'enriched') {
						// Update channel with enriched data
						return {
							...channel,
							subscriberCount: status.subscriber_count || channel.subscriberCount,
							videoCount: status.video_count || channel.videoCount,
							emails: status.emails || channel.emails,
							email_sources: status.email_sources || channel.email_sources,
							socialLinks: status.social_links || channel.socialLinks
						};
					}
					return channel;
				});

				return {
					...state,
					channels: updatedChannels
				};
			});
		},
		setError: (error: string) => {
			update((state) => ({
				...state,
				error,
				isSearching: false,
				isLoadingMore: false,
				isEnriching: false
			}));
		},
		setEnriching: (isEnriching: boolean) => {
			update((state) => ({ ...state, isEnriching }));
		},
		setProgress: (progress: number, message: string) => {
			update((state) => ({
				...state,
				searchProgress: progress,
				statusMessage: message
			}));
		},
		reset: () => {
			set(initialState);
		}
	};
}

export const channelsStore = createChannelsStore();
