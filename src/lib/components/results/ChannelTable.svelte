<script lang="ts">
	import { channelsStore } from '$lib/stores/channels';
	import { fetchPage } from '$lib/api/pagination';
	import type { ChannelSearchResult } from '$lib/types/api';

	$: channels = $channelsStore.channels;
	$: stats = $channelsStore.stats;
	$: pagination = $channelsStore.pagination;
	$: isLoadingMore = $channelsStore.isLoadingMore;
	$: currentKeyword = $channelsStore.currentKeyword;
	$: searchLimit = $channelsStore.searchLimit;
	$: searchFilters = $channelsStore.searchFilters;

	let selectedChannel: ChannelSearchResult | null = null;
	let showEmailModal = false;

	async function handleLoadMore() {
		if (!pagination || !currentKeyword) return;

		channelsStore.setLoadingMore(true);

		try {
			const nextPage = pagination.currentPage + 1;
			console.log('[LoadMore] Fetching page', nextPage);

			// Calculate dynamic pageSize based on remaining channels needed
			let dynamicPageSize = pagination.pageSize;
			if (searchLimit) {
				const currentChannelCount = channels.length;
				const remainingChannels = searchLimit - currentChannelCount;

				// Use the smaller of: default pageSize or remaining channels needed
				dynamicPageSize = Math.min(pagination.pageSize, remainingChannels);

				console.log('[LoadMore] Current channels:', currentChannelCount);
				console.log('[LoadMore] Search limit:', searchLimit);
				console.log('[LoadMore] Remaining needed:', remainingChannels);
				console.log('[LoadMore] Dynamic pageSize:', dynamicPageSize);
			}

			const data = await fetchPage(
				currentKeyword,
				nextPage,
				dynamicPageSize,
				pagination.searchSessionId,
				searchLimit || undefined,
				searchFilters || undefined,
				channels.length  // Send current channel count as offset for accurate pagination
			);

			console.log('[LoadMore] Page', nextPage, 'loaded successfully');
			console.log('[LoadMore] Response data:', data);
			console.log('[LoadMore] New channels count:', data.channels?.length);
			console.log('[LoadMore] New pagination:', data.pagination);

			// Validate response
			if (!data.channels || !Array.isArray(data.channels)) {
				throw new Error('Invalid response: channels data is missing or not an array');
			}

			// Append new channels to existing list
			console.log('[LoadMore] Appending', data.channels.length, 'channels to store');
			channelsStore.appendChannels(data.channels, data.stats, data.pagination);
			console.log('[LoadMore] Store updated successfully');
		} catch (error) {
			console.error('[LoadMore] Error loading more channels:', error);
			channelsStore.setError(
				error instanceof Error ? error.message : 'Failed to load more channels'
			);
		} finally {
			// Ensure loading state is reset even if there's an error
			channelsStore.setLoadingMore(false);
		}
	}

	function formatSubscribers(count: number | undefined): string {
		if (!count) return 'Unknown';
		if (count >= 1000000) {
			// Better rounding: 1.25M stays 1.25M, not 1.3M
			const value = count / 1000000;
			// Round to 2 decimal places, then remove trailing zeros
			const rounded = Math.round(value * 100) / 100;
			return `${rounded}M`;
		}
		if (count >= 1000) {
			const value = count / 1000;
			const rounded = Math.round(value * 100) / 100;
			return `${rounded}K`;
		}
		return count.toString();
	}

	function formatVideos(count: number | undefined): string {
		if (!count) return 'Unknown';
		return `${count.toLocaleString()}`;
	}

	function formatViews(count: number | undefined): string {
		if (!count) return 'Unknown';
		if (count >= 1000000000) {
			const value = count / 1000000000;
			const rounded = Math.round(value * 100) / 100;
			return `${rounded}B`;
		}
		if (count >= 1000000) {
			const value = count / 1000000;
			const rounded = Math.round(value * 100) / 100;
			return `${rounded}M`;
		}
		if (count >= 1000) {
			const value = count / 1000;
			const rounded = Math.round(value * 100) / 100;
			return `${rounded}K`;
		}
		return count.toLocaleString();
	}

	function formatRelevance(score: number | undefined): string {
		if (!score) return '0%';
		return `${Math.round(score)}%`;
	}

	function getEmailStatus(channel: ChannelSearchResult): { text: string; class: string } {
		if (channel.emails && channel.emails.length > 0) {
			return {
				text: `${channel.emails.length} found`,
				class: 'bg-green-100 text-green-800'
			};
		}
		return {
			text: 'Not found',
			class: 'bg-gray-100 text-gray-800'
		};
	}

	function showEmailDetails(channel: ChannelSearchResult) {
		selectedChannel = channel;
		showEmailModal = true;
	}

	function closeModal() {
		showEmailModal = false;
		selectedChannel = null;
	}
</script>

{#if stats}
	<div class="p-4 mb-4 border border-blue-200 rounded-lg bg-blue-50">
		<div class="flex items-center gap-4">
			<div>
				<span class="font-semibold">Keyword:</span>
				<span class="text-blue-700">{stats.keyword}</span>
			</div>
			<div>
				<span class="font-semibold">Found:</span>
				{channels.length} channel{channels.length !== 1 ? 's' : ''}
			
			
			</div>
		</div>
	</div>
{/if}

{#if channels.length > 0}
	<div class="overflow-x-auto bg-white rounded-lg shadow">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Channel
					</th>
					<th class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Subscribers
					</th>
					<th class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Videos
					</th>
					<th class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Views
					</th>
					<th class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Country
					</th>
					<th class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Relevance
					</th>
					<th class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Email Status
					</th>
					<th class="px-3 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
						Actions
					</th>
				</tr>
			</thead>
			<tbody class="bg-white divide-y divide-gray-200">
				{#each channels as channel (channel.channelId)}
					<tr class="transition-colors hover:bg-gray-50">
						<td class="px-4 py-3">
							<div class="flex items-center">
								{#if channel.thumbnailUrl}
									<img
										src={channel.thumbnailUrl}
										alt={channel.name}
										class="flex-shrink-0 w-10 h-10 mr-3 rounded-full"
									/>
								{/if}
								<div class="min-w-0">
									<div class="text-sm font-medium text-gray-900 truncate max-w-[180px]">
										{channel.name}
									</div>
									{#if channel.description}
										<div class="text-xs text-gray-500 truncate max-w-[180px]">
											{channel.description}
										</div>
									{/if}
								</div>
							</div>
						</td>
						<td class="px-3 py-3 whitespace-nowrap">
							<div class="text-sm text-gray-900">
								{formatSubscribers(channel.subscriberCount)}
							</div>
						</td>
						<td class="px-3 py-3 whitespace-nowrap">
							<div class="text-sm text-gray-900">
								{formatVideos(channel.videoCount)}
							</div>
						</td>
						<td class="px-3 py-3 whitespace-nowrap">
							<div class="text-sm text-gray-900">
								{formatViews(channel.viewCount)}
							</div>
						</td>
						<td class="px-3 py-3 whitespace-nowrap">
							<div class="text-sm text-gray-900">
								{channel.country || 'Unknown'}
							</div>
						</td>
						<td class="px-3 py-3 whitespace-nowrap">
							<div class="flex items-center">
								<div class="w-full bg-gray-200 rounded-full h-2.5 mr-2" style="width: 50px;">
									<div
										class="bg-blue-600 h-2.5 rounded-full"
										style="width: {channel.relevanceScore}%"
									></div>
								</div>
								<span class="text-sm text-gray-900">{formatRelevance(channel.relevanceScore)}</span>
							</div>
						</td>
						<td class="px-3 py-3 whitespace-nowrap">
							{#if channel.emails && channel.emails.length > 0}
								<span
									class="inline-flex px-2 text-xs font-semibold leading-5 text-green-800 bg-green-100 rounded-full"
								>
									{channel.emails.length} found
								</span>
							{:else}
								<span
									class="inline-flex px-2 text-xs font-semibold leading-5 text-gray-800 bg-gray-100 rounded-full"
								>
									Not found
								</span>
							{/if}
						</td>
						<td class="px-3 py-3 text-sm font-medium whitespace-nowrap">
							<a
								href={channel.url}
								target="_blank"
								rel="noopener noreferrer"
								class="mr-2 text-blue-600 hover:text-blue-900"
							>
								Visit
							</a>
							<button
								on:click={() => showEmailDetails(channel)}
								class="text-green-600 hover:text-green-900 hover:underline"
							>
								Details
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex flex-col items-center gap-3 mt-4">
		<div class="text-sm text-center text-gray-500">
			Showing {channels.length} channel{channels.length !== 1 ? 's' : ''}
			{#if stats && stats.keyword}
				for "{stats.keyword}"
			{/if}
			
		</div>

		{#if pagination && (searchLimit ? channels.length < searchLimit : (pagination.hasMore || pagination.currentPage < pagination.totalPages))}
			<button
				on:click={handleLoadMore}
				disabled={isLoadingMore}
				class="flex items-center gap-2 px-6 py-3 font-semibold text-white transition-colors bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
			>
				{#if isLoadingMore}
					<svg class="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24">
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
							fill="none"
						/>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						/>
					</svg>
					Loading...
				{:else}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
					</svg>
					Load More Channels
				{/if}
			</button>
			{#if searchLimit && channels.length < searchLimit}
				<p class="text-xs text-gray-500">
					{searchLimit - channels.length} more channel{searchLimit - channels.length !== 1 ? 's' : ''} available (limit: {searchLimit})
				</p>
			{/if}
		{/if}
	</div>
{:else}
	<div class="py-12 text-center rounded-lg bg-gray-50">
		<svg
			class="w-12 h-12 mx-auto text-gray-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
		<h3 class="mt-2 text-sm font-medium text-gray-900">No channels found</h3>
		<p class="mt-1 text-sm text-gray-500">
			Try searching with a different keyword or adjusting your filters.
		</p>
	</div>
{/if}

<!-- Email & Contact Details Modal -->
{#if showEmailModal && selectedChannel}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75"
		on:click={closeModal}
		on:keydown={(e) => e.key === 'Escape' && closeModal()}
		role="button"
		tabindex="-1"
	>
		<div
			class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
			on:click|stopPropagation
			on:keydown|stopPropagation
			role="dialog"
			tabindex="-1"
		>
			<!-- Modal Header -->
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-200">
				<div class="flex items-center">
					{#if selectedChannel.thumbnailUrl}
						<img
							src={selectedChannel.thumbnailUrl}
							alt={selectedChannel.name}
							class="w-12 h-12 mr-3 rounded-full"
						/>
					{/if}
					<div>
						<h3 class="text-lg font-medium text-gray-900">{selectedChannel.name}</h3>
						<p class="text-sm text-gray-500">Contact Information</p>
					</div>
				</div>
				<button
					on:click={closeModal}
					class="text-gray-400 hover:text-gray-500"
					aria-label="Close"
				>
					<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Modal Body -->
			<div class="px-6 py-4">
				<!-- Channel Stats -->
				<div class="grid grid-cols-2 gap-4 mb-6 md:grid-cols-3 lg:grid-cols-5">
					<div class="p-3 rounded-lg bg-blue-50">
						<div class="text-sm text-gray-600">Subscribers</div>
						<div class="text-lg font-semibold text-blue-700">
							{formatSubscribers(selectedChannel.subscriberCount)}
						</div>
					</div>
					<div class="p-3 rounded-lg bg-green-50">
						<div class="text-sm text-gray-600">Videos</div>
						<div class="text-lg font-semibold text-green-700">
							{formatVideos(selectedChannel.videoCount)}
						</div>
					</div>
					<div class="p-3 rounded-lg bg-orange-50">
						<div class="text-sm text-gray-600">Views</div>
						<div class="text-lg font-semibold text-orange-700">
							{formatViews(selectedChannel.viewCount)}
						</div>
					</div>
					<div class="p-3 rounded-lg bg-indigo-50">
						<div class="text-sm text-gray-600">Country</div>
						<div class="text-lg font-semibold text-indigo-700">
							{selectedChannel.country || 'Unknown'}
						</div>
					</div>
					<div class="p-3 rounded-lg bg-purple-50">
						<div class="text-sm text-gray-600">Relevance</div>
						<div class="text-lg font-semibold text-purple-700">
							{formatRelevance(selectedChannel.relevanceScore)}
						</div>
					</div>
				</div>

				<!-- Email Addresses -->
				<div class="mb-6">
					<h4 class="flex items-center mb-2 text-sm font-semibold text-gray-700">
						<svg
							class="w-5 h-5 mr-2 text-green-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
							/>
						</svg>
						Email Addresses
					</h4>
					{#if selectedChannel.emails && selectedChannel.emails.length > 0}
						<div class="space-y-2">
							{#each selectedChannel.emails as email}
								<div class="p-3 rounded-lg bg-gray-50">
									<div class="flex items-center justify-between">
										<span class="font-mono text-sm text-gray-900">{email}</span>
										<button
											on:click={() => navigator.clipboard.writeText(email)}
											class="px-2 py-1 text-xs text-blue-600 rounded hover:text-blue-800 hover:bg-blue-50"
											title="Copy to clipboard"
										>
											Copy
										</button>
									</div>
									{#if selectedChannel.email_sources && selectedChannel.email_sources[email]}
										<div class="mt-1 text-xs text-gray-500">
											Source: <span class="font-medium capitalize"
												>{selectedChannel.email_sources[email].replace('_', ' ')}</span
											>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<p class="p-3 text-sm text-gray-500 rounded-lg bg-gray-50">
							No email addresses found for this channel.
						</p>
					{/if}
				</div>

				<!-- Social Links -->
				<div class="mb-6">
					<h4 class="flex items-center mb-2 text-sm font-semibold text-gray-700">
						<svg
							class="w-5 h-5 mr-2 text-blue-600"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
							/>
						</svg>
						Social Media Links
					</h4>
					{#if selectedChannel.socialLinks && Object.keys(selectedChannel.socialLinks).length > 0}
						<div class="space-y-2">
							{#each Object.entries(selectedChannel.socialLinks) as [platform, url]}
								<div class="flex items-center justify-between p-3 rounded-lg bg-gray-50">
									<div class="flex items-center">
										<span class="w-24 text-sm font-semibold text-gray-700 capitalize"
											>{platform}:</span
										>
										<a
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											class="max-w-md text-sm text-blue-600 truncate hover:text-blue-800"
										>
											{url}
										</a>
									</div>
									<a
										href={url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-xs text-blue-600 hover:text-blue-800"
									>
										Visit
									</a>
								</div>
							{/each}
						</div>
					{:else}
						<p class="p-3 text-sm text-gray-500 rounded-lg bg-gray-50">
							No social media links found for this channel.
						</p>
					{/if}
				</div>

				<!-- Description -->
				{#if selectedChannel.description}
					<div class="mb-4">
						<h4 class="mb-2 text-sm font-semibold text-gray-700">Description</h4>
						<p class="p-3 text-sm text-gray-600 rounded-lg bg-gray-50">
							{selectedChannel.description}
						</p>
					</div>
				{/if}
			</div>

			<!-- Modal Footer -->
			<div class="flex justify-between px-6 py-4 border-t border-gray-200">
				<a
					href={selectedChannel.url}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
				>
					Visit YouTube Channel
				</a>
				<button
					on:click={closeModal}
					class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
