/**
 * AEMA CRYPTO — DEX RESEARCH PROVIDER
 * Phase 1.5 — address-first canonical DEX discovery
 *
 * Rules:
 * - Resolved canonical DEX representations are queried by exact chain + address.
 * - Symbol search remains supplementary discovery evidence only.
 * - Only exact canonical chain + base contract/mint matches are arbitrage-eligible.
 * - Unknown/unverified ticker matches remain visible for research, never arbitrage.
 */

import {
  searchDexPairs,
  getDexTokenPairs,
  normalizeDexPair,
} from "../data/providers/dexScreenerProvider.js";

import { finite, upper, lower } from "./cryptoMarketNormalizer.js";
import {
  resolveCanonicalAsset,
  matchCanonicalDexRepresentation,
} from "./cryptoCanonicalAssetResolver.js";

function text(value) {
  return value == null ? null : String(value).trim() || null;
}

function normalizeAddress(value) {
  return lower(value) || null;
}

function normalizeChain(value) {
  return lower(value) || null;
}

function pairKey(pair = {}) {
  const raw = pair.raw ?? pair;
  const chain = normalizeChain(pair.chainId ?? raw?.chainId) ?? "";
  const address = text(pair.pairAddress ?? raw?.pairAddress) ?? "";
  return `${chain}:${address}`.toLowerCase();
}

function normalizeDexMarket(input = {}, requestedAsset = {}, canonical = {}, discoveryMethod = "UNKNOWN") {
  const raw = input.raw ?? input;

  const baseSymbol = upper(
    input.baseSymbol ?? input.base ?? input.baseToken?.symbol ?? raw?.baseToken?.symbol,
  );
  const quoteSymbol = upper(
    input.quoteSymbol ?? input.quote ?? input.quoteToken?.symbol ?? raw?.quoteToken?.symbol,
  );
  const chainId = normalizeChain(input.chainId ?? input.network ?? raw?.chainId);
  const baseAddress = normalizeAddress(
    input.baseAddress ?? input.address ?? input.tokenAddress ??
    input.baseToken?.address ?? raw?.baseToken?.address,
  );
  const quoteAddress = normalizeAddress(
    input.quoteAddress ?? input.quoteToken?.address ?? raw?.quoteToken?.address,
  );

  const requestedAddress = normalizeAddress(requestedAsset.address ?? requestedAsset.tokenAddress);
  const requestedChain = normalizeChain(requestedAsset.chainId ?? requestedAsset.network);

  const identityMatch = matchCanonicalDexRepresentation(
    { chainId, baseAddress, baseSymbol },
    canonical,
  );

  const representation = identityMatch.representation;
  const identityVerified = identityMatch.verified === true;

  return {
    venueType: "DEX",
    venue: upper(input.venue ?? input.exchange ?? input.dexId ?? raw?.dexId ?? "DEX"),
    source: input.source ?? "DEXSCREENER",
    marketId: text(input.marketId) ?? text(input.pairAddress) ?? text(raw?.pairAddress),
    productId: text(input.productId) ?? text(input.marketId) ?? text(input.pairAddress) ?? text(raw?.pairAddress),
    baseSymbol,
    quoteSymbol,
    price: finite(input.price ?? input.priceUsd ?? raw?.priceUsd),
    priceUsd: finite(input.priceUsd ?? input.price ?? raw?.priceUsd),
    volume24hUsd: finite(input.volume24hUsd ?? input.volume24h ?? input.volume?.h24 ?? raw?.volume?.h24),
    liquidityUsd: finite(input.liquidityUsd ?? input.liquidity?.usd ?? raw?.liquidity?.usd),
    bid: finite(input.bid ?? input.bestBid),
    ask: finite(input.ask ?? input.bestAsk),
    spreadBps: finite(input.spreadBps),
    tradable: input.tradable !== false,
    chainId,
    address: baseAddress,
    baseAddress,
    quoteAddress,
    pairAddress: text(input.pairAddress) ?? text(raw?.pairAddress),
    url: text(input.url) ?? text(raw?.url),
    canonicalAssetId: identityVerified ? canonical.canonicalAssetId : null,
    discoveryMethod,
    identity: {
      status: identityVerified ? "VERIFIED" : "UNVERIFIED",
      method: identityVerified ? "CANONICAL_CHAIN_AND_ADDRESS" : "SYMBOL_DISCOVERY_ONLY",
      verified: identityVerified,
      canonicalAssetId: identityVerified ? canonical.canonicalAssetId : null,
      requestedChain,
      requestedAddress,
      observedChain: chainId,
      observedBaseAddress: baseAddress,
      representation: representation?.representation ?? null,
      cexEquivalent: representation?.cexEquivalent === true,
      discoveryMethod,
    },
    arbitrageEligible: identityVerified,
    arbitrageExclusionReason: identityVerified ? null : "DEX_ASSET_IDENTITY_UNVERIFIED",
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

async function fetchCanonicalRepresentation(rep, asset, canonical) {
  try {
    const result = await getDexTokenPairs({
      chainId: rep.chainId,
      tokenAddress: rep.address,
    });

    const pairs = extractPairs(result);
    return {
      provider: "DEXSCREENER",
      mode: "CANONICAL_ADDRESS",
      chainId: rep.chainId,
      address: rep.address,
      status: pairs.length ? "READY" : "NO_MATCHING_MARKETS",
      available: pairs.length > 0,
      pairs,
      error: null,
    };
  } catch (error) {
    return {
      provider: "DEXSCREENER",
      mode: "CANONICAL_ADDRESS",
      chainId: rep.chainId,
      address: rep.address,
      status: "PROVIDER_UNAVAILABLE",
      available: false,
      pairs: [],
      error: errorMessage(error),
    };
  }
}

async function fetchSymbolDiscovery(symbol) {
  try {
    const result = await searchDexPairs(symbol);
    const pairs = extractPairs(result);
    return {
      provider: "DEXSCREENER",
      mode: "SYMBOL_DISCOVERY",
      query: symbol,
      status: pairs.length ? "READY" : "NO_MATCHING_MARKETS",
      available: pairs.length > 0,
      pairs,
      error: null,
    };
  } catch (error) {
    return {
      provider: "DEXSCREENER",
      mode: "SYMBOL_DISCOVERY",
      query: symbol,
      status: "PROVIDER_UNAVAILABLE",
      available: false,
      pairs: [],
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

  const canonical = resolveCanonicalAsset({ ...asset, symbol });
  const representations = Array.isArray(canonical.dexRepresentations)
    ? canonical.dexRepresentations.filter(rep => rep?.chainId && rep?.address)
    : [];

  // Primary path: exact canonical chain + address.
  const canonicalResults = await Promise.all(
    representations.map(rep => fetchCanonicalRepresentation(rep, asset, canonical)),
  );

  // Supplementary path: symbol discovery remains research-only.
  const symbolResult = await fetchSymbolDiscovery(symbol);

  const seen = new Set();
  const markets = [];

  for (const result of canonicalResults) {
    for (const rawPair of result.pairs ?? []) {
      let normalized;
      try {
        normalized = normalizeDexPair(rawPair);
      } catch {
        normalized = rawPair;
      }

      const market = normalizeDexMarket(
        normalized,
        asset,
        canonical,
        "CANONICAL_ADDRESS",
      );

      const key = pairKey(market);
      if (!seen.has(key)) {
        seen.add(key);
        markets.push(market);
      }
    }
  }

  for (const rawPair of symbolResult.pairs ?? []) {
    let normalized;
    try {
      normalized = normalizeDexPair(rawPair);
    } catch {
      normalized = rawPair;
    }

    const market = normalizeDexMarket(
      normalized,
      asset,
      canonical,
      "SYMBOL_DISCOVERY",
    );

    const key = pairKey(market);
    if (!seen.has(key)) {
      seen.add(key);
      markets.push(market);
    }
  }

  const verifiedMarkets = markets.filter(m => m.identity?.verified === true);
  const unverifiedMarkets = markets.filter(m => m.identity?.verified !== true);

  const providers = [
    ...canonicalResults.map(result => ({
      provider: result.provider,
      mode: result.mode,
      chainId: result.chainId,
      address: result.address,
      status: result.status,
      available: result.available,
      pairCount: result.pairs?.length ?? 0,
      error: result.error,
    })),
    {
      provider: symbolResult.provider,
      mode: symbolResult.mode,
      query: symbolResult.query,
      status: symbolResult.status,
      available: symbolResult.available,
      pairCount: symbolResult.pairs?.length ?? 0,
      error: symbolResult.error,
    },
  ];

  return {
    approved: markets.length > 0,
    status: markets.length > 0 ? "READY" : "INSUFFICIENT_EVIDENCE",
    reason: markets.length > 0 ? null : "NO_DEX_MARKETS_RESOLVED",
    phase: "1.5",
    symbol,
    canonical,
    discovery: {
      canonicalRepresentationCount: representations.length,
      addressFirstEnabled: representations.length > 0,
      canonicalAddressPairCount: canonicalResults.reduce(
        (sum, result) => sum + (result.pairs?.length ?? 0),
        0,
      ),
      symbolDiscoveryPairCount: symbolResult.pairs?.length ?? 0,
    },
    marketCount: markets.length,
    verifiedMarketCount: verifiedMarkets.length,
    unverifiedMarketCount: unverifiedMarkets.length,
    arbitrageEligibleMarketCount: markets.filter(m => m.arbitrageEligible === true).length,
    markets,
    providers,
    errors: providers.filter(p => p.error).map(p => ({
      provider: p.provider,
      mode: p.mode,
      error: p.error,
    })),
    notes: [
      "Canonical DEX representations are discovered by exact chain + contract/mint address first.",
      "Symbol search is supplementary research evidence only.",
      "Only exact canonical chain + base contract/mint matches are arbitrage-eligible.",
      "Wrapped/custodial BTC products are not assumed equivalent to native BTC.",
    ],
  };
}

export default { getDexMarketsForAsset };
