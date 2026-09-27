/** No order submission. Existing stop-limit must be canceled AND confirmed before any alternate exit. */
export function decideAlpacaExit({position,entryOrder,protectiveOrder,quote,stop,target,maxQuoteAgeMs=30000}={}) {
 const blockers=[];
 if(!entryOrder?.client_order_id?.startsWith('aema-pilot-')||entryOrder.side!=='buy') blockers.push('UNOWNED_ENTRY');
 if(!position||!Number.isFinite(Number(position.qty))||Number(position.qty)<=0) blockers.push('NO_VERIFIED_POSITION');
 if(quote?.symbol!=='BTC/USD'||quote?.source!=='ALPACA_SAME_PAIR'||!Number.isFinite(Date.parse(quote?.timestamp))||Math.abs(Date.now()-Date.parse(quote.timestamp))>maxQuoteAgeMs) blockers.push('STALE_QUOTE');
 if(blockers.length)return {action:'BLOCKED',blockers,executionAuthority:false};
 const bid=Number(quote.bid);
 if(!Number.isFinite(bid)||bid<=0)return {action:'BLOCKED',blockers:['INVALID_BID'],executionAuthority:false};
 if(protectiveOrder && ['new','accepted','pending_new','partially_filled','pending_cancel','pending_replace'].includes(protectiveOrder.status))return {action:'MONITOR_EXISTING_STOP',executionAuthority:false,warning:'If stop-limit triggers without filling, operator intervention may be required.'};
 if(protectiveOrder && !['filled','canceled','expired','rejected'].includes(protectiveOrder.status))return {action:'BLOCKED',blockers:['UNKNOWN_STOP_STATUS'],executionAuthority:false};
 if(protectiveOrder?.status==='filled')return {action:'RECONCILE_FILLED_EXIT',executionAuthority:false};
 if(Number.isFinite(Number(stop))&&bid<=Number(stop))return {action:'URGENT_MANUAL_EXIT_REVIEW',executionAuthority:false};
 if(Number.isFinite(Number(target))&&Number(target)>0&&bid>=Number(target))return {action:'TARGET_REACHED_MANUAL_EXIT_REVIEW',executionAuthority:false};
 return {action:'MONITOR',executionAuthority:false};
}
export default decideAlpacaExit;
