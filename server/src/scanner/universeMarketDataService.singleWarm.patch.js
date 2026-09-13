/**
 * ============================================================
 * UNIVERSE MARKET DATA SERVICE — SINGLE-WARM PATCH
 * ============================================================
 *
 * FILE:
 * server/src/scanner/universeMarketDataService.js
 *
 * PURPOSE:
 * Replace the old createBatches/processWithConcurrency historical
 * warmup path with one warm operation for all selected assets.
 *
 * Keep the rest of your existing service (ranking, registry,
 * deep-research submission, statuses, exports) unchanged.
 */

/**
 * OLD DESIGN TO REMOVE:
 *
 * const batches = createBatches(selectedAssets, batchSize);
 *
 * const batchResults = await processWithConcurrency({
 *   batches,
 *   concurrency: batchConcurrency,
 *   worker: ...
 * });
 *
 * That design causes warmBatch() to be called repeatedly.
 */

/**
 * REPLACEMENT HELPER
 */
async function processEntireSelectedUniverse({
  assets,
  warmBatch,
  marketRegime,
  measurementConfig,
  maximumCandidatesPerCycle,
} = {}) {
  const startedAt =
    nowIso();

  const symbols =
    assets.map(
      asset =>
        asset.symbol,
    );

  const result = {
    batchIndex: 0,

    symbols,

    requested:
      assets.length,

    warmed: 0,
    measured: 0,
    researchable: 0,
    qualified: 0,
    submitted: 0,

    candidates: [],

    highConvictionCandidates:
      [],

    errors: [],
    warnings: [],

    startedAt,
    completedAt: null,
  };

  try {
    /**
     * ========================================================
     * ONE WARM CALL FOR THE ENTIRE SELECTED MARKET
     * ========================================================
     */
    const warmResult =
      await warmBatch({
        assets,
        symbols,
        batchIndex: 0,
      });

    result.warmed =
      Number(
        warmResult
          ?.symbolsWarmed ??
        warmResult
          ?.warmed ??
        0,
      ) || 0;

    if (
      Array.isArray(
        warmResult?.errors,
      )
    ) {
      result.errors.push(
        ...warmResult.errors,
      );
    }

    if (
      Array.isArray(
        warmResult?.warnings,
      )
    ) {
      result.warnings.push(
        ...warmResult.warnings,
      );
    }

    /**
     * Measurements now read locally from MarketDataHub.
     */
    const measurements =
      buildMarketMeasurements({
        assets,
        marketRegime,
        configOverrides:
          measurementConfig,
      });

    result.measured =
      measurements.length;

    if (
      measurements.length === 0
    ) {
      result.warnings.push(
        "No usable scanner measurements were available for the selected universe.",
      );

      result.completedAt =
        nowIso();

      return result;
    }

    const scannerResult =
      await scanMarket({
        measurements,

        maximumCandidates:
          maximumCandidatesPerCycle,

        submitForDeepResearch:
          false,
      });

    result.researchable =
      Number(
        scannerResult
          ?.researchable ??
        scannerResult
          ?.candidates
          ?.length ??
        0,
      ) || 0;

    result.qualified =
      Number(
        scannerResult
          ?.qualified ??
        0,
      ) || 0;

    result.candidates =
      Array.isArray(
        scannerResult
          ?.candidates,
      )
        ? scannerResult
            .candidates
        : [];

    result.highConvictionCandidates =
      Array.isArray(
        scannerResult
          ?.highConvictionCandidates,
      )
        ? scannerResult
            .highConvictionCandidates
        : [];

    result.completedAt =
      nowIso();

    return result;
  } catch (error) {
    result.errors.push(
      safeErrorMessage(
        error,
      ),
    );

    result.completedAt =
      nowIso();

    return result;
  }
}

/**
 * ============================================================
 * HOW TO USE IT INSIDE THE MAIN UNIVERSE FUNCTION
 * ============================================================
 *
 * After snapshot prefiltering has produced selectedAssets:
 *
 * const universeResult =
 *   await processEntireSelectedUniverse({
 *     assets: selectedAssets,
 *     warmBatch,
 *     marketRegime: resolvedMarketRegime,
 *     measurementConfig,
 *     maximumCandidatesPerCycle:
 *       resolvedMaximumCandidatesPerCycle,
 *   });
 *
 * const batchResults = [universeResult];
 *
 * Continue using your existing global ranking / deep-research /
 * diagnostics code with batchResults.
 *
 * IMPORTANT:
 * Do not call processBatch() in a loop anymore.
 * Do not call processWithConcurrency() for historical warmup.
 */
