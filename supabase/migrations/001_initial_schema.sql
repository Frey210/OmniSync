-- Create media_metadata table
CREATE TABLE media_metadata (
    media_id INT PRIMARY KEY,
    canonical_title TEXT NOT NULL,
    cover_image_url TEXT,
    media_type TEXT CHECK (media_type IN ('ANIME', 'MANGA')),
    total_episodes_chapters INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Create user_progress table
CREATE TABLE user_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    media_id INT NOT NULL REFERENCES media_metadata(media_id),
    latest_chapter_episode INT NOT NULL DEFAULT 0,
    media_type TEXT CHECK (media_type IN ('ANIME', 'MANGA')),
    source_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (user_id, media_id)
);

-- Row Level Security for user_progress
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own progress" 
ON user_progress FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own progress" 
ON user_progress FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own progress" 
ON user_progress FOR UPDATE 
USING (auth.uid() = user_id);

-- Indexes for performace
CREATE INDEX idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX idx_user_progress_updated_at ON user_progress(updated_at DESC);
