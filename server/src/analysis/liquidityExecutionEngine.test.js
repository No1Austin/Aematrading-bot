// server/src/analysis/liquidityExecutionEngine.test.js

import analyzeLiquidityExecution, {
  EXECUTION_DECISION,
  MARKET_SESSION,
} from "./liquidityExecutionEngine.js";

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runScenario(name, input, validate) {
  console.log("\n====================================");
  console.log(`TEST: ${name}`);
  console.log("====================================");

  const result = analyzeLiquidityExecution(input);

  console.dir(result, { depth: null });

  if (!result || result.engine !== "LIQUIDITY_EXECUTION") {
    throw new Error(`${name}: invalid engine result.`);
  }

  if (Number(result.maximumScore) !== 5) {
    throw new Error(`${name}: maximumScore must remain 5.`);
  }

  const points = Number(result.pointContribution ?? 0);

  if (!Number.isFinite(points) || points < 0 || points > 5) {
    throw new Error(`${name}: pointContribution must remain between 0 and 5.`);
  }

  validate?.(result);

  console.log(`PASS: ${name}`);

  return result;
}

const base = {
  symbol: "TEST",
  price: 100,
  bid: 99.95,
  ask: 100.05,
  currentVolume: 1_500_000,
  averageVolume: 1_000_000,
  positionValue: 2_000,
  volatilityPercent: 0.01,
  session: MARKET_SESSION.REGULAR,
};

runScenario(
  "Allow healthy liquidity",
  { ...base },
  (result) => {
    assertCondition(result.approved === true, "Healthy liquidity should be approved.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.ALLOW,
      "Healthy liquidity should return ALLOW.",
    );
    assertCondition(result.blockers.length === 0, "Healthy liquidity should have no blockers.");
  },
);

runScenario(
  "Block missing live bid ask",
  {
    ...base,
    bid: null,
    ask: null,
  },
  (result) => {
    assertCondition(result.approved === false, "Missing bid/ask must fail closed.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.BLOCK,
      "Missing bid/ask must BLOCK.",
    );
    assertCondition(
      result.blockers.some((item) =>
        String(item).toLowerCase().includes("bid/ask"),
      ),
      "Missing quote should create a bid/ask blocker.",
    );
    assertCondition(result.pointContribution === 0, "Blocked trade must award zero liquidity points.");
  },
);

runScenario(
  "Block missing volume",
  {
    ...base,
    currentVolume: null,
    averageVolume: null,
  },
  (result) => {
    assertCondition(result.approved === false, "Missing volume must fail closed.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.BLOCK,
      "Missing volume must BLOCK.",
    );
    assertCondition(
      result.blockers.some((item) =>
        String(item).toLowerCase().includes("volume"),
      ),
      "Missing volume should create a volume blocker.",
    );
  },
);

runScenario(
  "Block wide spread",
  {
    ...base,
    bid: 99,
    ask: 101,
  },
  (result) => {
    assertCondition(result.approved === false, "Wide spread must not be approved.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.BLOCK,
      "Wide spread must BLOCK.",
    );
    assertCondition(
      result.blockers.some((item) =>
        String(item).toLowerCase().includes("spread"),
      ),
      "Wide spread should create a spread blocker.",
    );
  },
);

runScenario(
  "Block low dollar volume",
  {
    ...base,
    price: 10,
    bid: 9.99,
    ask: 10.01,
    currentVolume: 25_000,
    averageVolume: 25_000,
  },
  (result) => {
    assertCondition(result.approved === false, "Low dollar volume must not be approved.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.BLOCK,
      "Low dollar volume must BLOCK.",
    );
    assertCondition(
      result.blockers.some((item) =>
        String(item).toLowerCase().includes("dollar volume"),
      ),
      "Low dollar volume should create a blocker.",
    );
  },
);

runScenario(
  "Block excessive position participation",
  {
    ...base,
    averageVolume: 20_000,
    currentVolume: 20_000,
    positionValue: 500_000,
  },
  (result) => {
    assertCondition(result.approved === false, "Dangerous participation must not be approved.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.BLOCK,
      "Dangerous participation must BLOCK.",
    );
    assertCondition(
      result.blockers.some((item) =>
        String(item).toLowerCase().includes("position"),
      ),
      "Dangerous participation should create a position-size blocker.",
    );
  },
);

runScenario(
  "Block closed market",
  {
    ...base,
    session: MARKET_SESSION.CLOSED,
  },
  (result) => {
    assertCondition(result.approved === false, "Closed market must not be approved.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.BLOCK,
      "Closed market must BLOCK.",
    );
    assertCondition(
      result.blockers.some((item) =>
        String(item).toLowerCase().includes("session"),
      ),
      "Closed market should create a session blocker.",
    );
  },
);

const regular = runScenario(
  "Regular-session reference",
  {
    ...base,
    session: MARKET_SESSION.REGULAR,
  },
  (result) => {
    assertCondition(result.approved === true, "Regular-session setup should be approved.");
  },
);

const preMarket = runScenario(
  "Pre-market liquidity penalty",
  {
    ...base,
    session: MARKET_SESSION.PRE_MARKET,
  },
  (result) => {
    assertCondition(
      result.warnings.some((item) =>
        String(item).toLowerCase().includes("extended-hours"),
      ),
      "Pre-market result should warn about extended-hours risk.",
    );
  },
);

assertCondition(
  preMarket.qualityScore < regular.qualityScore,
  "Pre-market liquidity score should be lower than regular-session score.",
);

runScenario(
  "Reduce size for elevated participation",
  {
    ...base,
    positionValue: 100_000,
  },
  (result) => {
    assertCondition(result.approved === true, "Moderate participation should remain executable.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.REDUCE_SIZE,
      "Elevated participation should return REDUCE_SIZE.",
    );
  },
);

runScenario(
  "Block excessive estimated slippage",
  {
    ...base,
    volatilityPercent: 0.30,
  },
  (result) => {
    assertCondition(result.approved === false, "Excessive slippage must not be approved.");
    assertCondition(
      result.executionDecision === EXECUTION_DECISION.BLOCK,
      "Excessive slippage must BLOCK.",
    );
    assertCondition(
      result.blockers.some((item) =>
        String(item).toLowerCase().includes("slippage"),
      ),
      "Excessive slippage should create a slippage blocker.",
    );
  },
);

console.log("\n====================================");
console.log("SUCCESS — LIQUIDITY EXECUTION ENGINE TESTS PASSED");
console.log("====================================\n");
