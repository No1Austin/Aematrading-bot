/**
 * ============================================================
 * SCANNER ROUTES
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Expose continuous market-scanner state and candidate data
 * to the website/API.
 *
 * Endpoints:
 *
 *   GET  /api/scanner/status
 *   GET  /api/scanner/candidates
 *   GET  /api/scanner/qualified
 *   GET  /api/scanner/research-progress
 *   GET  /api/scanner/snapshot
 *   POST /api/scanner/start
 *   POST /api/scanner/stop
 *   POST /api/scanner/run-once
 *
 * IMPORTANT
 * ---------
 *
 * These routes:
 *
 * - do NOT place trades
 * - do NOT bypass scanner qualification
 * - do NOT bypass deep research
 * - expose scanner state only
 */

import express from "express";

import continuousMarketScanner from
  "../scanner/continuousMarketScanner.js";

import {
  listCandidates,
  getCandidateRegistryStats,
} from "../scanner/candidateRegistry.js";

/**
 * ============================================================
 * ROUTER
 * ============================================================
 */

const router =
  express.Router();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

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

function positiveIntegerOrNull(
  value,
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

function parseBoolean(
  value,
  fallback = false,
) {
  if (
    value === undefined ||
    value === null
  ) {
    return fallback;
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    [
      "true",
      "1",
      "yes",
      "on",
    ].includes(
      normalized,
    )
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "off",
    ].includes(
      normalized,
    )
  ) {
    return false;
  }

  return fallback;
}

function normalizeResearchStatus(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    !normalized
  ) {
    return null;
  }

  const allowed =
    new Set([
      "WATCHING",
      "QUEUED",
      "RUNNING",
      "RESEARCHING",
      "IN_PROGRESS",
      "PROCESSING",
      "COMPLETE",
      "REJECTED",
      "FAILED",
      "ERROR",
    ]);

  return allowed.has(
    normalized,
  )
    ? normalized
    : null;
}

function normalizeDirection(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    !normalized
  ) {
    return null;
  }

  const allowed =
    new Set([
      "LONG",
      "SHORT",
      "NEUTRAL",
    ]);

  return allowed.has(
    normalized,
  )
    ? normalized
    : null;
}


function normalizeSymbol(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return normalized ||
    null;
}

function normalizeCandidateStatus(
  candidate,
) {
  return String(
    candidate
      ?.researchStatus ??
    candidate
      ?.status ??
    "",
  )
    .trim()
    .toUpperCase();
}

function getRegistryCandidates() {
  const candidates =
    listCandidates({
      limit:
        null,
    });

  return Array.isArray(
    candidates,
  )
    ? candidates
    : [];
}

function getLatestMarketCandidates() {
  const state =
    continuousMarketScanner
      .getState();

  const lastResult =
    state
      ?.lastResult ??
    null;

  const possibleLists = [
    lastResult
      ?.watchlistCandidates,
    lastResult
      ?.scannerCandidates,
    lastResult
      ?.candidates,
    lastResult
      ?.selectedCandidates,
  ];

  for (
    const candidateList
    of possibleLists
  ) {
    if (
      Array.isArray(
        candidateList,
      ) &&
      candidateList.length >
        0
    ) {
      return candidateList;
    }
  }

  return [];
}

function mergeMarketAndResearchCandidates() {
  const marketCandidates =
    getLatestMarketCandidates();

  const registryCandidates =
    getRegistryCandidates();

  const registryBySymbol =
    new Map(
      registryCandidates
        .map(
          candidate => [
            normalizeSymbol(
              candidate
                ?.symbol,
            ),
            candidate,
          ],
        )
        .filter(
          ([symbol]) =>
            Boolean(
              symbol,
            ),
        ),
    );

  const merged =
    marketCandidates.map(
      (
        candidate,
        index,
      ) => {
        const symbol =
          normalizeSymbol(
            candidate
              ?.symbol,
          );

        const registryCandidate =
          registryBySymbol.get(
            symbol,
          ) ??
          null;

        const qualified =
          candidate
            ?.qualified ===
            true ||
          registryCandidate !==
            null;

        const researchStatus =
          normalizeCandidateStatus(
            registryCandidate,
          ) ||
          (
            qualified
              ? "QUEUED"
              : "WATCHING"
          );

        return {
          ...candidate,
          ...(registryCandidate ??
            {}),

          symbol,

          rank:
            candidate
              ?.rank ??
            index + 1,

          qualified,

          eligible:
            candidate
              ?.eligible ??
            qualified,

          researchStatus,

          deepScore:
            registryCandidate
              ?.deepScore ??
            candidate
              ?.deepScore ??
            null,

          research:
            registryCandidate
              ?.research ??
            candidate
              ?.research ??
            null,
        };
      },
    );

  const seen =
    new Set(
      merged
        .map(
          candidate =>
            normalizeSymbol(
              candidate
                ?.symbol,
            ),
        )
        .filter(
          Boolean,
        ),
    );

  for (
    const registryCandidate
    of registryCandidates
  ) {
    const symbol =
      normalizeSymbol(
        registryCandidate
          ?.symbol,
      );

    if (
      !symbol ||
      seen.has(
        symbol,
      )
    ) {
      continue;
    }

    merged.push({
      ...registryCandidate,

      symbol,

      rank:
        merged.length + 1,

      qualified: true,

      eligible:
        registryCandidate
          ?.eligible ??
        true,

      researchStatus:
        normalizeCandidateStatus(
          registryCandidate,
        ) ||
        "QUEUED",
    });

    seen.add(
      symbol,
    );
  }

  return merged;
}

function getQualifiedCandidates() {
  return getRegistryCandidates()
    .map(
      candidate => ({
        ...candidate,

        symbol:
          normalizeSymbol(
            candidate
              ?.symbol,
          ),

        qualified: true,

        researchStatus:
          normalizeCandidateStatus(
            candidate,
          ) ||
          "QUEUED",
      }),
    );
}

function buildResearchProgress() {
  const candidates =
    getQualifiedCandidates();

  const running =
    candidates.filter(
      candidate =>
        [
          "RUNNING",
          "RESEARCHING",
          "IN_PROGRESS",
          "PROCESSING",
        ].includes(
          candidate
            .researchStatus,
        ),
    );

  const queued =
    candidates.filter(
      candidate =>
        candidate
          .researchStatus ===
        "QUEUED",
    );

  const completed =
    candidates.filter(
      candidate =>
        candidate
          .researchStatus ===
        "COMPLETE",
    );

  const failed =
    candidates.filter(
      candidate =>
        [
          "ERROR",
          "FAILED",
          "REJECTED",
        ].includes(
          candidate
            .researchStatus,
        ),
    );

  return {
    current:
      running[0] ??
      null,

    running,
    queued,
    completed,
    failed,

    counts: {
      total:
        candidates.length,

      running:
        running.length,

      queued:
        queued.length,

      completed:
        completed.length,

      failed:
        failed.length,
    },

    candidates,
  };
}

function buildScannerSnapshot({
  candidateLimit =
    100,
} = {}) {
  const scannerState =
    continuousMarketScanner
      .getState();

  const registryStats =
    getCandidateRegistryStats();

  const candidates =
    mergeMarketAndResearchCandidates()
      .slice(
        0,
        candidateLimit,
      );

  const qualifiedCandidates =
    getQualifiedCandidates();

  const researchProgress =
    buildResearchProgress();

  return {
    scanner:
      scannerState,

    registry:
      registryStats,

    candidates,

    qualifiedCandidates,

    researchProgress,
  };
}

/**
 * ============================================================
 * GET /status
 * ============================================================
 *
 * Website can use this for:
 *
 * - RUNNING / STOPPED
 * - cycle count
 * - last scan
 * - next scan
 * - current cycle state
 * - latest scanner result
 */

router.get(
  "/status",
  (
    req,
    res,
  ) => {
    try {
      const state =
        continuousMarketScanner
          .getState();

      const registry =
        getCandidateRegistryStats();

      return res.status(200)
        .json({
          approved: true,

          service:
            "SCANNER_API",

          scanner:
            state,

          registry,

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * GET /candidates
 * ============================================================
 *
 * Query params:
 *
 *   ?limit=50
 *   ?status=QUEUED
 *   ?direction=LONG
 *
 * Returns website-friendly scanner candidates.
 */

router.get(
  "/candidates",
  (
    req,
    res,
  ) => {
    try {
      const requestedLimit =
        positiveIntegerOrNull(
          req.query
            ?.limit,
        );

      const limit =
        requestedLimit ??
        100;

      const status =
        normalizeResearchStatus(
          req.query
            ?.status,
        );

      const direction =
        normalizeDirection(
          req.query
            ?.direction,
        );

      let candidates =
        mergeMarketAndResearchCandidates();

      if (
        status
      ) {
        candidates =
          candidates.filter(
            candidate =>
              normalizeCandidateStatus(
                candidate,
              ) ===
              status,
          );
      }

      if (
        direction
      ) {
        candidates =
          candidates.filter(
            candidate =>
              String(
                candidate
                  ?.preferredDirection ??
                  "",
              )
                .trim()
                .toUpperCase() ===
              direction,
          );
      }

      candidates =
        candidates.slice(
          0,
          limit,
        );

      return res.status(200)
        .json({
          approved: true,

          service:
            "SCANNER_API",

          count:
            candidates.length,

          listType:
            "MARKET_WATCHLIST",

          filters: {
            status,
            direction,
            limit,
          },

          candidates,

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          count: 0,

          candidates: [],

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * GET /qualified
 * ============================================================
 *
 * Returns candidates that passed scanner qualification and
 * entered the deep-research registry.
 */

router.get(
  "/qualified",
  (
    req,
    res,
  ) => {
    try {
      const requestedLimit =
        positiveIntegerOrNull(
          req.query
            ?.limit,
        );

      const limit =
        requestedLimit ??
        100;

      const status =
        normalizeResearchStatus(
          req.query
            ?.status,
        );

      const direction =
        normalizeDirection(
          req.query
            ?.direction,
        );

      let candidates =
        getQualifiedCandidates();

      if (
        status
      ) {
        candidates =
          candidates.filter(
            candidate =>
              normalizeCandidateStatus(
                candidate,
              ) ===
              status,
          );
      }

      if (
        direction
      ) {
        candidates =
          candidates.filter(
            candidate =>
              String(
                candidate
                  ?.preferredDirection ??
                "",
              )
                .trim()
                .toUpperCase() ===
              direction,
          );
      }

      candidates =
        candidates.slice(
          0,
          limit,
        );

      return res.status(200)
        .json({
          approved: true,

          service:
            "SCANNER_API",

          count:
            candidates.length,

          listType:
            "QUALIFIED_DEEP_RESEARCH",

          filters: {
            status,
            direction,
            limit,
          },

          candidates,

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          count: 0,

          candidates: [],

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * GET /research-progress
 * ============================================================
 *
 * Frontend bridge for live deep-research progress.
 *
 * The frontend may poll this endpoint while the queue runs.
 */

router.get(
  "/research-progress",
  (
    req,
    res,
  ) => {
    try {
      const scanner =
        continuousMarketScanner
          .getState();

      const progress =
        buildResearchProgress();

      return res.status(200)
        .json({
          approved: true,

          service:
            "SCANNER_API",

          scanner: {
            status:
              scanner
                ?.status ??
              null,

            active:
              scanner
                ?.active ===
              true,

            runningCycle:
              scanner
                ?.runningCycle ===
              true,

            cycleCount:
              scanner
                ?.cycleCount ??
              0,

            lastCycleStartedAt:
              scanner
                ?.lastCycleStartedAt ??
              null,

            lastCycleCompletedAt:
              scanner
                ?.lastCycleCompletedAt ??
              null,

            nextCycleAt:
              scanner
                ?.nextCycleAt ??
              null,
          },

          ...progress,

          queue: {
            running:
              progress
                ?.counts
                ?.running ??
              0,

            pending:
              progress
                ?.counts
                ?.queued ??
              0,

            completed:
              progress
                ?.counts
                ?.completed ??
              0,

            failed:
              progress
                ?.counts
                ?.failed ??
              0,
          },

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          current: null,

          running: [],

          queued: [],

          completed: [],

          failed: [],

          candidates: [],

          counts: {
            total: 0,
            running: 0,
            queued: 0,
            completed: 0,
            failed: 0,
          },

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * POST /start
 * ============================================================
 *
 * Optional body:
 *
 * {
 *   intervalMs: 300000,
 *
 *   discoveryOptions: {
 *     maximumUniverseSymbols: 1000,
 *     maximumCandidates: 20,
 *     batchSize: 100,
 *     batchConcurrency: 1,
 *     maximumCandidatesPerBatch: 20,
 *     submitForDeepResearch: true,
 *     waitForDeepResearch: false,
 *     marketRegime: "NEUTRAL"
 *   }
 * }
 */

router.post(
  "/start",
  async (
    req,
    res,
  ) => {
    try {
      const intervalMs =
        positiveIntegerOrNull(
          req.body
            ?.intervalMs,
        );

      if (
        intervalMs !==
        null
      ) {
        continuousMarketScanner
          .setIntervalMs(
            intervalMs,
          );
      }

      if (
        req.body
          ?.discoveryOptions &&
        typeof req.body
          .discoveryOptions ===
          "object" &&
        !Array.isArray(
          req.body
            .discoveryOptions,
        )
      ) {
        continuousMarketScanner
          .updateDiscoveryOptions(
            req.body
              .discoveryOptions,
          );
      }

      const state =
        await continuousMarketScanner
          .start();

      return res.status(200)
        .json({
          approved: true,

          service:
            "SCANNER_API",

          action:
            "START",

          scanner:
            state,

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          action:
            "START",

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * POST /stop
 * ============================================================
 *
 * Optional body:
 *
 * {
 *   waitForCurrentCycle: true
 * }
 */

router.post(
  "/stop",
  async (
    req,
    res,
  ) => {
    try {
      const waitForCurrentCycle =
        parseBoolean(
          req.body
            ?.waitForCurrentCycle,
          true,
        );

      const state =
        await continuousMarketScanner
          .stop({
            waitForCurrentCycle,
          });

      return res.status(200)
        .json({
          approved: true,

          service:
            "SCANNER_API",

          action:
            "STOP",

          scanner:
            state,

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          action:
            "STOP",

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * POST /run-once
 * ============================================================
 *
 * Runs one forced diagnostic discovery cycle even when the
 * continuous scanner is stopped.
 *
 * Does NOT start the repeating timer.
 */

router.post(
  "/run-once",
  async (
    req,
    res,
  ) => {
    try {
      /**
       * Allow temporary discovery-option overrides.
       */
      const existingState =
        continuousMarketScanner
          .getState();

      const originalOptions =
        existingState
          .discoveryOptions ??
        {};

      if (
        req.body
          ?.discoveryOptions &&
        typeof req.body
          .discoveryOptions ===
          "object" &&
        !Array.isArray(
          req.body
            .discoveryOptions,
        )
      ) {
        continuousMarketScanner
          .updateDiscoveryOptions(
            req.body
              .discoveryOptions,
          );
      }

      const cycleResult =
        await continuousMarketScanner
          .runCycle({
            force: true,
          });

      /**
       * Optional one-shot overrides should not permanently
       * mutate scanner configuration unless requested.
       */
      const persistOptions =
        parseBoolean(
          req.body
            ?.persistOptions,
          false,
        );

      if (
        !persistOptions
      ) {
        continuousMarketScanner
          .updateDiscoveryOptions(
            originalOptions,
          );
      }

      return res.status(200)
        .json({
          approved:
            cycleResult
              ?.skipped !==
            true,

          service:
            "SCANNER_API",

          action:
            "RUN_ONCE",

          cycle:
            cycleResult,

          scanner:
            continuousMarketScanner
              .getState(),

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          action:
            "RUN_ONCE",

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * GET /snapshot
 * ============================================================
 *
 * Optional convenience endpoint for the frontend.
 *
 * Returns scanner state + registry + candidates in one call.
 */

router.get(
  "/snapshot",
  (
    req,
    res,
  ) => {
    try {
      const requestedLimit =
        positiveIntegerOrNull(
          req.query
            ?.limit,
        );

      const snapshot =
        buildScannerSnapshot({
          candidateLimit:
            requestedLimit ??
            100,
        });

      return res.status(200)
        .json({
          approved: true,

          service:
            "SCANNER_API",

          ...snapshot,

          timestamp:
            new Date()
              .toISOString(),
        });
    } catch (error) {
      return res.status(500)
        .json({
          approved: false,

          service:
            "SCANNER_API",

          error:
            safeErrorMessage(
              error,
            ),

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

export default router;