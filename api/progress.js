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
          total_episodes_chapters,
          mal_id
        )
      `)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to fetch progress' });
    }

    // Auto-resolve missing or placeholder covers for existing library items
    const missingCoverItems = (progress || []).filter(item => {
      const cover = item.media_metadata?.cover_image_url;
      return !cover || cover.includes('placeholder');
    });

    if (missingCoverItems.length > 0) {
      await Promise.all(missingCoverItems.map(async (item) => {
        const rawTitle = item.media_metadata?.canonical_title;
        if (!rawTitle) return;

        try {
          const clean = rawTitle
            .replace(/^#+/, '')
            .replace(/\b(sub\s*indo|subtitle\s*indonesia|season\s*\d+|s\d+|batch|tamat|lengkap)\b/gi, '')
            .trim();
          const variations = [clean];
          
          // Phonetic typo corrections for Indonesian/Japanese transliterations
          const withShi = clean.replace(/\b([a-z]+)si\b/gi, '$1shi').replace(/([b-df-hj-np-tv-z])si([aeiou])/gi, '$1shi$2');
          if (withShi !== clean && !variations.includes(withShi)) variations.push(withShi);
          const withSh = clean.replace(/sy/gi, 'sh');
          if (withSh !== clean && !variations.includes(withSh)) variations.push(withSh);
          const withChi = clean.replace(/\bti([aeiou])/gi, 'chi$1');
          if (withChi !== clean && !variations.includes(withChi)) variations.push(withChi);
          const splitDai = clean.replace(/\bdai([a-z]+)/gi, 'dai $1');
          if (splitDai !== clean && !variations.includes(splitDai)) variations.push(splitDai);
          const words = clean.split(/\s+/).filter(w => w.length > 2);
          if (words.length > 2) {
            const head = words.slice(0, 3).join(' ');
            if (!variations.includes(head)) variations.push(head);
          }

          // 1. Try AniList across variations
          let resolved = null;
          for (const v of variations) {
            try {
              const alRes = await fetch('https://graphql.anilist.co', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query: `query ($s: String, $t: MediaType) {
                    Page(page: 1, perPage: 1) {
                      media(search: $s, type: $t, sort: SEARCH_MATCH) {
                        id
                        idMal
                        title { romaji english native }
                        coverImage { large }
                        status
                        episodes
                        chapters
                        nextAiringEpisode { airingAt episode }
                      }
                    }
                  }`,
                  variables: { s: v, t: (item.media_type || 'anime').toUpperCase() }
                }),
                signal: AbortSignal.timeout(3500)
              });
              const alData = await alRes.json();
              const m = alData?.data?.Page?.media?.[0];
              if (m?.coverImage?.large) {
                resolved = {
                  media_id: m.id,
                  mal_id: m.idMal || null,
                  canonical_title: m.title.english || m.title.romaji || rawTitle,
                  cover_image_url: m.coverImage.large,
                  status: m.status,
                  next_airing_episode: m.nextAiringEpisode?.episode || null,
                  next_airing_at: m.nextAiringEpisode?.airingAt || null
                };
                break;
              }
            } catch (e) {
              // continue
            }
          }

          // 2. Fallback to Kitsu API
          if (!resolved) {
            for (const v of variations.slice(0, 2)) {
              try {
                const kType = (item.media_type || 'anime').toLowerCase();
                const kRes = await fetch(`https://kitsu.io/api/edge/${kType}?filter[text]=${encodeURIComponent(v)}&page[limit]=1`, {
                  headers: { 'Accept': 'application/vnd.api+json' },
                  signal: AbortSignal.timeout(3500)
                });
                if (kRes.ok) {
                  const kData = await kRes.json();
                  const kItem = kData?.data?.[0];
                  if (kItem?.attributes?.posterImage) {
                    const attrs = kItem.attributes;
                    resolved = {
                      canonical_title: attrs.canonicalTitle || attrs.titles?.en || rawTitle,
                      cover_image_url: attrs.posterImage.large || attrs.posterImage.medium || attrs.posterImage.small,
                      status: attrs.status === 'current' ? 'RELEASING' : (attrs.status === 'finished' ? 'FINISHED' : null)
                    };
                    break;
                  }
                }
              } catch (e) {}
            }
          }

          // 3. Fallback to Jikan (MAL API) if still no match
          if (!resolved) {
            try {
              const jType = (item.media_type || 'anime').toLowerCase();
              const jRes = await fetch(`https://api.jikan.moe/v4/${jType}?q=${encodeURIComponent(clean)}&limit=1`, {
                signal: AbortSignal.timeout(3000)
              });
              const jData = await jRes.json();
              const jm = jData?.data?.[0];
              if (jm?.images?.jpg?.large_image_url || jm?.images?.jpg?.image_url) {
                resolved = {
                  mal_id: jm.mal_id,
                  canonical_title: jm.title_english || jm.title || rawTitle,
                  cover_image_url: jm.images?.jpg?.large_image_url || jm.images?.jpg?.image_url
                };
              }
            } catch (e) {
              // continue
            }
          }

          if (resolved) {
            if (item.media_metadata) {
              item.media_metadata.canonical_title = resolved.canonical_title;
              item.media_metadata.cover_image_url = resolved.cover_image_url;
              if (resolved.mal_id) item.media_metadata.mal_id = resolved.mal_id;
              if (resolved.status) item.media_metadata.status = resolved.status;
              if (resolved.next_airing_episode) item.media_metadata.next_airing_episode = resolved.next_airing_episode;
              if (resolved.next_airing_at) item.media_metadata.next_airing_at = resolved.next_airing_at;
            }

            await supabase.from('media_metadata').update({
              canonical_title: resolved.canonical_title,
              cover_image_url: resolved.cover_image_url,
              mal_id: resolved.mal_id || undefined,
              status: resolved.status || undefined,
              next_airing_episode: resolved.next_airing_episode || undefined,
              next_airing_at: resolved.next_airing_at || undefined
            }).eq('media_id', item.media_id);
          }
        } catch (repairErr) {
          console.warn('[OmniSync] Cover repair error:', repairErr.message);
        }
      }));
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
