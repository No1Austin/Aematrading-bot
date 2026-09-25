/**
 * AEMA Crypto — Phase 6.53
 * Shared Final Revalidation Orchestrator
 *
 * Defense-in-depth freshness hardening:
 * - batch must be approved
 * - resolved asset must carry explicit freshness authorization
 * - batch freshness metadata is preserved in audit evidence
 *
 * Research/paper pipeline only. No live execution authority.
 */

import {
  buildCryptoMeasurement,
} from "../scanner/cryptoMeasurementProvider.js";

import {
  runCryptoScannerRisk,
} from "../scanner/cryptoScannerEngineAdapters.js";

import revalidateCryptoOpportunity from
  "./cryptoFinalMarketRiskRevalidationEngine.js";

import buildCryptoFreshMarketBatch from
  "./cryptoFreshMarketBatchProvider.js";

function blocked(candidate, code, detail = null) {
  return {
    ...candidate,
    finalRevalidation: {
      engine: "CRYPTO_FINAL_MARKET_RISK_REVALIDATION",
      version: "6.53",
      status: "NO_TRADE",
      approved: false,
      decision: "NO_TRADE",
      failures: [{ code, detail }],
      warnings: [],
      nextStage: "NONE",
      paperExecutionAuthority: false,
      executionAuthority: false,
      liveExecution: false,
      researchOnly: true,
    },
    paperExecutionAuthority: false,
    executionAuthority: false,
    liveExecution: false,
  };
}

export async function revalidateQualifiedCryptoCandidates(
  candidates = [],
  {
    freshMarketBatch = null,
    freshMarketBatchOptions = {},
    nowMs = Date.now(),
    options = {},
  } = {},
) {
  const rows = Array.isArray(candidates) ? candidates : [];

  if (rows.length === 0) {
    return [];
  }

  let batch = freshMarketBatch;

  if (!batch) {
    try {
      batch =
        await buildCryptoFreshMarketBatch({
          ...freshMarketBatchOptions,
          nowMs,
        });
    } catch (error) {
      return rows.map(candidate =>
        blocked(
          candidate,
          "FRESH_MARKET_BATCH_FAILED",
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  if (!batch?.approved || typeof batch?.resolve !== "function") {
    return rows.map(candidate =>
      blocked(
        candidate,
        "FRESH_MARKET_BATCH_UNAVAILABLE",
        {
          status: batch?.status ?? null,
          freshness: batch?.freshness ?? null,
        },
      ),
    );
  }

  return Promise.all(
    rows.map(async candidate => {
      if (candidate?.qualification2?.qualified !== true) {
        return blocked(
          candidate,
          "QUALIFICATION_2_REQUIRED",
          candidate?.qualification2?.decision ?? null,
        );
      }

      const resolved = batch.resolve(candidate);

      /*
       * Phase 6.51 resolver explicitly authorizes freshness only after
       * the batch-level freshness contract has passed. Require that
       * signal independently here as defense in depth.
       */
      if (resolved?.freshnessAuthorized !== true) {
        return blocked(
          candidate,
          "FRESH_MARKET_RESOLUTION_NOT_AUTHORIZED",
          {
            matchedBy: resolved?.matchedBy ?? null,
            failures: resolved?.failures ?? [],
            batchFreshness: batch?.freshness ?? null,
          },
        );
      }

      const freshAsset = resolved?.asset ?? null;

      if (!freshAsset) {
        return blocked(
          candidate,
          "FRESH_MARKET_ASSET_UNAVAILABLE",
          {
            matchedBy: resolved?.matchedBy ?? null,
          },
        );
      }

      const freshMeasurements =
        buildCryptoMeasurement(freshAsset);

      if (!freshMeasurements?.measuredAt) {
        return blocked(
          candidate,
          "FRESH_SOURCE_TIMESTAMP_REQUIRED",
          "Provider/source timestamp was not present on the refreshed asset.",
        );
      }

      const context = {
        ...candidate,
        asset: freshAsset,
        measurements: freshMeasurements,
        preferredDirection:
          candidate?.qualification2?.decision ??
          candidate?.preferredDirection ??
          "LONG",

        // Do not reuse research-time shared intelligence/results.
        sharedIntelligence: null,
        sharedIntelligencePromise: null,
        sharedEngineResults: null,

        executionAuthority: false,
        liveExecution: false,
      };

      let freshRisk;

      try {
        freshRisk =
          await runCryptoScannerRisk(context);
      } catch (error) {
        return blocked(
          candidate,
          "FRESH_RISK_REVALIDATION_FAILED",
          error instanceof Error ? error.message : String(error),
        );
      }

      const finalRevalidation =
        revalidateCryptoOpportunity({
          candidate,
          qualification2:
            candidate.qualification2,
          freshMeasurements,
          freshRisk,
          nowMs,
          options,
        });

      return {
        ...candidate,

        freshRevalidationEvidence: {
          matchedBy:
            resolved?.matchedBy ?? null,

          freshnessAuthorized:
            resolved?.freshnessAuthorized === true,

          batchGeneratedAt:
            batch?.generatedAt ?? null,

          batchFreshness:
            batch?.freshness ?? null,

          measurements:
            freshMeasurements,

          risk:
            freshRisk,
        },

        finalRevalidation,

        paperExecutionAuthority: false,
        executionAuthority: false,
        liveExecution: false,
      };
    }),
  );
}

export default revalidateQualifiedCryptoCandidates;
