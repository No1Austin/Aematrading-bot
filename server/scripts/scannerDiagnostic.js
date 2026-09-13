/**
 * ============================================================
 * AEMA STOCK RESEARCH ENGINE
 * SCANNER PIPELINE DIAGNOSTIC
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Diagnose the entire discovery pipeline:
 *
 * Market Universe
 *      ↓
 * Alpaca Warmup
 *      ↓
 * Market Measurements
 *      ↓
 * Hard Eligibility
 *      ↓
 * Researchable Candidates
 *      ↓
 * Scanner Conviction
 *      ↓
 * Global Ranking
 *      ↓
 * Top 20 Research Candidates
 *
 * This script:
 *
 * - does NOT submit anything to deep research
 * - does NOT modify scanner state
 * - does NOT place trades
 * - prints exactly where candidates disappear
 */


/* ============================================================
 * 01. LOAD ENVIRONMENT VARIABLES
 * ============================================================
 */

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath,
  pathToFileURL,
} from "node:url";


/* ============================================================
 * 02. CURRENT SCRIPT LOCATION
 * ============================================================
 */

const __filename =
  fileURLToPath(
    import.meta.url,
  );

const __dirname =
  path.dirname(
    __filename,
  );

/*
 * scannerDiagnostic.js is expected at:
 *
 * server/scripts/scannerDiagnostic.js
 *
 * Therefore server root is one directory above.
 */

const SERVER_ROOT =
  path.resolve(
    __dirname,
    "..",
  );


/* ============================================================
 * 03. FILE RESOLUTION
 * ============================================================
 *
 * Your project structure may differ.
 *
 * Instead of crashing because one hard-coded path is wrong,
 * this diagnostic searches several likely locations.
 */

function resolveBackendFile(
  filename,
) {
  const candidates = [
    /*
     * Most likely locations.
     */
    path.join(
      SERVER_ROOT,
      "services",
      "scanner",
      filename,
    ),

    path.join(
      SERVER_ROOT,
      "services",
      filename,
    ),

    path.join(
      SERVER_ROOT,
      "scanner",
      filename,
    ),

    path.join(
      SERVER_ROOT,
      "src",
      "services",
      "scanner",
      filename,
    ),

    path.join(
      SERVER_ROOT,
      "src",
      "services",
      filename,
    ),

    path.join(
      SERVER_ROOT,
      "src",
      "scanner",
      filename,
    ),

    path.join(
      SERVER_ROOT,
      filename,
    ),
  ];

  const found =
    candidates.find(
      candidate =>
        fs.existsSync(
          candidate,
        ),
    );

  if (!found) {
    console.error(
      `\n❌ Could not locate ${filename}`,
    );

    console.error(
      "\nLocations checked:",
    );

    for (
      const candidate
      of candidates
    ) {
      console.error(
        ` - ${candidate}`,
      );
    }

    throw new Error(
      `BACKEND_FILE_NOT_FOUND: ${filename}`,
    );
  }

  return found;
}


/* ============================================================
 * 04. DYNAMIC IMPORT HELPER
 * ============================================================
 */

async function loadBackendModule(
  filename,
) {
  const filePath =
    resolveBackendFile(
      filename,
    );

  console.log(
    `✅ Found ${filename}`,
  );

  console.log(
    `   ${filePath}`,
  );

  return import(
    pathToFileURL(
      filePath,
    ).href
  );
}


/* ============================================================
 * 05. FORMATTERS
 * ============================================================
 */

function safeArray(
  value,
) {
  return Array.isArray(value)
    ? value
    : [];
}

function count(
  value,
) {
  return Array.isArray(value)
    ? value.length
    : 0;
}

function finiteOrZero(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}

function printDivider(
  title,
) {
  console.log(
    "\n==============================================",
  );

  console.log(
    title,
  );

  console.log(
    "==============================================\n",
  );
}


/* ============================================================
 * 06. ENVIRONMENT CHECK
 * ============================================================
 */

function checkEnvironment() {
  printDivider(
    "0. ENVIRONMENT CHECK",
  );

  const alpacaKey =
    process.env
      .ALPACA_API_KEY;

  const alpacaSecret =
    process.env
      .ALPACA_SECRET_KEY;

  console.log({
    nodeEnv:
      process.env.NODE_ENV ??
      "not set",

    alpacaApiKey:
      alpacaKey
        ? "✅ PRESENT"
        : "❌ MISSING",

    alpacaSecretKey:
      alpacaSecret
        ? "✅ PRESENT"
        : "❌ MISSING",

    alpacaBaseUrl:
      process.env
        .ALPACA_TRADING_BASE_URL ??
      "default",
  });

  if (
    !alpacaKey ||
    !alpacaSecret
  ) {
    console.warn(
      "\n⚠️ Alpaca credentials are missing in this terminal environment.",
    );

    console.warn(
      "If they exist only on Render, this local diagnostic cannot fetch Alpaca data.",
    );
  }
}


/* ============================================================
 * 07. REJECTION ANALYSIS
 * ============================================================
 */

function summarizeRejections(
  batchResults,
) {
  const hardRejections =
    new Map();

  const convictionLimits =
    new Map();

  for (
    const batch
    of safeArray(
      batchResults,
    )
  ) {
    /*
     * The batch scanner may expose allResults
     * depending on your current implementation.
     */

    const allResults =
      safeArray(
        batch?.allResults ??
        batch?.scannerResults ??
        [],
      );

    for (
      const result
      of allResults
    ) {
      for (
        const reason
        of safeArray(
          result
            ?.rejectionReasons,
        )
      ) {
        hardRejections.set(
          reason,
          (
            hardRejections.get(
              reason,
            ) ?? 0
          ) + 1,
        );
      }

      for (
        const reason
        of safeArray(
          result
            ?.qualificationReasons,
        )
      ) {
        convictionLimits.set(
          reason,
          (
            convictionLimits.get(
              reason,
            ) ?? 0
          ) + 1,
        );
      }
    }
  }

  return {
    hardRejections:
      Array.from(
        hardRejections.entries(),
      )
        .map(
          ([reason, total]) => ({
            reason,
            total,
          }),
        )
        .sort(
          (a, b) =>
            b.total -
            a.total,
        ),

    convictionLimits:
      Array.from(
        convictionLimits.entries(),
      )
        .map(
          ([reason, total]) => ({
            reason,
            total,
          }),
        )
        .sort(
          (a, b) =>
            b.total -
            a.total,
        ),
  };
}


/* ============================================================
 * 08. MAIN DIAGNOSTIC
 * ============================================================
 */

async function runDiagnostic() {
  printDivider(
    "AEMA SCANNER DIAGNOSTIC",
  );

  console.log(
    "Server root:",
    SERVER_ROOT,
  );

  checkEnvironment();

  try {
    /* ========================================================
       LOAD REQUIRED MODULES
       ======================================================== */

    printDivider(
      "1. LOCATING SCANNER MODULES",
    );

    const universeModule =
      await loadBackendModule(
        "marketUniverseProvider.js",
      );

    const marketDataModule =
      await loadBackendModule(
        "universeMarketDataService.js",
      );

    const warmerModule =
      await loadBackendModule(
        "alpacaUniverseWarmer.js",
      );

    const getMarketUniverse =
      universeModule
        .getMarketUniverse ??
      universeModule.default;

    const processUniverseMarketData =
      marketDataModule
        .processUniverseMarketData ??
      marketDataModule.default;

    const warmAlpacaUniverseBatch =
      warmerModule
        .warmAlpacaUniverseBatch ??
      warmerModule.default;

    if (
      typeof getMarketUniverse !==
      "function"
    ) {
      throw new Error(
        "marketUniverseProvider does not export getMarketUniverse().",
      );
    }

    if (
      typeof processUniverseMarketData !==
      "function"
    ) {
      throw new Error(
        "universeMarketDataService does not export processUniverseMarketData().",
      );
    }

    if (
      typeof warmAlpacaUniverseBatch !==
      "function"
    ) {
      throw new Error(
        "alpacaUniverseWarmer does not export warmAlpacaUniverseBatch().",
      );
    }


    /* ========================================================
       MARKET UNIVERSE
       ======================================================== */

    printDivider(
      "2. MARKET UNIVERSE",
    );

    /*
     * Start with 500 symbols.
     *
     * Once the pipeline works correctly,
     * you can remove maximumSymbols and scan
     * the full eligible US-equity universe.
     */

    const universe =
      await getMarketUniverse({
        refresh: true,

        maximumSymbols:
          500,

        excludeExchanges: [
          "OTC",
        ],

        requireTradable:
          true,
      });

    const universeAssets =
      safeArray(
        universe?.assets,
      );

    console.log({
      approved:
        universe?.approved,

      status:
        universe?.status,

      assetCount:
        universeAssets.length,

      reportedAssetCount:
        universe
          ?.assetCount ?? 0,

      longEligible:
        count(
          universe
            ?.longEligibleSymbols,
        ),

      shortEligible:
        count(
          universe
            ?.shortEligibleSymbols,
        ),

      errors:
        universe?.errors ?? [],

      warnings:
        universe?.warnings ?? [],
    });

    if (
      universeAssets.length ===
      0
    ) {
      console.error(
        "\n❌ PIPELINE STOPS HERE",
      );

      console.error(
        "The scanner has no market universe to process.",
      );

      return;
    }

    console.log(
      "\nFirst 10 universe symbols:",
    );

    console.log(
      universeAssets
        .slice(0, 10)
        .map(
          asset =>
            asset.symbol,
        ),
    );


    /* ========================================================
       MARKET DATA + MEASUREMENT + DISCOVERY
       ======================================================== */

    printDivider(
      "3. MARKET DATA + DISCOVERY SCANNER",
    );

    const result =
      await processUniverseMarketData({
        assets:
          universeAssets,

        warmBatch:
          warmAlpacaUniverseBatch,

        batchSize:
          100,

        batchConcurrency:
          1,

        maximumCandidatesPerBatch:
          20,

        maximumCandidatesPerCycle:
          20,

        /*
         * IMPORTANT:
         *
         * Diagnostic mode.
         *
         * We do NOT want to send test candidates into the
         * expensive deep-research queue.
         */
        submitForDeepResearch:
          false,

        marketRegime:
          "NEUTRAL",
      });

    const candidates =
      safeArray(
        result?.candidates,
      );

    const selected =
      safeArray(
        result
          ?.selectedCandidates,
      );

    console.log({
      approved:
        result?.approved,

      status:
        result?.status,

      assetsRequested:
        result
          ?.assetsRequested ?? 0,

      batchesProcessed:
        result
          ?.batchesProcessed ?? 0,

      warmed:
        result?.warmed ?? 0,

      measured:
        result?.measured ?? 0,

      researchable:
        result
          ?.researchable ?? 0,

      highConviction:
        result
          ?.qualified ?? 0,

      globallyRanked:
        candidates.length,

      selectedForDeepResearch:
        result
          ?.selectedForDeepResearch ??
        selected.length,

      submitted:
        result
          ?.submitted ?? 0,

      errors:
        count(
          result?.errors,
        ),

      warnings:
        count(
          result?.warnings,
        ),
    });


    /* ========================================================
       PIPELINE DIAGNOSIS
       ======================================================== */

    printDivider(
      "4. AUTOMATIC DIAGNOSIS",
    );

    const warmed =
      finiteOrZero(
        result?.warmed,
      );

    const measured =
      finiteOrZero(
        result?.measured,
      );

    const researchable =
      finiteOrZero(
        result?.researchable,
      );

    if (
      warmed === 0
    ) {
      console.error(
        "❌ PROBLEM FOUND: MARKET DATA WARMUP",
      );

      console.error(
        "The universe exists, but zero stocks were warmed.",
      );

      console.error(
        "Inspect alpacaUniverseWarmer.js and Alpaca market-data credentials/API responses.",
      );
    } else if (
      measured === 0
    ) {
      console.error(
        "❌ PROBLEM FOUND: MARKET MEASUREMENTS",
      );

      console.error(
        `${warmed} stocks were warmed, but no usable measurements were created.`,
      );

      console.error(
        "Inspect marketMeasurementProvider.js.",
      );
    } else if (
      researchable === 0
    ) {
      console.error(
        "❌ PROBLEM FOUND: HARD ELIGIBILITY",
      );

      console.error(
        `${measured} stocks were measured, but zero became researchable.`,
      );

      console.error(
        "This strongly suggests the hard-gate inputs or thresholds are rejecting everything.",
      );
    } else if (
      candidates.length ===
      0
    ) {
      console.error(
        "❌ PROBLEM FOUND: CANDIDATE RANKING",
      );

      console.error(
        `${researchable} stocks are researchable, but the globally-ranked list is empty.`,
      );

      console.error(
        "Inspect universeMarketDataService.js.",
      );
    } else if (
      selected.length === 0 &&
      (
        result
          ?.selectedForDeepResearch ??
        0
      ) === 0
    ) {
      console.error(
        "❌ PROBLEM FOUND: TOP-20 SELECTION",
      );

      console.error(
        `${candidates.length} globally-ranked candidates exist, but none were selected.`,
      );
    } else {
      console.log(
        "✅ DISCOVERY PIPELINE IS WORKING.",
      );

      console.log(
        `Researchable: ${researchable}`,
      );

      console.log(
        `Globally ranked: ${candidates.length}`,
      );

      console.log(
        `Selected: ${
          result
            ?.selectedForDeepResearch ??
          selected.length
        }`,
      );

      console.log(
        "\nIf the website still shows 0 / 20, the problem is downstream:",
      );

      console.log(
        "DeepResearchCoordinator → Candidate Registry → API → Frontend.",
      );
    }


    /* ========================================================
       TOP CANDIDATES
       ======================================================== */

    printDivider(
      "5. TOP RESEARCH CANDIDATES",
    );

    if (
      candidates.length ===
      0
    ) {
      console.log(
        "❌ No ranked candidates returned.",
      );
    } else {
      console.table(
        candidates
          .slice(0, 20)
          .map(
            (
              candidate,
              index,
            ) => ({
              rank:
                index + 1,

              symbol:
                candidate
                  ?.symbol,

              eligible:
                candidate
                  ?.eligible,

              highConviction:
                candidate
                  ?.qualified,

              scannerScore:
                candidate
                  ?.scannerScore,

              direction:
                candidate
                  ?.preferredDirection,

              directionEdge:
                candidate
                  ?.directionEdge,

              hardRejects:
                safeArray(
                  candidate
                    ?.rejectionReasons,
                ).join(
                  ", ",
                ),

              convictionLimits:
                safeArray(
                  candidate
                    ?.qualificationReasons,
                ).join(
                  ", ",
                ),
            }),
          ),
      );
    }


    /* ========================================================
       BATCH DIAGNOSTICS
       ======================================================== */

    printDivider(
      "6. BATCH DIAGNOSTICS",
    );

    const batchResults =
      safeArray(
        result?.batchResults,
      );

    if (
      batchResults.length ===
      0
    ) {
      console.log(
        "No batch results were returned.",
      );
    } else {
      console.table(
        batchResults.map(
          batch => ({
            batch:
              batch
                ?.batchIndex,

            requested:
              batch
                ?.requested ?? 0,

            warmed:
              batch
                ?.warmed ?? 0,

            measured:
              batch
                ?.measured ?? 0,

            researchable:
              batch
                ?.researchable ?? 0,

            highConviction:
              batch
                ?.qualified ?? 0,

            candidates:
              count(
                batch
                  ?.candidates,
              ),

            errors:
              count(
                batch?.errors,
              ),

            warnings:
              count(
                batch?.warnings,
              ),
          }),
        ),
      );
    }


    /* ========================================================
       ERRORS + WARNINGS
       ======================================================== */

    printDivider(
      "7. ERRORS AND WARNINGS",
    );

    if (
      count(
        result?.errors,
      ) === 0
    ) {
      console.log(
        "✅ No service-level errors.",
      );
    } else {
      console.error(
        "ERRORS:",
      );

      console.dir(
        result.errors,
        {
          depth: null,
        },
      );
    }

    if (
      count(
        result?.warnings,
      ) === 0
    ) {
      console.log(
        "✅ No service-level warnings.",
      );
    } else {
      console.warn(
        "\nWARNINGS:",
      );

      console.dir(
        result.warnings,
        {
          depth: null,
        },
      );
    }


    /* ========================================================
       FINAL SUMMARY
       ======================================================== */

    printDivider(
      "DIAGNOSTIC COMPLETE",
    );

    console.log({
      universe:
        universeAssets.length,

      warmed,

      measured,

      researchable,

      highConviction:
        result?.qualified ?? 0,

      globallyRanked:
        candidates.length,

      selected:
        result
          ?.selectedForDeepResearch ??
        selected.length,
    });

  } catch (error) {
    printDivider(
      "DIAGNOSTIC FAILED",
    );

    console.error(
      error,
    );

    process.exitCode = 1;
  }
}


/* ============================================================
 * 09. RUN
 * ============================================================
 */

await runDiagnostic();