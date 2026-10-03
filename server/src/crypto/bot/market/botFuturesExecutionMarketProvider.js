/**
 * Fresh Coinbase market evidence for Top-10 research candidates.
 * Legacy filename retained for import compatibility. Evidence only; no orders.
 */
import BOT_CONFIG from "../config/botConfig.js";
import { getCoinbaseCandles, getCoinbaseProduct, getCoinbaseProductBook } from "../../data/providers/coinbaseProvider.js";
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};

function candles(rows=[]){
  return rows.map(c=>{const start=num(c?.start),close=num(c?.close),volume=num(c?.volume);return {
    openTime:start!==null?start*1000:null,open:num(c?.open),high:num(c?.high),low:num(c?.low),close,volume,
    closeTime:start!==null?start*1000:null,quoteVolume:close!==null&&volume!==null?close*volume:null
  }}).filter(x=>x.open>0&&x.high>0&&x.low>0&&x.close>0).sort((a,b)=>a.openTime-b.openTime);
}
function depth(result){
  const book=result?.pricebook??result??{};
  const map=rows=>(rows||[]).map(x=>({price:num(Array.isArray(x)?x[0]:x?.price),qty:num(Array.isArray(x)?x[1]:(x?.size??x?.qty))})).filter(x=>x.price>0&&x.qty>0);
  const bids=map(book?.bids),asks=map(book?.asks);
  const bidNotional=bids.reduce((s,x)=>s+x.price*x.qty,0),askNotional=asks.reduce((s,x)=>s+x.price*x.qty,0);
  return {bids,asks,bidNotional,askNotional,totalNotional:bidNotional+askNotional};
}
function slippage(levels,side,notional){
  let remaining=notional,qty=0,cost=0;
  for(const x of levels){const levelNotional=x.price*x.qty,take=Math.min(remaining,levelNotional);if(take<=0)continue;qty+=take/x.price;cost+=take;remaining-=take;if(remaining<=1e-8)break;}
  if(remaining>1e-6||qty<=0)return {available:false,percent:null,filledNotional:cost};
  const avg=cost/qty,best=levels[0]?.price,pct=best>0?(side==="BUY"?(avg-best)/best:(best-avg)/best)*100:null;
  return {available:Number.isFinite(pct),percent:pct,averagePrice:avg,filledNotional:cost};
}
function atr(cs,period){if(cs.length<period+1)return null;const trs=[];for(let i=1;i<cs.length;i++){const c=cs[i],prev=cs[i-1];trs.push(Math.max(c.high-c.low,Math.abs(c.high-prev.close),Math.abs(c.low-prev.close)));}const x=trs.slice(-period);return x.length===period?x.reduce((a,b)=>a+b,0)/period:null;}

export async function getBotFuturesExecutionMarket(candidate,options={}){
  const cfg={...BOT_CONFIG.setup,...options},productId=candidate?.asset?.productId??candidate?.symbol;
  if(!productId)throw new Error("BOT_EXECUTION_SYMBOL_REQUIRED");
  const [product,rawDepth,rawCandles]=await Promise.all([
    getCoinbaseProduct(productId,{timeoutMs:cfg.timeoutMs}),
    getCoinbaseProductBook(productId,{limit:cfg.depthLimit,timeoutMs:cfg.timeoutMs}),
    getCoinbaseCandles(productId,{interval:cfg.candleInterval,limit:cfg.candleLimit,timeoutMs:cfg.timeoutMs}),
  ]);
  const p=product?.product??product,d=depth(rawDepth),cs=candles(rawCandles);
  const bid=d.bids[0]?.price??num(p?.best_bid),ask=d.asks[0]?.price??num(p?.best_ask),last=num(p?.price);
  const mark=last??(bid>0&&ask>0?(bid+ask)/2:null),mid=bid>0&&ask>0?(bid+ask)/2:mark;
  const spreadPercent=mid>0&&bid>0&&ask>0?((ask-bid)/mid)*100:null;
  const completed=cs.filter(x=>x.openTime<=Date.now());
  const a=atr(completed,cfg.atrPeriod),look=completed.slice(-cfg.structureLookback);
  const support=look.length?Math.min(...look.map(x=>x.low)):null,resistance=look.length?Math.max(...look.map(x=>x.high)):null;
  const latestOpenTime=completed.at(-1)?.openTime||null;
  // Coinbase candle objects identify bucket start; allow one interval plus configured freshness.
  const ageMs=latestOpenTime?Date.now()-latestOpenTime:null;
  const buySlip=slippage(d.asks,"BUY",cfg.slippageNotionalUsd),sellSlip=slippage(d.bids,"SELL",cfg.slippageNotionalUsd);
  const blockers=[];
  if(!(mark>0&&bid>0&&ask>0))blockers.push("INVALID_MARKET_PRICES");
  if(!(spreadPercent>=0))blockers.push("MISSING_SPREAD");
  if(!(d.totalNotional>0))blockers.push("MISSING_DEPTH");
  if(!(a>0))blockers.push("MISSING_ATR");
  if(!(support>0&&resistance>support))blockers.push("INVALID_STRUCTURE");
  const intervalMs={"1m":60000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000}[cfg.candleInterval]||300000;
  if(!(ageMs>=0&&ageMs<=cfg.maximumObservationAgeMs+intervalMs))blockers.push("STALE_CANDLES");
  return {approved:blockers.length===0,status:blockers.length?"RESEARCH_MARKET_EVIDENCE_BLOCKED":"RESEARCH_MARKET_EVIDENCE_READY",
    symbol:candidate?.symbol??productId,productId,markPrice:mark,bid,ask,spreadPercent,depth:d,atr:a,support,resistance,
    slippage:{buy:buySlip,sell:sellSlip,notionalUsd:cfg.slippageNotionalUsd},freshness:{latestCloseTime:latestOpenTime,ageMs,maximumAgeMs:cfg.maximumObservationAgeMs+intervalMs},
    candles:completed,blockers,observedAt:new Date().toISOString(),source:"COINBASE_ADVANCED_PUBLIC",instrumentType:"SPOT",
    executionAuthority:false,liveExecution:false};
}
export default getBotFuturesExecutionMarket;
