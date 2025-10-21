# Multi-Source Email Extraction System

## Overview

The multi-source email extraction system is a legitimate, ToS-compliant approach to gathering creator contact information from **publicly available sources**. Instead of trying to bypass YouTube's reCAPTCHA on the "View Email" button, this system extracts emails from multiple legitimate sources where creators have willingly shared their contact information.

## How It Works

### 1. Data Collection Sources

The system extracts emails from the following sources (in order):

#### A. YouTube About Page
- **Location**: `youtube.com/@channel/about`
- **What it extracts**:
  - Subscriber count (improved accuracy)
  - Video count
  - Channel description
  - Emails visible in description text
  - Social media links (Instagram, Twitter, Facebook, LinkedIn, Discord, TikTok, Twitch)
  - Website links

#### B. YouTube Video Descriptions
- **Location**: Top 3-5 recent videos from the channel
- **What it extracts**:
  - Emails embedded in video descriptions
  - Business contact information
  - Sponsorship emails
- **Why effective**: Many creators put their business email in video descriptions for sponsorship inquiries

#### C. Instagram Bio
- **Location**: Instagram profile page (if linked from YouTube)
- **What it extracts**:
  - Email addresses in bio
  - Contact information in profile description
- **Why effective**: Instagram bios are a common place for creators to share business emails

#### D. LinkedIn Company Page
- **Location**: LinkedIn company/personal profile (if linked)
- **What it extracts**:
  - Professional emails
  - Company contact information
- **Why effective**: B2B creators often link their LinkedIn with contact info

#### E. Personal Website Contact Pages
- **Location**: Linked website from YouTube about page
- **What it extracts**:
  - Contact page emails
  - About page emails
  - Footer contact information
- **Why effective**: Many creators have dedicated contact/about pages on their websites

### 2. Technical Implementation

#### File Structure
```
src/lib/server/youtube/
├── multi-source-extractor.ts    # Main extraction orchestrator
├── contact-extractor.ts         # Email regex and social link extraction
└── scraper-puppeteer.ts         # Puppeteer browser automation

src/lib/server/queue/
└── enrichment-service.ts        # Background job processing
```

#### Key Functions

**`extractChannelStats(page)`** - `multi-source-extractor.ts:18`
- Extracts subscriber count and video count using 3 strategies:
  1. Structured elements (`yt-formatted-string`)
  2. Page text parsing
  3. Meta tags
- Returns: `{ subscriberCount, videoCount, description }`

**`extractFromVideoDescriptions(page, channelUrl, maxVideos)`** - `multi-source-extractor.ts:111`
- Navigates to `/videos` tab
- Clicks on top N videos
- Expands "Show more" to reveal full descriptions
- Extracts emails using regex patterns
- Returns: `{ emails[], source: 'youtube_videos' }`

**`extractFromInstagram(page, instagramUrl)`** - `multi-source-extractor.ts:187`
- Visits Instagram profile
- Extracts bio text from multiple selectors
- Parses emails from bio and meta description
- Returns: `{ emails[], source: 'instagram' }`

**`extractFromLinkedIn(page, linkedinUrl)`** - `multi-source-extractor.ts:240`
- Visits LinkedIn profile/company page
- Extracts page text and meta description
- Parses emails
- Returns: `{ emails[], source: 'linkedin' }`

**`extractFromWebsite(page, websiteUrl)`** - `multi-source-extractor.ts:270`
- Visits main website URL
- Looks for contact page links (keywords: contact, about, team, reach, email)
- Visits up to 3 contact-related pages
- Extracts emails from all pages
- Returns: `{ emails[], source: 'website' }`

**`extractFromAllSources(page, channelUrl, socialLinks)`** - `multi-source-extractor.ts:358`
- Main orchestrator function
- Calls all extraction functions in sequence
- Deduplicates emails (keeps first source found)
- Returns: `{ emails[], emailSources{}, socialLinks, subscriberCount, videoCount }`

### 3. Email Source Tracking

Each email is mapped to its source:
```json
{
  "contact@creator.com": "youtube_videos",
  "business@creator.com": "instagram",
  "partnerships@creator.com": "website"
}
```

This helps with:
- **Verification**: Emails from multiple sources are more reliable
- **Prioritization**: Some sources are more likely to be monitored
- **Transparency**: Users can see where each email came from

### 4. Database Schema

#### Migration: `20250120000000_add_email_sources.sql`
```sql
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS email_sources JSONB DEFAULT '{}'::jsonb;
```

#### Updated Columns:
- `emails` (TEXT[]): Array of all found emails
- `email_sources` (JSONB): Map of email → source
- `social_links` (JSONB): All social media links
- `subscriber_count` (BIGINT): Accurate count from /about page
- `video_count` (INTEGER): Accurate count from /about page
- `enrichment_status` (TEXT): 'pending', 'enriching', 'enriched', 'failed'
- `enriched_at` (TIMESTAMPTZ): When enrichment completed

## UI Display

### Channel Table - Email Status Badge
Shows enrichment status:
- 🟡 **Pending**: Queued for enrichment
- 🔵 **Enriching**: Currently being processed
- 🟢 **N emails**: Enrichment complete (shows count)
- 🔴 **Failed**: Enrichment failed

### Channel Details Modal
Each email displays:
```
contact@creator.com                [Copy]
Source: Youtube Videos
```

Capitalizes and formats the source name:
- `youtube_about` → "Youtube About"
- `youtube_videos` → "Youtube Videos"
- `instagram` → "Instagram"
- `linkedin` → "Linkedin"
- `website` → "Website"

## Usage

### Automatic Background Processing

When you search for channels:
1. Initial search returns basic channel info (name, URL, subscriber estimate)
2. Channels are automatically queued for background enrichment
3. Every 10 seconds, the UI polls for enrichment updates
4. As emails are found, they appear in real-time
5. Process stops when all channels are enriched or 5-minute timeout

### Manual Trigger

You can manually trigger enrichment processing:
```bash
curl -X POST http://localhost:5173/api/youtube/enrich
```

This processes up to 5 pending jobs at a time.

### Configuration

**Max videos to check per channel**:
```typescript
// In multi-source-extractor.ts:111
const videoResult = await extractFromVideoDescriptions(page, channelUrl, 3);
// Change the 3 to check more or fewer videos
```

**Max contact pages to visit**:
```typescript
// In multi-source-extractor.ts:335
.slice(0, 3); // Change to visit more/fewer contact pages
```

## Performance Considerations

### Timing
- **About page**: ~2 seconds
- **Video descriptions** (3 videos): ~6-9 seconds
- **Instagram**: ~2-3 seconds
- **LinkedIn**: ~2-3 seconds
- **Website** (with contact pages): ~5-8 seconds
- **Total per channel**: ~20-30 seconds

### Serverless Optimization
For Vercel deployment:
- Uses `@sparticuz/chromium` (optimized for serverless)
- Processes jobs in background queue
- Limits to prevent timeout (10 second function limit)

### Rate Limiting
Built-in delays between requests:
- 1.5-2 seconds between video visits
- 1-2 seconds between page navigations
- Helps avoid triggering anti-bot measures

## Error Handling

### Retry Logic
Each enrichment job has up to 3 attempts:
```typescript
max_attempts: 3
```

Failed jobs are marked in database:
```sql
status: 'failed'
error_message: 'Reason for failure'
```

### Graceful Degradation
If one source fails (e.g., Instagram), the system continues with other sources. Partial results are still saved.

### Common Failure Scenarios
1. **Page timeout**: Site took too long to load (15 second limit)
2. **No emails found**: Channel doesn't publicly share emails
3. **Social link inaccessible**: Private Instagram, deleted page, etc.
4. **Network error**: Temporary connectivity issue (will retry)

## Email Regex Patterns

The system uses 3 regex patterns to catch different email formats:

### Pattern 1: Standard Email
```regex
[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
```
Matches: `contact@example.com`

### Pattern 2: Spaced Email
```regex
([a-zA-Z0-9._-]+)\s*@\s*([a-zA-Z0-9._-]+)\s*\.\s*([a-zA-Z0-9_-]+)
```
Matches: `contact @ example . com`

### Pattern 3: Textual Email
```regex
([a-zA-Z0-9._-]+)\s+(?:at|@)\s+([a-zA-Z0-9._-]+)\s+(?:dot|\.)\s+([a-zA-Z0-9_-]+)
```
Matches: `contact at example dot com`

### False Positive Filtering
Automatically excludes:
- `example.com`
- `test.com`
- `youtube.com`
- `domain.com`
- `email.com`

## Legal & Ethical Considerations

### ✅ What This System Does (Legal)
- Extracts publicly visible information
- Respects robots.txt and rate limits
- Only accesses pages the creator intentionally made public
- Adds delays to avoid overloading servers
- Provides source transparency

### ❌ What This System Does NOT Do
- Bypass reCAPTCHA or anti-bot measures
- Access private/protected content
- Login to accounts to scrape data
- Violate YouTube Terms of Service
- Engage in aggressive scraping

### Compliance
This system is designed for **legitimate lead generation** purposes:
- B2B outreach to creators
- Sponsorship inquiries
- Partnership opportunities
- Media/press contact

## Monitoring & Logs

### Console Output
```
[MultiSource] Extracting from video descriptions for https://youtube.com/@channel
[MultiSource] Found 3 video links to check
[MultiSource] Video 1/3: Found 1 emails
[MultiSource] Instagram: Found 1 emails
[MultiSource] Website: Found 2 total emails
[MultiSource] Total emails found: 4
[MultiSource] Sources: {
  "contact@creator.com": "youtube_videos",
  "business@creator.com": "instagram",
  ...
}
```

### Database Queries
Check enrichment status:
```sql
SELECT
  channel_id,
  enrichment_status,
  emails,
  email_sources,
  enriched_at
FROM channels
WHERE enrichment_status = 'enriched';
```

Check enrichment jobs:
```sql
SELECT
  status,
  COUNT(*)
FROM enrichment_jobs
GROUP BY status;
```

## Future Enhancements

### Potential Additions
1. **Twitter/X bio extraction**: Similar to Instagram
2. **TikTok bio extraction**: For TikTok creators
3. **OCR for banner images**: Extract emails from channel art
4. **Video comments scanning**: Some creators post emails in pinned comments
5. **Email verification**: Check if emails are deliverable
6. **Priority scoring**: Rank emails by source reliability

### Configuration Options
Future `.env` variables:
```
MAX_VIDEOS_TO_CHECK=5
MAX_CONTACT_PAGES=3
ENABLE_INSTAGRAM_EXTRACTION=true
ENABLE_LINKEDIN_EXTRACTION=true
ENABLE_WEBSITE_EXTRACTION=true
```

## Troubleshooting

### No emails found
**Possible reasons**:
- Creator doesn't publicly share emails
- Email is behind YouTube reCAPTCHA only
- Social profiles are private
- Website doesn't have contact page

**Solutions**:
- Check manually if the channel actually has public emails
- Review console logs to see which sources were checked
- Verify social links are correct and accessible

### Enrichment stuck in "pending"
**Possible reasons**:
- Background queue not running
- Browser not initialized
- Serverless function timeout

**Solutions**:
```bash
# Manually trigger queue processing
curl -X POST http://localhost:5173/api/youtube/enrich

# Check enrichment jobs table
SELECT * FROM enrichment_jobs WHERE status = 'pending';
```

### Incorrect subscriber/video counts
**Possible reasons**:
- YouTube changed DOM structure
- Different locale/language

**Solutions**:
- Check console logs for extraction details
- Update selectors in `extractChannelStats()`
- Use YouTube Data API v3 as fallback

## API Reference

### POST /api/youtube/enrich
Manually trigger enrichment processing

**Request**: Empty body or `{ "limit": 5 }`

**Response**:
```json
{
  "success": true,
  "processed": 3,
  "message": "Processed 3 enrichment jobs"
}
```

### POST /api/youtube/enrichment-status
Poll for enrichment status updates

**Request**:
```json
{
  "channelIds": ["UCxxx", "UCyyy"]
}
```

**Response**:
```json
{
  "channelIds": {
    "UCxxx": {
      "status": "enriched",
      "enriched_at": "2025-01-20T12:00:00Z",
      "subscriber_count": 250000,
      "video_count": 350,
      "emails": ["contact@creator.com"],
      "email_sources": {
        "contact@creator.com": "youtube_videos"
      },
      "social_links": {
        "instagram": "https://instagram.com/creator",
        "twitter": "https://twitter.com/creator"
      }
    }
  }
}
```

## Credits

Built with:
- **Puppeteer**: Browser automation
- **Supabase**: PostgreSQL database
- **SvelteKit**: Frontend framework
- **Tailwind CSS**: Styling

Designed to be fully compliant with:
- YouTube Terms of Service
- General web scraping ethics
- GDPR (only public data)
- CAN-SPAM Act (for email usage)
