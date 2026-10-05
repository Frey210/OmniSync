import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { user_id, mode = 'link' } = req.query;
  const clientId = process.env.ANILIST_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'AniList client not configured' });

  // state encodes the mode: "login" or "link:{user_id}"
  const state = mode === 'login' ? 'login' : `link:${user_id}`;
  const redirectUri = process.env.ANILIST_REDIRECT_URI || 'https://api.farlabs.my.id/api/anilist-callback';
  const url = `https://anilist.co/api/v2/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;

  res.redirect(302, url);
}
