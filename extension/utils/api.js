import { getAccessToken } from './auth.js';

// Base URL for the Vercel server. Change this for local testing (e.g. http://localhost:3000/api)
const API_BASE = "https://api.farlabs.my.id/api"; // or "http://localhost:3000/api" for dev

/**
 * Helper for making authenticated requests to our Vercel backend
 */
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

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'API Request Failed');
  }

  // Handle nested data structures correctly based on our backend responses
  return data;
}

export async function syncProgress(payload) {
  return await apiFetch('/sync', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getProgress() {
  const response = await apiFetch('/progress', { method: 'GET' });
  // the Vercel API wraps array in { data: progress }
  return response.data || [];
}
