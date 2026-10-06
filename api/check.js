import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

  const { raw_title, progress, type } = req.body;
  if (!raw_title || progress === undefined) {
    return res.status(400).json({ error: 'Missing raw_title or progress' });
  }

  const currentVal = parseFloat(progress);

  try {
    // Search user's progress by joining media_metadata
    const { data: userEntries, error } = await supabase
      .from('user_progress')
      .select(`
        id,
        latest_chapter_episode,
        media_type,
        media_metadata!inner (
          canonical_title
        )
      `)
      .eq('user_id', user.id);

    if (error) throw error;

    // Match raw_title (case-insensitive substring)
    const cleanSearch = raw_title.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    const match = userEntries?.find(entry => {
      const canon = (entry.media_metadata?.canonical_title || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
      return canon.includes(cleanSearch) || cleanSearch.includes(canon);
    });

    if (!match) {
      return res.status(200).json({ tracked: false });
    }

    const lastProgress = match.latest_chapter_episode;
    const isRewatch = currentVal <= lastProgress;
    const isJump = currentVal > (lastProgress + 1);

    return res.status(200).json({
      tracked: true,
      canonical_title: match.media_metadata?.canonical_title || raw_title,
      last_progress: lastProgress,
      current_progress: currentVal,
      is_rewatch: isRewatch,
      is_jump: isJump,
      type: type || 'anime'
    });

  } catch (err) {
    console.error("Check progress error:", err);
    return res.status(500).json({ error: 'Internal Error', detail: err.message });
  }
}
