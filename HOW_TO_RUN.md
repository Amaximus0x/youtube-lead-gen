# How to Run the App 🚀

Everything is set up and ready to go! Here's how to start the app:

## Quick Start

### 1. Start the Development Server

```bash
npm run dev
```

### 2. Open Your Browser

Visit: **http://localhost:5173**

You should see the YouTube Lead Generation app with two tabs:
- **Generate Leads** - Search for YouTube channels
- **Extract Emails** - Extract contact information (Phase 3)

## How to Search for Channels

### Step-by-Step:

1. **Enter a Keyword**
   - Type something like: `tech reviews`, `cooking`, `gaming tutorials`, `fitness`
   - Be specific for better results

2. **Set Number of Results** (optional)
   - Default: 50 channels
   - Range: 10-100

3. **Open Advanced Filters** (optional)
   - **Min Subscribers**: e.g., `1000` (1K+)
   - **Max Subscribers**: e.g., `100000` (100K)
   - **Exclude music channels**: ✓ (recommended)
   - **Exclude brand channels**: ✓ (recommended)
   - **Language**: Select if needed

4. **Click "Search Channels"**
   - Wait 10-30 seconds (this is normal!)
   - You'll see a loading spinner

5. **View Results**
   - See channels with thumbnails, subscriber counts, relevance scores
   - Channels are automatically saved to your Supabase database

## Example Searches

### Tech Channels (1K-50K subscribers)
```
Keyword: tech reviews
Min Subs: 1000
Max Subs: 50000
✓ Exclude music
✓ Exclude brands
```

### Cooking Channels (Any size)
```
Keyword: cooking
Limit: 50
✓ Exclude music
✓ Exclude brands
```

### Gaming Tutorials (10K-100K)
```
Keyword: gaming tutorials
Min Subs: 10000
Max Subs: 100000
```

## What You'll See

Each channel result shows:
- 📸 **Thumbnail** - Channel profile picture
- 📝 **Name & Description** - Channel info
- 👥 **Subscribers** - Formatted (e.g., 1.5M, 250K)
- 🎬 **Video Count** - Number of videos
- ⭐ **Relevance Score** - How well it matches your keyword (0-100%)
- 📧 **Email Status** - Currently "Pending" (Phase 3 will extract)
- 🔗 **Actions** - Visit channel or extract email

## Important Notes

### ⏱️ Search Speed
- Searches take **10-30 seconds** - this is intentional
- Uses random delays to avoid YouTube detection
- Don't worry, it's working! Just be patient

### 💾 Database
- All channels are automatically saved to Supabase
- You can view them in your Supabase dashboard
- Navigate to: https://supabase.com → Your Project → Table Editor → `channels`

### 🔍 Search Quality
- **Higher relevance scores** = better keyword match
- Results are sorted by relevance
- Filters help narrow down to ideal channels

### ⚠️ Troubleshooting

**"Supabase client not initialized"**
- Check your `.env` file has correct credentials
- Restart the dev server: `Ctrl+C` then `npm run dev`

**"Search failed" or timeout errors**
- YouTube may have rate-limited the requests
- Wait 1-2 minutes and try again
- Try a different keyword

**No results found**
- Try a broader keyword (e.g., "gaming" instead of "minecraft speedruns")
- Remove or adjust subscriber filters
- Make sure filters aren't too restrictive

**Slow loading**
- This is normal! Scraping takes time
- 50 channels = ~20-30 seconds
- Be patient, it will complete

## What's Saved to Database

When you search, the following is saved for each channel:
- ✅ Channel ID, name, URL
- ✅ Description
- ✅ Subscriber count, video count
- ✅ Search keyword used
- ✅ Relevance score
- ✅ Status (pending, processing, completed)
- ✅ Timestamps (created_at, updated_at)

## Next Steps (Phase 3)

Once we implement Phase 3, you'll be able to:
- Click "Extract Email" button
- Get email addresses from YouTube About pages
- Fallback to social media (Instagram, Twitter) if needed
- Verify email addresses
- Export to CSV or Google Sheets

## Stop the Server

Press `Ctrl+C` in the terminal to stop the dev server.

## View Logs

The terminal will show:
- Search requests
- Channels found
- Database operations
- Any errors

Example output:
```
Searching YouTube: https://www.youtube.com/results?search_query=tech+reviews&sp=...
Found 52 channels for keyword: tech reviews
Saved 45 channels to database
```

---

## Ready to Test? 🎉

Run:
```bash
npm run dev
```

Then visit **http://localhost:5173** and search for channels!

Try searching for: `tech reviews`, `cooking`, or any topic you're interested in!
