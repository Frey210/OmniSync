// Supabase configuration - these should ideally match the loaded .env or be injected
const SUPABASE_URL = "YOUR_SUPABASE_URL_HERE"; 
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY_HERE";

/**
 * Perform login via Supabase GoTrue API
 * @param {string} email 
 * @param {string} password 
 */
export async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  
  if (!res.ok) {
    throw new Error(data.error_description || data.msg);
  }

  // Save session directly to chrome storage
  await chrome.storage.local.set({ 
    supabase_session: {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in
    }
  });

  return data.user;
}

export async function signOut() {
  await chrome.storage.local.remove('supabase_session');
}

export async function getSession() {
  const result = await chrome.storage.local.get('supabase_session');
  return result.supabase_session || null;
}

export async function getAccessToken() {
  const session = await getSession();
  if (!session) return null;
  
  // Basic check for expiration (with 60sec margin)
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at < now + 60) {
     // TODO: Implement refresh token mechanism if needed
     // For simplicity in this demo, return null and force re-login if expired
     return null; 
  }
  return session.access_token;
}
