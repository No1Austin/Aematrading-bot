import { makeAlpacaPaperGateway } from './botAlpacaPaperOrderGateway.js';
import { latestExecutionState, appendExecutionEvent } from './botAlpacaExecutionJournal.js';
export async function reconcileBotAlpacaPaperPositions({ gateway = makeAlpacaPaperGateway(), journalFile } = {}) {
  const records = latestExecutionState(journalFile);
  const owned = records.filter(x => x.clientOrderId?.startsWith('aema-pilot-'));
  const results = [];
  for (const record of owned) {
    try {
      const order = await gateway.getOrderByClientId(record.clientOrderId);
      const result = { clientOrderId: record.clientOrderId, providerOrderId: order.id, pair: order.symbol,
        status: order.status, filledQty: order.filled_qty, filledAvgPrice: order.filled_avg_price,
        side: order.side, submittedAt: order.submitted_at, filledAt: order.filled_at };
      if (record.type !== 'RECONCILED' || JSON.stringify(record.order) !== JSON.stringify(result))
        appendExecutionEvent({ type: 'RECONCILED', clientOrderId: record.clientOrderId, order: result }, journalFile);
      results.push(result);
    } catch (e) {
      // A 404 is NOT proof an order was never submitted. Fail closed.
      results.push({ clientOrderId: record.clientOrderId, status: 'UNRESOLVED', errorCode: e?.response?.status || e?.code || 'UNKNOWN' });
    }
  }
  const positions = await gateway.getPositions();
  const btc = positions.filter(p => p.asset_class === 'crypto' && ['BTC/USD', 'BTCUSD'].includes(p.symbol));
  return { provider: 'ALPACA_PAPER', paperOnly: true, readOnly: true, sharedAccount: true,
    ownedOrders: results, accountBtcPositions: btc.map(p => ({ symbol: p.symbol, qty: p.qty, avgEntryPrice: p.avg_entry_price,
      currentPrice: p.current_price, unrealizedPnl: p.unrealized_pl, assetId: p.asset_id })),
    warning: 'Account positions are shared and may include external orders. No position modification or automatic stop orders.' };
}
export default reconcileBotAlpacaPaperPositions;
