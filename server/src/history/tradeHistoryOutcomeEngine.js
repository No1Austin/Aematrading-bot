// server/src/history/tradeHistoryOutcomeEngine.js

/**
 * ============================================================
 * TRADE HISTORY OUTCOME ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Convert matched historical trade analogues into a structured
 * outcome signal for the current trade candidate.
 *
 * This engine answers:
 *
 * "When setups like this happened before, what happened?"
 *
 * IMPORTANT
 * ---------
 *
 * This engine does NOT execute trades.
 * This engine does NOT override the Decision Gate.
 *
 * It produces intelligence that can later be consumed by:
 *
 * - scoring
 * - consensus
 * - decision gate
 * - monitoring
 *
 * SAFETY PRINCIPLES
 * -----------------
 *
 * 1. Require meaningful sample size.
 * 2. Weight outcomes by setup similarity.
 * 3. Missing realized-R data must not become zero.
 * 4. A few lucky trades must not produce HIGH confidence.
 * 5. Historical outcome and similarity remain separate concepts.
 * 6. The engine fails safely when evidence is weak.
 */

export const HISTORY_OUTCOME_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    NO_MATCHES:
      "NO_MATCHES",

    INVALID_INPUT:
      "INVALID_INPUT",

    ERROR:
      "ERROR",
  });

export const HISTORY_OUTCOME_SIGNAL =
  Object.freeze({
    STRONGLY_SUPPORTIVE:
      "STRONGLY_SUPPORTIVE",

    SUPPORTIVE:
      "SUPPORTIVE",

    NEUTRAL:
      "NEUTRAL",

    CAUTION:
      "CAUTION",

    STRONGLY_NEGATIVE:
      "STRONGLY_NEGATIVE",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

export const HISTORY_CONFIDENCE =
  Object.freeze({
    HIGH:
      "HIGH",

    MEDIUM:
      "MEDIUM",

    LOW:
      "LOW",

    INSUFFICIENT:
      "INSUFFICIENT",
  });

export const DEFAULT_HISTORY_OUTCOME_CONFIG =
  Object.freeze({
    minimumMatches: 3,

    mediumConfidenceMatches: 6,

    highConfidenceMatches: 12,

    minimumAverageSimilarity: 0.72,

    highConfidenceSimilarity: 0.82,

    strongSupportExpectancyR: 0.75,

    supportExpectancyR: 0.25,

    cautionExpectancyR: -0.15,

    strongNegativeExpectancyR: -0.5,

    strongSupportWinRate: 0.65,

    supportWinRate: 0.55,

    cautionWinRate: 0.45,

    strongNegativeWinRate: 0.35,

    minimumRObservations: 2,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  return Number.isFinite(
    Number(value),
  );
}

function clamp(
  value,
  min = 0,
  max = 1,
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  return Math.min(
    Math.max(
      Number(value),
      min,
    ),
    max,
  );
}

function round(
  value,
  decimals = 4,
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
        factor,
    ) / factor
  );
}

function normalizeOutcome(
  value,
) {
  const normalized =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (
    normalized === "WIN" ||
    normalized === "LOSS" ||
    normalized === "BREAKEVEN"
  ) {
    return normalized;
  }

  return "UNKNOWN";
}

function median(
  values,
) {
  const numbers =
    values
      .filter(
        (value) =>
          isFiniteNumber(value),
      )
      .map(
        Number,
      )
      .sort(
        (a, b) =>
          a - b,
      );

  if (
    numbers.length === 0
  ) {
    return null;
  }

  const middle =
    Math.floor(
      numbers.length / 2,
    );

  if (
    numbers.length % 2 === 1
  ) {
    return numbers[
      middle
    ];
  }

  return (
    numbers[
      middle - 1
    ] +
    numbers[
      middle
    ]
  ) / 2;
}

/**
 * ============================================================
 * WEIGHT
 * ============================================================
 *
 * Similarity is the primary weight.
 *
 * 0.95 similarity should contribute more than 0.72.
 */

function resolveWeight(
  match,
) {
  if (
    !isFiniteNumber(
      match?.similarity,
    )
  ) {
    return null;
  }

  const similarity =
    clamp(
      match.similarity,
    );

  if (
    similarity === null ||
    similarity <= 0
  ) {
    return null;
  }

  return similarity;
}

/**
 * ============================================================
 * R VALUE
 * ============================================================
 *
 * Support both field names because the history store currently
 * stores finalR, while analogue results may expose realizedR.
 */

function resolveRealizedR(
  match,
) {
  const candidates = [
    match?.realizedR,
    match?.finalR,
    match?.rMultiple,
  ];

  for (
    const value
    of candidates
  ) {
    if (
      isFiniteNumber(
        value,
      )
    ) {
      return Number(
        value,
      );
    }
  }

  return null;
}

/**
 * ============================================================
 * BASIC STATS
 * ============================================================
 */

function calculateOutcomeStats(
  matches,
) {
  let winCount = 0;
  let lossCount = 0;
  let breakevenCount = 0;
  let unknownCount = 0;

  let weightedWins = 0;
  let weightedLosses = 0;
  let weightedBreakevens = 0;
  let totalOutcomeWeight = 0;

  let weightedRTotal = 0;
  let totalRWeight = 0;

  const rValues = [];
  const similarities = [];

  let sameSymbolCount = 0;
  let crossSymbolCount = 0;

  for (
    const match
    of matches
  ) {
    const weight =
      resolveWeight(
        match,
      );

    if (
      weight === null
    ) {
      continue;
    }

    similarities.push(
      weight,
    );

    if (
      match?.sameSymbol ===
      true
    ) {
      sameSymbolCount += 1;
    } else {
      crossSymbolCount += 1;
    }

    const outcome =
      normalizeOutcome(
        match?.outcome,
      );

    if (
      outcome === "WIN"
    ) {
      winCount += 1;

      weightedWins +=
        weight;

      totalOutcomeWeight +=
        weight;
    } else if (
      outcome === "LOSS"
    ) {
      lossCount += 1;

      weightedLosses +=
        weight;

      totalOutcomeWeight +=
        weight;
    } else if (
      outcome ===
      "BREAKEVEN"
    ) {
      breakevenCount += 1;

      weightedBreakevens +=
        weight;

      totalOutcomeWeight +=
        weight;
    } else {
      unknownCount += 1;
    }

    const realizedR =
      resolveRealizedR(
        match,
      );

    if (
      realizedR !== null
    ) {
      rValues.push(
        realizedR,
      );

      weightedRTotal +=
        realizedR *
        weight;

      totalRWeight +=
        weight;
    }
  }

  const knownOutcomes =
    winCount +
    lossCount +
    breakevenCount;

  const weightedWinRate =
    totalOutcomeWeight > 0
      ? weightedWins /
        totalOutcomeWeight
      : null;

  const weightedLossRate =
    totalOutcomeWeight > 0
      ? weightedLosses /
        totalOutcomeWeight
      : null;

  const weightedBreakevenRate =
    totalOutcomeWeight > 0
      ? weightedBreakevens /
        totalOutcomeWeight
      : null;

  const rawWinRate =
    knownOutcomes > 0
      ? winCount /
        knownOutcomes
      : null;

  const expectancyR =
    totalRWeight > 0
      ? weightedRTotal /
        totalRWeight
      : null;

  const averageR =
    rValues.length > 0
      ? (
          rValues.reduce(
            (sum, value) =>
              sum +
              Number(value),
            0,
          ) /
          rValues.length
        )
      : null;

  const medianR =
    median(
      rValues,
    );

  const bestR =
    rValues.length > 0
      ? Math.max(
          ...rValues,
        )
      : null;

  const worstR =
    rValues.length > 0
      ? Math.min(
          ...rValues,
        )
      : null;

  const averageSimilarity =
    similarities.length > 0
      ? (
          similarities.reduce(
            (sum, value) =>
              sum +
              Number(value),
            0,
          ) /
          similarities.length
        )
      : null;

  return {
    totalMatches:
      matches.length,

    knownOutcomes,

    winCount,
    lossCount,
    breakevenCount,
    unknownCount,

    rawWinRate:
      rawWinRate !== null
        ? round(
            rawWinRate,
            4,
          )
        : null,

    weightedWinRate:
      weightedWinRate !== null
        ? round(
            weightedWinRate,
            4,
          )
        : null,

    weightedLossRate:
      weightedLossRate !== null
        ? round(
            weightedLossRate,
            4,
          )
        : null,

    weightedBreakevenRate:
      weightedBreakevenRate !== null
        ? round(
            weightedBreakevenRate,
            4,
          )
        : null,

    averageR:
      averageR !== null
        ? round(
            averageR,
            4,
          )
        : null,

    medianR:
      medianR !== null
        ? round(
            medianR,
            4,
          )
        : null,

    bestR:
      bestR !== null
        ? round(
            bestR,
            4,
          )
        : null,

    worstR:
      worstR !== null
        ? round(
            worstR,
            4,
          )
        : null,

    expectancyR:
      expectancyR !== null
        ? round(
            expectancyR,
            4,
          )
        : null,

    rObservationCount:
      rValues.length,

    averageSimilarity:
      averageSimilarity !==
        null
        ? round(
            averageSimilarity,
            4,
          )
        : null,

    sameSymbolCount,

    crossSymbolCount,
  };
}

/**
 * ============================================================
 * CONFIDENCE
 * ============================================================
 */

function classifyConfidence({
  stats,
  config,
}) {
  if (
    stats.totalMatches <
      config.minimumMatches ||
    stats.averageSimilarity ===
      null ||
    stats.averageSimilarity <
      config.minimumAverageSimilarity
  ) {
    return HISTORY_CONFIDENCE
      .INSUFFICIENT;
  }

  if (
    stats.totalMatches >=
      config.highConfidenceMatches &&
    stats.averageSimilarity >=
      config.highConfidenceSimilarity
  ) {
    return HISTORY_CONFIDENCE
      .HIGH;
  }

  if (
    stats.totalMatches >=
      config.mediumConfidenceMatches
  ) {
    return HISTORY_CONFIDENCE
      .MEDIUM;
  }

  return HISTORY_CONFIDENCE
    .LOW;
}

/**
 * ============================================================
 * SIGNAL
 * ============================================================
 */

function classifySignal({
  stats,
  confidence,
  config,
}) {
  if (
    confidence ===
    HISTORY_CONFIDENCE
      .INSUFFICIENT
  ) {
    return HISTORY_OUTCOME_SIGNAL
      .INSUFFICIENT_DATA;
  }

  const expectancy =
    stats.expectancyR;

  const winRate =
    stats.weightedWinRate;

  /**
   * If R data is unavailable, win rate can still provide
   * limited intelligence.
   */

  if (
    expectancy !== null
  ) {
    if (
      expectancy >=
        config
          .strongSupportExpectancyR &&
      winRate !== null &&
      winRate >=
        config
          .strongSupportWinRate
    ) {
      return HISTORY_OUTCOME_SIGNAL
        .STRONGLY_SUPPORTIVE;
    }

    if (
      expectancy >=
        config
          .supportExpectancyR &&
      (
        winRate === null ||
        winRate >=
          config
            .supportWinRate
      )
    ) {
      return HISTORY_OUTCOME_SIGNAL
        .SUPPORTIVE;
    }

    if (
      expectancy <=
        config
          .strongNegativeExpectancyR &&
      winRate !== null &&
      winRate <=
        config
          .strongNegativeWinRate
    ) {
      return HISTORY_OUTCOME_SIGNAL
        .STRONGLY_NEGATIVE;
    }

    if (
      expectancy <=
        config
          .cautionExpectancyR ||
      (
        winRate !== null &&
        winRate <
          config
            .cautionWinRate
      )
    ) {
      return HISTORY_OUTCOME_SIGNAL
        .CAUTION;
    }

    return HISTORY_OUTCOME_SIGNAL
      .NEUTRAL;
  }

  if (
    winRate !== null
  ) {
    if (
      winRate >=
      config
        .strongSupportWinRate
    ) {
      return HISTORY_OUTCOME_SIGNAL
        .SUPPORTIVE;
    }

    if (
      winRate <
      config
        .cautionWinRate
    ) {
      return HISTORY_OUTCOME_SIGNAL
        .CAUTION;
    }
  }

  return HISTORY_OUTCOME_SIGNAL
    .NEUTRAL;
}

/**
 * ============================================================
 * DIRECTIONAL SUPPORT
 * ============================================================
 *
 * Produces normalized support so this engine can later join
 * scoring/consensus like the other intelligence engines.
 */

function buildDirectionalSupport({
  signal,
  confidence,
}) {
  const confidenceMultiplier =
    confidence ===
    HISTORY_CONFIDENCE.HIGH
      ? 1
      : confidence ===
          HISTORY_CONFIDENCE.MEDIUM
        ? 0.8
        : confidence ===
            HISTORY_CONFIDENCE.LOW
          ? 0.6
          : 0;

  let aligned = 0.5;

  switch (signal) {
    case HISTORY_OUTCOME_SIGNAL
      .STRONGLY_SUPPORTIVE:
      aligned = 0.9;
      break;

    case HISTORY_OUTCOME_SIGNAL
      .SUPPORTIVE:
      aligned = 0.72;
      break;

    case HISTORY_OUTCOME_SIGNAL
      .NEUTRAL:
      aligned = 0.5;
      break;

    case HISTORY_OUTCOME_SIGNAL
      .CAUTION:
      aligned = 0.35;
      break;

    case HISTORY_OUTCOME_SIGNAL
      .STRONGLY_NEGATIVE:
      aligned = 0.15;
      break;

    default:
      return {
        aligned: null,
        opposite: null,
      };
  }

  const adjusted =
    0.5 +
    (
      aligned -
      0.5
    ) *
      confidenceMultiplier;

  return {
    aligned:
      round(
        clamp(
          adjusted,
        ),
        4,
      ),

    opposite:
      round(
        clamp(
          1 -
          adjusted,
        ),
        4,
      ),
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeTradeHistoryOutcomes({
  matches = [],
  side = null,
  symbol = null,
  config = {},
} = {}) {
  try {
    const mergedConfig = {
      ...DEFAULT_HISTORY_OUTCOME_CONFIG,
      ...config,
    };

    if (
      !Array.isArray(
        matches,
      )
    ) {
      return {
        approved: false,

        engine:
          "TRADE_HISTORY_OUTCOME",

        status:
          HISTORY_OUTCOME_STATUS
            .INVALID_INPUT,

        signal:
          HISTORY_OUTCOME_SIGNAL
            .INSUFFICIENT_DATA,

        confidence:
          HISTORY_CONFIDENCE
            .INSUFFICIENT,

        stats: null,

        directionalSupport: {
          long: null,
          short: null,
        },

        reasons: [
          "Historical matches must be an array.",
        ],

        warnings: [],

        errors: [],
      };
    }

    if (
      matches.length === 0
    ) {
      return {
        approved: true,

        engine:
          "TRADE_HISTORY_OUTCOME",

        status:
          HISTORY_OUTCOME_STATUS
            .NO_MATCHES,

        signal:
          HISTORY_OUTCOME_SIGNAL
            .INSUFFICIENT_DATA,

        confidence:
          HISTORY_CONFIDENCE
            .INSUFFICIENT,

        stats: {
          totalMatches: 0,
        },

        directionalSupport: {
          long: null,
          short: null,
        },

        reasons: [
          "No historical analogues were available.",
        ],

        warnings: [],

        errors: [],
      };
    }

    const stats =
      calculateOutcomeStats(
        matches,
      );

    const confidence =
      classifyConfidence({
        stats,
        config:
          mergedConfig,
      });

    const signal =
      classifySignal({
        stats,
        confidence,
        config:
          mergedConfig,
      });

    const support =
      buildDirectionalSupport({
        signal,
        confidence,
      });

    const normalizedSide =
      String(side ?? "")
        .trim()
        .toUpperCase();

    const directionalSupport =
      normalizedSide === "LONG"
        ? {
            long:
              support.aligned,

            short:
              support.opposite,
          }
        : normalizedSide ===
            "SHORT"
          ? {
              long:
                support.opposite,

              short:
                support.aligned,
            }
          : {
              long: null,
              short: null,
            };

    const insufficient =
      confidence ===
      HISTORY_CONFIDENCE
        .INSUFFICIENT;

    const reasons = [];

    if (
      stats.totalMatches <
      mergedConfig.minimumMatches
    ) {
      reasons.push(
        `Only ${stats.totalMatches} historical analogue(s) were available; minimum required is ${mergedConfig.minimumMatches}.`,
      );
    }

    if (
      stats.averageSimilarity !==
        null &&
      stats.averageSimilarity <
        mergedConfig
          .minimumAverageSimilarity
    ) {
      reasons.push(
        `Average historical similarity was ${round(
          stats.averageSimilarity *
            100,
          2,
        )}%, below the required threshold.`,
      );
    }

    if (
      !insufficient
    ) {
      reasons.push(
        `Historical outcome signal classified as ${signal}.`,
      );
    }

    const warnings = [];

    if (
      stats.rObservationCount <
      mergedConfig
        .minimumRObservations
    ) {
      warnings.push(
        "Historical R-multiple sample is limited.",
      );
    }

    if (
      stats.unknownCount >
      0
    ) {
      warnings.push(
        `${stats.unknownCount} historical trade(s) had unknown outcome classification.`,
      );
    }

    return {
      approved: true,

      engine:
        "TRADE_HISTORY_OUTCOME",

      status:
        insufficient
          ? HISTORY_OUTCOME_STATUS
              .INSUFFICIENT_DATA
          : HISTORY_OUTCOME_STATUS
              .COMPLETE,

      symbol:
        symbol
          ? String(symbol)
              .trim()
              .toUpperCase()
          : null,

      side:
        normalizedSide ===
          "LONG" ||
        normalizedSide ===
          "SHORT"
          ? normalizedSide
          : null,

      signal,

      confidence,

      stats,

      directionalSupport,

      reasons,

      warnings,

      errors: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "TRADE_HISTORY_OUTCOME",

      status:
        HISTORY_OUTCOME_STATUS
          .ERROR,

      signal:
        HISTORY_OUTCOME_SIGNAL
          .INSUFFICIENT_DATA,

      confidence:
        HISTORY_CONFIDENCE
          .INSUFFICIENT,

      stats: null,

      directionalSupport: {
        long: null,
        short: null,
      },

      reasons: [],

      warnings: [
        "Historical outcome analysis failed safely.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default
  analyzeTradeHistoryOutcomes;