-- Add mal_id to media_metadata for cross-referencing MAL anime/manga IDs
ALTER TABLE media_metadata
  ADD COLUMN IF NOT EXISTS mal_id INT;
