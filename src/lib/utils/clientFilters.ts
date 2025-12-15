/**
 * Client-Side Filtering Utilities
 * Filters are applied in the frontend for instant updates
 * Backend only filters for data completeness
 */

import type { ChannelSearchResult } from '$lib/types/api';

export interface ClientFilters {
  // Subscriber range
  subscriberRanges?: string[]; // e.g., ["0-1k", "1k-10k", "10k-100k"]

  // View count range
  viewRanges?: string[]; // e.g., ["0-10k", "10k-100k"]

  // Country filter
  countries?: string[];

  // Upload date filter
  uploadDateRange?: 'today' | 'this_week' | 'this_month' | '1_6_months' | 'this_year' | '';

  // Average views per video
  avgViewRanges?: string[]; // e.g., ["0-1k", "1k-5k"]

  // Search query (name/description)
  searchQuery?: string;

  // Has email
  hasEmail?: boolean;

  // Has social links
  hasSocialLinks?: boolean;
}

export interface RangeFilter {
  min: number;
  max: number;
  label: string;
  value: string;
}

// Predefined subscriber ranges
export const SUBSCRIBER_RANGES: RangeFilter[] = [
  { min: 0, max: 1000, label: '0 - 1K', value: '0-1k' },
  { min: 1000, max: 10000, label: '1K - 10K', value: '1k-10k' },
  { min: 10000, max: 100000, label: '10K - 100K', value: '10k-100k' },
  { min: 100000, max: 500000, label: '100K - 500K', value: '100k-500k' },
  { min: 500000, max: 1000000, label: '500K - 1M', value: '500k-1m' },
  { min: 1000000, max: Infinity, label: '1M+', value: '1m+' },
];

// Predefined view count ranges
export const VIEW_RANGES: RangeFilter[] = [
  { min: 0, max: 10000, label: '0 - 10K', value: '0-10k' },
  { min: 10000, max: 100000, label: '10K - 100K', value: '10k-100k' },
  { min: 100000, max: 1000000, label: '100K - 1M', value: '100k-1m' },
  { min: 1000000, max: 10000000, label: '1M - 10M', value: '1m-10m' },
  { min: 10000000, max: Infinity, label: '10M+', value: '10m+' },
];

// Predefined average views ranges
export const AVG_VIEW_RANGES: RangeFilter[] = [
  { min: 0, max: 1000, label: '0 - 1K', value: '0-1k' },
  { min: 1000, max: 5000, label: '1K - 5K', value: '1k-5k' },
  { min: 5000, max: 10000, label: '5K - 10K', value: '5k-10k' },
  { min: 10000, max: 50000, label: '10K - 50K', value: '10k-50k' },
  { min: 50000, max: 100000, label: '50K - 100K', value: '50k-100k' },
  { min: 100000, max: Infinity, label: '100K+', value: '100k+' },
];

/**
 * Check if a value falls within any of the selected ranges
 */
function matchesRanges(value: number | undefined | null, selectedRanges: string[], rangeDefinitions: RangeFilter[]): boolean {
  if (!selectedRanges || selectedRanges.length === 0) return true; // No filter active
  if (value === undefined || value === null) return false; // Missing value doesn't match

  return selectedRanges.some(rangeValue => {
    const range = rangeDefinitions.find(r => r.value === rangeValue);
    if (!range) return false;
    return value >= range.min && value < range.max;
  });
}

/**
 * Calculate days since a given date
 */
function calculateDaysSince(dateStr: string): number {
  const date = new Date(dateStr);
  const now = new Date();
  const diffTime = now.getTime() - date.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if a channel matches the upload date filter
 */
function matchesUploadDate(lastPostedVideoDate: string | undefined, uploadDateRange: string): boolean {
  if (!uploadDateRange) return true; // No filter
  if (!lastPostedVideoDate) return true; // Allow if missing (backend enrichment may have failed)

  const daysSince = calculateDaysSince(lastPostedVideoDate);

  switch (uploadDateRange) {
    case 'today':
      return daysSince === 0;
    case 'this_week':
      return daysSince <= 7;
    case 'this_month':
      return daysSince <= 30;
    case '1_6_months':
      return daysSince >= 30 && daysSince <= 180;
    case 'this_year':
      return daysSince <= 365;
    default:
      return true;
  }
}

/**
 * Apply client-side filters to channels
 */
export function applyClientFilters(
  channels: ChannelSearchResult[],
  filters: ClientFilters
): ChannelSearchResult[] {
  return channels.filter(channel => {
    // 1. Subscriber range filter
    if (filters.subscriberRanges && filters.subscriberRanges.length > 0) {
      if (!matchesRanges(channel.subscriberCount, filters.subscriberRanges, SUBSCRIBER_RANGES)) {
        return false;
      }
    }

    // 2. View count range filter
    if (filters.viewRanges && filters.viewRanges.length > 0) {
      if (!matchesRanges(channel.viewCount, filters.viewRanges, VIEW_RANGES)) {
        return false;
      }
    }

    // 3. Average views range filter
    if (filters.avgViewRanges && filters.avgViewRanges.length > 0) {
      if (!matchesRanges(channel.avgRecentViews, filters.avgViewRanges, AVG_VIEW_RANGES)) {
        return false;
      }
    }

    // 4. Country filter
    if (filters.countries && filters.countries.length > 0) {
      if (!channel.country) {
        // Option: exclude channels with unknown country when filter is active
        return false;
      }

      const countryMatch = filters.countries.some(
        filterCountry => filterCountry.toLowerCase() === channel.country!.toLowerCase()
      );
      if (!countryMatch) {
        return false;
      }
    }

    // 5. Upload date filter
    if (filters.uploadDateRange) {
      if (!matchesUploadDate(channel.lastPostedVideoDate, filters.uploadDateRange)) {
        return false;
      }
    }

    // 6. Search query (name/description)
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const query = filters.searchQuery.toLowerCase();
      const nameMatch = channel.name.toLowerCase().includes(query);
      const descMatch = channel.description?.toLowerCase().includes(query);
      if (!nameMatch && !descMatch) {
        return false;
      }
    }

    // 7. Has email filter
    if (filters.hasEmail === true) {
      if (!channel.emails || channel.emails.length === 0) {
        return false;
      }
    }

    // 8. Has social links filter
    if (filters.hasSocialLinks === true) {
      if (!channel.socialLinks || Object.keys(channel.socialLinks).length === 0) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get filter statistics
 */
export function getFilterStats(allChannels: ChannelSearchResult[], filters: ClientFilters) {
  const filtered = applyClientFilters(allChannels, filters);

  return {
    total: allChannels.length,
    filtered: filtered.length,
    hiddenByFilters: allChannels.length - filtered.length,
    percentage: allChannels.length > 0 ? Math.round((filtered.length / allChannels.length) * 100) : 0,
    hasActiveFilters: hasAnyActiveFilters(filters),
  };
}

/**
 * Check if any filters are active
 */
export function hasAnyActiveFilters(filters: ClientFilters): boolean {
  return !!(
    (filters.subscriberRanges && filters.subscriberRanges.length > 0) ||
    (filters.viewRanges && filters.viewRanges.length > 0) ||
    (filters.avgViewRanges && filters.avgViewRanges.length > 0) ||
    (filters.countries && filters.countries.length > 0) ||
    filters.uploadDateRange ||
    (filters.searchQuery && filters.searchQuery.trim()) ||
    filters.hasEmail ||
    filters.hasSocialLinks
  );
}

/**
 * Clear all filters
 */
export function clearAllFilters(): ClientFilters {
  return {
    subscriberRanges: [],
    viewRanges: [],
    avgViewRanges: [],
    countries: [],
    uploadDateRange: '',
    searchQuery: '',
    hasEmail: false,
    hasSocialLinks: false,
  };
}

/**
 * Get unique countries from channels (for dynamic country list)
 */
export function getAvailableCountries(channels: ChannelSearchResult[]): string[] {
  const countries = new Set<string>();

  channels.forEach(channel => {
    if (channel.country && channel.country !== 'Unknown') {
      countries.add(channel.country);
    }
  });

  return Array.from(countries).sort();
}
