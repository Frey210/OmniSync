const API_BASE = "https://api.farlabs.my.id/api";

async function apiFetch(endpoint, options = {}) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  const url = `${API_BASE}${endpoint}`;
  console.log("[OmniSync API]", options.method || 'GET', url);

  // Retry up to 2 times on network errors
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers
        // ponytail: no explicit mode — service worker handles CORS via host_permissions
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        throw new Error(`Server returned ${response.status} (non-JSON)`);
      }

      console.log("[OmniSync API] Response:", response.status, data);

      if (!response.ok) {
        throw new Error(data.detail ? `${data.error}: ${data.detail}` : (data.error || `API Error ${response.status}`));
      }
      return data;

    } catch (err) {
      lastErr = err;
      if (err.message.includes('Failed to fetch') && attempt < 2) {
        console.log(`[OmniSync API] Retry ${attempt + 1}...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
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
