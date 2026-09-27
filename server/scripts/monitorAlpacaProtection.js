// Read-only monitoring of the dedicated Alpaca PAPER account.
// Does not submit/cancel orders or modify either journal.
import { makeAlpacaPaperGateway } from '../src/crypto/bot/alpaca/botAlpacaPaperOrderGateway.js';
import { readExecutionJournal } from '../src/crypto/bot/alpaca/botAlpacaExecutionJournal.js';

const btc = s => s === 'BTCUSD' || s === 'BTC/USD';
const live = new Set(['new','accepted','pending_new','partially_filled','pending_cancel','pending_replace','accepted_for_bidding','held','stopped','suspended']);
const positive = v => Number.isFinite(Number(v)) && Number(v) > 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function assess({account, positions, orders, journal, pin}) {
  const alerts=[];
  if (!pin || account?.id !== pin) return {status:'BLOCKED',alerts:['ACCOUNT_PIN_MISMATCH']};
  if (!Array.isArray(positions) || !Array.isArray(orders)) return {status:'BLOCKED',alerts:['INVALID_BROKER_RESPONSE']};
  const btcPositions=positions.filter(p=>btc(p.symbol));
  const btcOrders=orders.filter(o=>btc(o.symbol));
  const active=btcOrders.filter(o=>live.has(o.status));
  const entryIds=[...new Set(journal.records.filter(r=>r.type==='PREPARED' && r.clientOrderId?.startsWith('aema-pilot-')).map(r=>r.clientOrderId))];
  const protectionIds=[...new Set(journal.records.filter(r=>r.type==='PROTECTION_PREPARED' && r.clientOrderId?.startsWith('aema-protect-')).map(r=>r.clientOrderId))];
  const qty=btcPositions.reduce((n,p)=>n+(Number(p.qty)||0),0);
  const protective=active.filter(o=>o.side==='sell' && o.type==='stop_limit' && protectionIds.includes(o.client_order_id));
  const coverage=protective.reduce((n,o)=>n+Math.max(0,Number(o.qty)-Number(o.filled_qty||0)),0);
  const foreignActive=active.filter(o=>!entryIds.includes(o.client_order_id) && !protectionIds.includes(o.client_order_id));
  if (btcPositions.length>1) alerts.push('MULTIPLE_BTC_POSITIONS');
  if (foreignActive.length) alerts.push('FOREIGN_ACTIVE_BTC_ORDER');
  if (active.some(o=>entryIds.includes(o.client_order_id))) alerts.push('ENTRY_ORDER_STILL_ACTIVE');
  if (protectionIds.some(id=>!btcOrders.some(o=>o.client_order_id===id))) alerts.push('TRACKED_PROTECTION_NOT_IN_ORDER_RESPONSE_VERIFY_BY_ID');
  if (btcOrders.some(o=>protectionIds.includes(o.client_order_id) && ['rejected','canceled','expired'].includes(o.status))) alerts.push('PROTECTION_TERMINATED');
  if (btcOrders.some(o=>protectionIds.includes(o.client_order_id) && o.status==='stopped')) alerts.push('STOP_TRIGGERED_VERIFY_FILL');
  if (qty>0 && (!positive(coverage) || coverage + 1e-9 < qty)) alerts.push('OPEN_POSITION_NOT_FULLY_COVERED');
  if (qty===0 && active.some(o=>o.side==='sell')) alerts.push('ACTIVE_SELL_ORDER_WITHOUT_POSITION');
  if (qty===0 && entryIds.length && !active.length) return {status:alerts.length?'MANUAL_REVIEW':'FLAT',positionQty:qty,coveredQty:coverage,alerts,entryCount:entryIds.length};
  return {status:alerts.length?'MANUAL_REVIEW':qty>0?'COVERAGE_OBSERVED':'NO_POSITION',positionQty:qty,coveredQty:coverage,alerts,entryCount:entryIds.length};
}

export async function check({gateway=makeAlpacaPaperGateway(),journalFile,pin=process.env.AEMA_CRYPTO_ALPACA_ACCOUNT_ID}={}) {
  const journal=readExecutionJournal(journalFile);
  // Request all orders using the existing gateway; pagination/retention can limit historical coverage.
  const [account,positions,orders]=await Promise.all([gateway.getAccount(),gateway.getPositions(),gateway.listOrders()]);
  const result=assess({account,positions,orders,journal,pin});
  if (result.alerts?.includes('TRACKED_PROTECTION_NOT_IN_ORDER_RESPONSE_VERIFY_BY_ID')) {
    const ids=[...new Set(journal.records.filter(r=>r.type==='PROTECTION_PREPARED').map(r=>r.clientOrderId))];
    for (const id of ids) {
      if (orders.some(o=>o.client_order_id===id)) continue;
      try { const o=await gateway.getOrderByClientId(id); if(o?.client_order_id===id) orders.push(o); }
      catch { /* remain fail closed */ }
    }
    return assess({account,positions,orders,journal,pin});
  }
  return result;
}

if (process.argv[1]?.endsWith('monitorAlpacaProtection.js')) {
  const once=process.argv.includes('--once');
  const interval=Number(process.env.AEMA_ALPACA_MONITOR_INTERVAL_MS||5000);
  if(!once && (!Number.isInteger(interval)||interval<5000)) throw Error('MONITOR_INTERVAL_MIN_5000_MS');
  do {
    try {
      const result=await check();
      console.log(JSON.stringify({at:new Date().toISOString(),...result}));
      if(result.status==='MANUAL_REVIEW'||result.status==='BLOCKED') {
        console.error('CRITICAL: Review dedicated Alpaca paper account. Monitoring is read-only.');
        process.exitCode=2;
        break;
      }
    } catch(e) {
      console.error('CRITICAL: MONITOR_UNAVAILABLE',e?.message);
      process.exitCode=2;
      break;
    }
    if(once)break;
    await sleep(interval);
  } while(true);
}
