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
        idMal
        title { romaji english native }
        coverImage { large }
        episodes
        chapters
        status
        nextAiringEpisode {
          airingAt
          episode
        }
      }
    }
  `;

  try {
    const response = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query, variables: { search: title, type: mediaType } })
    });

    const data = await response.json();
    const media = data?.data?.Media;
    if (media) {
      return {
        media_id: media.id,
        mal_id: media.idMal || null,
        canonical_title: media.title.english || media.title.romaji || media.title.native,
        cover_image_url: media.coverImage?.large,
        media_type: mediaType,
        total_episodes_chapters: mediaType === 'ANIME' ? media.episodes : media.chapters,
        status: media.status || null,
        next_airing_episode: media.nextAiringEpisode?.episode || null,
        next_airing_at: media.nextAiringEpisode?.airingAt || null
      };
    }
  } catch(e) {
    console.error("AniList search failed:", e);
  }

  // --- FALLBACK 1: JIKAN (MyAnimeList) API ---
  // Better for non-standard slugs like "kimi-shinu-shitai" or "re zero s4"
  try {
    const jikanType = mediaType === 'ANIME' ? 'anime' : 'manga';
    const jRes = await fetch(`https://api.jikan.moe/v4/${jikanType}?q=${encodeURIComponent(title)}&limit=1`);
    const jData = await jRes.json();
    if (jData && jData.data && jData.data.length > 0) {
      const jMedia = jData.data[0];
      const jStatus = jMedia.status ? (jMedia.status.includes('Currently Airing') ? 'RELEASING' : (jMedia.status.includes('Finished') ? 'FINISHED' : null)) : null;
      return {
        media_id: jMedia.mal_id + 80000000, // offset MAL ID by 80 million to avoid AniList collision
        mal_id: jMedia.mal_id,
        canonical_title: jMedia.title_english || jMedia.title,
        cover_image_url: jMedia.images?.jpg?.large_image_url || jMedia.images?.jpg?.image_url,
        media_type: mediaType,
        total_episodes_chapters: jikanType === 'anime' ? jMedia.episodes : jMedia.chapters,
        status: jStatus,
        next_airing_episode: null,
        next_airing_at: null
      };
    }
  } catch(e) {
    console.error("Jikan API search failed:", e);
  }

  return null;
}

function generatePseudoId(title) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    const char = title.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Safe bounds: 1,000,000,000 to 1,999,999,999 (Fits in PostgreSQL 4-byte integer)
  return 1000000000 + (Math.abs(hash) % 1000000000);
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
    const fetchedMedia = await findAndCacheMedia(raw_title, type);
    let media_id;
    
    if (fetchedMedia) {
       media_id = fetchedMedia.media_id;
       // Upsert AniList/Jikan metadata to satisfy foreign key
       const { error: metaErr } = await supabase.from('media_metadata').upsert(fetchedMedia, { onConflict: 'media_id' });
       if (metaErr) console.error("Media metadata external API upsert error:", metaErr);
    } else {
       // FALLBACK: If API 404s, generate pseudo ID and cache it anyway
       media_id = generatePseudoId(raw_title);
       const { error: metaErr } = await supabase.from('media_metadata').upsert({
          media_id,
          canonical_title: (raw_title.charAt(0).toUpperCase() + raw_title.slice(1)),
          cover_image_url: 'https://via.placeholder.com/150x200.png?text=No+Cover',
          media_type: type.toUpperCase(),
          total_episodes_chapters: null
       }, { onConflict: 'media_id' });
       if (metaErr) console.error("Media metadata pseudo ID upsert error:", metaErr);
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

// Push progress to AniList
async function pushToAniList(userId, mediaId, progressValue) {
  if (mediaId >= 80000000) return null; // Pseudo ID or Jikan offset
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('anilist_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile?.anilist_token) return null;

    const mutation = `
      mutation ($mediaId: Int, $progress: Int, $status: MediaListStatus) {
        SaveMediaListEntry(mediaId: $mediaId, progress: $progress, status: $status) {
          id mediaId progress status
        }
      }
    `;
    const alRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${profile.anilist_token}`
      },
      body: JSON.stringify({
        query: mutation,
        variables: { mediaId: mediaId, progress: progressValue, status: 'CURRENT' }
      })
    });
    const alData = await alRes.json();
    return alData.errors ? 'error' : 'ok';
  } catch (err) {
    console.error('[OmniSync] AniList push error:', err);
    return 'error';
  }
}

// Push progress to MyAnimeList (supports Anime and Manga)
async function pushToMyAnimeList(userId, mediaId, rawTitle, type, progressValue) {
  try {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('mal_token, mal_refresh_token')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile?.mal_token) return null; // Not linked

    let malId = null;
    const { data: meta } = await supabase
      .from('media_metadata')
      .select('mal_id')
      .eq('media_id', mediaId)
      .maybeSingle();

    malId = meta?.mal_id;

    // Backfill mal_id from AniList if missing
    if (!malId && mediaId < 80000000) {
      try {
        const alRes = await fetch('https://graphql.anilist.co', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `{ Media(id: ${mediaId}) { idMal } }` })
        });
        const alData = await alRes.json();
        malId = alData?.data?.Media?.idMal || null;
        if (malId) {
          await supabase.from('media_metadata').update({ mal_id: malId }).eq('media_id', mediaId);
        }
      } catch (e) {
        console.warn('[OmniSync] Could not backfill mal_id from AniList:', e.message);
      }
    }

    // Backfill mal_id from Jikan if still missing
    if (!malId && rawTitle) {
      try {
        const jikanType = type.toLowerCase() === 'anime' ? 'anime' : 'manga';
        const jRes = await fetch(`https://api.jikan.moe/v4/${jikanType}?q=${encodeURIComponent(rawTitle)}&limit=1`);
        const jData = await jRes.json();
        if (jData?.data?.[0]?.mal_id) {
          malId = jData.data[0].mal_id;
          await supabase.from('media_metadata').update({ mal_id: malId }).eq('media_id', mediaId);
        }
      } catch (e) {
        console.warn('[OmniSync] Could not backfill mal_id from Jikan:', e.message);
      }
    }

    if (!malId) {
      console.warn(`[OmniSync] No MAL ID found for media ${mediaId} (${rawTitle})`);
      return 'no_mal_id';
    }

    const isAnime = type.toLowerCase() === 'anime';
    const endpoint = isAnime
      ? `https://api.myanimelist.net/v2/anime/${malId}/my_list_status`
      : `https://api.myanimelist.net/v2/manga/${malId}/my_list_status`;

    const fieldName = isAnime ? 'num_watched_episodes' : 'num_chapters_read';
    const statusVal = isAnime ? 'watching' : 'reading';

    const sendMalUpdate = async (token) => {
      return await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          status: statusVal,
          [fieldName]: String(progressValue)
        })
      });
    };

    let malRes = await sendMalUpdate(profile.mal_token);

    // If token expired (401), auto-refresh token and retry
    if (malRes.status === 401 && profile.mal_refresh_token) {
      console.log('[OmniSync] MAL token expired, attempting refresh...');
      const refreshParams = {
        client_id: process.env.MAL_CLIENT_ID?.trim(),
        grant_type: 'refresh_token',
        refresh_token: profile.mal_refresh_token.trim()
      };
      if (process.env.MAL_CLIENT_SECRET?.trim()) {
        refreshParams.client_secret = process.env.MAL_CLIENT_SECRET.trim();
      }

      const refreshRes = await fetch('https://myanimelist.net/v1/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(refreshParams)
      });

      if (refreshRes.ok) {
        const newTokens = await refreshRes.json();
        await supabase.from('user_profiles').update({
          mal_token: newTokens.access_token,
          mal_refresh_token: newTokens.refresh_token || profile.mal_refresh_token
        }).eq('user_id', userId);

        malRes = await sendMalUpdate(newTokens.access_token);
      } else {
        const refText = await refreshRes.text();
        console.error('[OmniSync] MAL token refresh failed:', refText);
        return 'token_expired';
      }
    }

    if (!malRes.ok) {
      const errText = await malRes.text();
      console.error(`[OmniSync] MAL update failed (${malRes.status}):`, errText);
      return 'error';
    }

    console.log(`[OmniSync] MAL progress synced: ${type} ${malId} -> ${progressValue}`);
    return 'ok';

  } catch (err) {
    console.error('[OmniSync] MAL push error:', err);
    return 'error';
  }
}

    // --- Push to AniList & MyAnimeList in parallel (non-blocking) ---
    const [anilistSync, malSync] = await Promise.all([
      pushToAniList(user.id, media_id, progressValue),
      pushToMyAnimeList(user.id, media_id, raw_title, type, progressValue)
    ]);

    return res.status(200).json({
       success: true,
       media_id,
       latest_chapter_episode: progressValue,
       anilist_sync: anilistSync,
       mal_sync: malSync
    });

  } catch (err) {
    console.error("Sync error:", err);
    return res.status(500).json({ error: 'Internal Server Error', detail: err.message });
  }
}
