import crypto from "node:crypto";
const COOKIE="aema_bot_access";const TTL=8*60*60*1000;
const secret=()=>process.env.AEMA_BOT_AUTH_SECRET||process.env.AEMA_BOT_ACCESS_KEY||"";
const sign=v=>crypto.createHmac("sha256",secret()).update(v).digest("hex");
const parse=req=>Object.fromEntries(String(req.headers.cookie||"").split(";").map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf("=");return [x.slice(0,i),decodeURIComponent(x.slice(i+1))]}));
const valid=t=>{if(!t||!secret())return false;const [exp,sig]=t.split(".");if(!exp||!sig||Number(exp)<Date.now())return false;const expected=sign(exp);return sig.length===expected.length&&crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected))};
export function botLogin(req,res){const configured=process.env.AEMA_BOT_ACCESS_KEY;if(!configured)return res.status(503).json({error:"BOT_ACCESS_NOT_CONFIGURED"});
 const supplied=String(req.body?.accessKey||"");const a=Buffer.from(supplied),b=Buffer.from(configured);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return res.status(401).json({error:"BOT_ACCESS_DENIED"});
 const exp=String(Date.now()+TTL),token=`${exp}.${sign(exp)}`;res.setHeader("Set-Cookie",`${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/api/crypto/bot; Max-Age=${TTL/1000}${process.env.NODE_ENV==="production"?"; Secure":""}`);res.json({authorized:true,expiresAt:new Date(Number(exp)).toISOString()});}
export function botLogout(_req,res){res.setHeader("Set-Cookie",`${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/crypto/bot; Max-Age=0`);res.json({authorized:false})}
export function requireBotAccess(req,res,next){if(valid(parse(req)[COOKIE]))return next();return res.status(401).json({error:"BOT_AUTH_REQUIRED"})}
export function botAuthStatus(req,res){res.json({authorized:valid(parse(req)[COOKIE])})}
