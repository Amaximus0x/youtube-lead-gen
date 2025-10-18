# Quick Test Guide - YouTube Channel Search

## 🚀 Start Here

### 1. Restart the Development Server

**CRITICAL**: You MUST restart for all changes to take effect!

```bash
# Press Ctrl+C to stop current server (if running)
npm run dev
```

Wait for: `ready in XXXms` or `Local: http://localhost:5173`

---

## 2. Open in Browser

Visit: **http://localhost:5173**

---

## 3. Perform a Test Search

### Recommended Test Queries

**Tech Channels**:
```
Keyword: tech reviews
Limit: 20
```

**Education Channels**:
```
Keyword: IELTS test
Limit: 20
```

**Cooking Channels**:
```
Keyword: cooking tutorials
Limit: 30
```

### Settings
- ✅ Leave filters as defaults for first test
- ✅ Click "Search Channels" button
- ✅ Wait 30-40 seconds (don't close tab!)

---

## 4. Monitor Terminal Output

### ✅ What You Should See

```
Searching YouTube for: tech reviews
Calling searchChannels with keyword="tech reviews", limit=20, enrichData=true
YouTube scraper initialized
Searching YouTube: https://www.youtube.com/results?search_query=tech%20reviews&sp=EgIQAg%253D%253D
Waiting for channel results...
Triggering lazy-load by scrolling...

=== EXTRACTION DEBUG ===
{
  "rendererCount": 20,
  "samples": [...]
}
========================

Extraction returned 20 channels
Extracted 20 channels
Total found: 20 channels for keyword: tech reviews

DEBUG: enrichData = true, channels.length = 20
Enriching channel data by visiting channel pages...
Fetching detailed info for 10 channels...
Fetching details for: https://www.youtube.com/@IDTR
Got details: {
  subscriberCount: 190000,
  videoCount: 688,
  description: "In-depth tech reviews...",
  emails: ["business@idtr.com"],
  socialLinks: { instagram: "...", twitter: "..." }
}
Fetching details for: https://www.youtube.com/@SulitTechReviews
Got details: { subscriberCount: 800000, videoCount: 450, ... }
... (8 more channels)

Enriched 10 channels with detailed data
Saved 20 channels to database
```

### Key Success Indicators

| Log Message | Meaning |
|------------|---------|
| ✅ `Extracted 20 channels` | Basic extraction worked |
| ✅ `DEBUG: enrichData = true` | Enrichment is enabled |
| ✅ `Enriching channel data...` | Enrichment started |
| ✅ `Fetching details for:` (10 times) | Visiting channel pages |
| ✅ `subscriberCount: 190000` | Subscriber count extracted! |
| ✅ `videoCount: 688` | Video count extracted! |
| ✅ `emails: [...]` | Email found! |
| ✅ `Enriched 10 channels` | Enrichment completed |
| ✅ `Saved 20 channels to database` | Data saved to Supabase |

---

## 5. Check Results in UI

### ✅ Expected Results Table

**First 10 Channels** (enriched):
```
┌────────────────────────────────────────────────────────────────┐
│ Channel Name          Subscribers    Videos      Relevance     │
├────────────────────────────────────────────────────────────────┤
│ 🖼️ In Depth Tech      190K          688         ████████░░ 85% │
│    Reviews                                                      │
│    [Visit Channel] [Extract Email] [View Contacts]             │
├────────────────────────────────────────────────────────────────┤
│ 🖼️ Sulit Tech         800K          450         ███████░░░ 80% │
│    Reviews                                                      │
│    [Visit Channel] [Extract Email] [View Contacts]             │
├────────────────────────────────────────────────────────────────┤
│ ... 8 more enriched channels with real data                    │
└────────────────────────────────────────────────────────────────┘
```

**Remaining 10 Channels** (not enriched):
```
┌────────────────────────────────────────────────────────────────┐
│ Channel Name          Subscribers    Videos      Relevance     │
├────────────────────────────────────────────────────────────────┤
│ 🖼️ Tech Channel 11    Unknown       Unknown     ███████░░░ 75% │
│    [Visit Channel] [Extract Email]                             │
│ ... more channels (basic info only)                            │
└────────────────────────────────────────────────────────────────┘
```

### ✅ What to Verify

1. **Channel Names**: Clean, no duplicates (e.g., "IELTS Advantage" NOT "IELTS Advantage IELTS Advantage")
2. **Thumbnails**: Present for most channels
3. **Subscriber Counts** (first 10): Real numbers like "190K", "800K", "3.74K" (NOT "Unknown")
4. **Video Counts** (first 10): Real numbers like "688 videos", "450 videos" (NOT "Unknown")
5. **Relevance Scores**: Progress bars showing 60-100%
6. **Action Buttons**: "Visit Channel", "Extract Email" buttons present

---

## 6. Common Issues & Quick Fixes

### ❌ Issue: All channels show "Unknown" subscribers

**Check Terminal**:
- Do you see "Enriching channel data..."?
  - **NO**: Server not restarted → Press Ctrl+C and `npm run dev` again
  - **YES**: Check next step

- Do you see "Got details: { subscriberCount: XXX }"?
  - **NO**: Extraction failing → Check network/YouTube access
  - **YES**: Data extracted but not displayed → Check UI mapping

**Fix**:
1. Hard refresh browser: `Ctrl + Shift + R`
2. Check terminal for errors
3. Verify `.env` file has Supabase credentials

---

### ❌ Issue: Search returns 0 channels

**Check Terminal**:
- Do you see "Extracted 0 channels"?
  - **YES**: Playwright not loading page properly

**Fix**:
1. Check internet connection
2. Try headless=false to see browser:
   - Edit `src/lib/server/youtube/scraper-v2.ts` line 22
   - Change `headless: true` to `headless: false`
   - Restart server
3. YouTube might be blocking → Wait 2 minutes and try again

---

### ❌ Issue: "YouTube scraper initialization failed"

**Check Terminal**:
- Error message about Playwright?

**Fix**:
```bash
# Reinstall Playwright browsers
npx playwright install chromium
```

---

### ❌ Issue: Search takes forever (>2 minutes)

**Check Terminal**:
- Is it stuck on "Fetching details for..."?

**Possible Causes**:
1. Slow internet
2. YouTube timeout
3. Channel page taking long to load

**Fix**:
1. Wait a bit longer (enrichment takes 30-40 seconds)
2. If stuck >2 minutes, refresh page and try again
3. Reduce enrichment count (see Configuration below)

---

## 7. Verify Database Save

### Check Supabase Dashboard

1. Go to: https://supabase.com/dashboard
2. Open your project
3. Click "Table Editor" → "channels"
4. You should see 20 new rows with:
   - ✅ channel_id (e.g., "@IDTR")
   - ✅ name
   - ✅ subscriber_count (for first 10)
   - ✅ video_count (for first 10)
   - ✅ search_keyword
   - ✅ relevance_score

---

## 8. Test Different Scenarios

### Test 1: Basic Search (No Filters)
```
Keyword: tech reviews
Limit: 20
Filters: All unchecked
```
**Expected**: 20 channels, first 10 enriched

---

### Test 2: Subscriber Range Filter
```
Keyword: tech reviews
Limit: 50
Min Subscribers: 100000 (100K)
Max Subscribers: 1000000 (1M)
```
**Expected**: Only channels with 100K-1M subscribers

---

### Test 3: Exclude Music Channels
```
Keyword: music
Limit: 30
✓ Exclude music channels
```
**Expected**: Music channels filtered out

---

### Test 4: Large Limit
```
Keyword: cooking
Limit: 50
```
**Expected**: 50 channels returned, first 10 enriched (takes ~40 seconds)

---

## 9. Performance Benchmarks

| Scenario | Expected Time | Channels | Enriched |
|----------|--------------|----------|----------|
| Small search (20 channels) | ~25 seconds | 20 | 10 |
| Medium search (50 channels) | ~35 seconds | 50 | 10 |
| Large search (100 channels) | ~45 seconds | 100 | 10 |
| No enrichment | ~5 seconds | 20 | 0 |

---

## 10. Advanced Configuration

### Enrich More Channels

**File**: `src/lib/server/youtube/scraper-v2.ts`
**Line**: 128

```typescript
// Change from 10 to 20 to enrich first 20 channels
const channelsToEnrich = channels.slice(0, Math.min(20, channels.length));
```

**Trade-off**: +20 seconds processing time

---

### Disable Enrichment (Faster)

**File**: `src/routes/api/youtube/search/+server.ts`
**Line**: 24

```typescript
// Change true to false to disable enrichment
const rawChannels = await scraper.searchChannels(keyword, limit, false);
```

**Trade-off**: Faster (~5s) but subscriber counts will show "Unknown"

---

## 11. Success Criteria

### ✅ Everything Working If:

1. **Terminal shows**:
   - ✅ "Extracted 20 channels"
   - ✅ "Enriching channel data..."
   - ✅ "Got details: { subscriberCount: XXX }"
   - ✅ "Enriched 10 channels"
   - ✅ "Saved 20 channels to database"

2. **UI shows**:
   - ✅ 20 channel rows
   - ✅ First 10 have real subscriber counts (190K, 800K, etc.)
   - ✅ Channel names clean (no duplicates)
   - ✅ Thumbnails present
   - ✅ Action buttons work

3. **Supabase shows**:
   - ✅ 20 new rows in channels table
   - ✅ subscriber_count populated for first 10

---

## 12. Next Steps After Successful Test

1. ✅ **If all working**: Mark Phase 2 as complete
2. 🎯 **Display contact info in UI**: Show emails and social links in table
3. 📤 **Implement CSV export**: Export channels with contact info
4. 📧 **Add email verification**: Verify extracted emails are valid
5. 🚀 **Move to Phase 3**: Campaign management and email outreach

---

## 📞 Get Help

If something doesn't work:

1. **Check terminal logs** for error messages
2. **Check browser console** (F12) for JavaScript errors
3. **Review documentation**:
   - `IMPLEMENTATION_STATUS.md` - Full feature overview
   - `TESTING_ENRICHMENT.md` - Detailed testing guide
   - `ISSUES_FIXED.md` - History of fixes
4. **Verify setup**:
   - `.env` file has correct Supabase credentials
   - `npm install` completed successfully
   - Playwright installed: `npx playwright install chromium`

---

## ✅ Expected Result Summary

After following this guide, you should see:

```
✅ Dev server running
✅ Browser shows search UI
✅ Search completes in ~30 seconds
✅ Terminal shows enrichment logs
✅ UI displays 20 channels
✅ First 10 channels have accurate subscriber counts
✅ First 10 channels have video counts
✅ Contact info extracted (if available)
✅ All channels saved to Supabase
✅ No errors in terminal or console
```

---

**Ready to test!** 🚀

Start with: `npm run dev` → Open http://localhost:5173 → Search "tech reviews"
