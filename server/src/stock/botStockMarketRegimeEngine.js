/** Stock-specific market regimes. Historical-bar research only. No order capability. */
export const STOCK_STRATEGIES=Object.freeze(['TREND_PULLBACK','BREAKOUT_RETEST','LIQUIDITY_SWEEP','MOMENTUM_BREAKOUT','RANGE_ROTATION']);
const REGIMES=Object.freeze(['TRENDING','COMPRESSION','EXPANSION','LIQUIDITY_SWEEP','RANGING']);
const STRATEGY_REGIMES=Object.freeze({
  TREND_PULLBACK:['TRENDING'],
  BREAKOUT_RETEST:['TRENDING','COMPRESSION','EXPANSION'],
  LIQUIDITY_SWEEP:['LIQUIDITY_SWEEP','RANGING'],
  MOMENTUM_BREAKOUT:['COMPRESSION','EXPANSION'],
  RANGE_ROTATION:['RANGING']
});
const avg=a=>a.reduce((s,n)=>s+n,0)/a.length;
const clamp=n=>Math.max(0,Math.min(100,Math.round(n)));
export function classifyStockMarketRegime(bars){
  if(!Array.isArray(bars)||bars.length<65)throw new Error('STOCK_REGIME_MINIMUM_65_BARS');
  const x=bars.slice(-65);
  if(x.some(b=>![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.high<b.low||b.low<=0))throw new Error('STOCK_REGIME_INVALID_BARS');
  const last=x.at(-1), prior=x.slice(-21,-1), early=x.slice(-40,-20);
  const trueRanges=x.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-x[i].close),Math.abs(b.low-x[i].close)));
  const atr=avg(trueRanges.slice(-14));
  if(!(atr>0))throw new Error('STOCK_REGIME_ATR_UNAVAILABLE');
  const upper=Math.max(...prior.map(b=>b.high)),lower=Math.min(...prior.map(b=>b.low));
  const width=upper-lower;
  const previousWidth=Math.max(...early.map(b=>b.high))-Math.min(...early.map(b=>b.low));
  const trendChange=(avg(prior.map(b=>b.close))-avg(early.map(b=>b.close)))/last.close;
  const avgVolume=avg(prior.map(b=>b.volume));
  const relativeVolume=avgVolume>0?last.volume/avgVolume:null;
  const compressed=width<2.8*atr&&width<previousWidth*0.8;
  const expansion=(last.close>upper||last.close<lower)&&relativeVolume!==null&&relativeVolume>=1.25;
  const sweep=(last.low<lower&&last.close>lower)||(last.high>upper&&last.close<upper);
  const ranging=width<=5*atr&&Math.abs(trendChange)<0.012;
  const scores={
    TRENDING:clamp(20+Math.abs(trendChange)*1600+(width>3*atr?15:0)),
    COMPRESSION:clamp(compressed?75+Math.max(0,(0.8-width/Math.max(previousWidth,1e-12))*30):10),
    EXPANSION:clamp(expansion?85+(relativeVolume>=1.8?10:0):10),
    LIQUIDITY_SWEEP:clamp(sweep?90:5),
    RANGING:clamp(ranging?75+(width<3*atr?10:0):10)
  };
  // Deterministic tie-break, with sweep and confirmed expansion taking precedence.
  const priority=['LIQUIDITY_SWEEP','EXPANSION','COMPRESSION','TRENDING','RANGING'];
  const ordered=[...REGIMES].sort((a,b)=>scores[b]-scores[a]||priority.indexOf(a)-priority.indexOf(b));
  const primaryRegime=scores[ordered[0]]>=55?ordered[0]:'UNCLEAR';
  const activeRegimes=ordered.filter(name=>scores[name]>=60);
  const eligibleStrategies=STOCK_STRATEGIES.filter(s=>STRATEGY_REGIMES[s].some(r=>activeRegimes.includes(r)));
  const strategyDiagnostics=Object.fromEntries(STOCK_STRATEGIES.map(strategy=>[strategy,{
    eligible:eligibleStrategies.includes(strategy),
    reason:eligibleStrategies.includes(strategy)?'REGIME_ELIGIBLE':'REGIME_NOT_ELIGIBLE',
    supportingRegimes:STRATEGY_REGIMES[strategy].filter(r=>activeRegimes.includes(r))
  }]));
  return {name:primaryRegime,primaryRegime,activeRegimes,scores,eligibleStrategies,strategyDiagnostics,
    change:trendChange,atr,relativeVolume,rangeHigh:upper,rangeLow:lower,
    evidence:{compression:compressed,confirmedExpansion:expansion,liquiditySweep:sweep,ranging},
    researchOnly:true,executionAuthority:false,liveExecution:false};
}
