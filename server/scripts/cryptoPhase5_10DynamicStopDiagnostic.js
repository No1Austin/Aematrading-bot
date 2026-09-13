import {
  updateCryptoDynamicStop,
} from "../src/crypto/trading/risk/cryptoDynamicStopManager.js";

function baseLong({
  currentPrice = 101,
  currentStopPrice = 98,
  unrealizedR = null,
  highestPriceSinceEntry = null,
} = {}) {
  return {
    position: {
      direction:
        "LONG",

      entryPrice:
        100,

      currentPrice,

      currentStopPrice,

      unrealizedR,

      highestPriceSinceEntry,
    },

    riskPlan: {
      direction:
        "LONG",

      entryPrice:
        100,

      stop: {
        initialStopPrice:
          98,

        currentStopPrice:
          98,
      },
    },
  };
}

function baseShort({
  currentPrice = 99,
  currentStopPrice = 102,
  unrealizedR = null,
  lowestPriceSinceEntry = null,
} = {}) {
  return {
    position: {
      direction:
        "SHORT",

      entryPrice:
        100,

      currentPrice,

      currentStopPrice,

      unrealizedR,

      lowestPriceSinceEntry,
    },

    riskPlan: {
      direction:
        "SHORT",

      entryPrice:
        100,

      stop: {
        initialStopPrice:
          102,

        currentStopPrice:
          102,
      },
    },
  };
}

const scenarios = [
  {
    name:
      "INITIAL_LONG",

    input:
      baseLong({
        currentPrice:
          100.5,
      }),
  },

  {
    name:
      "INITIAL_SHORT",

    input:
      baseShort({
        currentPrice:
          99.5,
      }),
  },

  {
    name:
      "MOVE_TO_BREAKEVEN",

    input:
      baseLong({
        currentPrice:
          102.4,

        unrealizedR:
          1.2,

        highestPriceSinceEntry:
          102.5,
      }),
  },

  {
    name:
      "NORMAL_TRAIL_LONG",

    input:
      baseLong({
        currentPrice:
          103.6,

        unrealizedR:
          1.8,

        highestPriceSinceEntry:
          103.8,
      }),
  },

  {
    name:
      "NORMAL_TRAIL_SHORT",

    input:
      baseShort({
        currentPrice:
          96.4,

        unrealizedR:
          1.8,

        lowestPriceSinceEntry:
          96.2,
      }),
  },

  {
    name:
      "AGGRESSIVE_TRAIL",

    input:
      baseLong({
        currentPrice:
          105.5,

        unrealizedR:
          2.75,

        highestPriceSinceEntry:
          105.8,
      }),
  },

  {
    name:
      "THESIS_WEAKENING",

    input: {
      ...baseLong({
        currentPrice:
          101.8,
      }),

      liveMonitor: {
        action:
          "TIGHTEN_STOP",

        comparison: {
          averageDeterioration:
            16,
        },
      },
    },
  },

  {
    name:
      "HIGH_VOLATILITY",

    input: {
      ...baseLong({
        currentPrice:
          101.5,
      }),

      market: {
        volatilityScore:
          82,
      },
    },
  },

  {
    name:
      "PROFIT_LOCK",

    input:
      baseLong({
        currentPrice:
          108,

        unrealizedR:
          4,

        highestPriceSinceEntry:
          108.2,
      }),
  },

  {
    name:
      "GIVEBACK_PROTECTION",

    input:
      baseLong({
        currentPrice:
          102.2,

        highestPriceSinceEntry:
          105,
      }),
  },

  {
    name:
      "NEVER_LOOSEN_LONG",

    input:
      baseLong({
        currentPrice:
          103,

        currentStopPrice:
          101,

        unrealizedR:
          0.6,
      }),
  },

  {
    name:
      "NEVER_LOOSEN_SHORT",

    input:
      baseShort({
        currentPrice:
          97,

        currentStopPrice:
          99,

        unrealizedR:
          0.7,
      }),
  },

  {
    name:
      "MONITOR_EXIT",

    input: {
      ...baseLong({
        currentPrice:
          99,
      }),

      liveMonitor: {
        action:
          "EXIT",
      },
    },
  },

  {
    name:
      "MONITOR_EMERGENCY",

    input: {
      ...baseLong({
        currentPrice:
          98.5,
      }),

      liveMonitor: {
        action:
          "EMERGENCY_EXIT",
      },
    },
  },
];

const outputs = {};

const rows = [];

for (
  const scenario
  of scenarios
) {
  const result =
    updateCryptoDynamicStop(
      scenario.input,
    );

  outputs[
    scenario.name
  ] =
    result;

  rows.push({
    scenario:
      scenario.name,

    mode:
      result.mode,

    direction:
      result.direction,

    currentPrice:
      result.currentPrice,

    previousStop:
      result.previousStopPrice,

    stop:
      result.stopPrice,

    currentR:
      result.currentR,

    lockedR:
      result.stopLockedR,

    changed:
      result.changed,

    reasons:
      result.reasons
        ?.join(
          ", ",
        ) ||
      "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.10 — DYNAMIC STOP & PROFIT PROTECTION\n",
);

console.table(
  rows,
);

const invariants = {
  initialLongStopPreserved:
    outputs
      .INITIAL_LONG
      .stopPrice >=
    outputs
      .INITIAL_LONG
      .initialStopPrice,

  initialShortStopPreserved:
    outputs
      .INITIAL_SHORT
      .stopPrice <=
    outputs
      .INITIAL_SHORT
      .initialStopPrice,

  breakevenMovesStopAboveEntry:
    outputs
      .MOVE_TO_BREAKEVEN
      .stopPrice >
    100,

  longTrailingMovesStopHigher:
    outputs
      .NORMAL_TRAIL_LONG
      .stopPrice >
    100,

  shortTrailingMovesStopLower:
    outputs
      .NORMAL_TRAIL_SHORT
      .stopPrice <
    100,

  aggressiveTrailRecognized:
    outputs
      .AGGRESSIVE_TRAIL
      .mode ===
    "AGGRESSIVE_TRAILING",

  thesisWeakeningTightens:
    outputs
      .THESIS_WEAKENING
      .stopPrice >
    98,

  volatilityTightens:
    outputs
      .HIGH_VOLATILITY
      .stopPrice >
    98,

  strongProfitLocksGain:
    outputs
      .PROFIT_LOCK
      .stopPrice >
    100,

  givebackProtectionLocksProfit:
    outputs
      .GIVEBACK_PROTECTION
      .stopPrice >
    100,

  longStopNeverLoosens:
    outputs
      .NEVER_LOOSEN_LONG
      .stopPrice >=
    101,

  shortStopNeverLoosens:
    outputs
      .NEVER_LOOSEN_SHORT
      .stopPrice <=
    99,

  monitorExitRecognized:
    outputs
      .MONITOR_EXIT
      .mode ===
    "EXIT",

  emergencyRecognized:
    outputs
      .MONITOR_EMERGENCY
      .mode ===
    "EMERGENCY",

  noExecutionAuthority:
    Object.values(
      outputs,
    ).every(
      result =>
        result
          .noExecutionAuthority ===
        true,
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
  ).every(
    Boolean,
  );

if (!passed) {
  console.error(
    "\nPHASE 5.10 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.10 PASSED — dynamic stop behavior is valid.",
  );
}