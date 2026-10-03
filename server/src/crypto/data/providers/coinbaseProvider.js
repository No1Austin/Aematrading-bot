/**
 * AEMA Coinbase public market-data adapter.
 * Research/data only: no authentication, orders, custody or execution.
 */
const BASE = process.env.AEMA_COINBASE_MARKET_BASE_URL || "https://api.coinbase.com/api/v3/brokerage";

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "cache-control": "no-cache" },
    });
    if (!response.ok) {
      throw new Error(`COINBASE_HTTP_${response.status}:${new URL(url).pathname}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function listCoinbaseProducts(options = {}) {
  const timeoutMs = Number(options.timeoutMs || 12000);
  const result = await fetchJson(`${BASE}/market/products`, timeoutMs);
  return Array.isArray(result?.products) ? result.products : [];
}

export function normalizeCoinbaseProduct(product) {
  const productId = product?.product_id ?? null;
  const [fallbackBase, fallbackQuote] = String(productId ?? "").split("-");
  const price = finite(product?.price);
  const bid = finite(product?.best_bid);
  const ask = finite(product?.best_ask);
  const midpoint = bid > 0 && ask > 0 ? (bid + ask) / 2 : price;
  const spreadPercent = midpoint > 0 && bid > 0 && ask > 0
    ? ((ask - bid) / midpoint) * 100
    : null;
  const baseVolume = finite(product?.volume_24h);
  const quoteVolume = finite(product?.approximate_quote_24h_volume)
    ?? (baseVolume !== null && price !== null ? baseVolume * price : null);

  return {
    exchange: "COINBASE",
    source: "COINBASE_ADVANCED_PUBLIC",
    venueType: "CEX",
    productId,
    symbol: productId,
    baseAsset: product?.base_currency_id ?? product?.base_name ?? fallbackBase ?? null,
    quoteAsset: product?.quote_currency_id ?? product?.quote_name ?? fallbackQuote ?? null,
    // Legacy aliases used by the broader crypto venue resolver.
    base: product?.base_currency_id ?? product?.base_name ?? fallbackBase ?? null,
    quote: product?.quote_currency_id ?? product?.quote_name ?? fallbackQuote ?? null,
    status: ["OFFLINE", "DELISTED"].includes(String(product?.status ?? "").toUpperCase())
      ? "OFFLINE"
      : "TRADING",
    contractType: "SPOT",
    instrumentType: "SPOT",
    tradable: !["OFFLINE", "DELISTED"].includes(String(product?.status ?? "").toUpperCase()),
    price,
    volume24h: baseVolume,
    priceChange24hPercent: finite(product?.price_percentage_change_24h),
    market: {
      price,
      bid,
      ask,
      bidQty: null,
      askQty: null,
      spreadPercent,
      quoteVolume,
      priceChangePercent: finite(product?.price_percentage_change_24h),
      highPrice: null,
      lowPrice: null,
      rangePercent: null,
      tradeCount24h: null,
    },
    raw: product,
    observedAt: new Date().toISOString(),
    executionAuthority: false,
    liveExecution: false,
  };
}

export async function getCoinbaseProduct(productId, options = {}) {
  if (!productId) throw new Error("COINBASE_PRODUCT_ID_REQUIRED");
  return fetchJson(`${BASE}/market/products/${encodeURIComponent(productId)}`, Number(options.timeoutMs || 12000));
}

export async function getCoinbaseProductBook(productId, options = {}) {
  if (!productId) throw new Error("COINBASE_PRODUCT_ID_REQUIRED");
  const limit = Math.max(1, Math.min(1000, Number(options.limit || 100)));
  return fetchJson(`${BASE}/market/product_book?product_id=${encodeURIComponent(productId)}&limit=${limit}`, Number(options.timeoutMs || 12000));
}

const GRANULARITY = Object.freeze({
  "1m": "ONE_MINUTE",
  "5m": "FIVE_MINUTE",
  "15m": "FIFTEEN_MINUTE",
  "30m": "THIRTY_MINUTE",
  "1h": "ONE_HOUR",
  "2h": "TWO_HOUR",
  "4h": "FOUR_HOUR",
  "6h": "SIX_HOUR",
  "1d": "ONE_DAY",
});

export async function getCoinbaseCandles(productId, options = {}) {
  if (!productId) throw new Error("COINBASE_PRODUCT_ID_REQUIRED");
  const interval = options.interval || "15m";
  const granularity = GRANULARITY[interval];
  if (!granularity) throw new Error(`COINBASE_UNSUPPORTED_CANDLE_INTERVAL:${interval}`);
  const limit = Math.max(2, Math.min(350, Number(options.limit || 96)));
  const secondsByInterval = { "1m":60,"5m":300,"15m":900,"30m":1800,"1h":3600,"2h":7200,"4h":14400,"6h":21600,"1d":86400 };
  const end = Math.floor(Date.now() / 1000);
  const start = end - secondsByInterval[interval] * (limit + 2);
  const url = `${BASE}/market/products/${encodeURIComponent(productId)}/candles?start=${start}&end=${end}&granularity=${granularity}&limit=${limit}`;
  const result = await fetchJson(url, Number(options.timeoutMs || 12000));
  return Array.isArray(result?.candles) ? result.candles : [];
}

export default {
  listCoinbaseProducts,
  normalizeCoinbaseProduct,
  getCoinbaseProduct,
  getCoinbaseProductBook,
  getCoinbaseCandles,
};
