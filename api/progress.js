import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

  try {
    // JOIN user_progress with media_metadata
    // In Supabase, as long as FKs are set up, we can do nested selects easily
    const { data: progress, error } = await supabase
      .from('user_progress')
      .select(`
        id,
        media_id,
        latest_chapter_episode,
        media_type,
        source_url,
        updated_at,
        media_metadata (
          canonical_title,
          cover_image_url,
          total_episodes_chapters
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch progress' });
    }

    // Live AniChart / AniList airing schedule batch fetch for anime
    const animeIds = (progress || [])
      .filter(item => item.media_type === 'ANIME' && item.media_id && item.media_id < 80000000)
      .map(item => item.media_id);

    if (animeIds.length > 0) {
      try {
        const alQuery = `
          query ($ids: [Int]) {
            Page(page: 1, perPage: 50) {
              media(id_in: $ids, type: ANIME) {
                id
                status
                nextAiringEpisode {
                  airingAt
                  episode
                }
              }
            }
          }
        `;

        const alRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query: alQuery, variables: { ids: animeIds } })
        });

        const alData = await alRes.json();
        const mediaList = alData?.data?.Page?.media || [];

        if (mediaList.length > 0) {
          const scheduleMap = new Map();
          for (const m of mediaList) {
            scheduleMap.set(m.id, {
              status: m.status,
              next_airing_episode: m.nextAiringEpisode?.episode || null,
              next_airing_at: m.nextAiringEpisode?.airingAt || null
            });
          }

          for (const item of progress) {
            if (scheduleMap.has(item.media_id)) {
              const fresh = scheduleMap.get(item.media_id);
              if (item.media_metadata) {
                item.media_metadata.status = fresh.status;
                item.media_metadata.next_airing_episode = fresh.next_airing_episode;
                item.media_metadata.next_airing_at = fresh.next_airing_at;
              }
            }
          }
        }
      } catch (alErr) {
        console.warn("AniList airing schedule fetch warning:", alErr.message);
      }
    }

    return res.status(200).json({ data: progress });

  } catch (err) {
    console.error("Progress fetch error:", err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
