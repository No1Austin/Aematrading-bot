/** Normalize and select only fully closed OHLC candles; never synthesize bars. */
export const INTERVAL_MS = Object.freeze({'1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000});
export function candleTimestampMs(value) {
  if(value == null || value === '') return NaN;
  if(typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return Date.parse(value);
  const n=Number(value);
  return Number.isFinite(n) ? (n < 1e11 ? n*1000 : n) : NaN;
}
export function prepareArchiveCandles(market,{interval='5m',capturedAtMs=Date.now(),minimumCandles=30}={}) {
  const duration=INTERVAL_MS[interval];
  if(!duration) return {ok:false,errors:['UNSUPPORTED_INTERVAL']};
  if(!Array.isArray(market?.candles)) return {ok:false,errors:['MISSING_CANDLES']};
  const times=market.candles.map(c=>candleTimestampMs(c?.openTime ?? c?.time ?? c?.timestamp ?? c?.t));
  if(times.some(t=>!Number.isFinite(t))) return {ok:false,errors:['INVALID_CANDLE_TIMESTAMP']};
  if(times.some(t=>t%duration!==0)) return {ok:false,errors:['INTERVAL_MISMATCH']};
  const pairs=market.candles.map((c,i)=>({c,t:times[i]})).sort((a,b)=>a.t-b.t);
  const closed=pairs.filter(p=>p.t+duration<=capturedAtMs);
  if(closed.length<minimumCandles) return {ok:false,errors:['INSUFFICIENT_CLOSED_CANDLES'],closedCount:closed.length,excludedOpenCandles:pairs.length-closed.length};
  if(closed.some((p,i)=>i && p.t-closed[i-1].t!==duration)) return {ok:false,errors:['CANDLE_GAP_OR_DUPLICATE']};
  const decisionMs=closed.at(-1).t+duration;
  if(decisionMs>capturedAtMs) return {ok:false,errors:['INVALID_OR_FUTURE_DECISION_TIME']};
  return {ok:true,candles:closed.map(p=>p.c),decisionMs,excludedOpenCandles:pairs.length-closed.length};
}
