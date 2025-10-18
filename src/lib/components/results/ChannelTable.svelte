<script lang="ts">
	import { channelsStore } from '$lib/stores/channels';
	import type { ChannelSearchResult } from '$lib/server/youtube/scraper-v2';

	$: channels = $channelsStore.channels;
	$: stats = $channelsStore.stats;

	function formatSubscribers(count: number | undefined): string {
		if (!count) return 'Unknown';
		if (count >= 1000000) {
			return `${(count / 1000000).toFixed(1)}M`;
		}
		if (count >= 1000) {
			return `${(count / 1000).toFixed(1)}K`;
		}
		return count.toString();
	}

	function formatRelevance(score: number): string {
		return `${Math.round(score)}%`;
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
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Channel
					</th>
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Subscribers
					</th>
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Videos
					</th>
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Relevance
					</th>
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Email Status
					</th>
					<th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
						Actions
					</th>
				</tr>
			</thead>
			<tbody class="bg-white divide-y divide-gray-200">
				{#each channels as channel (channel.channelId)}
					<tr class="hover:bg-gray-50 transition-colors">
						<td class="px-6 py-4">
							<div class="flex items-center">
								{#if channel.thumbnailUrl}
									<img
										src={channel.thumbnailUrl}
										alt={channel.name}
										class="h-10 w-10 rounded-full mr-3"
									/>
								{/if}
								<div>
									<div class="text-sm font-medium text-gray-900">
										{channel.name}
									</div>
									{#if channel.description}
										<div class="text-sm text-gray-500 truncate max-w-md">
											{channel.description}
										</div>
									{/if}
								</div>
							</div>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="text-sm text-gray-900">
								{formatSubscribers(channel.subscriberCount)}
							</div>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="text-sm text-gray-900">
								{channel.videoCount || 'Unknown'}
							</div>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<div class="flex items-center">
								<div class="w-full bg-gray-200 rounded-full h-2.5 mr-2" style="width: 60px;">
									<div
										class="bg-blue-600 h-2.5 rounded-full"
										style="width: {channel.relevanceScore}%"
									></div>
								</div>
								<span class="text-sm text-gray-900">{formatRelevance(channel.relevanceScore)}</span>
							</div>
						</td>
						<td class="px-6 py-4 whitespace-nowrap">
							<span
								class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800"
							>
								Pending
							</span>
						</td>
						<td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
							<a
								href={channel.url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-blue-600 hover:text-blue-900 mr-3"
							>
								Visit
							</a>
							<button class="text-green-600 hover:text-green-900">Extract Email</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="mt-4 text-sm text-gray-500 text-center">
		Showing {channels.length} channel{channels.length !== 1 ? 's' : ''}
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
