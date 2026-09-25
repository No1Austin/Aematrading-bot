import PHASE5 from "../config/botPhase5Config.js";
import getBotResearchMarketEvidence from "../research/botResearchMarketProvider.js";
import { runAllBotResearchEngines } from "../research/botResearchEngines.js";
import determineBotDirection from "../direction/botDirectionEngine.js";

export async function evaluateBotTradingConsistency(position, options={}) {
  const cfg={...PHASE5.consistency,...options};
  if(!position?.entryAsset || !position?.entryDirectionDecision)
    return {action:"EXIT",status:"INVALIDATED",reason:"ENTRY_THESIS_SNAPSHOT_MISSING",ratio:0};

  const evidence=await getBotResearchMarketEvidence(position.entryAsset, options.research);
  const engines=runAllBotResearchEngines(position.entryAsset,evidence);
  const current=determineBotDirection({symbol:position.symbol,asset:position.entryAsset,engines}).directionDecision;

  const entrySide=position.direction==="LONG"
    ? Number(position.entryDirectionDecision.longScore)
    : Number(position.entryDirectionDecision.shortScore);
  const currentSide=position.direction==="LONG" ? Number(current.longScore) : Number(current.shortScore);
  const ratio=entrySide>0 && Number.isFinite(currentSide) ? currentSide/entrySide : 0;
  const flipped=current.direction && current.direction!==position.direction;

  let action="HOLD",status="CONSISTENT",reason="ENTRY_THESIS_CONTINUES";
  if((cfg.directionFlipExit&&flipped)||ratio<=cfg.invalidatedRatio){
    action="EXIT"; status="INVALIDATED"; reason=flipped?"DIRECTION_FLIPPED":"ENTRY_THESIS_COLLAPSED";
  } else if(ratio<cfg.weakenedRatio){
    action="REDUCE"; status="WEAKENED"; reason="ENTRY_THESIS_WEAKENED";
  } else if(ratio>=cfg.strengthenedRatio){
    action="ADD"; status="STRENGTHENED"; reason="ENTRY_THESIS_STRENGTHENED";
  }
  return {action,status,reason,ratio:Number(ratio.toFixed(4)),flipped,
    entryDirection:position.direction,currentDirection:current.direction,
    entrySideScore:entrySide,currentSideScore:currentSide,currentDirectionDecision:current,
    observedAt:new Date().toISOString(),executionAuthority:false,liveExecution:false};
}
export default evaluateBotTradingConsistency;
