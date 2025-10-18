-- YouTube Lead Generation Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Channels table
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    subscriber_count BIGINT,
    view_count BIGINT,
    video_count INTEGER,
    email TEXT,
    email_verified BOOLEAN DEFAULT FALSE,
    email_source TEXT CHECK (email_source IN ('youtube', 'instagram', 'twitter', 'website')),
    search_keyword TEXT NOT NULL,
    relevance_score NUMERIC(5,2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_scraped_at TIMESTAMPTZ
);

-- Social links table (normalized from channels)
CREATE TABLE social_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'twitter', 'tiktok', 'linkedin', 'website')),
    url TEXT NOT NULL,
    extracted_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(channel_id, platform, url)
);

-- Search sessions table
CREATE TABLE search_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    keyword TEXT NOT NULL,
    min_subscribers INTEGER,
    max_subscribers INTEGER,
    exclude_music_channels BOOLEAN DEFAULT FALSE,
    exclude_brands BOOLEAN DEFAULT FALSE,
    language TEXT,
    upload_frequency TEXT CHECK (upload_frequency IN ('daily', 'weekly', 'monthly')),
    engagement_threshold NUMERIC(5,2),
    total_found INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    with_email INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    user_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Extraction jobs table
CREATE TABLE extraction_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'email_extraction',
    final_status TEXT CHECK (final_status IN ('success', 'failed', 'pending')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Extraction attempts table (normalized from extraction jobs)
CREATE TABLE extraction_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES extraction_jobs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('youtube_scraping', 'social_fallback')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
    error TEXT,
    result_email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Exports table
CREATE TABLE exports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES search_sessions(id) ON DELETE CASCADE,
    format TEXT NOT NULL CHECK (format IN ('csv', 'sheets')),
    channel_count INTEGER NOT NULL,
    file_url TEXT,
    sheets_id TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_channels_channel_id ON channels(channel_id);
CREATE INDEX idx_channels_search_keyword ON channels(search_keyword);
CREATE INDEX idx_channels_status ON channels(status);
CREATE INDEX idx_channels_created_at ON channels(created_at DESC);
CREATE INDEX idx_channels_subscriber_count ON channels(subscriber_count DESC);
CREATE INDEX idx_channels_email ON channels(email) WHERE email IS NOT NULL;

CREATE INDEX idx_social_links_channel_id ON social_links(channel_id);
CREATE INDEX idx_social_links_platform ON social_links(platform);

CREATE INDEX idx_search_sessions_user_id ON search_sessions(user_id);
CREATE INDEX idx_search_sessions_created_at ON search_sessions(created_at DESC);
CREATE INDEX idx_search_sessions_status ON search_sessions(status);

CREATE INDEX idx_extraction_jobs_channel_id ON extraction_jobs(channel_id);
CREATE INDEX idx_extraction_jobs_status ON extraction_jobs(final_status);

CREATE INDEX idx_extraction_attempts_job_id ON extraction_attempts(job_id);

CREATE INDEX idx_exports_session_id ON exports(session_id);
CREATE INDEX idx_exports_created_by ON exports(created_by);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_channels_updated_at BEFORE UPDATE ON channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extraction_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exports ENABLE ROW LEVEL SECURITY;

-- Channels: Public read access, service role can write
CREATE POLICY "Channels are viewable by everyone" ON channels
    FOR SELECT USING (true);

CREATE POLICY "Service role can insert channels" ON channels
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role can update channels" ON channels
    FOR UPDATE USING (true);

-- Social links: Public read access, service role can write
CREATE POLICY "Social links are viewable by everyone" ON social_links
    FOR SELECT USING (true);

CREATE POLICY "Service role can manage social links" ON social_links
    FOR ALL USING (true);

-- Search sessions: Users can see their own sessions
CREATE POLICY "Users can view their own sessions" ON search_sessions
    FOR SELECT USING (user_id = auth.uid()::text OR user_id IS NULL);

CREATE POLICY "Users can create sessions" ON search_sessions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own sessions" ON search_sessions
    FOR UPDATE USING (user_id = auth.uid()::text OR user_id IS NULL);

-- Extraction jobs and attempts: Service role only
CREATE POLICY "Service role can manage extraction jobs" ON extraction_jobs
    FOR ALL USING (true);

CREATE POLICY "Service role can manage extraction attempts" ON extraction_attempts
    FOR ALL USING (true);

-- Exports: Users can see their own exports
CREATE POLICY "Users can view their own exports" ON exports
    FOR SELECT USING (created_by = auth.uid()::text);

CREATE POLICY "Users can create exports" ON exports
    FOR INSERT WITH CHECK (created_by = auth.uid()::text);

-- Comments for documentation
COMMENT ON TABLE channels IS 'Stores YouTube channel information and contact details';
COMMENT ON TABLE social_links IS 'Social media links associated with channels';
COMMENT ON TABLE search_sessions IS 'Tracks user search sessions and results';
COMMENT ON TABLE extraction_jobs IS 'Tracks email extraction jobs for channels';
COMMENT ON TABLE extraction_attempts IS 'Individual extraction attempts with methods and results';
COMMENT ON TABLE exports IS 'Export history for data downloads';
