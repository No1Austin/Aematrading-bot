// server/src/strategy/tradeDecisionGate.test.js

import evaluateTradeDecision from "./tradeDecisionGate.js";

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildEngineStates(overrides = {}) {
  return {
    technical: {
      status: "COMPLETE",
    },

    macro: {
      status: "COMPLETE",
    },

    marketRegime: {
      status: "COMPLETE",
    },

    liquidity: {
      status: "COMPLETE",
    },

    riskReward: {
      status: "COMPLETE",
    },

    scoring: {
      status: "COMPLETE",
    },

    ...overrides,
  };
}

function buildScoring({
  side = "LONG",
  longScore = 90,
  shortScore = 20,
} = {}) {
  return {
    approved: true,
    status: "TRADE_CANDIDATE",
    preferredSide: side,
    long: {
      score: longScore,
    },
    short: {
      score: shortScore,
    },
  };
}

function buildLiquidity({
  executionDecision = "ALLOW",
  approved = true,
  status = "COMPLETE",
  qualityScore = 0.9,
  liquidityStatus = "GOOD",
} = {}) {
  return {
    approved,
    status,
    executionDecision,
    qualityScore,
    liquidityStatus,
  };
}

function buildRiskReward({
  longBlocked = false,
  shortBlocked = false,
  longApproved = true,
  shortApproved = true,
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",
    long: {
      approved: longApproved,
      blocked: longBlocked,
      status: longBlocked ? "BLOCKED" : "APPROVED",
      rewardRiskRatio: 2.5,
      entryPrice: 100,
      stopPrice: 98,
      targetPrice: 105,
    },
    short: {
      approved: shortApproved,
      blocked: shortBlocked,
      status: shortBlocked ? "BLOCKED" : "APPROVED",
      rewardRiskRatio: 2.5,
      entryPrice: 100,
      stopPrice: 102,
      targetPrice: 95,
    },
  };
}

function buildConsensus({
  direction = "LONG",
  confidence = 0.8,
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",
    direction,
    confidence,
    directionalSupport: {
      long:
        direction === "LONG"
          ? 0.85
          : direction === "SHORT"
            ? 0.15
            : 0.5,
      short:
        direction === "SHORT"
          ? 0.85
          : direction === "LONG"
            ? 0.15
            : 0.5,
    },
  };
}

function runScenario(
  name,
  input,
  validate,
) {
  console.log("\n====================================");
  console.log(`TEST: ${name}`);
  console.log("====================================");

  const result =
    evaluateTradeDecision(
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
        "TRADE_DECISION_GATE",
    `${name}: invalid decision gate result.`,
  );

  validate?.(result);

  console.log(`PASS: ${name}`);

  return result;
}

/**
 * ============================================================
 * 1. STRONG LONG PASSES TO RISK MANAGER
 * ============================================================
 */

runScenario(
  "Strong LONG proceeds to risk manager",
  {
    symbol: "AAPL",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 92,
        shortScore: 18,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus({
        direction: "LONG",
        confidence: 0.85,
      }),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.approved === true,
      "Strong LONG result should be approved.",
    );

    assertCondition(
      result.status ===
        "APPROVED_FOR_RISK",
      "Strong LONG should be APPROVED_FOR_RISK.",
    );

    assertCondition(
      result.decision ===
        "PROCEED_TO_RISK_MANAGER",
      "Strong LONG should proceed to risk manager.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        true,
      "Strong LONG should have canProceedToRiskManager=true.",
    );

    assertCondition(
      result.side === "LONG",
      "Expected LONG side.",
    );
  },
);

/**
 * ============================================================
 * 2. SCORE BELOW 80 BLOCKS
 * ============================================================
 */

runScenario(
  "Score below threshold blocks",
  {
    symbol: "MSFT",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 79,
        shortScore: 20,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Below-threshold score must block.",
    );

    assertCondition(
      result.status ===
        "BELOW_THRESHOLD",
      "Expected BELOW_THRESHOLD status.",
    );
  },
);

/**
 * ============================================================
 * 3. AMBIGUOUS SCORES BLOCK
 * ============================================================
 */

runScenario(
  "Ambiguous LONG and SHORT scores block",
  {
    symbol: "NVDA",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 84,
        shortScore: 80,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus({
        direction: "LONG",
      }),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Ambiguous direction must block.",
    );

    assertCondition(
      result.status ===
        "AMBIGUOUS",
      "Expected AMBIGUOUS status.",
    );
  },
);

/**
 * ============================================================
 * 4. EVENT FREEZE BLOCKS
 * ============================================================
 */

runScenario(
  "Event freeze blocks candidate",
  {
    symbol: "META",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 92,
        shortScore: 15,
      }),

    events: {
      eventFreeze: {
        active: true,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Event freeze must block.",
    );

    assertCondition(
      result.status ===
        "EVENT_FREEZE",
      "Expected EVENT_FREEZE status.",
    );
  },
);

/**
 * ============================================================
 * 5. LIQUIDITY BLOCK
 * ============================================================
 */

runScenario(
  "Liquidity block stops candidate",
  {
    symbol: "AMD",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 91,
        shortScore: 15,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity({
        executionDecision: "BLOCK",
      }),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.status ===
        "LIQUIDITY_BLOCK",
      "Expected LIQUIDITY_BLOCK status.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Liquidity block must stop risk evaluation.",
    );
  },
);

/**
 * ============================================================
 * 6. MISSING LIQUIDITY FAILS CLOSED
 * ============================================================
 */

runScenario(
  "Missing liquidity fails closed",
  {
    symbol: "AMD",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 91,
        shortScore: 15,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity: null,

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.status ===
        "LIQUIDITY_BLOCK",
      "Missing liquidity should produce LIQUIDITY_BLOCK.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Missing liquidity must fail closed.",
    );
  },
);

/**
 * ============================================================
 * 7. RISK/REWARD BLOCK
 * ============================================================
 */

runScenario(
  "Risk reward block stops candidate",
  {
    symbol: "TSLA",

    scoring:
      buildScoring({
        side: "SHORT",
        longScore: 12,
        shortScore: 90,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward({
        shortBlocked: true,
      }),

    consensus:
      buildConsensus({
        direction: "SHORT",
      }),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.status ===
        "RISK_REWARD_BLOCK",
      "Expected RISK_REWARD_BLOCK status.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Blocked risk/reward must stop candidate.",
    );
  },
);

/**
 * ============================================================
 * 8. CONSENSUS CONTRADICTION BLOCK
 * ============================================================
 */

runScenario(
  "Meaningful consensus contradiction blocks",
  {
    symbol: "AAPL",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 90,
        shortScore: 18,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus({
        direction: "SHORT",
        confidence: 0.90,
      }),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.status ===
        "CONSENSUS_CONFLICT",
      "Expected CONSENSUS_CONFLICT.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Strong contradictory consensus must block.",
    );
  },
);

/**
 * ============================================================
 * 9. CONFLICTED CONSENSUS WARNS BUT DOES NOT AUTO-BLOCK
 * ============================================================
 */

runScenario(
  "Conflicted consensus warns but may proceed",
  {
    symbol: "GOOG",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 90,
        shortScore: 20,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus({
        direction: "CONFLICTED",
        confidence: 0.15,
      }),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.canProceedToRiskManager ===
        true,
      "Conflicted but non-contradictory consensus should not auto-block.",
    );

    assertCondition(
      result.warnings.some(
        (warning) =>
          String(warning)
            .toLowerCase()
            .includes(
              "conflicted",
            ),
      ),
      "Conflicted consensus should produce a warning.",
    );
  },
);

/**
 * ============================================================
 * 10. REQUIRED ENGINE FAILURE BLOCK
 * ============================================================
 */

runScenario(
  "Required engine failure blocks",
  {
    symbol: "AAPL",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 92,
        shortScore: 15,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      buildEngineStates({
        technical: {
          status: "ERROR",
        },
      }),
  },
  (result) => {
    assertCondition(
      result.status ===
        "ENGINE_FAILURE",
      "Expected ENGINE_FAILURE.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Failed critical engine must block.",
    );
  },
);

/**
 * ============================================================
 * 11. REQUIRED ENGINE MISSING BLOCK
 * ============================================================
 */

const missingStates =
  buildEngineStates();

delete missingStates.macro;

runScenario(
  "Missing required engine data blocks",
  {
    symbol: "AAPL",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 92,
        shortScore: 15,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      missingStates,
  },
  (result) => {
    assertCondition(
      result.status ===
        "INSUFFICIENT_DATA",
      "Expected INSUFFICIENT_DATA.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Missing critical engine must block.",
    );
  },
);

/**
 * ============================================================
 * 12. REDUCE SIZE PROPAGATES WARNING
 * ============================================================
 */

runScenario(
  "Liquidity reduce size propagates",
  {
    symbol: "AMZN",

    scoring:
      buildScoring({
        side: "LONG",
        longScore: 90,
        shortScore: 20,
      }),

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity({
        executionDecision:
          "REDUCE_SIZE",
      }),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.canProceedToRiskManager ===
        true,
      "REDUCE_SIZE should still permit risk evaluation.",
    );

    assertCondition(
      result
        ?.execution
        ?.reduceSize === true,
      "REDUCE_SIZE should propagate to execution metadata.",
    );

    assertCondition(
      result.warnings.some(
        (warning) =>
          String(warning)
            .toLowerCase()
            .includes(
              "reducing position size",
            ),
      ),
      "REDUCE_SIZE should generate warning.",
    );
  },
);

/**
 * ============================================================
 * 13. MISSING SCORING FAILS CLOSED
 * ============================================================
 */

runScenario(
  "Missing scoring result fails closed",
  {
    symbol: "AAPL",

    scoring: null,

    events: {
      eventFreeze: {
        active: false,
      },
    },

    liquidity:
      buildLiquidity(),

    riskReward:
      buildRiskReward(),

    consensus:
      buildConsensus(),

    engineStates:
      buildEngineStates(),
  },
  (result) => {
    assertCondition(
      result.status ===
        "INSUFFICIENT_DATA",
      "Missing scoring should produce INSUFFICIENT_DATA.",
    );

    assertCondition(
      result.canProceedToRiskManager ===
        false,
      "Missing scoring must block.",
    );
  },
);

console.log(
  "\n====================================",
);

console.log(
  "SUCCESS — TRADE DECISION GATE TESTS PASSED",
);

console.log(
  "====================================\n",
);
