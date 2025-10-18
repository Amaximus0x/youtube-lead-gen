# YouTube Lead Generation App

Automated lead generation tool that discovers YouTube channels based on keywords/niches and extracts contact information for outreach purposes.

## Tech Stack

- **Frontend:** SvelteKit 2 with TypeScript
- **Styling:** TailwindCSS 4
- **Database:** Supabase PostgreSQL (Relational)
- **Storage:** Supabase Storage
- **Scraping:** Playwright
- **Queue:** p-queue

## Project Structure

```
src/
├── routes/                 # SvelteKit routes
│   ├── +layout.svelte     # Main layout with navigation
│   ├── +page.svelte       # Home page (Generate/Extract tabs)
│   ├── dashboard/         # Dashboard page
│   └── api/               # API endpoints (to be implemented)
├── lib/
│   ├── server/            # Server-side code
│   │   ├── db/           # Supabase & repositories
│   │   ├── youtube/      # YouTube scraping (to be implemented)
│   │   ├── extractors/   # Email extraction (to be implemented)
│   │   ├── queue/        # Job processing (to be implemented)
│   │   └── utils/        # Utilities (to be implemented)
│   ├── components/        # Svelte components (to be implemented)
│   ├── stores/           # Svelte stores (to be implemented)
│   └── types/            # TypeScript types
└── app.css               # Global styles with TailwindCSS

```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

You'll need:
- Supabase project URL
- Supabase anonymous key
- Supabase service role key

### 3. Set Up Supabase

1. Create a Supabase project at https://supabase.com
2. Wait for the database to be provisioned (~2 minutes)
3. Go to Project Settings → API
4. Copy your credentials to `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Run the database migration:
   - Copy the SQL from `supabase/migrations/20250101000000_initial_schema.sql`
   - Go to SQL Editor in Supabase dashboard
   - Paste and run the SQL

### 4. Run Development Server

```bash
npm run dev
```

Visit http://localhost:5173

### 5. (Optional) Run Supabase Locally

For local development without using production Supabase:

```bash
npm install -g supabase
npm run supabase:start
```

This will start Supabase locally with Docker, providing a local PostgreSQL database and all Supabase services.

## Development Phases

This is the **Phase 1** starter project with:
- ✅ Project setup and configuration
- ✅ TailwindCSS styling
- ✅ Basic UI structure
- ✅ Supabase configuration
- ✅ PostgreSQL database schema
- ✅ TypeScript types and models
- ✅ Repository pattern for database

### Next Steps (To be implemented):

**Phase 2:** YouTube Integration
- Implement web scraping with Playwright
- Create YouTube search functionality
- Build channel filtering system

**Phase 3:** Email Extraction
- Extract emails from YouTube About pages
- Handle CAPTCHAs
- Implement social media fallback

**Phase 4:** Export & Jobs
- CSV export functionality
- Google Sheets integration
- Background job processing

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Type-check the project
npm run lint         # Run ESLint
npm run format       # Format with Prettier
```

## Supabase Database Tables

The app uses the following PostgreSQL tables:

- `channels` - YouTube channel data with contact info
- `social_links` - Social media links associated with channels
- `search_sessions` - Search history and results
- `extraction_jobs` - Email extraction job tracking
- `extraction_attempts` - Individual extraction attempts
- `exports` - Export history and file references

See `src/lib/types/models.ts` for detailed TypeScript types.
See `supabase/migrations/20250101000000_initial_schema.sql` for the complete schema.

## Security Notes

- Row Level Security (RLS) policies are configured in the migration file
- Never commit `.env` files to git
- Use Supabase local development with Docker for safe testing
- Service role key should only be used server-side

## Learn More

- [SvelteKit Documentation](https://kit.svelte.dev)
- [TailwindCSS Documentation](https://tailwindcss.com)
- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Playwright Documentation](https://playwright.dev)

## Implementation Plan

For detailed implementation steps, see `youtube-lead-generation-plan.md`

## License

Private project - All rights reserved
