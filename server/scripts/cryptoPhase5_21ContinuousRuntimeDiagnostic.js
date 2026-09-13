import createCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoPaperTradingRuntime.js";

import createContinuousCryptoPaperRuntime
  from "../src/crypto/trading/runtime/cryptoContinuousPaperRuntime.js";

console.log(
  "\nAEMA CRYPTO PHASE 5.21 — CONTINUOUS PAPER RUNTIME\n",
);

const statefulRuntime =
  createCryptoPaperTradingRuntime();

/**
 * Seed one OPEN position.
 */

statefulRuntime
  .adoptExchangePosition({
    symbol:
      "BTCUSDT",

    exchangePosition: {
      direction:
        "LONG",

      quantity:
        2,

      exposure:
        1,

      averageEntryPrice:
        100,
    },
  });

/**
 * Seed one FLAT symbol.
 */

statefulRuntime
  .adoptExchangePosition({
    symbol:
      "ETHUSDT",

    exchangePosition: {
      direction:
        "FLAT",

      quantity:
        0,

      exposure:
        0,
    },
  });

let entryCalls = 0;
let managementCalls = 0;
let reconciliationCalls = 0;
let persistenceCalls = 0;

const marketTimes =
  new Map([
    [
      "BTCUSDT",
      Date.now(),
    ],
    [
      "ETHUSDT",
      Date.now(),
    ],
    [
      "STALEUSDT",
      Date.now() -
        120_000,
    ],
    [
      "ERRORUSDT",
      Date.now(),
    ],
  ]);

const runtime =
  createContinuousCryptoPaperRuntime({
    statefulRuntime,

    maxMarketDataAgeMs:
      30_000,

    exitCooldownMs:
      60_000,

    failureCooldownMs:
      30_000,

    marketDataProvider:
      async (
        symbol,
      ) => ({
        symbol,

        price:
          100,

        timestamp:
          marketTimes.get(
            symbol,
          ) ??
          Date.now(),
      }),

    flatSymbolHandler:
      async ({
        symbol,
      }) => {
        entryCalls += 1;

        if (
          symbol ===
          "ERRORUSDT"
        ) {
          throw new Error(
            "SIMULATED_SYMBOL_FAILURE",
          );
        }

        return {
          status:
            "NO_TRADE",

          action:
            "WAIT",
        };
      },

    openPositionHandler:
      async ({
        symbol,
      }) => {
        managementCalls +=
          1;

        return {
          status:
            "POSITION_MANAGED",

          action:
            "HOLD",

          symbol,
        };
      },

    reconciliationHandler:
      async () => {
        reconciliationCalls +=
          1;

        return {
          action:
            "IN_SYNC",
        };
      },

    persistenceHandler:
      async () => {
        persistenceCalls +=
          1;
      },
  });

const start =
  runtime.start();

const scenarios = {};

/**
 * ============================================================
 * OPEN POSITION IS MANAGED
 * ============================================================
 */

scenarios.OPEN_POSITION =
  await runtime.processSymbol(
    "BTCUSDT",
  );

/**
 * ============================================================
 * FLAT SYMBOL IS ENTRY-EVALUATED
 * ============================================================
 */

scenarios.FLAT_SYMBOL =
  await runtime.processSymbol(
    "ETHUSDT",
  );

/**
 * ============================================================
 * STALE DATA BLOCKED
 * ============================================================
 */

scenarios.STALE_DATA =
  await runtime.processSymbol(
    "STALEUSDT",
  );

/**
 * ============================================================
 * SYMBOL ERROR ISOLATED
 * ============================================================
 */

scenarios.SYMBOL_ERROR =
  await runtime.processSymbol(
    "ERRORUSDT",
  );

/**
 * ============================================================
 * ERROR COOLDOWN
 * ============================================================
 */

scenarios.ERROR_COOLDOWN =
  await runtime.processSymbol(
    "ERRORUSDT",
  );

/**
 * ============================================================
 * MANUAL COOLDOWN
 * ============================================================
 */

runtime.setCooldown(
  "ETHUSDT",
  "TEST_COOLDOWN",
  60_000,
);

scenarios.COOLDOWN =
  await runtime.processSymbol(
    "ETHUSDT",
  );

runtime.clearCooldown(
  "ETHUSDT",
);

/**
 * ============================================================
 * UNIVERSE CONTINUES AFTER FAILURE
 * ============================================================
 */

const universe =
  await runtime.processUniverse([
    "BTCUSDT",
    "ETHUSDT",
    "STALEUSDT",
  ]);

const healthBeforeShutdown =
  runtime.getHealth();

const shutdown =
  await runtime.shutdown();

const healthAfterShutdown =
  runtime.getHealth();

const rows = [
  {
    scenario:
      "OPEN_POSITION",

    status:
      scenarios
        .OPEN_POSITION
        ?.status,

    mode:
      scenarios
        .OPEN_POSITION
        ?.mode,
  },

  {
    scenario:
      "FLAT_SYMBOL",

    status:
      scenarios
        .FLAT_SYMBOL
        ?.status,

    mode:
      scenarios
        .FLAT_SYMBOL
        ?.mode,
  },

  {
    scenario:
      "STALE_DATA",

    status:
      scenarios
        .STALE_DATA
        ?.status,

    mode:
      "BLOCKED",
  },

  {
    scenario:
      "SYMBOL_ERROR",

    status:
      scenarios
        .SYMBOL_ERROR
        ?.status,

    mode:
      "ISOLATED",
  },

  {
    scenario:
      "ERROR_COOLDOWN",

    status:
      scenarios
        .ERROR_COOLDOWN
        ?.status,

    mode:
      "BLOCKED",
  },

  {
    scenario:
      "COOLDOWN",

    status:
      scenarios
        .COOLDOWN
        ?.status,

    mode:
      "BLOCKED",
  },
];

console.table(rows);

const invariants = {
  runtimeStartsInPaperMode:
    start.mode ===
      "PAPER" &&
    start.liveExecution ===
      false,

  openPositionManagedNotReentered:
    scenarios
      .OPEN_POSITION
      ?.mode ===
      "POSITION_MANAGEMENT",

  flatSymbolUsesEntryEvaluation:
    scenarios
      .FLAT_SYMBOL
      ?.mode ===
      "ENTRY_EVALUATION",

  staleMarketDataBlocked:
    scenarios
      .STALE_DATA
      ?.status ===
      "STALE_MARKET_DATA",

  symbolFailureIsolated:
    scenarios
      .SYMBOL_ERROR
      ?.status ===
      "SYMBOL_CYCLE_FAILED",

  failureCreatesCooldown:
    scenarios
      .ERROR_COOLDOWN
      ?.status ===
      "COOLDOWN_ACTIVE",

  explicitCooldownWorks:
    scenarios
      .COOLDOWN
      ?.status ===
      "COOLDOWN_ACTIVE",

  universeContinuesAcrossSymbols:
    universe.length ===
      3,

  openPositionHandlerUsed:
    managementCalls >= 1,

  entryHandlerUsed:
    entryCalls >= 1,

  reconciliationRuns:
    reconciliationCalls >= 1,

  persistenceRuns:
    persistenceCalls >= 1,

  staleDataTracked:
    healthBeforeShutdown
      .staleDataBlocks >=
      1,

  errorsTracked:
    healthBeforeShutdown
      .symbolErrors >=
      1,

  heartbeatAvailable:
    Boolean(
      healthBeforeShutdown
        .lastHeartbeatAt,
    ),

  gracefulShutdownWorks:
    shutdown.stopped ===
      true &&
    healthAfterShutdown
      .status ===
      "STOPPED",

  noActiveSymbolsAfterShutdown:
    healthAfterShutdown
      .activeSymbols
      .length ===
      0,

  liveExecutionDisabled:
    healthAfterShutdown
      .liveExecution ===
      false,

  noExecutionAuthority:
    healthAfterShutdown
      .executionAuthority ===
      false,
};

console.log(
  "\nINVARIANTS",
);

console.log(
  invariants,
);

const passed =
  Object.values(
    invariants,
  ).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.21 FAILED — one or more invariants failed.",
  );

  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.21 PASSED — continuous paper runtime behavior is valid.",
  );
}