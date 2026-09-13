// server/src/risk/trailingEngine.js

import {
  RISK_CONFIG,
  TRADE_SIDE,
  EXIT_REASON,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * TRAILING ENGINE
 * ============================================================
 *
 * Handles:
 *
 * - LONG positions
 * - SHORT positions
 * - Initial stop protection
 * - Break-even protection
 * - ATR trailing loss
 * - Percentage trailing fallback
 * - Progressive trailing gain / profit locking
 * - Peak R persistence
 * - Highest locked R persistence
 * - Stop-source tracking
 * - Gap / stop-hit detection
 * - Fail-safe behaviour
 *
 * CORE SAFETY PRINCIPLES
 * ----------------------
 *
 * 1. A stop may tighten, but NEVER loosen.
 *
 * 2. peakR may increase, but NEVER decrease.
 *
 * 3. highestLockedR may increase, but NEVER decrease.
 *
 * 4. null means:
 *      "profit locking has never activated."
 *
 *    0 means:
 *      "profit locking HAS activated at break-even."
 *
 *    These must NOT be treated as the same state.
 *
 * 5. Existing stops are checked BEFORE recalculating
 *    new trailing protection.
 *
 * 6. Invalid ATR does not remove protection.
 *    Percentage trailing is used as a fallback.
 *
 * 7. Invalid/corrupted state must NEVER result in a
 *    looser stop.
 *
 * 8. If no trustworthy protective stop exists,
 *    the engine returns a fail-safe emergency state.
 */

/**
 * ============================================================
 * BASIC HELPERS
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

function isPositiveNumber(value) {
  return (
    isFiniteNumber(value) &&
    Number(value) > 0
  );
}

function roundPrice(
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

function isValidTradeSide(side) {
  return (
    side === TRADE_SIDE.LONG ||
    side === TRADE_SIDE.SHORT
  );
}

/**
 * ============================================================
 * FAIL-SAFE
 * ============================================================
 *
 * If state becomes corrupted, the engine must not silently
 * invent a new trade state.
 *
 * If a valid existing stop still exists:
 * - preserve it
 * - block normal trailing updates
 *
 * If no trustworthy stop exists:
 * - recommend emergency risk reduction / exit
 */

function buildFailSafeResult({
  side,
  entryPrice,
  currentPrice,
  currentStopPrice,
  initialStopPrice,
  errors = [],
  warnings = [],
}) {
  const existingStop =
    isPositiveNumber(currentStopPrice)
      ? Number(currentStopPrice)
      : isPositiveNumber(initialStopPrice)
        ? Number(initialStopPrice)
        : null;

  const hasProtection =
    existingStop !== null;

  return {
    approved: false,

    failSafe: true,

    side:
      isValidTradeSide(side)
        ? side
        : null,

    entryPrice:
      isPositiveNumber(entryPrice)
        ? Number(entryPrice)
        : null,

    currentPrice:
      isPositiveNumber(currentPrice)
        ? Number(currentPrice)
        : null,

    currentStopPrice:
      existingStop,

    errors,

    warnings,

    protection: {
      existingStopPreserved:
        hasProtection,

      blockTrailingUpdates: true,

      action:
        hasProtection
          ? "HOLD_EXISTING_PROTECTION"
          : "EMERGENCY_EXIT_REQUIRED",
    },

    exit: {
      shouldExit:
        !hasProtection,

      reason:
        !hasProtection
          ? EXIT_REASON.EMERGENCY_EXIT
          : null,
    },
  };
}

/**
 * ============================================================
 * PROFIT CALCULATIONS
 * ============================================================
 */

export function calculateProfitPerShare({
  side,
  entryPrice,
  currentPrice,
}) {
  if (
    !isValidTradeSide(side) ||
    !isPositiveNumber(entryPrice) ||
    !isPositiveNumber(currentPrice)
  ) {
    return null;
  }

  if (side === TRADE_SIDE.LONG) {
    return (
      Number(currentPrice) -
      Number(entryPrice)
    );
  }

  return (
    Number(entryPrice) -
    Number(currentPrice)
  );
}

export function calculateProfitPercent({
  side,
  entryPrice,
  currentPrice,
}) {
  const profitPerShare =
    calculateProfitPerShare({
      side,
      entryPrice,
      currentPrice,
    });

  if (
    profitPerShare === null ||
    !isPositiveNumber(entryPrice)
  ) {
    return null;
  }

  return (
    profitPerShare /
    Number(entryPrice)
  );
}

export function calculateCurrentR({
  side,
  entryPrice,
  currentPrice,
  originalRiskPerShare,
}) {
  if (
    !isPositiveNumber(
      originalRiskPerShare,
    )
  ) {
    return null;
  }

  const profitPerShare =
    calculateProfitPerShare({
      side,
      entryPrice,
      currentPrice,
    });

  if (profitPerShare === null) {
    return null;
  }

  return (
    profitPerShare /
    Number(originalRiskPerShare)
  );
}

/**
 * ============================================================
 * BEST PRICE
 * ============================================================
 *
 * LONG:
 * highest price reached.
 *
 * SHORT:
 * lowest price reached.
 */

export function updateBestPrice({
  side,
  currentPrice,
  previousBestPrice,
  entryPrice,
}) {
  if (
    !isValidTradeSide(side) ||
    !isPositiveNumber(currentPrice)
  ) {
    return null;
  }

  let previous =
    Number(previousBestPrice);

  if (!isPositiveNumber(previous)) {
    previous =
      Number(entryPrice);
  }

  if (!isPositiveNumber(previous)) {
    previous =
      Number(currentPrice);
  }

  if (side === TRADE_SIDE.LONG) {
    return Math.max(
      previous,
      Number(currentPrice),
    );
  }

  return Math.min(
    previous,
    Number(currentPrice),
  );
}

/**
 * ============================================================
 * LOCKED-R PRICE
 * ============================================================
 *
 * LONG
 * ----
 *
 * entry = 100
 * original risk = 2
 * lockedR = 2
 *
 * protected price = 104
 *
 *
 * SHORT
 * -----
 *
 * entry = 100
 * original risk = 2
 * lockedR = 2
 *
 * protected price = 96
 */

export function calculateLockedRPrice({
  side,
  entryPrice,
  originalRiskPerShare,
  lockedR,
}) {
  if (
    !isValidTradeSide(side) ||
    !isPositiveNumber(entryPrice) ||
    !isPositiveNumber(
      originalRiskPerShare,
    ) ||
    !isFiniteNumber(lockedR)
  ) {
    return null;
  }

  const distance =
    Number(originalRiskPerShare) *
    Number(lockedR);

  if (side === TRADE_SIDE.LONG) {
    return roundPrice(
      Number(entryPrice) +
        distance,
    );
  }

  return roundPrice(
    Number(entryPrice) -
      distance,
  );
}

/**
 * ============================================================
 * ATR TRAIL
 * ============================================================
 */

export function calculateATRTrail({
  side,
  bestPrice,
  atr,
}) {
  if (
    !isValidTradeSide(side) ||
    !isPositiveNumber(bestPrice) ||
    !isPositiveNumber(atr)
  ) {
    return null;
  }

  const multiplier =
    Number(
      RISK_CONFIG.trailingLoss
        .atrMultiplier,
    );

  if (
    !isPositiveNumber(multiplier)
  ) {
    return null;
  }

  const distance =
    Number(atr) *
    multiplier;

  if (side === TRADE_SIDE.LONG) {
    return roundPrice(
      Number(bestPrice) -
        distance,
    );
  }

  return roundPrice(
    Number(bestPrice) +
      distance,
  );
}

/**
 * ============================================================
 * PERCENTAGE TRAIL FALLBACK
 * ============================================================
 */

export function calculatePercentTrail({
  side,
  bestPrice,
}) {
  if (
    !isValidTradeSide(side) ||
    !isPositiveNumber(bestPrice)
  ) {
    return null;
  }

  const percent =
    Number(
      RISK_CONFIG.trailingLoss
        .fallbackTrailPercent,
    );

  if (
    !isPositiveNumber(percent)
  ) {
    return null;
  }

  if (side === TRADE_SIDE.LONG) {
    return roundPrice(
      Number(bestPrice) *
        (1 - percent),
    );
  }

  return roundPrice(
    Number(bestPrice) *
      (1 + percent),
  );
}

/**
 * ============================================================
 * STOP TIGHTENING
 * ============================================================
 *
 * LONG:
 * higher stop = tighter.
 *
 * SHORT:
 * lower stop = tighter.
 */

export function chooseTighterStop({
  side,
  existingStop,
  candidateStop,
}) {
  if (!isValidTradeSide(side)) {
    return existingStop;
  }

  if (
    !isPositiveNumber(candidateStop)
  ) {
    return existingStop;
  }

  if (
    !isPositiveNumber(existingStop)
  ) {
    return Number(candidateStop);
  }

  if (side === TRADE_SIDE.LONG) {
    return Math.max(
      Number(existingStop),
      Number(candidateStop),
    );
  }

  return Math.min(
    Number(existingStop),
    Number(candidateStop),
  );
}

/**
 * Apply a stop candidate and preserve its source
 * only when it actually becomes the new effective stop.
 */

function applyStopCandidate({
  side,
  currentStop,
  currentSource,
  candidateStop,
  candidateSource,
}) {
  if (
    !isPositiveNumber(candidateStop)
  ) {
    return {
      stopPrice:
        currentStop,

      stopSource:
        currentSource,

      changed: false,
    };
  }

  const tighter =
    chooseTighterStop({
      side,
      existingStop:
        currentStop,
      candidateStop,
    });

  const changed =
    Number(tighter) !==
    Number(currentStop);

  return {
    stopPrice:
      roundPrice(tighter),

    stopSource:
      changed
        ? candidateSource
        : currentSource,

    changed,
  };
}

/**
 * ============================================================
 * STOP TRIGGER
 * ============================================================
 */

export function isStopTriggered({
  side,
  currentPrice,
  stopPrice,
}) {
  if (
    !isValidTradeSide(side) ||
    !isPositiveNumber(currentPrice) ||
    !isPositiveNumber(stopPrice)
  ) {
    return false;
  }

  if (side === TRADE_SIDE.LONG) {
    return (
      Number(currentPrice) <=
      Number(stopPrice)
    );
  }

  return (
    Number(currentPrice) >=
    Number(stopPrice)
  );
}

/**
 * ============================================================
 * PEAK R
 * ============================================================
 *
 * peakR can NEVER decrease.
 */

export function calculatePeakR({
  currentR,
  previousPeakR,
}) {
  const current =
    isFiniteNumber(currentR)
      ? Number(currentR)
      : 0;

  const previous =
    isFiniteNumber(previousPeakR)
      ? Number(previousPeakR)
      : 0;

  return Math.max(
    0,
    previous,
    current,
  );
}

/**
 * ============================================================
 * PROFIT LOCK LEVEL
 * ============================================================
 *
 * IMPORTANT:
 *
 * Uses PEAK R.
 *
 * It must NOT use current R, because current price can
 * retrace after a higher profit level has already been reached.
 */

export function getProfitLockLevel({
  peakR,
}) {
  if (
    !RISK_CONFIG.trailingGain.enabled ||
    !RISK_CONFIG.trailingGain
      .progressiveLocking.enabled ||
    !isFiniteNumber(peakR)
  ) {
    return null;
  }

  const levels =
    Array.isArray(
      RISK_CONFIG.trailingGain
        .progressiveLocking.levels,
    )
      ? [
          ...RISK_CONFIG.trailingGain
            .progressiveLocking.levels,
        ]
      : [];

  levels.sort(
    (a, b) =>
      Number(a.activationR) -
      Number(b.activationR),
  );

  let activeLevel = null;

  for (const level of levels) {
    if (
      !isFiniteNumber(
        level.activationR,
      ) ||
      !isFiniteNumber(
        level.minimumLockedR,
      )
    ) {
      continue;
    }

    if (
      Number(peakR) >=
      Number(level.activationR)
    ) {
      activeLevel = level;
    }
  }

  return activeLevel;
}

/**
 * ============================================================
 * HIGHEST LOCKED R
 * ============================================================
 *
 * CRITICAL BUG FIX:
 *
 * null ≠ 0
 *
 * null:
 * profit locking has never activated.
 *
 * 0:
 * profit locking HAS activated and break-even
 * is now intentionally locked.
 */

export function calculateHighestLockedR({
  previousHighestLockedR,
  currentLockLevel,
}) {
  const hasPrevious =
    previousHighestLockedR !== null &&
    previousHighestLockedR !==
      undefined &&
    isFiniteNumber(
      previousHighestLockedR,
    );

  const currentLockedR =
    currentLockLevel &&
    isFiniteNumber(
      currentLockLevel.minimumLockedR,
    )
      ? Number(
          currentLockLevel.minimumLockedR,
        )
      : null;

  const hasCurrent =
    currentLockedR !== null;

  if (
    hasPrevious &&
    hasCurrent
  ) {
    return Math.max(
      Number(
        previousHighestLockedR,
      ),
      currentLockedR,
    );
  }

  if (hasPrevious) {
    return Number(
      previousHighestLockedR,
    );
  }

  if (hasCurrent) {
    return currentLockedR;
  }

  /**
   * VERY IMPORTANT:
   *
   * Do NOT return 0 here.
   *
   * Returning 0 would create an artificial
   * break-even stop at entry before profit
   * locking has actually activated.
   */
  return null;
}

/**
 * ============================================================
 * BREAK-EVEN
 * ============================================================
 */

export function calculateBreakEvenStop({
  side,
  entryPrice,
  peakR,
}) {
  const config =
    RISK_CONFIG.trailingLoss
      .breakEven;

  if (
    !config?.enabled ||
    !isFiniteNumber(peakR) ||
    Number(peakR) <
      Number(
        config.activationR,
      )
  ) {
    return null;
  }

  const bufferPercent =
    isFiniteNumber(
      config.bufferPercent,
    )
      ? Number(
          config.bufferPercent,
        )
      : 0;

  const buffer =
    Number(entryPrice) *
    bufferPercent;

  if (side === TRADE_SIDE.LONG) {
    return roundPrice(
      Number(entryPrice) +
        buffer,
    );
  }

  return roundPrice(
    Number(entryPrice) -
      buffer,
  );
}

/**
 * ============================================================
 * TRAILING LOSS ACTIVATION
 * ============================================================
 *
 * Uses peakR so that once trailing protection activates,
 * it remains activated for the rest of the trade.
 */

export function shouldActivateTrailingLoss({
  peakR,
  peakProfitPercent,
}) {
  if (
    !RISK_CONFIG.trailingLoss.enabled
  ) {
    return false;
  }

  const activationR =
    Number(
      RISK_CONFIG.trailingLoss
        .activationR,
    );

  const activationPercent =
    Number(
      RISK_CONFIG.trailingLoss
        .activationProfitPercent,
    );

  const rTriggered =
    isFiniteNumber(peakR) &&
    Number(peakR) >=
      activationR;

  const percentTriggered =
    isFiniteNumber(
      peakProfitPercent,
    ) &&
    Number(peakProfitPercent) >=
      activationPercent;

  return (
    rTriggered ||
    percentTriggered
  );
}

/**
 * Calculate profit percent using best price.
 *
 * This lets trailing activation remain persistent.
 */

function calculatePeakProfitPercent({
  side,
  entryPrice,
  bestPrice,
}) {
  return calculateProfitPercent({
    side,
    entryPrice,
    currentPrice:
      bestPrice,
  });
}

/**
 * ============================================================
 * EXIT REASON
 * ============================================================
 */

function getExitReasonFromSource(
  source,
) {
  switch (source) {
    case "INITIAL_STOP":
      return EXIT_REASON.INITIAL_STOP;

    case "BREAK_EVEN":
      return EXIT_REASON.TRAILING_LOSS;

    case "TRAILING_LOSS_ATR":
    case "TRAILING_LOSS_PERCENT":
      return EXIT_REASON.TRAILING_LOSS;

    case "TRAILING_GAIN":
      return EXIT_REASON.TRAILING_GAIN;

    case "PREVIOUS_PROTECTIVE_STOP":
      return EXIT_REASON.TRAILING_LOSS;

    default:
      return EXIT_REASON.INITIAL_STOP;
  }
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function updateTrailingPosition({
  side,

  entryPrice,

  currentPrice,

  previousBestPrice,

  currentStopPrice,

  initialStopPrice,

  originalRiskPerShare,

  atr,

  /**
   * Persistent state.
   */
  previousPeakR = 0,

  previousHighestLockedR = null,

  /**
   * Optional.
   *
   * Position manager can persist this later.
   */
  previousStopSource = null,
}) {
  const errors = [];
  const warnings = [];
  const actions = [];

  /**
   * ========================================================
   * CORE VALIDATION
   * ========================================================
   */

  if (!isValidTradeSide(side)) {
    errors.push(
      "Trade side must be LONG or SHORT.",
    );
  }

  if (!isPositiveNumber(entryPrice)) {
    errors.push(
      "Entry price must be greater than zero.",
    );
  }

  if (!isPositiveNumber(currentPrice)) {
    errors.push(
      "Current price must be greater than zero.",
    );
  }

  if (
    !isPositiveNumber(
      initialStopPrice,
    )
  ) {
    errors.push(
      "Initial stop price must be greater than zero.",
    );
  }

  if (
    !isPositiveNumber(
      originalRiskPerShare,
    )
  ) {
    errors.push(
      "Original risk per share must be greater than zero.",
    );
  }

  /**
   * Validate initial stop direction.
   */

  if (
    isValidTradeSide(side) &&
    isPositiveNumber(entryPrice) &&
    isPositiveNumber(initialStopPrice)
  ) {
    if (
      side === TRADE_SIDE.LONG &&
      Number(initialStopPrice) >=
        Number(entryPrice)
    ) {
      errors.push(
        "LONG initial stop must be below entry price.",
      );
    }

    if (
      side === TRADE_SIDE.SHORT &&
      Number(initialStopPrice) <=
        Number(entryPrice)
    ) {
      errors.push(
        "SHORT initial stop must be above entry price.",
      );
    }
  }

  if (errors.length > 0) {
    return buildFailSafeResult({
      side,
      entryPrice,
      currentPrice,
      currentStopPrice,
      initialStopPrice,
      errors,
      warnings,
    });
  }

  /**
   * ========================================================
   * RESOLVE EXISTING STOP
   * ========================================================
   *
   * Existing stop always takes priority over inventing
   * a new value.
   */

  let effectiveStop =
    isPositiveNumber(
      currentStopPrice,
    )
      ? Number(
          currentStopPrice,
        )
      : Number(
          initialStopPrice,
        );

  let stopSource =
    previousStopSource ||
    (
      Number(effectiveStop) ===
      Number(initialStopPrice)
        ? "INITIAL_STOP"
        : "PREVIOUS_PROTECTIVE_STOP"
    );

  /**
   * ========================================================
   * CRITICAL PRE-CHECK
   * ========================================================
   *
   * If price already crossed the EXISTING stop,
   * the position must exit immediately.
   *
   * We must NOT first recalculate a new stop using
   * the latest price.
   *
   * This also handles gap-through-stop scenarios.
   */

  if (
    isStopTriggered({
      side,
      currentPrice,
      stopPrice:
        effectiveStop,
    })
  ) {
    const triggeredCurrentR =
      calculateCurrentR({
        side,
        entryPrice,
        currentPrice,
        originalRiskPerShare,
      });

    const triggeredProfitPercent =
      calculateProfitPercent({
        side,
        entryPrice,
        currentPrice,
      });

    const triggeredPeakR =
      calculatePeakR({
        currentR:
          triggeredCurrentR,
        previousPeakR,
      });

    const triggeredBestPrice =
      updateBestPrice({
        side,
        currentPrice,
        previousBestPrice,
        entryPrice,
      });

    const triggeredPeakProfitPercent =
      calculatePeakProfitPercent({
        side,
        entryPrice,
        bestPrice:
          triggeredBestPrice,
      });

    return {
      approved: true,

      failSafe: false,

      side,

      entryPrice:
        Number(entryPrice),

      currentPrice:
        Number(currentPrice),

      bestPrice:
        Number(
          triggeredBestPrice,
        ),

      currentStopPrice:
        roundPrice(
          effectiveStop,
        ),

      stopSource,

      originalRiskPerShare:
        Number(
          originalRiskPerShare,
        ),

      currentR:
        triggeredCurrentR,

      peakR:
        triggeredPeakR,

      profitPercent:
        triggeredProfitPercent,

      peakProfitPercent:
        triggeredPeakProfitPercent,

      highestLockedR:
        previousHighestLockedR,

      trailingLossActive:
        false,

      trailingGainActive:
        previousHighestLockedR !==
        null,

      stopTriggered: true,

      actions: [
        {
          type:
            "EXISTING_STOP_TRIGGERED",

          stopPrice:
            effectiveStop,
        },
      ],

      errors: [],

      warnings,

      exit: {
        shouldExit: true,

        reason:
          getExitReasonFromSource(
            stopSource,
          ),
      },
    };
  }

  /**
   * ========================================================
   * CURRENT PERFORMANCE
   * ========================================================
   */

  const currentR =
    calculateCurrentR({
      side,
      entryPrice,
      currentPrice,
      originalRiskPerShare,
    });

  if (!isFiniteNumber(currentR)) {
    return buildFailSafeResult({
      side,
      entryPrice,
      currentPrice,
      currentStopPrice:
        effectiveStop,
      initialStopPrice,
      errors: [
        "Unable to calculate current R.",
      ],
      warnings,
    });
  }

  /**
   * ========================================================
   * BEST PRICE
   * ========================================================
   */

  const bestPrice =
    updateBestPrice({
      side,
      currentPrice,
      previousBestPrice,
      entryPrice,
    });

  if (
    !isPositiveNumber(bestPrice)
  ) {
    return buildFailSafeResult({
      side,
      entryPrice,
      currentPrice,
      currentStopPrice:
        effectiveStop,
      initialStopPrice,
      errors: [
        "Unable to determine best price.",
      ],
      warnings,
    });
  }

  /**
   * ========================================================
   * PEAK R
   * ========================================================
   */

  const peakR =
    calculatePeakR({
      currentR,
      previousPeakR,
    });

  const profitPercent =
    calculateProfitPercent({
      side,
      entryPrice,
      currentPrice,
    });

  const peakProfitPercent =
    calculatePeakProfitPercent({
      side,
      entryPrice,
      bestPrice,
    });

  /**
   * ========================================================
   * BREAK-EVEN
   * ========================================================
   */

  const breakEvenStop =
    calculateBreakEvenStop({
      side,
      entryPrice,
      peakR,
    });

  if (breakEvenStop !== null) {
    const update =
      applyStopCandidate({
        side,

        currentStop:
          effectiveStop,

        currentSource:
          stopSource,

        candidateStop:
          breakEvenStop,

        candidateSource:
          "BREAK_EVEN",
      });

    if (update.changed) {
      effectiveStop =
        update.stopPrice;

      stopSource =
        update.stopSource;

      actions.push({
        type:
          "BREAK_EVEN_PROTECTION",

        stopPrice:
          effectiveStop,
      });
    }
  }

  /**
   * ========================================================
   * TRAILING LOSS
   * ========================================================
   */

  const trailingLossActive =
    shouldActivateTrailingLoss({
      peakR,
      peakProfitPercent,
    });

  let trailingCandidate = null;
  let trailingSource = null;

  if (trailingLossActive) {
    /**
     * Prefer ATR.
     */

    if (
      RISK_CONFIG.trailingLoss
        .method === "ATR" &&
      isPositiveNumber(atr)
    ) {
      trailingCandidate =
        calculateATRTrail({
          side,
          bestPrice,
          atr,
        });

      if (
        isPositiveNumber(
          trailingCandidate,
        )
      ) {
        trailingSource =
          "TRAILING_LOSS_ATR";
      }
    }

    /**
     * FAIL-SAFE FALLBACK:
     *
     * Bad/missing ATR must NOT disable trailing protection.
     */

    if (
      !isPositiveNumber(
        trailingCandidate,
      )
    ) {
      trailingCandidate =
        calculatePercentTrail({
          side,
          bestPrice,
        });

      trailingSource =
        "TRAILING_LOSS_PERCENT";

      warnings.push(
        "ATR unavailable or invalid. Percentage trailing fallback used.",
      );
    }

    if (
      isPositiveNumber(
        trailingCandidate,
      )
    ) {
      const update =
        applyStopCandidate({
          side,

          currentStop:
            effectiveStop,

          currentSource:
            stopSource,

          candidateStop:
            trailingCandidate,

          candidateSource:
            trailingSource,
        });

      if (update.changed) {
        effectiveStop =
          update.stopPrice;

        stopSource =
          update.stopSource;

        actions.push({
          type:
            "TRAILING_LOSS_UPDATED",

          stopPrice:
            effectiveStop,

          method:
            trailingSource ===
            "TRAILING_LOSS_ATR"
              ? "ATR"
              : "PERCENT",
        });
      }
    }
  }

  /**
   * ========================================================
   * PROFIT LOCK
   * ========================================================
   */

  const profitLockLevel =
    getProfitLockLevel({
      peakR,
    });

  const highestLockedR =
    calculateHighestLockedR({
      previousHighestLockedR,
      currentLockLevel:
        profitLockLevel,
    });

  let profitLockStop = null;

  /**
   * CRITICAL:
   *
   * null means inactive.
   *
   * 0 is a legitimate ACTIVE lock level.
   */

  if (
    highestLockedR !== null
  ) {
    profitLockStop =
      calculateLockedRPrice({
        side,
        entryPrice,
        originalRiskPerShare,
        lockedR:
          highestLockedR,
      });
  }

  if (
    isPositiveNumber(
      profitLockStop,
    )
  ) {
    const update =
      applyStopCandidate({
        side,

        currentStop:
          effectiveStop,

        currentSource:
          stopSource,

        candidateStop:
          profitLockStop,

        candidateSource:
          "TRAILING_GAIN",
      });

    if (update.changed) {
      effectiveStop =
        update.stopPrice;

      stopSource =
        update.stopSource;

      actions.push({
        type:
          "TRAILING_GAIN_UPDATED",

        stopPrice:
          effectiveStop,

        peakR,

        highestLockedR,
      });
    }
  }

  /**
   * ========================================================
   * FINAL STOP VALIDATION
   * ========================================================
   */

  if (
    !isPositiveNumber(
      effectiveStop,
    )
  ) {
    return buildFailSafeResult({
      side,
      entryPrice,
      currentPrice,
      currentStopPrice,
      initialStopPrice,
      errors: [
        "Effective protective stop became invalid.",
      ],
      warnings,
    });
  }

  /**
   * Verify stop NEVER loosened relative to previous stop.
   */

  if (
    isPositiveNumber(
      currentStopPrice,
    )
  ) {
    if (
      side === TRADE_SIDE.LONG &&
      Number(effectiveStop) <
        Number(currentStopPrice)
    ) {
      warnings.push(
        "Attempted LONG stop loosening blocked.",
      );

      effectiveStop =
        Number(
          currentStopPrice,
        );
    }

    if (
      side === TRADE_SIDE.SHORT &&
      Number(effectiveStop) >
        Number(currentStopPrice)
    ) {
      warnings.push(
        "Attempted SHORT stop loosening blocked.",
      );

      effectiveStop =
        Number(
          currentStopPrice,
        );
    }
  }

  /**
   * ========================================================
   * FINAL TRIGGER CHECK
   * ========================================================
   *
   * Normally new trailing candidates should remain behind
   * current price.
   *
   * If configuration corruption creates a stop beyond current
   * price, exit rather than taking additional risk.
   */

  const stopTriggered =
    isStopTriggered({
      side,
      currentPrice,
      stopPrice:
        effectiveStop,
    });

  const exitReason =
    stopTriggered
      ? getExitReasonFromSource(
          stopSource,
        )
      : null;

  if (stopTriggered) {
    actions.push({
      type:
        "PROTECTIVE_STOP_TRIGGERED",

      stopPrice:
        effectiveStop,

      stopSource,
    });
  }

  /**
   * ========================================================
   * RESULT
   * ========================================================
   */

  return {
    approved: true,

    failSafe: false,

    side,

    entryPrice:
      Number(entryPrice),

    currentPrice:
      Number(currentPrice),

    previousBestPrice:
      isPositiveNumber(
        previousBestPrice,
      )
        ? Number(
            previousBestPrice,
          )
        : Number(
            entryPrice,
          ),

    bestPrice:
      Number(bestPrice),

    initialStopPrice:
      Number(initialStopPrice),

    previousStopPrice:
      isPositiveNumber(
        currentStopPrice,
      )
        ? Number(
            currentStopPrice,
          )
        : Number(
            initialStopPrice,
          ),

    currentStopPrice:
      roundPrice(
        effectiveStop,
      ),

    stopSource,

    originalRiskPerShare:
      Number(
        originalRiskPerShare,
      ),

    currentR:
      Number(currentR),

    /**
     * Persistent maximum.
     */
    peakR:
      Number(peakR),

    profitPercent,

    peakProfitPercent,

    trailingLossActive,

    /**
     * null = not activated.
     * 0+ = activated.
     */
    trailingGainActive:
      highestLockedR !== null,

    /**
     * Persistent maximum.
     */
    highestLockedR,

    profitLockLevel:
      profitLockLevel ?? null,

    breakEvenStop:
      breakEvenStop ?? null,

    trailingCandidate:
      trailingCandidate ?? null,

    profitLockStop:
      profitLockStop ?? null,

    stopTriggered,

    actions,

    errors: [],

    warnings,

    exit: {
      shouldExit:
        stopTriggered,

      reason:
        exitReason,
    },
  };
}

export default updateTrailingPosition;