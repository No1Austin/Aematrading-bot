/**
 * AEMA CRYPTO
 * Phase 5.23
 *
 * CONTINUOUS INTELLIGENCE + PAPER EXECUTION INTEGRATION
 */

import createCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoPaperTradingRuntime.js";

import {
  createPaperCryptoExchangeAdapter,
} from "../src/crypto/trading/execution/paperCryptoExchangeAdapter.js";

import createIntegratedCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoIntegratedPaperTradingRuntime.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.23 — INTEGRATED PAPER TRADING RUNTIME\n",
);


function directional({
  name,
  direction,
  long,
  short,
  confidence = 0.95,
  quality = 95,
}) {
  return {
    engine:
      name,

    status:
      "COMPLETE",

    role:
      "DIRECTIONAL",

    horizon:
      "INTRADAY",

    direction,

    directionalScore:
      direction === "LONG"
        ? long
        : direction === "SHORT"
          ? -short
          : 0,

    longSupport:
      long,

    shortSupport:
      short,

    confidence,

    quality,

    reasons: [],

    risks: [],

    evidence: {},

    noExecutionAuthority:
      true,
  };
}


function regime(
  direction = "LONG",
) {
  const bullish =
    direction === "LONG";

  return {
    engine:
      "CRYPTO_TRADING_MARKET_REGIME",

    status:
      "COMPLETE",

    role:
      "CONTEXT",

    regime:
      bullish
        ? "BULL_TREND"
        : "BEAR_TREND",

    direction,

    longCompatibility:
      bullish
        ? 0.95
        : 0.25,

    shortCompatibility:
      bullish
        ? 0.25
        : 0.95,

    exposureMultiplier:
      1,

    volatilityState:
      "NORMAL",

    marketStress:
      false,

    confidence:
      0.95,

    quality:
      95,

    reasons: [],

    risks: [],

    noExecutionAuthority:
      true,
  };
}


function dependency(
  direction = "LONG",
) {
  const bullish =
    direction === "LONG";

  return {
    engine:
      "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

    status:
      "COMPLETE",

    role:
      "CONTEXT",

    direction,

    longCompatibility:
      bullish
        ? 0.95
        : 0.3,

    shortCompatibility:
      bullish
        ? 0.3
        : 0.95,

    overallDependency:
      0.8,

    dependencyClass:
      "HIGH_DEPENDENCY",

    aligned:
      true,

    conflict:
      false,

    confidence:
      0.95,

    quality:
      95,

    reasons: [],

    risks: [],

    noExecutionAuthority:
      true,
  };
}


function directionalPack(
  direction,
) {
  const long =
    direction === "LONG"
      ? 90
      : 7;

  const short =
    direction === "SHORT"
      ? 92
      : 8;

  return {
    technical:
      directional({
        name:
          "CRYPTO_TRADING_TECHNICAL",
        direction,
        long,
        short,
      }),

    momentum:
      directional({
        name:
          "CRYPTO_TRADING_MOMENTUM",
        direction,
        long:
          direction ===
            "LONG"
            ? 92
            : 5,
        short:
          direction ===
            "SHORT"
            ? 94
            : 5,
      }),

    marketStructure:
      directional({
        name:
          "CRYPTO_TRADING_MARKET_STRUCTURE",
        direction,
        long:
          direction ===
            "LONG"
            ? 88
            : 10,
        short:
          direction ===
            "SHORT"
            ? 89
            : 10,
      }),

    derivatives:
      directional({
        name:
          "CRYPTO_TRADING_DERIVATIVES",
        direction,
        long:
          direction ===
            "LONG"
            ? 84
            : 14,
        short:
          direction ===
            "SHORT"
            ? 86
            : 14,
      }),

    onChainFlow:
      directional({
        name:
          "CRYPTO_TRADING_ON_CHAIN_FLOW",
        direction,
        long:
          direction ===
            "LONG"
            ? 86
            : 11,
        short:
          direction ===
            "SHORT"
            ? 88
            : 11,
      }),

    marketRegime:
      regime(
        direction,
      ),

    btcEthDependency:
      dependency(
        direction,
      ),
  };
}


function mixedPack() {
  return {
    technical:
      directional({
        name:
          "CRYPTO_TRADING_TECHNICAL",
        direction:
          "LONG",
        long: 55,
        short: 45,
        confidence: 0.5,
        quality: 60,
      }),

    momentum:
      directional({
        name:
          "CRYPTO_TRADING_MOMENTUM",
        direction:
          "SHORT",
        long: 45,
        short: 55,
        confidence: 0.5,
        quality: 60,
      }),

    marketStructure:
      directional({
        name:
          "CRYPTO_TRADING_MARKET_STRUCTURE",
        direction:
          "LONG",
        long: 52,
        short: 48,
        confidence: 0.45,
        quality: 55,
      }),

    derivatives:
      directional({
        name:
          "CRYPTO_TRADING_DERIVATIVES",
        direction:
          "SHORT",
        long: 48,
        short: 52,
        confidence: 0.45,
        quality: 55,
      }),

    onChainFlow:
      directional({
        name:
          "CRYPTO_TRADING_ON_CHAIN_FLOW",
        direction:
          "NEUTRAL",
        long: 50,
        short: 50,
        confidence: 0.4,
        quality: 50,
      }),

    marketRegime: {
      ...regime(
        "LONG",
      ),

      regime:
        "CHOPPY",

      direction:
        "NEUTRAL",

      longCompatibility:
        0.55,

      shortCompatibility:
        0.55,
    },

    btcEthDependency: {
      ...dependency(
        "LONG",
      ),

      direction:
        "NEUTRAL",

      longCompatibility:
        0.6,

      shortCompatibility:
        0.6,
    },
  };
}


function candidate(
  symbol,
) {
  return {
    symbol,

    candidateType:
      "CEX",

    measurements: {
      priceUsd:
        100,

      change1hPercent:
        2,

      change4hPercent:
        4,

      change24hPercent:
        8,

      change7dPercent:
        12,

      high24h:
        105,

      low24h:
        95,

      intradayRangePercent:
        10,

      atr:
        1.2,

      atrPercent:
        1.2,
    },
  };
}


const exchangeRules = {
  tradeable:
    true,

  minQty:
    0.001,

  qtyStep:
    0.001,

  minNotional:
    5,

  tickSize:
    0.1,

  maximumLeverage:
    10,

  supportedOrderTypes: [
    "MARKET",
    "LIMIT",
    "STOP_MARKET",
  ],
};


const statefulRuntime =
  createCryptoPaperTradingRuntime();


const adapter =
  createPaperCryptoExchangeAdapter({
    defaultPrice:
      100,
  });


let currentOverrides =
  directionalPack(
    "LONG",
  );


const runtime =
  createIntegratedCryptoPaperTradingRuntime({
    statefulRuntime,

    adapter,

    account: {
      equity:
        10_000,

      requestedLeverage:
        3,
    },

    exchangeRules,

    portfolioContextProvider:
      async () => ({
        positions: [],
      }),

    executionContextProvider:
      async () => ({
        executable:
          true,

        liquidityScore:
          95,

        marketDepthScore:
          95,

        spreadPercent:
          0.03,

        slippagePercent:
          0.03,

        venueCount:
          5,
      }),

    entryRiskContextProvider:
      async () => ({
        riskRewardRatio:
          3,

        stopDistancePercent:
          1.2,

        liquidationBufferPercent:
          25,

        volatilityScore:
          35,

        volatilityState:
          "NORMAL",
      }),

    riskContextProvider:
      async ({
        market,
      }) => ({
        accountEquity:
          10_000,

        entryPrice:
          market?.price ??
          100,

        atr:
          1.2,

        atrPercent:
          1.2,

        requestedLeverage:
          3,

        volatilityScore:
          market
            ?.volatilityScore ??
          35,
      }),

    engineOverridesProvider:
      async () =>
        currentOverrides,
  });


const scenarios = {};


/**
 * ============================================================
 * 1. FLAT + STRONG LONG
 * ============================================================
 */

currentOverrides =
  directionalPack(
    "LONG",
  );

scenarios.OPEN_LONG =
  await runtime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      candidate:
        candidate(
          "BTCUSDT",
        ),

      market: {
        price:
          100,

        timestamp:
          Date.now(),

        volatilityScore:
          35,
      },

      cycleKey:
        "P523-BTC-OPEN",
    });


/**
 * ============================================================
 * 2. HOLD / HEALTHY MANAGEMENT
 * ============================================================
 */

currentOverrides =
  directionalPack(
    "LONG",
  );

scenarios.MANAGE_LONG =
  await runtime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      candidate:
        candidate(
          "BTCUSDT",
        ),

      market: {
        price:
          100.5,

        timestamp:
          Date.now(),

        volatilityScore:
          35,
      },

      cycleKey:
        "P523-BTC-MANAGE",
    });


/**
 * ============================================================
 * 3. REVERSAL
 * ============================================================
 */

currentOverrides =
  directionalPack(
    "SHORT",
  );

scenarios.REVERSAL =
  await runtime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      candidate:
        candidate(
          "BTCUSDT",
        ),

      market: {
        price:
          97,

        timestamp:
          Date.now(),

        volatilityScore:
          75,
      },

      cycleKey:
        "P523-BTC-REVERSAL",
    });


/**
 * ============================================================
 * 4. AFTER FLAT — SHORT MAY OPEN
 * ============================================================
 */

currentOverrides =
  directionalPack(
    "SHORT",
  );

scenarios.OPEN_SHORT =
  await runtime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      candidate:
        candidate(
          "BTCUSDT",
        ),

      market: {
        price:
          97,

        timestamp:
          Date.now(),

        volatilityScore:
          35,
      },

      cycleKey:
        "P523-BTC-SHORT",
    });


/**
 * ============================================================
 * 5. MIXED FLAT SYMBOL
 * ============================================================
 */

currentOverrides =
  mixedPack();

scenarios.MIXED =
  await runtime
    .processMarketSnapshot({
      symbol:
        "ETHUSDT",

      candidate:
        candidate(
          "ETHUSDT",
        ),

      market: {
        price:
          100,

        timestamp:
          Date.now(),

        volatilityScore:
          40,
      },

      cycleKey:
        "P523-ETH-MIXED",
    });


/**
 * ============================================================
 * 6. PARTIAL FILL
 * ============================================================
 */

currentOverrides =
  directionalPack(
    "LONG",
  );

scenarios.PARTIAL =
  await runtime
    .processMarketSnapshot({
      symbol:
        "SOLUSDT",

      candidate:
        candidate(
          "SOLUSDT",
        ),

      market: {
        price:
          100,

        timestamp:
          Date.now(),

        volatilityScore:
          35,
      },

      cycleKey:
        "P523-SOL-PARTIAL",

      paperOverrides: {
        fillRatio:
          0.4,
      },
    });


/**
 * ============================================================
 * 7. DUPLICATE PARTIAL CYCLE
 * ============================================================
 */

scenarios.DUPLICATE =
  await runtime
    .processMarketSnapshot({
      symbol:
        "SOLUSDT",

      candidate:
        candidate(
          "SOLUSDT",
        ),

      market: {
        price:
          101,

        timestamp:
          Date.now(),

        volatilityScore:
          35,
      },

      cycleKey:
        "P523-SOL-PARTIAL",
    });


/**
 * ============================================================
 * OUTPUT
 * ============================================================
 */

function row(
  scenario,
  result,
) {
  return {
    scenario,

    status:
      result?.status ??
      "N/A",

    intelligence:
      result
        ?.intelligence
        ?.mode ??
      "N/A",

    decision:
      result
        ?.intelligence
        ?.decision
        ?.preferredDirection ??
      "N/A",

    entry:
      result
        ?.intelligence
        ?.entryGate
        ?.state ??
      "N/A",

    lifecycle:
      result
        ?.lifecycle
        ?.action ??
      "N/A",

    command:
      result
        ?.paperCycle
        ?.command
        ?.command ??
      "N/A",

    execution:
      result
        ?.paperCycle
        ?.executionState
        ?.status ??
      result
        ?.paperCycle
        ?.paperResult
        ?.status ??
      "N/A",

    direction:
      result
        ?.exchangePosition
        ?.direction ??
      result
        ?.resultingState
        ?.position
        ?.direction ??
      "N/A",

    quantity:
      result
        ?.exchangePosition
        ?.quantity ??
      result
        ?.resultingState
        ?.position
        ?.quantity ??
      0,

    live:
      result
        ?.liveExecution ??
      false,
  };
}


console.table(
  Object.entries(
    scenarios,
  ).map(
    ([
      name,
      value,
    ]) =>
      row(
        name,
        value,
      ),
  ),
);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const btcAfterOpen =
  scenarios
    .OPEN_LONG
    ?.exchangePosition;


const btcAfterReversal =
  scenarios
    .REVERSAL
    ?.exchangePosition;


const btcAfterShort =
  scenarios
    .OPEN_SHORT
    ?.exchangePosition;


const solState =
  statefulRuntime
    .getSymbolState(
      "SOLUSDT",
    );


const invariants = {
  flatApprovedLongBecomesOpenPosition:
    scenarios
      .OPEN_LONG
      ?.lifecycle
      ?.action ===
      "OPEN_POSITION",

  longActuallyOpened:
    btcAfterOpen
      ?.direction ===
      "LONG" &&
    Number(
      btcAfterOpen
        ?.quantity,
    ) > 0,

  entryEnginesStored:
    Boolean(
      statefulRuntime
        .getSymbolState(
          "BTCUSDT",
        )
        ?.lastDecision,
    ),

  existingPositionUsesManagement:
    scenarios
      .MANAGE_LONG
      ?.intelligence
      ?.mode ===
      "POSITION_MANAGEMENT",

  existingPositionNotFreshEntry:
    scenarios
      .MANAGE_LONG
      ?.intelligence
      ?.entryGate ===
      null,

  reversalDetected:
    [
      "REDUCE_EXPOSURE",
      "EXIT_POSITION",
      "EMERGENCY_EXIT",
    ].includes(
      scenarios
        .REVERSAL
        ?.lifecycle
        ?.action,
    ),

  reversalDoesNotDirectlyFlip:
    !(
      btcAfterReversal
        ?.direction ===
        "SHORT"
    ),

  flatReachedBeforeOppositeEntry:
    btcAfterReversal
      ?.direction ===
      "FLAT",

  oppositeDirectionCanOpenAfterFlat:
    btcAfterShort
      ?.direction ===
      "SHORT" &&
    Number(
      btcAfterShort
        ?.quantity,
    ) > 0,

  mixedSignalDoesNotOpen:
    scenarios
      .MIXED
      ?.paperCycle ===
      null,

  partialFillPreserved:
    scenarios
      .PARTIAL
      ?.paperCycle
      ?.executionState
      ?.status ===
      "PARTIALLY_FILLED",

  partialQuantityIsTruthful:
    Number(
      scenarios
        .PARTIAL
        ?.exchangePosition
        ?.quantity,
    ) > 0 &&
    Number(
      scenarios
        .PARTIAL
        ?.exchangePosition
        ?.quantity,
    ) <
    Number(
      scenarios
        .PARTIAL
        ?.paperCycle
        ?.executionState
        ?.requestedQuantity,
    ),

  partialRuntimePositionPreserved:
    Number(
      solState
        ?.position
        ?.quantity,
    ) > 0,

  duplicateCycleBlocked:
    scenarios
      .DUPLICATE
      ?.approved ===
      false &&
    scenarios
      .DUPLICATE
      ?.blocker ===
      "DUPLICATE_CYCLE",

  runtimeNeverGetsExecutionAuthority:
    Object.values(
      scenarios,
    ).every(
      result =>
        result
          ?.executionAuthority ===
        false,
    ),

  liveExecutionAlwaysDisabled:
    Object.values(
      scenarios,
    ).every(
      result =>
        result
          ?.liveExecution ===
        false,
    ),

  paperAdapterStillPaperOnly:
    adapter
      ?.paperExecution ===
      true &&
    adapter
      ?.liveExecution ===
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
    "\nPHASE 5.23 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.23 PASSED — integrated continuous paper trading behavior is valid.",
  );
}