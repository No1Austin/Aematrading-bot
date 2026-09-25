/**
 * Builds an actual directional setup from fresh futures evidence.
 * Does not size the account and does not execute.
 */
import BOT_CONFIG from "../config/botConfig.js";
const pct=(a,b)=>a>0?Math.abs(b-a)/a*100:null;

export function buildBotFuturesSetup(candidate,market,options={}){
  const cfg={...BOT_CONFIG.setup,...options};
  const direction=candidate?.directionDecision?.direction;
  const blockers=[...(market?.blockers||[])];
  if(direction!=="LONG"&&direction!=="SHORT") blockers.push("INVALID_DIRECTION");
  if(!market?.approved) blockers.push("EXECUTION_MARKET_NOT_APPROVED");

  const entry=direction==="LONG"?market?.ask:market?.bid;
  const atr=market?.atr, support=market?.support, resistance=market?.resistance;
  let stop=null,target=null;
  if(direction==="LONG"&&entry>0&&atr>0&&support>0){
    stop=support-atr*cfg.atrStopBufferMultiplier;
    target=Math.max(resistance,entry+atr*cfg.targetAtrExtensionMultiplier);
  }
  if(direction==="SHORT"&&entry>0&&atr>0&&resistance>0){
    stop=resistance+atr*cfg.atrStopBufferMultiplier;
    target=Math.min(support,entry-atr*cfg.targetAtrExtensionMultiplier);
  }
  const geometry=direction==="LONG"
    ? stop>0&&stop<entry&&target>entry
    : stop>entry&&target>0&&target<entry;
  if(!geometry) blockers.push("INVALID_SETUP_GEOMETRY");

  const stopDistance=geometry?Math.abs(entry-stop):null;
  const targetDistance=geometry?Math.abs(target-entry):null;
  const riskReward=stopDistance>0?targetDistance/stopDistance:null;
  const directionalSlip=direction==="LONG"?market?.slippage?.buy:market?.slippage?.sell;
  if(!directionalSlip?.available) blockers.push("DIRECTIONAL_SLIPPAGE_UNAVAILABLE");

  return {...candidate,executionMarket:market,setup:{
    approved:blockers.length===0,status:blockers.length?"SETUP_BLOCKED":"SETUP_READY",
    symbol:candidate?.symbol,direction,entry,stop,target,
    stopDistancePercent:pct(entry,stop),targetDistancePercent:pct(entry,target),
    riskReward,spreadPercent:market?.spreadPercent,
    slippagePercent:directionalSlip?.percent??null,
    depthNotional:market?.depth?.totalNotional??null,
    atr,support,resistance,freshness:market?.freshness,blockers,
    executionAuthority:false,liveExecution:false
  }};
}
export default buildBotFuturesSetup;
