/**
 * ============================================================
 * LIQUIDITY & EXECUTION ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Determine whether a trade can realistically and safely
 * be executed at an acceptable cost.
 *
 * Checks:
 *
 * - bid / ask spread
 * - spread percentage
 * - average volume
 * - current volume
 * - relative volume
 * - dollar volume
 * - requested position size
 * - position participation
 * - estimated slippage
 * - volatility
 * - market session
 * - execution quality
 *
 * IMPORTANT
 * ---------
 *
 * Liquidity is NOT primarily directional.
 *
 * A stock can be:
 *
 * STRONGLY BULLISH
 *
 * but still:
 *
 * DO NOT TRADE
 *
 * because execution quality is unacceptable.
 *
 * Maximum scoring contribution:
 *
 * 5 points
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const LIQUIDITY_STATUS =
  Object.freeze({
    EXCELLENT: "EXCELLENT",
    GOOD: "GOOD",
    ACCEPTABLE: "ACCEPTABLE",
    POOR: "POOR",
    DANGEROUS: "DANGEROUS",
    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

export const EXECUTION_DECISION =
  Object.freeze({
    ALLOW: "ALLOW",
    REDUCE_SIZE: "REDUCE_SIZE",
    BLOCK: "BLOCK",
    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

export const MARKET_SESSION =
  Object.freeze({
    PRE_MARKET: "PRE_MARKET",
    REGULAR: "REGULAR",
    AFTER_HOURS: "AFTER_HOURS",
    CLOSED: "CLOSED",
    UNKNOWN: "UNKNOWN",
  });

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 *
 * These are research defaults.
 *
 * They should later be validated separately for:
 *
 * - large caps
 * - mid caps
 * - small caps
 * - ETFs
 * - highly volatile stocks
 */

export const DEFAULT_LIQUIDITY_CONFIG =
  Object.freeze({
    maximumScore: 5,

    /**
     * Spread as percentage of mid price.
     */
    excellentSpreadPercent: 0.0005,
    goodSpreadPercent: 0.001,
    acceptableSpreadPercent: 0.003,
    maximumSpreadPercent: 0.01,

    /**
     * Dollar volume.
     */
    excellentDollarVolume:
      100_000_000,

    goodDollarVolume:
      25_000_000,

    acceptableDollarVolume:
      5_000_000,

    minimumDollarVolume:
      1_000_000,

    /**
     * Relative volume.
     */
    excellentRelativeVolume: 1.5,
    goodRelativeVolume: 1,
    minimumRelativeVolume: 0.5,

    /**
     * Position participation.
     *
     * Position value / daily dollar volume.
     */
    preferredParticipation:
      0.0005,

    maximumParticipation:
      0.0025,

    dangerousParticipation:
      0.01,

    /**
     * Estimated slippage.
     */
    excellentSlippagePercent:
      0.0005,

    acceptableSlippagePercent:
      0.002,

    maximumSlippagePercent:
      0.005,

    /**
     * Session penalties.
     */
    preMarketPenalty: 0.70,
    afterHoursPenalty: 0.65,

    /**
     * Hard block.
     */
    blockClosedMarket: true,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
  return Number.isFinite(
    Number(value),
  );
}

function positiveNumber(value) {
  return (
    isFiniteNumber(value) &&
    Number(value) > 0
  );
}

function clamp(
  value,
  min,
  max,
) {
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
  decimals = 6,
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
      ) * factor,
    ) / factor
  );
}

/**
 * ============================================================
 * SPREAD ANALYSIS
 * ============================================================
 */

function analyzeSpread({
  bid,
  ask,
  config,
}) {
  if (
    !positiveNumber(bid) ||
    !positiveNumber(ask) ||
    Number(ask) < Number(bid)
  ) {
    return {
      available: false,
      score: 0,
      spread: null,
      spreadPercent: null,
    };
  }

  const bidValue =
    Number(bid);

  const askValue =
    Number(ask);

  const midpoint =
    (
      bidValue +
      askValue
    ) / 2;

  const spread =
    askValue -
    bidValue;

  const spreadPercent =
    spread /
    midpoint;

  let score = 0;

  if (
    spreadPercent <=
    config.excellentSpreadPercent
  ) {
    score = 1;
  } else if (
    spreadPercent <=
    config.goodSpreadPercent
  ) {
    score = 0.9;
  } else if (
    spreadPercent <=
    config.acceptableSpreadPercent
  ) {
    score = 0.7;
  } else if (
    spreadPercent <=
    config.maximumSpreadPercent
  ) {
    score = 0.35;
  }

  return {
    available: true,

    bid:
      round(
        bidValue,
        4,
      ),

    ask:
      round(
        askValue,
        4,
      ),

    midpoint:
      round(
        midpoint,
        4,
      ),

    spread:
      round(
        spread,
        6,
      ),

    spreadPercent:
      round(
        spreadPercent,
        6,
      ),

    score,
  };
}

/**
 * ============================================================
 * VOLUME ANALYSIS
 * ============================================================
 */

function analyzeVolume({
  price,
  currentVolume,
  averageVolume,
  config,
}) {
  if (
    !positiveNumber(price) ||
    !positiveNumber(averageVolume)
  ) {
    return {
      available: false,

      score: 0,

      dollarVolume: null,

      relativeVolume: null,
    };
  }

  const priceValue =
    Number(price);

  const averageVolumeValue =
    Number(averageVolume);

  const dollarVolume =
    priceValue *
    averageVolumeValue;

  const relativeVolume =
    positiveNumber(
      currentVolume,
    )
      ? Number(currentVolume) /
        averageVolumeValue
      : null;

  /**
   * Dollar-volume score.
   */

  let dollarVolumeScore = 0;

  if (
    dollarVolume >=
    config.excellentDollarVolume
  ) {
    dollarVolumeScore = 1;
  } else if (
    dollarVolume >=
    config.goodDollarVolume
  ) {
    dollarVolumeScore = 0.9;
  } else if (
    dollarVolume >=
    config.acceptableDollarVolume
  ) {
    dollarVolumeScore = 0.7;
  } else if (
    dollarVolume >=
    config.minimumDollarVolume
  ) {
    dollarVolumeScore = 0.4;
  }

  /**
   * Relative-volume score.
   */

  let relativeVolumeScore =
    0.6;

  if (
    relativeVolume !== null
  ) {
    if (
      relativeVolume >=
      config.excellentRelativeVolume
    ) {
      relativeVolumeScore = 1;
    } else if (
      relativeVolume >=
      config.goodRelativeVolume
    ) {
      relativeVolumeScore = 0.85;
    } else if (
      relativeVolume >=
      config.minimumRelativeVolume
    ) {
      relativeVolumeScore = 0.6;
    } else {
      relativeVolumeScore = 0.25;
    }
  }

  const score =
    (
      dollarVolumeScore *
      0.7
    ) +
    (
      relativeVolumeScore *
      0.3
    );

  return {
    available: true,

    averageVolume:
      averageVolumeValue,

    currentVolume:
      positiveNumber(
        currentVolume,
      )
        ? Number(
            currentVolume,
          )
        : null,

    dollarVolume:
      round(
        dollarVolume,
        2,
      ),

    relativeVolume:
      relativeVolume !== null
        ? round(
            relativeVolume,
            4,
          )
        : null,

    dollarVolumeScore:
      round(
        dollarVolumeScore,
        4,
      ),

    relativeVolumeScore:
      round(
        relativeVolumeScore,
        4,
      ),

    score:
      round(
        score,
        4,
      ),
  };
}

/**
 * ============================================================
 * POSITION PARTICIPATION
 * ============================================================
 *
 * This is important because:
 *
 * $2,000 in NVDA
 *
 * and
 *
 * $2,000 in a thin micro-cap
 *
 * are not equivalent execution problems.
 */

function analyzeParticipation({
  positionValue,
  dollarVolume,
  config,
}) {
  if (
    !positiveNumber(
      positionValue,
    ) ||
    !positiveNumber(
      dollarVolume,
    )
  ) {
    return {
      available: false,

      participationRate: null,

      score: 0,

      dangerous: false,
    };
  }

  const participationRate =
    Number(positionValue) /
    Number(dollarVolume);

  let score = 0;

  if (
    participationRate <=
    config.preferredParticipation
  ) {
    score = 1;
  } else if (
    participationRate <=
    config.maximumParticipation
  ) {
    score = 0.75;
  } else if (
    participationRate <=
    config.dangerousParticipation
  ) {
    score = 0.35;
  }

  return {
    available: true,

    participationRate:
      round(
        participationRate,
        8,
      ),

    participationPercent:
      round(
        participationRate *
          100,
        5,
      ),

    score,

    dangerous:
      participationRate >
      config.dangerousParticipation,
  };
}

/**
 * ============================================================
 * SLIPPAGE ESTIMATION
 * ============================================================
 *
 * This is intentionally conservative and approximate.
 *
 * Real slippage estimation should later use:
 *
 * - Level 2 order book
 * - market depth
 * - order type
 * - order size
 * - volatility
 * - spread
 * - recent trade flow
 */

function estimateSlippage({
  spreadPercent,
  participationRate,
  volatilityPercent,
  config,
}) {
  if (
    !isFiniteNumber(
      spreadPercent,
    )
  ) {
    return {
      available: false,

      estimatedSlippagePercent:
        null,

      score: 0,
    };
  }

  const spreadComponent =
    Number(
      spreadPercent,
    ) / 2;

  const participationComponent =
    isFiniteNumber(
      participationRate,
    )
      ? Math.sqrt(
          Math.max(
            Number(
              participationRate,
            ),
            0,
          ),
        ) *
        0.01
      : 0;

  const volatilityComponent =
    isFiniteNumber(
      volatilityPercent,
    )
      ? Math.max(
          Number(
            volatilityPercent,
          ),
          0,
        ) *
        0.03
      : 0;

  const estimated =
    spreadComponent +
    participationComponent +
    volatilityComponent;

  let score = 0;

  if (
    estimated <=
    config
      .excellentSlippagePercent
  ) {
    score = 1;
  } else if (
    estimated <=
    config
      .acceptableSlippagePercent
  ) {
    score = 0.75;
  } else if (
    estimated <=
    config
      .maximumSlippagePercent
  ) {
    score = 0.35;
  }

  return {
    available: true,

    estimatedSlippagePercent:
      round(
        estimated,
        6,
      ),

    estimatedSlippageBasisPoints:
      round(
        estimated *
          10_000,
        2,
      ),

    score,
  };
}

/**
 * ============================================================
 * SESSION QUALITY
 * ============================================================
 */

function analyzeSession({
  session,
  config,
}) {
  switch (session) {
    case MARKET_SESSION.REGULAR:
      return {
        score: 1,
        blocked: false,
      };

    case MARKET_SESSION.PRE_MARKET:
      return {
        score:
          config.preMarketPenalty,

        blocked: false,
      };

    case MARKET_SESSION.AFTER_HOURS:
      return {
        score:
          config.afterHoursPenalty,

        blocked: false,
      };

    case MARKET_SESSION.CLOSED:
      return {
        score: 0,

        blocked:
          config.blockClosedMarket,
      };

    default:
      return {
        score: 0.5,

        blocked: false,
      };
  }
}

/**
 * ============================================================
 * QUALITY CLASSIFICATION
 * ============================================================
 */

function classifyLiquidity(
  score,
) {
  if (score >= 0.9) {
    return LIQUIDITY_STATUS.EXCELLENT;
  }

  if (score >= 0.75) {
    return LIQUIDITY_STATUS.GOOD;
  }

  if (score >= 0.55) {
    return LIQUIDITY_STATUS.ACCEPTABLE;
  }

  if (score >= 0.30) {
    return LIQUIDITY_STATUS.POOR;
  }

  return LIQUIDITY_STATUS.DANGEROUS;
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeLiquidityExecution({
  symbol = null,

  price,

  bid,

  ask,

  currentVolume = null,

  averageVolume,

  positionValue = null,

  volatilityPercent = null,

  session =
    MARKET_SESSION.UNKNOWN,

  config =
    DEFAULT_LIQUIDITY_CONFIG,
} = {}) {
  try {
    const warnings = [];
    const blockers = [];

    /**
     * ======================================================
     * BASIC VALIDATION
     * ======================================================
     */

    if (
      !positiveNumber(price)
    ) {
      return {
        approved: false,

        engine:
          "LIQUIDITY_EXECUTION",

        status:
          "INSUFFICIENT_DATA",

        symbol,

        executionDecision:
          EXECUTION_DECISION
            .INSUFFICIENT_DATA,

        qualityScore: 0,

        maximumScore:
          config.maximumScore,

        pointContribution: 0,

        warnings: [],

        blockers: [
          "Valid market price is required.",
        ],

        errors: [],
      };
    }

    /**
     * ======================================================
     * SPREAD
     * ======================================================
     */

    const spread =
      analyzeSpread({
        bid,

        ask,

        config,
      });

    /**
     * ======================================================
     * VOLUME
     * ======================================================
     */

    const volume =
      analyzeVolume({
        price,

        currentVolume,

        averageVolume,

        config,
      });

    /**
     * ======================================================
     * PARTICIPATION
     * ======================================================
     */

    const participation =
      analyzeParticipation({
        positionValue,

        dollarVolume:
          volume.dollarVolume,

        config,
      });

    /**
     * ======================================================
     * SLIPPAGE
     * ======================================================
     */

    const slippage =
      estimateSlippage({
        spreadPercent:
          spread.spreadPercent,

        participationRate:
          participation
            .participationRate,

        volatilityPercent,

        config,
      });

    /**
     * ======================================================
     * SESSION
     * ======================================================
     */

    const sessionResult =
      analyzeSession({
        session,

        config,
      });

    /**
     * ======================================================
     * QUALITY SCORE
     * ======================================================
     */

    const qualityParts = [];

    if (spread.available) {
      qualityParts.push({
        score:
          spread.score,

        weight: 0.30,
      });
    }

    if (volume.available) {
      qualityParts.push({
        score:
          volume.score,

        weight: 0.30,
      });
    }

    if (
      participation.available
    ) {
      qualityParts.push({
        score:
          participation.score,

        weight: 0.15,
      });
    }

    if (slippage.available) {
      qualityParts.push({
        score:
          slippage.score,

        weight: 0.15,
      });
    }

    qualityParts.push({
      score:
        sessionResult.score,

      weight: 0.10,
    });

    let weightedScore = 0;
    let activeWeight = 0;

    for (
      const part
      of qualityParts
    ) {
      weightedScore +=
        part.score *
        part.weight;

      activeWeight +=
        part.weight;
    }

    let qualityScore =
      activeWeight > 0
        ? weightedScore /
          activeWeight
        : 0;

    /**
     * ======================================================
     * HARD SAFETY CHECKS
     * ======================================================
     */

    if (
      spread.available &&
      spread.spreadPercent >
        config.maximumSpreadPercent
    ) {
      blockers.push(
        "Bid/ask spread exceeds maximum execution threshold.",
      );
    }

    if (
      volume.available &&
      volume.dollarVolume <
        config.minimumDollarVolume
    ) {
      blockers.push(
        "Average dollar volume is below the minimum liquidity threshold.",
      );
    }

    if (
      participation.dangerous
    ) {
      blockers.push(
        "Requested position is too large relative to normal market liquidity.",
      );
    }

    if (
      slippage.available &&
      slippage
        .estimatedSlippagePercent >
        config
          .maximumSlippagePercent
    ) {
      blockers.push(
        "Estimated slippage exceeds the maximum threshold.",
      );
    }

    if (
      sessionResult.blocked
    ) {
      blockers.push(
        "Market session does not currently permit execution.",
      );
    }

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    if (
      spread.available &&
      spread.score < 0.7
    ) {
      warnings.push(
        "Spread quality is poor.",
      );
    }

    if (
      volume.available &&
      volume.relativeVolume !==
        null &&
      volume.relativeVolume <
        config.minimumRelativeVolume
    ) {
      warnings.push(
        "Current relative volume is unusually low.",
      );
    }

    if (
      session ===
        MARKET_SESSION
          .PRE_MARKET ||
      session ===
        MARKET_SESSION
          .AFTER_HOURS
    ) {
      warnings.push(
        "Extended-hours trading can have wider spreads and greater slippage.",
      );
    }

    /**
     * ======================================================
     * EXECUTION DECISION
     * ======================================================
     */

    let executionDecision =
      EXECUTION_DECISION.ALLOW;

    if (
      blockers.length > 0
    ) {
      executionDecision =
        EXECUTION_DECISION.BLOCK;

      qualityScore = 0;
    } else if (
      participation.available &&
      participation
        .participationRate >
        config
          .preferredParticipation
    ) {
      executionDecision =
        EXECUTION_DECISION
          .REDUCE_SIZE;
    }

    /**
     * ======================================================
     * LIQUIDITY STATUS
     * ======================================================
     */

    const liquidityStatus =
      classifyLiquidity(
        qualityScore,
      );

    /**
     * ======================================================
     * POINTS
     * ======================================================
     */

    const pointContribution =
      executionDecision ===
        EXECUTION_DECISION.BLOCK
        ? 0
        : qualityScore *
          config.maximumScore;

    /**
     * ======================================================
     * FINAL RESULT
     * ======================================================
     */

    return {
      approved:
        executionDecision !==
        EXECUTION_DECISION.BLOCK,

      engine:
        "LIQUIDITY_EXECUTION",

      status:
        executionDecision ===
          EXECUTION_DECISION.BLOCK
          ? "BLOCKED"
          : "COMPLETE",

      symbol,

      liquidityStatus,

      executionDecision,

      qualityScore:
        round(
          qualityScore,
          4,
        ),

      /**
       * Liquidity is non-directional.
       *
       * Both LONG and SHORT receive the
       * same execution-quality support.
       */
      directionalSupport: {
        long:
          round(
            qualityScore,
            4,
          ),

        short:
          round(
            qualityScore,
            4,
          ),
      },

      spread,

      volume,

      participation,

      slippage,

      session: {
        name:
          session,

        score:
          sessionResult.score,
      },

      pointContribution:
        round(
          pointContribution,
          2,
        ),

      maximumScore:
        config.maximumScore,

      blockers,

      warnings,

      errors: [],

      summary:
        executionDecision ===
          EXECUTION_DECISION.BLOCK
          ? "Trade execution blocked because liquidity or execution risk exceeds safety limits."
          : executionDecision ===
              EXECUTION_DECISION
                .REDUCE_SIZE
            ? "Liquidity is usable, but a smaller position is recommended."
            : `Execution liquidity is ${liquidityStatus.toLowerCase()}.`,

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    /**
     * ======================================================
     * SAFE FAIL
     * ======================================================
     *
     * We do NOT assume liquidity is okay if this
     * engine crashes.
     */

    return {
      approved: false,

      engine:
        "LIQUIDITY_EXECUTION",

      status:
        "ERROR",

      symbol,

      liquidityStatus:
        LIQUIDITY_STATUS
          .INSUFFICIENT_DATA,

      executionDecision:
        EXECUTION_DECISION.BLOCK,

      qualityScore: 0,

      directionalSupport: {
        long: 0,
        short: 0,
      },

      pointContribution: 0,

      maximumScore:
        config
          ?.maximumScore ??
        5,

      blockers: [
        "Liquidity analysis failed. New trade execution must remain blocked.",
      ],

      warnings: [],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      summary:
        "Liquidity analysis failed safely.",

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default analyzeLiquidityExecution;