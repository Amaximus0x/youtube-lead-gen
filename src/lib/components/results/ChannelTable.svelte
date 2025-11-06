<script lang="ts">
	import { channelsStore } from '$lib/stores/channels';
	import { fetchPage } from '$lib/api/pagination';
	import Pagination from '$lib/components/common/Pagination.svelte';
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

	async function handlePageChange(page: number) {
		if (!pagination || !currentKeyword) return;

		channelsStore.setLoadingMore(true);

		try {
			console.log('[Pagination] Fetching page', page);

			const data = await fetchPage(
				currentKeyword,
				page,
				pagination.pageSize,
				pagination.searchSessionId,
				searchLimit || undefined,
				searchFilters || undefined
			);

			console.log('[Pagination] Page', page, 'loaded successfully');
			channelsStore.setChannels(data.channels, data.stats, data.pagination);

			// Scroll to top of table
			window.scrollTo({ top: 0, behavior: 'smooth' });
		} catch (error) {
			console.error('[Pagination] Error loading page:', error);
			channelsStore.setError(
				error instanceof Error ? error.message : 'Failed to load page'
			);
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
	<div class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
		<div class="flex items-center gap-4">
			<div>
				<span class="font-semibold">Keyword:</span>
				<span class="text-blue-700">{stats.keyword}</span>
			</div>
			<div>
				<span class="font-semibold">Found:</span>
				<span class="text-green-700">{stats.total}</span>
			</div>
			<div>
				<span class="font-semibold">After filters:</span>
				<span class="text-purple-700">{stats.filtered}</span>
			</div>
		</div>
	</div>
{/if}

{#if channels.length > 0}
	<div class="overflow-x-auto bg-white rounded-lg shadow">
		<table class="min-w-full divide-y divide-gray-200">
			<thead class="bg-gray-50">
				<tr>
					<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Channel
					</th>
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Subscribers
					</th>
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Videos
					</th>
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Views
					</th>
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Country
					</th>
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Relevance
					</th>
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Email Status
					</th>
					<th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Actions
					</th>
				</tr>
			</thead>
			<tbody class="bg-white divide-y divide-gray-200">
				{#each channels as channel (channel.channelId)}
					<tr class="hover:bg-gray-50 transition-colors">
						<td class="px-4 py-3">
							<div class="flex items-center">
								{#if channel.thumbnailUrl}
									<img
										src={channel.thumbnailUrl}
										alt={channel.name}
										class="h-10 w-10 rounded-full mr-3 flex-shrink-0"
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
									class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800"
								>
									{channel.emails.length} found
								</span>
							{:else}
								<span
									class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800"
								>
									Not found
								</span>
							{/if}
						</td>
						<td class="px-3 py-3 whitespace-nowrap text-sm font-medium">
							<a
								href={channel.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-blue-600 hover:text-blue-900 mr-2"
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

	<div class="mt-4 flex flex-col items-center gap-3">
		<div class="text-sm text-gray-500 text-center">
			Showing {channels.length} channel{channels.length !== 1 ? 's' : ''}
			{#if stats && stats.keyword}
				for "{stats.keyword}"
			{/if}
			{#if pagination}
				(Page {pagination.currentPage} of {pagination.totalPages})
			{/if}
		</div>

		{#if pagination && pagination.totalPages > 1}
			<Pagination
				currentPage={pagination.currentPage}
				totalPages={pagination.totalPages}
				onPageChange={handlePageChange}
				loading={isLoadingMore}
			/>
		{/if}
	</div>
{:else}
	<div class="text-center py-12 bg-gray-50 rounded-lg">
		<svg
			class="mx-auto h-12 w-12 text-gray-400"
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
		class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50"
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
			<div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
				<div class="flex items-center">
					{#if selectedChannel.thumbnailUrl}
						<img
							src={selectedChannel.thumbnailUrl}
							alt={selectedChannel.name}
							class="h-12 w-12 rounded-full mr-3"
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
					<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
				<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
					<div class="bg-blue-50 p-3 rounded-lg">
						<div class="text-sm text-gray-600">Subscribers</div>
						<div class="text-lg font-semibold text-blue-700">
							{formatSubscribers(selectedChannel.subscriberCount)}
						</div>
					</div>
					<div class="bg-green-50 p-3 rounded-lg">
						<div class="text-sm text-gray-600">Videos</div>
						<div class="text-lg font-semibold text-green-700">
							{formatVideos(selectedChannel.videoCount)}
						</div>
					</div>
					<div class="bg-orange-50 p-3 rounded-lg">
						<div class="text-sm text-gray-600">Views</div>
						<div class="text-lg font-semibold text-orange-700">
							{formatViews(selectedChannel.viewCount)}
						</div>
					</div>
					<div class="bg-indigo-50 p-3 rounded-lg">
						<div class="text-sm text-gray-600">Country</div>
						<div class="text-lg font-semibold text-indigo-700">
							{selectedChannel.country || 'Unknown'}
						</div>
					</div>
					<div class="bg-purple-50 p-3 rounded-lg">
						<div class="text-sm text-gray-600">Relevance</div>
						<div class="text-lg font-semibold text-purple-700">
							{formatRelevance(selectedChannel.relevanceScore)}
						</div>
					</div>
				</div>

				<!-- Email Addresses -->
				<div class="mb-6">
					<h4 class="text-sm font-semibold text-gray-700 mb-2 flex items-center">
						<svg
							class="h-5 w-5 mr-2 text-green-600"
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
								<div class="bg-gray-50 p-3 rounded-lg">
									<div class="flex items-center justify-between">
										<span class="text-sm font-mono text-gray-900">{email}</span>
										<button
											on:click={() => navigator.clipboard.writeText(email)}
											class="text-blue-600 hover:text-blue-800 text-xs px-2 py-1 rounded hover:bg-blue-50"
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
						<p class="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
							No email addresses found for this channel.
						</p>
					{/if}
				</div>

				<!-- Social Links -->
				<div class="mb-6">
					<h4 class="text-sm font-semibold text-gray-700 mb-2 flex items-center">
						<svg
							class="h-5 w-5 mr-2 text-blue-600"
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
								<div class="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
									<div class="flex items-center">
										<span class="text-sm font-semibold text-gray-700 capitalize w-24"
											>{platform}:</span
										>
										<a
											href={url}
											target="_blank"
											rel="noopener noreferrer"
											class="text-sm text-blue-600 hover:text-blue-800 truncate max-w-md"
										>
											{url}
										</a>
									</div>
									<a
										href={url}
										target="_blank"
										rel="noopener noreferrer"
										class="text-blue-600 hover:text-blue-800 text-xs"
									>
										Visit
									</a>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
							No social media links found for this channel.
						</p>
					{/if}
				</div>

				<!-- Description -->
				{#if selectedChannel.description}
					<div class="mb-4">
						<h4 class="text-sm font-semibold text-gray-700 mb-2">Description</h4>
						<p class="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
							{selectedChannel.description}
						</p>
					</div>
				{/if}
			</div>

			<!-- Modal Footer -->
			<div class="px-6 py-4 border-t border-gray-200 flex justify-between">
				<a
					href={selectedChannel.url}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
				>
					Visit YouTube Channel
				</a>
				<button
					on:click={closeModal}
					class="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
