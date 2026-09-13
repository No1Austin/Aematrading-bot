import evaluatePortfolioRisk from
  "../src/crypto/trading/risk/cryptoPortfolioRiskManager.js";

const normalPositions = [
  {
    symbol: "BTC",
    direction: "LONG",
    exposure: 0.7,
    leverage: 2,
    theme: "L1",
    systemicDependency: 1,
    correlations: {
      ETH: 0.82,
      SOL: 0.78,
    },
  },
  {
    symbol: "ETH",
    direction: "LONG",
    exposure: 0.6,
    leverage: 2,
    theme: "L1",
    systemicDependency: 1,
    correlations: {
      BTC: 0.82,
      SOL: 0.81,
    },
  },
];

const scenarios = [
  {
    scenario:
      "NORMAL_NEW_LONG",

    context: {
      action:
        "OPEN_POSITION",

      positions:
        normalPositions,

      candidate: {
        symbol: "RAY",
        direction: "LONG",
        exposure: 0.5,
        leverage: 2,
        theme: "DEX",
        systemicDependency:
          0.55,
        correlations: {
          BTC: 0.45,
          ETH: 0.5,
        },
      },

      requestedExposure:
        0.5,
    },
  },

  {
    scenario:
      "CORRELATED_LONG_REDUCED",

    context: {
      action:
        "OPEN_POSITION",

      positions: [
        {
          symbol: "BTC",
          direction: "LONG",
          exposure: 1,
          leverage: 2,
          systemicDependency: 1,
        },
        {
          symbol: "ETH",
          direction: "LONG",
          exposure: 1,
          leverage: 2,
          systemicDependency: 1,
        },
      ],

      candidate: {
        symbol: "SOL",
        direction: "LONG",
        exposure: 1,
        leverage: 2,
        systemicDependency:
          0.9,
        correlations: {
          BTC: 0.86,
          ETH: 0.84,
        },
      },

      requestedExposure: 1,
    },
  },

  {
    scenario:
      "SHORT_REDUCES_NET_RISK",

    context: {
      action:
        "OPEN_POSITION",

      positions: [
        {
          symbol: "BTC",
          direction: "LONG",
          exposure: 1,
          leverage: 2,
        },
        {
          symbol: "ETH",
          direction: "LONG",
          exposure: 1,
          leverage: 2,
        },
        {
          symbol: "SOL",
          direction: "LONG",
          exposure: 0.7,
          leverage: 2,
        },
      ],

      candidate: {
        symbol: "AVAX",
        direction: "SHORT",
        exposure: 0.7,
        leverage: 2,
      },

      requestedExposure:
        0.7,
    },
  },

  {
    scenario:
      "MARKET_STRESS_REDUCED",

    context: {
      action:
        "OPEN_POSITION",

      positions: [],

      candidate: {
        symbol: "ETH",
        direction: "SHORT",
        exposure: 1,
        leverage: 2,
      },

      requestedExposure: 1,

      marketStress: true,
    },
  },

  {
    scenario:
      "DRAWDOWN_DEFENSIVE",

    context: {
      action:
        "OPEN_POSITION",

      positions: [],

      candidate: {
        symbol: "BTC",
        direction: "LONG",
        exposure: 1,
        leverage: 2,
      },

      requestedExposure: 1,

      portfolioDrawdownPercent:
        8,
    },
  },

  {
    scenario:
      "HARD_DRAWDOWN_BLOCK",

    context: {
      action:
        "OPEN_POSITION",

      positions: [],

      candidate: {
        symbol: "BTC",
        direction: "LONG",
        exposure: 1,
      },

      requestedExposure: 1,

      portfolioDrawdownPercent:
        11,
    },
  },

  {
    scenario:
      "REDUCE_ALWAYS_ALLOWED",

    context: {
      action:
        "REDUCE_EXPOSURE",

      positions:
        normalPositions,

      requestedExposure: 0,
      portfolioDrawdownPercent:
        15,
      marketStress: true,
    },
  },

  {
    scenario:
      "EXIT_ALWAYS_ALLOWED",

    context: {
      action:
        "EXIT_POSITION",

      positions:
        normalPositions,

      portfolioDrawdownPercent:
        15,
    },
  },

  {
    scenario:
      "EMERGENCY_ALWAYS_ALLOWED",

    context: {
      action:
        "EMERGENCY_EXIT",

      positions:
        normalPositions,

      portfolioDrawdownPercent:
        20,
      marketStress: true,
    },
  },

  {
    scenario:
      "PROTECTION_ALWAYS_ALLOWED",

    context: {
      action:
        "PROTECT_POSITION",

      positions:
        normalPositions,

      portfolioDrawdownPercent:
        20,
      marketStress: true,
    },
  },

  {
    scenario:
      "TOO_MANY_POSITIONS",

    context: {
      action:
        "OPEN_POSITION",

      positions:
        Array.from(
          { length: 8 },
          (_, i) => ({
            symbol:
              `COIN${i + 1}`,
            direction:
              i % 2 === 0
                ? "LONG"
                : "SHORT",
            exposure: 0.2,
            leverage: 1,
          }),
        ),

      candidate: {
        symbol: "NEWCOIN",
        direction: "LONG",
        exposure: 0.4,
      },

      requestedExposure:
        0.4,
    },
  },

  {
    scenario:
      "LEVERAGE_BUDGET_REDUCED",

    context: {
      action:
        "OPEN_POSITION",

      positions: [
        {
          symbol: "BTC",
          direction: "LONG",
          exposure: 1,
          leverage: 4,
        },
        {
          symbol: "ETH",
          direction: "SHORT",
          exposure: 1,
          leverage: 4,
        },
      ],

      candidate: {
        symbol: "SOL",
        direction: "LONG",
        exposure: 1,
        leverage: 4,
      },

      requestedExposure: 1,
    },
  },
];

const results = [];

for (
  const test of scenarios
) {
  const result =
    await evaluatePortfolioRisk(
      test.context,
    );

  results.push({
    scenario:
      test.scenario,

    state:
      result.state,

    approved:
      result.approved,

    requested:
      result.requestedExposure,

    allowed:
      result.approvedExposure,

    multiplier:
      result.exposureMultiplier,

    gross:
      result.projectedMetrics
        ?.grossExposure,

    net:
      result.projectedMetrics
        ?.netExposure,

    veto:
      result.portfolioVeto,

    riskReducing:
      result.riskReducing,

    warnings:
      result.warnings
        ?.join(", ") ||
      "NONE",

    execution:
      result.executionAuthority,
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.12 — PORTFOLIO EXPOSURE & CORRELATION RISK\n",
);

console.table(results);

const byScenario =
  Object.fromEntries(
    results.map(
      (row) => [
        row.scenario,
        row,
      ],
    ),
  );

const invariants = {
  normalTradeAllowed:
    byScenario
      .NORMAL_NEW_LONG
      ?.approved === true,

  correlatedTradeScaled:
    byScenario
      .CORRELATED_LONG_REDUCED
      ?.approved === true &&
    byScenario
      .CORRELATED_LONG_REDUCED
      ?.allowed <
    byScenario
      .CORRELATED_LONG_REDUCED
      ?.requested,

  oppositeTradeCanReduceNetRisk:
    byScenario
      .SHORT_REDUCES_NET_RISK
      ?.approved === true,

  marketStressScalesRisk:
    byScenario
      .MARKET_STRESS_REDUCED
      ?.approved === true &&
    byScenario
      .MARKET_STRESS_REDUCED
      ?.allowed < 1,

  drawdownScalesRisk:
    byScenario
      .DRAWDOWN_DEFENSIVE
      ?.approved === true &&
    byScenario
      .DRAWDOWN_DEFENSIVE
      ?.allowed < 1,

  hardDrawdownBlocksNewRisk:
    byScenario
      .HARD_DRAWDOWN_BLOCK
      ?.approved === false,

  reductionNeverBlocked:
    byScenario
      .REDUCE_ALWAYS_ALLOWED
      ?.approved === true &&
    byScenario
      .REDUCE_ALWAYS_ALLOWED
      ?.veto === false,

  exitNeverBlocked:
    byScenario
      .EXIT_ALWAYS_ALLOWED
      ?.approved === true &&
    byScenario
      .EXIT_ALWAYS_ALLOWED
      ?.veto === false,

  emergencyExitNeverBlocked:
    byScenario
      .EMERGENCY_ALWAYS_ALLOWED
      ?.approved === true &&
    byScenario
      .EMERGENCY_ALWAYS_ALLOWED
      ?.veto === false,

  protectionNeverBlocked:
    byScenario
      .PROTECTION_ALWAYS_ALLOWED
      ?.approved === true &&
    byScenario
      .PROTECTION_ALWAYS_ALLOWED
      ?.veto === false,

  positionLimitBlocksNewTrade:
    byScenario
      .TOO_MANY_POSITIONS
      ?.approved === false,

  leverageBudgetRespected:
    byScenario
      .LEVERAGE_BUDGET_REDUCED
      ?.allowed <
    byScenario
      .LEVERAGE_BUDGET_REDUCED
      ?.requested,

  noExecutionAuthority:
    results.every(
      (row) =>
        row.execution === false,
    ),
};

console.log(
  "\nINVARIANTS",
);

console.log(invariants);

const passed =
  Object.values(
    invariants,
  ).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.12 FAILED — one or more invariants failed.",
  );

  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.12 PASSED — portfolio risk behavior is valid.",
  );
}