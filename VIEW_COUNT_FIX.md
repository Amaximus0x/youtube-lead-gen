# View Count Fix - Pinned Video Issue (MINIMAL FIX)

## Problem

The view count displayed in the channel table was sometimes showing the view count of a pinned video instead of the total channel view count.

## Root Cause

When a channel has a pinned video, the extraction logic would pick up the first "views" text after finding "videos", which could be the pinned video's view count instead of the channel's total view count.

## Solution - Minimal Change

**The fix adds ONLY a proximity check** to the existing working code:

### What Changed

In the original code, after finding a line with "X videos", it would take the **next** line with "X views" as the channel view count.

The fix adds a simple distance check:

```typescript
// Only accept "views" if it's within 3 lines of "videos"
if (distance <= 3) {
  result.viewCount = parseCount(viewMatch[1]);
}
```

### Why This Works

- Channel stats (subscribers, videos, views) appear **sequentially** in the stats section
- They are always within 1-3 lines of each other
- Pinned video views appear much further down the page (10+ lines away)
- By limiting the distance to 3 lines, we ensure we get the channel views, not video views

## What Was NOT Changed

- ✅ All existing subscriber extraction logic (unchanged)
- ✅ All existing video count extraction logic (unchanged)
- ✅ All existing country extraction logic (unchanged)
- ✅ All existing description extraction logic (unchanged)
- ✅ All existing social links extraction logic (unchanged)

## The Fix Applied

1. **Strategy 1**: Parse page text, accept views within 3 lines of videos
2. **Strategy 2**: Check table elements, accept views within 2 positions of videos
3. **Strategy 3**: Check #right-column, accept views within 3 lines of videos

All three strategies use the same proximity principle without changing any other logic.

## Files Modified

- `/src/lib/server/youtube/scraper-puppeteer.ts` - Added proximity check to view count extraction only
