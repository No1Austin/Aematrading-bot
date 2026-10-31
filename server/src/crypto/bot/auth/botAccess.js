import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const COOKIE = "aema_bot_access";
const TTL = 8 * 60 * 60 * 1000;

const secret = () => process.env.AEMA_BOT_AUTH_SECRET || process.env.AEMA_BOT_ACCESS_KEY || "";
const sign = (value) => crypto.createHmac("sha256", secret()).update(value).digest("hex");

function parseCookies(req) {
  const cookies = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    try { cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
    catch { /* malformed cookie is ignored */ }
  }
  return cookies;
}

function valid(token) {
  if (!token || !secret()) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3) return false;
  const [exp, userId, sig] = parts;
  if (!/^\d+$/.test(exp) || !/^[0-9a-f-]{36}$/i.test(userId)) return false;
  const expiresAt = Number(exp);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + TTL) return false;
  const expected = sign(`${exp}.${userId}`);
  if (sig.length !== expected.length) return false;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch { return false; }
  return userId;
}

const cookieAttributes = () => [
  "HttpOnly",
  ...(process.env.NODE_ENV === "production" ? ["Secure", "SameSite=None"] : ["SameSite=Lax"]),
  "Path=/api/crypto/bot",
].join("; ");

let authClient;
function getAuthClient() {
  if (authClient) return authClient;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  authClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return authClient;
}

async function getSupabaseUser(req) {
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const client = getAuthClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.getUser(match[1].trim());
    return error ? null : data?.user || null;
  } catch { return null; }
}

export async function botLogin(req, res) {
  const configured = process.env.AEMA_BOT_ACCESS_KEY;
  if (!configured || !secret()) return res.status(503).json({ error: "BOT_ACCESS_NOT_CONFIGURED" });
  const user = await getSupabaseUser(req);
  if (!user) return res.status(403).json({ error: "SUPABASE_USER_REQUIRED" });
  const supplied = String(req.body?.accessKey || "");
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "BOT_ACCESS_DENIED" });
  }
  const exp = String(Date.now() + TTL);
  const token = `${exp}.${user.id}.${sign(`${exp}.${user.id}`)}`;
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes()}; Max-Age=${Math.floor(TTL / 1000)}`);
  return res.json({ authorized: true, method: "bot_key_and_supabase", expiresAt: new Date(Number(exp)).toISOString() });
}

export function botLogout(_req, res) {
  res.setHeader("Set-Cookie", `${COOKIE}=; ${cookieAttributes()}; Max-Age=0`);
  return res.json({ authorized: false });
}

export async function requireBotAccess(req, res, next) {
  const user = await getSupabaseUser(req);
  if (!user) return res.status(403).json({ error: "SUPABASE_USER_REQUIRED" });
  const cookieUserId = valid(parseCookies(req)[COOKIE]);
  if (!cookieUserId || cookieUserId !== user.id) {
    return res.status(401).json({ error: "BOT_AUTH_REQUIRED", requiresBotUnlock: true });
  }
  req.botUser = user;
  req.botUserId = user.id;
  req.botAuthMethod = "bot_key_and_supabase";
  return next();
}

export async function botAuthStatus(req, res) {
  const user = await getSupabaseUser(req);
  if (!user) return res.json({ authorized: false, method: null });
  const authorized = valid(parseCookies(req)[COOKIE]) === user.id;
  return res.json({ authorized, method: authorized ? "bot_key_and_supabase" : null });
}
