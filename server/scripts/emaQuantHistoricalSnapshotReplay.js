/**
 * EMA historical snapshot replay (research only).
 * Accepts archived, point-in-time market + candidate snapshots. Does NOT
 * reconstruct missing bid/ask, futures metadata, funding or order books from
 * Coinbase spot candles. Historical snapshots MUST be independently archived.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBotFuturesSetup } from '../src/crypto/bot/setup/botFuturesStrategySetupBuilder.js';

const MINUTE = 60000;
function validNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function parseTime(s) {
  if (typeof s !== 'string' || !/(Z|[+-]\d\d:\d\d)$/.test(s)) throw Error('UTC/offset timestamp required');
  const t = Date.parse(s);
  if (!Number.isFinite(t) || t % MINUTE !== 0) throw Error('Timestamp must be minute-aligned');
  return t;
}
function candleTime(c) {
  const raw = c?.openTime ?? c?.time ?? c?.timestamp ?? c?.t;
  if (typeof raw === 'string' && !/^\d+$/.test(raw)) return Date.parse(raw);
  const n = Number(raw);
  return n < 1e11 ? n * 1000 : n;
}
export function replaySnapshot(record, builder = buildBotFuturesSetup) {
  const t = parseTime(record?.timestamp);
  if (record?.pointInTimeVerified !== true || record?.sourceType !== 'ARCHIVED_FUTURES_SNAPSHOT')
    throw Error('UNVERIFIED_POINT_IN_TIME_SNAPSHOT');
  const market = record.market, candidate = record.candidate;
  if (!market || !candidate || !Array.isArray(market.candles)) throw Error('MISSING_MARKET_OR_CANDIDATE');
  if (!['PERPETUAL', 'FUTURES'].includes(String(market.instrumentType).toUpperCase()))
    throw Error('FUTURES_MARKET_REQUIRED');
  if (market.approved !== true || candidate.directionDecision?.qualified !== true)
    throw Error('UNQUALIFIED_HISTORICAL_INPUT');
  if (String(candidate.symbol) !== String(market.symbol)) throw Error('SYMBOL_MISMATCH');
  const interval = record.candleInterval || '5m';
  const intervals = { '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '4h': 14400000, '1d': 86400000 };
  const duration = intervals[interval];
  if (!duration) throw Error('UNSUPPORTED_CANDLE_INTERVAL');
  if (market.candles.length < 30) throw Error('INSUFFICIENT_HISTORICAL_CANDLES');
  const times = market.candles.map(candleTime);
  if (times.some(v => !validNum(v) || v + duration > t)) throw Error('FUTURE_OR_OPEN_CANDLE_IN_SNAPSHOT');
  const ordered = [...times].sort((a,b) => a-b);
  if (ordered.some((v,i) => i && v-ordered[i-1] !== duration)) throw Error('MISSING_OR_DUPLICATE_HISTORICAL_CANDLE');
  if (ordered.at(-1) + duration !== t) throw Error('STALE_HISTORICAL_CANDLES');
  const result = builder(candidate, market, { candleInterval: interval, replayNowMs: t + 1000 });
  const setup = result?.setup || {};
  const dir = String(setup.researchDirection || '').toUpperCase();
  const e = setup.entry, stop = setup.stop, target = setup.target;
  const geometry = [e,stop,target].every(v => validNum(v) && v > 0) &&
    ((dir === 'BULL' && stop < e && e < target) || (dir === 'BEAR' && target < e && e < stop));
  return {
    timestamp: new Date(t).toISOString(), symbol: candidate.symbol,
    instrument_type: 'PERPETUAL', strategy: setup.strategy || '', direction: dir,
    entry: geometry ? e : '', stop: geometry ? stop : '', target: geometry ? target : '',
    setupApproved: setup.approved === true, geometryAvailable: geometry,
    status: setup.status || 'NO_SETUP', blockers: setup.blockers || [],
    researchOnly: true, executionAuthority: false
  };
}
const csvCell = v => '"' + String(v ?? '').replaceAll('"','""') + '"';
export function replayRecords(records, builder = buildBotFuturesSetup) {
  return records.map((r,i) => {
    try { return { row: i+1, ...replaySnapshot(r,builder) }; }
    catch (e) { return { row: i+1, timestamp:r?.timestamp || '', symbol:r?.candidate?.symbol || '', status:'REPLAY_REJECTED', error:e.message, researchOnly:true, executionAuthority:false }; }
  });
}
export function toCsv(rows) {
  const keys = ['timestamp','symbol','instrument_type','strategy','direction','entry','stop','target'];
  return [keys.join(','), ...rows.filter(r => r.geometryAvailable && r.setupApproved).map(r => keys.map(k=>csvCell(r[k])).join(','))].join('\n')+'\n';
}
async function main() {
  const args=process.argv.slice(2);const get=k=>args[args.indexOf(k)+1];
  if (!args.includes('--input') || !args.includes('--output-prefix')) {
    console.error('Usage: node scripts/emaQuantHistoricalSnapshotReplay.js --input archived-futures-snapshots.jsonl --output-prefix quant-research/output/futures_replay');
    process.exitCode=2;return;
  }
  const input=path.resolve(get('--input')), prefix=path.resolve(get('--output-prefix'));
  const records=fs.readFileSync(input,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const rows=replayRecords(records);
  fs.mkdirSync(path.dirname(prefix),{recursive:true});
  fs.writeFileSync(prefix+'.json',JSON.stringify({schemaVersion:'ema-quant-historical-replay-v1',status:'RESEARCH_ONLY',rows},null,2));
  fs.writeFileSync(prefix+'.setups.csv',toCsv(rows));
  console.log(JSON.stringify({records:rows.length, rejected:rows.filter(r=>r.status==='REPLAY_REJECTED').length, approvedWithGeometry:rows.filter(r=>r.setupApproved && r.geometryAvailable).length, output:prefix+'.setups.csv', researchOnly:true},null,2));
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
