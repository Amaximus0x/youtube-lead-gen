# Deployment Guide - Vercel

This guide explains how to deploy the YouTube Lead Gen app to Vercel with Puppeteer support.

## Prerequisites

- Vercel account
- Your Supabase credentials
- (Optional) Proxy server URL

## Deployment Steps

### 1. Install Vercel CLI (if not already installed)

```bash
npm install -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Deploy to Vercel

```bash
vercel
```

Follow the prompts to link your project.

### 4. Configure Environment Variables

Go to your Vercel dashboard → Project Settings → Environment Variables and add:

#### Required Variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

#### Optional Variables:

```
PROXY_URL=http://your-proxy-server:port
RATE_LIMIT_PER_MINUTE=20
SCRAPER_HEADLESS=true
```

### 5. Redeploy

After adding environment variables, trigger a new deployment:

```bash
vercel --prod
```

## How It Works

### Local Development
- Uses `puppeteer` package
- Downloads Chromium automatically
- Works like normal browser automation

### Production (Vercel)
- Uses `@sparticuz/chromium` - a serverless-optimized Chromium build
- Automatically detects serverless environment (`process.env.VERCEL`)
- Uses puppeteer-core with the serverless Chromium binary

## Proxy Configuration

If you have a proxy server, add it to your environment variables:

```bash
PROXY_URL=http://your-proxy-server:port
```

The scraper will automatically use it for all requests.

## Troubleshooting

### Error: Function too large
- This shouldn't happen with @sparticuz/chromium (optimized for serverless)
- If it does, check your node_modules size

### Error: Function timeout
- Default timeout is 60 seconds (configured in vercel.json)
- For Pro plans, you can increase to 300 seconds
- Reduce the number of channels to scrape (lower the limit)

### Error: Memory exceeded
- Default memory is 1024MB (configured in vercel.json)
- For Pro plans, you can increase to 3008MB
- Reduce concurrent operations or batch size

### Scraping fails on Vercel
- Check your proxy configuration
- Verify environment variables are set correctly
- Check Vercel function logs for errors

## Performance Tips

1. **Use Proxy** - Prevents rate limiting and IP blocks
2. **Reduce Batch Size** - Scrape fewer channels at once (10-20 instead of 50)
3. **Add Delays** - Increase random delays between requests
4. **Use Caching** - Cache results in Supabase to avoid re-scraping

## Monitoring

Check your Vercel deployment logs:

```bash
vercel logs [deployment-url]
```

Or view them in the Vercel dashboard.

## Cost Considerations

### Vercel Free Tier
- 100GB bandwidth/month
- 100 hours serverless function execution
- 10 second max function duration (not enough - need Hobby plan)

### Vercel Hobby Plan ($20/month)
- 1000GB bandwidth/month
- 1000 hours serverless function execution
- 60 second max function duration ✅ (good for scraping)

### @sparticuz/chromium Bundle Size
- ~50MB compressed
- Well within Vercel's 250MB limit

## Next Steps

1. Deploy to Vercel
2. Add environment variables
3. Test with a simple search
4. Monitor logs for any errors
5. Adjust configuration as needed

---

**Need Help?** Check the Vercel documentation or open an issue on GitHub.
