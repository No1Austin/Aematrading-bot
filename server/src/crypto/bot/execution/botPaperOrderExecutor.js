import simulateBotPaperMarketFill from "./botPaperExchange.js";
import {recordBotPaperOrder,recordBotPaperFill,openBotPaperPosition} from "../account/botPaperLedger.js";
import buildSetupFingerprint from "../learning/botSetupFingerprint.js";

export function executeBotPaperOrder(candidate){
  if(!candidate?.revalidation?.approved) throw new Error("BOT_FINAL_REVALIDATION_REQUIRED");
  const p=candidate.riskPlan,s=candidate.setup;
  const order=recordBotPaperOrder({
    symbol:candidate.symbol,side:s.direction==="LONG"?"BUY":"SELL",type:"MARKET",
    requestedQuantity:p.quantity,plannedEntry:s.entry,stop:s.stop,target:s.target,
    leverage:p.leverage,status:"SUBMITTED"
  });
  const fill=recordBotPaperFill({...simulateBotPaperMarketFill(candidate),orderId:order.id});
  const position=openBotPaperPosition({
    symbol:candidate.symbol,direction:s.direction,quantity:fill.quantity,
    entryPrice:fill.fillPrice,notionalUsd:fill.notionalUsd,leverage:fill.leverage,
    marginUsedUsd:fill.marginUsedUsd,stop:s.stop,target:s.target,
    plannedRiskUsd:p.plannedRiskUsd,orderId:order.id,fillId:fill.id,status:"OPEN",
    entryAsset:candidate.asset,
    entryDirectionDecision:candidate.directionDecision,
    entryResearchRankScore:candidate.researchRankScore,
    entryExecutionRankScore:candidate.executionRankScore,
    initialQuantity:fill.quantity,
    initialNotionalUsd:fill.notionalUsd,
    initialLeverage:fill.leverage,
    initialStop:s.stop,
    initialTarget:s.target,
    initialPlannedRiskUsd:p.plannedRiskUsd,
    maximumFavorableExcursionUsd:0,
    maximumAdverseExcursionUsd:0,
    highestPriceSinceEntry:fill.fillPrice,
    lowestPriceSinceEntry:fill.fillPrice,
    trailingActive:false,
    trailingStop:null,
    trailingActivatedAt:null,
    entrySetupFingerprint:buildSetupFingerprint(candidate),
    entryCandidateSnapshot:{
      symbol:candidate.symbol,
      opportunityScore:candidate.opportunityScore,
      directionDecision:candidate.directionDecision,
      researchRankScore:candidate.researchRankScore,
      executionRankScore:candidate.executionRankScore,
      setup:candidate.setup,
      engines:candidate.engines || candidate.research?.engines || null
    }
  });
  return {order,fill,position,status:"PAPER_POSITION_OPEN",paperOnly:true,liveExecution:false};
}
export default executeBotPaperOrder;
