/** EMA Quant V1: point-in-time features, research-only. No future candles. */
const finite = x => (x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x)) ? Number(x) : null);
const round = x => Number.isFinite(x) ? Number(x.toFixed(8)) : null;
function mean(xs) { return xs.reduce((a,b)=>a+b,0)/xs.length; }
function std(xs) { const m=mean(xs); return Math.sqrt(mean(xs.map(x=>(x-m)**2))); }
export function buildQuantFeatures(evidence, { asOf = null, minCandles = 24, maxObservationAgeMs = 420000 } = {}) {
  const observed = Date.parse(evidence?.observedAt ?? '');
  const cutoff = asOf === null ? (Number.isFinite(observed) ? observed : Date.now()) : Number(asOf);
  const errors=[];
  if (!Number.isFinite(cutoff)) errors.push('INVALID_AS_OF');
  if (!Number.isFinite(observed)) errors.push('MISSING_OBSERVATION_TIMESTAMP');
  if (Number.isFinite(observed) && Number.isFinite(cutoff) && observed > cutoff + 1000) errors.push('OBSERVATION_AFTER_AS_OF');
  if (Number.isFinite(observed) && Number.isFinite(cutoff) && cutoff-observed > maxObservationAgeMs) errors.push('STALE_OBSERVATION');
  const raw = Array.isArray(evidence?.candles) ? evidence.candles : [];
  const candles = raw.map(c=>({time:finite(c.estimatedCloseTime),open:finite(c.open),high:finite(c.high),low:finite(c.low),close:finite(c.close),volume:finite(c.volume)}))
    .filter(c=>c.time !== null && c.time <= cutoff && [c.open,c.high,c.low,c.close,c.volume].every(x=>x!==null && x>=0) && c.high>=Math.max(c.open,c.close,c.low) && c.low<=Math.min(c.open,c.close,c.high))
    .sort((a,b)=>a.time-b.time);
  const dedup=[];
  for(const c of candles){ if(dedup.length && dedup[dedup.length-1].time===c.time) dedup[dedup.length-1]=c; else dedup.push(c); }
  if(dedup.length < minCandles) errors.push('INSUFFICIENT_CLOSED_CANDLES');
  const latest=dedup.at(-1), previous=dedup.at(-2);
  const closes=dedup.map(c=>c.close);
  const logReturns=[];
  for(let i=1;i<closes.length;i++) if(closes[i]>0 && closes[i-1]>0) logReturns.push(Math.log(closes[i]/closes[i-1]));
  const recent=dedup.slice(-20);
  const trueRanges=dedup.slice(1).map((c,i)=>Math.max(c.high-c.low,Math.abs(c.high-dedup[i].close),Math.abs(c.low-dedup[i].close)));
  const volHistory=dedup.slice(-21,-1).map(c=>c.volume);
  const typical=recent.map(c=>({pv:((c.high+c.low+c.close)/3)*c.volume,v:c.volume}));
  const volumeSum=typical.reduce((a,b)=>a+b.v,0);
  const depth=evidence?.depth;
  const bids=Array.isArray(depth?.bids)?depth.bids.slice(0,10):[];
  const asks=Array.isArray(depth?.asks)?depth.asks.slice(0,10):[];
  const bidSize=bids.reduce((a,b)=>a+(finite(b.qty)??0),0), askSize=asks.reduce((a,b)=>a+(finite(b.qty)??0),0);
  const bid=finite(bids[0]?.price), ask=finite(asks[0]?.price);
  const features={
    close:latest?.close??null,
    roc5:closes.length>=6 && closes.at(-6)>0 ? round(closes.at(-1)/closes.at(-6)-1):null,
    roc15:closes.length>=16 && closes.at(-16)>0 ? round(closes.at(-1)/closes.at(-16)-1):null,
    realizedVol20:logReturns.length>=20 ? round(std(logReturns.slice(-20))):null,
    atr14:trueRanges.length>=14 ? round(mean(trueRanges.slice(-14))):null,
    relativeVolume20:volHistory.length===20 && mean(volHistory)>0 ? round(latest.volume/mean(volHistory)):null,
    vwap20:volumeSum>0 ? round(typical.reduce((a,b)=>a+b.pv,0)/volumeSum):null,
    orderBookImbalance:bidSize+askSize>0 ? round((bidSize-askSize)/(bidSize+askSize)):null,
    spreadBps:bid!==null && ask!==null && ask>=bid && (ask+bid)>0 ? round(20000*(ask-bid)/(ask+bid)):null,
    fundingRate:finite(evidence?.fundingRate),
    openInterest:finite(evidence?.openInterest),
    openInterestChange:finite(evidence?.openInterestChange),
  };
  if(features.close===null || features.close<=0) errors.push('INVALID_LAST_CLOSED_PRICE');
  return {schemaVersion:'ema-quant-features-v1',symbol:evidence?.symbol??null,source:evidence?.source??null,asOf:new Date(Number.isFinite(cutoff)?cutoff:0).toISOString(),lastClosedCandleAt:latest?new Date(latest.time).toISOString():null,candleCount:dedup.length,ready:errors.length===0,blockers:errors,features};
}
export default buildQuantFeatures;
