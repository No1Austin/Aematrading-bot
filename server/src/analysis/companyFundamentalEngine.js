/**
 * ============================================================
 * COMPANY FUNDAMENTAL ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Evaluate company-level financial health and economic
 * sensitivity.
 *
 * This engine analyzes:
 *
 * - Revenue growth
 * - Earnings / EPS growth
 * - Free cash flow
 * - Operating cash flow
 * - Profit margins
 * - Debt burden
 * - Interest coverage
 * - Earnings surprises
 * - Guidance
 * - Valuation
 * - Recession sensitivity
 * - Interest-rate sensitivity
 * - Consumer sensitivity
 * - Currency exposure
 * - Trade-policy exposure
 * - Country exposure
 *
 * It does NOT execute trades.
 *
 * It contributes company-specific evidence to both:
 *
 * LONG score
 * SHORT score
 *
 * Maximum contribution to final score:
 *
 * 10 points
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const COMPANY_DIRECTION =
  Object.freeze({
    STRONG_BULLISH:
      "STRONG_BULLISH",

    BULLISH:
      "BULLISH",

    NEUTRAL:
      "NEUTRAL",

    BEARISH:
      "BEARISH",

    STRONG_BEARISH:
      "STRONG_BEARISH",

    UNKNOWN:
      "UNKNOWN",
  });

export const FUNDAMENTAL_HEALTH =
  Object.freeze({
    EXCELLENT:
      "EXCELLENT",

    STRONG:
      "STRONG",

    FAIR:
      "FAIR",

    WEAK:
      "WEAK",

    DISTRESSED:
      "DISTRESSED",

    UNKNOWN:
      "UNKNOWN",
  });

export const SENSITIVITY_LEVEL =
  Object.freeze({
    LOW: "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    EXTREME:
      "EXTREME",

    UNKNOWN:
      "UNKNOWN",
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

function normalizeText(value) {
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

/**
 * ============================================================
 * EVIDENCE BUILDER
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
 * REVENUE
 * ============================================================
 */

function analyzeRevenue({
  growth,
  acceleration = null,
}) {
  if (!isFiniteNumber(growth)) {
    return null;
  }

  const revenueGrowth =
    Number(growth);

  let score = 0;

  if (revenueGrowth >= 20) {
    score = 1;
  } else if (
    revenueGrowth >= 10
  ) {
    score = 0.8;
  } else if (
    revenueGrowth >= 5
  ) {
    score = 0.55;
  } else if (
    revenueGrowth > 0
  ) {
    score = 0.25;
  } else if (
    revenueGrowth <= -10
  ) {
    score = -1;
  } else {
    score = -0.6;
  }

  if (
    isFiniteNumber(
      acceleration,
    )
  ) {
    const accel =
      Number(
        acceleration,
      );

    if (accel > 0) {
      score += 0.1;
    }

    if (accel < 0) {
      score -= 0.1;
    }
  }

  return createEvidence({
    factor:
      "REVENUE_GROWTH",

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence: 0.85,

    value: {
      growth:
        revenueGrowth,

      acceleration:
        isFiniteNumber(
          acceleration,
        )
          ? Number(
              acceleration,
            )
          : null,
    },

    summary:
      revenueGrowth >= 10
        ? "Revenue growth is strong."
        : revenueGrowth > 0
          ? "Revenue is growing."
          : "Revenue is contracting.",
  });
}

/**
 * ============================================================
 * EARNINGS / EPS
 * ============================================================
 */

function analyzeEarnings({
  epsGrowth,
}) {
  if (
    !isFiniteNumber(
      epsGrowth,
    )
  ) {
    return null;
  }

  const growth =
    Number(
      epsGrowth,
    );

  let score = 0;

  if (growth >= 25) {
    score = 1;
  } else if (
    growth >= 10
  ) {
    score = 0.75;
  } else if (
    growth > 0
  ) {
    score = 0.4;
  } else if (
    growth <= -20
  ) {
    score = -1;
  } else {
    score = -0.6;
  }

  return createEvidence({
    factor:
      "EARNINGS_GROWTH",

    score,

    confidence: 0.85,

    value: growth,

    summary:
      growth >= 10
        ? "Earnings growth is strong."
        : growth > 0
          ? "Earnings are improving."
          : "Earnings are deteriorating.",
  });
}

/**
 * ============================================================
 * FREE CASH FLOW
 * ============================================================
 */

function analyzeFreeCashFlow({
  value,
  growth,
  margin,
}) {
  if (
    !isFiniteNumber(value)
  ) {
    return null;
  }

  const fcf =
    Number(value);

  let score =
    fcf > 0
      ? 0.5
      : -0.8;

  if (
    isFiniteNumber(growth)
  ) {
    const fcfGrowth =
      Number(growth);

    if (fcfGrowth >= 20) {
      score += 0.4;
    } else if (
      fcfGrowth > 0
    ) {
      score += 0.2;
    } else if (
      fcfGrowth < 0
    ) {
      score -= 0.25;
    }
  }

  if (
    isFiniteNumber(margin)
  ) {
    const fcfMargin =
      Number(margin);

    if (fcfMargin >= 20) {
      score += 0.2;
    } else if (
      fcfMargin < 5
    ) {
      score -= 0.15;
    }
  }

  return createEvidence({
    factor:
      "FREE_CASH_FLOW",

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence: 0.9,

    value: {
      value: fcf,

      growth:
        isFiniteNumber(
          growth,
        )
          ? Number(growth)
          : null,

      margin:
        isFiniteNumber(
          margin,
        )
          ? Number(margin)
          : null,
    },

    summary:
      fcf > 0
        ? "The company generates positive free cash flow."
        : "The company is consuming free cash flow.",
  });
}

/**
 * ============================================================
 * OPERATING CASH FLOW
 * ============================================================
 */

function analyzeOperatingCashFlow({
  growth,
}) {
  if (
    !isFiniteNumber(
      growth,
    )
  ) {
    return null;
  }

  const value =
    Number(growth);

  return createEvidence({
    factor:
      "OPERATING_CASH_FLOW",

    score:
      value >= 15
        ? 0.9
        : value > 0
          ? 0.5
          : value <= -15
            ? -0.9
            : -0.45,

    confidence: 0.8,

    value,

    summary:
      value > 0
        ? "Operating cash flow is improving."
        : "Operating cash flow is weakening.",
  });
}

/**
 * ============================================================
 * MARGINS
 * ============================================================
 */

function analyzeMargins({
  operatingMargin,
  netMargin,
  marginTrend,
}) {
  const values = [];

  if (
    isFiniteNumber(
      operatingMargin,
    )
  ) {
    values.push(
      Number(
        operatingMargin,
      ),
    );
  }

  if (
    isFiniteNumber(
      netMargin,
    )
  ) {
    values.push(
      Number(
        netMargin,
      ),
    );
  }

  if (
    values.length === 0
  ) {
    return null;
  }

  const average =
    values.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    ) /
    values.length;

  let score = 0;

  if (average >= 25) {
    score = 1;
  } else if (
    average >= 15
  ) {
    score = 0.75;
  } else if (
    average >= 8
  ) {
    score = 0.45;
  } else if (
    average > 0
  ) {
    score = 0.15;
  } else {
    score = -0.8;
  }

  const trend =
    normalizeText(
      marginTrend,
    );

  if (
    trend === "IMPROVING" ||
    trend === "RISING"
  ) {
    score += 0.15;
  }

  if (
    trend === "WORSENING" ||
    trend === "FALLING"
  ) {
    score -= 0.2;
  }

  return createEvidence({
    factor: "MARGINS",

    score:
      clamp(
        score,
        -1,
        1,
      ),

    confidence: 0.75,

    value: {
      operatingMargin:
        isFiniteNumber(
          operatingMargin,
        )
          ? Number(
              operatingMargin,
            )
          : null,

      netMargin:
        isFiniteNumber(
          netMargin,
        )
          ? Number(
              netMargin,
            )
          : null,

      trend:
        trend || null,
    },

    summary:
      average >= 15
        ? "Profitability margins are strong."
        : average > 0
          ? "Profitability margins are positive but moderate."
          : "Profitability margins are weak.",
  });
}

/**
 * ============================================================
 * DEBT
 * ============================================================
 */

function analyzeDebt({
  debtToEquity,
  netDebtToEbitda,
}) {
  const evidence = [];

  if (
    isFiniteNumber(
      debtToEquity,
    )
  ) {
    const value =
      Number(
        debtToEquity,
      );

    evidence.push(
      value <= 0.5
        ? 0.8
        : value <= 1
          ? 0.45
          : value <= 2
            ? -0.3
            : -0.8,
    );
  }

  if (
    isFiniteNumber(
      netDebtToEbitda,
    )
  ) {
    const value =
      Number(
        netDebtToEbitda,
      );

    evidence.push(
      value <= 1
        ? 0.8
        : value <= 2
          ? 0.4
          : value <= 3
            ? -0.25
            : -0.85,
    );
  }

  if (
    evidence.length === 0
  ) {
    return null;
  }

  const score =
    evidence.reduce(
      (
        sum,
        value,
      ) =>
        sum + value,
      0,
    ) /
    evidence.length;

  return createEvidence({
    factor:
      "DEBT_BURDEN",

    score,

    confidence: 0.8,

    value: {
      debtToEquity:
        isFiniteNumber(
          debtToEquity,
        )
          ? Number(
              debtToEquity,
            )
          : null,

      netDebtToEbitda:
        isFiniteNumber(
          netDebtToEbitda,
        )
          ? Number(
              netDebtToEbitda,
            )
          : null,
    },

    summary:
      score > 0.4
        ? "Debt levels appear manageable."
        : score < -0.4
          ? "Debt burden is elevated."
          : "Debt levels are moderate.",
  });
}

/**
 * ============================================================
 * INTEREST COVERAGE
 * ============================================================
 */

function analyzeInterestCoverage({
  ratio,
}) {
  if (
    !isFiniteNumber(
      ratio,
    )
  ) {
    return null;
  }

  const value =
    Number(ratio);

  let score;

  if (value >= 8) {
    score = 1;
  } else if (
    value >= 4
  ) {
    score = 0.7;
  } else if (
    value >= 2
  ) {
    score = 0.2;
  } else if (
    value >= 1
  ) {
    score = -0.5;
  } else {
    score = -1;
  }

  return createEvidence({
    factor:
      "INTEREST_COVERAGE",

    score,

    confidence: 0.85,

    value,

    summary:
      value >= 4
        ? "The company has strong ability to service interest expense."
        : value >= 2
          ? "Interest coverage is adequate."
          : "Debt-service capacity is weak.",
  });
}

/**
 * ============================================================
 * EARNINGS SURPRISE
 * ============================================================
 */

function analyzeEarningsSurprise({
  percent,
}) {
  if (
    !isFiniteNumber(
      percent,
    )
  ) {
    return null;
  }

  const value =
    Number(percent);

  let score;

  if (value >= 10) {
    score = 1;
  } else if (
    value >= 5
  ) {
    score = 0.75;
  } else if (
    value > 0
  ) {
    score = 0.4;
  } else if (
    value <= -10
  ) {
    score = -1;
  } else if (
    value <= -5
  ) {
    score = -0.75;
  } else {
    score = -0.35;
  }

  return createEvidence({
    factor:
      "EARNINGS_SURPRISE",

    score,

    confidence: 0.8,

    value,

    summary:
      value > 0
        ? "Earnings exceeded expectations."
        : "Earnings missed expectations.",
  });
}

/**
 * ============================================================
 * GUIDANCE
 * ============================================================
 */

function analyzeGuidance({
  direction,
  strength = 0.5,
}) {
  const normalized =
    normalizeText(
      direction,
    );

  const confidence =
    isFiniteNumber(
      strength,
    )
      ? clamp(
          strength,
          0,
          1,
        )
      : 0.5;

  if (
    normalized ===
      "RAISED" ||
    normalized ===
      "POSITIVE"
  ) {
    return createEvidence({
      factor: "GUIDANCE",

      score: 0.85,

      confidence,

      value: normalized,

      summary:
        "Management guidance is positive.",
    });
  }

  if (
    normalized ===
      "LOWERED" ||
    normalized ===
      "NEGATIVE"
  ) {
    return createEvidence({
      factor: "GUIDANCE",

      score: -0.9,

      confidence,

      value: normalized,

      summary:
        "Management guidance has weakened.",
    });
  }

  if (
    normalized ===
      "MAINTAINED" ||
    normalized ===
      "NEUTRAL"
  ) {
    return createEvidence({
      factor: "GUIDANCE",

      score: 0,

      confidence,

      value: normalized,

      summary:
        "Management guidance is unchanged.",
    });
  }

  return null;
}

/**
 * ============================================================
 * VALUATION
 * ============================================================
 *
 * valuationScore should eventually come from comparing:
 *
 * company valuation
 * vs
 * sector
 * historical valuation
 * growth expectations
 *
 * Input:
 *
 * -1 = extremely expensive
 *  0 = fair
 * +1 = extremely attractive
 */

function analyzeValuation({
  valuationScore,
}) {
  if (
    !isFiniteNumber(
      valuationScore,
    )
  ) {
    return null;
  }

  const score =
    clamp(
      valuationScore,
      -1,
      1,
    );

  return createEvidence({
    factor: "VALUATION",

    score,

    confidence: 0.6,

    value: score,

    summary:
      score >= 0.5
        ? "Valuation appears attractive relative to available benchmarks."
        : score <= -0.5
          ? "Valuation appears expensive relative to available benchmarks."
          : "Valuation appears relatively balanced.",
  });
}

/**
 * ============================================================
 * ECONOMIC SENSITIVITY
 * ============================================================
 *
 * This lets company-specific economics interact with the
 * macro and country engines.
 *
 * Sensitivities use:
 *
 * 0 = little exposure
 * 1 = extreme exposure
 */

function analyzeEconomicSensitivity({
  recessionSensitivity = 0,
  rateSensitivity = 0,
  consumerSensitivity = 0,
  currencySensitivity = 0,
  tradeSensitivity = 0,

  macro = null,
  country = null,
}) {
  const recession =
    clamp(
      recessionSensitivity,
      0,
      1,
    );

  const rates =
    clamp(
      rateSensitivity,
      0,
      1,
    );

  const consumer =
    clamp(
      consumerSensitivity,
      0,
      1,
    );

  const currency =
    clamp(
      currencySensitivity,
      0,
      1,
    );

  const trade =
    clamp(
      tradeSensitivity,
      0,
      1,
    );

  let score = 0;
  let weight = 0;

  /**
   * Recession risk.
   */

  const recessionScore =
    Number(
      macro
        ?.recessionRisk
        ?.score,
    );

  if (
    isFiniteNumber(
      recessionScore,
    )
  ) {
    const normalizedRisk =
      clamp(
        recessionScore /
          100,
        0,
        1,
      );

    score +=
      -normalizedRisk *
      recession;

    weight +=
      recession;
  }

  /**
   * Macro direction.
   */

  if (
    isFiniteNumber(
      macro?.rawScore,
    )
  ) {
    score +=
      Number(
        macro.rawScore,
      ) *
      rates *
      0.5;

    weight +=
      rates *
      0.5;
  }

  /**
   * Country conditions.
   */

  if (
    isFiniteNumber(
      country?.rawScore,
    )
  ) {
    const countryScore =
      Number(
        country.rawScore,
      );

    const combinedExposure =
      (
        consumer +
        currency +
        trade
      ) / 3;

    score +=
      countryScore *
      combinedExposure;

    weight +=
      combinedExposure;
  }

  if (weight <= 0) {
    return {
      score: 0,
      confidence: 0,

      sensitivity: {
        recession,
        rates,
        consumer,
        currency,
        trade,
      },
    };
  }

  return {
    score:
      clamp(
        score /
        weight,
        -1,
        1,
      ),

    confidence:
      clamp(
        weight / 3,
        0,
        1,
      ),

    sensitivity: {
      recession,
      rates,
      consumer,
      currency,
      trade,
    },
  };
}

/**
 * ============================================================
 * COMBINE COMPANY EVIDENCE
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
        COMPANY_DIRECTION.UNKNOWN,
    };
  }

  let scoreTotal = 0;
  let confidenceTotal = 0;

  for (
    const item
    of evidence
  ) {
    const confidence =
      clamp(
        item.confidence ??
        0,
        0,
        1,
      );

    scoreTotal +=
      Number(
        item.score ?? 0,
      ) *
      confidence;

    confidenceTotal +=
      confidence;
  }

  if (
    confidenceTotal <= 0
  ) {
    return {
      rawScore: 0,
      confidence: 0,

      direction:
        COMPANY_DIRECTION.UNKNOWN,
    };
  }

  const rawScore =
    clamp(
      scoreTotal /
        confidenceTotal,
      -1,
      1,
    );

  let direction =
    COMPANY_DIRECTION.NEUTRAL;

  if (
    rawScore >= 0.65
  ) {
    direction =
      COMPANY_DIRECTION
        .STRONG_BULLISH;
  } else if (
    rawScore >= 0.2
  ) {
    direction =
      COMPANY_DIRECTION.BULLISH;
  } else if (
    rawScore <= -0.65
  ) {
    direction =
      COMPANY_DIRECTION
        .STRONG_BEARISH;
  } else if (
    rawScore <= -0.2
  ) {
    direction =
      COMPANY_DIRECTION.BEARISH;
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
 * FUNDAMENTAL HEALTH
 * ============================================================
 */

function determineHealth(
  rawScore,
) {
  if (
    !isFiniteNumber(
      rawScore,
    )
  ) {
    return FUNDAMENTAL_HEALTH
      .UNKNOWN;
  }

  const value =
    Number(rawScore);

  if (value >= 0.7) {
    return FUNDAMENTAL_HEALTH
      .EXCELLENT;
  }

  if (value >= 0.4) {
    return FUNDAMENTAL_HEALTH
      .STRONG;
  }

  if (value >= -0.15) {
    return FUNDAMENTAL_HEALTH
      .FAIR;
  }

  if (value >= -0.55) {
    return FUNDAMENTAL_HEALTH
      .WEAK;
  }

  return FUNDAMENTAL_HEALTH
    .DISTRESSED;
}

/**
 * ============================================================
 * DIRECTIONAL SUPPORT
 * ============================================================
 */

function calculateDirectionalSupport(
  rawScore,
) {
  const value =
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
          value +
          1
        ) / 2,
        4,
      ),

    short:
      round(
        (
          1 -
          value
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

export function analyzeCompanyFundamentals({
  symbol = null,

  sector = null,

  countryCode = null,

  revenue = null,

  earnings = null,

  freeCashFlow = null,

  operatingCashFlow = null,

  margins = null,

  debt = null,

  interestCoverage = null,

  earningsSurprise = null,

  guidance = null,

  valuation = null,

  sensitivity = null,

  macro = null,

  country = null,
} = {}) {
  try {
    const evidence = [];
    const warnings = [];

    /**
     * Revenue
     */

    const revenueEvidence =
      revenue
        ? analyzeRevenue({
            growth:
              revenue.growth,

            acceleration:
              revenue.acceleration,
          })
        : null;

    if (revenueEvidence) {
      evidence.push(
        revenueEvidence,
      );
    }

    /**
     * Earnings
     */

    const earningsEvidence =
      earnings
        ? analyzeEarnings({
            epsGrowth:
              earnings.epsGrowth,
          })
        : null;

    if (earningsEvidence) {
      evidence.push(
        earningsEvidence,
      );
    }

    /**
     * Free cash flow
     */

    const fcfEvidence =
      freeCashFlow
        ? analyzeFreeCashFlow({
            value:
              freeCashFlow.value,

            growth:
              freeCashFlow.growth,

            margin:
              freeCashFlow.margin,
          })
        : null;

    if (fcfEvidence) {
      evidence.push(
        fcfEvidence,
      );
    }

    /**
     * Operating cash flow
     */

    const ocfEvidence =
      operatingCashFlow
        ? analyzeOperatingCashFlow({
            growth:
              operatingCashFlow.growth,
          })
        : null;

    if (ocfEvidence) {
      evidence.push(
        ocfEvidence,
      );
    }

    /**
     * Margins
     */

    const marginEvidence =
      margins
        ? analyzeMargins({
            operatingMargin:
              margins.operatingMargin,

            netMargin:
              margins.netMargin,

            marginTrend:
              margins.trend,
          })
        : null;

    if (marginEvidence) {
      evidence.push(
        marginEvidence,
      );
    }

    /**
     * Debt
     */

    const debtEvidence =
      debt
        ? analyzeDebt({
            debtToEquity:
              debt.debtToEquity,

            netDebtToEbitda:
              debt.netDebtToEbitda,
          })
        : null;

    if (debtEvidence) {
      evidence.push(
        debtEvidence,
      );
    }

    /**
     * Interest coverage
     */

    const coverageEvidence =
      interestCoverage
        ? analyzeInterestCoverage({
            ratio:
              interestCoverage.ratio,
          })
        : null;

    if (coverageEvidence) {
      evidence.push(
        coverageEvidence,
      );
    }

    /**
     * Earnings surprise
     */

    const surpriseEvidence =
      earningsSurprise
        ? analyzeEarningsSurprise({
            percent:
              earningsSurprise.percent,
          })
        : null;

    if (surpriseEvidence) {
      evidence.push(
        surpriseEvidence,
      );
    }

    /**
     * Guidance
     */

    const guidanceEvidence =
      guidance
        ? analyzeGuidance({
            direction:
              guidance.direction,

            strength:
              guidance.strength,
          })
        : null;

    if (guidanceEvidence) {
      evidence.push(
        guidanceEvidence,
      );
    }

    /**
     * Valuation
     */

    const valuationEvidence =
      valuation
        ? analyzeValuation({
            valuationScore:
              valuation.score,
          })
        : null;

    if (valuationEvidence) {
      evidence.push(
        valuationEvidence,
      );
    }

    /**
     * ======================================================
     * ECONOMIC SENSITIVITY
     * ======================================================
     */

    if (sensitivity) {
      const exposure =
        analyzeEconomicSensitivity({
          recessionSensitivity:
            sensitivity.recession,

          rateSensitivity:
            sensitivity.interestRates,

          consumerSensitivity:
            sensitivity.consumer,

          currencySensitivity:
            sensitivity.currency,

          tradeSensitivity:
            sensitivity.trade,

          macro,

          country,
        });

      if (
        exposure.confidence > 0
      ) {
        evidence.push(
          createEvidence({
            factor:
              "ECONOMIC_SENSITIVITY",

            score:
              exposure.score,

            confidence:
              exposure.confidence,

            value:
              exposure.sensitivity,

            summary:
              exposure.score >= 0.25
                ? "Current economic conditions are supportive relative to the company's exposure profile."
                : exposure.score <= -0.25
                  ? "Current economic conditions present meaningful pressure for the company's exposure profile."
                  : "Economic exposure is currently mixed.",
          }),
        );
      }
    }

    /**
     * ======================================================
     * NO DATA FAIL SAFE
     * ======================================================
     */

    if (
      evidence.length === 0
    ) {
      return {
        approved: false,

        engine:
          "COMPANY_FUNDAMENTALS",

        status:
          "INSUFFICIENT_DATA",

        symbol,

        sector,

        countryCode,

        direction:
          COMPANY_DIRECTION.UNKNOWN,

        health:
          FUNDAMENTAL_HEALTH.UNKNOWN,

        confidence: 0,

        rawScore: 0,

        directionalSupport: {
          long: 0,
          short: 0,
        },

        evidence: [],

        warnings: [
          "No usable company fundamental data was supplied.",
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

    const health =
      determineHealth(
        combined.rawScore,
      );

    const directionalSupport =
      calculateDirectionalSupport(
        combined.rawScore,
      );

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    if (
      evidence.length < 5
    ) {
      warnings.push(
        "Company analysis is based on fewer than five usable fundamental indicators.",
      );
    }

    if (
      health ===
        FUNDAMENTAL_HEALTH
          .DISTRESSED
    ) {
      warnings.push(
        "Company fundamentals indicate financial distress.",
      );
    }

    if (
      debtEvidence?.score <=
        -0.6
    ) {
      warnings.push(
        "Debt burden is materially elevated.",
      );
    }

    if (
      fcfEvidence?.score <=
        -0.6
    ) {
      warnings.push(
        "Free cash flow conditions are weak.",
      );
    }

    /**
     * ======================================================
     * SUMMARY
     * ======================================================
     */

    const symbolLabel =
      symbol
        ? String(symbol)
            .toUpperCase()
        : "COMPANY";

    const summary =
      `${symbolLabel} fundamentals are ${health
        .replaceAll(
          "_",
          " ",
        )
        .toLowerCase()} with a ${combined.direction
        .replaceAll(
          "_",
          " ",
        )
        .toLowerCase()} directional bias.`;

    /**
     * ======================================================
     * RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "COMPANY_FUNDAMENTALS",

      status:
        "COMPLETE",

      symbol,

      sector,

      countryCode,

      direction:
        combined.direction,

      health,

      confidence:
        combined.confidence,

      rawScore:
        combined.rawScore,

      directionalSupport,

      summary,

      evidence,

      warnings,

      errors: [],

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
     */

    return {
      approved: false,

      engine:
        "COMPANY_FUNDAMENTALS",

      status:
        "ERROR",

      symbol,

      sector,

      countryCode,

      direction:
        COMPANY_DIRECTION.UNKNOWN,

      health:
        FUNDAMENTAL_HEALTH.UNKNOWN,

      confidence: 0,

      rawScore: 0,

      directionalSupport: {
        long: 0,
        short: 0,
      },

      summary:
        "Company fundamental analysis failed safely. No fundamental directional evidence should be awarded.",

      evidence: [],

      warnings: [
        "Company engine failure should reduce confidence in the final decision.",
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

export default analyzeCompanyFundamentals;