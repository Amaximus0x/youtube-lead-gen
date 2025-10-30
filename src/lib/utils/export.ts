import type { ChannelSearchResult } from '$lib/server/youtube/scraper-puppeteer';

/**
 * Escapes CSV field values to handle commas, quotes, and newlines
 */
function escapeCSVField(field: string | number | undefined | null): string {
	if (field === undefined || field === null) {
		return '';
	}

	const value = String(field);

	// If the field contains comma, quote, or newline, wrap it in quotes and escape quotes
	if (value.includes(',') || value.includes('"') || value.includes('\n')) {
		return `"${value.replace(/"/g, '""')}"`;
	}

	return value;
}

/**
 * Converts channel data to CSV format and triggers download
 */
export function exportChannelsToCSV(channels: ChannelSearchResult[]): void {
	if (!channels || channels.length === 0) {
		alert('No channel data to export');
		return;
	}

	// Define CSV headers
	const headers = [
		'Channel Name',
		'URL',
		'Subscriber Count',
		'View Count',
		'Video Count',
		'Country',
		'Description',
		'Emails',
		'Instagram',
		'Twitter',
		'Facebook',
		'TikTok',
		'Discord',
		'Twitch',
		'LinkedIn',
		'Website'
	];

	// Create CSV rows
	const rows = channels.map((channel) => {
		return [
			escapeCSVField(channel.name),
			escapeCSVField(channel.url),
			escapeCSVField(channel.subscriberCount),
			escapeCSVField(channel.viewCount),
			escapeCSVField(channel.videoCount),
			escapeCSVField(channel.country),
			escapeCSVField(channel.description),
			escapeCSVField(channel.emails?.join('; ') || ''), // Multiple emails separated by semicolon
			escapeCSVField(channel.socialLinks?.instagram),
			escapeCSVField(channel.socialLinks?.twitter),
			escapeCSVField(channel.socialLinks?.facebook),
			escapeCSVField(channel.socialLinks?.tiktok),
			escapeCSVField(channel.socialLinks?.discord),
			escapeCSVField(channel.socialLinks?.twitch),
			escapeCSVField(channel.socialLinks?.linkedin),
			escapeCSVField(channel.socialLinks?.website)
		].join(',');
	});

	// Combine headers and rows
	const csvContent = [headers.join(','), ...rows].join('\n');

	// Create blob and trigger download
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	// Generate filename with timestamp
	const timestamp = new Date().toISOString().slice(0, 10);
	link.setAttribute('href', url);
	link.setAttribute('download', `youtube-channels-${timestamp}.csv`);
	link.style.visibility = 'hidden';

	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);

	// Clean up the URL object
	URL.revokeObjectURL(url);
}
