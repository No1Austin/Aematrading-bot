import crypto from "node:crypto";

const COOKIE = "aema_bot_access";
const TTL = 8 * 60 * 60 * 1000;

const secret = () =>
  process.env.AEMA_BOT_AUTH_SECRET ||
  process.env.AEMA_BOT_ACCESS_KEY ||
  "";

const sign = (value) =>
  crypto
    .createHmac("sha256", secret())
    .update(value)
    .digest("hex");

const parse = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf("=");

        if (i < 0) {
          return [x, ""];
        }

        return [
          x.slice(0, i),
          decodeURIComponent(x.slice(i + 1)),
        ];
      })
  );

const valid = (token) => {
  if (!token || !secret()) {
    return false;
  }

  const [exp, sig] = token.split(".");

  if (
    !exp ||
    !sig ||
    Number(exp) < Date.now()
  ) {
    return false;
  }

  const expected = sign(exp);

  if (sig.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expected)
  );
};


/*
 * Local:
 *   frontend localhost -> backend localhost
 *
 * Production:
 *   Vercel frontend -> Render backend
 *
 * Production therefore requires:
 *   SameSite=None
 *   Secure
 */
const cookieAttributes = () => {
  const production =
    process.env.NODE_ENV === "production";

  if (production) {
    return [
      "HttpOnly",
      "Secure",
      "SameSite=None",
      "Path=/api/crypto/bot",
    ].join("; ");
  }

  return [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/api/crypto/bot",
  ].join("; ");
};


export function botLogin(req, res) {
  const configured =
    process.env.AEMA_BOT_ACCESS_KEY;

  if (!configured) {
    return res.status(503).json({
      error: "BOT_ACCESS_NOT_CONFIGURED",
    });
  }

  const supplied =
    String(req.body?.accessKey || "");

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

  const exp =
    String(Date.now() + TTL);

  const token =
    `${exp}.${sign(exp)}`;

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
    expiresAt:
      new Date(Number(exp)).toISOString(),
  });
}


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


export function requireBotAccess(
  req,
  res,
  next
) {
  const cookies = parse(req);

  if (valid(cookies[COOKIE])) {
    return next();
  }

  return res.status(401).json({
    error: "BOT_AUTH_REQUIRED",
  });
}


export function botAuthStatus(req, res) {
  const cookies = parse(req);

  return res.json({
    authorized:
      valid(cookies[COOKIE]),
  });
}