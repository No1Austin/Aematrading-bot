/**
 * AEMA CEX research universe.
 * Legacy filename retained to avoid breaking imports.
 * Coinbase public spot market data replaces the Binance USD-M dependency.
 */
import BOT_CONFIG from "../config/botConfig.js";
import { listCoinbaseProducts, normalizeCoinbaseProduct } from "../../data/providers/coinbaseProvider.js";

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getBotFuturesUniverse(options = {}) {
  const config = { ...BOT_CONFIG.universe, ...options };
  const products = await listCoinbaseProducts({ timeoutMs: config.timeoutMs });
  if (!Array.isArray(products)) throw new Error("BOT_UNIVERSE_INVALID_COINBASE_RESPONSE");

  const quoteAssets = new Set((config.quoteAssets || []).map((x) => String(x).toUpperCase()));
  const assets = products
    .map(normalizeCoinbaseProduct)
    .filter((row) => row.productId && row.baseAsset && row.quoteAsset)
    .filter((row) => !quoteAssets.size || quoteAssets.has(String(row.quoteAsset).toUpperCase()))
    .filter((row) => row.status === "TRADING")
    .filter((row) => finite(row.market?.price) > 0)
    .filter((row) => finite(row.market?.quoteVolume) > 0)
    .slice(0, config.maximumSymbols);

  return {
    generatedAt: new Date().toISOString(),
    exchange: "COINBASE",
    source: "COINBASE_ADVANCED_PUBLIC",
    marketType: "SPOT_RESEARCH",
    count: assets.length,
    assets,
    executionAuthority: false,
    liveExecution: false,
  };
}

export default getBotFuturesUniverse;
