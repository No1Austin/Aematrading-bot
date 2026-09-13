/**
 * ============================================================
 * AEMA STOCK SYSTEM CAPABILITY AUDIT
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Inspect the backend codebase and print a structured map of
 * everything the stock-market system / research engine / bot
 * appears capable of doing.
 *
 * It looks for:
 *
 * - scanners
 * - discovery engines
 * - research engines
 * - market-data providers
 * - trading / execution modules
 * - paper trading
 * - positions
 * - risk logic
 * - historical intelligence
 * - social/news/macro/institutional logic
 * - APIs / routes
 * - schedulers / continuous scanners
 * - database / registry modules
 *
 * RUN FROM:
 *
 *   server/
 *
 * COMMAND:
 *
 *   node scripts/systemCapabilityAudit.js
 *
 * OUTPUT:
 *
 *   - terminal report
 *   - scripts/systemCapabilityAudit-report.json
 */

import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath,
} from "node:url";


/* ============================================================
 * 01. PATHS
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

const SERVER_ROOT =
  path.resolve(
    __dirname,
    "..",
  );

const OUTPUT_FILE =
  path.join(
    __dirname,
    "systemCapabilityAudit-report.json",
  );


/* ============================================================
 * 02. CONFIG
 * ============================================================
 */

const INCLUDE_EXTENSIONS =
  new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".json",
  ]);

const EXCLUDED_DIRECTORIES =
  new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    ".vercel",
  ]);

const CAPABILITY_GROUPS = {
  scanner: [
    "scanner",
    "scanmarket",
    "discovery",
    "qualification",
    "candidate",
    "universe",
  ],

  research: [
    "research",
    "deepresearch",
    "analysis",
    "analyzestock",
    "coordinator",
  ],

  technical: [
    "technical",
    "rsi",
    "macd",
    "ema",
    "sma",
    "vwap",
    "atr",
    "bollinger",
    "trend",
    "momentum",
  ],

  fundamental: [
    "fundamental",
    "company",
    "earnings",
    "revenue",
    "balance sheet",
    "income statement",
    "cash flow",
  ],

  institutional: [
    "institutional",
    "sec",
    "13f",
    "finra",
    "dark pool",
    "short interest",
  ],

  macro: [
    "macro",
    "marketregime",
    "market regime",
    "economic",
    "inflation",
    "interest rate",
    "fed",
    "recession",
  ],

  social: [
    "social",
    "sentiment",
    "reddit",
    "twitter",
    "x.com",
    "stocktwits",
  ],

  newsEvents: [
    "news",
    "events",
    "catalyst",
    "headline",
    "earnings calendar",
  ],

  historical: [
    "historical",
    "analogue",
    "analog",
    "history",
    "backtest",
  ],

  liquidity: [
    "liquidity",
    "spread",
    "orderbook",
    "order book",
    "slippage",
    "volume",
  ],

  risk: [
    "risk",
    "riskreward",
    "risk reward",
    "stoploss",
    "stop loss",
    "takeprofit",
    "take profit",
    "drawdown",
  ],

  trading: [
    "trade",
    "trading",
    "execute",
    "execution",
    "order",
    "buy",
    "sell",
  ],

  paperTrading: [
    "paper",
    "papertrading",
    "paper trading",
    "simulation",
    "simulated",
  ],

  positions: [
    "position",
    "positions",
    "portfolio",
    "holdings",
  ],

  providers: [
    "alpaca",
    "polygon",
    "finnhub",
    "alpha vantage",
    "iex",
    "yahoo",
    "nasdaq",
  ],

  automation: [
    "continuous",
    "scheduler",
    "interval",
    "setinterval",
    "settimeout",
    "cron",
    "autonomous",
  ],

  registry: [
    "registry",
    "queue",
    "snapshot",
    "cache",
    "candidateRegistry",
  ],

  api: [
    "router.",
    "app.get",
    "app.post",
    "app.put",
    "app.delete",
    "express",
  ],
};


/* ============================================================
 * 03. HELPERS
 * ============================================================
 */

function normalize(
  value,
) {
  return String(
    value ?? "",
  )
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isIncludedFile(
  filePath,
) {
  return INCLUDE_EXTENSIONS.has(
    path.extname(
      filePath,
    ).toLowerCase(),
  );
}

function walkDirectory(
  directory,
  output = [],
) {
  const entries =
    fs.readdirSync(
      directory,
      {
        withFileTypes:
          true,
      },
    );

  for (
    const entry
    of entries
  ) {
    if (
      EXCLUDED_DIRECTORIES.has(
        entry.name,
      )
    ) {
      continue;
    }

    const fullPath =
      path.join(
        directory,
        entry.name,
      );

    if (
      entry.isDirectory()
    ) {
      walkDirectory(
        fullPath,
        output,
      );

      continue;
    }

    if (
      entry.isFile() &&
      isIncludedFile(
        fullPath,
      )
    ) {
      output.push(
        fullPath,
      );
    }
  }

  return output;
}

function relative(
  filePath,
) {
  return path.relative(
    SERVER_ROOT,
    filePath,
  );
}

function safeRead(
  filePath,
) {
  try {
    return fs.readFileSync(
      filePath,
      "utf8",
    );
  } catch {
    return "";
  }
}

function extractExports(
  content,
) {
  const exports =
    new Set();

  const patterns = [
    /export\s+function\s+([A-Za-z0-9_$]+)/g,
    /export\s+async\s+function\s+([A-Za-z0-9_$]+)/g,
    /export\s+const\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
    /export\s+default\s+([A-Za-z0-9_$]+)/g,
  ];

  for (
    const pattern
    of patterns
  ) {
    let match;

    while (
      (
        match =
          pattern.exec(
            content,
          )
      ) !==
      null
    ) {
      exports.add(
        match[1],
      );
    }
  }

  return [
    ...exports,
  ];
}

function extractImports(
  content,
) {
  const imports =
    new Set();

  const pattern =
    /from\s+["']([^"']+)["']/g;

  let match;

  while (
    (
      match =
        pattern.exec(
          content,
        )
    ) !==
    null
  ) {
    imports.add(
      match[1],
    );
  }

  return [
    ...imports,
  ];
}

function extractRoutes(
  content,
) {
  const routes = [];

  const pattern =
    /(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*["'`]([^"'`]+)["'`]/g;

  let match;

  while (
    (
      match =
        pattern.exec(
          content,
        )
    ) !==
    null
  ) {
    routes.push({
      method:
        match[1]
          .toUpperCase(),

      path:
        match[2],
    });
  }

  return routes;
}

function extractEnvVariables(
  content,
) {
  const variables =
    new Set();

  const pattern =
    /process\.env\.([A-Z0-9_]+)/g;

  let match;

  while (
    (
      match =
        pattern.exec(
          content,
        )
    ) !==
    null
  ) {
    variables.add(
      match[1],
    );
  }

  return [
    ...variables,
  ];
}

function detectCapabilities(
  filePath,
  content,
) {
  const searchable =
    normalize(
      `${filePath}\n${content}`,
    );

  const detected = [];

  for (
    const [
      group,
      keywords,
    ]
    of Object.entries(
      CAPABILITY_GROUPS,
    )
  ) {
    const hits =
      keywords.filter(
        keyword =>
          searchable.includes(
            normalize(
              keyword,
            ),
          ),
      );

    if (
      hits.length > 0
    ) {
      detected.push({
        group,
        hits,
      });
    }
  }

  return detected;
}


/* ============================================================
 * 04. FILE INSPECTION
 * ============================================================
 */

function inspectFile(
  filePath,
) {
  const content =
    safeRead(
      filePath,
    );

  return {
    file:
      relative(
        filePath,
      ),

    size:
      content.length,

    exports:
      extractExports(
        content,
      ),

    imports:
      extractImports(
        content,
      ),

    routes:
      extractRoutes(
        content,
      ),

    envVariables:
      extractEnvVariables(
        content,
      ),

    capabilities:
      detectCapabilities(
        filePath,
        content,
      ),
  };
}


/* ============================================================
 * 05. BUILD SYSTEM MAP
 * ============================================================
 */

function buildCapabilityMap(
  files,
) {
  const groups = {};

  for (
    const group
    of Object.keys(
      CAPABILITY_GROUPS,
    )
  ) {
    groups[group] = [];
  }

  for (
    const file
    of files
  ) {
    for (
      const capability
      of file.capabilities
    ) {
      groups[
        capability.group
      ].push({
        file:
          file.file,

        hits:
          capability.hits,

        exports:
          file.exports,
      });
    }
  }

  return groups;
}


/* ============================================================
 * 06. PRINT HELPERS
 * ============================================================
 */

function divider(
  title,
) {
  console.log(
    "\n============================================================",
  );

  console.log(
    title,
  );

  console.log(
    "============================================================\n",
  );
}

function printCapabilityGroup(
  name,
  entries,
) {
  console.log(
    `\n### ${name.toUpperCase()} (${entries.length})`,
  );

  if (
    entries.length ===
    0
  ) {
    console.log(
      "  None detected.",
    );

    return;
  }

  for (
    const entry
    of entries
  ) {
    console.log(
      `  • ${entry.file}`,
    );

    if (
      entry.exports.length >
      0
    ) {
      console.log(
        `      exports: ${entry.exports.join(
          ", ",
        )}`,
      );
    }

    console.log(
      `      signals: ${entry.hits.join(
        ", ",
      )}`,
    );
  }
}


/* ============================================================
 * 07. MAIN AUDIT
 * ============================================================
 */

async function runAudit() {
  divider(
    "AEMA STOCK SYSTEM CAPABILITY AUDIT",
  );

  console.log(
    "Server root:",
    SERVER_ROOT,
  );

  const discoveredFiles =
    walkDirectory(
      SERVER_ROOT,
    );

  console.log(
    "Files inspected:",
    discoveredFiles.length,
  );

  const inspected =
    discoveredFiles.map(
      inspectFile,
    );

  const capabilityMap =
    buildCapabilityMap(
      inspected,
    );


  /* ==========================================================
   * ROUTES
   * ==========================================================
   */

  const routes =
    inspected.flatMap(
      file =>
        file.routes.map(
          route => ({
            file:
              file.file,

            ...route,
          }),
        ),
    );

  divider(
    "API ROUTES",
  );

  if (
    routes.length ===
    0
  ) {
    console.log(
      "No explicit Express routes detected.",
    );
  } else {
    console.table(
      routes,
    );
  }


  /* ==========================================================
   * CAPABILITY GROUPS
   * ==========================================================
   */

  divider(
    "CAPABILITY MAP",
  );

  for (
    const [
      group,
      entries,
    ]
    of Object.entries(
      capabilityMap,
    )
  ) {
    printCapabilityGroup(
      group,
      entries,
    );
  }


  /* ==========================================================
   * ENVIRONMENT INTEGRATIONS
   * ==========================================================
   */

  const envVariables =
    [
      ...new Set(
        inspected.flatMap(
          file =>
            file.envVariables,
        ),
      ),
    ]
      .sort();

  divider(
    "ENVIRONMENT / API INTEGRATIONS",
  );

  console.log(
    envVariables.length >
    0
      ? envVariables.join(
          "\n",
        )
      : "No process.env variables detected.",
  );


  /* ==========================================================
   * IMPORTANT EXPORTED FUNCTIONS
   * ==========================================================
   */

  const exportedFunctions =
    inspected
      .filter(
        file =>
          file.exports.length >
          0,
      )
      .map(
        file => ({
          file:
            file.file,

          exports:
            file.exports.join(
              ", ",
            ),
        }),
      );

  divider(
    "EXPORTED MODULE CAPABILITIES",
  );

  console.table(
    exportedFunctions,
  );


  /* ==========================================================
   * SYSTEM SUMMARY
   * ==========================================================
   */

  const summary =
    Object.fromEntries(
      Object.entries(
        capabilityMap,
      ).map(
        ([
          key,
          value,
        ]) => [
          key,
          value.length,
        ],
      ),
    );

  divider(
    "SUMMARY",
  );

  console.table(
    summary,
  );


  /* ==========================================================
   * WRITE JSON REPORT
   * ==========================================================
   */

  const report = {
    generatedAt:
      new Date()
        .toISOString(),

    serverRoot:
      SERVER_ROOT,

    filesInspected:
      discoveredFiles.length,

    summary,

    routes,

    envVariables,

    capabilities:
      capabilityMap,

    files:
      inspected,
  };

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      report,
      null,
      2,
    ),
  );

  divider(
    "AUDIT COMPLETE",
  );

  console.log(
    "JSON report written to:",
  );

  console.log(
    OUTPUT_FILE,
  );

  console.log(
    "\nSend me either:",
  );

  console.log(
    "1. the terminal output, or",
  );

  console.log(
    "2. scripts/systemCapabilityAudit-report.json",
  );

  console.log(
    "\nand I can reconstruct the full architecture of your stock system.",
  );
}


/* ============================================================
 * 08. RUN
 * ============================================================
 */

await runAudit();