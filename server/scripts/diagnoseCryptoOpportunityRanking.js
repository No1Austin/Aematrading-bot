import {
  rankCryptoOpportunityCandidate,
} from "../src/crypto/opportunity/cryptoOpportunityRankingEngine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const bullish = rankCryptoOpportunityCandidate({
  qualified: true,
  symbol: "BULL",
  measurements: {
    change1hPercent: 3,
    change4hPercent: 6,
    change24hPercent: 10,
  },
});

const bearish = rankCryptoOpportunityCandidate({
  qualified: true,
  symbol: "BEAR",
  measurements: {
    change1hPercent: -3,
    change4hPercent: -6,
    change24hPercent: -10,
  },
});

const mixed = rankCryptoOpportunityCandidate({
  qualified: true,
  symbol: "MIX",
  measurements: {
    change1hPercent: 3,
    change4hPercent: -6,
    change24hPercent: 10,
  },
});

const missing = rankCryptoOpportunityCandidate({
  qualified: true,
  symbol: "NONE",
  measurements: {},
});

assert(bullish.preferredDirection === "LONG", "Bullish candidate must rank LONG");
assert(bullish.longOpportunityScore > 0, "Bullish LONG score must be positive");
assert(bullish.shortOpportunityScore === 0, "Bullish evidence must not manufacture SHORT support");

assert(bearish.preferredDirection === "SHORT", "Bearish candidate must rank SHORT");
assert(bearish.shortOpportunityScore > 0, "Bearish SHORT score must be positive");
assert(bearish.longOpportunityScore === 0, "Bearish evidence must not manufacture LONG support");

assert(mixed.longOpportunityScore > 0, "Mixed evidence must preserve LONG support");
assert(mixed.shortOpportunityScore > 0, "Mixed evidence must preserve SHORT support");
assert(
  Math.abs((mixed.longOpportunityScore + mixed.shortOpportunityScore) - 100) > 0.0001,
  "Independent LONG/SHORT scores must not be forced complements",
);

assert(missing.opportunityRanking.available === false, "Missing evidence must remain unavailable");
assert(missing.longOpportunityScore === null, "Missing evidence must not create LONG score");
assert(missing.shortOpportunityScore === null, "Missing evidence must not create SHORT score");

console.log(JSON.stringify({
  passed: true,
  phase: "6.20",
  canonicalMeasurementFields: true,
  independentLongShortScores: true,
  bullish: {
    long: bullish.longOpportunityScore,
    short: bullish.shortOpportunityScore,
  },
  bearish: {
    long: bearish.longOpportunityScore,
    short: bearish.shortOpportunityScore,
  },
  mixed: {
    long: mixed.longOpportunityScore,
    short: mixed.shortOpportunityScore,
  },
  missingEvidenceUnavailable: true,
  executionAuthority: false,
  liveExecution: false,
}, null, 2));
