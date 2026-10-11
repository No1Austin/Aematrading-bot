import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const COOKIE = "aema_bot_access";
const TTL = 8 * 60 * 60 * 1000;

const secret = () => process.env.AEMA_BOT_AUTH_SECRET || process.env.AEMA_BOT_ACCESS_KEY || "";
const sign = (value) => crypto.createHmac("sha256", secret()).update(value).digest("hex");

const parse = (req) => Object.fromEntries(
  String(req.headers.cookie || "").split(";").map((x) => x.trim()).filter(Boolean).map((x) => {
    const i = x.indexOf("=");
    return i < 0 ? [x, ""] : [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
  })
);

const valid = (token) => {
  if (!token || !secret()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const expected = sign(exp);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
};

let supabaseAuthClient = null;
function getSupabaseAuthClient() {
  if (supabaseAuthClient) return supabaseAuthClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabaseAuthClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return supabaseAuthClient;
}

function bearer(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function getSupabaseUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const client = getSupabaseAuthClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

const cookieAttributes = () => process.env.NODE_ENV === "production"
  ? ["HttpOnly", "Secure", "SameSite=None", "Path=/api/crypto/bot"].join("; ")
  : ["HttpOnly", "SameSite=Lax", "Path=/api/crypto/bot"].join("; ");

export function botLogin(req, res) {
  const configured = process.env.AEMA_BOT_ACCESS_KEY;
  if (!configured) return res.status(503).json({ error: "BOT_ACCESS_NOT_CONFIGURED" });
  const supplied = String(req.body?.accessKey || "");
  const a = Buffer.from(supplied), b = Buffer.from(configured);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "BOT_ACCESS_DENIED" });
  }
  const exp = String(Date.now() + TTL);
  const token = `${exp}.${sign(exp)}`;
  res.setHeader("Set-Cookie", [`${COOKIE}=${encodeURIComponent(token)}`, cookieAttributes(), `Max-Age=${Math.floor(TTL / 1000)}`].join("; "));
  return res.json({ authorized: true, method: "legacy_bot_key", expiresAt: new Date(Number(exp)).toISOString() });
}

export function botLogout(_req, res) {
  res.setHeader("Set-Cookie", [`${COOKIE}=`, cookieAttributes(), "Max-Age=0"].join("; "));
  return res.json({ authorized: false });
}

export async function requireBotAccess(req, res, next) {
  // Primary path: the same Supabase session used by the AEMA application.
  const user = await getSupabaseUser(req);
  if (user) {
    req.botUser = user;
    req.botAuthMethod = "supabase";
    return next();
  }

  // Compatibility path: preserve the existing private bot access-key cookie.
  const cookies = parse(req);
  if (valid(cookies[COOKIE])) {
    req.botAuthMethod = "legacy_bot_key";
    return next();
  }

  return res.status(401).json({ error: "BOT_AUTH_REQUIRED" });
}

export async function botAuthStatus(req, res) {
  const user = await getSupabaseUser(req);
  if (user) {
    return res.json({ authorized: true, method: "supabase", userId: user.id });
  }
  const cookies = parse(req);
  const authorized = valid(cookies[COOKIE]);
  return res.json({ authorized, method: authorized ? "legacy_bot_key" : null });
}
