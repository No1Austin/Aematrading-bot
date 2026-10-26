/** EMA crypto research-only final price geometry and live-market guard. */
const number = x => x === null || x === undefined || x === '' ? null : (Number.isFinite(Number(x)) ? Number(x) : null);
const positive = x => { const n = number(x); return n !== null && n > 0 ? n : null; };
const unique = a => [...new Set(a)];
export function evaluateEntryStopTargetGuard({selectedResult, market, direction, maximumEntryDeviationR = 0.75} = {}) {
  const side = String(direction || '').toUpperCase();
  const bull = side === 'BULL' || side === 'LONG';
  const bear = side === 'BEAR' || side === 'SHORT';
  const entry = positive(selectedResult?.preferredEntry);
  const stop = positive(selectedResult?.stop ?? selectedResult?.invalidation?.price);
  const targets = (Array.isArray(selectedResult?.targets) ? selectedResult.targets : []).map(x => positive(typeof x === 'object' ? (x?.price ?? x?.target) : x)).filter(x => x !== null);
  const currentPrice = positive(bull ? (market?.ask ?? market?.lastPrice ?? market?.price) : (market?.bid ?? market?.lastPrice ?? market?.price));
  const blockers = [];
  if (!bull && !bear) blockers.push('PRICE_GUARD_DIRECTION_UNKNOWN');
  if (entry === null || stop === null) blockers.push('PRICE_GUARD_GEOMETRY_MISSING');
  const risk = entry !== null && stop !== null ? Math.abs(entry - stop) : null;
  if (risk !== null && risk <= 0) blockers.push('PRICE_GUARD_ZERO_RISK');
  if (risk !== null && ((bull && stop >= entry) || (bear && stop <= entry))) blockers.push('PRICE_GUARD_STOP_WRONG_SIDE');
  if (!targets.length) blockers.push('PRICE_GUARD_TARGETS_MISSING');
  if (entry !== null && targets.length && !targets.some(t => bull ? t > entry : t < entry)) blockers.push('PRICE_GUARD_TARGET_WRONG_SIDE');
  let deviationR = null;
  if (currentPrice !== null && entry !== null && stop !== null && risk > 0 && (bull || bear)) {
    if ((bull && currentPrice <= stop) || (bear && currentPrice >= stop)) blockers.push('SETUP_INVALIDATED_BY_CURRENT_PRICE');
    if (targets.length && targets.every(t => bull ? currentPrice >= t : currentPrice <= t)) blockers.push('SETUP_ALL_TARGETS_ALREADY_PASSED');
    deviationR = (bull ? currentPrice - entry : entry - currentPrice) / risk;
    if (deviationR > maximumEntryDeviationR) blockers.push('SETUP_ENTRY_CHASE_EXCEEDS_RISK_BUDGET');
  }
  const spreadPct = number(market?.spreadPercent ?? market?.spread?.percent);
  const slippagePct = number(bull ? (market?.slippage?.buy?.percent ?? market?.slippage?.buyPercent) : (market?.slippage?.sell?.percent ?? market?.slippage?.sellPercent));
  // Round-trip cost is a conservative estimate only when both market inputs exist; fees are not inferred.
  const costPrice = spreadPct !== null && slippagePct !== null && entry !== null ? entry * (Math.max(0, spreadPct) + 2 * Math.max(0, slippagePct)) / 100 : null;
  const targetEconomics = targets.map(target => {
    const reward = entry !== null ? (bull ? target - entry : entry - target) : null;
    return {target, grossRR: risk > 0 && reward !== null ? reward / risk : null,
      estimatedNetRRExcludingFees: costPrice !== null && risk > 0 && reward !== null ? (reward - costPrice) / (risk + costPrice) : null};
  });
  return {approved: blockers.length === 0, blockers: unique(blockers), entry, stop, targets, currentPrice, deviationR, targetEconomics, costEstimateAvailable: costPrice !== null, notes:['Research-only; no orders','Cost estimates exclude fees and funding','Unknown market inputs are not invented']};
}
export default evaluateEntryStopTargetGuard;
