import {
  planCryptoTradeIntent,
} from "../src/crypto/trading/orders/cryptoTradeIntentPlanner.js";

const riskPlan = {
  approved: true,

  direction:
    "LONG",

  entryPrice:
    100,

  sizing: {
    positionSizeUsd:
      1000,
  },

  leverage: {
    recommended:
      2,
  },

  stop: {
    initialStopPrice:
      98,

    currentStopPrice:
      98,
  },

  targets: {
    target1:
      103,

    target2:
      105,

    target3:
      108,
  },
};

const scenarios = [
  {
    scenario:
      "OPEN_LONG",

    input: {
      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "OPEN_POSITION",

        approved: true,

        direction:
          "LONG",

        currentExposure:
          0,

        targetExposure:
          1,

        reasons: [
          "ENTRY_QUALIFIED",
        ],
      },

      riskPlan,

      portfolioRisk: {
        approved: true,

        approvedExposure:
          1,
      },

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "OPEN_SHORT",

    input: {
      symbol:
        "ETHUSDT",

      lifecycle: {
        action:
          "OPEN_POSITION",

        approved: true,

        direction:
          "SHORT",

        currentExposure:
          0,

        targetExposure:
          1,
      },

      riskPlan: {
        ...riskPlan,

        direction:
          "SHORT",

        stop: {
          initialStopPrice:
            102,

          currentStopPrice:
            102,
        },
      },

      portfolioRisk: {
        approved: true,

        approvedExposure:
          1,
      },

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "PORTFOLIO_REDUCED_OPEN",

    input: {
      symbol:
        "SOLUSDT",

      lifecycle: {
        action:
          "OPEN_POSITION",

        approved: true,

        direction:
          "LONG",

        currentExposure:
          0,

        targetExposure:
          1,
      },

      riskPlan,

      portfolioRisk: {
        approved: true,

        approvedExposure:
          0.4,
      },

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "ADD_LONG",

    input: {
      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "ADD_EXPOSURE",

        approved: true,

        direction:
          "LONG",

        currentExposure:
          0.5,

        targetExposure:
          0.8,
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          0.5,

        quantity:
          5,

        notionalUsd:
          500,
      },

      riskPlan,

      portfolioRisk: {
        approved: true,

        approvedExposure:
          0.8,
      },

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "REDUCE_LONG",

    input: {
      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "REDUCE_EXPOSURE",

        approved: true,

        direction:
          "LONG",

        currentExposure:
          1,

        targetExposure:
          0.4,
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          1,

        quantity:
          10,

        notionalUsd:
          1000,
      },

      riskPlan,

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "CLOSE_LONG",

    input: {
      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "EXIT_POSITION",

        approved: true,

        direction:
          "LONG",

        currentExposure:
          1,

        targetExposure:
          0,
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          1,

        quantity:
          10,

        notionalUsd:
          1000,
      },

      riskPlan,

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "CLOSE_SHORT",

    input: {
      symbol:
        "ETHUSDT",

      lifecycle: {
        action:
          "EXIT_POSITION",

        approved: true,

        direction:
          "SHORT",

        currentExposure:
          1,

        targetExposure:
          0,
      },

      position: {
        direction:
          "SHORT",

        currentExposure:
          1,

        quantity:
          10,

        notionalUsd:
          1000,
      },

      riskPlan: {
        ...riskPlan,
        direction:
          "SHORT",
      },

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "EMERGENCY_CLOSE",

    input: {
      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "EMERGENCY_EXIT",

        approved: true,

        direction:
          "LONG",

        currentExposure:
          1,

        targetExposure:
          0,
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          1,

        quantity:
          10,

        notionalUsd:
          1000,
      },

      riskPlan,

      market: {
        price: 100,
      },
    },
  },

  {
    scenario:
      "STOP_UPDATE",

    input: {
      symbol:
        "BTCUSDT",

      lifecycle: {
        action:
          "PROTECT_POSITION",

        approved: true,

        direction:
          "LONG",

        currentExposure:
          1,

        targetExposure:
          1,
      },

      position: {
        direction:
          "LONG",

        currentExposure:
          1,

        quantity:
          10,
      },

      riskPlan,

      stopPlan: {
        stopPrice:
          101.5,
      },

      market: {
        price: 103,
      },
    },
  },
];

const outputs = {};

const rows = [];

for (
  const test of scenarios
) {
  const result =
    planCryptoTradeIntent(
      test.input,
    );

  outputs[
    test.scenario
  ] =
    result;

  rows.push({
    scenario:
      test.scenario,

    status:
      result.status,

    intent:
      result.intent,

    direction:
      result.direction,

    side:
      result.side,

    reduceOnly:
      result.reduceOnly,

    quantity:
      result.quantity,

    notional:
      result.notionalUsd,

    exposure:
      result.approvedExposure,

    execution:
      result.executionAuthority,
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.13 — TRADE INTENT / ORDER PLANNING\n",
);

console.table(rows);

const invariants = {
  longOpenIsBuy:
    outputs
      .OPEN_LONG
      ?.side ===
      "BUY",

  shortOpenIsSell:
    outputs
      .OPEN_SHORT
      ?.side ===
      "SELL",

  portfolioReductionRespected:
    outputs
      .PORTFOLIO_REDUCED_OPEN
      ?.approvedExposure ===
      0.4,

  addLongIsBuy:
    outputs
      .ADD_LONG
      ?.side ===
      "BUY",

  reduceLongIsSell:
    outputs
      .REDUCE_LONG
      ?.side ===
      "SELL",

  reductionIsReduceOnly:
    outputs
      .REDUCE_LONG
      ?.reduceOnly ===
      true,

  closeLongIsSell:
    outputs
      .CLOSE_LONG
      ?.side ===
      "SELL",

  closeShortIsBuy:
    outputs
      .CLOSE_SHORT
      ?.side ===
      "BUY",

  closeIsReduceOnly:
    outputs
      .CLOSE_LONG
      ?.reduceOnly ===
      true,

  emergencyIsReduceOnly:
    outputs
      .EMERGENCY_CLOSE
      ?.reduceOnly ===
      true,

  emergencyUsesMarket:
    outputs
      .EMERGENCY_CLOSE
      ?.orderType ===
      "MARKET",

  stopUpdateCannotIncreasePosition:
    outputs
      .STOP_UPDATE
      ?.notionalUsd ===
      0,

  stopUpdateIsReduceOnly:
    outputs
      .STOP_UPDATE
      ?.reduceOnly ===
      true,

  allQuantitiesNonNegative:
    Object.values(
      outputs,
    ).every(
      (result) =>
        result.quantity ===
          null ||
        result.quantity >=
          0,
    ),

  noExecutionAuthority:
    Object.values(
      outputs,
    ).every(
      (result) =>
        result
          .executionAuthority ===
        false,
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
    "\nPHASE 5.13 FAILED — one or more invariants failed.",
  );

  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.13 PASSED — trade intent planning behavior is valid.",
  );
}