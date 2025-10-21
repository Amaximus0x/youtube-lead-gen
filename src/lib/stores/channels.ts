import { writable } from 'svelte/store';
import type { ChannelSearchResult } from '$lib/server/youtube/scraper-puppeteer';

export interface SearchState {
	isSearching: boolean;
	isLoadingMore: boolean;
	channels: Array<ChannelSearchResult & { relevanceScore: number }>;
	error: string | null;
	stats: {
		total: number;
		filtered: number;
		keyword: string;
		displayed?: number;
		remaining?: number;
	} | null;
	pagination: {
		currentPage: number;
		pageSize: number;
		totalChannels: number;
		hasMore: boolean;
	} | null;
}

const initialState: SearchState = {
	isSearching: false,
	isLoadingMore: false,
	channels: [],
	error: null,
	stats: null,
	pagination: null
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
			stats: SearchState['stats'],
			pagination: SearchState['pagination']
		) => {
			update((state) => ({
				...state,
				channels,
				stats,
				pagination,
				isSearching: false,
				error: null
			}));
		},
		appendChannels: (
			channels: Array<ChannelSearchResult & { relevanceScore: number }>,
			pagination: SearchState['pagination']
		) => {
			update((state) => ({
				...state,
				channels: [...state.channels, ...channels],
				pagination,
				isLoadingMore: false,
				error: null
			}));
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
				isLoadingMore: false
			}));
		},
		reset: () => {
			set(initialState);
		}
	};
}

export const channelsStore = createChannelsStore();
