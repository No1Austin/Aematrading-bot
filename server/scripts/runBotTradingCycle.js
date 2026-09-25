#!/usr/bin/env node
import { runBotTradingCycle } from "../src/crypto/bot/orchestration/botTradingCycle.js";
const line=(l,v)=>console.log(`${l.padEnd(30,".")} ${v}`);
const f=(v,d=4)=>Number.isFinite(Number(v))?Number(v).toFixed(d):"n/a";

try{
 console.log("\n======================================================");
 console.log(" AEMA INDEPENDENT CRYPTO BOT — PHASE 7");
 console.log("======================================================");
 console.log(" Live execution: DISABLED");
 console.log(" Paper execution: ENABLED\n");
 const r=await runBotTradingCycle();
 line("Universe",r.counts.universe);line("Hard Eligible",r.counts.hardEligible);
 line("Opportunity Qualified",r.counts.opportunityQualified);line("Top 20",r.counts.top20);
 line("Research Completed",r.counts.researchCompleted);line("Top 10",r.counts.top10);
 line("Setups Built",r.counts.setupsBuilt);line("Executable Setups",r.counts.executableSetups);

 if(r.status==="POSITION_CAP_REACHED"){
   console.log("\nPORTFOLIO CONTROL");
   console.log("------------------------------------------------------");
   console.log(`Maximum open positions reached: ${r.accountBefore.openPositions}/${r.portfolio.maximumOpenPositions}`);
   console.log("No new market scan/order is required until a position closes. Re-entry is allowed after closure.");
 }
 console.log("\nEXECUTION-QUALITY RANKING");
 console.log("------------------------------------------------------");
 if(!r.executionCandidates.length) console.log("No new candidate ranking this cycle.");
 for(const x of r.executionCandidates){
   const s=x.setup;
   const l=x.tradeLearning||{};
   console.log(`${String(x.executionRank).padStart(2)}. ${x.symbol.padEnd(14)} ${s.direction.padEnd(5)} `+
   `exec=${f(x.executionRankScore,2).padStart(6)} learned=${f(x.learnedExecutionScore,2).padStart(6)} `+
   `RR=${f(s.riskReward,2).padStart(5)} hist=${String(l.sampleSize??0).padStart(3)} `+
   `win=${l.winRate==null?"n/a":f(l.winRate,1)+"%"} expR=${l.expectancyR==null?"n/a":f(l.expectancyR,2)}`);
 }

 console.log("\nPAPER ACCOUNT BEFORE");
 console.log("------------------------------------------------------");
 line("Equity",`$${f(r.accountBefore.equityUsd,2)}`);
 line("Available Margin",`$${f(r.accountBefore.availableMarginUsd,2)}`);
 line("Open Positions",r.accountBefore.openPositions);

 if(r.orderAttempts.length){
   console.log("\nORDER ATTEMPTS");
   console.log("------------------------------------------------------");
   for(const a of r.orderAttempts)
     console.log(`#${a.executionRank} ${a.symbol}: ${a.approved?"PASS":`BLOCKED @ ${a.stage} — ${a.blockers.join(", ")}`}`);
 }

 if(r.paperExecution&&r.selectedOrderCandidate){
   const c=r.selectedOrderCandidate,p=c.riskPlan,v=c.revalidation,e=r.paperExecution;
   console.log("\nSELECTED PAPER ORDER");
   console.log("------------------------------------------------------");
   line("Symbol",c.symbol);line("Direction",c.setup.direction);
   line("Execution Rank",c.executionRank);line("Risk Budget",`$${f(p.riskBudgetUsd,2)}`);
   line("Quantity",f(p.quantity,8));line("Leverage",`${p.leverage}x`);
   line("Notional",`$${f(p.notionalUsd,2)}`);line("Margin Required",`$${f(p.marginRequiredUsd,2)}`);
   line("Fresh Entry",f(v.freshEntry,8));line("Entry Drift",`${f(v.entryDriftPercent,4)}%`);
   line("Stop",f(c.setup.stop,8));line("Target",f(c.setup.target,8));
   line("Fill Price",f(e.fill.fillPrice,8));line("Position ID",e.position.id);
 }

 console.log("\nPAPER ACCOUNT AFTER");
 console.log("------------------------------------------------------");
 line("Equity",`$${f(r.accountAfter.equityUsd,2)}`);
 line("Used Margin",`$${f(r.accountAfter.usedMarginUsd,2)}`);
 line("Available Margin",`$${f(r.accountAfter.availableMarginUsd,2)}`);
 line("Open Positions",r.accountAfter.openPositions);

 console.log("\n======================================================");
 console.log(` STATUS: ${r.status}`);console.log(` NEXT:   ${r.nextStage}`);
 console.log("======================================================\n");
}catch(e){console.error("\nBOT PHASE 7 FAILED");console.error(e?.stack||e);process.exitCode=1;}
