/**
 * AEMA CRYPTO — EXCHANGE / LIQUIDITY / ARBITRAGE INTELLIGENCE
 * Phase 1.0
 *
 * Unified CEX + DEX research service.
 * Does not modify canonical research scoring.
 */

import { getCexMarketsForAsset } from "./cryptoCexResearchProvider.js";
import { getDexMarketsForAsset } from "./cryptoDexResearchProvider.js";
import { dedupeMarkets, finite, upper } from "./cryptoMarketNormalizer.js";
import { analyzeLiquidity } from "./cryptoLiquidityAnalyzer.js";
import { findArbitrage } from "./cryptoArbitrageEngine.js";
import { attachMarketIdentity } from "./cryptoAssetIdentityResolver.js";

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

  const [cexResult, dexResult] = await Promise.all([
    getCexMarketsForAsset(resolvedAsset),
    getDexMarketsForAsset(resolvedAsset),
  ]);

  const markets = attachMarketIdentity(
    dedupeMarkets([
      ...(cexResult.markets ?? []),
      ...(dexResult.markets ?? []),
    ]).filter(m => m.baseSymbol === symbol),
    resolvedAsset,
  );

  const liquidity = analyzeLiquidity(markets);
  const arbitrage = findArbitrage(markets, options.arbitrage);

  const cexMarkets = markets
    .filter(m => m.venueType === "CEX")
    .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0));

  const dexMarkets = markets
    .filter(m => m.venueType === "DEX")
    .sort((a, b) =>
      (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0) ||
      (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0),
    );

  const approved = markets.length > 0;

  return {
    approved,
    status: approved ? "READY" : "INSUFFICIENT_EVIDENCE",
    reason: approved ? null : "NO_CEX_OR_DEX_MARKETS_RESOLVED",
    phase: "1.2",
    asset: resolvedAsset,
    summary: marketSummary(markets),
    cexMarkets,
    dexMarkets,
    liquidity,
    arbitrage,
    errors: [...(cexResult.errors ?? []), ...(dexResult.errors ?? [])],
    policy: {
      canonicalResearchWeight: 0,
      researchDepthOnly: true,
      paperOnly: true,
      liveExecution: false,
      executionAuthority: false,
      missingEvidenceNeutralized: false,
      symbolOnlyDexIdentityAcceptedForArbitrage: false,
      verifiedIdentityRequiredForArbitrage: true,
    },
    generatedAt: new Date().toISOString(),
  };
}

export default { getCryptoExchangeIntelligence };
