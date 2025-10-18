/**
 * Test script to verify channel enrichment works
 *
 * This script:
 * 1. Searches for channels
 * 2. Tests the enrichment feature
 * 3. Verifies subscriber counts are fetched from channel pages
 */

import { chromium } from 'playwright';

async function testEnrichment() {
	console.log('=== Testing Channel Enrichment ===\n');

	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage();

	try {
		// Step 1: Search for a channel
		const keyword = 'tech reviews';
		const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=EgIQAg%253D%253D`;

		console.log(`1. Searching for: ${keyword}`);
		console.log(`   URL: ${searchUrl}\n`);

		await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
		await page.waitForSelector('ytd-channel-renderer', { timeout: 10000 });

		// Get first channel
		const firstChannel = await page.evaluate(() => {
			const renderer = document.querySelector('ytd-channel-renderer');
			if (!renderer) return null;

			const linkEl = renderer.querySelector('a[href*="/@"]') || renderer.querySelector('a[href*="/channel/"]');
			if (!linkEl) return null;

			const url = linkEl.href;
			const channelIdMatch = url.match(/\/@([^/?]+)|\/channel\/([^/?]+)/);
			const channelId = channelIdMatch[1] || channelIdMatch[2];

			const nameEl = renderer.querySelector('#channel-title #text') || renderer.querySelector('#text');
			const name = nameEl?.textContent?.trim() || 'Unknown';

			return { url, channelId, name };
		});

		if (!firstChannel) {
			console.error('❌ No channel found in search results');
			return;
		}

		console.log(`2. Found channel:`);
		console.log(`   Name: ${firstChannel.name}`);
		console.log(`   ID: ${firstChannel.channelId}`);
		console.log(`   URL: ${firstChannel.url}\n`);

		// Step 2: Visit channel page and extract details
		console.log(`3. Visiting channel page to extract details...\n`);

		await page.goto(firstChannel.url, { waitUntil: 'networkidle', timeout: 15000 });
		await page.waitForTimeout(2000);

		const details = await page.evaluate(() => {
			const result = {};
			const pageText = document.body.innerText;

			// Get all lines and filter to short ones (likely stats)
			const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.length < 100);
			result.allLines = lines.slice(0, 100); // First 100 lines

			// Look for subscriber count
			const subMatch = pageText.match(/([\d,.]+)\s*(K|M|B)?\s*subscribers?/i);
			if (subMatch) {
				const numStr = subMatch[1].replace(/,/g, '');
				const num = parseFloat(numStr);
				const suffix = subMatch[2]?.toUpperCase() || '';

				const multipliers = { K: 1000, M: 1000000, B: 1000000000, '': 1 };
				result.subscriberCount = Math.floor(num * (multipliers[suffix] || 1));
				result.subscriberText = subMatch[0];
			}

			// Look for video count
			const videoMatch = pageText.match(/([\d,.]+)\s*videos?/i);
			if (videoMatch) {
				const numStr = videoMatch[1].replace(/,/g, '');
				result.videoCount = parseInt(numStr);
				result.videoText = videoMatch[0];
			}

			// Get description
			const metaDesc = document.querySelector('meta[name="description"]');
			if (metaDesc) {
				result.description = metaDesc.content;
			}

			return result;
		});

		console.log(`4. Page content (first 100 lines):`);
		console.log(JSON.stringify(details.allLines, null, 2));
		console.log('\n5. Extracted details:');
		if (details.subscriberCount) {
			console.log(`   ✅ Subscribers: ${details.subscriberCount.toLocaleString()} (found: "${details.subscriberText}")`);
		} else {
			console.log(`   ❌ Subscribers: Not found`);
		}

		if (details.videoCount) {
			console.log(`   ✅ Videos: ${details.videoCount.toLocaleString()} (found: "${details.videoText}")`);
		} else {
			console.log(`   ❌ Videos: Not found`);
		}

		if (details.description) {
			console.log(`   ✅ Description: ${details.description.substring(0, 100)}...`);
		} else {
			console.log(`   ❌ Description: Not found`);
		}

		console.log('\n=== Test Complete ===');

		if (details.subscriberCount && details.videoCount) {
			console.log('✅ SUCCESS: Enrichment works! Subscriber and video counts extracted.');
		} else if (details.subscriberCount || details.videoCount) {
			console.log('⚠️  PARTIAL: Some data extracted, but not all.');
		} else {
			console.log('❌ FAILED: Could not extract subscriber or video counts.');
		}

	} catch (error) {
		console.error('❌ Error:', error);
	} finally {
		await browser.close();
	}
}

testEnrichment();
