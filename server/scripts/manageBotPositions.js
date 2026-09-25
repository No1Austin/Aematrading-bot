#!/usr/bin/env node
import manageBotOpenPositions from "../src/crypto/bot/positions/botPositionManager.js";
const f=(v,d=2)=>Number.isFinite(Number(v))?Number(v).toFixed(d):"n/a";
try{
 const r=await manageBotOpenPositions();
 console.log("\n======================================================");
 console.log(" AEMA BOT — TRADING CONSISTENCY MANAGER");
 console.log("======================================================");
 console.log(`Open before: ${r.before.openPositions}`);
 for(const x of r.results){
   console.log(`\n${x.symbol}: ${x.action}`);
   if(x.consistency){
     console.log(` consistency=${x.consistency.status}`);
     console.log(` ratio=${f(x.consistency.ratio,4)}`);
     console.log(` entryDirection=${x.consistency.entryDirection} currentDirection=${x.consistency.currentDirection}`);
     console.log(` reason=${x.consistency.reason}`);
   }
   if(x.leverage) console.log(` leverage=${x.leverage}x`);
   if(x.realizedPnlUsd!=null) console.log(` realized=$${f(x.realizedPnlUsd)}`);
   if(x.error) console.log(` error=${x.error}`);
 }
 console.log(`\nOpen after: ${r.after.openPositions}`);
 console.log(`Equity=$${f(r.after.equityUsd)} Unrealized=$${f(r.after.unrealizedPnlUsd)} Realized=$${f(r.after.realizedPnlUsd)}`);
 console.log(`Ledger=${r.after.ledgerPath}`);
 console.log("======================================================\n");
}catch(e){console.error(e?.stack||e);process.exitCode=1}
