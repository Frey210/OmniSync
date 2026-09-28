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

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'API Request Failed');
  }

  return data;
}

async function syncProgress(payload) {
  return await apiFetch('/sync', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function getProgress() {
  const response = await apiFetch('/progress', { method: 'GET' });
  return response.data || [];
}
