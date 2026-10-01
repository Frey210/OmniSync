import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data, error } = await supabase
    .from('user_profiles')
    .select('anilist_username')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    console.error('AniList status check error:', error);
    return res.status(200).json({ linked: false });
  }

  if (data && data.anilist_username) {
    return res.status(200).json({ linked: true, username: data.anilist_username });
  }

  return res.status(200).json({ linked: false });
}
