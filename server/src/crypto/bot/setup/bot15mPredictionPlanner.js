/**
 * AEMA 15-minute scenario planner (research-only).
 * Deterministic, point-in-time price-path hypotheses; NOT a trained forecast.
 * Never authorizes execution or overrides validated strategy geometry.
 */
const number = value => value === null || value === undefined || value === "" ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
const positive = value => { const n = number(value); return n !== null && n > 0 ? n : null; };
const average = values => values.reduce((a,b)=>a+b,0)/values.length;
const meanTrueRange = (candles, period=14) => {
  const tr=[];
  for(let i=1;i<candles.length;i++) {
    const c=candles[i], p=candles[i-1];
    tr.push(Math.max(c.high-c.low, Math.abs(c.high-p.close), Math.abs(c.low-p.close)));
  }
  return tr.length>=period ? average(tr.slice(-period)) : null;
};
export function plan15mScenario({candles=[], direction, strategyEntry, strategyStop, strategyTarget, currentPrice, minimumRiskReward=1.5, interval="15m"}={}) {
  const unavailable=(reason)=>({status:"UNAVAILABLE",reason,interval:"15m",researchOnly:true,executionAuthority:false,liveExecution:false,applied:false});
  if(interval!=="15m") return unavailable("TIMEFRAME_NOT_15M");
  if(!Array.isArray(candles)||candles.length<30) return unavailable("INSUFFICIENT_CLOSED_15M_CANDLES");
  const rows=candles.map(c=>({high:positive(c?.high),low:positive(c?.low),close:positive(c?.close)}));
  if(rows.some(c=>!c.high||!c.low||!c.close||c.low>c.high||c.close<c.low||c.close>c.high)) return unavailable("INVALID_CANDLE_OHLC");
  const side=String(direction||"").toUpperCase();
  if(!["BULL","BEAR","LONG","SHORT"].includes(side)) return unavailable("INVALID_DIRECTION");
  const bull=side==="BULL"||side==="LONG";
  const atr=meanTrueRange(rows);
  if(!atr||!Number.isFinite(atr)) return unavailable("ATR_UNAVAILABLE");
  const recent=rows.slice(-20), last=rows.at(-1), swingLow=Math.min(...recent.map(c=>c.low)), swingHigh=Math.max(...recent.map(c=>c.high));
  const ema=(period)=>{ const k=2/(period+1); let v=average(rows.slice(0,period).map(c=>c.close)); for(const c of rows.slice(period)) v=c.close*k+v*(1-k); return v; };
  const ema9=ema(9), ema21=ema(21);
  const trendAligned=bull ? ema9>ema21 : ema9<ema21;
  const entry=positive(strategyEntry), stop=positive(strategyStop), target=positive(strategyTarget);
  // Missing strategy geometry must not suppress technical diagnostics.
  // Never invent executable levels or approve a trade from this fallback.
  if(!entry||!stop||!target) return {
    status:"AWAITING_STRATEGY_GEOMETRY",reason:"STRATEGY_GEOMETRY_MISSING",
    interval:"15m",researchOnly:true,executionAuthority:false,liveExecution:false,applied:false,
    modelType:"DETERMINISTIC_TECHNICAL_SCENARIO_NOT_PROBABILISTIC_FORECAST",
    direction:bull?"BULL":"BEAR",trendAligned,
    indicators:{atr14:atr,ema9,ema21,swingLow20:swingLow,swingHigh20:swingHigh,lastClosedPrice:last.close},
    missing:{entry:entry===null,stop:stop===null,target:target===null},
    entryState:"NO_ENTRY_UNTIL_STRATEGY_APPROVAL",forecastProbabilities:null,
    warnings:["NO_CALIBRATED_PRICE_PATH_MODEL","STRATEGY_GEOMETRY_REQUIRED","NO_EXECUTION_AUTHORITY"]
  };
  if(bull ? !(stop<entry&&entry<target) : !(target<entry&&entry<stop)) return {
    ...unavailable("INVALID_STRATEGY_GEOMETRY"),
    indicators:{atr14:atr,ema9,ema21,swingLow20:swingLow,swingHigh20:swingHigh,lastClosedPrice:last.close},
    missing:{entry:false,stop:false,target:false}
  };
  const risk=Math.abs(entry-stop), rr=Math.abs(target-entry)/risk;
  const price=positive(currentPrice)??last.close;
  // Structural stop proposal is informational; never tighten an existing strategy stop.
  const structureStop=bull ? Math.min(stop,swingLow-0.25*atr) : Math.max(stop,swingHigh+0.25*atr);
  const proposedRisk=Math.abs(entry-structureStop), proposedRR=Math.abs(target-entry)/proposedRisk;
  const entryDistanceATR=Math.abs(price-entry)/atr;
  const entryState=entryDistanceATR>2 ? "ENTRY_EXPIRED_OR_REASSESS" : entryDistanceATR<=0.25&&trendAligned ? "ENTRY_ZONE_REACHED_REQUIRES_CONFIRMATION" : "WAIT_FOR_ENTRY";
  return {
    status:"SCENARIO_READY", interval:"15m",researchOnly:true,executionAuthority:false,liveExecution:false,applied:false,
    modelType:"DETERMINISTIC_TECHNICAL_SCENARIO_NOT_PROBABILISTIC_FORECAST",
    direction:bull?"BULL":"BEAR",entryState,trendAligned,
    indicators:{atr14:atr,ema9,ema21,swingLow20:swingLow,swingHigh20:swingHigh,lastClosedPrice:last.close},
    strategyScenario:{entry,stop,target,riskReward:rr},
    volatilityAwareAlternative:{entry,stop:structureStop,target,riskReward:proposedRR,passesMinimumRR:proposedRR>=minimumRiskReward},
    entryDistanceATR, horizonsMinutes:[15,30,60,120],
    forecastProbabilities:null,
    warnings:["NO_CALIBRATED_PRICE_PATH_MODEL","ALTERNATIVE_NOT_APPLIED","ENTRY_CONFIRMATION_NOT_PROVEN"]
  };
}
export default plan15mScenario;
