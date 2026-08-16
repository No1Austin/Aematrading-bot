// server/src/risk/positionSizer.js

import {
  RISK_CONFIG,
  TRADE_SIDE,
  getRegimePositionMultiplier,
  getSidePositionMultiplier,
} from "../config/riskConfig.js";

/**
 * Clamp a number into a range.
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Calculate ATR as a percentage of price.
 */
function getATRPercent({
  atr,
  entryPrice,
}) {
  if (
    !Number.isFinite(atr) ||
    !Number.isFinite(entryPrice) ||
    atr <= 0 ||
    entryPrice <= 0
  ) {
    return null;
  }

  return atr / entryPrice;
}

/**
 * Get volatility-based size multiplier.
 */
function getVolatilityMultiplier({
  atr,
  entryPrice,
}) {
  if (
    !RISK_CONFIG.positionSizing.volatilityAdjusted ||
    !RISK_CONFIG.volatility.enabled
  ) {
    return 1;
  }

  const atrPercent = getATRPercent({
    atr,
    entryPrice,
  });

  if (atrPercent === null) {
    return 1;
  }

  for (const tier of RISK_CONFIG.volatility.tiers) {
    if (atrPercent <= tier.maxATRPercent) {
      return tier.sizeMultiplier;
    }
  }

  return 0;
}

/**
 * Validate stop direction.
 *
 * LONG:
 * stop must be below entry.
 *
 * SHORT:
 * stop must be above entry.
 */
function validateStopDirection({
  side,
  entryPrice,
  stopPrice,
}) {
  if (side === TRADE_SIDE.LONG) {
    return stopPrice < entryPrice;
  }

  if (side === TRADE_SIDE.SHORT) {
    return stopPrice > entryPrice;
  }

  return false;
}

/**
 * Calculate risk per share.
 */
function calculateRiskPerShare({
  side,
  entryPrice,
  stopPrice,
}) {
  if (
    !validateStopDirection({
      side,
      entryPrice,
      stopPrice,
    })
  ) {
    return null;
  }

  if (side === TRADE_SIDE.LONG) {
    return entryPrice - stopPrice;
  }

  if (side === TRADE_SIDE.SHORT) {
    return stopPrice - entryPrice;
  }

  return null;
}

/**
 * Calculate maximum account risk amount.
 */
function calculateRiskBudget({
  accountEquity,
  requestedRiskPercent,
}) {
  const config =
    RISK_CONFIG.positionSizing;

  const requested =
    Number.isFinite(requestedRiskPercent)
      ? requestedRiskPercent
      : config.baseRiskPerTrade;

  const riskPercent = clamp(
    requested,
    config.minimumRiskPerTrade,
    config.maximumRiskPerTrade,
  );

  return {
    riskPercent,
    riskAmount:
      accountEquity * riskPercent,
  };
}

/**
 * Apply all size multipliers.
 */
function calculateCompositeMultiplier({
  side,
  regime,
  atr,
  entryPrice,
  correlationMultiplier = 1,
}) {
  const sideMultiplier =
    getSidePositionMultiplier(side);

  const regimeMultiplier =
    RISK_CONFIG.positionSizing
      .marketRegimeAdjusted
      ? getRegimePositionMultiplier(
          side,
          regime,
        )
      : 1;

  const volatilityMultiplier =
    getVolatilityMultiplier({
      atr,
      entryPrice,
    });

  const safeCorrelationMultiplier =
    RISK_CONFIG.positionSizing
      .correlationAdjusted
      ? clamp(
          Number(correlationMultiplier) || 1,
          0,
          1,
        )
      : 1;

  return {
    sideMultiplier,
    regimeMultiplier,
    volatilityMultiplier,
    correlationMultiplier:
      safeCorrelationMultiplier,

    compositeMultiplier:
      sideMultiplier *
      regimeMultiplier *
      volatilityMultiplier *
      safeCorrelationMultiplier,
  };
}

/**
 * Estimate transaction costs.
 */
function estimateCosts({
  positionValue,
}) {
  if (!RISK_CONFIG.costModel.enabled) {
    return {
      estimatedCommission: 0,
      estimatedSlippage: 0,
      estimatedTotalCost: 0,
    };
  }

  const commission =
    Number(
      RISK_CONFIG.costModel.commission
        .perOrder,
    ) || 0;

  const slippagePercent =
    Number(
      RISK_CONFIG.costModel.slippage
        .defaultPercent,
    ) || 0;

  const slippage =
    positionValue * slippagePercent;

  return {
    estimatedCommission: commission,
    estimatedSlippage: slippage,
    estimatedTotalCost:
      commission + slippage,
  };
}

/**
 * Main position sizing function.
 */
export function calculatePositionSize({
  side,

  accountEquity,

  buyingPower,

  entryPrice,

  stopPrice,

  atr,

  regime,

  requestedRiskPercent,

  correlationMultiplier = 1,
}) {
  const errors = [];

  if (
    side !== TRADE_SIDE.LONG &&
    side !== TRADE_SIDE.SHORT
  ) {
    errors.push(
      "Invalid trade side.",
    );
  }

  if (
    !Number.isFinite(accountEquity) ||
    accountEquity <= 0
  ) {
    errors.push(
      "Account equity must be greater than zero.",
    );
  }

  if (
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0
  ) {
    errors.push(
      "Entry price must be greater than zero.",
    );
  }

  if (
    !Number.isFinite(stopPrice) ||
    stopPrice <= 0
  ) {
    errors.push(
      "Stop price must be greater than zero.",
    );
  }

  if (
    RISK_CONFIG.positionSizing
      .respectBuyingPower &&
    (
      !Number.isFinite(buyingPower) ||
      buyingPower <= 0
    )
  ) {
    errors.push(
      "Buying power must be greater than zero.",
    );
  }

  if (errors.length > 0) {
    return {
      approved: false,
      errors,
    };
  }

  const riskPerShare =
    calculateRiskPerShare({
      side,
      entryPrice,
      stopPrice,
    });

  if (
    !Number.isFinite(riskPerShare) ||
    riskPerShare <= 0
  ) {
    return {
      approved: false,
      errors: [
        "Invalid stop-loss direction or risk per share.",
      ],
    };
  }

  const {
    riskPercent,
    riskAmount,
  } =
    calculateRiskBudget({
      accountEquity,
      requestedRiskPercent,
    });

  const multipliers =
    calculateCompositeMultiplier({
      side,
      regime,
      atr,
      entryPrice,
      correlationMultiplier,
    });

  if (
    multipliers.compositeMultiplier <= 0
  ) {
    return {
      approved: false,
      errors: [
        "Position rejected by volatility or sizing controls.",
      ],
    };
  }

  /**
   * Raw quantity based purely on
   * maximum acceptable loss.
   */
  const rawRiskQuantity =
    riskAmount / riskPerShare;

  /**
   * Apply environmental adjustments.
   */
  const adjustedRiskQuantity =
    rawRiskQuantity *
    multipliers.compositeMultiplier;

  /**
   * Capital allocation ceiling.
   */
  const maxAllocationValue =
    accountEquity *
    RISK_CONFIG.positionSizing
      .maximumCapitalAllocation;

  const maxAllocationQuantity =
    maxAllocationValue / entryPrice;

  /**
   * Buying power ceiling.
   */
  const buyingPowerQuantity =
    RISK_CONFIG.positionSizing
      .respectBuyingPower
      ? buyingPower / entryPrice
      : Number.POSITIVE_INFINITY;

  /**
   * The smallest permitted quantity
   * from all independent constraints wins.
   */
  const finalQuantity = Math.floor(
    Math.min(
      adjustedRiskQuantity,
      maxAllocationQuantity,
      buyingPowerQuantity,
    ),
  );

  if (finalQuantity <= 0) {
    return {
      approved: false,
      errors: [
        "Calculated quantity is zero.",
      ],
    };
  }

  const positionValue =
    finalQuantity * entryPrice;

  if (
    positionValue <
    RISK_CONFIG.positionSizing
      .minimumPositionValue
  ) {
    return {
      approved: false,
      errors: [
        "Position value is below the configured minimum.",
      ],
    };
  }

  const theoreticalLoss =
    finalQuantity * riskPerShare;

  const actualAccountRiskPercent =
    theoreticalLoss / accountEquity;

  const costs =
    estimateCosts({
      positionValue,
    });

  return {
    approved: true,

    side,

    quantity: finalQuantity,

    entryPrice,

    stopPrice,

    positionValue,

    accountEquity,

    buyingPower,

    risk: {
      requestedRiskPercent:
        requestedRiskPercent ??
        RISK_CONFIG.positionSizing
          .baseRiskPerTrade,

      appliedRiskPercent:
        riskPercent,

      maximumRiskAmount:
        riskAmount,

      riskPerShare,

      theoreticalLoss,

      actualAccountRiskPercent,
    },

    constraints: {
      rawRiskQuantity,

      adjustedRiskQuantity,

      maxAllocationQuantity,

      buyingPowerQuantity,

      maximumAllocationValue:
        maxAllocationValue,
    },

    multipliers,

    volatility: {
      atr:
        Number.isFinite(atr)
          ? atr
          : null,

      atrPercent:
        getATRPercent({
          atr,
          entryPrice,
        }),
    },

    costs,
  };
}

export default calculatePositionSize;