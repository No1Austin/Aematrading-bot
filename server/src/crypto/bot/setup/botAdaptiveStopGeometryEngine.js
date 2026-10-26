/** EMA ASIE v2: shadow-only stop/target comparison; never authorizes a setup. */
const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const pos = v => { const n = num(v); return n !== null && n > 0 ? n : null; };
const side = (d,e,s) => e !== null && s !== null && (d === 'BULL' ? s < e : d === 'BEAR' ? s > e : false);
const rr = (d,e,s,t) => {
  if (![e,s,t].every(v => v !== null && v > 0) || !side(d,e,s) || !(d === 'BULL' ? t > e : t < e)) return null;
  return Math.abs(t-e)/Math.abs(e-s);
};
function wickNoise(candles) {
  const observations=[];
  for (const c of (Array.isArray(candles) ? candles : []).slice(-120)) {
    const o=pos(c?.open),h=pos(c?.high),l=pos(c?.low),cl=pos(c?.close);
    if ([o,h,l,cl].some(v=>v===null) || h<Math.max(o,cl) || l>Math.min(o,cl) || h<l) continue;
    observations.push(Math.max(h-Math.max(o,cl),Math.min(o,cl)-l));
  }
  if (observations.length<30) return {sampleSize:observations.length,q90:null,status:'INSUFFICIENT_CLOSED_CANDLES',interpretation:'CANDLE_WICK_SIZE_NOT_STOP_SURVIVAL'};
  observations.sort((a,b)=>a-b);
  const i=(observations.length-1)*.9, lo=Math.floor(i),hi=Math.ceil(i);
  return {sampleSize:observations.length,q90:observations[lo]+(observations[hi]-observations[lo])*(i-lo),status:'OBSERVED',interpretation:'CANDLE_WICK_SIZE_NOT_STOP_SURVIVAL'};
}
function collectTargets(input,entry,direction) {
  const all=[],seen=new Set();
  function add(value,source) {
    const n=pos(value);
    if (n===null || seen.has(n)) return;
    seen.add(n);
    all.push({price:n,source,directionallyValid:entry!==null && (direction==='BULL'?n>entry:direction==='BEAR'?n<entry:false)});
  }
  add(input.target,'PRIMARY_QUALITY_TARGET');
  for (const [source,items] of [['QUALITY_TARGETS',input.targets],['QUALITY_TARGETS_DETAILED',input.targetsDetailed],['STRATEGY_TARGETS',input.strategyTargets],['STRATEGY_TARGETS_DETAILED',input.strategyTargetsDetailed]]) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (typeof item==='number' || typeof item==='string') add(item,source);
      else if (item && typeof item==='object') {
        // Only recognized explicit price fields; never infer a price from a label or distance.
        add(item.price ?? item.target ?? item.level ?? item.value,source);
      }
    }
  }
  return all;
}
export function analyzeAdaptiveStopGeometry(input={}) {
  const raw=String(input.direction??'').toUpperCase();
  const direction=['BULL','LONG'].includes(raw)?'BULL':['BEAR','SHORT'].includes(raw)?'BEAR':null;
  const strategy=String(input.strategy??'UNKNOWN').toUpperCase();
  const entry=pos(input.entry),originalStop=pos(input.originalStop),publishedStop=pos(input.publishedStop);
  const atr=pos(input.atr),support=pos(input.support),resistance=pos(input.resistance);
  const invalidation=pos(input.invalidation?.price ?? input.invalidation);
  const structuralLevel=invalidation ?? (direction==='BULL'?support:direction==='BEAR'?resistance:null);
  const structuralLevelSource=invalidation!==null?'STRATEGY_INVALIDATION':'MARKET_SUPPORT_RESISTANCE';
  const minRR=pos(input.minimumRiskReward)??1.5;
  const spreadPercent=num(input.spreadPercent),slippagePercent=num(input.slippagePercent);
  const noise=wickNoise(input.closedCandles);
  const targetEvidence=collectTargets(input,entry,direction);
  const validTargets=targetEvidence.filter(x=>x.directionallyValid);
  const primaryTarget=pos(input.target);
  const blockers=[];
  if (!direction) blockers.push('DIRECTION_UNAVAILABLE');
  if (entry===null) blockers.push('ENTRY_UNAVAILABLE');
  if (!validTargets.length) blockers.push('VALID_STRUCTURAL_TARGET_UNAVAILABLE');
  if (invalidation===null) blockers.push('STRATEGY_INVALIDATION_NOT_EXPLICIT');
  if (!side(direction,entry,structuralLevel)) blockers.push('STRUCTURAL_INVALIDATION_UNAVAILABLE');
  if (atr===null) blockers.push('ATR_UNAVAILABLE');
  if (spreadPercent===null || spreadPercent<0 || slippagePercent===null || slippagePercent<0) blockers.push('COST_EVIDENCE_UNAVAILABLE');
  const factor=({LIQUIDITY_SWEEP:.35,BREAKOUT_RETEST:.25,TREND_PULLBACK:.3,MOMENTUM_BREAKOUT:.4,RANGE_ROTATION:.3})[strategy]??.3;
  const atrBuffer=atr===null?null:atr*factor;
  const bufferSpecs=[['STRUCTURE_ATR_BUFFER',atrBuffer],['STRUCTURE_WICK_BUFFER',noise.q90],['STRUCTURE_HYBRID_BUFFER',atrBuffer!==null&&noise.q90!==null?Math.max(atrBuffer,noise.q90):null]];
  const candidates=[];
  function add(name,stop,kind,buffer=null) {
    if (stop===null) return;
    const risk=side(direction,entry,stop)?Math.abs(entry-stop):null;
    const costDistance=entry!==null && spreadPercent!==null && spreadPercent>=0 && slippagePercent!==null && slippagePercent>=0 ? entry*(spreadPercent+slippagePercent)/100 : null;
    const costToRisk=risk!==null && risk>0 && costDistance!==null ? costDistance/risk:null;
    const targetComparisons=validTargets.map(t=>({target:t.price,source:t.source,riskReward:rr(direction,entry,stop,t.price)}));
    const eligibleTargets=targetComparisons.filter(t=>t.riskReward!==null&&t.riskReward>=minRR);
    const bestNumericalTarget=eligibleTargets.length?eligibleTargets.reduce((a,b)=>a.riskReward>=b.riskReward?a:b):null;
    const primaryRR=rr(direction,entry,stop,primaryTarget);
    const reasons=[];
    if (!risk || !targetComparisons.length) reasons.push('INVALID_OR_INCOMPLETE_GEOMETRY');
    else if (!eligibleTargets.length) reasons.push('NO_TARGET_MEETS_MINIMUM_RISK_REWARD');
    if (costToRisk===null) reasons.push('COST_TO_RISK_UNAVAILABLE');
    else if (costToRisk>.25) reasons.push('COST_TO_RISK_HIGH');
    if (kind==='RESEARCH_CANDIDATE' && invalidation===null) reasons.push('STRATEGY_INVALIDATION_NOT_EXPLICIT');
    // An ATR buffer below the empirical wick quantile is not independently noise-validated.
    if (kind==='RESEARCH_CANDIDATE' && noise.q90!==null && buffer!==null && buffer<noise.q90) reasons.push('BUFFER_BELOW_OBSERVED_WICK_Q90');
    candidates.push({name,kind,stop,riskReward:primaryRR,costToRisk,targetComparisons,bestNumericalTarget,reasons,passesNumericalChecks:reasons.length===0,validatedStop:false});
  }
  add('STRATEGY_ORIGINAL',originalStop,'BASELINE');
  add('CURRENT_PUBLISHED',publishedStop,'BASELINE');
  if (side(direction,entry,structuralLevel)) for (const [name,buffer] of bufferSpecs) if (buffer!==null) add(name,direction==='BULL'?structuralLevel-buffer:structuralLevel+buffer,'RESEARCH_CANDIDATE',buffer);
  const ranked=candidates.filter(c=>c.kind==='RESEARCH_CANDIDATE'&&c.passesNumericalChecks&&c.bestNumericalTarget)
    .sort((a,b)=>a.costToRisk-b.costToRisk || b.bestNumericalTarget.riskReward-a.bestNumericalTarget.riskReward)
    .map((c,index)=>({rank:index+1,candidate:c.name,stop:c.stop,target:c.bestNumericalTarget.target,targetSource:c.bestNumericalTarget.source,riskReward:c.bestNumericalTarget.riskReward,costToRisk:c.costToRisk,rankingBasis:'NUMERICAL_FEASIBILITY_ONLY',validatedStop:false}));
  const zoneLow=pos(input.entryZone?.low),zoneHigh=pos(input.entryZone?.high),entryAlternatives=[];
  if (zoneLow!==null&&zoneHigh!==null&&zoneLow<=zoneHigh&&primaryTarget!==null) for (const e of [zoneLow,(zoneLow+zoneHigh)/2,zoneHigh]) {
    if (e===entry) continue;
    const value=rr(direction,e,publishedStop,primaryTarget);
    entryAlternatives.push({entry:e,riskReward:value,passesMinimum:value!==null&&value>=minRR,requiresFutureFill:true,validatedFill:false});
  }
  return {schemaVersion:'ema-asie-shadow-v2',researchOnly:true,advisoryOnly:true,executionAuthority:false,liveExecution:false,decisionAuthority:false,
    direction,strategy,entry,target:primaryTarget,originalStop,publishedStop,structuralLevel,structuralLevelSource,minimumRiskReward:minRR,
    atr,noise,spreadPercent,slippagePercent,targetEvidence,candidates,rankedNumericalCandidates:ranked,entryAlternatives,blockers,
    status:blockers.length?'PARTIAL_EVIDENCE':'RESEARCH_OBSERVATION',
    probabilityStopFirst:null,probabilityTargetFirst:null,expectedR:null,validationStatus:'UNVALIDATED_SHADOW_ONLY'};
}
export default analyzeAdaptiveStopGeometry;
