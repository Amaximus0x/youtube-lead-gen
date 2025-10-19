import { supabase } from '$lib/server/db/supabase';
import { getScraperInstance } from '$lib/server/youtube/scraper-puppeteer';

export interface EnrichmentJob {
	id: string;
	channel_id: string;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	priority: number;
	attempts: number;
	max_attempts: number;
	error_message?: string;
	created_at: string;
	started_at?: string;
	completed_at?: string;
}

export class EnrichmentService {
	/**
	 * Queue a channel for enrichment
	 */
	static async queueChannel(channelId: string, priority: number = 0): Promise<void> {
		if (!supabase) {
			console.warn('Supabase not configured, skipping enrichment queue');
			return;
		}

		const { error } = await supabase.from('enrichment_jobs').insert({
			channel_id: channelId,
			status: 'pending',
			priority,
			attempts: 0,
			max_attempts: 3
		});

		if (error) {
			// If job already exists, ignore duplicate error
			if (error.code !== '23505') {
				console.error('Error queuing enrichment job:', error);
			}
		}
	}

	/**
	 * Queue multiple channels for enrichment
	 */
	static async queueChannels(channelIds: string[], priority: number = 0): Promise<void> {
		if (!supabase) {
			console.warn('Supabase not configured, skipping enrichment queue');
			return;
		}

		const jobs = channelIds.map((channelId) => ({
			channel_id: channelId,
			status: 'pending' as const,
			priority,
			attempts: 0,
			max_attempts: 3
		}));

		const { error } = await supabase.from('enrichment_jobs').insert(jobs);

		if (error) {
			console.error('Error queuing enrichment jobs:', error);
		}
	}

	/**
	 * Get next pending job to process
	 */
	static async getNextJob(): Promise<EnrichmentJob | null> {
		if (!supabase) return null;

		// Get the next pending job with highest priority
		const { data, error } = await supabase
			.from('enrichment_jobs')
			.select('*')
			.eq('status', 'pending')
			.order('priority', { ascending: false })
			.order('created_at', { ascending: true })
			.limit(1)
			.single();

		if (error || !data) return null;

		// Mark as processing
		await supabase
			.from('enrichment_jobs')
			.update({
				status: 'processing',
				started_at: new Date().toISOString(),
				attempts: data.attempts + 1
			})
			.eq('id', data.id);

		return data as EnrichmentJob;
	}

	/**
	 * Process a single enrichment job
	 */
	static async processJob(job: EnrichmentJob): Promise<void> {
		if (!supabase) return;

		try {
			console.log(`[Enrichment] Processing channel: ${job.channel_id}`);

			// Get channel details from database
			const { data: channel, error: channelError } = await supabase
				.from('channels')
				.select('url')
				.eq('channel_id', job.channel_id)
				.single();

			if (channelError || !channel) {
				throw new Error(`Channel not found: ${job.channel_id}`);
			}

			// Get scraper instance
			const scraper = await getScraperInstance();
			const browser = (scraper as any).browser;

			if (!browser) {
				throw new Error('Browser not initialized');
			}

			// Create a new page for enrichment
			const page = await browser.newPage();

			try {
				// Visit channel page and extract details
				console.log(`[Enrichment] Visiting: ${channel.url}`);

				await page.setExtraHTTPHeaders({
					'User-Agent':
						'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Accept-Language': 'en-US,en;q=0.9'
				});

				// Visit the /about page to get more details
				const aboutUrl = channel.url.endsWith('/')
					? `${channel.url}about`
					: `${channel.url}/about`;
				await page.goto(aboutUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
				await new Promise((resolve) => setTimeout(resolve, 2000));

				// Extract enrichment data
				const enrichmentData = await page.evaluate(() => {
					const result: any = {};

					// Helper function to parse number with K/M/B suffix
					function parseCount(text: string): number | null {
						const match = text.match(/([\d,.]+)\s*([KMB]?)/i);
						if (match) {
							const numStr = match[1].replace(/,/g, '');
							const num = parseFloat(numStr);
							const suffix = match[2]?.toUpperCase() || '';
							const multipliers: Record<string, number> = {
								K: 1000,
								M: 1000000,
								B: 1000000000,
								'': 1
							};
							return Math.floor(num * (multipliers[suffix] || 1));
						}
						return null;
					}

					// Get page text
					const pageText = document.body.innerText;
					const lines = pageText.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

					// Extract subscriber count
					for (const line of lines) {
						if (line.includes('subscriber')) {
							const match = line.match(/([\d,.]+[KMB]?)\s*subscribers?/i);
							if (match) {
								result.subscriberCount = parseCount(match[1]);
								break;
							}
						}
					}

					// Extract description
					const descriptionEl = document.querySelector('#description');
					if (descriptionEl) {
						result.description = descriptionEl.textContent?.trim() || '';
					}

					// Extract emails from page
					const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
					const emails = new Set<string>();
					const pageHTML = document.body.innerHTML;

					const emailMatches = pageHTML.match(emailRegex);
					if (emailMatches) {
						emailMatches.forEach((email) => {
							// Filter out common false positives
							if (
								!email.includes('example.com') &&
								!email.includes('test.com') &&
								!email.includes('youtube.com')
							) {
								emails.add(email.toLowerCase());
							}
						});
					}

					result.emails = Array.from(emails);

					// Extract social links
					const socialLinks: Record<string, string> = {};
					const links = Array.from(document.querySelectorAll('a[href]'));

					links.forEach((link) => {
						const href = (link as HTMLAnchorElement).href;

						if (href.includes('instagram.com/')) socialLinks.instagram = href;
						if (href.includes('twitter.com/') || href.includes('x.com/'))
							socialLinks.twitter = href;
						if (href.includes('facebook.com/')) socialLinks.facebook = href;
						if (href.includes('tiktok.com/')) socialLinks.tiktok = href;
						if (href.includes('discord.gg/') || href.includes('discord.com/'))
							socialLinks.discord = href;
						if (href.includes('twitch.tv/')) socialLinks.twitch = href;
						if (href.includes('linkedin.com/')) socialLinks.linkedin = href;
					});

					result.socialLinks = socialLinks;

					return result;
				});

				console.log(
					`[Enrichment] Extracted data for ${job.channel_id}:`,
					JSON.stringify(enrichmentData, null, 2)
				);

				// Update channel with enriched data
				const updateData: any = {
					enrichment_status: 'enriched',
					enriched_at: new Date().toISOString()
				};

				if (enrichmentData.subscriberCount) {
					updateData.subscriber_count = enrichmentData.subscriberCount;
				}
				if (enrichmentData.description) {
					updateData.description = enrichmentData.description;
				}
				if (enrichmentData.emails && enrichmentData.emails.length > 0) {
					updateData.emails = enrichmentData.emails;
				}
				if (enrichmentData.socialLinks && Object.keys(enrichmentData.socialLinks).length > 0) {
					updateData.social_links = enrichmentData.socialLinks;
				}

				const { error: updateError } = await supabase
					.from('channels')
					.update(updateData)
					.eq('channel_id', job.channel_id);

				if (updateError) {
					console.error('[Enrichment] Error updating channel:', updateError);
					throw updateError;
				}

				// Mark job as completed
				await supabase
					.from('enrichment_jobs')
					.update({
						status: 'completed',
						completed_at: new Date().toISOString()
					})
					.eq('id', job.id);

				console.log(`[Enrichment] Successfully enriched channel: ${job.channel_id}`);
			} finally {
				await page.close();
			}
		} catch (error) {
			console.error(`[Enrichment] Error processing job ${job.id}:`, error);

			// Check if we should retry
			const shouldRetry = job.attempts < job.max_attempts;
			const newStatus = shouldRetry ? 'pending' : 'failed';

			await supabase
				.from('enrichment_jobs')
				.update({
					status: newStatus,
					error_message: error instanceof Error ? error.message : 'Unknown error'
				})
				.eq('id', job.id);

			// Update channel status if failed permanently
			if (!shouldRetry) {
				await supabase
					.from('channels')
					.update({
						enrichment_status: 'failed'
					})
					.eq('channel_id', job.channel_id);
			}
		}
	}

	/**
	 * Get enrichment status for channels
	 */
	static async getEnrichmentStatus(channelIds: string[]): Promise<
		Record<
			string,
			{
				status: string;
				enriched_at?: string;
				subscriber_count?: number;
				emails?: string[];
				social_links?: any;
			}
		>
	> {
		if (!supabase) return {};

		const { data, error } = await supabase
			.from('channels')
			.select('channel_id, enrichment_status, enriched_at, subscriber_count, emails, social_links')
			.in('channel_id', channelIds);

		if (error || !data) return {};

		const statusMap: Record<string, any> = {};
		data.forEach((channel) => {
			statusMap[channel.channel_id] = {
				status: channel.enrichment_status,
				enriched_at: channel.enriched_at,
				subscriber_count: channel.subscriber_count,
				emails: channel.emails,
				social_links: channel.social_links
			};
		});

		return statusMap;
	}

	/**
	 * Process pending jobs (call this from an API endpoint)
	 */
	static async processQueue(maxJobs: number = 5): Promise<number> {
		let processed = 0;

		for (let i = 0; i < maxJobs; i++) {
			const job = await this.getNextJob();
			if (!job) break;

			await this.processJob(job);
			processed++;

			// Add small delay between jobs
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		return processed;
	}
}
