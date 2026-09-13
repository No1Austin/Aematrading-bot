/**
 * ============================================================
 * AEMA — FULL STOCK MARKET RESEARCH POOL DIAGNOSTIC
 * ============================================================
 *
 * STOCKS ONLY.
 *
 * PURPOSE
 * -------
 *
 * Trace:
 *
 * Stock universe
 *      ↓
 * Market-data warming
 *      ↓
 * MarketDataHub
 *      ↓
 * Measurements
 *      ↓
 * Scanner
 *      ↓
 * Candidate Registry
 *      ↓
 * Deep Research
 *      ↓
 * HTTP Scanner API
 *
 * This script does NOT place trades.
 */

import process from "node:process";

import {
  getMarketUniverse,
} from "../src/scanner/marketUniverseProvider.js";

import {
  runUniverseMarketDataCycle,
} from "../src/scanner/universeMarketDataService.js";

import {
  getCandidateRegistrySnapshot,
} from "../src/scanner/candidateRegistry.js";

import deepResearchCoordinator
  from "../src/scanner/deepResearchCoordinator.js";

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const API_BASE_URL =
  String(
    process.env.API_BASE_URL ??
    "http://localhost:8000",
  )
    .trim()
    .replace(
      /\/+$/,
      "",
    );

const MAXIMUM_UNIVERSE =
  Number(
    process.env
      .DIAGNOSTIC_MAX_STOCKS ??
    500,
  );

function section(
  title,
) {
  console.log(
    "\n============================================================",
  );

  console.log(
    title,
  );

  console.log(
    "============================================================",
  );
}

function safeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function finiteOrNull(
  value,
) {
  const number =
    Number(
      value,
    );

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function summarizeCandidate(
  candidate,
) {
  return {
    symbol:
      candidate
        ?.symbol,

    status:
      candidate
        ?.status ??
      candidate
        ?.discoveryStatus,

    eligible:
      candidate
        ?.eligible,

    qualified:
      candidate
        ?.qualified,

    scannerScore:
      finiteOrNull(
        candidate
          ?.scannerScore,
      ),

    longScore:
      finiteOrNull(
        candidate
          ?.longScannerScore,
      ),

    shortScore:
      finiteOrNull(
        candidate
          ?.shortScannerScore,
      ),

    direction:
      candidate
        ?.preferredDirection,

    directionEdge:
      finiteOrNull(
        candidate
          ?.directionEdge,
      ),
  };
}

async function safeFetch(
  path,
) {
  try {
    const response =
      await fetch(
        `${API_BASE_URL}${path}`,
      );

    const text =
      await response.text();

    let payload =
      null;

    try {
      payload =
        text
          ? JSON.parse(
              text,
            )
          : null;
    } catch {
      payload = {
        raw:
          text,
      };
    }

    return {
      ok:
        response.ok,

      status:
        response.status,

      payload,
    };
  } catch (error) {
    return {
      ok: false,

      status: null,

      payload: null,

      error:
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
    };
  }
}

/**
 * ============================================================
 * START
 * ============================================================
 */

section(
  "AEMA STOCK MARKET RESEARCH POOL DIAGNOSTIC",
);

console.log({
  api:
    API_BASE_URL,

  maximumUniverse:
    MAXIMUM_UNIVERSE,

  node:
    process.version,

  timestamp:
    new Date()
      .toISOString(),
});

/**
 * ============================================================
 * 1. STOCK UNIVERSE
 * ============================================================
 */

section(
  "1. STOCK UNIVERSE",
);

let universeResult =
  null;

try {
  universeResult =
    await getMarketUniverse({
      refresh:
        true,

      maximumSymbols:
        MAXIMUM_UNIVERSE,

      excludeExchanges: [
        "OTC",
      ],

      requireTradable:
        true,
    });

  const assets =
    safeArray(
      universeResult
        ?.assets ??
      universeResult
        ?.universe ??
      universeResult
        ?.symbols,
    );

  console.log({
    approved:
      universeResult
        ?.approved,

    status:
      universeResult
        ?.status,

    assetCount:
      assets.length,

    reportedAssetCount:
      universeResult
        ?.assetCount,

    longEligible:
      universeResult
        ?.longEligible,

    shortEligible:
      universeResult
        ?.shortEligible,

    warnings:
      universeResult
        ?.warnings,

    errors:
      universeResult
        ?.errors,
  });

  console.log(
    "\nFIRST 25 SYMBOLS:",
  );

  console.log(
    assets
      .slice(
        0,
        25,
      )
      .map(
        asset =>
          typeof asset ===
            "string"
            ? asset
            : asset
                ?.symbol,
      ),
  );
} catch (error) {
  console.error(
    "UNIVERSE FAILED:",
    error,
  );
}

/**
 * ============================================================
 * 2. UNIVERSE MARKET DATA CYCLE
 * ============================================================
 */

section(
  "2. MARKET DATA + MEASUREMENT + SCANNER CYCLE",
);

let cycle =
  null;

try {
  cycle =
    await runUniverseMarketDataCycle({
      universe:
        universeResult,

      submitForDeepResearch:
        true,

      maximumCandidatesPerCycle:
        20,
    });

  console.log(
    JSON.stringify(
      {
        approved:
          cycle
            ?.approved,

        status:
          cycle
            ?.status,

        universeCount:
          cycle
            ?.universeCount ??
          cycle
            ?.assetsScanned,

        prefiltered:
          cycle
            ?.prefiltered,

        symbolsWarmed:
          cycle
            ?.symbolsWarmed,

        readyForScanner:
          cycle
            ?.symbolsReadyForScanner,

        measurementCount:
          cycle
            ?.measurementCount ??
          safeArray(
            cycle
              ?.measurements,
          ).length,

        scanned:
          cycle
            ?.scanner
            ?.scanned ??
          cycle
            ?.scanned,

        researchable:
          cycle
            ?.scanner
            ?.researchable ??
          cycle
            ?.researchable,

        qualified:
          cycle
            ?.scanner
            ?.qualified ??
          cycle
            ?.qualified,

        submitted:
          cycle
            ?.scanner
            ?.submitted ??
          cycle
            ?.submitted,

        warnings:
          cycle
            ?.warnings,

        errors:
          cycle
            ?.errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    "MARKET DATA CYCLE FAILED:",
    error,
  );
}

/**
 * ============================================================
 * 3. SCANNER CANDIDATES
 * ============================================================
 */

section(
  "3. STOCK SCANNER CANDIDATES",
);

const scannerCandidates =
  safeArray(
    cycle
      ?.candidates ??
    cycle
      ?.scanner
      ?.candidates ??
    cycle
      ?.result
      ?.candidates,
  );

console.log(
  "candidateCount:",
  scannerCandidates.length,
);

for (
  const candidate of
  scannerCandidates
    .slice(
      0,
      30,
    )
) {
  console.log(
    summarizeCandidate(
      candidate,
    ),
  );
}

/**
 * ============================================================
 * 4. HIGH CONVICTION
 * ============================================================
 */

section(
  "4. STRICTLY QUALIFIED / HIGH-CONVICTION STOCKS",
);

const highConviction =
  safeArray(
    cycle
      ?.highConvictionCandidates ??
    cycle
      ?.scanner
      ?.highConvictionCandidates,
  );

console.log(
  "qualifiedCount:",
  highConviction.length,
);

for (
  const candidate of
  highConviction
    .slice(
      0,
      30,
    )
) {
  console.log(
    summarizeCandidate(
      candidate,
    ),
  );
}

/**
 * ============================================================
 * 5. REGISTRY
 * ============================================================
 */

section(
  "5. CANDIDATE REGISTRY",
);

try {
  const registry =
    typeof getCandidateRegistrySnapshot ===
      "function"
      ? getCandidateRegistrySnapshot()
      : null;

  console.dir(
    registry,
    {
      depth:
        5,

      maxArrayLength:
        30,
    },
  );
} catch (error) {
  console.error(
    "REGISTRY INSPECTION FAILED:",
    error,
  );
}

/**
 * ============================================================
 * 6. DEEP RESEARCH
 * ============================================================
 */

section(
  "6. DEEP RESEARCH COORDINATOR",
);

try {
  let research =
    null;

  if (
    typeof deepResearchCoordinator
      ?.getSnapshot ===
    "function"
  ) {
    research =
      deepResearchCoordinator
        .getSnapshot();
  } else if (
    typeof deepResearchCoordinator
      ?.getStatus ===
    "function"
  ) {
    research =
      deepResearchCoordinator
        .getStatus();
  } else if (
    typeof deepResearchCoordinator
      ?.snapshot ===
    "function"
  ) {
    research =
      deepResearchCoordinator
        .snapshot();
  }

  console.dir(
    research,
    {
      depth:
        6,

      maxArrayLength:
        30,
    },
  );
} catch (error) {
  console.error(
    "DEEP RESEARCH INSPECTION FAILED:",
    error,
  );
}

/**
 * ============================================================
 * 7. HTTP SCANNER STATUS
 * ============================================================
 */

section(
  "7. HTTP STOCK SCANNER STATUS",
);

const statusResponse =
  await safeFetch(
    "/api/scanner/status",
  );

console.dir(
  statusResponse,
  {
    depth:
      5,
  },
);

/**
 * ============================================================
 * 8. HTTP CANDIDATES
 * ============================================================
 */

section(
  "8. HTTP STOCK CANDIDATES",
);

const candidatesResponse =
  await safeFetch(
    "/api/scanner/candidates?limit=50",
  );

console.dir(
  candidatesResponse,
  {
    depth:
      5,

    maxArrayLength:
      50,
  },
);

/**
 * ============================================================
 * 9. HTTP QUALIFIED
 * ============================================================
 */

section(
  "9. HTTP QUALIFIED STOCKS",
);

const qualifiedResponse =
  await safeFetch(
    "/api/scanner/qualified?limit=50",
  );

console.dir(
  qualifiedResponse,
  {
    depth:
      5,

    maxArrayLength:
      50,
  },
);

/**
 * ============================================================
 * 10. HTTP SNAPSHOT
 * ============================================================
 */

section(
  "10. HTTP STOCK SCANNER SNAPSHOT",
);

const snapshotResponse =
  await safeFetch(
    "/api/scanner/snapshot?limit=50",
  );

console.dir(
  snapshotResponse,
  {
    depth:
      6,

    maxArrayLength:
      50,
  },
);

/**
 * ============================================================
 * ROOT-CAUSE ANALYSIS
 * ============================================================
 */

section(
  "11. AUTOMATIC ROOT-CAUSE ANALYSIS",
);

const universeCount =
  safeArray(
    universeResult
      ?.assets ??
    universeResult
      ?.universe ??
    universeResult
      ?.symbols,
  ).length;

const measurementCount =
  cycle
    ?.measurementCount ??
  safeArray(
    cycle
      ?.measurements,
  ).length;

const candidatesCount =
  scannerCandidates.length;

const httpCandidates =
  safeArray(
    candidatesResponse
      ?.payload
      ?.candidates ??
    candidatesResponse
      ?.payload
      ?.data,
  );

if (
  universeCount ===
  0
) {
  console.log(
    `
❌ FAILURE LAYER:
STOCK UNIVERSE

No stocks were produced by marketUniverseProvider.

Inspect:
src/scanner/marketUniverseProvider.js
`,
  );
} else if (
  measurementCount ===
  0
) {
  console.log(
    `
❌ FAILURE LAYER:
MARKET DATA / MEASUREMENTS

The stock universe exists, but no scanner measurements
were produced.

Inspect:

src/scanner/alpacaUniverseWarmer.js
src/scanner/universeMarketDataService.js
src/data/marketDataHub.js
src/scanner/marketMeasurementProvider.js
`,
  );
} else if (
  candidatesCount ===
  0
) {
  console.log(
    `
❌ FAILURE LAYER:
STOCK SCANNER / QUALIFICATION

Stocks are being measured, but the scanner produces
no research candidates.

Inspect:

src/scanner/marketScanner.js
src/scanner/candidateQualificationEngine.js
src/scanner/marketScannerConfig.js
`,
  );
} else if (
  candidatesResponse
    ?.ok !==
  true
) {
  console.log(
    `
❌ FAILURE LAYER:
SCANNER HTTP API

The scanner produced candidates internally, but the
/api/scanner/candidates endpoint failed.
`,
  );
} else if (
  httpCandidates.length ===
  0
) {
  console.log(
    `
❌ FAILURE LAYER:
REGISTRY / API HANDOFF

The stock scanner produced candidates internally, but
the stock candidates API returned none.

Inspect:

src/scanner/candidateRegistry.js
src/routes/scannerRoutes.js
`,
  );
} else {
  console.log(
    `
✅ STOCK BACKEND MARKET RESEARCH PIPELINE IS POPULATED.

Universe:       ${universeCount}
Measurements:   ${measurementCount}
Candidates:     ${candidatesCount}
API candidates: ${httpCandidates.length}

If the Market Research Pool is still blank in the browser,
the remaining problem is CLIENT routing/mapping.

Inspect:

client/src/services/api.js
client/src/pages/Markets.jsx

Do NOT modify the stock scanner until the frontend mapping
has been checked.
`,
  );
}

section(
  "DIAGNOSTIC COMPLETE",
);