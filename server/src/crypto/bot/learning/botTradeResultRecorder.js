import {appendTradeMemory} from "./botTradeMemoryStore.js";
import buildSetupFingerprint from "./botSetupFingerprint.js";

export function recordClosedTradeToMemory(position,closed){
  const entry=Number(position.entryPrice), exit=Number(closed.exitPrice);
  const qty=Number(position.quantity)||0;
  const realized=Number(closed.realizedPnlUsd)||0;
  const initialRisk=Math.max(Number(position.initialPlannedRiskUsd ?? position.plannedRiskUsd)||0,0);
  const notional=Math.max(Number(position.initialNotionalUsd ?? position.notionalUsd)||0,0);
  const returnPercent=notional>0?realized/notional*100:0;
  const rMultiple=initialRisk>0?realized/initialRisk:0;
  const outcome=realized>0?"WIN":realized<0?"LOSS":"BREAKEVEN";
  const opened=new Date(position.openedAt).getTime(), ended=new Date(closed.closedAt).getTime();
  const durationMinutes=Number.isFinite(opened)&&Number.isFinite(ended)?Math.max(0,(ended-opened)/60000):null;
  const snapshot=position.entryCandidateSnapshot||{};
  return appendTradeMemory({
    tradeId:position.id,symbol:position.symbol,direction:position.direction,
    openedAt:position.openedAt,closedAt:closed.closedAt,entryPrice:entry,exitPrice:exit,
    initialStop:position.initialStop ?? position.stop,initialTarget:position.initialTarget ?? position.target,
    initialQuantity:position.initialQuantity ?? qty,finalQuantity:qty,
    initialNotionalUsd:notional,initialLeverage:position.initialLeverage ?? position.leverage,
    finalLeverage:position.leverage,realizedPnlUsd:realized,
    partialRealizedPnlUsd:Number(position.partialRealizedPnlUsd)||0,
    returnPercent:Number(returnPercent.toFixed(4)),rMultiple:Number(rMultiple.toFixed(4)),
    outcome,exitReason:closed.exitReason,durationMinutes:durationMinutes===null?null:Number(durationMinutes.toFixed(2)),
    mfeUsd:Number(position.maximumFavorableExcursionUsd)||0,
    maeUsd:Number(position.maximumAdverseExcursionUsd)||0,
    addCount:Number(position.addCount)||0,
    consistencyHistory:position.consistencyHistory||[],
    fingerprint:position.entrySetupFingerprint||buildSetupFingerprint(snapshot),
    entrySnapshot:snapshot,
  });
}
export default recordClosedTradeToMemory;
