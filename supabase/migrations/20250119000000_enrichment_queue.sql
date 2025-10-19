-- Create enrichment_jobs table for background processing
CREATE TABLE IF NOT EXISTS enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id TEXT NOT NULL REFERENCES channels(channel_id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient job queries
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON enrichment_jobs(status);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_channel_id ON enrichment_jobs(channel_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_priority ON enrichment_jobs(priority DESC, created_at ASC);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_enrichment_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enrichment_jobs_updated_at
  BEFORE UPDATE ON enrichment_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_enrichment_jobs_updated_at();

-- Add enrichment status fields to channels table
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'enriching', 'enriched', 'failed')),
  ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMP WITH TIME ZONE;

-- Create index for enrichment status
CREATE INDEX IF NOT EXISTS idx_channels_enrichment_status ON channels(enrichment_status);

COMMENT ON TABLE enrichment_jobs IS 'Queue for background channel enrichment jobs';
COMMENT ON COLUMN channels.enrichment_status IS 'Status of data enrichment for this channel';
COMMENT ON COLUMN channels.enriched_at IS 'Timestamp when channel was successfully enriched';
