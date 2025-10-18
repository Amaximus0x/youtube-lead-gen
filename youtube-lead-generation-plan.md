# YouTube Lead Generation App - Implementation Plan

## Project Overview
**Application Name:** YouTube Lead Generation
**Tech Stack:** SvelteKit, TailwindCSS, TypeScript
**Purpose:** Automated lead generation tool that discovers YouTube channels based on keywords/niches and extracts contact information for outreach purposes.

## Architecture Overview

### Frontend
- **Framework:** SvelteKit with TypeScript
- **Styling:** TailwindCSS
- **UI Components:** Custom components with shadcn-svelte patterns
- **State Management:** Svelte stores
- **Data Tables:** TanStack Table or custom implementation
- **Form Handling:** native SvelteKit forms

### Backend (SvelteKit Server-Side)
- **API Routes:** SvelteKit API endpoints (+server.ts)
- **Database:** Supabase PostgreSQL (Relational database)
- **Authentication:** Supabase Auth (optional)
- **File Storage:** Supabase Storage for exports
- **Queue System:** p-queue for job processing
- **Caching:** Redis or Supabase's built-in caching

### External Services
- **Web Scraping:** Playwright for YouTube data extraction
- **Email Validation:** Email validation libraries
- **Export:** Papa Parse for CSV, Google Sheets API for cloud sync
- **Proxy Service:** Rotating proxies for anti-blocking

## Development Phases

### Phase 1: Project Setup & Foundation (Week 1)

#### 1.1 Initialize Project
- [ ] Create SvelteKit project with TypeScript template
- [ ] Configure TailwindCSS with custom theme
- [ ] Set up ESLint and Prettier
- [ ] Initialize Git repository
- [ ] Create environment variables structure

#### 1.2 Project Structure
```
src/
├── routes/
│   ├── +layout.svelte
│   ├── +page.svelte
│   ├── dashboard/
│   │   └── +page.svelte
│   ├── generate/
│   │   └── +page.svelte
│   ├── extract/
│   │   └── +page.svelte
│   ├── api/
│   │   ├── youtube/
│   │   │   ├── search/+server.ts
│   │   │   └── channels/[id]/+server.ts
│   │   ├── extract/
│   │   │   ├── email/+server.ts
│   │   │   └── social/+server.ts
│   │   └── export/
│   │       ├── csv/+server.ts
│   │       └── sheets/+server.ts
├── lib/
│   ├── server/
│   │   ├── youtube/
│   │   │   ├── api.ts
│   │   │   ├── scraper.ts
│   │   │   └── filters.ts
│   │   ├── extractors/
│   │   │   ├── email.ts
│   │   │   ├── instagram.ts
│   │   │   ├── twitter.ts
│   │   │   └── base.ts
│   │   ├── db/
│   │   │   ├── supabase.ts
│   │   │   ├── repositories/
│   │   │   │   ├── channels.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   └── jobs.ts
│   │   ├── queue/
│   │   │   ├── processor.ts
│   │   │   └── jobs.ts
│   │   └── utils/
│   │       ├── anti-bot.ts
│   │       ├── validators.ts
│   │       └── rate-limiter.ts
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.svelte
│   │   │   ├── Card.svelte
│   │   │   ├── Input.svelte
│   │   │   └── Table.svelte
│   │   ├── search/
│   │   │   ├── SearchForm.svelte
│   │   │   └── FilterPanel.svelte
│   │   ├── results/
│   │   │   ├── ChannelTable.svelte
│   │   │   └── EmailStatus.svelte
│   │   └── export/
│   │       └── ExportDialog.svelte
│   └── stores/
│       ├── channels.ts
│       ├── jobs.ts
│       └── settings.ts
```

#### 1.3 Environment Configuration
```env
# .env.example
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google Sheets Integration
GOOGLE_SHEETS_CLIENT_ID=
GOOGLE_SHEETS_CLIENT_SECRET=

# Scraping Configuration
PROXY_ENDPOINT=
RATE_LIMIT_PER_MINUTE=20
SCRAPER_HEADLESS=true
USER_AGENT_ROTATION=true

# Optional: Third-party service APIs (if used)
SERP_API_KEY=
SCRAPER_API_KEY=
BRIGHT_DATA_PROXY=
```

### Phase 2: Supabase PostgreSQL Database Design (Week 1)

#### 2.1 PostgreSQL Tables & Schema Structure

```sql
-- Supabase PostgreSQL Schema

-- Channels table
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    subscriber_count BIGINT,
    view_count BIGINT,
    video_count INTEGER,
    email TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    email_source TEXT CHECK (email_source IN ('youtube', 'instagram', 'twitter', 'website')),
    search_keyword TEXT NOT NULL,
    relevance_score NUMERIC(5,2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_scraped_at TIMESTAMPTZ
);

-- Social links table (normalized from channels)
CREATE TABLE social_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'twitter', 'tiktok', 'linkedin', 'website')),
    url TEXT NOT NULL,
    extracted_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel_id, platform, url)
);

-- Search sessions table
CREATE TABLE search_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword TEXT NOT NULL,
    min_subscribers INTEGER,
    max_subscribers INTEGER,
    exclude_music_channels BOOLEAN DEFAULT FALSE,
    exclude_brands BOOLEAN DEFAULT FALSE,
    language TEXT,
    upload_frequency TEXT CHECK (upload_frequency IN ('daily', 'weekly', 'monthly')),
    engagement_threshold NUMERIC(5,2),
    total_found INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    with_email INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Extraction jobs table
CREATE TABLE extraction_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'email_extraction',
    final_status TEXT CHECK (final_status IN ('success', 'failed', 'pending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Extraction attempts table (normalized from extraction jobs)
CREATE TABLE extraction_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('youtube_scraping', 'social_fallback')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    error TEXT,
    result_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exports table
CREATE TABLE exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES search_sessions(id) ON DELETE CASCADE,
    format TEXT NOT NULL CHECK (format IN ('csv', 'sheets')),
    channel_count INTEGER NOT NULL,
    file_url TEXT,
    sheets_id TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 2.2 PostgreSQL Indexes
```sql
-- Indexes for performance
CREATE INDEX idx_channels_channel_id ON channels(channel_id);
CREATE INDEX idx_channels_search_keyword ON channels(search_keyword);
CREATE INDEX idx_channels_status ON channels(status);
CREATE INDEX idx_channels_created_at ON channels(created_at DESC);
CREATE INDEX idx_channels_subscriber_count ON channels(subscriber_count DESC);
CREATE INDEX idx_channels_email ON channels(email) WHERE email IS NOT NULL;

CREATE INDEX idx_social_links_channel_id ON social_links(channel_id);
CREATE INDEX idx_social_links_platform ON social_links(platform);

CREATE INDEX idx_search_sessions_user_id ON search_sessions(user_id);
CREATE INDEX idx_search_sessions_created_at ON search_sessions(created_at DESC);
CREATE INDEX idx_search_sessions_status ON search_sessions(status);

CREATE INDEX idx_extraction_jobs_channel_id ON extraction_jobs(channel_id);
CREATE INDEX idx_extraction_jobs_status ON extraction_jobs(final_status);

CREATE INDEX idx_extraction_attempts_job_id ON extraction_attempts(job_id);

CREATE INDEX idx_exports_session_id ON exports(session_id);
CREATE INDEX idx_exports_created_by ON exports(created_by);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### 2.3 TypeScript Models for Supabase
```typescript
// lib/types/models.ts

// Database types matching the Supabase schema
export interface Database {
  public: {
    Tables: {
      channels: {
        Row: Channel;
        Insert: ChannelInsert;
        Update: ChannelUpdate;
      };
      social_links: {
        Row: SocialLink;
        Insert: SocialLinkInsert;
        Update: SocialLinkUpdate;
      };
      search_sessions: {
        Row: SearchSession;
        Insert: SearchSessionInsert;
        Update: SearchSessionUpdate;
      };
      extraction_jobs: {
        Row: ExtractionJob;
        Insert: ExtractionJobInsert;
        Update: ExtractionJobUpdate;
      };
      extraction_attempts: {
        Row: ExtractionAttempt;
        Insert: ExtractionAttemptInsert;
        Update: ExtractionAttemptUpdate;
      };
      exports: {
        Row: ExportRecord;
        Insert: ExportRecordInsert;
        Update: ExportRecordUpdate;
      };
    };
  };
}

// Channel table
export interface Channel {
  id: string;
  channel_id: string;
  name: string;
  url: string;
  description?: string | null;
  subscriber_count?: number | null;
  view_count?: number | null;
  video_count?: number | null;
  email?: string | null;
  email_verified: boolean;
  email_source?: 'youtube' | 'instagram' | 'twitter' | 'website' | null;
  search_keyword: string;
  relevance_score?: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  last_scraped_at?: string | null;
}

export interface ChannelInsert {
  id?: string;
  channel_id: string;
  name: string;
  url: string;
  description?: string | null;
  subscriber_count?: number | null;
  view_count?: number | null;
  video_count?: number | null;
  email?: string | null;
  email_verified?: boolean;
  email_source?: 'youtube' | 'instagram' | 'twitter' | 'website' | null;
  search_keyword: string;
  relevance_score?: number | null;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  last_scraped_at?: string | null;
}

export interface ChannelUpdate {
  channel_id?: string;
  name?: string;
  url?: string;
  description?: string | null;
  subscriber_count?: number | null;
  view_count?: number | null;
  video_count?: number | null;
  email?: string | null;
  email_verified?: boolean;
  email_source?: 'youtube' | 'instagram' | 'twitter' | 'website' | null;
  search_keyword?: string;
  relevance_score?: number | null;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  last_scraped_at?: string | null;
}

// Social link table
export interface SocialLink {
  id: string;
  channel_id: string;
  platform: 'instagram' | 'twitter' | 'tiktok' | 'linkedin' | 'website';
  url: string;
  extracted_email?: string | null;
  created_at: string;
}

// Search session table
export interface SearchSession {
  id: string;
  keyword: string;
  min_subscribers?: number | null;
  max_subscribers?: number | null;
  exclude_music_channels: boolean;
  exclude_brands: boolean;
  language?: string | null;
  upload_frequency?: 'daily' | 'weekly' | 'monthly' | null;
  engagement_threshold?: number | null;
  total_found: number;
  processed: number;
  with_email: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  user_id?: string | null;
  created_at: string;
  completed_at?: string | null;
}

// Extraction job table
export interface ExtractionJob {
  id: string;
  channel_id: string;
  type: string;
  final_status?: 'success' | 'failed' | 'pending' | null;
  created_at: string;
  completed_at?: string | null;
}

// Extraction attempt table
export interface ExtractionAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  method: 'youtube_scraping' | 'social_fallback';
  status: 'success' | 'failed';
  error?: string | null;
  result_email?: string | null;
  created_at: string;
}

// Filter configuration helper
export interface FilterConfig {
  minSubscribers?: number;
  maxSubscribers?: number;
  excludeMusicChannels: boolean;
  excludeBrands: boolean;
  language?: string;
  uploadFrequency?: 'daily' | 'weekly' | 'monthly';
  engagementThreshold?: number;
}
```

#### 2.4 Supabase Client Setup
```typescript
// lib/server/db/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/models';

// Type for the Supabase client
export type TypedSupabaseClient = SupabaseClient<Database>;

// Initialize Supabase client
function initializeSupabase(): TypedSupabaseClient | null {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('Supabase credentials not configured. Database features will not work.');
      console.warn('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
      return null;
    }

    const client = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('Supabase client initialized successfully');
    return client;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    console.warn('Database features will not be available.');
    return null;
  }
}

// Export Supabase client instance
export const supabase = initializeSupabase();

// Helper to check if Supabase is available
export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}

// Type-safe table references
export const tables = {
  channels: 'channels',
  socialLinks: 'social_links',
  searchSessions: 'search_sessions',
  extractionJobs: 'extraction_jobs',
  extractionAttempts: 'extraction_attempts',
  exports: 'exports',
} as const;
```

#### 2.5 Supabase Repository Pattern
```typescript
// lib/server/db/repositories/channels.ts
import { supabase, tables } from '../supabase';
import type { Channel, ChannelInsert, ChannelUpdate } from '$lib/types/models';

export class ChannelRepository {
  // Create or update channel
  async upsertChannel(channel: ChannelInsert): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase
      .from(tables.channels)
      .upsert(channel, { onConflict: 'channel_id' });

    if (error) throw new Error(`Failed to upsert channel: ${error.message}`);
  }

  // Get channel by YouTube channel ID
  async getChannel(channelId: string): Promise<Channel | null> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from(tables.channels)
      .select('*')
      .eq('channel_id', channelId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get channel: ${error.message}`);
    }

    return data;
  }

  // Search channels with filters
  async searchChannels(params: {
    keyword?: string;
    minSubs?: number;
    maxSubs?: number;
    status?: string;
    limit?: number;
  }): Promise<Channel[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    let query = supabase.from(tables.channels).select('*');

    if (params.keyword) {
      query = query.eq('search_keyword', params.keyword);
    }

    if (params.minSubs) {
      query = query.gte('subscriber_count', params.minSubs);
    }

    if (params.maxSubs) {
      query = query.lte('subscriber_count', params.maxSubs);
    }

    if (params.status) {
      query = query.eq('status', params.status);
    }

    query = query
      .order('created_at', { ascending: false })
      .limit(params.limit || 50);

    const { data, error } = await query;

    if (error) throw new Error(`Failed to search channels: ${error.message}`);

    return data || [];
  }

  // Batch update channels
  async batchUpdateChannels(updates: Array<{
    id: string;
    data: ChannelUpdate;
  }>): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const promises = updates.map(({ id, data }) =>
      supabase
        .from(tables.channels)
        .update(data)
        .eq('id', id)
    );

    const results = await Promise.all(promises);
    const errors = results.filter(r => r.error);

    if (errors.length > 0) {
      throw new Error(`Failed to update ${errors.length} channels`);
    }
  }

  // Get channels pending email extraction
  async getChannelsPendingExtraction(limit: number = 10): Promise<Channel[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from(tables.channels)
      .select('*')
      .eq('status', 'pending')
      .is('email', null)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(`Failed to get pending channels: ${error.message}`);

    return data || [];
  }
}

// lib/server/db/repositories/sessions.ts
import type { SearchSession, SearchSessionInsert, SearchSessionUpdate } from '$lib/types/models';

export class SearchSessionRepository {
  async createSession(session: SearchSessionInsert): Promise<string> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from(tables.searchSessions)
      .insert({ ...session, status: 'pending' })
      .select('id')
      .single();

    if (error) throw new Error(`Failed to create session: ${error.message}`);

    return data.id;
  }

  async updateSession(
    sessionId: string,
    updates: SearchSessionUpdate
  ): Promise<void> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { error } = await supabase
      .from(tables.searchSessions)
      .update(updates)
      .eq('id', sessionId);

    if (error) throw new Error(`Failed to update session: ${error.message}`);
  }

  async getUserSessions(userId: string, limit: number = 10): Promise<SearchSession[]> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const { data, error } = await supabase
      .from(tables.searchSessions)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new Error(`Failed to get user sessions: ${error.message}`);

    return data || [];
  }
}
```

### Phase 3: YouTube Integration WITHOUT API (Week 2)

#### YouTube Data Collection Approaches (No API Key Required)

**Option 1: Direct Web Scraping (Recommended)**
- Use Playwright/Puppeteer to scrape YouTube search results
- Pros: Free, full control, no API limits
- Cons: Slower, requires anti-detection measures

**Option 2: YouTube Internal API**
- Use YouTube's undocumented internal endpoints
- Pros: Faster than scraping, structured data
- Cons: May change without notice

**Option 3: Third-Party Services**
- SerpAPI, ScraperAPI, Bright Data, Apify
- Pros: Reliable, handles proxies/CAPTCHAs
- Cons: Paid services, monthly costs

**Option 4: Hybrid Approach**
- Combine multiple methods for redundancy
- Fallback from one method to another if blocked

#### 3.1 YouTube Web Scraping Service (No API Required)
```typescript
// lib/server/youtube/scraper.ts
import { chromium, Browser, Page } from 'playwright';

export class YouTubeScraper {
  private browser: Browser;

  async initialize() {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ]
    });
  }

  async searchChannels(keyword: string, limit: number = 50): Promise<Channel[]> {
    const page = await this.browser.newPage();
    const channels: Channel[] = [];

    // Method 1: Direct YouTube Search Scraping
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}+channel&sp=EgIQAg%253D%253D`;
    await page.goto(searchUrl, { waitUntil: 'networkidle' });

    // Wait for results to load
    await page.waitForSelector('ytd-channel-renderer', { timeout: 10000 });

    // Extract channel data
    const results = await page.evaluate(() => {
      const channelElements = document.querySelectorAll('ytd-channel-renderer');
      return Array.from(channelElements).map(el => {
        const nameElement = el.querySelector('#channel-title');
        const subElement = el.querySelector('#subscribers');
        const descElement = el.querySelector('#description');
        const linkElement = el.querySelector('#main-link');

        return {
          name: nameElement?.textContent?.trim(),
          url: linkElement?.href,
          subscribers: subElement?.textContent?.trim(),
          description: descElement?.textContent?.trim()
        };
      });
    });

    // Scroll to load more results
    while (channels.length < limit) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(2000);
      // Extract more results
    }

    return channels;
  }

  async getChannelAboutPage(channelUrl: string): Promise<ChannelDetails> {
    const page = await this.browser.newPage();
    const aboutUrl = `${channelUrl}/about`;

    await page.goto(aboutUrl, { waitUntil: 'networkidle' });

    // Extract detailed channel information
    const details = await page.evaluate(() => {
      // Extract stats, links, email if visible
      const stats = document.querySelector('#channel-header-stats')?.textContent;
      const links = Array.from(document.querySelectorAll('a[href*="redirect"]'));

      return {
        stats,
        links: links.map(a => a.href)
      };
    });

    return details;
  }
}

// Alternative: Using YouTube's Internal API (No Key Required)
export class YouTubeInternalAPI {
  private readonly baseUrl = 'https://www.youtube.com/youtubei/v1';

  async search(query: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'WEB',
            clientVersion: '2.20230101',
            hl: 'en',
            gl: 'US'
          }
        },
        query: query,
        params: 'EgIQAg%3D%3D' // Filter for channels only
      })
    });

    return response.json();
  }
}
```

#### 3.2 Alternative Implementation: Third-Party Services
```typescript
// lib/server/youtube/third-party.ts

// Option A: Using SerpAPI
export class SerpAPIYouTube {
  private apiKey: string;

  async searchChannels(keyword: string): Promise<Channel[]> {
    const params = {
      api_key: this.apiKey,
      engine: 'youtube',
      search_query: keyword,
      sp: 'EgIQAg%253D%253D', // Channels filter
    };

    const response = await fetch(`https://serpapi.com/search?${new URLSearchParams(params)}`);
    const data = await response.json();

    return this.transformResults(data.channel_results);
  }
}

// Option B: Using Apify YouTube Scraper
export class ApifyYouTube {
  async searchChannels(keyword: string): Promise<Channel[]> {
    const response = await fetch('https://api.apify.com/v2/acts/bernardo~youtube-scraper/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.APIFY_TOKEN}`
      },
      body: JSON.stringify({
        searchKeywords: keyword,
        maxResults: 50,
        searchResultsType: 'channel'
      })
    });

    return this.waitForResults(response);
  }
}

// Option C: Using yt-dlp via child process
export class YtDlpScraper {
  async searchChannels(keyword: string, limit: number = 50): Promise<Channel[]> {
    return new Promise((resolve, reject) => {
      exec(
        `yt-dlp "ytsearch${limit}:${keyword}" --flat-playlist --dump-json --match-filter "channel"`,
        { maxBuffer: 10 * 1024 * 1024 }, // 10MB buffer
        (error, stdout, stderr) => {
          if (error) return reject(error);

          const results = stdout
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));

          resolve(this.transformYtDlpResults(results));
        }
      );
    });
  }
}
```

#### 3.3 Channel Filtering System
```typescript
// lib/server/youtube/filters.ts
export class ChannelFilter {
  // Exclusion filters
  excludeMusicChannels(channel: Channel): boolean {
    const musicKeywords = ['music', 'vevo', 'records', 'entertainment'];
    // Check channel description and category
  }

  excludeBrandChannels(channel: Channel): boolean {
    const brandIndicators = ['official', 'verified', 'corp', 'inc'];
    // Analyze channel patterns
  }

  // Inclusion filters
  checkSubscriberRange(channel: Channel, min: number, max: number): boolean {}
  checkUploadFrequency(channel: Channel): string {}
  calculateRelevanceScore(channel: Channel, keyword: string): number {}
}
```

#### 3.3 Rate Limiting Implementation
```typescript
// lib/server/utils/rate-limiter.ts
export class RateLimiter {
  private queue: PQueue;
  private apiQuotaTracker: QuotaTracker;

  constructor() {
    this.queue = new PQueue({
      concurrency: 2,
      interval: 1000,
      intervalCap: 10
    });
  }

  async executeWithLimit<T>(fn: () => Promise<T>): Promise<T> {
    return this.queue.add(fn);
  }
}
```

### Phase 4: Email Extraction Core (Week 3)

#### 4.1 YouTube Channel Scraper
```typescript
// lib/server/extractors/youtube-scraper.ts
import { chromium, Page, Browser } from 'playwright';

export class YouTubeEmailExtractor {
  private browser: Browser;

  async initialize() {
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  async extractFromChannel(channelUrl: string): Promise<ExtractionResult> {
    const page = await this.browser.newPage();

    // Set user agent and viewport
    await this.setAntiDetection(page);

    // Navigate to about page
    const aboutUrl = `${channelUrl}/about`;
    await page.goto(aboutUrl, { waitUntil: 'networkidle' });

    // Check for CAPTCHA
    if (await this.detectCaptcha(page)) {
      return { status: 'captcha_detected', requiresManual: true };
    }

    // Extract email and social links
    const email = await this.extractEmail(page);
    const socialLinks = await this.extractSocialLinks(page);

    return { email, socialLinks, status: 'success' };
  }

  private async extractEmail(page: Page): Promise<string | null> {
    // Multiple strategies for email extraction
    const selectors = [
      'a[href^="mailto:"]',
      '*:contains("@")',
      '[aria-label*="email"]'
    ];
    // Implementation details
  }

  private async detectCaptcha(page: Page): Promise<boolean> {
    // Check for reCAPTCHA or other challenges
  }
}
```

#### 4.2 Email Validation & Parsing
```typescript
// lib/server/utils/validators.ts
export class EmailValidator {
  private emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  validateEmail(email: string): boolean {
    // Check format
    if (!this.emailRegex.test(email)) return false;

    // Check disposable domains
    if (this.isDisposable(email)) return false;

    // Check DNS records (optional)
    return true;
  }

  extractEmailsFromText(text: string): string[] {
    const matches = text.match(this.emailRegex) || [];
    return matches.filter(email => this.validateEmail(email));
  }
}
```

#### 4.3 CAPTCHA Handling Strategy
```typescript
// lib/server/utils/captcha-handler.ts
export class CaptchaHandler {
  async handleCaptcha(page: Page): Promise<CaptchaResult> {
    // Option 1: Manual intervention UI
    // Option 2: 2Captcha/Anti-Captcha service integration
    // Option 3: Session persistence to reduce CAPTCHAs
  }
}

### Phase 5: Social Media Fallback (Week 4)

#### 5.1 Platform-Specific Scrapers
```typescript
// lib/server/extractors/base.ts
export abstract class BaseSocialScraper {
  protected browser: Browser;

  abstract getPlatform(): string;
  abstract isValidUrl(url: string): boolean;
  abstract extractEmail(url: string): Promise<string | null>;

  protected async setAntiDetection(page: Page) {
    // Common anti-detection measures
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });
  }
}

// lib/server/extractors/instagram.ts
export class InstagramScraper extends BaseSocialScraper {
  async extractEmail(url: string): Promise<string | null> {
    const page = await this.browser.newPage();
    await this.setAntiDetection(page);

    await page.goto(url, { waitUntil: 'networkidle' });

    // Extract from bio
    const bioText = await page.textContent('[data-testid="user-bio"]');

    // Check for email button
    const emailButton = await page.$('a[href^="mailto:"]');

    // Parse link in bio services
    const linkInBio = await this.extractLinkInBio(page);

    return this.parseEmailFromSources(bioText, emailButton, linkInBio);
  }
}

// lib/server/extractors/twitter.ts
export class TwitterScraper extends BaseSocialScraper {
  async extractEmail(url: string): Promise<string | null> {
    // Similar implementation for Twitter/X
  }
}
```

#### 5.2 Unified Extraction Manager
```typescript
// lib/server/extractors/manager.ts
export class ExtractionManager {
  private scrapers: Map<string, BaseSocialScraper>;

  constructor() {
    this.scrapers = new Map([
      ['instagram', new InstagramScraper()],
      ['twitter', new TwitterScraper()],
      ['tiktok', new TikTokScraper()]
    ]);
  }

  async extractFromSocialLinks(links: SocialLink[]): Promise<ExtractionResult[]> {
    const results = [];

    for (const link of links) {
      const platform = this.detectPlatform(link.url);
      const scraper = this.scrapers.get(platform);

      if (scraper) {
        const email = await scraper.extractEmail(link.url);
        results.push({ platform, url: link.url, email });
      }
    }

    return results;
  }
}
```

### Phase 6: Export & Integration with Supabase Storage (Week 5)

#### 6.1 CSV Export with Supabase Storage
```typescript
// lib/server/export/csv-exporter.ts
import { stringify } from 'csv-stringify/sync';
import { supabase, tables } from '../db/supabase';
import type { Channel, ExportRecordInsert } from '$lib/types/models';

export class CSVExporter {
  exportChannels(channels: Channel[]): Buffer {
    const data = channels.map(channel => ({
      'Channel Name': channel.name,
      'URL': channel.url,
      'Subscribers': channel.subscriber_count || 'N/A',
      'Email': channel.email || 'Not found',
      'Email Verified': channel.email_verified ? 'Yes' : 'No',
      'Email Source': channel.email_source || 'N/A',
      'Search Keyword': channel.search_keyword,
      'Relevance Score': channel.relevance_score || 'N/A',
      'Extracted Date': new Date().toISOString()
    }));

    return Buffer.from(stringify(data, { header: true }));
  }

  async uploadToSupabaseStorage(
    csvBuffer: Buffer,
    sessionId: string,
    userId?: string
  ): Promise<string> {
    if (!supabase) throw new Error('Supabase client not initialized');

    const filename = `exports/${sessionId}/channels_${Date.now()}.csv`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('exports')
      .upload(filename, csvBuffer, {
        contentType: 'text/csv',
        upsert: false,
        metadata: {
          sessionId,
          userId: userId || 'anonymous',
          createdAt: new Date().toISOString()
        }
      });

    if (uploadError) {
      throw new Error(`Failed to upload CSV: ${uploadError.message}`);
    }

    // Get public URL (or signed URL if bucket is private)
    const { data: urlData } = supabase.storage
      .from('exports')
      .getPublicUrl(filename);

    const fileUrl = urlData.publicUrl;

    // Save export record to database
    const exportRecord: ExportRecordInsert = {
      session_id: sessionId,
      format: 'csv',
      file_url: fileUrl,
      channel_count: csvBuffer.length,
      created_by: userId || 'anonymous'
    };

    const { error: dbError } = await supabase
      .from(tables.exports)
      .insert(exportRecord);

    if (dbError) {
      throw new Error(`Failed to save export record: ${dbError.message}`);
    }

    return fileUrl;
  }
}
```

#### 6.2 Google Sheets Integration
```typescript
// lib/server/export/sheets-exporter.ts
import { google } from 'googleapis';

export class GoogleSheetsExporter {
  private sheets;
  private auth;

  async authenticate(credentials: OAuth2Credentials) {
    // OAuth2 flow implementation
  }

  async createSpreadsheet(title: string): Promise<string> {
    // Create new spreadsheet
  }

  async appendData(spreadsheetId: string, channels: Channel[]) {
    // Batch update rows
    // Check for duplicates
    // Format cells
  }

  async syncChannels(channels: Channel[], options: SyncOptions) {
    // Incremental sync logic
  }
}
```

### Phase 7: User Interface (Week 5-6)

#### 7.1 Main Dashboard
```svelte
<!-- routes/+page.svelte -->
<script lang="ts">
  import { channelsStore, jobsStore } from '$lib/stores';
  import SearchPanel from '$lib/components/search/SearchPanel.svelte';
  import ResultsTable from '$lib/components/results/ResultsTable.svelte';
  import ExportDialog from '$lib/components/export/ExportDialog.svelte';

  let activeTab: 'generate' | 'extract' = 'generate';
</script>

<div class="container p-6 mx-auto">
  <h1 class="mb-8 text-3xl font-bold">YouTube Lead Generation</h1>

  <!-- Two-Step CTAs -->
  <div class="flex gap-4 mb-8">
    <button
      class="btn btn-primary"
      on:click={() => activeTab = 'generate'}>
      Generate Leads
    </button>
    <button
      class="btn btn-secondary"
      on:click={() => activeTab = 'extract'}>
      Extract Emails
    </button>
  </div>

  <!-- Dynamic Content -->
  {#if activeTab === 'generate'}
    <SearchPanel />
  {:else}
    <ExtractPanel />
  {/if}

  <!-- Results Display -->
  <ResultsTable />
</div>
```

#### 7.2 Component Architecture
```typescript
// Key UI Components

// SearchPanel.svelte
- Keyword input with validation
- Advanced filters accordion
- Search history dropdown
- Estimated results preview

// ResultsTable.svelte
- Sortable columns
- Inline email status indicators
- Bulk selection
- Pagination controls
- Export button

// ProgressIndicator.svelte
- Real-time progress bar
- Current task display
- Cancel operation button
- Error notifications

// FilterPanel.svelte
- Subscriber range slider
- Channel type checkboxes
- Language selector
- Upload frequency filter
```

### Phase 8: Anti-Blocking & Reliability (Week 6)

#### 8.1 Anti-Detection System
```typescript
// lib/server/utils/anti-bot.ts
export class AntiBotManager {
  private userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ...',
    // ... 50+ user agents
  ];

  private delays = {
    min: 2000,
    max: 5000,
    exponential: true
  };

  async randomDelay(): Promise<void> {
    const delay = Math.random() * (this.delays.max - this.delays.min) + this.delays.min;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async rotateProxy(): Promise<ProxyConfig> {
    // Implement proxy rotation logic
  }
}
```

#### 8.2 Error Handling & Recovery
```typescript
// lib/server/utils/error-handler.ts
export class ErrorHandler {
  async handleWithRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const { maxRetries = 3, backoff = 'exponential' } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries) throw error;

        const delay = backoff === 'exponential'
          ? Math.pow(2, attempt) * 1000
          : 1000;

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logError(error: Error, context: ErrorContext) {
    // Structured error logging
  }
}
```

### Phase 9: Queue System & Job Processing (Week 7)

#### 9.1 Job Queue Implementation
```typescript
// lib/server/queue/processor.ts
import { Queue } from 'bullmq';

export class JobProcessor {
  private searchQueue: Queue;
  private extractQueue: Queue;

  constructor() {
    this.searchQueue = new Queue('search-channels');
    this.extractQueue = new Queue('extract-emails');
  }

  async addSearchJob(keyword: string, filters: FilterConfig) {
    return await this.searchQueue.add('search', {
      keyword,
      filters,
      timestamp: Date.now()
    });
  }

  async addExtractionJob(channelIds: string[]) {
    // Batch processing for efficiency
    const batches = this.createBatches(channelIds, 10);

    for (const batch of batches) {
      await this.extractQueue.add('extract-batch', {
        channels: batch
      });
    }
  }
}
```

### Phase 10: Testing & Deployment (Week 8)

#### 10.1 Testing Strategy
```typescript
// tests/unit/youtube-api.test.ts
describe('YouTube API Service', () => {
  test('should search channels with keyword', async () => {});
  test('should apply filters correctly', async () => {});
  test('should handle rate limiting', async () => {});
});

// tests/integration/email-extraction.test.ts
describe('Email Extraction', () => {
  test('should extract email from YouTube about page', async () => {});
  test('should fallback to social media', async () => {});
  test('should handle CAPTCHA gracefully', async () => {});
});

// tests/e2e/full-workflow.test.ts
describe('Full Workflow', () => {
  test('should complete search to export flow', async () => {});
});
```

#### 10.2 Deployment Configuration
```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

```toml
# supabase/config.toml
# Supabase local development configuration

[api]
# Port to use for the API URL
port = 54321

[db]
# Port to use for the PostgreSQL database URL
port = 54322

[studio]
# Port to use for Supabase Studio
port = 54323

[storage]
# The maximum file size allowed (in MiB)
file_size_limit = 50

[auth]
# Enable email signup
enable_signup = true

[auth.email]
# Allow/disallow new user signups via email
enable_signup = true
```

```sql
-- Row Level Security (RLS) Policies
-- Already defined in the migration file (supabase/migrations/20250101000000_initial_schema.sql)

-- Channels: Public read access, service role can write
-- CREATE POLICY "Channels are viewable by everyone" ON channels
--     FOR SELECT USING (true);

-- Search sessions: Users can see their own sessions
-- CREATE POLICY "Users can view their own sessions" ON search_sessions
--     FOR SELECT USING (user_id = auth.uid()::text OR user_id IS NULL);

-- Exports: Users can see their own exports
-- CREATE POLICY "Users can view their own exports" ON exports
--     FOR SELECT USING (created_by = auth.uid()::text);

-- For local development:
-- npm run supabase:start
-- npm run supabase:stop
-- npm run supabase:status
```

## Performance Targets & Metrics

### Key Performance Indicators
- **Search Speed:** < 5 seconds for 50 channels
- **Email Extraction:** < 10 seconds per channel
- **Export Generation:** < 3 seconds for 1000 records
- **UI Response:** < 200ms for interactions
- **API Response:** < 500ms average
- **Success Rate:** > 95% for API calls, > 85% for email extraction

### Scalability Requirements
- Support 10,000+ channels in database
- Handle 100 concurrent users
- Process 1,000 extraction jobs/hour
- 99.9% uptime target

## Security & Compliance

### Security Measures
- Input sanitization on all user inputs
- SQL injection prevention via parameterized queries
- XSS protection with Content Security Policy
- Rate limiting per IP address
- API key encryption at rest
- HTTPS enforcement

### Compliance Considerations
- Respect robots.txt directives
- YouTube API Terms of Service compliance
- GDPR compliance for EU users
- Data retention policies
- User consent for data collection
- Clear privacy policy

## Success Criteria Checklist

### Functional Requirements
- ✅ Accept keyword/niche input
- ✅ Retrieve 50+ relevant YouTube channels
- ✅ Display channel name, URL, subscribers, description
- ✅ Filter out music channels and brands
- ✅ Extract emails from YouTube About sections
- ✅ Handle CAPTCHA challenges
- ✅ Fallback to social media scraping
- ✅ Export to CSV format
- ✅ Google Sheets integration
- ✅ Two separate CTAs for generation and extraction
- ✅ Progress indicators and feedback

### Non-Functional Requirements
- ✅ < 5% failure rate
- ✅ Anti-blocking measures implemented
- ✅ Error logging and recovery
- ✅ Responsive UI design
- ✅ Comprehensive documentation

## Maintenance & Updates

### Regular Maintenance Tasks
1. **Weekly:** Monitor scraping success rates
2. **Monthly:** Update user agent list
3. **Quarterly:** Review and update selectors
4. **As needed:** Update API integrations

### Monitoring Setup
- Application performance monitoring (APM)
- Error tracking with Sentry
- Uptime monitoring
- API quota tracking
- Success rate dashboards

## Recommended Approach Without YouTube API

### Best Practice Implementation Strategy

Given the requirement to NOT use the YouTube Data API, here's the recommended approach:

#### **Primary Method: Playwright Web Scraping**
1. **Why Playwright over Puppeteer:**
   - Better handling of modern JavaScript frameworks
   - Built-in wait strategies
   - More reliable for YouTube's dynamic content
   - Better anti-detection features

2. **Implementation Strategy:**
   ```typescript
   // Recommended scraping flow
   1. Initialize browser with stealth settings
   2. Search YouTube with channel filter
   3. Scroll incrementally to load results
   4. Extract channel data from DOM
   5. Visit each channel's about page for details
   6. Implement exponential backoff for rate limiting
   ```

3. **Anti-Detection Measures:**
   - Rotate user agents (50+ variations)
   - Random delays between 2-5 seconds
   - Use residential proxies if needed
   - Implement browser fingerprinting evasion
   - Session persistence to avoid repeated logins

#### **Fallback Method: YouTube Internal API**
- Use as backup when scraping fails
- Monitor for changes in endpoint structure
- Cache responses aggressively

#### **Optional Enhancement: Third-Party Services**
- Consider SerpAPI for high-volume needs ($99/month for 5,000 searches)
- Use Apify for pre-built scrapers ($49/month starter)
- Bright Data for enterprise-level scraping

### Cost-Benefit Analysis

| Approach | Cost | Reliability | Speed | Maintenance |
|----------|------|------------|-------|-------------|
| Direct Scraping | Free | 85% | Slow | High |
| Internal API | Free | 70% | Fast | Very High |
| SerpAPI | $99/mo | 95% | Fast | Low |
| Apify | $49/mo | 90% | Medium | Low |
| Hybrid | Variable | 98% | Medium | Medium |

### Recommended: Start with Direct Scraping
- Begin with Playwright scraping (free)
- Add Internal API as fallback
- Consider paid services only if scale demands it
- Monitor success rates and adjust strategy

## Supabase PostgreSQL Benefits

### Why Supabase for This Project

1. **PostgreSQL Power**
   - Full SQL capabilities (joins, aggregations, complex queries)
   - ACID compliance for data integrity
   - Proper relational data modeling with foreign keys
   - Normalized schema reduces data redundancy

2. **Real-time Updates**
   - Built-in realtime subscriptions via websockets
   - Live progress updates during scraping
   - Instant export status notifications
   - Real-time collaboration features (if needed)

3. **Scalability**
   - Vertical and horizontal scaling options
   - Handles 10,000+ channels easily
   - Advanced indexing for query optimization
   - Connection pooling built-in

4. **Cost Effective**
   - Free tier: 500MB database, 1GB file storage
   - 50,000 monthly active users included
   - 2GB bandwidth per month
   - No server maintenance costs

5. **Integrated Services**
   - Supabase Storage for CSV exports
   - Supabase Auth for user management (optional)
   - PostgreSQL functions for background jobs
   - Row Level Security for fine-grained access control

6. **Developer Experience**
   - Excellent TypeScript SDK with auto-generated types
   - Built-in Studio UI for database management
   - Local development with Docker
   - SQL Editor for complex queries
   - Migration system for version control

7. **Advanced Features**
   - Full-text search built into PostgreSQL
   - JSON/JSONB support for flexible data
   - Triggers and functions for automation
   - Materialized views for performance
   - PostGIS for geospatial data (if needed)

### Supabase vs Traditional Solutions

| Feature | Supabase (PostgreSQL) | Firebase (Firestore) |
|---------|----------------------|---------------------|
| Database Type | SQL (Relational) | NoSQL (Document) |
| Setup | Instant | Instant |
| Scaling | Vertical + Horizontal | Automatic |
| Schema | Structured + Flexible | Schema-less |
| Queries | Full SQL + Joins | Limited queries |
| Cost (Free Tier) | 500MB DB, 1GB storage | 1GB storage, limited operations |
| Maintenance | Managed | Zero |
| Real-time | Built-in | Built-in |
| Backup | Automated | Automated |
| Open Source | Yes (PostgreSQL) | No |
| Self-Hosting | Yes | No |
| Data Export | Standard SQL dumps | Custom format |

## Conclusion

This comprehensive plan provides a detailed roadmap for implementing the YouTube Lead Generation application using Supabase PostgreSQL as the database, without requiring the YouTube Data API. The combination of SvelteKit, Supabase, and web scraping creates a powerful, scalable, and cost-effective solution.

### Immediate Next Steps
1. **Review and approve this plan**
2. **Set up development environment**
3. **Create project repository**
4. **Begin Phase 1 implementation**
5. **Establish development workflow**

---

*Document Version: 1.0*
*Last Updated: [Current Date]*
*Total Development Time: 8 weeks*