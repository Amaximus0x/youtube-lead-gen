// Database models for Supabase (PostgreSQL)
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Database types matching the schema
export interface Database {
  public: {
    Tables: {
      channels: {
        Row: Channel;
        Insert: ChannelInsert;
        Update: ChannelUpdate;
      };
      social_links: {
        Row: SocialLink;
        Insert: SocialLinkInsert;
        Update: SocialLinkUpdate;
      };
      search_sessions: {
        Row: SearchSession;
        Insert: SearchSessionInsert;
        Update: SearchSessionUpdate;
      };
      extraction_jobs: {
        Row: ExtractionJob;
        Insert: ExtractionJobInsert;
        Update: ExtractionJobUpdate;
      };
      extraction_attempts: {
        Row: ExtractionAttempt;
        Insert: ExtractionAttemptInsert;
        Update: ExtractionAttemptUpdate;
      };
      exports: {
        Row: ExportRecord;
        Insert: ExportRecordInsert;
        Update: ExportRecordUpdate;
      };
    };
  };
}

// Channel table
export interface Channel {
  id: string;
  channel_id: string;
  name: string;
  url: string;
  description?: string | null;
  subscriber_count?: number | null;
  view_count?: number | null;
  video_count?: number | null;
  email?: string | null;
  email_verified: boolean;
  email_source?: 'youtube' | 'instagram' | 'twitter' | 'website' | null;
  search_keyword: string;
  relevance_score?: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
  last_scraped_at?: string | null;
}

export interface ChannelInsert {
  id?: string;
  channel_id: string;
  name: string;
  url: string;
  description?: string | null;
  subscriber_count?: number | null;
  view_count?: number | null;
  video_count?: number | null;
  email?: string | null;
  email_verified?: boolean;
  email_source?: 'youtube' | 'instagram' | 'twitter' | 'website' | null;
  search_keyword: string;
  relevance_score?: number | null;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  last_scraped_at?: string | null;
}

export interface ChannelUpdate {
  channel_id?: string;
  name?: string;
  url?: string;
  description?: string | null;
  subscriber_count?: number | null;
  view_count?: number | null;
  video_count?: number | null;
  email?: string | null;
  email_verified?: boolean;
  email_source?: 'youtube' | 'instagram' | 'twitter' | 'website' | null;
  search_keyword?: string;
  relevance_score?: number | null;
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  last_scraped_at?: string | null;
}

// Social link table
export interface SocialLink {
  id: string;
  channel_id: string;
  platform: 'instagram' | 'twitter' | 'tiktok' | 'linkedin' | 'website';
  url: string;
  extracted_email?: string | null;
  created_at: string;
}

export interface SocialLinkInsert {
  id?: string;
  channel_id: string;
  platform: 'instagram' | 'twitter' | 'tiktok' | 'linkedin' | 'website';
  url: string;
  extracted_email?: string | null;
}

export interface SocialLinkUpdate {
  platform?: 'instagram' | 'twitter' | 'tiktok' | 'linkedin' | 'website';
  url?: string;
  extracted_email?: string | null;
}

// Search session table
export interface SearchSession {
  id: string;
  keyword: string;
  min_subscribers?: number | null;
  max_subscribers?: number | null;
  exclude_music_channels: boolean;
  exclude_brands: boolean;
  language?: string | null;
  upload_frequency?: 'daily' | 'weekly' | 'monthly' | null;
  engagement_threshold?: number | null;
  total_found: number;
  processed: number;
  with_email: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  user_id?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface SearchSessionInsert {
  id?: string;
  keyword: string;
  min_subscribers?: number | null;
  max_subscribers?: number | null;
  exclude_music_channels?: boolean;
  exclude_brands?: boolean;
  language?: string | null;
  upload_frequency?: 'daily' | 'weekly' | 'monthly' | null;
  engagement_threshold?: number | null;
  total_found?: number;
  processed?: number;
  with_email?: number;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  user_id?: string | null;
  completed_at?: string | null;
}

export interface SearchSessionUpdate {
  keyword?: string;
  min_subscribers?: number | null;
  max_subscribers?: number | null;
  exclude_music_channels?: boolean;
  exclude_brands?: boolean;
  language?: string | null;
  upload_frequency?: 'daily' | 'weekly' | 'monthly' | null;
  engagement_threshold?: number | null;
  total_found?: number;
  processed?: number;
  with_email?: number;
  status?: 'pending' | 'running' | 'completed' | 'failed';
  user_id?: string | null;
  completed_at?: string | null;
}

// Extraction job table
export interface ExtractionJob {
  id: string;
  channel_id: string;
  type: string;
  final_status?: 'success' | 'failed' | 'pending' | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ExtractionJobInsert {
  id?: string;
  channel_id: string;
  type?: string;
  final_status?: 'success' | 'failed' | 'pending' | null;
  completed_at?: string | null;
}

export interface ExtractionJobUpdate {
  final_status?: 'success' | 'failed' | 'pending' | null;
  completed_at?: string | null;
}

// Extraction attempt table
export interface ExtractionAttempt {
  id: string;
  job_id: string;
  attempt_number: number;
  method: 'youtube_scraping' | 'social_fallback';
  status: 'success' | 'failed';
  error?: string | null;
  result_email?: string | null;
  created_at: string;
}

export interface ExtractionAttemptInsert {
  id?: string;
  job_id: string;
  attempt_number: number;
  method: 'youtube_scraping' | 'social_fallback';
  status: 'success' | 'failed';
  error?: string | null;
  result_email?: string | null;
}

export interface ExtractionAttemptUpdate {
  attempt_number?: number;
  method?: 'youtube_scraping' | 'social_fallback';
  status?: 'success' | 'failed';
  error?: string | null;
  result_email?: string | null;
}

// Export record table
export interface ExportRecord {
  id: string;
  session_id: string;
  format: 'csv' | 'sheets';
  channel_count: number;
  file_url?: string | null;
  sheets_id?: string | null;
  created_by: string;
  created_at: string;
}

export interface ExportRecordInsert {
  id?: string;
  session_id: string;
  format: 'csv' | 'sheets';
  channel_count: number;
  file_url?: string | null;
  sheets_id?: string | null;
  created_by: string;
}

export interface ExportRecordUpdate {
  format?: 'csv' | 'sheets';
  channel_count?: number;
  file_url?: string | null;
  sheets_id?: string | null;
}

// Helper types for backwards compatibility
export interface FilterConfig {
  minSubscribers?: number;
  maxSubscribers?: number;
  excludeMusicChannels: boolean;
  excludeBrands: boolean;
  language?: string;
  uploadFrequency?: 'daily' | 'weekly' | 'monthly';
  engagementThreshold?: number;
}
