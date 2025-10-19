import type { ChannelSearchResult } from './scraper-puppeteer';
import type { FilterConfig } from '$lib/types/models';

export class ChannelFilter {
	/**
	 * Apply all filters to a list of channels
	 */
	applyFilters(channels: ChannelSearchResult[], filters: FilterConfig): ChannelSearchResult[] {
		let filtered = [...channels];

		// Apply subscriber range filter
		if (filters.minSubscribers !== undefined || filters.maxSubscribers !== undefined) {
			filtered = filtered.filter((channel) =>
				this.checkSubscriberRange(channel, filters.minSubscribers, filters.maxSubscribers)
			);
		}

		// Apply music channel exclusion
		if (filters.excludeMusicChannels) {
			filtered = filtered.filter((channel) => !this.isMusicChannel(channel));
		}

		// Apply brand channel exclusion
		if (filters.excludeBrands) {
			filtered = filtered.filter((channel) => !this.isBrandChannel(channel));
		}

		// Apply language filter (basic implementation)
		if (filters.language) {
			filtered = filtered.filter((channel) => this.matchesLanguage(channel, filters.language!));
		}

		return filtered;
	}

	/**
	 * Calculate relevance score for a channel based on keyword
	 */
	calculateRelevanceScore(channel: ChannelSearchResult, keyword: string): number {
		let score = 0;
		const lowerKeyword = keyword.toLowerCase();

		// Name match (highest weight)
		const lowerName = channel.name.toLowerCase();
		if (lowerName.includes(lowerKeyword)) {
			score += 50;
			// Exact match bonus
			if (lowerName === lowerKeyword) {
				score += 30;
			}
		}

		// Description match
		if (channel.description) {
			const lowerDesc = channel.description.toLowerCase();
			if (lowerDesc.includes(lowerKeyword)) {
				score += 20;
			}
		}

		// Subscriber count bonus (logarithmic scale)
		if (channel.subscriberCount) {
			score += Math.min(Math.log10(channel.subscriberCount) * 2, 20);
		}

		// Video count bonus (active channel)
		if (channel.videoCount) {
			score += Math.min(Math.log10(channel.videoCount) * 1.5, 10);
		}

		return Math.min(score, 100);
	}

	/**
	 * Check if channel is within subscriber range
	 */
	private checkSubscriberRange(
		channel: ChannelSearchResult,
		min?: number,
		max?: number
	): boolean {
		if (!channel.subscriberCount) return true; // Include channels with unknown subscriber count

		if (min !== undefined && channel.subscriberCount < min) return false;
		if (max !== undefined && channel.subscriberCount > max) return false;

		return true;
	}

	/**
	 * Detect if channel is a music channel
	 */
	private isMusicChannel(channel: ChannelSearchResult): boolean {
		const musicKeywords = [
			'music',
			'vevo',
			'records',
			'entertainment',
			'audio',
			'songs',
			'official music',
			'topic',
			'hits',
			'soundtrack',
			'official artist channel'
		];

		const lowerName = channel.name.toLowerCase();
		const lowerDesc = (channel.description || '').toLowerCase();

		// Check name
		for (const keyword of musicKeywords) {
			if (lowerName.includes(keyword)) {
				// Exception: channels that have music in context (e.g., "music theory", "music production")
				if (
					lowerName.includes('tutorial') ||
					lowerName.includes('lesson') ||
					lowerName.includes('education') ||
					lowerName.includes('production') ||
					lowerName.includes('theory')
				) {
					continue;
				}
				return true;
			}
		}

		// Check description
		if (lowerDesc.includes('official music video') || lowerDesc.includes('vevo')) {
			return true;
		}

		return false;
	}

	/**
	 * Detect if channel is a brand/corporate channel
	 */
	private isBrandChannel(channel: ChannelSearchResult): boolean {
		const brandIndicators = [
			'official',
			'verified',
			'corp',
			'inc.',
			'llc',
			'ltd',
			'company',
			'corporation',
			'enterprises',
			'global',
			'worldwide',
			'international'
		];

		const lowerName = channel.name.toLowerCase();
		const lowerDesc = (channel.description || '').toLowerCase();

		// Check for brand indicators
		for (const indicator of brandIndicators) {
			if (lowerName.includes(indicator) || lowerDesc.includes(indicator)) {
				// Exception: personal brands or creator channels with "official"
				if (
					lowerDesc.includes('creator') ||
					lowerDesc.includes('youtuber') ||
					lowerDesc.includes('content creator') ||
					lowerDesc.includes('influencer')
				) {
					continue;
				}
				return true;
			}
		}

		// Check for very high subscriber count (likely brands)
		if (channel.subscriberCount && channel.subscriberCount > 5000000) {
			// 5M+ subs, likely a brand
			// Exception: known individual creators can have high subs
			if (
				lowerDesc.includes('creator') ||
				lowerDesc.includes('personal') ||
				lowerName.split(' ').length <= 3 // Short names are often individuals
			) {
				return false;
			}
			return true;
		}

		return false;
	}

	/**
	 * Check if channel matches language (basic implementation)
	 */
	private matchesLanguage(channel: ChannelSearchResult, language: string): boolean {
		// This is a basic implementation - in production, you'd use a language detection library
		// For now, we'll do a simple check
		if (language === 'en' || language === 'english') {
			// Assume English by default unless detected otherwise
			return true;
		}

		// For other languages, you could implement language detection
		// using libraries like franc or language-detect
		return true;
	}

	/**
	 * Estimate upload frequency based on video count
	 * (This is a rough estimate - for accurate data, you'd need to check actual upload dates)
	 */
	estimateUploadFrequency(channel: ChannelSearchResult): 'daily' | 'weekly' | 'monthly' | 'unknown' {
		if (!channel.videoCount) return 'unknown';

		// Rough estimation based on video count
		// These are arbitrary thresholds for demonstration
		if (channel.videoCount > 1000) return 'daily';
		if (channel.videoCount > 200) return 'weekly';
		if (channel.videoCount > 50) return 'monthly';

		return 'unknown';
	}
}
