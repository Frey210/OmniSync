import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

// Helper to get search variations from title
function getTitleVariations(title) {
  const clean = title
    .replace(/^#+/, '')
    .replace(/\b(sub\s*indo|subtitle\s*indonesia|season\s*\d+|s\d+|batch|tamat|lengkap)\b/gi, '')
    .trim();
  const list = [clean];

  // Phonetic typo corrections for Japanese transliteration in Indonesian sites:
  // "banasi" -> "banashi", "si" -> "shi"
  const withShi = clean.replace(/\b([a-z]+)si\b/gi, '$1shi').replace(/([b-df-hj-np-tv-z])si([aeiou])/gi, '$1shi$2');
  if (withShi !== clean && !list.includes(withShi)) list.push(withShi);

  // "sy" -> "sh"
  const withSh = clean.replace(/sy/gi, 'sh');
  if (withSh !== clean && !list.includes(withSh)) list.push(withSh);

  // "ti" -> "chi"
  const withChi = clean.replace(/\bti([aeiou])/gi, 'chi$1');
  if (withChi !== clean && !list.includes(withChi)) list.push(withChi);

  const splitDai = clean.replace(/\bdai([a-z]+)/gi, 'dai $1');
  if (splitDai !== clean && !list.includes(splitDai)) list.push(splitDai);

  const noPunct = clean.replace(/[-_:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noPunct !== clean && !list.includes(noPunct)) list.push(noPunct);

  const words = clean.split(/\s+/).filter(w => w.length > 2);
  if (words.length > 2) {
    const head = words.slice(0, 3).join(' ');
    if (!list.includes(head)) list.push(head);
  }
  return list;
}

function findBestMediaMatch(candidates, searchTitle) {
  if (!candidates || candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const target = searchTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
  let best = candidates[0];
  let bestScore = -1;

  for (const c of candidates) {
    const titles = [c.title?.romaji, c.title?.english, c.title?.native].filter(Boolean);
    for (const t of titles) {
      const norm = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      let score = 0;
      if (norm === target) score = 100;
      else if (norm.startsWith(target) || target.startsWith(norm)) score = 80;
      else if (norm.includes(target) || target.includes(norm)) score = 60;
      else {
        const targetWords = searchTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const titleWords = t.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const common = targetWords.filter(w => titleWords.includes(w)).length;
        score = common * 10;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return best;
}

async function searchKitsu(title, type) {
  try {
    const kType = type.toLowerCase() === 'anime' ? 'anime' : 'manga';
    const res = await fetch(`https://kitsu.io/api/edge/${kType}?filter[text]=${encodeURIComponent(title)}&page[limit]=1`, {
      headers: { 'Accept': 'application/vnd.api+json' },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    const item = data?.data?.[0];
    if (!item) return null;
    const attrs = item.attributes;
    return {
      media_id: parseInt(item.id) + 70000000,
      canonical_title: attrs.canonicalTitle || attrs.titles?.en || attrs.titles?.en_jp || title,
      cover_image_url: attrs.posterImage?.large || attrs.posterImage?.medium || attrs.posterImage?.small || null,
      media_type: type.toUpperCase(),
      total_episodes_chapters: attrs.episodeCount || attrs.chapterCount || null,
      status: attrs.status === 'current' ? 'RELEASING' : (attrs.status === 'finished' ? 'FINISHED' : null),
      next_airing_episode: null,
      next_airing_at: null
    };
  } catch(e) {
    console.warn("Kitsu fallback failed:", e.message);
    return null;
  }
}

// Helper to find media on AniList with fallback to Kitsu and Jikan (MAL)
async function findAndCacheMedia(title, type, fallbackCover) {
  const mediaType = type.toUpperCase();
  const variations = getTitleVariations(title);

  const alQuery = `
    query ($search: String, $type: MediaType) {
      Page(page: 1, perPage: 3) {
        media(search: $search, type: $type, sort: SEARCH_MATCH) {
          id
          idMal
          title { romaji english native }
          coverImage { large medium }
          episodes
          chapters
          status
          nextAiringEpisode {
            airingAt
            episode
          }
        }
      }
    }
  `;

  // 1. Try AniList with variations (with best match picking)
  for (const v of variations) {
    try {
      const response = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: alQuery, variables: { search: v, type: mediaType } }),
        signal: AbortSignal.timeout(4000)
      });

      const data = await response.json();
      const candidates = data?.data?.Page?.media;
      const media = findBestMediaMatch(candidates, v);
      if (media) {
        return {
          media_id: media.id,
          mal_id: media.idMal || null,
          canonical_title: media.title.english || media.title.romaji || media.title.native,
          cover_image_url: media.coverImage?.large || media.coverImage?.medium || fallbackCover || null,
          media_type: mediaType,
          total_episodes_chapters: mediaType === 'ANIME' ? media.episodes : media.chapters,
          status: media.status || null,
          next_airing_episode: media.nextAiringEpisode?.episode || null,
          next_airing_at: media.nextAiringEpisode?.airingAt || null
        };
      }
    } catch(e) {
      console.warn("AniList search attempt failed for", v, e.message);
    }
  }

  // 2. FALLBACK 1: Kitsu API
  for (const v of variations.slice(0, 2)) {
    const kMatch = await searchKitsu(v, type);
    if (kMatch) {
      if (!kMatch.cover_image_url && fallbackCover) kMatch.cover_image_url = fallbackCover;
      return kMatch;
    }
  }

  // 3. FALLBACK 2: JIKAN (MyAnimeList) API
  for (const v of variations.slice(0, 2)) {
    try {
      const jikanType = mediaType === 'ANIME' ? 'anime' : 'manga';
      const jRes = await fetch(`https://api.jikan.moe/v4/${jikanType}?q=${encodeURIComponent(v)}&limit=1`, {
        signal: AbortSignal.timeout(3000)
      });
      const jData = await jRes.json();
      if (jData && jData.data && jData.data.length > 0) {
        const jMedia = jData.data[0];
        const jStatus = jMedia.status ? (jMedia.status.includes('Currently Airing') ? 'RELEASING' : (jMedia.status.includes('Finished') ? 'FINISHED' : null)) : null;
        return {
          media_id: jMedia.mal_id + 80000000, // offset MAL ID by 80 million to avoid AniList collision
          mal_id: jMedia.mal_id,
          canonical_title: jMedia.title_english || jMedia.title,
          cover_image_url: jMedia.images?.jpg?.large_image_url || jMedia.images?.jpg?.image_url || fallbackCover || null,
          media_type: mediaType,
          total_episodes_chapters: jikanType === 'anime' ? jMedia.episodes : jMedia.chapters,
          status: jStatus,
          next_airing_episode: null,
          next_airing_at: null
        };
      }
    } catch(e) {
      console.warn("Jikan API search failed for", v, e.message);
    }
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

  const { raw_title, episode, chapter, type, source_url, cover_url } = req.body;
  const progressValue = episode || chapter;

  if (!raw_title || !progressValue || !type) {
    return res.status(400).json({ error: 'Missing required sync data' });
  }

  try {
    const fetchedMedia = await findAndCacheMedia(raw_title, type, cover_url);
    let media_id;
    
    if (fetchedMedia) {
       media_id = fetchedMedia.media_id;
       if (!fetchedMedia.cover_image_url && cover_url) {
          fetchedMedia.cover_image_url = cover_url;
       }
       // Upsert AniList/Kitsu/Jikan metadata to satisfy foreign key
       const { error: metaErr } = await supabase.from('media_metadata').upsert(fetchedMedia, { onConflict: 'media_id' });
       if (metaErr) console.error("Media metadata external API upsert error:", metaErr);
    } else {
       // FALLBACK: If API 404s, generate pseudo ID and cache with cover_url from DOM
       media_id = generatePseudoId(raw_title);
       const { error: metaErr } = await supabase.from('media_metadata').upsert({
          media_id,
          canonical_title: (raw_title.charAt(0).toUpperCase() + raw_title.slice(1)),
          cover_image_url: cover_url || null,
          media_type: type.toUpperCase(),
          total_episodes_chapters: null
       }, { onConflict: 'media_id' });
       if (metaErr) console.error("Media metadata pseudo ID upsert error:", metaErr);
    }

    // Repair existing missing cover if DOM cover is now available
    if (cover_url) {
      await supabase
        .from('media_metadata')
        .update({ cover_image_url: cover_url })
        .eq('media_id', media_id)
        .is('cover_image_url', null);
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
