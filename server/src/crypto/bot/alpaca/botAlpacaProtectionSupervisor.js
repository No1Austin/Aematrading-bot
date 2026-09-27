import { randomUUID } from 'node:crypto';
import { appendExecutionEvent, readExecutionJournal } from './botAlpacaExecutionJournal.js';
import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
import planAlpacaProtection from './botAlpacaProtectionPlanner.js';

const ENTRY = 'aema-pilot-';
const PROTECT = 'aema-protect-';
const TERMINAL = new Set(['filled', 'canceled', 'expired', 'rejected']);
const LIVE = new Set(['new','accepted','pending_new','partially_filled','pending_cancel','pending_replace','accepted_for_bidding','held','stopped','suspended']);
const btc = s => s === 'BTC/USD' || s === 'BTCUSD';
const numeric = x => Number(x);
const nearly = (a,b,step) => Math.abs(a-b) <= Math.max(1e-9,step*0.51);
const manual = (reason, id, alert) => {
  alert({severity:'CRITICAL', entryClientOrderId:id, reason});
  return {status:'MANUAL_REVIEW',reason,entryClientOrderId:id};
};

/** One pilot only. Never retries an uncertain POST or cancels/replaces an existing order. */
export async function superviseAlpacaProtection({
  gateway=makeAlpacaPaperGateway(), journalFile, stop, quote, priceIncrement,
  minTradeIncrement, allowProtectionSubmit=false, alert=()=>{}
}={}) {
  if (process.env.AEMA_BOT_EXECUTION_MODE !== 'INTERNAL_PAPER')
    return {status:'BLOCKED',reason:'INTERNAL_SIMULATOR_ISOLATION_REQUIRED'};
  const pin = process.env.AEMA_CRYPTO_ALPACA_ACCOUNT_ID;
  if (!pin) return {status:'BLOCKED',reason:'ACCOUNT_PIN_REQUIRED'};
  let account;
  try { account=await gateway.getAccount(); }
  catch { return {status:'BLOCKED',reason:'ACCOUNT_CHECK_UNAVAILABLE'}; }
  if (account?.id!==pin || account.status!=='ACTIVE' || account.account_blocked || account.trading_blocked)
    return {status:'BLOCKED',reason:'DEDICATED_ACCOUNT_NOT_VERIFIED'};
  const rows=readExecutionJournal(journalFile).records;
  const ids=[...new Set(rows.filter(r=>r.clientOrderId?.startsWith(ENTRY)).map(r=>r.clientOrderId))];
  if(ids.length!==1) return {status:'BLOCKED',reason:'REQUIRE_ONE_PILOT_ENTRY',entryCount:ids.length};
  const id=ids[0];
  const notify=reason=>manual(reason,id,alert);
  const erows=rows.filter(r=>r.clientOrderId===id);
  // Unknown entry submissions require explicit reconciliation before any protection POST.
  if(erows.some(r=>r.type==='SUBMISSION_UNKNOWN') && !erows.some(r=>r.type==='ENTRY_RECONCILED'))
    return notify('ENTRY_SUBMISSION_UNKNOWN');
  const prepared=erows.find(r=>r.type==='PREPARED');
  if(!prepared) return notify('MISSING_ENTRY_PREPARED');
  if(!Number.isFinite(numeric(prepared.stop)) || numeric(prepared.stop)<=0) return notify('PERSISTED_ENTRY_STOP_MISSING');
  if(Number.isFinite(numeric(stop)) && numeric(stop)>0 && Math.abs(numeric(prepared.stop)-numeric(stop))>0.01)
    return notify('STOP_DIFFERS_FROM_ENTRY_JOURNAL');
  stop=numeric(prepared.stop);
  let entry,positions,orders;
  try { [entry,positions,orders]=await Promise.all([
    gateway.getOrderByClientId(id),gateway.getPositions(),gateway.listOrders()
  ]); } catch { return notify('BROKER_RECONCILIATION_UNAVAILABLE'); }
  if(!entry || entry.client_order_id!==id || entry.side!=='buy' || !btc(entry.symbol))
    return notify('ENTRY_IDENTITY_MISMATCH');
  if(!Array.isArray(positions)||!Array.isArray(orders)) return notify('INVALID_BROKER_STATE');
  const active=orders.filter(o=>btc(o.symbol)&&!TERMINAL.has(o.status));
  if(active.some(o=>o.client_order_id!==id && !o.client_order_id?.startsWith(PROTECT)))
    return notify('FOREIGN_ACTIVE_BTC_ORDER');
  const position=positions.filter(p=>btc(p.symbol));
  const filled=numeric(entry.filled_qty);
  if(!Number.isFinite(filled)||filled<=0) return {status:'WAITING_FOR_ENTRY_FILL',entryClientOrderId:id};
  if(position.length!==1) return notify('FILLED_ENTRY_WITHOUT_UNIQUE_POSITION');
  const qty=numeric(position[0].qty), inc=numeric(minTradeIncrement);
  if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(inc)||inc<=0||!nearly(qty,filled,inc))
    return notify('POSITION_NOT_EXCLUSIVELY_VERIFIED');
  const protections=[...new Set(rows.filter(r=>r.clientOrderId?.startsWith(PROTECT) && r.entryClientOrderId===id).map(r=>r.clientOrderId))];
  if(protections.length>1) return notify('MULTIPLE_PROTECTION_ATTEMPTS');
  if(protections.length===1) {
    const sid=protections[0];
    let protective;
    try { protective=await gateway.getOrderByClientId(sid); }
    catch { return notify('PROTECTION_OUTCOME_UNKNOWN_NO_RESUBMISSION'); }
    if(!protective || protective.client_order_id!==sid || protective.side!=='sell' || protective.type!=='stop_limit' || !btc(protective.symbol))
      return notify('PROTECTION_IDENTITY_MISMATCH');
    if(protective.status==='filled') return notify('PROTECTION_FILLED_RECONCILE_POSITION');
    const remaining=numeric(protective.qty)-numeric(protective.filled_qty||0);
    if(LIVE.has(protective.status)&&remaining+Math.max(1e-9,inc*0.51)>=qty)
      return {status:'PROTECTION_PRESENT',entryClientOrderId:id,protectiveOrderId:protective.id,brokerStatus:protective.status};
    return notify('PROTECTION_NOT_LIVE_OR_UNDERCOVERED');
  }
  if(active.some(o=>o.client_order_id?.startsWith(PROTECT)))
    return notify('UNJOURNALED_ACTIVE_PROTECTION');
  if(!Number.isFinite(numeric(stop))||numeric(stop)<=0) return notify('STOP_REQUIRED');
  const plan=planAlpacaProtection({entryOrder:entry,protectiveOrders:[],position:position[0],stop,quote,priceIncrement,minTradeIncrement});
  if(!plan.approved) return {status:'PROTECTION_BLOCKED',entryClientOrderId:id,blockers:plan.blockers};
  if(!allowProtectionSubmit || process.env.AEMA_ALPACA_PROTECTION_SUBMISSION!=='I_AUTHORIZE_PAPER_PROTECTION')
    return {status:'PROTECTION_READY_NOT_SUBMITTED',entryClientOrderId:id,plan};
  // Re-read before irreversible POST. Still requires single process/operator for this pilot.
  if(readExecutionJournal(journalFile).records.some(r=>r.clientOrderId?.startsWith(PROTECT)))
    return notify('PROTECTION_JOURNAL_CHANGED');
  const sid=`${PROTECT}${randomUUID()}`;
  appendExecutionEvent({type:'PROTECTION_PREPARED',clientOrderId:sid,entryClientOrderId:id,order:plan.order},journalFile);
  let submitted;
  try { submitted=await gateway.submit({...plan.order,client_order_id:sid}); }
  catch(e) {
    appendExecutionEvent({type:'PROTECTION_SUBMISSION_UNKNOWN',clientOrderId:sid,entryClientOrderId:id,errorCode:e?.status||e?.code||'UNKNOWN'},journalFile);
    return notify('PROTECTION_SUBMISSION_UNKNOWN_NO_RETRY');
  }
  if(!submitted?.id || submitted.client_order_id!==sid) {
    appendExecutionEvent({type:'PROTECTION_SUBMISSION_UNKNOWN',clientOrderId:sid,entryClientOrderId:id},journalFile);
    return notify('PROTECTION_RESPONSE_UNVERIFIED');
  }
  appendExecutionEvent({type:'PROTECTION_SUBMITTED',clientOrderId:sid,entryClientOrderId:id,providerOrderId:submitted.id,providerStatus:submitted.status},journalFile);
  let verified;
  try { verified=await gateway.getOrderByClientId(sid); }
  catch { return notify('PROTECTION_ACCEPTANCE_NOT_VERIFIED'); }
  if(verified?.id!==submitted.id || !LIVE.has(verified.status)) return notify('PROTECTION_NOT_ACCEPTED');
  return {status:'PROTECTION_PRESENT',entryClientOrderId:id,protectiveOrderId:verified.id,brokerStatus:verified.status};
}
export default superviseAlpacaProtection;
