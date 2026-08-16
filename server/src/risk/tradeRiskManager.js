// server/src/risk/tradeRiskManager.js

import {
  RISK_CONFIG,
  TRADE_SIDE,
  TRADE_STATUS,
  MARKET_REGIME,
  isScoreApprovedForEnvironment,
  getRequiredScoreForRegime,
} from "../config/riskConfig.js";

import buildInitialStop from "./initialStopEngine.js";
import calculatePositionSize from "./positionSizer.js";

/**
 * ============================================================
 * TRADE RISK MANAGER
 * ============================================================
 *
 * Responsibilities:
 *
 * - Validate candidate trade
 * - Enforce minimum score
 * - Adjust required score for market regime
 * - Validate LONG / SHORT direction
 * - Validate liquidity
 * - Validate volatility
 * - Validate spread
 * - Validate portfolio limits
 * - Build ATR initial stop
 * - Calculate position size
 * - Estimate reward/risk
 * - Return APPROVED / REJECTED decision
 *
 * IMPORTANT:
 * Passing score alone is NEVER enough to open a trade.
 */

function isPositiveNumber(value) {
  return (
    Number.isFinite(Number(value)) &&
    Number(value) > 0
  );
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function round(value, decimals = 4) {
  const factor = 10 ** decimals;

  return (
    Math.round(
      (Number(value) + Number.EPSILON) *
        factor,
    ) / factor
  );
}

/**
 * ============================================================
 * SIDE VALIDATION
 * ============================================================
 */

function validateSide(side) {
  if (side === TRADE_SIDE.LONG) {
    return (
      RISK_CONFIG.trading.allowLong &&
      RISK_CONFIG.long.enabled
    );
  }

  if (side === TRADE_SIDE.SHORT) {
    return (
      RISK_CONFIG.trading.allowShort &&
      RISK_CONFIG.short.enabled
    );
  }

  return false;
}

/**
 * ============================================================
 * SPREAD
 * ============================================================
 */

export function calculateSpreadPercent({
  bid,
  ask,
  referencePrice,
}) {
  if (
    !isPositiveNumber(bid) ||
    !isPositiveNumber(ask)
  ) {
    return null;
  }

  const spread =
    Number(ask) - Number(bid);

  if (spread < 0) {
    return null;
  }

  const basePrice =
    isPositiveNumber(referencePrice)
      ? Number(referencePrice)
      : (Number(ask) + Number(bid)) / 2;

  if (basePrice <= 0) {
    return null;
  }

  return spread / basePrice;
}

/**
 * ============================================================
 * LIQUIDITY
 * ============================================================
 */

function validateLiquidity({
  averageDailyVolume,
  dollarVolume,
  spreadPercent,
}) {
  if (!RISK_CONFIG.liquidity.enabled) {
    return {
      approved: true,
      reasons: [],
    };
  }

  const reasons = [];

  if (
    !isPositiveNumber(averageDailyVolume) ||
    Number(averageDailyVolume) <
      RISK_CONFIG.liquidity
        .minimumAverageDailyVolume
  ) {
    reasons.push(
      "Average daily volume is below the configured minimum.",
    );
  }

  if (
    !isPositiveNumber(dollarVolume) ||
    Number(dollarVolume) <
      RISK_CONFIG.liquidity.minimumDollarVolume
  ) {
    reasons.push(
      "Dollar volume is below the configured minimum.",
    );
  }

  if (
    !isFiniteNumber(spreadPercent) ||
    spreadPercent >
      RISK_CONFIG.liquidity
        .maximumSpreadPercent
  ) {
    reasons.push(
      "Bid/ask spread is too wide.",
    );
  }

  return {
    approved:
      reasons.length === 0,

    reasons,
  };
}

/**
 * ============================================================
 * VOLATILITY
 * ============================================================
 */

function validateVolatility({
  atr,
  entryPrice,
}) {
  if (!RISK_CONFIG.volatility.enabled) {
    return {
      approved: true,
      atrPercent: null,
      reasons: [],
    };
  }

  const reasons = [];

  if (
    !isPositiveNumber(atr) ||
    !isPositiveNumber(entryPrice)
  ) {
    reasons.push(
      "ATR and entry price are required for volatility validation.",
    );

    return {
      approved: false,
      atrPercent: null,
      reasons,
    };
  }

  const atrPercent =
    Number(atr) /
    Number(entryPrice);

  if (
    atrPercent <
    RISK_CONFIG.volatility
      .minimumATRPercent
  ) {
    reasons.push(
      "Volatility is below the configured minimum.",
    );
  }

  if (
    atrPercent >
    RISK_CONFIG.volatility
      .maximumATRPercent
  ) {
    reasons.push(
      "Volatility exceeds the configured maximum.",
    );
  }

  return {
    approved:
      reasons.length === 0,

    atrPercent,

    reasons,
  };
}

/**
 * ============================================================
 * SHORT VALIDATION
 * ============================================================
 */

function validateShortTrade({
  side,
  shortable,
  hardToBorrow,
  borrowDataAvailable,
}) {
  if (side !== TRADE_SIDE.SHORT) {
    return {
      approved: true,
      reasons: [],
    };
  }

  const reasons = [];

  if (
    RISK_CONFIG.short
      .requireShortableSecurity &&
    shortable !== true
  ) {
    reasons.push(
      "Security is not confirmed shortable.",
    );
  }

  if (
    RISK_CONFIG.short
      .blockIfBorrowDataUnavailable &&
    borrowDataAvailable !== true
  ) {
    reasons.push(
      "Short borrow data is unavailable.",
    );
  }

  if (
    RISK_CONFIG.short.rejectHardToBorrow &&
    hardToBorrow === true
  ) {
    reasons.push(
      "Security is classified as hard-to-borrow.",
    );
  }

  return {
    approved:
      reasons.length === 0,

    reasons,
  };
}

/**
 * ============================================================
 * PORTFOLIO LIMIT CHECKS
 * ============================================================
 */

function validatePortfolio({
  openPositions = 0,
  totalOpenRiskPercent = 0,
  sectorAllocation = 0,
  highlyCorrelatedPositions = 0,
}) {
  if (!RISK_CONFIG.portfolioRisk.enabled) {
    return {
      approved: true,
      reasons: [],
    };
  }

  const reasons = [];

  if (
    Number(openPositions) >=
    RISK_CONFIG.portfolioRisk
      .maxOpenPositions
  ) {
    reasons.push(
      "Maximum number of open positions has been reached.",
    );
  }

  if (
    Number(totalOpenRiskPercent) >=
    RISK_CONFIG.portfolioRisk
      .maximumTotalOpenRiskPercent
  ) {
    reasons.push(
      "Maximum total open portfolio risk has been reached.",
    );
  }

  if (
    RISK_CONFIG.portfolioRisk
      .sectorExposure.enabled &&
    Number(sectorAllocation) >=
      RISK_CONFIG.portfolioRisk
        .sectorExposure
        .maximumSectorAllocation
  ) {
    reasons.push(
      "Sector exposure limit has been reached.",
    );
  }

  if (
    RISK_CONFIG.portfolioRisk
      .correlationControl.enabled &&
    Number(highlyCorrelatedPositions) >=
      RISK_CONFIG.portfolioRisk
        .correlationControl
        .maximumHighlyCorrelatedPositions
  ) {
    reasons.push(
      "Highly correlated position limit has been reached.",
    );
  }

  return {
    approved:
      reasons.length === 0,

    reasons,
  };
}

/**
 * ============================================================
 * ACCOUNT SAFETY
 * ============================================================
 */

function validateAccountProtection({
  accountStatus = null,
  tradingBlocked = false,
  accountBlocked = false,
  shortingEnabled = null,
  side,
  dailyPnL = 0,
  dailyLossLimit = null,
  dailyLossPercent = 0,
  accountDrawdownPercent = 0,
  consecutiveLosses = 0,
  killSwitchActive = false,
}) {
  const reasons = [];

  if (accountStatus && String(accountStatus).toUpperCase() !== "ACTIVE") {
    reasons.push(`Broker account is not active (status: ${accountStatus}).`);
  }

  if (tradingBlocked === true) {
    reasons.push("Broker has blocked trading for this account.");
  }

  if (accountBlocked === true) {
    reasons.push("Broker account is blocked.");
  }

  if (side === TRADE_SIDE.SHORT && shortingEnabled !== true) {
    reasons.push("Broker account is not confirmed for short selling.");
  }

  if (
    isFiniteNumber(dailyLossLimit) &&
    Number(dailyLossLimit) > 0 &&
    isFiniteNumber(dailyPnL) &&
    Number(dailyPnL) <= -Math.abs(Number(dailyLossLimit))
  ) {
    reasons.push("Broker daily P&L has reached the configured daily loss limit.");
  }

  if (
    killSwitchActive === true
  ) {
    reasons.push(
      "Trading kill switch is active.",
    );
  }

  if (
    Number(dailyLossPercent) >=
    RISK_CONFIG.accountProtection
      .maximumDailyLossPercent
  ) {
    reasons.push(
      "Daily loss limit has been reached.",
    );
  }

  if (
    Number(accountDrawdownPercent) >=
    RISK_CONFIG.accountProtection
      .maximumAccountDrawdownPercent
  ) {
    reasons.push(
      "Maximum account drawdown has been reached.",
    );
  }

  if (
    Number(consecutiveLosses) >=
    RISK_CONFIG.accountProtection
      .consecutiveLossLimit
  ) {
    reasons.push(
      "Consecutive loss limit has been reached.",
    );
  }

  return {
    approved:
      reasons.length === 0,

    reasons,
  };
}

/**
 * ============================================================
 * REWARD/RISK
 * ============================================================
 */

function calculateRewardRisk({
  side,
  entryPrice,
  targetPrice,
  stopPrice,
}) {
  if (
    !isPositiveNumber(entryPrice) ||
    !isPositiveNumber(targetPrice) ||
    !isPositiveNumber(stopPrice)
  ) {
    return null;
  }

  let reward;

  if (side === TRADE_SIDE.LONG) {
    reward =
      Number(targetPrice) -
      Number(entryPrice);
  } else if (
    side === TRADE_SIDE.SHORT
  ) {
    reward =
      Number(entryPrice) -
      Number(targetPrice);
  } else {
    return null;
  }

  const risk =
    Math.abs(
      Number(entryPrice) -
      Number(stopPrice),
    );

  if (
    reward <= 0 ||
    risk <= 0
  ) {
    return null;
  }

  return reward / risk;
}

/**
 * ============================================================
 * MAIN TRADE EVALUATION
 * ============================================================
 */

export function evaluateTradeCandidate({
  symbol,

  side,

  score,

  regime = MARKET_REGIME.SIDEWAYS,

  accountEquity,

  buyingPower,

  accountStatus = null,

  tradingBlocked = false,

  accountBlocked = false,

  shortingEnabled = null,

  dailyPnL = 0,

  dailyLossLimit = null,

  entryPrice,

  targetPrice,

  atr,

  bid,

  ask,

  averageDailyVolume,

  dollarVolume,

  requestedRiskPercent,

  correlationMultiplier = 1,

  openPositions = 0,

  totalOpenRiskPercent = 0,

  sectorAllocation = 0,

  highlyCorrelatedPositions = 0,

  dailyLossPercent = 0,

  accountDrawdownPercent = 0,

  consecutiveLosses = 0,

  killSwitchActive = false,

  shortable = null,

  hardToBorrow = false,

  borrowDataAvailable = false,
}) {
  const failures = [];
  const warnings = [];

  /**
   * --------------------------------------------------------
   * BASE VALIDATION
   * --------------------------------------------------------
   */

  if (!symbol) {
    failures.push(
      "Symbol is required.",
    );
  }

  if (!validateSide(side)) {
    failures.push(
      "Trade direction is not enabled or valid.",
    );
  }

  if (!isPositiveNumber(entryPrice)) {
    failures.push(
      "Entry price must be greater than zero.",
    );
  }

  if (!isPositiveNumber(accountEquity)) {
    failures.push(
      "Account equity must be greater than zero.",
    );
  }

  if (!isPositiveNumber(buyingPower)) {
    failures.push(
      "Buying power must be greater than zero.",
    );
  }

  if (!isFiniteNumber(dailyPnL)) {
    failures.push(
      "Daily P&L must be a finite number.",
    );
  }

  if (
    dailyLossLimit !== null &&
    dailyLossLimit !== undefined &&
    (!isFiniteNumber(dailyLossLimit) || Number(dailyLossLimit) < 0)
  ) {
    failures.push(
      "Daily loss limit must be a non-negative finite number.",
    );
  }

  /**
   * --------------------------------------------------------
   * SCORE CHECK
   * --------------------------------------------------------
   */

  const requiredScore =
    getRequiredScoreForRegime(
      side,
      regime,
    );

  const scoreApproved =
    isScoreApprovedForEnvironment({
      score,
      side,
      regime,
    });

  if (!scoreApproved) {
    failures.push(
      `Trade score ${score} is below required score ${requiredScore}.`,
    );
  }

  /**
   * --------------------------------------------------------
   * SPREAD + LIQUIDITY
   * --------------------------------------------------------
   */

  const spreadPercent =
    calculateSpreadPercent({
      bid,
      ask,
      referencePrice:
        entryPrice,
    });

  const liquidity =
    validateLiquidity({
      averageDailyVolume,
      dollarVolume,
      spreadPercent,
    });

  failures.push(
    ...liquidity.reasons,
  );

  /**
   * --------------------------------------------------------
   * VOLATILITY
   * --------------------------------------------------------
   */

  const volatility =
    validateVolatility({
      atr,
      entryPrice,
    });

  failures.push(
    ...volatility.reasons,
  );

  /**
   * --------------------------------------------------------
   * SHORT CHECK
   * --------------------------------------------------------
   */

  const shortValidation =
    validateShortTrade({
      side,
      shortable,
      hardToBorrow,
      borrowDataAvailable,
    });

  failures.push(
    ...shortValidation.reasons,
  );

  /**
   * --------------------------------------------------------
   * PORTFOLIO CHECK
   * --------------------------------------------------------
   */

  const portfolio =
    validatePortfolio({
      openPositions,
      totalOpenRiskPercent,
      sectorAllocation,
      highlyCorrelatedPositions,
    });

  failures.push(
    ...portfolio.reasons,
  );

  /**
   * --------------------------------------------------------
   * ACCOUNT CHECK
   * --------------------------------------------------------
   */

  const accountProtection =
    validateAccountProtection({
      accountStatus,
      tradingBlocked,
      accountBlocked,
      shortingEnabled,
      side,
      dailyPnL,
      dailyLossLimit,
      dailyLossPercent,
      accountDrawdownPercent,
      consecutiveLosses,
      killSwitchActive,
    });

  failures.push(
    ...accountProtection.reasons,
  );

  /**
   * Stop here if any prerequisite fails.
   */

  if (failures.length > 0) {
    return {
      approved: false,

      status:
        TRADE_STATUS.REJECTED,

      symbol,

      side,

      score,

      requiredScore,

      regime,

      failures,

      warnings,
    };
  }

  /**
   * --------------------------------------------------------
   * INITIAL STOP
   * --------------------------------------------------------
   */

  const stopResult =
    buildInitialStop({
      side,
      entryPrice,
      atr,
    });

  if (!stopResult.approved) {
    return {
      approved: false,

      status:
        TRADE_STATUS.REJECTED,

      symbol,

      side,

      score,

      requiredScore,

      regime,

      failures:
        stopResult.errors,

      warnings,
    };
  }

  /**
   * --------------------------------------------------------
   * POSITION SIZE
   * --------------------------------------------------------
   */

  const position =
    calculatePositionSize({
      side,

      accountEquity,

      buyingPower,

      entryPrice,

      stopPrice:
        stopResult.stopPrice,

      atr,

      regime,

      requestedRiskPercent,

      correlationMultiplier,
    });

  if (!position.approved) {
    return {
      approved: false,

      status:
        TRADE_STATUS.REJECTED,

      symbol,

      side,

      score,

      requiredScore,

      regime,

      failures:
        position.errors,

      warnings,
    };
  }

  /**
   * --------------------------------------------------------
   * REWARD/RISK CHECK
   * --------------------------------------------------------
   */

  const rewardRiskRatio =
    targetPrice
      ? calculateRewardRisk({
          side,
          entryPrice,
          targetPrice,
          stopPrice:
            stopResult.stopPrice,
        })
      : null;

  if (
    rewardRiskRatio !== null &&
    rewardRiskRatio <
      RISK_CONFIG.costModel
        .rejectIfNetRewardRiskBelow
  ) {
    failures.push(
      `Reward/risk ratio ${round(
        rewardRiskRatio,
        2,
      )} is below the configured minimum.`,
    );
  }

  if (
    rewardRiskRatio === null &&
    targetPrice
  ) {
    failures.push(
      "Target price is invalid for trade direction.",
    );
  }

  if (failures.length > 0) {
    return {
      approved: false,

      status:
        TRADE_STATUS.REJECTED,

      symbol,

      side,

      score,

      requiredScore,

      regime,

      failures,

      warnings,
    };
  }

  /**
   * --------------------------------------------------------
   * FINAL APPROVAL
   * --------------------------------------------------------
   */

  const status =
    Number(score) >=
    RISK_CONFIG.scoring
      .levels.strong.min
      ? TRADE_STATUS.STRONG
      : TRADE_STATUS.APPROVED;

  return {
    approved: true,

    status,

    symbol,

    side,

    score:
      Number(score),

    requiredScore,

    regime,

    entry: {
      price:
        Number(entryPrice),

      bid:
        isPositiveNumber(bid)
          ? Number(bid)
          : null,

      ask:
        isPositiveNumber(ask)
          ? Number(ask)
          : null,

      spreadPercent,
    },

    stop: stopResult,

    position,

    reward: {
      targetPrice:
        isPositiveNumber(targetPrice)
          ? Number(targetPrice)
          : null,

      rewardRiskRatio:
        rewardRiskRatio !== null
          ? round(
              rewardRiskRatio,
              3,
            )
          : null,
    },

    market: {
      regime,

      atr:
        Number(atr),

      atrPercent:
        volatility.atrPercent,

      averageDailyVolume:
        Number(averageDailyVolume),

      dollarVolume:
        Number(dollarVolume),
    },

    accountSafety: {
      status:
        accountStatus,

      equity:
        Number(accountEquity),

      buyingPower:
        Number(buyingPower),

      dailyPnL:
        Number(dailyPnL),

      dailyLossLimit:
        isFiniteNumber(dailyLossLimit)
          ? Number(dailyLossLimit)
          : null,

      tradingBlocked:
        tradingBlocked === true,

      accountBlocked:
        accountBlocked === true,

      shortingEnabled:
        shortingEnabled === true,
    },

    riskSummary: {
      quantity:
        position.quantity,

      capitalRequired:
        position.positionValue,

      riskPerShare:
        stopResult.initialR,

      maximumLoss:
        position.risk
          .theoreticalLoss,

      accountRiskPercent:
        position.risk
          .actualAccountRiskPercent,

      initialStop:
        stopResult.stopPrice,

      initialR:
        stopResult.initialR,
    },

    failures: [],

    warnings,

    /**
     * Still PAPER only.
     */
    executionAllowed:
      RISK_CONFIG.trading
        .liveTradingEnabled === true,
  };
}

export default evaluateTradeCandidate;