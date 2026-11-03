/** Evidence-based, research-only review of client-reported original levels.
 * These values are UNVERIFIED; no execution, qualification or mutation.
 */
const good = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const round = n => Number(n.toPrecision(12));
export function reviewOriginalSetup({direction,original,referencePrice,referenceVenue='GATE',evidence=null}={}) {
  const base={source:'CLIENT_REPORTED_UNVERIFIED',researchOnly:true,executionAuthority:false,liveExecution:false,validatedForTrading:false,autoApplied:false,
    comparisonVerified:false,decision:'ORIGINAL_LEVELS_UNAVAILABLE',reason:'ORIGINAL_ENTRY_STOP_TARGET_REQUIRED',nextAction:'Provide original entry, stop, and target to review the original risk plan.'};
  const entry=Number(original?.entry),stop=Number(original?.stop),target=Number(original?.target);
  const venue=String(original?.venue??'').toUpperCase().trim();
  if(![entry,stop,target].every(good))return base;
  const bull=direction==='BULL',sign=bull?1:-1;
  if(!['BULL','BEAR'].includes(direction)||sign*(entry-stop)<=0||sign*(target-entry)<=0)
    return {...base,decision:'INVALID_ORIGINAL_LEVELS',reason:'ORIGINAL_LEVELS_NOT_DIRECTIONALLY_VALID',nextAction:'Check the original setup levels and direction.'};
  const risk=sign*(entry-stop),reward=sign*(target-entry);
  const result={...base,original:{entry,stop,target,venue:venue||null,grossRR:round(reward/risk),riskPct:round(risk/entry*100)},decision:'ORIGINAL_RISK_PLAN_REVIEWED',reason:'ORIGINAL_LEVELS_VALID_BUT_MARKET_COMPARISON_NOT_VERIFIED',nextAction:'Check current price and trigger on the original execution venue.'};
  if(!venue || venue!==referenceVenue.toUpperCase()){
    return {...result,decision:'VENUE_MISMATCH',reason:'ORIGINAL_AND_V2_USE_DIFFERENT_VENUES',referenceVenue,comparisonVerified:false,
      nextAction:`Verify ${venue||'original venue'} perpetual price and contract mapping before comparing with ${referenceVenue} candles. Do not treat cross-venue price as an entry trigger.`};
  }
  if(!good(referencePrice))return {...result,decision:'REFERENCE_PRICE_UNAVAILABLE',reason:'FRESH_PRICE_UNAVAILABLE'};
  const movePct=round(sign*(referencePrice-entry)/entry*100);
  const stopCrossed=sign*(referencePrice-stop)<=0;
  const targetCrossed=sign*(target-referencePrice)<=0;
  const atr=evidence?.volatility?.atr15;
  const extended=good(atr)&&sign*(entry-referencePrice)>atr*1.5;
  let decision,reason,nextAction;
  if(stopCrossed){decision='STOP_LEVEL_CROSSED';reason='REFERENCE_PRICE_BEYOND_ORIGINAL_STOP';nextAction='Treat original risk plan as invalid pending a new independent review; candle data cannot prove the stop was filled.';}
  else if(targetCrossed){decision='TARGET_LEVEL_CROSSED';reason='REFERENCE_PRICE_BEYOND_ORIGINAL_TARGET';nextAction='Original target has been reached or exceeded at the reference snapshot; do not chase a new entry without a new plan.';}
  else if(extended){decision='DO_NOT_CHASE';reason='PRICE_EXTENDED_BEYOND_ORIGINAL_ENTRY';nextAction='Do not chase the move. Wait for a fresh retest or an independently justified new setup.';}
  else if(sign*(referencePrice-entry)>0){decision='WAIT_FOR_ORIGINAL_RETEST';reason='REFERENCE_PRICE_NOT_YET_AT_ORIGINAL_ENTRY';nextAction='Wait for price to revisit the original entry zone and confirm the strategy trigger; reassess invalidation before entry.';}
  else {decision='REASSESS_ENTRY_TRIGGER';reason='PRICE_MOVED_IN_TRADE_DIRECTION';nextAction='Check for a fresh entry trigger on the execution venue; do not assume the original order can fill.';}
  // Order of cases above deliberately prioritizes original stop and target.
  return {...result,decision,reason,nextAction,referencePrice:round(referencePrice),moveInTradeDirectionPct:movePct,comparisonVerified:true};
}
