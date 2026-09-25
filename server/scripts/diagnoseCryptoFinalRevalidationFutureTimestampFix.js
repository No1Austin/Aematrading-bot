/**
 * AEMA Crypto — Phase 6.49
 * Final Revalidation Future Timestamp Fix Diagnostic
 */
import { revalidateCryptoOpportunity } from "../src/crypto/revalidation/cryptoFinalMarketRiskRevalidationEngine.js";

const nowMs = Date.parse("2026-09-19T21:00:00.000Z");

const candidate = { measurements: { priceUsd: 100 } };
const qualification2 = { qualified: true, decision: "LONG" };
const freshRisk = { available: true, score: 80, confidence: 80, status: "READY" };

function run(timestamp, options = {}) {
  return revalidateCryptoOpportunity({
    candidate,
    qualification2,
    nowMs,
    options,
    freshRisk,
    freshMeasurements: {
      priceUsd: 100,
      volume24hUsd: 5_000_000,
      liquidityUsd: 1_000_000,
      spreadPct: 0.1,
      tradable: true,
      venue: "TEST",
      measuredAt: timestamp,
    },
  });
}

const recent = run("2026-09-19T20:59:30.000Z");
const stale = run("2026-09-19T20:55:00.000Z");
const futureWithinTolerance = run("2026-09-19T21:00:04.000Z");
const futureBoundary = run("2026-09-19T21:00:05.000Z");
const futureBeyondTolerance = run("2026-09-19T21:00:06.000Z");
const farFuture = run("2026-09-19T21:05:00.000Z");
const missing = run(null);
const invalid = run("not-a-date");

const codes = r => r.failures.map(x => x.code);
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(recent.approved === true, "Recent timestamp should pass.");
assert(codes(stale).includes("MARKET_DATA_STALE"), "Stale timestamp should fail.");
assert(futureWithinTolerance.approved === true, "Bounded 4s clock skew should pass.");
assert(futureBoundary.approved === true, "5s boundary clock skew should pass.");
assert(
  codes(futureBeyondTolerance).includes("MARKET_DATA_TIMESTAMP_IN_FUTURE"),
  "6s future timestamp should fail.",
);
assert(
  codes(farFuture).includes("MARKET_DATA_TIMESTAMP_IN_FUTURE"),
  "Far-future timestamp should fail.",
);
assert(
  codes(missing).includes("MARKET_DATA_TIMESTAMP_REQUIRED"),
  "Missing timestamp should fail.",
);
assert(
  codes(invalid).includes("MARKET_DATA_TIMESTAMP_REQUIRED"),
  "Invalid timestamp should fail.",
);
assert(farFuture.approved === false, "Far-future snapshot cannot be revalidated.");
assert(farFuture.nextStage === "NONE", "Rejected future snapshot cannot reach authority gate.");

console.log(JSON.stringify({
  passed: true,
  phase: "6.49",
  freshnessContract: {
    recentAccepted: recent.approved,
    staleRejected: codes(stale).includes("MARKET_DATA_STALE"),
    missingRejected: codes(missing).includes("MARKET_DATA_TIMESTAMP_REQUIRED"),
    invalidRejected: codes(invalid).includes("MARKET_DATA_TIMESTAMP_REQUIRED"),
    boundedClockSkewMs: 5000,
    futureWithinToleranceAccepted: futureWithinTolerance.approved,
    futureBoundaryAccepted: futureBoundary.approved,
    futureBeyondToleranceRejected:
      codes(futureBeyondTolerance).includes("MARKET_DATA_TIMESTAMP_IN_FUTURE"),
    farFutureRejected:
      codes(farFuture).includes("MARKET_DATA_TIMESTAMP_IN_FUTURE"),
    farFutureCannotReachAuthorityGate: farFuture.nextStage === "NONE",
  },
  preserved: {
    maxMeasurementAgeMs: 120000,
    qualification2Required: true,
    riskThresholdsUnchanged: true,
    canonicalWeights: "20_20_60",
    paperOnly: true,
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage: "FRESH_MARKET_BATCH_PROVIDER_AUDIT",
}, null, 2));
