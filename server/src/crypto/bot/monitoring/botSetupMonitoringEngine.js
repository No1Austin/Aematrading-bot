import BOT_CONFIG from "../config/botConfig.js";
import getBotResearchMarketEvidence from "../research/botResearchMarketProvider.js";
import {runAllBotResearchEngines} from "../research/botResearchEngines.js";
import determineBotDirection from "../direction/botDirectionEngine.js";
import {getMonitoredSetup,updateMonitoredSetup} from "./botSetupMonitorStore.js";
const pct=(a,b)=>a>0?Math.abs(b-a)/a*100:null;
export async function refreshMonitoredSetup(id,options={}){
  const monitor=getMonitoredSetup(id);if(!monitor)throw new Error("MONITORED_SETUP_NOT_FOUND");
  const original=monitor.original;
  const candidateAsset=original?.asset||{symbol:monitor.symbol,productId:original?.setup?.productId};
  const evidence=await getBotResearchMarketEvidence(candidateAsset,options.research);
  const engines=runAllBotResearchEngines(candidateAsset,evidence);
  const current=determineBotDirection({symbol:monitor.symbol,asset:candidateAsset,engines},options.direction);
  const mark=Number(evidence.markPrice),stop=Number(original.setup.stop),entry=Number(original.setup.entry),dir=original.setup.direction;
  const stopHit=dir==="LONG"?mark<=stop:mark>=stop;
  const target=Number(original.setup.target),targetHit=dir==="LONG"?mark>=target:mark<=target;
  const originalConfidence=Number(original.directionDecision?.confidence)||0,currentConfidence=Number(current.directionDecision?.confidence)||0;
  const originalSep=Number(original.directionDecision?.separation)||0,currentSep=Number(current.directionDecision?.separation)||0;
  const cfg={...BOT_CONFIG.monitoring,...options.monitoring};
  const directionChanged=current.directionDecision?.rawDirection&&current.directionDecision.rawDirection!==dir;
  const weakening=originalConfidence-currentConfidence>=cfg.weakeningConfidenceDrop||originalSep-currentSep>=cfg.weakeningSeparationDrop;
  const nearStop=pct(stop,mark)!=null&&pct(stop,mark)<=cfg.reboundDistanceToStopPercent&&!stopHit;
  let status="ACTIVE";
  if(stopHit)status="STOP_HIT";else if(targetHit)status="TARGET_HIT";else if(directionChanged||!current.directionDecision?.qualified)status="THESIS_WEAKENING";else if(nearStop)status="REBOUND_WATCH";else if(weakening)status="WEAKENING";else if(currentConfidence>originalConfidence)status="STRENGTHENING";
  const observation={observedAt:new Date().toISOString(),status,markPrice:mark,directionDecision:current.directionDecision,engines,changes:{confidence:currentConfidence-originalConfidence,separation:currentSep-originalSep,directionChanged,nearStop},executionAuthority:false};
  return updateMonitoredSetup(id,{status,lastObservation:observation,history:[...(monitor.history||[]),observation].slice(-100)});
}
export default refreshMonitoredSetup;
