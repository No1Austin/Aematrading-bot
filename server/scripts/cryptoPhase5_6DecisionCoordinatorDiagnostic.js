import coordinate
  from "../src/crypto/trading/coordinator/cryptoTradingDecisionCoordinator.js";

const engine = (
  longSupport,
  shortSupport,
  confidence = 0.85,
  quality = 85,
) => ({
  status: "COMPLETE",
  longSupport,
  shortSupport,
  confidence,
  quality,
  risks: [],
});

const scenarios = [
  {
    name: "STRONG_LONG",

    results: {
      technical:
        engine(82, 12),

      momentum:
        engine(88, 7),

      marketStructure:
        engine(76, 18),

      derivatives:
        engine(69, 24),

      onChainFlow:
        engine(79, 14),

      marketRegime: {
        regime: "BULL_TREND",
        longCompatibility: 0.95,
        shortCompatibility: 0.25,
        exposureMultiplier: 1,
        stress: false,
        risks: [],
      },

      btcEthDependency: {
        longSupport: 82,
        shortSupport: 8,
        aligned: true,
        conflict: false,
        dependencyClass:
          "HIGH_DEPENDENCY",
        overallDependency: 90,
        risks: [],
      },
    },
  },

  {
    name: "STRONG_SHORT",

    results: {
      technical:
        engine(8, 86),

      momentum:
        engine(5, 91),

      marketStructure:
        engine(16, 78),

      derivatives:
        engine(21, 74),

      onChainFlow:
        engine(11, 82),

      marketRegime: {
        regime: "BEAR_TREND",
        longCompatibility: 0.25,
        shortCompatibility: 0.95,
        exposureMultiplier: 1,
        stress: false,
        risks: [],
      },

      btcEthDependency: {
        longSupport: 5,
        shortSupport: 88,
        aligned: true,
        conflict: false,
        dependencyClass:
          "HIGH_DEPENDENCY",
        overallDependency: 92,
        risks: [],
      },
    },
  },

  /**
   * Critical scenario:
   *
   * bullish engines and bearish engines must NOT combine into
   * one artificially high trade score.
   */
  {
    name: "DIRECTIONAL_CONFLICT",

    results: {
      technical:
        engine(78, 12),

      momentum:
        engine(73, 18),

      marketStructure:
        engine(62, 27),

      derivatives:
        engine(19, 76),

      onChainFlow:
        engine(22, 71),

      marketRegime: {
        regime: "CHOPPY",
        longCompatibility: 0.55,
        shortCompatibility: 0.45,
        exposureMultiplier: 0.75,
        stress: false,
        risks: [],
      },

      btcEthDependency: {
        longSupport: 45,
        shortSupport: 48,
        aligned: false,
        conflict: true,
        dependencyClass:
          "LOW_DEPENDENCY",
        overallDependency: 35,
        risks: [
          "BTC_ETH_LEADER_DIVERGENCE",
        ],
      },
    },
  },

  /**
   * Counter-BTC trade:
   * should be penalized but not automatically killed.
   */
  {
    name:
      "INDEPENDENT_COUNTER_TREND_LONG",

    results: {
      technical:
        engine(86, 8),

      momentum:
        engine(84, 10),

      marketStructure:
        engine(78, 15),

      derivatives:
        engine(71, 21),

      onChainFlow:
        engine(76, 17),

      marketRegime: {
        regime: "RISK_ON",
        longCompatibility: 0.82,
        shortCompatibility: 0.45,
        exposureMultiplier: 0.9,
        stress: false,
        risks: [],
      },

      btcEthDependency: {
        longSupport: 10,
        shortSupport: 0,
        aligned: false,
        conflict: true,
        dependencyClass:
          "INDEPENDENT",
        overallDependency: 24,
        risks: [
          "CANDIDATE_LONG_AGAINST_BTC",
          "CANDIDATE_LONG_AGAINST_ETH",
        ],
      },
    },
  },

  {
    name:
      "INSUFFICIENT_DATA",

    results: {
      technical:
        engine(80, 10),

      momentum:
        engine(75, 15),

      marketRegime: {
        regime: "BULL_TREND",
        longCompatibility: 0.9,
        shortCompatibility: 0.3,
        exposureMultiplier: 1,
        stress: false,
        risks: [],
      },
    },
  },
];

const rows = [];

const outputs = {};

for (const scenario of scenarios) {
  const result =
    coordinate(
      scenario.results,
    );

  outputs[scenario.name] =
    result;

  rows.push({
    scenario:
      scenario.name,

    decision:
      result.decision,

    direction:
      result.preferredDirection,

    long:
      result.scores.long,

    short:
      result.scores.short,

    separation:
      result.scores.separation,

    agreement:
      result.consensus.agreement,

    confidence:
      result.consensus.confidence,

    exposure:
      result.risk.exposureMultiplier,

    tradeable:
      result.tradeable,
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.6 — DIRECTIONAL DECISION COORDINATOR\n",
);

console.table(rows);

const invariants = {
  strongLongAccepted:
    outputs.STRONG_LONG
      .decision ===
      "LONG_CANDIDATE" &&
    outputs.STRONG_LONG
      .tradeable === true,

  strongShortAccepted:
    outputs.STRONG_SHORT
      .decision ===
      "SHORT_CANDIDATE" &&
    outputs.STRONG_SHORT
      .tradeable === true,

  longShortNotAddedTogether:
    outputs
      .DIRECTIONAL_CONFLICT
      .scores.long <
      70 &&
    outputs
      .DIRECTIONAL_CONFLICT
      .scores.short <
      70,

  conflictDoesNotCreateFakeConviction:
    outputs
      .DIRECTIONAL_CONFLICT
      .scores.separation <
      25,

  independentCounterTradeNotHardKilled:
    outputs
      .INDEPENDENT_COUNTER_TREND_LONG
      .preferredDirection ===
      "LONG" &&
    outputs
      .INDEPENDENT_COUNTER_TREND_LONG
      .tradeable ===
      true,

  counterTradeExposureReduced:
    outputs
      .INDEPENDENT_COUNTER_TREND_LONG
      .risk
      .exposureMultiplier <
      0.9,

  insufficientDataRejected:
    outputs
      .INSUFFICIENT_DATA
      .decision ===
      "INSUFFICIENT_DATA",

  coordinatorCannotExecute:
    Object.values(
      outputs,
    ).every(
      x =>
        x.noExecutionAuthority ===
        true,
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
    "\nPHASE 5.6 FAILED — one or more invariants failed.",
  );

  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.6 PASSED — directional consensus behavior is valid.",
  );
}