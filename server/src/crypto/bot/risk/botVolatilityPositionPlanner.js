/**
 * EMA research-only volatility and position planner.
 * No order placement. Linear USDT-margined futures only.
 * Prices, ATR and structural levels must come from timestamped market observations.
 */
const pos = (x) => Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null;
const nonneg = (x) => Number.isFinite(Number(x)) && Number(x) >= 0 ? Number(x) : null;

export function planVolatilityPosition({
  direction, entry, atr, structureStop, atrMultiplier = 2,
  marginUsd, leverage, maxLossUsd, spreadPercent = 0,
  slippagePercent = 0, roundTripFeePercent = 0,
  target, contractStep = null,
} = {}) {
  const side = String(direction || '').toUpperCase();
  if (!['BULL','BEAR','LONG','SHORT'].includes(side)) throw new Error('DIRECTION_REQUIRED');
  const bull = side === 'BULL' || side === 'LONG';
  const e = pos(entry), a = pos(atr), k = pos(atrMultiplier);
  const margin = pos(marginUsd), lev = pos(leverage), cap = pos(maxLossUsd);
  if (![e,a,k,margin,lev,cap].every(Boolean)) throw new Error('INVALID_ENTRY_ATR_OR_RISK_PROFILE');
  const s = pos(structureStop);
  if (s && (bull ? s >= e : s <= e)) throw new Error('STRUCTURE_STOP_WRONG_SIDE');
  const atrStop = bull ? e - k*a : e + k*a;
  const stop = s ? (bull ? Math.min(s,atrStop) : Math.max(s,atrStop)) : atrStop;
  if (stop <= 0) throw new Error('STOP_NOT_POSITIVE');
  const distance = Math.abs(e-stop), stopPercent = distance/e*100;
  const spread = nonneg(spreadPercent), slip = nonneg(slippagePercent), fee = nonneg(roundTripFeePercent);
  if ([spread,slip,fee].some(v=>v===null)) throw new Error('INVALID_TRADING_COST');
  const costFraction = (spread+slip+fee)/100;
  const lossFraction = stopPercent/100+costFraction;
  const requestedNotional = margin*lev;
  const cappedNotional = Math.min(requestedNotional,cap/lossFraction);
  const step = contractStep === null ? null : pos(contractStep);
  if (contractStep !== null && !step) throw new Error('INVALID_CONTRACT_STEP');
  const rawQuantity = cappedNotional/e;
  const quantity = step ? Math.floor((rawQuantity+1e-12)/step)*step : rawQuantity;
  const notionalUsd = quantity*e;
  const plannedLossUsd = notionalUsd*lossFraction;
  const t = target === undefined || target === null ? null : pos(target);
  if (target !== undefined && target !== null && !t) throw new Error('INVALID_TARGET');
  const targetValid = t !== null && (bull ? t>e : t<e);
  const grossRewardUsd = targetValid ? notionalUsd*Math.abs(t-e)/e : null;
  const netRewardUsd = grossRewardUsd === null ? null : grossRewardUsd-notionalUsd*costFraction;
  return {
    status: notionalUsd > 0 ? 'RESEARCH_PLAN' : 'NOT_EXECUTABLE',
    direction: bull?'BULL':'BEAR', entry:e, stop, target:t, atr:a,
    stopMethod: s?'ATR_AND_STRUCTURE':'ATR_ONLY', atrMultiplier:k,
    stopPercent, quantity, notionalUsd, estimatedMarginUsd:notionalUsd/lev,
    requestedMarginUsd:margin, leverage:lev, maxLossUsd:cap, plannedLossUsd,
    costsPercent:spread+slip+fee, grossRewardUsd, netRewardUsd,
    netRiskReward: netRewardUsd===null?null:netRewardUsd/plannedLossUsd,
    resizedForRisk: notionalUsd < requestedNotional-1e-8,
    warnings:[
      ...(s ? [] : ['STRUCTURAL_INVALIDATION_NOT_SUPPLIED']),
      ...(targetValid?[]:['TARGET_NOT_VALIDATED']),
      'LIQUIDATION_PRICE_NOT_VERIFIED',
      'STOP_FILL_AND_SLIPPAGE_NOT_GUARANTEED',
      'NOT_A_LIVE_EXCHANGE_ORDER',
    ],
  };
}
export default planVolatilityPosition;
