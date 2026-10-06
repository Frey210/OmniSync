import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

function generateVerifier() {
  // MAL expects 43-128 characters [A-Za-z0-9-._~]
  return crypto.randomBytes(48).toString('base64url');
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { user_id } = req.query;
  const clientId = process.env.MAL_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: 'MAL client not configured' });

  const verifier = generateVerifier();
  // With code_challenge_method=plain, challenge MUST match verifier
  const state = user_id ? `link:${user_id}:${verifier}` : `login:${verifier}`;

  const redirectUri = process.env.MAL_REDIRECT_URI || 'https://api.farlabs.my.id/api/mal-callback';
  const url = `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${verifier}&code_challenge_method=plain&state=${encodeURIComponent(state)}`;

  res.redirect(302, url);
}
