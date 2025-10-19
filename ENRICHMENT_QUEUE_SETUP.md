# Background Enrichment Queue - Setup Guide

This guide explains how to set up and use the background enrichment queue system for getting detailed channel data (emails, subscriber counts, social links) on Vercel.

---

## 🎯 How It Works

1. **User searches** → Gets basic channel results immediately (~10-15 seconds)
2. **System queues enrichment jobs** in Supabase
3. **Background worker** processes jobs (triggered manually or via cron)
4. **Frontend polls** every 10 seconds for updates
5. **Data appears progressively** as enrichment completes

---

## 📋 Setup Steps

### 1. Run Database Migrations

You need to add the enrichment tables to your Supabase database.

**Option A: Using Supabase Dashboard**
1. Go to your Supabase Dashboard → SQL Editor
2. Create a new query
3. Copy the contents of `supabase/migrations/20250119000000_enrichment_queue.sql`
4. Run the query
5. Repeat for `supabase/migrations/20250119000001_add_enrichment_fields.sql`

**Option B: Using Supabase CLI (if installed)**
```bash
supabase db push
```

### 2. Deploy to Vercel

```bash
git add -A
git commit -m "feat: add background enrichment queue system"
git push
```

Vercel will auto-deploy.

### 3. Trigger Enrichment Processing

After users search and jobs are queued, you need to trigger the enrichment worker.

**Option A: Manual Trigger (for testing)**
```bash
curl -X GET https://your-app.vercel.app/api/youtube/enrich
```

**Option B: Set Up Vercel Cron Job (recommended)**

1. Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
2. Click "Create Cron Job"
3. Configure:
   - **Path**: `/api/youtube/enrich`
   - **Schedule**: `*/5 * * * *` (every 5 minutes)
   - **Method**: GET

This will automatically process enrichment jobs every 5 minutes.

---

## 🧪 Testing the System

### 1. Do a Search

1. Go to your deployed app
2. Search for a keyword (e.g., "tech reviews")
3. You should see results immediately (~10-15 seconds)
4. Results will show basic info (name, URL)

### 2. Check Enrichment Queue

```bash
# Open Supabase Dashboard → Table Editor → enrichment_jobs
# You should see jobs with status='pending'
```

### 3. Trigger Enrichment

```bash
curl -X GET https://your-app.vercel.app/api/youtube/enrich
```

Or wait for the cron job to run (if configured).

### 4. Watch Data Populate

- The frontend polls every 10 seconds
- Watch the browser console for `[Polling]` logs
- Emails and subscriber counts will appear as enrichment completes
- This takes ~2-5 minutes per channel

---

## 📊 How to Monitor

### Check Queue Status

**Supabase Dashboard:**
```sql
-- See pending jobs
SELECT * FROM enrichment_jobs WHERE status = 'pending';

-- See processing/completed jobs
SELECT * FROM enrichment_jobs WHERE status IN ('processing', 'completed');

-- See failed jobs
SELECT * FROM enrichment_jobs WHERE status = 'failed';
```

### Check Enrichment Status

**Browser Console:**
- Look for `[Polling]` logs
- They show enrichment progress

**API Endpoint:**
```bash
curl -X POST https://your-app.vercel.app/api/youtube/enrichment-status \
  -H "Content-Type: application/json" \
  -d '{"channelIds": ["channel-id-1", "channel-id-2"]}'
```

---

## ⚙️ Configuration

### Enrichment Speed

Edit `src/routes/api/youtube/enrich/+server.ts`:

```typescript
// Process more jobs per trigger (faster but more resources)
const processed = await EnrichmentService.processQueue(10); // Default: 5
```

### Polling Frequency

Edit `src/lib/components/search/SearchForm.svelte`:

```typescript
// Poll more frequently (faster updates but more API calls)
}, 5000); // Default: 10000 (10 seconds)
```

### Cron Frequency

In Vercel Dashboard:
- Current: `*/5 * * * *` (every 5 minutes)
- Faster: `*/2 * * * *` (every 2 minutes)
- Slower: `*/10 * * * *` (every 10 minutes)

---

## 🔧 Troubleshooting

### Jobs Stay "pending"

**Problem**: Jobs are queued but never processed.

**Solution**: Trigger the enrichment worker manually or set up cron job.

```bash
curl -X GET https://your-app.vercel.app/api/youtube/enrich
```

### Jobs Fail

**Problem**: Jobs have status='failed' in database.

**Solution**: Check Vercel function logs:
1. Vercel Dashboard → Your Project → Logs
2. Look for `[Enrichment]` logs
3. See error messages

Common causes:
- YouTube blocking/rate limiting → Use proxy
- Timeout → Reduce maxJobs in enrichment endpoint
- Invalid channel URLs → Check database data

### Frontend Doesn't Update

**Problem**: Polling runs but data doesn't appear.

**Solution**:
1. Check browser console for `[Polling]` logs
2. Verify enrichment jobs are completing (check Supabase)
3. Check API response from `/api/youtube/enrichment-status`

### Out of Memory

**Problem**: Enrichment worker crashes with memory error.

**Solution**:
1. Reduce `maxJobs` in enrichment endpoint (default: 5)
2. Increase function memory in `svelte.config.js`:
   ```javascript
   memory: 3008 // Maximum on Vercel Pro
   ```

---

## 🎨 Frontend User Experience

Users will see:

1. **Immediate Results** - Channel names and URLs load fast
2. **Progressive Loading** - Emails and details appear gradually
3. **Visual Indicators** - "Enriching..." status (you can add this)
4. **Real-time Updates** - Data populates without page refresh

### Optional: Add Loading Indicator

In `ChannelTable.svelte`, you can show enrichment status:

```svelte
{#if channel.enrichmentStatus === 'pending'}
  <span class="text-sm text-gray-500">Enriching...</span>
{:else if channel.enrichmentStatus === 'enriched'}
  <span class="text-sm text-green-600">✓ Enriched</span>
{/if}
```

---

## 📈 Performance Metrics

**Expected Timing:**
- Initial search: ~10-15 seconds
- Queue jobs: <1 second
- Enrichment per channel: ~20-30 seconds
- Total for 20 channels: ~10-15 minutes (with 5 parallel workers)

**Cost:**
- Vercel function calls: ~1 per enrichment job
- Supabase queries: ~3 per job (insert, update, select)
- Very low cost for moderate usage

---

## 🚀 Production Recommendations

1. **Set up Vercel Cron** - Automate enrichment processing
2. **Use Proxy** - Add `PROXY_URL` env var to avoid rate limits
3. **Monitor Supabase** - Watch for failed jobs
4. **Increase Memory** - Use 3008MB on Vercel Pro if needed
5. **Add Retry Logic** - Jobs auto-retry 3 times on failure

---

## 📝 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/youtube/search` | POST | Search channels, queue enrichment |
| `/api/youtube/enrich` | GET/POST | Process enrichment queue |
| `/api/youtube/enrichment-status` | POST | Get enrichment status for channels |

---

## ✅ Benefits of This System

✅ **No Timeouts** - Initial search completes fast
✅ **Progressive Loading** - Better UX than waiting for everything
✅ **Scalable** - Can enrich hundreds of channels
✅ **Serverless** - Everything stays on Vercel + Supabase
✅ **Reliable** - Auto-retry on failures
✅ **Cost-effective** - Pay only for what you use

---

## 🎯 Next Steps

After setting this up, you can:

1. **Add Visual Indicators** - Show enrichment progress in UI
2. **Add Pagination** - Enrich high-priority channels first
3. **Add Webhooks** - Notify when enrichment completes
4. **Add Analytics** - Track enrichment success rate
5. **Add Manual Trigger** - Let users request enrichment

---

**Questions?** Check the Vercel function logs or Supabase query logs for debugging.
