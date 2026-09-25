/**
 * AEMA Crypto — Phase 6.51
 * Shared Fresh-Market Revalidation Batch
 *
 * Builds ONE canonical universe snapshot for the final revalidation batch,
 * validates the batch timestamp authority, then identity-matches candidates.
 *
 * IMPORTANT:
 * - refresh:true is fetch intent, not freshness proof
 * - generatedAt is the universe-build completion timestamp, not provider observation time
 * - individual measurement freshness remains enforced by Final Revalidation 6.49
 * - no live execution authority
 */

import {
  getCryptoUniverse,
} from "../universe/cryptoUniverseProvider.js";

const DEFAULTS = Object.freeze({
  maxBatchBuildAgeMs: 120_000,
  maxFutureClockSkewMs: 5_000,
});

function text(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return text(v).toLowerCase();
}

function upper(v) {
  return text(v).toUpperCase();
}

function parseTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function identity(value = {}) {
  const asset = value?.asset ?? value;

  return {
    assetId: lower(asset?.assetId ?? value?.assetId),
    network: lower(asset?.network ?? value?.network),
    contractAddress: lower(
      asset?.contractAddress ?? value?.contractAddress,
    ),
    symbol: upper(asset?.symbol ?? value?.symbol),
    name: lower(asset?.name ?? value?.name),
    candidateType: upper(
      value?.candidateType ??
      value?.marketType ??
      asset?.candidateType ??
      asset?.marketType,
    ),
  };
}

function contractKey(i) {
  return i.network && i.contractAddress
    ? `${i.network}:${i.contractAddress}`
    : null;
}

function exactIdKey(i) {
  return i.assetId || null;
}

export async function buildCryptoFreshMarketBatch({
  maximumAssets = 1000,
  coinGeckoPages = 3,
  includeDexDiscovery = true,
  nowMs = Date.now(),
  maxBatchBuildAgeMs = DEFAULTS.maxBatchBuildAgeMs,
  maxFutureClockSkewMs = DEFAULTS.maxFutureClockSkewMs,
} = {}) {
  const universe =
    await getCryptoUniverse({
      refresh: true,
      maximumAssets,
      coinGeckoPages,
      includeDexDiscovery,
    });

  const assets =
    Array.isArray(universe?.assets)
      ? universe.assets
      : [];

  /*
   * Universe generatedAt is a batch-build completion timestamp.
   * It proves that this refresh cycle completed recently, but it is NOT
   * treated as the observation timestamp for each market measurement.
   */
  const generatedAtMs = parseTime(universe?.generatedAt);
  const signedBatchAgeMs =
    generatedAtMs === null ? null : nowMs - generatedAtMs;
  const futureSkewMs =
    signedBatchAgeMs !== null && signedBatchAgeMs < 0
      ? Math.abs(signedBatchAgeMs)
      : 0;
  const batchAgeMs =
    signedBatchAgeMs === null
      ? null
      : Math.max(0, signedBatchAgeMs);

  const freshnessFailures = [];

  if (generatedAtMs === null) {
    freshnessFailures.push({
      code: "FRESH_BATCH_TIMESTAMP_REQUIRED",
      detail: universe?.generatedAt ?? null,
    });
  } else if (futureSkewMs > maxFutureClockSkewMs) {
    freshnessFailures.push({
      code: "FRESH_BATCH_TIMESTAMP_IN_FUTURE",
      detail: {
        futureSkewMs,
        maximumFutureClockSkewMs: maxFutureClockSkewMs,
      },
    });
  } else if (batchAgeMs > maxBatchBuildAgeMs) {
    freshnessFailures.push({
      code: "FRESH_BATCH_STALE",
      detail: {
        ageMs: batchAgeMs,
        maximumAgeMs: maxBatchBuildAgeMs,
      },
    });
  }

  if (universe?.approved !== true || assets.length === 0) {
    freshnessFailures.push({
      code: "FRESH_BATCH_UNIVERSE_UNAVAILABLE",
      detail: universe?.status ?? null,
    });
  }

  /*
   * COMPLETE and PARTIAL are legitimate newly-built universe outcomes.
   * The current universe provider has no stale-fallback status/behavior:
   * it builds a new object on refresh:true and returns ERROR/EMPTY when
   * no assets are available. Do not invent a STALE_FALLBACK contract.
   */
  const status = upper(universe?.status);
  if (status !== "COMPLETE" && status !== "PARTIAL") {
    freshnessFailures.push({
      code: "FRESH_BATCH_STATUS_NOT_USABLE",
      detail: universe?.status ?? null,
    });
  }

  const batchFresh = freshnessFailures.length === 0;

  const byContract = new Map();
  const byId = new Map();
  const bySymbol = new Map();

  if (batchFresh) {
    for (const asset of assets) {
      const i = identity(asset);

      const ck = contractKey(i);
      if (ck && !byContract.has(ck)) {
        byContract.set(ck, asset);
      }

      const ik = exactIdKey(i);
      if (ik && !byId.has(ik)) {
        byId.set(ik, asset);
      }

      if (i.symbol) {
        if (!bySymbol.has(i.symbol)) {
          bySymbol.set(i.symbol, []);
        }
        bySymbol.get(i.symbol).push(asset);
      }
    }
  }

  function resolve(candidate) {
    if (!batchFresh) {
      return {
        asset: null,
        matchedBy: null,
        freshnessAuthorized: false,
        failures: freshnessFailures,
      };
    }

    const target = identity(candidate);

    const ck = contractKey(target);
    if (ck && byContract.has(ck)) {
      return {
        asset: byContract.get(ck),
        matchedBy: "NETWORK_CONTRACT",
        freshnessAuthorized: true,
        failures: [],
      };
    }

    const ik = exactIdKey(target);
    if (ik && byId.has(ik)) {
      return {
        asset: byId.get(ik),
        matchedBy: "ASSET_ID",
        freshnessAuthorized: true,
        failures: [],
      };
    }

    const cexSafe =
      target.candidateType === "CEX" ||
      target.candidateType === "CEX_DEX";

    if (cexSafe && target.symbol) {
      const rows = bySymbol.get(target.symbol) ?? [];

      const exactName =
        target.name
          ? rows.find(row => identity(row).name === target.name)
          : null;

      if (exactName) {
        return {
          asset: exactName,
          matchedBy: "CEX_SYMBOL_NAME",
          freshnessAuthorized: true,
          failures: [],
        };
      }

      if (rows.length === 1) {
        return {
          asset: rows[0],
          matchedBy: "CEX_UNAMBIGUOUS_SYMBOL",
          freshnessAuthorized: true,
          failures: [],
        };
      }
    }

    return {
      asset: null,
      matchedBy: null,
      freshnessAuthorized: true,
      failures: [],
    };
  }

  return {
    approved: batchFresh,
    status: batchFresh
      ? universe?.status ?? "PARTIAL"
      : "FRESHNESS_REJECTED",
    generatedAt: universe?.generatedAt ?? null,
    assetCount: batchFresh ? assets.length : 0,
    resolve,
    freshness: {
      authorized: batchFresh,
      generatedAt: universe?.generatedAt ?? null,
      ageMs: batchAgeMs,
      signedAgeMs: signedBatchAgeMs,
      futureSkewMs,
      maxBatchBuildAgeMs,
      maxFutureClockSkewMs,
      timestampAuthority: "UNIVERSE_BUILD_COMPLETION",
      measurementFreshnessAuthority:
        "FINAL_REVALIDATION_6_49",
      failures: freshnessFailures,
    },
    metadata: {
      refreshPerformed: true,
      sharedBatchSnapshot: true,
      universeStatus: universe?.status ?? null,
      generatedAtIsMeasurementTimestamp: false,
      staleFallbackUsed: false,
      executionAuthority: false,
      liveExecution: false,
    },
  };
}

export default buildCryptoFreshMarketBatch;
