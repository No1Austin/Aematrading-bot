/**
 * ============================================================
 * MACRO REGIME ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Analyze the economic environment surrounding a market.
 *
 * This engine does NOT:
 *
 * - execute trades
 * - decide position size
 * - directly trigger BUY / SELL
 *
 * It produces macroeconomic evidence for:
 *
 * - LONG scoring
 * - SHORT scoring
 * - recession risk
 * - market regime classification
 * - risk controls
 *
 * INPUTS
 * ------
 *
 * inflation
 * policy rate
 * GDP growth
 * unemployment
 * employment growth
 * consumer confidence
 * consumer spending
 * yield curve
 * financial conditions
 * credit conditions
 * liquidity
 *
 * OUTPUT
 * ------
 *
 * BULLISH
 * SLIGHTLY_BULLISH
 * NEUTRAL
 * SLIGHTLY_BEARISH
 * BEARISH
 *
 * Plus recession risk and detailed evidence.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const MACRO_DIRECTION = Object.freeze({
  BULLISH: "BULLISH",
  SLIGHTLY_BULLISH:
    "SLIGHTLY_BULLISH",
  NEUTRAL: "NEUTRAL",
  SLIGHTLY_BEARISH:
    "SLIGHTLY_BEARISH",
  BEARISH: "BEARISH",
  UNKNOWN: "UNKNOWN",
});

export const RECESSION_RISK =
  Object.freeze({
    LOW: "LOW",
    MODERATE: "MODERATE",
    ELEVATED: "ELEVATED",
    HIGH: "HIGH",
    CONFIRMED: "CONFIRMED",
    UNKNOWN: "UNKNOWN",
  });

export const DATA_TREND =
  Object.freeze({
    RISING: "RISING",
    FALLING: "FALLING",
    STABLE: "STABLE",
    UNKNOWN: "UNKNOWN",
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

function clamp(
  value,
  minimum,
  maximum,
) {
  return Math.min(
    Math.max(
      Number(value),
      minimum,
    ),
    maximum,
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

function normalizeTrend(value) {
  if (!value) {
    return DATA_TREND.UNKNOWN;
  }

  const normalized =
    String(value)
      .trim()
      .toUpperCase();

  if (
    Object.values(
      DATA_TREND,
    ).includes(normalized)
  ) {
    return normalized;
  }

  return DATA_TREND.UNKNOWN;
}

/**
 * ============================================================
 * EVIDENCE BUILDER
 * ============================================================
 */

function createEvidence({
  factor,
  direction,
  strength,
  description,
  value = null,
}) {
  return {
    factor,

    direction,

    strength:
      clamp(
        strength,
        0,
        1,
      ),

    value,

    description,
  };
}

/**
 * ============================================================
 * INFLATION ANALYSIS
 * ============================================================
 */

function analyzeInflation({
  rate,
  target = 2,
  trend,
}) {
  if (!isFiniteNumber(rate)) {
    return null;
  }

  const inflation =
    Number(rate);

  const inflationTarget =
    isFiniteNumber(target)
      ? Number(target)
      : 2;

  const normalizedTrend =
    normalizeTrend(trend);

  /**
   * Inflation near target and falling/stable
   * generally reduces macro pressure.
   */

  if (
    inflation <=
      inflationTarget + 0.5 &&
    normalizedTrend ===
      DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor: "INFLATION",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.8,

      value: inflation,

      description:
        "Inflation is near target and falling.",
    });
  }

  if (
    inflation <=
      inflationTarget + 0.5 &&
    normalizedTrend ===
      DATA_TREND.STABLE
  ) {
    return createEvidence({
      factor: "INFLATION",

      direction:
        MACRO_DIRECTION.SLIGHTLY_BULLISH,

      strength: 0.6,

      value: inflation,

      description:
        "Inflation is relatively stable near target.",
    });
  }

  if (
    inflation >
      inflationTarget + 2 &&
    normalizedTrend ===
      DATA_TREND.RISING
  ) {
    return createEvidence({
      factor: "INFLATION",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength: 1,

      value: inflation,

      description:
        "Inflation is significantly above target and rising.",
    });
  }

  if (
    inflation >
    inflationTarget + 1
  ) {
    return createEvidence({
      factor: "INFLATION",

      direction:
        MACRO_DIRECTION.SLIGHTLY_BEARISH,

      strength: 0.7,

      value: inflation,

      description:
        "Inflation remains above the preferred range.",
    });
  }

  return createEvidence({
    factor: "INFLATION",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.4,

    value: inflation,

    description:
      "Inflation is not producing a strong directional signal.",
  });
}

/**
 * ============================================================
 * POLICY RATE ANALYSIS
 * ============================================================
 */

function analyzePolicyRate({
  rate,
  trend,
}) {
  if (!isFiniteNumber(rate)) {
    return null;
  }

  const policyRate =
    Number(rate);

  const normalizedTrend =
    normalizeTrend(trend);

  if (
    normalizedTrend ===
    DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor: "POLICY_RATE",

      direction:
        MACRO_DIRECTION.SLIGHTLY_BULLISH,

      strength: 0.7,

      value: policyRate,

      description:
        "Policy rates are falling, potentially easing financial conditions.",
    });
  }

  if (
    normalizedTrend ===
    DATA_TREND.RISING
  ) {
    return createEvidence({
      factor: "POLICY_RATE",

      direction:
        MACRO_DIRECTION.SLIGHTLY_BEARISH,

      strength: 0.75,

      value: policyRate,

      description:
        "Policy rates are rising, increasing financing pressure.",
    });
  }

  return createEvidence({
    factor: "POLICY_RATE",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.4,

    value: policyRate,

    description:
      "Policy rates are relatively stable.",
  });
}

/**
 * ============================================================
 * GDP ANALYSIS
 * ============================================================
 */

function analyzeGDP({
  growth,
  trend,
}) {
  if (!isFiniteNumber(growth)) {
    return null;
  }

  const gdp =
    Number(growth);

  const normalizedTrend =
    normalizeTrend(trend);

  if (
    gdp >= 2 &&
    normalizedTrend !==
      DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor: "GDP",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.8,

      value: gdp,

      description:
        "Economic growth is healthy.",
    });
  }

  if (gdp > 0) {
    return createEvidence({
      factor: "GDP",

      direction:
        normalizedTrend ===
        DATA_TREND.FALLING
          ? MACRO_DIRECTION
              .SLIGHTLY_BEARISH
          : MACRO_DIRECTION
              .SLIGHTLY_BULLISH,

      strength: 0.55,

      value: gdp,

      description:
        normalizedTrend ===
        DATA_TREND.FALLING
          ? "Economic growth remains positive but is slowing."
          : "Economic output continues to expand.",
    });
  }

  return createEvidence({
    factor: "GDP",

    direction:
      MACRO_DIRECTION.BEARISH,

    strength:
      gdp <= -1
        ? 1
        : 0.8,

    value: gdp,

    description:
      "Economic output is contracting.",
  });
}

/**
 * ============================================================
 * UNEMPLOYMENT ANALYSIS
 * ============================================================
 */

function analyzeUnemployment({
  rate,
  trend,
}) {
  if (!isFiniteNumber(rate)) {
    return null;
  }

  const unemployment =
    Number(rate);

  const normalizedTrend =
    normalizeTrend(trend);

  /**
   * Direction matters more than a universal
   * unemployment threshold because normal
   * unemployment differs between countries.
   */

  if (
    normalizedTrend ===
    DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor:
        "UNEMPLOYMENT",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.7,

      value: unemployment,

      description:
        "Unemployment is falling.",
    });
  }

  if (
    normalizedTrend ===
    DATA_TREND.RISING
  ) {
    return createEvidence({
      factor:
        "UNEMPLOYMENT",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength: 0.8,

      value: unemployment,

      description:
        "Unemployment is rising.",
    });
  }

  return createEvidence({
    factor:
      "UNEMPLOYMENT",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.4,

    value: unemployment,

    description:
      "Unemployment is relatively stable.",
  });
}

/**
 * ============================================================
 * EMPLOYMENT GROWTH
 * ============================================================
 */

function analyzeEmploymentGrowth({
  growth,
  trend,
}) {
  if (!isFiniteNumber(growth)) {
    return null;
  }

  const value =
    Number(growth);

  const normalizedTrend =
    normalizeTrend(trend);

  if (
    value > 0 &&
    normalizedTrend !==
      DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor:
        "EMPLOYMENT_GROWTH",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.7,

      value,

      description:
        "Employment is expanding.",
    });
  }

  if (
    value < 0
  ) {
    return createEvidence({
      factor:
        "EMPLOYMENT_GROWTH",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength: 0.8,

      value,

      description:
        "Employment is contracting.",
    });
  }

  return createEvidence({
    factor:
      "EMPLOYMENT_GROWTH",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.4,

    value,

    description:
      "Employment growth is subdued.",
  });
}

/**
 * ============================================================
 * CONSUMER CONFIDENCE
 * ============================================================
 */

function analyzeConsumerConfidence({
  value,
  trend,
}) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const confidence =
    Number(value);

  const normalizedTrend =
    normalizeTrend(trend);

  if (
    normalizedTrend ===
    DATA_TREND.RISING
  ) {
    return createEvidence({
      factor:
        "CONSUMER_CONFIDENCE",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.65,

      value: confidence,

      description:
        "Consumer confidence is improving.",
    });
  }

  if (
    normalizedTrend ===
    DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor:
        "CONSUMER_CONFIDENCE",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength: 0.65,

      value: confidence,

      description:
        "Consumer confidence is deteriorating.",
    });
  }

  return createEvidence({
    factor:
      "CONSUMER_CONFIDENCE",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.35,

    value: confidence,

    description:
      "Consumer confidence is relatively stable.",
  });
}

/**
 * ============================================================
 * CONSUMER SPENDING
 * ============================================================
 */

function analyzeConsumerSpending({
  growth,
  trend,
}) {
  if (!isFiniteNumber(growth)) {
    return null;
  }

  const spendingGrowth =
    Number(growth);

  const normalizedTrend =
    normalizeTrend(trend);

  if (
    spendingGrowth > 0 &&
    normalizedTrend !==
      DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor:
        "CONSUMER_SPENDING",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.65,

      value:
        spendingGrowth,

      description:
        "Consumer spending is expanding.",
    });
  }

  if (
    spendingGrowth < 0
  ) {
    return createEvidence({
      factor:
        "CONSUMER_SPENDING",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength: 0.8,

      value:
        spendingGrowth,

      description:
        "Consumer spending is contracting.",
    });
  }

  return createEvidence({
    factor:
      "CONSUMER_SPENDING",

    direction:
      normalizedTrend ===
      DATA_TREND.FALLING
        ? MACRO_DIRECTION
            .SLIGHTLY_BEARISH
        : MACRO_DIRECTION
            .NEUTRAL,

    strength: 0.45,

    value:
      spendingGrowth,

    description:
      "Consumer spending growth is weak or flat.",
  });
}

/**
 * ============================================================
 * YIELD CURVE
 * ============================================================
 *
 * Spread should be provided in percentage points.
 *
 * Example:
 *
 * 10Y Treasury = 4.2%
 * 2Y Treasury  = 4.5%
 *
 * spread = -0.3
 */

function analyzeYieldCurve({
  spread,
  trend,
}) {
  if (!isFiniteNumber(spread)) {
    return null;
  }

  const value =
    Number(spread);

  const normalizedTrend =
    normalizeTrend(trend);

  if (value < 0) {
    return createEvidence({
      factor:
        "YIELD_CURVE",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength:
        value <= -0.5
          ? 0.9
          : 0.7,

      value,

      description:
        "The yield curve is inverted, increasing recession concern.",
    });
  }

  if (
    value > 0 &&
    normalizedTrend ===
      DATA_TREND.RISING
  ) {
    return createEvidence({
      factor:
        "YIELD_CURVE",

      direction:
        MACRO_DIRECTION.SLIGHTLY_BULLISH,

      strength: 0.55,

      value,

      description:
        "The yield curve is positively sloped and steepening.",
    });
  }

  return createEvidence({
    factor:
      "YIELD_CURVE",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.4,

    value,

    description:
      "The yield curve is not generating a strong directional signal.",
  });
}

/**
 * ============================================================
 * FINANCIAL CONDITIONS
 * ============================================================
 *
 * Expected normalized input:
 *
 * -1 = very loose
 *  0 = normal
 * +1 = very tight
 */

function analyzeFinancialConditions({
  index,
  trend,
}) {
  if (!isFiniteNumber(index)) {
    return null;
  }

  const value =
    Number(index);

  const normalizedTrend =
    normalizeTrend(trend);

  if (
    value >= 0.5 ||
    (
      value > 0 &&
      normalizedTrend ===
        DATA_TREND.RISING
    )
  ) {
    return createEvidence({
      factor:
        "FINANCIAL_CONDITIONS",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength:
        clamp(
          0.6 +
            Math.abs(value) *
              0.2,
          0,
          1,
        ),

      value,

      description:
        "Financial conditions are tight or tightening.",
    });
  }

  if (
    value <= -0.5 ||
    (
      value < 0 &&
      normalizedTrend ===
        DATA_TREND.FALLING
    )
  ) {
    return createEvidence({
      factor:
        "FINANCIAL_CONDITIONS",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength:
        clamp(
          0.6 +
            Math.abs(value) *
              0.2,
          0,
          1,
        ),

      value,

      description:
        "Financial conditions are loose or easing.",
    });
  }

  return createEvidence({
    factor:
      "FINANCIAL_CONDITIONS",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.4,

    value,

    description:
      "Financial conditions are close to normal.",
  });
}

/**
 * ============================================================
 * CREDIT CONDITIONS
 * ============================================================
 *
 * Input:
 *
 * TIGHTENING
 * EASING
 * STABLE
 */

function analyzeCreditConditions({
  state,
}) {
  if (!state) {
    return null;
  }

  const normalized =
    String(state)
      .trim()
      .toUpperCase();

  if (
    normalized ===
    "TIGHTENING"
  ) {
    return createEvidence({
      factor:
        "CREDIT_CONDITIONS",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength: 0.8,

      value: normalized,

      description:
        "Credit availability is tightening.",
    });
  }

  if (
    normalized ===
    "EASING"
  ) {
    return createEvidence({
      factor:
        "CREDIT_CONDITIONS",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.7,

      value: normalized,

      description:
        "Credit conditions are easing.",
    });
  }

  return createEvidence({
    factor:
      "CREDIT_CONDITIONS",

    direction:
      MACRO_DIRECTION.NEUTRAL,

    strength: 0.4,

    value: normalized,

    description:
      "Credit conditions are relatively stable.",
  });
}

/**
 * ============================================================
 * LIQUIDITY
 * ============================================================
 */

function analyzeLiquidity({
  trend,
}) {
  const normalizedTrend =
    normalizeTrend(trend);

  if (
    normalizedTrend ===
    DATA_TREND.RISING
  ) {
    return createEvidence({
      factor: "LIQUIDITY",

      direction:
        MACRO_DIRECTION.BULLISH,

      strength: 0.7,

      value:
        normalizedTrend,

      description:
        "System liquidity is expanding.",
    });
  }

  if (
    normalizedTrend ===
    DATA_TREND.FALLING
  ) {
    return createEvidence({
      factor: "LIQUIDITY",

      direction:
        MACRO_DIRECTION.BEARISH,

      strength: 0.75,

      value:
        normalizedTrend,

      description:
        "System liquidity is contracting.",
    });
  }

  if (
    normalizedTrend ===
    DATA_TREND.STABLE
  ) {
    return createEvidence({
      factor: "LIQUIDITY",

      direction:
        MACRO_DIRECTION.NEUTRAL,

      strength: 0.4,

      value:
        normalizedTrend,

      description:
        "System liquidity is stable.",
    });
  }

  return null;
}

/**
 * ============================================================
 * DIRECTION → NUMERIC VALUE
 * ============================================================
 */

function directionValue(
  direction,
) {
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
 * COMBINE MACRO EVIDENCE
 * ============================================================
 */

function combineEvidence(
  evidence,
) {
  if (
    !Array.isArray(evidence) ||
    evidence.length === 0
  ) {
    return {
      direction:
        MACRO_DIRECTION.UNKNOWN,

      confidence: 0,

      rawScore: 0,
    };
  }

  let weightedScore = 0;
  let totalStrength = 0;

  for (
    const item
    of evidence
  ) {
    const strength =
      Number(
        item.strength ??
        0,
      );

    weightedScore +=
      directionValue(
        item.direction,
      ) *
      strength;

    totalStrength +=
      strength;
  }

  if (
    totalStrength <= 0
  ) {
    return {
      direction:
        MACRO_DIRECTION.UNKNOWN,

      confidence: 0,

      rawScore: 0,
    };
  }

  const normalizedScore =
    weightedScore /
    totalStrength;

  const confidence =
    clamp(
      Math.abs(
        normalizedScore,
      ),
      0,
      1,
    );

  let direction =
    MACRO_DIRECTION.NEUTRAL;

  if (
    normalizedScore >= 0.5
  ) {
    direction =
      MACRO_DIRECTION.BULLISH;
  } else if (
    normalizedScore >= 0.2
  ) {
    direction =
      MACRO_DIRECTION
        .SLIGHTLY_BULLISH;
  } else if (
    normalizedScore <= -0.5
  ) {
    direction =
      MACRO_DIRECTION.BEARISH;
  } else if (
    normalizedScore <= -0.2
  ) {
    direction =
      MACRO_DIRECTION
        .SLIGHTLY_BEARISH;
  }

  return {
    direction,

    confidence:
      round(
        confidence,
        4,
      ),

    rawScore:
      round(
        normalizedScore,
        4,
      ),
  };
}

/**
 * ============================================================
 * RECESSION RISK ENGINE
 * ============================================================
 *
 * This is intentionally probabilistic.
 *
 * It does NOT say:
 *
 * recession = true / false
 *
 * It builds a risk score from multiple
 * deterioration signals.
 */

function calculateRecessionRisk({
  gdp,
  unemployment,
  employment,
  yieldCurve,
  consumerConfidence,
  consumerSpending,
  financialConditions,
  creditConditions,
}) {
  let riskPoints = 0;
  let possiblePoints = 0;

  /**
   * GDP
   */
  if (
    gdp &&
    isFiniteNumber(
      gdp.growth,
    )
  ) {
    possiblePoints += 2;

    if (
      Number(gdp.growth) < 0
    ) {
      riskPoints += 2;
    } else if (
      normalizeTrend(
        gdp.trend,
      ) ===
      DATA_TREND.FALLING
    ) {
      riskPoints += 1;
    }
  }

  /**
   * Unemployment
   */
  if (
    unemployment &&
    isFiniteNumber(
      unemployment.rate,
    )
  ) {
    possiblePoints += 2;

    if (
      normalizeTrend(
        unemployment.trend,
      ) ===
      DATA_TREND.RISING
    ) {
      riskPoints += 2;
    }
  }

  /**
   * Employment
   */
  if (
    employment &&
    isFiniteNumber(
      employment.growth,
    )
  ) {
    possiblePoints += 1;

    if (
      Number(
        employment.growth,
      ) < 0
    ) {
      riskPoints += 1;
    }
  }

  /**
   * Yield curve
   */
  if (
    yieldCurve &&
    isFiniteNumber(
      yieldCurve.spread,
    )
  ) {
    possiblePoints += 1;

    if (
      Number(
        yieldCurve.spread,
      ) < 0
    ) {
      riskPoints += 1;
    }
  }

  /**
   * Consumer confidence
   */
  if (
    consumerConfidence &&
    isFiniteNumber(
      consumerConfidence.value,
    )
  ) {
    possiblePoints += 1;

    if (
      normalizeTrend(
        consumerConfidence.trend,
      ) ===
      DATA_TREND.FALLING
    ) {
      riskPoints += 1;
    }
  }

  /**
   * Consumer spending
   */
  if (
    consumerSpending &&
    isFiniteNumber(
      consumerSpending.growth,
    )
  ) {
    possiblePoints += 1;

    if (
      Number(
        consumerSpending.growth,
      ) < 0
    ) {
      riskPoints += 1;
    }
  }

  /**
   * Financial conditions
   */
  if (
    financialConditions &&
    isFiniteNumber(
      financialConditions.index,
    )
  ) {
    possiblePoints += 1;

    if (
      Number(
        financialConditions.index,
      ) > 0.5
    ) {
      riskPoints += 1;
    }
  }

  /**
   * Credit conditions
   */
  if (
    creditConditions?.state
  ) {
    possiblePoints += 1;

    if (
      String(
        creditConditions.state,
      )
        .toUpperCase() ===
      "TIGHTENING"
    ) {
      riskPoints += 1;
    }
  }

  if (
    possiblePoints === 0
  ) {
    return {
      level:
        RECESSION_RISK.UNKNOWN,

      score: null,

      riskPoints: 0,

      possiblePoints: 0,
    };
  }

  const score =
    (
      riskPoints /
      possiblePoints
    ) * 100;

  let level =
    RECESSION_RISK.LOW;

  if (score >= 80) {
    level =
      RECESSION_RISK.HIGH;
  } else if (
    score >= 60
  ) {
    level =
      RECESSION_RISK.ELEVATED;
  } else if (
    score >= 35
  ) {
    level =
      RECESSION_RISK.MODERATE;
  }

  /**
   * "CONFIRMED" should eventually come
   * from an authoritative recession
   * classification source rather than
   * this heuristic alone.
   */

  return {
    level,

    score:
      round(
        score,
        2,
      ),

    riskPoints,

    possiblePoints,
  };
}

/**
 * ============================================================
 * LONG / SHORT MACRO SCORES
 * ============================================================
 */

function calculateDirectionalScores({
  combined,
}) {
  const raw =
    Number(
      combined.rawScore ??
      0,
    );

  /**
   * Convert:
   *
   * -1 → strong SHORT
   *  0 → neutral
   * +1 → strong LONG
   *
   * into independent normalized
   * directional evidence.
   */

  const longScore =
    clamp(
      (raw + 1) / 2,
      0,
      1,
    );

  const shortScore =
    clamp(
      (1 - raw) / 2,
      0,
      1,
    );

  return {
    long:
      round(
        longScore,
        4,
      ),

    short:
      round(
        shortScore,
        4,
      ),
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeMacroRegime({
  country = null,

  inflation = null,

  policyRate = null,

  gdp = null,

  unemployment = null,

  employment = null,

  consumerConfidence = null,

  consumerSpending = null,

  yieldCurve = null,

  financialConditions = null,

  creditConditions = null,

  liquidity = null,
} = {}) {
  try {
    const evidence = [];

    /**
     * Inflation
     */
    const inflationEvidence =
      inflation
        ? analyzeInflation({
            rate:
              inflation.rate,

            target:
              inflation.target,

            trend:
              inflation.trend,
          })
        : null;

    if (inflationEvidence) {
      evidence.push(
        inflationEvidence,
      );
    }

    /**
     * Policy rates
     */
    const policyRateEvidence =
      policyRate
        ? analyzePolicyRate({
            rate:
              policyRate.rate,

            trend:
              policyRate.trend,
          })
        : null;

    if (policyRateEvidence) {
      evidence.push(
        policyRateEvidence,
      );
    }

    /**
     * GDP
     */
    const gdpEvidence =
      gdp
        ? analyzeGDP({
            growth:
              gdp.growth,

            trend:
              gdp.trend,
          })
        : null;

    if (gdpEvidence) {
      evidence.push(
        gdpEvidence,
      );
    }

    /**
     * Unemployment
     */
    const unemploymentEvidence =
      unemployment
        ? analyzeUnemployment({
            rate:
              unemployment.rate,

            trend:
              unemployment.trend,
          })
        : null;

    if (
      unemploymentEvidence
    ) {
      evidence.push(
        unemploymentEvidence,
      );
    }

    /**
     * Employment
     */
    const employmentEvidence =
      employment
        ? analyzeEmploymentGrowth({
            growth:
              employment.growth,

            trend:
              employment.trend,
          })
        : null;

    if (
      employmentEvidence
    ) {
      evidence.push(
        employmentEvidence,
      );
    }

    /**
     * Consumer confidence
     */
    const consumerConfidenceEvidence =
      consumerConfidence
        ? analyzeConsumerConfidence({
            value:
              consumerConfidence.value,

            trend:
              consumerConfidence.trend,
          })
        : null;

    if (
      consumerConfidenceEvidence
    ) {
      evidence.push(
        consumerConfidenceEvidence,
      );
    }

    /**
     * Consumer spending
     */
    const consumerSpendingEvidence =
      consumerSpending
        ? analyzeConsumerSpending({
            growth:
              consumerSpending.growth,

            trend:
              consumerSpending.trend,
          })
        : null;

    if (
      consumerSpendingEvidence
    ) {
      evidence.push(
        consumerSpendingEvidence,
      );
    }

    /**
     * Yield curve
     */
    const yieldCurveEvidence =
      yieldCurve
        ? analyzeYieldCurve({
            spread:
              yieldCurve.spread,

            trend:
              yieldCurve.trend,
          })
        : null;

    if (
      yieldCurveEvidence
    ) {
      evidence.push(
        yieldCurveEvidence,
      );
    }

    /**
     * Financial conditions
     */
    const financialConditionsEvidence =
      financialConditions
        ? analyzeFinancialConditions({
            index:
              financialConditions.index,

            trend:
              financialConditions.trend,
          })
        : null;

    if (
      financialConditionsEvidence
    ) {
      evidence.push(
        financialConditionsEvidence,
      );
    }

    /**
     * Credit conditions
     */
    const creditConditionsEvidence =
      creditConditions
        ? analyzeCreditConditions({
            state:
              creditConditions.state,
          })
        : null;

    if (
      creditConditionsEvidence
    ) {
      evidence.push(
        creditConditionsEvidence,
      );
    }

    /**
     * Liquidity
     */
    const liquidityEvidence =
      liquidity
        ? analyzeLiquidity({
            trend:
              liquidity.trend,
          })
        : null;

    if (
      liquidityEvidence
    ) {
      evidence.push(
        liquidityEvidence,
      );
    }

    /**
     * ======================================================
     * FAIL SAFE — NO DATA
     * ======================================================
     */

    if (
      evidence.length === 0
    ) {
      return {
        approved: false,

        engine:
          "MACRO_REGIME",

        status:
          "INSUFFICIENT_DATA",

        direction:
          MACRO_DIRECTION.UNKNOWN,

        confidence: 0,

        directionalScores: {
          long: 0,
          short: 0,
        },

        recessionRisk: {
          level:
            RECESSION_RISK.UNKNOWN,

          score: null,
        },

        evidence: [],

        warnings: [
          "No usable macroeconomic data was supplied.",
        ],

        errors: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * Combine evidence.
     */

    const combined =
      combineEvidence(
        evidence,
      );

    const directionalScores =
      calculateDirectionalScores({
        combined,
      });

    /**
     * Recession analysis.
     */

    const recessionRisk =
      calculateRecessionRisk({
        gdp,

        unemployment,

        employment,

        yieldCurve,

        consumerConfidence,

        consumerSpending,

        financialConditions,

        creditConditions,
      });

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    const warnings = [];

    if (
      evidence.length < 5
    ) {
      warnings.push(
        "Macro analysis is based on fewer than five usable indicators.",
      );
    }

    if (
      recessionRisk.level ===
        RECESSION_RISK.HIGH ||
      recessionRisk.level ===
        RECESSION_RISK.ELEVATED
    ) {
      warnings.push(
        `Recession risk is ${recessionRisk.level}.`,
      );
    }

    /**
     * ======================================================
     * FRONTEND-FRIENDLY SUMMARY
     * ======================================================
     */

    const countryLabel =
      country
        ? String(country)
            .toUpperCase()
        : "UNKNOWN";

    const summary =
      `${countryLabel} macro conditions are ${combined.direction.replaceAll(
        "_",
        " ",
      ).toLowerCase()} with ${round(
        combined.confidence *
          100,
        1,
      )}% directional confidence.`;

    /**
     * ======================================================
     * FINAL RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "MACRO_REGIME",

      status:
        "COMPLETE",

      country,

      direction:
        combined.direction,

      confidence:
        combined.confidence,

      rawScore:
        combined.rawScore,

      directionalScores,

      recessionRisk,

      summary,

      evidence,

      warnings,

      errors: [],

      /**
       * This engine's final contribution
       * to the master score is capped at
       * 15 points.
       *
       * We are NOT applying those points
       * here yet.
       *
       * tradeScoringEngine.js will do that.
       */
      maximumScore: 15,

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
     * Macro failure must NEVER become
     * bullish or bearish evidence.
     */

    return {
      approved: false,

      engine:
        "MACRO_REGIME",

      status:
        "ERROR",

      direction:
        MACRO_DIRECTION.UNKNOWN,

      confidence: 0,

      directionalScores: {
        long: 0,
        short: 0,
      },

      recessionRisk: {
        level:
          RECESSION_RISK.UNKNOWN,

        score: null,
      },

      evidence: [],

      warnings: [
        "Macro regime engine failed safely. No macro directional evidence should be awarded.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      maximumScore: 15,

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default analyzeMacroRegime;