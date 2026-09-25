import BOT_CONFIG from "../config/botConfig.js";
const BASE_URL=process.env.AEMA_BOT_BINANCE_FUTURES_BASE_URL||"https://fapi.binance.com";
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};

async function getJson(path,timeoutMs){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const r=await fetch(`${BASE_URL}${path}`,{signal:c.signal,headers:{Accept:"application/json"}});
    if(!r.ok)throw new Error(`BINANCE_HTTP_${r.status}:${path}`);
    return await r.json();
  }finally{clearTimeout(t)}
}
export async function revalidateBotOrder(candidate,options={}){
  const cfg={...BOT_CONFIG.revalidation,...options}, s=candidate?.setup||{}, r=candidate?.riskPlan||{};
  const symbol=candidate?.symbol, blockers=[];
  if(!symbol) blockers.push("SYMBOL_REQUIRED");
  const [premium,book]=await Promise.all([
    getJson(`/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`,cfg.timeoutMs),
    getJson(`/fapi/v1/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`,cfg.timeoutMs),
  ]);
  const mark=num(premium?.markPrice),bid=num(book?.bidPrice),ask=num(book?.askPrice);
  const mid=bid>0&&ask>0?(bid+ask)/2:mark;
  const spread=mid>0&&bid>0&&ask>0?((ask-bid)/mid)*100:null;
  const freshEntry=s.direction==="LONG"?ask:bid;
  const drift=s.entry>0&&freshEntry>0?Math.abs(freshEntry-s.entry)/s.entry*100:null;
  if(!(mark>0&&bid>0&&ask>0&&freshEntry>0)) blockers.push("INVALID_FRESH_PRICE");
  if(!(spread>=0&&spread<=cfg.maximumSpreadPercent)) blockers.push("SPREAD_REVALIDATION_FAILED");
  if(!(drift>=0&&drift<=cfg.maximumEntryDriftPercent)) blockers.push("ENTRY_DRIFT_TOO_LARGE");
  if(s.direction==="LONG"&&!(s.stop<freshEntry&&s.target>freshEntry)) blockers.push("LONG_GEOMETRY_INVALIDATED");
  if(s.direction==="SHORT"&&!(s.stop>freshEntry&&s.target<freshEntry)) blockers.push("SHORT_GEOMETRY_INVALIDATED");
  if(!r.approved) blockers.push("RISK_PLAN_NOT_APPROVED");

  return {...candidate,revalidation:{
    approved:blockers.length===0,status:blockers.length?"REVALIDATION_BLOCKED":"REVALIDATION_READY",
    freshEntry,markPrice:mark,bid,ask,spreadPercent:spread,entryDriftPercent:drift,
    blockers,observedAt:new Date().toISOString(),paperOnly:true,liveExecution:false
  }};
}
export default revalidateBotOrder;
