/** Pure, read-only protection decisions. Crypto supports stop_limit, not stop-market/bracket. */
const n = v => Number(v);
const good = v => Number.isFinite(v) && v > 0;
const TERMINAL = new Set(['filled','canceled','expired','rejected']);
export function planAlpacaProtection({entryOrder, protectiveOrders=[], position, stop, priceIncrement, minTradeIncrement, quote, maxQuoteAgeMs=30000, slippagePercent=1}={}) {
 const blockers=[];
 if (!entryOrder?.client_order_id?.startsWith('aema-pilot-') || entryOrder?.side!=='buy' || !['BTC/USD','BTCUSD'].includes(entryOrder.symbol)) blockers.push('NOT_OWNED_ENTRY');
 if (!good(n(entryOrder?.filled_qty)) || !['filled','partially_filled'].includes(entryOrder?.status)) blockers.push('NO_CONFIRMED_ENTRY_FILL');
 if (!position || !['BTC/USD','BTCUSD'].includes(position.symbol)) blockers.push('POSITION_NOT_VERIFIED');
 const pending=protectiveOrders.filter(o=>!TERMINAL.has(o.status));
 if (pending.length) blockers.push('EXISTING_PROTECTIVE_OR_EXIT_ORDER');
 const qty=Math.min(n(entryOrder?.filled_qty),n(position?.qty));
 const inc=n(minTradeIncrement),tick=n(priceIncrement),s=n(stop);
 if (![qty,inc,tick,s].every(good)) blockers.push('INVALID_SIZE_OR_STOP');
 if (!good(n(quote?.bid)) || quote?.symbol!=='BTC/USD' || quote?.source!=='ALPACA_SAME_PAIR' || !Number.isFinite(Date.parse(quote?.timestamp)) || Math.abs(Date.now()-Date.parse(quote?.timestamp))>maxQuoteAgeMs) blockers.push('FRESH_EXACT_PAIR_QUOTE_REQUIRED');
 if (good(n(quote?.bid)) && good(s) && n(quote.bid)<=s) blockers.push('STOP_ALREADY_BREACHED_MANUAL_REVIEW');
 const floor=(value,step)=>Math.floor((value+step*1e-8)/step)*step;
 const roundedQty=good(inc)&&good(qty)?Number(floor(qty,inc).toFixed(9)):0;
 const limit=good(tick)&&good(s)?Number(floor(s*(1-slippagePercent/100),tick).toFixed(9)):0;
 if (!(roundedQty>0) || !(limit>0 && limit<s)) blockers.push('INVALID_PROTECTIVE_ORDER');
 return {approved:blockers.length===0,blockers,executionAuthority:false,readOnly:true,order:blockers.length?null:{symbol:'BTC/USD',side:'sell',type:'stop_limit',time_in_force:'gtc',qty:roundedQty.toFixed(9),stop_price:s.toFixed(9),limit_price:limit.toFixed(9)},warning:'Stop-limit may trigger without filling; no guarantee against losses or gaps.'};
}
export default planAlpacaProtection;
