/** Deterministic P/L scenario calculator. Does not place orders. */
const finite=v=>Number.isFinite(Number(v));
const round=(v,d=2)=>Number(Number(v).toFixed(d));
export function calculateBotPositionScenario(setup,{capitalUsd,leverage=1,feeRatePercent=0}={}){
  const entry=Number(setup?.entry),stop=Number(setup?.stop),targets=(setup?.targets?.length?setup.targets:[setup?.target]).filter(finite).map(Number);
  capitalUsd=Number(capitalUsd);leverage=Number(leverage);feeRatePercent=Number(feeRatePercent||0);
  if(!(capitalUsd>0))throw new Error("CAPITAL_USD_REQUIRED");
  if(!(leverage>=1))throw new Error("LEVERAGE_MUST_BE_AT_LEAST_1X");
  if(!(entry>0&&stop>0))throw new Error("VALID_SETUP_REQUIRED");
  const exposureUsd=capitalUsd*leverage,quantity=exposureUsd/entry,direction=setup.direction;
  const pnlAt=price=>direction==="SHORT"?(entry-price)*quantity:(price-entry)*quantity;
  const feesAt=price=>((exposureUsd+quantity*price)*feeRatePercent)/100;
  const row=price=>{const gross=pnlAt(price),fees=feesAt(price),net=gross-fees;return{price:round(price,8),grossPnlUsd:round(gross),estimatedFeesUsd:round(fees),netPnlUsd:round(net),capitalImpactPercent:round(net/capitalUsd*100)};};
  return{capitalUsd:round(capitalUsd),leverage,exposureUsd:round(exposureUsd),quantity:round(quantity,8),entry:round(entry,8),stop:row(stop),targets:targets.map((p,i)=>({label:`T${i+1}`,...row(p)})),feeRatePercent,liquidationPrice:null,liquidationNote:"Requires the connected futures venue margin model; not guessed.",executionAuthority:false};
}
export default calculateBotPositionScenario;
