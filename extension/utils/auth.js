// Supabase configuration
const SUPABASE_URL = "https://kpbbbdowwmbrioarszdu.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwYmJiZG93d21icmlvYXJzemR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NzI4MTMsImV4cCI6MjEwNjE0ODgxM30.sfT7gUkOb-2VQrLHhFt2dnc6pvNAWcVh6BcPIEy2YcI";

async function signUp(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg);

  // If email confirmation is disabled, user is returned with robust session immediately
  if (data.session) {
     await _saveSession(data.session);
  }
  return data.user;
}

async function _saveSession(sessionData) {
  await chrome.storage.local.set({ 
    supabase_session: {
      access_token: sessionData.access_token,
      refresh_token: sessionData.refresh_token,
      user: sessionData.user,
      expires_at: Math.floor(Date.now() / 1000) + sessionData.expires_in
    }
  });
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg);
  await _saveSession(data);
  return data.user;
}

async function refreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const data = await res.json();
  if (!res.ok) {
     await signOut();
     return null;
  }
  await _saveSession(data);
  return data.access_token;
}

async function signOut() {
  await chrome.storage.local.remove('supabase_session');
}

async function getSession() {
  const result = await chrome.storage.local.get('supabase_session');
  return result.supabase_session || null;
}

async function getAccessToken() {
  const session = await getSession();
  if (!session) return null;
  
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at < now + 60) {
     if (session.refresh_token) {
        return await refreshSession(session.refresh_token);
     }
     return null; 
  }
  return session.access_token;
}
