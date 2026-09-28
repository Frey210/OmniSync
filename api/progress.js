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

    return res.status(200).json({ data: progress });

  } catch (err) {
    console.error("Progress fetch error:", err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
