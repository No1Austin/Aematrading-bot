const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, min = 0, max = 100) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return min;
  }

  return Math.min(max, Math.max(min, n));
};

const clamp01 = (value) =>
  clamp(value, 0, 1);

const round = (value, places = 2) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  const factor = 10 ** places;

  return Math.round(n * factor) / factor;
};

const upper = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

export const CRYPTO_POSITION_ACTION =
  Object.freeze({
    HOLD: "HOLD",

    ADD_EXPOSURE: "ADD_EXPOSURE",

    REDUCE_EXPOSURE: "REDUCE_EXPOSURE",

    TIGHTEN_STOP: "TIGHTEN_STOP",

    MOVE_STOP_TO_BREAKEVEN:
      "MOVE_STOP_TO_BREAKEVEN",

    TRAIL_PROFIT: "TRAIL_PROFIT",

    EXIT: "EXIT",

    EMERGENCY_EXIT:
      "EMERGENCY_EXIT",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

export const DEFAULT_POSITION_MONITOR_POLICY =
  Object.freeze({
    /**
     * Thesis deterioration.
     */
    warningDeterioration:
      10,

    reductionDeterioration:
      20,

    severeDeterioration:
      32,

    /**
     * Direction reversal.
     */
    reversalSupportThreshold:
      58,

    strongReversalSupportThreshold:
      68,

    minimumReversalEngines:
      2,

    emergencyReversalEngines:
      3,

    /**
     * Position exposure.
     */
    normalExposure:
      1,

    reducedExposure:
      0.65,

    defensiveExposure:
      0.35,

    /**
     * Profit management.
     */
    breakevenTriggerR:
      1,

    trailingTriggerR:
      1.5,

    strongProfitTriggerR:
      2,

    /**
     * Drawdown protection.
     */
    warningAdverseR:
      -0.6,

    severeAdverseR:
      -0.9,

    /**
     * Volatility.
     */
    highVolatility:
      75,

    extremeVolatility:
      90,

    /**
     * Thesis strengthening.
     */
    addExposureMinimumImprovement:
      8,

    addExposureMinimumCurrentSupport:
      72,

    /**
     * Do not pyramid weak positions.
     */
    minimumProfitForAddR:
      0.25,
  });

function normalizeEngineResult(
  result,
  positionDirection,
) {
  if (!result) {
    return null;
  }

  const direction =
    upper(
      result.direction ??
      result.preferredDirection,
    );

  const longSupport =
    finite(
      result.longSupport ??
      result.long,
    );

  const shortSupport =
    finite(
      result.shortSupport ??
      result.short,
    );

  const confidence =
    finite(
      result.confidence,
    );

  let directionalSupport =
    null;

  let opposingSupport =
    null;

  if (
    positionDirection === "LONG"
  ) {
    directionalSupport =
      longSupport;

    opposingSupport =
      shortSupport;
  } else if (
    positionDirection === "SHORT"
  ) {
    directionalSupport =
      shortSupport;

    opposingSupport =
      longSupport;
  }

  return {
    direction,

    directionalSupport:
      directionalSupport === null
        ? null
        : clamp(
            directionalSupport,
          ),

    opposingSupport:
      opposingSupport === null
        ? null
        : clamp(
            opposingSupport,
          ),

    confidence:
      confidence === null
        ? null
        : clamp01(
            confidence,
          ),
  };
}

function engineSnapshot(
  engines = {},
  positionDirection,
) {
  const output = {};

  for (
    const [key, value]
    of Object.entries(
      engines ?? {},
    )
  ) {
    const normalized =
      normalizeEngineResult(
        value,
        positionDirection,
      );

    if (normalized) {
      output[key] =
        normalized;
    }
  }

  return output;
}

function calculateThesis(
  snapshot,
) {
  const values =
    Object.values(
      snapshot,
    );

  const usable =
    values.filter(
      (result) =>
        result
          .directionalSupport !==
          null &&
        result
          .opposingSupport !==
          null,
    );

  if (!usable.length) {
    return {
      support: null,
      opposition: null,
      net: null,
      availableEngines: 0,
    };
  }

  let supportTotal = 0;
  let oppositionTotal = 0;
  let weightTotal = 0;

  for (
    const result
    of usable
  ) {
    const confidence =
      result.confidence ??
      0.7;

    supportTotal +=
      result.directionalSupport *
      confidence;

    oppositionTotal +=
      result.opposingSupport *
      confidence;

    weightTotal +=
      confidence;
  }

  if (!weightTotal) {
    return {
      support: null,
      opposition: null,
      net: null,
      availableEngines:
        usable.length,
    };
  }

  const support =
    supportTotal /
    weightTotal;

  const opposition =
    oppositionTotal /
    weightTotal;

  return {
    support:
      round(support),

    opposition:
      round(opposition),

    net:
      round(
        support -
        opposition,
      ),

    availableEngines:
      usable.length,
  };
}

function compareEngines(
  entrySnapshot,
  currentSnapshot,
  policy,
) {
  const comparisons = [];

  let deteriorationTotal = 0;
  let deteriorationCount = 0;

  let improvementTotal = 0;
  let improvementCount = 0;

  let reversedEngines = 0;
  let stronglyReversedEngines = 0;

  for (
    const [
      key,
      current,
    ]
    of Object.entries(
      currentSnapshot,
    )
  ) {
    const entry =
      entrySnapshot[
        key
      ];

    if (!entry) {
      continue;
    }

    const entrySupport =
      finite(
        entry.directionalSupport,
      );

    const currentSupport =
      finite(
        current.directionalSupport,
      );

    const opposingSupport =
      finite(
        current.opposingSupport,
      );

    if (
      entrySupport === null ||
      currentSupport === null
    ) {
      continue;
    }

    const change =
      currentSupport -
      entrySupport;

    if (change < 0) {
      deteriorationTotal +=
        Math.abs(
          change,
        );

      deteriorationCount +=
        1;
    }

    if (change > 0) {
      improvementTotal +=
        change;

      improvementCount +=
        1;
    }

    const reversed =
      opposingSupport !==
        null &&
      opposingSupport >=
        policy
          .reversalSupportThreshold &&
      opposingSupport >
        currentSupport;

    const stronglyReversed =
      opposingSupport !==
        null &&
      opposingSupport >=
        policy
          .strongReversalSupportThreshold &&
      opposingSupport >
        currentSupport;

    if (reversed) {
      reversedEngines +=
        1;
    }

    if (stronglyReversed) {
      stronglyReversedEngines +=
        1;
    }

    comparisons.push({
      engine:
        key,

      entrySupport:
        round(
          entrySupport,
        ),

      currentSupport:
        round(
          currentSupport,
        ),

      opposingSupport:
        round(
          opposingSupport,
        ),

      change:
        round(
          change,
        ),

      reversed,

      stronglyReversed,
    });
  }

  return {
    comparisons,

    averageDeterioration:
      deteriorationCount
        ? round(
            deteriorationTotal /
              deteriorationCount,
          )
        : 0,

    averageImprovement:
      improvementCount
        ? round(
            improvementTotal /
              improvementCount,
          )
        : 0,

    reversedEngines,

    stronglyReversedEngines,
  };
}

function buildResult({
  action,
  direction,
  exposureMultiplier,
  urgency,
  thesis,
  comparison,
  position,
  reasons,
  warnings,
  protections,
}) {
  return {
    action,

    direction,

    exposureMultiplier:
      round(
        exposureMultiplier,
        4,
      ),

    urgency,

    thesis,

    comparison,

    position: {
      unrealizedR:
        finite(
          position?.unrealizedR,
        ),

      maximumFavorableExcursionR:
        finite(
          position
            ?.maximumFavorableExcursionR,
        ),

      maximumAdverseExcursionR:
        finite(
          position
            ?.maximumAdverseExcursionR,
        ),

      currentExposure:
        finite(
          position
            ?.currentExposure,
        ),

      minutesOpen:
        finite(
          position
            ?.minutesOpen,
        ),
    },

    protections,

    reasons: [
      ...new Set(
        reasons,
      ),
    ],

    warnings: [
      ...new Set(
        warnings,
      ),
    ],

    noExecutionAuthority:
      true,
  };
}

/**
 * ============================================================
 * AEMA CRYPTO PHASE 5.8
 * LIVE POSITION THESIS MONITOR
 * ============================================================
 *
 * The monitor DOES NOT execute.
 *
 * It compares:
 *
 * ENTRY THESIS
 *      versus
 * CURRENT THESIS
 *
 * and recommends:
 *
 * HOLD
 * ADD_EXPOSURE
 * REDUCE_EXPOSURE
 * TIGHTEN_STOP
 * MOVE_STOP_TO_BREAKEVEN
 * TRAIL_PROFIT
 * EXIT
 * EMERGENCY_EXIT
 *
 * ============================================================
 */

export function monitorCryptoPosition({
  position,
  entryEngines,
  currentEngines,
  market = {},
  policy =
    DEFAULT_POSITION_MONITOR_POLICY,
} = {}) {
  const reasons = [];
  const warnings = [];

  const protections = {
    moveStopToBreakeven:
      false,

    tightenStop:
      false,

    trailProfit:
      false,

    emergencyProtection:
      false,
  };

  if (
    !position ||
    !entryEngines ||
    !currentEngines
  ) {
    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .INSUFFICIENT_DATA,

      direction:
        "NEUTRAL",

      exposureMultiplier:
        0,

      urgency:
        "NONE",

      thesis: {},

      comparison: {},

      position:
        position ?? {},

      reasons,

      warnings: [
        "POSITION_MONITOR_DATA_MISSING",
      ],

      protections,
    });
  }

  const direction =
    upper(
      position.direction,
    );

  if (
    direction !== "LONG" &&
    direction !== "SHORT"
  ) {
    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .INSUFFICIENT_DATA,

      direction,

      exposureMultiplier:
        0,

      urgency:
        "NONE",

      thesis: {},

      comparison: {},

      position,

      reasons,

      warnings: [
        "INVALID_POSITION_DIRECTION",
      ],

      protections,
    });
  }

  const entrySnapshot =
    engineSnapshot(
      entryEngines,
      direction,
    );

  const currentSnapshot =
    engineSnapshot(
      currentEngines,
      direction,
    );

  const entryThesis =
    calculateThesis(
      entrySnapshot,
    );

  const currentThesis =
    calculateThesis(
      currentSnapshot,
    );

  const comparison =
    compareEngines(
      entrySnapshot,
      currentSnapshot,
      policy,
    );

  const unrealizedR =
    finite(
      position.unrealizedR,
    ) ?? 0;

  const mfe =
    finite(
      position
        .maximumFavorableExcursionR,
    ) ?? 0;

  const mae =
    finite(
      position
        .maximumAdverseExcursionR,
    ) ?? 0;

  const volatilityScore =
    finite(
      market.volatilityScore,
    );

  const marketStress =
    market.marketStress ===
      true ||
    market.liquidationStress ===
      true;

  let exposureMultiplier =
    clamp01(
      finite(
        position.currentExposure,
      ) ??
        policy.normalExposure,
    );

  /**
   * ==========================================================
   * 1. EMERGENCY CONDITIONS
   * ==========================================================
   */

  const emergencyReversal =
    comparison
      .stronglyReversedEngines >=
    policy
      .emergencyReversalEngines;

  const extremeVolatility =
    volatilityScore !==
      null &&
    volatilityScore >=
      policy.extremeVolatility;

  if (
    emergencyReversal ||
    (
      marketStress &&
      comparison
        .reversedEngines >=
        policy
          .minimumReversalEngines
    )
  ) {
    protections
      .emergencyProtection =
      true;

    reasons.push(
      emergencyReversal
        ? "MULTI_ENGINE_STRONG_REVERSAL"
        : "MARKET_STRESS_WITH_THESIS_REVERSAL",
    );

    if (extremeVolatility) {
      warnings.push(
        "EXTREME_VOLATILITY",
      );
    }

    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .EMERGENCY_EXIT,

      direction,

      exposureMultiplier:
        0,

      urgency:
        "IMMEDIATE",

      thesis: {
        entry:
          entryThesis,

        current:
          currentThesis,
      },

      comparison,

      position,

      reasons,

      warnings,

      protections,
    });
  }

  /**
   * ==========================================================
   * 2. THESIS INVALIDATION
   * ==========================================================
   */

  const currentNet =
  finite(
    currentThesis.net,
  );

const currentOpposition =
  finite(
    currentThesis.opposition,
  );

const thesisFlipped =
  currentNet !== null &&
  currentNet < 0;

/**
 * ==========================================================
 * THESIS INVALIDATION
 * ==========================================================
 *
 * A small negative thesis flip is NOT enough to force an exit.
 *
 * Example:
 *
 * Current support:    46
 * Current opposition: 53
 * Reversed engines:   2
 *
 * That means the original thesis is seriously weakening,
 * but it has not necessarily been completely invalidated.
 *
 * In that situation we REDUCE EXPOSURE.
 *
 * We EXIT only when the reversal becomes broad or strongly
 * confirmed across the engine stack.
 */

const broadReversal =
  comparison.reversedEngines >= 3;

const strongMultiEngineReversal =
  comparison.stronglyReversedEngines >= 2;

const overwhelmingOpposition =
  currentOpposition !== null &&
  currentOpposition >=
    policy.strongReversalSupportThreshold &&
  currentOpposition >
    (
      currentThesis.support ??
      0
    ) +
      12;

if (
  thesisFlipped &&
  (
    broadReversal ||
    strongMultiEngineReversal ||
    overwhelmingOpposition
  )
) {
  reasons.push(
    "ORIGINAL_DIRECTIONAL_THESIS_INVALIDATED",
  );

  return buildResult({
    action:
      CRYPTO_POSITION_ACTION.EXIT,

    direction,

    exposureMultiplier:
      0,

    urgency:
      "HIGH",

    thesis: {
      entry:
        entryThesis,

      current:
        currentThesis,
    },

    comparison,

    position,

    reasons,

    warnings,

    protections,
  });
}

/**
 * A modest thesis flip with only limited engine reversal is
 * handled defensively instead of immediately exiting.
 */

if (
  thesisFlipped &&
  comparison.reversedEngines >=
    policy.minimumReversalEngines
) {
  warnings.push(
    "THESIS_DIRECTION_BEGINNING_TO_FLIP",
  );

  reasons.push(
    "PARTIAL_DIRECTIONAL_REVERSAL",
  );
}
  /**
   * ==========================================================
   * 3. SEVERE ADVERSE MOVEMENT
   * ==========================================================
   */

  if (
    unrealizedR <=
      policy.severeAdverseR ||
    mae <=
      policy.severeAdverseR
  ) {
    if (
      comparison
        .averageDeterioration >=
      policy
        .warningDeterioration
    ) {
      reasons.push(
        "ADVERSE_MOVE_WITH_THESIS_DETERIORATION",
      );

      return buildResult({
        action:
          CRYPTO_POSITION_ACTION
            .EXIT,

        direction,

        exposureMultiplier:
          0,

        urgency:
          "HIGH",

        thesis: {
          entry:
            entryThesis,

          current:
            currentThesis,
        },

        comparison,

        position,

        reasons,

        warnings,

        protections,
      });
    }

    warnings.push(
      "SEVERE_ADVERSE_PRICE_MOVEMENT",
    );
  }

  /**
   * ==========================================================
   * 4. EXPOSURE REDUCTION
   * ==========================================================
   */

  if (
    comparison
      .averageDeterioration >=
      policy
        .reductionDeterioration ||
    comparison
      .reversedEngines >=
      policy
        .minimumReversalEngines
  ) {
    exposureMultiplier =
      Math.min(
        exposureMultiplier,
        policy.reducedExposure,
      );

    reasons.push(
      "ENTRY_THESIS_WEAKENING",
    );

    if (
      comparison
        .reversedEngines > 0
    ) {
      warnings.push(
        "DIRECTIONAL_ENGINE_REVERSAL",
      );
    }

    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .REDUCE_EXPOSURE,

      direction,

      exposureMultiplier,

      urgency:
        "MEDIUM",

      thesis: {
        entry:
          entryThesis,

        current:
          currentThesis,
      },

      comparison,

      position,

      reasons,

      warnings,

      protections,
    });
  }

  /**
   * ==========================================================
   * 5. HIGH VOLATILITY DEFENSIVE MODE
   * ==========================================================
   */

  if (
    volatilityScore !==
      null &&
    volatilityScore >=
      policy.highVolatility
  ) {
    exposureMultiplier =
      Math.min(
        exposureMultiplier,
        policy.defensiveExposure,
      );

    protections.tightenStop =
      true;

    reasons.push(
      "HIGH_VOLATILITY_DEFENSIVE_MODE",
    );

    warnings.push(
      "VOLATILITY_EXPANSION",
    );

    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .REDUCE_EXPOSURE,

      direction,

      exposureMultiplier,

      urgency:
        "MEDIUM",

      thesis: {
        entry:
          entryThesis,

        current:
          currentThesis,
      },

      comparison,

      position,

      reasons,

      warnings,

      protections,
    });
  }

  /**
   * ==========================================================
   * 6. PROFIT PROTECTION
   * ==========================================================
   */

  if (
    unrealizedR >=
      policy.trailingTriggerR ||
    mfe >=
      policy.strongProfitTriggerR
  ) {
    protections.trailProfit =
      true;

    protections.tightenStop =
      true;

    reasons.push(
      "PROFIT_PROTECTION_ACTIVE",
    );

    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .TRAIL_PROFIT,

      direction,

      exposureMultiplier,

      urgency:
        "NORMAL",

      thesis: {
        entry:
          entryThesis,

        current:
          currentThesis,
      },

      comparison,

      position,

      reasons,

      warnings,

      protections,
    });
  }

  if (
    unrealizedR >=
      policy.breakevenTriggerR
  ) {
    protections
      .moveStopToBreakeven =
      true;

    reasons.push(
      "BREAKEVEN_PROTECTION_AVAILABLE",
    );

    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .MOVE_STOP_TO_BREAKEVEN,

      direction,

      exposureMultiplier,

      urgency:
        "NORMAL",

      thesis: {
        entry:
          entryThesis,

        current:
          currentThesis,
      },

      comparison,

      position,

      reasons,

      warnings,

      protections,
    });
  }

  /**
   * ==========================================================
   * 7. MILD DETERIORATION
   * ==========================================================
   */

  if (
    comparison
      .averageDeterioration >=
    policy
      .warningDeterioration
  ) {
    protections.tightenStop =
      true;

    reasons.push(
      "THESIS_MILDLY_WEAKENING",
    );

    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .TIGHTEN_STOP,

      direction,

      exposureMultiplier,

      urgency:
        "LOW",

      thesis: {
        entry:
          entryThesis,

        current:
          currentThesis,
      },

      comparison,

      position,

      reasons,

      warnings,

      protections,
    });
  }

  /**
   * ==========================================================
   * 8. ADD EXPOSURE
   * ==========================================================
   */

  if (
    comparison
      .averageImprovement >=
      policy
        .addExposureMinimumImprovement &&
    currentThesis.support >=
      policy
        .addExposureMinimumCurrentSupport &&
    unrealizedR >=
      policy.minimumProfitForAddR &&
    comparison
      .reversedEngines ===
      0
  ) {
    reasons.push(
      "THESIS_STRENGTHENING",
    );

    return buildResult({
      action:
        CRYPTO_POSITION_ACTION
          .ADD_EXPOSURE,

      direction,

      exposureMultiplier:
        1,

      urgency:
        "NORMAL",

      thesis: {
        entry:
          entryThesis,

        current:
          currentThesis,
      },

      comparison,

      position,

      reasons,

      warnings,

      protections,
    });
  }

  /**
   * ==========================================================
   * 9. NORMAL HOLD
   * ==========================================================
   */

  reasons.push(
    "ENTRY_THESIS_REMAINS_VALID",
  );

  return buildResult({
    action:
      CRYPTO_POSITION_ACTION
        .HOLD,

    direction,

    exposureMultiplier,

    urgency:
      "NONE",

    thesis: {
      entry:
        entryThesis,

      current:
        currentThesis,
    },

    comparison,

    position,

    reasons,

    warnings,

    protections,
  });
}

export default monitorCryptoPosition;