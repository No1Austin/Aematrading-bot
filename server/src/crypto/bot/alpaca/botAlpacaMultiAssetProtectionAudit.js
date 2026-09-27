/** Read-only, multi-asset Alpaca paper protection and recovery audit.
 * No POSTs, no inference of position ownership from symbol alone.
 * A stop-limit order can remain unfilled after triggering.
 */
import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
import { readExecutionJournal } from './botAlpacaExecutionJournal.js';
const LIVE = new Set(['new','accepted','pending_new','partially_filled','pending_cancel','pending_replace','accepted_for_bidding','held','stopped','suspended']);
const terminal = new Set(['filled','canceled','expired','rejected','failed']);
const norm = value => String(value ?? '').replace('/','').toUpperCase();
const qty = value => {const n=Number(value);return Number.isFinite(n)&&n>=0?n:null};
const ownedEntry = id => typeof id==='string' && id.startsWith('aema-auto-entry-');
const ownedStop = id => typeof id==='string' && id.startsWith('aema-auto-protect-');
const result=(status,reason,extra={})=>({status,reason,executionAuthority:false,liveExecution:false,...extra});
/**
 * For future automated entries, require journal PREPARED before submission,
 * verified broker fill, dedicated account and exactly one owned active stop.
 * Unknown orders, foreign activity and fee-adjusted quantity gaps fail closed.
 */
export async function auditAlpacaMultiAssetProtection({gateway=makeAlpacaPaperGateway(),journalFile,expectedAccountId=process.env.AEMA_CRYPTO_ALPACA_ACCOUNT_ID,records,strictExclusiveAccount=true}={}){
  if(!expectedAccountId)return result('BLOCKED','ACCOUNT_PIN_REQUIRED');
  let account,positions,orders;
  try{[account,positions,orders]=await Promise.all([gateway.getAccount(),gateway.getPositions(),gateway.listOrders()]);}
  catch{return result('BLOCKED','BROKER_RECONCILIATION_UNAVAILABLE')}
  if(account?.id!==expectedAccountId||account.status!=='ACTIVE'||account.crypto_status!=='ACTIVE'||account.account_blocked||account.trading_blocked)return result('BLOCKED','DEDICATED_ACCOUNT_VERIFICATION_FAILED');
  if(!Array.isArray(positions)||!Array.isArray(orders))return result('BLOCKED','INVALID_BROKER_STATE');
  let journal;
  try{journal=records??readExecutionJournal(journalFile).records;if(!Array.isArray(journal))throw Error()}
  catch{return result('BLOCKED','JOURNAL_UNAVAILABLE')}
  const entries=new Map();
  for(const event of journal){if(ownedEntry(event.clientOrderId)){
    const row=entries.get(event.clientOrderId)??[];row.push(event);entries.set(event.clientOrderId,row);
  }}
  const audits=[];const blockers=[];
  for(const [id,events] of entries){
    const local=[];
    if(!events.some(e=>e.type==='PREPARED'))local.push('MISSING_WRITE_AHEAD_PREPARED');
    if(events.some(e=>e.type==='SUBMISSION_UNKNOWN')&&!events.some(e=>e.type==='ENTRY_RECONCILED'))local.push('UNKNOWN_ENTRY_SUBMISSION');
    const matches=orders.filter(o=>o.client_order_id===id);
    if(matches.length!==1)local.push('BROKER_ENTRY_NOT_UNIQUELY_VERIFIED');
    const entry=matches[0];const symbol=norm(entry?.symbol);
    if(entry && (entry.side!=='buy'||entry.asset_class!=='crypto'))local.push('ENTRY_IDENTITY_INVALID');
    if(entry && !terminal.has(entry.status)&&!LIVE.has(entry.status))local.push('UNKNOWN_ENTRY_STATUS');
    const filled=qty(entry?.filled_qty);
    if(entry&&filled===null)local.push('INVALID_ENTRY_FILLED_QUANTITY');
    if(entry&&filled>0){
      const same=positions.filter(p=>norm(p.symbol)===symbol&&p.asset_class==='crypto');
      if(same.length!==1)local.push('BROKER_POSITION_NOT_UNIQUELY_VERIFIED');
      const position=same[0];const brokerQty=qty(position?.qty);
      if(brokerQty===null||brokerQty<=0)local.push('BROKER_POSITION_QUANTITY_INVALID');
      if(brokerQty!==null&&filled!==null&&brokerQty>filled+1e-9)local.push('POSITION_EXCEEDS_OWNED_ENTRY_FILL');
      const foreign=orders.filter(o=>norm(o.symbol)===symbol&&o.id!==entry.id&&!ownedStop(o.client_order_id));
      if(strictExclusiveAccount&&foreign.length)local.push('FOREIGN_PAIR_ORDER_REQUIRES_RECONCILIATION');
      const stops=orders.filter(o=>norm(o.symbol)===symbol&&ownedStop(o.client_order_id)&&o.side==='sell'&&o.type==='stop_limit'&&LIVE.has(o.status));
      if(stops.length!==1)local.push('EXACTLY_ONE_ACTIVE_OWNED_STOP_REQUIRED');
      if(stops.length===1&&brokerQty!==null){
        const stop=stops[0];const requested=qty(stop.qty),sold=qty(stop.filled_qty);
        if(requested===null||sold===null||requested-sold>brokerQty+1e-9)local.push('STOP_REMAINING_QTY_EXCEEDS_BROKER_POSITION');
        if(requested!==null&&sold!==null&&requested-sold<brokerQty-1e-9)local.push('POSITION_NOT_FULLY_COVERED');
        if(!(Number(stop.stop_price)>0&&Number(stop.limit_price)>0&&Number(stop.limit_price)<Number(stop.stop_price)))local.push('INVALID_STOP_LIMIT_GEOMETRY');
      }
    }
    audits.push({clientOrderId:id,symbol:symbol||null,brokerStatus:entry?.status??null,blockers:local});
    blockers.push(...local.map(reason=>`${id}:${reason}`));
  }
  // Every untracked crypto position is unsafe, even if the journal is empty.
  for(const p of positions.filter(p=>p.asset_class==='crypto')){
    if(!audits.some(a=>a.symbol===norm(p.symbol)&&!a.blockers.includes('BROKER_ENTRY_NOT_UNIQUELY_VERIFIED')))blockers.push(`UNTRACKED_CRYPTO_POSITION:${norm(p.symbol)}`);
  }
  const activeUnknown=orders.filter(o=>o.asset_class==='crypto'&&LIVE.has(o.status)&&!ownedEntry(o.client_order_id)&&!ownedStop(o.client_order_id));
  if(activeUnknown.length)blockers.push('UNTRACKED_ACTIVE_CRYPTO_ORDERS');
  return result(blockers.length?'MANUAL_REVIEW':'AUDIT_CLEAR',blockers.length?'PROTECTION_OR_RECOVERY_BLOCKERS':'NO_BLOCKERS_OBSERVED',{
    blockers,audits,openCryptoPositions:positions.filter(p=>p.asset_class==='crypto').length,
    note:'Read-only audit. AUDIT_CLEAR does not authorize automatic entry: protective order submission, ongoing monitoring, crash recovery and exchange behavior still require independent validation.'
  });
}
export default auditAlpacaMultiAssetProtection;
