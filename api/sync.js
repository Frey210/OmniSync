import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Helper to find media on AniList
async function findAndCacheMedia(title, type) {
  const mediaType = type.toUpperCase();
  const query = `
    query ($search: String, $type: MediaType) {
      Media(search: $search, type: $type) {
        id
        title { romaji english native }
        coverImage { large }
        episodes
        chapters
      }
    }
  `;

  const url = 'https://graphql.anilist.co';
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables: { search: title, type: mediaType } })
  });

  const data = await response.json();
  const media = data?.data?.Media;
  if (!media) return null;

  const normalized = {
    media_id: media.id,
    canonical_title: media.title.english || media.title.romaji || media.title.native,
    cover_image_url: media.coverImage?.large,
    media_type: mediaType,
    total_episodes_chapters: mediaType === 'ANIME' ? media.episodes : media.chapters
  };

  if (supabase) {
    await supabase.from('media_metadata').upsert(normalized, { onConflict: 'media_id' });
  }
  
  return normalized.media_id;
}

function generatePseudoId(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    const char = title.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Make it a positive integer safely out of AniList range (e.g. 2,000,000,000 + abs(hash))
  return 2000000000 + Math.abs(hash);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!supabase) {
      return res.status(500).json({ error: 'Database not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { raw_title, episode, chapter, type, source_url } = req.body;
  const progressValue = episode || chapter;

  if (!raw_title || !progressValue || !type) {
    return res.status(400).json({ error: 'Missing required sync data' });
  }

  try {
    let media_id = await findAndCacheMedia(raw_title, type);
    
    // FALLBACK: If AniList 404s, generate pseudo ID and cache it anyway
    if (!media_id) {
       media_id = generatePseudoId(raw_title);
       const { error: metaErr } = await supabase.from('media_metadata').upsert({
          media_id,
          canonical_title: (raw_title.charAt(0).toUpperCase() + raw_title.slice(1)),
          cover_image_url: 'https://via.placeholder.com/150x200.png?text=No+Cover',
          media_type: type.toUpperCase(),
          total_episodes_chapters: null
       }, { onConflict: 'media_id' });
       if (metaErr) console.error("Media metadata upsert error:", metaErr);
    }
    
    // Check existing progress
    const { data: existing, error: selectErr } = await supabase
      .from('user_progress')
      .select('latest_chapter_episode, id')
      .eq('user_id', user.id)
      .eq('media_id', media_id)
      .maybeSingle(); // use maybeSingle to avoid error when no row found

    if (selectErr) {
      console.error("Select error:", selectErr);
    }

    if (existing && existing.latest_chapter_episode >= progressValue) {
        return res.status(200).json({ 
            success: true, 
            message: 'Progress already up to date',
            media_id,
            latest_chapter_episode: existing.latest_chapter_episode
        });
    }

    let dbError;
    if (existing) {
      // UPDATE existing row
      const { error } = await supabase
        .from('user_progress')
        .update({
          latest_chapter_episode: progressValue,
          source_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      dbError = error;
    } else {
      // INSERT new row
      const { error } = await supabase
        .from('user_progress')
        .insert({
          user_id: user.id,
          media_id,
          media_type: type.toUpperCase(),
          latest_chapter_episode: progressValue,
          source_url,
          updated_at: new Date().toISOString()
        });
      dbError = error;
    }

    if (dbError) {
      console.error("DB write error:", dbError);
      return res.status(500).json({ error: 'Failed to update progress', detail: dbError.message });
    }

    return res.status(200).json({
       success: true,
       media_id,
       latest_chapter_episode: progressValue
    });

  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ error: 'Internal Server Error', detail: err.message });
  }
}
