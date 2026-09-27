import { supabase } from "../auth/supabaseClient.js";

// Never use a service-role key in frontend code.
export async function researchAuthHeaders(existing = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) {
    const failure = new Error("Please sign in to access research.");
    failure.status = 401;
    throw failure;
  }
  const headers = new Headers(existing);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return headers;
}

export function isProtectedResearchPath(path) {
  return /^\/api\/(analysis|research)(?:\/|$)/.test(path) ||
    /^\/api\/crypto\/research(?:\/|$)/.test(path);
}
