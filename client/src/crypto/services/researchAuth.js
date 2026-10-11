// client/src/services/researchAuth.js

import { supabase } from "../auth/supabaseClient.js";

/**
 * Returns authenticated headers for protected research requests.
 * Uses the existing Supabase client.
 */
export async function researchAuthHeaders(existing = {}) {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data?.session?.access_token) {
    const failure = new Error("Please sign in to access research.");
    failure.status = 401;
    throw failure;
  }

  const headers = new Headers(existing);

  headers.set(
    "Authorization",
    `Bearer ${data.session.access_token}`
  );

  return headers;
}

/**
 * Identifies protected research API paths.
 */
export function isProtectedResearchPath(path) {
  return (
    /^\/api\/(analysis|research)(?:\/|$)/.test(path) ||
    /^\/api\/crypto\/research(?:\/|$)/.test(path)
  );
}