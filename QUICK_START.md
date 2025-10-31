# Quick Start Testing Guide

## Both Servers Are Running
- Backend: http://localhost:3000
- Frontend: http://localhost:5173

## How to Test (3 Simple Steps)

### 1. Open the App
**Go to:** http://localhost:5173

### 2. Enter Search Details
- **Keyword:** coding
- **Limit:** 10 (minimum allowed - perfect for testing)

### 3. Click "Search Channels" and Wait
**Expected time: 90-120 seconds (1.5-2 minutes)**

## Why It Takes 1.5-2 Minutes (This is NORMAL!)

The backend is actively scraping YouTube:
- Opening a real browser
- Searching YouTube
- Visiting 10 channel pages
- Extracting stats from each (10 seconds per channel)
- Finding social links
- Calculating scores

**This is real web scraping - it's slow but accurate!**

## What You'll See

After 1.5-2 minutes:
- Table with 10 channels
- Subscriber counts (2.34M, 500K, etc.)
- Video counts
- View counts
- Countries (India, USA, etc.)
- Social media links

## If Nothing Happens After 5 Minutes

1. Check backend terminal for errors
2. Check browser console (F12 → Console tab)
3. Restart backend: cd ../youtube-lead-gen-backend && npm run dev
4. Refresh browser and try again

## Success!

If you see a table with 10 channels after waiting 1.5-2 minutes, the migration is working perfectly!

**The wait time is NORMAL - this is real web scraping!**
