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
 * Company Fundamentals            30
 * Macro / Market Regime           10
 * News / Event Intelligence       10
 * Institutional Position           7.5
 * Historical Intelligence          5
 * Social / Market Behaviour        5
 * Country / Economic Conditions    2.5
 *                                ----
 * DIRECTIONAL TOTAL              100
 *
 * Liquidity and Risk / Reward are execution gates, not score points.
 * Cross-engine consensus is derived evidence and is not double-counted.
 *
 * Fundamentals and institutional positioning are independent
 * directional engines. Missing optional evidence remains unavailable
 * and lowers evidence coverage rather than becoming artificial support.
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

    // Directional research score only. Execution quality is handled
    // separately by gates and never dilutes research conviction.
    weights: {
      technical: 30,
      company: 30,
      macroRegime: 10,
      events: 10,
      institutional: 7.5,
      historical: 5,
      social: 5,
      country: 2.5,
    },
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
 * HISTORICAL INTELLIGENCE SUPPORT
 * ============================================================
 *
 * The bot's own completed-trade history is preferred when it
 * has a usable COMPLETE outcome result.
 *
 * If bot-history evidence is unavailable / insufficient, fall
 * back to the existing market historical analogue engine.
 *
 * IMPORTANT:
 * - Never score both at once.
 * - Never convert missing bot history into zero support.
 * - Preserve the existing 5-point historical slot.
 */

function getHistoricalIntelligenceSupport({
  historyOutcome,
  historical,
  side,
}) {
  const outcomeStatus =
    String(
      historyOutcome?.status ??
      "",
    )
      .trim()
      .toUpperCase();

  const outcomeConfidence =
    String(
      historyOutcome?.confidence ??
      "",
    )
      .trim()
      .toUpperCase();

  const outcomeUsable =
    historyOutcome?.approved === true &&
    outcomeStatus === "COMPLETE" &&
    outcomeConfidence !== "INSUFFICIENT";

  if (outcomeUsable) {
    const support =
      getDirectionalSupport({
        result:
          historyOutcome,

        side,
      });

    if (support !== null) {
      return {
        support,

        source:
          "TRADE_HISTORY_OUTCOME",

        engineStatus:
          historyOutcome
            ?.status ??
          null,
      };
    }
  }

  const fallbackSupport =
    getDirectionalSupport({
      result:
        historical,

      side,
    });

  if (fallbackSupport !== null) {
    return {
      support:
        fallbackSupport,

      source:
        "HISTORICAL_ANALOGUE",

      engineStatus:
        historical
          ?.status ??
        null,
    };
  }

  return {
    support: null,

    source:
      "UNAVAILABLE",

    engineStatus:
      historyOutcome
        ?.status ??
      historical
        ?.status ??
      null,
  };
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

  source = null,
}) {
  const available =
    isFiniteNumber(
      support,
    );

  // Missing/unusable directional evidence is neutral, not bearish.
  // We still keep `available: false` so evidence coverage remains honest.
  const neutralFallbackApplied =
    !available;

  const normalized =
    available
      ? clamp(
          support,
          0,
          1,
        )
      : 0.5;

  return {
    name,

    maximumPoints,

    available,

    neutralFallbackApplied,

    required,

    engineStatus,

    source,

    support:
      round(
        normalized,
        4,
      ),

    observedSupport:
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

  institutional = null,

  historical = null,

  historyOutcome = null,

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
   * HISTORICAL INTELLIGENCE
   * ========================================================
   *
   * One five-point historical slot only.
   *
   * Priority:
   * 1. Usable completed bot-trade outcome history.
   * 2. Existing market historical analogue evidence.
   * 3. Unavailable evidence remains unavailable.
   *
   * This prevents double-counting and prevents missing
   * historical evidence from being represented as real
   * zero-support evidence.
   */
  const historicalIntelligence =
    getHistoricalIntelligenceSupport({
      historyOutcome,
      historical,
      side,
    });

  /**
   * ========================================================
   * DIRECTIONAL RESEARCH COMPONENTS
   * ========================================================
   *
   * Technical + Fundamental/company evidence form 60% of the
   * intended research budget. Institutional evidence is its own
   * 7.5-point engine and never reduces the fundamental allocation.
   * Missing/unusable evidence remains unavailable for coverage, but
   * contributes neutral 50% support instead of artificial zero support.
   * This prevents missing data from being interpreted as opposition.
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
        "INSTITUTIONAL",

      maximumPoints:
        config.weights
          .institutional,

      support:
        getDirectionalSupport({
          result:
            institutional,

          side,
        }),

      required: false,

      engineStatus:
        institutional
          ?.status ??
        null,

      source:
        "INSTITUTIONAL_POSITION",
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
        historicalIntelligence
          .support,

      required: false,

      engineStatus:
        historicalIntelligence
          .engineStatus,

      source:
        historicalIntelligence
          .source,
    }),

  ];

  /**
   * ========================================================
   * DIRECTIONAL CONVICTION + EVIDENCE COVERAGE
   * ========================================================
   *
   * Raw points preserve the intended 100-point architecture.
   * Missing/unusable evidence contributes 50% of its allocation while
   * remaining unavailable for evidence-coverage reporting. This makes
   * UNKNOWN neutral rather than accidentally bearish/bullish.
   */

  const rawPoints =
    components.reduce(
      (sum, component) =>
        sum + Number(component.points ?? 0),
      0,
    );

  const availablePoints =
    components.reduce(
      (sum, component) =>
        sum +
        (component.available
          ? Number(component.maximumPoints ?? 0)
          : 0),
      0,
    );

  const intendedPoints =
    components.reduce(
      (sum, component) =>
        sum + Number(component.maximumPoints ?? 0),
      0,
    );

  const coverage =
    intendedPoints > 0
      ? availablePoints / intendedPoints
      : 0;

  const score =
    intendedPoints > 0
      ? round(
          clamp(
            (rawPoints / intendedPoints) * 100,
            0,
            100,
          ),
          2,
        )
      : 0;

  const missingRequired =
    components.filter(
      (component) =>
        component.required &&
        !component.available,
    );

  const passed =
    score >= config.minimumScore &&
    missingRequired.length === 0;

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

    evidenceCoveragePercent:
      round(coverage * 100, 2),

    rawPoints:
      round(rawPoints, 2),

    availablePoints,

    intendedPoints,

    neutralFallbackPolicy: {
      enabled: true,
      support: 0.5,
      rule:
        "Missing, insufficient, stale or errored directional evidence is neutral for scoring while remaining unavailable for coverage.",
    },

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

  institutional = null,

  historical = null,

  historyOutcome = null,

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

        institutional,

        historical,

        historyOutcome,

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

        institutional,

        historical,

        historyOutcome,

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
     * EXECUTION GATES
     * ======================================================
     *
     * Liquidity and risk/reward no longer contribute points to the
     * directional research score. They answer a different question:
     * whether a strong research setup is executable.
     */

    const liquiditySupport =
      getLiquiditySupport(liquidity);

    const riskRewardSupport =
      preferredSide
        ? getRiskRewardSupport({
            riskReward,
            side: preferredSide,
          })
        : null;

    const liquidityReady =
      liquiditySupport !== null &&
      liquidity?.approved !== false;

    const riskRewardReady =
      riskRewardSupport !== null &&
      riskReward?.approved !== false;

    const executionReady =
      liquidityReady &&
      riskRewardReady;

    const executionGates = {
      liquidity: {
        available: liquiditySupport !== null,
        passed: liquidityReady,
        support: liquiditySupport,
        status: liquidity?.status ?? null,
      },
      riskReward: {
        available: riskRewardSupport !== null,
        passed: riskRewardReady,
        support: riskRewardSupport,
        status: riskReward?.status ?? null,
      },
    };

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
      executionReady &&
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
      requiredEnginesReady &&
      executionReady
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

      executionReady,

      executionGates,

      tradeEligible,

      minimumRequiredScore:
        config.minimumScore,

      summary,

      /**
       * This is where the future frontend can
       * show all contributing components.
       *
       * The scorecard contains the eight directional research engines.
       * Liquidity and risk/reward are exposed separately as execution gates.
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

                  observedSupport:
                    component.observedSupport,

                  neutralFallbackApplied:
                    component.neutralFallbackApplied === true,

                  available:
                    component.available,

                  status:
                    component
                      .engineStatus,

                  source:
                    component
                      .source,
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

                  observedSupport:
                    component.observedSupport,

                  neutralFallbackApplied:
                    component.neutralFallbackApplied === true,

                  available:
                    component.available,

                  status:
                    component
                      .engineStatus,

                  source:
                    component
                      .source,
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