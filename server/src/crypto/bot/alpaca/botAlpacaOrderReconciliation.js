import { alpacaPaperGet } from "./botAlpacaReadClient.js";

// Reads existing Alpaca account state. Does not import historical AEMA simulator fills.
export async function inspectAlpacaPaperState() {
  const [account, positions, orders] = await Promise.all([
    alpacaPaperGet("/v2/account"),
    alpacaPaperGet("/v2/positions"),
    alpacaPaperGet("/v2/orders", { status: "all", limit: 100, direction: "desc" })
  ]);
  if (!Array.isArray(positions) || !Array.isArray(orders)) throw new Error("INVALID_ALPACA_STATE_RESPONSE");
  const cryptoPositions = positions.filter(p => p.asset_class === "crypto");
  const cryptoOrders = orders.filter(o => o.asset_class === "crypto");
  const openStatuses = new Set(["new", "accepted", "pending_new", "partially_filled", "accepted_for_bidding", "held", "pending_cancel", "pending_replace"]);
  return {
    provider: "ALPACA_PAPER", readOnly: true, sharedAccount: true,
    account: { status: account.status, cryptoStatus: account.crypto_status ?? null,
      cashUsd: Number(account.cash), equityUsd: Number(account.equity),
      tradingBlocked: Boolean(account.trading_blocked), accountBlocked: Boolean(account.account_blocked) },
    cryptoPositions: cryptoPositions.map(p => ({ symbol: p.symbol, assetId: p.asset_id,
      quantity: p.qty, side: p.side, averageEntryPrice: p.avg_entry_price,
      marketValue: p.market_value, unrealizedPnl: p.unrealized_pl })),
    recentCryptoOrders: cryptoOrders.map(o => ({ id: o.id, clientOrderId: o.client_order_id,
      symbol: o.symbol, side: o.side, status: o.status, quantity: o.qty,
      filledQuantity: o.filled_qty, filledAveragePrice: o.filled_avg_price,
      submittedAt: o.submitted_at, filledAt: o.filled_at })),
    hasOutstandingCryptoOrders: cryptoOrders.some(o => openStatuses.has(o.status)),
    orderHistoryLimitedToLatest100AccountOrders: true,
    observedAt: new Date().toISOString()
  };
}
