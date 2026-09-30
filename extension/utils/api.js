const API_BASE = "https://api.farlabs.my.id/api";

async function apiFetch(endpoint, options = {}) {
  const token = await getAccessToken(); // uses global from auth.js
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  console.log("[OmniSync API] Fetching:", `${API_BASE}${endpoint}`, options.method || 'GET');

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      mode: 'cors'
    });
  } catch (fetchErr) {
    console.error("[OmniSync API] Network error:", fetchErr);
    throw new Error(`Network error: ${fetchErr.message}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (jsonErr) {
    const text = await response.text().catch(() => '');
    console.error("[OmniSync API] Non-JSON response:", response.status, text);
    throw new Error(`Server returned ${response.status}: not JSON`);
  }

  console.log("[OmniSync API] Response:", response.status, data);

  if (!response.ok) {
    throw new Error(data.error || `API Error ${response.status}`);
  }

  return data;
}

async function syncProgress(payload) {
  console.log("[OmniSync API] Sync payload:", payload);
  return await apiFetch('/sync', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function getProgress() {
  const response = await apiFetch('/progress', { method: 'GET' });
  return response.data || [];
}
