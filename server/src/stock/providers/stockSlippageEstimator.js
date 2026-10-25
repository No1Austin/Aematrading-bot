/** Research-only estimate, NOT an executable price or measured fill.
 * Quote size is displayed size, not guaranteed available liquidity.
 * Conservative bounds require the hypothetical order to fit inside a fraction
 * of BOTH sides of the top-of-book quote.
 */
const valid = n => typeof n === 'number' && Number.isFinite(n);
export function estimateStockSlippage({quote, assumedOrderShares=10, maximumParticipation=0.10, minimumSlippagePercent=0.05}={}) {
  if (!quote?.available || !valid(quote.bid) || !valid(quote.ask) ||
      !valid(quote.bidSize) || !valid(quote.askSize) || !valid(quote.spreadPercent))
    return {available:false,reason:'STOCK_SLIPPAGE_QUOTE_EVIDENCE_UNAVAILABLE'};
  if (!Number.isInteger(assumedOrderShares) || assumedOrderShares < 1 || assumedOrderShares > 1000 ||
      !valid(maximumParticipation) || maximumParticipation <= 0 || maximumParticipation > 0.25 ||
      !valid(minimumSlippagePercent) || minimumSlippagePercent < 0.01 || minimumSlippagePercent > 1)
    return {available:false,reason:'STOCK_SLIPPAGE_MODEL_PARAMETERS_INVALID'};
  const displayedShares=Math.min(quote.bidSize,quote.askSize);
  if (displayedShares <= 0 || assumedOrderShares > displayedShares * maximumParticipation)
    return {available:false,reason:'STOCK_TOP_OF_BOOK_SIZE_INSUFFICIENT',displayedShares,assumedOrderShares};
  // Model heuristic: floor plus half-spread plus participation penalty.
  // Cannot guarantee fills, especially during volatility or at the open.
  const participation=assumedOrderShares/displayedShares;
  const percent=minimumSlippagePercent + quote.spreadPercent/2 + participation*0.20;
  return {available:true,percent:Number(percent.toFixed(6)),model:'TOP_OF_BOOK_HEURISTIC_V1',
    evidenceType:'ESTIMATED_NOT_OBSERVED',assumedOrderShares,displayedShares,participation,
    warning:'Quote sizes can change before execution; no order book depth or fill history used.'};
}
