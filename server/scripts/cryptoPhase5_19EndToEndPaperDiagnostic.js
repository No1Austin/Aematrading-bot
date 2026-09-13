import {
  createPaperCryptoExchangeAdapter,
} from "../src/crypto/trading/execution/paperCryptoExchangeAdapter.js";

import {
  runCryptoPaperTradeCycle,
} from "../src/crypto/trading/orchestration/cryptoPaperTradingOrchestrator.js";

const rules = {
  tradeable: true,

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

function riskPlan({
  direction,
  price = 100,
  size = 1000,
} = {}) {
  return {
    approved: true,

    direction,

    entryPrice:
      price,

    sizing: {
      positionSizeUsd:
        size,
    },

    leverage: {
      recommended:
        2,
    },

    stop: {
      initialStopPrice:
        direction === "LONG"
          ? 98
          : 102,

      currentStopPrice:
        direction === "LONG"
          ? 98
          : 102,
    },

    targets: {
      target1:
        direction === "LONG"
          ? 103
          : 97,

      target2:
        direction === "LONG"
          ? 105
          : 95,

      target3:
        direction === "LONG"
          ? 108
          : 92,
    },
  };
}

function openLifecycle(
  direction,
  exposure = 1,
) {
  return {
    action:
      "OPEN_POSITION",

    approved:
      true,

    direction,

    currentExposure:
      0,

    targetExposure:
      exposure,

    reasons: [
      "ENTRY_QUALIFIED",
    ],
  };
}

async function main() {
  console.log(
    "\nAEMA CRYPTO PHASE 5.19 — END-TO-END PAPER TRADING ORCHESTRATOR\n",
  );

  const adapter =
    createPaperCryptoExchangeAdapter({
      defaultPrice:
        100,
    });

  const scenarios = {};

  /*
   * ==========================================================
   * 1. STRONG LONG
   * ==========================================================
   */

  scenarios.STRONG_LONG =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "BTCUSDT",

      lifecycle:
        openLifecycle(
          "LONG",
          1,
        ),

      riskPlan:
        riskPlan({
          direction:
            "LONG",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          0,

        quantity:
          0,
      },

      market: {
        price: 100,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * 2. STRONG SHORT
   * ==========================================================
   */

  scenarios.STRONG_SHORT =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "ETHUSDT",

      lifecycle:
        openLifecycle(
          "SHORT",
          1,
        ),

      riskPlan:
        riskPlan({
          direction:
            "SHORT",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        direction:
          "SHORT",

        currentExposure:
          0,

        quantity:
          0,
      },

      market: {
        price: 100,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * 3. ADD EXPOSURE
   * ==========================================================
   */

  const btcBeforeAdd =
    await adapter.getPosition(
      "BTCUSDT",
    );

  scenarios.ADD_EXPOSURE =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "ADD_EXPOSURE",

        approved:
          true,

        direction:
          "LONG",

        currentExposure:
          0.5,

        targetExposure:
          0.8,

        reasons: [
          "THESIS_STRENGTHENING",
        ],
      },

      riskPlan:
        riskPlan({
          direction:
            "LONG",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        ...btcBeforeAdd,

        currentExposure:
          0.5,

        notionalUsd:
          btcBeforeAdd.quantity *
          100,
      },

      market: {
        price: 100,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * 4. REDUCE EXPOSURE
   * ==========================================================
   */

  const btcBeforeReduce =
    await adapter.getPosition(
      "BTCUSDT",
    );

  scenarios.REDUCE_EXPOSURE =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "REDUCE_EXPOSURE",

        approved:
          true,

        direction:
          "LONG",

        currentExposure:
          1,

        targetExposure:
          0.5,

        reasons: [
          "LIVE_THESIS_DETERIORATING",
        ],
      },

      riskPlan:
        riskPlan({
          direction:
            "LONG",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        ...btcBeforeReduce,

        currentExposure:
          1,

        notionalUsd:
          btcBeforeReduce.quantity *
          100,
      },

      market: {
        price:
          100,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * 5. STOP / PROFIT PROTECTION
   * ==========================================================
   */

  const btcProtected =
    await adapter.getPosition(
      "BTCUSDT",
    );

  scenarios.STOP_PROTECTION =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "PROTECT_POSITION",

        approved:
          true,

        direction:
          "LONG",

        currentExposure:
          1,

        targetExposure:
          1,

        reasons: [
          "TRAIL_PROFIT",
        ],
      },

      riskPlan:
        riskPlan({
          direction:
            "LONG",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        ...btcProtected,

        currentExposure:
          1,
      },

      market: {
        price:
          105,
      },

      stopPlan: {
        mode:
          "TRAILING",

        stopPrice:
          102,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * 6. PORTFOLIO REDUCED OPEN
   * ==========================================================
   */

  scenarios.PORTFOLIO_REDUCED =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "SOLUSDT",

      lifecycle:
        openLifecycle(
          "LONG",
          1,
        ),

      riskPlan:
        riskPlan({
          direction:
            "LONG",
        }),

      portfolioContext: {
        positions: [
          {
            symbol:
              "BTCUSDT",

            direction:
              "LONG",

            exposure:
              1,

            leverage:
              2,

            systemicDependency:
              1,
          },

          {
            symbol:
              "ETHUSDT",

            direction:
              "LONG",

            exposure:
              1,

            leverage:
              2,

            systemicDependency:
              1,
          },
        ],

        candidate: {
          symbol:
            "SOLUSDT",

          direction:
            "LONG",

          exposure:
            1,

          leverage:
            2,

          systemicDependency:
            0.9,

          correlations: {
            BTCUSDT:
              0.9,

            ETHUSDT:
              0.88,
          },
        },
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          0,

        quantity:
          0,
      },

      market: {
        price:
          100,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * 7. PARTIAL FILL
   * ==========================================================
   *
   * We override fillRatio at paper execution.
   */

  scenarios.PARTIAL_FILL =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "AVAXUSDT",

      lifecycle:
        openLifecycle(
          "LONG",
          1,
        ),

      riskPlan:
        riskPlan({
          direction:
            "LONG",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          0,

        quantity:
          0,
      },

      market: {
        price:
          100,
      },

      exchangeRules:
        rules,

      paperOverrides: {
        fillRatio:
          0.4,
      },
    });

  /*
   * ==========================================================
   * 8. EXIT SHORT
   * ==========================================================
   */

  const ethBeforeExit =
    await adapter.getPosition(
      "ETHUSDT",
    );

  scenarios.EXIT_SHORT =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "ETHUSDT",

      lifecycle: {
        action:
          "EXIT_POSITION",

        approved:
          true,

        direction:
          "SHORT",

        currentExposure:
          1,

        targetExposure:
          0,

        reasons: [
          "THESIS_INVALIDATED",
        ],
      },

      riskPlan:
        riskPlan({
          direction:
            "SHORT",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        ...ethBeforeExit,

        currentExposure:
          1,

        notionalUsd:
          ethBeforeExit.quantity *
          100,
      },

      market: {
        price:
          100,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * 9. EMERGENCY LONG EXIT
   * ==========================================================
   */

  const btcBeforeEmergency =
    await adapter.getPosition(
      "BTCUSDT",
    );

  scenarios.EMERGENCY_EXIT =
    await runCryptoPaperTradeCycle({
      adapter,

      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "EMERGENCY_EXIT",

        approved:
          true,

        direction:
          "LONG",

        currentExposure:
          1,

        targetExposure:
          0,

        reasons: [
          "MARKET_STRESS_REVERSAL",
        ],
      },

      riskPlan:
        riskPlan({
          direction:
            "LONG",
        }),

      portfolioContext: {
        positions: [],
      },

      position: {
        ...btcBeforeEmergency,

        currentExposure:
          1,

        notionalUsd:
          btcBeforeEmergency.quantity *
          100,
      },

      market: {
        price:
          95,
      },

      exchangeRules:
        rules,
    });

  /*
   * ==========================================================
   * OUTPUT
   * ==========================================================
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

        status:
          result.status,

        portfolio:
          result
            ?.portfolioRisk
            ?.state ??
          "N/A",

        intent:
          result
            ?.tradeIntent
            ?.intent ??
          "N/A",

        command:
          result
            ?.command
            ?.command ??
          "N/A",

        execution:
          result
            ?.executionState
            ?.status ??
          result
            ?.paperResult
            ?.status ??
          "N/A",

        reconciliation:
          result
            ?.reconciliation
            ?.action ??
          "N/A",

        direction:
          result
            ?.resultingPosition
            ?.direction ??
          "N/A",

        quantity:
          result
            ?.resultingPosition
            ?.quantity ??
          0,

        live:
          result.liveExecution,
      }),
    );

  console.table(rows);

  /*
   * ==========================================================
   * INVARIANTS
   * ==========================================================
   */

  const invariants = {
    longOpened:
      scenarios
        .STRONG_LONG
        ?.resultingPosition
        ?.direction ===
        "LONG",

    shortOpened:
      scenarios
        .STRONG_SHORT
        ?.resultingPosition
        ?.direction ===
        "SHORT",

    addExposureIncreasesPosition:
      scenarios
        .ADD_EXPOSURE
        ?.paperResult
        ?.order
        ?.filledQuantity >
      0,

    reduceExposureUsesReduceOnly:
      scenarios
        .REDUCE_EXPOSURE
        ?.executionAdapter
        ?.executionRequest
        ?.reduceOnly ===
        true,

    protectionUpdatesStop:
      scenarios
        .STOP_PROTECTION
        ?.paperResult
        ?.status ===
        "STOP_REPLACED",

    portfolioRiskCanScaleTrade:
      scenarios
        .PORTFOLIO_REDUCED
        ?.portfolioRisk
        ?.state ===
        "ALLOW_REDUCED",

    portfolioScalingReachesIntent:
      scenarios
        .PORTFOLIO_REDUCED
        ?.tradeIntent
        ?.approvedExposure <
      scenarios
        .PORTFOLIO_REDUCED
        ?.tradeIntent
        ?.requestedExposure,

    partialFillTruthPreserved:
      scenarios
        .PARTIAL_FILL
        ?.executionState
        ?.status ===
        "PARTIALLY_FILLED",

    partialFillNotPretendedFull:
      scenarios
        .PARTIAL_FILL
        ?.executionState
        ?.filledQuantity <
      scenarios
        .PARTIAL_FILL
        ?.executionState
        ?.requestedQuantity,

    shortExitClosesPosition:
      scenarios
        .EXIT_SHORT
        ?.resultingPosition
        ?.direction ===
        "FLAT",

    emergencyExitClosesPosition:
      scenarios
        .EMERGENCY_EXIT
        ?.resultingPosition
        ?.direction ===
        "FLAT",

    emergencyExitReduceOnly:
      scenarios
        .EMERGENCY_EXIT
        ?.executionAdapter
        ?.executionRequest
        ?.reduceOnly ===
        true,

    allLiveExecutionDisabled:
      Object.values(
        scenarios,
      ).every(
        (result) =>
          result.liveExecution ===
          false,
      ),

    allPaperOnly:
      adapter.paperExecution ===
        true &&
      adapter.liveExecution ===
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
      "\nPHASE 5.19 FAILED — one or more invariants failed.",
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "\nPHASE 5.19 PASSED — end-to-end paper trading pipeline behavior is valid.",
  );
}

main().catch(
  (error) => {
    console.error(
      "\nPHASE 5.19 CRASHED",
    );

    console.error(error);

    process.exitCode = 1;
  },
);