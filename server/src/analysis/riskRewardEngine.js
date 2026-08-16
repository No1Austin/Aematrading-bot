import {
  TRADE_SIDE,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * RISK / REWARD ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Evaluate the geometry of a proposed trade.
 *
 * It calculates:
 *
 * - entry price
 * - stop price
 * - risk per share
 * - target price(s)
 * - reward per share
 * - reward/risk ratio
 * - break-even win rate
 * - LONG / SHORT quality
 *
 * This engine does NOT size the position.
 *
 * Position sizing remains the responsibility of:
 *
 * tradeRiskManager.js
 *
 * Maximum contribution:
 *
 * 5 points
 */

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

export const DEFAULT_RISK_REWARD_CONFIG =
  Object.freeze({
    maximumScore: 5,

    minimumRewardRisk:
      1.5,

    preferredRewardRisk:
      2,

    strongRewardRisk:
      3,

    excellentRewardRisk:
      4,

    /**
     * Hard block when expected payoff
     * is below this level.
     */
    hardMinimumRewardRisk:
      1,

    /**
     * Optional target construction.
     *
     * Used only when no target is supplied.
     */
    defaultTargetR:
      2.5,
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
      ) *
        factor,
    ) / factor
  );
}

/**
 * ============================================================
 * VALIDATE TRADE GEOMETRY
 * ============================================================
 */

function validateGeometry({
  side,
  entryPrice,
  stopPrice,
}) {
  const errors = [];

  if (
    side !== TRADE_SIDE.LONG &&
    side !== TRADE_SIDE.SHORT
  ) {
    errors.push(
      "Trade side must be LONG or SHORT.",
    );
  }

  if (!positiveNumber(entryPrice)) {
    errors.push(
      "Entry price must be greater than zero.",
    );
  }

  if (!positiveNumber(stopPrice)) {
    errors.push(
      "Stop price must be greater than zero.",
    );
  }

  if (
    side === TRADE_SIDE.LONG &&
    positiveNumber(entryPrice) &&
    positiveNumber(stopPrice) &&
    Number(stopPrice) >=
      Number(entryPrice)
  ) {
    errors.push(
      "LONG stop must be below entry price.",
    );
  }

  if (
    side === TRADE_SIDE.SHORT &&
    positiveNumber(entryPrice) &&
    positiveNumber(stopPrice) &&
    Number(stopPrice) <=
      Number(entryPrice)
  ) {
    errors.push(
      "SHORT stop must be above entry price.",
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,
  };
}

/**
 * ============================================================
 * RISK PER SHARE
 * ============================================================
 */

function calculateRiskPerShare({
  entryPrice,
  stopPrice,
}) {
  if (
    !positiveNumber(entryPrice) ||
    !positiveNumber(stopPrice)
  ) {
    return null;
  }

  return Math.abs(
    Number(entryPrice) -
    Number(stopPrice),
  );
}

/**
 * ============================================================
 * TARGET BUILDER
 * ============================================================
 */

function buildDefaultTarget({
  side,
  entryPrice,
  riskPerShare,
  targetR,
}) {
  if (
    !positiveNumber(entryPrice) ||
    !positiveNumber(riskPerShare) ||
    !isFiniteNumber(targetR)
  ) {
    return null;
  }

  const distance =
    Number(riskPerShare) *
    Number(targetR);

  if (side === TRADE_SIDE.LONG) {
    return round(
      Number(entryPrice) +
        distance,
    );
  }

  if (side === TRADE_SIDE.SHORT) {
    return round(
      Number(entryPrice) -
        distance,
    );
  }

  return null;
}

/**
 * ============================================================
 * REWARD PER SHARE
 * ============================================================
 */

function calculateRewardPerShare({
  side,
  entryPrice,
  targetPrice,
}) {
  if (
    !positiveNumber(entryPrice) ||
    !positiveNumber(targetPrice)
  ) {
    return null;
  }

  if (side === TRADE_SIDE.LONG) {
    return (
      Number(targetPrice) -
      Number(entryPrice)
    );
  }

  if (side === TRADE_SIDE.SHORT) {
    return (
      Number(entryPrice) -
      Number(targetPrice)
    );
  }

  return null;
}

/**
 * ============================================================
 * REWARD / RISK
 * ============================================================
 */

function calculateRewardRiskRatio({
  rewardPerShare,
  riskPerShare,
}) {
  if (
    !isFiniteNumber(
      rewardPerShare,
    ) ||
    !positiveNumber(
      riskPerShare,
    )
  ) {
    return null;
  }

  return (
    Number(rewardPerShare) /
    Number(riskPerShare)
  );
}

/**
 * ============================================================
 * BREAK-EVEN WIN RATE
 * ============================================================
 *
 * Ignoring fees/slippage:
 *
 * 2:1 R:R
 *
 * requires roughly:
 *
 * 33.3% win rate
 */

function calculateBreakEvenWinRate(
  rewardRiskRatio,
) {
  if (
    !positiveNumber(
      rewardRiskRatio,
    )
  ) {
    return null;
  }

  return (
    1 /
    (
      1 +
      Number(
        rewardRiskRatio,
      )
    )
  );
}

/**
 * ============================================================
 * EXPECTED VALUE
 * ============================================================
 *
 * Optional:
 *
 * If the strategy has an estimated win probability,
 * calculate theoretical expectancy.
 *
 * EV in R:
 *
 * P(win) * rewardR
 * -
 * P(loss) * 1R
 */

function calculateExpectedValue({
  winProbability,
  rewardRiskRatio,
}) {
  if (
    !isFiniteNumber(
      winProbability,
    ) ||
    !positiveNumber(
      rewardRiskRatio,
    )
  ) {
    return null;
  }

  const probability =
    clamp(
      winProbability,
      0,
      1,
    );

  return (
    probability *
      Number(
        rewardRiskRatio,
      ) -
    (
      1 -
      probability
    )
  );
}

/**
 * ============================================================
 * QUALITY SCORE
 * ============================================================
 */

function calculateQuality({
  rewardRiskRatio,
  expectedValue,
  config,
}) {
  if (
    !positiveNumber(
      rewardRiskRatio,
    )
  ) {
    return 0;
  }

  let quality = 0;

  if (
    rewardRiskRatio >=
    config.excellentRewardRisk
  ) {
    quality = 1;
  } else if (
    rewardRiskRatio >=
    config.strongRewardRisk
  ) {
    quality = 0.9;
  } else if (
    rewardRiskRatio >=
    config.preferredRewardRisk
  ) {
    quality = 0.8;
  } else if (
    rewardRiskRatio >=
    config.minimumRewardRisk
  ) {
    quality = 0.6;
  } else if (
    rewardRiskRatio >=
    config.hardMinimumRewardRisk
  ) {
    quality = 0.3;
  }

  /**
   * Reward setups with positive expectancy.
   */

  if (
    isFiniteNumber(
      expectedValue,
    )
  ) {
    if (expectedValue >= 1) {
      quality += 0.1;
    } else if (
      expectedValue < 0
    ) {
      quality -= 0.25;
    }
  }

  return clamp(
    quality,
    0,
    1,
  );
}

/**
 * ============================================================
 * ONE SIDE
 * ============================================================
 */

export function analyzeTradeGeometry({
  side,

  entryPrice,

  stopPrice,

  targetPrice = null,

  targetR = null,

  winProbability = null,

  config =
    DEFAULT_RISK_REWARD_CONFIG,
} = {}) {
  try {
    const validation =
      validateGeometry({
        side,
        entryPrice,
        stopPrice,
      });

    if (!validation.valid) {
      return {
        approved: false,

        engine:
          "RISK_REWARD",

        status:
          "ERROR",

        side,

        errors:
          validation.errors,

        warnings: [],

        directionalSupport: {
          long: 0,
          short: 0,
        },

        qualityScore: 0,

        pointContribution: 0,

        maximumScore:
          config.maximumScore,
      };
    }

    /**
     * ======================================================
     * RISK
     * ======================================================
     */

    const riskPerShare =
      calculateRiskPerShare({
        entryPrice,
        stopPrice,
      });

    /**
     * ======================================================
     * TARGET
     * ======================================================
     */

    const resolvedTargetR =
      isFiniteNumber(targetR)
        ? Number(targetR)
        : config.defaultTargetR;

    const resolvedTargetPrice =
      positiveNumber(
        targetPrice,
      )
        ? Number(
            targetPrice,
          )
        : buildDefaultTarget({
            side,
            entryPrice,
            riskPerShare,
            targetR:
              resolvedTargetR,
          });

    if (
      !positiveNumber(
        resolvedTargetPrice,
      )
    ) {
      return {
        approved: false,

        engine:
          "RISK_REWARD",

        status:
          "ERROR",

        side,

        errors: [
          "Unable to determine a valid target price.",
        ],

        warnings: [],

        directionalSupport: {
          long: 0,
          short: 0,
        },

        qualityScore: 0,

        pointContribution: 0,

        maximumScore:
          config.maximumScore,
      };
    }

    /**
     * ======================================================
     * REWARD
     * ======================================================
     */

    const rewardPerShare =
      calculateRewardPerShare({
        side,
        entryPrice,
        targetPrice:
          resolvedTargetPrice,
      });

    /**
     * Target must be on profitable side.
     */

    if (
      !positiveNumber(
        rewardPerShare,
      )
    ) {
      return {
        approved: false,

        engine:
          "RISK_REWARD",

        status:
          "BLOCKED",

        side,

        errors: [],

        warnings: [
          "Target price does not provide positive reward.",
        ],

        directionalSupport: {
          long: 0,
          short: 0,
        },

        qualityScore: 0,

        pointContribution: 0,

        maximumScore:
          config.maximumScore,
      };
    }

    /**
     * ======================================================
     * R:R
     * ======================================================
     */

    const rewardRiskRatio =
      calculateRewardRiskRatio({
        rewardPerShare,
        riskPerShare,
      });

    const breakEvenWinRate =
      calculateBreakEvenWinRate(
        rewardRiskRatio,
      );

    const expectedValue =
      calculateExpectedValue({
        winProbability,
        rewardRiskRatio,
      });

    const qualityScore =
      calculateQuality({
        rewardRiskRatio,

        expectedValue,

        config,
      });

    /**
     * ======================================================
     * HARD BLOCK
     * ======================================================
     */

    const blocked =
      rewardRiskRatio <
      config.hardMinimumRewardRisk;

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    const warnings = [];

    if (
      rewardRiskRatio <
      config.minimumRewardRisk
    ) {
      warnings.push(
        `Reward/risk ratio is below preferred minimum of ${config.minimumRewardRisk}:1.`,
      );
    }

    if (
      isFiniteNumber(
        expectedValue,
      ) &&
      expectedValue < 0
    ) {
      warnings.push(
        "Estimated trade expectancy is negative.",
      );
    }

    /**
     * ======================================================
     * POINTS
     * ======================================================
     */

    const pointContribution =
      blocked
        ? 0
        : qualityScore *
          config.maximumScore;

    /**
     * ======================================================
     * DIRECTIONAL SUPPORT
     * ======================================================
     *
     * This geometry applies only to the side
     * being evaluated.
     */

    const directionalSupport =
      side === TRADE_SIDE.LONG
        ? {
            long:
              blocked
                ? 0
                : qualityScore,

            short: 0,
          }
        : {
            long: 0,

            short:
              blocked
                ? 0
                : qualityScore,
          };

    return {
      approved:
        !blocked,

      engine:
        "RISK_REWARD",

      status:
        blocked
          ? "BLOCKED"
          : "COMPLETE",

      side,

      entryPrice:
        Number(
          entryPrice,
        ),

      stopPrice:
        Number(
          stopPrice,
        ),

      targetPrice:
        Number(
          resolvedTargetPrice,
        ),

      riskPerShare:
        round(
          riskPerShare,
          4,
        ),

      rewardPerShare:
        round(
          rewardPerShare,
          4,
        ),

      rewardRiskRatio:
        round(
          rewardRiskRatio,
          4,
        ),

      targetR:
        round(
          rewardRiskRatio,
          4,
        ),

      breakEvenWinRate:
        round(
          breakEvenWinRate,
          4,
        ),

      expectedValueR:
        expectedValue !== null
          ? round(
              expectedValue,
              4,
            )
          : null,

      winProbability:
        isFiniteNumber(
          winProbability,
        )
          ? round(
              clamp(
                winProbability,
                0,
                1,
              ),
              4,
            )
          : null,

      qualityScore:
        round(
          qualityScore,
          4,
        ),

      directionalSupport,

      pointContribution:
        round(
          pointContribution,
          2,
        ),

      maximumScore:
        config.maximumScore,

      blocked,

      warnings,

      errors: [],

      summary:
        blocked
          ? `Trade geometry blocked because reward/risk is only ${round(
              rewardRiskRatio,
              2,
            )}:1.`
          : `Trade geometry offers approximately ${round(
              rewardRiskRatio,
              2,
            )}:1 reward/risk.`,

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "RISK_REWARD",

      status:
        "ERROR",

      side,

      directionalSupport: {
        long: 0,
        short: 0,
      },

      qualityScore: 0,

      pointContribution: 0,

      maximumScore:
        config
          ?.maximumScore ??
        5,

      blocked: true,

      warnings: [
        "Risk/reward analysis failed. Trade geometry must not be assumed safe.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      summary:
        "Risk/reward analysis failed safely.",

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

/**
 * ============================================================
 * ANALYZE BOTH SIDES
 * ============================================================
 */

export function analyzeRiskReward({
  entryPrice,

  longStopPrice = null,

  shortStopPrice = null,

  longTargetPrice = null,

  shortTargetPrice = null,

  longTargetR = null,

  shortTargetR = null,

  longWinProbability = null,

  shortWinProbability = null,

  config =
    DEFAULT_RISK_REWARD_CONFIG,
} = {}) {
  const long =
    positiveNumber(
      longStopPrice,
    )
      ? analyzeTradeGeometry({
          side:
            TRADE_SIDE.LONG,

          entryPrice,

          stopPrice:
            longStopPrice,

          targetPrice:
            longTargetPrice,

          targetR:
            longTargetR,

          winProbability:
            longWinProbability,

          config,
        })
      : null;

  const short =
    positiveNumber(
      shortStopPrice,
    )
      ? analyzeTradeGeometry({
          side:
            TRADE_SIDE.SHORT,

          entryPrice,

          stopPrice:
            shortStopPrice,

          targetPrice:
            shortTargetPrice,

          targetR:
            shortTargetR,

          winProbability:
            shortWinProbability,

          config,
        })
      : null;

  return {
    approved:
      Boolean(
        long?.approved ||
        short?.approved,
      ),

    engine:
      "RISK_REWARD",

    status:
      long || short
        ? "COMPLETE"
        : "INSUFFICIENT_DATA",

    long,

    short,

    /**
     * Give tradeScoringEngine a standard interface.
     */

    directionalSupport: {
      long:
        long?.directionalSupport
          ?.long ??
        0,

      short:
        short?.directionalSupport
          ?.short ??
        0,
    },

    longRewardRiskRatio:
      long
        ?.rewardRiskRatio ??
      null,

    shortRewardRiskRatio:
      short
        ?.rewardRiskRatio ??
      null,

    maximumScore:
      config.maximumScore,

    timestamp:
      new Date()
        .toISOString(),
  };
}

export default analyzeRiskReward;