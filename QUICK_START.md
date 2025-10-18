# Quick Start Guide

## Get Started in 3 Steps

### Step 1: Set up Supabase (5 minutes)

1. Visit https://supabase.com and create a free account
2. Create a new project
3. Wait for the database to be provisioned (~2 minutes)
4. Go to Project Settings → API
5. Copy your credentials into `.env`:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

6. Run the database migration:
   - Copy the SQL from `supabase/migrations/20250101000000_initial_schema.sql`
   - Go to SQL Editor in Supabase dashboard
   - Paste and run the SQL

### Step 2: Run the Project

```bash
cd youtube-lead-gen
npm run dev
```

Visit: http://localhost:5173

### Step 3: Verify It Works

✓ You should see the home page with two tabs:
  - Generate Leads
  - Extract Emails

✓ Navigation bar at the top
✓ Form to enter keywords
✓ No errors in the console

## What Can I Do Now?

The UI is ready but functionality needs to be implemented:

### Current Features:
- ✅ Beautiful UI with TailwindCSS
- ✅ Navigation between pages
- ✅ Form inputs for search
- ✅ Dashboard layout
- ✅ Database structure ready

### To Be Implemented (Phase 2+):
- ⏳ YouTube channel search
### To Be Implemented (Phase 3+):
- ⏳ Web scraping with Playwright
- ⏳ Email extraction
### To Be Implemented (Phase 4+):
- ⏳ Export to CSV/Sheets

## Development Workflow

1. **Make changes** to files in `src/`
2. **See updates** instantly (hot reload)
3. **Check types** with `npm run check`
4. **Format code** with `npm run format`

## Project Structure (Simplified)

```
src/
├── routes/
│   ├── +page.svelte          # Home page (what you see)
│   └── dashboard/            # Dashboard page
├── lib/
│   ├── server/               # Backend code (API, database)
│   ├── components/           # Reusable UI components (empty)
│   └── types/models.ts       # Data structures
└── app.css                   # Styles
```

## Next: Implement YouTube Search

Create: `src/lib/server/youtube/scraper.ts`

This will handle searching YouTube channels without an API key.

See `youtube-lead-generation-plan.md` for detailed implementation steps.

## Need Help?

- **Setup issues?** → Check `SETUP_COMPLETE.md`
- **Architecture questions?** → Read `README.project.md`
- **Implementation details?** → Review `youtube-lead-generation-plan.md`

## Tips

- Use Supabase local development with Docker (optional): `npm run supabase:start`
- Start with Phase 2 from the implementation plan
- Keep `.env` file secret (never commit it!)
- Supabase free tier includes: 500MB database, 1GB file storage, 50,000 monthly active users

---

**You're all set! Start coding!** 🚀
