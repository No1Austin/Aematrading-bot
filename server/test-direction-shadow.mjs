import evaluateBotEngineShadow from
  "./src/crypto/bot/diagnostics/botEngineShadowEvaluator.js";

const candidates = [
  {
    symbol: "TEST_STRONG",
    setup: { approved: true },
    directionDecision: {
      direction: "LONG",
      separation: 45,
      contributions: {
        technical: { available: true, long: 82, short: 18 },
        marketStructure: { available: true, long: 92, short: 8 }
      }
    }
  },
  {
    symbol: "TEST_CONFLICT",
    setup: { approved: true },
    directionDecision: {
      direction: "LONG",
      separation: 40,
      contributions: {
        technical: { available: true, long: 45, short: 55 },
        marketStructure: { available: true, long: 95, short: 5 }
      }
    }
  },
  {
    symbol: "TEST_MISSING",
    setup: { approved: true },
    directionDecision: {
      direction: "SHORT",
      separation: 38,
      contributions: {
        technical: { available: false },
        marketStructure: { available: true, long: 12, short: 88 }
      }
    }
  }
];

for (const candidate of candidates) {
  const result = evaluateBotEngineShadow(candidate);

  console.log(
    "\n" + candidate.symbol,
    JSON.stringify(result.experiments, null, 2)
  );
}
