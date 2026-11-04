import crypto from "node:crypto";

const COOKIE = "aema_bot_access";
const SESSION_HEADER = "x-aema-bot-session";
const TTL = 8 * 60 * 60 * 1000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const secret = () => process.env.AEMA_BOT_AUTH_SECRET || "";
const key = () => process.env.AEMA_BOT_ACCESS_KEY || "";
const owner = () => process.env.AEMA_BOT_OWNER_ID || "";
const configured = () => {
  const checks = {
    accessKeyValid: key().length >= 12,
    secretValid: secret().length >= 32,
    ownerValid: uuid.test(owner()),
  };

  const isConfigured = Object.values(checks).every(Boolean);

  if (!isConfigured) {
    console.error("[AEMA_BOT_AUTH_CONFIG]", checks);
  }

  return isConfigured;
};
const sign = value => crypto.createHmac("sha256", secret()).update(value).digest("hex");
const equal = (a,b) => {const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length && crypto.timingSafeEqual(x,y);};
function cookies(req) {
  const result={};
  for(const part of String(req.headers.cookie||"").split(";")) {
    const i=part.indexOf("="); if(i<0)continue;
    try {result[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());}catch{}
  }
  return result;
}
function valid(token) {
  if(!configured() || !token)return false;
  const parts=String(token).split(".");if(parts.length!==3)return false;
  const [exp,principal,signature]=parts;
  if(!/^\d+$/.test(exp)||principal!==owner())return false;
  const timestamp=Number(exp);
  if(!Number.isSafeInteger(timestamp)||timestamp<=Date.now()||timestamp>Date.now()+TTL)return false;
  return equal(signature,sign(`${exp}.${principal}`));
}
function cookieAttributes() {
  return ["HttpOnly",process.env.NODE_ENV==="production"?"Secure":"", "SameSite=Lax", "Path=/api/crypto/bot"].filter(Boolean).join("; ");
}
function session(req){const header=req.headers[SESSION_HEADER];return valid(header)||valid(cookies(req)[COOKIE]);}
export function botLogin(req,res) {
  res.set("Cache-Control","no-store");
  if(!configured())return res.status(503).json({error:"BOT_ACCESS_NOT_CONFIGURED"});
  if(!equal(req.body?.accessKey??"",key()))return res.status(401).json({error:"BOT_ACCESS_DENIED"});
  const exp=String(Date.now()+TTL);
  const token=`${exp}.${owner()}.${sign(`${exp}.${owner()}`)}`;
  res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes()}; Max-Age=${TTL/1000}`);
  return res.json({authorized:true,method:"bot_key",sessionToken:token,expiresAt:new Date(Number(exp)).toISOString()});
}
export function botLogout(_req,res){res.set("Cache-Control","no-store");res.setHeader("Set-Cookie",`${COOKIE}=; ${cookieAttributes()}; Max-Age=0`);return res.json({authorized:false});}
export function requireBotAccess(req,res,next){
  if(!configured())return res.status(503).json({error:"BOT_ACCESS_NOT_CONFIGURED"});
  if(!session(req))return res.status(401).json({error:"BOT_AUTH_REQUIRED",requiresBotUnlock:true});
  req.botUser={id:owner()};req.botUserId=owner();req.botAuthMethod="bot_key";
  return next();
}
export function botAuthStatus(req,res){res.set("Cache-Control","no-store");return res.json({authorized:session(req),method:session(req)?"bot_key":null});}
