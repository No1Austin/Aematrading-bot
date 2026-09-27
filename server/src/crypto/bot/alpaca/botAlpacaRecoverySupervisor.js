import {latestExecutionState} from './botAlpacaExecutionJournal.js';
import {makeAlpacaPaperGateway} from './botAlpacaPaperOrderGateway.js';
import planAlpacaProtection from './botAlpacaProtectionPlanner.js';
/** Recovery is read-only. Unknown states and shared-account ambiguity block trading. */
export async function inspectAlpacaRecovery({gateway=makeAlpacaPaperGateway(),journalFile,stop,quote,priceIncrement,minTradeIncrement}={}) {
 const rows=latestExecutionState(journalFile).filter(x=>x.clientOrderId?.startsWith('aema-pilot-'));
 const positions=await gateway.getPositions();
 const results=[];
 for(const row of rows){
  let entry;
  try{entry=await gateway.getOrderByClientId(row.clientOrderId)}catch(e){results.push({clientOrderId:row.clientOrderId,status:'UNRESOLVED',blockers:['ENTRY_LOOKUP_FAILED'],errorCode:e?.status||'UNKNOWN'});continue;}
  if(!entry?.id || entry.client_order_id!==row.clientOrderId){results.push({clientOrderId:row.clientOrderId,status:'UNRESOLVED',blockers:['PROVIDER_ID_MISMATCH']});continue;}
  const pairPositions=positions.filter(p=>['BTC/USD','BTCUSD'].includes(p.symbol));
  // A shared Alpaca position cannot be attributed to this bot if there are external fills.
  const ownershipAmbiguous=pairPositions.length!==1 || rows.length!==1;
  const position=pairPositions[0];
  let orders=[];
  if(typeof gateway.listOrders==='function'){
   try{orders=await gateway.listOrders()}catch{results.push({clientOrderId:row.clientOrderId,status:'UNRESOLVED',blockers:['ORDER_LIST_UNAVAILABLE']});continue;}
  } else {results.push({clientOrderId:row.clientOrderId,status:'UNRESOLVED',blockers:['ORDER_LIST_REQUIRED']});continue;}
  const samePairOrders=orders.filter(o=>['BTC/USD','BTCUSD'].includes(o.symbol) && o.id!==entry.id);
  if(samePairOrders.some(o=>!o.client_order_id?.startsWith('aema-protect-')) || ownershipAmbiguous){results.push({clientOrderId:row.clientOrderId,status:'MANUAL_REVIEW',blockers:['SHARED_ACCOUNT_OWNERSHIP_NOT_PROVEN']});continue;}
  const plan=planAlpacaProtection({entryOrder:entry,protectiveOrders:samePairOrders,position,stop,quote,priceIncrement,minTradeIncrement});
  results.push({clientOrderId:row.clientOrderId,providerOrderId:entry.id,entryStatus:entry.status,filledQty:entry.filled_qty,positionQty:position?.qty??null,protection:plan,status:plan.approved?'PROTECTION_PREVIEW_READY':'BLOCKED'});
 }
 return {provider:'ALPACA_PAPER',readOnly:true,executionAuthority:false,sharedAccount:true,results};
}
export default inspectAlpacaRecovery;
