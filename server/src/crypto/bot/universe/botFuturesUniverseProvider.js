/**
 * AEMA Bot — canonical Binance USD-M perpetual universe.
 * Phase 2 adds /fapi/v1/ticker/bookTicker so spread is real evidence.
 */
import BOT_CONFIG from "../config/botConfig.js";

const BASE_URL =
  process.env.AEMA_BOT_BINANCE_FUTURES_BASE_URL ||
  "https://fapi.binance.com";

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function getJson(path, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`BINANCE_HTTP_${response.status}:${path}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSymbol(exchangeInfo, ticker, book) {
  const price = finite(ticker?.lastPrice);
  const bid = finite(book?.bidPrice);
  const ask = finite(book?.askPrice);
  const bidQty = finite(book?.bidQty);
  const askQty = finite(book?.askQty);
  const quoteVolume = finite(ticker?.quoteVolume);
  const priceChangePercent = finite(ticker?.priceChangePercent);
  const highPrice = finite(ticker?.highPrice);
  const lowPrice = finite(ticker?.lowPrice);
  const count = finite(ticker?.count);

  const midpoint = bid > 0 && ask > 0 ? (bid + ask) / 2 : price;
  const spreadPercent =
    midpoint > 0 && bid > 0 && ask > 0
      ? ((ask - bid) / midpoint) * 100
      : null;

  const rangePercent =
    price > 0 && highPrice > 0 && lowPrice > 0
      ? ((highPrice - lowPrice) / price) * 100
      : null;

  return {
    symbol: exchangeInfo.symbol,
    baseAsset: exchangeInfo.baseAsset,
    quoteAsset: exchangeInfo.quoteAsset,
    status: exchangeInfo.status,
    contractType: exchangeInfo.contractType,
    marginAsset: exchangeInfo.marginAsset,
    pricePrecision: exchangeInfo.pricePrecision,
    quantityPrecision: exchangeInfo.quantityPrecision,
    market: {
      price, bid, ask, bidQty, askQty, spreadPercent, quoteVolume,
      priceChangePercent, highPrice, lowPrice, rangePercent,
      tradeCount24h: count,
    },
    source: "BINANCE_USDM",
    instrumentType: "PERPETUAL_FUTURES",
    observedAt: new Date().toISOString(),
    executionAuthority: false,
    liveExecution: false,
  };
}

export async function getBotFuturesUniverse(options = {}) {
  const config = { ...BOT_CONFIG.universe, ...options };

  const [exchangeInfo, tickers, books] = await Promise.all([
    getJson("/fapi/v1/exchangeInfo", config.timeoutMs),
    getJson("/fapi/v1/ticker/24hr", config.timeoutMs),
    getJson("/fapi/v1/ticker/bookTicker", config.timeoutMs),
  ]);

  if (!Array.isArray(exchangeInfo?.symbols) ||
      !Array.isArray(tickers) ||
      !Array.isArray(books)) {
    throw new Error("BOT_UNIVERSE_INVALID_BINANCE_RESPONSE");
  }

  const tickerMap = new Map(tickers.map((row) => [row.symbol, row]));
  const bookMap = new Map(books.map((row) => [row.symbol, row]));

  const assets = exchangeInfo.symbols
    .filter((row) => config.quoteAssets.includes(row.quoteAsset))
    .filter((row) => row.contractType === config.contractType)
    .map((row) => normalizeSymbol(row, tickerMap.get(row.symbol), bookMap.get(row.symbol)))
    .slice(0, config.maximumSymbols);

  return {
    generatedAt: new Date().toISOString(),
    exchange: config.exchange,
    count: assets.length,
    assets,
    executionAuthority: false,
    liveExecution: false,
  };
}

export default getBotFuturesUniverse;
