import {
  RISK_CONFIG,
  TRADE_SIDE,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * TRADE SCORING ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Convert technical / market evidence into a normalized
 * 0 - 100 score for:
 *
 * - LONG setups
 * - SHORT setups
 *
 * This engine does NOT execute trades.
 *
 * It only answers:
 *
 * "How strong is this setup?"
 *
 * A score must still pass:
 *
 * - Risk checks
 * - Liquidity checks
 * - Volatility checks
 * - Portfolio checks
 * - Market regime checks
 *
 * before execution can ever happen.
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
  decimals = 2,
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
 * WEIGHT HELPERS
 * ============================================================
 */

function getWeight(name) {
  return Number(
    RISK_CONFIG.scoring.weights[
      name
    ] ?? 0,
  );
}

function normalizeComponent(
  value,
) {
  return clamp(
    value,
    0,
    1,
  );
}

function applyWeight(
  normalizedValue,
  weight,
) {
  return (
    normalizeComponent(
      normalizedValue,
    ) *
    Number(weight)
  );
}

/**
 * ============================================================
 * TREND SCORE
 * ============================================================
 */

function scoreTrend({
  side,
  trend,
}) {
  if (
    !trend ||
    !trend.direction
  ) {
    return 0;
  }

  const strength =
    isFiniteNumber(
      trend.strength,
    )
      ? normalizeComponent(
          trend.strength,
        )
      : 0;

  if (side === TRADE_SIDE.LONG) {
    if (
      trend.direction ===
      "STRONG_BULLISH"
    ) {
      return Math.max(
        0.9,
        strength,
      );
    }

    if (
      trend.direction ===
      "BULLISH"
    ) {
      return Math.max(
        0.7,
        strength,
      );
    }

    if (
      trend.direction ===
      "SIDEWAYS"
    ) {
      return 0.3;
    }

    return 0;
  }

  if (side === TRADE_SIDE.SHORT) {
    if (
      trend.direction ===
      "STRONG_BEARISH"
    ) {
      return Math.max(
        0.9,
        strength,
      );
    }

    if (
      trend.direction ===
      "BEARISH"
    ) {
      return Math.max(
        0.7,
        strength,
      );
    }

    if (
      trend.direction ===
      "SIDEWAYS"
    ) {
      return 0.3;
    }

    return 0;
  }

  return 0;
}

/**
 * ============================================================
 * MOMENTUM SCORE
 * ============================================================
 */

function scoreMomentum({
  side,
  indicators,
}) {
  if (!indicators) {
    return 0;
  }

  let score = 0;
  let parts = 0;

  /**
   * MACD contribution
   */
  const macdDirection =
    indicators.macd
      ?.analysis
      ?.direction;

  if (macdDirection) {
    parts += 1;

    if (
      side === TRADE_SIDE.LONG &&
      macdDirection ===
        "BULLISH"
    ) {
      score += 1;
    } else if (
      side ===
        TRADE_SIDE.SHORT &&
      macdDirection ===
        "BEARISH"
    ) {
      score += 1;
    } else if (
      macdDirection ===
      "NEUTRAL"
    ) {
      score += 0.4;
    }
  }

  /**
   * RSI contribution
   */
  const rsi =
    indicators.rsi;

  if (rsi) {
    parts += 1;

    if (
      side === TRADE_SIDE.LONG
    ) {
      score +=
        Number(
          rsi.bullishScore ??
          0,
        );
    }

    if (
      side === TRADE_SIDE.SHORT
    ) {
      score +=
        Number(
          rsi.bearishScore ??
          0,
        );
    }
  }

  if (parts === 0) {
    return 0;
  }

  return normalizeComponent(
    score / parts,
  );
}

/**
 * ============================================================
 * VOLUME SCORE
 * ============================================================
 */

function scoreVolume({
  volume,
}) {
  if (!volume) {
    return 0;
  }

  const ratio =
    Number(
      volume.volumeRatio,
    );

  if (!isFiniteNumber(ratio)) {
    return 0;
  }

  if (ratio >= 2) {
    return 1;
  }

  if (ratio >= 1.5) {
    return 0.9;
  }

  if (ratio >= 1.2) {
    return 0.75;
  }

  if (ratio >= 1) {
    return 0.5;
  }

  if (ratio >= 0.75) {
    return 0.25;
  }

  return 0.1;
}

/**
 * ============================================================
 * TECHNICAL SETUP SCORE
 * ============================================================
 */

function scoreTechnicalSetup({
  side,
  technical,
}) {
  if (!technical) {
    return 0;
  }

  let score = 0;
  let parts = 0;

  const biasDirection =
    technical.bias
      ?.direction;

  if (biasDirection) {
    parts += 1;

    if (
      side === TRADE_SIDE.LONG &&
      biasDirection === "LONG"
    ) {
      score += 1;
    } else if (
      side ===
        TRADE_SIDE.SHORT &&
      biasDirection === "SHORT"
    ) {
      score += 1;
    } else if (
      biasDirection ===
      "NEUTRAL"
    ) {
      score += 0.35;
    }
  }

  const confirmation =
    technical.confirmation;

  if (confirmation) {
    /**
     * Trend confirmation
     */
    parts += 1;

    if (
      side === TRADE_SIDE.LONG &&
      confirmation.bullishTrend
    ) {
      score += 1;
    } else if (
      side ===
        TRADE_SIDE.SHORT &&
      confirmation.bearishTrend
    ) {
      score += 1;
    }

    /**
     * Momentum confirmation
     */
    parts += 1;

    if (
      side === TRADE_SIDE.LONG &&
      confirmation.bullishMomentum
    ) {
      score += 1;
    } else if (
      side ===
        TRADE_SIDE.SHORT &&
      confirmation.bearishMomentum
    ) {
      score += 1;
    }

    /**
     * VWAP relationship
     */
    parts += 1;

    if (
      side === TRADE_SIDE.LONG &&
      confirmation.aboveVWAP ===
        true
    ) {
      score += 1;
    } else if (
      side ===
        TRADE_SIDE.SHORT &&
      confirmation.belowVWAP ===
        true
    ) {
      score += 1;
    }

    /**
     * Volume confirmation
     */
    parts += 1;

    if (
      confirmation.volume ===
      true
    ) {
      score += 1;
    }
  }

  if (parts === 0) {
    return 0;
  }

  return normalizeComponent(
    score / parts,
  );
}

/**
 * ============================================================
 * VOLATILITY QUALITY SCORE
 * ============================================================
 */

function scoreVolatility({
  atrPercent,
}) {
  if (
    !isFiniteNumber(
      atrPercent,
    )
  ) {
    return 0;
  }

  const atr =
    Number(atrPercent);

  /**
   * Extremely low volatility:
   * weak intraday opportunity.
   */
  if (atr < 0.002) {
    return 0.1;
  }

  /**
   * Healthy range.
   */
  if (
    atr >= 0.002 &&
    atr < 0.015
  ) {
    return 0.9;
  }

  if (
    atr >= 0.015 &&
    atr < 0.03
  ) {
    return 1;
  }

  /**
   * Higher volatility can create opportunity
   * but also increases risk.
   */
  if (
    atr >= 0.03 &&
    atr < 0.05
  ) {
    return 0.7;
  }

  if (
    atr >= 0.05 &&
    atr <= 0.08
  ) {
    return 0.4;
  }

  return 0;
}

/**
 * ============================================================
 * REWARD / RISK SCORE
 * ============================================================
 */

function scoreRewardRisk({
  rewardRiskRatio,
}) {
  if (
    !isFiniteNumber(
      rewardRiskRatio,
    )
  ) {
    /**
     * Some trend trades may not
     * have a fixed target.
     */
    return 0.5;
  }

  const rr =
    Number(
      rewardRiskRatio,
    );

  if (rr >= 4) {
    return 1;
  }

  if (rr >= 3) {
    return 0.9;
  }

  if (rr >= 2) {
    return 0.8;
  }

  if (rr >= 1.5) {
    return 0.6;
  }

  if (rr >= 1) {
    return 0.3;
  }

  return 0;
}

/**
 * ============================================================
 * MARKET REGIME SCORE
 * ============================================================
 */

function scoreMarketRegime({
  side,
  regime,
}) {
  switch (regime) {
    case "STRONG_BULL":
      return side ===
        TRADE_SIDE.LONG
        ? 1
        : 0.2;

    case "BULL":
      return side ===
        TRADE_SIDE.LONG
        ? 0.9
        : 0.35;

    case "SIDEWAYS":
      return 0.5;

    case "BEAR":
      return side ===
        TRADE_SIDE.SHORT
        ? 0.9
        : 0.35;

    case "STRONG_BEAR":
      return side ===
        TRADE_SIDE.SHORT
        ? 1
        : 0.2;

    case "HIGH_VOLATILITY":
      return 0.25;

    default:
      return 0.4;
  }
}

/**
 * ============================================================
 * LIQUIDITY QUALITY SCORE
 * ============================================================
 */

function scoreLiquidity({
  spreadPercent,
  averageDailyVolume,
}) {
  let score = 0;
  let parts = 0;

  if (
    isFiniteNumber(
      spreadPercent,
    )
  ) {
    parts += 1;

    const spread =
      Number(
        spreadPercent,
      );

    if (spread <= 0.0005) {
      score += 1;
    } else if (
      spread <= 0.001
    ) {
      score += 0.9;
    } else if (
      spread <= 0.002
    ) {
      score += 0.7;
    } else if (
      spread <= 0.003
    ) {
      score += 0.5;
    }
  }

  if (
    isFiniteNumber(
      averageDailyVolume,
    )
  ) {
    parts += 1;

    const volume =
      Number(
        averageDailyVolume,
      );

    if (
      volume >=
      10_000_000
    ) {
      score += 1;
    } else if (
      volume >=
      5_000_000
    ) {
      score += 0.9;
    } else if (
      volume >=
      1_000_000
    ) {
      score += 0.7;
    } else if (
      volume >=
      500_000
    ) {
      score += 0.5;
    }
  }

  if (parts === 0) {
    return 0;
  }

  return normalizeComponent(
    score / parts,
  );
}

/**
 * ============================================================
 * NEWS / SENTIMENT SCORE
 * ============================================================
 *
 * Placeholder until we build
 * the news/sentiment engine.
 */

function scoreSentiment({
  side,
  sentiment,
}) {
  if (!sentiment) {
    return 0.5;
  }

  const bullish =
    Number(
      sentiment.bullishScore ??
      0.5,
    );

  const bearish =
    Number(
      sentiment.bearishScore ??
      0.5,
    );

  if (
    side === TRADE_SIDE.LONG
  ) {
    return normalizeComponent(
      bullish,
    );
  }

  return normalizeComponent(
    bearish,
  );
}

/**
 * ============================================================
 * BUILD WEIGHTED COMPONENT
 * ============================================================
 */

function buildComponent({
  name,
  normalizedScore,
}) {
  const weight =
    getWeight(name);

  const normalized =
    normalizeComponent(
      normalizedScore,
    );

  return {
    name,

    normalizedScore:
      round(
        normalized,
        4,
      ),

    weight,

    points:
      round(
        applyWeight(
          normalized,
          weight,
        ),
        2,
      ),
  };
}

/**
 * ============================================================
 * SCORE ONE DIRECTION
 * ============================================================
 */

export function scoreTradeDirection({
  side,

  technical,

  regime,

  rewardRiskRatio,

  spreadPercent,

  averageDailyVolume,

  sentiment = null,
}) {
  if (
    side !== TRADE_SIDE.LONG &&
    side !== TRADE_SIDE.SHORT
  ) {
    return {
      approved: false,

      errors: [
        "Trade side must be LONG or SHORT.",
      ],
    };
  }

  if (
    !technical ||
    technical.approved !== true
  ) {
    return {
      approved: false,

      errors: [
        "Approved technical analysis is required.",
      ],
    };
  }

  const indicators =
    technical.indicators;

  const components = [
    buildComponent({
      name:
        "technicalSetup",

      normalizedScore:
        scoreTechnicalSetup({
          side,
          technical,
        }),
    }),

    buildComponent({
      name:
        "trend",

      normalizedScore:
        scoreTrend({
          side,
          trend:
            technical.trend,
        }),
    }),

    buildComponent({
      name:
        "momentum",

      normalizedScore:
        scoreMomentum({
          side,
          indicators,
        }),
    }),

    buildComponent({
      name:
        "volume",

      normalizedScore:
        scoreVolume({
          volume:
            indicators.volume,
        }),
    }),

    buildComponent({
      name:
        "marketRegime",

      normalizedScore:
        scoreMarketRegime({
          side,
          regime,
        }),
    }),

    buildComponent({
      name:
        "volatilityQuality",

      normalizedScore:
        scoreVolatility({
          atrPercent:
            indicators.atr
              ?.percent,
        }),
    }),

    buildComponent({
      name:
        "rewardRisk",

      normalizedScore:
        scoreRewardRisk({
          rewardRiskRatio,
        }),
    }),

    buildComponent({
      name:
        "newsSentiment",

      normalizedScore:
        scoreSentiment({
          side,
          sentiment,
        }),
    }),

    buildComponent({
      name:
        "liquidityQuality",

      normalizedScore:
        scoreLiquidity({
          spreadPercent,
          averageDailyVolume,
        }),
    }),
  ];

  const totalPoints =
    components.reduce(
      (
        sum,
        component,
      ) =>
        sum +
        Number(
          component.points ||
          0,
        ),
      0,
    );

  const maximumPoints =
    components.reduce(
      (
        sum,
        component,
      ) =>
        sum +
        Number(
          component.weight ||
          0,
        ),
      0,
    );

  const score =
    maximumPoints > 0
      ? (
          totalPoints /
          maximumPoints
        ) * 100
      : 0;

  const finalScore =
    round(
      clamp(
        score,
        0,
        100,
      ),
      2,
    );

  return {
    approved: true,

    side,

    score:
      finalScore,

    passed:
      finalScore >=
      RISK_CONFIG.entry
        .minimumScore,

    minimumRequiredScore:
      RISK_CONFIG.entry
        .minimumScore,

    components,

    totals: {
      points:
        round(
          totalPoints,
          2,
        ),

      maximumPoints:
        round(
          maximumPoints,
          2,
        ),
    },

    errors: [],
  };
}

/**
 * ============================================================
 * SCORE BOTH LONG AND SHORT
 * ============================================================
 *
 * This allows the bot to compare both possibilities rather
 * than assuming direction before analysis.
 */

export function scoreTradeOpportunity({
  technical,

  regime,

  longRewardRiskRatio = null,

  shortRewardRiskRatio = null,

  spreadPercent,

  averageDailyVolume,

  sentiment = null,
}) {
  const longResult =
    scoreTradeDirection({
      side:
        TRADE_SIDE.LONG,

      technical,

      regime,

      rewardRiskRatio:
        longRewardRiskRatio,

      spreadPercent,

      averageDailyVolume,

      sentiment,
    });

  const shortResult =
    scoreTradeDirection({
      side:
        TRADE_SIDE.SHORT,

      technical,

      regime,

      rewardRiskRatio:
        shortRewardRiskRatio,

      spreadPercent,

      averageDailyVolume,

      sentiment,
    });

  if (
    !longResult.approved ||
    !shortResult.approved
  ) {
    return {
      approved: false,

      long:
        longResult,

      short:
        shortResult,

      errors: [
        ...(
          longResult.errors ??
          []
        ),

        ...(
          shortResult.errors ??
          []
        ),
      ],
    };
  }

  let preferredSide =
    null;

  let preferredScore =
    0;

  if (
    longResult.score >
    shortResult.score
  ) {
    preferredSide =
      TRADE_SIDE.LONG;

    preferredScore =
      longResult.score;
  } else if (
    shortResult.score >
    longResult.score
  ) {
    preferredSide =
      TRADE_SIDE.SHORT;

    preferredScore =
      shortResult.score;
  }

  /**
   * If both directions are too close,
   * don't force a trade.
   */
  const scoreDifference =
    Math.abs(
      longResult.score -
      shortResult.score,
    );

  const ambiguous =
    scoreDifference < 8;

  if (ambiguous) {
    preferredSide =
      null;
  }

  return {
    approved: true,

    long:
      longResult,

    short:
      shortResult,

    preferredSide,

    preferredScore:
      round(
        preferredScore,
        2,
      ),

    scoreDifference:
      round(
        scoreDifference,
        2,
      ),

    ambiguous,

    tradeEligible:
      !ambiguous &&
      preferredScore >=
        RISK_CONFIG.entry
          .minimumScore,

    errors: [],
  };
}

export default scoreTradeOpportunity;