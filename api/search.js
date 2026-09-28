import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Keep client outside handler to allow warm starts
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { q, type } = req.query;

  if (!q || !type) {
    return res.status(400).json({ error: 'Missing req query `q` or `type`' });
  }

  const mediaType = type.toUpperCase();
  if (mediaType !== 'ANIME' && mediaType !== 'MANGA') {
    return res.status(400).json({ error: 'Invalid type. Use ANIME or MANGA' });
  }

  try {
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

    const variables = {
      search: q,
      type: mediaType
    };

    const url = 'https://graphql.anilist.co';
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ query, variables })
    };

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        return res.status(response.status).json({ error: data });
    }

    const media = data?.data?.Media;
    
    if (!media) {
      return res.status(404).json({ error: 'Not Found on AniList' });
    }
    
    // Normalize data
    const normalized = {
      media_id: media.id,
      canonical_title: media.title.english || media.title.romaji || media.title.native,
      cover_image_url: media.coverImage?.large,
      media_type: mediaType,
      total_episodes_chapters: mediaType === 'ANIME' ? media.episodes : media.chapters
    };

    // Cache to DB asynchronously if supabase is configured
    if (supabase) {
      // Upsert so if it exists we don't error
      const { error } = await supabase
        .from('media_metadata')
        .upsert(normalized, { onConflict: 'media_id' });
        
      if (error) {
        console.error("Supabase upsert error config:", error);
      }
    }

    return res.status(200).json(normalized);

  } catch (err) {
    console.error("Error in AniList search api:", err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
