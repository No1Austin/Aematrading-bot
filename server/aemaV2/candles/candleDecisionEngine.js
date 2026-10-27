/** AEMA V2: independent, research-only multi-timeframe decision engine. */
const MS = {"5m":300000,"15m":900000,"1h":3600000};
const finite = n => typeof n === "number" && Number.isFinite(n);
const unavailable = (reason, diagnostics={}) => ({status:"NO_SETUP",direction:null,reason,diagnostics,researchOnly:true,executionAuthority:false,liveExecution:false});
function normalize(rows, interval, now) {
  if (!Array.isArray(rows)) throw Error("CANDLES_REQUIRED");
  const duration=MS[interval], out=[];
  for (const c of rows) {
    const raw=c?.openTime ?? c?.timestamp ?? c?.time ?? c?.t;
    let t=typeof raw==='string' ? Date.parse(raw) : Number(raw);
    if (finite(t) && t < 1e11) t*=1000;
    const o=Number(c?.open),h=Number(c?.high),l=Number(c?.low),cl=Number(c?.close);
    if (![t,o,h,l,cl].every(finite) || o<=0 || h<Math.max(o,cl) || l>Math.min(o,cl) || l<=0 || t%duration!==0) throw Error("INVALID_"+interval+"_CANDLE");
    if (t+duration>now) continue; // never use a still-open candle
    out.push({t,open:o,high:h,low:l,close:cl});
  }
  out.sort((a,b)=>a.t-b.t);
  if (out.some((c,i)=>i>0 && c.t===out[i-1].t)) throw Error("DUPLICATE_CANDLES");
  if (out.some((c,i)=>i>0 && c.t-out[i-1].t!==duration)) throw Error("CANDLE_GAP");
  if (out.length && now-out.at(-1).t>duration*2) throw Error("STALE_CANDLES");
  return out;
}
function ema(values,n){if(values.length<n)return null;let v=values.slice(0,n).reduce((a,b)=>a+b,0)/n;const k=2/(n+1);for(let i=n;i<values.length;i++)v=values[i]*k+v*(1-k);return v;}
function atr(c,n=14){if(c.length<n+1)return null;const tr=c.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-c[i].close),Math.abs(x.low-c[i].close)));return tr.slice(-n).reduce((a,b)=>a+b,0)/n;}
function classify(c){if(c.length<35)return {direction:null,reason:"INSUFFICIENT_CANDLES"};const closes=c.map(x=>x.close), fast=ema(closes,9),slow=ema(closes,21),vol=atr(c),last=c.at(-1).close,prev=c.at(-5).close;const slope=(last-prev)/vol;const spread=(fast-slow)/vol;const bullish=spread>0.15&&slope>0.35&&last>slow;const bearish=spread< -0.15&&slope< -0.35&&last<slow;return {direction:bullish?"BULL":bearish?"BEAR":null,reason:bullish||bearish?"TREND_AND_MOMENTUM_AGREE":"MIXED_OR_WEAK_MOMENTUM",ema9:fast,ema21:slow,atr:vol,normalizedMomentum:slope,normalizedEmaSpread:spread,close:last};}
export function evaluateV2CandleDecision({candles15m,candles5m,candles1h,asOf=Date.now()}={}) {
  if (!finite(asOf)) return unavailable("INVALID_AS_OF");
  let c15,c5,c1;
  try {c15=normalize(candles15m,"15m",asOf);c5=normalize(candles5m,"5m",asOf);c1=normalize(candles1h,"1h",asOf);}catch(e){return unavailable(e.message);}
  const primary=classify(c15),entry=classify(c5),context=classify(c1);
  const diagnostics={timeframes:{primary:"15m",entry:"5m",context:"1h"},candleCounts:{"15m":c15.length,"5m":c5.length,"1h":c1.length},primary,entry,context,contextAdvisoryOnly:true};
  if(!primary.direction)return unavailable("NO_15M_DIRECTION",diagnostics);
  if(!entry.direction)return unavailable("NO_5M_ENTRY_CONFIRMATION",diagnostics);
  if(primary.direction!==entry.direction)return unavailable("15M_5M_DIRECTION_CONFLICT",diagnostics);
  // Stop at invalidation beyond recent 15m structure with an ATR buffer.
  const recent=c15.slice(-20),buffer=primary.atr*0.2;
  const stop=primary.direction==="BULL"?Math.min(...recent.map(x=>x.low))-buffer:Math.max(...recent.map(x=>x.high))+buffer;
  const proposedEntry=primary.close;
  const risk=Math.abs(proposedEntry-stop);
  if(!(risk>0) || (primary.direction==="BULL"&&stop>=proposedEntry) || (primary.direction==="BEAR"&&stop<=proposedEntry))return unavailable("INVALID_STOP_GEOMETRY",diagnostics);
  const target=primary.direction==="BULL"?proposedEntry+2*risk:proposedEntry-2*risk;
  if(target<=0)return unavailable("INVALID_TARGET_GEOMETRY",diagnostics);
  return {status:"RESEARCH_CANDIDATE",direction:primary.direction,reason:"15M_DIRECTION_CONFIRMED_BY_5M",entryReference:proposedEntry,stopReference:stop,targetIllustration:target,nominalRiskReward:2,requiresCostAndLiquidityValidation:true,requiresEntryPriceValidation:true,diagnostics,researchOnly:true,executionAuthority:false,liveExecution:false};
}
export default evaluateV2CandleDecision;
