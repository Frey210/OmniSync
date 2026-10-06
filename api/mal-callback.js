import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`<h2>MAL Auth Error</h2><p>${error}</p>`);
  }
  if (!code || !state) {
    return res.status(400).send('<h2>Missing code or state</h2>');
  }

  // state format: "link:{user_id}:{verifier}" or "login:{verifier}"
  const parts = state.split(':');
  const mode = parts[0]; // "link" or "login"
  const verifier = parts[parts.length - 1];
  const user_id = mode === 'link' ? parts[1] : null;

  const clientId = process.env.MAL_CLIENT_ID;
  const clientSecret = process.env.MAL_CLIENT_SECRET;
  const redirectUri = process.env.MAL_REDIRECT_URI || 'https://api.farlabs.my.id/api/mal-callback';

  // Exchange code for tokens
  const tokenRes = await fetch('https://myanimelist.net/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret || '',
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier
    })
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('MAL token exchange failed:', errText);
    return res.status(500).send(`<h2>Token exchange failed</h2><pre>${errText}</pre>`);
  }

  const tokens = await tokenRes.json();
  const malAccessToken = tokens.access_token;
  const malRefreshToken = tokens.refresh_token;

  // Fetch MAL user info
  const userRes = await fetch('https://api.myanimelist.net/v2/users/@me', {
    headers: { Authorization: `Bearer ${malAccessToken}` }
  });
  const malUser = userRes.ok ? await userRes.json() : {};
  const malUsername = malUser.name || 'Unknown';

  if (mode === 'link' && user_id) {
    // Link MAL to existing Supabase user
    const { error: upsertErr } = await supabase.from('user_profiles').upsert({
      user_id,
      mal_token: malAccessToken,
      mal_refresh_token: malRefreshToken,
      mal_username: malUsername,
    }, { onConflict: 'user_id' });

    if (upsertErr) {
      console.error('DB upsert error:', upsertErr);
      return res.status(500).send('<h2>Failed to save MAL token</h2>');
    }

    return res.send(`<!DOCTYPE html><html><head><title>OmniSync — MAL Linked</title>
<style>body{background:#090b10;color:#e2e8f0;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}
h2{color:#22c55e;margin:0;}p{color:#94a3b8;margin:0;}</style></head>
<body><h2>✅ MyAnimeList Linked!</h2><p>Logged in as <strong>${malUsername}</strong>. You can close this tab.</p>
<script>setTimeout(()=>window.close(),2000);</script></body></html>`);
  }

  // "login" mode — not typically used for MAL since MAL doesn't manage Supabase auth
  // Just return a success page pointing user to link after email login
  return res.send(`<!DOCTYPE html><html><head><title>OmniSync — MAL</title>
<style>body{background:#090b10;color:#e2e8f0;font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px;}
h2{color:#f59e0b;margin:0;}p{color:#94a3b8;margin:0;text-align:center;max-width:320px;}</style></head>
<body><h2>⚠️ MAL Login</h2>
<p>MAL cannot create OmniSync accounts. Please log in with AniList or Email first, then link your MAL account from the dashboard.</p>
<script>setTimeout(()=>window.close(),4000);</script></body></html>`);
}
