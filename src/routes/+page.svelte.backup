<script lang="ts">
	import SearchForm from '$lib/components/search/SearchForm.svelte';
	import ChannelTable from '$lib/components/results/ChannelTable.svelte';
	import { channelsStore } from '$lib/stores/channels';
	import { exportChannelsToCSV } from '$lib/utils/export';

	let activeTab: 'generate' | 'extract' = 'generate';

	$: hasResults = $channelsStore.channels.length > 0;

	function handleExportData() {
		exportChannelsToCSV($channelsStore.channels);
	}
</script>

<div class="mx-auto max-w-7xl">
	<div class="mb-12 text-center">
		<h1 class="mb-4 text-4xl font-bold text-gray-900">YouTube Lead Generation</h1>
		<p class="text-lg text-gray-600">
			Automated lead generation tool that discovers YouTube channels and extracts contact
			information
		</p>
	</div>

	<!-- Two-Step CTAs -->
	<div class="flex justify-center gap-4 mb-8">
		<button
			class="px-8 py-3 text-lg text-black transition-all btn btn-primary"
			class:ring-4={activeTab === 'generate'}
			class:ring-blue-300={activeTab === 'generate'}
			on:click={() => (activeTab = 'generate')}
		>
			<svg class="inline w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			Generate Leads
		</button>
		<button
			class="px-8 py-3 text-lg transition-all btn btn-secondary"
			class:ring-4={activeTab === 'extract'}
			class:ring-purple-300={activeTab === 'extract'}
			on:click={() => (activeTab = 'extract')}
		>
			<svg class="inline w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
				/>
			</svg>
			Extract Emails
		</button>
	</div>

	<!-- Dynamic Content -->
	{#if activeTab === 'generate'}
		<div class="mb-8">
			<SearchForm />
		</div>

		<!-- Results Section -->
		{#if hasResults || $channelsStore.isSearching}
			<div class="card">
				<h2 class="mb-6 text-xl font-bold text-gray-900">Search Results</h2>

				{#if $channelsStore.isSearching}
					<div class="py-12 text-center">
						<svg
							class="w-12 h-12 mx-auto mb-4 text-blue-600 animate-spin"
							viewBox="0 0 24 24"
						>
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
						<p class="text-lg text-gray-600">Searching YouTube channels...</p>
						<p class="mt-2 text-sm text-gray-500">This may take some time</p>
					</div>
				{:else}
					<ChannelTable />
				{/if}
			</div>
		{/if}
	{:else}
		<div class="card">
			<h2 class="mb-6 text-2xl font-bold text-gray-900">Extract Emails from Channels</h2>

			{#if hasResults}
				<div class="py-8 text-center">
					<svg
						class="w-12 h-12 mx-auto mb-4 text-gray-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
					<p class="mb-4 text-gray-600">
						You have {$channelsStore.channels.length} channel{$channelsStore.channels.length !==
						1
							? 's'
							: ''} ready for email extraction.
					</p>
					<p class="mb-6 text-sm text-gray-500">
						Email extraction from social media will be implemented in Phase 2.
					</p>
					<div class="flex justify-center">
						<button class="btn btn-secondary" on:click={handleExportData}>
							<svg
								class="inline w-5 h-5 mr-2"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
								/>
							</svg>
							Export Data (CSV)
						</button>
					</div>
				</div>
			{:else}
				<div class="py-12 text-center text-gray-500">
					<svg
						class="w-12 h-12 mx-auto mb-4 text-gray-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
						/>
					</svg>
					<p class="mb-2 text-lg">No channels found yet</p>
					<p>Start by generating leads first, then come back here to extract emails.</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
