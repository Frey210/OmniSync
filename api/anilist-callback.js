import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state: userId } = req.query;
  if (!code || !userId) {
    return res.status(400).send('Missing code or state parameter');
  }

  try {
    // Exchange authorization code for access token
    const tokenRes = await fetch('https://anilist.co/api/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.ANILIST_CLIENT_ID,
        client_secret: process.env.ANILIST_CLIENT_SECRET,
        redirect_uri: process.env.ANILIST_REDIRECT_URI || 'https://api.farlabs.my.id/api/anilist-callback',
        code
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('AniList token exchange failed:', tokenData);
      return res.status(400).send('Failed to get AniList token. Please try again.');
    }

    // Fetch AniList username
    const viewerRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenData.access_token}`
      },
      body: JSON.stringify({ query: '{ Viewer { name } }' })
    });
    const viewerData = await viewerRes.json();
    const username = viewerData?.data?.Viewer?.name || 'Unknown';

    // Upsert into user_profiles
    const { error } = await supabase.from('user_profiles').upsert({
      user_id: userId,
      anilist_token: tokenData.access_token,
      anilist_username: username
    }, { onConflict: 'user_id' });

    if (error) {
      console.error('DB upsert error:', error);
      return res.status(500).send('Failed to save AniList link. DB error: ' + error.message);
    }

    // Success page
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"><title>OmniSync × AniList</title>
      <style>
        body { font-family: 'Inter', sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { text-align: center; background: rgba(30,41,59,0.6); padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); }
        h1 { color: #6366f1; margin: 0 0 10px; }
        p { color: #94a3b8; }
        .user { color: #38bdf8; font-weight: 700; }
      </style></head>
      <body><div class="card">
        <h1>✅ Connected!</h1>
        <p>AniList account <span class="user">${username}</span> linked to OmniSync.</p>
        <p style="font-size:13px;margin-top:20px;opacity:0.6">You can close this tab now.</p>
      </div></body></html>
    `);

  } catch (err) {
    console.error('AniList callback error:', err);
    res.status(500).send('Internal error: ' + err.message);
  }
}
