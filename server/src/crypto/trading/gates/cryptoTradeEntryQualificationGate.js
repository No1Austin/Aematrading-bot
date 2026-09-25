const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (
  value,
  min = 0,
  max = 1,
) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.min(
    max,
    Math.max(
      min,
      n,
    ),
  );
};

const clamp100 = (value) =>
  Math.min(
    100,
    Math.max(
      0,
      Number(value) || 0,
    ),
  );

const round = (
  value,
  places = 2,
) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  const factor =
    10 ** places;

  return (
    Math.round(
      n * factor,
    ) / factor
  );
};

export const CRYPTO_ENTRY_STATE =
  Object.freeze({
    ENTRY_ALLOWED:
      "ENTRY_ALLOWED",

    ENTRY_ALLOWED_REDUCED:
      "ENTRY_ALLOWED_REDUCED",

    WAIT_FOR_CONFIRMATION:
      "WAIT_FOR_CONFIRMATION",

    NO_TRADE_CONFLICT:
      "NO_TRADE_CONFLICT",

    NO_TRADE_RISK:
      "NO_TRADE_RISK",

    NO_TRADE_EXECUTION:
      "NO_TRADE_EXECUTION",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

export const DEFAULT_CRYPTO_ENTRY_POLICY =
  Object.freeze({
    /**
     * Directional conviction.
     */
    minimumDirectionalScore:
      48,

    minimumStrongDirectionalScore:
      62,

    minimumSeparation:
      10,

    minimumStrongSeparation:
      18,

    minimumConfidence:
      0.48,

    minimumStrongConfidence:
      0.62,

    /**
     * Minimum engine support.
     */
    minimumAvailableEngines:
      3,

    /**
     * Risk / reward.
     */
    minimumRiskReward:
      1.35,

    preferredRiskReward:
      1.8,

    /**
     * Execution quality.
     */
    maximumSpreadPercent:
      0.35,

    warningSpreadPercent:
      0.20,

    minimumLiquidityScore:
      45,

    preferredLiquidityScore:
      65,

    /**
     * Futures entry evidence is fail-closed.
     * Missing execution/risk evidence must never receive a neutral score.
     */
    requireSpreadEvidence:
      true,

    requireLiquidityEvidence:
      true,

    requireRiskRewardEvidence:
      true,

    requireStopDistanceEvidence:
      true,

    /**
     * Volatility.
     *
     * These values assume an input normalized 0–100.
     */
    extremeVolatilityThreshold:
      90,

    highVolatilityThreshold:
      72,

    /**
     * Invalidation distance.
     */
    maximumStopDistancePercent:
      8,

    preferredMaximumStopDistancePercent:
      5,

    /**
     * Position adjustment.
     */
    reducedExposureFactor:
      0.65,

    weakConfirmationFactor:
      0.75,

    highVolatilityFactor:
      0.70,

    executionWarningFactor:
      0.80,

    /**
     * Never allow gate-derived exposure below this for an
     * ENTRY_ALLOWED_REDUCED result.
     */
    minimumReducedExposure:
      0.25,
  });

function getWinnerScore(
  decision,
) {
  const direction =
    decision?.preferredDirection;

  if (
    direction ===
    "LONG"
  ) {
    return finite(
      decision?.scores?.long,
    );
  }

  if (
    direction ===
    "SHORT"
  ) {
    return finite(
      decision?.scores?.short,
    );
  }

  return null;
}

function normalizeExecution(
  execution = {},
) {
  return {
    spreadPercent:
      finite(
        execution?.spreadPercent,
      ),

    liquidityScore:
      finite(
        execution?.liquidityScore,
      ),

    slippageEstimatePercent:
      finite(
        execution?.slippageEstimatePercent,
      ),

    venueHealthy:
      execution?.venueHealthy !==
      false,

    orderBookHealthy:
      execution?.orderBookHealthy !==
      false,
  };
}

function normalizeRisk(
  risk = {},
) {
  return {
    riskReward:
      finite(
        risk?.riskReward,
      ),

    stopDistancePercent:
      finite(
        risk?.stopDistancePercent,
      ),

    targetDistancePercent:
      finite(
        risk?.targetDistancePercent,
      ),

    volatilityScore:
      finite(
        risk?.volatilityScore,
      ),

    liquidationDistancePercent:
      finite(
        risk?.liquidationDistancePercent,
      ),
  };
}

/**
 * ============================================================
 * AEMA CRYPTO PHASE 5.7
 * ENTRY QUALIFICATION / TRADE GATE
 * ============================================================
 *
 * INPUT
 *
 * decision:
 *   Phase 5.6 directional decision coordinator output
 *
 * execution:
 *   spread / liquidity / venue conditions
 *
 * risk:
 *   risk-reward, stop distance, volatility
 *
 * OUTPUT
 *
 * ENTRY_ALLOWED
 * ENTRY_ALLOWED_REDUCED
 * WAIT_FOR_CONFIRMATION
 * NO_TRADE_CONFLICT
 * NO_TRADE_RISK
 * NO_TRADE_EXECUTION
 * INSUFFICIENT_DATA
 *
 * IMPORTANT
 *
 * This gate has NO execution authority.
 */

export function qualifyCryptoTradeEntry({
  decision,
  execution = {},
  risk = {},
  policy =
    DEFAULT_CRYPTO_ENTRY_POLICY,
} = {}) {
  const reasons = [];
  const warnings = [];
  const blockers = [];

  if (!decision) {
    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .INSUFFICIENT_DATA,

      direction:
        "NEUTRAL",

      exposureMultiplier:
        0,

      reasons: [],

      warnings: [],

      blockers: [
        "DECISION_REQUIRED",
      ],

      noExecutionAuthority:
        true,
    };
  }

  const direction =
    decision?.preferredDirection ??
    "NEUTRAL";

  const winnerScore =
    getWinnerScore(
      decision,
    );

  const separation =
    finite(
      decision?.scores?.separation,
    );

  const confidence =
    finite(
      decision
        ?.consensus
        ?.confidence,
    );

  const availableEngines =
    finite(
      decision
        ?.consensus
        ?.availableEngines,
    );

  const coordinatorExposure =
    clamp(
      finite(
        decision
          ?.risk
          ?.exposureMultiplier,
      ) ??
        1,
      0,
      1,
    );

  const exec =
    normalizeExecution(
      execution,
    );

  const tradeRisk =
    normalizeRisk(
      risk,
    );

  /**
   * ----------------------------------------------------------
   * BASIC DECISION VALIDATION
   * ----------------------------------------------------------
   */

  if (
    decision?.status ===
      "INSUFFICIENT_DATA" ||
    availableEngines === null ||
    availableEngines <
      policy.minimumAvailableEngines
  ) {
    blockers.push(
      "INSUFFICIENT_DIRECTIONAL_ENGINES",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .INSUFFICIENT_DATA,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  if (
    direction !== "LONG" &&
    direction !== "SHORT"
  ) {
    blockers.push(
      "NO_DIRECTIONAL_CANDIDATE",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .NO_TRADE_CONFLICT,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  if (
    decision?.tradeable !==
    true
  ) {
    blockers.push(
      decision?.decisionReason ??
      "COORDINATOR_NOT_TRADEABLE",
    );

    return {
      approved: false,

      state:
        decision?.decision ===
        "NO_TRADE_RISK"
          ? CRYPTO_ENTRY_STATE
              .NO_TRADE_RISK
          : CRYPTO_ENTRY_STATE
              .NO_TRADE_CONFLICT,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  /**
   * ----------------------------------------------------------
   * DIRECTIONAL QUALITY
   * ----------------------------------------------------------
   */

  if (
    winnerScore === null ||
    separation === null ||
    confidence === null
  ) {
    blockers.push(
      "DIRECTIONAL_METRICS_MISSING",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .INSUFFICIENT_DATA,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  if (
    winnerScore <
    policy.minimumDirectionalScore
  ) {
    blockers.push(
      "DIRECTIONAL_SCORE_TOO_LOW",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .WAIT_FOR_CONFIRMATION,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  if (
    separation <
    policy.minimumSeparation
  ) {
    blockers.push(
      "LONG_SHORT_SEPARATION_TOO_SMALL",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .NO_TRADE_CONFLICT,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  if (
    confidence <
    policy.minimumConfidence
  ) {
    blockers.push(
      "CONFIDENCE_TOO_LOW",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .WAIT_FOR_CONFIRMATION,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  /**
   * ----------------------------------------------------------
   * EXECUTION CONDITIONS
   * ----------------------------------------------------------
   */

  if (
    policy.requireSpreadEvidence === true &&
    exec.spreadPercent === null
  ) {
    blockers.push(
      "SPREAD_EVIDENCE_REQUIRED",
    );
  }

  if (
    policy.requireLiquidityEvidence === true &&
    exec.liquidityScore === null
  ) {
    blockers.push(
      "LIQUIDITY_EVIDENCE_REQUIRED",
    );
  }

  if (
    blockers.some(
      blocker =>
        [
          "SPREAD_EVIDENCE_REQUIRED",
          "LIQUIDITY_EVIDENCE_REQUIRED",
        ].includes(
          blocker,
        ),
    )
  ) {
    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .INSUFFICIENT_DATA,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  if (
    exec.venueHealthy ===
    false
  ) {
    blockers.push(
      "VENUE_UNHEALTHY",
    );
  }

  if (
    exec.orderBookHealthy ===
    false
  ) {
    blockers.push(
      "ORDER_BOOK_UNHEALTHY",
    );
  }

  if (
    exec.spreadPercent !==
      null &&
    exec.spreadPercent >
      policy.maximumSpreadPercent
  ) {
    blockers.push(
      "SPREAD_TOO_WIDE",
    );
  }

  if (
    exec.liquidityScore !==
      null &&
    exec.liquidityScore <
      policy.minimumLiquidityScore
  ) {
    blockers.push(
      "LIQUIDITY_TOO_WEAK",
    );
  }

  if (
    blockers.some(
      blocker =>
        [
          "VENUE_UNHEALTHY",
          "ORDER_BOOK_UNHEALTHY",
          "SPREAD_TOO_WIDE",
          "LIQUIDITY_TOO_WEAK",
        ].includes(
          blocker,
        ),
    )
  ) {
    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .NO_TRADE_EXECUTION,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  /**
   * ----------------------------------------------------------
   * RISK / REWARD
   * ----------------------------------------------------------
   */

  if (
    policy.requireRiskRewardEvidence === true &&
    tradeRisk.riskReward === null
  ) {
    blockers.push(
      "RISK_REWARD_EVIDENCE_REQUIRED",
    );
  }

  if (
    policy.requireStopDistanceEvidence === true &&
    tradeRisk.stopDistancePercent === null
  ) {
    blockers.push(
      "STOP_DISTANCE_EVIDENCE_REQUIRED",
    );
  }

  if (blockers.length > 0) {
    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .INSUFFICIENT_DATA,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  if (
    tradeRisk.riskReward !==
      null &&
    tradeRisk.riskReward <
      policy.minimumRiskReward
  ) {
    blockers.push(
      "RISK_REWARD_TOO_LOW",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .NO_TRADE_RISK,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  /**
   * Stop distance.
   */

  if (
    tradeRisk.stopDistancePercent !==
      null &&
    tradeRisk.stopDistancePercent >
      policy.maximumStopDistancePercent
  ) {
    blockers.push(
      "STOP_DISTANCE_TOO_WIDE",
    );

    return {
      approved: false,

      state:
        CRYPTO_ENTRY_STATE
          .NO_TRADE_RISK,

      direction,

      exposureMultiplier:
        0,

      reasons,

      warnings,

      blockers,

      noExecutionAuthority:
        true,
    };
  }

  /**
   * ----------------------------------------------------------
   * EXTREME VOLATILITY
   * ----------------------------------------------------------
   */

  if (
    tradeRisk.volatilityScore !==
      null &&
    tradeRisk.volatilityScore >=
      policy.extremeVolatilityThreshold
  ) {
    warnings.push(
      "EXTREME_VOLATILITY",
    );
  }

  /**
   * ----------------------------------------------------------
   * BUILD EXPOSURE
   * ----------------------------------------------------------
   */

  let exposureMultiplier =
    coordinatorExposure;

  let reduced =
    false;

  /**
   * Moderate directional setup.
   */

  if (
    winnerScore <
      policy.minimumStrongDirectionalScore ||
    separation <
      policy.minimumStrongSeparation ||
    confidence <
      policy.minimumStrongConfidence
  ) {
    exposureMultiplier *=
      policy.weakConfirmationFactor;

    reduced =
      true;

    warnings.push(
      "MODERATE_DIRECTIONAL_CONVICTION",
    );
  }

  /**
   * Counter-market / dependency risk is already reflected by the
   * coordinator exposure multiplier.
   */

  if (
    decision
      ?.risk
      ?.risks
      ?.includes(
        "BTC_ETH_CONTEXT_CONFLICT",
      )
  ) {
    warnings.push(
      "SYSTEMIC_CONTEXT_CONFLICT",
    );

    reduced =
      true;
  }

  /**
   * High volatility.
   */

  if (
    tradeRisk.volatilityScore !==
      null &&
    tradeRisk.volatilityScore >=
      policy.highVolatilityThreshold
  ) {
    exposureMultiplier *=
      policy.highVolatilityFactor;

    reduced =
      true;

    warnings.push(
      "HIGH_VOLATILITY_EXPOSURE_REDUCTION",
    );
  }

  /**
   * Spread warning.
   */

  if (
    exec.spreadPercent !==
      null &&
    exec.spreadPercent >
      policy.warningSpreadPercent
  ) {
    exposureMultiplier *=
      policy.executionWarningFactor;

    reduced =
      true;

    warnings.push(
      "SPREAD_ELEVATED",
    );
  }

  /**
   * Liquidity not bad enough to reject, but not ideal.
   */

  if (
    exec.liquidityScore !==
      null &&
    exec.liquidityScore <
      policy.preferredLiquidityScore
  ) {
    exposureMultiplier *=
      policy.executionWarningFactor;

    reduced =
      true;

    warnings.push(
      "LIQUIDITY_BELOW_PREFERRED",
    );
  }

  /**
   * Risk/reward adequate, but not preferred.
   */

  if (
    tradeRisk.riskReward !==
      null &&
    tradeRisk.riskReward <
      policy.preferredRiskReward
  ) {
    exposureMultiplier *=
      0.90;

    reduced =
      true;

    warnings.push(
      "RISK_REWARD_ACCEPTABLE_NOT_IDEAL",
    );
  }

  /**
   * Wider-than-preferred stop.
   */

  if (
    tradeRisk.stopDistancePercent !==
      null &&
    tradeRisk.stopDistancePercent >
      policy.preferredMaximumStopDistancePercent
  ) {
    exposureMultiplier *=
      0.85;

    reduced =
      true;

    warnings.push(
      "STOP_DISTANCE_ABOVE_PREFERRED",
    );
  }

  exposureMultiplier =
    clamp(
      exposureMultiplier,
      0,
      1,
    );

  /**
   * If exposure has been heavily reduced, we still allow the
   * trade as long as the gate conditions passed.
   */

  if (
    reduced
  ) {
    exposureMultiplier =
      Math.max(
        policy.minimumReducedExposure,
        exposureMultiplier,
      );
  }

  /**
   * ----------------------------------------------------------
   * ENTRY QUALITY SCORE
   * ----------------------------------------------------------
   */

  const directionalQuality =
    clamp100(
      winnerScore,
    ) /
    100;

  const separationQuality =
    clamp(
      separation /
        35,
      0,
      1,
    );

  const confidenceQuality =
    clamp(
      confidence,
      0,
      1,
    );

  const riskRewardQuality =
    tradeRisk.riskReward === null
      ? 0
      : clamp(
          tradeRisk.riskReward /
            2.5,
          0,
          1,
        );

  const liquidityQuality =
    exec.liquidityScore === null
      ? 0
      : clamp(
          exec.liquidityScore /
            100,
          0,
          1,
        );

  const entryQuality =
    (
      directionalQuality *
        0.30 +

      separationQuality *
        0.20 +

      confidenceQuality *
        0.20 +

      riskRewardQuality *
        0.15 +

      liquidityQuality *
        0.15
    ) *
    100;

  reasons.push(
    "DIRECTIONAL_CANDIDATE_APPROVED",
  );

  if (
    tradeRisk.riskReward !==
      null
  ) {
    reasons.push(
      "RISK_REWARD_ACCEPTABLE",
    );
  }

  if (
    exec.liquidityScore !==
      null
  ) {
    reasons.push(
      "EXECUTION_LIQUIDITY_ACCEPTABLE",
    );
  }

  return {
    approved:
      true,

    state:
      reduced
        ? CRYPTO_ENTRY_STATE
            .ENTRY_ALLOWED_REDUCED
        : CRYPTO_ENTRY_STATE
            .ENTRY_ALLOWED,

    direction,

    entryQuality:
      round(
        entryQuality,
      ),

    exposureMultiplier:
      round(
        exposureMultiplier,
        4,
      ),

    metrics: {
      directionalScore:
        round(
          winnerScore,
        ),

      separation:
        round(
          separation,
        ),

      confidence:
        round(
          confidence,
          4,
        ),

      availableEngines,

      riskReward:
        tradeRisk.riskReward,

      stopDistancePercent:
        tradeRisk.stopDistancePercent,

      targetDistancePercent:
        tradeRisk.targetDistancePercent,

      volatilityScore:
        tradeRisk.volatilityScore,

      spreadPercent:
        exec.spreadPercent,

      liquidityScore:
        exec.liquidityScore,

      slippageEstimatePercent:
        exec.slippageEstimatePercent,
    },

    reasons:
      [
        ...new Set(
          reasons,
        ),
      ],

    warnings:
      [
        ...new Set(
          warnings,
        ),
      ],

    blockers:
      [],

    noExecutionAuthority:
      true,
  };
}

export default qualifyCryptoTradeEntry;