/**
 * AEMA CRYPTO
 * Phase 5.22 Diagnostic
 *
 * TRADING INTELLIGENCE RUNTIME INTEGRATION
 */

import {
  runCryptoTradingIntelligencePipeline,
} from "../src/crypto/trading/orchestration/cryptoTradingIntelligencePipeline.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.22 — TRADING INTELLIGENCE RUNTIME INTEGRATION\n",
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


function regime({
  long = 0.95,
  short = 0.25,
  regimeName =
    "BULL_TREND",
} = {}) {
  return {
    engine:
      "CRYPTO_TRADING_MARKET_REGIME",

    status:
      "COMPLETE",

    role:
      "CONTEXT",

    regime:
      regimeName,

    direction:
      long > short
        ? "LONG"
        : short > long
          ? "SHORT"
          : "NEUTRAL",

    longCompatibility:
      long,

    shortCompatibility:
      short,

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


function dependency({
  long = 0.95,
  short = 0.25,
} = {}) {
  return {
    engine:
      "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

    status:
      "COMPLETE",

    role:
      "CONTEXT",

    direction:
      long > short
        ? "LONG"
        : short > long
          ? "SHORT"
          : "NEUTRAL",

    longCompatibility:
      long,

    shortCompatibility:
      short,

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


function longEngines() {
  return {
    technical:
      directional({
        name:
          "CRYPTO_TRADING_TECHNICAL",
        direction:
          "LONG",
        long: 90,
        short: 8,
      }),

    momentum:
      directional({
        name:
          "CRYPTO_TRADING_MOMENTUM",
        direction:
          "LONG",
        long: 92,
        short: 5,
      }),

    marketStructure:
      directional({
        name:
          "CRYPTO_TRADING_MARKET_STRUCTURE",
        direction:
          "LONG",
        long: 87,
        short: 10,
      }),

    derivatives:
      directional({
        name:
          "CRYPTO_TRADING_DERIVATIVES",
        direction:
          "LONG",
        long: 82,
        short: 15,
      }),

    onChainFlow:
      directional({
        name:
          "CRYPTO_TRADING_ON_CHAIN_FLOW",
        direction:
          "LONG",
        long: 85,
        short: 12,
      }),

    marketRegime:
      regime({
        long:
          0.95,
        short:
          0.25,
      }),

    btcEthDependency:
      dependency({
        long:
          0.95,
        short:
          0.3,
      }),
  };
}


function shortEngines() {
  return {
    technical:
      directional({
        name:
          "CRYPTO_TRADING_TECHNICAL",
        direction:
          "SHORT",
        long: 7,
        short: 92,
      }),

    momentum:
      directional({
        name:
          "CRYPTO_TRADING_MOMENTUM",
        direction:
          "SHORT",
        long: 5,
        short: 94,
      }),

    marketStructure:
      directional({
        name:
          "CRYPTO_TRADING_MARKET_STRUCTURE",
        direction:
          "SHORT",
        long: 10,
        short: 88,
      }),

    derivatives:
      directional({
        name:
          "CRYPTO_TRADING_DERIVATIVES",
        direction:
          "SHORT",
        long: 15,
        short: 84,
      }),

    onChainFlow:
      directional({
        name:
          "CRYPTO_TRADING_ON_CHAIN_FLOW",
        direction:
          "SHORT",
        long: 11,
        short: 86,
      }),

    marketRegime:
      regime({
        long:
          0.25,
        short:
          0.95,
        regimeName:
          "BEAR_TREND",
      }),

    btcEthDependency:
      dependency({
        long:
          0.3,
        short:
          0.95,
      }),
  };
}


function mixedEngines() {
  return {
    technical:
      directional({
        name:
          "CRYPTO_TRADING_TECHNICAL",
        direction:
          "LONG",
        long: 58,
        short: 42,
        confidence:
          0.55,
        quality:
          65,
      }),

    momentum:
      directional({
        name:
          "CRYPTO_TRADING_MOMENTUM",
        direction:
          "SHORT",
        long: 42,
        short: 58,
        confidence:
          0.55,
        quality:
          65,
      }),

    marketStructure:
      directional({
        name:
          "CRYPTO_TRADING_MARKET_STRUCTURE",
        direction:
          "LONG",
        long: 54,
        short: 46,
        confidence:
          0.5,
        quality:
          60,
      }),

    derivatives:
      directional({
        name:
          "CRYPTO_TRADING_DERIVATIVES",
        direction:
          "SHORT",
        long: 46,
        short: 54,
        confidence:
          0.5,
        quality:
          60,
      }),

    onChainFlow:
      directional({
        name:
          "CRYPTO_TRADING_ON_CHAIN_FLOW",
        direction:
          "NEUTRAL",
        long: 50,
        short: 50,
        confidence:
          0.4,
        quality:
          55,
      }),

    marketRegime:
      regime({
        long:
          0.55,
        short:
          0.55,
        regimeName:
          "CHOPPY",
      }),

    btcEthDependency:
      dependency({
        long:
          0.6,
        short:
          0.6,
      }),
  };
}


const candidate = {
  symbol:
    "BTC",

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


const common = {
  candidate,

  market: {
    price:
      100,

    markPrice:
      100,

    volatilityScore:
      35,
  },

  account: {
    equity:
      10_000,

    requestedLeverage:
      3,
  },

  executionContext: {
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
  },

  entryRiskContext: {
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
  },

  riskContext: {
    accountEquity:
      10_000,

    entryPrice:
      100,

    atr:
      1.2,

    atrPercent:
      1.2,

    requestedLeverage:
      3,

    volatilityScore:
      35,
  },
};


const scenarios = {};


/**
 * ============================================================
 * 1. STRONG LONG — FLAT
 * ============================================================
 */

scenarios.STRONG_LONG =
  await runCryptoTradingIntelligencePipeline({
    ...common,

    engineOverrides:
      longEngines(),
  });


/**
 * ============================================================
 * 2. STRONG SHORT — FLAT
 * ============================================================
 */

scenarios.STRONG_SHORT =
  await runCryptoTradingIntelligencePipeline({
    ...common,

    engineOverrides:
      shortEngines(),
  });


/**
 * ============================================================
 * 3. MIXED / WEAK — FLAT
 * ============================================================
 */

scenarios.MIXED =
  await runCryptoTradingIntelligencePipeline({
    ...common,

    engineOverrides:
      mixedEngines(),
  });


/**
 * ============================================================
 * 4. OPEN LONG — HEALTHY
 * ============================================================
 */

scenarios.OPEN_LONG_HEALTHY =
  await runCryptoTradingIntelligencePipeline({
    ...common,

    position: {
      symbol:
        "BTCUSDT",

      state:
        "OPEN",

      direction:
        "LONG",

      quantity:
        10,

      exposure:
        1,

      entryPrice:
        100,

      currentPrice:
        102,

      currentStopPrice:
        98,

      unrealizedR:
        1,

      maximumFavorableExcursionR:
        1.2,

      maximumAdverseExcursionR:
        0.2,
    },

    entryEngines:
      longEngines(),

    existingRiskPlan: {
      approved:
        true,

      status:
        "RISK_PLAN_READY",

      direction:
        "LONG",

      entryPrice:
        100,

      leverage: {
        recommended:
          3,
      },

      stop: {
        initialStopPrice:
          98,

        currentStopPrice:
          98,
      },
    },

    market: {
      price:
        102,

      volatilityScore:
        35,
    },

    engineOverrides:
      longEngines(),
  });


/**
 * ============================================================
 * 5. OPEN LONG — FULL REVERSAL
 * ============================================================
 */

scenarios.OPEN_LONG_REVERSAL =
  await runCryptoTradingIntelligencePipeline({
    ...common,

    position: {
      symbol:
        "BTCUSDT",

      state:
        "OPEN",

      direction:
        "LONG",

      quantity:
        10,

      exposure:
        1,

      entryPrice:
        100,

      currentPrice:
        97,

      currentStopPrice:
        98,

      unrealizedR:
        -1.5,

      maximumFavorableExcursionR:
        0.4,

      maximumAdverseExcursionR:
        1.5,
    },

    entryEngines:
      longEngines(),

    existingRiskPlan: {
      approved:
        true,

      status:
        "RISK_PLAN_READY",

      direction:
        "LONG",

      entryPrice:
        100,

      leverage: {
        recommended:
          3,
      },

      stop: {
        initialStopPrice:
          98,

        currentStopPrice:
          98,
      },
    },

    market: {
      price:
        97,

      volatilityScore:
        70,
    },

    engineOverrides:
      shortEngines(),
  });


/**
 * ============================================================
 * 6. ENGINE FAILURE ISOLATION
 * ============================================================
 */

const failureOverrides =
  longEngines();

failureOverrides.onChainFlow =
  async () => {
    throw new Error(
      "SIMULATED_ON_CHAIN_FAILURE",
    );
  };

scenarios.ENGINE_FAILURE =
  await runCryptoTradingIntelligencePipeline({
    ...common,

    engineOverrides:
      failureOverrides,
  });


/**
 * ============================================================
 * OUTPUT
 * ============================================================
 */

const rows =
  Object.entries(
    scenarios,
  ).map(
    ([
      scenario,
      result,
    ]) => ({
      scenario,

      mode:
        result.mode,

      direction:
        result
          ?.decision
          ?.preferredDirection ??
        "N/A",

      long:
        result
          ?.decision
          ?.scores
          ?.long ??
        result
          ?.decision
          ?.scores
          ?.longScore ??
        "N/A",

      short:
        result
          ?.decision
          ?.scores
          ?.short ??
        result
          ?.decision
          ?.scores
          ?.shortScore ??
        "N/A",

      entry:
        result
          ?.entryGate
          ?.state ??
        "N/A",

      monitor:
        result
          ?.liveMonitor
          ?.action ??
        "N/A",

      lifecycle:
        result
          ?.lifecycle
          ?.action ??
        "N/A",

      action:
        result.action,

      engineErrors:
        result
          ?.engineErrors
          ?.length ??
        0,

      live:
        result.liveExecution,
    }),
  );


console.table(
  rows,
);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const longDirection =
  scenarios
    .STRONG_LONG
    ?.decision
    ?.preferredDirection;


const shortDirection =
  scenarios
    .STRONG_SHORT
    ?.decision
    ?.preferredDirection;


const mixedAction =
  scenarios
    .MIXED
    ?.action;


const reversalAction =
  scenarios
    .OPEN_LONG_REVERSAL
    ?.action;


const invariants = {
  flatLongUsesEntryPath:
    scenarios
      .STRONG_LONG
      ?.mode ===
      "ENTRY_EVALUATION",

  flatShortUsesEntryPath:
    scenarios
      .STRONG_SHORT
      ?.mode ===
      "ENTRY_EVALUATION",

  strongLongDirectionPreserved:
    longDirection ===
      "LONG",

  strongShortDirectionPreserved:
    shortDirection ===
      "SHORT",

  entryGateRunsForFlatLong:
    Boolean(
      scenarios
        .STRONG_LONG
        ?.entryGate,
    ),

  entryGateRunsForFlatShort:
    Boolean(
      scenarios
        .STRONG_SHORT
        ?.entryGate,
    ),

  futuresRiskRunsForEntry:
    Boolean(
      scenarios
        .STRONG_LONG
        ?.riskPlan,
    ),

  mixedSignalDoesNotCreateStrongTrade:
    (
      scenarios
        .MIXED
        ?.entryGate
        ?.approved ===
        false
    ) ||
    ![
      "OPEN_POSITION",
      "ADD_EXPOSURE",
    ].includes(
      mixedAction,
    ),

  openPositionUsesManagementPath:
    scenarios
      .OPEN_LONG_HEALTHY
      ?.mode ===
      "POSITION_MANAGEMENT",

  openPositionDoesNotUseFreshEntryGate:
    scenarios
      .OPEN_LONG_HEALTHY
      ?.entryGate ===
      null,

  liveMonitorRuns:
    Boolean(
      scenarios
        .OPEN_LONG_HEALTHY
        ?.liveMonitor,
    ),

  dynamicStopRuns:
    Boolean(
      scenarios
        .OPEN_LONG_HEALTHY
        ?.stopPlan,
    ),

  lifecycleRunsForOpenPosition:
    Boolean(
      scenarios
        .OPEN_LONG_HEALTHY
        ?.lifecycle,
    ),

  reversalRecognized:
    [
      "REDUCE_EXPOSURE",
      "EXIT_POSITION",
      "EMERGENCY_EXIT",
      "PROTECT_POSITION",
    ].includes(
      reversalAction,
    ) ||
    [
      "REDUCE_EXPOSURE",
      "EXIT",
      "EMERGENCY_EXIT",
    ].includes(
      scenarios
        .OPEN_LONG_REVERSAL
        ?.liveMonitor
        ?.action,
    ),

  engineFailureIsolated:
    scenarios
      .ENGINE_FAILURE
      ?.engineErrors
      ?.length ===
      1,

  pipelineSurvivesSingleEngineFailure:
    Boolean(
      scenarios
        .ENGINE_FAILURE
        ?.decision,
    ),

  allExecutionAuthorityDisabled:
    Object.values(
      scenarios,
    ).every(
      result =>
        result
          ?.executionAuthority ===
        false,
    ),

  allLiveExecutionDisabled:
    Object.values(
      scenarios,
    ).every(
      result =>
        result
          ?.liveExecution ===
        false,
    ),
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
    "\nPHASE 5.22 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.22 PASSED — crypto trading intelligence integration behavior is valid.",
  );
}