/**
 * AEMA research evidence provider backed by Coinbase public market data.
 * Legacy filename/contracts retained. Missing derivatives-only evidence
 * (funding/open interest) is explicitly null and never fabricated.
 */
import BOT_CONFIG from "../config/botConfig.js";
import { getCoinbaseCandles, getCoinbaseProduct, getCoinbaseProductBook } from "../../data/providers/coinbaseProvider.js";

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

function normalizeCandles(rows = []) {
  return rows
    .map((c) => {
      const close = num(c?.close);
      const volume = num(c?.volume);
      const start = num(c?.start);
      return {
        openTime: start !== null ? start * 1000 : null,
        open: num(c?.open), high: num(c?.high), low: num(c?.low), close,
        volume,
        closeTime: start !== null ? start * 1000 : null,
        quoteVolume: close !== null && volume !== null ? close * volume : null,
        trades: null,
      };
    })
    .filter((x) => x.open > 0 && x.high > 0 && x.low > 0 && x.close > 0)
    .sort((a,b) => a.openTime - b.openTime);
}

function normalizeDepth(result) {
  const book = result?.pricebook ?? result ?? {};
  const map = (rows = []) => rows.map((x) => ({
    price: num(Array.isArray(x) ? x[0] : x?.price),
    qty: num(Array.isArray(x) ? x[1] : (x?.size ?? x?.qty)),
  })).filter((x) => x.price > 0 && x.qty > 0);
  const bids = map(book?.bids);
  const asks = map(book?.asks);
  const bidNotional = bids.reduce((s,x)=>s+x.price*x.qty,0);
  const askNotional = asks.reduce((s,x)=>s+x.price*x.qty,0);
  const totalNotional = bidNotional + askNotional;
  return { bids, asks, bidNotional, askNotional, totalNotional,
    imbalance: totalNotional > 0 ? (bidNotional - askNotional) / totalNotional : 0 };
}

export async function getBotResearchMarketEvidence(asset, options = {}) {
  const cfg = { ...BOT_CONFIG.research, ...options };
  const productId = asset?.productId ?? asset?.symbol;
  if (!productId) throw new Error("BOT_RESEARCH_SYMBOL_REQUIRED");

  const [rawCandles, rawBook, product] = await Promise.all([
    getCoinbaseCandles(productId, { interval: cfg.candleInterval, limit: cfg.candleLimit, timeoutMs: cfg.timeoutMs }),
    getCoinbaseProductBook(productId, { limit: cfg.depthLimit, timeoutMs: cfg.timeoutMs }),
    getCoinbaseProduct(productId, { timeoutMs: cfg.timeoutMs }),
  ]);
  const p = product?.product ?? product;

  return {
    symbol: asset?.symbol ?? productId,
    productId,
    candles: normalizeCandles(rawCandles),
    depth: normalizeDepth(rawBook),
    markPrice: num(p?.price),
    indexPrice: null,
    fundingRate: null,
    nextFundingTime: null,
    openInterest: null,
    derivativesEvidenceAvailable: false,
    derivativesEvidenceReason: "COINBASE_SPOT_MARKET_HAS_NO_FUNDING_OR_OPEN_INTEREST",
    observedAt: new Date().toISOString(),
    source: "COINBASE_ADVANCED_PUBLIC",
    instrumentType: "SPOT",
    executionAuthority: false,
    liveExecution: false,
  };
}

export default getBotResearchMarketEvidence;
