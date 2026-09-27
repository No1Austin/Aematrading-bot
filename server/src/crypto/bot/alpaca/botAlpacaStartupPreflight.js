import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
import { readExecutionJournal } from './botAlpacaExecutionJournal.js';
const BTC = new Set(['BTC/USD','BTCUSD']);
const OPEN = new Set(['new','accepted','pending_new','partially_filled','pending_cancel','pending_replace','held','stopped','suspended']);
const OWN = id => typeof id === 'string' && (id.startsWith('aema-pilot-') || id.startsWith('aema-protect-'));
// READ ONLY. Never infer exclusive position ownership from symbol alone.
export async function inspectDedicatedAlpacaStartup({gateway=makeAlpacaPaperGateway(),journalFile,expectedAccountId=process.env.AEMA_CRYPTO_ALPACA_ACCOUNT_ID}={}) {
  const reasons=[];
  if(process.env.ALPACA_CRYPTO_BASE_URL?.replace(/\/+$/,'')!=='https://paper-api.alpaca.markets') reasons.push('INVALID_PAPER_ENDPOINT');
  if(!expectedAccountId) reasons.push('PIN_DEDICATED_ACCOUNT_ID');
  const journal=readExecutionJournal(journalFile);
  if(journal.records.some(r=>r.type==='SUBMISSION_UNKNOWN'||r.type==='PROTECTION_SUBMISSION_UNKNOWN')) reasons.push('UNKNOWN_SUBMISSION_REQUIRES_MANUAL_RECONCILIATION');
  let account,positions,orders;
  try {
    [account,positions,orders]=await Promise.all([gateway.getAccount(),gateway.getPositions(),gateway.listOrders()]);
  } catch(e) {return {status:'BLOCKED',readOnly:true,reasons:[...reasons,'BROKER_RECONCILIATION_FAILED'],errorCode:e.status||e.code||'UNKNOWN'};}
  if(account?.id!==expectedAccountId) reasons.push('ACCOUNT_ID_MISMATCH');
  if(account?.status!=='ACTIVE'||account?.crypto_status!=='ACTIVE'||account?.trading_blocked||account?.account_blocked) reasons.push('ACCOUNT_NOT_TRADABLE');
  if(!Array.isArray(positions)||!Array.isArray(orders)) reasons.push('INVALID_BROKER_RESPONSE');
  const btcPositions=Array.isArray(positions)?positions.filter(p=>BTC.has(p.symbol)):[];
  const btcOrders=Array.isArray(orders)?orders.filter(o=>BTC.has(o.symbol)):[];
  if(btcOrders.some(o=>!OWN(o.client_order_id))) reasons.push('FOREIGN_BTC_ORDER_REQUIRES_REVIEW');
  if(btcPositions.length) reasons.push('EXISTING_BTC_POSITION_REQUIRES_OWNERSHIP_RECONCILIATION');
  if(btcOrders.some(o=>OPEN.has(o.status))) reasons.push('OPEN_BTC_ORDER_REQUIRES_RECONCILIATION');
  const journalIds=new Set(journal.records.map(r=>r.clientOrderId));
  if(btcOrders.some(o=>OWN(o.client_order_id)&&!journalIds.has(o.client_order_id))) reasons.push('UNJOURNALED_BROKER_ORDER');
  return {status:reasons.length?'BLOCKED':'READY_FOR_GUARDED_TESTS',readOnly:true,executionEnabled:false,
    accountIdSuffix:String(account?.id||'').slice(-4),cash:account?.cash,equity:account?.equity,
    btcPositionCount:btcPositions.length,btcOrderCount:btcOrders.length,reasons};
}
export default inspectDedicatedAlpacaStartup;
