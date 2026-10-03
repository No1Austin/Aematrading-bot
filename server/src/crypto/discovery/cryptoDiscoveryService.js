/**
 * ============================================================
 * AEMA CRYPTO — DISCOVERY OVERVIEW SERVICE
 * ============================================================
 *
 * PURPOSE
 * -------
 * HTTP-facing orchestration layer for the Crypto Discovery page.
 *
 * The actual discovery/qualification logic remains owned by:
 *
 *   scanner/cryptoDiscoveryCycle.js
 *
 * This service:
 *
 * 1. Runs the existing discovery pipeline.
 * 2. Adds HTTP-level caching.
 * 3. Normalizes the response for the frontend.
 * 4. Separates CEX and DEX candidates.
 * 5. Preserves research-only boundaries.
 *
 * IMPORTANT
 * ---------
 * This file does NOT create fake market measurements.
 * Missing data remains unavailable.
 *
 * Research only.
 * No execution authority.
 */

import {
  runCryptoDiscoveryCycle,
} from "../scanner/cryptoDiscoveryCycle.js";


/**
 * ============================================================
 * CACHE
 * ============================================================
 */

const DISCOVERY_CACHE_TTL_MS =
  Math.max(
    1_000,
    Number(
      process.env.AEMA_DISCOVERY_CACHE_MS,
    ) || 300_000,
  );


let discoveryCache = {
  result: null,
  createdAt: 0,
};


let discoveryInFlight = null;


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}


function array(value) {
  return Array.isArray(value)
    ? value
    : [];
}


function normalizeCandidateType(
  candidate,
) {
  const explicit =
    String(
      candidate?.candidateType ??
      candidate?.type ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    explicit === "DEX" ||
    explicit === "EMERGING"
  ) {
    return "DEX";
  }

  if (explicit === "CEX") {
    return "CEX";
  }

  const dexCount =
    numberOrZero(
      candidate?.dexCount ??
      candidate?.measurements
        ?.dexCount ??
      candidate?.measurements
        ?.venues
        ?.dexCount,
    );

  const cexCount =
    numberOrZero(
      candidate?.cexCount ??
      candidate?.measurements
        ?.cexCount ??
      candidate?.measurements
        ?.venues
        ?.cexCount,
    );

  if (
    dexCount > 0 &&
    cexCount === 0
  ) {
    return "DEX";
  }

  return "CEX";
}


function candidateScore(candidate) {
  return (
    numberOrNull(
      candidate?.scannerScore,
    ) ??
    numberOrNull(
      candidate?.discoveryScore,
    ) ??
    numberOrNull(
      candidate?.score,
    ) ??
    numberOrNull(
      candidate?.qualificationScore,
    ) ??
    0
  );
}


function directionEdge(candidate) {
  return (
    numberOrNull(
      candidate?.directionEdge,
    ) ??
    numberOrNull(
      candidate?.qualification
        ?.directionEdge,
    ) ??
    0
  );
}


function rankCandidates(
  candidates,
) {
  return [...array(candidates)]
    .sort(
      (a, b) =>
        candidateScore(b) -
          candidateScore(a) ||
        directionEdge(b) -
          directionEdge(a),
    );
}


function isQualified(candidate) {
  return (
    candidate?.qualified === true ||
    candidate?.eligible === true ||
    candidate?.qualification
      ?.qualified === true
  );
}


function isHighInterest(candidate) {
  return (
    candidate?.highInterest === true ||
    candidate?.qualification
      ?.highInterest === true
  );
}


function getCycleCandidates(cycle) {
  /*
   * Candidate arrays have been exposed under different names
   * across AEMA discovery phases.
   *
   * Current Phase 2.4 discovery cycle exposes the scanner-selected
   * qualified candidates as cycle.selectedCandidates.
   *
   * Keep legacy fallbacks for backward compatibility.
   */

  const sources = [
    // Current Phase 2.4 contract.
    cycle?.selectedCandidates,

    // Historical/compatibility contracts.
    cycle?.candidates,
    cycle?.researchableCandidates,
    cycle?.qualifiedCandidates,

    cycle?.scanner?.candidates,
    cycle?.scanner?.selectedCandidates,

    cycle?.scannerResult?.candidates,
    cycle?.scannerResult?.selectedCandidates,

    cycle?.result?.candidates,
    cycle?.result?.selectedCandidates,
  ];

  for (const source of sources) {
    if (
      Array.isArray(source) &&
      source.length > 0
    ) {
      return source;
    }
  }

  return [];
}


function getSelectedCandidates(
  cycle,
) {
  const sources = [
    cycle?.selectedCandidates,
    cycle?.selectedForDeepResearch,
    cycle?.researchQueue,
    cycle?.scanner?.selectedCandidates,
    cycle?.scannerResult
      ?.selectedCandidates,
  ];

  for (const source of sources) {
    if (Array.isArray(source)) {
      return source;
    }
  }

  return [];
}


function normalizeUniverseSummary(
  cycle,
) {
  const universe =
    cycle?.universe ??
    cycle?.universeResult ??
    {};

  const universeAssets =
    array(
      universe?.assets ??
      cycle?.assets,
    );

  return {
    assetCount:
      numberOrNull(
        universe?.assetCount,
      ) ??
      numberOrNull(
        universe?.count,
      ) ??
      universeAssets.length,

    providers:
      universe?.providers ??
      {},

    composition:
      universe?.composition ??
      {},
  };
}


function getMeasuredCount(
  cycle,
  candidates,
) {
  return (
    numberOrNull(
      cycle?.qualification
        ?.measured,
    ) ??
    numberOrNull(
      cycle?.measured,
    ) ??
    numberOrNull(
      cycle?.scanner
        ?.scanned,
    ) ??
    numberOrNull(
      cycle?.scannerResult
        ?.measured,
    ) ??
    candidates.length
  );
}


function normalizeGptSummary(
  cycle,
) {
  const gpt =
    cycle?.gpt ??
    cycle?.gptIntelligence ??
    cycle?.intelligence?.gpt ??
    {};

  const shortlisted =
    numberOrNull(
      gpt?.shortlisted,
    ) ??
    array(
      gpt?.candidates,
    ).length;

  return {
    enabled:
      gpt?.enabled === true,

    shortlisted,

    cexLimit:
      numberOrNull(
        gpt?.cexLimit,
      ) ??
      numberOrNull(
        process.env
          .AEMA_DISCOVERY_GPT_CEX_LIMIT,
      ) ??
      8,

    dexLimit:
      numberOrNull(
        gpt?.dexLimit,
      ) ??
      numberOrNull(
        process.env
          .AEMA_DISCOVERY_GPT_DEX_LIMIT,
      ) ??
      12,

    concurrency:
      numberOrNull(
        gpt?.concurrency,
      ) ??
      numberOrNull(
        process.env
          .AEMA_DISCOVERY_GPT_CONCURRENCY,
      ) ??
      3,

    note:
      gpt?.note ??
      "GPT enriches a bounded shortlist; it never overrides hard eligibility.",
  };
}


function normalizeDiscoveryResult(
  cycle,
) {
  const candidates =
    rankCandidates(
      getCycleCandidates(cycle),
    );

  const qualified =
    candidates.filter(
      isQualified,
    );

  const cexQualified =
    qualified.filter(
      candidate =>
        normalizeCandidateType(
          candidate,
        ) === "CEX",
    );

  const dexQualified =
    qualified.filter(
      candidate =>
        normalizeCandidateType(
          candidate,
        ) === "DEX",
    );

  const highInterest =
    qualified.filter(
      isHighInterest,
    );

  const selected =
    rankCandidates(
      getSelectedCandidates(cycle),
    );

  const top20Overall =
    qualified
      .slice(0, 20);

  const topCex =
    cexQualified
      .slice(0, 20);

  const topDex =
    dexQualified
      .slice(0, 20);

  const universe =
    normalizeUniverseSummary(
      cycle,
    );

  const warnings = [
    ...array(
      cycle?.warnings,
    ),

    ...array(
      cycle?.universe?.warnings,
    ),
  ];

  const errors = [
    ...array(
      cycle?.errors,
    ),

    ...array(
      cycle?.universe?.errors,
    ),
  ];


  return {
    approved:
      cycle?.approved !== false,

    status:
      cycle?.status ??
      (
        errors.length > 0
          ? "PARTIAL"
          : "COMPLETE"
      ),

    pipeline:
      "DISCOVERY_QUALIFICATION",

    universe,

    qualification: {
      measured:
        getMeasuredCount(
          cycle,
          candidates,
        ),

      qualified:
        qualified.length,

      cexQualified:
        cexQualified.length,

      dexQualified:
        dexQualified.length,

      highInterest:
        highInterest.length,
    },

    gpt:
      normalizeGptSummary(
        cycle,
      ),

    top20Overall,

    topCex,

    topDex,

    researchQueue:
      selected.length > 0
        ? selected
        : top20Overall,

    /*
     * Preserve the complete ranked candidate set because
     * other consumers may need more than the first 20.
     */
    candidates,

    warnings,

    errors,

    generatedAt:
      new Date().toISOString(),

    researchOnly: true,

    executionAuthority: false,

    liveExecution: false,
  };
}


/**
 * ============================================================
 * CACHE STATUS
 * ============================================================
 */

export function getCryptoDiscoveryCacheStatus() {
  const cached =
    discoveryCache.result !== null;

  return {
    cached,

    ageMs:
      cached
        ? Math.max(
            0,
            Date.now() -
              discoveryCache.createdAt,
          )
        : null,

    ttlMs:
      DISCOVERY_CACHE_TTL_MS,

    inFlight:
      discoveryInFlight !== null,
  };
}


/**
 * ============================================================
 * CLEAR CACHE
 * ============================================================
 */

export function clearCryptoDiscoveryCache() {
  discoveryCache = {
    result: null,
    createdAt: 0,
  };

  return {
    approved: true,
    status: "CACHE_CLEARED",
  };
}


/**
 * ============================================================
 * GET DISCOVERY OVERVIEW
 * ============================================================
 */

export async function getCryptoDiscoveryOverview({
  refresh = false,
  refreshUniverse = false,
  maximumUniverseAssets = 1000,
} = {}) {
  const now =
    Date.now();

  const cacheAge =
    now -
    discoveryCache.createdAt;

  const cacheValid =
    discoveryCache.result !== null &&
    cacheAge >= 0 &&
    cacheAge <
      DISCOVERY_CACHE_TTL_MS;


  /*
   * Return cache unless explicit refresh requested.
   */

  if (
    refresh !== true &&
    cacheValid
  ) {
    return discoveryCache.result;
  }


  /*
   * If another request is already rebuilding Discovery,
   * share the same Promise instead of running another
   * expensive market scan.
   */

  if (discoveryInFlight) {
    return discoveryInFlight;
  }


  discoveryInFlight =
    (async () => {
      try {
        const cycle =
          await runCryptoDiscoveryCycle({
            refreshUniverse:
              refreshUniverse === true ||
              refresh === true,

            maximumUniverseAssets:
              Number.isFinite(
                Number(
                  maximumUniverseAssets,
                ),
              )
                ? Math.max(
                    1,
                    Math.min(
                      1000,
                      Number(
                        maximumUniverseAssets,
                      ),
                    ),
                  )
                : 1000,
          });


        const result =
          normalizeDiscoveryResult(
            cycle,
          );


        discoveryCache = {
          result,
          createdAt:
            Date.now(),
        };


        return result;
      } catch (error) {
        /*
         * Do not overwrite a previously valid cache with
         * an error result.
         */

        console.error(
          "[CRYPTO_DISCOVERY_SERVICE_ERROR]",
          error,
        );


        if (
          discoveryCache.result !== null
        ) {
          return {
            ...discoveryCache.result,

            status:
              "STALE",

            stale:
              true,

            staleReason:
              error instanceof Error
                ? error.message
                : String(error),

            researchOnly:
              true,

            executionAuthority:
              false,

            liveExecution:
              false,
          };
        }


        throw error;
      } finally {
        discoveryInFlight =
          null;
      }
    })();


  return discoveryInFlight;
}


export default {
  getCryptoDiscoveryOverview,
  getCryptoDiscoveryCacheStatus,
  clearCryptoDiscoveryCache,
};