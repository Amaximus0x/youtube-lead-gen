// Simple test script to debug YouTube scraping
import { chromium } from 'playwright';

async function testScraper() {
	console.log('Starting YouTube scraper test...\n');

	const browser = await chromium.launch({
		headless: false, // Show browser for debugging
		args: ['--no-sandbox', '--disable-setuid-sandbox']
	});

	const page = await browser.newPage();

	try {
		// Set user agent
		await page.setExtraHTTPHeaders({
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'Accept-Language': 'en-US,en;q=0.9'
		});

		const keyword = 'tech reviews';
		const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`;

		console.log('Navigating to:', searchUrl);
		await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });

		console.log('Page loaded, waiting for content...');
		await page.waitForTimeout(3000);

		// Check what's on the page
		const pageInfo = await page.evaluate(() => {
			const channelRenderers = document.querySelectorAll('ytd-channel-renderer');
			const videoRenderers = document.querySelectorAll('ytd-video-renderer');
			const itemSections = document.querySelectorAll('ytd-item-section-renderer');

			// Try to find channel links
			const channelLinks = Array.from(document.querySelectorAll('a')).filter(a =>
				a.href && (a.href.includes('/channel/') || a.href.includes('/@'))
			);

			return {
				channelRenderers: channelRenderers.length,
				videoRenderers: videoRenderers.length,
				itemSections: itemSections.length,
				channelLinks: channelLinks.length,
				firstChannelLink: channelLinks[0]?.href || 'none',
				htmlSnippet: document.body.innerHTML.substring(0, 1000)
			};
		});

		console.log('\n=== Page Analysis ===');
		console.log('Channel Renderers:', pageInfo.channelRenderers);
		console.log('Video Renderers:', pageInfo.videoRenderers);
		console.log('Item Sections:', pageInfo.itemSections);
		console.log('Channel Links:', pageInfo.channelLinks);
		console.log('First Channel Link:', pageInfo.firstChannelLink);
		console.log('\n=== HTML Snippet ===');
		console.log(pageInfo.htmlSnippet.substring(0, 500));

		// Take screenshot
		await page.screenshot({ path: 'youtube-test.png' });
		console.log('\nScreenshot saved to youtube-test.png');

		// Try to extract channels with different approach
		const channels = await page.evaluate(() => {
			const results = [];

			// Try different selectors
			const renderers = document.querySelectorAll('ytd-channel-renderer');

			renderers.forEach((el, index) => {
				console.log('Processing renderer', index);

				const linkEl = el.querySelector('a[href*="/channel/"], a[href*="/@"]');
				const nameEl = el.querySelector('#channel-title, #text');
				const subEl = el.querySelector('#subscribers, #subscriber-count');

				if (linkEl && nameEl) {
					results.push({
						url: linkEl.href,
						name: nameEl.textContent?.trim(),
						subscribers: subEl?.textContent?.trim() || 'unknown'
					});
				}
			});

			return results;
		});

		console.log('\n=== Extracted Channels ===');
		console.log('Found:', channels.length);
		channels.forEach((ch, i) => {
			console.log(`${i + 1}. ${ch.name} - ${ch.subscribers}`);
			console.log(`   ${ch.url}`);
		});

		console.log('\n\nTest complete! Press Ctrl+C to exit (browser will stay open for inspection)');

		// Keep browser open
		await new Promise(() => {});

	} catch (error) {
		console.error('Error:', error);
	}
}

testScraper();
