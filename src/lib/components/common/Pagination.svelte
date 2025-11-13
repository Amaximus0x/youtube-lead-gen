<script lang="ts">
	export let currentPage: number;
	export let totalPages: number;
	export let onPageChange: (page: number) => void;
	export let loading: boolean = false;

	// Generate page numbers to display
	function getPageNumbers(): (number | string)[] {
		const pages: (number | string)[] = [];
		const maxPagesToShow = 7;

		if (totalPages <= maxPagesToShow) {
			// Show all pages if total is small
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i);
			}
		} else {
			// Always show first page
			pages.push(1);

			// Calculate range around current page
			const showRange = 2;
			let startPage = Math.max(2, currentPage - showRange);
			let endPage = Math.min(totalPages - 1, currentPage + showRange);

			// Add ellipsis after first page if needed
			if (startPage > 2) {
				pages.push('...');
			}

			// Add pages around current page
			for (let i = startPage; i <= endPage; i++) {
				pages.push(i);
			}

			// Add ellipsis before last page if needed
			if (endPage < totalPages - 1) {
				pages.push('...');
			}

			// Always show last page
			pages.push(totalPages);
		}

		return pages;
	}

	$: pageNumbers = getPageNumbers();
	$: hasPrevious = currentPage > 1;
	$: hasNext = currentPage < totalPages;
</script>

<div class="flex items-center justify-center gap-2 py-4">
	<!-- Previous Button -->
	<button
		on:click={() => onPageChange(currentPage - 1)}
		disabled={!hasPrevious || loading}
		class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
		title="Previous page"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
		</svg>
	</button>

	<!-- Page Numbers -->
	<div class="flex gap-1">
		{#each pageNumbers as page}
			{#if page === '...'}
				<span class="px-4 py-2 text-sm text-gray-700">...</span>
			{:else}
				<button
					on:click={() => onPageChange(page as number)}
					disabled={loading || currentPage === page}
					class="px-4 py-2 text-sm font-medium rounded-md transition-colors {currentPage === page
						? 'bg-blue-600 text-white'
						: 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'} disabled:cursor-not-allowed"
				>
					{page}
				</button>
			{/if}
		{/each}
	</div>

	<!-- Next Button -->
	<button
		on:click={() => onPageChange(currentPage + 1)}
		disabled={!hasNext || loading}
		class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
		title="Next page"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</button>

	<!-- Page Info -->
	{#if totalPages > 0}
		<span class="ml-4 text-sm text-gray-700">
			Page {currentPage} of {totalPages}
		</span>
	{/if}
</div>
