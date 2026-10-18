/** AEMA Quant Phase 4: setup economics SHADOW ONLY.
 * No probability is estimated here. Unknown probabilities => no expected value.
 * Research estimates must be supplied explicitly by a separately validated model.
 */
const finite = v => v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
const positive = v => { const n=finite(v); return n !== null && n > 0 ? n : null; };
function normalizeDirection(v) {
  const d=String(v||'').toUpperCase();
  return d==='LONG'||d==='BULL'?'BULL':d==='SHORT'||d==='BEAR'?'BEAR':null;
}
function evaluate(candidate, options) {
  const s=candidate?.setup||{};
  const symbol=candidate?.symbol||s.symbol||null;
  const direction=normalizeDirection(s.direction||candidate?.directionDecision?.direction);
  const entry=positive(s.entry), stop=positive(s.stop);
  const target=positive(s.target ?? (Array.isArray(s.targets) ? s.targets[0]?.price ?? s.targets[0] : null));
  const result={schemaVersion:'ema-quant-setup-shadow-v1',symbol,direction,strategy:s.strategy??s.selectedStrategy??null,
    setupApproved:s.approved===true,entry,stop,target,probabilityTargetFirst:null,netExpectedReturn:null,
    netExpectedR:null,decision:'UNVALIDATED_NO_EDGE_ESTIMATE',validationStatus:'RESEARCH_ONLY_NOT_PRODUCTION_VALIDATED',
    executionAuthority:false,liveExecution:false,blockers:[]};
  if (!symbol || !direction || !entry || !stop || !target ||
      !(direction==='BULL'?stop<entry&&target>entry:stop>entry&&target<entry)) {
    result.blockers.push('INVALID_OR_MISSING_SETUP_GEOMETRY');return result;
  }
  const risk=Math.abs(entry-stop)/entry, reward=Math.abs(target-entry)/entry;
  result.riskFraction=risk;result.rewardFraction=reward;result.riskReward=reward/risk;
  const estimate=options?.probabilitiesBySymbol?.[symbol];
  const p=finite(estimate?.probabilityTargetFirst);
  const costs=finite(options?.roundTripCostBps);
  // This estimate cannot be used without explicit model provenance and spot/futures matching.
  const instrument=String(candidate?.executionMarket?.instrumentType||candidate?.asset?.instrumentType||'').toUpperCase();
  const modelInstrument=String(estimate?.instrumentType||'').toUpperCase();
  if (!estimate || p===null || p<0 || p>1 || !estimate.modelVersion ||
      estimate.validationStatus!=='OUT_OF_SAMPLE_VALIDATED' ||
      !instrument || modelInstrument!==instrument || costs===null || costs<0) {
    result.blockers.push('VALIDATED_MATCHING_PROBABILITY_AND_COSTS_REQUIRED');return result;
  }
  const net=p*reward-(1-p)*risk-costs/10000;
  result.probabilityTargetFirst=p;result.netExpectedReturn=net;result.netExpectedR=net/risk;
  result.modelVersion=estimate.modelVersion;result.costBpsAssumed=costs;
  result.decision=net>0?'POSITIVE_HYPOTHETICAL_EV':'NONPOSITIVE_HYPOTHETICAL_EV';
  return result;
}
export function observeQuantSetupEconomics(setups, options={}) {
  return (Array.isArray(setups)?setups:[]).map(row=>{
    try { return evaluate(row,options); }
    catch(e){return {symbol:row?.symbol??null,decision:'SHADOW_ERROR',error:String(e?.message||e),executionAuthority:false,liveExecution:false};}
  });
}
export default observeQuantSetupEconomics;
