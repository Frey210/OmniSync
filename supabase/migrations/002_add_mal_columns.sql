-- Add MyAnimeList columns to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS mal_token TEXT,
  ADD COLUMN IF NOT EXISTS mal_refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS mal_username TEXT;
