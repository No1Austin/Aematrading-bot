import {
  TRADE_SIDE,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * TRADE DECISION GATE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Final safety gate between:
 *
 * INTELLIGENCE / SCORING
 *
 * and
 *
 * RISK MANAGEMENT / EXECUTION
 *
 * This module DOES NOT place trades.
 *
 * A trade can only proceed to the risk manager when:
 *
 * 1. Final score passes threshold.
 * 2. Direction is LONG or SHORT.
 * 3. LONG/SHORT scores are sufficiently separated.
 * 4. Event freeze is not active.
 * 5. Liquidity allows execution.
 * 6. Risk/reward geometry is acceptable.
 * 7. Required engines are healthy.
 * 8. Consensus is not dangerously conflicted.
 *
 * SAFE-FAIL RULE
 * --------------
 *
 * Missing critical information = BLOCK.
 */

/**
 * ============================================================
 * DECISION STATUS
 * ============================================================
 */

export const DECISION_STATUS =
  Object.freeze({
    APPROVED_FOR_RISK:
      "APPROVED_FOR_RISK",

    BELOW_THRESHOLD:
      "BELOW_THRESHOLD",

    AMBIGUOUS:
      "AMBIGUOUS",

    EVENT_FREEZE:
      "EVENT_FREEZE",

    LIQUIDITY_BLOCK:
      "LIQUIDITY_BLOCK",

    RISK_REWARD_BLOCK:
      "RISK_REWARD_BLOCK",

    ENGINE_FAILURE:
      "ENGINE_FAILURE",

    CONSENSUS_CONFLICT:
      "CONSENSUS_CONFLICT",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    BLOCKED:
      "BLOCKED",

    ERROR:
      "ERROR",
  });

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

export const DEFAULT_DECISION_GATE_CONFIG =
  Object.freeze({
    minimumScore: 80,

    /**
     * Minimum difference between LONG and SHORT.
     *
     * Example:
     *
     * LONG  = 84
     * SHORT = 79
     *
     * Difference = 5
     *
     * This remains too ambiguous.
     */
    minimumScoreDifference: 8,

    /**
     * Minimum consensus confidence.
     */
    minimumConsensusConfidence: 0.50,

    /**
     * Critical engines must not fail.
     */
    requiredEngines: [
      "technical",
      "macro",
      "marketRegime",
      "liquidity",
      "riskReward",
      "scoring",
    ],
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

function validSide(side) {
  return (
    side === TRADE_SIDE.LONG ||
    side === TRADE_SIDE.SHORT
  );
}

/**
 * ============================================================
 * ENGINE HEALTH
 * ============================================================
 */

function inspectRequiredEngines({
  engineStates,
  requiredEngines,
}) {
  const failed = [];
  const missing = [];

  for (
    const key
    of requiredEngines
  ) {
    const engine =
      engineStates?.[key];

    if (!engine) {
      missing.push(key);
      continue;
    }

    const status =
      String(
        engine.status ??
        "",
      ).toUpperCase();

    if (
      status === "ERROR" ||
      status === "FAILED"
    ) {
      failed.push(key);
    }

    if (
      status ===
        "INSUFFICIENT_DATA" ||
      status === "SKIPPED"
    ) {
      missing.push(key);
    }
  }

  return {
    healthy:
      failed.length === 0 &&
      missing.length === 0,

    failed,

    missing,
  };
}

/**
 * ============================================================
 * LIQUIDITY GATE
 * ============================================================
 */

function inspectLiquidity(
  liquidity,
) {
  if (!liquidity) {
    return {
      passed: false,
      reason:
        "Liquidity result is missing.",
    };
  }

  if (
    liquidity
      .executionDecision ===
    "BLOCK"
  ) {
    return {
      passed: false,
      reason:
        "Liquidity engine blocked execution.",
    };
  }

  if (
    liquidity.status ===
    "ERROR"
  ) {
    return {
      passed: false,
      reason:
        "Liquidity engine failed.",
    };
  }

  if (
    liquidity.approved === false
  ) {
    return {
      passed: false,
      reason:
        "Liquidity engine did not approve execution.",
    };
  }

  return {
    passed: true,

    reduceSize:
      liquidity
        .executionDecision ===
      "REDUCE_SIZE",

    reason: null,
  };
}

/**
 * ============================================================
 * RISK / REWARD GATE
 * ============================================================
 */

function inspectRiskReward({
  riskReward,
  side,
}) {
  if (!riskReward) {
    return {
      passed: false,
      reason:
        "Risk/reward result is missing.",
    };
  }

  const geometry =
    side === TRADE_SIDE.LONG
      ? riskReward.long
      : riskReward.short;

  if (!geometry) {
    return {
      passed: false,

      reason:
        `${side} trade geometry is unavailable.`,
    };
  }

  if (
    geometry.blocked === true ||
    geometry.status ===
      "BLOCKED"
  ) {
    return {
      passed: false,

      reason:
        `${side} risk/reward geometry is blocked.`,
    };
  }

  if (
    geometry.approved !== true
  ) {
    return {
      passed: false,

      reason:
        `${side} risk/reward geometry was not approved.`,
    };
  }

  return {
    passed: true,

    rewardRiskRatio:
      geometry
        .rewardRiskRatio ??
      null,

    entryPrice:
      geometry
        .entryPrice ??
      null,

    stopPrice:
      geometry
        .stopPrice ??
      null,

    targetPrice:
      geometry
        .targetPrice ??
      null,

    reason: null,
  };
}

/**
 * ============================================================
 * CONSENSUS GATE
 * ============================================================
 */

function inspectConsensus({
  consensus,
  side,
  config,
}) {
  /**
   * Consensus is supporting evidence.
   *
   * We don't automatically block simply
   * because consensus confidence is mediocre.
   *
   * We DO block when it actively contradicts
   * the proposed trade with meaningful confidence.
   */

  if (!consensus) {
    return {
      passed: true,

      warning:
        "Consensus result unavailable.",
    };
  }

  const confidence =
    isFiniteNumber(
      consensus.confidence,
    )
      ? Number(
          consensus.confidence,
        )
      : 0;

  const direction =
    String(
      consensus.direction ??
      "",
    ).toUpperCase();

  const contradictsLong =
    side === TRADE_SIDE.LONG &&
    (
      direction ===
        "SHORT" ||
      direction ===
        "STRONG_SHORT"
    );

  const contradictsShort =
    side === TRADE_SIDE.SHORT &&
    (
      direction ===
        "LONG" ||
      direction ===
        "STRONG_LONG"
    );

  const contradiction =
    contradictsLong ||
    contradictsShort;

  if (
    contradiction &&
    confidence >=
      config
        .minimumConsensusConfidence
  ) {
    return {
      passed: false,

      confidence,

      direction,

      reason:
        `Cross-engine consensus contradicts the proposed ${side} trade.`,
    };
  }

  return {
    passed: true,

    confidence,

    direction,

    warning:
      direction ===
        "CONFLICTED"
        ? "Cross-engine consensus is conflicted."
        : null,
  };
}

/**
 * ============================================================
 * BLOCK RESULT
 * ============================================================
 */

function buildBlockedResult({
  symbol,

  status,

  side = null,

  score = 0,

  longScore = 0,

  shortScore = 0,

  reasons = [],

  warnings = [],

  checks = {},
}) {
  return {
    approved: true,

    engine:
      "TRADE_DECISION_GATE",

    status,

    symbol,

    decision:
      "NO_TRADE",

    canProceedToRiskManager:
      false,

    side,

    score,

    longScore,

    shortScore,

    reasons,

    warnings,

    checks,

    timestamp:
      new Date()
        .toISOString(),
  };
}

/**
 * ============================================================
 * MAIN DECISION GATE
 * ============================================================
 */

export function evaluateTradeDecision({
  symbol = null,

  scoring,

  events,

  liquidity,

  riskReward,

  consensus,

  engineStates = {},

  config =
    DEFAULT_DECISION_GATE_CONFIG,
} = {}) {
  try {
    /**
     * ======================================================
     * SCORING MUST EXIST
     * ======================================================
     */

    if (!scoring) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .INSUFFICIENT_DATA,

        reasons: [
          "Trade scoring result is missing.",
        ],
      });
    }

    const longScore =
      Number(
        scoring
          ?.long
          ?.score ??
        0,
      );

    const shortScore =
      Number(
        scoring
          ?.short
          ?.score ??
        0,
      );

    const side =
      scoring
        ?.preferredSide ??
      null;

    const score =
      validSide(side)
        ? side ===
            TRADE_SIDE.LONG
          ? longScore
          : shortScore
        : 0;

    const scoreDifference =
      Math.abs(
        longScore -
        shortScore,
      );

    /**
     * ======================================================
     * ENGINE HEALTH
     * ======================================================
     */

    const engineHealth =
      inspectRequiredEngines({
        engineStates,

        requiredEngines:
          config
            .requiredEngines,
      });

    if (
      engineHealth
        .failed
        .length > 0
    ) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .ENGINE_FAILURE,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          `Critical engines failed: ${engineHealth.failed.join(
            ", ",
          )}.`,
        ],

        checks: {
          engineHealth,
        },
      });
    }

    if (
      engineHealth
        .missing
        .length > 0
    ) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .INSUFFICIENT_DATA,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          `Critical engine data unavailable: ${engineHealth.missing.join(
            ", ",
          )}.`,
        ],

        checks: {
          engineHealth,
        },
      });
    }

    /**
     * ======================================================
     * VALID SIDE
     * ======================================================
     */

    if (!validSide(side)) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .AMBIGUOUS,

        longScore,

        shortScore,

        reasons: [
          "No valid LONG or SHORT direction was selected.",
        ],

        checks: {
          engineHealth,
        },
      });
    }

    /**
     * ======================================================
     * 80% THRESHOLD
     * ======================================================
     */

    if (
      score <
      config.minimumScore
    ) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .BELOW_THRESHOLD,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          `${side} score of ${round(
            score,
          )}/100 is below the required ${config.minimumScore}/100.`,
        ],

        checks: {
          engineHealth,
        },
      });
    }

    /**
     * ======================================================
     * DIRECTIONAL AMBIGUITY
     * ======================================================
     */

    if (
      scoreDifference <
      config
        .minimumScoreDifference
    ) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .AMBIGUOUS,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          `LONG and SHORT scores are separated by only ${round(
            scoreDifference,
          )} points.`,
        ],

        checks: {
          engineHealth,

          scoreDifference,
        },
      });
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

    if (eventFreeze) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .EVENT_FREEZE,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          "Event intelligence has activated a trade freeze.",
        ],

        checks: {
          engineHealth,

          eventFreeze: true,
        },
      });
    }

    /**
     * ======================================================
     * LIQUIDITY
     * ======================================================
     */

    const liquidityCheck =
      inspectLiquidity(
        liquidity,
      );

    if (
      !liquidityCheck
        .passed
    ) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .LIQUIDITY_BLOCK,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          liquidityCheck
            .reason,
        ],

        checks: {
          engineHealth,

          liquidity:
            liquidityCheck,
        },
      });
    }

    /**
     * ======================================================
     * RISK / REWARD
     * ======================================================
     */

    const riskRewardCheck =
      inspectRiskReward({
        riskReward,

        side,
      });

    if (
      !riskRewardCheck
        .passed
    ) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .RISK_REWARD_BLOCK,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          riskRewardCheck
            .reason,
        ],

        checks: {
          engineHealth,

          liquidity:
            liquidityCheck,

          riskReward:
            riskRewardCheck,
        },
      });
    }

    /**
     * ======================================================
     * CONSENSUS
     * ======================================================
     */

    const consensusCheck =
      inspectConsensus({
        consensus,

        side,

        config,
      });

    if (
      !consensusCheck
        .passed
    ) {
      return buildBlockedResult({
        symbol,

        status:
          DECISION_STATUS
            .CONSENSUS_CONFLICT,

        side,

        score,

        longScore,

        shortScore,

        reasons: [
          consensusCheck
            .reason,
        ],

        checks: {
          engineHealth,

          liquidity:
            liquidityCheck,

          riskReward:
            riskRewardCheck,

          consensus:
            consensusCheck,
        },
      });
    }

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    const warnings = [];

    if (
      liquidityCheck
        .reduceSize
    ) {
      warnings.push(
        "Liquidity engine recommends reducing position size.",
      );
    }

    if (
      consensusCheck
        .warning
    ) {
      warnings.push(
        consensusCheck
          .warning,
      );
    }

    /**
     * ======================================================
     * APPROVED FOR RISK MANAGER
     * ======================================================
     *
     * IMPORTANT:
     *
     * This still does NOT mean BUY or SELL.
     *
     * It means:
     *
     * "The opportunity may now be evaluated
     *  by tradeRiskManager.js."
     */

    return {
      approved: true,

      engine:
        "TRADE_DECISION_GATE",

      status:
        DECISION_STATUS
          .APPROVED_FOR_RISK,

      symbol,

      decision:
        "PROCEED_TO_RISK_MANAGER",

      canProceedToRiskManager:
        true,

      side,

      score:
        round(
          score,
        ),

      longScore:
        round(
          longScore,
        ),

      shortScore:
        round(
          shortScore,
        ),

      scoreDifference:
        round(
          scoreDifference,
        ),

      tradeGeometry: {
        entryPrice:
          riskRewardCheck
            .entryPrice,

        stopPrice:
          riskRewardCheck
            .stopPrice,

        targetPrice:
          riskRewardCheck
            .targetPrice,

        rewardRiskRatio:
          riskRewardCheck
            .rewardRiskRatio,
      },

      execution: {
        decision:
          liquidity
            ?.executionDecision ??
          null,

        reduceSize:
          liquidityCheck
            .reduceSize ===
          true,

        quality:
          liquidity
            ?.liquidityStatus ??
          null,

        qualityScore:
          liquidity
            ?.qualityScore ??
          null,
      },

      checks: {
        score: true,

        direction: true,

        ambiguity: true,

        eventFreeze: true,

        engineHealth,

        liquidity:
          liquidityCheck,

        riskReward:
          riskRewardCheck,

        consensus:
          consensusCheck,
      },

      warnings,

      reasons: [],

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
        "TRADE_DECISION_GATE",

      status:
        DECISION_STATUS.ERROR,

      symbol,

      decision:
        "NO_TRADE",

      canProceedToRiskManager:
        false,

      side: null,

      score: 0,

      reasons: [
        "Decision gate failed. New trade must remain blocked.",
      ],

      warnings: [],

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

export default evaluateTradeDecision;