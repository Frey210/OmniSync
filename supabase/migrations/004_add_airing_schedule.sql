-- Add airing schedule columns to media_metadata
ALTER TABLE media_metadata
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS next_airing_episode INT,
  ADD COLUMN IF NOT EXISTS next_airing_at BIGINT;
