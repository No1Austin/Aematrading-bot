import {
  TRADE_SIDE,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * TRADE SCORING ENGINE
 * ============================================================
 *
 * FINAL SCORE ARCHITECTURE
 * ------------------------
 *
 * Technical Analysis              30
 * Macro / Market Regime           15
 * News / Event Intelligence       10
 * Company Fundamentals            10
 * Country / Economic Conditions   10
 * Social / Market Behaviour        5
 * Historical Analogue              5
 * Liquidity / Execution            5
 * Risk / Reward                    5
 * Cross-Engine Consensus           5
 *                                ----
 * TOTAL                           100
 *
 * Minimum eligibility:
 *
 * 80 / 100
 *
 * IMPORTANT
 * ---------
 *
 * A score >= 80 does NOT execute a trade.
 *
 * It only means:
 *
 * TRADE CANDIDATE ELIGIBLE
 *
 * The trade must still pass:
 *
 * - event freeze
 * - risk manager
 * - account protection
 * - portfolio protection
 * - position sizing
 * - execution checks
 */

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

export const FINAL_SCORING_CONFIG =
  Object.freeze({
    minimumScore: 80,

    ambiguousDifference: 8,

    weights: {
      technical: 30,

      macroRegime: 15,

      events: 10,

      company: 10,

      country: 10,

      social: 5,

      historical: 5,

      liquidity: 5,

      riskReward: 5,

      consensus: 5,
    },
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
 * DIRECTIONAL SUPPORT
 * ============================================================
 *
 * Standard expected format:
 *
 * directionalSupport: {
 *   long: 0-1,
 *   short: 0-1
 * }
 */

function getDirectionalSupport({
  result,
  side,
}) {
  if (!result) {
    return null;
  }

  const support =
    side === TRADE_SIDE.LONG
      ? result
          ?.directionalSupport
          ?.long
      : result
          ?.directionalSupport
          ?.short;

  if (
    isFiniteNumber(
      support,
    )
  ) {
    return clamp(
      support,
      0,
      1,
    );
  }

  /**
   * Historical / consensus engines may
   * already calculate pointContribution.
   *
   * We still prefer directionalSupport,
   * because the scoring engine owns the
   * final weight calculation.
   */

  return null;
}

/**
 * ============================================================
 * TECHNICAL SUPPORT
 * ============================================================
 *
 * The technical engine currently has a slightly
 * different output structure, so normalize it here.
 */

function getTechnicalSupport({
  technical,
  side,
}) {
  if (
    !technical ||
    technical.approved !== true
  ) {
    return null;
  }

  if (
    technical
      ?.directionalSupport
  ) {
    return getDirectionalSupport({
      result:
        technical,

      side,
    });
  }

  const trend =
    technical
      ?.trend
      ?.direction;

  const bias =
    technical
      ?.bias
      ?.direction;

  let score = 0;
  let parts = 0;

  /**
   * Trend contribution.
   */

  if (trend) {
    parts += 1;

    if (
      side === TRADE_SIDE.LONG
    ) {
      if (
        trend ===
        "STRONG_BULLISH"
      ) {
        score += 1;
      } else if (
        trend ===
        "BULLISH"
      ) {
        score += 0.8;
      } else if (
        trend ===
        "SIDEWAYS"
      ) {
        score += 0.4;
      }
    }

    if (
      side === TRADE_SIDE.SHORT
    ) {
      if (
        trend ===
        "STRONG_BEARISH"
      ) {
        score += 1;
      } else if (
        trend ===
        "BEARISH"
      ) {
        score += 0.8;
      } else if (
        trend ===
        "SIDEWAYS"
      ) {
        score += 0.4;
      }
    }
  }

  /**
   * Bias contribution.
   */

  if (bias) {
    parts += 1;

    if (
      side === TRADE_SIDE.LONG &&
      bias === "LONG"
    ) {
      score += 1;
    } else if (
      side === TRADE_SIDE.SHORT &&
      bias === "SHORT"
    ) {
      score += 1;
    } else if (
      bias === "NEUTRAL"
    ) {
      score += 0.35;
    }
  }

  /**
   * Confirmation signals.
   */

  const confirmation =
    technical
      ?.confirmation;

  if (confirmation) {
    parts += 1;

    let confirmationScore =
      0;

    let confirmationParts =
      0;

    if (
      side === TRADE_SIDE.LONG
    ) {
      confirmationParts += 1;

      if (
        confirmation
          .bullishTrend
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .bullishMomentum
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .aboveVWAP === true
      ) {
        confirmationScore +=
          1;
      }
    }

    if (
      side === TRADE_SIDE.SHORT
    ) {
      confirmationParts += 1;

      if (
        confirmation
          .bearishTrend
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .bearishMomentum
      ) {
        confirmationScore +=
          1;
      }

      confirmationParts += 1;

      if (
        confirmation
          .belowVWAP === true
      ) {
        confirmationScore +=
          1;
      }
    }

    confirmationParts += 1;

    if (
      confirmation.volume ===
      true
    ) {
      confirmationScore +=
        1;
    }

    if (
      confirmationParts > 0
    ) {
      score +=
        confirmationScore /
        confirmationParts;
    }
  }

  if (parts <= 0) {
    return null;
  }

  return clamp(
    score / parts,
    0,
    1,
  );
}

/**
 * ============================================================
 * LIQUIDITY SUPPORT
 * ============================================================
 *
 * Liquidity is primarily quality/execution evidence rather
 * than directional market opinion.
 *
 * Therefore, both LONG and SHORT can receive the same
 * liquidity quality score.
 */

function getLiquiditySupport(
  liquidity,
) {
  if (!liquidity) {
    return null;
  }

  if (
    isFiniteNumber(
      liquidity.qualityScore,
    )
  ) {
    return clamp(
      liquidity.qualityScore,
      0,
      1,
    );
  }

  if (
    isFiniteNumber(
      liquidity.score,
    )
  ) {
    const score =
      Number(
        liquidity.score,
      );

    /**
     * If score is -1 to +1,
     * convert quality from magnitude.
     *
     * Negative directional liquidity
     * does not automatically make
     * execution impossible.
     */

    if (
      score >= -1 &&
      score <= 1
    ) {
      const stress =
        isFiniteNumber(
          liquidity
            ?.stressScore,
        )
          ? clamp(
              liquidity
                .stressScore,
              0,
              1,
            )
          : 0;

      return clamp(
        1 - stress,
        0,
        1,
      );
    }
  }

  if (
    liquidity.approved === true
  ) {
    return 0.75;
  }

  return null;
}

/**
 * ============================================================
 * RISK / REWARD SUPPORT
 * ============================================================
 */

function getRiskRewardSupport({
  riskReward,
  side,
}) {
  if (!riskReward) {
    return null;
  }

  const directional =
    getDirectionalSupport({
      result:
        riskReward,

      side,
    });

  if (
    directional !== null
  ) {
    return directional;
  }

  const ratio =
    side === TRADE_SIDE.LONG
      ? riskReward
          ?.longRewardRiskRatio ??
        riskReward
          ?.rewardRiskRatio
      : riskReward
          ?.shortRewardRiskRatio ??
        riskReward
          ?.rewardRiskRatio;

  if (
    !isFiniteNumber(
      ratio,
    )
  ) {
    return null;
  }

  const value =
    Number(ratio);

  if (value >= 4) {
    return 1;
  }

  if (value >= 3) {
    return 0.9;
  }

  if (value >= 2) {
    return 0.8;
  }

  if (value >= 1.5) {
    return 0.6;
  }

  if (value >= 1) {
    return 0.3;
  }

  return 0;
}

/**
 * ============================================================
 * COMPONENT BUILDER
 * ============================================================
 */

function buildComponent({
  name,

  maximumPoints,

  support,

  required = false,

  engineStatus = null,
}) {
  const available =
    isFiniteNumber(
      support,
    );

  const normalized =
    available
      ? clamp(
          support,
          0,
          1,
        )
      : 0;

  return {
    name,

    maximumPoints,

    available,

    required,

    engineStatus,

    support:
      available
        ? round(
            normalized,
            4,
          )
        : null,

    points:
      round(
        normalized *
          maximumPoints,
        2,
      ),
  };
}

/**
 * ============================================================
 * SCORE ONE SIDE
 * ============================================================
 */

export function calculateSideScore({
  side,

  technical = null,

  macro = null,

  marketRegime = null,

  events = null,

  company = null,

  country = null,

  social = null,

  historical = null,

  liquidity = null,

  riskReward = null,

  consensus = null,

  config =
    FINAL_SCORING_CONFIG,
} = {}) {
  if (
    side !== TRADE_SIDE.LONG &&
    side !== TRADE_SIDE.SHORT
  ) {
    return {
      approved: false,

      side,

      score: 0,

      passed: false,

      errors: [
        "Trade side must be LONG or SHORT.",
      ],
    };
  }

  /**
   * ========================================================
   * MACRO + REGIME
   * ========================================================
   *
   * Macro/Market Regime together have 15 points.
   *
   * We blend them rather than awarding both separately,
   * because otherwise macro conditions would be counted twice.
   */

  const macroSupport =
    getDirectionalSupport({
      result:
        macro,

      side,
    });

  const regimeSupport =
    getDirectionalSupport({
      result:
        marketRegime,

      side,
    });

  let macroRegimeSupport =
    null;

  if (
    macroSupport !== null &&
    regimeSupport !== null
  ) {
    macroRegimeSupport =
      (
        macroSupport *
        0.45
      ) +
      (
        regimeSupport *
        0.55
      );
  } else if (
    regimeSupport !== null
  ) {
    macroRegimeSupport =
      regimeSupport;
  } else if (
    macroSupport !== null
  ) {
    macroRegimeSupport =
      macroSupport;
  }

  /**
   * ========================================================
   * COMPONENTS
   * ========================================================
   */

  const components = [
    buildComponent({
      name:
        "TECHNICAL",

      maximumPoints:
        config.weights
          .technical,

      support:
        getTechnicalSupport({
          technical,
          side,
        }),

      required: true,

      engineStatus:
        technical
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "MACRO_REGIME",

      maximumPoints:
        config.weights
          .macroRegime,

      support:
        macroRegimeSupport,

      required: true,

      engineStatus:
        marketRegime
          ?.status ??
        macro
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "EVENTS",

      maximumPoints:
        config.weights
          .events,

      support:
        getDirectionalSupport({
          result:
            events,

          side,
        }),

      engineStatus:
        events
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "COMPANY",

      maximumPoints:
        config.weights
          .company,

      support:
        getDirectionalSupport({
          result:
            company,

          side,
        }),

      engineStatus:
        company
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "COUNTRY",

      maximumPoints:
        config.weights
          .country,

      support:
        getDirectionalSupport({
          result:
            country,

          side,
        }),

      engineStatus:
        country
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "SOCIAL",

      maximumPoints:
        config.weights
          .social,

      support:
        getDirectionalSupport({
          result:
            social,

          side,
        }),

      engineStatus:
        social
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "HISTORICAL",

      maximumPoints:
        config.weights
          .historical,

      support:
        getDirectionalSupport({
          result:
            historical,

          side,
        }),

      engineStatus:
        historical
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "LIQUIDITY",

      maximumPoints:
        config.weights
          .liquidity,

      support:
        getLiquiditySupport(
          liquidity,
        ),

      required: true,

      engineStatus:
        liquidity
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "RISK_REWARD",

      maximumPoints:
        config.weights
          .riskReward,

      support:
        getRiskRewardSupport({
          riskReward,
          side,
        }),

      required: true,

      engineStatus:
        riskReward
          ?.status ??
        null,
    }),

    buildComponent({
      name:
        "CONSENSUS",

      maximumPoints:
        config.weights
          .consensus,

      support:
        getDirectionalSupport({
          result:
            consensus,

          side,
        }),

      engineStatus:
        consensus
          ?.status ??
        null,
    }),
  ];

  /**
   * ========================================================
   * TOTAL
   * ========================================================
   */

  const total =
    components.reduce(
      (
        sum,
        component,
      ) =>
        sum +
        Number(
          component.points ??
          0,
        ),
      0,
    );

  /**
   * ========================================================
   * COVERAGE
   * ========================================================
   *
   * A raw 80/100 based on only half of the engines
   * should NOT be treated the same as an 80/100
   * based on complete information.
   */

  const availablePoints =
    components.reduce(
      (
        sum,
        component,
      ) =>
        sum +
        (
          component.available
            ? component
                .maximumPoints
            : 0
        ),
      0,
    );

  const coverage =
    availablePoints /
    100;

  /**
   * Required components.
   */

  const missingRequired =
    components.filter(
      (component) =>
        component.required &&
        !component.available,
    );

  /**
   * ========================================================
   * PASS
   * ========================================================
   */

  const score =
    round(
      clamp(
        total,
        0,
        100,
      ),
      2,
    );

  const passed =
    score >=
      config.minimumScore &&
    missingRequired.length ===
      0;

  return {
    approved: true,

    side,

    score,

    minimumRequiredScore:
      config.minimumScore,

    passed,

    coverage:
      round(
        coverage,
        4,
      ),

    availablePoints,

    components,

    missingRequired:
      missingRequired.map(
        (component) =>
          component.name,
      ),

    errors: [],
  };
}

/**
 * ============================================================
 * FINAL OPPORTUNITY SCORE
 * ============================================================
 */

export function scoreTradeOpportunity({
  symbol = null,

  technical = null,

  macro = null,

  marketRegime = null,

  events = null,

  company = null,

  country = null,

  social = null,

  historical = null,

  liquidity = null,

  riskReward = null,

  consensus = null,

  config =
    FINAL_SCORING_CONFIG,
} = {}) {
  try {
    /**
     * ======================================================
     * LONG
     * ======================================================
     */

    const long =
      calculateSideScore({
        side:
          TRADE_SIDE.LONG,

        technical,

        macro,

        marketRegime,

        events,

        company,

        country,

        social,

        historical,

        liquidity,

        riskReward,

        consensus,

        config,
      });

    /**
     * ======================================================
     * SHORT
     * ======================================================
     */

    const short =
      calculateSideScore({
        side:
          TRADE_SIDE.SHORT,

        technical,

        macro,

        marketRegime,

        events,

        company,

        country,

        social,

        historical,

        liquidity,

        riskReward,

        consensus,

        config,
      });

    if (
      !long.approved ||
      !short.approved
    ) {
      return {
        approved: false,

        engine:
          "TRADE_SCORING",

        status:
          "ERROR",

        symbol,

        long,

        short,

        tradeEligible:
          false,

        preferredSide:
          null,

        errors: [
          ...(
            long.errors ??
            []
          ),

          ...(
            short.errors ??
            []
          ),
        ],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * PREFERRED SIDE
     * ======================================================
     */

    const difference =
      Math.abs(
        Number(long.score) -
        Number(short.score),
      );

    let preferredSide =
      null;

    let preferredScore =
      0;

    if (
      long.score >
      short.score
    ) {
      preferredSide =
        TRADE_SIDE.LONG;

      preferredScore =
        long.score;
    } else if (
      short.score >
      long.score
    ) {
      preferredSide =
        TRADE_SIDE.SHORT;

      preferredScore =
        short.score;
    }

    /**
     * ======================================================
     * AMBIGUITY
     * ======================================================
     *
     * Even if one side reaches 80, we do not want
     * to force a trade when LONG and SHORT are too close.
     */

    const ambiguous =
      difference <
      config
        .ambiguousDifference;

    if (ambiguous) {
      preferredSide =
        null;
    }

    /**
     * ======================================================
     * EVENT FREEZE
     * ======================================================
     */

    const eventFreeze =
      events
        ?.eventFreeze
        ?.active === true;

    /**
     * ======================================================
     * REQUIRED ENGINE SAFETY
     * ======================================================
     */

    const preferredResult =
      preferredSide ===
        TRADE_SIDE.LONG
        ? long
        : preferredSide ===
            TRADE_SIDE.SHORT
          ? short
          : null;

    const requiredEnginesReady =
      preferredResult
        ? preferredResult
            .missingRequired
            .length === 0
        : false;

    /**
     * ======================================================
     * TRADE ELIGIBILITY
     * ======================================================
     */

    const tradeEligible =
      preferredResult !==
        null &&
      preferredResult
        .score >=
        config.minimumScore &&
      requiredEnginesReady &&
      !ambiguous &&
      !eventFreeze;

    /**
     * ======================================================
     * STATUS
     * ======================================================
     */

    let status =
      "NO_TRADE";

    if (eventFreeze) {
      status =
        "EVENT_FREEZE";
    } else if (ambiguous) {
      status =
        "AMBIGUOUS";
    } else if (
      preferredResult &&
      preferredResult.score >=
        config.minimumScore &&
      requiredEnginesReady
    ) {
      status =
        "TRADE_CANDIDATE";
    } else if (
      preferredResult
    ) {
      status =
        "BELOW_THRESHOLD";
    }

    /**
     * ======================================================
     * FRONTEND SUMMARY
     * ======================================================
     */

    let summary;

    if (eventFreeze) {
      summary =
        `${symbol ?? "Asset"} is blocked by the event safety layer despite the current scoring results.`;
    } else if (ambiguous) {
      summary =
        `${symbol ?? "Asset"} has conflicting LONG and SHORT scores. No directional candidate should be selected.`;
    } else if (
      tradeEligible
    ) {
      summary =
        `${symbol ?? "Asset"} qualifies as a ${preferredSide} trade candidate with a score of ${preferredScore}/100. Final risk approval is still required.`;
    } else {
      summary =
        `${symbol ?? "Asset"} does not currently meet the ${config.minimumScore}/100 trade eligibility threshold.`;
    }

    /**
     * ======================================================
     * FINAL RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "TRADE_SCORING",

      status,

      symbol,

      long,

      short,

      preferredSide,

      preferredScore:
        round(
          preferredScore,
          2,
        ),

      scoreDifference:
        round(
          difference,
          2,
        ),

      ambiguous,

      eventFreeze,

      requiredEnginesReady,

      tradeEligible,

      minimumRequiredScore:
        config.minimumScore,

      summary,

      /**
       * This is where the future frontend can
       * show all ten contributing components.
       */

      scorecard: {
        long:
          Object.fromEntries(
            long.components.map(
              (component) => [
                component.name,
                {
                  points:
                    component.points,

                  maximum:
                    component
                      .maximumPoints,

                  support:
                    component.support,

                  available:
                    component.available,

                  status:
                    component
                      .engineStatus,
                },
              ],
            ),
          ),

        short:
          Object.fromEntries(
            short.components.map(
              (component) => [
                component.name,
                {
                  points:
                    component.points,

                  maximum:
                    component
                      .maximumPoints,

                  support:
                    component.support,

                  available:
                    component.available,

                  status:
                    component
                      .engineStatus,
                },
              ],
            ),
          ),
      },

      warnings: [
        ...(
          eventFreeze
            ? [
                "Event freeze is active. New entries are blocked.",
              ]
            : []
        ),

        ...(
          ambiguous
            ? [
                "LONG and SHORT scores are too close for a reliable directional decision.",
              ]
            : []
        ),

        ...(
          preferredResult
            ?.missingRequired
            ?.length >
            0
            ? [
                `Required scoring inputs missing: ${preferredResult.missingRequired.join(
                  ", ",
                )}.`,
              ]
            : []
        ),
      ],

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
        "TRADE_SCORING",

      status:
        "ERROR",

      symbol,

      preferredSide:
        null,

      preferredScore: 0,

      tradeEligible:
        false,

      eventFreeze: false,

      summary:
        "Trade scoring failed safely. No trade candidate should be created.",

      warnings: [
        "Scoring failure must block new trade candidates.",
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

export default scoreTradeOpportunity;