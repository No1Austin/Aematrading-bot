/**
 * AEMA CRYPTO — DEX RESEARCH PROVIDER
 * Phase 1.1
 *
 * Adapter over the existing DexScreener provider.
 * GeckoTerminal is intentionally not called here because the existing
 * provider exports pool-discovery functions, not an asset-search function.
 * Research-only. Missing evidence remains unavailable.
 */

import {
  searchDexPairs,
  getDexTokenPairs,
  normalizeDexPair,
} from "../data/providers/dexScreenerProvider.js";

import { finite, upper } from "./cryptoMarketNormalizer.js";

function text(value) {
  return value == null ? null : String(value).trim();
}

function normalizeAddress(value) {
  const v = text(value);
  return v ? v.toLowerCase() : null;
}

function normalizeDexMarket(input = {}) {
  const raw = input.raw ?? input;

  const baseSymbol = upper(
    input.baseSymbol ??
      input.base ??
      input.baseToken?.symbol ??
      raw?.baseToken?.symbol,
  );

  const quoteSymbol = upper(
    input.quoteSymbol ??
      input.quote ??
      input.quoteToken?.symbol ??
      raw?.quoteToken?.symbol,
  );

  return {
    venueType: "DEX",
    venue: upper(
      input.venue ??
        input.exchange ??
        input.dexId ??
        raw?.dexId ??
        "DEX",
    ),
    marketId:
      text(input.marketId) ??
      text(input.pairAddress) ??
      text(raw?.pairAddress),
    baseSymbol,
    quoteSymbol,
    price: finite(
      input.price ??
        input.priceUsd ??
        raw?.priceUsd,
    ),
    volume24hUsd: finite(
      input.volume24hUsd ??
        input.volume24h ??
        input.volume?.h24 ??
        raw?.volume?.h24,
    ),
    liquidityUsd: finite(
      input.liquidityUsd ??
        input.liquidity?.usd ??
        raw?.liquidity?.usd,
    ),
    bid: finite(input.bid ?? input.bestBid),
    ask: finite(input.ask ?? input.bestAsk),
    spreadBps: finite(input.spreadBps),
    tradable: input.tradable !== false,
    chainId:
      text(input.chainId) ??
      text(input.network) ??
      text(raw?.chainId),
    baseAddress:
      text(input.baseAddress) ??
      text(input.address) ??
      text(input.tokenAddress) ??
      text(input.baseToken?.address) ??
      text(raw?.baseToken?.address),
    quoteAddress:
      text(input.quoteAddress) ??
      text(input.quoteToken?.address) ??
      text(raw?.quoteToken?.address),
    pairAddress:
      text(input.pairAddress) ??
      text(raw?.pairAddress),
    url: text(input.url) ?? text(raw?.url),
    raw,
  };
}

function extractPairs(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.pairs)) return result.pairs;
  if (Array.isArray(result?.markets)) return result.markets;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchDexScreener(asset, symbol) {
  const address = text(asset.address ?? asset.tokenAddress);
  const chainId = text(asset.chainId ?? asset.network);

  try {
    let result;

    if (address) {
      // The provider's exported token-pair function is used when the
      // contract/mint address is known. Extra properties are harmless
      // for object-destructured provider signatures.
      result = await getDexTokenPairs({
        chainId,
        network: chainId,
        address,
        tokenAddress: address,
      });
    } else {
      // Existing provider exposes a search function. Passing the symbol
      // as a scalar matches the common search-provider interface.
      result = await searchDexPairs(symbol);
    }

    const requestedAddress = normalizeAddress(address);

    const markets = extractPairs(result)
      .map(pair => {
        try {
          return normalizeDexPair(pair);
        } catch {
          return pair;
        }
      })
      .map(normalizeDexMarket)
      .filter(market => {
        if (market.baseSymbol !== symbol) return false;

        if (chainId && market.chainId) {
          if (String(market.chainId).toLowerCase() !== String(chainId).toLowerCase()) {
            return false;
          }
        }

        if (requestedAddress && market.baseAddress) {
          if (normalizeAddress(market.baseAddress) !== requestedAddress) {
            return false;
          }
        }

        return true;
      });

    return {
      provider: "DEXSCREENER",
      status: markets.length ? "READY" : "NO_MATCHING_MARKETS",
      available: markets.length > 0,
      marketCount: markets.length,
      markets,
      error: null,
    };
  } catch (error) {
    return {
      provider: "DEXSCREENER",
      status: "PROVIDER_UNAVAILABLE",
      available: false,
      marketCount: 0,
      markets: [],
      error: errorMessage(error),
    };
  }
}

export async function getDexMarketsForAsset(asset = {}) {
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

  const providers = [
    await fetchDexScreener(asset, symbol),
  ];

  const markets = providers.flatMap(provider => provider.markets ?? []);

  return {
    approved: markets.length > 0,
    status: markets.length > 0 ? "READY" : "INSUFFICIENT_EVIDENCE",
    reason: markets.length > 0 ? null : "NO_DEX_MARKETS_RESOLVED",
    symbol,
    marketCount: markets.length,
    markets,
    providers,
    notes: [
      "DexScreener is the current asset-specific DEX source.",
      "GeckoTerminal new-pool discovery is not treated as asset-specific evidence.",
    ],
  };
}

export default {
  getDexMarketsForAsset,
};
