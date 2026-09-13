/**
 * ============================================================
 * AEMA TRADING BOT
 * FULL INSTITUTIONAL INTELLIGENCE DIAGNOSTIC
 * ============================================================
 *
 * PURPOSE
 * -------
 * Trace the complete institutional-intelligence pipeline:
 *
 * ENVIRONMENT
 *      ↓
 * SEC / FINRA source configuration
 *      ↓
 * institutionalEvidenceService
 *      ↓
 * stockAnalysisRunner provider registration
 *      ↓
 * liveStockAnalysisService provider registration
 *      ↓
 * Institutional Position Engine
 *      ↓
 * Trade Scoring Engine
 *      ↓
 * HTTP /api/analysis/stock
 *      ↓
 * Frontend-facing response
 *
 * IMPORTANT
 * ---------
 * This script does NOT:
 *
 * - place orders
 * - alter trades
 * - mutate databases
 * - fabricate institutional evidence
 *
 * Run:
 *
 * node --env-file=.env scripts/fullInstitutionalDiagnostic.js
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const SYMBOL =
  String(
    process.argv[2] ??
    "AAPL",
  )
    .trim()
    .toUpperCase();

const API_BASE_URL =
  String(
    process.env.API_BASE_URL ??
    "http://localhost:8000",
  )
    .trim()
    .replace(/\/+$/, "");

const ROOT =
  process.cwd();

const checks = [];

function line() {
  console.log(
    "\n============================================================",
  );
}

function section(title) {
  line();
  console.log(title);
  line();
}

function pass(name, details = null) {
  checks.push({
    name,
    status: "PASS",
    details,
  });

  console.log(`✅ PASS  ${name}`);

  if (details) {
    console.log(`         ${details}`);
  }
}

function warn(name, details = null) {
  checks.push({
    name,
    status: "WARN",
    details,
  });

  console.log(`⚠️  WARN  ${name}`);

  if (details) {
    console.log(`         ${details}`);
  }
}

function fail(name, details = null) {
  checks.push({
    name,
    status: "FAIL",
    details,
  });

  console.log(`❌ FAIL  ${name}`);

  if (details) {
    console.log(`         ${details}`);
  }
}

function info(name, value) {
  console.log(
    `ℹ️  ${name}:`,
    value,
  );
}

function safeError(error) {
  if (error instanceof Error) {
    return (
      error.stack ??
      error.message
    );
  }

  return String(error);
}

function exists(relativePath) {
  return fs.existsSync(
    path.join(
      ROOT,
      relativePath,
    ),
  );
}

function read(relativePath) {
  try {
    return fs.readFileSync(
      path.join(
        ROOT,
        relativePath,
      ),
      "utf8",
    );
  } catch {
    return null;
  }
}

function summarizeProvider(provider) {
  if (
    provider === null ||
    provider === undefined
  ) {
    return {
      exists: false,
      type: typeof provider,
    };
  }

  return {
    exists: true,
    type: typeof provider,
  };
}

function summarizeInstitutional(result) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return null;
  }

  return {
    approved:
      result?.approved ?? null,

    engine:
      result?.engine ?? null,

    service:
      result?.service ?? null,

    provider:
      result?.provider ?? null,

    status:
      result?.status ?? null,

    symbol:
      result?.symbol ?? null,

    signal:
      result?.signal ?? null,

    direction:
      result?.direction ?? null,

    confidence:
      result?.confidence ?? null,

    directionalSupport:
      result?.directionalSupport ?? null,

    freshness:
      result?.freshness ?? null,

    reasons:
      result?.reasons ?? [],

    warnings:
      result?.warnings ?? [],

    errors:
      result?.errors ?? [],

    sources:
      result?.sources ??
      result?.evidence?.sources ??
      null,
  };
}

function getInstitutionalFromResponse(result) {
  return (
    result
      ?.analysis
      ?.results
      ?.institutional ??

    result
      ?.results
      ?.institutional ??

    result
      ?.runnerResult
      ?.analysis
      ?.results
      ?.institutional ??

    null
  );
}

function getScoringFromResponse(result) {
  return (
    result
      ?.analysis
      ?.results
      ?.scoring ??

    result
      ?.results
      ?.scoring ??

    result
      ?.runnerResult
      ?.analysis
      ?.results
      ?.scoring ??

    null
  );
}

function getProvidersFromResponse(result) {
  return (
    result
      ?.providers ??

    result
      ?.runnerResult
      ?.providers ??

    null
  );
}

function findInstitutionalComponent(
  scoring,
  side,
) {
  const sideResult =
    scoring?.[
      String(side)
        .toLowerCase()
    ];

  const components =
    Array.isArray(
      sideResult?.components,
    )
      ? sideResult.components
      : [];

  return (
    components.find(
      component =>
        component?.name ===
        "INSTITUTIONAL",
    ) ??
    null
  );
}

async function safeImport(
  relativePath,
) {
  try {
    const absolute =
      path.join(
        ROOT,
        relativePath,
      );

    const module =
      await import(
        `file://${absolute}`
      );

    return {
      ok: true,
      module,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      module: null,
      error,
    };
  }
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 60_000,
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ============================================================
 * START
 * ============================================================
 */

section(
  "AEMA FULL INSTITUTIONAL INTELLIGENCE DIAGNOSTIC",
);

info(
  "Symbol",
  SYMBOL,
);

info(
  "Working directory",
  ROOT,
);

info(
  "API",
  API_BASE_URL,
);

info(
  "Node",
  process.version,
);

/**
 * ============================================================
 * 1. FILE SYSTEM
 * ============================================================
 */

section(
  "1. REQUIRED FILES",
);

const requiredFiles = [
  "src/services/institutionalEvidenceService.js",
  "src/services/institutionalIntelligenceService.js",
  "src/services/stockAnalysisRunner.js",
  "src/services/liveStockAnalysisService.js",
  "src/analysis/institutionalPositionEngine.js",
  "src/strategy/tradeScoringEngine.js",
  "src/data/providers/institutional/secInstitutionalFilingsProvider.js",
  "src/data/providers/institutional/finraRegShoProvider.js",
];

for (
  const file of
  requiredFiles
) {
  if (exists(file)) {
    pass(
      `File exists: ${file}`,
    );
  } else {
    fail(
      `Missing file: ${file}`,
    );
  }
}

/**
 * ============================================================
 * 2. ENVIRONMENT
 * ============================================================
 */

section(
  "2. ENVIRONMENT CONFIGURATION",
);

const envChecks = [
  [
    "SEC_CONTACT_EMAIL",
    process.env.SEC_CONTACT_EMAIL,
    true,
  ],

  [
    "SEC_USER_AGENT",
    process.env.SEC_USER_AGENT,
    false,
  ],

  [
    "ALPACA_API_KEY",
    process.env.ALPACA_API_KEY,
    false,
  ],

  [
    "ALPACA_SECRET_KEY",
    process.env.ALPACA_SECRET_KEY,
    false,
  ],
];

for (
  const [
    name,
    value,
    required,
  ] of envChecks
) {
  if (value) {
    pass(
      `${name} configured`,
    );
  } else if (required) {
    fail(
      `${name} missing`,
    );
  } else {
    warn(
      `${name} missing`,
    );
  }
}

/**
 * ============================================================
 * 3. STATIC WIRING INSPECTION
 * ============================================================
 */

section(
  "3. STATIC PROVIDER WIRING",
);

const runnerSource =
  read(
    "src/services/stockAnalysisRunner.js",
  );

if (runnerSource) {
  if (
    runnerSource.includes(
      "getInstitutionalEvidence",
    )
  ) {
    pass(
      "stockAnalysisRunner references getInstitutionalEvidence",
    );
  } else {
    fail(
      "stockAnalysisRunner does NOT reference getInstitutionalEvidence",
    );
  }

  if (
    runnerSource.includes(
      "institutionalInput",
    )
  ) {
    pass(
      "stockAnalysisRunner contains institutionalInput routing",
    );
  } else {
    fail(
      "stockAnalysisRunner does NOT contain institutionalInput routing",
    );
  }

  if (
    runnerSource.includes(
      "institutionalSources",
    )
  ) {
    pass(
      "stockAnalysisRunner exposes institutionalSources diagnostics",
    );
  } else {
    warn(
      "stockAnalysisRunner does not appear to expose institutionalSources",
    );
  }
}

const liveSource =
  read(
    "src/services/liveStockAnalysisService.js",
  );

if (liveSource) {
  if (
    /institutional\s*:/m.test(
      liveSource,
    )
  ) {
    pass(
      "liveStockAnalysisService contains institutional provider registration",
    );
  } else {
    fail(
      "liveStockAnalysisService has no institutional provider registration",
    );
  }

  if (
    liveSource.includes(
      "LIVE_STOCK_PROVIDERS",
    )
  ) {
    pass(
      "LIVE_STOCK_PROVIDERS exists",
    );
  } else {
    fail(
      "LIVE_STOCK_PROVIDERS missing",
    );
  }
}

/**
 * ============================================================
 * 4. IMPORT MODULES
 * ============================================================
 */

section(
  "4. MODULE IMPORT HEALTH",
);

const evidenceImport =
  await safeImport(
    "src/services/institutionalEvidenceService.js",
  );

if (evidenceImport.ok) {
  pass(
    "institutionalEvidenceService imports successfully",
  );
} else {
  fail(
    "institutionalEvidenceService import failed",
    safeError(
      evidenceImport.error,
    ),
  );
}

const liveImport =
  await safeImport(
    "src/services/liveStockAnalysisService.js",
  );

if (liveImport.ok) {
  pass(
    "liveStockAnalysisService imports successfully",
  );
} else {
  fail(
    "liveStockAnalysisService import failed",
    safeError(
      liveImport.error,
    ),
  );
}

const engineImport =
  await safeImport(
    "src/analysis/institutionalPositionEngine.js",
  );

if (engineImport.ok) {
  pass(
    "institutionalPositionEngine imports successfully",
  );
} else {
  fail(
    "institutionalPositionEngine import failed",
    safeError(
      engineImport.error,
    ),
  );
}

/**
 * ============================================================
 * 5. LIVE PROVIDER REGISTRY
 * ============================================================
 */

section(
  "5. LIVE_STOCK_PROVIDERS REGISTRY",
);

const liveProviders =
  liveImport
    ?.module
    ?.LIVE_STOCK_PROVIDERS ??
  null;

if (!liveProviders) {
  fail(
    "LIVE_STOCK_PROVIDERS unavailable",
  );
} else {
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(
          liveProviders,
        ).map(
          ([key, value]) => [
            key,
            summarizeProvider(
              value,
            ),
          ],
        ),
      ),
      null,
      2,
    ),
  );

  if (
    typeof liveProviders
      ?.institutional ===
    "function"
  ) {
    pass(
      "Institutional provider IS registered in LIVE_STOCK_PROVIDERS",
    );
  } else {
    fail(
      "Institutional provider is NOT registered in LIVE_STOCK_PROVIDERS",
      `Received: ${typeof liveProviders?.institutional}`,
    );
  }
}

/**
 * ============================================================
 * 6. DIRECT INSTITUTIONAL EVIDENCE SERVICE
 * ============================================================
 */

section(
  "6. DIRECT INSTITUTIONAL EVIDENCE SERVICE",
);

let directEvidence =
  null;

if (evidenceImport.ok) {
  const evidenceFunction =
    evidenceImport
      ?.module
      ?.default ??
    evidenceImport
      ?.module
      ?.getInstitutionalEvidence ??
    null;

  if (
    typeof evidenceFunction !==
    "function"
  ) {
    fail(
      "Could not locate getInstitutionalEvidence function",
    );
  } else {
    pass(
      "Institutional evidence function located",
    );

    try {
      directEvidence =
        await evidenceFunction({
          symbol:
            SYMBOL,

          asOf:
            new Date()
              .toISOString(),
        });

      console.log(
        JSON.stringify(
          directEvidence,
          null,
          2,
        ),
      );

      if (
        directEvidence &&
        typeof directEvidence ===
          "object"
      ) {
        pass(
          "Institutional evidence service returned an object",
        );
      } else {
        fail(
          "Institutional evidence service returned invalid output",
        );
      }

      const sources =
        directEvidence
          ?.sources ??
        directEvidence
          ?.evidence
          ?.sources ??
        null;

      if (sources) {
        pass(
          "Institutional evidence contains source diagnostics",
        );

        console.log(
          "\nSOURCE SUMMARY:",
        );

        console.log(
          JSON.stringify(
            sources,
            null,
            2,
          ),
        );
      } else {
        warn(
          "Institutional evidence contains no source diagnostics",
        );
      }
    } catch (error) {
      fail(
        "Direct institutional evidence service threw",
        safeError(
          error,
        ),
      );
    }
  }
}

/**
 * ============================================================
 * 7. DIRECT LIVE PROVIDER
 * ============================================================
 */

section(
  "7. DIRECT LIVE INSTITUTIONAL PROVIDER",
);

let directLiveProviderResult =
  null;

if (
  typeof liveProviders
    ?.institutional ===
  "function"
) {
  try {
    directLiveProviderResult =
      await liveProviders
        .institutional({
          symbol:
            SYMBOL,

          asOf:
            new Date()
              .toISOString(),
        });

    console.log(
      JSON.stringify(
        directLiveProviderResult,
        null,
        2,
      ),
    );

    pass(
      "LIVE_STOCK_PROVIDERS.institutional executed",
    );
  } catch (error) {
    fail(
      "LIVE institutional provider threw",
      safeError(
        error,
      ),
    );
  }
} else {
  fail(
    "Cannot execute live institutional provider because it is not registered",
  );
}

/**
 * ============================================================
 * 8. INSTITUTIONAL POSITION ENGINE
 * ============================================================
 */

section(
  "8. INSTITUTIONAL POSITION ENGINE",
);

let engineResult =
  null;

if (engineImport.ok) {
  const analyzeInstitutional =
    engineImport
      ?.module
      ?.default ??
    engineImport
      ?.module
      ?.analyzeInstitutionalPosition ??
    null;

  if (
    typeof analyzeInstitutional !==
    "function"
  ) {
    fail(
      "Institutional position engine function not found",
    );
  } else if (!directEvidence) {
    warn(
      "Skipping evidence-fed engine test because evidence service returned nothing",
    );
  } else {
    try {
      engineResult =
        await analyzeInstitutional({
          symbol:
            SYMBOL,

          evidence:
            directEvidence,

          asOfTimestamp:
            Date.now(),
        });

      console.log(
        JSON.stringify(
          summarizeInstitutional(
            engineResult,
          ),
          null,
          2,
        ),
      );

      if (
        engineResult
          ?.status ===
        "INSUFFICIENT_DATA"
      ) {
        warn(
          "Engine executed but still considers evidence insufficient",
          (
            engineResult
              ?.reasons ??
            []
          ).join(
            " | ",
          ),
        );
      } else {
        pass(
          `Institutional engine produced status ${engineResult?.status}`,
        );
      }

      if (
        engineResult
          ?.directionalSupport
          ?.long !==
          null ||
        engineResult
          ?.directionalSupport
          ?.short !==
          null
      ) {
        pass(
          "Institutional engine produced directional support",
        );
      } else {
        warn(
          "Institutional engine produced no directional support",
        );
      }
    } catch (error) {
      fail(
        "Institutional position engine threw",
        safeError(
          error,
        ),
      );
    }
  }
}

/**
 * ============================================================
 * 9. SERVER HEALTH
 * ============================================================
 */

section(
  "9. HTTP SERVER HEALTH",
);

let serverOnline =
  false;

try {
  const response =
    await fetchWithTimeout(
      `${API_BASE_URL}/api/analysis/status`,
      {},
      5_000,
    );

  const text =
    await response.text();

  console.log(
    `HTTP ${response.status}`,
  );

  console.log(
    text,
  );

  if (response.ok) {
    serverOnline =
      true;

    pass(
      "Analysis API server is online",
    );
  } else {
    fail(
      "Analysis status endpoint returned an error",
    );
  }
} catch (error) {
  fail(
    "Cannot connect to analysis API",
    safeError(
      error,
    ),
  );
}

/**
 * ============================================================
 * 10. FULL HTTP STOCK ANALYSIS
 * ============================================================
 */

section(
  "10. /api/analysis/stock FULL PIPELINE",
);

let apiResult =
  null;

if (serverOnline) {
  try {
    const response =
      await fetchWithTimeout(
        `${API_BASE_URL}/api/analysis/stock`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              symbol:
                SYMBOL,
            }),
        },
        90_000,
      );

    const text =
      await response.text();

    try {
      apiResult =
        JSON.parse(
          text,
        );
    } catch {
      apiResult =
        null;

      fail(
        "Stock analysis route returned non-JSON response",
        text.slice(
          0,
          500,
        ),
      );
    }

    if (apiResult) {
      info(
        "HTTP status",
        response.status,
      );

      info(
        "Top-level status",
        apiResult?.status,
      );

      info(
        "Approved",
        apiResult?.approved,
      );

      info(
        "Execution ready",
        apiResult?.executionReady,
      );

      if (response.ok) {
        pass(
          "Stock analysis HTTP route executed",
        );
      } else {
        fail(
          "Stock analysis HTTP route returned HTTP error",
          `HTTP ${response.status}`,
        );
      }
    }
  } catch (error) {
    fail(
      "Stock analysis HTTP request failed",
      safeError(
        error,
      ),
    );
  }
}

/**
 * ============================================================
 * 11. PROVIDER DIAGNOSTICS FROM ACTUAL API
 * ============================================================
 */

section(
  "11. ACTUAL API PROVIDER DIAGNOSTICS",
);

const apiProviders =
  getProvidersFromResponse(
    apiResult,
  );

console.log(
  JSON.stringify(
    apiProviders,
    null,
    2,
  ),
);

if (!apiProviders) {
  fail(
    "API response contains no provider diagnostics",
  );
} else {
  const institutionalDiagnostic =
    apiProviders
      ?.institutional;

  if (
    institutionalDiagnostic
      ?.supplied ===
    true
  ) {
    pass(
      "API confirms institutional provider was supplied",
    );
  } else {
    fail(
      "API says institutional provider was NOT supplied",
      JSON.stringify(
        institutionalDiagnostic,
      ),
    );
  }

  if (
    apiProviders
      ?.institutionalSources
  ) {
    pass(
      "API exposes institutionalSources",
    );
  } else {
    warn(
      "API institutionalSources is null/missing",
    );
  }
}

/**
 * ============================================================
 * 12. ACTUAL INSTITUTIONAL ENGINE FROM API
 * ============================================================
 */

section(
  "12. ACTUAL API INSTITUTIONAL ENGINE RESULT",
);

const apiInstitutional =
  getInstitutionalFromResponse(
    apiResult,
  );

console.log(
  JSON.stringify(
    apiInstitutional,
    null,
    2,
  ),
);

if (!apiInstitutional) {
  fail(
    "No institutional engine result exists in API response",
  );
} else {
  pass(
    "Institutional engine exists in API response",
  );

  if (
    apiInstitutional
      ?.status ===
    "INSUFFICIENT_DATA"
  ) {
    warn(
      "API institutional engine reports INSUFFICIENT_DATA",
      (
        apiInstitutional
          ?.reasons ??
        []
      ).join(
        " | ",
      ),
    );
  }

  if (
    apiInstitutional
      ?.directionalSupport
      ?.long !==
      null ||
    apiInstitutional
      ?.directionalSupport
      ?.short !==
      null
  ) {
    pass(
      "API institutional engine has directional support",
    );
  } else {
    warn(
      "API institutional engine has no directional support",
    );
  }
}

/**
 * ============================================================
 * 13. TRADE SCORING
 * ============================================================
 */

section(
  "13. INSTITUTIONAL TRADE SCORING",
);

const scoring =
  getScoringFromResponse(
    apiResult,
  );

if (!scoring) {
  fail(
    "Scoring result missing",
  );
} else {
  info(
    "Preferred side",
    scoring?.preferredSide,
  );

  info(
    "Preferred score",
    scoring?.preferredScore,
  );

  for (
    const side of
    [
      "long",
      "short",
    ]
  ) {
    const component =
      findInstitutionalComponent(
        scoring,
        side,
      );

    console.log(
      `\n${side.toUpperCase()} INSTITUTIONAL:`,
    );

    console.log(
      JSON.stringify(
        component,
        null,
        2,
      ),
    );

    if (!component) {
      fail(
        `${side.toUpperCase()} institutional scoring component missing`,
      );

      continue;
    }

    pass(
      `${side.toUpperCase()} institutional component exists`,
    );

    if (
      component
        ?.available ===
      true
    ) {
      pass(
        `${side.toUpperCase()} institutional component is available`,
        `points=${component?.points}/${component?.maximumPoints}`,
      );
    } else {
      warn(
        `${side.toUpperCase()} institutional component unavailable`,
        `engineStatus=${component?.engineStatus}`,
      );
    }
  }
}

/**
 * ============================================================
 * 14. CROSS-CHECK DIRECT SERVICE VS API
 * ============================================================
 */

section(
  "14. DIRECT SERVICE VS API ROUTE",
);

if (
  directEvidence &&
  apiProviders
) {
  const directLooksConfigured =
    directEvidence
      ?.status !==
      "NOT_CONFIGURED";

  const apiSaysConfigured =
    apiProviders
      ?.institutional
      ?.supplied ===
      true;

  if (
    directLooksConfigured &&
    !apiSaysConfigured
  ) {
    fail(
      "ROUTING MISMATCH DETECTED",
      "Direct institutional evidence service runs, but /api/analysis/stock says institutional provider is NOT_CONFIGURED. The HTTP/live-service provider path is bypassing or replacing the institutional provider.",
    );
  } else if (
    directLooksConfigured &&
    apiSaysConfigured
  ) {
    pass(
      "Direct institutional service and HTTP route agree that provider is configured",
    );
  }
}

/**
 * ============================================================
 * 15. LIKELY ROOT CAUSE
 * ============================================================
 */

section(
  "15. AUTOMATIC ROOT-CAUSE ANALYSIS",
);

const directServiceWorks =
  Boolean(
    directEvidence &&
    typeof directEvidence ===
      "object",
  );

const liveProviderRegistered =
  typeof liveProviders
    ?.institutional ===
  "function";

const apiProviderSupplied =
  apiProviders
    ?.institutional
    ?.supplied ===
  true;

const apiEngineHasEvidence =
  Boolean(
    apiInstitutional
      ?.evidence,
  );

const apiScoringAvailable =
  Boolean(
    findInstitutionalComponent(
      scoring,
      "long",
    )
      ?.available ||
    findInstitutionalComponent(
      scoring,
      "short",
    )
      ?.available,
  );

if (
  !liveProviderRegistered
) {
  console.log(
    `
🔥 PRIMARY FAILURE:

LIVE_STOCK_PROVIDERS does not contain a functional
institutional provider.

The failure is between:

institutionalEvidenceService
        ↓
liveStockAnalysisService
        ↓
stockAnalysisRunner
`,
  );
} else if (
  directServiceWorks &&
  !apiProviderSupplied
) {
  console.log(
    `
🔥 PRIMARY FAILURE: PROVIDER ROUTING

The institutional service works directly and the live provider
is registered, but the actual HTTP analysis response says:

institutional.supplied = false

Therefore the failure is NOT the dashboard and NOT the
Institutional Position Engine.

The live HTTP analysis path is either:

1. using a different provider object,
2. explicitly passing institutional: null,
3. using another analysis service/route,
4. running stale server code,
5. or replacing LIVE_STOCK_PROVIDERS before stockAnalysisRunner.
`,
  );
} else if (
  apiProviderSupplied &&
  !apiEngineHasEvidence
) {
  console.log(
    `
🔥 PRIMARY FAILURE: EVIDENCE TRANSFORMATION

The institutional provider is reaching stockAnalysisRunner,
but usable evidence is not reaching institutionalPositionEngine.

Inspect:

institutionalEvidenceService output
        ↓
extractInstitutionalInput / evidence normalization
        ↓
institutionalInput
        ↓
engineOrchestrator
`,
  );
} else if (
  apiEngineHasEvidence &&
  !apiScoringAvailable
) {
  console.log(
    `
🔥 PRIMARY FAILURE: SCORING HANDOFF

Institutional evidence reaches the engine, but the institutional
component is unavailable in trade scoring.

Inspect:

institutionalPositionEngine.directionalSupport
        ↓
engineOrchestrator scoring argument
        ↓
tradeScoringEngine.getDirectionalSupport()
`,
  );
} else if (
  apiScoringAvailable
) {
  console.log(
    `
✅ INSTITUTIONAL PIPELINE IS CONNECTED END-TO-END.

Provider
   ↓
Evidence
   ↓
Institutional engine
   ↓
Directional support
   ↓
Trade scoring

If the dashboard still says NOT CONFIGURED after this result,
the remaining problem is frontend response mapping/cache.
`,
  );
} else {
  console.log(
    `
⚠️ The pipeline executed, but there is not enough information
to classify the failure automatically.

Use the detailed sections above to locate the first point where
a PASS becomes WARN/FAIL.
`,
  );
}

/**
 * ============================================================
 * FINAL REPORT
 * ============================================================
 */

section(
  "16. FINAL DIAGNOSTIC REPORT",
);

const passed =
  checks.filter(
    item =>
      item.status ===
      "PASS",
  ).length;

const warnings =
  checks.filter(
    item =>
      item.status ===
      "WARN",
  ).length;

const failures =
  checks.filter(
    item =>
      item.status ===
      "FAIL",
  ).length;

console.log(
  JSON.stringify(
    {
      symbol:
        SYMBOL,

      checks:
        checks.length,

      passed,

      warnings,

      failures,

      institutional: {
        liveProviderRegistered,

        directServiceWorks,

        apiProviderSupplied,

        apiEngineStatus:
          apiInstitutional
            ?.status ??
          null,

        apiEngineSignal:
          apiInstitutional
            ?.signal ??
          null,

        apiEngineConfidence:
          apiInstitutional
            ?.confidence ??
          null,

        longScoringAvailable:
          findInstitutionalComponent(
            scoring,
            "long",
          )
            ?.available ??
          false,

        shortScoringAvailable:
          findInstitutionalComponent(
            scoring,
            "short",
          )
            ?.available ??
          false,
      },
    },
    null,
    2,
  ),
);

line();

if (failures > 0) {
  console.log(
    `❌ DIAGNOSTIC COMPLETE — ${failures} failure(s) detected.`,
  );
} else if (warnings > 0) {
  console.log(
    `⚠️ DIAGNOSTIC COMPLETE — no hard failures, ${warnings} warning(s).`,
  );
} else {
  console.log(
    "✅ DIAGNOSTIC COMPLETE — all checked layers passed.",
  );
}

line();