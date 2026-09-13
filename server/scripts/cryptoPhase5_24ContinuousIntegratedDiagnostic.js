/**
 * AEMA CRYPTO
 * Phase 5.24
 *
 * CONTINUOUS INTEGRATED PAPER LOOP
 */

import createCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoPaperTradingRuntime.js";

import {
  createPaperCryptoExchangeAdapter,
} from "../src/crypto/trading/execution/paperCryptoExchangeAdapter.js";

import createIntegratedCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoIntegratedPaperTradingRuntime.js";

import createContinuousIntegratedPaperLoop
  from "../src/crypto/trading/runtime/cryptoContinuousIntegratedPaperLoop.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.24 — CONTINUOUS INTEGRATED PAPER LOOP\n",
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


function pack(
  direction,
) {
  const isLong =
    direction === "LONG";

  return {
    technical:
      directional({
        name:
          "CRYPTO_TRADING_TECHNICAL",

        direction,

        long:
          isLong
            ? 92
            : 6,

        short:
          isLong
            ? 7
            : 93,
      }),

    momentum:
      directional({
        name:
          "CRYPTO_TRADING_MOMENTUM",

        direction,

        long:
          isLong
            ? 94
            : 5,

        short:
          isLong
            ? 5
            : 95,
      }),

    marketStructure:
      directional({
        name:
          "CRYPTO_TRADING_MARKET_STRUCTURE",

        direction,

        long:
          isLong
            ? 89
            : 9,

        short:
          isLong
            ? 10
            : 90,
      }),

    derivatives:
      directional({
        name:
          "CRYPTO_TRADING_DERIVATIVES",

        direction,

        long:
          isLong
            ? 86
            : 12,

        short:
          isLong
            ? 12
            : 87,
      }),

    onChainFlow:
      directional({
        name:
          "CRYPTO_TRADING_ON_CHAIN_FLOW",

        direction,

        long:
          isLong
            ? 88
            : 10,

        short:
          isLong
            ? 10
            : 89,
      }),

    marketRegime: {
      engine:
        "CRYPTO_TRADING_MARKET_REGIME",

      status:
        "COMPLETE",

      role:
        "CONTEXT",

      direction,

      regime:
        isLong
          ? "BULL_TREND"
          : "BEAR_TREND",

      longCompatibility:
        isLong
          ? 0.95
          : 0.25,

      shortCompatibility:
        isLong
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

      noExecutionAuthority:
        true,
    },

    btcEthDependency: {
      engine:
        "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

      status:
        "COMPLETE",

      role:
        "CONTEXT",

      direction,

      longCompatibility:
        isLong
          ? 0.95
          : 0.3,

      shortCompatibility:
        isLong
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

      noExecutionAuthority:
        true,
    },
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

        long:
          54,

        short:
          46,

        confidence:
          0.5,

        quality:
          55,
      }),

    momentum:
      directional({
        name:
          "CRYPTO_TRADING_MOMENTUM",

        direction:
          "SHORT",

        long:
          46,

        short:
          54,

        confidence:
          0.5,

        quality:
          55,
      }),

    marketStructure:
      directional({
        name:
          "CRYPTO_TRADING_MARKET_STRUCTURE",

        direction:
          "LONG",

        long:
          52,

        short:
          48,

        confidence:
          0.45,

        quality:
          50,
      }),

    derivatives:
      directional({
        name:
          "CRYPTO_TRADING_DERIVATIVES",

        direction:
          "SHORT",

        long:
          48,

        short:
          52,

        confidence:
          0.45,

        quality:
          50,
      }),

    onChainFlow:
      directional({
        name:
          "CRYPTO_TRADING_ON_CHAIN_FLOW",

        direction:
          "NEUTRAL",

        long:
          50,

        short:
          50,

        confidence:
          0.4,

        quality:
          50,
      }),

    marketRegime: {
      status:
        "COMPLETE",

      regime:
        "CHOPPY",

      direction:
        "NEUTRAL",

      longCompatibility:
        0.55,

      shortCompatibility:
        0.55,

      exposureMultiplier:
        0.75,

      confidence:
        0.6,

      quality:
        60,
    },

    btcEthDependency: {
      status:
        "COMPLETE",

      direction:
        "NEUTRAL",

      longCompatibility:
        0.6,

      shortCompatibility:
        0.6,

      confidence:
        0.6,

      quality:
        60,
    },
  };
}


function candidate(
  symbol,
  price = 100,
) {
  return {
    symbol,

    candidateType:
      "CEX",

    measurements: {
      priceUsd:
        price,

      change1hPercent:
        2,

      change4hPercent:
        4,

      change24hPercent:
        7,

      change7dPercent:
        10,

      high24h:
        price * 1.05,

      low24h:
        price * 0.95,

      intradayRangePercent:
        10,

      atr:
        price * 0.012,

      atrPercent:
        1.2,
    },
  };
}


const statefulRuntime =
  createCryptoPaperTradingRuntime();


const adapter =
  createPaperCryptoExchangeAdapter({
    defaultPrice:
      100,
  });


let activeOverrides = {};


const integratedRuntime =
  createIntegratedCryptoPaperTradingRuntime({
    statefulRuntime,

    adapter,

    account: {
      equity:
        10_000,

      requestedLeverage:
        3,
    },

    exchangeRules: {
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
    },

    /**
     * This fallback remains.
     * Phase 5.24's runtimePortfolioSnapshot overrides positions.
     */
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
          market?.price,

        atr:
          market?.price *
          0.012,

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
      async ({
        symbol,
      }) =>
        activeOverrides[
          symbol
        ] ??
        mixedPack(),
  });


const marketMap = {
  BTCUSDT: {
    price:
      100,

    timestamp:
      Date.now(),

    volatilityScore:
      35,
  },

  ETHUSDT: {
    price:
      100,

    timestamp:
      Date.now(),

    volatilityScore:
      35,
  },

  SOLUSDT: {
    price:
      100,

    timestamp:
      Date.now(),

    volatilityScore:
      35,
  },

  MIXEDUSDT: {
    price:
      100,

    timestamp:
      Date.now(),

    volatilityScore:
      40,
  },

  STALEUSDT: {
    price:
      100,

    timestamp:
      Date.now() -
      120_000,

    volatilityScore:
      35,
  },
};


const loop =
  createContinuousIntegratedPaperLoop({
    statefulRuntime,

    integratedRuntime,

    account: {
      equity:
        10_000,

      drawdownPercent:
        0,

      marketStress:
        false,
    },

    universeProvider:
      async () => [
        "BTCUSDT",
        "ETHUSDT",
        "MIXEDUSDT",
        "STALEUSDT",
      ],

    marketDataProvider:
      async symbol =>
        ({
          ...marketMap[
            symbol
          ],
        }),

    candidateProvider:
      async ({
        symbol,
        market,
      }) =>
        candidate(
          symbol,
          market?.price ??
          100,
        ),
  });


const start =
  loop.start();


/**
 * ============================================================
 * CYCLE 1
 *
 * BTC opens LONG.
 * ETH opens LONG.
 * MIXED stays flat.
 * STALE blocked.
 * ============================================================
 */

activeOverrides = {
  BTCUSDT:
    pack(
      "LONG",
    ),

  ETHUSDT:
    pack(
      "LONG",
    ),

  MIXEDUSDT:
    mixedPack(),

  STALEUSDT:
    pack(
      "LONG",
    ),
};


const cycle1 =
  await loop
    .runUniverseCycle();


/**
 * ============================================================
 * CYCLE 2
 *
 * BTC remains LONG.
 * ETH reverses SHORT -> should EXIT, not flip.
 * SOL gets added and partial fills.
 * ============================================================
 */

marketMap.BTCUSDT = {
  price:
    101,

  timestamp:
    Date.now(),

  volatilityScore:
    35,
};

marketMap.ETHUSDT = {
  price:
    96,

  timestamp:
    Date.now(),

  volatilityScore:
    75,
};

marketMap.SOLUSDT = {
  price:
    100,

  timestamp:
    Date.now(),

  volatilityScore:
    35,
};


activeOverrides = {
  BTCUSDT:
    pack(
      "LONG",
    ),

  ETHUSDT:
    pack(
      "SHORT",
    ),

  SOLUSDT:
    pack(
      "LONG",
    ),
};


const cycle2 =
  await loop
    .runUniverseCycle({
      symbols: [
        "BTCUSDT",
        "ETHUSDT",
        "SOLUSDT",
      ],

      paperOverridesBySymbol: {
        SOLUSDT: {
          fillRatio:
            0.4,
        },
      },
    });


/**
 * ============================================================
 * CYCLE 3
 *
 * ETH is now FLAT and can open SHORT.
 * ============================================================
 */

marketMap.ETHUSDT = {
  price:
    96,

  timestamp:
    Date.now(),

  volatilityScore:
    35,
};


activeOverrides = {
  ETHUSDT:
    pack(
      "SHORT",
    ),
};


const cycle3 =
  await loop
    .runUniverseCycle({
      symbols: [
        "ETHUSDT",
      ],
    });


const portfolio =
  loop.portfolioSnapshot();


const healthBeforeShutdown =
  loop.getHealth();


const shutdown =
  await loop.shutdown();


const healthAfterShutdown =
  loop.getHealth();


function summarizeCycle(
  cycle,
) {
  return (
    cycle?.results ??
    []
  ).map(
    result => ({
      symbol:
        result?.symbol ??
        "N/A",

      status:
        result?.status ??
        "N/A",

      mode:
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

      lifecycle:
        result
          ?.lifecycle
          ?.action ??
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
    }),
  );
}


console.log(
  "\nCYCLE 1",
);

console.table(
  summarizeCycle(
    cycle1,
  ),
);


console.log(
  "\nCYCLE 2",
);

console.table(
  summarizeCycle(
    cycle2,
  ),
);


console.log(
  "\nCYCLE 3",
);

console.table(
  summarizeCycle(
    cycle3,
  ),
);


console.log(
  "\nPORTFOLIO",
);

console.table(
  portfolio.positions,
);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const btc =
  statefulRuntime
    .getSymbolState(
      "BTCUSDT",
    );


const eth =
  statefulRuntime
    .getSymbolState(
      "ETHUSDT",
    );


const sol =
  statefulRuntime
    .getSymbolState(
      "SOLUSDT",
    );


const staleResult =
  cycle1
    ?.results
    ?.find(
      result =>
        result?.symbol ===
        "STALEUSDT",
    );


const mixedResult =
  cycle1
    ?.results
    ?.find(
      result =>
        result?.symbol ===
        "MIXEDUSDT",
    );


const ethCycle2 =
  cycle2
    ?.results
    ?.find(
      result =>
        result?.symbol ===
        "ETHUSDT",
    );


const ethCycle3 =
  cycle3
    ?.results
    ?.find(
      result =>
        result?.symbol ===
        "ETHUSDT",
    );


const invariants = {
  startsPaperOnly:
    start?.mode ===
      "PAPER" &&
    start?.liveExecution ===
      false,

  btcPositionExists:
    btc
      ?.position
      ?.direction ===
      "LONG",

  btcNotReenteredEveryCycle:
    btc
      ?.position
      ?.quantity >
      0,

  ethReversalClosesBeforeFlip:
    ethCycle2
      ?.exchangePosition
      ?.direction ===
      "FLAT",

  ethShortOpensNextCycle:
    ethCycle3
      ?.exchangePosition
      ?.direction ===
      "SHORT",

  noDirectEthFlip:
    !(
      ethCycle2
        ?.exchangePosition
        ?.direction ===
        "SHORT"
    ),

  mixedDoesNotTrade:
    mixedResult
      ?.paperCycle ===
      null,

  staleDataBlocked:
    staleResult
      ?.status ===
      "STALE_MARKET_DATA",

  solPartialPositionPreserved:
    sol
      ?.position
      ?.direction ===
      "LONG" &&
    Number(
      sol
        ?.position
        ?.quantity,
    ) > 0,

  partialFillRecognized:
    cycle2
      ?.results
      ?.find(
        result =>
          result?.symbol ===
          "SOLUSDT",
      )
      ?.paperCycle
      ?.executionState
      ?.status ===
      "PARTIALLY_FILLED",

  portfolioUsesRealPositions:
    portfolio
      ?.positions
      ?.length >=
      3,

  portfolioContainsBTC:
    portfolio
      ?.positions
      ?.some(
        position =>
          position.symbol ===
          "BTCUSDT",
      ),

  portfolioContainsETH:
    portfolio
      ?.positions
      ?.some(
        position =>
          position.symbol ===
          "ETHUSDT",
      ),

  portfolioContainsSOL:
    portfolio
      ?.positions
      ?.some(
        position =>
          position.symbol ===
          "SOLUSDT",
      ),

  grossExposureCalculated:
    Number(
      portfolio
        ?.metrics
        ?.grossExposure,
    ) > 0,

  netExposureCalculated:
    Number.isFinite(
      Number(
        portfolio
          ?.metrics
          ?.netExposure,
      ),
    ),

  staleBlocksTracked:
    healthBeforeShutdown
      ?.staleMarketBlocks >=
      1,

  universeCyclesTracked:
    healthBeforeShutdown
      ?.totalUniverseCycles ===
      3,

  gracefulShutdown:
    shutdown?.stopped ===
      true &&
    healthAfterShutdown
      ?.status ===
      "STOPPED",

  noActiveSymbolsAfterShutdown:
    healthAfterShutdown
      ?.activeSymbols
      ?.length ===
      0,

  liveExecutionDisabled:
    healthAfterShutdown
      ?.liveExecution ===
      false,

  noExecutionAuthority:
    healthAfterShutdown
      ?.executionAuthority ===
      false,

  adapterStillPaperOnly:
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
    "\nPHASE 5.24 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.24 PASSED — continuous integrated paper portfolio behavior is valid.",
  );
}