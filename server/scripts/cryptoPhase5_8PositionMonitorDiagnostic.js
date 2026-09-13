import {
  monitorCryptoPosition,
} from "../src/crypto/trading/monitoring/cryptoLivePositionMonitor.js";

function engine(
  direction,
  longSupport,
  shortSupport,
  confidence = 0.85,
) {
  return {
    direction,
    longSupport,
    shortSupport,
    confidence,
  };
}

const strongLongEntry = {
  technical:
    engine(
      "LONG",
      82,
      15,
    ),

  momentum:
    engine(
      "LONG",
      86,
      10,
    ),

  marketStructure:
    engine(
      "LONG",
      78,
      18,
    ),

  derivatives:
    engine(
      "LONG",
      72,
      24,
    ),

  btcEthDependency:
    engine(
      "LONG",
      70,
      20,
    ),
};

const healthyLong = {
  technical:
    engine(
      "LONG",
      80,
      17,
    ),

  momentum:
    engine(
      "LONG",
      83,
      13,
    ),

  marketStructure:
    engine(
      "LONG",
      76,
      20,
    ),

  derivatives:
    engine(
      "LONG",
      70,
      27,
    ),

  btcEthDependency:
    engine(
      "LONG",
      68,
      23,
    ),
};

const strongerLong = {
  technical:
    engine(
      "LONG",
      92,
      5,
    ),

  momentum:
    engine(
      "LONG",
      96,
      3,
    ),

  marketStructure:
    engine(
      "LONG",
      90,
      7,
    ),

  derivatives:
    engine(
      "LONG",
      84,
      12,
    ),

  btcEthDependency:
    engine(
      "LONG",
      82,
      10,
    ),
};

const mildWeakening = {
  technical:
    engine(
      "LONG",
      68,
      30,
    ),

  momentum:
    engine(
      "LONG",
      70,
      28,
    ),

  marketStructure:
    engine(
      "LONG",
      66,
      32,
    ),

  derivatives:
    engine(
      "LONG",
      61,
      37,
    ),

  btcEthDependency:
    engine(
      "LONG",
      64,
      30,
    ),
};

const seriousWeakening = {
  technical:
    engine(
      "LONG",
      55,
      44,
    ),

  momentum:
    engine(
      "SHORT",
      39,
      64,
    ),

  marketStructure:
    engine(
      "LONG",
      53,
      46,
    ),

  derivatives:
    engine(
      "SHORT",
      37,
      66,
    ),

  btcEthDependency:
    engine(
      "LONG",
      50,
      48,
    ),
};

const fullReversal = {
  technical:
    engine(
      "SHORT",
      22,
      76,
    ),

  momentum:
    engine(
      "SHORT",
      16,
      84,
    ),

  marketStructure:
    engine(
      "SHORT",
      25,
      72,
    ),

  derivatives:
    engine(
      "SHORT",
      28,
      70,
    ),

  btcEthDependency:
    engine(
      "SHORT",
      30,
      68,
    ),
};

const scenarios = [
  {
    name:
      "HEALTHY_HOLD",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        0.35,

      maximumFavorableExcursionR:
        0.45,

      maximumAdverseExcursionR:
        -0.15,

      minutesOpen:
        28,
    },

    current:
      healthyLong,

    market: {
      volatilityScore:
        52,
    },
  },

  {
    name:
      "THESIS_STRENGTHENING",

    position: {
      direction:
        "LONG",

      currentExposure:
        0.65,

      unrealizedR:
        0.45,

      maximumFavorableExcursionR:
        0.55,

      maximumAdverseExcursionR:
        -0.10,

      minutesOpen:
        35,
    },

    current:
      strongerLong,

    market: {
      volatilityScore:
        48,
    },
  },

  {
    name:
      "MILD_WEAKENING",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        0.40,

      maximumFavorableExcursionR:
        0.55,

      maximumAdverseExcursionR:
        -0.20,

      minutesOpen:
        42,
    },

    current:
      mildWeakening,

    market: {
      volatilityScore:
        55,
    },
  },

  {
    name:
      "SERIOUS_WEAKENING",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        -0.35,

      maximumFavorableExcursionR:
        0.25,

      maximumAdverseExcursionR:
        -0.45,

      minutesOpen:
        50,
    },

    current:
      seriousWeakening,

    market: {
      volatilityScore:
        63,
    },
  },

  {
    name:
      "FULL_REVERSAL",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        -0.45,

      maximumFavorableExcursionR:
        0.20,

      maximumAdverseExcursionR:
        -0.55,

      minutesOpen:
        58,
    },

    current:
      fullReversal,

    market: {
      volatilityScore:
        67,
    },
  },

  {
    name:
      "MARKET_STRESS_REVERSAL",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        -0.30,

      maximumFavorableExcursionR:
        0.30,

      maximumAdverseExcursionR:
        -0.50,

      minutesOpen:
        40,
    },

    current:
      seriousWeakening,

    market: {
      volatilityScore:
        94,

      marketStress:
        true,

      liquidationStress:
        true,
    },
  },

  {
    name:
      "BREAKEVEN_PROTECTION",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        1.1,

      maximumFavorableExcursionR:
        1.2,

      maximumAdverseExcursionR:
        -0.15,

      minutesOpen:
        75,
    },

    current:
      healthyLong,

    market: {
      volatilityScore:
        50,
    },
  },

  {
    name:
      "TRAIL_PROFIT",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        1.8,

      maximumFavorableExcursionR:
        2.1,

      maximumAdverseExcursionR:
        -0.12,

      minutesOpen:
        110,
    },

    current:
      healthyLong,

    market: {
      volatilityScore:
        54,
    },
  },

  {
    name:
      "VOLATILITY_DEFENSE",

    position: {
      direction:
        "LONG",

      currentExposure:
        1,

      unrealizedR:
        0.30,

      maximumFavorableExcursionR:
        0.45,

      maximumAdverseExcursionR:
        -0.20,

      minutesOpen:
        30,
    },

    current:
      healthyLong,

    market: {
      volatilityScore:
        82,
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
    monitorCryptoPosition({
      position:
        scenario.position,

      entryEngines:
        strongLongEntry,

      currentEngines:
        scenario.current,

      market:
        scenario.market,
    });

  outputs[
    scenario.name
  ] =
    result;

  rows.push({
    scenario:
      scenario.name,

    action:
      result.action,

    direction:
      result.direction,

    exposure:
      result.exposureMultiplier,

    entrySupport:
      result
        .thesis
        ?.entry
        ?.support ??
      "N/A",

    currentSupport:
      result
        .thesis
        ?.current
        ?.support ??
      "N/A",

    currentOpposition:
      result
        .thesis
        ?.current
        ?.opposition ??
      "N/A",

    deterioration:
      result
        .comparison
        ?.averageDeterioration ??
      "N/A",

    reversed:
      result
        .comparison
        ?.reversedEngines ??
      "N/A",

    urgency:
      result.urgency,

    protections:
      Object.entries(
        result.protections ??
          {},
      )
        .filter(
          ([, value]) =>
            value === true,
        )
        .map(
          ([key]) =>
            key,
        )
        .join(", ") ||
      "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.8 — LIVE POSITION THESIS MONITOR\n",
);

console.table(
  rows,
);

const invariants = {
  healthyPositionHeld:
    outputs
      .HEALTHY_HOLD
      .action ===
      "HOLD",

  strengtheningCanAdd:
    outputs
      .THESIS_STRENGTHENING
      .action ===
      "ADD_EXPOSURE",

  mildWeakeningProtected:
    outputs
      .MILD_WEAKENING
      .action ===
      "TIGHTEN_STOP",

  seriousWeakeningReduces:
    outputs
      .SERIOUS_WEAKENING
      .action ===
      "REDUCE_EXPOSURE",

  fullReversalExits:
    [
      "EXIT",
      "EMERGENCY_EXIT",
    ].includes(
      outputs
        .FULL_REVERSAL
        .action,
    ),

  marketStressEmergencyExit:
    outputs
      .MARKET_STRESS_REVERSAL
      .action ===
      "EMERGENCY_EXIT",

  profitMovesToBreakeven:
    outputs
      .BREAKEVEN_PROTECTION
      .action ===
      "MOVE_STOP_TO_BREAKEVEN",

  strongProfitTrails:
    outputs
      .TRAIL_PROFIT
      .action ===
      "TRAIL_PROFIT",

  volatilityReducesExposure:
    outputs
      .VOLATILITY_DEFENSE
      .action ===
      "REDUCE_EXPOSURE" &&
    outputs
      .VOLATILITY_DEFENSE
      .exposureMultiplier <
      1,

  monitorCannotExecute:
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
  ).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.8 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.8 PASSED — live position monitoring behavior is valid.",
  );
}