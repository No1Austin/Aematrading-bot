import {makeAlpacaPaperGateway} from '../src/crypto/bot/alpaca/botAlpacaPaperOrderGateway.js';
import {readExecutionJournal} from '../src/crypto/bot/alpaca/botAlpacaExecutionJournal.js';
const gateway=makeAlpacaPaperGateway();
try {
 const journal=readExecutionJournal();
 const ids=[...new Set(journal.records.filter(x=>x.clientOrderId?.startsWith('aema-pilot-')).map(x=>x.clientOrderId))];
 const [positions,orders]=await Promise.all([gateway.getPositions(),gateway.listOrders()]);
 console.log(JSON.stringify({status:'READ_ONLY',paperOnly:true,automaticProtectionEnabled:false,entryIds:ids,btcPositions:positions.filter(p=>['BTC/USD','BTCUSD'].includes(p.symbol)).map(p=>({symbol:p.symbol,qty:p.qty})),btcOrders:orders.filter(o=>['BTC/USD','BTCUSD'].includes(o.symbol)).map(o=>({clientOrderId:o.client_order_id,status:o.status,side:o.side,filledQty:o.filled_qty})),warning:'Shared-account position ownership is not established. Do not enable protective submission.'},null,2));
}catch(e){console.error('ALPACA_PHASE3D_READ_FAILED:',e.message);process.exitCode=1;}
