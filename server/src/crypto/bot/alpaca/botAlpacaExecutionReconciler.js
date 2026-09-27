import { readExecutionJournal, appendExecutionEvent } from './botAlpacaExecutionJournal.js';
import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';

const ENTRY_PREFIX = 'aema-pilot-';
const STOP_PREFIX = 'aema-protect-';
const ACTIVE = new Set(['new','accepted','pending_new','partially_filled','pending_cancel','pending_replace','accepted_for_bidding','held','stopped','suspended']);
const TERMINAL = new Set(['filled','canceled','expired','rejected']);
const btc = s => s === 'BTC/USD' || s === 'BTCUSD';
const numberOrNull = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const owned = id => typeof id === 'string' && (id.startsWith(ENTRY_PREFIX) || id.startsWith(STOP_PREFIX));
const unique = values => [...new Set(values)];

/** Read-only and fail-closed. Completed historical manual exits are not active foreign orders. */
export async function reconcileAlpacaExecution({
  gateway = makeAlpacaPaperGateway(), journalFile,
  pinnedAccountId = process.env.AEMA_CRYPTO_ALPACA_ACCOUNT_ID,
  persist = false
} = {}) {
  const journal = readExecutionJournal(journalFile);
  const entries = unique(journal.records.filter(r => r.type === 'PREPARED' && r.clientOrderId?.startsWith(ENTRY_PREFIX)).map(r => r.clientOrderId));
  const protections = unique(journal.records.filter(r => r.clientOrderId?.startsWith(STOP_PREFIX)).map(r => r.clientOrderId));
  const blockers = [];
  if (!pinnedAccountId) blockers.push('ACCOUNT_NOT_PINNED');
  let account, positions, orders;
  try {
    [account, positions, orders] = await Promise.all([gateway.getAccount(), gateway.getPositions(), gateway.listOrders()]);
  } catch (e) {
    return { status: 'BLOCKED', readOnly: true, blockers: ['BROKER_UNAVAILABLE'], errorCode: e?.code || e?.status || null };
  }
  if (account?.id !== pinnedAccountId) blockers.push('ACCOUNT_ID_MISMATCH');
  if (account?.status !== 'ACTIVE' || account?.crypto_status !== 'ACTIVE' || account?.trading_blocked || account?.account_blocked) blockers.push('ACCOUNT_NOT_TRADEABLE');
  if (!Array.isArray(positions) || !Array.isArray(orders)) blockers.push('INVALID_BROKER_RESPONSE');
  if (blockers.length) return { status: 'BLOCKED', readOnly: true, blockers };

  const brokerBtcOrders = orders.filter(o => btc(o.symbol));
  const brokerBtcPositions = positions.filter(p => btc(p.symbol));
  const byClientId = new Map(brokerBtcOrders.map(o => [o.client_order_id, o]));
  const tracked = [];
  const resolved = new Map();
  for (const id of unique([...entries, ...protections])) {
    let order = byClientId.get(id);
    if (!order) {
      try { order = await gateway.getOrderByClientId(id); }
      catch { blockers.push(`UNRESOLVED_ORDER:${id}`); tracked.push({ clientOrderId: id, brokerStatus: 'UNKNOWN' }); continue; }
    }
    if (!order || order.client_order_id !== id || !btc(order.symbol) ||
        (id.startsWith(ENTRY_PREFIX) && order.side !== 'buy') ||
        (id.startsWith(STOP_PREFIX) && order.side !== 'sell')) {
      blockers.push(`ORDER_IDENTITY_MISMATCH:${id}`);
      continue;
    }
    resolved.set(id, order);
    const item = {
      clientOrderId: id, brokerOrderId: order.id, brokerStatus: order.status,
      filledQty: numberOrNull(order.filled_qty), filledAvgPrice: numberOrNull(order.filled_avg_price), side: order.side
    };
    tracked.push(item);
    if (!ACTIVE.has(order.status) && !TERMINAL.has(order.status)) blockers.push(`UNKNOWN_BROKER_STATUS:${id}`);
    if (persist) {
      const prior = journal.records.filter(r => r.clientOrderId === id && r.type === 'BROKER_RECONCILED').at(-1);
      if (!prior || prior.brokerStatus !== item.brokerStatus || prior.filledQty !== item.filledQty)
        appendExecutionEvent({ type: 'BROKER_RECONCILED', clientOrderId: id, brokerOrderId: order.id, brokerStatus: item.brokerStatus, filledQty: item.filledQty }, journalFile);
    }
  }

  if (brokerBtcPositions.length > 1) blockers.push('MULTIPLE_BTC_POSITIONS');
  const positionQty = brokerBtcPositions.length === 1 ? numberOrNull(brokerBtcPositions[0].qty) : 0;
  if (positionQty === null || positionQty < 0) blockers.push('INVALID_BTC_POSITION');
  const foreign = brokerBtcOrders.filter(o => !owned(o.client_order_id));
  const activeForeign = foreign.filter(o => ACTIVE.has(o.status));
  const unknownForeign = foreign.filter(o => !ACTIVE.has(o.status) && !TERMINAL.has(o.status));
  if (activeForeign.length) blockers.push('ACTIVE_FOREIGN_BTC_ORDERS');
  if (unknownForeign.length) blockers.push('UNKNOWN_FOREIGN_BTC_ORDERS');
  const activeEntries = [...resolved.values()].filter(o => o.side === 'buy' && ACTIVE.has(o.status));
  const activeProtections = [...resolved.values()].filter(o => o.side === 'sell' && ACTIVE.has(o.status));
  if (activeEntries.length) blockers.push('ENTRY_ORDER_STILL_ACTIVE');

  // An open position requires separate proof of exclusive ownership. A fee-adjusted
  // position cannot safely be inferred by subtracting raw filled order quantities.
  if (positionQty > 0) {
    blockers.push('OPEN_POSITION_REQUIRES_PROTECTION_RECONCILIATION');
    const covered = activeProtections.reduce((total, o) => {
      const original = resolved.get(o.client_order_id);
      const qty = numberOrNull(original?.qty);
      const filled = numberOrNull(original?.filled_qty) ?? 0;
      return total + (qty === null ? 0 : Math.max(0, qty - filled));
    }, 0);
    if (covered + 1e-9 < positionQty) blockers.push('POSITION_UNPROTECTED_OR_UNDERCOVERED');
  } else if (activeProtections.length) {
    blockers.push('ORPHANED_ACTIVE_PROTECTION');
  }

  // Unknown POST results remain blocked even if a later GET happens to find an order;
  // resolution requires an explicit, separately audited recovery procedure.
  for (const id of unique([...entries, ...protections])) {
    const rows = journal.records.filter(r => r.clientOrderId === id);
    if (rows.some(r => r.type === 'SUBMISSION_UNKNOWN' || r.type === 'PROTECTION_SUBMISSION_UNKNOWN'))
      blockers.push(`HISTORICAL_UNKNOWN_SUBMISSION_REVIEW:${id}`);
  }

  // listOrders is capped in the existing gateway: do not claim exhaustive historical
  // account ownership from this response. Flat + no active listed orders is a snapshot.
  return {
    status: blockers.length ? 'MANUAL_REVIEW' : 'RECONCILED_READ_ONLY', readOnly: true,
    blockers: unique(blockers), accountIdSuffix: account.id.slice(-4), positionQty,
    entryCount: entries.length, protectionCount: protections.length,
    completedForeignOrderCount: foreign.filter(o => TERMINAL.has(o.status)).length,
    activeForeignOrderCount: activeForeign.length, tracked
  };
}
export default reconcileAlpacaExecution;
