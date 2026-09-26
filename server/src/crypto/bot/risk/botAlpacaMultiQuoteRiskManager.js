// Pure calculation. Quote-currency balances MUST come from independently verified
// spendable funds. USD cash must never be reused as USDT/USDC buying power.
const QUOTES = new Set(['USD', 'USDT', 'USDC']);
const finite = v => typeof v === 'number' && Number.isFinite(v);
// Handles decimal and scientific-notation increments such as 0.000000001 (1e-9).
function decimalPlaces(value) {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const fractionalDigits = (mantissa.split('.')[1] || '').length;
  return Math.max(0, fractionalDigits - Number(exponent));
}
function floorStep(value, step) {
  const decimals = Math.min(12, decimalPlaces(step));
  return Number((Math.floor(value / step + 1e-10) * step).toFixed(decimals));
}
export function buildBotAlpacaMultiQuoteRiskPlan({
  direction, pair, entry, stop, verifiedSpendableQuote, allocationQuote,
  committedQuote = 0, riskPercent = 1, maxNotionalPercent = 25,
  minOrderSize, minTradeIncrement, priceSource, maxSpreadPercent = 0.5,
  spreadPercent, fundingEvidence
} = {}) {
  const blockers = [];
  const match = /^([A-Z0-9]+)\/(USD|USDT|USDC)$/.exec(String(pair ?? '').toUpperCase());
  const quoteCurrency = match?.[2] ?? null;
  if (!match || !QUOTES.has(quoteCurrency)) blockers.push('INVALID_EXACT_PAIR');
  if (direction !== 'LONG') blockers.push('SPOT_LONG_ONLY');
  if (priceSource !== 'ALPACA_SAME_PAIR') blockers.push('EXACT_ALPACA_PRICE_REQUIRED');
  if (!fundingEvidence || fundingEvidence.currency !== quoteCurrency || fundingEvidence.verified !== true ||
      fundingEvidence.provider !== 'ALPACA_PAPER' || !Number.isFinite(Date.parse(fundingEvidence.observedAt)) ||
      Date.now() - Date.parse(fundingEvidence.observedAt) > 30000 ||
      Date.now() - Date.parse(fundingEvidence.observedAt) < -30000) blockers.push('QUOTE_FUNDING_NOT_VERIFIED');
  if (![entry, stop, verifiedSpendableQuote, allocationQuote, committedQuote, riskPercent,
    maxNotionalPercent, minOrderSize, minTradeIncrement, spreadPercent].every(finite) ||
    !(entry > 0 && stop > 0 && stop < entry && verifiedSpendableQuote >= 0 && allocationQuote > 0 &&
      committedQuote >= 0 && riskPercent > 0 && maxNotionalPercent > 0 && minOrderSize > 0 && minTradeIncrement > 0)) {
    blockers.push('INVALID_RISK_INPUTS');
  }
  if (finite(spreadPercent) && spreadPercent > maxSpreadPercent) blockers.push('SPREAD_TOO_WIDE');
  if (blockers.length) return { approved: false, blockers, quoteCurrency, quantity: 0, executionAuthority: false };
  const spendable = Math.min(verifiedSpendableQuote, Math.max(0, allocationQuote - committedQuote));
  const riskBudgetQuote = allocationQuote * riskPercent / 100;
  const cap = Math.min(spendable, allocationQuote * maxNotionalPercent / 100);
  const quantity = floorStep(Math.min(riskBudgetQuote / (entry - stop), cap / entry), minTradeIncrement);
  const notionalQuote = quantity * entry;
  if (quantity < minOrderSize) blockers.push('BELOW_MIN_ORDER_SIZE');
  if (notionalQuote > spendable + 1e-8) blockers.push('INSUFFICIENT_QUOTE_FUNDS');
  return { approved: blockers.length === 0, blockers, pair, quoteCurrency, quantity, notionalQuote,
    plannedRiskQuote: quantity * (entry - stop), riskBudgetQuote, spendableQuote: spendable,
    leverage: 1, executionAuthority: false, paperOnly: true };
}
export default buildBotAlpacaMultiQuoteRiskPlan;
