import { recordAlpacaOrderPreview } from './botAlpacaOrderIntentStore.js';

/** Read-only, single-candidate preparation. Never sends POST /v2/orders. */
export async function prepareAlpacaPaperOrderPreview({ sourceSymbol, direction = 'LONG', stop,
  allocationQuote, committedQuote = 0, persist = false, validator,
  journalFile } = {}) {
  if (!Number.isFinite(stop) || stop <= 0 || !Number.isFinite(allocationQuote) || allocationQuote <= 0 ||
      !Number.isFinite(committedQuote) || committedQuote < 0) throw Error('INVALID_PREVIEW_ARGUMENTS');
  const activeValidator = validator || (await import('./botAlpacaCandidateValidator.js')).default;
  const result = await activeValidator({ sourceSymbol, direction, stop, allocationQuote, committedQuote });
  const blockers = [...new Set(result.blockers || [])];
  const pair = result.asset?.alpacaSymbol || null;
  // Fail closed even if a substituted validator claims approval.
  if (direction !== 'LONG') blockers.push('SPOT_LONG_ONLY');
  if (result.asset?.quoteCurrency !== 'USD') blockers.push('NON_USD_EXECUTION_NOT_ENABLED');
  if (!result.funding?.verified || result.funding.currency !== 'USD') blockers.push('USD_FUNDING_NOT_VERIFIED');
  if (result.quote?.symbol !== pair || result.quote?.source !== 'ALPACA_SAME_PAIR' ||
      !Number.isFinite(result.quote?.ageMs) || result.quote.ageMs < 0 || result.quote.ageMs > 30000)
    blockers.push('FRESH_EXACT_PAIR_QUOTE_REQUIRED');
  if (!result.riskPlan?.approved || !Number.isFinite(result.riskPlan?.quantity) || result.riskPlan.quantity <= 0)
    blockers.push('VALID_SPOT_RISK_PLAN_REQUIRED');
  if (!result.approved) blockers.push('CANDIDATE_NOT_APPROVED');
  const preview = {
    status: 'PREVIEW_ONLY', executionAuthority: false, paperOnly: true,
    pair, sourceSymbol, direction, quoteCurrency: result.asset?.quoteCurrency || null,
    approvedForPreview: blockers.length === 0, blockers: [...new Set(blockers)],
    quantity: blockers.length ? null : result.riskPlan.quantity,
    indicativeAsk: result.quote?.ask ?? null, indicativeStop: stop,
    indicativeNotionalQuote: blockers.length ? null : result.riskPlan.notionalQuote,
    quoteObservedAt: result.quote?.timestamp ?? null,
    note: 'Indicative only; not an executable order. Revalidate immediately before any future submission.'
  };
  if (persist && pair) return recordAlpacaOrderPreview(preview, journalFile);
  return preview;
}
export default prepareAlpacaPaperOrderPreview;
