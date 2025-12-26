<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	interface SearchHistoryItem {
		id: string;
		keyword: string;
		filters: Record<string, any> | null;
		clientFilters: Record<string, any> | null;
		totalChannels: number;
		channelsWithEmail: number;
		channelsWithSocial: number;
		status: 'active' | 'completed' | 'expired' | 'cancelled';
		createdAt: string;
		userId?: string | null;
	}

	let history: SearchHistoryItem[] = [];
	let isLoading = true;
	let error: string | null = null;
	let currentPage = 1;
	let pageSize = 20;
	let totalPages = 0;
	let hasMore = false;

	async function loadHistory() {
		try {
			isLoading = true;
			error = null;

			const response = await fetch(
				`/api/youtube/search/history?page=${currentPage}&pageSize=${pageSize}`
			);

			if (!response.ok) {
				throw new Error('Failed to load search history');
			}

			const data = await response.json();

			if (data.success) {
				history = data.history || [];
				hasMore = data.hasMore || false;
				totalPages = Math.ceil((data.total || 0) / pageSize);
			} else {
				throw new Error(data.error || 'Failed to load history');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
			console.error('[Dashboard] Error loading history:', err);
		} finally {
			isLoading = false;
		}
	}

	function handleRestoreSearch(item: SearchHistoryItem) {
		sessionStorage.setItem('restoreSearch', JSON.stringify({
			sessionId: item.id,
			keyword: item.keyword,
			filters: item.filters,
			clientFilters: item.clientFilters,
		}));
		goto('/');
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffHours < 1) {
			const diffMinutes = Math.floor(diffMs / (1000 * 60));
			return diffMinutes + ' minute' + (diffMinutes !== 1 ? 's' : '') + ' ago';
		} else if (diffHours < 24) {
			return diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
		} else if (diffDays < 7) {
			return diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' ago';
		} else {
			return date.toLocaleDateString('en-US', {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});
		}
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'completed':
				return 'bg-green-100 text-green-800';
			case 'active':
				return 'bg-blue-100 text-blue-800';
			case 'expired':
				return 'bg-gray-100 text-gray-800';
			case 'cancelled':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	}

	onMount(() => {
		loadHistory();
	});

	$: if (currentPage) {
		loadHistory();
	}
</script>

<div class="mx-auto max-w-7xl px-4 py-8">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-4xl font-bold text-gray-900">Search History</h1>
			<p class="mt-2 text-lg text-gray-600">
				Review and restore your previous searches
			</p>
		</div>
		<a
			href="/"
			class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
		>
			<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Search
		</a>
	</div>

	{#if isLoading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
			<p class="font-semibold">Error loading search history</p>
			<p class="text-sm mt-1">{error}</p>
		</div>
	{:else if history.length === 0}
		<div class="text-center py-12">
			<svg
				class="mx-auto h-12 w-12 text-gray-400"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
				/>
			</svg>
			<h3 class="mt-2 text-sm font-medium text-gray-900">No search history</h3>
			<p class="mt-1 text-sm text-gray-500">Get started by creating a new search</p>
			<div class="mt-6">
				<a
					href="/"
					class="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
				>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					New Search
				</a>
			</div>
		</div>
	{:else}
		<div class="bg-white rounded-lg shadow overflow-hidden">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Keyword
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Date
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Status
							</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
								Total Channels
							</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
								With Email
							</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
								With Social
							</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Filters
							</th>
							<th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
								Action
							</th>
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each history as item (item.id)}
							<tr class="hover:bg-gray-50 transition-colors">
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm font-medium text-gray-900">{item.keyword}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="text-sm text-gray-500">{formatDate(item.createdAt)}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="px-2 py-1 text-xs font-medium rounded-full {getStatusBadgeClass(item.status)}">
										{item.status}
									</span>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right">
									<div class="text-sm text-gray-900">{item.totalChannels}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right">
									<div class="text-sm font-medium text-green-600">{item.channelsWithEmail}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right">
									<div class="text-sm font-medium text-blue-600">{item.channelsWithSocial}</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex flex-wrap gap-1">
										{#if item.filters?.minSubscribers}
											<span class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
												Min: {item.filters.minSubscribers.toLocaleString()}
											</span>
										{/if}
										{#if item.filters?.maxSubscribers}
											<span class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
												Max: {item.filters.maxSubscribers.toLocaleString()}
											</span>
										{/if}
										{#if item.filters?.countries && item.filters.countries.length > 0}
											<span class="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
												{item.filters.countries[0]}
											</span>
										{/if}
										{#if !item.filters || (!item.filters.minSubscribers && !item.filters.maxSubscribers && (!item.filters.countries || item.filters.countries.length === 0))}
											<span class="text-xs text-gray-400">None</span>
										{/if}
									</div>
								</td>
								<td class="px-6 py-4 whitespace-nowrap text-right">
									<button
										on:click={() => handleRestoreSearch(item)}
										class="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
									>
										Restore
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		{#if totalPages > 1}
			<div class="mt-8 flex justify-center items-center gap-2">
				<button
					on:click={() => (currentPage = Math.max(1, currentPage - 1))}
					disabled={currentPage === 1}
					class="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Previous
				</button>

				<span class="text-sm text-gray-700">
					Page {currentPage} of {totalPages}
				</span>

				<button
					on:click={() => (currentPage = Math.min(totalPages, currentPage + 1))}
					disabled={!hasMore}
					class="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Next
				</button>
			</div>
		{/if}
	{/if}
</div>
