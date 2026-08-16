/**
 * ============================================================
 * COUNTRY RISK ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Analyze the economic and policy environment of a country
 * connected to a company or asset.
 *
 * This engine considers:
 *
 * - Economic growth
 * - Inflation
 * - Interest rates
 * - Currency strength
 * - Capital flows
 * - Sovereign risk
 * - Fiscal conditions
 * - Political stability
 * - Trade exposure
 * - Credit conditions
 * - Consumer conditions
 * - Banking stress
 *
 * It does NOT:
 *
 * - execute trades
 * - directly say BUY or SELL
 *
 * It produces independent LONG / SHORT evidence that contributes
 * to the final scoring model.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const COUNTRY_DIRECTION =
  Object.freeze({
    STRONGLY_POSITIVE:
      "STRONGLY_POSITIVE",

    POSITIVE:
      "POSITIVE",

    NEUTRAL:
      "NEUTRAL",

    NEGATIVE:
      "NEGATIVE",

    STRONGLY_NEGATIVE:
      "STRONGLY_NEGATIVE",

    UNKNOWN:
      "UNKNOWN",
  });

export const RISK_LEVEL =
  Object.freeze({
    LOW: "LOW",

    MODERATE:
      "MODERATE",

    ELEVATED:
      "ELEVATED",

    HIGH:
      "HIGH",

    EXTREME:
      "EXTREME",

    UNKNOWN:
      "UNKNOWN",
  });

export const TREND =
  Object.freeze({
    IMPROVING:
      "IMPROVING",

    WORSENING:
      "WORSENING",

    STABLE:
      "STABLE",

    RISING:
      "RISING",

    FALLING:
      "FALLING",

    UNKNOWN:
      "UNKNOWN",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(
  value,
) {
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

function normalizeText(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .trim()
    .toUpperCase();
}

function normalizeTrend(
  value,
) {
  const normalized =
    normalizeText(value);

  if (
    Object.values(
      TREND,
    ).includes(
      normalized,
    )
  ) {
    return normalized;
  }

  return TREND.UNKNOWN;
}

/**
 * ============================================================
 * EVIDENCE FACTORY
 * ============================================================
 */

function createEvidence({
  factor,

  score,

  confidence,

  value = null,

  summary,
}) {
  return {
    factor,

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence:
      clamp(
        confidence,
        0,
        1,
      ),

    value,

    summary,
  };
}

/**
 * ============================================================
 * ECONOMIC GROWTH
 * ============================================================
 */

function analyzeGrowth({
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
    value >= 3 &&
    normalizedTrend !==
      TREND.WORSENING &&
    normalizedTrend !==
      TREND.FALLING
  ) {
    return createEvidence({
      factor:
        "ECONOMIC_GROWTH",

      score: 1,

      confidence: 0.8,

      value,

      summary:
        "Economic growth is strong.",
    });
  }

  if (value >= 1.5) {
    return createEvidence({
      factor:
        "ECONOMIC_GROWTH",

      score:
        normalizedTrend ===
          TREND.WORSENING ||
        normalizedTrend ===
          TREND.FALLING
          ? 0.2
          : 0.6,

      confidence: 0.7,

      value,

      summary:
        normalizedTrend ===
          TREND.WORSENING ||
        normalizedTrend ===
          TREND.FALLING
          ? "Economic growth remains positive but is weakening."
          : "Economic growth is healthy.",
    });
  }

  if (value > 0) {
    return createEvidence({
      factor:
        "ECONOMIC_GROWTH",

      score: 0.15,

      confidence: 0.6,

      value,

      summary:
        "Economic growth is positive but weak.",
    });
  }

  if (value <= -1) {
    return createEvidence({
      factor:
        "ECONOMIC_GROWTH",

      score: -1,

      confidence: 0.85,

      value,

      summary:
        "Economic output is contracting materially.",
    });
  }

  return createEvidence({
    factor:
      "ECONOMIC_GROWTH",

    score: -0.6,

    confidence: 0.75,

    value,

    summary:
      "Economic output is contracting.",
  });
}

/**
 * ============================================================
 * INFLATION
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

  const targetRate =
    isFiniteNumber(target)
      ? Number(target)
      : 2;

  const normalizedTrend =
    normalizeTrend(trend);

  const deviation =
    inflation -
    targetRate;

  if (
    Math.abs(deviation) <=
      0.5 &&
    (
      normalizedTrend ===
        TREND.STABLE ||
      normalizedTrend ===
        TREND.FALLING ||
      normalizedTrend ===
        TREND.IMPROVING
    )
  ) {
    return createEvidence({
      factor:
        "INFLATION",

      score: 0.7,

      confidence: 0.7,

      value: inflation,

      summary:
        "Inflation is close to target and relatively controlled.",
    });
  }

  if (
    deviation >= 2 &&
    (
      normalizedTrend ===
        TREND.RISING ||
      normalizedTrend ===
        TREND.WORSENING
    )
  ) {
    return createEvidence({
      factor:
        "INFLATION",

      score: -1,

      confidence: 0.85,

      value: inflation,

      summary:
        "Inflation is significantly above target and worsening.",
    });
  }

  if (
    deviation > 1
  ) {
    return createEvidence({
      factor:
        "INFLATION",

      score: -0.6,

      confidence: 0.7,

      value: inflation,

      summary:
        "Inflation remains materially above target.",
    });
  }

  return createEvidence({
    factor:
      "INFLATION",

    score: 0,

    confidence: 0.45,

    value: inflation,

    summary:
      "Inflation is not producing a strong country-level signal.",
  });
}

/**
 * ============================================================
 * INTEREST RATE CONDITIONS
 * ============================================================
 */

function analyzeRates({
  rate,
  trend,
}) {
  if (!isFiniteNumber(rate)) {
    return null;
  }

  const value =
    Number(rate);

  const normalizedTrend =
    normalizeTrend(trend);

  if (
    normalizedTrend ===
      TREND.FALLING ||
    normalizedTrend ===
      TREND.IMPROVING
  ) {
    return createEvidence({
      factor:
        "INTEREST_RATES",

      score: 0.55,

      confidence: 0.65,

      value,

      summary:
        "Interest-rate conditions are easing.",
    });
  }

  if (
    normalizedTrend ===
      TREND.RISING ||
    normalizedTrend ===
      TREND.WORSENING
  ) {
    return createEvidence({
      factor:
        "INTEREST_RATES",

      score: -0.55,

      confidence: 0.65,

      value,

      summary:
        "Interest-rate pressure is increasing.",
    });
  }

  return createEvidence({
    factor:
      "INTEREST_RATES",

    score: 0,

    confidence: 0.4,

    value,

    summary:
      "Interest-rate policy is relatively stable.",
  });
}

/**
 * ============================================================
 * CURRENCY
 * ============================================================
 *
 * Expected strength score:
 *
 * -1 = very weak
 *  0 = neutral
 * +1 = very strong
 *
 * IMPORTANT:
 *
 * Currency effects depend on company exposure.
 *
 * A strong home currency can:
 *
 * - improve import economics
 * - hurt exporters
 *
 * This engine produces country context.
 * Company-specific currency exposure will be handled separately.
 */

function analyzeCurrency({
  strengthScore,
  volatilityScore = 0,
}) {
  if (
    !isFiniteNumber(
      strengthScore,
    )
  ) {
    return null;
  }

  const strength =
    clamp(
      strengthScore,
      -1,
      1,
    );

  const volatility =
    isFiniteNumber(
      volatilityScore,
    )
      ? clamp(
          volatilityScore,
          0,
          1,
        )
      : 0;

  let score =
    strength * 0.4;

  /**
   * Excessive currency volatility
   * is generally destabilizing.
   */
  score -=
    volatility * 0.5;

  return createEvidence({
    factor:
      "CURRENCY",

    score,

    confidence:
      0.6,

    value: {
      strength,
      volatility,
    },

    summary:
      volatility >= 0.7
        ? "Currency volatility is elevated and may increase market risk."
        : strength > 0.3
          ? "The domestic currency is relatively strong."
          : strength < -0.3
            ? "The domestic currency is relatively weak."
            : "Currency conditions are relatively balanced.",
  });
}

/**
 * ============================================================
 * CAPITAL FLOWS
 * ============================================================
 *
 * Expected flowScore:
 *
 * -1 = heavy outflows
 * +1 = heavy inflows
 */

function analyzeCapitalFlows({
  flowScore,
  trend,
}) {
  if (
    !isFiniteNumber(
      flowScore,
    )
  ) {
    return null;
  }

  const flow =
    clamp(
      flowScore,
      -1,
      1,
    );

  const normalizedTrend =
    normalizeTrend(trend);

  let score =
    flow;

  if (
    normalizedTrend ===
      TREND.IMPROVING ||
    normalizedTrend ===
      TREND.RISING
  ) {
    score += 0.15;
  }

  if (
    normalizedTrend ===
      TREND.WORSENING ||
    normalizedTrend ===
      TREND.FALLING
  ) {
    score -= 0.15;
  }

  return createEvidence({
    factor:
      "CAPITAL_FLOWS",

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence: 0.75,

    value: flow,

    summary:
      flow >= 0.5
        ? "Capital inflows are strong."
        : flow <= -0.5
          ? "Capital outflows are significant."
          : "Capital flows are relatively balanced.",
  });
}

/**
 * ============================================================
 * SOVEREIGN RISK
 * ============================================================
 *
 * riskScore:
 *
 * 0 = very low sovereign risk
 * 1 = extreme sovereign risk
 */

function analyzeSovereignRisk({
  riskScore,
}) {
  if (
    !isFiniteNumber(
      riskScore,
    )
  ) {
    return null;
  }

  const risk =
    clamp(
      riskScore,
      0,
      1,
    );

  return createEvidence({
    factor:
      "SOVEREIGN_RISK",

    score:
      -risk,

    confidence: 0.8,

    value: risk,

    summary:
      risk >= 0.8
        ? "Sovereign risk is extremely elevated."
        : risk >= 0.6
          ? "Sovereign risk is high."
          : risk >= 0.35
            ? "Sovereign risk is elevated."
            : "Sovereign risk is relatively low.",
  });
}

/**
 * ============================================================
 * FISCAL CONDITIONS
 * ============================================================
 *
 * Expected pressureScore:
 *
 * 0 = healthy
 * 1 = severe fiscal pressure
 */

function analyzeFiscal({
  pressureScore,
  trend,
}) {
  if (
    !isFiniteNumber(
      pressureScore,
    )
  ) {
    return null;
  }

  const pressure =
    clamp(
      pressureScore,
      0,
      1,
    );

  const normalizedTrend =
    normalizeTrend(trend);

  let score =
    -pressure;

  if (
    normalizedTrend ===
      TREND.IMPROVING ||
    normalizedTrend ===
      TREND.FALLING
  ) {
    score += 0.15;
  }

  if (
    normalizedTrend ===
      TREND.WORSENING ||
    normalizedTrend ===
      TREND.RISING
  ) {
    score -= 0.15;
  }

  return createEvidence({
    factor:
      "FISCAL_CONDITIONS",

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence: 0.65,

    value: pressure,

    summary:
      pressure >= 0.7
        ? "Fiscal pressure is high."
        : pressure >= 0.4
          ? "Fiscal conditions are somewhat strained."
          : "Fiscal conditions are relatively manageable.",
  });
}

/**
 * ============================================================
 * POLITICAL STABILITY
 * ============================================================
 *
 * stabilityScore:
 *
 * 0 = extreme instability
 * 1 = very stable
 */

function analyzePoliticalStability({
  stabilityScore,
  eventRiskScore = 0,
}) {
  if (
    !isFiniteNumber(
      stabilityScore,
    )
  ) {
    return null;
  }

  const stability =
    clamp(
      stabilityScore,
      0,
      1,
    );

  const eventRisk =
    isFiniteNumber(
      eventRiskScore,
    )
      ? clamp(
          eventRiskScore,
          0,
          1,
        )
      : 0;

  const normalizedStability =
    (
      stability -
      0.5
    ) * 2;

  const score =
    clamp(
      normalizedStability -
        eventRisk * 0.5,
      -1,
      1,
    );

  return createEvidence({
    factor:
      "POLITICAL_STABILITY",

    score,

    confidence: 0.65,

    value: {
      stability,
      eventRisk,
    },

    summary:
      eventRisk >= 0.7
        ? "Political event risk is elevated."
        : stability >= 0.75
          ? "Political conditions are relatively stable."
          : stability <= 0.35
            ? "Political stability is weak."
            : "Political conditions are mixed.",
  });
}

/**
 * ============================================================
 * TRADE / INTERNATIONAL EXPOSURE
 * ============================================================
 *
 * stressScore:
 *
 * 0 = normal
 * 1 = extreme trade stress
 *
 * Example:
 *
 * tariffs
 * sanctions
 * trade wars
 * export restrictions
 */

function analyzeTradeEnvironment({
  stressScore,
  trend,
}) {
  if (
    !isFiniteNumber(
      stressScore,
    )
  ) {
    return null;
  }

  const stress =
    clamp(
      stressScore,
      0,
      1,
    );

  const normalizedTrend =
    normalizeTrend(trend);

  let score =
    -stress;

  if (
    normalizedTrend ===
      TREND.IMPROVING ||
    normalizedTrend ===
      TREND.FALLING
  ) {
    score += 0.15;
  }

  if (
    normalizedTrend ===
      TREND.WORSENING ||
    normalizedTrend ===
      TREND.RISING
  ) {
    score -= 0.15;
  }

  return createEvidence({
    factor:
      "TRADE_ENVIRONMENT",

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence: 0.75,

    value: stress,

    summary:
      stress >= 0.7
        ? "International trade conditions are under severe stress."
        : stress >= 0.4
          ? "Trade tensions are elevated."
          : "Trade conditions are relatively stable.",
  });
}

/**
 * ============================================================
 * CREDIT CONDITIONS
 * ============================================================
 */

function analyzeCredit({
  state,
}) {
  const normalized =
    normalizeText(state);

  if (!normalized) {
    return null;
  }

  if (
    normalized ===
    "EASING"
  ) {
    return createEvidence({
      factor:
        "CREDIT_CONDITIONS",

      score: 0.7,

      confidence: 0.7,

      value: normalized,

      summary:
        "Credit conditions are easing.",
    });
  }

  if (
    normalized ===
    "TIGHTENING"
  ) {
    return createEvidence({
      factor:
        "CREDIT_CONDITIONS",

      score: -0.75,

      confidence: 0.75,

      value: normalized,

      summary:
        "Credit conditions are tightening.",
    });
  }

  return createEvidence({
    factor:
      "CREDIT_CONDITIONS",

    score: 0,

    confidence: 0.4,

    value: normalized,

    summary:
      "Credit conditions are stable.",
  });
}

/**
 * ============================================================
 * CONSUMER CONDITIONS
 * ============================================================
 *
 * score:
 *
 * -1 = severe consumer weakness
 * +1 = strong consumer environment
 */

function analyzeConsumer({
  strengthScore,
  trend,
}) {
  if (
    !isFiniteNumber(
      strengthScore,
    )
  ) {
    return null;
  }

  const strength =
    clamp(
      strengthScore,
      -1,
      1,
    );

  const normalizedTrend =
    normalizeTrend(trend);

  let score =
    strength;

  if (
    normalizedTrend ===
      TREND.IMPROVING ||
    normalizedTrend ===
      TREND.RISING
  ) {
    score += 0.15;
  }

  if (
    normalizedTrend ===
      TREND.WORSENING ||
    normalizedTrend ===
      TREND.FALLING
  ) {
    score -= 0.15;
  }

  return createEvidence({
    factor:
      "CONSUMER_CONDITIONS",

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence: 0.65,

    value: strength,

    summary:
      strength >= 0.5
        ? "Consumer conditions are strong."
        : strength <= -0.5
          ? "Consumer conditions are weak."
          : "Consumer conditions are mixed.",
  });
}

/**
 * ============================================================
 * BANKING / FINANCIAL SYSTEM STRESS
 * ============================================================
 *
 * stressScore:
 *
 * 0 = no stress
 * 1 = extreme stress
 */

function analyzeBankingStress({
  stressScore,
}) {
  if (
    !isFiniteNumber(
      stressScore,
    )
  ) {
    return null;
  }

  const stress =
    clamp(
      stressScore,
      0,
      1,
    );

  return createEvidence({
    factor:
      "BANKING_STRESS",

    score:
      -stress,

    confidence: 0.8,

    value: stress,

    summary:
      stress >= 0.8
        ? "Banking-system stress is extreme."
        : stress >= 0.5
          ? "Banking-system stress is elevated."
          : "Banking-system stress is relatively low.",
  });
}

/**
 * ============================================================
 * COMBINE EVIDENCE
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
      rawScore: 0,

      confidence: 0,

      direction:
        COUNTRY_DIRECTION.UNKNOWN,
    };
  }

  let weightedScore = 0;
  let totalConfidence = 0;

  for (
    const item
    of evidence
  ) {
    const confidence =
      clamp(
        item.confidence ?? 0,
        0,
        1,
      );

    weightedScore +=
      Number(
        item.score ?? 0,
      ) *
      confidence;

    totalConfidence +=
      confidence;
  }

  if (
    totalConfidence <= 0
  ) {
    return {
      rawScore: 0,

      confidence: 0,

      direction:
        COUNTRY_DIRECTION.UNKNOWN,
    };
  }

  const rawScore =
    clamp(
      weightedScore /
        totalConfidence,
      -1,
      1,
    );

  let direction =
    COUNTRY_DIRECTION.NEUTRAL;

  if (rawScore >= 0.65) {
    direction =
      COUNTRY_DIRECTION
        .STRONGLY_POSITIVE;
  } else if (
    rawScore >= 0.2
  ) {
    direction =
      COUNTRY_DIRECTION.POSITIVE;
  } else if (
    rawScore <= -0.65
  ) {
    direction =
      COUNTRY_DIRECTION
        .STRONGLY_NEGATIVE;
  } else if (
    rawScore <= -0.2
  ) {
    direction =
      COUNTRY_DIRECTION.NEGATIVE;
  }

  return {
    rawScore:
      round(
        rawScore,
        4,
      ),

    confidence:
      round(
        Math.abs(
          rawScore,
        ),
        4,
      ),

    direction,
  };
}

/**
 * ============================================================
 * COUNTRY RISK SCORE
 * ============================================================
 */

function calculateRiskLevel({
  sovereignRisk,

  fiscal,

  political,

  trade,

  currency,

  banking,
}) {
  const risks = [];

  if (
    isFiniteNumber(
      sovereignRisk
        ?.riskScore,
    )
  ) {
    risks.push(
      clamp(
        sovereignRisk
          .riskScore,
        0,
        1,
      ),
    );
  }

  if (
    isFiniteNumber(
      fiscal
        ?.pressureScore,
    )
  ) {
    risks.push(
      clamp(
        fiscal
          .pressureScore,
        0,
        1,
      ),
    );
  }

  if (
    isFiniteNumber(
      political
        ?.eventRiskScore,
    )
  ) {
    risks.push(
      clamp(
        political
          .eventRiskScore,
        0,
        1,
      ),
    );
  }

  if (
    isFiniteNumber(
      trade
        ?.stressScore,
    )
  ) {
    risks.push(
      clamp(
        trade
          .stressScore,
        0,
        1,
      ),
    );
  }

  if (
    isFiniteNumber(
      currency
        ?.volatilityScore,
    )
  ) {
    risks.push(
      clamp(
        currency
          .volatilityScore,
        0,
        1,
      ),
    );
  }

  if (
    isFiniteNumber(
      banking
        ?.stressScore,
    )
  ) {
    risks.push(
      clamp(
        banking
          .stressScore,
        0,
        1,
      ),
    );
  }

  if (
    risks.length === 0
  ) {
    return {
      level:
        RISK_LEVEL.UNKNOWN,

      score: null,
    };
  }

  const score =
    risks.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    ) /
    risks.length;

  let level =
    RISK_LEVEL.LOW;

  if (score >= 0.8) {
    level =
      RISK_LEVEL.EXTREME;
  } else if (
    score >= 0.6
  ) {
    level =
      RISK_LEVEL.HIGH;
  } else if (
    score >= 0.4
  ) {
    level =
      RISK_LEVEL.ELEVATED;
  } else if (
    score >= 0.2
  ) {
    level =
      RISK_LEVEL.MODERATE;
  }

  return {
    level,

    score:
      round(
        score,
        4,
      ),
  };
}

/**
 * ============================================================
 * LONG / SHORT SUPPORT
 * ============================================================
 */

function calculateDirectionalSupport(
  rawScore,
) {
  const normalized =
    isFiniteNumber(
      rawScore,
    )
      ? clamp(
          rawScore,
          -1,
          1,
        )
      : 0;

  return {
    long:
      round(
        (
          normalized +
          1
        ) / 2,
        4,
      ),

    short:
      round(
        (
          1 -
          normalized
        ) / 2,
        4,
      ),
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeCountryRisk({
  country = null,

  economicGrowth = null,

  inflation = null,

  interestRates = null,

  currency = null,

  capitalFlows = null,

  sovereignRisk = null,

  fiscal = null,

  political = null,

  trade = null,

  credit = null,

  consumer = null,

  banking = null,
} = {}) {
  try {
    const evidence = [];
    const warnings = [];

    /**
     * Economic growth.
     */

    const growthEvidence =
      economicGrowth
        ? analyzeGrowth({
            growth:
              economicGrowth.growth,

            trend:
              economicGrowth.trend,
          })
        : null;

    if (growthEvidence) {
      evidence.push(
        growthEvidence,
      );
    }

    /**
     * Inflation.
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
     * Interest rates.
     */

    const rateEvidence =
      interestRates
        ? analyzeRates({
            rate:
              interestRates.rate,

            trend:
              interestRates.trend,
          })
        : null;

    if (rateEvidence) {
      evidence.push(
        rateEvidence,
      );
    }

    /**
     * Currency.
     */

    const currencyEvidence =
      currency
        ? analyzeCurrency({
            strengthScore:
              currency.strengthScore,

            volatilityScore:
              currency.volatilityScore,
          })
        : null;

    if (currencyEvidence) {
      evidence.push(
        currencyEvidence,
      );
    }

    /**
     * Capital flows.
     */

    const capitalEvidence =
      capitalFlows
        ? analyzeCapitalFlows({
            flowScore:
              capitalFlows.flowScore,

            trend:
              capitalFlows.trend,
          })
        : null;

    if (capitalEvidence) {
      evidence.push(
        capitalEvidence,
      );
    }

    /**
     * Sovereign risk.
     */

    const sovereignEvidence =
      sovereignRisk
        ? analyzeSovereignRisk({
            riskScore:
              sovereignRisk.riskScore,
          })
        : null;

    if (sovereignEvidence) {
      evidence.push(
        sovereignEvidence,
      );
    }

    /**
     * Fiscal conditions.
     */

    const fiscalEvidence =
      fiscal
        ? analyzeFiscal({
            pressureScore:
              fiscal.pressureScore,

            trend:
              fiscal.trend,
          })
        : null;

    if (fiscalEvidence) {
      evidence.push(
        fiscalEvidence,
      );
    }

    /**
     * Political conditions.
     */

    const politicalEvidence =
      political
        ? analyzePoliticalStability({
            stabilityScore:
              political.stabilityScore,

            eventRiskScore:
              political.eventRiskScore,
          })
        : null;

    if (
      politicalEvidence
    ) {
      evidence.push(
        politicalEvidence,
      );
    }

    /**
     * Trade conditions.
     */

    const tradeEvidence =
      trade
        ? analyzeTradeEnvironment({
            stressScore:
              trade.stressScore,

            trend:
              trade.trend,
          })
        : null;

    if (tradeEvidence) {
      evidence.push(
        tradeEvidence,
      );
    }

    /**
     * Credit.
     */

    const creditEvidence =
      credit
        ? analyzeCredit({
            state:
              credit.state,
          })
        : null;

    if (creditEvidence) {
      evidence.push(
        creditEvidence,
      );
    }

    /**
     * Consumer.
     */

    const consumerEvidence =
      consumer
        ? analyzeConsumer({
            strengthScore:
              consumer.strengthScore,

            trend:
              consumer.trend,
          })
        : null;

    if (consumerEvidence) {
      evidence.push(
        consumerEvidence,
      );
    }

    /**
     * Banking stress.
     */

    const bankingEvidence =
      banking
        ? analyzeBankingStress({
            stressScore:
              banking.stressScore,
          })
        : null;

    if (bankingEvidence) {
      evidence.push(
        bankingEvidence,
      );
    }

    /**
     * ======================================================
     * SAFE FAIL — NO DATA
     * ======================================================
     */

    if (
      evidence.length === 0
    ) {
      return {
        approved: false,

        engine:
          "COUNTRY_RISK",

        status:
          "INSUFFICIENT_DATA",

        country,

        direction:
          COUNTRY_DIRECTION.UNKNOWN,

        confidence: 0,

        rawScore: 0,

        directionalSupport: {
          long: 0,
          short: 0,
        },

        risk: {
          level:
            RISK_LEVEL.UNKNOWN,

          score: null,
        },

        evidence: [],

        warnings: [
          "No usable country-level data was supplied.",
        ],

        errors: [],

        maximumScore: 10,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * COMBINE
     * ======================================================
     */

    const combined =
      combineEvidence(
        evidence,
      );

    const directionalSupport =
      calculateDirectionalSupport(
        combined.rawScore,
      );

    const risk =
      calculateRiskLevel({
        sovereignRisk,

        fiscal,

        political,

        trade,

        currency,

        banking,
      });

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    if (
      evidence.length < 5
    ) {
      warnings.push(
        "Country analysis is based on fewer than five usable indicators.",
      );
    }

    if (
      risk.level ===
        RISK_LEVEL.HIGH ||
      risk.level ===
        RISK_LEVEL.EXTREME
    ) {
      warnings.push(
        `Country risk is ${risk.level}.`,
      );
    }

    /**
     * ======================================================
     * SUMMARY
     * ======================================================
     */

    const countryLabel =
      country
        ? String(country)
            .toUpperCase()
        : "UNKNOWN";

    const summary =
      `${countryLabel} conditions are ${combined.direction
        .replaceAll(
          "_",
          " ",
        )
        .toLowerCase()} with ${round(
        combined.confidence *
          100,
        1,
      )}% directional confidence. Country risk is ${risk.level.toLowerCase()}.`;

    /**
     * ======================================================
     * RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "COUNTRY_RISK",

      status:
        "COMPLETE",

      country,

      direction:
        combined.direction,

      confidence:
        combined.confidence,

      rawScore:
        combined.rawScore,

      directionalSupport,

      risk,

      summary,

      evidence,

      warnings,

      errors: [],

      /**
       * Country conditions contribute
       * a maximum of 10 points in the
       * final trade scoring architecture.
       */
      maximumScore: 10,

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
     * Country engine failure should NEVER
     * accidentally generate LONG or SHORT
     * evidence.
     */

    return {
      approved: false,

      engine:
        "COUNTRY_RISK",

      status:
        "ERROR",

      country,

      direction:
        COUNTRY_DIRECTION.UNKNOWN,

      confidence: 0,

      rawScore: 0,

      directionalSupport: {
        long: 0,
        short: 0,
      },

      risk: {
        level:
          RISK_LEVEL.UNKNOWN,

        score: null,
      },

      summary:
        "Country analysis failed safely. No country-level directional evidence should be awarded.",

      evidence: [],

      warnings: [
        "Country engine failure should reduce confidence in the final trade decision.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      maximumScore: 10,

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default analyzeCountryRisk;