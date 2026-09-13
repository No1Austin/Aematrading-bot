import {
  buildCryptoFuturesRiskPlan,
} from "../src/crypto/trading/risk/cryptoFuturesRiskManager.js";

console.log(
  "\nAEMA CRYPTO PHASE 5.9 — FUTURES RISK & POSITION PROTECTION\n",
);

const base = {
  accountEquity:
    10000,

  entryPrice:
    100,

  atrPercent:
    1.2,

  entryQualification: {
    state:
      "ENTRY_ALLOWED",

    exposureMultiplier:
      1,
  },
};

const scenarios = [
  {
    name:
      "NORMAL_LONG",

    input: {
      ...base,

      direction:
        "LONG",

      requestedLeverage:
        3,
    },
  },

  {
    name:
      "NORMAL_SHORT",

    input: {
      ...base,

      direction:
        "SHORT",

      requestedLeverage:
        3,
    },
  },

  {
    name:
      "REDUCED_ENTRY",

    input: {
      ...base,

      direction:
        "LONG",

      entryQualification: {
        state:
          "ENTRY_ALLOWED_REDUCED",

        exposureMultiplier:
          0.7,
      },
    },
  },

  {
    name:
      "EXTREME_VOLATILITY",

    input: {
      ...base,

      direction:
        "SHORT",

      volatilityState:
        "EXTREME",

      requestedLeverage:
        5,
    },
  },

  {
    name:
      "BREAKEVEN",

    input: {
      ...base,

      direction:
        "LONG",

      unrealizedR:
        1.1,

      liveMonitor: {
        action:
          "MOVE_STOP_TO_BREAKEVEN",

        exposureMultiplier:
          1,
      },
    },
  },

  {
    name:
      "TRAIL_PROFIT",

    input: {
      ...base,

      direction:
        "LONG",

      unrealizedR:
        3,

      liveMonitor: {
        action:
          "TRAIL_PROFIT",

        exposureMultiplier:
          1,
      },
    },
  },

  {
    name:
      "REDUCE_EXPOSURE",

    input: {
      ...base,

      direction:
        "SHORT",

      liveMonitor: {
        action:
          "REDUCE_EXPOSURE",

        exposureMultiplier:
          0.35,
      },
    },
  },

  {
    name:
      "EXIT_REQUIRED",

    input: {
      ...base,

      direction:
        "LONG",

      liveMonitor: {
        action:
          "EXIT",

        exposureMultiplier:
          0,
      },
    },
  },

  {
    name:
      "BAD_LIQUIDATION_BUFFER",

    input: {
      ...base,

      direction:
        "LONG",

      liquidationPrice:
        94,
    },
  },
];

const results =
  scenarios.map(
    ({
      name,
      input,
    }) => ({
      name,

      result:
        buildCryptoFuturesRiskPlan(
          input,
        ),
    }),
  );

console.table(
  results.map(
    ({
      name,
      result,
    }) => ({
      scenario:
        name,

      status:
        result.status,

      state:
        result.riskState,

      direction:
        result.direction,

      risk:
        result
          .accountRiskPercent ??
        "N/A",

      leverage:
        result
          ?.leverage
          ?.recommended ??
        "N/A",

      stop:
        result
          ?.stop
          ?.initialStopPrice ??
        "N/A",

      position:
        result
          ?.sizing
          ?.positionSizeUsd ??
        0,

      exposure:
        result
          .exposureMultiplier ??
        0,

      breakeven:
        result
          ?.trailing
          ?.breakevenEligible ??
        false,

      trailing:
        result
          ?.trailing
          ?.trailingMode ??
        "NONE",

      approved:
        result.approved,
    }),
  ),
);

const byName =
  Object.fromEntries(
    results.map(
      ({
        name,
        result,
      }) => [
        name,
        result,
      ],
    ),
  );

const invariants = {
  longStopBelowEntry:
    byName.NORMAL_LONG
      .stop
      .initialStopPrice <
    base.entryPrice,

  shortStopAboveEntry:
    byName.NORMAL_SHORT
      .stop
      .initialStopPrice >
    base.entryPrice,

  reducedEntryReducesRisk:
    byName.REDUCED_ENTRY
      .accountRiskPercent <
    byName.NORMAL_LONG
      .accountRiskPercent,

  reducedEntryReducesPosition:
    byName.REDUCED_ENTRY
      .sizing
      .positionSizeUsd <
    byName.NORMAL_LONG
      .sizing
      .positionSizeUsd,

  extremeVolatilityCapsLeverage:
    byName.EXTREME_VOLATILITY
      .leverage
      .recommended <= 2,

  extremeVolatilityReducesRisk:
    byName.EXTREME_VOLATILITY
      .accountRiskPercent <
    byName.NORMAL_SHORT
      .accountRiskPercent,

  breakevenRecognized:
    byName.BREAKEVEN
      .trailing
      .breakevenEligible ===
    true,

  trailingRecognized:
    byName.TRAIL_PROFIT
      .trailing
      .trailingMode ===
    "AGGRESSIVE",

  monitorReductionRespected:
    byName.REDUCE_EXPOSURE
      .exposureMultiplier ===
    0.35,

  exitProducesZeroExposure:
    byName.EXIT_REQUIRED
      .exposureMultiplier ===
    0,

  exitProducesZeroPosition:
    byName.EXIT_REQUIRED
      .sizing
      .positionSizeUsd ===
    0,

  unsafeLiquidationBlocked:
    byName.BAD_LIQUIDATION_BUFFER
      .approved ===
    false,

  riskManagerCannotExecute:
    results.every(
      ({
        result,
      }) =>
        result.canExecute ===
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
    "\nPHASE 5.9 FAILED — one or more invariants failed.",
  );

  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.9 PASSED — futures risk behavior is valid.",
  );
}