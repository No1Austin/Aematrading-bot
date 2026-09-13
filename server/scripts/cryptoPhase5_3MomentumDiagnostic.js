import "dotenv/config";

import runMomentum from "../src/crypto/trading/engines/cryptoTradingMomentumEngine.js";

const scenarios = [
  {
    name: "STRONG_LONG",
    measurements: {
      change1hPercent: 3.2,
      change4hPercent: 6.5,
      change24hPercent: 11,
      change7dPercent: 19,
    },
  },

  {
    name: "STRONG_SHORT",
    measurements: {
      change1hPercent: -3.5,
      change4hPercent: -6.8,
      change24hPercent: -12,
      change7dPercent: -20,
    },
  },

  {
    name: "BULLISH_REVERSAL",
    measurements: {
      change1hPercent: 2.5,
      change4hPercent: -3,
      change24hPercent: -7,
      change7dPercent: -10,
    },
  },

  {
    name: "BEARISH_REVERSAL",
    measurements: {
      change1hPercent: -2.8,
      change4hPercent: 3.5,
      change24hPercent: 8,
      change7dPercent: 14,
    },
  },

  {
    name: "MIXED",
    measurements: {
      change1hPercent: 1,
      change4hPercent: -2,
      change24hPercent: 3,
      change7dPercent: -5,
    },
  },

  {
    name: "BULLISH_EXHAUSTION",
    measurements: {
      change1hPercent: -2,
      change4hPercent: 5,
      change24hPercent: 28,
      change7dPercent: 42,
    },
  },

  {
    name: "BEARISH_EXHAUSTION",
    measurements: {
      change1hPercent: 2,
      change4hPercent: -5,
      change24hPercent: -28,
      change7dPercent: -40,
    },
  },
];

const rows = [];

for (const scenario of scenarios) {
  const result = await runMomentum(scenario);

  rows.push({
    scenario: scenario.name,
    direction: result.direction,
    long: result.longSupport,
    short: result.shortSupport,
    confidence: result.confidence,
    quality: result.quality,
    reasons:
      result.reasons?.join(", ") || "NONE",
    risks:
      result.risks?.join(", ") || "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.3A — MOMENTUM ENGINE\n"
);

console.table(rows);

const byName = Object.fromEntries(
  rows.map((row) => [row.scenario, row])
);

console.log("\nINVARIANTS");

console.log({
  strongLongDetected:
    byName.STRONG_LONG?.direction === "LONG",

  strongShortDetected:
    byName.STRONG_SHORT?.direction === "SHORT",

  bullishReversalRecognized:
    byName.BULLISH_REVERSAL?.long > 0,

  bearishReversalRecognized:
    byName.BEARISH_REVERSAL?.short > 0,

  mixedMomentumNotOverconfident:
    byName.MIXED?.confidence < 0.8,

  bullishExhaustionProtected:
    byName.BULLISH_EXHAUSTION?.risks?.includes(
      "BULLISH_MOVE_SHOWING_EXHAUSTION"
    ),

  bearishExhaustionProtected:
    byName.BEARISH_EXHAUSTION?.risks?.includes(
      "BEARISH_MOVE_SHOWING_EXHAUSTION"
    ),
});