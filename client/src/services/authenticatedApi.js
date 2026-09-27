import { supabase } from '../auth/supabaseClient.js';

// Use only for research endpoints requiring authenticated access.
// Preserve existing API helper conventions when integrating into existing services/api.js.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export async function authenticatedApi(path, options = {}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) throw new Error('Please sign in to continue.');
  const headers = new Headers(options.headers ?? {});
  headers.set('Authorization', `Bearer ${session.access_token}`);
  const response = await fetch(`${BASE}${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error || payload.code || `Request failed (${response.status})`);
    err.status = response.status;
    err.code = payload.code;
    throw err;
  }
  return payload;
}
