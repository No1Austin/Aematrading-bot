// server/src/analysis/tradeThesisMonitor.test.js

import {
  analyzeTradeThesis,
  createEntryThesisSnapshot,
  DEFAULT_TRADE_THESIS_CONFIG,
  EXPOSURE_ACTION,
  THESIS_STATUS,
} from "./tradeThesisMonitor.js";

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

function buildStrongLongInputs() {
  return {
    technical:
      directional({
        long: 0.92,
        short: 0.08,
      }),

    macro:
      directional({
        long: 0.78,
        short: 0.22,
      }),

    marketRegime:
      directional({
        long: 0.88,
        short: 0.12,
      }),

    events:
      directional({
        long: 0.80,
        short: 0.20,
      }),

    company:
      directional({
        long: 0.84,
        short: 0.16,
      }),

    country:
      directional({
        long: 0.72,
        short: 0.28,
      }),

    social:
      directional({
        long: 0.68,
        short: 0.32,
      }),

    historical:
      directional({
        long: 0.74,
        short: 0.26,
      }),

    liquidity:
      liquidity({
        qualityScore: 0.92,
      }),

    consensus:
      directional({
        long: 0.86,
        short: 0.14,
      }),
  };
}

function runScenario(
  name,
  fn,
) {
  console.log(
    "\n====================================",
  );

  console.log(
    `TEST: ${name}`,
  );

  console.log(
    "====================================",
  );

  const result =
    fn();

  console.dir(
    result,
    {
      depth: null,
    },
  );

  console.log(
    `PASS: ${name}`,
  );

  return result;
}

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const weightTotal =
  Object.values(
    DEFAULT_TRADE_THESIS_CONFIG
      .weights,
  ).reduce(
    (sum, value) =>
      sum + Number(value),
    0,
  );

assertCondition(
  weightTotal === 100,
  `Trade thesis weights must total 100, received ${weightTotal}.`,
);

/**
 * ============================================================
 * ENTRY SNAPSHOT
 * ============================================================
 */

const entryInputs =
  buildStrongLongInputs();

const entryThesis =
  runScenario(
    "Create strong LONG entry thesis",
    () =>
      createEntryThesisSnapshot({
        symbol: "AAPL",
        side: "LONG",
        entryScore: 90,
        originalShares: 200,
        ...entryInputs,
      }),
  );

assertCondition(
  entryThesis.approved === true,
  "Entry thesis should be approved.",
);

assertCondition(
  entryThesis.side === "LONG",
  "Entry thesis should preserve LONG side.",
);

assertCondition(
  entryThesis.entryConviction > 0.70,
  "Strong entry should have high conviction.",
);

/**
 * ============================================================
 * HEALTHY — HOLD
 * ============================================================
 */

const healthy =
  runScenario(
    "Healthy thesis holds full exposure",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis,
        currentExposureMultiplier: 1,
        ...buildStrongLongInputs(),
      }),
  );

assertCondition(
  healthy.thesisStatus ===
    THESIS_STATUS.HEALTHY,
  "Healthy thesis should remain HEALTHY.",
);

assertCondition(
  healthy.exposureAction ===
    EXPOSURE_ACTION.HOLD,
  "Healthy thesis should HOLD.",
);

assertCondition(
  healthy
    .recommendedExposureMultiplier ===
    1,
  "Healthy thesis should keep 100% exposure.",
);

/**
 * ============================================================
 * SOFT WEAKENING — REDUCE 25%
 * ============================================================
 */

const soft =
  runScenario(
    "Weakening causes defensive exposure reduction",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis,
        currentExposureMultiplier: 1,

        technical:
          directional({
            long: 0.52,
            short: 0.48,
          }),

        macro:
          directional({
            long: 0.62,
            short: 0.38,
          }),

        marketRegime:
          directional({
            long: 0.60,
            short: 0.40,
          }),

        events:
          directional({
            long: 0.60,
            short: 0.40,
          }),

        company:
          directional({
            long: 0.68,
            short: 0.32,
          }),

        country:
          directional({
            long: 0.62,
            short: 0.38,
          }),

        social:
          directional({
            long: 0.56,
            short: 0.44,
          }),

        historical:
          directional({
            long: 0.62,
            short: 0.38,
          }),

        liquidity:
          liquidity({
            qualityScore: 0.85,
          }),

        consensus:
          directional({
            long: 0.58,
            short: 0.42,
          }),
      }),
  );

assertCondition(
  soft.exposureAction ===
      EXPOSURE_ACTION.REDUCE_25 ||
    soft.exposureAction ===
      EXPOSURE_ACTION.REDUCE_50,
  "Soft-to-material weakening should reduce exposure.",
);

assertCondition(
  soft
    .recommendedExposureMultiplier <=
    0.75,
  "Weakening should target 75% exposure or less.",
);

/**
 * ============================================================
 * MATERIAL WEAKENING — REDUCE 50%
 * ============================================================
 */

const material =
  runScenario(
    "Material weakening reduces exposure by 50 percent",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis,
        currentExposureMultiplier: 1,

        technical:
          directional({
            long: 0.38,
            short: 0.62,
          }),

        macro:
          directional({
            long: 0.50,
            short: 0.50,
          }),

        marketRegime:
          directional({
            long: 0.42,
            short: 0.58,
          }),

        events:
          directional({
            long: 0.45,
            short: 0.55,
          }),

        company:
          directional({
            long: 0.52,
            short: 0.48,
          }),

        country:
          directional({
            long: 0.50,
            short: 0.50,
          }),

        social:
          directional({
            long: 0.44,
            short: 0.56,
          }),

        historical:
          directional({
            long: 0.50,
            short: 0.50,
          }),

        liquidity:
          liquidity({
            qualityScore: 0.78,
          }),

        consensus:
          directional({
            long: 0.42,
            short: 0.58,
          }),
      }),
  );

assertCondition(
  material.exposureAction ===
    EXPOSURE_ACTION.REDUCE_50 ||
    material.exposureAction ===
      EXPOSURE_ACTION.REDUCE_75,
  "Material deterioration should reduce exposure by at least 50%.",
);

assertCondition(
  material
    .recommendedExposureMultiplier <=
    0.50,
  "Material weakening should target 50% exposure or less.",
);

/**
 * ============================================================
 * SEVERE WEAKENING — REDUCE 75%
 * ============================================================
 */

const severe =
  runScenario(
    "Severe weakening reduces exposure heavily",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis,
        currentExposureMultiplier: 1,

        technical:
          directional({
            long: 0.25,
            short: 0.75,
          }),

        macro:
          directional({
            long: 0.38,
            short: 0.62,
          }),

        marketRegime:
          directional({
            long: 0.28,
            short: 0.72,
          }),

        events:
          directional({
            long: 0.32,
            short: 0.68,
          }),

        company:
          directional({
            long: 0.40,
            short: 0.60,
          }),

        country:
          directional({
            long: 0.42,
            short: 0.58,
          }),

        social:
          directional({
            long: 0.30,
            short: 0.70,
          }),

        historical:
          directional({
            long: 0.38,
            short: 0.62,
          }),

        liquidity:
          liquidity({
            qualityScore: 0.65,
          }),

        consensus:
          directional({
            long: 0.26,
            short: 0.74,
          }),
      }),
  );

assertCondition(
  severe.exposureAction ===
    EXPOSURE_ACTION.REDUCE_75 ||
    severe.exposureAction ===
      EXPOSURE_ACTION.EXIT,
  "Severe weakening should reduce heavily or exit.",
);

assertCondition(
  severe
    .recommendedExposureMultiplier <=
    0.25,
  "Severe weakening should leave at most 25% exposure.",
);

/**
 * ============================================================
 * INVALIDATED — EXIT
 * ============================================================
 */

const invalidated =
  runScenario(
    "Opposite conditions invalidate LONG thesis",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis,
        currentExposureMultiplier: 1,

        technical:
          directional({
            long: 0.08,
            short: 0.92,
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
            long: 0.08,
            short: 0.92,
          }),

        company:
          directional({
            long: 0.20,
            short: 0.80,
          }),

        country:
          directional({
            long: 0.20,
            short: 0.80,
          }),

        social:
          directional({
            long: 0.12,
            short: 0.88,
          }),

        historical:
          directional({
            long: 0.18,
            short: 0.82,
          }),

        liquidity:
          liquidity({
            qualityScore: 0.70,
          }),

        consensus:
          directional({
            long: 0.08,
            short: 0.92,
          }),
      }),
  );

assertCondition(
  invalidated.thesisStatus ===
    THESIS_STATUS.INVALIDATED,
  "Strong opposite evidence should invalidate thesis.",
);

assertCondition(
  invalidated.exposureAction ===
    EXPOSURE_ACTION.EXIT,
  "Invalidated thesis must recommend EXIT.",
);

assertCondition(
  invalidated
    .recommendedExposureMultiplier ===
    0,
  "Invalidated thesis must target zero exposure.",
);

/**
 * ============================================================
 * MISSING CRITICAL DATA — DEFENSIVE REDUCTION
 * ============================================================
 */

const missing =
  runScenario(
    "Missing critical thesis data reduces defensively",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis,
        currentExposureMultiplier: 1,

        technical: null,
        macro: null,
        marketRegime: null,
        events: null,
        company: null,
        country: null,
        social: null,
        historical: null,

        liquidity:
          liquidity({
            qualityScore: 0.80,
          }),

        consensus: null,
      }),
  );

assertCondition(
  missing.thesisStatus ===
    THESIS_STATUS
      .INSUFFICIENT_DATA,
  "Insufficient monitoring data should be flagged.",
);

assertCondition(
  missing
    .recommendedExposureMultiplier <=
    0.75,
  "Insufficient critical data should not preserve more than 75% exposure.",
);

/**
 * ============================================================
 * ONE-WAY EXPOSURE RULE
 * ============================================================
 */

const noReincrease =
  runScenario(
    "Exposure never increases after previous reduction",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis,

        /**
         * Position was previously cut to 50%.
         */
        currentExposureMultiplier:
          0.50,

        /**
         * Conditions have recovered.
         */
        ...buildStrongLongInputs(),
      }),
  );

assertCondition(
  noReincrease
    .recommendedExposureMultiplier <=
    0.50,
  "Thesis monitor must never increase previously reduced exposure.",
);

assertCondition(
  noReincrease.exposureAction ===
    EXPOSURE_ACTION.HOLD,
  "Recovered conditions should HOLD the reduced exposure, not add shares.",
);

/**
 * ============================================================
 * SHORT SIDE
 * ============================================================
 */

const shortEntryInputs = {
  technical:
    directional({
      long: 0.08,
      short: 0.92,
    }),

  macro:
    directional({
      long: 0.22,
      short: 0.78,
    }),

  marketRegime:
    directional({
      long: 0.12,
      short: 0.88,
    }),

  events:
    directional({
      long: 0.20,
      short: 0.80,
    }),

  company:
    directional({
      long: 0.16,
      short: 0.84,
    }),

  country:
    directional({
      long: 0.28,
      short: 0.72,
    }),

  social:
    directional({
      long: 0.32,
      short: 0.68,
    }),

  historical:
    directional({
      long: 0.26,
      short: 0.74,
    }),

  liquidity:
    liquidity({
      qualityScore: 0.92,
    }),

  consensus:
    directional({
      long: 0.14,
      short: 0.86,
    }),
};

const shortEntry =
  createEntryThesisSnapshot({
    symbol: "TSLA",
    side: "SHORT",
    entryScore: 91,
    originalShares: 100,
    ...shortEntryInputs,
  });

const shortHealthy =
  runScenario(
    "Healthy SHORT thesis remains open",
    () =>
      analyzeTradeThesis({
        symbol: "TSLA",
        side: "SHORT",
        entryThesis:
          shortEntry,
        currentExposureMultiplier:
          1,
        ...shortEntryInputs,
      }),
  );

assertCondition(
  shortHealthy.thesisStatus ===
    THESIS_STATUS.HEALTHY,
  "Healthy SHORT thesis should remain HEALTHY.",
);

assertCondition(
  shortHealthy.exposureAction ===
    EXPOSURE_ACTION.HOLD,
  "Healthy SHORT thesis should HOLD.",
);

/**
 * ============================================================
 * INVALID INPUT FAILS SAFE
 * ============================================================
 */

const invalid =
  runScenario(
    "Missing entry thesis fails safely",
    () =>
      analyzeTradeThesis({
        symbol: "AAPL",
        side: "LONG",
        entryThesis: null,
        ...buildStrongLongInputs(),
      }),
  );

assertCondition(
  invalid.approved === false,
  "Missing entry thesis must not be approved.",
);

assertCondition(
  invalid.exposureAction ===
    EXPOSURE_ACTION.HOLD,
  "Failure path must never increase exposure.",
);

console.log(
  "\n====================================",
);

console.log(
  "SUCCESS — TRADE THESIS MONITOR TESTS PASSED",
);

console.log(
  "====================================\n",
);
