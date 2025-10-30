<script lang="ts">
	import { channelsStore } from '$lib/stores/channels';

	let keyword = '';
	let limit = 50;
	let showAdvanced = false;

	// Filter options
	let minSubscribers: number | undefined = undefined;
	let maxSubscribers: number | undefined = undefined;
	let country = '';
	let excludeMusicChannels = true;
	let excludeBrands = true;
	let language = '';

	async function handleSearch() {
		if (!keyword.trim()) {
			alert('Please enter a keyword');
			return;
		}

		channelsStore.setSearching(true);

		try {
			const response = await fetch('/api/youtube/search', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					keyword: keyword.trim(),
					limit,
					filters: {
						minSubscribers: minSubscribers || undefined,
						maxSubscribers: maxSubscribers || undefined,
						country: country || undefined,
						excludeMusicChannels,
						excludeBrands,
						language: language || undefined
					}
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.message || data.error || 'Search failed');
			}

			channelsStore.setChannels(data.channels, data.stats, data.pagination);

			// If enrichment is queued, start polling for updates
			if (data.enrichmentQueued && data.channels.length > 0) {
				const channelIds = data.channels.map((c: any) => c.channelId);
				startEnrichmentPolling(channelIds);
			}
		} catch (error) {
			console.error('Search error:', error);
			channelsStore.setError(
				error instanceof Error ? error.message : 'An error occurred while searching'
			);
		}
	}

	let enrichmentPollingInterval: number | null = null;

	function startEnrichmentPolling(channelIds: string[]) {
		// Clear any existing polling
		if (enrichmentPollingInterval) {
			clearInterval(enrichmentPollingInterval);
		}

		console.log('[Polling] Starting enrichment polling for', channelIds.length, 'channels');

		// Poll every 10 seconds
		enrichmentPollingInterval = setInterval(async () => {
			try {
				const response = await fetch('/api/youtube/enrichment-status', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({ channelIds })
				});

				const data = await response.json();

				if (data.success && data.statuses) {
					// Update channels with enrichment data
					channelsStore.updateEnrichmentData(data.statuses);

					// Check if all channels are enriched
					const allEnriched = Object.values(data.statuses).every(
						(status: any) => status.status === 'enriched' || status.status === 'failed'
					);

					if (allEnriched) {
						console.log('[Polling] All channels enriched, stopping polling');
						if (enrichmentPollingInterval) {
							clearInterval(enrichmentPollingInterval);
							enrichmentPollingInterval = null;
						}
					}
				}
			} catch (error) {
				console.error('[Polling] Error fetching enrichment status:', error);
			}
		}, 10000); // Poll every 10 seconds

		// Stop polling after 5 minutes
		setTimeout(() => {
			if (enrichmentPollingInterval) {
				console.log('[Polling] Timeout reached, stopping polling');
				clearInterval(enrichmentPollingInterval);
				enrichmentPollingInterval = null;
			}
		}, 300000); // 5 minutes
	}

	function handleReset() {
		keyword = '';
		limit = 50;
		minSubscribers = undefined;
		maxSubscribers = undefined;
		country = '';
		excludeMusicChannels = true;
		excludeBrands = true;
		language = '';
		channelsStore.reset();
	}
</script>

<div class="bg-white p-6 rounded-lg shadow-md">
	<h2 class="text-2xl font-bold mb-4 text-gray-800">Search YouTube Channels</h2>

	<form on:submit|preventDefault={handleSearch} class="space-y-4">
		<!-- Keyword Input -->
		<div>
			<label for="keyword" class="block text-sm font-medium text-gray-700 mb-2">
				Keyword or Niche *
			</label>
			<input
				type="text"
				id="keyword"
				bind:value={keyword}
				placeholder="e.g., tech reviews, cooking, gaming"
				class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				required
			/>
			<p class="mt-1 text-sm text-gray-500">Enter a keyword to search for relevant channels</p>
		</div>

		<!-- Limit Input -->
		<div>
			<label for="limit" class="block text-sm font-medium text-gray-700 mb-2">
				Number of Results
			</label>
			<input
				type="number"
				id="limit"
				bind:value={limit}
				min="10"
				max="100"
				step="10"
				class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
			/>
		</div>

		<!-- Advanced Filters Toggle -->
		<button
			type="button"
			on:click={() => (showAdvanced = !showAdvanced)}
			class="text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center gap-2"
		>
			<svg
				class="w-4 h-4 transform transition-transform {showAdvanced ? 'rotate-90' : ''}"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
			Advanced Filters
		</button>

		<!-- Advanced Filters -->
		{#if showAdvanced}
			<div class="pl-6 space-y-4 border-l-2 border-blue-200">
				<!-- Subscriber Range -->
				<div class="grid grid-cols-2 gap-4">
					<div>
						<label for="minSubs" class="block text-sm font-medium text-gray-700 mb-2">
							Min Subscribers
						</label>
						<input
							type="number"
							id="minSubs"
							bind:value={minSubscribers}
							placeholder="e.g., 1000"
							class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						/>
					</div>
					<div>
						<label for="maxSubs" class="block text-sm font-medium text-gray-700 mb-2">
							Max Subscribers
						</label>
						<input
							type="number"
							id="maxSubs"
							bind:value={maxSubscribers}
							placeholder="e.g., 100000"
							class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
						/>
					</div>
				</div>

				<!-- Exclusion Filters -->
				<div class="space-y-2">
					<label class="flex items-center">
						<input
							type="checkbox"
							bind:checked={excludeMusicChannels}
							class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<span class="ml-2 text-sm text-gray-700">Exclude music channels</span>
					</label>

					<label class="flex items-center">
						<input
							type="checkbox"
							bind:checked={excludeBrands}
							class="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<span class="ml-2 text-sm text-gray-700">Exclude brand channels</span>
					</label>
				</div>

				<!-- Country Filter -->
				<div>
					<label for="country" class="block text-sm font-medium text-gray-700 mb-2">
						Country (optional)
					</label>
					<select
						id="country"
						bind:value={country}
						class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					>
						<option value="">Any country</option>
						<option value="United States">United States</option>
						<option value="India">India</option>
						<option value="United Kingdom">United Kingdom</option>
						<option value="Canada">Canada</option>
						<option value="Australia">Australia</option>
						<option value="Germany">Germany</option>
						<option value="France">France</option>
						<option value="Brazil">Brazil</option>
						<option value="Mexico">Mexico</option>
						<option value="Japan">Japan</option>
						<option value="South Korea">South Korea</option>
						<option value="Spain">Spain</option>
						<option value="Italy">Italy</option>
						<option value="Netherlands">Netherlands</option>
						<option value="Philippines">Philippines</option>
						<option value="Indonesia">Indonesia</option>
					</select>
				</div>

				<!-- Language Filter -->
				<div>
					<label for="language" class="block text-sm font-medium text-gray-700 mb-2">
						Language (optional)
					</label>
					<select
						id="language"
						bind:value={language}
						class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					>
						<option value="">Any language</option>
						<option value="en">English</option>
						<option value="es">Spanish</option>
						<option value="fr">French</option>
						<option value="de">German</option>
						<option value="pt">Portuguese</option>
					</select>
				</div>
			</div>
		{/if}

		<!-- Action Buttons -->
		<div class="flex gap-3 pt-4">
			<button
				type="submit"
				disabled={$channelsStore.isSearching}
				class="flex-1 bg-blue-600 text-white px-6 py-3 rounded-md font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
			>
				{#if $channelsStore.isSearching}
					<svg class="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
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
					Searching...
				{:else}
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
					Search Channels
				{/if}
			</button>

			<button
				type="button"
				on:click={handleReset}
				class="px-6 py-3 border border-gray-300 rounded-md font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
			>
				Reset
			</button>
		</div>
	</form>

	<!-- Error Display -->
	{#if $channelsStore.error}
		<div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
			<div class="flex items-center">
				<svg class="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
						clip-rule="evenodd"
					/>
				</svg>
				<span class="text-sm text-red-700">{$channelsStore.error}</span>
			</div>
		</div>
	{/if}
</div>
