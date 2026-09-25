/**
 * Deterministic paper fill: market BUY fills at fresh ask; SELL at fresh bid.
 * No live exchange order endpoint exists in this module.
 */
export function simulateBotPaperMarketFill(candidate){
  const r=candidate?.revalidation||{}, p=candidate?.riskPlan||{}, s=candidate?.setup||{};
  if(!r.approved||!p.approved) throw new Error("BOT_PAPER_FILL_NOT_AUTHORIZED");
  const side=s.direction==="LONG"?"BUY":"SELL";
  const fillPrice=Number(r.freshEntry);
  const quantity=Number(p.quantity);
  if(!(fillPrice>0&&quantity>0)) throw new Error("BOT_PAPER_FILL_INVALID_VALUES");
  return {
    symbol:candidate.symbol,side,direction:s.direction,type:"MARKET",
    fillPrice,quantity,notionalUsd:fillPrice*quantity,leverage:p.leverage,
    marginUsedUsd:(fillPrice*quantity)/p.leverage,
    stop:s.stop,target:s.target,source:"AEMA_BOT_PAPER_EXCHANGE",
    paperOnly:true,liveExecution:false,
  };
}
export default simulateBotPaperMarketFill;
