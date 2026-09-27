import { randomUUID } from 'node:crypto';
import { appendExecutionEvent, latestExecutionState } from './botAlpacaExecutionJournal.js';
import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
const MAX_ORDER_USD=25;
let inFlight=false;
export async function submitOneGuardedAlpacaPaperOrder({sourceSymbol,stop,allocationQuote,committedQuote=0,explicitAuthorization=false,gateway=makeAlpacaPaperGateway(),previewer,journalFile,now=()=>Date.now()}={}){
 if(!explicitAuthorization||process.env.AEMA_ALPACA_MANUAL_PAPER_ORDER!=='I_AUTHORIZE_ONE_PAPER_ORDER')throw Error('EXPLICIT_PAPER_ORDER_AUTHORIZATION_REQUIRED');
 if(process.env.AEMA_BOT_EXECUTION_MODE!=='INTERNAL_PAPER')throw Error('KEEP_EXISTING_BOT_IN_INTERNAL_PAPER_MODE');
 if(inFlight)throw Error('ALPACA_ORDER_SUBMISSION_IN_PROGRESS');
 if(sourceSymbol!=='BTCUSD')throw Error('INITIAL_PILOT_BTCUSD_ONLY');
 if(!Number.isFinite(stop)||stop<=0)throw Error('PERSISTED_STOP_REQUIRED');
 if(!Number.isFinite(allocationQuote)||allocationQuote<=0||allocationQuote>100)throw Error('PILOT_ALLOCATION_LIMIT_100_USD');
 inFlight=true;
 try{
  const pin=process.env.AEMA_CRYPTO_ALPACA_ACCOUNT_ID;
  if(!pin)throw Error('DEDICATED_ACCOUNT_NOT_PINNED');
  const account=await gateway.getAccount();
  if(account?.id!==pin||account.status!=='ACTIVE'||account.crypto_status!=='ACTIVE'||account.trading_blocked||account.account_blocked)throw Error('DEDICATED_ACCOUNT_VERIFICATION_FAILED');
  if(Number(account.cash)<MAX_ORDER_USD)throw Error('INSUFFICIENT_PAPER_CASH');
  if(latestExecutionState(journalFile).length)throw Error('PILOT_ALREADY_ATTEMPTED_REVIEW_JOURNAL_BEFORE_NEXT_ORDER');
  // Do not place an entry while an existing BTC position/order is present.
  const [positions,orders]=await Promise.all([gateway.getPositions(),gateway.listOrders()]);
  if(!Array.isArray(positions)||!Array.isArray(orders))throw Error('BROKER_STATE_UNAVAILABLE');
  if(positions.some(p=>['BTC/USD','BTCUSD'].includes(p.symbol))||orders.some(o=>['BTC/USD','BTCUSD'].includes(o.symbol)&&!['filled','canceled','expired','rejected'].includes(o.status)))throw Error('BTC_POSITION_OR_OPEN_ORDER_EXISTS');
  const actualPreviewer=previewer||(await import('./botAlpacaOrderPreview.js')).default;
  const preview=await actualPreviewer({sourceSymbol,stop,allocationQuote,committedQuote,persist:false});
  const age=now()-Date.parse(preview.quoteObservedAt);
  if(!preview.approvedForPreview||preview.executionAuthority!==false||preview.pair!=='BTC/USD'||preview.direction!=='LONG'||!Number.isFinite(preview.quantity)||preview.quantity<=0||!Number.isFinite(preview.indicativeAsk)||preview.indicativeAsk<=0||!Number.isFinite(age)||age<0||age>30000)throw Error(`FRESH_APPROVED_PREVIEW_REQUIRED:${(preview.blockers||[]).join(',')}`);
  const maxQty=Math.floor((Math.min(MAX_ORDER_USD,allocationQuote*.25)/preview.indicativeAsk)*1e9)/1e9;
  const qty=Math.min(preview.quantity,maxQty);
  if(!(qty>=0.000012603)||qty*preview.indicativeAsk>MAX_ORDER_USD+0.001)throw Error('PILOT_QUANTITY_INVALID');
  const clientOrderId=`aema-pilot-${randomUUID()}`;
  appendExecutionEvent({type:'PREPARED',clientOrderId,pair:'BTC/USD',qty,indicativeAsk:preview.indicativeAsk,previewAt:preview.quoteObservedAt,stop,accountIdSuffix:pin.slice(-4)},journalFile);
  try{
   const order=await gateway.submit({symbol:'BTC/USD',qty:qty.toFixed(9),side:'buy',type:'market',time_in_force:'gtc',client_order_id:clientOrderId});
   if(!order?.id||order.client_order_id!==clientOrderId)throw Error('BROKER_ORDER_RESPONSE_UNVERIFIED');
   appendExecutionEvent({type:'SUBMITTED',clientOrderId,providerOrderId:order.id,providerStatus:order.status,filledQty:order.filled_qty,filledAvgPrice:order.filled_avg_price},journalFile);
   return {status:'PAPER_ORDER_SUBMITTED_NOT_YET_PROTECTED',clientOrderId,providerOrderId:order.id,providerStatus:order.status,paperOnly:true};
  }catch(e){appendExecutionEvent({type:'SUBMISSION_UNKNOWN',clientOrderId,errorCode:e?.status||e?.code||'UNKNOWN'},journalFile);return {status:'SUBMISSION_UNKNOWN_RECONCILE_BEFORE_RETRY',clientOrderId,paperOnly:true};}
 }finally{inFlight=false;}
}
export default submitOneGuardedAlpacaPaperOrder;
