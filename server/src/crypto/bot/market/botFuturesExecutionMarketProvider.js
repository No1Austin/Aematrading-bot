/**
 * Phase 3 — fresh execution evidence for a Top-10 candidate.
 * Evidence only. Never submits orders.
 */
import BOT_CONFIG from "../config/botConfig.js";
const BASE_URL=process.env.AEMA_BOT_BINANCE_FUTURES_BASE_URL||"https://fapi.binance.com";
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};

async function getJson(path,timeoutMs){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const r=await fetch(`${BASE_URL}${path}`,{signal:c.signal,headers:{Accept:"application/json"}});
    if(!r.ok) throw new Error(`BINANCE_HTTP_${r.status}:${path}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
function candles(rows=[]){
  return rows.map(k=>({openTime:num(k[0]),open:num(k[1]),high:num(k[2]),low:num(k[3]),
    close:num(k[4]),volume:num(k[5]),closeTime:num(k[6]),quoteVolume:num(k[7])}))
    .filter(x=>x.open>0&&x.high>0&&x.low>0&&x.close>0);
}
function depth(rows){
  const bids=(rows?.bids||[]).map(([p,q])=>({price:num(p),qty:num(q)})).filter(x=>x.price>0&&x.qty>0);
  const asks=(rows?.asks||[]).map(([p,q])=>({price:num(p),qty:num(q)})).filter(x=>x.price>0&&x.qty>0);
  const bidNotional=bids.reduce((s,x)=>s+x.price*x.qty,0);
  const askNotional=asks.reduce((s,x)=>s+x.price*x.qty,0);
  return {bids,asks,bidNotional,askNotional,totalNotional:bidNotional+askNotional};
}
function slippage(levels,side,notional){
  let remaining=notional, qty=0, cost=0;
  for(const x of levels){
    const levelNotional=x.price*x.qty;
    const take=Math.min(remaining,levelNotional);
    if(take<=0) continue;
    qty+=take/x.price; cost+=take; remaining-=take;
    if(remaining<=1e-8) break;
  }
  if(remaining>1e-6||qty<=0) return {available:false,percent:null,filledNotional:cost};
  const avg=cost/qty, best=levels[0]?.price;
  const pct=best>0 ? (side==="BUY" ? (avg-best)/best : (best-avg)/best)*100 : null;
  return {available:Number.isFinite(pct),percent:pct,averagePrice:avg,filledNotional:cost};
}
function atr(cs,period){
  if(cs.length<period+1) return null;
  const trs=[];
  for(let i=1;i<cs.length;i++){
    const c=cs[i],prev=cs[i-1];
    trs.push(Math.max(c.high-c.low,Math.abs(c.high-prev.close),Math.abs(c.low-prev.close)));
  }
  const x=trs.slice(-period); return x.length===period?x.reduce((a,b)=>a+b,0)/period:null;
}

export async function getBotFuturesExecutionMarket(candidate,options={}){
  const cfg={...BOT_CONFIG.setup,...options}, symbol=candidate?.symbol;
  if(!symbol) throw new Error("BOT_EXECUTION_SYMBOL_REQUIRED");
  const [premium,book,rawDepth,rawCandles]=await Promise.all([
    getJson(`/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`,cfg.timeoutMs),
    getJson(`/fapi/v1/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`,cfg.timeoutMs),
    getJson(`/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${cfg.depthLimit}`,cfg.timeoutMs),
    getJson(`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${cfg.candleInterval}&limit=${cfg.candleLimit}`,cfg.timeoutMs),
  ]);
  const mark=num(premium?.markPrice), bid=num(book?.bidPrice), ask=num(book?.askPrice);
  const mid=bid>0&&ask>0?(bid+ask)/2:mark;
  const spreadPercent=mid>0&&bid>0&&ask>0?((ask-bid)/mid)*100:null;
  const d=depth(rawDepth), cs=candles(rawCandles);
  const completed=cs.filter(x=>x.closeTime<=Date.now());
  const a=atr(completed,cfg.atrPeriod);
  const look=completed.slice(-cfg.structureLookback);
  const support=look.length?Math.min(...look.map(x=>x.low)):null;
  const resistance=look.length?Math.max(...look.map(x=>x.high)):null;
  const latestCloseTime=completed.at(-1)?.closeTime||null;
  const ageMs=latestCloseTime?Date.now()-latestCloseTime:null;
  const buySlip=slippage(d.asks,"BUY",cfg.slippageNotionalUsd);
  const sellSlip=slippage(d.bids,"SELL",cfg.slippageNotionalUsd);

  const blockers=[];
  if(!(mark>0&&bid>0&&ask>0)) blockers.push("INVALID_MARKET_PRICES");
  if(!(spreadPercent>=0)) blockers.push("MISSING_SPREAD");
  if(!(d.totalNotional>0)) blockers.push("MISSING_DEPTH");
  if(!(a>0)) blockers.push("MISSING_ATR");
  if(!(support>0&&resistance>support)) blockers.push("INVALID_STRUCTURE");
  if(!(ageMs>=0&&ageMs<=cfg.maximumObservationAgeMs)) blockers.push("STALE_CANDLES");

  return {approved:blockers.length===0,status:blockers.length?"EXECUTION_EVIDENCE_BLOCKED":"EXECUTION_EVIDENCE_READY",
    symbol,markPrice:mark,bid,ask,spreadPercent,depth:d,atr:a,support,resistance,
    slippage:{buy:buySlip,sell:sellSlip,notionalUsd:cfg.slippageNotionalUsd},
    freshness:{latestCloseTime,ageMs,maximumAgeMs:cfg.maximumObservationAgeMs},
    candles:completed,blockers,observedAt:new Date().toISOString(),
    executionAuthority:false,liveExecution:false};
}
export default getBotFuturesExecutionMarket;
