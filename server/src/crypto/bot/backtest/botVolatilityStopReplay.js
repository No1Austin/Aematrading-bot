/** EMA Phase A2: research-only paired stop replay. No network or execution authority.
 * Input: {direction,entry,existingStop,proposedStop,target,quantity,entryTime,
 *         candles:[{time,open,high,low,close}], feePercent?,slippagePercent?}.
 * Candle time is opening timestamp (ms or ISO). Candles must start AFTER entryTime.
 * Conservative tie policy: if stop and target touched in one candle, stop wins.
 */
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
const positive = v => { const n=finite(v); return n !== null && n>0 ? n : null; };
const timestamp = v => typeof v === 'number' ? v : Date.parse(v);
function replayLeg({side,entry,stop,target,quantity,candles,feePercent,slippagePercent}) {
  const bull=side==='BULL';
  let maxAdverse=0,maxFavorable=0,exit=null,reason='OPEN',exitTime=null;
  for(const c of candles){
    const adverse=bull ? entry-c.low : c.high-entry;
    const favorable=bull ? c.high-entry : entry-c.low;
    maxAdverse=Math.max(maxAdverse,adverse);
    maxFavorable=Math.max(maxFavorable,favorable);
    const hitStop=bull ? c.low<=stop : c.high>=stop;
    const hitTarget=bull ? c.high>=target : c.low<=target;
    if(hitStop||hitTarget){
      // Gap through the stop worsens the stop fill; do not award price improvement on target gaps.
      const gapStop=hitStop && (bull ? c.open<stop : c.open>stop);
      exit=hitStop ? (gapStop?c.open:stop) : target;
      reason=hitStop ? (hitTarget?'AMBIGUOUS_STOP_FIRST':'STOP'):'TARGET';
      exitTime=c.time;break;
    }
  }
  if(exit===null && candles.length){exit=candles.at(-1).close;exitTime=candles.at(-1).time;reason='MARK_TO_MARKET';}
  const gross=exit===null?null:(bull?exit-entry:entry-exit)*quantity;
  // Explicit scenario estimates, not actual fills. Costs on both entry and exit notionals.
  const costs=exit===null?null:((entry+exit)*quantity*feePercent/100)+(entry*quantity*slippagePercent/100);
  return {stop,reason,exit,exitTime,grossPnlUsd:gross,estimatedCostsUsd:costs,netPnlUsd:gross===null?null:gross-costs,maeUsd:maxAdverse*quantity,mfeUsd:maxFavorable*quantity};
}
export function replayVolatilityStopComparison(input={}){
  const side=String(input.direction??'').toUpperCase();
  if(!['BULL','BEAR'].includes(side))throw Error('DIRECTION_MUST_BE_BULL_OR_BEAR');
  const entry=positive(input.entry),existingStop=positive(input.existingStop),proposedStop=positive(input.proposedStop),target=positive(input.target),quantity=positive(input.quantity);
  if(![entry,existingStop,proposedStop,target,quantity].every(Boolean))throw Error('INVALID_SETUP_PRICES_OR_QUANTITY');
  const bull=side==='BULL';
  if(bull?!(existingStop<entry&&proposedStop<entry&&target>entry):!(existingStop>entry&&proposedStop>entry&&target<entry))throw Error('WRONG_SIDE_STOP_OR_TARGET');
  const entryTime=timestamp(input.entryTime);
  if(!Number.isFinite(entryTime))throw Error('ENTRY_TIME_REQUIRED');
  const feePercent=finite(input.feePercent),slippagePercent=finite(input.slippagePercent);
  if(feePercent===null||feePercent<0||slippagePercent===null||slippagePercent<0)throw Error('COST_ASSUMPTIONS_REQUIRED');
  if(!Array.isArray(input.candles)||!input.candles.length)throw Error('CANDLES_REQUIRED');
  const candles=input.candles.map(c=>({time:timestamp(c.time),open:positive(c.open),high:positive(c.high),low:positive(c.low),close:positive(c.close)}));
  let prev=entryTime;
  for(const c of candles){
    if(!Number.isFinite(c.time)||c.time<=prev||![c.open,c.high,c.low,c.close].every(Boolean)||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||c.low>c.high)throw Error('INVALID_OR_NONCHRONOLOGICAL_POST_ENTRY_CANDLES');
    prev=c.time;
  }
  const common={side,entry,target,quantity,candles,feePercent,slippagePercent};
  const existing=replayLeg({...common,stop:existingStop});
  const proposed=replayLeg({...common,stop:proposedStop});
  return {status:'RESEARCH_ONLY',shadowOnly:true,executionAuthority:false,side,entry,entryTime,candleCount:candles.length,existing,proposed,netPnlDifferenceUsd:proposed.netPnlUsd-existing.netPnlUsd,assumptions:['POST_ENTRY_CANDLES_ONLY','STOP_FIRST_ON_SAME_CANDLE','NO_INTRABAR_PATH','ESTIMATED_COSTS_NOT_ACTUAL_FILLS','SAME_QUANTITY_FOR_PAIRED_STOP_COMPARISON','MARK_TO_MARKET_IF_NO_EXIT']};
}
export default replayVolatilityStopComparison;
