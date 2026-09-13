/**
 * ============================================================
 * AUTONOMOUS DISCOVERY CYCLE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Perform one complete autonomous market-discovery pass:
 *
 *   Alpaca market universe
 *        ↓
 *   Bulk snapshot prefilter
 *        ↓
 *   Batched historical market-data warmup
 *        ↓
 *   MarketDataHub
 *        ↓
 *   Cheap market measurements
 *        ↓
 *   Fast scanner
 *        ↓
 *   Qualified LONG / SHORT candidates
 *        ↓
 *   GLOBAL candidate ranking
 *        ↓
 *   Top-N public watchlist
 *        ↓
 *   Strict qualified subset
 *        ↓
 *   Deep research queue
 *        ↓
 *   Candidate registry
 *
 * IMPORTANT
 * ---------
 *
 * This module:
 *
 * - does NOT place orders
 * - does NOT create an infinite loop
 * - does NOT bypass scanner qualification
 * - does NOT bypass deep research
 * - does NOT treat scanner score as trade approval
 *
 * One call = one complete discovery cycle.
 */

import {
  getMarketUniverse,
} from "./marketUniverseProvider.js";

import {
  processUniverseMarketData,
} from "./universeMarketDataService.js";

import {
  warmAlpacaUniverseBatch,
} from "./alpacaUniverseWarmer.js";

import deepResearchCoordinator from
  "./deepResearchCoordinator.js";

import {
  listCandidates,
  getCandidateRegistryStats,
} from "./candidateRegistry.js";

import {
  MARKET_SCANNER_CONFIG,
} from "./marketScannerConfig.js";

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const DISCOVERY_CYCLE_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    UNIVERSE_UNAVAILABLE:
      "UNIVERSE_UNAVAILABLE",

    NO_MEASUREMENTS:
      "NO_MEASUREMENTS",

    ERROR:
      "ERROR",
  });

/**
 * ============================================================
 * DEFAULTS
 * ============================================================
 */

const DEFAULT_BATCH_SIZE =
  100;

const DEFAULT_BATCH_CONCURRENCY =
  1;

const DEFAULT_MAXIMUM_CANDIDATES_PER_BATCH =
  20;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function nowIso() {
  return new Date()
    .toISOString();
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(
    error,
  );
}

function positiveInteger(
  value,
  fallback,
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return parsed;
}

function normalizeRegime(
  value,
) {
  const normalized =
    String(
      value ??
        "NEUTRAL",
    )
      .trim()
      .toUpperCase();

  if (
    [
      "BULLISH",
      "BULL",
      "RISK_ON",
    ].includes(
      normalized,
    )
  ) {
    return "BULLISH";
  }

  if (
    [
      "BEARISH",
      "BEAR",
      "RISK_OFF",
    ].includes(
      normalized,
    )
  ) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

function safeQueueState() {
  try {
    const queueState =
      deepResearchCoordinator
        .getQueueState();

    return {
      pending:
        queueState?.pending ??
        0,

      running:
        queueState?.running ??
        0,

      maximumConcurrentDeepResearch:
        queueState
          ?.maximumConcurrentDeepResearch ??
        null,
    };
  } catch {
    return {
      pending: 0,

      running: 0,

      maximumConcurrentDeepResearch:
        null,
    };
  }
}

function safeRegistryStats() {
  try {
    return (
      getCandidateRegistryStats() ??
      {
        total: 0,
        byStatus: {},
      }
    );
  } catch {
    return {
      total: 0,
      byStatus: {},
    };
  }
}

function safeCandidateList({
  limit,
} = {}) {
  try {
    return listCandidates({
      limit,
    });
  } catch {
    return [];
  }
}

/**
 * ============================================================
 * RESULT BUILDER
 * ============================================================
 */

function buildBaseResult({
  startedAt,
  marketRegime,
} = {}) {
  return {
    approved: false,

    service:
      "AUTONOMOUS_DISCOVERY_CYCLE",

    status:
      DISCOVERY_CYCLE_STATUS
        .ERROR,

    marketRegime,

    universe: {
      available: false,
      assetCount: 0,
      longEligible: 0,
      shortEligible: 0,
      timestamp: null,
    },

    marketData: {
      batchesProcessed: 0,

      warmed: 0,

      requested: 0,

      unavailable: 0,
    },

    measurements: {
      requested: 0,
      built: 0,
      unavailable: 0,
    },

    scanner: {
      scanned: 0,

      qualified: 0,

      watchlist: 0,

      selectedForDeepResearch:
        0,

      submitted: 0,
    },

    /**
     * Full globally-ranked scanner output from this cycle.
     */
    scannerCandidates: [],

    /**
     * Public Top-N watchlist for the scanner UI. These are the
     * strongest researchable names and do not need to pass the
     * stricter deep-research qualification gate.
     */
    watchlistCandidates: [],

    /**
     * Candidates chosen from the global ranking for expensive
     * research.
     */
    selectedCandidates: [],

    /**
     * Current persistent website/registry view.
     */
    candidates: [],

    submissions: [],

    registry: {
      total: 0,
      byStatus: {},
    },

    queue: {
      pending: 0,
      running: 0,

      maximumConcurrentDeepResearch:
        null,
    },

    batchResults: [],

    warnings: [],

    errors: [],

    startedAt,

    completedAt:
      null,
  };
}

/**
 * ============================================================
 * MAIN DISCOVERY CYCLE
 * ============================================================
 */

export async function runAutonomousDiscoveryCycle({
  /**
   * Shared broad-market regime.
   *
   * Eventually this should come from the market-regime engine.
   */
  marketRegime =
    "NEUTRAL",

  /**
   * Refresh Alpaca asset metadata instead of using cached
   * universe state.
   */
  refreshUniverse =
    false,

  /**
   * Development / controlled scan limit.
   *
   * null = full available universe.
   */
  maximumUniverseSymbols =
    null,

  /**
   * Maximum candidates from the ENTIRE market cycle that may
   * be selected for deep research.
   */
  maximumCandidates =
    MARKET_SCANNER_CONFIG
      .candidateManagement
      .maximumCandidatesPerScan,

  /**
   * Number of assets warmed/scanned in each batch.
   */
  batchSize =
    DEFAULT_BATCH_SIZE,

  /**
   * Number of market-data batches allowed to run concurrently.
   *
   * Start conservatively because the Alpaca API has rate
   * limits.
   */
  batchConcurrency =
    DEFAULT_BATCH_CONCURRENCY,

  /**
   * Maximum candidates retained from each individual scanner
   * batch before global ranking.
   */
  maximumCandidatesPerBatch =
    DEFAULT_MAXIMUM_CANDIDATES_PER_BATCH,

  /**
   * Whether globally selected candidates should enter deep
   * research.
   */
  submitForDeepResearch =
    true,

  /**
   * Normal autonomous operation should leave this false.
   *
   * true is useful for tests and manual diagnostics.
   */
  waitForDeepResearch =
    false,

  /**
   * Scanner measurement configuration.
   */
  measurementConfig =
    {},

  /**
   * Universe filtering.
   */
  includeExchanges =
    null,

  excludeExchanges = [
    "OTC",
  ],

  requireTradable =
    true,

  /**
   * Alpaca warmer dependency.
   *
   * Dependency injection keeps the cycle testable while the
   * real default is the production Alpaca warmer.
   */
  warmBatch =
    warmAlpacaUniverseBatch,
} = {}) {
  const startedAt =
    nowIso();

  const normalizedRegime =
    normalizeRegime(
      marketRegime,
    );

  const safeMaximumCandidates =
    positiveInteger(
      maximumCandidates,

      MARKET_SCANNER_CONFIG
        .candidateManagement
        .maximumCandidatesPerScan,
    );

  const result =
    buildBaseResult({
      startedAt,

      marketRegime:
        normalizedRegime,
    });

  try {
    /**
     * ========================================================
     * 1. DISCOVER THE TRADEABLE MARKET UNIVERSE
     * ========================================================
     */

    const universe =
      await getMarketUniverse({
        refresh:
          refreshUniverse ===
          true,

        maximumSymbols:
          (
            Number.isInteger(
              maximumUniverseSymbols,
            ) &&
            maximumUniverseSymbols >
              0
          )
            ? maximumUniverseSymbols
            : null,

        includeExchanges,

        excludeExchanges,

        requireTradable,
      });

    if (
      universe?.approved !==
        true ||
      !Array.isArray(
        universe?.assets,
      )
    ) {
      result.status =
        DISCOVERY_CYCLE_STATUS
          .UNIVERSE_UNAVAILABLE;

      result.errors =
        Array.isArray(
          universe?.errors,
        )
          ? [
              ...universe.errors,
            ]
          : [
              "Market universe was unavailable.",
            ];

      result.registry =
        safeRegistryStats();

      result.queue =
        safeQueueState();

      result.candidates =
        safeCandidateList({
          limit:
            safeMaximumCandidates,
        });

      result.completedAt =
        nowIso();

      return result;
    }

    result.universe = {
      available: true,

      assetCount:
        universe.assets.length,

      longEligible:
        Array.isArray(
          universe
            .longEligibleSymbols,
        )
          ? universe
              .longEligibleSymbols
              .length
          : 0,

      shortEligible:
        Array.isArray(
          universe
            .shortEligibleSymbols,
        )
          ? universe
              .shortEligibleSymbols
              .length
          : 0,

      timestamp:
        universe.timestamp ??
        null,
    };

    /**
     * Empty but valid universe.
     */

    if (
      universe.assets.length ===
      0
    ) {
      result.approved =
        true;

      result.status =
        DISCOVERY_CYCLE_STATUS
          .NO_MEASUREMENTS;

      result.warnings.push(
        "The market universe was available but contained no assets eligible for this discovery cycle.",
      );

      result.registry =
        safeRegistryStats();

      result.queue =
        safeQueueState();

      result.candidates =
        safeCandidateList({
          limit:
            safeMaximumCandidates,
        });

      result.completedAt =
        nowIso();

      return result;
    }

    /**
     * ========================================================
     * 2. WARM + MEASURE + SCAN + GLOBALLY RANK
     * ========================================================
     *
     * processUniverseMarketData() now owns the complete cheap
     * discovery path:
     *
     *   batches
     *      ↓
     *   Alpaca warmup
     *      ↓
     *   MarketDataHub
     *      ↓
     *   measurements
     *      ↓
     *   scanner
     *      ↓
     *   global ranking
     *      ↓
     *   deep-research submission
     */

    const marketDataResult =
      await processUniverseMarketData({
        assets:
          universe.assets,

        warmBatch,

        batchSize:
          positiveInteger(
            batchSize,
            DEFAULT_BATCH_SIZE,
          ),

        batchConcurrency:
          positiveInteger(
            batchConcurrency,
            DEFAULT_BATCH_CONCURRENCY,
          ),

        maximumCandidatesPerBatch:
          positiveInteger(
            maximumCandidatesPerBatch,
            DEFAULT_MAXIMUM_CANDIDATES_PER_BATCH,
          ),

        maximumCandidatesPerCycle:
          safeMaximumCandidates,

        submitForDeepResearch:
          submitForDeepResearch ===
          true,

        marketRegime:
          normalizedRegime,

        measurementConfig,
      });


      console.log(
  "[AEMA_DISCOVERY_DEBUG]",
  {
    universe:
      universe?.assets?.length ?? 0,

    warmed:
      marketDataResult?.warmed ?? 0,

    measured:
      marketDataResult?.measured ?? 0,

    researchable:
      marketDataResult?.researchable ?? 0,

    qualified:
      marketDataResult?.qualified ?? 0,

    globallyRanked:
      marketDataResult?.candidates?.length ?? 0,

    watchlist:
      marketDataResult?.watchlistCandidates?.length ?? 0,

    selectedForDeepResearch:
      marketDataResult?.selectedCandidates?.length ?? 0,

    submitted:
      marketDataResult?.submitted ?? 0,

    registry:
      safeCandidateList({
        limit: 20,
      }).length,
  },
);
    /**
     * ========================================================
     * 3. MARKET-DATA SUMMARY
     * ========================================================
     */

    const warmed =
      Number(
        marketDataResult
          ?.warmed ??
        0,
      ) || 0;

    const measured =
      Number(
        marketDataResult
          ?.measured ??
        0,
      ) || 0;

    const requested =
      Number(
        marketDataResult
          ?.assetsPrefiltered ??
        universe.assets.length,
      ) || 0;

    result.marketData = {
      batchesProcessed:
        Number(
          marketDataResult
            ?.batchesProcessed ??
          0,
        ) || 0,

      warmed,

      requested,

      unavailable:
        Math.max(
          0,
          requested -
            warmed,
        ),
    };

    result.measurements = {
      requested,

      built:
        measured,

      unavailable:
        Math.max(
          0,
          requested -
            measured,
        ),
    };

    /**
     * ========================================================
     * 4. SCANNER SUMMARY
     * ========================================================
     */

    const scannerCandidates =
      Array.isArray(
        marketDataResult
          ?.candidates,
      )
        ? marketDataResult
            .candidates
        : [];

    const watchlistCandidates =
      Array.isArray(
        marketDataResult
          ?.watchlistCandidates,
      )
        ? marketDataResult
            .watchlistCandidates
            .slice(
              0,
              safeMaximumCandidates,
            )
        : scannerCandidates
            .slice(
              0,
              safeMaximumCandidates,
            );

    const selectedCandidates =
      Array.isArray(
        marketDataResult
          ?.selectedCandidates,
      )
        ? marketDataResult
            .selectedCandidates
        : [];

    const submissions =
      Array.isArray(
        marketDataResult
          ?.submissions,
      )
        ? marketDataResult
            .submissions
        : [];

    result.scanner = {
      /**
       * Number of symbols for which usable scanner
       * measurements were produced.
       */
      scanned:
        measured,

      qualified:
        Number(
          marketDataResult
            ?.qualified ??
          scannerCandidates.filter(
            candidate => candidate?.qualified === true,
          ).length,
        ) || 0,

      watchlist:
        watchlistCandidates.length,

      selectedForDeepResearch:
        Number(
          marketDataResult
            ?.selectedForDeepResearch ??
          selectedCandidates.length,
        ) || 0,

      submitted:
        Number(
          marketDataResult
            ?.submitted ??
          0,
        ) || 0,
    };

    result.scannerCandidates =
      scannerCandidates;

    result.watchlistCandidates =
      watchlistCandidates;

    result.selectedCandidates =
      selectedCandidates;

    result.submissions =
      submissions;

    result.batchResults =
      Array.isArray(
        marketDataResult
          ?.batchResults,
      )
        ? marketDataResult
            .batchResults
        : [];

    if (
      Array.isArray(
        marketDataResult
          ?.warnings,
      )
    ) {
      result.warnings.push(
        ...marketDataResult
          .warnings,
      );
    }

    if (
      Array.isArray(
        marketDataResult
          ?.errors,
      )
    ) {
      result.errors.push(
        ...marketDataResult
          .errors,
      );
    }

    /**
     * ========================================================
     * 5. NO USABLE MARKET MEASUREMENTS
     * ========================================================
     */

    if (
      measured ===
      0
    ) {
      result.status =
        DISCOVERY_CYCLE_STATUS
          .NO_MEASUREMENTS;

      result.warnings.push(
        "The market universe was discovered, but no symbols produced sufficient MarketDataHub state for scanner measurements.",
      );

      result.registry =
        safeRegistryStats();

      result.queue =
        safeQueueState();

      result.candidates =
        safeCandidateList({
          limit:
            safeMaximumCandidates,
        });

      result.completedAt =
        nowIso();

      return result;
    }

    /**
     * ========================================================
     * 6. OPTIONAL DEEP-RESEARCH WAIT
     * ========================================================
     */

    if (
      waitForDeepResearch ===
        true &&
      submitForDeepResearch ===
        true &&
      result.scanner
        .submitted >
        0
    ) {
      await deepResearchCoordinator
        .waitForIdle();
    }

    /**
     * ========================================================
     * 7. WEBSITE / REGISTRY SNAPSHOT
     * ========================================================
     */

    result.registry =
      safeRegistryStats();

    result.queue =
      safeQueueState();

    /**
     * Public scanner view. Do not make the UI depend on the
     * deep-research registry: strict qualification may yield only
     * a handful of registry entries even when the scanner has a
     * healthy Top-N watchlist.
     */
    result.candidates =
      watchlistCandidates.length > 0
        ? watchlistCandidates
        : safeCandidateList({
            limit:
              safeMaximumCandidates,
          });

    /**
     * ========================================================
     * 8. FINAL STATUS
     * ========================================================
     */

    result.approved =
      marketDataResult
        ?.approved ===
      true;

    const hasPartialCoverage =
      result.measurements
        .unavailable >
        0 ||
      result.marketData
        .unavailable >
        0 ||
      result.errors.length >
        0 ||
      marketDataResult
        ?.status ===
        "PARTIAL";

    result.status =
      hasPartialCoverage
        ? DISCOVERY_CYCLE_STATUS
            .PARTIAL
        : DISCOVERY_CYCLE_STATUS
            .COMPLETE;

    if (
      result.measurements
        .unavailable >
      0
    ) {
      result.warnings.push(
        `${result.measurements.unavailable} prefiltered scanner symbols did not produce sufficient scanner measurements during this discovery cycle.`,
      );
    }

    result.completedAt =
      nowIso();

    return result;
  } catch (error) {
    /**
     * ========================================================
     * FAILURE BOUNDARY
     * ========================================================
     *
     * One unexpected dependency failure must never leave the
     * caller without a structured discovery-cycle result.
     */

    result.approved =
      false;

    result.status =
      DISCOVERY_CYCLE_STATUS
        .ERROR;

    result.errors.push(
      safeErrorMessage(
        error,
      ),
    );

    result.registry =
      safeRegistryStats();

    result.queue =
      safeQueueState();

    result.candidates =
      safeCandidateList({
        limit:
          safeMaximumCandidates,
      });

    result.completedAt =
      nowIso();

    return result;
  }
}

export default
  runAutonomousDiscoveryCycle;