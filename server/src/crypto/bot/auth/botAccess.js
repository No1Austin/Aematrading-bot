import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const COOKIE = "aema_bot_access";
const TTL = 8 * 60 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Legacy bot access                                                          */
/* -------------------------------------------------------------------------- */

const secret = () =>
  process.env.AEMA_BOT_AUTH_SECRET ||
  process.env.AEMA_BOT_ACCESS_KEY ||
  "";

const sign = (value) =>
  crypto
    .createHmac("sha256", secret())
    .update(value)
    .digest("hex");

/* -------------------------------------------------------------------------- */
/* Cookie helpers                                                             */
/* -------------------------------------------------------------------------- */

const parse = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf("=");

        return i < 0
          ? [x, ""]
          : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
      })
  );

const valid = (token) => {
  if (!token || !secret()) return false;

  const [exp, sig] = token.split(".");

  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;

  const expected = sign(exp);

  if (sig.length !== expected.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
};

/* -------------------------------------------------------------------------- */
/* Supabase                                                                   */
/* -------------------------------------------------------------------------- */

let supabaseAuthClient = null;

function getSupabaseAuthClient() {
  if (supabaseAuthClient) {
    return supabaseAuthClient;
  }

  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("[BOT AUTH] Supabase configuration missing", {
      hasSupabaseUrl: Boolean(url),
      hasSupabaseAnonKey: Boolean(key),
    });

    return null;
  }

  supabaseAuthClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseAuthClient;
}

/* -------------------------------------------------------------------------- */
/* Bearer token                                                               */
/* -------------------------------------------------------------------------- */

function bearer(req) {
  const header = String(req.headers.authorization || "");

  const match = header.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

/* -------------------------------------------------------------------------- */
/* Resolve Supabase user                                                      */
/* -------------------------------------------------------------------------- */

async function getSupabaseUser(req) {
  const token = bearer(req);

  if (!token) {
    return null;
  }

  const client = getSupabaseAuthClient();

  if (!client) {
    console.error(
      "[BOT AUTH] Cannot validate bearer token because Supabase client is unavailable"
    );

    return null;
  }

  try {
    const { data, error } = await client.auth.getUser(token);

    if (error) {
      console.warn("[BOT AUTH] Supabase token rejected", {
        message: error.message,
        status: error.status ?? null,
      });

      return null;
    }

    if (!data?.user) {
      console.warn(
        "[BOT AUTH] Supabase returned no user for bearer token"
      );

      return null;
    }

    return data.user;
  } catch (error) {
    console.error("[BOT AUTH] Supabase validation exception", {
      message: error?.message || String(error),
    });

    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Cookie configuration                                                       */
/* -------------------------------------------------------------------------- */

const cookieAttributes = () =>
  process.env.NODE_ENV === "production"
    ? [
        "HttpOnly",
        "Secure",
        "SameSite=None",
        "Path=/api/crypto/bot",
      ].join("; ")
    : [
        "HttpOnly",
        "SameSite=Lax",
        "Path=/api/crypto/bot",
      ].join("; ");

/* -------------------------------------------------------------------------- */
/* Legacy bot login                                                           */
/* -------------------------------------------------------------------------- */

export function botLogin(req, res) {
  const configured = process.env.AEMA_BOT_ACCESS_KEY;

  if (!configured) {
    return res.status(503).json({
      error: "BOT_ACCESS_NOT_CONFIGURED",
    });
  }

  const supplied = String(req.body?.accessKey || "");

  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);

  if (
    a.length !== b.length ||
    !crypto.timingSafeEqual(a, b)
  ) {
    return res.status(401).json({
      error: "BOT_ACCESS_DENIED",
    });
  }

  const exp = String(Date.now() + TTL);
  const token = `${exp}.${sign(exp)}`;

  res.setHeader(
    "Set-Cookie",
    [
      `${COOKIE}=${encodeURIComponent(token)}`,
      cookieAttributes(),
      `Max-Age=${Math.floor(TTL / 1000)}`,
    ].join("; ")
  );

  return res.json({
    authorized: true,
    method: "legacy_bot_key",
    expiresAt: new Date(Number(exp)).toISOString(),
  });
}

/* -------------------------------------------------------------------------- */
/* Logout                                                                     */
/* -------------------------------------------------------------------------- */

export function botLogout(_req, res) {
  res.setHeader(
    "Set-Cookie",
    [
      `${COOKIE}=`,
      cookieAttributes(),
      "Max-Age=0",
    ].join("; ")
  );

  return res.json({
    authorized: false,
  });
}

/* -------------------------------------------------------------------------- */
/* Protected bot middleware                                                   */
/* -------------------------------------------------------------------------- */

export async function requireBotAccess(req, res, next) {
  const cookies = parse(req);

  const hasAuthorizationHeader =
    Boolean(req.headers.authorization);

  const hasLegacyCookie =
    Boolean(cookies[COOKIE]);

  console.log("[BOT AUTH CHECK]", {
    path: req.originalUrl,
    requestMethod: req.method,
    hasAuthorizationHeader,
    authorizationScheme: hasAuthorizationHeader
      ? String(req.headers.authorization).split(" ")[0]
      : null,
    hasLegacyCookie,
    userAgent: String(
      req.headers["user-agent"] || ""
    ).slice(0, 120),
  });

  /* ---------------------------------------------------------------------- */
  /* Primary authentication: Supabase                                      */
  /* ---------------------------------------------------------------------- */

  const user = await getSupabaseUser(req);

  if (user) {
    console.log("[BOT AUTH SUCCESS]", {
      path: req.originalUrl,
      authMethod: "supabase",
      userId: user.id,
    });

    req.botUser = user;
    req.botAuthMethod = "supabase";

    return next();
  }

  /* ---------------------------------------------------------------------- */
  /* Compatibility authentication: old bot access cookie                   */
  /* ---------------------------------------------------------------------- */

  if (valid(cookies[COOKIE])) {
    console.log("[BOT AUTH SUCCESS]", {
      path: req.originalUrl,
      authMethod: "legacy_bot_key",
    });

    req.botAuthMethod = "legacy_bot_key";

    return next();
  }

  /* ---------------------------------------------------------------------- */
  /* Authentication failed                                                 */
  /* ---------------------------------------------------------------------- */

  console.warn("[BOT AUTH FAILED]", {
    path: req.originalUrl,
    requestMethod: req.method,
    hasAuthorizationHeader,
    hasLegacyCookie,
  });

  return res.status(401).json({
    error: "BOT_AUTH_REQUIRED",
  });
}

/* -------------------------------------------------------------------------- */
/* Authentication status                                                     */
/* -------------------------------------------------------------------------- */

export async function botAuthStatus(req, res) {
  const cookies = parse(req);

  const hasAuthorizationHeader =
    Boolean(req.headers.authorization);

  console.log("[BOT AUTH STATUS]", {
    path: req.originalUrl,
    hasAuthorizationHeader,
    authorizationScheme: hasAuthorizationHeader
      ? String(req.headers.authorization).split(" ")[0]
      : null,
    hasLegacyCookie: Boolean(cookies[COOKIE]),
  });

  /* Supabase session */
  const user = await getSupabaseUser(req);

  if (user) {
    console.log("[BOT AUTH STATUS SUCCESS]", {
      authMethod: "supabase",
      userId: user.id,
    });

    return res.json({
      authorized: true,
      method: "supabase",
      userId: user.id,
    });
  }

  /* Legacy cookie */
  const authorized = valid(cookies[COOKIE]);

  if (authorized) {
    console.log("[BOT AUTH STATUS SUCCESS]", {
      authMethod: "legacy_bot_key",
    });
  } else {
    console.warn("[BOT AUTH STATUS FAILED]", {
      hasAuthorizationHeader,
      hasLegacyCookie: Boolean(cookies[COOKIE]),
    });
  }

  return res.json({
    authorized,
    method: authorized
      ? "legacy_bot_key"
      : null,
  });
}