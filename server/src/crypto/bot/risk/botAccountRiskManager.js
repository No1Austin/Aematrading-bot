import BOT_CONFIG from "../config/botConfig.js";

const floorTo=(v,d=8)=>{const p=10**d;return Math.floor(v*p)/p};

export function buildBotAccountRiskPlan(candidate,account,options={}){
  const cfg={...BOT_CONFIG.account,...options}, s=candidate?.setup||{};
  const blockers=[];
  const equity=Math.min(Number(account?.equityUsd),Number(account?.allocationUsd ?? account?.equityUsd));
  const available=Math.min(Number(account?.availableMarginUsd),Number(account?.allocatedAvailableMarginUsd ?? account?.availableMarginUsd));
  const entry=Number(s.entry), stop=Number(s.stop);
  const stopDistance=Math.abs(entry-stop);
  if(account?.controls?.paused) blockers.push("BOT_PAUSED");
  if(!(equity>0&&available>0)) blockers.push("NO_AVAILABLE_ACCOUNT_EQUITY");
  if(!(entry>0&&stopDistance>0)) blockers.push("INVALID_STOP_DISTANCE");

  const riskBudget=equity*(cfg.riskPerTradePercent/100);
  const riskQty=stopDistance>0?riskBudget/stopDistance:0;
  const maxNotional=equity*(cfg.maximumPositionNotionalPercent/100);
  const maxQtyByNotional=entry>0?maxNotional/entry:0;
  let quantity=Math.min(riskQty,maxQtyByNotional);

  // Choose only enough leverage to fit the allowed margin envelope.
  const notionalRaw=quantity*entry;
  const marginCap=Math.min(available,equity*(cfg.maximumMarginPercent/100));
  let leverage=marginCap>0?Math.ceil(notionalRaw/marginCap):cfg.maximumLeverage;
  leverage=Math.max(cfg.minimumLeverage,Math.min(cfg.maximumLeverage,leverage));
  const maxQtyByMargin=entry>0?(marginCap*leverage)/entry:0;
  quantity=floorTo(Math.min(quantity,maxQtyByMargin),8);

  const notional=quantity*entry;
  const marginRequired=leverage>0?notional/leverage:Infinity;
  const plannedRisk=quantity*stopDistance;
  if(!(quantity>0)) blockers.push("ZERO_POSITION_SIZE");
  if(!(marginRequired<=available+1e-8)) blockers.push("INSUFFICIENT_MARGIN");
  if(!(plannedRisk<=riskBudget+1e-8)) blockers.push("RISK_BUDGET_EXCEEDED");

  return {...candidate,riskPlan:{
    approved:blockers.length===0,status:blockers.length?"RISK_BLOCKED":"RISK_READY",
    equityUsd:equity,availableMarginUsd:available,
    riskPerTradePercent:cfg.riskPerTradePercent,riskBudgetUsd:riskBudget,
    quantity,notionalUsd:notional,leverage,marginRequiredUsd:marginRequired,
    plannedRiskUsd:plannedRisk,entry,stop:s.stop,target:s.target,direction:s.direction,
    blockers,paperOnly:true,liveExecution:false
  }};
}
export default buildBotAccountRiskPlan;
