/**
 * ============================================================
 * UNIVERSE MARKET DATA SERVICE
 * ============================================================
 *
 * Warms historical market data once for the entire selected universe,
 * then scans locally in batches, globally ranks ELIGIBLE candidates,
 * and selects the market-wide top N.
 */

import {
  buildMarketMeasurements,
} from "./marketMeasurementProvider.js";

import {
  scanMarket,
} from "./marketScanner.js";

import deepResearchCoordinator from
  "./deepResearchCoordinator.js";

import getMarketMovers from
  "../data/providers/alpacaMarketMoversProvider.js";

export const UNIVERSE_DATA_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    PARTIAL: "PARTIAL",
    EMPTY: "EMPTY",
    ERROR: "ERROR",
  });

const DEFAULT_CONFIG = Object.freeze({
  batchSize: 100,
  batchConcurrency: 1,
  maximumCandidatesPerBatch: 20,
  maximumCandidatesPerCycle: 20,
  submitForDeepResearch: true,
  marketRegime: "NEUTRAL",

  // Cheap first-stage snapshot screen. This prevents the historical
  // warmer from touching the entire 10k+ symbol universe.
  enableSnapshotPrefilter: false,
  snapshotPrefilterLimitPerSide: 300,
  snapshotBatchSize: 200,
  snapshotConcurrency: 1,
  snapshotMinimumPrice: 1,
  snapshotMinimumDailyVolume: 100000,
  snapshotMaximumAgeDays: 7,
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeSymbol(symbol) {
  return String(symbol ?? "").trim().toUpperCase();
}

function safeErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeRegime(value) {
  const regime = String(value ?? "NEUTRAL")
    .trim()
    .toUpperCase();

  if (["BULL", "BULLISH", "RISK_ON"].includes(regime)) {
    return "BULLISH";
  }

  if (["BEAR", "BEARISH", "RISK_OFF"].includes(regime)) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

function normalizeAssets(assets) {
  if (!Array.isArray(assets)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const rawAsset of assets) {
    const symbol = normalizeSymbol(rawAsset?.symbol);

    if (!symbol || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    normalized.push({
      ...rawAsset,
      symbol,
    });
  }

  return normalized;
}

function createBatches(items, batchSize) {
  const batches = [];

  for (
    let index = 0;
    index < items.length;
    index += batchSize
  ) {
    batches.push(
      items.slice(index, index + batchSize),
    );
  }

  return batches;
}

function mergeMoverRows({
  gainers = [],
  losers = [],
} = {}) {
  const bestBySymbol = new Map();

  for (const row of [
    ...(Array.isArray(gainers) ? gainers : []),
    ...(Array.isArray(losers) ? losers : []),
  ]) {
    const symbol = normalizeSymbol(row?.symbol);

    if (!symbol) {
      continue;
    }

    const existing = bestBySymbol.get(symbol);
    const movement = Math.abs(finiteOrZero(row?.changePercent));
    const existingMovement = Math.abs(
      finiteOrZero(existing?.changePercent),
    );

    if (!existing || movement > existingMovement) {
      bestBySymbol.set(symbol, {
        ...row,
        symbol,
      });
    }
  }

  return [...bestBySymbol.values()].sort((a, b) => {
    const movementDifference =
      Math.abs(finiteOrZero(b?.changePercent)) -
      Math.abs(finiteOrZero(a?.changePercent));

    if (movementDifference !== 0) {
      return movementDifference;
    }

    const volumeDifference =
      finiteOrZero(b?.volume) -
      finiteOrZero(a?.volume);

    if (volumeDifference !== 0) {
      return volumeDifference;
    }

    return a.symbol.localeCompare(b.symbol);
  });
}

async function prefilterUniverseWithSnapshots({
  assets,
  marketMoversProvider,
  limitPerSide,
  batchSize,
  concurrency,
  minimumPrice,
  minimumDailyVolume,
  maximumAgeDays,
} = {}) {
  const startedAt = nowIso();
  const symbols = assets.map(asset => asset.symbol);
  const assetBySymbol = new Map(
    assets.map(asset => [asset.symbol, asset]),
  );

  const movers = await marketMoversProvider({
    symbols,
    assets,
    limit: limitPerSide,
    batchSize,
    concurrency,
    minimumPrice,
    minimumDailyVolume,
    maximumAgeDays,
  });

  const rows = mergeMoverRows({
    gainers: movers?.gainers,
    losers: movers?.losers,
  });

  const selectedAssets = rows
    .map(row => {
      const asset = assetBySymbol.get(row.symbol);

      if (!asset) {
        return null;
      }

      return {
        ...asset,

        // Keep cheap snapshot context available for diagnostics/UI.
        snapshotPrefilter: {
          price: row?.price ?? null,
          changePercent: row?.changePercent ?? null,
          volume: row?.volume ?? null,
          bid: row?.bid ?? null,
          ask: row?.ask ?? null,
          timestamp: row?.timestamp ?? null,
        },
      };
    })
    .filter(Boolean);

  return {
    approved: movers?.approved === true && selectedAssets.length > 0,
    status: movers?.status ?? "UNKNOWN",
    universeSize: assets.length,
    usableCount: Number(movers?.usableCount ?? 0) || 0,
    eligibleCount: Number(movers?.eligibleCount ?? 0) || 0,
    selectedCount: selectedAssets.length,
    assets: selectedAssets,
    provider: movers?.provider ?? "ALPACA_MARKET_MOVERS",
    batch: movers?.batch ?? null,
    warnings: Array.isArray(movers?.warnings)
      ? [...movers.warnings]
      : [],
    errors: Array.isArray(movers?.errors)
      ? [...movers.errors]
      : [],
    startedAt,
    completedAt: nowIso(),
  };
}

async function defaultWarmBatch({ assets } = {}) {
  return {
    approved: false,
    symbolsRequested: Array.isArray(assets)
      ? assets.length
      : 0,
    symbolsWarmed: 0,
    warmedSymbols: [],
    failedSymbols: Array.isArray(assets)
      ? assets
          .map(asset => normalizeSymbol(asset?.symbol))
          .filter(Boolean)
      : [],
    errors: [
      "No universe market-data warmer was configured.",
    ],
    warnings: [],
  };
}

async function processBatch({
  assets,
  batchIndex,
  marketRegime,
  measurementConfig,
  maximumCandidatesPerBatch,
} = {}) {
  const startedAt = nowIso();
  const symbols = assets.map(asset => asset.symbol);

  const result = {
    batchIndex,
    symbols,
    requested: assets.length,
    warmed: 0,
    measured: 0,
    researchable: 0,
    qualified: 0,
    submitted: 0,
    candidates: [],
    highConvictionCandidates: [],
    errors: [],
    warnings: [],
    startedAt,
    completedAt: null,
  };

  try {
    // Historical market data has already been warmed once for the
    // entire selected universe. Per-batch work is local only.
    const measurements = buildMarketMeasurements({
      assets,
      marketRegime,
      configOverrides: measurementConfig,
    });

    result.measured = measurements.length;

    if (measurements.length === 0) {
      result.warnings.push(
        "No usable scanner measurements were available for this batch.",
      );
      result.completedAt = nowIso();
      return result;
    }

    const scannerResult = await scanMarket({
      measurements,
      maximumCandidates: maximumCandidatesPerBatch,
      submitForDeepResearch: false,
    });

    result.researchable =
      Number(
        scannerResult?.researchable ??
          scannerResult?.candidates?.length ??
          0,
      ) || 0;

    result.qualified =
      Number(scannerResult?.qualified ?? 0) || 0;

    result.candidates = Array.isArray(scannerResult?.candidates)
      ? scannerResult.candidates
      : [];

    result.highConvictionCandidates = Array.isArray(
      scannerResult?.highConvictionCandidates,
    )
      ? scannerResult.highConvictionCandidates
      : [];

    result.completedAt = nowIso();
    return result;
  } catch (error) {
    result.errors.push(safeErrorMessage(error));
    result.completedAt = nowIso();
    return result;
  }
}

async function processWithConcurrency({
  batches,
  concurrency,
  worker,
} = {}) {
  const results = new Array(batches.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= batches.length) {
        return;
      }

      results[index] = await worker(
        batches[index],
        index,
      );
    }
  }

  const workerCount = Math.min(
    concurrency,
    batches.length,
  );

  if (workerCount <= 0) {
    return results;
  }

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => runWorker(),
    ),
  );

  return results;
}

function globallyRankCandidates(batchResults) {
  const bestBySymbol = new Map();

  for (const batch of batchResults) {
    if (!Array.isArray(batch?.candidates)) {
      continue;
    }

    for (const candidate of batch.candidates) {
      const symbol = normalizeSymbol(candidate?.symbol);

      const researchEligible =
        candidate?.eligible === true ||
        (
          candidate?.eligible === undefined &&
          candidate?.qualified === true
        );

      if (!symbol || !researchEligible) {
        continue;
      }

      const existing = bestBySymbol.get(symbol);
      const candidateScore = finiteOrZero(
        candidate?.scannerScore,
      );
      const existingScore = finiteOrZero(
        existing?.scannerScore,
      );
      const candidateEdge = finiteOrZero(
        candidate?.directionEdge,
      );
      const existingEdge = finiteOrZero(
        existing?.directionEdge,
      );

      if (
        !existing ||
        candidateScore > existingScore ||
        (
          candidateScore === existingScore &&
          candidateEdge > existingEdge
        )
      ) {
        bestBySymbol.set(symbol, {
          ...candidate,
          symbol,
        });
      }
    }
  }

  return [...bestBySymbol.values()].sort((a, b) => {
    const scoreDifference =
      finiteOrZero(b?.scannerScore) -
      finiteOrZero(a?.scannerScore);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const edgeDifference =
      finiteOrZero(b?.directionEdge) -
      finiteOrZero(a?.directionEdge);

    if (edgeDifference !== 0) {
      return edgeDifference;
    }

    return a.symbol.localeCompare(b.symbol);
  });
}

function submitGlobalCandidates({
  candidates,
  maximumCandidatesPerCycle,
} = {}) {
  const selected = candidates.slice(
    0,
    maximumCandidatesPerCycle,
  );

  const submissions = [];

  for (const candidate of selected) {
    try {
      const submission =
        deepResearchCoordinator.submitCandidate(candidate);

      submissions.push({
        symbol: candidate.symbol,
        scannerScore: candidate.scannerScore,
        preferredDirection:
          candidate.preferredDirection ?? "NEUTRAL",
        qualified: candidate.qualified === true,
        eligible: candidate.eligible === true,
        accepted: submission?.accepted === true,
        reason: submission?.reason ?? null,
      });
    } catch (error) {
      submissions.push({
        symbol: candidate.symbol,
        scannerScore: candidate.scannerScore,
        preferredDirection:
          candidate.preferredDirection ?? "NEUTRAL",
        qualified: candidate.qualified === true,
        eligible: candidate.eligible === true,
        accepted: false,
        reason: safeErrorMessage(error),
      });
    }
  }

  return {
    selected,
    submissions,
  };
}

export async function processUniverseMarketData({
  assets = [],
  warmBatch = defaultWarmBatch,
  batchSize = DEFAULT_CONFIG.batchSize,
  batchConcurrency = DEFAULT_CONFIG.batchConcurrency,
  maximumCandidatesPerBatch =
    DEFAULT_CONFIG.maximumCandidatesPerBatch,
  maximumCandidatesPerCycle =
    DEFAULT_CONFIG.maximumCandidatesPerCycle,
  submitForDeepResearch =
    DEFAULT_CONFIG.submitForDeepResearch,
  marketRegime = DEFAULT_CONFIG.marketRegime,
  measurementConfig = {},

  enableSnapshotPrefilter =
    DEFAULT_CONFIG.enableSnapshotPrefilter,

  snapshotPrefilterLimitPerSide =
    DEFAULT_CONFIG.snapshotPrefilterLimitPerSide,

  snapshotBatchSize =
    DEFAULT_CONFIG.snapshotBatchSize,

  snapshotConcurrency =
    DEFAULT_CONFIG.snapshotConcurrency,

  snapshotMinimumPrice =
    DEFAULT_CONFIG.snapshotMinimumPrice,

  snapshotMinimumDailyVolume =
    DEFAULT_CONFIG.snapshotMinimumDailyVolume,

  snapshotMaximumAgeDays =
    DEFAULT_CONFIG.snapshotMaximumAgeDays,

  marketMoversProvider =
    getMarketMovers,
} = {}) {
  const startedAt = nowIso();
  const normalizedAssets = normalizeAssets(assets);
  const normalizedRegime = normalizeRegime(marketRegime);

  if (normalizedAssets.length === 0) {
    return {
      approved: true,
      service: "UNIVERSE_MARKET_DATA_SERVICE",
      status: UNIVERSE_DATA_STATUS.EMPTY,
      marketRegime: normalizedRegime,
      assetsRequested: 0,
      assetsPrefiltered: 0,
      prefilter: null,
      batchesProcessed: 0,
      warmProviderInvocations: 0,
      warmed: 0,
      measured: 0,
      researchable: 0,
      qualified: 0,
      watchlistCount: 0,
      selectedForDeepResearch: 0,
      submitted: 0,
      candidates: [],
      watchlistCandidates: [],
      highConvictionCandidates: [],
      selectedCandidates: [],
      submissions: [],
      batchResults: [],
      errors: [],
      warnings: [],
      startedAt,
      completedAt: nowIso(),
    };
  }

  const safeBatchSize = positiveInteger(
    batchSize,
    DEFAULT_CONFIG.batchSize,
  );

  const safeConcurrency = positiveInteger(
    batchConcurrency,
    DEFAULT_CONFIG.batchConcurrency,
  );

  const safeCandidatesPerBatch = positiveInteger(
    maximumCandidatesPerBatch,
    DEFAULT_CONFIG.maximumCandidatesPerBatch,
  );

  const safeCandidatesPerCycle = positiveInteger(
    maximumCandidatesPerCycle,
    DEFAULT_CONFIG.maximumCandidatesPerCycle,
  );

  try {
    let scanAssets = normalizedAssets;

    let prefilter = {
      enabled: enableSnapshotPrefilter === true,
      approved: true,
      status: "DISABLED",
      universeSize: normalizedAssets.length,
      usableCount: normalizedAssets.length,
      eligibleCount: normalizedAssets.length,
      selectedCount: normalizedAssets.length,
      provider: null,
      batch: null,
      warnings: [],
      errors: [],
    };

    if (enableSnapshotPrefilter === true) {
      prefilter = await prefilterUniverseWithSnapshots({
        assets: normalizedAssets,
        marketMoversProvider,
        limitPerSide: positiveInteger(
          snapshotPrefilterLimitPerSide,
          DEFAULT_CONFIG.snapshotPrefilterLimitPerSide,
        ),
        batchSize: positiveInteger(
          snapshotBatchSize,
          DEFAULT_CONFIG.snapshotBatchSize,
        ),
        concurrency: positiveInteger(
          snapshotConcurrency,
          DEFAULT_CONFIG.snapshotConcurrency,
        ),
        minimumPrice: snapshotMinimumPrice,
        minimumDailyVolume: snapshotMinimumDailyVolume,
        maximumAgeDays: snapshotMaximumAgeDays,
      });

      if (prefilter.assets.length > 0) {
        scanAssets = prefilter.assets;
      } else {
        return {
          approved: false,
          service: "UNIVERSE_MARKET_DATA_SERVICE",
          status: UNIVERSE_DATA_STATUS.PARTIAL,
          marketRegime: normalizedRegime,
          assetsRequested: normalizedAssets.length,
          assetsPrefiltered: 0,
          prefilter,
          batchesProcessed: 0,
          warmed: 0,
          measured: 0,
          researchable: 0,
          qualified: 0,
          watchlistCount: 0,
          selectedForDeepResearch: 0,
          submitted: 0,
          candidates: [],
          watchlistCandidates: [],
          highConvictionCandidates: [],
          selectedCandidates: [],
          submissions: [],
          batchResults: [],
          errors: [...prefilter.errors],
          warnings: [
            ...prefilter.warnings,
            "Snapshot prefilter produced no viable securities; expensive historical warming was skipped.",
          ],
          startedAt,
          completedAt: nowIso(),
        };
      }
    }

    // ============================================================
    // ONE HISTORICAL WARM FOR THE ENTIRE SELECTED UNIVERSE
    // ============================================================
    // The warmer itself uses Alpaca's multi-symbol historical endpoint
    // and owns any provider pagination internally. We invoke it once
    // here, never once per local scanner batch.
    let warmResult = null;
    let warmError = null;

    try {
      warmResult = await warmBatch({
        assets: scanAssets,
        symbols: scanAssets.map(asset => asset.symbol),
        batchIndex: 0,
      });
    } catch (error) {
      warmError = safeErrorMessage(error);
    }

    const warmed =
      Number(
        warmResult?.symbolsWarmed ??
          warmResult?.warmed ??
          0,
      ) || 0;

    // Preserve local batching for CPU-side measurement/scanning and
    // deterministic global ranking. These batches make no provider calls.
    const batches = createBatches(
      scanAssets,
      safeBatchSize,
    );

    const batchResults = await processWithConcurrency({
      batches,
      concurrency: safeConcurrency,
      worker: (batchAssets, batchIndex) =>
        processBatch({
          assets: batchAssets,
          batchIndex,
          marketRegime: normalizedRegime,
          measurementConfig,
          maximumCandidatesPerBatch:
            safeCandidatesPerBatch,
        }),
    });

    const measured = batchResults.reduce(
      (total, batch) =>
        total + (Number(batch?.measured) || 0),
      0,
    );

    const errors = [
      ...(warmError ? [warmError] : []),
      ...(Array.isArray(warmResult?.errors)
        ? warmResult.errors
        : []),
      ...batchResults.flatMap(batch =>
        Array.isArray(batch?.errors) ? batch.errors : [],
      ),
    ];

    const warnings = [
      ...(Array.isArray(warmResult?.warnings)
        ? warmResult.warnings
        : []),
      ...batchResults.flatMap(batch =>
        Array.isArray(batch?.warnings) ? batch.warnings : [],
      ),
    ];

    const candidates = globallyRankCandidates(batchResults);
    const researchable = candidates.length;
    const qualified = candidates.filter(
      candidate => candidate?.qualified === true,
    ).length;

    // Public scanner/watchlist: strongest researchable names,
    // regardless of whether they passed strict qualification.
    const watchlistCandidates = candidates.slice(
      0,
      safeCandidatesPerCycle,
    );

    // Expensive deep research remains strict.
    const qualifiedCandidates = candidates.filter(
      candidate => candidate?.qualified === true,
    );

    let selectedCandidates = qualifiedCandidates.slice(
      0,
      safeCandidatesPerCycle,
    );

    let submissions = [];

    if (submitForDeepResearch === true) {
      const submissionResult = submitGlobalCandidates({
        candidates: qualifiedCandidates,
        maximumCandidatesPerCycle:
          safeCandidatesPerCycle,
      });

      selectedCandidates = submissionResult.selected;
      submissions = submissionResult.submissions;
    }

    const submitted = submissions.filter(
      submission => submission.accepted === true,
    ).length;

    let status = UNIVERSE_DATA_STATUS.COMPLETE;

    if (
      errors.length > 0 ||
      measured < scanAssets.length
    ) {
      status = UNIVERSE_DATA_STATUS.PARTIAL;
    }

    return {
      approved: measured > 0,
      service: "UNIVERSE_MARKET_DATA_SERVICE",
      status,
      marketRegime: normalizedRegime,
      assetsRequested: normalizedAssets.length,
      assetsPrefiltered: scanAssets.length,
      prefilter,
      batchesProcessed: batchResults.length,
      warmProviderInvocations: 1,
      warmed,
      measured,
      researchable,
      qualified,
      watchlistCount: watchlistCandidates.length,
      selectedForDeepResearch:
        selectedCandidates.length,
      submitted,
      candidates,
      watchlistCandidates,
      highConvictionCandidates:
        candidates.filter(
          candidate => candidate?.qualified === true,
        ),
      selectedCandidates,
      submissions,
      batchResults,
      errors,
      warnings,
      startedAt,
      completedAt: nowIso(),
    };
  } catch (error) {
    return {
      approved: false,
      service: "UNIVERSE_MARKET_DATA_SERVICE",
      status: UNIVERSE_DATA_STATUS.ERROR,
      marketRegime: normalizedRegime,
      assetsRequested: normalizedAssets.length,
      assetsPrefiltered: 0,
      prefilter: null,
      batchesProcessed: 0,
      warmProviderInvocations: 0,
      warmed: 0,
      measured: 0,
      researchable: 0,
      qualified: 0,
      watchlistCount: 0,
      selectedForDeepResearch: 0,
      submitted: 0,
      candidates: [],
      watchlistCandidates: [],
      highConvictionCandidates: [],
      selectedCandidates: [],
      submissions: [],
      batchResults: [],
      errors: [safeErrorMessage(error)],
      warnings: [],
      startedAt,
      completedAt: nowIso(),
    };
  }
}

export default processUniverseMarketData;
