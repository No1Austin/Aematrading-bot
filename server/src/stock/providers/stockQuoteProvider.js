import { stockClient } from './stockHttpClient.js';

/** Research-only Alpaca equity quote evidence. Never substitutes OHLCV close for bid/ask. */
export async function getStockQuoteEvidence({
  symbol, feed = 'iex', asOf = Date.now(), maximumAgeMs = 120000,
} = {}) {
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol ?? '')) throw Error('INVALID_STOCK_SYMBOL');
  if (!Number.isFinite(asOf) || !Number.isFinite(maximumAgeMs) || maximumAgeMs < 0)
    throw Error('INVALID_STOCK_QUOTE_TIME_PARAMETERS');

  const r = await stockClient().get(`/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`, {
    params: { feed },
  });
  const q = r.data?.quote;
  const timestamp = q?.t ?? null;
  const parsedTimestamp = timestamp ? Date.parse(timestamp) : NaN;
  const ageMs = Number.isFinite(parsedTimestamp) ? asOf - parsedTimestamp : null;
  const bid = q?.bp == null ? NaN : Number(q.bp);
  const ask = q?.ap == null ? NaN : Number(q.ap);
  const bidSize = q?.bs == null ? NaN : Number(q.bs);
  const askSize = q?.as == null ? NaN : Number(q.as);

  const quoteIsValid = Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > bid;
  const timestampIsValid = ageMs !== null && ageMs >= 0;
  const fresh = timestampIsValid && ageMs <= maximumAgeMs;

  // A stale quote may be useful for historical context, but must never pass
  // as current spread/slippage evidence or approve a live-like setup.
  if (!quoteIsValid || !timestampIsValid || !fresh) {
    const reason = !quoteIsValid ? 'INVALID_STOCK_BID_ASK'
      : !timestampIsValid ? 'INVALID_STOCK_QUOTE_TIMESTAMP'
      : 'STALE_STOCK_QUOTE';
    return {
      available: false, reason, source: 'ALPACA_STOCK_LATEST_QUOTE',
      timestamp, ageMs, maximumAgeMs,
      referenceQuote: quoteIsValid && timestampIsValid
        ? { bid, ask, bidSize, askSize, spreadPercent: (ask - bid) / ((bid + ask) / 2) * 100,
            evidenceType: 'HISTORICAL_REFERENCE_NOT_CURRENT' }
        : null,
    };
  }

  const mid = (bid + ask) / 2;
  return {
    available: true, source: 'ALPACA_STOCK_LATEST_QUOTE',
    timestamp, ageMs, bid, ask, bidSize, askSize,
    spreadPercent: (ask - bid) / mid * 100, slippagePercent: null,
  };
}
