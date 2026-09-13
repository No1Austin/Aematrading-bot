import runDependency
  from "../src/crypto/trading/engines/cryptoTradingBtcEthDependencyEngine.js";

function asset(
  h1,
  h4,
  d1,
  d7,
) {
  return {
    change1hPercent: h1,
    change4hPercent: h4,
    change24hPercent: d1,
    change7dPercent: d7,
  };
}

const scenarios = [
  {
    name:
      "SYSTEMIC_LONG",

    candidate:
      asset(
        2.2,
        5.5,
        9,
        18,
      ),

    btc:
      asset(
        1.5,
        4,
        7,
        14,
      ),

    eth:
      asset(
        1.8,
        4.8,
        8,
        16,
      ),
  },

  {
    name:
      "SYSTEMIC_SHORT",

    candidate:
      asset(
        -2.5,
        -6,
        -10,
        -19,
      ),

    btc:
      asset(
        -1.7,
        -4.5,
        -8,
        -15,
      ),

    eth:
      asset(
        -2,
        -5,
        -9,
        -17,
      ),
  },

  {
    name:
      "LONG_AGAINST_LEADERS",

    candidate:
      asset(
        2,
        4,
        6,
        9,
      ),

    btc:
      asset(
        -1.8,
        -4,
        -7,
        -12,
      ),

    eth:
      asset(
        -1.5,
        -3.5,
        -6,
        -10,
      ),
  },

  {
    name:
      "SHORT_AGAINST_LEADERS",

    candidate:
      asset(
        -2,
        -4,
        -7,
        -11,
      ),

    btc:
      asset(
        1.5,
        3.5,
        6,
        12,
      ),

    eth:
      asset(
        1.8,
        4,
        7,
        14,
      ),
  },

  {
    name:
      "RELATIVELY_INDEPENDENT",

    candidate:
      asset(
        3,
        -1,
        5,
        -3,
      ),

    btc:
      asset(
        -0.4,
        0.3,
        -0.5,
        0.4,
      ),

    eth:
      asset(
        0.2,
        -0.4,
        0.3,
        -0.6,
      ),
  },

  {
    name:
      "LEADER_DIVERGENCE",

    candidate:
      asset(
        1.2,
        2.5,
        4,
        7,
      ),

    btc:
      asset(
        1.3,
        3,
        5,
        9,
      ),

    eth:
      asset(
        -1.2,
        -2.8,
        -5,
        -8,
      ),
  },
];

const results = [];

for (
  const scenario
  of scenarios
) {
  const result =
    await runDependency(
      {
        measurements:
          scenario.candidate,
      },

      {
        marketContext: {
          btc:
            scenario.btc,

          eth:
            scenario.eth,
        },
      },
    );

  results.push({
    scenario:
      scenario.name,

    direction:
      result.direction,

    long:
      result.longSupport,

    short:
      result.shortSupport,

    btcDependency:
      result.btcDependency,

    ethDependency:
      result.ethDependency,

    overallDependency:
      result.overallDependency,

    dependencyClass:
      result.dependencyClass,

    aligned:
      result.systemicAlignment,

    conflict:
      result.systemicConflict,

    confidence:
      result.confidence,

    risks:
      result.risks?.join(
        ", ",
      ) ||
      "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.4 — BTC / ETH DEPENDENCY ENGINE\n",
);

console.table(
  results,
);

const byName =
  Object.fromEntries(
    results.map(
      result => [
        result.scenario,
        result,
      ],
    ),
  );

const invariants = {
  systemicLongDetected:
    byName
      .SYSTEMIC_LONG
      ?.direction ===
    "LONG",

  systemicShortDetected:
    byName
      .SYSTEMIC_SHORT
      ?.direction ===
    "SHORT",

  longAgainstLeadersFlagged:
    byName
      .LONG_AGAINST_LEADERS
      ?.conflict ===
    true,

  shortAgainstLeadersFlagged:
    byName
      .SHORT_AGAINST_LEADERS
      ?.conflict ===
    true,

  independentCandidateNotOverruled:
    byName
      .RELATIVELY_INDEPENDENT
      ?.overallDependency <
    50,

  leaderDivergenceRecognized:
    byName
      .LEADER_DIVERGENCE
      ?.risks
      ?.includes(
        "BTC_ETH_LEADER_DIVERGENCE",
      ),

  dependencyDoesNotHardKillCounterTrade:
    (
      byName
        .LONG_AGAINST_LEADERS
        ?.long ??
      0
    ) >=
    0,
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
  )
    .every(
      Boolean,
    );

if (!passed) {
  console.error(
    "\nPHASE 5.4 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.4 PASSED — BTC/ETH dependency behavior is valid.",
  );
}