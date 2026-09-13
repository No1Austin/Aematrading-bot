/**
 * ============================================================
 * SOCIAL SENTIMENT ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Analyze crowd behaviour and social-market sentiment.
 *
 * Social evidence NEVER executes a trade directly.
 * Maximum contribution to the wider scoring model: 5 points.
 *
 * FAIL-SAFE RULES
 * ---------------
 * - Missing sentiment => INSUFFICIENT_DATA.
 * - Missing manipulation signals remain UNKNOWN, never zero.
 * - Manipulation score is calculated only from observed fields.
 * - Incomplete manipulation coverage reduces confidence.
 * - Very poor manipulation coverage suppresses the usable signal.
 * - High observed manipulation risk heavily discounts the signal.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const SOCIAL_DIRECTION = Object.freeze({
  STRONG_BULLISH: "STRONG_BULLISH",
  BULLISH: "BULLISH",
  NEUTRAL: "NEUTRAL",
  BEARISH: "BEARISH",
  STRONG_BEARISH: "STRONG_BEARISH",
  UNKNOWN: "UNKNOWN",
});

export const CROWD_STATE = Object.freeze({
  PANIC: "PANIC",
  FEAR: "FEAR",
  NEUTRAL: "NEUTRAL",
  OPTIMISM: "OPTIMISM",
  EUPHORIA: "EUPHORIA",
  UNKNOWN: "UNKNOWN",
});

export const MANIPULATION_RISK = Object.freeze({
  LOW: "LOW",
  MODERATE: "MODERATE",
  ELEVATED: "ELEVATED",
  HIGH: "HIGH",
  EXTREME: "EXTREME",
  UNKNOWN: "UNKNOWN",
});

/**
 * Manipulation fields and their original relative weights.
 */
const MANIPULATION_FIELDS = Object.freeze([
  {
    input: "botProbability",
    output: "bot",
    weight: 0.25,
  },
  {
    input: "spamProbability",
    output: "spam",
    weight: 0.20,
  },
  {
    input: "coordinatedActivityScore",
    output: "coordinated",
    weight: 0.25,
  },
  {
    input: "influencerConcentration",
    output: "influencer",
    weight: 0.15,
  },
  {
    input: "abnormalMentionSpike",
    output: "spike",
    weight: 0.15,
  },
]);

const TOTAL_MANIPULATION_WEIGHT =
  MANIPULATION_FIELDS.reduce(
    (sum, field) => sum + field.weight,
    0,
  );

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

  return Number.isFinite(Number(value));
}

function numberOrNull(value) {
  return isFiniteNumber(value)
    ? Number(value)
    : null;
}

function clamp(value, min, max) {
  const number = numberOrNull(value);

  if (number === null) {
    return null;
  }

  return Math.min(
    Math.max(number, min),
    max,
  );
}

function round(value, decimals = 4) {
  const number = numberOrNull(value);

  if (number === null) {
    return null;
  }

  const factor = 10 ** decimals;

  return (
    Math.round(
      (number + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function safeRatio(
  numerator,
  denominator,
) {
  const a = numberOrNull(numerator);
  const b = numberOrNull(denominator);

  if (
    a === null ||
    b === null ||
    b === 0
  ) {
    return null;
  }

  return a / b;
}

/**
 * ============================================================
 * SENTIMENT SCORE
 * ============================================================
 */

function analyzeSentiment({
  bullish,
  bearish,
  neutral,
}) {
  if (
    !isFiniteNumber(bullish) ||
    !isFiniteNumber(bearish)
  ) {
    return null;
  }

  let bull = clamp(bullish, 0, 1);
  let bear = clamp(bearish, 0, 1);

  let neutralValue =
    isFiniteNumber(neutral)
      ? clamp(neutral, 0, 1)
      : Math.max(
          0,
          1 - bull - bear,
        );

  const total =
    bull +
    bear +
    neutralValue;

  if (
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }

  /**
   * Normalize malformed-but-usable proportions.
   */
  bull /= total;
  bear /= total;
  neutralValue /= total;

  const rawScore =
    clamp(
      bull - bear,
      -1,
      1,
    );

  let direction =
    SOCIAL_DIRECTION.NEUTRAL;

  if (rawScore >= 0.65) {
    direction =
      SOCIAL_DIRECTION.STRONG_BULLISH;
  } else if (rawScore >= 0.20) {
    direction =
      SOCIAL_DIRECTION.BULLISH;
  } else if (rawScore <= -0.65) {
    direction =
      SOCIAL_DIRECTION.STRONG_BEARISH;
  } else if (rawScore <= -0.20) {
    direction =
      SOCIAL_DIRECTION.BEARISH;
  }

  return {
    bullish: round(bull, 6),
    bearish: round(bear, 6),
    neutral: round(neutralValue, 6),
    rawScore: round(rawScore, 4),
    direction,
  };
}

/**
 * ============================================================
 * MENTION ACTIVITY
 * ============================================================
 */

function analyzeMentionActivity({
  mentionVelocity,
  baselineVelocity,
  mentionAcceleration,
}) {
  const ratio =
    safeRatio(
      mentionVelocity,
      baselineVelocity,
    );

  const acceleration =
    isFiniteNumber(
      mentionAcceleration,
    )
      ? Number(
          mentionAcceleration,
        )
      : 0;

  let activityScore = 0;

  if (ratio !== null) {
    if (ratio >= 10) {
      activityScore = 1;
    } else if (ratio >= 5) {
      activityScore = 0.9;
    } else if (ratio >= 3) {
      activityScore = 0.75;
    } else if (ratio >= 2) {
      activityScore = 0.6;
    } else if (ratio >= 1.2) {
      activityScore = 0.4;
    } else {
      activityScore = 0.15;
    }
  }

  if (acceleration > 0.5) {
    activityScore += 0.15;
  }

  if (acceleration < -0.5) {
    activityScore -= 0.1;
  }

  return {
    velocity:
      numberOrNull(
        mentionVelocity,
      ),

    baselineVelocity:
      numberOrNull(
        baselineVelocity,
      ),

    velocityRatio:
      round(ratio, 4),

    acceleration:
      round(acceleration, 4),

    activityScore:
      round(
        clamp(
          activityScore,
          0,
          1,
        ),
        4,
      ),
  };
}

/**
 * ============================================================
 * MANIPULATION COVERAGE
 * ============================================================
 */

function calculateObservedManipulationCoverage(
  manipulation,
) {
  const observed =
    MANIPULATION_FIELDS.filter(
      ({ input }) =>
        isFiniteNumber(
          manipulation?.[input],
        ),
    );

  const observedFieldCount =
    observed.length;

  const totalFieldCount =
    MANIPULATION_FIELDS.length;

  const observedWeight =
    observed.reduce(
      (sum, field) =>
        sum + field.weight,
      0,
    );

  return {
    observedFieldCount,
    totalFieldCount,

    coverage:
      round(
        observedFieldCount /
          totalFieldCount,
        4,
      ),

    weightedCoverage:
      round(
        observedWeight /
          TOTAL_MANIPULATION_WEIGHT,
        4,
      ),

    fullyObserved:
      observedFieldCount ===
      totalFieldCount,
  };
}

function normalizeManipulationCoverage({
  manipulation,
  manipulationCoverage,
}) {
  const calculated =
    calculateObservedManipulationCoverage(
      manipulation,
    );

  /**
   * Never allow externally supplied coverage to claim
   * MORE coverage than the fields actually supplied.
   */
  const suppliedCoverage =
    clamp(
      manipulationCoverage
        ?.coverage,
      0,
      1,
    );

  const suppliedObserved =
    numberOrNull(
      manipulationCoverage
        ?.observedFieldCount,
    );

  const effectiveCoverage =
    suppliedCoverage === null
      ? calculated.coverage
      : Math.min(
          suppliedCoverage,
          calculated.coverage,
        );

  const effectiveObserved =
    suppliedObserved === null
      ? calculated.observedFieldCount
      : Math.min(
          Math.max(
            0,
            Math.floor(
              suppliedObserved,
            ),
          ),
          calculated.observedFieldCount,
        );

  return {
    observedFieldCount:
      effectiveObserved,

    totalFieldCount:
      calculated.totalFieldCount,

    coverage:
      round(
        effectiveCoverage,
        4,
      ),

    weightedCoverage:
      calculated.weightedCoverage,

    fullyObserved:
      effectiveObserved ===
        calculated.totalFieldCount &&
      effectiveCoverage === 1,
  };
}

/**
 * ============================================================
 * MANIPULATION RISK
 * ============================================================
 *
 * IMPORTANT:
 *
 * Missing fields are NOT converted to zero.
 *
 * Risk is calculated from observed components only by
 * re-normalizing their configured weights.
 *
 * If coverage is insufficient, the risk LEVEL becomes UNKNOWN
 * even though observedRiskScore is still returned for diagnosis.
 */

function analyzeManipulationRisk({
  manipulation = null,
  manipulationCoverage = null,
} = {}) {
  const components = {
    bot: null,
    spam: null,
    coordinated: null,
    influencer: null,
    spike: null,
  };

  let weightedRisk = 0;
  let observedWeight = 0;

  for (
    const field
    of MANIPULATION_FIELDS
  ) {
    const value =
      clamp(
        manipulation
          ?.[field.input],
        0,
        1,
      );

    components[field.output] =
      value;

    if (value === null) {
      continue;
    }

    weightedRisk +=
      value *
      field.weight;

    observedWeight +=
      field.weight;
  }

  const coverage =
    normalizeManipulationCoverage({
      manipulation,
      manipulationCoverage,
    });

  const observedRiskScore =
    observedWeight > 0
      ? clamp(
          weightedRisk /
            observedWeight,
          0,
          1,
        )
      : null;

  /**
   * Fail-safe classification threshold.
   *
   * 0% - 79% observed field coverage:
   * manipulation level remains UNKNOWN.
   *
   * 80% - 99%:
   * classification is permitted but marked PARTIAL.
   *
   * 100%:
   * classification is FULL.
   *
   * The weighted threshold prevents four low-weight fields from
   * accidentally satisfying the coverage requirement.
   */
  const enoughCoverage =
    coverage.observedFieldCount >= 4 &&
    coverage.coverage >= 0.8 &&
    coverage.weightedCoverage >= 0.75;

  const classificationCoverage =
    !enoughCoverage
      ? "INSUFFICIENT"
      : coverage.fullyObserved
        ? "FULL"
        : "PARTIAL";

  let level =
    MANIPULATION_RISK.UNKNOWN;

  if (
    enoughCoverage &&
    observedRiskScore !== null
  ) {
    if (observedRiskScore >= 0.8) {
      level =
        MANIPULATION_RISK.EXTREME;
    } else if (
      observedRiskScore >= 0.6
    ) {
      level =
        MANIPULATION_RISK.HIGH;
    } else if (
      observedRiskScore >= 0.4
    ) {
      level =
        MANIPULATION_RISK.ELEVATED;
    } else if (
      observedRiskScore >= 0.2
    ) {
      level =
        MANIPULATION_RISK.MODERATE;
    } else {
      level =
        MANIPULATION_RISK.LOW;
    }
  }

  /**
   * Effective penalty:
   *
   * - observed risk is retained
   * - uncertainty adds a conservative penalty
   * - no manipulation evidence => maximum uncertainty penalty
   *
   * This prevents UNKNOWN from behaving like LOW.
   */
  const uncertaintyPenalty =
    clamp(
      1 -
        (
          coverage
            .weightedCoverage ??
          0
        ),
      0,
      1,
    );

  const effectivePenalty =
    observedRiskScore === null
      ? 0.5
      : clamp(
          (
            observedRiskScore *
            (
              coverage
                .weightedCoverage ??
              0
            )
          ) +
            (
              uncertaintyPenalty *
              0.35
            ),
          0,
          1,
        );

  return {
    score:
      round(
        effectivePenalty,
        4,
      ),

    observedRiskScore:
      round(
        observedRiskScore,
        4,
      ),

    level,

    coverage,

    components,

    sufficientCoverage:
      enoughCoverage,

    classificationCoverage,

    uncertaintyPenalty:
      round(
        uncertaintyPenalty,
        4,
      ),
  };
}

/**
 * ============================================================
 * CROWD STATE
 * ============================================================
 */

function determineCrowdState({
  sentimentScore,
  activityScore,
}) {
  if (
    !isFiniteNumber(
      sentimentScore,
    )
  ) {
    return CROWD_STATE.UNKNOWN;
  }

  const sentiment =
    Number(sentimentScore);

  const activity =
    isFiniteNumber(
      activityScore,
    )
      ? Number(
          activityScore,
        )
      : 0;

  if (
    sentiment <= -0.65 &&
    activity >= 0.7
  ) {
    return CROWD_STATE.PANIC;
  }

  if (sentiment <= -0.25) {
    return CROWD_STATE.FEAR;
  }

  if (
    sentiment >= 0.65 &&
    activity >= 0.7
  ) {
    return CROWD_STATE.EUPHORIA;
  }

  if (sentiment >= 0.25) {
    return CROWD_STATE.OPTIMISM;
  }

  return CROWD_STATE.NEUTRAL;
}

/**
 * ============================================================
 * CROSS-PLATFORM AGREEMENT
 * ============================================================
 */

function analyzePlatformAgreement(
  platforms,
) {
  if (
    !Array.isArray(platforms) ||
    platforms.length === 0
  ) {
    return {
      agreementScore: 0,
      direction: 0,
      platformCount: 0,
    };
  }

  const valid =
    platforms
      .map(
        (platform) =>
          numberOrNull(
            platform
              ?.sentimentScore,
          ),
      )
      .filter(
        (value) =>
          value !== null,
      )
      .map(
        (value) =>
          clamp(
            value,
            -1,
            1,
          ),
      );

  if (valid.length === 0) {
    return {
      agreementScore: 0,
      direction: 0,
      platformCount: 0,
    };
  }

  const average =
    valid.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    valid.length;

  /**
   * Near-zero platform averages should not receive perfect
   * agreement merely because every value is technically >= 0.
   */
  const directionSign =
    Math.abs(average) < 0.05
      ? 0
      : average > 0
        ? 1
        : -1;

  let sameDirection = 0;

  if (directionSign !== 0) {
    sameDirection =
      valid.filter(
        (value) =>
          (
            directionSign > 0 &&
            value > 0
          ) ||
          (
            directionSign < 0 &&
            value < 0
          ),
      ).length;
  }

  const agreement =
    directionSign === 0
      ? 0
      : sameDirection /
        valid.length;

  return {
    agreementScore:
      round(
        agreement,
        4,
      ),

    direction:
      round(
        clamp(
          average,
          -1,
          1,
        ),
        4,
      ),

    platformCount:
      valid.length,
  };
}

/**
 * ============================================================
 * CONFIDENCE
 * ============================================================
 */

function calculateConfidence({
  sentiment,
  activity,
  platformAgreement,
  manipulation,
}) {
  if (!sentiment) {
    return 0;
  }

  const sentimentStrength =
    Math.abs(
      Number(
        sentiment.rawScore ??
        0,
      ),
    );

  const activityStrength =
    Number(
      activity
        ?.activityScore ??
      0,
    );

  const agreement =
    Number(
      platformAgreement
        ?.agreementScore ??
      0,
    );

  const manipulationPenalty =
    Number(
      manipulation
        ?.score ??
      0.5,
    );

  const coverage =
    clamp(
      manipulation
        ?.coverage
        ?.weightedCoverage ??
      0,
      0,
      1,
    );

  const baseConfidence =
    (
      sentimentStrength *
      0.40
    ) +
    (
      activityStrength *
      0.25
    ) +
    (
      agreement *
      0.25
    ) +
    0.10;

  /**
   * Coverage factor ranges from 0.55 to 1.
   * Missing manipulation evidence can never increase confidence.
   */
  const coverageFactor =
    0.55 +
    (
      coverage *
      0.45
    );

  return clamp(
    baseConfidence *
      (
        1 -
        manipulationPenalty *
          0.75
      ) *
      coverageFactor,
    0,
    1,
  );
}

/**
 * ============================================================
 * FINAL SOCIAL SCORE
 * ============================================================
 */

function calculateSocialScore({
  sentiment,
  activity,
  platformAgreement,
  manipulation,
}) {
  if (!sentiment) {
    return 0;
  }

  const direction =
    Number(
      sentiment.rawScore ??
      0,
    );

  const activityBoost =
    Number(
      activity
        ?.activityScore ??
      0,
    );

  const agreementBoost =
    Number(
      platformAgreement
        ?.agreementScore ??
      0,
    );

  const manipulationPenalty =
    Number(
      manipulation
        ?.score ??
      0.5,
    );

  const coverage =
    clamp(
      manipulation
        ?.coverage
        ?.weightedCoverage ??
      0,
      0,
      1,
    );

  let score = direction;

  score *=
    0.7 +
    activityBoost *
      0.15 +
    agreementBoost *
      0.15;

  score *=
    1 -
    manipulationPenalty *
      0.85;

  /**
   * Manipulation uncertainty also reduces the usable directional
   * signal. Full coverage = no extra reduction.
   */
  const coverageFactor =
    0.60 +
    coverage *
      0.40;

  score *= coverageFactor;

  return clamp(
    score,
    -1,
    1,
  );
}

/**
 * ============================================================
 * DIRECTION CLASSIFICATION
 * ============================================================
 */

function classifyDirection(
  score,
) {
  if (score >= 0.65) {
    return SOCIAL_DIRECTION
      .STRONG_BULLISH;
  }

  if (score >= 0.20) {
    return SOCIAL_DIRECTION.BULLISH;
  }

  if (score <= -0.65) {
    return SOCIAL_DIRECTION
      .STRONG_BEARISH;
  }

  if (score <= -0.20) {
    return SOCIAL_DIRECTION.BEARISH;
  }

  return SOCIAL_DIRECTION.NEUTRAL;
}

/**
 * ============================================================
 * DIRECTIONAL SUPPORT
 * ============================================================
 */

function calculateDirectionalSupport(
  rawScore,
) {
  const score =
    clamp(
      rawScore,
      -1,
      1,
    ) ?? 0;

  return {
    long:
      round(
        (score + 1) / 2,
        4,
      ),

    short:
      round(
        (1 - score) / 2,
        4,
      ),
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeSocialSentiment({
  symbol = null,
  sentiment = null,
  mentions = null,
  platforms = [],
  manipulation = null,

  /**
   * Added for compatibility with the new fail-safe provider.
   */
  manipulationCoverage = null,
} = {}) {
  try {
    const warnings = [];

    const sentimentResult =
      sentiment
        ? analyzeSentiment({
            bullish:
              sentiment.bullish,

            bearish:
              sentiment.bearish,

            neutral:
              sentiment.neutral,
          })
        : null;

    const activity =
      mentions
        ? analyzeMentionActivity({
            mentionVelocity:
              mentions.velocity,

            baselineVelocity:
              mentions.baselineVelocity,

            mentionAcceleration:
              mentions.acceleration,
          })
        : {
            velocity: null,
            baselineVelocity: null,
            velocityRatio: null,
            acceleration: 0,
            activityScore: 0,
          };

    const platformAgreement =
      analyzePlatformAgreement(
        platforms,
      );

    const manipulationResult =
      analyzeManipulationRisk({
        manipulation,
        manipulationCoverage,
      });

    /**
     * ======================================================
     * NO SENTIMENT DATA — FAIL CLOSED
     * ======================================================
     */

    if (!sentimentResult) {
      return {
        approved: false,

        engine:
          "SOCIAL_SENTIMENT",

        status:
          "INSUFFICIENT_DATA",

        symbol,

        direction:
          SOCIAL_DIRECTION.UNKNOWN,

        confidence: 0,

        rawScore: 0,

        // Unknown social evidence is neutral, not opposition.
        directionalSupport: {
          long: 0.5,
          short: 0.5,
        },

        directionalSupportPercent: {
          long: 50,
          short: 50,
        },

        scoring: {
          directional: true,
          maximumPoints: 5,
          evidenceAvailable: false,
          neutralFallbackApplied: true,
        },

        sentiment: null,

        activity,

        platformAgreement,

        crowdState:
          CROWD_STATE.UNKNOWN,

        manipulationRisk:
          manipulationResult,

        summary:
          "No usable social sentiment data was supplied.",

        warnings: [
          "No social directional evidence should be awarded.",
        ],

        errors: [],

        maximumScore: 5,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    const crowdState =
      determineCrowdState({
        sentimentScore:
          sentimentResult.rawScore,

        activityScore:
          activity.activityScore,
      });

    const rawScore =
      calculateSocialScore({
        sentiment:
          sentimentResult,

        activity,

        platformAgreement,

        manipulation:
          manipulationResult,
      });

    const confidence =
      calculateConfidence({
        sentiment:
          sentimentResult,

        activity,

        platformAgreement,

        manipulation:
          manipulationResult,
      });

    const direction =
      classifyDirection(
        rawScore,
      );

    const directionalSupport =
      calculateDirectionalSupport(
        rawScore,
      );

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    if (
      manipulationResult.level ===
      MANIPULATION_RISK.UNKNOWN
    ) {
      warnings.push(
        "Manipulation risk is UNKNOWN because coverage is insufficient. Missing signals are not treated as safe.",
      );
    }

    if (
      manipulationResult
        .coverage
        .fullyObserved !==
      true
    ) {
      warnings.push(
        `Manipulation coverage is ${Math.round(
          (
            manipulationResult
              .coverage
              .coverage ??
            0
          ) * 100,
        )}%. Social confidence has been reduced for incomplete manipulation evidence.`,
      );
    }

    if (
      manipulationResult
        .classificationCoverage ===
      "PARTIAL"
    ) {
      warnings.push(
        "Manipulation-risk classification is based on partial coverage and should be treated cautiously.",
      );
    }

    if (
      manipulationResult.level ===
        MANIPULATION_RISK.HIGH ||
      manipulationResult.level ===
        MANIPULATION_RISK.EXTREME
    ) {
      warnings.push(
        "Social-media manipulation risk is high. Social evidence has been heavily discounted.",
      );
    }

    if (
      activity.velocityRatio !==
        null &&
      activity.velocityRatio >= 5
    ) {
      warnings.push(
        "Social mention activity is significantly above baseline.",
      );
    }

    if (
      platformAgreement
        .platformCount <
      2
    ) {
      warnings.push(
        "Cross-platform social confirmation is unavailable or limited.",
      );
    }

    if (
      crowdState ===
      CROWD_STATE.PANIC
    ) {
      warnings.push(
        "Crowd behaviour indicates panic conditions.",
      );
    }

    if (
      crowdState ===
      CROWD_STATE.EUPHORIA
    ) {
      warnings.push(
        "Crowd behaviour indicates euphoria. Contrarian risk may be elevated.",
      );
    }

    const manipulationSummary =
      manipulationResult.level ===
      MANIPULATION_RISK.UNKNOWN
        ? "Manipulation risk is unknown because coverage is incomplete."
        : `Manipulation risk is ${manipulationResult.level
            .replaceAll(
              "_",
              " ",
            )
            .toLowerCase()}.`;

    const summary =
      `Social sentiment is ${direction
        .replaceAll(
          "_",
          " ",
        )
        .toLowerCase()} with a crowd state of ${crowdState
          .toLowerCase()}. ${manipulationSummary}`;

    return {
      approved: true,

      engine:
        "SOCIAL_SENTIMENT",

      status:
        "COMPLETE",

      symbol,

      direction,

      confidence:
        round(
          confidence,
          4,
        ),

      rawScore:
        round(
          rawScore,
          4,
        ),

      directionalSupport,

      directionalSupportPercent: {
        long: round(directionalSupport.long * 100, 2),
        short: round(directionalSupport.short * 100, 2),
      },

      scoring: {
        directional: true,
        maximumPoints: 5,
        evidenceAvailable: true,
        neutralFallbackApplied: false,
      },

      sentiment:
        sentimentResult,

      activity,

      platformAgreement,

      crowdState,

      manipulationRisk:
        manipulationResult,

      summary,

      warnings,

      errors: [],

      maximumScore: 5,

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "SOCIAL_SENTIMENT",

      status:
        "ERROR",

      symbol,

      direction:
        SOCIAL_DIRECTION.UNKNOWN,

      confidence: 0,

      rawScore: 0,

      // Engine errors are neutral for directional scoring.
      directionalSupport: {
        long: 0.5,
        short: 0.5,
      },

      directionalSupportPercent: {
        long: 50,
        short: 50,
      },

      scoring: {
        directional: true,
        maximumPoints: 5,
        evidenceAvailable: false,
        neutralFallbackApplied: true,
      },

      sentiment: null,

      activity: null,

      platformAgreement: {
        agreementScore: 0,
        direction: 0,
        platformCount: 0,
      },

      crowdState:
        CROWD_STATE.UNKNOWN,

      manipulationRisk: {
        level:
          MANIPULATION_RISK.UNKNOWN,

        score: null,

        observedRiskScore:
          null,

        coverage: {
          observedFieldCount: 0,
          totalFieldCount:
            MANIPULATION_FIELDS.length,
          coverage: 0,
          weightedCoverage: 0,
          fullyObserved: false,
        },
      },

      summary:
        "Social sentiment analysis failed safely. No social directional evidence should be awarded.",

      warnings: [
        "Social engine failure must not trigger or block a trade by itself.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      maximumScore: 5,

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default analyzeSocialSentiment;
