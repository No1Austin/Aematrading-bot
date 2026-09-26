import { getAlpacaCryptoAssets, resolveAlpacaSpotAsset } from './botAlpacaAssetResolver.js';
import { inspectAlpacaPaperState } from './botAlpacaOrderReconciliation.js';
import getAlpacaExactPairQuote from './botAlpacaQuoteProvider.js';
import inspectAlpacaQuoteFunding from './botAlpacaFundingInspector.js';
import buildBotAlpacaMultiQuoteRiskPlan from '../risk/botAlpacaMultiQuoteRiskManager.js';

export async function validateAlpacaCandidate({ sourceSymbol, direction, stop, allocationQuote,
  committedQuote = 0, assetsReader = getAlpacaCryptoAssets, stateReader = inspectAlpacaPaperState,
  quoteReader = getAlpacaExactPairQuote, fundingReader = inspectAlpacaQuoteFunding } = {}) {
  const assets = await assetsReader();
  const asset = resolveAlpacaSpotAsset(sourceSymbol, assets);
  if (!asset.approved) return { approved: false, asset, blockers: asset.blockers, executionAuthority: false };
  const [state, quote, funding] = await Promise.all([
    stateReader(), quoteReader(asset.alpacaSymbol), fundingReader(asset.quoteCurrency)
  ]);
  const blockers = [];
  if (state.account?.status !== 'ACTIVE' || state.account?.cryptoStatus !== 'ACTIVE' ||
      state.account?.tradingBlocked || state.account?.accountBlocked) blockers.push('ACCOUNT_BLOCKED');
  if (state.hasOutstandingCryptoOrders) blockers.push('OUTSTANDING_SHARED_ACCOUNT_CRYPTO_ORDERS');
  if (state.cryptoPositions?.some(p => p.symbol === asset.alpacaSymbol)) blockers.push('EXISTING_SHARED_ACCOUNT_PAIR_POSITION');
  if (quote.symbol !== asset.alpacaSymbol || quote.source !== 'ALPACA_SAME_PAIR') blockers.push('PAIR_PRICE_MISMATCH');
  if (!funding.verified) blockers.push(funding.blocker || 'QUOTE_FUNDING_NOT_VERIFIED');
  const plan = buildBotAlpacaMultiQuoteRiskPlan({ direction, pair: asset.alpacaSymbol,
    entry: quote.ask, stop, verifiedSpendableQuote: funding.spendableQuote,
    allocationQuote, committedQuote, minOrderSize: Number(asset.minOrderSize),
    minTradeIncrement: Number(asset.minTradeIncrement), priceSource: quote.source,
    spreadPercent: quote.spreadPercent, fundingEvidence: funding });
  return { approved: blockers.length === 0 && plan.approved, asset, quote, funding,
    riskPlan: plan, blockers: [...blockers, ...plan.blockers], executionAuthority: false,
    note: 'VALIDATION_ONLY: price and funds must be rechecked immediately before any future order.' };
}
export default validateAlpacaCandidate;
