/** AEMA stock discovery: historical research only; no order or brokerage execution. */
import { getHistoricalBarsBatch } from '../../../data/providers/alpacaHistoricalDataService.js';

const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const TIMEFRAMES = new Set(['1Min', '5Min', '15Min', '1Hour', '1Day']);
const FEEDS = new Set(['iex', 'sip']);
const finite = x => Number.isFinite(x);
const avg = xs => xs.reduce((a,b) => a+b, 0) / xs.length;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function normalizeDiscoverySymbols(symbols) {
  if (!Array.isArray(symbols)) throw new Error('STOCK_DISCOVERY_SYMBOLS_REQUIRED');
  const cleaned = symbols.map(x => typeof x === 'string' ? x.trim().toUpperCase() : '');
  if (cleaned.some(x => !SYMBOL_PATTERN.test(x))) throw new Error('STOCK_DISCOVERY_SYMBOL_INVALID');
  return [...new Set(cleaned)];
}

function normalizeCandles(raw) {
  const byTime = new Map();
  for (const b of raw ?? []) {
    const timestamp = b.timestamp ?? b.t;
    const ms = Date.parse(timestamp);
    const open = Number(b.open ?? b.o), high = Number(b.high ?? b.h);
    const low = Number(b.low ?? b.l), close = Number(b.close ?? b.c);
    const volume = Number(b.volume ?? b.v);
    if (![ms,open,high,low,close,volume].every(finite) || open <= 0 || close <= 0 || low <= 0 ||
        high < low || high < Math.max(open,close) || low > Math.min(open,close) || volume < 0) continue;
    byTime.set(ms, {ms,open,high,low,close,volume,timestamp:new Date(ms).toISOString()});
  }
  return [...byTime.values()].sort((a,b) => a.ms-b.ms);
}

/** Pure ranking function; the last bar may be partial, so callers should request completed bars. */
export function rankStockCandidates({barsBySymbol, symbols, minBars=65, minPrice=2, minAverageDollarVolume=100_000, asOf=Date.now(), maxAgeMs=4*86400000}={}) {
  const selected = normalizeDiscoverySymbols(symbols ?? Object.keys(barsBySymbol ?? {}));
  const candidates = [], rejected = [];
  for (const symbol of selected) {
    const bars = normalizeCandles(barsBySymbol?.[symbol]);
    const reasons = [];
    if (bars.length < minBars) reasons.push('INSUFFICIENT_BARS');
    const last = bars.at(-1);
    if (!last || last.ms > asOf + 60000 || asOf - last.ms > maxAgeMs) reasons.push('STALE_OR_FUTURE_BARS');
    if (last && last.close < minPrice) reasons.push('PRICE_BELOW_MINIMUM');
    if (reasons.length) { rejected.push({symbol,barCount:bars.length,reasons}); continue; }
    const prior20 = bars.slice(-21,-1);
    const window20 = bars.slice(-20);
    const averageDollarVolume = avg(window20.map(b => b.close*b.volume));
    const avgVolume = avg(prior20.map(b => b.volume));
    const relativeVolume = avgVolume > 0 ? last.volume/avgVolume : 0;
    const movePct = (last.close / bars.at(-6).close - 1)*100;
    const rangePct = (Math.max(...window20.map(b=>b.high))-Math.min(...window20.map(b=>b.low)))/last.close*100;
    if (averageDollarVolume < minAverageDollarVolume) reasons.push('LOW_DOLLAR_VOLUME');
    if (!finite(relativeVolume) || !finite(movePct) || !finite(rangePct)) reasons.push('INVALID_METRICS');
    if (reasons.length) { rejected.push({symbol,barCount:bars.length,reasons}); continue; }
    // Ranking only; NOT a predicted probability, backtested edge, or setup approval.
    const score = 0.35*clamp(relativeVolume/3,0,1) + 0.25*clamp(Math.abs(movePct)/5,0,1) +
      0.25*clamp(rangePct/8,0,1) + 0.15*clamp(Math.log10(Math.max(1,averageDollarVolume))/8,0,1);
    candidates.push({symbol,score:Number((100*score).toFixed(2)),directionHint:movePct>0?'BULL':movePct<0?'BEAR':'NEUTRAL',
      relativeVolume:Number(relativeVolume.toFixed(3)),movePct:Number(movePct.toFixed(3)),rangePct:Number(rangePct.toFixed(3)),
      averageDollarVolume:Math.round(averageDollarVolume),lastPrice:last.close,lastBarAt:last.timestamp,barCount:bars.length});
  }
  candidates.sort((a,b)=>b.score-a.score || a.symbol.localeCompare(b.symbol));
  return {candidates,rejected};
}

/**
 * Scans an explicit universe; an asset-listing source must be added separately for full-market coverage.
 * Batch fetch is injected for deterministic offline tests.
 */
export async function discoverStockCandidates({symbols,timeframe='5Min',lookbackDays=10,feed='iex',topN=12,
  batchSize=20, minBars=65, minPrice=2, minAverageDollarVolume=100_000, asOf=Date.now(),
  fetchBatch=getHistoricalBarsBatch}={}) {
  const universe = normalizeDiscoverySymbols(symbols);
  if (!universe.length || universe.length > 500) throw new Error('STOCK_DISCOVERY_UNIVERSE_SIZE_INVALID');
  if (!TIMEFRAMES.has(timeframe) || !FEEDS.has(feed)) throw new Error('STOCK_DISCOVERY_MARKET_DATA_OPTIONS_INVALID');
  if (!Number.isInteger(lookbackDays) || lookbackDays < 5 || lookbackDays > 90) throw new Error('STOCK_DISCOVERY_LOOKBACK_INVALID');
  if (!Number.isInteger(topN) || topN < 1 || topN > 50 || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('STOCK_DISCOVERY_LIMIT_INVALID');
  if (!finite(asOf) || !Number.isInteger(minBars) || minBars < 25 || !finite(minPrice) || minPrice <= 0 ||
      !finite(minAverageDollarVolume) || minAverageDollarVolume < 0) throw new Error('STOCK_DISCOVERY_FILTER_INVALID');
  const end = new Date(asOf).toISOString(), start = new Date(asOf-lookbackDays*86400000).toISOString();
  const barsBySymbol = {}, providerErrors = [], warnings = [];
  for (let i=0;i<universe.length;i+=batchSize) {
    const chunk = universe.slice(i,i+batchSize);
    try {
      // 400 bars per symbol is sufficient for ranking and existing research engine; cap avoids silent truncation.
      const result = await fetchBatch({symbols:chunk,timeframe,start,end,feed,maximumBars: 250_000});
      if (!result?.approved) {
        providerErrors.push({symbols:chunk,errors:result?.errors ?? ['BATCH_NOT_APPROVED']});
        continue;
      }
      warnings.push(...(result.warnings ?? []));
      if ((result.warnings ?? []).some(x=>/safety limit/i.test(x))) {
        providerErrors.push({symbols:chunk,errors:['BATCH_TRUNCATED_AT_SAFETY_LIMIT']});
        continue;
      }
      for (const symbol of chunk) barsBySymbol[symbol] = result.barsBySymbol?.[symbol] ?? [];
    } catch (error) {
      providerErrors.push({symbols:chunk,errors:[String(error?.message ?? error)]});
    }
  }
  const ranking = rankStockCandidates({barsBySymbol,symbols:universe.filter(s=>Object.hasOwn(barsBySymbol,s)),minBars,minPrice,minAverageDollarVolume,asOf});
  return {assetClass:'STOCK',researchOnly:true,executionAuthority:false,liveExecution:false,mode:'HISTORICAL_DISCOVERY',
    provider:'ALPACA_HISTORICAL',generatedAt:end,timeframe,feed,universeSize:universe.length,
    scanned: Object.keys(barsBySymbol).length, candidates:ranking.candidates.slice(0,topN),
    rankedCount:ranking.candidates.length,rejected:ranking.rejected,providerErrors,warnings};
}
