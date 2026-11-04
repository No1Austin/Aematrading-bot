/** Stock-only authoritative historical candle diagnostic. No trading authority. */
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const ms = x => {const t = typeof x === 'number' ? x : Date.parse(x); return Number.isFinite(t) ? t : null;};
const validSymbol = x => typeof x === 'string' && /^[A-Z][A-Z0-9.-]{0,9}$/.test(x);
export async function reviewStockCandles({row,feed='iex',now=Date.now()}, {fetchBars}={}) {
  const symbol = row?.symbol;
  const horizon = row?.horizon;
  const timeframe = horizon === 'INTRADAY' ? '5Min' : horizon === 'SWING' ? '1Day' : null;
  const direction = String(row?.researchDirection ?? '').toUpperCase();
  const s = row?.setup ?? {};
  if (!validSymbol(symbol) || !timeframe || !['BULL','BEAR'].includes(direction) || !['iex','sip'].includes(feed) || !Number.isFinite(now)) throw new Error('STOCK_CANDLE_REVIEW_INPUT_INVALID');
  const base = {symbol,horizon,direction,feed,timeframe,source:'ALPACA_HISTORICAL_BARS',researchOnly:true,manualExecutionOnly:true,tradeApproval:false,executionDisabled:true,proposedEntry:null,proposedStop:null,proposedTarget:null};
  const blockers = [];
  if (s.approved !== true) blockers.push('ORIGINAL_SETUP_NOT_APPROVED');
  if (row.crossHorizonConflict) blockers.push('CROSS_HORIZON_CONFLICT_REVIEW');
  if (![s.entry,s.stop,s.target].every(positive) || (direction==='BULL' && !(s.stop<s.entry && s.entry<s.target)) || (direction==='BEAR' && !(s.target<s.entry && s.entry<s.stop))) blockers.push('INVALID_OR_MISSING_LEVELS');
  const interval = horizon==='INTRADAY'?300000:86400000;
  const start = new Date(now-(horizon==='INTRADAY'?7:110)*86400000).toISOString();
  const end = new Date(now).toISOString();
  const loader = fetchBars ?? (await import('../../../../data/providers/alpacaHistoricalDataService.js')).getHistoricalBars;
  const response = await loader({symbol,timeframe,feed,start,end,maximumBars:1000});
  if (!response?.approved || !Array.isArray(response.bars)) return {...base,reviewStatus:'REVIEW_REQUIRED',blockers:[...blockers,'PROVIDER_BARS_UNAVAILABLE'],providerErrors:response?.errors??[],barsUsed:0};
  const candles = response.bars.map(b=>({...b,timeMs:ms(b.timestamp)})).filter(b=>b.timeMs!==null && b.timeMs<=now-interval && [b.open,b.high,b.low,b.close].every(positive) && b.high>=Math.max(b.open,b.close) && b.low<=Math.min(b.open,b.close)).sort((a,b)=>a.timeMs-b.timeMs);
  const unique = [...new Map(candles.map(b=>[b.timeMs,b])).values()];
  const recent = unique.slice(-21);
  if (recent.length<21) blockers.push('INSUFFICIENT_CLOSED_CANDLES');
  const last=recent.at(-1);
  const age=last?now-last.timeMs:null;
  // US equities are not continuous; daily data can be several days old over weekends/holidays.
  // No automatic stale verdict for daily bars; require human verification of market session.
  if (horizon==='INTRADAY' && age!==null && age>3*86400000) blockers.push('INTRADAY_DATA_STALE');
  const window=recent.slice(-21,-1);
  const resistance=window.length?Math.max(...window.map(b=>b.high)):null;
  const support=window.length?Math.min(...window.map(b=>b.low)):null;
  const close=last?.close??null;
  const confirmed = blockers.length===0 && (direction==='BULL' ? close>resistance : close<support);
  if (blockers.length===0 && !confirmed) blockers.push('STRUCTURE_BREAK_NOT_CONFIRMED');
  if (last && positive(s.stop) && (direction==='BULL'?last.low<=s.stop:last.high>=s.stop)) blockers.push('LATEST_BAR_TOUCHED_STOP');
  if (last && positive(s.target) && (direction==='BULL'?last.high>=s.target:last.low<=s.target)) blockers.push('LATEST_BAR_TOUCHED_TARGET');
  return {...base,reviewStatus:blockers.length?'REVIEW_REQUIRED':'STRUCTURE_BREAK_OBSERVED',blockers:[...new Set(blockers)],referenceClose:close,lastClosedBarAt:last?.timestamp??null,barsUsed:recent.length,structure:{lookbackBars:20,resistance,support,breakConfirmed:confirmed},originalLevels:{entry:s.entry??null,stop:s.stop??null,target:s.target??null},note:'Historical closed-bar diagnostic only. Client-supplied setup is not verified against server research; no live quote, fill validation, net R:R, or trade approval.'};
}
