// AEMA V2: deterministic research only; no trading authority.
const num=x=>Number(x);
const avg=a=>a.reduce((s,v)=>s+v,0)/a.length;
const ema=(values,n)=>{let e=avg(values.slice(0,n)); for(const v of values.slice(n))e=e+(v-e)*2/(n+1);return e};
export function analyze({market,symbol,candles}) {
  if(!['crypto','stocks'].includes(market))throw Error('INVALID_MARKET');
  if(!/^[A-Z0-9_./-]{2,24}$/.test(symbol||''))throw Error('INVALID_SYMBOL');
  if(!Array.isArray(candles)||candles.length<50)throw Error('INSUFFICIENT_CANDLES_50_REQUIRED');
  const c=candles.map(x=>({time:Number(x.time),open:num(x.open),high:num(x.high),low:num(x.low),close:num(x.close),volume:num(x.volume)}));
  if(c.some((x,i)=>Object.values(x).some(v=>!Number.isFinite(v))||x.low<=0||x.high<x.low||x.high<Math.max(x.open,x.close)||x.low>Math.min(x.open,x.close)||x.volume<0||(i&&x.time<=c[i-1].time)))throw Error('INVALID_OR_UNSORTED_CANDLES');
  const closes=c.map(x=>x.close), last=c.at(-1), e9=ema(closes,9),e21=ema(closes,21);
  const trs=c.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-c[i].close),Math.abs(x.low-c[i].close)));
  const atr=avg(trs.slice(-14));const recent=c.slice(-21,-1),hi=Math.max(...recent.map(x=>x.high)),lo=Math.min(...recent.map(x=>x.low));
  const direction=e9>e21&&last.close>e21?'BULL':e9<e21&&last.close<e21?'BEAR':'NEUTRAL';
  const indicators={ema9:e9,ema21:e21,atr14:atr,swingHigh20:hi,swingLow20:lo,lastClose:last.close};
  const base={market,symbol,interval:'15m',asOf:last.time,indicators,direction,executionAuthority:false,liveExecution:false,researchOnly:true};
  if(direction==='NEUTRAL')return {...base,status:'NO_TRADE',reason:'TREND_NOT_ALIGNED'};
  const bull=direction==='BULL';
  const pullback=bull?last.low<=e9&&last.close>e9:last.high>=e9&&last.close<e9;
  const breakout=bull?last.close>hi:last.close<lo;
  const strategy=breakout?'BREAKOUT':pullback?'TREND_PULLBACK':null;
  if(!strategy)return {...base,status:'NO_TRADE',reason:'NO_CONFIRMED_PATTERN'};
  const entry=last.close;
  const stop=bull?Math.min(lo,last.low)-atr*.2:Math.max(hi,last.high)+atr*.2;
  const risk=Math.abs(entry-stop);
  if(risk<=0||risk/entry>.05)return {...base,status:'NO_TRADE',reason:'INVALID_OR_EXCESSIVE_STOP_DISTANCE',strategy};
  const target=bull?entry+2*risk:entry-2*risk;
  if(target<=0)return {...base,status:'NO_TRADE',reason:'INVALID_TARGET',strategy};
  return {...base,status:'CANDIDATE_UNVALIDATED',strategy,entry,stop,target,riskReward:2,reason:'REQUIRES_FEES_SLIPPAGE_LIQUIDITY_AND_OUT_OF_SAMPLE_VALIDATION'};
}
