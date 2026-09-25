/**
 * ============================================================
 * CRYPTO MEASUREMENT PROVIDER — Phase 6.13
 * ============================================================
 *
 * Missing liquidity remains null. A source timestamp is preserved so
 * final revalidation can verify freshness without inventing it.
 */

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceTimestamp(asset) {
  const candidates = [
    asset?.measuredAt,
    asset?.lastUpdated,
    asset?.updatedAt,
    asset?.timestamp,
    asset?.marketDataUpdatedAt,
    asset?.sourceUpdatedAt,
  ];

  for (const value of candidates) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }

  return null;
}

function sumDexMetric(venues, key) {
  const dex = Array.isArray(venues?.dex) ? venues.dex : [];
  const values = dex.map(venue => finite(venue?.[key])).filter(value => value !== null);
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

export function buildCryptoMeasurement(asset) {
  const venues = asset?.venues ?? {};

  // IMPORTANT: unavailable liquidity is not zero.
  const liquidityUsd = finite(venues?.dexLiquidityUsd);
  const dexVolume = finite(venues?.dexVolume24hUsd);

  const sourceVolume = finite(asset?.volume24hUsd);
  const availableVolumes = [sourceVolume, dexVolume].filter(v => v !== null);
  const volume24hUsd = availableVolumes.length ? Math.max(...availableVolumes) : null;

  const priceUsd = finite(asset?.priceUsd);
  const high24h = finite(asset?.high24hUsd);
  const low24h = finite(asset?.low24hUsd);

  const intradayRangePercent =
    priceUsd !== null && priceUsd > 0 && high24h !== null && low24h !== null
      ? ((high24h - low24h) / priceUsd) * 100
      : null;

  return {
    assetId: asset?.assetId ?? null,
    contractAddress: asset?.contractAddress ?? null,
    network: asset?.network ?? null,
    symbol: asset?.symbol ?? null,
    name: asset?.name ?? null,
    source: asset?.source ?? null,

    measuredAt: sourceTimestamp(asset),

    tradable:
      typeof asset?.tradable === "boolean"
        ? asset.tradable
        : null,

    priceUsd,
    marketCapUsd: finite(asset?.marketCapUsd),
    fdvUsd: finite(asset?.fdvUsd),
    volume24hUsd,
    volume6hUsd: finite(asset?.volume6hUsd),
    volume1hUsd: finite(asset?.volume1hUsd),
    liquidityUsd,

    spreadPct:
      finite(asset?.spreadPct) ??
      finite(venues?.spreadPct),

    change1hPercent: finite(asset?.change1hPercent),
    change4hPercent: finite(asset?.change4hPercent),
    change6hPercent: finite(asset?.change6hPercent),
    change24hPercent: finite(asset?.change24hPercent),
    change7dPercent: finite(asset?.change7dPercent),
    intradayRangePercent: finite(intradayRangePercent),

    venueCount: finite(venues?.venueCount) ?? 0,
    cexCount: finite(venues?.cexCount) ?? 0,
    dexCount: finite(venues?.dexCount) ?? 0,
    primaryVenue: venues?.primaryVenue ?? null,
    exchanges: Array.isArray(venues?.exchanges) ? venues.exchanges : [],
    pairCreatedAt: finite(asset?.pairCreatedAt),

    buys24h: sumDexMetric(venues, "buys24h"),
    sells24h: sumDexMetric(venues, "sells24h"),
    transactions24h: sumDexMetric(venues, "transactions24h"),

    integrity: {
      score: finite(asset?.integrity?.score),
      criticalFlags: Array.isArray(asset?.integrity?.criticalFlags)
        ? asset.integrity.criticalFlags
        : [],
    },

    marketRegime: asset?.marketRegime ?? "NEUTRAL",
  };
}

export function buildCryptoMeasurements({ assets = [] } = {}) {
  return Array.isArray(assets) ? assets.map(buildCryptoMeasurement) : [];
}

export default {
  buildCryptoMeasurement,
  buildCryptoMeasurements,
};
