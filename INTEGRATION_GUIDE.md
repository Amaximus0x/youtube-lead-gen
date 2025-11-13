# Frontend-Backend Integration Guide

## Overview
This document explains how the frontend (SvelteKit) connects to the backend (NestJS) API.

## 📋 Quick Start

### 1. Start Backend Server

```bash
cd E:\Cursor\youtube-scraper-backend
npm run start:dev
```

**Expected Output:**
- Server starts on port 8090
- You should see: `Nest application successfully started`
- API available at: `http://localhost:8090`

### 2. Start Frontend Server

```bash
cd E:\Cursor\youtube-lead-gen
npm run dev
```

**Expected Output:**
- Frontend starts on port 5173 (or similar)
- You can access the app at: `http://localhost:5173`

### 3. Test the Integration

**Option A: Use the Test Page**
1. Open `E:\Cursor\youtube-lead-gen\test-api-connection.html` in your browser
2. Click "Test API Connection"
3. You should see a success message

**Option B: Use the Frontend App**
1. Go to `http://localhost:5173`
2. Enter a search keyword (e.g., "fitness")
3. Click "Search Channels"
4. Results should appear in the table

---

## ✅ What's Working

### Backend (NestJS)
- ✅ **Port:** 8090
- ✅ **Endpoint:** `POST /youtube/search`
- ✅ **CORS:** Enabled for all origins
- ✅ **Response Format:** Standardized with `{status, data}` structure

### Frontend (SvelteKit)
- ✅ **API Client:** Properly configured at `src/lib/api/client.ts`
- ✅ **Environment:** `PUBLIC_API_URL=http://localhost:8090`
- ✅ **Search Form:** Sends correct payload
- ✅ **Error Handling:** Catches and displays errors
- ✅ **UI Components:** ChannelTable displays results correctly

### Data Flow
```
User Input → SearchForm.svelte
  ↓
API Client (apiPost)
  ↓
Backend API (POST /youtube/search)
  ↓
Response {status: "success", data: {...}}
  ↓
channelsStore (Svelte Store)
  ↓
ChannelTable.svelte (Display)
```

---

## 🔧 Recent Fixes Applied

### 1. Fixed Enrichment Polling Endpoint ✅
**Before:**
```typescript
await apiPost('/api/youtube/enrichment-status', { channelIds })
```

**After:**
```typescript
await apiPost('/enrichment/status', { channelIds })
```

**File:** `src/lib/components/search/SearchForm.svelte:96`

### 2. Disabled "Load More" Button ⚠️
The "Load More" functionality is temporarily disabled because the backend doesn't have a `/youtube/load-more` endpoint yet. The backend currently returns only the first 15 channels.

**File:** `src/lib/components/results/ChannelTable.svelte:14-37`

---

## 📡 API Endpoints

### Backend Endpoints (Available)

#### 1. Search Channels
```http
POST /youtube/search
Content-Type: application/json

{
  "keyword": "fitness",
  "limit": 50,
  "filters": {
    "minSubscribers": 1000,
    "maxSubscribers": 100000,
    "country": "United States",
    "excludeMusicChannels": true,
    "excludeBrands": true
  }
}
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "channels": [
      {
        "channelId": "UC...",
        "name": "Channel Name",
        "url": "https://www.youtube.com/channel/...",
        "description": "...",
        "subscriberCount": 50000,
        "viewCount": 1000000,
        "videoCount": 200,
        "country": "United States",
        "thumbnailUrl": "https://...",
        "relevanceScore": 85,
        "emails": ["email@example.com"],
        "socialLinks": {
          "instagram": "https://...",
          "twitter": "https://..."
        }
      }
    ],
    "stats": {
      "total": 50,
      "filtered": 30,
      "keyword": "fitness",
      "displayed": 15,
      "remaining": 15
    },
    "pagination": {
      "currentPage": 1,
      "pageSize": 15,
      "totalChannels": 30,
      "hasMore": true
    },
    "enrichmentQueued": true
  }
}
```

#### 2. Enrichment Status
```http
POST /enrichment/status
Content-Type: application/json

{
  "channelIds": ["UC...", "UC..."]
}
```

#### 3. Queue Enrichment
```http
POST /enrichment/queue
Content-Type: application/json

{
  "channelIds": ["UC...", "UC..."],
  "priority": 1
}
```

### Frontend Endpoints (Need Implementation)

#### ⚠️ Load More Channels (Not Implemented Yet)
```http
POST /youtube/load-more
Content-Type: application/json

{
  "keyword": "fitness",
  "page": 2,
  "pageSize": 15
}
```

**Status:** Not implemented in backend
**Action Required:** Backend needs to add this endpoint

---

## 🔍 Type Compatibility

Both frontend and backend use compatible types:

### Channel Search Result
```typescript
{
  channelId: string;
  name: string;
  url: string;
  description?: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  country?: string;
  thumbnailUrl?: string;
  relevanceScore?: number;
  emails?: string[];
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    tiktok?: string;
    discord?: string;
    twitch?: string;
    linkedin?: string;
    website?: string;
  };
}
```

---

## 🚀 Testing Guide

### Manual Testing Steps

1. **Test Search:**
   - Enter keyword: "cooking"
   - Set limit: 10
   - Click "Search Channels"
   - Expected: 10-15 channels appear in table

2. **Test Filters:**
   - Toggle "Advanced Filters"
   - Set Min Subscribers: 1000
   - Set Max Subscribers: 50000
   - Select Country: "United States"
   - Click "Search Channels"
   - Expected: Filtered results appear

3. **Test Channel Details:**
   - Click "Details" on any channel
   - Expected: Modal shows channel info, emails, social links

4. **Test Error Handling:**
   - Stop the backend server
   - Try searching
   - Expected: Error message displays "Network error: Failed to connect to the server"

### API Testing (Using curl)

```bash
# Test search endpoint
curl -X POST http://localhost:8090/youtube/search \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "test",
    "limit": 5
  }'

# Expected: JSON response with status: "success"
```

---

## ⚠️ Known Limitations

1. **Load More Pagination:** The backend returns only 15 channels initially, but the "Load More" endpoint doesn't exist yet
2. **Enrichment Polling:** Works but depends on Supabase database being configured
3. **Background Enrichment:** Requires Supabase for queuing and status tracking

---

## 🐛 Troubleshooting

### Problem: "Network error: Failed to connect to the server"

**Solutions:**
1. Check if backend is running: `http://localhost:8090`
2. Verify `.env` has `PUBLIC_API_URL=http://localhost:8090`
3. Check browser console for CORS errors
4. Restart both frontend and backend

### Problem: "Port 8090 already in use"

**Solutions:**
1. Kill the process using port 8090
2. Or change the port in `src/main.ts` (backend) and `.env` (frontend)

```bash
# Windows: Find and kill process on port 8090
netstat -ano | findstr :8090
taskkill /PID <PID> /F
```

### Problem: Empty results or no channels found

**Solutions:**
1. Check backend logs for errors
2. Try a different keyword (e.g., "gaming", "cooking")
3. Remove filters and try again
4. Check if puppeteer is installed correctly

### Problem: Enrichment not working

**Solutions:**
1. Configure Supabase credentials in `.env`:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_key
   ```
2. Check backend logs for database errors
3. Verify Supabase is accessible

---

## 📝 Environment Variables

### Backend (.env)
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=8090
RATE_LIMIT_PER_MINUTE=20
SCRAPER_HEADLESS=true
```

### Frontend (.env)
```env
PUBLIC_API_URL=http://localhost:8090
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
```

---

## 🎯 Next Steps (Optional Improvements)

1. **Implement Load More Endpoint** in backend
2. **Add Request/Response Logging** for debugging
3. **Add Rate Limiting** to prevent abuse
4. **Add Authentication** if needed
5. **Deploy to Production** (Vercel, Railway, etc.)
6. **Add Unit Tests** for API endpoints
7. **Add E2E Tests** with Playwright

---

## 📞 Support

If you encounter issues:
1. Check this guide
2. Review browser console logs
3. Check backend server logs
4. Review the test page results

---

## ✨ Summary

Your integration is **READY** and **WORKING**!

Just start both servers and you can:
- ✅ Search for YouTube channels
- ✅ Apply filters (subscribers, country, etc.)
- ✅ View channel details
- ✅ See emails and social links
- ✅ Export results to CSV

The only limitation is the "Load More" button which needs a backend endpoint to be fully functional.

**Happy lead generation! 🎉**
