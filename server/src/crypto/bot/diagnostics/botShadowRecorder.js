import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import evaluateBotEngineShadow from "./botEngineShadowEvaluator.js";

// Observation-only: errors never affect the trading cycle. Append-only JSONL.
const outputPath=()=>path.resolve(process.cwd(),process.env.AEMA_BOT_SHADOW_PATH||"./data/aema-bot-shadow.jsonl");
const compact=c=>({
  symbol:c?.symbol??null, direction:c?.directionDecision?.direction??null,
  directionDecision:c?.directionDecision??null,
  setup:c?.setup?{approved:c.setup.approved,blockers:c.setup.blockers??[],riskReward:c.setup.riskReward??null,
    spreadPercent:c.setup.spreadPercent??null,slippagePercent:c.setup.slippagePercent??null}:null,
  executionRank:c?.executionRank??null, executionRankScore:c?.executionRankScore??null,
  learnedExecutionScore:c?.learnedExecutionScore??null,
});
export function recordBotShadowCycle({startedAt,candidates=[],orderAttempts=[],selected=null,status=null,counts=null}){
  if(process.env.AEMA_BOT_SHADOW_ENABLED==="false") return;
  try{
    const observedAt=new Date().toISOString();
    const cycleId=crypto.randomUUID();
    const attemptBySymbol=new Map(orderAttempts.map(x=>[x.symbol,x]));
    const rows=candidates.map(c=>{
      const shadow=evaluateBotEngineShadow(c);
      return {cycleId,startedAt,observedAt,status,symbol:c.symbol,
        baseline:compact(c),shadow,attempt:attemptBySymbol.get(c.symbol)??null,
        actuallySelected:Boolean(selected&&selected.symbol===c.symbol),
        hypotheticalOnly:true,paperExecutionAuthority:false};
    });
    // Capture empty and failed cycles as well, to avoid survivorship bias.
    if(!rows.length) rows.push({cycleId,startedAt,observedAt,status,counts,
      emptyCycle:true,hypotheticalOnly:true,paperExecutionAuthority:false});
    const p=outputPath();fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.appendFileSync(p,rows.map(x=>JSON.stringify(x)).join("\n")+"\n",{encoding:"utf8"});
  }catch(error){console.error("[BOT SHADOW] observation failed (execution unchanged):",error.message);}
}
export default recordBotShadowCycle;
