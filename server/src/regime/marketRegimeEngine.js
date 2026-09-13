import {
  MARKET_REGIME,
} from "../config/riskConfig.js";

import {
  MACRO_DIRECTION,
  RECESSION_RISK,
} from "../analysis/macroRegimeEngine.js";

/**
 * ============================================================
 * MARKET REGIME ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Combine:
 *
 * - Technical trend
 * - Macro regime
 * - Volatility
 * - Market breadth
 * - Liquidity
 * - Recession risk
 *
 * into one higher-level market state.
 *
 * Possible regimes:
 *
 * STRONG_BULL
 * BULL
 * SIDEWAYS
 * BEAR
 * STRONG_BEAR
 * HIGH_VOLATILITY
 *
 * This engine does NOT execute trades.
 *
 * It informs:
 *
 * - Required LONG / SHORT score
 * - Position sizing
 * - Trailing behaviour
 * - Risk limits
 * - Strategy preference
 */

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
      ) * factor,
    ) / factor
  );
}

/**
 * ============================================================
 * TECHNICAL TREND SCORE
 * ============================================================
 *
 * Returns:
 *
 * -1 → strongly bearish
 *  0 → neutral
 * +1 → strongly bullish
 */

function scoreTechnicalTrend(
  technical,
) {
  const direction =
    technical?.trend?.direction;

  switch (direction) {
    case "STRONG_BULLISH":
      return 1;

    case "BULLISH":
      return 0.65;

    case "SIDEWAYS":
      return 0;

    case "BEARISH":
      return -0.65;

    case "STRONG_BEARISH":
      return -1;

    default:
      return 0;
  }
}

/**
 * ============================================================
 * MACRO SCORE
 * ============================================================
 */

function scoreMacro(
  macro,
) {
  const direction =
    macro?.direction;

  switch (direction) {
    case MACRO_DIRECTION.BULLISH:
      return 1;

    case MACRO_DIRECTION
      .SLIGHTLY_BULLISH:
      return 0.5;

    case MACRO_DIRECTION
      .SLIGHTLY_BEARISH:
      return -0.5;

    case MACRO_DIRECTION.BEARISH:
      return -1;

    default:
      return 0;
  }
}

/**
 * ============================================================
 * MARKET BREADTH
 * ============================================================
 *
 * Expected input:
 *
 * {
 *   advanceDeclineRatio,
 *   percentAbove50DMA,
 *   percentAbove200DMA
 * }
 */

function scoreBreadth(
  breadth,
) {
  if (!breadth) {
    return {
      score: 0,
      confidence: 0,
      evidence: [],
      available: false,
    };
  }

  /**
   * Support an already-normalized breadth provider result.
   *
   * This keeps the engine compatible with either:
   *
   * - raw breadth fields, or
   * - a provider that has already normalized breadth to -1 → +1.
   */
  const hasRawBreadth =
    isFiniteNumber(
      breadth.advanceDeclineRatio,
    ) ||
    isFiniteNumber(
      breadth.percentAbove50DMA,
    ) ||
    isFiniteNumber(
      breadth.percentAbove200DMA,
    );

  if (
    !hasRawBreadth &&
    isFiniteNumber(
      breadth.score,
    )
  ) {
    return {
      score:
        round(
          clamp(
            breadth.score,
            -1,
            1,
          ),
          4,
        ),

      confidence:
        isFiniteNumber(
          breadth.confidence,
        )
          ? round(
              clamp(
                breadth.confidence,
                0,
                1,
              ),
              4,
            )
          : 1,

      evidence:
        Array.isArray(
          breadth.evidence,
        )
          ? breadth.evidence
          : [],

      available: true,
    };
  }

  let total = 0;
  let count = 0;

  const evidence = [];

  /**
   * Advance / decline ratio.
   */
  if (
    isFiniteNumber(
      breadth.advanceDeclineRatio,
    )
  ) {
    const ratio =
      Number(
        breadth.advanceDeclineRatio,
      );

    let value = 0;

    if (ratio >= 2) {
      value = 1;
    } else if (
      ratio >= 1.3
    ) {
      value = 0.6;
    } else if (
      ratio <= 0.5
    ) {
      value = -1;
    } else if (
      ratio <= 0.8
    ) {
      value = -0.6;
    }

    total += value;
    count += 1;

    evidence.push({
      factor:
        "ADVANCE_DECLINE_RATIO",

      value: ratio,

      score: value,
    });
  }

  /**
   * Percent above 50 DMA.
   */
  if (
    isFiniteNumber(
      breadth.percentAbove50DMA,
    )
  ) {
    const value50 =
      Number(
        breadth.percentAbove50DMA,
      );

    let score = 0;

    if (value50 >= 70) {
      score = 1;
    } else if (
      value50 >= 55
    ) {
      score = 0.5;
    } else if (
      value50 <= 30
    ) {
      score = -1;
    } else if (
      value50 <= 45
    ) {
      score = -0.5;
    }

    total += score;
    count += 1;

    evidence.push({
      factor:
        "PERCENT_ABOVE_50DMA",

      value:
        value50,

      score,
    });
  }

  /**
   * Percent above 200 DMA.
   */
  if (
    isFiniteNumber(
      breadth.percentAbove200DMA,
    )
  ) {
    const value200 =
      Number(
        breadth.percentAbove200DMA,
      );

    let score = 0;

    if (value200 >= 70) {
      score = 1;
    } else if (
      value200 >= 55
    ) {
      score = 0.5;
    } else if (
      value200 <= 30
    ) {
      score = -1;
    } else if (
      value200 <= 45
    ) {
      score = -0.5;
    }

    total += score;
    count += 1;

    evidence.push({
      factor:
        "PERCENT_ABOVE_200DMA",

      value:
        value200,

      score,
    });
  }

  if (count === 0) {
    return {
      score: 0,
      confidence: 0,
      evidence,
      available: false,
    };
  }

  const normalized =
    total / count;

  return {
    score:
      round(
        clamp(
          normalized,
          -1,
          1,
        ),
        4,
      ),

    confidence:
      round(
        count / 3,
        4,
      ),

    evidence,

    available: true,
  };
}

/**
 * ============================================================
 * VOLATILITY STATE
 * ============================================================
 *
 * Expected input:
 *
 * {
 *   atrPercent,
 *   volatilityIndex,
 *   realizedVolatility
 * }
 */

function analyzeVolatility(
  volatility,
) {
  if (!volatility) {
    return {
      level: "UNKNOWN",
      score: 0,
      extreme: false,
      available: false,
    };
  }

  /**
   * Support a pre-normalized volatility provider result.
   */
  const hasRawVolatility =
    isFiniteNumber(
      volatility.atrPercent,
    ) ||
    isFiniteNumber(
      volatility.volatilityIndex,
    ) ||
    isFiniteNumber(
      volatility.realizedVolatility,
    );

  if (
    !hasRawVolatility &&
    isFiniteNumber(
      volatility.score,
    )
  ) {
    const normalizedScore =
      clamp(
        volatility.score,
        0,
        1,
      );

    let level =
      String(
        volatility.level ??
        "",
      )
        .trim()
        .toUpperCase();

    if (
      ![
        "LOW",
        "NORMAL",
        "ELEVATED",
        "HIGH",
        "EXTREME",
      ].includes(
        level,
      )
    ) {
      level =
        normalizedScore >= 0.8
          ? "EXTREME"
          : normalizedScore >= 0.6
            ? "HIGH"
            : normalizedScore >= 0.3
              ? "ELEVATED"
              : normalizedScore >= 0.15
                ? "NORMAL"
                : "LOW";
    }

    return {
      level,

      score:
        round(
          normalizedScore,
          4,
        ),

      extreme:
        volatility.extreme ===
          true ||
        normalizedScore >=
          0.8 ||
        level ===
          "EXTREME",

      available: true,
    };
  }

  let pressure = 0;
  let count = 0;

  /**
   * ATR percentage.
   */
  if (
    isFiniteNumber(
      volatility.atrPercent,
    )
  ) {
    const atr =
      Number(
        volatility.atrPercent,
      );

    if (atr >= 0.08) {
      pressure += 1;
    } else if (
      atr >= 0.05
    ) {
      pressure += 0.8;
    } else if (
      atr >= 0.03
    ) {
      pressure += 0.5;
    } else if (
      atr >= 0.015
    ) {
      pressure += 0.2;
    }

    count += 1;
  }

  /**
   * Volatility index.
   */
  if (
    isFiniteNumber(
      volatility.volatilityIndex,
    )
  ) {
    const index =
      Number(
        volatility.volatilityIndex,
      );

    if (index >= 40) {
      pressure += 1;
    } else if (
      index >= 30
    ) {
      pressure += 0.8;
    } else if (
      index >= 25
    ) {
      pressure += 0.6;
    } else if (
      index >= 20
    ) {
      pressure += 0.3;
    }

    count += 1;
  }

  /**
   * Realized volatility.
   */
  if (
    isFiniteNumber(
      volatility.realizedVolatility,
    )
  ) {
    const realized =
      Number(
        volatility.realizedVolatility,
      );

    if (realized >= 0.60) {
      pressure += 1;
    } else if (
      realized >= 0.40
    ) {
      pressure += 0.7;
    } else if (
      realized >= 0.25
    ) {
      pressure += 0.4;
    }

    count += 1;
  }

  if (count === 0) {
    return {
      level: "UNKNOWN",
      score: 0,
      extreme: false,
      available: false,
    };
  }

  const score =
    clamp(
      pressure / count,
      0,
      1,
    );

  let level =
    "LOW";

  if (score >= 0.8) {
    level =
      "EXTREME";
  } else if (
    score >= 0.6
  ) {
    level =
      "HIGH";
  } else if (
    score >= 0.3
  ) {
    level =
      "ELEVATED";
  } else if (
    score >= 0.15
  ) {
    level =
      "NORMAL";
  }

  return {
    level,

    score:
      round(
        score,
        4,
      ),

    extreme:
      score >= 0.8,

    available: true,
  };
}

/**
 * ============================================================
 * LIQUIDITY STATE
 * ============================================================
 *
 * Expected input:
 *
 * {
 *   direction: "EXPANDING" | "CONTRACTING" | "STABLE"
 *   stressScore: 0 - 1
 * }
 */

function scoreLiquidity(
  liquidity,
) {
  if (!liquidity) {
    return {
      score: 0,
      stress: 0,
      available: false,
    };
  }

  /**
   * Preferred contract:
   *
   * {
   *   direction: "EXPANDING" | "CONTRACTING" | "STABLE",
   *   stressScore: 0 - 1
   * }
   *
   * Also support the output of liquidityExecutionEngine.js:
   *
   * {
   *   qualityScore,
   *   executionDecision,
   *   liquidityStatus
   * }
   */

  const direction =
    String(
      liquidity.direction ??
      "",
    )
      .trim()
      .toUpperCase();

  let score = 0;

  let observed =
    false;

  if (
    direction ===
    "EXPANDING"
  ) {
    score = 0.6;
    observed = true;
  } else if (
    direction ===
    "CONTRACTING"
  ) {
    score = -0.6;
    observed = true;
  } else if (
    direction ===
    "STABLE"
  ) {
    score = 0;
    observed = true;
  }

  let stress =
    isFiniteNumber(
      liquidity.stressScore,
    )
      ? clamp(
          liquidity.stressScore,
          0,
          1,
        )
      : null;

  if (
    stress !== null
  ) {
    score -=
      stress * 0.4;

    observed = true;
  }

  /**
   * Adapt the Liquidity Execution Engine output.
   */
  if (
    isFiniteNumber(
      liquidity.qualityScore,
    )
  ) {
    const quality =
      clamp(
        liquidity.qualityScore,
        0,
        1,
      );

    const executionDecision =
      String(
        liquidity.executionDecision ??
        "",
      )
        .trim()
        .toUpperCase();

    if (
      executionDecision ===
      "BLOCK"
    ) {
      score = -1;
      stress = 1;
    } else {
      /**
       * Map execution quality from 0 → 1 into a conservative
       * regime contribution of -0.6 → +0.6.
       */
      score =
        (
          quality -
          0.5
        ) *
        1.2;

      stress =
        1 -
        quality;

      if (
        executionDecision ===
        "REDUCE_SIZE"
      ) {
        score =
          Math.min(
            score,
            0.2,
          );
      }
    }

    observed = true;
  }

  if (
    stress === null
  ) {
    stress = 0;
  }

  return {
    score:
      round(
        clamp(
          score,
          -1,
          1,
        ),
        4,
      ),

    stress:
      round(
        clamp(
          stress,
          0,
          1,
        ),
        4,
      ),

    available:
      observed,
  };
}

/**
 * ============================================================
 * RECESSION PRESSURE
 * ============================================================
 */

function scoreRecessionRisk(
  recessionRisk,
) {
  const level =
    recessionRisk?.level;

  switch (level) {
    case RECESSION_RISK.LOW:
      return 0.15;

    case RECESSION_RISK.MODERATE:
      return -0.15;

    case RECESSION_RISK.ELEVATED:
      return -0.45;

    case RECESSION_RISK.HIGH:
      return -0.75;

    case RECESSION_RISK.CONFIRMED:
      return -1;

    default:
      return 0;
  }
}

/**
 * ============================================================
 * REGIME CLASSIFICATION
 * ============================================================
 */

function classifyRegime({
  compositeScore,
  volatility,
}) {
  /**
   * Extreme volatility overrides
   * the ordinary directional regime.
   */
  if (
    volatility.extreme
  ) {
    return MARKET_REGIME
      .HIGH_VOLATILITY;
  }

  if (
    compositeScore >= 0.65
  ) {
    return MARKET_REGIME
      .STRONG_BULL;
  }

  if (
    compositeScore >= 0.25
  ) {
    return MARKET_REGIME.BULL;
  }

  if (
    compositeScore <= -0.65
  ) {
    return MARKET_REGIME
      .STRONG_BEAR;
  }

  if (
    compositeScore <= -0.25
  ) {
    return MARKET_REGIME.BEAR;
  }

  return MARKET_REGIME.SIDEWAYS;
}

/**
 * ============================================================
 * STRATEGY PREFERENCE
 * ============================================================
 */

function determineStrategyPreference({
  regime,
  volatility,
}) {
  switch (regime) {
    case MARKET_REGIME
      .STRONG_BULL:
      return {
        preferredSide: "LONG",
        preferredStrategy:
          "TREND_FOLLOWING",
      };

    case MARKET_REGIME.BULL:
      return {
        preferredSide: "LONG",
        preferredStrategy:
          "TREND_FOLLOWING",
      };

    case MARKET_REGIME
      .STRONG_BEAR:
      return {
        preferredSide: "SHORT",
        preferredStrategy:
          "TREND_FOLLOWING",
      };

    case MARKET_REGIME.BEAR:
      return {
        preferredSide: "SHORT",
        preferredStrategy:
          "TREND_FOLLOWING",
      };

    case MARKET_REGIME
      .HIGH_VOLATILITY:
      return {
        preferredSide: null,
        preferredStrategy:
          "DEFENSIVE",
      };

    default:
      return {
        preferredSide: null,
        preferredStrategy:
          volatility.score < 0.3
            ? "MEAN_REVERSION"
            : "SELECTIVE",
      };
  }
}

/**
 * ============================================================
 * REGIME CONFIDENCE
 * ============================================================
 */

function calculateConfidence({
  technicalScore,
  macroScore,
  breadthResult,
  liquidityResult,
  technicalAvailable = true,
  macroAvailable = true,
} = {}) {
  /**
   * Confidence should measure more than raw signal magnitude.
   *
   * It combines:
   *
   * - signal strength
   * - directional agreement
   * - data coverage
   *
   * This prevents +1 / -1 conflicts from appearing highly
   * confident merely because every signal is individually strong.
   */

  const candidates = [
    {
      value:
        technicalScore,
      available:
        technicalAvailable,
    },

    {
      value:
        macroScore,
      available:
        macroAvailable,
    },

    {
      value:
        breadthResult
          ?.score,
      available:
        breadthResult
          ?.available ===
        true,
    },

    {
      value:
        liquidityResult
          ?.score,
      available:
        liquidityResult
          ?.available ===
        true,
    },
  ];

  const availableSignals =
    candidates.filter(
      (item) =>
        item.available &&
        isFiniteNumber(
          item.value,
        ),
    );

  if (
    availableSignals.length ===
    0
  ) {
    return 0;
  }

  const signals =
    availableSignals.map(
      (item) =>
        Number(
          item.value,
        ),
    );

  const strength =
    signals.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        Math.abs(
          value,
        ),
      0,
    ) /
    signals.length;

  const signedMean =
    signals.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        value,
      0,
    ) /
    signals.length;

  /**
   * 1 = same directional story.
   * 0 = strong signals cancel one another.
   */
  const agreement =
    strength > 0
      ? clamp(
          Math.abs(
            signedMean,
          ) /
            strength,
          0,
          1,
        )
      : 1;

  const coverage =
    availableSignals.length /
    candidates.length;

  /**
   * Agreement modulates strength, while coverage prevents a
   * single available component from producing high confidence.
   */
  const confidence =
    strength *
    (
      0.5 +
      (
        agreement *
        0.5
      )
    ) *
    coverage;

  return round(
    clamp(
      confidence,
      0,
      1,
    ),
    4,
  );
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeMarketRegime({
  technical = null,

  macro = null,

  breadth = null,

  volatility = null,

  liquidity = null,
} = {}) {
  try {
    const warnings = [];

    /**
     * ======================================================
     * TECHNICAL
     * ======================================================
     */

    const technicalScore =
      scoreTechnicalTrend(
        technical,
      );

    /**
     * ======================================================
     * MACRO
     * ======================================================
     */

    const macroScore =
      scoreMacro(
        macro,
      );

    /**
     * ======================================================
     * BREADTH
     * ======================================================
     */

    const breadthResult =
      scoreBreadth(
        breadth,
      );

    /**
     * ======================================================
     * VOLATILITY
     * ======================================================
     */

    const volatilityResult =
      analyzeVolatility(
        volatility,
      );

    /**
     * ======================================================
     * LIQUIDITY
     * ======================================================
     */

    const liquidityResult =
      scoreLiquidity(
        liquidity,
      );

    /**
     * ======================================================
     * RECESSION PRESSURE
     * ======================================================
     */

    const recessionScore =
      scoreRecessionRisk(
        macro?.recessionRisk,
      );

    /**
     * ======================================================
     * WEIGHTING
     * ======================================================
     *
     * Starting assumptions.
     *
     * These will later be optimized
     * through backtesting.
     *
     * Technical     35%
     * Macro         30%
     * Breadth       15%
     * Liquidity     10%
     * Recession     10%
     */

    const weights = {
      technical: 0.35,
      macro: 0.30,
      breadth: 0.15,
      liquidity: 0.10,
      recession: 0.10,
    };

    const compositeScore =
      (
        technicalScore *
        weights.technical
      ) +
      (
        macroScore *
        weights.macro
      ) +
      (
        breadthResult.score *
        weights.breadth
      ) +
      (
        liquidityResult.score *
        weights.liquidity
      ) +
      (
        recessionScore *
        weights.recession
      );

    const normalizedComposite =
      clamp(
        compositeScore,
        -1,
        1,
      );

    /**
     * ======================================================
     * CLASSIFICATION
     * ======================================================
     */

    const regime =
      classifyRegime({
        compositeScore:
          normalizedComposite,

        volatility:
          volatilityResult,
      });

    /**
     * ======================================================
     * STRATEGY
     * ======================================================
     */

    const strategy =
      determineStrategyPreference({
        regime,

        volatility:
          volatilityResult,
      });

    /**
     * ======================================================
     * CONFIDENCE
     * ======================================================
     */

    const confidence =
      calculateConfidence({
        technicalScore,
        macroScore,
        breadthResult,
        liquidityResult,

        technicalAvailable:
          Boolean(
            technical?.trend
              ?.direction,
          ),

        macroAvailable:
          Boolean(
            macro?.direction,
          ) &&
          macro?.approved ===
            true,
      });

    /**
     * ======================================================
     * DATA QUALITY WARNINGS
     * ======================================================
     */

    if (!technical) {
      warnings.push(
        "Technical analysis result was not supplied.",
      );
    }

    if (
      !macro ||
      macro.approved !== true
    ) {
      warnings.push(
        "Approved macro analysis was not supplied.",
      );
    }

    if (!breadth) {
      warnings.push(
        "Market breadth data was not supplied.",
      );
    } else if (
      breadthResult.available !==
      true
    ) {
      warnings.push(
        "Market breadth input was supplied but contained no usable breadth signals.",
      );
    }

    if (!liquidity) {
      warnings.push(
        "Market liquidity data was not supplied.",
      );
    } else if (
      liquidityResult.available !==
      true
    ) {
      warnings.push(
        "Market liquidity input was supplied but could not be normalized.",
      );
    }

    if (
      volatilityResult.level ===
      "UNKNOWN"
    ) {
      warnings.push(
        "Volatility state could not be fully determined.",
      );
    }

    /**
     * ======================================================
     * LONG / SHORT REGIME SUPPORT
     * ======================================================
     */

    const longSupport =
      clamp(
        (
          normalizedComposite +
          1
        ) / 2,
        0,
        1,
      );

    const shortSupport =
      clamp(
        (
          1 -
          normalizedComposite
        ) / 2,
        0,
        1,
      );

    /**
     * ======================================================
     * FRONTEND SUMMARY
     * ======================================================
     */

    const summary =
      regime ===
        MARKET_REGIME
          .HIGH_VOLATILITY
        ? "Market conditions are experiencing extreme volatility. Defensive trading rules should apply."
        : `Market regime classified as ${regime.replaceAll(
            "_",
            " ",
          ).toLowerCase()}.`;

    /**
     * ======================================================
     * RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "MARKET_REGIME",

      status:
        "COMPLETE",

      regime,

      direction:
        regime ===
          MARKET_REGIME
            .HIGH_VOLATILITY
          ? "NEUTRAL"
          : normalizedComposite >
              0.15
            ? "LONG"
            : normalizedComposite <
                -0.15
              ? "SHORT"
              : "NEUTRAL",

      confidence,

      compositeScore:
        round(
          normalizedComposite,
          4,
        ),

      directionalSupport: {
        long:
          round(
            longSupport,
            4,
          ),

        short:
          round(
            shortSupport,
            4,
          ),
      },

      components: {
        technical: {
          score:
            round(
              technicalScore,
              4,
            ),

          weight:
            weights.technical,
        },

        macro: {
          score:
            round(
              macroScore,
              4,
            ),

          weight:
            weights.macro,
        },

        breadth: {
          score:
            breadthResult.score,

          confidence:
            breadthResult
              .confidence,

          weight:
            weights.breadth,

          evidence:
            breadthResult
              .evidence,
        },

        liquidity: {
          score:
            round(
              liquidityResult
                .score,
              4,
            ),

          stress:
            liquidityResult
              .stress,

          weight:
            weights.liquidity,
        },

        recession: {
          score:
            round(
              recessionScore,
              4,
            ),

          level:
            macro
              ?.recessionRisk
              ?.level ??
            RECESSION_RISK
              .UNKNOWN,

          weight:
            weights.recession,
        },
      },

      volatility:
        volatilityResult,

      strategy,

      summary,

      warnings,

      errors: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    /**
     * ======================================================
     * SAFE FAIL
     * ======================================================
     */

    return {
      approved: false,

      engine:
        "MARKET_REGIME",

      status:
        "ERROR",

      regime:
        MARKET_REGIME.SIDEWAYS,

      direction:
        "NEUTRAL",

      confidence: 0,

      compositeScore: 0,

      directionalSupport: {
        long: 0,
        short: 0,
      },

      volatility: {
        level: "UNKNOWN",
        score: 0,
        extreme: false,
      },

      strategy: {
        preferredSide: null,
        preferredStrategy:
          "DEFENSIVE",
      },

      summary:
        "Market regime analysis failed safely. No directional regime should be assumed.",

      warnings: [
        "Regime engine failure should block aggressive position sizing.",
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

export default analyzeMarketRegime;