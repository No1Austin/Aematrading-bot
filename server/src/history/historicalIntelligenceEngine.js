// server/src/history/historicalIntelligenceEngine.js

/**
 * ============================================================
 * HISTORICAL INTELLIGENCE ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Combine two independent forms of historical intelligence:
 *
 * 1. MARKET HISTORY
 *    Historical market analogue evidence.
 *
 * 2. BOT TRADE HISTORY
 *    Outcomes from similar trades previously completed
 *    by this bot.
 *
 * SCORING POLICY
 * --------------
 *
 * Historical intelligence contributes a maximum of 5 points:
 *
 * MARKET HISTORY:
 *   60% = maximum 3.0 points
 *
 * BOT TRADE HISTORY:
 *   40% = maximum 2.0 points
 *
 * IMPORTANT
 * ---------
 *
 * Missing evidence NEVER receives neutral points.
 *
 * Missing evidence NEVER causes the other source's points
 * to be redistributed.
 *
 * Similarity alone NEVER earns points.
 *
 * Negative historical evidence NEVER earns positive points.
 *
 * This engine does NOT execute trades.
 * This engine does NOT override risk controls.
 */

export const HISTORICAL_INTELLIGENCE_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",

    PARTIAL: "PARTIAL",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    INVALID_INPUT:
      "INVALID_INPUT",

    ERROR: "ERROR",
  });

export const HISTORICAL_INTELLIGENCE_SIGNAL =
  Object.freeze({
    STRONGLY_SUPPORTIVE:
      "STRONGLY_SUPPORTIVE",

    SUPPORTIVE:
      "SUPPORTIVE",

    WEAK_SUPPORT:
      "WEAK_SUPPORT",

    NEUTRAL:
      "NEUTRAL",

    CAUTION:
      "CAUTION",

    STRONGLY_NEGATIVE:
      "STRONGLY_NEGATIVE",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

export const HISTORICAL_INTELLIGENCE_CONFIG =
  Object.freeze({
    /**
     * Total contribution to the final trade score.
     */
    maximumPoints: 5,

    /**
     * Historical market setups.
     */
    marketHistoryMaximumPoints: 3,

    /**
     * Bot's own completed trades.
     */
    botHistoryMaximumPoints: 2,

    /**
     * Minimum evidence strength before weak historical
     * support is allowed to earn anything.
     */
    minimumSupport: 0.55,

    /**
     * Strong evidence thresholds.
     */
    supportiveThreshold: 0.65,

    strongSupportThreshold: 0.8,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(
  value,
) {
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
  if (
    !isFiniteNumber(
      value,
    )
  ) {
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
  if (
    !isFiniteNumber(
      value,
    )
  ) {
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
    ) /
    factor
  );
}

function normalizeDirection(
  value,
) {
  const direction =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return null;
}

function normalizeSignal(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

/**
 * ============================================================
 * DIRECTIONAL SUPPORT
 * ============================================================
 */

function resolveDirectionalSupport({
  result,
  side,
}) {
  const normalizedSide =
    normalizeDirection(
      side,
    );

  if (!normalizedSide) {
    return null;
  }

  const support =
    result
      ?.directionalSupport;

  if (
    !support ||
    typeof support !==
      "object"
  ) {
    return null;
  }

  const value =
    normalizedSide ===
    "LONG"
      ? support.long
      : support.short;

  return clamp(
    value,
  );
}

/**
 * ============================================================
 * CONFIDENCE MULTIPLIER
 * ============================================================
 *
 * Confidence does not create evidence.
 *
 * It can only reduce the contribution of evidence that
 * already exists.
 */

function confidenceMultiplier(
  confidence,
) {
  if (
    isFiniteNumber(
      confidence,
    )
  ) {
    return clamp(
      confidence,
    );
  }

  const normalized =
    String(
      confidence ?? "",
    )
      .trim()
      .toUpperCase();

  switch (
    normalized
  ) {
    case "HIGH":
      return 1;

    case "MEDIUM":
      return 0.8;

    case "LOW":
      return 0.6;

    default:
      return null;
  }
}

/**
 * ============================================================
 * POINT CALCULATION
 * ============================================================
 */

function calculatePositivePoints({
  support,
  confidence,
  maximumPoints,
}) {
  const safeSupport =
    clamp(
      support,
    );

  const safeConfidence =
    confidenceMultiplier(
      confidence,
    );

  if (
    safeSupport === null ||
    safeConfidence === null
  ) {
    return 0;
  }

  /**
   * Neutral / weak evidence receives no points.
   */
  if (
    safeSupport <
    HISTORICAL_INTELLIGENCE_CONFIG
      .minimumSupport
  ) {
    return 0;
  }

  /**
   * Scale support from:
   *
   * minimumSupport -> 0
   * 1.0            -> full points
   *
   * This prevents 55% evidence from receiving
   * 55% of the available points.
   */
  const normalizedStrength =
    clamp(
      (
        safeSupport -
        HISTORICAL_INTELLIGENCE_CONFIG
          .minimumSupport
      ) /
        (
          1 -
          HISTORICAL_INTELLIGENCE_CONFIG
            .minimumSupport
        ),
    );

  if (
    normalizedStrength ===
    null
  ) {
    return 0;
  }

  return round(
    maximumPoints *
      normalizedStrength *
      safeConfidence,
  );
}

/**
 * ============================================================
 * MARKET HISTORY
 * ============================================================
 */

function evaluateMarketHistory({
  historicalAnalogue,
  side,
}) {
  const maximumPoints =
    HISTORICAL_INTELLIGENCE_CONFIG
      .marketHistoryMaximumPoints;

  if (
    !historicalAnalogue ||
    historicalAnalogue
      .approved !== true
  ) {
    return {
      available: false,

      source:
        "MARKET_HISTORY",

      maximumPoints,

      points: 0,

      support: null,

      confidence: null,

      status:
        historicalAnalogue
          ?.status ??
        "INSUFFICIENT_DATA",

      reason:
        "Historical market analogue evidence is unavailable.",
    };
  }

  const support =
    resolveDirectionalSupport({
      result:
        historicalAnalogue,

      side,
    });

  if (
    support === null
  ) {
    return {
      available: false,

      source:
        "MARKET_HISTORY",

      maximumPoints,

      points: 0,

      support: null,

      confidence:
        historicalAnalogue
          ?.confidence ??
        null,

      status:
        "INSUFFICIENT_DATA",

      reason:
        "Historical market directional support is unavailable.",
    };
  }

  const points =
    calculatePositivePoints({
      support,

      confidence:
        historicalAnalogue
          ?.confidence,

      maximumPoints,
    });

  return {
    available: true,

    source:
      "MARKET_HISTORY",

    maximumPoints,

    points,

    support:
      round(
        support,
      ),

    confidence:
      historicalAnalogue
        ?.confidence ??
      null,

    status:
      historicalAnalogue
        ?.status ??
      "COMPLETE",

    rawScore:
      isFiniteNumber(
        historicalAnalogue
          ?.rawScore,
      )
        ? Number(
            historicalAnalogue
              .rawScore,
          )
        : null,

    reason:
      points > 0
        ? "Historical market setups support the candidate direction."
        : "Historical market evidence does not provide sufficient positive support.",
  };
}

/**
 * ============================================================
 * BOT HISTORY
 * ============================================================
 */

function isNegativeBotSignal(
  signal,
) {
  const normalized =
    normalizeSignal(
      signal,
    );

  return (
    normalized ===
      "CAUTION" ||
    normalized ===
      "STRONGLY_NEGATIVE"
  );
}

function isNeutralBotSignal(
  signal,
) {
  const normalized =
    normalizeSignal(
      signal,
    );

  return (
    normalized ===
      "NEUTRAL" ||
    normalized ===
      "INSUFFICIENT_DATA" ||
    normalized === ""
  );
}

function evaluateBotHistory({
  historyOutcome,
  side,
}) {
  const maximumPoints =
    HISTORICAL_INTELLIGENCE_CONFIG
      .botHistoryMaximumPoints;

  if (
    !historyOutcome ||
    historyOutcome
      .approved !== true
  ) {
    return {
      available: false,

      source:
        "BOT_TRADE_HISTORY",

      maximumPoints,

      points: 0,

      support: null,

      confidence: null,

      signal:
        historyOutcome
          ?.signal ??
        "INSUFFICIENT_DATA",

      status:
        historyOutcome
          ?.status ??
        "INSUFFICIENT_DATA",

      stats:
        historyOutcome
          ?.stats ??
        null,

      reason:
        "The bot does not yet have sufficient comparable completed-trade evidence.",
    };
  }

  const signal =
    normalizeSignal(
      historyOutcome
        ?.signal,
    );

  /**
   * Negative history cannot accidentally earn positive
   * points even if directionalSupport is malformed.
   */
  if (
    isNegativeBotSignal(
      signal,
    )
  ) {
    return {
      available: true,

      source:
        "BOT_TRADE_HISTORY",

      maximumPoints,

      points: 0,

      support:
        resolveDirectionalSupport({
          result:
            historyOutcome,

          side,
        }),

      confidence:
        historyOutcome
          ?.confidence ??
        null,

      signal,

      status:
        historyOutcome
          ?.status ??
        "COMPLETE",

      stats:
        historyOutcome
          ?.stats ??
        null,

      reason:
        "Similar completed bot trades produced cautionary or negative outcomes.",
    };
  }

  /**
   * Neutral evidence receives zero.
   */
  if (
    isNeutralBotSignal(
      signal,
    )
  ) {
    return {
      available: true,

      source:
        "BOT_TRADE_HISTORY",

      maximumPoints,

      points: 0,

      support:
        resolveDirectionalSupport({
          result:
            historyOutcome,

          side,
        }),

      confidence:
        historyOutcome
          ?.confidence ??
        null,

      signal,

      status:
        historyOutcome
          ?.status ??
        "COMPLETE",

      stats:
        historyOutcome
          ?.stats ??
        null,

      reason:
        "Similar completed bot trades are neutral and receive no points.",
    };
  }

  const support =
    resolveDirectionalSupport({
      result:
        historyOutcome,

      side,
    });

  if (
    support === null
  ) {
    return {
      available: false,

      source:
        "BOT_TRADE_HISTORY",

      maximumPoints,

      points: 0,

      support: null,

      confidence:
        historyOutcome
          ?.confidence ??
        null,

      signal,

      status:
        "INSUFFICIENT_DATA",

      stats:
        historyOutcome
          ?.stats ??
        null,

      reason:
        "Bot trade-history directional support is unavailable.",
    };
  }

  const points =
    calculatePositivePoints({
      support,

      confidence:
        historyOutcome
          ?.confidence,

      maximumPoints,
    });

  return {
    available: true,

    source:
      "BOT_TRADE_HISTORY",

    maximumPoints,

    points,

    support:
      round(
        support,
      ),

    confidence:
      historyOutcome
        ?.confidence ??
      null,

    signal,

    status:
      historyOutcome
        ?.status ??
      "COMPLETE",

    stats:
      historyOutcome
        ?.stats ??
      null,

    reason:
      points > 0
        ? "Similar completed bot trades support the candidate direction."
        : "Bot trade-history evidence does not provide sufficient positive support.",
  };
}

/**
 * ============================================================
 * COMBINED SIGNAL
 * ============================================================
 */

function resolveCombinedSignal({
  totalPoints,
  marketHistory,
  botHistory,
}) {
  const botSignal =
    normalizeSignal(
      botHistory
        ?.signal,
    );

  if (
    botSignal ===
      "STRONGLY_NEGATIVE"
  ) {
    return HISTORICAL_INTELLIGENCE_SIGNAL
      .STRONGLY_NEGATIVE;
  }

  if (
    botSignal ===
      "CAUTION"
  ) {
    return HISTORICAL_INTELLIGENCE_SIGNAL
      .CAUTION;
  }

  if (
    marketHistory
      ?.available !== true &&
    botHistory
      ?.available !== true
  ) {
    return HISTORICAL_INTELLIGENCE_SIGNAL
      .INSUFFICIENT_DATA;
  }

  if (
    totalPoints >= 4
  ) {
    return HISTORICAL_INTELLIGENCE_SIGNAL
      .STRONGLY_SUPPORTIVE;
  }

  if (
    totalPoints >= 2.5
  ) {
    return HISTORICAL_INTELLIGENCE_SIGNAL
      .SUPPORTIVE;
  }

  if (
    totalPoints > 0
  ) {
    return HISTORICAL_INTELLIGENCE_SIGNAL
      .WEAK_SUPPORT;
  }

  return HISTORICAL_INTELLIGENCE_SIGNAL
    .NEUTRAL;
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function evaluateHistoricalIntelligence({
  side,

  historicalAnalogue = null,

  historyOutcome = null,
} = {}) {
  try {
    const normalizedSide =
      normalizeDirection(
        side,
      );

    if (
      !normalizedSide
    ) {
      return {
        approved: false,

        engine:
          "HISTORICAL_INTELLIGENCE",

        status:
          HISTORICAL_INTELLIGENCE_STATUS
            .INVALID_INPUT,

        side: null,

        maximumPoints:
          HISTORICAL_INTELLIGENCE_CONFIG
            .maximumPoints,

        points: 0,

        scorePercent: 0,

        signal:
          HISTORICAL_INTELLIGENCE_SIGNAL
            .INSUFFICIENT_DATA,

        components: {
          marketHistory: null,

          botHistory: null,
        },

        reasons: [
          "A LONG or SHORT candidate side is required.",
        ],

        warnings: [],

        errors: [],
      };
    }

    const marketHistory =
      evaluateMarketHistory({
        historicalAnalogue,

        side:
          normalizedSide,
      });

    const botHistory =
      evaluateBotHistory({
        historyOutcome,

        side:
          normalizedSide,
      });

    const totalPoints =
      round(
        Math.min(
          HISTORICAL_INTELLIGENCE_CONFIG
            .maximumPoints,

          Math.max(
            0,

            Number(
              marketHistory
                ?.points ??
              0,
            ) +
              Number(
                botHistory
                  ?.points ??
                0,
              ),
          ),
        ),
      );

    const scorePercent =
      round(
        (
          totalPoints /
          HISTORICAL_INTELLIGENCE_CONFIG
            .maximumPoints
        ) *
          100,
        2,
      );

    const availableCount =
      [
        marketHistory,
        botHistory,
      ].filter(
        (component) =>
          component
            ?.available ===
          true,
      ).length;

    let status;

    if (
      availableCount === 2
    ) {
      status =
        HISTORICAL_INTELLIGENCE_STATUS
          .COMPLETE;
    } else if (
      availableCount === 1
    ) {
      status =
        HISTORICAL_INTELLIGENCE_STATUS
          .PARTIAL;
    } else {
      status =
        HISTORICAL_INTELLIGENCE_STATUS
          .INSUFFICIENT_DATA;
    }

    const signal =
      resolveCombinedSignal({
        totalPoints,

        marketHistory,

        botHistory,
      });

    const reasons = [
      marketHistory
        .reason,

      botHistory
        .reason,
    ].filter(
      Boolean,
    );

    const warnings = [];

    if (
      marketHistory
        .available !== true
    ) {
      warnings.push(
        "Market-history evidence is unavailable; its 3 points were not redistributed.",
      );
    }

    if (
      botHistory
        .available !== true
    ) {
      warnings.push(
        "Bot trade-history evidence is unavailable; its 2 points were not redistributed.",
      );
    }

    return {
      /**
       * approved means the engine completed safely with at
       * least one usable historical evidence source.
       *
       * It does NOT mean the trade itself is approved.
       */
      approved:
        availableCount > 0,

      engine:
        "HISTORICAL_INTELLIGENCE",

      status,

      side:
        normalizedSide,

      signal,

      maximumPoints:
        HISTORICAL_INTELLIGENCE_CONFIG
          .maximumPoints,

      points:
        totalPoints,

      scorePercent,

      allocation: {
        marketHistory: {
          weight: 0.6,

          maximumPoints:
            HISTORICAL_INTELLIGENCE_CONFIG
              .marketHistoryMaximumPoints,
        },

        botHistory: {
          weight: 0.4,

          maximumPoints:
            HISTORICAL_INTELLIGENCE_CONFIG
              .botHistoryMaximumPoints,
        },
      },

      components: {
        marketHistory,

        botHistory,
      },

      coverage: {
        availableSources:
          availableCount,

        totalSources: 2,

        ratio:
          round(
            availableCount /
              2,
          ),
      },

      reasons,

      warnings,

      errors: [],
    };
  } catch (
    error
  ) {
    return {
      approved: false,

      engine:
        "HISTORICAL_INTELLIGENCE",

      status:
        HISTORICAL_INTELLIGENCE_STATUS
          .ERROR,

      side:
        normalizeDirection(
          side,
        ),

      signal:
        HISTORICAL_INTELLIGENCE_SIGNAL
          .INSUFFICIENT_DATA,

      maximumPoints:
        HISTORICAL_INTELLIGENCE_CONFIG
          .maximumPoints,

      points: 0,

      scorePercent: 0,

      components: {
        marketHistory: null,

        botHistory: null,
      },

      reasons: [
        "Historical intelligence could not be evaluated safely.",
      ],

      warnings: [],

      errors: [
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      ],
    };
  }
}

export default evaluateHistoricalIntelligence;