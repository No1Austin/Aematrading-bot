const n=v=>Number.isFinite(Number(v))?Number(v):null;
const pickEngine=(candidate,name)=>{
  const e=candidate?.engines?.[name] || candidate?.research?.engines?.[name] || null;
  if(!e) return null;
  const d=candidate?.setup?.direction || candidate?.directionDecision?.direction;
  return n(d==="LONG" ? (e.longScore ?? e.longSupport) : (e.shortScore ?? e.shortSupport));
};
export function buildSetupFingerprint(candidate={}){
  const s=candidate.setup||{}, m=s.market||candidate.executionMarket||{};
  return {
    direction:s.direction||candidate.directionDecision?.direction||null,
    technical:pickEngine(candidate,"technical"),
    fundamental:pickEngine(candidate,"fundamental"),
    marketStructure:pickEngine(candidate,"marketStructure"),
    liquidity:pickEngine(candidate,"liquidity"),
    opportunity:n(candidate.opportunityScore ?? candidate.opportunity?.opportunityScore),
    riskReward:n(s.riskReward),
    spread:n(s.spreadPercent),
    volatility:n(m.atrPercent ?? (m.atr&&s.entry ? m.atr/s.entry*100 : null)),
  };
}
export default buildSetupFingerprint;
