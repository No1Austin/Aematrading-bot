/**
 * AEMA CRYPTO
 * PHASE 5.10
 *
 * DYNAMIC STOP & PROFIT PROTECTION MANAGER
 *
 * PURPOSE
 * -------
 * Manages stop evolution after a futures position is open.
 *
 * Supports:
 * - initial stop
 * - breakeven
 * - trailing stop
 * - aggressive trailing
 * - profit locking
 * - thesis deterioration tightening
 * - volatility-aware protection
 *
 * IMPORTANT
 * ---------
 * This module DOES NOT execute or modify orders.
 * It only calculates the stop instruction that an execution
 * layer may later consume.
 */

const finite = (value) => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
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

const round = (
  value,
  places = 6,
) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  const factor =
    10 ** places;

  return (
    Math.round(
      n * factor,
    ) / factor
  );
};

const directionOf = (
  value,
) => {
  const direction =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return null;
};

export const CRYPTO_STOP_MODE =
  Object.freeze({
    INITIAL:
      "INITIAL",

    HOLD:
      "HOLD",

    TIGHTENED:
      "TIGHTENED",

    BREAKEVEN:
      "BREAKEVEN",

    TRAILING:
      "TRAILING",

    AGGRESSIVE_TRAILING:
      "AGGRESSIVE_TRAILING",

    PROFIT_LOCK:
      "PROFIT_LOCK",

    EXIT:
      "EXIT",

    EMERGENCY:
      "EMERGENCY",
  });

export const DEFAULT_DYNAMIC_STOP_POLICY =
  Object.freeze({
    /**
     * Breakeven begins once the position
     * has achieved 1R.
     */

    breakevenTriggerR:
      1,

    /**
     * Small positive cushion after moving
     * to breakeven.
     *
     * 0.05R avoids moving exactly to entry.
     */

    breakevenCushionR:
      0.05,

    /**
     * Standard trailing starts here.
     */

    trailingTriggerR:
      1.5,

    /**
     * More aggressive profit locking.
     */

    aggressiveTrailingTriggerR:
      2.5,

    /**
     * Strong profit protection.
     */

    profitLockTriggerR:
      3.5,

    /**
     * Trailing distances expressed in R.
     */

    normalTrailingDistanceR:
      1,

    aggressiveTrailingDistanceR:
      0.65,

    profitLockDistanceR:
      0.45,

    /**
     * Thesis deterioration tightening.
     */

    mildDeteriorationThreshold:
      10,

    seriousDeteriorationThreshold:
      20,

    mildTighteningFactor:
      0.80,

    seriousTighteningFactor:
      0.55,

    /**
     * Volatility.
     *
     * We tighten exposure elsewhere,
     * but stops also become more defensive.
     */

    highVolatilityThreshold:
      75,

    extremeVolatilityThreshold:
      90,

    highVolatilityTighteningFactor:
      0.85,

    extremeVolatilityTighteningFactor:
      0.65,

    /**
     * Minimum profit that should be locked
     * after substantial favorable excursion.
     */

    minimumProfitLockR:
      0.5,

    /**
     * If price reaches large favorable excursion
     * and gives too much back, protect remaining gain.
     */

    givebackProtectionTriggerR:
      2,

    maximumGivebackFraction:
      0.50,
  });

function calculateRDistance({
  entryPrice,
  initialStopPrice,
}) {
  if (
    !Number.isFinite(entryPrice) ||
    !Number.isFinite(initialStopPrice)
  ) {
    return null;
  }

  const distance =
    Math.abs(
      entryPrice -
      initialStopPrice,
    );

  return distance > 0
    ? distance
    : null;
}

function stopFromR({
  direction,
  entryPrice,
  riskDistance,
  r,
}) {
  if (
    riskDistance === null ||
    !Number.isFinite(r)
  ) {
    return null;
  }

  return direction === "LONG"
    ? entryPrice +
        riskDistance *
          r
    : entryPrice -
        riskDistance *
          r;
}

/**
 * A LONG stop may only move upward.
 * A SHORT stop may only move downward.
 */

function chooseMoreProtectiveStop({
  direction,
  currentStop,
  proposedStop,
}) {
  if (
    proposedStop === null
  ) {
    return currentStop;
  }

  if (
    currentStop === null
  ) {
    return proposedStop;
  }

  if (
    direction === "LONG"
  ) {
    return Math.max(
      currentStop,
      proposedStop,
    );
  }

  return Math.min(
    currentStop,
    proposedStop,
  );
}

function calculateTrailingStop({
  direction,
  currentPrice,
  riskDistance,
  distanceR,
}) {
  if (
    !Number.isFinite(currentPrice) ||
    riskDistance === null ||
    !Number.isFinite(distanceR)
  ) {
    return null;
  }

  const distance =
    riskDistance *
    distanceR;

  return direction === "LONG"
    ? currentPrice -
        distance
    : currentPrice +
        distance;
}

function calculateExcursionGiveback({
  direction,
  entryPrice,
  currentPrice,
  highestPrice,
  lowestPrice,
  riskDistance,
}) {
  if (
    riskDistance === null ||
    riskDistance <= 0
  ) {
    return {
      mfeR: null,
      currentR: null,
      givebackFraction: null,
    };
  }

  let favorableMove =
    null;

  let currentMove =
    null;

  if (
    direction === "LONG"
  ) {
    if (
      Number.isFinite(highestPrice)
    ) {
      favorableMove =
        highestPrice -
        entryPrice;
    }

    if (
      Number.isFinite(currentPrice)
    ) {
      currentMove =
        currentPrice -
        entryPrice;
    }
  } else {
    if (
      Number.isFinite(lowestPrice)
    ) {
      favorableMove =
        entryPrice -
        lowestPrice;
    }

    if (
      Number.isFinite(currentPrice)
    ) {
      currentMove =
        entryPrice -
        currentPrice;
    }
  }

  const mfeR =
    favorableMove === null
      ? null
      : favorableMove /
        riskDistance;

  const currentR =
    currentMove === null
      ? null
      : currentMove /
        riskDistance;

  let givebackFraction =
    null;

  if (
    mfeR !== null &&
    mfeR > 0 &&
    currentR !== null
  ) {
    givebackFraction =
      Math.max(
        0,
        (
          mfeR -
          currentR
        ) /
          mfeR,
      );
  }

  return {
    mfeR:
      round(
        mfeR,
        4,
      ),

    currentR:
      round(
        currentR,
        4,
      ),

    givebackFraction:
      givebackFraction ===
        null
        ? null
        : round(
            givebackFraction,
            4,
          ),
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function updateCryptoDynamicStop({
  position,
  riskPlan,
  liveMonitor = {},
  market = {},
  policyOverrides = {},
} = {}) {
  const policy = {
    ...DEFAULT_DYNAMIC_STOP_POLICY,
    ...policyOverrides,
  };

  const direction =
    directionOf(
      position?.direction ??
      riskPlan?.direction,
    );

  const entryPrice =
    finite(
      position?.entryPrice ??
      riskPlan?.entryPrice,
    );

  const currentPrice =
    finite(
      position?.currentPrice,
    );

  const initialStopPrice =
    finite(
      riskPlan
        ?.stop
        ?.initialStopPrice,
    );

  const existingStop =
    finite(
      position?.currentStopPrice ??
      riskPlan
        ?.stop
        ?.currentStopPrice ??
      initialStopPrice,
    );

  if (
    !direction ||
    entryPrice === null ||
    currentPrice === null ||
    initialStopPrice === null
  ) {
    return {
      status:
        "INSUFFICIENT_DATA",

      mode:
        CRYPTO_STOP_MODE
          .HOLD,

      direction:
        direction ??
        "NEUTRAL",

      previousStopPrice:
        existingStop,

      stopPrice:
        existingStop,

      changed:
        false,

      reasons: [],

      warnings: [
        "DYNAMIC_STOP_INPUT_MISSING",
      ],

      noExecutionAuthority:
        true,
    };
  }

  const riskDistance =
    calculateRDistance({
      entryPrice,
      initialStopPrice,
    });

  if (
    riskDistance === null
  ) {
    return {
      status:
        "INSUFFICIENT_DATA",

      mode:
        CRYPTO_STOP_MODE
          .HOLD,

      direction,

      previousStopPrice:
        existingStop,

      stopPrice:
        existingStop,

      changed:
        false,

      reasons: [],

      warnings: [
        "INVALID_INITIAL_RISK_DISTANCE",
      ],

      noExecutionAuthority:
        true,
    };
  }

  const currentR =
    direction === "LONG"
      ? (
          currentPrice -
          entryPrice
        ) /
        riskDistance
      : (
          entryPrice -
          currentPrice
        ) /
        riskDistance;

  const unrealizedR =
    finite(
      position?.unrealizedR,
    ) ??
    currentR;

  const highestPrice =
    finite(
      position
        ?.highestPriceSinceEntry,
    );

  const lowestPrice =
    finite(
      position
        ?.lowestPriceSinceEntry,
    );

  const deterioration =
    finite(
      liveMonitor
        ?.comparison
        ?.averageDeterioration,
    ) ??
    0;

  const monitorAction =
    String(
      liveMonitor?.action ??
      "",
    )
      .trim()
      .toUpperCase();

  const volatilityScore =
    finite(
      market?.volatilityScore,
    );

  const reasons = [];
  const warnings = [];

  let proposedStop =
    existingStop;

  let mode =
    CRYPTO_STOP_MODE.HOLD;

  /**
   * ==========================================================
   * 1. EXIT / EMERGENCY OVERRIDE
   * ==========================================================
   */

  if (
    monitorAction ===
    "EMERGENCY_EXIT"
  ) {
    return {
      status:
        "STOP_PLAN_READY",

      mode:
        CRYPTO_STOP_MODE
          .EMERGENCY,

      direction,

      previousStopPrice:
        existingStop,

      stopPrice:
        existingStop,

      changed:
        false,

      currentR:
        round(
          currentR,
          4,
        ),

      reasons: [
        "LIVE_MONITOR_EMERGENCY_EXIT",
      ],

      warnings,

      noExecutionAuthority:
        true,
    };
  }

  if (
    monitorAction ===
    "EXIT"
  ) {
    return {
      status:
        "STOP_PLAN_READY",

      mode:
        CRYPTO_STOP_MODE.EXIT,

      direction,

      previousStopPrice:
        existingStop,

      stopPrice:
        existingStop,

      changed:
        false,

      currentR:
        round(
          currentR,
          4,
        ),

      reasons: [
        "LIVE_MONITOR_EXIT_REQUIRED",
      ],

      warnings,

      noExecutionAuthority:
        true,
    };
  }

  /**
   * ==========================================================
   * 2. BREAKEVEN
   * ==========================================================
   */

  if (
    unrealizedR >=
      policy.breakevenTriggerR ||
    monitorAction ===
      "MOVE_STOP_TO_BREAKEVEN"
  ) {
    const breakevenStop =
      stopFromR({
        direction,
        entryPrice,
        riskDistance,
        r:
          policy
            .breakevenCushionR,
      });

    proposedStop =
      chooseMoreProtectiveStop({
        direction,
        currentStop:
          proposedStop,
        proposedStop:
          breakevenStop,
      });

    mode =
      CRYPTO_STOP_MODE
        .BREAKEVEN;

    reasons.push(
      "BREAKEVEN_PROTECTION_ACTIVE",
    );
  }

  /**
   * ==========================================================
   * 3. STANDARD TRAILING
   * ==========================================================
   */

  if (
    unrealizedR >=
      policy.trailingTriggerR ||
    monitorAction ===
      "TRAIL_PROFIT"
  ) {
    const trail =
      calculateTrailingStop({
        direction,
        currentPrice,
        riskDistance,
        distanceR:
          policy
            .normalTrailingDistanceR,
      });

    proposedStop =
      chooseMoreProtectiveStop({
        direction,
        currentStop:
          proposedStop,
        proposedStop:
          trail,
      });

    mode =
      CRYPTO_STOP_MODE
        .TRAILING;

    reasons.push(
      "TRAILING_PROTECTION_ACTIVE",
    );
  }

  /**
   * ==========================================================
   * 4. AGGRESSIVE TRAILING
   * ==========================================================
   */

  if (
    unrealizedR >=
      policy
        .aggressiveTrailingTriggerR
  ) {
    const aggressiveTrail =
      calculateTrailingStop({
        direction,
        currentPrice,
        riskDistance,
        distanceR:
          policy
            .aggressiveTrailingDistanceR,
      });

    proposedStop =
      chooseMoreProtectiveStop({
        direction,
        currentStop:
          proposedStop,
        proposedStop:
          aggressiveTrail,
      });

    mode =
      CRYPTO_STOP_MODE
        .AGGRESSIVE_TRAILING;

    reasons.push(
      "AGGRESSIVE_TRAILING_ACTIVE",
    );
  }

  /**
   * ==========================================================
   * 5. STRONG PROFIT LOCK
   * ==========================================================
   */

  if (
    unrealizedR >=
      policy
        .profitLockTriggerR
  ) {
    const lock =
      calculateTrailingStop({
        direction,
        currentPrice,
        riskDistance,
        distanceR:
          policy
            .profitLockDistanceR,
      });

    proposedStop =
      chooseMoreProtectiveStop({
        direction,
        currentStop:
          proposedStop,
        proposedStop:
          lock,
      });

    mode =
      CRYPTO_STOP_MODE
        .PROFIT_LOCK;

    reasons.push(
      "STRONG_PROFIT_LOCK_ACTIVE",
    );
  }

  /**
   * ==========================================================
   * 6. FAVORABLE EXCURSION GIVEBACK PROTECTION
   * ==========================================================
   */

  const excursion =
    calculateExcursionGiveback({
      direction,
      entryPrice,
      currentPrice,
      highestPrice,
      lowestPrice,
      riskDistance,
    });

  if (
    excursion.mfeR !== null &&
    excursion.mfeR >=
      policy
        .givebackProtectionTriggerR &&
    excursion
      .givebackFraction !==
      null &&
    excursion
      .givebackFraction >=
      policy
        .maximumGivebackFraction
  ) {
    const minimumLockedR =
      Math.max(
        policy.minimumProfitLockR,
        excursion.mfeR *
          (
            1 -
            policy
              .maximumGivebackFraction
          ),
      );

    const lockStop =
      stopFromR({
        direction,
        entryPrice,
        riskDistance,
        r:
          minimumLockedR,
      });

    proposedStop =
      chooseMoreProtectiveStop({
        direction,
        currentStop:
          proposedStop,
        proposedStop:
          lockStop,
      });

    mode =
      CRYPTO_STOP_MODE
        .PROFIT_LOCK;

    reasons.push(
      "FAVORABLE_EXCURSION_GIVEBACK_PROTECTION",
    );
  }

  /**
   * ==========================================================
   * 7. THESIS DETERIORATION
   * ==========================================================
   */

  if (
    deterioration >=
      policy
        .mildDeteriorationThreshold
  ) {
    const factor =
      deterioration >=
        policy
          .seriousDeteriorationThreshold
        ? policy
            .seriousTighteningFactor
        : policy
            .mildTighteningFactor;

    const distance =
      Math.abs(
        currentPrice -
        existingStop,
      ) *
      factor;

    const deteriorationStop =
      direction === "LONG"
        ? currentPrice -
          distance
        : currentPrice +
          distance;

    proposedStop =
      chooseMoreProtectiveStop({
        direction,
        currentStop:
          proposedStop,
        proposedStop:
          deteriorationStop,
      });

    if (
      mode ===
      CRYPTO_STOP_MODE.HOLD
    ) {
      mode =
        CRYPTO_STOP_MODE
          .TIGHTENED;
    }

    reasons.push(
      deterioration >=
        policy
          .seriousDeteriorationThreshold
        ? "SERIOUS_THESIS_DETERIORATION_TIGHTENING"
        : "MILD_THESIS_DETERIORATION_TIGHTENING",
    );
  }

  /**
   * ==========================================================
   * 8. VOLATILITY DEFENSE
   * ==========================================================
   */

  if (
    volatilityScore !==
      null &&
    volatilityScore >=
      policy
        .highVolatilityThreshold
  ) {
    const factor =
      volatilityScore >=
        policy
          .extremeVolatilityThreshold
        ? policy
            .extremeVolatilityTighteningFactor
        : policy
            .highVolatilityTighteningFactor;

    const remainingDistance =
      Math.abs(
        currentPrice -
        proposedStop,
      );

    const volatilityStop =
      direction === "LONG"
        ? currentPrice -
          remainingDistance *
            factor
        : currentPrice +
          remainingDistance *
            factor;

    proposedStop =
      chooseMoreProtectiveStop({
        direction,
        currentStop:
          proposedStop,
        proposedStop:
          volatilityStop,
      });

    if (
      mode ===
      CRYPTO_STOP_MODE.HOLD
    ) {
      mode =
        CRYPTO_STOP_MODE
          .TIGHTENED;
    }

    warnings.push(
      volatilityScore >=
        policy
          .extremeVolatilityThreshold
        ? "EXTREME_VOLATILITY_STOP_DEFENSE"
        : "HIGH_VOLATILITY_STOP_DEFENSE",
    );
  }

  /**
   * ==========================================================
   * 9. NEVER LOOSEN STOP
   * ==========================================================
   */

  const finalStop =
    chooseMoreProtectiveStop({
      direction,
      currentStop:
        existingStop,
      proposedStop,
    });

  const changed =
    finalStop !== null &&
    existingStop !== null &&
    Math.abs(
      finalStop -
      existingStop,
    ) >
      0.0000001;

  /**
   * ==========================================================
   * 10. STOP MUST REMAIN ON THE CORRECT SIDE OF PRICE
   * ==========================================================
   */

  let validStop =
    finalStop;

  if (
    direction === "LONG" &&
    validStop >=
      currentPrice
  ) {
    warnings.push(
      "STOP_CLAMPED_BELOW_CURRENT_PRICE",
    );

    validStop =
      Math.min(
        validStop,
        currentPrice -
          riskDistance *
            0.05,
      );
  }

  if (
    direction === "SHORT" &&
    validStop <=
      currentPrice
  ) {
    warnings.push(
      "STOP_CLAMPED_ABOVE_CURRENT_PRICE",
    );

    validStop =
      Math.max(
        validStop,
        currentPrice +
          riskDistance *
            0.05,
      );
  }

  /**
   * Re-run no-loosening invariant after price clamp.
   */

  validStop =
    chooseMoreProtectiveStop({
      direction,
      currentStop:
        existingStop,
      proposedStop:
        validStop,
    });

  const stopRiskFromEntryR =
    direction === "LONG"
      ? (
          validStop -
          entryPrice
        ) /
        riskDistance
      : (
          entryPrice -
          validStop
        ) /
        riskDistance;

  return {
    status:
      "STOP_PLAN_READY",

    mode,

    direction,

    entryPrice:
      round(
        entryPrice,
      ),

    currentPrice:
      round(
        currentPrice,
      ),

    initialStopPrice:
      round(
        initialStopPrice,
      ),

    previousStopPrice:
      round(
        existingStop,
      ),

    stopPrice:
      round(
        validStop,
      ),

    changed:
      Math.abs(
        validStop -
        existingStop,
      ) >
      0.0000001,

    riskDistance:
      round(
        riskDistance,
      ),

    currentR:
      round(
        currentR,
        4,
      ),

    stopLockedR:
      round(
        stopRiskFromEntryR,
        4,
      ),

    thesisDeterioration:
      round(
        deterioration,
        2,
      ),

    volatilityScore:
      volatilityScore ===
        null
        ? null
        : round(
            volatilityScore,
            2,
          ),

    excursion,

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

export default
  updateCryptoDynamicStop;