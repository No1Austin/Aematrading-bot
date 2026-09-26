/**
 * AEMA paper accounting safety gate.
 * Call at startup BEFORE enabling the bot runtime, and once before each runtime tick.
 * Never edits ledger, never guesses missing P&L, and refuses inconsistent data.
 * Single-process only: ensure only one server owns the paper ledger.
 */
import { getBotPaperAccount } from './botPaperLedger.js';
import { getTradeMemory } from '../learning/botTradeMemoryStore.js';
import recordClosedTradeToMemory from '../learning/botTradeResultRecorder.js';

const valid = x => typeof x === 'number' && Number.isFinite(x);
const equal = (a,b) => Math.abs(a-b) <= 0.015;

export function reconcileBotAccounting({ repair = true } = {}) {
  const account = getBotPaperAccount();
  const memory = getTradeMemory();
  const closed = account.closedPositions;
  const open = account.positions;
  const records = memory.records;
  const errors = [];
  const closedById = new Map();
  const memoryById = new Map();

  for (const p of closed) {
    if (!p?.id || closedById.has(p.id)) errors.push(`DUPLICATE_OR_MISSING_CLOSED_ID ${p?.id}`);
    else closedById.set(p.id,p);
  }
  for (const r of records) {
    if (!r?.tradeId || memoryById.has(r.tradeId)) errors.push(`DUPLICATE_OR_MISSING_MEMORY_ID ${r?.tradeId}`);
    else memoryById.set(r.tradeId,r);
  }
  for (const p of open) {
    if (!p?.id || closedById.has(p.id)) errors.push(`INVALID_OR_CLOSED_OPEN_ID ${p?.id}`);
  }

  let closedPnl = 0;
  for (const p of closed) {
    if (!valid(p.realizedPnlUsd) || !valid(p.partialRealizedPnlUsd ?? 0)) {
      errors.push(`INVALID_CLOSED_PNL ${p.id}`); continue;
    }
    closedPnl += p.realizedPnlUsd + (p.partialRealizedPnlUsd ?? 0);
    const r = memoryById.get(p.id);
    if (r && (!valid(r.realizedPnlUsd) || !equal(r.realizedPnlUsd, p.realizedPnlUsd + (p.partialRealizedPnlUsd ?? 0))))
      errors.push(`MEMORY_PNL_MISMATCH ${p.id}`);
  }
  for (const r of records) {
    // Retention limits may discard old memory rows, but an unexplained memory-only
    // row must be investigated before adding more records.
    if (!closedById.has(r.tradeId)) errors.push(`MEMORY_ONLY_TRADE ${r.tradeId}`);
  }
  const partialOpen = open.reduce((sum,p) => {
    if (!valid(p.partialRealizedPnlUsd ?? 0)) errors.push(`INVALID_OPEN_PARTIAL_PNL ${p.id}`);
    return sum + (valid(p.partialRealizedPnlUsd ?? 0) ? (p.partialRealizedPnlUsd ?? 0) : 0);
  },0);
  const expectedRealized = closedPnl + partialOpen;
  const expectedCash = account.startingEquityUsd + expectedRealized;
  if (![account.startingEquityUsd,account.cashUsd,account.realizedPnlUsd].every(valid)) errors.push('INVALID_ACCOUNT_BALANCES');
  else {
    if (!equal(account.realizedPnlUsd,expectedRealized)) errors.push('REALIZED_PNL_MISMATCH');
    if (!equal(account.cashUsd,expectedCash)) errors.push('CASH_MISMATCH');
  }
  const missing = closed.filter(p => !memoryById.has(p.id));
  for (const p of missing) {
    if (!p.id || !p.symbol || !p.direction || !p.openedAt || !p.closedAt ||
        !valid(p.realizedPnlUsd) || !valid(p.partialRealizedPnlUsd ?? 0) || !valid(p.exitPrice))
      errors.push(`INVALID_MISSING_TRADE ${p.id}`);
  }
  if (errors.length) {
    const e = new Error(`BOT_ACCOUNTING_BLOCKED: ${errors.join('; ')}`);
    e.report = { errors, missing:missing.map(p=>p.id) };
    throw e;
  }
  const recovered = [];
  if (repair) {
    for (const p of missing) {
      const fullPnl = p.realizedPnlUsd + (p.partialRealizedPnlUsd ?? 0);
      recordClosedTradeToMemory(p,{...p,realizedPnlUsd:fullPnl});
      recovered.push(p.id);
    }
    const after = getTradeMemory();
    for (const p of missing) {
      const r = after.records.find(x => x.tradeId === p.id);
      if (!r || !equal(r.realizedPnlUsd,p.realizedPnlUsd+(p.partialRealizedPnlUsd??0)))
        throw Error(`BOT_ACCOUNTING_RECOVERY_VERIFY_FAILED ${p.id}`);
    }
    const afterAccount = getBotPaperAccount();
    if (!equal(afterAccount.cashUsd,account.cashUsd) || !equal(afterAccount.realizedPnlUsd,account.realizedPnlUsd))
      throw Error('BOT_ACCOUNTING_LEDGER_CHANGED_DURING_RECOVERY');
  }
  return {ok:true,closed:closed.length,memory:getTradeMemory().count,missing:missing.map(p=>p.id),recovered,
    cashUsd:account.cashUsd,realizedPnlUsd:account.realizedPnlUsd};
}
export default reconcileBotAccounting;
