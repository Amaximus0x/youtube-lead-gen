# Backend Migration Guide: SvelteKit to Next.js

This guide provides a complete step-by-step process to separate the backend logic from this SvelteKit project into a standalone Next.js API backend.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Before & After](#architecture-before--after)
3. [Next.js Project Setup](#nextjs-project-setup)
4. [Project Structure](#project-structure)
5. [Dependencies](#dependencies)
6. [File Migration Mapping](#file-migration-mapping)
7. [API Endpoints](#api-endpoints)
8. [Environment Variables](#environment-variables)
9. [Database Setup](#database-setup)
10. [Deployment Configuration](#deployment-configuration)
11. [Frontend Changes](#frontend-changes)
12. [Testing Strategy](#testing-strategy)
13. [Step-by-Step Migration](#step-by-step-migration)

---

## Overview

### What's Being Separated

**Backend Components (Moving to Next.js):**
- YouTube scraping logic (Puppeteer-based)
- Innertube API integration
- Email and contact extraction
- Channel filtering and relevance scoring
- Enrichment queue system
- Database layer (Supabase repositories)
- All API endpoints

**Frontend Components (Staying in SvelteKit):**
- UI components (SearchForm, ChannelTable, etc.)
- Pages and routing
- Svelte stores (state management)
- Client-side utilities (CSV export)

**Total Backend Code:** ~3,500 lines across 9 core files + 4 API endpoints

---

## Architecture Before & After

### Before: Monolithic SvelteKit App
```
┌─────────────────────────────────────────┐
│      SvelteKit Application              │
│  ┌─────────────┐    ┌────────────────┐  │
│  │  Frontend   │───▶│   Backend API  │  │
│  │  (Svelte)   │    │  (Server Side) │  │
│  └─────────────┘    └────────────────┘  │
│                            │             │
│                            ▼             │
│                     ┌─────────────┐      │
│                     │  Supabase   │      │
│                     └─────────────┘      │
└─────────────────────────────────────────┘
```

### After: Separated Architecture
```
┌──────────────────┐         ┌─────────────────────┐
│   SvelteKit      │         │   Next.js Backend   │
│   Frontend       │         │   API Server        │
│                  │  HTTP   │                     │
│  - Search UI     │◀───────▶│  - Search API       │
│  - Results Table │  Calls  │  - Scraping Logic   │
│  - State Mgmt    │         │  - Enrichment Queue │
│  - CSV Export    │         │  - DB Repositories  │
└──────────────────┘         └──────────┬──────────┘
                                        │
                                        ▼
                                ┌─────────────┐
                                │  Supabase   │
                                │  Database   │
                                └─────────────┘
```

---

## Next.js Project Setup

### Step 1: Create New Next.js Project

```bash
# Navigate to parent directory (outside current project)
cd ..

# Create new Next.js app with TypeScript and App Router
npx create-next-app@latest youtube-lead-gen-backend --typescript --app --no-tailwind --eslint --no-src-dir --import-alias "@/*"

# Navigate into project
cd youtube-lead-gen-backend
```

Answer the prompts:
- TypeScript: **Yes**
- ESLint: **Yes**
- Tailwind CSS: **No** (backend only)
- App Router: **Yes**
- Import alias: **Yes** (@/*)
- Use src/ directory: **No** (we'll use app/ structure)

---

## Project Structure

### Next.js Backend Directory Structure

```
youtube-lead-gen-backend/
├── app/
│   ├── api/
│   │   └── youtube/
│   │       ├── search/
│   │       │   └── route.ts              # POST /api/youtube/search
│   │       ├── load-more/
│   │       │   └── route.ts              # POST /api/youtube/load-more
│   │       ├── enrich/
│   │       │   └── route.ts              # POST /api/youtube/enrich
│   │       └── enrichment-status/
│   │           └── route.ts              # POST /api/youtube/enrichment-status
│   └── layout.tsx                         # Root layout (minimal)
│
├── lib/
│   ├── youtube/
│   │   ├── scraper-puppeteer.ts          # Main scraper class
│   │   ├── innertube-scraper.ts          # Innertube API integration
│   │   ├── multi-source-extractor.ts     # Email/contact extraction
│   │   ├── contact-extractor.ts          # Regex-based extraction
│   │   ├── channel-details.ts            # Batch channel details
│   │   └── filters.ts                     # Filtering logic
│   │
│   ├── queue/
│   │   └── enrichment-service.ts         # Enrichment queue service
│   │
│   ├── db/
│   │   ├── supabase.ts                   # Supabase client
│   │   └── repositories/
│   │       ├── channels.ts               # Channel repository
│   │       └── sessions.ts               # Session repository
│   │
│   └── types/
│       ├── models.ts                      # Shared types
│       └── database.types.ts             # Supabase generated types
│
├── supabase/
│   ├── config.toml                        # Supabase config
│   └── migrations/                        # All migration files
│       ├── 20250101000000_initial_schema.sql
│       ├── 20250119000000_enrichment_queue.sql
│       ├── 20250119000001_add_enrichment_fields.sql
│       ├── 20250120000000_add_email_sources.sql
│       └── 20250122000000_add_country_field.sql
│
├── .env.local                             # Environment variables
├── .env.example                           # Environment template
├── next.config.mjs                        # Next.js configuration
├── package.json                           # Dependencies
├── tsconfig.json                          # TypeScript config
├── vercel.json                            # Vercel deployment config
└── README.md                              # Project documentation
```

---

## Dependencies

### package.json for Next.js Backend

Create/update `package.json`:

```json
{
  "name": "youtube-lead-gen-backend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:types": "supabase gen types typescript --local > lib/types/database.types.ts",
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "test": "echo \"No tests yet\" && exit 0"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.75.0",
    "@sparticuz/chromium": "^141.0.0",
    "puppeteer": "^24.25.0",
    "puppeteer-core": "^24.25.0",
    "p-queue": "^9.0.0",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.9.2",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.1.0"
  }
}
```

### Key Dependencies Explained

**Production:**
- `@supabase/supabase-js`: Database client
- `@sparticuz/chromium`: Chromium binary for Vercel (optimized, ~50MB)
- `puppeteer` + `puppeteer-core`: Browser automation
- `p-queue`: Promise queue for rate limiting
- `next`, `react`, `react-dom`: Next.js framework (required even for API-only)

**Development:**
- TypeScript types for Node, React
- ESLint with Next.js config

---

## File Migration Mapping

### Complete File-by-File Migration Map

| Current SvelteKit Path | New Next.js Path | Purpose |
|------------------------|------------------|---------|
| `src/lib/server/youtube/scraper-puppeteer.ts` | `lib/youtube/scraper-puppeteer.ts` | Main scraper orchestration |
| `src/lib/server/youtube/innertube-scraper.ts` | `lib/youtube/innertube-scraper.ts` | Innertube API integration |
| `src/lib/server/youtube/multi-source-extractor.ts` | `lib/youtube/multi-source-extractor.ts` | Multi-source extraction |
| `src/lib/server/youtube/contact-extractor.ts` | `lib/youtube/contact-extractor.ts` | Regex extraction |
| `src/lib/server/youtube/channel-details.ts` | `lib/youtube/channel-details.ts` | Batch channel details |
| `src/lib/server/youtube/filters.ts` | `lib/youtube/filters.ts` | Filtering logic |
| `src/lib/server/queue/enrichment-service.ts` | `lib/queue/enrichment-service.ts` | Enrichment queue |
| `src/lib/server/db/supabase.ts` | `lib/db/supabase.ts` | Supabase client |
| `src/lib/server/db/repositories/channels.ts` | `lib/db/repositories/channels.ts` | Channel repository |
| `src/lib/server/db/repositories/sessions.ts` | `lib/db/repositories/sessions.ts` | Session repository |
| `src/lib/types/models.ts` | `lib/types/models.ts` | Type definitions |
| `src/lib/types/database.types.ts` | `lib/types/database.types.ts` | Supabase types |
| `src/routes/api/youtube/search/+server.ts` | `app/api/youtube/search/route.ts` | Search endpoint |
| `src/routes/api/youtube/load-more/+server.ts` | `app/api/youtube/load-more/route.ts` | Pagination endpoint |
| `src/routes/api/youtube/enrich/+server.ts` | `app/api/youtube/enrich/route.ts` | Enrichment endpoint |
| `src/routes/api/youtube/enrichment-status/+server.ts` | `app/api/youtube/enrichment-status/route.ts` | Status endpoint |
| `supabase/` | `supabase/` | Database migrations (copy entire folder) |

### Import Path Changes

**SvelteKit:**
```typescript
import { YouTubeScraper } from '$lib/server/youtube/scraper-puppeteer';
import { supabase } from '$lib/server/db/supabase';
```

**Next.js:**
```typescript
import { YouTubeScraper } from '@/lib/youtube/scraper-puppeteer';
import { supabase } from '@/lib/db/supabase';
```

**Global Replace Needed:**
- Replace `$lib/server/` → `@/lib/`
- Replace `$lib/` → `@/lib/`

---

## API Endpoints

### Endpoint Structure Comparison

#### SvelteKit API Route Structure
```typescript
// src/routes/api/youtube/search/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  // ... logic
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

#### Next.js API Route Structure
```typescript
// app/api/youtube/search/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  // ... logic (same logic)
  return NextResponse.json(data);
}
```

### All API Endpoints

#### 1. Search Endpoint
**Path:** `app/api/youtube/search/route.ts`
**Method:** POST
**Request Body:**
```typescript
{
  keyword: string;
  limit?: number;
  minSubscribers?: number;
  maxSubscribers?: number;
  country?: string;
  excludeMusicChannels?: boolean;
  excludeBrands?: boolean;
  language?: string;
}
```
**Response:**
```typescript
{
  channels: ChannelSearchResult[];
  stats: {
    total: number;
    filtered: number;
    keyword: string;
    displayed: number;
    remaining: number;
  };
  pagination: {
    currentPage: number;
    pageSize: number;
    totalChannels: number;
    hasMore: boolean;
  };
  enrichmentQueueSize: number;
}
```

#### 2. Load More Endpoint
**Path:** `app/api/youtube/load-more/route.ts`
**Method:** POST
**Request Body:**
```typescript
{
  keyword: string;
  page: number;
  pageSize?: number;
}
```
**Response:**
```typescript
{
  channels: ChannelSearchResult[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalChannels: number;
    hasMore: boolean;
  };
}
```

#### 3. Enrich Endpoint (Cron/Manual)
**Path:** `app/api/youtube/enrich/route.ts`
**Methods:** POST, GET
**Request Body (optional):**
```typescript
{
  maxJobs?: number;
}
```
**Response:**
```typescript
{
  processed: number;
  remaining: number;
}
```

#### 4. Enrichment Status Endpoint
**Path:** `app/api/youtube/enrichment-status/route.ts`
**Method:** POST
**Request Body:**
```typescript
{
  channelIds: string[];
}
```
**Response:**
```typescript
{
  statuses: Record<string, {
    status: 'pending' | 'enriching' | 'enriched' | 'failed';
    hasEmails: boolean;
  }>;
}
```

---

## Environment Variables

### .env.local for Next.js Backend

Create `.env.local`:

```bash
# Supabase Configuration
SUPABASE_URL=https://hkuidmtqzghzhspvavva.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Scraping Configuration
RATE_LIMIT_PER_MINUTE=20
SCRAPER_HEADLESS=true
USER_AGENT_ROTATION=true

# Optional: Proxy Configuration
# PROXY_URL=http://your-proxy-server:port

# Node Environment
NODE_ENV=development
```

### .env.example (Template for Team)

Create `.env.example`:

```bash
# Supabase Configuration
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Scraping Configuration
RATE_LIMIT_PER_MINUTE=20
SCRAPER_HEADLESS=true
USER_AGENT_ROTATION=true

# Optional: Proxy Configuration
# PROXY_URL=

# Node Environment
NODE_ENV=development
```

### Vercel Environment Variables

When deploying to Vercel, add these environment variables in the Vercel dashboard:

1. Go to Project Settings → Environment Variables
2. Add all variables from `.env.local`
3. Set for **Production**, **Preview**, and **Development** environments

**Important:** Copy the actual keys from your current `.env` file.

---

## Database Setup

### Copy Supabase Configuration

The database setup remains identical. Simply copy the entire `supabase/` folder:

```bash
# From project root, copy to new Next.js project
cp -r supabase/ ../youtube-lead-gen-backend/supabase/
```

### Supabase Migrations

All existing migrations will work without changes:

```
supabase/migrations/
├── 20250101000000_initial_schema.sql          # Base schema
├── 20250119000000_enrichment_queue.sql        # Enrichment jobs
├── 20250119000001_add_enrichment_fields.sql   # Enrichment fields
├── 20250120000000_add_email_sources.sql       # Email sources
└── 20250122000000_add_country_field.sql       # Country field
```

### Running Migrations

```bash
# Start local Supabase
npm run supabase:start

# Apply migrations (automatic on start)
# Or manually:
supabase db reset

# Generate TypeScript types
npm run db:types
```

### Database Connection

The Supabase client (`lib/db/supabase.ts`) uses the same connection:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database.types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey);
```

---

## Deployment Configuration

### next.config.mjs

Create `next.config.mjs`:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable React Strict Mode for Puppeteer stability
  reactStrictMode: false,

  // Webpack configuration for Puppeteer
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Externalize puppeteer to avoid bundling issues
      config.externals.push('puppeteer');
    }
    return config;
  },

  // API route timeout (Vercel default: 10s, can override in vercel.json)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
```

### vercel.json

Create `vercel.json` for Vercel deployment:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "functions": {
    "app/api/**/*.ts": {
      "maxDuration": 60,
      "memory": 3008
    }
  },
  "crons": [
    {
      "path": "/api/youtube/enrich",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

**Configuration Explained:**
- `maxDuration: 60`: 60-second timeout (Pro plan required)
- `memory: 3008`: Maximum memory for Puppeteer/Chromium
- `crons`: Background enrichment every 10 minutes

### Chromium Binary Configuration

For Vercel deployment, `@sparticuz/chromium` automatically handles Chromium binary:

```typescript
// lib/youtube/scraper-puppeteer.ts
import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';

async initialize() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    // Vercel production: use @sparticuz/chromium
    this.browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  } else {
    // Local development: use system Chromium
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
}
```

---

## Frontend Changes

### Update Frontend to Use Backend API

#### 1. Environment Variables (Frontend)

Update `.env` in SvelteKit frontend:

```bash
# Backend API URL
PUBLIC_API_URL=http://localhost:3000
# Or for production:
# PUBLIC_API_URL=https://your-backend.vercel.app
```

#### 2. API Client Helper

Create `src/lib/api/client.ts`:

```typescript
const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:3000';

export async function apiPost<T>(endpoint: string, body: any): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}
```

#### 3. Update SearchForm Component

Update `src/lib/components/search/SearchForm.svelte`:

```typescript
import { apiPost } from '$lib/api/client';

async function handleSearch() {
  try {
    isSearching = true;

    // Call Next.js backend instead of SvelteKit API
    const result = await apiPost('/api/youtube/search', {
      keyword,
      limit,
      minSubscribers,
      maxSubscribers,
      country,
      excludeMusicChannels,
      excludeBrands,
      language,
    });

    // ... rest of logic
  } catch (error) {
    console.error('Search failed:', error);
  } finally {
    isSearching = false;
  }
}
```

#### 4. Update ChannelTable Component

Update `src/lib/components/results/ChannelTable.svelte`:

```typescript
import { apiPost } from '$lib/api/client';

async function loadMore() {
  try {
    isLoadingMore = true;

    const result = await apiPost('/api/youtube/load-more', {
      keyword: $channelsStore.stats.keyword,
      page: $channelsStore.pagination.currentPage + 1,
      pageSize: $channelsStore.pagination.pageSize,
    });

    // ... rest of logic
  } catch (error) {
    console.error('Load more failed:', error);
  } finally {
    isLoadingMore = false;
  }
}
```

#### 5. Remove Backend Code from Frontend

After migration, delete these files from SvelteKit project:

```bash
# Delete server-side logic
rm -rf src/lib/server/

# Delete API routes
rm -rf src/routes/api/
```

#### 6. Update package.json (Frontend)

Remove backend dependencies from SvelteKit `package.json`:

```json
{
  "dependencies": {
    // REMOVE these:
    // "@sparticuz/chromium": "^141.0.0",
    // "puppeteer": "^24.25.0",
    // "puppeteer-core": "^24.25.0"
  }
}
```

Run:
```bash
npm install
```

---

## Testing Strategy

### 1. Backend Testing

#### Test API Endpoints Locally

```bash
# Start Next.js backend
cd youtube-lead-gen-backend
npm run dev
# Runs on http://localhost:3000
```

#### Test with cURL

```bash
# Test search endpoint
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "react tutorials",
    "limit": 10,
    "minSubscribers": 1000
  }'

# Test load-more endpoint
curl -X POST http://localhost:3000/api/youtube/load-more \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "react tutorials",
    "page": 2,
    "pageSize": 10
  }'

# Test enrichment status
curl -X POST http://localhost:3000/api/youtube/enrichment-status \
  -H "Content-Type: application/json" \
  -d '{
    "channelIds": ["UC123456789"]
  }'
```

### 2. Frontend Testing

```bash
# Start SvelteKit frontend (with backend running)
cd youtube-lead-gen
npm run dev
# Runs on http://localhost:5173
```

Open browser and test:
1. Search functionality
2. Pagination (Load More)
3. Enrichment status polling
4. CSV export

### 3. Integration Testing

Test complete flow:
1. Frontend search → Backend API → Database
2. Enrichment queue processing
3. Status updates
4. Error handling

---

## Step-by-Step Migration

### Phase 1: Setup Next.js Backend (Day 1)

#### Step 1: Create Project
```bash
cd ..
npx create-next-app@latest youtube-lead-gen-backend --typescript --app --no-tailwind --eslint --no-src-dir --import-alias "@/*"
cd youtube-lead-gen-backend
```

#### Step 2: Install Dependencies
```bash
npm install @supabase/supabase-js @sparticuz/chromium puppeteer puppeteer-core p-queue
```

#### Step 3: Setup Project Structure
```bash
# Create directory structure
mkdir -p lib/youtube
mkdir -p lib/queue
mkdir -p lib/db/repositories
mkdir -p lib/types
mkdir -p app/api/youtube/{search,load-more,enrich,enrichment-status}
```

#### Step 4: Copy Environment Variables
```bash
# Copy .env from old project
cp ../youtube-lead-gen/.env .env.local

# Create .env.example
cp .env.local .env.example
# Then edit .env.example to remove sensitive values
```

#### Step 5: Copy Database Configuration
```bash
cp -r ../youtube-lead-gen/supabase ./
```

---

### Phase 2: Migrate Backend Code (Day 1-2)

#### Step 1: Copy Core Library Files

```bash
# From Next.js backend directory
cp ../youtube-lead-gen/src/lib/server/youtube/*.ts lib/youtube/
cp ../youtube-lead-gen/src/lib/server/queue/*.ts lib/queue/
cp ../youtube-lead-gen/src/lib/server/db/supabase.ts lib/db/
cp ../youtube-lead-gen/src/lib/server/db/repositories/*.ts lib/db/repositories/
cp ../youtube-lead-gen/src/lib/types/*.ts lib/types/
```

#### Step 2: Update Import Paths

Run global find-and-replace in all copied files:

```bash
# Replace SvelteKit imports with Next.js imports
# In all .ts files under lib/

# Replace:
# $lib/server/ → @/lib/
# $lib/ → @/lib/
```

You can use VS Code's "Find in Files" (Ctrl+Shift+F):
- Find: `\$lib/server/`
- Replace: `@/lib/`

- Find: `\$lib/`
- Replace: `@/lib/`

#### Step 3: Migrate API Routes

For each API endpoint, convert from SvelteKit to Next.js format:

**Example: Search Endpoint**

Original (`src/routes/api/youtube/search/+server.ts`):
```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  // ... logic
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

New (`app/api/youtube/search/route.ts`):
```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  // ... same logic
  return NextResponse.json(data);
}

// Add CORS headers if needed
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds
```

**Migration Template:**

1. Change import: `NextRequest, NextResponse from 'next/server'`
2. Change function signature: `export async function POST(request: NextRequest)`
3. Replace `new Response()` with `NextResponse.json()`
4. Update import paths (`$lib/server/` → `@/lib/`)
5. Add `export const runtime = 'nodejs'` if using Node.js APIs
6. Add `export const maxDuration = 60` for long-running functions

Repeat for all 4 endpoints:
- `search/route.ts`
- `load-more/route.ts`
- `enrich/route.ts`
- `enrichment-status/route.ts`

#### Step 4: Create Configuration Files

**next.config.mjs:**
```javascript
// (See "Deployment Configuration" section above)
```

**vercel.json:**
```json
// (See "Deployment Configuration" section above)
```

**tsconfig.json** (update paths):
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

### Phase 3: Test Backend (Day 2)

#### Step 1: Start Supabase
```bash
npm run supabase:start
```

#### Step 2: Generate Database Types
```bash
npm run db:types
```

#### Step 3: Start Development Server
```bash
npm run dev
```

#### Step 4: Test Endpoints
```bash
# Test search
curl -X POST http://localhost:3000/api/youtube/search \
  -H "Content-Type: application/json" \
  -d '{"keyword": "test", "limit": 5}'

# Test enrichment status
curl -X POST http://localhost:3000/api/youtube/enrichment-status \
  -H "Content-Type: application/json" \
  -d '{"channelIds": []}'
```

Check for:
- No TypeScript errors
- API returns valid JSON
- Scraper initializes correctly
- Database connection works

---

### Phase 4: Update Frontend (Day 2-3)

#### Step 1: Add Environment Variable
```bash
# In SvelteKit project root (.env)
echo "PUBLIC_API_URL=http://localhost:3000" >> .env
```

#### Step 2: Create API Client
```bash
# Create new file
touch src/lib/api/client.ts
```

Add content from "Frontend Changes" section above.

#### Step 3: Update Components

Update these files:
- `src/lib/components/search/SearchForm.svelte`
- `src/lib/components/results/ChannelTable.svelte`

Replace API calls:
```typescript
// OLD:
const response = await fetch('/api/youtube/search', { ... });

// NEW:
import { apiPost } from '$lib/api/client';
const response = await apiPost('/api/youtube/search', { ... });
```

#### Step 4: Remove Backend Code
```bash
# In SvelteKit project
rm -rf src/lib/server/
rm -rf src/routes/api/
```

#### Step 5: Update Dependencies
```bash
# Remove Puppeteer dependencies from package.json
# Edit package.json manually, then:
npm install
```

---

### Phase 5: Integration Testing (Day 3)

#### Step 1: Run Both Servers

Terminal 1 (Backend):
```bash
cd youtube-lead-gen-backend
npm run dev
```

Terminal 2 (Frontend):
```bash
cd youtube-lead-gen
npm run dev
```

#### Step 2: Test Complete Flow

1. Open http://localhost:5173
2. Perform search
3. Verify results appear
4. Test pagination
5. Check enrichment status updates
6. Test CSV export

#### Step 3: Check Browser Network Tab

- API calls go to `localhost:3000`
- Response status codes are 200
- Data format matches expected types

---

### Phase 6: Deploy Backend (Day 4)

#### Step 1: Push to GitHub
```bash
cd youtube-lead-gen-backend
git init
git add .
git commit -m "Initial backend setup"
git remote add origin <your-repo-url>
git push -u origin main
```

#### Step 2: Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Follow prompts:
# - Link to existing project or create new
# - Set up environment variables
```

Or deploy via Vercel dashboard:
1. Import GitHub repository
2. Configure environment variables
3. Deploy

#### Step 3: Update Frontend Environment
```bash
# In SvelteKit project .env
PUBLIC_API_URL=https://your-backend.vercel.app
```

#### Step 4: Deploy Frontend
```bash
cd youtube-lead-gen
vercel
```

---

### Phase 7: Monitoring & Validation (Day 5)

#### Step 1: Test Production Endpoints
```bash
curl https://your-backend.vercel.app/api/youtube/search \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"keyword": "test", "limit": 5}'
```

#### Step 2: Check Vercel Logs
- Go to Vercel dashboard
- Check function logs for errors
- Monitor execution time and memory usage

#### Step 3: Test Cron Jobs
- Verify `/api/youtube/enrich` runs every 10 minutes
- Check enrichment_jobs table for processed jobs

#### Step 4: Load Testing (Optional)
```bash
# Use Apache Bench or similar
ab -n 100 -c 10 -p search.json -T application/json https://your-backend.vercel.app/api/youtube/search
```

---

## Troubleshooting

### Common Issues

#### 1. Puppeteer Fails on Vercel

**Error:** `Could not find Chrome`

**Solution:**
- Ensure `@sparticuz/chromium` is installed
- Check `executablePath` uses `await chromium.executablePath()`
- Verify `vercel.json` has `memory: 3008`

#### 2. API Timeout

**Error:** `Task timed out after 10.00 seconds`

**Solution:**
- Add `export const maxDuration = 60` in route.ts
- Update `vercel.json` with function timeout config
- Requires Vercel Pro plan for >10s timeout

#### 3. CORS Errors

**Error:** `No 'Access-Control-Allow-Origin' header`

**Solution:**
Add CORS headers to API routes:
```typescript
export async function POST(request: NextRequest) {
  // ... logic

  return NextResponse.json(data, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
```

#### 4. Environment Variables Not Loading

**Error:** `SUPABASE_URL is undefined`

**Solution:**
- Check `.env.local` exists in Next.js project root
- Restart dev server after adding new variables
- For production, verify Vercel dashboard has all variables
- Use `process.env.VARIABLE_NAME` (not `import.meta.env`)

#### 5. Import Path Errors

**Error:** `Cannot find module '$lib/server/youtube/scraper'`

**Solution:**
- Replace all `$lib/` with `@/lib/`
- Check `tsconfig.json` has correct paths mapping
- Restart TypeScript server (VS Code: Cmd+Shift+P → "Restart TS Server")

---

## Performance Optimization

### 1. Reduce Cold Start Time

```typescript
// Lazy-load Puppeteer
let browserInstance: Browser | null = null;

async function getBrowser() {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({...});
  }
  return browserInstance;
}
```

### 2. Connection Pooling

```typescript
// Reuse Supabase client
// Already implemented in lib/db/supabase.ts
```

### 3. Caching

```typescript
// Cache channel results for 5 minutes
import { unstable_cache } from 'next/cache';

export const getCachedChannel = unstable_cache(
  async (channelId: string) => {
    return await channelRepository.getChannel(channelId);
  },
  ['channel'],
  { revalidate: 300 } // 5 minutes
);
```

---

## Security Considerations

### 1. API Rate Limiting

```typescript
// lib/middleware/rate-limit.ts
import { headers } from 'next/headers';

const rateLimitMap = new Map<string, number[]>();

export function rateLimit(ip: string, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];

  // Remove old timestamps
  const validTimestamps = timestamps.filter(t => now - t < windowMs);

  if (validTimestamps.length >= maxRequests) {
    return false;
  }

  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return true;
}

// Usage in route:
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }

  // ... rest of logic
}
```

### 2. Input Validation

```typescript
import { z } from 'zod';

const searchSchema = z.object({
  keyword: z.string().min(1).max(100),
  limit: z.number().min(1).max(100).optional(),
  minSubscribers: z.number().min(0).optional(),
  maxSubscribers: z.number().min(0).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = searchSchema.parse(body);
    // ... use validated data
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid input' },
      { status: 400 }
    );
  }
}
```

### 3. Authentication (Optional)

```typescript
// Add API key authentication if needed
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');

  if (apiKey !== process.env.API_KEY) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // ... rest of logic
}
```

---

## Cost Optimization

### Vercel Pricing Considerations

**Free Tier:**
- 100GB bandwidth/month
- 10s function timeout
- 1024MB memory

**Pro Tier ($20/month):**
- 1TB bandwidth/month
- 60s function timeout (required for scraping)
- 3008MB memory (required for Chromium)

**Recommendation:** Use Pro tier for production with Puppeteer.

### Reduce Costs

1. **Optimize Scraping:**
   - Use Innertube API (no browser for search)
   - Only use Puppeteer for enrichment
   - Batch enrichment jobs

2. **Cache Results:**
   - Cache channel data
   - Reduce redundant scraping

3. **Monitor Usage:**
   - Set up Vercel usage alerts
   - Track function execution time
   - Optimize slow endpoints

---

## Rollback Plan

If migration fails:

### 1. Keep Old SvelteKit App Running

Don't delete backend code until fully tested.

### 2. Use Feature Flag

```typescript
// Frontend
const USE_NEW_BACKEND = import.meta.env.PUBLIC_USE_NEW_BACKEND === 'true';

const API_URL = USE_NEW_BACKEND
  ? import.meta.env.PUBLIC_API_URL
  : ''; // Use SvelteKit routes
```

### 3. Gradual Migration

Migrate endpoints one by one:
1. Start with `/enrichment-status` (low impact)
2. Then `/load-more`
3. Then `/search`
4. Finally `/enrich`

---

## Maintenance & Monitoring

### 1. Set Up Logging

```typescript
// lib/utils/logger.ts
export function log(level: 'info' | 'error', message: string, meta?: any) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
  }));
}

// Usage:
import { log } from '@/lib/utils/logger';
log('info', 'Search started', { keyword: 'test' });
```

### 2. Error Tracking

Consider integrating:
- Sentry (error tracking)
- LogRocket (session replay)
- Vercel Analytics (performance)

### 3. Health Check Endpoint

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/db/supabase';

export async function GET() {
  try {
    // Check database
    const { error } = await supabase.from('channels').select('id').limit(1);

    if (error) throw error;

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: String(error) },
      { status: 500 }
    );
  }
}
```

---

## Conclusion

This migration guide provides a complete roadmap for separating your backend from the SvelteKit frontend into a standalone Next.js API server.

**Key Benefits:**
- ✅ **Separation of Concerns:** Frontend and backend can be developed, deployed, and scaled independently
- ✅ **Better Performance:** Next.js optimized for API routes
- ✅ **Easier Scaling:** Backend can scale separately based on load
- ✅ **Technology Flexibility:** Frontend could be swapped (React, Vue, etc.) without touching backend

**Timeline:** ~5 days for complete migration and testing

**Next Steps:**
1. Follow Phase 1-7 sequentially
2. Test thoroughly at each phase
3. Deploy backend first, then update frontend
4. Monitor production for 1 week before removing old code

Good luck with your migration! 🚀
