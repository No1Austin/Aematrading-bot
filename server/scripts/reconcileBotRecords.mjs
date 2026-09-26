/** Offline, idempotent reconciliation of AEMA paper ledger and Trade Memory.
 * Run from server/: node scripts/reconcileBotRecords.mjs [--apply]
 * IMPORTANT: stop all server processes before --apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const cwd = process.cwd();
const script = fileURLToPath(import.meta.url);
const expected = path.join(cwd, 'scripts', 'reconcileBotRecords.mjs');
if (path.resolve(script) !== path.resolve(expected)) {
  console.error('Run from the server directory: node scripts/reconcileBotRecords.mjs');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const ledgerPath = path.resolve(cwd, process.env.AEMA_BOT_LEDGER_PATH || './data/aema-bot-paper-ledger.json');
const memoryPath = path.resolve(cwd, process.env.AEMA_BOT_TRADE_MEMORY_PATH || './data/aema-bot-trade-memory.json');
// Path defaults above must match your Phase 5/6 configuration; refuse to guess if they differ.
const phase5 = (await import('../src/crypto/bot/config/botPhase5Config.js')).default;
const phase6 = (await import('../src/crypto/bot/config/botPhase6Config.js')).default;
const configuredLedger = path.resolve(cwd, phase5.persistence.ledgerPath);
const configuredMemory = path.resolve(cwd, phase6.memory.path);
if (ledgerPath !== configuredLedger || memoryPath !== configuredMemory) {
  console.error('CONFIG_PATH_MISMATCH', { configuredLedger, configuredMemory, ledgerPath, memoryPath });
  console.error('Inspect Phase 5/6 paths; this script will not guess or modify files.');
  process.exit(2);
}
function read(p) { if (!fs.existsSync(p)) throw Error(`MISSING_FILE: ${p}`); return JSON.parse(fs.readFileSync(p,'utf8')); }
const ledger = read(ledgerPath), memory = read(memoryPath);
if (!Array.isArray(ledger.closedPositions) || !Array.isArray(ledger.positions) || !Array.isArray(memory.records)) throw Error('INVALID_LEDGER_OR_MEMORY_SCHEMA');
const finite = x => typeof x === 'number' && Number.isFinite(x);
const approx = (a,b) => Math.abs(a-b) <= 0.015;
const closed = new Map(), records = new Map(), errors = [], warnings = [];
for (const p of ledger.closedPositions) {
  if (!p.id || closed.has(p.id)) errors.push(`DUPLICATE_OR_MISSING_CLOSED_ID ${p.id}`);
  else closed.set(p.id,p);
}
for (const r of memory.records) {
  if (!r.tradeId || records.has(r.tradeId)) errors.push(`DUPLICATE_OR_MISSING_MEMORY_ID ${r.tradeId}`);
  else records.set(r.tradeId,r);
}
const missing = [...closed.values()].filter(p => !records.has(p.id));
const orphans = [...records.values()].filter(r => !closed.has(r.tradeId));
const mismatches = [];
for (const p of closed.values()) {
  const r = records.get(p.id);
  if (!r) continue;
  const expectedPnl = Number(p.realizedPnlUsd) + Number(p.partialRealizedPnlUsd || 0);
  if (!finite(expectedPnl) || !finite(r.realizedPnlUsd) || !approx(expectedPnl,r.realizedPnlUsd))
    mismatches.push({tradeId:p.id,symbol:p.symbol,ledgerTotal:expectedPnl,memoryTotal:r.realizedPnlUsd});
}
const closedPnl = [...closed.values()].reduce((s,p)=>s+Number(p.realizedPnlUsd)+Number(p.partialRealizedPnlUsd||0),0);
const expectedCash = Number(ledger.startingEquityUsd)+closedPnl + ledger.positions.reduce((s,p)=>s+Number(p.partialRealizedPnlUsd||0),0);
if (![ledger.startingEquityUsd,ledger.cashUsd,ledger.realizedPnlUsd].every(finite)) errors.push('INVALID_ACCOUNT_BALANCES');
if (!approx(expectedCash,ledger.cashUsd)) errors.push(`CASH_MISMATCH expected=${expectedCash} actual=${ledger.cashUsd}`);
if (!approx(closedPnl+ledger.positions.reduce((s,p)=>s+Number(p.partialRealizedPnlUsd||0),0),ledger.realizedPnlUsd)) errors.push('REALIZED_PNL_MISMATCH');
if (orphans.length) warnings.push(`${orphans.length} MEMORY_ONLY_RECORDS: inspect retention and snapshot timing`);
if (mismatches.length) warnings.push(`${mismatches.length} MATCHED_TRADE_PNL_MISMATCHES: not auto-corrected`);
const invalidMissing = missing.filter(p => !p.id || !p.symbol || !p.direction || !p.openedAt || !p.closedAt || !finite(p.realizedPnlUsd) || !finite(Number(p.partialRealizedPnlUsd||0)) || !finite(p.exitPrice));
if (invalidMissing.length) errors.push(`INVALID_MISSING_TRADES ${invalidMissing.map(p=>p.id).join(',')}`);
console.log(JSON.stringify({mode:apply?'APPLY':'DRY_RUN',ledgerPath,memoryPath,closedPositions:closed.size,memoryRecords:records.size,missing:missing.map(p=>({id:p.id,symbol:p.symbol,remainingPnl:p.realizedPnlUsd,partialPnl:p.partialRealizedPnlUsd||0})),orphanMemory:orphans.map(r=>r.tradeId),mismatches,closedPnl,ledgerRealizedPnl:ledger.realizedPnlUsd,expectedCash,ledgerCash:ledger.cashUsd,errors,warnings},null,2));
if (!apply) { console.log('READ_ONLY: no files changed.'); process.exit(errors.length?2:0); }
if (errors.length || mismatches.length || orphans.length) { console.error('REFUSING_APPLY: resolve errors, mismatches and memory-only records first.'); process.exit(2); }
if (!missing.length) { console.log('ALREADY_RECONCILED: nothing to change.'); process.exit(0); }
// Check again immediately before writes. Caller must ensure no server is running.
const originalLedger = fs.readFileSync(ledgerPath);
const originalMemory = fs.readFileSync(memoryPath);
const stamp = new Date().toISOString().replaceAll(':','-');
const backupDir = path.join(cwd,'data',`bot-accounting-backup-${stamp}`);
fs.mkdirSync(backupDir,{recursive:false});
fs.writeFileSync(path.join(backupDir,path.basename(ledgerPath)),originalLedger,{flag:'wx'});
fs.writeFileSync(path.join(backupDir,path.basename(memoryPath)),originalMemory,{flag:'wx'});
console.log('BACKUPS_CREATED',backupDir);
// Import AFTER backup: these modules cache data in memory on import.
const { recordClosedTradeToMemory } = await import('../src/crypto/bot/learning/botTradeResultRecorder.js');
const { getTradeMemory } = await import('../src/crypto/bot/learning/botTradeMemoryStore.js');
const { getBotPaperAccount } = await import('../src/crypto/bot/account/botPaperLedger.js');
for (const p of missing) {
  // The closed ledger row preserves entry metadata. Its realizedPnlUsd is ONLY the final exit.
  const fullPnl = Number(p.realizedPnlUsd)+Number(p.partialRealizedPnlUsd||0);
  recordClosedTradeToMemory(p,{...p,realizedPnlUsd:fullPnl});
  console.log('RECOVERED',p.id,p.symbol,fullPnl);
}
const after = getTradeMemory();
for (const p of missing) {
  const r = after.records.find(x=>x.tradeId===p.id);
  if (!r || !approx(r.realizedPnlUsd,Number(p.realizedPnlUsd)+Number(p.partialRealizedPnlUsd||0))) throw Error(`POST_REPAIR_VERIFY_FAILED ${p.id}`);
}
if (!approx(getBotPaperAccount().cashUsd,Number(ledger.cashUsd))) throw Error('POST_REPAIR_LEDGER_CHANGED');
console.log('VERIFIED: missing Trade Memory recovered; paper ledger balances unchanged.');
