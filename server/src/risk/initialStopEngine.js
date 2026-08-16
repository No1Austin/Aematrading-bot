// server/src/risk/initialStopEngine.js

import {
  RISK_CONFIG,
  TRADE_SIDE,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * INITIAL STOP ENGINE
 * ============================================================
 *
 * Responsibilities:
 *
 * 1. Calculate volatility-adjusted initial stop.
 * 2. Support LONG and SHORT positions.
 * 3. Use ATR as the primary stop method.
 * 4. Enforce minimum/maximum stop guardrails.
 * 5. Reject invalid stop configurations.
 * 6. Calculate initial risk (1R).
 *
 * LONG:
 * Entry: $100
 * Stop:  $98
 *
 * SHORT:
 * Entry: $100
 * Stop:  $102
 */

function isPositiveNumber(value) {
  return (
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

function roundPrice(value, decimals = 4) {
  const multiplier = 10 ** decimals;

  return (
    Math.round(
      (Number(value) + Number.EPSILON) *
        multiplier,
    ) / multiplier
  );
}

function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

/**
 * Calculate ATR as percentage of price.
 */
export function calculateATRPercent({
  atr,
  entryPrice,
}) {
  if (
    !isPositiveNumber(atr) ||
    !isPositiveNumber(entryPrice)
  ) {
    return null;
  }

  return Number(atr) / Number(entryPrice);
}

/**
 * Determine raw ATR stop distance.
 */
export function calculateATRStopDistance({
  atr,
}) {
  if (!isPositiveNumber(atr)) {
    return null;
  }

  return (
    Number(atr) *
    RISK_CONFIG.initialStop.atrMultiplier
  );
}

/**
 * Convert configured percentage guardrails
 * into actual dollar distances.
 */
export function getStopGuardrails({
  entryPrice,
}) {
  const price = Number(entryPrice);

  return {
    minimumDistance:
      price *
      RISK_CONFIG.initialStop
        .minimumStopPercent,

    maximumDistance:
      price *
      RISK_CONFIG.initialStop
        .maximumStopPercent,
  };
}

/**
 * Determine final stop distance.
 *
 * ATR is our primary method.
 *
 * But ATR cannot produce a stop outside
 * configured safety limits.
 */
export function calculateStopDistance({
  entryPrice,
  atr,
}) {
  if (
    !isPositiveNumber(entryPrice) ||
    !isPositiveNumber(atr)
  ) {
    return {
      approved: false,
      reason:
        "Valid entry price and ATR are required.",
    };
  }

  const rawATRDistance =
    calculateATRStopDistance({
      atr,
    });

  const {
    minimumDistance,
    maximumDistance,
  } = getStopGuardrails({
    entryPrice,
  });

  /**
   * IMPORTANT:
   *
   * If ATR requires a stop wider than our
   * maximum risk tolerance, we REJECT the trade.
   *
   * We do not silently squeeze the stop tighter,
   * because that would make the stop inconsistent
   * with the stock's volatility.
   */
  if (rawATRDistance > maximumDistance) {
    return {
      approved: false,

      reason:
        "ATR requires a stop wider than the configured maximum.",

      rawATRDistance,

      minimumDistance,

      maximumDistance,
    };
  }

  /**
   * If ATR produces an extremely small stop,
   * raise it to our minimum guardrail.
   */
  const finalDistance = clamp(
    rawATRDistance,
    minimumDistance,
    maximumDistance,
  );

  return {
    approved: true,

    rawATRDistance,

    minimumDistance,

    maximumDistance,

    finalDistance,

    wasMinimumGuardrailApplied:
      rawATRDistance < minimumDistance,
  };
}

/**
 * Calculate actual stop price.
 */
export function calculateStopPrice({
  side,
  entryPrice,
  stopDistance,
}) {
  const entry = Number(entryPrice);
  const distance = Number(stopDistance);

  if (
    !isPositiveNumber(entry) ||
    !isPositiveNumber(distance)
  ) {
    return null;
  }

  if (side === TRADE_SIDE.LONG) {
    return roundPrice(
      entry - distance,
    );
  }

  if (side === TRADE_SIDE.SHORT) {
    return roundPrice(
      entry + distance,
    );
  }

  return null;
}

/**
 * Verify stop is on correct side.
 */
export function validateStopDirection({
  side,
  entryPrice,
  stopPrice,
}) {
  const entry = Number(entryPrice);
  const stop = Number(stopPrice);

  if (
    !isPositiveNumber(entry) ||
    !isPositiveNumber(stop)
  ) {
    return false;
  }

  if (side === TRADE_SIDE.LONG) {
    return stop < entry;
  }

  if (side === TRADE_SIDE.SHORT) {
    return stop > entry;
  }

  return false;
}

/**
 * Calculate 1R.
 *
 * R = original risk per share.
 */
export function calculateInitialR({
  entryPrice,
  stopPrice,
}) {
  if (
    !isPositiveNumber(entryPrice) ||
    !isPositiveNumber(stopPrice)
  ) {
    return null;
  }

  return Math.abs(
    Number(entryPrice) -
      Number(stopPrice),
  );
}

/**
 * Calculate stop percentage.
 */
export function calculateStopPercent({
  entryPrice,
  stopPrice,
}) {
  const initialR =
    calculateInitialR({
      entryPrice,
      stopPrice,
    });

  if (
    !initialR ||
    !isPositiveNumber(entryPrice)
  ) {
    return null;
  }

  return (
    initialR /
    Number(entryPrice)
  );
}

/**
 * ============================================================
 * MAIN FUNCTION
 * ============================================================
 */

export function buildInitialStop({
  side,
  entryPrice,
  atr,
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

  if (!isPositiveNumber(entryPrice)) {
    errors.push(
      "Entry price must be greater than zero.",
    );
  }

  if (!isPositiveNumber(atr)) {
    errors.push(
      "ATR must be greater than zero.",
    );
  }

  if (errors.length > 0) {
    return {
      approved: false,
      errors,
    };
  }

  const distanceResult =
    calculateStopDistance({
      entryPrice,
      atr,
    });

  if (!distanceResult.approved) {
    return {
      approved: false,

      errors: [
        distanceResult.reason,
      ],

      details: distanceResult,
    };
  }

  const stopPrice =
    calculateStopPrice({
      side,
      entryPrice,
      stopDistance:
        distanceResult.finalDistance,
    });

  if (
    !validateStopDirection({
      side,
      entryPrice,
      stopPrice,
    })
  ) {
    return {
      approved: false,

      errors: [
        "Calculated stop is invalid for trade direction.",
      ],
    };
  }

  const initialR =
    calculateInitialR({
      entryPrice,
      stopPrice,
    });

  const stopPercent =
    calculateStopPercent({
      entryPrice,
      stopPrice,
    });

  const atrPercent =
    calculateATRPercent({
      atr,
      entryPrice,
    });

  return {
    approved: true,

    side,

    entryPrice:
      Number(entryPrice),

    stopPrice,

    initialR,

    stopPercent,

    atr: Number(atr),

    atrPercent,

    stopDistance:
      distanceResult.finalDistance,

    method:
      RISK_CONFIG.initialStop.method,

    atrMultiplier:
      RISK_CONFIG.initialStop
        .atrMultiplier,

    guardrails: {
      minimumDistance:
        distanceResult.minimumDistance,

      maximumDistance:
        distanceResult.maximumDistance,

      minimumStopPercent:
        RISK_CONFIG.initialStop
          .minimumStopPercent,

      maximumStopPercent:
        RISK_CONFIG.initialStop
          .maximumStopPercent,

      minimumGuardrailApplied:
        distanceResult
          .wasMinimumGuardrailApplied,
    },

    /**
     * Store this permanently with the trade.
     *
     * Even when the trailing stop later moves,
     * initialR must NOT change.
     */
    originalRisk: {
      perShare: initialR,

      stopPrice,

      entryPrice:
        Number(entryPrice),
    },
  };
}

export default buildInitialStop;