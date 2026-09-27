import { randomUUID } from 'node:crypto';
import { appendExecutionEvent, latestExecutionState } from './botAlpacaExecutionJournal.js';
import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
const ACTIVE = new Set(['PREPARED','SUBMISSION_UNKNOWN','SUBMITTED','new','accepted','pending_new','partially_filled','pending_cancel','pending_replace','filled']);
const MIN_RECHECK_MS = 30000;
let inFlight = false;
export async function submitOneGuardedAlpacaPaperOrder({ sourceSymbol, stop, allocationQuote, committedQuote = 0,
  explicitAuthorization = false, gateway = makeAlpacaPaperGateway(), previewer,
  journalFile, now = () => Date.now() } = {}) {
  if (!explicitAuthorization || process.env.AEMA_ALPACA_MANUAL_PAPER_ORDER !== 'I_AUTHORIZE_ONE_PAPER_ORDER') throw Error('EXPLICIT_PAPER_ORDER_AUTHORIZATION_REQUIRED');
  if (process.env.AEMA_BOT_EXECUTION_MODE !== 'INTERNAL_PAPER') throw Error('KEEP_EXISTING_BOT_IN_INTERNAL_PAPER_MODE');
  if (inFlight) throw Error('ALPACA_ORDER_SUBMISSION_IN_PROGRESS');
  if (sourceSymbol !== 'BTCUSD') throw Error('INITIAL_PILOT_BTCUSD_ONLY');
  if (!Number.isFinite(allocationQuote) || allocationQuote <= 0 || allocationQuote > 1000) throw Error('PILOT_ALLOCATION_LIMIT_1000_USD');
  inFlight = true;
  try {
    const prior = latestExecutionState(journalFile);
    // Until an operator explicitly reconciles the journal, even filled/cancelled orders block another pilot.
    if (prior.length) throw Error('PILOT_ALREADY_ATTEMPTED_REVIEW_JOURNAL_BEFORE_NEXT_ORDER');
    // Revalidate at submission time; never use stored preview quantity or price.
    const actualPreviewer = previewer || (await import('./botAlpacaOrderPreview.js')).default;
    const preview = await actualPreviewer({ sourceSymbol, stop, allocationQuote, committedQuote, persist: false });
    if (!preview.approvedForPreview || preview.executionAuthority !== false || preview.pair !== 'BTC/USD' || preview.direction !== 'LONG' ||
        !Number.isFinite(preview.quantity) || preview.quantity <= 0 || !Number.isFinite(preview.indicativeAsk) ||
        !Number.isFinite(Date.parse(preview.quoteObservedAt)) || Math.abs(now() - Date.parse(preview.quoteObservedAt)) > MIN_RECHECK_MS)
      throw Error(`FRESH_APPROVED_PREVIEW_REQUIRED:${(preview.blockers || []).join(',')}`);
    // Pilot is intentionally smaller than the full preview allocation.
    const maxQty = Math.floor((Math.min(25, allocationQuote * 0.025) / preview.indicativeAsk) * 1e9) / 1e9;
    const qty = Math.min(preview.quantity, maxQty);
    if (!(qty > 0) || qty < 0.000012603) throw Error('PILOT_QUANTITY_TOO_SMALL');
    const clientOrderId = `aema-pilot-${randomUUID()}`;
    appendExecutionEvent({ type: 'PREPARED', clientOrderId, pair: 'BTC/USD', qty, indicativeAsk: preview.indicativeAsk, previewAt: preview.quoteObservedAt }, journalFile);
    const order = { symbol: 'BTC/USD', qty: qty.toFixed(9), side: 'buy', type: 'market', time_in_force: 'gtc', client_order_id: clientOrderId };
    try {
      const response = await gateway.submit(order);
      appendExecutionEvent({ type: 'SUBMITTED', clientOrderId, providerOrderId: response.id, providerStatus: response.status, filledQty: response.filled_qty, filledAvgPrice: response.filled_avg_price }, journalFile);
      return { status: 'PAPER_ORDER_SUBMITTED', clientOrderId, providerOrderId: response.id, providerStatus: response.status, paperOnly: true };
    } catch (e) {
      // Never retry a POST automatically: Alpaca may have accepted it before a timeout.
      appendExecutionEvent({ type: 'SUBMISSION_UNKNOWN', clientOrderId, errorCode: e?.response?.status || e?.code || 'UNKNOWN' }, journalFile);
      return { status: 'SUBMISSION_UNKNOWN_RECONCILE_BEFORE_RETRY', clientOrderId, paperOnly: true };
    }
  } finally { inFlight = false; }
}
export default submitOneGuardedAlpacaPaperOrder;
