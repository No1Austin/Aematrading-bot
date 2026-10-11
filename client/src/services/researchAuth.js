import { supabase } from "../auth/supabaseClient.js";

/**
 * Returns a current, server-verifiable Supabase access token.
 *
 * getSession() reads the locally persisted session. On some browsers/devices
 * that session can exist locally while its access token is stale.
 *
 * We therefore:
 *   1. Read the current session.
 *   2. Refresh it when necessary.
 *   3. Verify the token with Supabase getUser().
 *   4. Retry once with a refreshed session if verification fails.
 */
async function getValidAccessToken() {
  const {
    data: sessionData,
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.warn("[RESEARCH AUTH] getSession failed", {
      message: sessionError.message,
    });

    throwAuthRequired();
  }

  let session = sessionData?.session ?? null;

  if (!session?.access_token) {
    throwAuthRequired();
  }

  /*
   * Refresh shortly before expiry.
   */
  const expiresAtMs =
    Number(session.expires_at || 0) * 1000;

  const expiresSoon =
    !expiresAtMs ||
    expiresAtMs <= Date.now() + 60_000;

  if (expiresSoon) {
    const {
      data: refreshData,
      error: refreshError,
    } = await supabase.auth.refreshSession();

    if (
      !refreshError &&
      refreshData?.session?.access_token
    ) {
      session = refreshData.session;
    }
  }

  /*
   * Verify that Supabase actually recognizes this token.
   */
  let {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser(
    session.access_token
  );

  if (!userError && userData?.user) {
    return session.access_token;
  }

  console.warn(
    "[RESEARCH AUTH] Stored access token was not valid; refreshing session",
    {
      message: userError?.message || null,
    }
  );

  /*
   * One recovery attempt.
   */
  const {
    data: refreshed,
    error: refreshError,
  } = await supabase.auth.refreshSession();

  if (
    refreshError ||
    !refreshed?.session?.access_token
  ) {
    console.warn("[RESEARCH AUTH] Session refresh failed", {
      message: refreshError?.message || null,
    });

    await supabase.auth.signOut({
      scope: "local",
    });

    throwAuthRequired();
  }

  session = refreshed.session;

  /*
   * Verify the refreshed token before sending it to our API.
   */
  ({
    data: userData,
    error: userError,
  } = await supabase.auth.getUser(
    session.access_token
  ));

  if (userError || !userData?.user) {
    console.warn(
      "[RESEARCH AUTH] Refreshed access token could not be verified",
      {
        message: userError?.message || null,
      }
    );

    await supabase.auth.signOut({
      scope: "local",
    });

    throwAuthRequired();
  }

  return session.access_token;
}

function throwAuthRequired() {
  const error = new Error(
    "Your session has expired. Please sign in again."
  );

  error.status = 401;
  error.code = "AUTH_SESSION_REQUIRED";

  throw error;
}

/**
 * Authentication headers shared by Research and the private Bot API.
 */
export async function researchAuthHeaders(existing = {}) {
  const accessToken = await getValidAccessToken();

  const headers = new Headers(existing);

  headers.set(
    "Authorization",
    `Bearer ${accessToken}`
  );

  return headers;
}

export function isProtectedResearchPath(path) {
  return (
    /^\/api\/(analysis|research)(?:\/|$)/.test(path) ||
    /^\/api\/crypto\/research(?:\/|$)/.test(path)
  );
}