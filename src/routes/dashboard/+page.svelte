<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/authStore';
	import { PUBLIC_API_URL } from '$env/static/public';

	const API_URL = PUBLIC_API_URL;

	interface SearchHistoryItem {
		id: string;
		keyword: string;
		filters: Record<string, any> | null;
		clientFilters: Record<string, any> | null;
		searchLimit: number; // Original search limit requested by user
		totalChannels: number; // Actual channels found and stored
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

			// Get user ID if authenticated
			const auth = $authStore;
			const userId = auth.user?.id || null;

			// Build query params
			const params = new URLSearchParams({
				page: currentPage.toString(),
				pageSize: pageSize.toString()
			});

			if (userId) {
				params.append('userId', userId);
			}

			const response = await fetch(
				`${API_URL}/youtube/search-history?${params.toString()}`
			);

			if (!response.ok) {
				throw new Error('Failed to load search history');
			}

			const data = await response.json();

			// Backend returns: { status: "success", data: { history, total, ... } }
			if (data.status === 'success' && data.data) {
				history = data.data.history || [];
				hasMore = data.data.hasMore || false;
				totalPages = Math.ceil((data.data.total || 0) / pageSize);
			} else {
				throw new Error(data.message || 'Failed to load history');
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
			searchLimit: item.searchLimit,
			restoreResults: true, // Flag to trigger full restore with results
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

	// Reload when page changes
	$: if (currentPage) {
		loadHistory();
	}

	// Reload when user signs in/out
	$: if ($authStore.user !== undefined && !$authStore.loading) {
		loadHistory();
	}
</script>

<div class="px-4 py-8 mx-auto max-w-7xl">
	<!-- Login Prompt for Anonymous Users -->
	{#if !$authStore.user && !$authStore.loading}
		<div class="p-6 mb-6 border border-blue-200 rounded-lg bg-blue-50">
			<div class="flex items-start">
				<div class="flex-shrink-0">
					<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
				</div>
				<div class="flex-1 ml-3">
					<h3 class="text-sm font-medium text-blue-800">Sign in to view your personal search history</h3>
					<div class="mt-2 text-sm text-blue-700">
						<p>You're currently viewing all searches from all users. To see only your searches, please sign in or create an account.</p>
					</div>
					<div class="mt-4">
						<a
							href="/"
							class="inline-flex items-center px-4 py-2 text-sm font-medium text-white transition bg-blue-600 rounded-md hover:bg-blue-700"
						>
							<svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
							</svg>
							Go to Home & Sign In
						</a>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="flex items-center justify-between mb-8">
		<div>
			<h1 class="text-4xl font-bold text-gray-900">Search History</h1>
			<p class="mt-2 text-lg text-gray-600">
				{#if $authStore.user}
					Review and restore your previous searches
				{:else}
					Browsing all searches
				{/if}
			</p>
		</div>
		<a
			href="/"
			class="inline-flex items-center px-4 py-2 text-white transition bg-blue-600 rounded-lg hover:bg-blue-700"
		>
			<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			New Search
		</a>
	</div>

	{#if isLoading}
		<div class="flex items-center justify-center py-12">
			<div class="w-12 h-12 border-b-2 border-blue-600 rounded-full animate-spin"></div>
		</div>
	{:else if error}
		<div class="p-4 text-red-800 border border-red-200 rounded-lg bg-red-50">
			<p class="font-semibold">Error loading search history</p>
			<p class="mt-1 text-sm">{error}</p>
		</div>
	{:else if history.length === 0}
		<div class="py-12 text-center">
			<svg
				class="w-12 h-12 mx-auto text-gray-400"
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
					class="inline-flex items-center px-4 py-2 text-white transition bg-blue-600 rounded-md hover:bg-blue-700"
				>
					<svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					New Search
				</a>
			</div>
		</div>
	{:else}
		<div class="overflow-hidden bg-white rounded-lg shadow">
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y divide-gray-200">
					<thead class="bg-gray-50">
						<tr>
							<th class="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
								Keyword
							</th>
							<th class="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
								Date
							</th>
							<th class="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
								Status
							</th>
							{#if $authStore.user}
								<th class="px-6 py-3 text-xs font-medium tracking-wider text-right text-gray-500 uppercase">
									Limit
								</th>
							{/if}
							<th class="px-6 py-3 text-xs font-medium tracking-wider text-right text-gray-500 uppercase">
								With Email
							</th>
							<th class="px-6 py-3 text-xs font-medium tracking-wider text-right text-gray-500 uppercase">
								With Social
							</th>
							<th class="px-6 py-3 text-xs font-medium tracking-wider text-left text-gray-500 uppercase">
								Filters
							</th>
							{#if $authStore.user}
								<th class="px-6 py-3 text-xs font-medium tracking-wider text-right text-gray-500 uppercase">
									Action
								</th>
							{/if}
						</tr>
					</thead>
					<tbody class="bg-white divide-y divide-gray-200">
						{#each history as item (item.id)}
							<tr class="transition-colors hover:bg-gray-50">
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
								{#if $authStore.user}
									<td class="px-6 py-4 text-right whitespace-nowrap">
										<div class="text-sm text-gray-900">{item.searchLimit || 'N/A'}</div>
									</td>
								{/if}
								<td class="px-6 py-4 text-right whitespace-nowrap">
									<div class="text-sm font-medium text-green-600">{item.channelsWithEmail}</div>
								</td>
								<td class="px-6 py-4 text-right whitespace-nowrap">
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
								{#if $authStore.user}
									<td class="px-6 py-4 text-right whitespace-nowrap">
										<button
											on:click={() => handleRestoreSearch(item)}
											class="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition"
										>
											Restore
										</button>
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		{#if totalPages > 1}
			<div class="flex items-center justify-center gap-2 mt-8">
				<button
					on:click={() => (currentPage = Math.max(1, currentPage - 1))}
					disabled={currentPage === 1}
					class="px-4 py-2 transition bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Previous
				</button>

				<span class="text-sm text-gray-700">
					Page {currentPage} of {totalPages}
				</span>

				<button
					on:click={() => (currentPage = Math.min(totalPages, currentPage + 1))}
					disabled={!hasMore}
					class="px-4 py-2 transition bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Next
				</button>
			</div>
		{/if}
	{/if}
</div>
