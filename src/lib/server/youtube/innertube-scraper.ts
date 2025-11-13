/**
 * YouTube Innertube API Scraper
 * Uses continuation tokens for efficient channel searching (no scrolling required)
 */

import type { Page } from 'puppeteer';
import type { ChannelSearchResult } from './scraper-puppeteer';

export interface InnertubePageData {
  apiKey: string;
  context: any;
  ytInitialData: any;
}

/**
 * Extract API key, context, and initial data from YouTube page
 */
export async function extractInnertubeData(page: Page): Promise<InnertubePageData> {
  return await page.evaluate(() => {
    // Helper to extract JSON from HTML
    const matchJSON = (html: string, start: string): any => {
      const i = html.indexOf(start);
      if (i === -1) throw new Error(`Missing ${start}`);
      let s = i + start.length;
      let depth = 0;
      for (let e = s; e < html.length; e++) {
        if (html[e] === '{') depth++;
        if (html[e] === '}') {
          depth--;
          if (depth === 0) return JSON.parse(html.slice(s - 1, e + 1));
        }
      }
      throw new Error(`Unclosed JSON for ${start}`);
    };

    const html = document.documentElement.outerHTML;

    // Extract API key
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    if (!apiKeyMatch) throw new Error('INNERTUBE_API_KEY not found');
    const apiKey = apiKeyMatch[1];

    // Extract context - updated regex to handle nested objects
    const contextMatch = html.match(/"INNERTUBE_CONTEXT":(\{.+?\}(?=,\s*"INNERTUBE))/s);
    if (!contextMatch) throw new Error('INNERTUBE_CONTEXT not found');
    const context = JSON.parse(contextMatch[1]);

    // Extract initial data
    const ytInitialData = matchJSON(html, 'var ytInitialData = ');

    return { apiKey, context, ytInitialData };
  });
}

/**
 * Collect channels from Innertube API response data
 */
export function collectChannelsFromInnertubeData(data: any): ChannelSearchResult[] {
  const channels: ChannelSearchResult[] = [];

  const walk = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;

    if (obj.channelRenderer) {
      const r = obj.channelRenderer;
      const name = r.title?.simpleText || r.title?.runs?.map((x: any) => x.text).join('') || '';
      const channelId =
        r.channelId ||
        r.navigationEndpoint?.browseEndpoint?.browseId ||
        r.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url?.split('/@')[1]?.split('/')[0] ||
        '';
      const url =
        'https://www.youtube.com' +
        (r.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || `/@${channelId}`);
      const description = r.descriptionSnippet?.runs?.map((x: any) => x.text).join('') || '';
      const thumbnailUrl = r.thumbnail?.thumbnails?.[0]?.url || '';

      if (name && url) {
        channels.push({
          name,
          channelId,
          url,
          description,
          thumbnailUrl
        });
      }
    }

    for (const v of Object.values(obj)) {
      walk(v);
    }
  };

  walk(data);
  return channels;
}

/**
 * Extract continuation token from Innertube API response
 */
export function getContinuationToken(data: any): string | null {
  const tokens: string[] = [];

  const walk = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;

    if (obj.continuationCommand?.token) {
      tokens.push(obj.continuationCommand.token);
    }

    for (const v of Object.values(obj)) {
      walk(v);
    }
  };

  walk(data);
  return tokens[0] || null;
}

/**
 * Fetch next page of channels using continuation token
 */
export async function fetchNextPage(
  page: Page,
  apiKey: string,
  context: any,
  continuation: string
): Promise<any> {
  return await page.evaluate(
    async (apiKey, context, cont) => {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': context.client.clientVersion
        },
        body: JSON.stringify({
          context,
          continuation: cont
        })
      });
      return await res.json();
    },
    apiKey,
    context,
    continuation
  );
}
