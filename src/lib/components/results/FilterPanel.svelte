<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ClientFilters } from '$lib/utils/clientFilters';
  import {
    SUBSCRIBER_RANGES,
    VIEW_RANGES,
    AVG_VIEW_RANGES,
    getAvailableCountries,
    hasAnyActiveFilters,
  } from '$lib/utils/clientFilters';
  import type { ChannelSearchResult } from '$lib/types/api';

  export let filters: ClientFilters;
  export let allChannels: ChannelSearchResult[] = [];
  export let filteredCount: number;
  export let totalCount: number;

  const dispatch = createEventDispatcher<{
    filterChange: ClientFilters;
    clearFilters: void;
  }>();

  // Get dynamic country list from actual channel data
  $: availableCountries = getAvailableCountries(allChannels);

  // Track if filters panel is expanded
  let isExpanded = false;

  // Toggle range selection
  function toggleRange(ranges: string[], value: string) {
    if (ranges.includes(value)) {
      return ranges.filter(r => r !== value);
    } else {
      return [...ranges, value];
    }
  }

  // Handle subscriber range toggle
  function handleSubscriberRangeToggle(value: string) {
    filters.subscriberRanges = toggleRange(filters.subscriberRanges || [], value);
    dispatch('filterChange', filters);
  }

  // Handle view range toggle
  function handleViewRangeToggle(value: string) {
    filters.viewRanges = toggleRange(filters.viewRanges || [], value);
    dispatch('filterChange', filters);
  }

  // Handle avg view range toggle
  function handleAvgViewRangeToggle(value: string) {
    filters.avgViewRanges = toggleRange(filters.avgViewRanges || [], value);
    dispatch('filterChange', filters);
  }

  // Handle country toggle
  function handleCountryToggle(country: string) {
    if (!filters.countries) filters.countries = [];

    if (filters.countries.includes(country)) {
      filters.countries = filters.countries.filter(c => c !== country);
    } else {
      filters.countries = [...filters.countries, country];
    }

    dispatch('filterChange', filters);
  }

  // Handle upload date change
  function handleUploadDateChange(range: string) {
    filters.uploadDateRange = filters.uploadDateRange === range ? '' : range;
    dispatch('filterChange', filters);
  }

  // Handle search query change (with debounce)
  let searchTimeout: number;
  function handleSearchQueryChange(event: Event) {
    const input = event.target as HTMLInputElement;
    clearTimeout(searchTimeout);

    searchTimeout = window.setTimeout(() => {
      filters.searchQuery = input.value;
      dispatch('filterChange', filters);
    }, 300); // Debounce 300ms
  }

  // Handle boolean filters
  function handleHasEmailToggle() {
    filters.hasEmail = !filters.hasEmail;
    dispatch('filterChange', filters);
  }

  function handleHasSocialLinksToggle() {
    filters.hasSocialLinks = !filters.hasSocialLinks;
    dispatch('filterChange', filters);
  }

  // Clear all filters
  function handleClearAll() {
    dispatch('clearFilters');
  }

  $: hasFilters = hasAnyActiveFilters(filters);
  $: hiddenCount = totalCount - filteredCount;
</script>

<div class="bg-white border border-gray-200 rounded-lg shadow-sm">
  <!-- Filter Header -->
  <div class="flex items-center justify-between p-4 border-b border-gray-200">
    <div class="flex items-center gap-3">
      <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
        />
      </svg>
      <h3 class="text-lg font-semibold text-gray-900">Filters</h3>
      {#if hasFilters}
        <span class="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-full">
          Active
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <!-- Results Counter -->
      <div class="text-sm text-gray-600">
        <span class="font-semibold text-gray-900">{filteredCount}</span>
        <span class="text-gray-500">of</span>
        <span class="font-semibold text-gray-900">{totalCount}</span>
        {#if hiddenCount > 0}
          <span class="text-red-600 ml-1">({hiddenCount} hidden)</span>
        {/if}
      </div>

      <!-- Toggle Button -->
      <button
        type="button"
        on:click={() => (isExpanded = !isExpanded)}
        class="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
        aria-label={isExpanded ? 'Collapse filters' : 'Expand filters'}
      >
        <svg
          class="w-5 h-5 transform transition-transform {isExpanded ? 'rotate-180' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Filter Content -->
  {#if isExpanded}
    <div class="p-4 space-y-6">
      <!-- Subscriber Range -->
      <div>
        <div class="block mb-2 text-sm font-medium text-gray-700">Subscribers</div>
        <div class="flex flex-wrap gap-2">
          {#each SUBSCRIBER_RANGES as range}
            <button
              type="button"
              on:click={() => handleSubscriberRangeToggle(range.value)}
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.subscriberRanges?.includes(
                range.value
              )
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
            >
              {range.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- View Count Range -->
      <div>
        <div class="block mb-2 text-sm font-medium text-gray-700">Total Views</div>
        <div class="flex flex-wrap gap-2">
          {#each VIEW_RANGES as range}
            <button
              type="button"
              on:click={() => handleViewRangeToggle(range.value)}
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.viewRanges?.includes(
                range.value
              )
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
            >
              {range.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Average Views Range -->
      <div>
        <div class="block mb-2 text-sm font-medium text-gray-700">Avg. Views per Video</div>
        <div class="flex flex-wrap gap-2">
          {#each AVG_VIEW_RANGES as range}
            <button
              type="button"
              on:click={() => handleAvgViewRangeToggle(range.value)}
              class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.avgViewRanges?.includes(
                range.value
              )
                ? 'bg-purple-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
            >
              {range.label}
            </button>
          {/each}
        </div>
      </div>

      <!-- Country Filter -->
      {#if availableCountries.length > 0}
        <div>
          <div class="block mb-2 text-sm font-medium text-gray-700">
            Country ({availableCountries.length} available)
          </div>
          <div class="flex flex-wrap gap-2">
            {#each availableCountries as country}
              <button
                type="button"
                on:click={() => handleCountryToggle(country)}
                class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.countries?.includes(
                  country
                )
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
              >
                {country}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Upload Date Filter -->
      <div>
        <div class="block mb-2 text-sm font-medium text-gray-700">Last Upload</div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            on:click={() => handleUploadDateChange('today')}
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.uploadDateRange ===
            'today'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
          >
            Today
          </button>
          <button
            type="button"
            on:click={() => handleUploadDateChange('this_week')}
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.uploadDateRange ===
            'this_week'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
          >
            This Week
          </button>
          <button
            type="button"
            on:click={() => handleUploadDateChange('this_month')}
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.uploadDateRange ===
            'this_month'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
          >
            This Month
          </button>
          <button
            type="button"
            on:click={() => handleUploadDateChange('this_year')}
            class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors {filters.uploadDateRange ===
            'this_year'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
          >
            This Year
          </button>
        </div>
      </div>

      <!-- Boolean Filters -->
      <div class="space-y-2">
        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hasEmail || false}
            on:change={handleHasEmailToggle}
            class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          />
          <span class="text-sm text-gray-700">Has Email</span>
        </label>

        <label class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.hasSocialLinks || false}
            on:change={handleHasSocialLinksToggle}
            class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
          />
          <span class="text-sm text-gray-700">Has Social Links</span>
        </label>
      </div>

      <!-- Clear Filters Button -->
      {#if hasFilters}
        <div class="pt-4 border-t border-gray-200">
          <button
            type="button"
            on:click={handleClearAll}
            class="w-full px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      {/if}
    </div>
  {/if}
</div>
