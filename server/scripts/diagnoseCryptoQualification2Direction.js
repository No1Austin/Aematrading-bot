import evaluateCryptoQualification2
  from "../src/crypto/qualification/cryptoQualification2Engine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function engine({
  direction = "NEUTRAL",
  strength = null,
  bullishStrength = null,
  bearishStrength = null,
  score = 70,
  coverage = 0.8,
  confidence = 80,
} = {}) {
  return {
    status: "READY",
    available: true,
    score,
    coverage,
    confidence,
    direction,
    directionStrength: strength,
    ...(bullishStrength === null ? {} : { bullishStrength }),
    ...(bearishStrength === null ? {} : { bearishStrength }),
  };
}

function evaluate(candidate, technical, fundamental, supporting = null) {
  return evaluateCryptoQualification2(
    candidate,
    { technical, fundamental, supporting },
  );
}

const bullish =
  evaluate(
    { preferredDirection: "LONG" },
    engine({ bullishStrength: 72, bearishStrength: 28 }),
    engine({ bullishStrength: 68, bearishStrength: 32 }),
    engine({ bullishStrength: 65, bearishStrength: 35 }),
  );

const bearish =
  evaluate(
    { preferredDirection: "SHORT" },
    engine({ bullishStrength: 25, bearishStrength: 75 }),
    engine({ bullishStrength: 30, bearishStrength: 70 }),
    engine({ bullishStrength: 35, bearishStrength: 65 }),
  );

/*
 * Discovery says LONG, Deep Research says SHORT.
 * Q2 must reverse to SHORT rather than testing only LONG.
 */
const reversal =
  evaluate(
    {
      preferredDirection: "LONG",
      opportunityRanking: {
        preferredDirection: "LONG",
      },
    },
    engine({ bullishStrength: 25, bearishStrength: 76 }),
    engine({ bullishStrength: 30, bearishStrength: 72 }),
    engine({ bullishStrength: 38, bearishStrength: 62 }),
  );

/*
 * Mandatory pillars disagree: neither side gets independent confirmation.
 */
const conflict =
  evaluate(
    { preferredDirection: "LONG" },
    engine({ bullishStrength: 75, bearishStrength: 25 }),
    engine({ bullishStrength: 25, bearishStrength: 75 }),
  );

const lowCoverage =
  evaluate(
    {},
    engine({
      bullishStrength: 75,
      bearishStrength: 25,
      coverage: 0.3,
    }),
    engine({
      bullishStrength: 70,
      bearishStrength: 30,
      coverage: 0.8,
    }),
  );

/*
 * Both sides pass but are too close to distinguish.
 */
const ambiguous =
  evaluate(
    {},
    engine({ bullishStrength: 58, bearishStrength: 56 }),
    engine({ bullishStrength: 57, bearishStrength: 55 }),
  );

assert(bullish.qualified === true, "Bullish case should qualify");
assert(bullish.decision === "LONG", "Bullish case should decide LONG");

assert(bearish.qualified === true, "Bearish case should qualify");
assert(bearish.decision === "SHORT", "Bearish case should decide SHORT");

assert(reversal.qualified === true, "Reversal case should qualify");
assert(reversal.decision === "SHORT", "Deep Research must be able to reverse discovery direction");
assert(reversal.discoveryPreferredDirection === "LONG", "Discovery direction should remain visible diagnostically");
assert(reversal.discoveryDirectionAuthority === false, "Discovery direction must have no Q2 authority");

assert(conflict.qualified === false, "Conflicting mandatory pillars must not qualify");
assert(conflict.decision === "NO_TRADE", "Conflict must produce NO_TRADE");

assert(lowCoverage.qualified === false, "Low mandatory coverage must block");
assert(
  lowCoverage.failures.some(x => x.code === "TECHNICAL_COVERAGE_INSUFFICIENT"),
  "Low technical coverage blocker missing",
);

assert(ambiguous.qualified === false, "Ambiguous dual-side case must not qualify");
assert(ambiguous.decision === "NO_TRADE", "Ambiguous case must produce NO_TRADE");

for (const row of [bullish, bearish, reversal, conflict, lowCoverage, ambiguous]) {
  assert(row.executionAuthority === false, "Execution authority must remain false");
  assert(row.liveExecution === false, "Live execution must remain false");
  assert(row.paperExecutionAuthority === false, "Paper execution authority must remain false in Q2");
}

console.log(JSON.stringify({
  passed: true,
  phase: "6.21",
  independentDirectionalEvaluation: true,
  discoveryDirectionAuthority: false,
  bullish: bullish.decision,
  bearish: bearish.decision,
  discoveryLongDeepResearchShort: reversal.decision,
  mandatoryPillarConflict: conflict.decision,
  insufficientCoverage: lowCoverage.decision,
  ambiguousDualSide: ambiguous.decision,
  executionAuthority: false,
  liveExecution: false,
  paperExecutionAuthority: false,
}, null, 2));
