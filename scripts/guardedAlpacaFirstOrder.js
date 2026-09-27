import { makeAlpacaPaperGateway } from '../src/crypto/bot/alpaca/botAlpacaPaperOrderGateway.js';
import { reconcileAlpacaExecution } from '../src/crypto/bot/alpaca/botAlpacaExecutionReconciler.js';
import { submitOneGuardedAlpacaPaperOrder } from '../src/crypto/bot/alpaca/botAlpacaPaperExecutor.js';
const gateway=makeAlpacaPaperGateway();
const state=await reconcileAlpacaExecution({gateway});
console.log('RECONCILIATION',JSON.stringify(state,null,2));
if(state.status!=='RECONCILED_READ_ONLY'||state.blockers.length||state.positionQty!==0||state.entryCount!==0||state.protectionCount!==0)throw Error('PILOT_RECONCILIATION_NOT_CLEAN');
const quoteResponse=await fetch('https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=BTC/USD',{headers:{'APCA-API-KEY-ID':process.env.ALPACA_CRYPTO_API_KEY,'APCA-API-SECRET-KEY':process.env.ALPACA_CRYPTO_SECRET_KEY}});
if(!quoteResponse.ok)throw Error(`QUOTE_HTTP_${quoteResponse.status}`);
const quote=(await quoteResponse.json()).quotes?.['BTC/USD'];
const ask=Number(quote?.ap),age=Date.now()-Date.parse(quote?.t);
if(!Number.isFinite(ask)||ask<=0||!Number.isFinite(age)||age<0||age>30000)throw Error('FRESH_QUOTE_REQUIRED');
const stop=Math.floor(ask*.98*100)/100;
console.log('PILOT',{ask,stop,allocationUsd:100,orderCapUsd:25,mode:process.env.AEMA_ALPACA_MANUAL_PAPER_ORDER==='I_AUTHORIZE_ONE_PAPER_ORDER'?'AUTHORIZED_ONE_ORDER':'DRY_RUN'});
if(process.env.AEMA_ALPACA_MANUAL_PAPER_ORDER!=='I_AUTHORIZE_ONE_PAPER_ORDER'){
 const {prepareAlpacaPaperOrderPreview}=await import('../src/crypto/bot/alpaca/botAlpacaOrderPreview.js');
 console.log('PREVIEW',JSON.stringify(await prepareAlpacaPaperOrderPreview({sourceSymbol:'BTCUSD',direction:'LONG',stop,allocationQuote:100}),null,2));
 console.log('NO ORDER SENT. Protective automation is not yet verified.');
}else{
 const result=await submitOneGuardedAlpacaPaperOrder({sourceSymbol:'BTCUSD',stop,allocationQuote:100,explicitAuthorization:true,gateway});
 console.log('ORDER_RESULT',JSON.stringify(result,null,2));
 console.log('IMPORTANT: An entry may now be unprotected. Verify broker fill and install protection before leaving unattended.');
}
