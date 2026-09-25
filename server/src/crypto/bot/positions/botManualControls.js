import {getBotPaperAccount,setBotControls,closeBotPaperPosition,recordBotPaperOrder,recordBotPaperFill} from "../account/botPaperLedger.js";
import recordClosedTradeToMemory from "../learning/botTradeResultRecorder.js";
import {withBotRuntimeLock} from "../runtime/botRuntime.js";
const BASE=process.env.AEMA_BOT_BINANCE_FUTURES_BASE_URL||"https://fapi.binance.com";
async function closeOne(id,reason){
 const p=getBotPaperAccount().positions.find(x=>x.id===id);
 if(!p)throw new Error("BOT_POSITION_NOT_FOUND");
 const response=await fetch(`${BASE}/fapi/v1/ticker/bookTicker?symbol=${encodeURIComponent(p.symbol)}`);
 if(!response.ok)throw new Error(`MARKET_DATA_HTTP_${response.status}`);
 const book=await response.json(),price=Number(p.direction==="LONG"?book.bidPrice:book.askPrice);
 if(!(price>0))throw new Error("INVALID_EXIT_PRICE");
 const qty=Number(p.quantity);
 if(!(qty>0))throw new Error("INVALID_POSITION_QUANTITY");
 const realized=(p.direction==="LONG"?price-Number(p.entryPrice):Number(p.entryPrice)-price)*qty;
 recordBotPaperOrder({symbol:p.symbol,positionId:id,side:p.direction==="LONG"?"SELL":"BUY",type:"MARKET",requestedQuantity:qty,status:reason});
 recordBotPaperFill({symbol:p.symbol,positionId:id,fillPrice:price,quantity:qty,notionalUsd:price*qty,source:reason});
 const closed=closeBotPaperPosition(id,{exitPrice:price,reason,realizedPnlUsd:realized});
 // Closed ledger stores the remaining position P&L; memory includes prior partial reductions.
 const memory=recordClosedTradeToMemory(p,{...closed,realizedPnlUsd:realized+(Number(p.partialRealizedPnlUsd)||0)});
 return {closed,memory};
}
export async function manuallyCloseBotPosition(id){
 return withBotRuntimeLock(()=>closeOne(id,"MANUAL_CLOSE"));
}
export async function emergencyStopBot(){
 return withBotRuntimeLock(async()=>{
  setBotControls({paused:true});
  const ids=getBotPaperAccount().positions.map(x=>x.id),closed=[],errors=[];
  for(const id of ids){try{closed.push(await closeOne(id,"EMERGENCY_STOP"));}catch(e){errors.push({id,error:e.message});}}
  return {paused:true,closed,errors,account:getBotPaperAccount()};
 });
}
