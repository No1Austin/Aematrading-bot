import runMarketRegime
  from "../src/crypto/trading/engines/cryptoTradingMarketRegimeEngine.js";

const scenarios = [
  {
    name: "STRONG_BULL",
    context: {
      btc: {
        change1hPercent: 1.2,
        change4hPercent: 3.4,
        change24hPercent: 7,
        change7dPercent: 15,
      },
      eth: {
        change1hPercent: 1.5,
        change4hPercent: 4,
        change24hPercent: 8,
        change7dPercent: 18,
      },
      breadth: {
        advancingPercent: 78,
        decliningPercent: 22,
      },
      volatility: {
        realizedVolatility: 42,
        averageAbsolute24hMove: 4,
      },
      derivatives: {
        fundingStress: 25,
        liquidationStress: 15,
      },
    },
  },

  {
    name: "STRONG_BEAR",
    context: {
      btc: {
        change1hPercent: -1.4,
        change4hPercent: -4,
        change24hPercent: -8,
        change7dPercent: -16,
      },
      eth: {
        change1hPercent: -1.8,
        change4hPercent: -5,
        change24hPercent: -9,
        change7dPercent: -19,
      },
      breadth: {
        advancingPercent: 18,
        decliningPercent: 82,
      },
      volatility: {
        realizedVolatility: 48,
        averageAbsolute24hMove: 5,
      },
      derivatives: {
        fundingStress: 35,
        liquidationStress: 30,
      },
    },
  },

  {
    name: "CHOPPY",
    context: {
      btc: {
        change1hPercent: 0.3,
        change4hPercent: -0.2,
        change24hPercent: 0.4,
        change7dPercent: -0.5,
      },
      eth: {
        change1hPercent: -0.2,
        change4hPercent: 0.3,
        change24hPercent: -0.4,
        change7dPercent: 0.6,
      },
      breadth: {
        advancingPercent: 51,
        decliningPercent: 49,
      },
      volatility: {
        realizedVolatility: 30,
        averageAbsolute24hMove: 2,
      },
      derivatives: {
        fundingStress: 20,
        liquidationStress: 15,
      },
    },
  },

  {
    name: "LIQUIDATION_STRESS",
    context: {
      btc: {
        change1hPercent: -5,
        change4hPercent: -9,
        change24hPercent: -15,
        change7dPercent: -20,
      },
      eth: {
        change1hPercent: -6,
        change4hPercent: -11,
        change24hPercent: -18,
        change7dPercent: -24,
      },
      breadth: {
        advancingPercent: 10,
        decliningPercent: 90,
      },
      volatility: {
        realizedVolatility: 95,
        averageAbsolute24hMove: 14,
      },
      derivatives: {
        fundingStress: 90,
        liquidationStress: 95,
      },
    },
  },

  {
    name: "BULLISH_REVERSAL_ATTEMPT",
    context: {
      btc: {
        change1hPercent: 2.4,
        change4hPercent: 1.8,
        change24hPercent: -4,
        change7dPercent: -12,
      },
      eth: {
        change1hPercent: 3,
        change4hPercent: 2,
        change24hPercent: -5,
        change7dPercent: -14,
      },
      breadth: {
        advancingPercent: 62,
        decliningPercent: 38,
      },
      volatility: {
        realizedVolatility: 55,
        averageAbsolute24hMove: 5,
      },
      derivatives: {
        fundingStress: 40,
        liquidationStress: 35,
      },
    },
  },
];

const results = [];

for (const scenario of scenarios) {
  const result = await runMarketRegime(
    {},
    {
      marketContext: scenario.context,
    }
  );

  results.push({
    scenario: scenario.name,
    regime: result.regime,
    direction: result.direction,
    long: result.longSupport,
    short: result.shortSupport,
    longCompat: result.longCompatibility,
    shortCompat: result.shortCompatibility,
    volatility: result.volatilityRegime,
    stress: result.marketStress,
    exposure: result.exposureMultiplier,
    confidence: result.confidence,
    risks: result.risks.join(", ") || "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.3B — MARKET REGIME ENGINE\n"
);

console.table(results);

const byName = Object.fromEntries(
  results.map((result) => [result.scenario, result])
);

const invariants = {
  strongBullDetected:
    byName.STRONG_BULL.direction === "LONG" &&
    byName.STRONG_BULL.long >
      byName.STRONG_BULL.short,

  strongBearDetected:
    byName.STRONG_BEAR.direction === "SHORT" &&
    byName.STRONG_BEAR.short >
      byName.STRONG_BEAR.long,

  choppyRecognized:
    byName.CHOPPY.regime === "CHOPPY",

  liquidationStressRecognized:
    byName.LIQUIDATION_STRESS.regime ===
      "LIQUIDATION_STRESS" &&
    byName.LIQUIDATION_STRESS.stress === true,

  extremeVolatilityReducesExposure:
    byName.LIQUIDATION_STRESS.exposure < 1,

  counterRegimeLongNotKilled:
    byName.STRONG_BEAR.longCompat >= 0.25,

  counterRegimeShortNotKilled:
    byName.STRONG_BULL.shortCompat >= 0.25,

  reversalAttemptRecognized:
    byName.BULLISH_REVERSAL_ATTEMPT.risks.includes(
      "POSSIBLE_MARKET_BULLISH_REVERSAL"
    ),
};

console.log("\nINVARIANTS");
console.log(invariants);

const passed = Object.values(invariants).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.3B FAILED — one or more invariants failed."
  );
  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.3B PASSED — market regime behavior is valid."
  );
}