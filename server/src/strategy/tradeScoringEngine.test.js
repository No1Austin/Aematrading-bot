// server/src/strategy/tradeScoringEngine.test.js
import {
  calculateSideScore,
  scoreTradeOpportunity,
  FINAL_SCORING_CONFIG,
} from "./tradeScoringEngine.js";

import {
  TRADE_SIDE,
} from "../config/riskConfig.js";

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function directional({
  long,
  short,
  approved = true,
  status = "COMPLETE",
} = {}) {
  return {
    approved,
    status,
    directionalSupport: {
      long,
      short,
    },
  };
}

function technical({
  long,
  short,
  trend = "BULLISH",
  bias = "LONG",
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",
    directionalSupport: {
      long,
      short,
    },
    trend: {
      direction: trend,
    },
    bias: {
      direction: bias,
    },
  };
}

function liquidity({
  qualityScore = 0.9,
  approved = true,
  status = "COMPLETE",
} = {}) {
  return {
    approved,
    status,
    qualityScore,
  };
}

function riskReward({
  long,
  short,
  status = "COMPLETE",
} = {}) {
  return {
    approved: true,
    status,
    directionalSupport: {
      long,
      short,
    },
  };
}

function runScenario(name, input, validate) {
  console.log("\n====================================");
  console.log(`TEST: ${name}`);
  console.log("====================================");

  const result =
    scoreTradeOpportunity(
      input,
    );

  console.dir(
    result,
    {
      depth: null,
    },
  );

  assertCondition(
    result &&
      result.engine ===
        "TRADE_SCORING",
    `${name}: invalid TRADE_SCORING result.`,
  );

  validate?.(result);

  console.log(
    `PASS: ${name}`,
  );

  return result;
}

/**
 * ============================================================
 * 1. VERIFY CONFIG
 * ============================================================
 */

assertCondition(
  FINAL_SCORING_CONFIG.minimumScore === 80,
  "Minimum trade score must remain 80.",
);

const weightTotal =
  Object.values(
    FINAL_SCORING_CONFIG.weights,
  ).reduce(
    (sum, value) =>
      sum + Number(value),
    0,
  );

assertCondition(
  weightTotal === 100,
  `Final scoring weights must total 100, received ${weightTotal}.`,
);

/**
 * ============================================================
 * 2. STRONG LONG CANDIDATE
 * ============================================================
 */

runScenario(
  "Strong LONG candidate",
  {
    symbol: "AAPL",

    technical:
      technical({
        long: 0.95,
        short: 0.05,
        trend:
          "STRONG_BULLISH",
        bias: "LONG",
      }),

    macro:
      directional({
        long: 0.85,
        short: 0.15,
      }),

    marketRegime:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    events:
      directional({
        long: 0.80,
        short: 0.20,
      }),

    company:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    country:
      directional({
        long: 0.75,
        short: 0.25,
      }),

    social:
      directional({
        long: 0.70,
        short: 0.30,
      }),

    historical:
      directional({
        long: 0.75,
        short: 0.25,
      }),

    liquidity:
      liquidity({
        qualityScore: 0.95,
      }),

    riskReward:
      riskReward({
        long: 0.90,
        short: 0.10,
      }),

    consensus:
      directional({
        long: 0.90,
        short: 0.10,
      }),
  },
  (result) => {
    assertCondition(
      result.approved === true,
      "Strong LONG scenario should be approved.",
    );

    assertCondition(
      result.preferredSide ===
        TRADE_SIDE.LONG,
      "Strong LONG scenario should prefer LONG.",
    );

    assertCondition(
      result.preferredScore >= 80,
      "Strong LONG scenario should exceed 80.",
    );

    assertCondition(
      result.tradeEligible === true,
      "Strong LONG scenario should be trade eligible.",
    );

    assertCondition(
      result.status ===
        "TRADE_CANDIDATE",
      "Strong LONG scenario should return TRADE_CANDIDATE.",
    );
  },
);

/**
 * ============================================================
 * 3. STRONG SHORT CANDIDATE
 * ============================================================
 */

runScenario(
  "Strong SHORT candidate",
  {
    symbol: "TSLA",

    technical:
      technical({
        long: 0.05,
        short: 0.95,
        trend:
          "STRONG_BEARISH",
        bias: "SHORT",
      }),

    macro:
      directional({
        long: 0.15,
        short: 0.85,
      }),

    marketRegime:
      directional({
        long: 0.10,
        short: 0.90,
      }),

    events:
      directional({
        long: 0.20,
        short: 0.80,
      }),

    company:
      directional({
        long: 0.10,
        short: 0.90,
      }),

    country:
      directional({
        long: 0.25,
        short: 0.75,
      }),

    social:
      directional({
        long: 0.30,
        short: 0.70,
      }),

    historical:
      directional({
        long: 0.25,
        short: 0.75,
      }),

    liquidity:
      liquidity({
        qualityScore: 0.95,
      }),

    riskReward:
      riskReward({
        long: 0.10,
        short: 0.90,
      }),

    consensus:
      directional({
        long: 0.10,
        short: 0.90,
      }),
  },
  (result) => {
    assertCondition(
      result.preferredSide ===
        TRADE_SIDE.SHORT,
      "Strong SHORT scenario should prefer SHORT.",
    );

    assertCondition(
      result.preferredScore >= 80,
      "Strong SHORT scenario should exceed 80.",
    );

    assertCondition(
      result.tradeEligible === true,
      "Strong SHORT scenario should be eligible.",
    );
  },
);

/**
 * ============================================================
 * 4. BELOW THRESHOLD
 * ============================================================
 */

runScenario(
  "Below threshold",
  {
    symbol: "MSFT",

    technical:
      technical({
        long: 0.55,
        short: 0.45,
      }),

    macro:
      directional({
        long: 0.55,
        short: 0.45,
      }),

    marketRegime:
      directional({
        long: 0.55,
        short: 0.45,
      }),

    events:
      directional({
        long: 0.50,
        short: 0.50,
      }),

    company:
      directional({
        long: 0.55,
        short: 0.45,
      }),

    country:
      directional({
        long: 0.50,
        short: 0.50,
      }),

    social:
      directional({
        long: 0.55,
        short: 0.45,
      }),

    historical:
      directional({
        long: 0.50,
        short: 0.50,
      }),

    liquidity:
      liquidity({
        qualityScore: 0.80,
      }),

    riskReward:
      riskReward({
        long: 0.60,
        short: 0.40,
      }),

    consensus:
      directional({
        long: 0.55,
        short: 0.45,
      }),
  },
  (result) => {
    assertCondition(
      result.tradeEligible === false,
      "Weak setup must not be eligible.",
    );

    assertCondition(
      result.preferredScore < 80 ||
        result.ambiguous === true,
      "Weak setup should fail threshold or ambiguity.",
    );
  },
);

/**
 * ============================================================
 * 5. AMBIGUOUS LONG/SHORT
 * ============================================================
 */

runScenario(
  "Ambiguous directional scores",
  {
    symbol: "NVDA",

    technical:
      technical({
        long: 0.82,
        short: 0.78,
      }),

    macro:
      directional({
        long: 0.78,
        short: 0.74,
      }),

    marketRegime:
      directional({
        long: 0.80,
        short: 0.76,
      }),

    events:
      directional({
        long: 0.78,
        short: 0.74,
      }),

    company:
      directional({
        long: 0.80,
        short: 0.76,
      }),

    country:
      directional({
        long: 0.76,
        short: 0.72,
      }),

    social:
      directional({
        long: 0.75,
        short: 0.71,
      }),

    historical:
      directional({
        long: 0.78,
        short: 0.74,
      }),

    liquidity:
      liquidity({
        qualityScore: 0.95,
      }),

    riskReward:
      riskReward({
        long: 0.82,
        short: 0.78,
      }),

    consensus:
      directional({
        long: 0.80,
        short: 0.76,
      }),
  },
  (result) => {
    assertCondition(
      result.ambiguous === true,
      "Close LONG/SHORT scores should be ambiguous.",
    );

    assertCondition(
      result.preferredSide === null,
      "Ambiguous setup should not select a side.",
    );

    assertCondition(
      result.tradeEligible === false,
      "Ambiguous setup must not be trade eligible.",
    );

    assertCondition(
      result.status ===
        "AMBIGUOUS",
      "Ambiguous setup should return AMBIGUOUS.",
    );
  },
);

/**
 * ============================================================
 * 6. EVENT FREEZE
 * ============================================================
 */

runScenario(
  "Event freeze blocks strong trade",
  {
    symbol: "META",

    technical:
      technical({
        long: 0.95,
        short: 0.05,
      }),

    macro:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    marketRegime:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    events: {
      ...directional({
        long: 0.90,
        short: 0.10,
      }),

      eventFreeze: {
        active: true,
      },
    },

    company:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    country:
      directional({
        long: 0.85,
        short: 0.15,
      }),

    social:
      directional({
        long: 0.80,
        short: 0.20,
      }),

    historical:
      directional({
        long: 0.85,
        short: 0.15,
      }),

    liquidity:
      liquidity({
        qualityScore: 0.95,
      }),

    riskReward:
      riskReward({
        long: 0.95,
        short: 0.05,
      }),

    consensus:
      directional({
        long: 0.95,
        short: 0.05,
      }),
  },
  (result) => {
    assertCondition(
      result.eventFreeze === true,
      "Event freeze should be detected.",
    );

    assertCondition(
      result.tradeEligible === false,
      "Event freeze must block eligibility.",
    );

    assertCondition(
      result.status ===
        "EVENT_FREEZE",
      "Event freeze should return EVENT_FREEZE.",
    );
  },
);

/**
 * ============================================================
 * 7. REQUIRED ENGINE MISSING
 * ============================================================
 */

runScenario(
  "Missing required liquidity blocks candidate",
  {
    symbol: "AMD",

    technical:
      technical({
        long: 0.95,
        short: 0.05,
      }),

    macro:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    marketRegime:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    events:
      directional({
        long: 0.85,
        short: 0.15,
      }),

    company:
      directional({
        long: 0.90,
        short: 0.10,
      }),

    country:
      directional({
        long: 0.80,
        short: 0.20,
      }),

    social:
      directional({
        long: 0.80,
        short: 0.20,
      }),

    historical:
      directional({
        long: 0.85,
        short: 0.15,
      }),

    liquidity: null,

    riskReward:
      riskReward({
        long: 0.90,
        short: 0.10,
      }),

    consensus:
      directional({
        long: 0.90,
        short: 0.10,
      }),
  },
  (result) => {
    assertCondition(
      result.tradeEligible === false,
      "Missing required liquidity must block candidate.",
    );

    const preferred =
      result.long.score >=
      result.short.score
        ? result.long
        : result.short;

    assertCondition(
      preferred.missingRequired.includes(
        "LIQUIDITY",
      ),
      "LIQUIDITY should be listed as missing required input.",
    );
  },
);

/**
 * ============================================================
 * 8. SIDE SCORE VALIDATION
 * ============================================================
 */

const invalidSide =
  calculateSideScore({
    side: "INVALID",
  });

assertCondition(
  invalidSide.approved === false,
  "Invalid trade side must fail.",
);

/**
 * ============================================================
 * 9. SCORECARD TOTALS AND COMPONENT CAPS
 * ============================================================
 */

const scorecardCheck =
  scoreTradeOpportunity({
    symbol: "GOOG",

    technical:
      technical({
        long: 1,
        short: 0,
      }),

    macro:
      directional({
        long: 1,
        short: 0,
      }),

    marketRegime:
      directional({
        long: 1,
        short: 0,
      }),

    events:
      directional({
        long: 1,
        short: 0,
      }),

    company:
      directional({
        long: 1,
        short: 0,
      }),

    country:
      directional({
        long: 1,
        short: 0,
      }),

    social:
      directional({
        long: 1,
        short: 0,
      }),

    historical:
      directional({
        long: 1,
        short: 0,
      }),

    liquidity:
      liquidity({
        qualityScore: 1,
      }),

    riskReward:
      riskReward({
        long: 1,
        short: 0,
      }),

    consensus:
      directional({
        long: 1,
        short: 0,
      }),
  });

assertCondition(
  scorecardCheck.long.score <= 100,
  "LONG score must never exceed 100.",
);

assertCondition(
  scorecardCheck.short.score <= 100,
  "SHORT score must never exceed 100.",
);

assertCondition(
  scorecardCheck
    .scorecard
    .long
    .CONSENSUS
    .maximum === 5,
  "Consensus maximum must be exactly 5 points.",
);

assertCondition(
  scorecardCheck
    .scorecard
    .long
    .HISTORICAL
    .maximum === 5,
  "Historical maximum must be exactly 5 points.",
);

console.log(
  "\n====================================",
);

console.log(
  "SUCCESS — FINAL TRADE SCORING TESTS PASSED",
);

console.log(
  "====================================\n",
);
