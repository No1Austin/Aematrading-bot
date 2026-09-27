import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
import { getAlpacaCryptoAssets, resolveAlpacaSpotAsset } from './botAlpacaAssetResolver.js';
import prepareAlpacaPaperOrderPreview from './botAlpacaOrderPreview.js';

/** Original bot candidates -> dedicated Alpaca paper compatibility/price/risk previews.
 * Read-only. Does not grant execution authority or mutate either trading ledger.
 */
export async function previewExistingBotCandidatesForAlpaca(candidates = [], {
  gateway = makeAlpacaPaperGateway(),
  assetsReader = getAlpacaCryptoAssets,
  previewer = prepareAlpacaPaperOrderPreview,
  limit = 5,
} = {}) {
  const result = { mode: 'ALPACA_SHADOW_PREVIEW', executionAuthority: false,
    paperOrdersSubmitted: 0, candidates: [], blockers: [] };
  if (process.env.AEMA_BOT_EXECUTION_MODE !== 'INTERNAL_PAPER') {
    result.blockers.push('KEEP_EXISTING_BOT_INTERNAL_PAPER'); return result;
  }
  const expected = process.env.AEMA_CRYPTO_ALPACA_ACCOUNT_ID;
  if (!expected) { result.blockers.push('DEDICATED_ACCOUNT_ID_REQUIRED'); return result; }
  if (process.env.ALPACA_CRYPTO_BASE_URL?.replace(/\/+$/, '') !== 'https://paper-api.alpaca.markets') {
    result.blockers.push('PAPER_ENDPOINT_REQUIRED'); return result;
  }
  const account = await gateway.getAccount();
  if (account?.id !== expected || account.status !== 'ACTIVE' ||
      account.crypto_status !== 'ACTIVE' || account.trading_blocked || account.account_blocked) {
    result.blockers.push('DEDICATED_ACCOUNT_VERIFICATION_FAILED'); return result;
  }
  const [positions, orders, assets] = await Promise.all([
    gateway.getPositions(), gateway.listOrders(), assetsReader(),
  ]);
  if (!Array.isArray(positions) || !Array.isArray(orders) || !Array.isArray(assets)) {
    result.blockers.push('BROKER_STATE_UNAVAILABLE'); return result;
  }
  const live = new Set(['new', 'accepted', 'pending_new', 'partially_filled',
    'pending_cancel', 'pending_replace', 'accepted_for_bidding', 'held', 'stopped', 'suspended']);
  if (positions.some(p => p.asset_class === 'crypto') ||
      orders.some(o => o.asset_class === 'crypto' && live.has(o.status))) {
    result.blockers.push('EXISTING_CRYPTO_POSITION_OR_ORDER_REVIEW_REQUIRED'); return result;
  }
  const max = Math.max(0, Math.min(5, Math.trunc(Number(limit) || 0)));
  for (const candidate of (Array.isArray(candidates) ? candidates : []).slice(0, max)) {
    const row = { sourceSymbol: candidate?.symbol ?? null, eligible: false, blockers: [] };
    result.candidates.push(row);
    if (candidate?.setup?.approved !== true) { row.blockers.push('SETUP_NOT_APPROVED'); continue; }
    if (candidate?.setup?.direction !== 'LONG') { row.blockers.push('ALPACA_SPOT_LONG_ONLY'); continue; }
    const asset = resolveAlpacaSpotAsset(candidate.symbol, assets);
    if (!asset.approved) { row.blockers.push(...asset.blockers); continue; }
    if (asset.quoteCurrency !== 'USD') { row.blockers.push('USD_PILOT_ONLY'); continue; }
    const stop = Number(candidate.setup.stop);
    if (!(stop > 0)) { row.blockers.push('INVALID_STOP'); continue; }
    try {
      // Previewer independently checks fresh same-pair Alpaca quotes, cash and risk.
      const preview = await previewer({ sourceSymbol: candidate.symbol,
        direction: 'LONG', stop, allocationQuote: 100, persist: false });
      row.alpacaPair = asset.alpacaSymbol;
      row.eligible = preview?.approvedForPreview === true;
      row.blockers.push(...(preview?.blockers ?? []));
      row.indicativeNotionalQuote = preview?.indicativeNotionalQuote ?? null;
      row.quoteObservedAt = preview?.quoteObservedAt ?? null;
    } catch (error) { row.blockers.push(`PREVIEW_FAILED:${error?.message || String(error)}`); }
  }
  return result;
}
export default previewExistingBotCandidatesForAlpaca;
