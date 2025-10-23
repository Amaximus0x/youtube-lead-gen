-- Add country field to channels table
ALTER TABLE channels
ADD COLUMN country TEXT;

-- Add index for country field for filtering/searching
CREATE INDEX idx_channels_country ON channels(country) WHERE country IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN channels.country IS 'Country or location of the YouTube channel from the about page';
