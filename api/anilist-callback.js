import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const REDIRECT_URI = process.env.ANILIST_REDIRECT_URI || 'https://api.farlabs.my.id/api/anilist-callback';

function successPage(username, sessionJson = null) {
  const sessionScript = sessionJson
    ? `<script>
        // Post session to any OmniSync extension listener, then poll storage
        const session = ${sessionJson};
        if (window.opener) { window.opener.postMessage({ type: 'OMNISYNC_SESSION', session }, '*'); }
        localStorage.setItem('omnisync_pending_session', JSON.stringify(session));
      </script>`
    : '';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>OmniSync × AniList</title>
<style>
  body { font-family: 'Inter', sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
  .card { text-align: center; background: rgba(30,41,59,0.6); padding: 40px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); max-width: 380px; }
  h1 { color: #6366f1; margin: 0 0 10px; font-size: 22px; }
  p { color: #94a3b8; line-height: 1.6; }
  .user { color: #38bdf8; font-weight: 700; }
  .close-hint { font-size: 13px; margin-top: 20px; opacity: 0.5; }
</style></head>
<body><div class="card">
  <h1>✅ Logged in!</h1>
  <p>Welcome, <span class="user">${username}</span>.<br>Your OmniSync account is ready.</p>
  <p class="close-hint">You can close this tab now.</p>
</div>${sessionScript}</body></html>`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const { code, state } = req.query;
  if (!code || !state) return res.status(400).send('Missing code or state');

  try {
    // 1. Exchange code for AniList token
    const tokenRes = await fetch('https://anilist.co/api/v2/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: process.env.ANILIST_CLIENT_ID,
        client_secret: process.env.ANILIST_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('AniList token exchange failed:', tokenData);
      return res.status(400).send('Failed to get AniList token. Please try again.');
    }

    // 2. Fetch AniList viewer info
    const viewerRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tokenData.access_token}` },
      body: JSON.stringify({ query: '{ Viewer { id name } }' })
    });
    const viewerData = await viewerRes.json();
    const username = viewerData?.data?.Viewer?.name || 'Unknown';

    const decodedState = decodeURIComponent(state);

    // === MODE: link existing account ===
    if (decodedState.startsWith('link:')) {
      const userId = decodedState.replace('link:', '');
      const { error } = await supabase.from('user_profiles').upsert({
        user_id: userId,
        anilist_token: tokenData.access_token,
        anilist_username: username
      }, { onConflict: 'user_id' });

      if (error) {
        console.error('DB upsert error:', error);
        return res.status(500).send('DB error: ' + error.message);
      }

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(successPage(username));
    }

    // === MODE: login / sign-up via AniList ===
    if (decodedState === 'login') {
      const email = `${username.toLowerCase()}@anilist.omnisync`;
      const password = `al_${tokenData.access_token.slice(0, 32)}`; // deterministic, never shown to user

      // Try sign-in first
      let session = null;
      const signInRes = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const signInData = await signInRes.json();

      if (signInData.access_token) {
        session = signInData;
      } else {
        // User doesn't exist yet — create via admin API
        const createRes = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { anilist_username: username, provider: 'anilist' }
        });
        if (createRes.error) {
          console.error('Create user error:', createRes.error);
          return res.status(500).send('Failed to create account: ' + createRes.error.message);
        }

        // Sign in to get session
        const signInRes2 = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { 'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const signInData2 = await signInRes2.json();
        if (!signInData2.access_token) {
          return res.status(500).send('Account created but login failed. Please try again.');
        }
        session = signInData2;
      }

      // Save AniList token to user_profiles
      await supabase.from('user_profiles').upsert({
        user_id: session.user.id,
        anilist_token: tokenData.access_token,
        anilist_username: username
      }, { onConflict: 'user_id' });

      // Return session to extension via page script
      const sessionPayload = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user: session.user,
        expires_in: session.expires_in
      };

      res.setHeader('Content-Type', 'text/html');
      return res.status(200).send(successPage(username, JSON.stringify(sessionPayload)));
    }

    return res.status(400).send('Unknown state');

  } catch (err) {
    console.error('AniList callback error:', err);
    res.status(500).send('Internal error: ' + err.message);
  }
}
