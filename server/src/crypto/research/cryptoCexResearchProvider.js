/**
 * AEMA CRYPTO — CEX RESEARCH PROVIDER
 * Phase 1.1
 *
 * Adapter over the existing Coinbase + Kraken providers.
 * Research-only. Does not alter canonical scoring or execution authority.
 */

import {
  listCoinbaseProducts,
  normalizeCoinbaseProduct,
} from "../data/providers/coinbaseProvider.js";

import {
  getKrakenAssetPairs,
  normalizeKrakenPair,
} from "../data/providers/krakenProvider.js";

import { finite, upper } from "./cryptoMarketNormalizer.js";

function text(value) {
  return value == null ? null : String(value).trim();
}

function bool(value, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeCexMarket(input = {}, fallbackVenue = null) {
  const baseSymbol = upper(
    input.baseSymbol ??
      input.base ??
      input.baseAsset ??
      input.base_currency_id ??
      input.baseCurrency,
  );

  const quoteSymbol = upper(
    input.quoteSymbol ??
      input.quote ??
      input.quoteAsset ??
      input.quote_currency_id ??
      input.quoteCurrency,
  );

  const venue = upper(
    input.venue ??
      input.exchange ??
      fallbackVenue,
  );

  const price = finite(
    input.price ??
      input.lastPrice ??
      input.last ??
      input.close,
  );

  const volume24h = finite(
    input.volume24h ??
      input.volume24hUsd ??
      input.quoteVolume24h ??
      input.volume_24h,
  );

  return {
    venueType: "CEX",
    venue: venue || fallbackVenue || "UNKNOWN",
    marketId:
      text(input.marketId) ??
      text(input.productId) ??
      text(input.symbol) ??
      (baseSymbol && quoteSymbol ? `${baseSymbol}-${quoteSymbol}` : null),
    baseSymbol,
    quoteSymbol,
    price,
    volume24hUsd: finite(input.volume24hUsd) ?? volume24h,
    liquidityUsd: finite(input.liquidityUsd),
    bid: finite(input.bid ?? input.bestBid),
    ask: finite(input.ask ?? input.bestAsk),
    spreadBps: finite(input.spreadBps),
    tradable: bool(input.tradable, true),
    chainId: null,
    address: null,
    raw: input.raw ?? input,
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function coinbaseMarkets(symbol) {
  try {
    const products = await listCoinbaseProducts();
    const markets = products
      .map(product => normalizeCoinbaseProduct(product))
      .map(product => normalizeCexMarket(product, "COINBASE"))
      .filter(market => market.baseSymbol === symbol && market.tradable !== false);

    return {
      provider: "COINBASE",
      status: markets.length ? "READY" : "NO_MATCHING_MARKETS",
      available: markets.length > 0,
      marketCount: markets.length,
      markets,
      error: null,
    };
  } catch (error) {
    return {
      provider: "COINBASE",
      status: "PROVIDER_UNAVAILABLE",
      available: false,
      marketCount: 0,
      markets: [],
      error: errorMessage(error),
    };
  }
}

async function krakenMarkets(symbol) {
  try {
    const result = await getKrakenAssetPairs();

    const source =
      Array.isArray(result) ? result :
      Array.isArray(result?.pairs) ? result.pairs :
      Array.isArray(result?.markets) ? result.markets :
      result?.result && typeof result.result === "object"
        ? Object.entries(result.result).map(([pairName, pair]) => ({
            pairName,
            ...(pair ?? {}),
          }))
        : [];

    const markets = source
      .map(pair => {
        try {
          return normalizeKrakenPair(pair);
        } catch {
          return pair;
        }
      })
      .map(pair => normalizeCexMarket(pair, "KRAKEN"))
      .filter(market => market.baseSymbol === symbol && market.tradable !== false);

    return {
      provider: "KRAKEN",
      status: markets.length ? "READY" : "NO_MATCHING_MARKETS",
      available: markets.length > 0,
      marketCount: markets.length,
      markets,
      error: null,
    };
  } catch (error) {
    return {
      provider: "KRAKEN",
      status: "PROVIDER_UNAVAILABLE",
      available: false,
      marketCount: 0,
      markets: [],
      error: errorMessage(error),
    };
  }
}

export async function getCexMarketsForAsset(asset = {}) {
  const symbol = upper(asset.symbol ?? asset.query);

  if (!symbol) {
    return {
      approved: false,
      status: "INSUFFICIENT_EVIDENCE",
      reason: "SYMBOL_REQUIRED",
      markets: [],
      providers: [],
    };
  }

  const providers = await Promise.all([
    coinbaseMarkets(symbol),
    krakenMarkets(symbol),
  ]);

  const markets = providers.flatMap(provider => provider.markets ?? []);

  return {
    approved: markets.length > 0,
    status: markets.length > 0 ? "READY" : "INSUFFICIENT_EVIDENCE",
    reason: markets.length > 0 ? null : "NO_CEX_MARKETS_RESOLVED",
    symbol,
    marketCount: markets.length,
    markets,
    providers,
  };
}

export default {
  getCexMarketsForAsset,
};
