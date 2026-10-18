/** Append-only, research-only point-in-time futures snapshot archive.
 * Call synchronously at the moment the market/candidate inputs are finalized,
 * BEFORE any future candles arrive. This module never asserts verification
 * from caller input and never archives secrets or execution credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const INTERVALS = { '1m':60000,'3m':180000,'5m':300000,'15m':900000,'30m':1800000,'1h':3600000,'4h':14400000,'1d':86400000 };
const stamp = v => { const x = typeof v === 'string' && !/^\d+$/.test(v) ? Date.parse(v) : Number(v) < 1e11 ? Number(v)*1000 : Number(v); return Number.isFinite(x)?x:NaN; };
const finite = v => typeof v === 'number' && Number.isFinite(v);
const clean = value => {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !/(key|secret|token|password|authorization|cookie|credential|private|wallet)/i.test(k)).map(([k,v])=>[k,clean(v)]));
  return value;
};
export function validateHistoricalSnapshot(record, capturedAtMs=Date.now()) {
  const errors=[];
  const t=Date.parse(record?.timestamp || '');
  const interval=record?.candleInterval || '5m';
  const ms=INTERVALS[interval];
  const market=record?.market, candidate=record?.candidate;
  if (!Number.isFinite(t) || t%60000!==0 || t>capturedAtMs) errors.push('INVALID_OR_FUTURE_DECISION_TIME');
  if (!ms) errors.push('UNSUPPORTED_INTERVAL');
  if (!market || !candidate || !Array.isArray(market?.candles)) errors.push('MISSING_MARKET_OR_CANDIDATE');
  if (!['FUTURES','PERPETUAL'].includes(String(market?.instrumentType).toUpperCase())) errors.push('FUTURES_MARKET_REQUIRED');
  if (!market?.symbol || market.symbol !== candidate?.symbol) errors.push('SYMBOL_MISMATCH');
  const candles=market?.candles || [];
  if (candles.length<30) errors.push('INSUFFICIENT_CANDLES');
  if (ms && Number.isFinite(t) && candles.length) {
    const times=candles.map(c=>stamp(c.openTime ?? c.time ?? c.timestamp ?? c.t));
    if (times.some(v=>!Number.isFinite(v)||v+ms>t)) errors.push('FUTURE_OR_OPEN_CANDLE');
    const ordered=[...times].sort((a,b)=>a-b);
    if (ordered.some((v,i)=>i>0 && v-ordered[i-1]!==ms)) errors.push('CANDLE_GAP_OR_DUPLICATE');
    if (ordered.at(-1)+ms!==t) errors.push('STALE_CANDLES');
    if (candles.some(c=>!['open','high','low','close'].every(k=>finite(Number(c[k])) && Number(c[k])>0) || Number(c.high)<Number(c.low))) errors.push('INVALID_OHLC');
  }
  return [...new Set(errors)];
}
export function archiveQuantSnapshot(record,{filePath, capturedAtMs=Date.now()}={}) {
  if (!filePath) throw Error('ARCHIVE_PATH_REQUIRED');
  const errors=validateHistoricalSnapshot(record,capturedAtMs);
  if (errors.length) return {saved:false,errors};
  // Archive does not manufacture historical point-in-time verification.
  // Capture timestamp and provenance must be contemporaneous and independently auditable.
  const capturedAt=new Date(capturedAtMs).toISOString();
  const sanitized=clean(record);
  const payload={...sanitized,pointInTimeVerified:false,sourceType:'ARCHIVED_FUTURES_SNAPSHOT',archiveMetadata:{capturedAt,validation:'CANDLE_TIMESTAMPS_ONLY',requiresIndependentVerification:true}};
  const canonical=JSON.stringify(payload);
  payload.archiveMetadata.sha256=crypto.createHash('sha256').update(canonical).digest('hex');
  fs.mkdirSync(path.dirname(path.resolve(filePath)),{recursive:true});
  fs.appendFileSync(filePath,JSON.stringify(payload)+'\n',{encoding:'utf8',flag:'a'});
  return {saved:true,hash:payload.archiveMetadata.sha256,filePath:path.resolve(filePath),verified:false};
}
