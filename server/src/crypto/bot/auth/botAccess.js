
/**
 * AEMA BOT ACCESS
 *
 * Single-login authentication using Supabase.
 *
 * - No separate bot password.
 * - No bot signing secret.
 * - No private bot session cookie.
 * - Every protected request verifies the Supabase user.
 * - Existing bot middleware exports are preserved.
 */

const SUPABASE_URL = (
  process.env.SUPABASE_URL || ""
).replace(/\/+$/, "");

const SUPABASE_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "";

function getBearerToken(req) {
  const authorization = String(
    req.headers.authorization || ""
  );

  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || "";
}

function authError(message, status = 401) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function verifySupabaseUser(req) {
  const token = getBearerToken(req);

  if (!token) {
    throw authError("SUPABASE_AUTH_REQUIRED", 401);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw authError(
      "SUPABASE_AUTH_NOT_CONFIGURED",
      503
    );
  }

  let response;

  try {
    response = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(10000),
      }
    );
  } catch {
    throw authError(
      "SUPABASE_AUTH_UNAVAILABLE",
      503
    );
  }

  if (!response.ok) {
    if (
      response.status === 401 ||
      response.status === 403
    ) {
      throw authError(
        "SUPABASE_AUTH_INVALID",
        401
      );
    }

    throw authError(
      "SUPABASE_AUTH_UNAVAILABLE",
      503
    );
  }

  let user;

  try {
    user = await response.json();
  } catch {
    throw authError(
      "SUPABASE_AUTH_INVALID",
      401
    );
  }

  if (!user?.id) {
    throw authError(
      "SUPABASE_AUTH_INVALID",
      401
    );
  }

  return user;
}

function sendAuthError(res, error) {
  res.set("Cache-Control", "no-store");

  return res.status(error.status || 503).json({
    error: error.message || "BOT_AUTH_FAILED",
  });
}

/* ============================================================
   PROTECTED BOT MIDDLEWARE
   ============================================================ */

export async function requireBotAccess(
  req,
  res,
  next
) {
  try {
    const user = await verifySupabaseUser(req);

    req.botUser = user;
    req.botUserId = user.id;
    req.botAuthMethod = "supabase";

    return next();
  } catch (error) {
    return sendAuthError(res, error);
  }
}

/* ============================================================
   AUTH STATUS
   ============================================================ */

export async function botAuthStatus(req, res) {
  res.set("Cache-Control", "no-store");

  try {
    const user = await verifySupabaseUser(req);

    return res.json({
      authorized: true,
      method: "supabase",
      userId: user.id,
    });
  } catch {
    return res.json({
      authorized: false,
      method: null,
    });
  }
}

/* ============================================================
   LOGIN COMPATIBILITY
   ============================================================ */

export async function botLogin(req, res) {
  res.set("Cache-Control", "no-store");

  try {
    const user = await verifySupabaseUser(req);

    return res.json({
      authorized: true,
      method: "supabase",
      userId: user.id,
    });
  } catch (error) {
    return sendAuthError(res, error);
  }
}

/* ============================================================
   LOGOUT COMPATIBILITY
   ============================================================ */

export function botLogout(req, res) {
  res.set("Cache-Control", "no-store");

  return res.json({
    authorized: false,
    method: "supabase",
  });
}
