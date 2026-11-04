/** Stock-only, deterministic snapshot review. Does not approve, alter, or execute trades. */
const num = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const dateMs = x => { const n = typeof x === 'number' ? x : Date.parse(x); return Number.isFinite(n) ? n : null; };
const sideOf = row => {
  const s = String(row?.researchDirection ?? row?.direction ?? row?.setup?.setupType ?? '').toUpperCase();
  return ['BULL','LONG'].includes(s) ? 'BULL' : ['BEAR','SHORT'].includes(s) ? 'BEAR' : null;
};
export function reviewStockEntrySnapshot(row, {referencePrice, asOf=Date.now(), maxAgeMinutes=30}={}) {
  const s = row?.setup ?? {};
  const direction = sideOf(row);
  const entry = s.entry, stop = s.stop, target = s.target;
  const blockers = [];
  if (!direction) blockers.push('DIRECTION_UNAVAILABLE');
  if (![entry,stop,target].every(num)) blockers.push('LEVELS_UNAVAILABLE');
  else if (direction === 'BULL' && !(stop < entry && entry < target) || direction === 'BEAR' && !(target < entry && entry < stop)) blockers.push('INVALID_LEVEL_GEOMETRY');
  if (s.approved !== true) blockers.push('ORIGINAL_SETUP_NOT_APPROVED');
  if (row?.crossHorizonConflict) blockers.push('CROSS_HORIZON_CONFLICT_REVIEW');
  if (!num(referencePrice)) blockers.push('REFERENCE_PRICE_UNAVAILABLE');
  const now = dateMs(asOf);
  const timestamp = s.lastBarAt ?? s.asOf ?? s.createdAt ?? row?.completedAt ?? null;
  const barAt = timestamp === null ? null : dateMs(timestamp);
  if (now === null || !Number.isFinite(maxAgeMinutes) || maxAgeMinutes <= 0) blockers.push('REVIEW_INPUT_INVALID');
  if (barAt === null) blockers.push('BAR_TIMESTAMP_UNAVAILABLE');
  else if (now !== null && (barAt > now + 60000 || now - barAt > maxAgeMinutes * 60000)) blockers.push('STALE_OR_FUTURE_DATA');
  if (num(referencePrice) && num(stop) && direction === 'BULL' && referencePrice <= stop || num(referencePrice) && num(stop) && direction === 'BEAR' && referencePrice >= stop) blockers.push('STOP_ALREADY_BREACHED');
  if (num(referencePrice) && num(target) && direction === 'BULL' && referencePrice >= target || num(referencePrice) && num(target) && direction === 'BEAR' && referencePrice <= target) blockers.push('TARGET_ALREADY_REACHED');
  const riskReward = [entry,stop,target].every(num) && Math.abs(entry-stop)>0 ? Math.abs(target-entry)/Math.abs(entry-stop) : null;
  return {symbol:row?.symbol??null,horizon:row?.horizon??null,direction,
    originalApproved:s.approved===true,originalLevels:{entry:num(entry)?entry:null,stop:num(stop)?stop:null,target:num(target)?target:null},
    referencePrice:num(referencePrice)?referencePrice:null,estimatedGrossRiskReward:Number.isFinite(riskReward)?riskReward:null,
    reviewStatus:blockers.length?'REVIEW_REQUIRED':'STRUCTURE_NOT_INVALIDATED',blockers,
    proposedEntry:null,proposedStop:null,proposedTarget:null,
    note:'Snapshot checks only; no candle structure confirmation, live quote verification, net R:R, or new entry approval.',
    researchOnly:true,manualExecutionOnly:true,executionDisabled:true,executionAuthority:false};
}
export default reviewStockEntrySnapshot;
