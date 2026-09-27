import { randomUUID } from 'node:crypto';
import { appendExecutionEvent, readExecutionJournal } from './botAlpacaExecutionJournal.js';
import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
import planAlpacaProtection from './botAlpacaProtectionPlanner.js';

const PREFIX = 'aema-pilot-';
const STOP_PREFIX = 'aema-protect-';
const LIVE = new Set(['new','accepted','pending_new','partially_filled','pending_cancel','pending_replace','accepted_for_bidding','held','stopped','suspended']);
const TERMINAL = new Set(['filled','canceled','expired','rejected']);
const num = x => Number(x);
const owned = id => typeof id === 'string' && id.startsWith(PREFIX);
const stopOwned = id => typeof id === 'string' && id.startsWith(STOP_PREFIX);
const latest = (records, type) => [...records].reverse().find(r => r.type === type);

/** Reconcile first. Fail closed on ambiguous shared positions or uncertain submissions.
 *  The only possible POST requires both explicit options and environment opt-in.
 *  Never automatically places entries, cancels an existing stop, or sends market exits.
 */
export async function superviseAlpacaProtection({gateway = makeAlpacaPaperGateway(), journalFile,
  stop, quote, priceIncrement, minTradeIncrement, allowProtectionSubmit = false,
  dedicatedAccountConfirmed = false, alert = () => {}} = {}) {
  const j = readExecutionJournal(journalFile);
  const entryIds = [...new Set(j.records.filter(r => owned(r.clientOrderId)).map(r => r.clientOrderId))];
  if (entryIds.length !== 1) return {status:'BLOCKED',reason:'REQUIRE_EXACTLY_ONE_OWNED_ENTRY',entryCount:entryIds.length};
  const id = entryIds[0], rows = j.records.filter(r => r.clientOrderId === id);
  const notify = (reason) => { alert({severity:'CRITICAL',entryClientOrderId:id,reason}); return {status:'MANUAL_REVIEW',reason,entryClientOrderId:id}; };
  if (rows.some(r => r.type === 'SUBMISSION_UNKNOWN')) return notify('ENTRY_SUBMISSION_UNKNOWN');
  let entry, positions, orders;
  try {
    [entry, positions, orders] = await Promise.all([gateway.getOrderByClientId(id), gateway.getPositions(), gateway.listOrders()]);
  } catch { return notify('PROVIDER_RECONCILIATION_UNAVAILABLE'); }
  if (!entry || entry.client_order_id !== id || entry.side !== 'buy' || !['BTC/USD','BTCUSD'].includes(entry.symbol)) return notify('ENTRY_IDENTITY_MISMATCH');
  if (!Array.isArray(positions) || !Array.isArray(orders)) return notify('INVALID_PROVIDER_STATE');
  const pairOrders = orders.filter(o => ['BTC/USD','BTCUSD'].includes(o.symbol));
  const foreign = pairOrders.filter(o => o.id !== entry.id && !stopOwned(o.client_order_id));
  const pairPositions = positions.filter(p => ['BTC/USD','BTCUSD'].includes(p.symbol));
  if (foreign.length || pairPositions.length !== 1) return notify('SHARED_ACCOUNT_OWNERSHIP_AMBIGUOUS');
  const position = pairPositions[0];
  const filled = num(entry.filled_qty), positionQty = num(position.qty);
  if (!Number.isFinite(filled) || filled <= 0) return {status:'WAITING_FOR_ENTRY_FILL',entryClientOrderId:id};
  // A shared net position may contain external fills even with no visible open orders.
  // Never infer ownership solely from symbol or a matching quantity.
  if (!dedicatedAccountConfirmed) return notify('DEDICATED_ACCOUNT_OR_VERIFIABLE_EXCLUSIVE_OWNERSHIP_REQUIRED');
  if (!Number.isFinite(positionQty) || Math.abs(positionQty - filled) > 1e-9) return notify('POSITION_QUANTITY_NOT_EXCLUSIVELY_VERIFIED');
  const protectionRows = j.records.filter(r => stopOwned(r.clientOrderId));
  const protectionIds = [...new Set(protectionRows.map(r => r.clientOrderId))];
  if (protectionIds.length > 1) return notify('MULTIPLE_PROTECTION_ATTEMPTS_REVIEW');
  if (protectionIds.length) {
    const sid = protectionIds[0];
    let protective;
    try { protective = await gateway.getOrderByClientId(sid); } catch { return notify('PROTECTION_SUBMISSION_UNRESOLVED'); }
    if (!protective || protective.client_order_id !== sid || protective.side !== 'sell' || protective.type !== 'stop_limit') return notify('PROTECTION_IDENTITY_MISMATCH');
    const covered = num(protective.qty) - num(protective.filled_qty || 0);
    if (protective.status === 'filled') return notify('STOP_FILLED_RECONCILE_POSITION');
    if (LIVE.has(protective.status) && covered + 1e-9 >= positionQty) return {status:'PROTECTION_PRESENT',entryClientOrderId:id,protectiveOrderId:protective.id,brokerStatus:protective.status};
    return notify('PROTECTION_NOT_CONFIRMED_OR_UNDERCOVERED');
  }
  if (pairOrders.some(o => stopOwned(o.client_order_id))) return notify('UNJOURNALED_PROTECTION_ORDER');
  const plan = planAlpacaProtection({entryOrder:entry,protectiveOrders:[],position,stop,quote,priceIncrement,minTradeIncrement});
  if (!plan.approved) return notify(`PROTECTION_PLAN_BLOCKED:${plan.blockers.join(',')}`);
  if (!allowProtectionSubmit || process.env.AEMA_ALPACA_PROTECTION_SUBMISSION !== 'I_AUTHORIZE_PAPER_PROTECTION')
    return {status:'PROTECTION_READY_NOT_SUBMITTED',entryClientOrderId:id,plan};
  if (process.env.AEMA_BOT_EXECUTION_MODE !== 'INTERNAL_PAPER') return notify('BOT_EXECUTION_MODE_NOT_ISOLATED');
  const clientOrderId = `${STOP_PREFIX}${randomUUID()}`;
  // Durable write-ahead prevents retry after unknown outcome. Never auto-retry a POST.
  appendExecutionEvent({type:'PROTECTION_PREPARED',clientOrderId,entryClientOrderId:id,order:plan.order},journalFile);
  let submitted;
  try { submitted = await gateway.submit({...plan.order,client_order_id:clientOrderId}); }
  catch { appendExecutionEvent({type:'PROTECTION_SUBMISSION_UNKNOWN',clientOrderId,entryClientOrderId:id},journalFile); return notify('PROTECTION_SUBMISSION_UNKNOWN'); }
  appendExecutionEvent({type:'PROTECTION_SUBMITTED',clientOrderId,entryClientOrderId:id,providerOrderId:submitted.id,status:submitted.status},journalFile);
  let verified;
  try { verified = await gateway.getOrderByClientId(clientOrderId); }
  catch { return notify('PROTECTION_ACCEPTANCE_NOT_VERIFIED'); }
  if (verified?.id !== submitted.id || !LIVE.has(verified.status)) return notify('PROTECTION_NOT_ACCEPTED');
  return {status:'PROTECTION_PRESENT',entryClientOrderId:id,protectiveOrderId:verified.id,brokerStatus:verified.status};
}
export default superviseAlpacaProtection;
