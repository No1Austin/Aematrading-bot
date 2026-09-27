// Run from server/. Dry run by default. Explicit opt-in submits exactly one paper entry.
import { makeAlpacaPaperGateway } from '../src/crypto/bot/alpaca/botAlpacaPaperOrderGateway.js';
import { readExecutionJournal } from '../src/crypto/bot/alpaca/botAlpacaExecutionJournal.js';
import { reconcileAlpacaExecution } from '../src/crypto/bot/alpaca/botAlpacaExecutionReconciler.js';
import { submitOneGuardedAlpacaPaperOrder } from '../src/crypto/bot/alpaca/botAlpacaPaperExecutor.js';
import { superviseAlpacaProtection } from '../src/crypto/bot/alpaca/botAlpacaProtectionSupervisor.js';

const gateway=makeAlpacaPaperGateway();
const authorized=process.env.AEMA_ALPACA_MANUAL_PAPER_ORDER==='I_AUTHORIZE_ONE_PAPER_ORDER' && process.env.AEMA_ALPACA_PROTECTION_SUBMISSION==='I_AUTHORIZE_PAPER_PROTECTION';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const headers={'APCA-API-KEY-ID':process.env.ALPACA_CRYPTO_API_KEY,'APCA-API-SECRET-KEY':process.env.ALPACA_CRYPTO_SECRET_KEY};
const getJson=async(url)=>{const r=await fetch(url,{headers,signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`READ_HTTP_${r.status}`);return r.json();};
const freshQuote=async()=>{
  for(let i=0;i<5;i++){
    const q=(await getJson('https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=BTC/USD')).quotes?.['BTC/USD'];
    const age=Date.now()-Date.parse(q?.t);
    if(Number(q?.ap)>0&&Number(q?.bp)>0&&Number.isFinite(age)&&age>=0&&age<=30000)return q;
    if(i<4)await pause(5000);
  }
  throw Error('FRESH_SAME_PAIR_QUOTE_UNAVAILABLE');
};
const asset=await getJson('https://paper-api.alpaca.markets/v2/assets/BTCUSD');
if(!(Number(asset.min_trade_increment)>0&&Number(asset.price_increment)>0))throw Error('ASSET_INCREMENTS_UNAVAILABLE');
if(process.env.AEMA_BOT_EXECUTION_MODE!=='INTERNAL_PAPER')throw Error('INTERNAL_SIMULATOR_ISOLATION_REQUIRED');
const state=await reconcileAlpacaExecution({gateway});
console.log('RECONCILIATION',JSON.stringify(state,null,2));
if(state.blockers?.length||state.status!=='RECONCILED_READ_ONLY')throw Error('RECONCILIATION_BLOCKED');
let entries=[...new Set(readExecutionJournal().records.filter(r=>r.type==='PREPARED'&&r.clientOrderId?.startsWith('aema-pilot-')).map(r=>r.clientOrderId))];
if(entries.length>1)throw Error('MULTIPLE_ENTRIES_MANUAL_REVIEW');
if(!entries.length){
  if(state.positionQty!==0||state.entryCount!==0||state.protectionCount!==0)throw Error('NONEMPTY_BROKER_STATE');
  const q=await freshQuote();
  const stop=Math.floor(Number(q.ap)*.98*100)/100;
  console.log('PROPOSED_PILOT',JSON.stringify({ask:q.ap,stop,maxOrderUsd:25,mode:authorized?'AUTHORIZED_PAPER':'DRY_RUN'},null,2));
  if(!authorized){
    const {prepareAlpacaPaperOrderPreview}=await import('../src/crypto/bot/alpaca/botAlpacaOrderPreview.js');
    const preview=await prepareAlpacaPaperOrderPreview({sourceSymbol:'BTCUSD',direction:'LONG',stop,allocationQuote:100});
    console.log('PREVIEW',JSON.stringify(preview,null,2));
    console.log('NO ORDER SENT');process.exit(0);
  }
  const result=await submitOneGuardedAlpacaPaperOrder({sourceSymbol:'BTCUSD',stop,allocationQuote:100,explicitAuthorization:true,gateway});
  console.log('ENTRY',JSON.stringify(result,null,2));
  if(result.status!=='PAPER_ORDER_SUBMITTED_NOT_YET_PROTECTED')throw Error('ENTRY_UNCERTAIN_MANUAL_RECONCILIATION_REQUIRED');
  entries=[result.clientOrderId];
}else console.log('RECOVERY_EXISTING_ENTRY',entries[0]);
// Never silently authorize protection on restart: authorization must be explicit each run.
for(let attempt=1;attempt<=12;attempt++){
  const q=await freshQuote();
  const result=await superviseAlpacaProtection({gateway,
    quote:{symbol:'BTC/USD',source:'ALPACA_SAME_PAIR',bid:q.bp,timestamp:q.t},
    priceIncrement:asset.price_increment,minTradeIncrement:asset.min_trade_increment,
    allowProtectionSubmit:authorized,alert:x=>console.error('CRITICAL_ALERT',JSON.stringify(x))});
  console.log('PROTECTION',JSON.stringify({attempt,result},null,2));
  if(result.status==='PROTECTION_PRESENT'){
    console.log('PILOT_PROTECTION_ACCEPTED; continue supervising broker order and stop-limit fills; not continuous-trading authorization.');
    process.exit(0);
  }
  if(result.status==='WAITING_FOR_ENTRY_FILL'){await pause(5000);continue;}
  if(result.status==='PROTECTION_READY_NOT_SUBMITTED')process.exit(0);
  console.error('CRITICAL: Inspect dedicated Alpaca paper account immediately if BTC position is open.');
  process.exit(2);
}
console.error('CRITICAL: Entry fill/protection not confirmed within 60 seconds; inspect Alpaca paper account immediately.');
process.exit(2);
