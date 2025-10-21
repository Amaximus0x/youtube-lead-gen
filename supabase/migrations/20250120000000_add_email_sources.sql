-- Add email_sources column to track where each email was found
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS email_sources JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN channels.email_sources IS 'JSON object mapping emails to their sources (youtube_about, youtube_videos, instagram, linkedin, website)';
