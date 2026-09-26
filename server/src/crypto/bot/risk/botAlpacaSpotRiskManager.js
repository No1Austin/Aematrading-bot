/** Pure read-only spot sizing. Input prices must be current prices for the EXACT Alpaca pair. */
// Handles decimal and scientific-notation increments such as 0.000000001 (1e-9).
function decimalPlaces(value) {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const fractionalDigits = (mantissa.split('.')[1] || '').length;
  return Math.max(0, fractionalDigits - Number(exponent));
}
const floorStep = (value, step) => {
  const decimals = Math.min(12, decimalPlaces(step));
  return Number((Math.floor((value / step) + 1e-10) * step).toFixed(Math.min(decimals, 9)));
};
export function buildBotAlpacaSpotRiskPlan({
  direction, entry, stop, availableUsd, allocationUsd, alreadyCommittedUsd = 0,
  riskPerTradePercent = 1, maximumPositionNotionalPercent = 25,
  minOrderSize, minTradeIncrement, quoteCurrency = "USD", priceSource = null
} = {}) {
  const blockers = [];
  if (direction !== "LONG") blockers.push("SPOT_LONG_ONLY");
  if (quoteCurrency !== "USD") blockers.push("USD_PAIR_REQUIRED_FOR_USD_CASH_SIZING");
  if (priceSource !== "ALPACA_SAME_PAIR") blockers.push("ALPACA_PAIR_PRICE_REQUIRED");
  const valid = [entry, stop, availableUsd, allocationUsd, alreadyCommittedUsd,
    riskPerTradePercent, maximumPositionNotionalPercent, minOrderSize, minTradeIncrement]
    .every(v => Number.isFinite(Number(v)));
  if (!valid || !(entry > 0 && stop > 0 && stop < entry && availableUsd >= 0 &&
    allocationUsd > 0 && alreadyCommittedUsd >= 0 && riskPerTradePercent > 0 &&
    maximumPositionNotionalPercent > 0 && minOrderSize > 0 && minTradeIncrement > 0)) {
    blockers.push("INVALID_SPOT_RISK_INPUTS");
  }
  if (blockers.length) return { approved: false, blockers, quantity: 0, notionalUsd: 0, leverage: 1 };
  const remaining = Math.max(0, allocationUsd - alreadyCommittedUsd);
  const spending = Math.min(remaining, availableUsd);
  const riskBudgetUsd = allocationUsd * riskPerTradePercent / 100;
  const notionalCap = Math.min(spending, allocationUsd * maximumPositionNotionalPercent / 100);
  const rawQty = Math.min(riskBudgetUsd / (entry - stop), notionalCap / entry);
  const quantity = floorStep(rawQty, minTradeIncrement);
  const notionalUsd = quantity * entry;
  const plannedRiskUsd = quantity * (entry - stop);
  if (quantity < minOrderSize) blockers.push("BELOW_ALPACA_MIN_ORDER_SIZE");
  if (notionalUsd > spending + 1e-8) blockers.push("INSUFFICIENT_ALLOCATED_CASH");
  if (plannedRiskUsd > riskBudgetUsd + 1e-8) blockers.push("RISK_LIMIT_EXCEEDED");
  return { approved: blockers.length === 0, blockers, quantity, notionalUsd,
    plannedRiskUsd, riskBudgetUsd, allocationUsd, alreadyCommittedUsd,
    availableUsd, leverage: 1, executionAuthority: false, paperOnly: true };
}
export default buildBotAlpacaSpotRiskPlan;
