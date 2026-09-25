/**
 * AEMA CRYPTO — EXCHANGE / LIQUIDITY / ARBITRAGE INTELLIGENCE
 * Phase 1.6 — trusted liquidity boundary
 */

import { getCexMarketsForAsset } from "./cryptoCexResearchProvider.js";
import { getDexMarketsForAsset } from "./cryptoDexResearchProvider.js";
import { dedupeMarkets, upper } from "./cryptoMarketNormalizer.js";
import { analyzeLiquidity } from "./cryptoLiquidityAnalyzer.js";
import { findArbitrage } from "./cryptoArbitrageEngine.js";
import {
  resolveCanonicalAsset,
  annotateCanonicalCexMarket,
} from "./cryptoCanonicalAssetResolver.js";

function marketSummary(markets) {
  const cex = markets.filter(m => m.venueType === "CEX");
  const dex = markets.filter(m => m.venueType === "DEX");

  return {
    marketCount: markets.length,
    cexMarketCount: cex.length,
    dexMarketCount: dex.length,
    venueCount: new Set(markets.map(m => `${m.venueType}:${m.venue}`)).size,
    cexVenueCount: new Set(cex.map(m => m.venue)).size,
    dexVenueCount: new Set(dex.map(m => m.venue)).size,
    chains: [...new Set(dex.map(m => m.chainId).filter(Boolean))],
    quoteCurrencies: [...new Set(markets.map(m => m.quoteSymbol).filter(Boolean))],
  };
}

function isTrustedMarket(market) {
  if (!market || market.tradable === false) return false;

  if (market.venueType === "CEX") {
    return (
      market.identity?.verified === true &&
      market.arbitrageEligible === true &&
      Boolean(market.canonicalAssetId)
    );
  }

  if (market.venueType === "DEX") {
    return (
      market.identity?.verified === true &&
      market.arbitrageEligible === true &&
      Boolean(market.canonicalAssetId)
    );
  }

  return false;
}

export async function getCryptoExchangeIntelligence(asset = {}, options = {}) {
  const symbol = upper(asset.symbol || asset.query);
  if (!symbol) {
    return {
      approved: false,
      status: "INSUFFICIENT_EVIDENCE",
      reason: "SYMBOL_REQUIRED",
      asset: null,
    };
  }

  const resolvedAsset = {
    symbol,
    name: asset.name ?? null,
    assetId: asset.assetId ?? null,
    chainId: asset.chainId ?? asset.network ?? null,
    address: asset.address ?? asset.tokenAddress ?? null,
  };

  const canonical = resolveCanonicalAsset(resolvedAsset);

  const [cexResult, dexResult] = await Promise.all([
    getCexMarketsForAsset(resolvedAsset),
    getDexMarketsForAsset(resolvedAsset),
  ]);

  const markets = dedupeMarkets([
    ...(cexResult.markets ?? []).map(market =>
      annotateCanonicalCexMarket(market, canonical)
    ),
    ...(dexResult.markets ?? []),
  ]).filter(market => {
    if (market.venueType === "DEX") {
      return market.identity?.verified === true || market.baseSymbol === symbol;
    }
    return market.baseSymbol === symbol;
  });

  // Authoritative research liquidity: canonical identity only.
  const trustedMarkets = markets.filter(isTrustedMarket);

  // Primary liquidity is now trusted. Raw discovery is exposed separately and
  // must never be interpreted as canonical asset liquidity.
  const liquidity = analyzeLiquidity(trustedMarkets, {
    scope: "TRUSTED_CANONICAL",
    authoritative: true,
  });

  const rawDiscoveryLiquidity = analyzeLiquidity(markets, {
    scope: "RAW_DISCOVERY",
    authoritative: false,
  });

  const arbitrage = findArbitrage(markets, options.arbitrage);

  const cexMarkets = markets
    .filter(m => m.venueType === "CEX")
    .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));

  const dexMarkets = markets
    .filter(m => m.venueType === "DEX")
    .sort((a, b) =>
      (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0) ||
      (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0)
    );

  const trustedCexMarkets = trustedMarkets.filter(m => m.venueType === "CEX");
  const trustedDexMarkets = trustedMarkets.filter(m => m.venueType === "DEX");

  const approved = markets.length > 0;

  return {
    approved,
    status: approved ? "READY" : "INSUFFICIENT_EVIDENCE",
    reason: approved ? null : "NO_CEX_OR_DEX_MARKETS_RESOLVED",
    phase: "1.6",
    canonicalAsset: canonical,
    asset: resolvedAsset,
    summary: marketSummary(markets),
    trustedSummary: marketSummary(trustedMarkets),
    cexMarkets,
    dexMarkets,
    trustedMarkets,
    dexDiscovery: dexResult.discovery ?? null,
    identity: {
      dexMarketCount: dexMarkets.length,
      verifiedDexMarketCount: dexMarkets.filter(m => m.identity?.verified === true).length,
      unverifiedDexMarketCount: dexMarkets.filter(m => m.identity?.verified !== true).length,
      arbitrageEligibleDexMarketCount: dexMarkets.filter(m => m.arbitrageEligible === true).length,
      policy: "DEX_ADDRESS_FIRST_CANONICAL_IDENTITY",
    },
    liquidityTrust: {
      policy: "CANONICAL_IDENTITY_REQUIRED",
      rawMarketCount: markets.length,
      trustedMarketCount: trustedMarkets.length,
      excludedMarketCount: markets.length - trustedMarkets.length,
      trustedCexMarketCount: trustedCexMarkets.length,
      trustedDexMarketCount: trustedDexMarkets.length,
      unverifiedDexExcluded: dexMarkets.filter(m => m.identity?.verified !== true).length,
    },
    liquidity,
    rawDiscoveryLiquidity,
    arbitrage,
    errors: [
      ...(cexResult.errors ?? []),
      ...(dexResult.errors ?? []),
    ],
    policy: {
      canonicalResearchWeight: 0,
      researchDepthOnly: true,
      paperOnly: true,
      liveExecution: false,
      executionAuthority: false,
      missingEvidenceNeutralized: false,
      trustedLiquidityRequiresCanonicalIdentity: true,
      rawDiscoveryLiquidityAuthoritative: false,
    },
    generatedAt: new Date().toISOString(),
  };
}

export default { getCryptoExchangeIntelligence };
