/**
 * Utility for extracting contact information from channel descriptions and about pages
 */

export interface ContactInfo {
	emails: string[];
	socialLinks: {
		instagram?: string;
		twitter?: string;
		facebook?: string;
		tiktok?: string;
		discord?: string;
		twitch?: string;
		linkedin?: string;
		website?: string;
	};
}

/**
 * Extract email addresses from text
 */
export function extractEmails(text: string): string[] {
	if (!text) return [];

	const emails = new Set<string>();

	// Pattern 1: Standard email format
	const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
	const matches = text.matchAll(emailRegex);

	for (const match of matches) {
		const email = match[1].toLowerCase().trim();

		// Filter out common false positives
		if (
			!email.includes('example.com') &&
			!email.includes('domain.com') &&
			!email.includes('email.com') &&
			!email.includes('yourname@') &&
			!email.includes('name@')
		) {
			emails.add(email);
		}
	}

	// Pattern 2: Email with spaces (e.g., "contact @ example . com")
	const spacedEmailRegex =
		/([a-zA-Z0-9._-]+)\s*@\s*([a-zA-Z0-9._-]+)\s*\.\s*([a-zA-Z0-9_-]+)/gi;
	const spacedMatches = text.matchAll(spacedEmailRegex);

	for (const match of spacedMatches) {
		const email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase().trim();
		if (!email.includes('example.com')) {
			emails.add(email);
		}
	}

	// Pattern 3: Email with "at" and "dot" replacements (e.g., "contact at example dot com")
	const textualEmailRegex =
		/([a-zA-Z0-9._-]+)\s+(?:at|@)\s+([a-zA-Z0-9._-]+)\s+(?:dot|\.)\s+([a-zA-Z0-9_-]+)/gi;
	const textualMatches = text.matchAll(textualEmailRegex);

	for (const match of textualMatches) {
		const email = `${match[1]}@${match[2]}.${match[3]}`.toLowerCase().trim();
		if (!email.includes('example.com')) {
			emails.add(email);
		}
	}

	return Array.from(emails);
}

/**
 * Extract social media links from text and HTML
 */
export function extractSocialLinks(text: string, html?: string): ContactInfo['socialLinks'] {
	const links: ContactInfo['socialLinks'] = {};

	const combinedText = html ? `${text}\n${html}` : text;

	// Instagram
	const igMatch = combinedText.match(
		/(?:instagram\.com\/|@)([a-zA-Z0-9._]+)|ig:\s*@?([a-zA-Z0-9._]+)/i
	);
	if (igMatch) {
		const username = igMatch[1] || igMatch[2];
		links.instagram = `https://instagram.com/${username}`;
	}

	// Twitter/X
	const twitterMatch = combinedText.match(
		/(?:twitter\.com\/|x\.com\/|@)([a-zA-Z0-9_]+)|twitter:\s*@?([a-zA-Z0-9_]+)/i
	);
	if (twitterMatch) {
		const username = twitterMatch[1] || twitterMatch[2];
		links.twitter = `https://twitter.com/${username}`;
	}

	// Facebook
	const fbMatch = combinedText.match(
		/(?:facebook\.com\/|fb\.com\/|fb\.me\/)([a-zA-Z0-9.]+)/i
	);
	if (fbMatch) {
		links.facebook = `https://facebook.com/${fbMatch[1]}`;
	}

	// TikTok
	const tiktokMatch = combinedText.match(/(?:tiktok\.com\/@?)([a-zA-Z0-9._]+)/i);
	if (tiktokMatch) {
		links.tiktok = `https://tiktok.com/@${tiktokMatch[1]}`;
	}

	// Discord
	const discordMatch = combinedText.match(
		/(?:discord\.gg\/|discord\.com\/invite\/)([a-zA-Z0-9]+)/i
	);
	if (discordMatch) {
		links.discord = `https://discord.gg/${discordMatch[1]}`;
	}

	// Twitch
	const twitchMatch = combinedText.match(/(?:twitch\.tv\/)([a-zA-Z0-9_]+)/i);
	if (twitchMatch) {
		links.twitch = `https://twitch.tv/${twitchMatch[1]}`;
	}

	// LinkedIn
	const linkedinMatch = combinedText.match(
		/(?:linkedin\.com\/in\/|linkedin\.com\/company\/)([a-zA-Z0-9-]+)/i
	);
	if (linkedinMatch) {
		links.linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;
	}

	// Generic website (look for https:// or http:// links that aren't social media)
	const websiteMatch = combinedText.match(
		/(https?:\/\/(?!(?:youtube|instagram|twitter|x\.com|facebook|tiktok|discord|twitch|linkedin))[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i
	);
	if (websiteMatch) {
		links.website = websiteMatch[1];
	}

	return links;
}

/**
 * Extract all contact information from text and HTML
 */
export function extractContactInfo(text: string, html?: string): ContactInfo {
	return {
		emails: extractEmails(text),
		socialLinks: extractSocialLinks(text, html)
	};
}

/**
 * Format email for display (obscure for privacy)
 */
export function obscureEmail(email: string): string {
	const [local, domain] = email.split('@');
	if (!local || !domain) return email;

	const obscuredLocal = local.length > 3 ? local.substring(0, 2) + '***' : '***';
	return `${obscuredLocal}@${domain}`;
}
