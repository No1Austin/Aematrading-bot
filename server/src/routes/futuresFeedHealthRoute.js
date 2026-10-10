/** Read-only public perpetual market data health checks. No keys, trading, or execution. */
import { Router } from 'express';
const router = Router();
const number = (v) => v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null;
const timeoutMs = 8000;
async function request(url, { method = 'GET', body } = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return { data: await response.json(), latencyMs: Date.now() - started };
}
const hyper = (body) => request('https://api.hyperliquid.xyz/info', { method: 'POST', body });
const gate = (path) => request(`https://api.gateio.ws/api/v4/futures/usdt/${path}`);
const kraken = (path) => request(`https://futures.kraken.com/derivatives/api/v3/${path}`);
async function hyperliquid() {
  const { data: rows, latencyMs } = await hyper({ type: 'metaAndAssetCtxs' });
  const universe = rows?.[0]?.universe || [];
  const ctx = rows?.[1] || [];
  const active = universe.map((u, i) => ({ name: u.name, context: ctx[i] }))
    .filter(({ name, context }) => name && context && !context.isDelisted && number(context.markPx) > 0);
  const btc = active.find(({ name }) => name === 'BTC');
  if (!btc) throw new Error('BTC_ACTIVE_PERPETUAL_NOT_FOUND');
  const [{ data: book }, { data: candles }] = await Promise.all([
    hyper({ type: 'l2Book', coin: btc.name }),
    hyper({ type: 'candleSnapshot', req: { coin: btc.name, interval: '15m', startTime: Date.now() - 100 * 15 * 60000, endTime: Date.now() } }),
  ]);
  const latest = candles?.at(-1);
  const bid = number(book?.levels?.[0]?.[0]?.px), ask = number(book?.levels?.[1]?.[0]?.px);
  return { provider: 'HYPERLIQUID', status: 'REACHABLE', latencyMs, activePerpetuals: active.length,
    sample: { symbol: btc.name, quoteAsset: 'USD', collateral: 'USDC (verify per DEX)', markPrice: number(btc.context.markPx),
      openInterest: number(btc.context.openInterest), funding: number(btc.context.funding),
      bid, ask, bookTimestamp: book?.time || null, candleCount: candles?.length || 0,
      latestCandleTimestamp: latest?.t || null, latestCandleClose: number(latest?.c) },
    note: 'Venue-specific contracts. No spot substitution. Candle timestamps are opening times.' };
}
async function gateio() {
  const [{ data: contracts, latencyMs }, { data: tickers }] = await Promise.all([
    gate('contracts'), gate('tickers'),
  ]);
  if (!Array.isArray(contracts) || !Array.isArray(tickers)) throw new Error('INVALID_GATE_RESPONSE');
  const contract = contracts.find((c) => c.name === 'BTC_USDT' && !c.in_delisting);
  const ticker = tickers.find((t) => t.contract === 'BTC_USDT');
  if (!contract || !ticker) throw new Error('BTC_USDT_ACTIVE_PERPETUAL_NOT_FOUND');
  const [{ data: book }, { data: candles }] = await Promise.all([
    gate('order_book?contract=BTC_USDT&limit=20'),
    gate('candlesticks?contract=BTC_USDT&interval=15m&limit=100'),
  ]);
  const last = candles?.at(-1);
  return { provider: 'GATE', status: 'REACHABLE', latencyMs, activePerpetuals: contracts.filter(c => !c.in_delisting).length,
    sample: { symbol: 'BTC_USDT', quoteAsset: 'USDT', markPrice: number(ticker.mark_price),
      lastPrice: number(ticker.last), openInterestContracts: number(ticker.total_size), funding: number(ticker.funding_rate),
      quoteVolume24h: number(ticker.volume_24h_quote),
      bid: number(ticker.highest_bid), ask: number(ticker.lowest_ask),
      bookBid: number(book?.bids?.[0]?.p), bookAsk: number(book?.asks?.[0]?.p),
      bookTimestamp: book?.current || null, candleCount: candles?.length || 0,
      latestCandleTimestamp: last?.t ? last.t * 1000 : null, latestCandleClose: number(last?.c) },
    note: 'Order book sizes are contract counts; conversion to base units requires contract multiplier.' };
}
async function krakenFutures() {
  const [{ data: instruments, latencyMs }, { data: tickers }] = await Promise.all([
    kraken('instruments'), kraken('tickers'),
  ]);
  if (instruments?.result !== 'success' || tickers?.result !== 'success') throw new Error('INVALID_KRAKEN_RESPONSE');
  const markets = (instruments.instruments || []).filter(i => /perpetual/i.test(i.type || '') && i.tradeable !== false);
  const btc = markets.find(i => /BTC|XBT/.test(i.symbol));
  const ticker = (tickers.tickers || []).find(t => t.symbol === btc?.symbol);
  return { provider: 'KRAKEN_FUTURES', status: 'REACHABLE', latencyMs, activePerpetuals: markets.length,
    sample: btc ? { symbol: btc.symbol, type: btc.type, tradeable: btc.tradeable,
      lastPrice: number(ticker?.last), markPrice: number(ticker?.markPrice),
      openInterest: number(ticker?.openInterest), funding: number(ticker?.fundingRate),
      tickerTime: ticker?.lastTime || null } : null,
    note: 'Kraken symbol/contract validation is required before integration; no spot substitution.' };
}
router.get('/futures-feeds', async (_req, res) => {
  const jobs = [hyperliquid, gateio, krakenFutures];
  const results = await Promise.all(jobs.map(async fn => {
    try { return await fn(); }
    catch (error) { return { provider: fn.name === 'gateio' ? 'GATE' : fn.name === 'krakenFutures' ? 'KRAKEN_FUTURES' : 'HYPERLIQUID', status: 'FAILED', error: String(error?.message || error).slice(0, 160) }; }
  }));
  res.set('Cache-Control', 'no-store');
  res.json({ system: 'AEMA_FUTURES_FEED_HEALTH', observedAt: new Date().toISOString(),
    environment: process.env.RENDER ? 'RENDER' : 'LOCAL_OR_OTHER',
    researchOnly: true, executionAuthority: false, liveExecution: false,
    productionMigrationEnabled: false, providers: results });
});
export default router;
