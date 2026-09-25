/**
 * Phase 2 research evidence provider for Top-20 only.
 * Pulls candles, depth, mark/funding and open interest from Binance USD-M.
 * Evidence provider only; no trade authority.
 */
import BOT_CONFIG from "../config/botConfig.js";

const BASE_URL =
  process.env.AEMA_BOT_BINANCE_FUTURES_BASE_URL ||
  "https://fapi.binance.com";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

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

function normalizeKlines(rows = []) {
  return rows.map((k) => ({
    openTime: num(k[0]), open: num(k[1]), high: num(k[2]), low: num(k[3]),
    close: num(k[4]), volume: num(k[5]), closeTime: num(k[6]),
    quoteVolume: num(k[7]), trades: num(k[8]),
  })).filter((x) => x.open > 0 && x.high > 0 && x.low > 0 && x.close > 0);
}

function normalizeDepth(depth) {
  const bids = (depth?.bids || []).map(([p,q]) => ({ price:num(p), qty:num(q) }))
    .filter(x => x.price > 0 && x.qty > 0);
  const asks = (depth?.asks || []).map(([p,q]) => ({ price:num(p), qty:num(q) }))
    .filter(x => x.price > 0 && x.qty > 0);
  const bidNotional = bids.reduce((s,x)=>s+x.price*x.qty,0);
  const askNotional = asks.reduce((s,x)=>s+x.price*x.qty,0);
  return {
    bids, asks, bidNotional, askNotional,
    totalNotional: bidNotional + askNotional,
    imbalance: (bidNotional + askNotional) > 0
      ? (bidNotional - askNotional) / (bidNotional + askNotional) : 0,
  };
}

export async function getBotResearchMarketEvidence(asset, options = {}) {
  const cfg = { ...BOT_CONFIG.research, ...options };
  const symbol = asset?.symbol;
  if (!symbol) throw new Error("BOT_RESEARCH_SYMBOL_REQUIRED");

  const [klines, depth, premium, oi] = await Promise.all([
    getJson(`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=${cfg.candleInterval}&limit=${cfg.candleLimit}`, cfg.timeoutMs),
    getJson(`/fapi/v1/depth?symbol=${encodeURIComponent(symbol)}&limit=${cfg.depthLimit}`, cfg.timeoutMs),
    getJson(`/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`, cfg.timeoutMs),
    getJson(`/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`, cfg.timeoutMs),
  ]);

  return {
    symbol,
    candles: normalizeKlines(klines),
    depth: normalizeDepth(depth),
    markPrice: num(premium?.markPrice),
    indexPrice: num(premium?.indexPrice),
    fundingRate: num(premium?.lastFundingRate),
    nextFundingTime: num(premium?.nextFundingTime),
    openInterest: num(oi?.openInterest),
    observedAt: new Date().toISOString(),
    source: "BINANCE_USDM",
    executionAuthority: false,
    liveExecution: false,
  };
}

export default getBotResearchMarketEvidence;
