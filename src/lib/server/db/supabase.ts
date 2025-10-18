import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/types/models';

// Type for the Supabase client
export type TypedSupabaseClient = SupabaseClient<Database>;

// Initialize Supabase client
function initializeSupabase(): TypedSupabaseClient | null {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.warn('Supabase credentials not configured. Database features will not work.');
      console.warn('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
      return null;
    }

    const client = createClient<Database>(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    console.log('Supabase client initialized successfully');
    return client;
  } catch (error) {
    console.error('Failed to initialize Supabase client:', error);
    console.warn('Database features will not be available.');
    return null;
  }
}

// Export Supabase client instance
export const supabase = initializeSupabase();

// Helper to check if Supabase is available
export function isSupabaseAvailable(): boolean {
  return supabase !== null;
}

// Type-safe table references
export const tables = {
  channels: 'channels',
  socialLinks: 'social_links',
  searchSessions: 'search_sessions',
  extractionJobs: 'extraction_jobs',
  extractionAttempts: 'extraction_attempts',
  exports: 'exports',
} as const;
