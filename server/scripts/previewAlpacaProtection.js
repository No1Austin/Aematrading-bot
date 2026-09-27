import { superviseAlpacaProtection } from '../src/crypto/bot/alpaca/botAlpacaProtectionSupervisor.js';
import { makeAlpacaPaperGateway } from '../src/crypto/bot/alpaca/botAlpacaPaperOrderGateway.js';
const gateway=makeAlpacaPaperGateway();
// IMPORTANT: Supply stop explicitly. The existing entry executor does not journal its stop.
const stop=Number(process.env.AEMA_PILOT_BTC_STOP_USD);
if(!Number.isFinite(stop)||stop<=0) {
  console.log(JSON.stringify({status:'BLOCKED',reason:'SET_AEMA_PILOT_BTC_STOP_USD_TO_ORIGINAL_PILOT_STOP'},null,2));
  process.exit(0);
}
const headers={'APCA-API-KEY-ID':process.env.ALPACA_CRYPTO_API_KEY,'APCA-API-SECRET-KEY':process.env.ALPACA_CRYPTO_SECRET_KEY};
const r=await fetch('https://data.alpaca.markets/v1beta3/crypto/us/latest/quotes?symbols=BTC/USD',{headers});
if(!r.ok) throw Error(`QUOTE_HTTP_${r.status}`);
const q=(await r.json()).quotes?.['BTC/USD'];
const assetR=await fetch('https://paper-api.alpaca.markets/v2/assets/BTCUSD',{headers});
if(!assetR.ok) throw Error(`ASSET_HTTP_${assetR.status}`);
const asset=await assetR.json();
const result=await superviseAlpacaProtection({gateway,stop,quote:{symbol:'BTC/USD',source:'ALPACA_SAME_PAIR',bid:q?.bp,timestamp:q?.t},priceIncrement:asset.price_increment,minTradeIncrement:asset.min_trade_increment,allowProtectionSubmit:false,alert:x=>console.error('ALERT',x)});
console.log(JSON.stringify({result,assetMetadata:{symbol:asset.symbol,minTradeIncrement:asset.min_trade_increment,priceIncrement:asset.price_increment},quoteAgeSeconds:q?.t?(Date.now()-Date.parse(q.t))/1000:null},null,2));
