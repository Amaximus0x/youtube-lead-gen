-- Add emails and social_links columns to channels table
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS emails TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN channels.emails IS 'Array of extracted email addresses';
COMMENT ON COLUMN channels.social_links IS 'JSON object containing social media links (instagram, twitter, facebook, etc.)';
