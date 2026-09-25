/**
 * AEMA CRYPTO — LIQUIDITY ANALYZER
 * Phase 1.6
 *
 * Research-only diagnostics. Does not modify canonical 20/20/60.
 *
 * IMPORTANT:
 * The analyzer does not decide identity trust. The caller must pass the
 * intended market set. Exchange intelligence now calls this twice:
 *   1) trusted/canonical markets
 *   2) all raw discovery markets for diagnostics only
 */

import { finite } from "./cryptoMarketNormalizer.js";

function sum(values) {
  return values.reduce((total, value) => total + (finite(value) ?? 0), 0);
}

function share(part, total) {
  return total > 0 ? (part / total) * 100 : null;
}

export function analyzeLiquidity(markets = [], options = {}) {
  const scope = options.scope ?? "UNSPECIFIED";
  const authoritative = options.authoritative === true;

  const active = markets.filter(
    m => m.tradable !== false && finite(m.priceUsd) !== null
  );
  const cex = active.filter(m => m.venueType === "CEX");
  const dex = active.filter(m => m.venueType === "DEX");

  const volume24hUsd = sum(active.map(m => m.volume24hUsd));
  const cexVolume24hUsd = sum(cex.map(m => m.volume24hUsd));
  const dexVolume24hUsd = sum(dex.map(m => m.volume24hUsd));
  const dexLiquidityUsd = sum(dex.map(m => m.liquidityUsd));

  const byVolume = [...active].sort(
    (a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0)
  );
  const byDexLiquidity = [...dex].sort(
    (a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0)
  );

  const top1Volume = byVolume[0]?.volume24hUsd ?? 0;
  const top3Volume = sum(byVolume.slice(0, 3).map(m => m.volume24hUsd));

  const spreads = cex
    .filter(m => finite(m.spreadPct) !== null)
    .map(m => ({
      venue: m.venue,
      pair: `${m.baseSymbol}/${m.quoteSymbol}`,
      spreadPct: m.spreadPct,
    }))
    .sort((a, b) => a.spreadPct - b.spreadPct);

  return {
    status: active.length ? "READY" : "INSUFFICIENT_EVIDENCE",
    scope,
    authoritative,
    marketCount: active.length,
    cexMarketCount: cex.length,
    dexMarketCount: dex.length,
    venueCount: new Set(active.map(m => `${m.venueType}:${m.venue}`)).size,
    cexVenueCount: new Set(cex.map(m => m.venue)).size,
    dexVenueCount: new Set(dex.map(m => m.venue)).size,
    volume24hUsd,
    cexVolume24hUsd,
    dexVolume24hUsd,
    dexLiquidityUsd,
    cexVolumeSharePct: share(cexVolume24hUsd, volume24hUsd),
    dexVolumeSharePct: share(dexVolume24hUsd, volume24hUsd),
    topVenueVolumeSharePct: share(top1Volume, volume24hUsd),
    top3VolumeSharePct: share(top3Volume, volume24hUsd),
    bestReportedSpreads: spreads.slice(0, 10),
    deepestDexPools: byDexLiquidity.slice(0, 10),
    highestVolumeMarkets: byVolume.slice(0, 10),
    limitations: [
      "CEX liquidity depth is confirmed only where order-book evidence is present.",
      "DEX liquidityUsd is pool liquidity/reserve evidence, not guaranteed executable depth.",
      "Reported volume is research evidence and is not assumed to be executable liquidity.",
      authoritative
        ? "This view includes only markets that passed canonical identity verification."
        : "This raw discovery view may include unverified ticker matches and is non-authoritative.",
    ],
  };
}

export default { analyzeLiquidity };
