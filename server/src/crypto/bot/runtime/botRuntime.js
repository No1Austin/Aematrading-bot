import PHASE5 from "../config/botPhase5Config.js";
import PHASE7 from "../config/botPhase7Config.js";
import manageBotOpenPositions from "../positions/botPositionManager.js";
import {runBotTradingCycle} from "../orchestration/botTradingCycle.js";
import {getBotPaperAccount} from "../account/botPaperLedger.js";

let timer=null,busy=false,cycle=0;
export function isBotRuntimeBusy(){return busy;}
export function isBotRuntimeRunning(){return Boolean(timer);}
export async function withBotRuntimeLock(action){if(busy)throw new Error("BOT_RUNTIME_BUSY_RETRY");busy=true;try{return await action();}finally{busy=false;}}
const f=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):"n/a";
function printManagement(r){
  cycle++;
  console.log(`\n[${new Date().toLocaleTimeString()}] POSITION CYCLE #${cycle}`);
  console.log("------------------------------------------------------");
  if(!r.results.length) console.log("No open positions.");
  for(const x of r.results){
    const c=x.consistency||{};
    console.log(`${x.symbol} ${x.direction||""} | ${x.action}`+
      `${x.reason?` | ${x.reason}`:""} | P&L=$${f(x.unrealizedPnlUsd,2)}`+
      ` | R=${f(x.rMultiple,2)} | consistency=${c.ratio==null?"n/a":f(c.ratio,3)}`+
      ` | trail=${x.trailing?"ON":"OFF"}${x.trailingStop?` @ ${f(x.trailingStop,8)}`:""}`);
    if(x.memory) console.log(`  TRADE MEMORY SAVED → ${x.memory.outcome} | P&L=$${f(x.memory.realizedPnlUsd,2)} | R=${f(x.memory.rMultiple,2)}`);
  }
  console.log(`Account: equity=$${f(r.after.equityUsd,2)} open=${r.after.openPositions}/${PHASE7.portfolio.maximumOpenPositions} available=$${f(r.after.availableMarginUsd,2)}`);
}
function printRefill(r){
  if(r.status==="PAPER_POSITION_OPEN"&&r.paperExecution?.position)
    console.log(`AUTO-REFILL → OPENED ${r.paperExecution.position.symbol} ${r.paperExecution.position.direction} | positions=${r.accountAfter.openPositions}/${PHASE7.portfolio.maximumOpenPositions}`);
  else if(r.status!=="POSITION_CAP_REACHED")
    console.log(`AUTO-REFILL → ${r.status}`);
}
export function startBotPositionRuntime(options={}){
  if(timer) return {started:false,reason:"ALREADY_RUNNING"};
  const intervalMs=Number(options.intervalMs||PHASE5.consistency.intervalMs);
  const tick=async()=>{
    if(busy)return; busy=true;
    try{
      const managed=await manageBotOpenPositions(options);
      if(PHASE7.runtime.printEveryCycle) printManagement(managed);
      let account=getBotPaperAccount();
      // Fill empty portfolio slots. Each trading cycle can open at most one position.
      while(!account.controls?.paused && PHASE7.portfolio.refillEmptySlotsFromRuntime &&
            account.openPositions<PHASE7.portfolio.maximumOpenPositions){
        const trade=await runBotTradingCycle(options);
        printRefill(trade);
        if(trade.status!=="PAPER_POSITION_OPEN") break;
        account=getBotPaperAccount();
      }
    }catch(e){console.error("[BOT POSITION RUNTIME]",e?.stack||e)}
    finally{busy=false}
  };
  timer=setInterval(tick,intervalMs); tick();
  return {started:true,intervalMs,maximumOpenPositions:PHASE7.portfolio.maximumOpenPositions,
    paperOnly:true,liveExecution:false};
}
export function stopBotPositionRuntime(){if(timer)clearInterval(timer);timer=null;return {stopped:true}}
