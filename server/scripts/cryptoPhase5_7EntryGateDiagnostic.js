import {
  qualifyCryptoTradeEntry,
} from "../src/crypto/trading/gates/cryptoTradeEntryQualificationGate.js";

function decision({
  direction,
  score,
  opposite = 10,
  separation,
  confidence,
  exposure = 1,
  tradeable = true,
  availableEngines = 5,
  risks = [],
}) {
  const long =
    direction === "LONG"
      ? score
      : opposite;

  const short =
    direction === "SHORT"
      ? score
      : opposite;

  return {
    status:
      availableEngines >= 3
        ? "COMPLETE"
        : "INSUFFICIENT_DATA",

    decision:
      direction === "LONG"
        ? "LONG_CANDIDATE"
        : "SHORT_CANDIDATE",

    tradeable,

    decisionReason:
      tradeable
        ? "DIRECTIONAL_CONSENSUS"
        : "NOT_TRADEABLE",

    preferredDirection:
      direction,

    scores: {
      long,
      short,

      separation:
        separation ??
        Math.abs(
          long -
          short,
        ),
    },

    consensus: {
      confidence,

      availableEngines,
    },

    risk: {
      exposureMultiplier:
        exposure,

      risks,
    },
  };
}

const scenarios = [
  {
    name:
      "STRONG_LONG",

    decision:
      decision({
        direction:
          "LONG",

        score:
          78,

        opposite:
          12,

        confidence:
          0.82,
      }),

    execution: {
      spreadPercent:
        0.08,

      liquidityScore:
        84,

      venueHealthy:
        true,

      orderBookHealthy:
        true,
    },

    risk: {
      riskReward:
        2.1,

      stopDistancePercent:
        3.2,

      targetDistancePercent:
        6.8,

      volatilityScore:
        52,
    },
  },

  {
    name:
      "STRONG_SHORT",

    decision:
      decision({
        direction:
          "SHORT",

        score:
          81,

        opposite:
          9,

        confidence:
          0.86,
      }),

    execution: {
      spreadPercent:
        0.09,

      liquidityScore:
        82,

      venueHealthy:
        true,

      orderBookHealthy:
        true,
    },

    risk: {
      riskReward:
        2.2,

      stopDistancePercent:
        3.5,

      targetDistancePercent:
        7.7,

      volatilityScore:
        58,
    },
  },

  {
    name:
      "COUNTER_TREND_REDUCED",

    decision:
      decision({
        direction:
          "LONG",

        score:
          72,

        opposite:
          16,

        confidence:
          0.71,

        exposure:
          0.72,

        risks: [
          "BTC_ETH_CONTEXT_CONFLICT",
        ],
      }),

    execution: {
      spreadPercent:
        0.12,

      liquidityScore:
        70,

      venueHealthy:
        true,

      orderBookHealthy:
        true,
    },

    risk: {
      riskReward:
        1.8,

      stopDistancePercent:
        4.5,

      volatilityScore:
        62,
    },
  },

  {
    name:
      "WEAK_DIRECTION",

    decision:
      decision({
        direction:
          "LONG",

        score:
          44,

        opposite:
          22,

        confidence:
          0.50,
      }),

    execution: {
      spreadPercent:
        0.10,

      liquidityScore:
        75,
    },

    risk: {
      riskReward:
        1.8,

      stopDistancePercent:
        4,
    },
  },

  {
    name:
      "BAD_LIQUIDITY",

    decision:
      decision({
        direction:
          "SHORT",

        score:
          76,

        opposite:
          14,

        confidence:
          0.79,
      }),

    execution: {
      spreadPercent:
        0.45,

      liquidityScore:
        31,

      venueHealthy:
        true,

      orderBookHealthy:
        true,
    },

    risk: {
      riskReward:
        2,

      stopDistancePercent:
        3,
    },
  },

  {
    name:
      "BAD_RISK_REWARD",

    decision:
      decision({
        direction:
          "LONG",

        score:
          74,

        opposite:
          13,

        confidence:
          0.77,
      }),

    execution: {
      spreadPercent:
        0.09,

      liquidityScore:
        80,
    },

    risk: {
      riskReward:
        1.1,

      stopDistancePercent:
        4,
    },
  },

  {
    name:
      "HIGH_VOLATILITY",

    decision:
      decision({
        direction:
          "SHORT",

        score:
          73,

        opposite:
          16,

        confidence:
          0.70,
      }),

    execution: {
      spreadPercent:
        0.15,

      liquidityScore:
        68,
    },

    risk: {
      riskReward:
        1.9,

      stopDistancePercent:
        5.4,

      volatilityScore:
        78,
    },
  },

  {
    name:
      "INSUFFICIENT_ENGINES",

    decision:
      decision({
        direction:
          "LONG",

        score:
          80,

        opposite:
          10,

        confidence:
          0.85,

        availableEngines:
          2,
      }),

    execution: {
      spreadPercent:
        0.08,

      liquidityScore:
        90,
    },

    risk: {
      riskReward:
        2,

      stopDistancePercent:
        3,
    },
  },
];

const rows = [];

const outputs = {};

for (
  const scenario
  of scenarios
) {
  const result =
    qualifyCryptoTradeEntry({
      decision:
        scenario.decision,

      execution:
        scenario.execution,

      risk:
        scenario.risk,
    });

  outputs[
    scenario.name
  ] =
    result;

  rows.push({
    scenario:
      scenario.name,

    state:
      result.state,

    direction:
      result.direction,

    approved:
      result.approved,

    entryQuality:
      result.entryQuality ??
      "N/A",

    exposure:
      result.exposureMultiplier,

    warnings:
      result.warnings
        ?.join(
          ", ",
        ) ||
      "NONE",

    blockers:
      result.blockers
        ?.join(
          ", ",
        ) ||
      "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.7 — ENTRY QUALIFICATION GATE\n",
);

console.table(
  rows,
);

const invariants = {
  strongLongAllowed:
    outputs
      .STRONG_LONG
      .state ===
      "ENTRY_ALLOWED",

  strongShortAllowed:
    outputs
      .STRONG_SHORT
      .state ===
      "ENTRY_ALLOWED",

  counterTrendReduced:
    outputs
      .COUNTER_TREND_REDUCED
      .state ===
      "ENTRY_ALLOWED_REDUCED" &&
    outputs
      .COUNTER_TREND_REDUCED
      .exposureMultiplier <
      1,

  weakDirectionWaits:
    outputs
      .WEAK_DIRECTION
      .state ===
      "WAIT_FOR_CONFIRMATION",

  badLiquidityBlocked:
    outputs
      .BAD_LIQUIDITY
      .state ===
      "NO_TRADE_EXECUTION",

  badRiskRewardBlocked:
    outputs
      .BAD_RISK_REWARD
      .state ===
      "NO_TRADE_RISK",

  highVolatilityReduced:
    outputs
      .HIGH_VOLATILITY
      .state ===
      "ENTRY_ALLOWED_REDUCED" &&
    outputs
      .HIGH_VOLATILITY
      .exposureMultiplier <
      1,

  insufficientEnginesBlocked:
    outputs
      .INSUFFICIENT_ENGINES
      .state ===
      "INSUFFICIENT_DATA",

  gateCannotExecute:
    Object.values(
      outputs,
    ).every(
      output =>
        output.noExecutionAuthority ===
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
    "\nPHASE 5.7 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.7 PASSED — entry qualification behavior is valid.",
  );
}