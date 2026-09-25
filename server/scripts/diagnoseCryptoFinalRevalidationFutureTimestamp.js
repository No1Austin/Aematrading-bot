/**
 * AEMA Crypto — Phase 6.48
 * Final Revalidation Future-Timestamp Audit
 *
 * Diagnostic only. No production changes.
 */

import fs from "node:fs";

const file =
  "src/crypto/revalidation/cryptoFinalMarketRiskRevalidationEngine.js";

const source =
  fs.readFileSync(file, "utf8");

const ok = (condition, message) => {
  if (!condition) throw new Error(message);
};

const usesClampToZero =
  /Math\.max\s*\(\s*0\s*,\s*nowMs\s*-\s*measuredAt\s*\)/m
    .test(source);

const hasExplicitFutureTimestampFailure =
  /MARKET_DATA_(?:TIMESTAMP_)?(?:IN_)?FUTURE|FUTURE_(?:MARKET_)?(?:DATA_)?TIMESTAMP/
    .test(source);

const hasClockSkewPolicy =
  /clockSkew|maxFuture|futureTolerance|futureSkew/i
    .test(source);

ok(
  usesClampToZero,
  "Expected current Math.max(0, nowMs - measuredAt) freshness contract was not found.",
);

const nowMs = Date.parse("2026-09-19T21:00:00.000Z");
const maxAgeMs = 120_000;

function currentAge(timestamp) {
  const measuredAt = Date.parse(timestamp);
  return Math.max(0, nowMs - measuredAt);
}

const cases = {
  recent: currentAge("2026-09-19T20:59:30.000Z"),
  stale: currentAge("2026-09-19T20:55:00.000Z"),
  future5s: currentAge("2026-09-19T21:00:05.000Z"),
  future5m: currentAge("2026-09-19T21:05:00.000Z"),
};

const currentContract = {
  recentAccepted:
    cases.recent <= maxAgeMs,
  staleRejected:
    cases.stale > maxAgeMs,
  future5sAgeMs:
    cases.future5s,
  future5mAgeMs:
    cases.future5m,
  future5sIncorrectlyFresh:
    cases.future5s <= maxAgeMs,
  future5mIncorrectlyFresh:
    cases.future5m <= maxAgeMs,
};

ok(
  currentContract.future5sIncorrectlyFresh,
  "Fixture expected future timestamp to be clamped to fresh.",
);
ok(
  currentContract.future5mIncorrectlyFresh,
  "Fixture expected far-future timestamp to be clamped to fresh.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.48",
  audit: {
    usesClampToZero,
    explicitFutureTimestampFailure:
      hasExplicitFutureTimestampFailure,
    explicitClockSkewPolicy:
      hasClockSkewPolicy,
    currentContract,
  },
  finding: {
    defectConfirmed:
      usesClampToZero &&
      !hasExplicitFutureTimestampFailure,
    defect:
      "FUTURE_MARKET_TIMESTAMP_CAN_BE_CLAMPED_TO_AGE_ZERO_AND_ACCEPTED_AS_FRESH",
    consequence:
      "FRESHNESS_AUTHORITY_CAN_BE_GRANTED_TO_A_FUTURE_DATED_MARKET_SNAPSHOT",
    productionFixRequired: true,
    requiredPolicy:
      "EXPLICIT_BOUNDED_FUTURE_CLOCK_SKEW_OR_FAIL_CLOSED",
  },
  preservedTargets: {
    qualification2: true,
    canonicalWeights: "20_20_60",
    riskThresholds: true,
    paperOnly: true,
    liveExecution: false,
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage:
    "FINAL_REVALIDATION_FUTURE_TIMESTAMP_FIX",
}, null, 2));
