# Debug Logging Added - Social Links & Stats Extraction

## Issues Being Investigated

### Issue 1: 0 Social Links for All Channels
**Problem**: Every channel showing "0 social links" despite code running
**Terminal output**: `[Stats X/15] Channel Name: XXX subs, XXX videos, 0 social links`

### Issue 2: Unknown Stats for Some Channels
**Problem**: Some channels showing "Unknown" for subscriber/video counts
**Terminal output**: `[Stats X/15] Channel Name: Unknown subs, Unknown videos, 0 social links`

---

## Debug Logging Added

### Location
File: `src/lib/server/youtube/scraper-puppeteer.ts`

### Social Links Extraction (Lines 673-750)

Added comprehensive logging:

```typescript
// Debug: Log total links found
console.log(`[DEBUG] Total links found on page: ${links.length}`);

// Debug: Check for links section specifically
const linksSection = document.querySelector('#links-section, ytd-channel-about-metadata-renderer');
console.log(`[DEBUG] Links section found: ${linksSection ? 'YES' : 'NO'}`);

// Try more specific selector for channel links
const channelLinks = Array.from(document.querySelectorAll(
    '#link-list-container a[href], ' +
    'ytd-channel-about-metadata-renderer a[href], ' +
    '#links-section a[href], ' +
    'a.yt-simple-endpoint[href]'
));

console.log(`[DEBUG] Channel-specific links found: ${channelLinks.length}`);

// Each time a social link is found:
console.log(`[DEBUG] Found Instagram: ${href}`);
console.log(`[DEBUG] Found Twitter/X: ${href}`);
// ... etc

// Final count:
console.log(`[DEBUG] Total social links extracted: ${Object.keys(socialLinks).length}`);
```

### Stats Extraction (Lines 645-671)

Added logging for table/stats extraction:

```typescript
console.log(`[DEBUG] Found ${tables.length} table/stats elements to check`);
console.log(`[DEBUG] Found subscribers in table: ${match[1]}`);
console.log(`[DEBUG] Found videos in table: ${match[1]}`);
console.log(`[DEBUG] Final extracted stats - Subs: ${result.subscriberCount || 'null'}, Videos: ${result.videoCount || 'null'}`);
```

---

## What to Look For in Terminal Output

### When You Search for a Keyword (e.g., "fitness")

**Expected debug output for EACH channel:**

```
[Stats 1/15] Fetching stats for: Channel Name
[DEBUG] Total links found on page: 150
[DEBUG] Links section found: YES
[DEBUG] Channel-specific links found: 8
[DEBUG] Found Instagram: https://instagram.com/channelname
[DEBUG] Found Twitter/X: https://twitter.com/channelname
[DEBUG] Found Website: https://example.com
[DEBUG] Total social links extracted: 3
[DEBUG] Found 3 table/stats elements to check
[DEBUG] Found subscribers in table: 620K
[DEBUG] Found videos in table: 319
[DEBUG] Final extracted stats - Subs: 620000, Videos: 319
[Stats 1/15] Channel Name: 620000 subs, 319 videos, 3 social links
```

### If Social Links = 0

Possible debug outputs:

**Case 1: No links found at all**
```
[DEBUG] Total links found on page: 0
[DEBUG] Links section found: NO
[DEBUG] Channel-specific links found: 0
[DEBUG] Total social links extracted: 0
```
→ **Cause**: Page not loading properly or wrong URL

**Case 2: Links found but none are social media**
```
[DEBUG] Total links found on page: 100
[DEBUG] Links section found: YES
[DEBUG] Channel-specific links found: 15
[DEBUG] Total social links extracted: 0
```
→ **Cause**: Channel genuinely has no social media links, OR selectors not matching

**Case 3: Links section not found**
```
[DEBUG] Total links found on page: 200
[DEBUG] Links section found: NO
[DEBUG] Channel-specific links found: 0
[DEBUG] Total social links extracted: 0
```
→ **Cause**: YouTube changed /about page structure, need new selectors

### If Stats = Unknown

Possible debug outputs:

```
[DEBUG] Found 0 table/stats elements to check
[DEBUG] Final extracted stats - Subs: null, Videos: null
```
→ **Cause**: Table selectors not finding elements

```
[DEBUG] Found 3 table/stats elements to check
[DEBUG] Final extracted stats - Subs: null, Videos: null
```
→ **Cause**: Tables found but regex not matching text

---

## Next Steps Based on Debug Output

### If you see "Total links found: 0"
1. Page not loading properly
2. Need to add longer wait time before extracting
3. Check if /about URL is correct

### If you see "Links section found: NO"
1. YouTube changed the /about page structure
2. Need to inspect actual page HTML to find new selectors
3. May need to try different selectors like:
   - `#channel-header-links`
   - `.channel-external-links`
   - `ytd-browse`

### If you see "Channel-specific links found: 0" but "Total links found: 100+"
1. Our specific selectors are wrong
2. Fall back to checking ALL links (already implemented)
3. Should still find social links if they exist

### If you see "table/stats elements: 0"
1. Table selectors not matching
2. Need to try different selectors for stats section
3. May need to scrape from different location on page

---

## How to Test

1. **Ensure dev server is running** (should already be started)
2. **Open browser**: http://localhost:5173
3. **Search for**: "fitness" or "cooking" (keywords with many channels)
4. **Watch terminal output** for [DEBUG] logs
5. **Copy the debug logs** and share them

---

## Expected Results

For a successful extraction, you should see:

✅ **Social Links**:
```
[DEBUG] Links section found: YES
[DEBUG] Channel-specific links found: 5+
[DEBUG] Found Instagram: ...
[DEBUG] Found Twitter/X: ...
[DEBUG] Total social links extracted: 2+ (for channels that have them)
```

✅ **Stats**:
```
[DEBUG] Found subscribers in table: 620K
[DEBUG] Found videos in table: 319
[DEBUG] Final extracted stats - Subs: 620000, Videos: 319
```

---

## Current Selectors Being Tried

### Social Links Selectors:
- `#link-list-container a[href]` - Link list container
- `ytd-channel-about-metadata-renderer a[href]` - About metadata renderer
- `#links-section a[href]` - Links section
- `a.yt-simple-endpoint[href]` - Simple endpoint links
- `a[href]` - All links (fallback)

### Stats Selectors:
- Text search for "subscriber" and "video" keywords
- `table, .about-stats, #right-column` - Table/stats containers
- Full page text parsing as fallback

---

## What This Will Tell Us

The debug logs will reveal:

1. ✅ Whether the page is loading properly (link count > 0)
2. ✅ Whether our selectors are finding the right containers
3. ✅ Which selectors work and which don't
4. ✅ Whether channels actually have social links or not
5. ✅ Exactly where the extraction is failing
6. ✅ What the actual values are before parsing

Once we see the debug output, we can:
- Fix selectors if they're wrong
- Add wait times if page not loading
- Adjust regex if parsing failing
- Update extraction strategy based on actual YouTube structure

---

## Ready to Test

The debug logging is now active. Please:

1. Search for a keyword (e.g., "fitness", "cooking", "tech reviews")
2. Watch the terminal for [DEBUG] logs
3. Share the debug output here

This will help us identify exactly why social links and some stats are not being extracted!
