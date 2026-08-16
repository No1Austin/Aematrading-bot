import * as tradeRiskModule from "./tradeRiskManager.js";

/**
 * ============================================================
 * TRADE RISK ADAPTER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Bridge:
 *
 * TRADE DECISION GATE
 *        ↓
 * tradeRiskManager.js
 *        ↓
 * standardized risk approval
 *
 * The intelligence system has already answered:
 *
 * "Is this trade worth considering?"
 *
 * The risk manager now answers:
 *
 * "How much are we allowed to risk?"
 *
 * SAFE FAIL
 * ---------
 *
 * Any missing critical data or risk-manager failure:
 *
 * → BLOCK TRADE
 */

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const RISK_APPROVAL_STATUS =
  Object.freeze({
    APPROVED:
      "APPROVED",

    REDUCED:
      "REDUCED",

    BLOCKED:
      "BLOCKED",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    ERROR:
      "ERROR",
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
      ) * factor,
    ) / factor
  );
}

/**
 * ============================================================
 * RESOLVE EXISTING RISK MANAGER
 * ============================================================
 *
 * This allows the adapter to work even if the existing
 * tradeRiskManager.js uses one of several common export names.
 */

function resolveRiskManager() {
  const candidates = [
    tradeRiskModule.default,

    tradeRiskModule
      .manageTradeRisk,

    tradeRiskModule
      .evaluateTradeRisk,

    tradeRiskModule
      .calculateTradeRisk,

    tradeRiskModule
      .assessTradeRisk,

    tradeRiskModule
      .buildTradeRisk,
  ];

  return (
    candidates.find(
      (candidate) =>
        typeof candidate ===
        "function",
    ) ?? null
  );
}

/**
 * ============================================================
 * VALIDATE DECISION GATE
 * ============================================================
 */

function validateDecisionGate(
  decisionGate,
) {
  const errors = [];

  if (!decisionGate) {
    errors.push(
      "Trade decision gate result is required.",
    );

    return {
      valid: false,
      errors,
    };
  }

  if (
    decisionGate
      .canProceedToRiskManager !==
    true
  ) {
    errors.push(
      "Trade decision gate has not approved this candidate for risk evaluation.",
    );
  }

  const side =
    decisionGate.side;

  if (
    side !== "LONG" &&
    side !== "SHORT"
  ) {
    errors.push(
      "Approved trade side must be LONG or SHORT.",
    );
  }

  const geometry =
    decisionGate
      .tradeGeometry;

  if (!geometry) {
    errors.push(
      "Trade geometry is missing.",
    );
  }

  if (
    !positiveNumber(
      geometry?.entryPrice,
    )
  ) {
    errors.push(
      "Valid entry price is required.",
    );
  }

  if (
    !positiveNumber(
      geometry?.stopPrice,
    )
  ) {
    errors.push(
      "Valid stop price is required.",
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
 * CALCULATE BASIC POSITION METRICS
 * ============================================================
 *
 * These are independent safety calculations.
 *
 * We calculate them even if tradeRiskManager.js also
 * calculates them, so the adapter can verify the result.
 */

function calculateBasicRisk({
  accountBalance,

  accountRiskPercent,

  entryPrice,

  stopPrice,
}) {
  if (
    !positiveNumber(
      accountBalance,
    ) ||
    !positiveNumber(
      accountRiskPercent,
    ) ||
    !positiveNumber(
      entryPrice,
    ) ||
    !positiveNumber(
      stopPrice,
    )
  ) {
    return null;
  }

  const riskPerShare =
    Math.abs(
      Number(entryPrice) -
      Number(stopPrice),
    );

  if (
    riskPerShare <= 0
  ) {
    return null;
  }

  /**
   * Support both:
   *
   * 1 = 1%
   *
   * and
   *
   * 0.01 = 1%
   */

  const normalizedRiskPercent =
    Number(
      accountRiskPercent,
    ) > 1
      ? Number(
          accountRiskPercent,
        ) / 100
      : Number(
          accountRiskPercent,
        );

  const maximumDollarRisk =
    Number(accountBalance) *
    normalizedRiskPercent;

  const rawShares =
    Math.floor(
      maximumDollarRisk /
      riskPerShare,
    );

  const positionValue =
    rawShares *
    Number(entryPrice);

  const actualDollarRisk =
    rawShares *
    riskPerShare;

  const actualAccountRisk =
    Number(accountBalance) >
    0
      ? actualDollarRisk /
        Number(accountBalance)
      : 0;

  return {
    riskPerShare:
      round(
        riskPerShare,
      ),

    maximumDollarRisk:
      round(
        maximumDollarRisk,
        2,
      ),

    rawShares,

    positionValue:
      round(
        positionValue,
        2,
      ),

    actualDollarRisk:
      round(
        actualDollarRisk,
        2,
      ),

    actualAccountRisk:
      round(
        actualAccountRisk,
        6,
      ),
  };
}

/**
 * ============================================================
 * NORMALIZE MANAGER RESULT
 * ============================================================
 */

function normalizeManagerResult({
  result,

  side,

  fallbackEntryPrice,

  fallbackStopPrice,
}) {
  if (
    !result ||
    typeof result !== "object"
  ) {
    return {
      approved: false,

      status:
        RISK_APPROVAL_STATUS
          .BLOCKED,

      reason:
        "Risk manager returned no usable result.",

      failures: [
        "Risk manager returned no usable result.",
      ],

      warnings: [],

      raw:
        result ?? null,
    };
  }

  const approved =
    result.approved === true ||
    result.allowed === true ||
    result.canTrade === true;

  const failures =
    Array.isArray(
      result.failures,
    )
      ? result.failures
          .filter(Boolean)
          .map(String)
      : [];

  const warnings =
    Array.isArray(
      result.warnings,
    )
      ? result.warnings
          .filter(Boolean)
          .map(String)
      : [];

  if (!approved) {
    return {
      approved: false,

      status:
        RISK_APPROVAL_STATUS
          .BLOCKED,

      reason:
        result.reason ??
        failures[0] ??
        "Trade risk manager rejected the position.",

      failures,

      warnings,

      raw:
        result,
    };
  }

  /**
   * ======================================================
   * AUTHORITATIVE MANAGER POSITION
   * ======================================================
   *
   * IMPORTANT:
   *
   * Once tradeRiskManager.js approves a trade, the adapter
   * MUST use the manager's final position sizing.
   *
   * Never fall back to the adapter's preflight/raw share
   * calculation after manager approval.
   */

  const managerPosition =
    result.position &&
    typeof result.position ===
      "object"
      ? result.position
      : null;

  const managerRiskSummary =
    result.riskSummary &&
    typeof result.riskSummary ===
      "object"
      ? result.riskSummary
      : null;

  const managerStop =
    result.stop &&
    typeof result.stop ===
      "object"
      ? result.stop
      : null;

  const managerReward =
    result.reward &&
    typeof result.reward ===
      "object"
      ? result.reward
      : null;

  const quantityCandidate =
    managerPosition?.quantity ??
    managerRiskSummary?.quantity ??
    result.quantity ??
    result.shares ??
    result.positionSize ??
    null;

  const quantity =
    isFiniteNumber(
      quantityCandidate,
    )
      ? Math.floor(
          Number(
            quantityCandidate,
          ),
        )
      : 0;

  const entryPrice =
    positiveNumber(
      managerPosition?.entryPrice,
    )
      ? Number(
          managerPosition
            .entryPrice,
        )
      : positiveNumber(
          managerStop?.entryPrice,
        )
        ? Number(
            managerStop
              .entryPrice,
          )
        : positiveNumber(
            fallbackEntryPrice,
          )
          ? Number(
              fallbackEntryPrice,
            )
          : null;

  const stopPrice =
    positiveNumber(
      managerPosition?.stopPrice,
    )
      ? Number(
          managerPosition
            .stopPrice,
        )
      : positiveNumber(
          managerStop?.stopPrice,
        )
        ? Number(
            managerStop
              .stopPrice,
          )
        : positiveNumber(
            managerRiskSummary
              ?.initialStop,
          )
          ? Number(
              managerRiskSummary
                .initialStop,
            )
          : positiveNumber(
              fallbackStopPrice,
            )
            ? Number(
                fallbackStopPrice,
              )
            : null;

  const riskPerShareCandidate =
    managerPosition
      ?.risk
      ?.riskPerShare ??
    managerRiskSummary
      ?.riskPerShare ??
    managerStop
      ?.originalRisk
      ?.perShare ??
    managerStop
      ?.initialR ??
    null;

  const riskPerShare =
    positiveNumber(
      riskPerShareCandidate,
    )
      ? Number(
          riskPerShareCandidate,
        )
      : (
          positiveNumber(
            entryPrice,
          ) &&
          positiveNumber(
            stopPrice,
          )
        )
        ? Math.abs(
            Number(entryPrice) -
            Number(stopPrice),
          )
        : null;

  const positionValueCandidate =
    managerPosition
      ?.positionValue ??
    managerRiskSummary
      ?.capitalRequired ??
    result.positionValue ??
    result.notionalValue ??
    null;

  const positionValue =
    positiveNumber(
      positionValueCandidate,
    )
      ? Number(
          positionValueCandidate,
        )
      : (
          quantity > 0 &&
          positiveNumber(
            entryPrice,
          )
        )
        ? quantity *
          Number(entryPrice)
        : null;

  const dollarRiskCandidate =
    managerPosition
      ?.risk
      ?.theoreticalLoss ??
    managerRiskSummary
      ?.maximumLoss ??
    result.dollarRisk ??
    result.riskAmount ??
    result.actualDollarRisk ??
    null;

  const dollarRisk =
    isFiniteNumber(
      dollarRiskCandidate,
    ) &&
    Number(
      dollarRiskCandidate,
    ) >= 0
      ? Number(
          dollarRiskCandidate,
        )
      : (
          quantity > 0 &&
          positiveNumber(
            riskPerShare,
          )
        )
        ? quantity *
          Number(
            riskPerShare,
          )
        : null;

  const accountRiskFractionCandidate =
    managerPosition
      ?.risk
      ?.actualAccountRiskPercent ??
    managerRiskSummary
      ?.accountRiskPercent ??
    null;

  const targetPrice =
    positiveNumber(
      managerReward
        ?.targetPrice,
    )
      ? Number(
          managerReward
            .targetPrice,
        )
      : null;

  const rewardRiskRatio =
    isFiniteNumber(
      managerReward
        ?.rewardRiskRatio,
    )
      ? Number(
          managerReward
            .rewardRiskRatio,
        )
      : null;

  const integrityErrors = [];

  if (quantity <= 0) {
    integrityErrors.push(
      "Risk manager approved the trade without a positive final quantity.",
    );
  }

  if (
    !positiveNumber(
      entryPrice,
    )
  ) {
    integrityErrors.push(
      "Risk manager approved the trade without a valid entry price.",
    );
  }

  if (
    !positiveNumber(
      stopPrice,
    )
  ) {
    integrityErrors.push(
      "Risk manager approved the trade without a valid stop price.",
    );
  }

  if (
    !positiveNumber(
      riskPerShare,
    )
  ) {
    integrityErrors.push(
      "Risk manager approved the trade without a valid risk-per-share value.",
    );
  }

  if (
    !positiveNumber(
      positionValue,
    )
  ) {
    integrityErrors.push(
      "Risk manager approved the trade without a valid final position value.",
    );
  }

  if (
    !isFiniteNumber(
      dollarRisk,
    ) ||
    Number(dollarRisk) < 0
  ) {
    integrityErrors.push(
      "Risk manager approved the trade without a valid final dollar-risk value.",
    );
  }

  if (
    positiveNumber(
      entryPrice,
    ) &&
    positiveNumber(
      stopPrice,
    )
  ) {
    const expectedRiskPerShare =
      Math.abs(
        Number(entryPrice) -
        Number(stopPrice),
      );

    const riskDifference =
      Math.abs(
        Number(riskPerShare) -
        expectedRiskPerShare,
      );

    if (
      riskDifference >
      0.01
    ) {
      integrityErrors.push(
        "Risk manager risk-per-share is inconsistent with the approved entry and stop.",
      );
    }
  }

  if (
    quantity > 0 &&
    positiveNumber(
      riskPerShare,
    ) &&
    isFiniteNumber(
      dollarRisk,
    )
  ) {
    const expectedDollarRisk =
      quantity *
      Number(
        riskPerShare,
      );

    const tolerance =
      Math.max(
        0.02,
        expectedDollarRisk *
          0.001,
      );

    if (
      Math.abs(
        Number(dollarRisk) -
        expectedDollarRisk,
      ) >
      tolerance
    ) {
      integrityErrors.push(
        "Risk manager dollar risk is inconsistent with its approved quantity and risk per share.",
      );
    }
  }

  if (
    integrityErrors.length >
    0
  ) {
    return {
      approved: false,

      status:
        RISK_APPROVAL_STATUS
          .BLOCKED,

      reason:
        "Risk manager returned an internally inconsistent approved position.",

      failures:
        integrityErrors,

      warnings,

      raw:
        result,
    };
  }

  return {
    approved: true,

    status:
      RISK_APPROVAL_STATUS
        .APPROVED,

    side,

    quantity,

    shares:
      quantity,

    entryPrice:
      round(
        entryPrice,
        4,
      ),

    stopPrice:
      round(
        stopPrice,
        4,
      ),

    targetPrice:
      positiveNumber(
        targetPrice,
      )
        ? round(
            targetPrice,
            4,
          )
        : null,

    positionValue:
      round(
        positionValue,
        2,
      ),

    dollarRisk:
      round(
        dollarRisk,
        2,
      ),

    riskPerShare:
      round(
        riskPerShare,
        4,
      ),

    accountRiskFraction:
      isFiniteNumber(
        accountRiskFractionCandidate,
      )
        ? Number(
            accountRiskFractionCandidate,
          )
        : null,

    rewardRiskRatio:
      isFiniteNumber(
        rewardRiskRatio,
      )
        ? round(
            rewardRiskRatio,
            4,
          )
        : null,

    failures: [],

    warnings,

    raw:
      result,
  };
}

/**
 * ============================================================
 * MAIN ADAPTER
 * ============================================================
 */

export async function evaluateRiskApproval({
  symbol = null,

  decisionGate,

  accountBalance,

  accountEquity = null,

  accountRiskPercent,

  buyingPower = null,

  accountStatus = null,

  tradingBlocked = false,

  accountBlocked = false,

  shortingEnabled = null,

  dailyPnL = null,

  dailyLossLimit = null,

  openPositions = [],

  portfolioExposure = null,

  atr = null,

  liquidity = null,

  marketRegime = null,

  additionalContext = {},
} = {}) {
  try {
    /**
     * ======================================================
     * DECISION GATE
     * ======================================================
     */

    const validation =
      validateDecisionGate(
        decisionGate,
      );

    if (!validation.valid) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        canExecute: false,

        reasons:
          validation.errors,

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * ACCOUNT VALIDATION
     * ======================================================
     */

    const resolvedAccountEquity =
      positiveNumber(accountEquity)
        ? Number(accountEquity)
        : positiveNumber(accountBalance)
          ? Number(accountBalance)
          : null;

    if (
      !positiveNumber(
        resolvedAccountEquity,
      )
    ) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .INSUFFICIENT_DATA,

        symbol,

        canExecute: false,

        reasons: [
          "Valid account equity/balance is required.",
        ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    if (
      !positiveNumber(
        accountRiskPercent,
      )
    ) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .INSUFFICIENT_DATA,

        symbol,

        canExecute: false,

        reasons: [
          "Account risk percentage is required.",
        ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * DAILY LOSS KILL SWITCH
     * ======================================================
     */

    if (
      isFiniteNumber(
        dailyPnL,
      ) &&
      isFiniteNumber(
        dailyLossLimit,
      ) &&
      Number(dailyPnL) <=
        -Math.abs(
          Number(
            dailyLossLimit,
          ),
        )
    ) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        canExecute: false,

        reasons: [
          "Daily loss limit has been reached.",
        ],

        warnings: [
          "Trading should remain disabled for the configured cooldown period.",
        ],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    const {
      entryPrice,
      stopPrice,
      targetPrice,
      rewardRiskRatio,
    } =
      decisionGate
        .tradeGeometry;

    /**
     * ======================================================
     * BASIC RISK CALCULATION
     * ======================================================
     */

    const fallbackRisk =
      calculateBasicRisk({
        accountBalance:
          resolvedAccountEquity,

        accountRiskPercent,

        entryPrice,

        stopPrice,
      });

    if (!fallbackRisk) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        canExecute: false,

        reasons: [
          "Unable to calculate valid position risk.",
        ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    if (
      fallbackRisk.rawShares <=
      0
    ) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        canExecute: false,

        reasons: [
          "Account risk allowance is too small for one share at the proposed stop distance.",
        ],

        warnings: [],

        risk:
          fallbackRisk,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * BUYING POWER CAP
     * ======================================================
     */

    let maximumSharesByBuyingPower =
      null;

    if (
      positiveNumber(
        buyingPower,
      )
    ) {
      maximumSharesByBuyingPower =
        Math.floor(
          Number(
            buyingPower,
          ) /
          Number(
            entryPrice,
          ),
        );
    }

    /**
     * ======================================================
     * RESOLVE EXISTING MANAGER
     * ======================================================
     */

    const riskManager =
      resolveRiskManager();

    if (!riskManager) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS.ERROR,

        symbol,

        canExecute: false,

        reasons: [
          "No callable function was exported by tradeRiskManager.js.",
        ],

        warnings: [
          "The adapter searched default, manageTradeRisk, evaluateTradeRisk, calculateTradeRisk, assessTradeRisk, and buildTradeRisk exports.",
        ],

        risk:
          fallbackRisk,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * CALL EXISTING RISK MANAGER
     * ======================================================
     */

    /**
     * ======================================================
     * NORMALIZE LIVE INPUTS FOR tradeRiskManager.js
     * ======================================================
     */

    const normalizedOpenPositions =
      Array.isArray(
        openPositions,
      )
        ? openPositions.length
        : isFiniteNumber(
            openPositions,
          )
          ? Math.max(
              0,
              Math.floor(
                Number(
                  openPositions,
                ),
              ),
            )
          : 0;

    const resolvedRegime =
      marketRegime ??
      additionalContext
        ?.regime ??
      null;

    const resolvedBid =
      liquidity
        ?.bid ??
      additionalContext
        ?.bid ??
      null;

    const resolvedAsk =
      liquidity
        ?.ask ??
      additionalContext
        ?.ask ??
      null;

    const resolvedAverageDailyVolume =
      liquidity
        ?.averageDailyVolume ??
      liquidity
        ?.averageVolume ??
      additionalContext
        ?.averageDailyVolume ??
      null;

    const resolvedDollarVolume =
      liquidity
        ?.dollarVolume ??
      additionalContext
        ?.dollarVolume ??
      null;

    const resolvedRequestedRiskPercent =
      positiveNumber(
        accountRiskPercent,
      )
        ? Number(
            accountRiskPercent,
          )
        : null;

    const managerResult =
      await riskManager({
        symbol,

        side:
          decisionGate.side,

        score:
          decisionGate.score,

        entryPrice,

        targetPrice,

        accountEquity:
          resolvedAccountEquity,

        buyingPower,

        accountStatus,

        tradingBlocked,

        accountBlocked,

        shortingEnabled,

        dailyPnL,

        dailyLossLimit,

        requestedRiskPercent:
          resolvedRequestedRiskPercent,

        openPositions:
          normalizedOpenPositions,

        atr,

        regime:
          resolvedRegime,

        bid:
          resolvedBid,

        ask:
          resolvedAsk,

        averageDailyVolume:
          resolvedAverageDailyVolume,

        dollarVolume:
          resolvedDollarVolume,

        totalOpenRiskPercent:
          additionalContext
            ?.totalOpenRiskPercent ??
          0,

        sectorAllocation:
          additionalContext
            ?.sectorAllocation ??
          0,

        highlyCorrelatedPositions:
          additionalContext
            ?.highlyCorrelatedPositions ??
          0,

        dailyLossPercent:
          additionalContext
            ?.dailyLossPercent ??
          0,

        accountDrawdownPercent:
          additionalContext
            ?.accountDrawdownPercent ??
          0,

        consecutiveLosses:
          additionalContext
            ?.consecutiveLosses ??
          0,

        killSwitchActive:
          additionalContext
            ?.killSwitchActive ===
          true,

        shortable:
          additionalContext
            ?.shortable ??
          null,

        hardToBorrow:
          additionalContext
            ?.hardToBorrow ===
          true,

        borrowDataAvailable:
          additionalContext
            ?.borrowDataAvailable ===
          true,

        correlationMultiplier:
          additionalContext
            ?.correlationMultiplier ??
          1,
      });

    const normalized =
      normalizeManagerResult({
        result:
          managerResult,

        side:
          decisionGate.side,

        fallbackEntryPrice:
          entryPrice,

        fallbackStopPrice:
          stopPrice,
      });

    /**
     * ======================================================
     * MANAGER BLOCK
     * ======================================================
     */

    if (!normalized.approved) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        side:
          decisionGate.side,

        canExecute: false,

        intelligenceScore:
          decisionGate.score,

        reasons:
          normalized
            ?.failures
            ?.length
            ? normalized.failures
            : [
                normalized
                  ?.reason ??
                managerResult
                  ?.reason ??
                "Trade risk manager rejected the position.",
              ],

        warnings:
          normalized
            ?.warnings ??
          managerResult
            ?.warnings ??
          [],

        risk:
          normalized,

        rawRiskManagerResult:
          managerResult,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * FINAL MANAGER-AUTHORITATIVE POSITION
     * ======================================================
     *
     * The risk manager owns final sizing.
     *
     * Example:
     *
     * Adapter preflight may calculate 333 shares from the
     * account risk budget, but if tradeRiskManager.js caps
     * the trade at 200 shares, ONLY 200 may continue.
     */

    const managerApprovedShares =
      normalized.shares;

    let approvedShares =
      managerApprovedShares;

    const warnings = [
      ...(
        normalized
          ?.warnings ??
        []
      ),
    ];

    let reduced = false;

    /**
     * Extra adapter buying-power guard.
     *
     * This may REDUCE manager sizing but can never increase it.
     */

    if (
      maximumSharesByBuyingPower !==
        null &&
      approvedShares >
        maximumSharesByBuyingPower
    ) {
      approvedShares =
        maximumSharesByBuyingPower;

      reduced = true;

      warnings.push(
        "Position size reduced below the risk manager quantity to remain within available buying power.",
      );
    }

    /**
     * Optional liquidity reduction.
     *
     * Again, this may only reduce the manager-approved size.
     */

    if (
      decisionGate
        ?.execution
        ?.reduceSize ===
      true
    ) {
      approvedShares =
        Math.floor(
          approvedShares *
          0.75,
        );

      reduced = true;

      warnings.push(
        "Position size reduced below the risk manager quantity because the liquidity engine requested smaller execution size.",
      );
    }

    if (
      approvedShares <= 0
    ) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        side:
          decisionGate.side,

        canExecute: false,

        reasons: [
          "Final approved quantity is zero.",
        ],

        warnings,

        rawRiskManagerResult:
          managerResult,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * FINAL POSITION CALCULATION
     * ======================================================
     *
     * Start from manager-approved values.
     *
     * If the adapter applies an additional reduction, recalculate
     * only from the reduced quantity and the manager-approved
     * entry/stop/risk-per-share.
     */

    const managerEntryPrice =
      normalized.entryPrice;

    const managerStopPrice =
      normalized.stopPrice;

    const managerTargetPrice =
      normalized.targetPrice ??
      (
        positiveNumber(
          targetPrice,
        )
          ? Number(
              targetPrice,
            )
          : null
      );

    const managerRiskPerShare =
      normalized.riskPerShare;

    const finalPositionValue =
      approvedShares ===
        managerApprovedShares
        ? normalized.positionValue
        : approvedShares *
          Number(
            managerEntryPrice,
          );

    const finalDollarRisk =
      approvedShares ===
        managerApprovedShares
        ? normalized.dollarRisk
        : approvedShares *
          Number(
            managerRiskPerShare,
          );

    const finalAccountRisk =
      Number(
        resolvedAccountEquity,
      ) > 0
        ? Number(
            finalDollarRisk,
          ) /
          Number(
            resolvedAccountEquity,
          )
        : null;

    if (
      !positiveNumber(
        finalPositionValue,
      ) ||
      !isFiniteNumber(
        finalDollarRisk,
      ) ||
      Number(
        finalDollarRisk,
      ) < 0 ||
      !isFiniteNumber(
        finalAccountRisk,
      ) ||
      Number(
        finalAccountRisk,
      ) < 0
    ) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        side:
          decisionGate.side,

        canExecute: false,

        reasons: [
          "Final manager-approved position failed adapter integrity checks.",
        ],

        warnings,

        rawRiskManagerResult:
          managerResult,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * Never allow adapter processing to increase the manager's
     * approved quantity or dollar risk.
     */

    if (
      approvedShares >
        managerApprovedShares ||
      Number(
        finalDollarRisk,
      ) >
        Number(
          normalized.dollarRisk,
        ) +
        0.02
    ) {
      return {
        approved: false,

        engine:
          "TRADE_RISK_APPROVAL",

        status:
          RISK_APPROVAL_STATUS
            .BLOCKED,

        symbol,

        side:
          decisionGate.side,

        canExecute: false,

        reasons: [
          "Adapter safety invariant failed: final execution risk exceeds the risk manager approval.",
        ],

        warnings,

        rawRiskManagerResult:
          managerResult,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    return {
      approved: true,

      engine:
        "TRADE_RISK_APPROVAL",

      status:
        reduced
          ? RISK_APPROVAL_STATUS
              .REDUCED
          : RISK_APPROVAL_STATUS
              .APPROVED,

      symbol,

      side:
        decisionGate.side,

      canExecute: true,

      intelligenceScore:
        decisionGate.score,

      position: {
        shares:
          approvedShares,

        managerApprovedShares,

        entryPrice:
          Number(
            managerEntryPrice,
          ),

        stopPrice:
          Number(
            managerStopPrice,
          ),

        targetPrice:
          positiveNumber(
            managerTargetPrice,
          )
            ? Number(
                managerTargetPrice,
              )
            : null,

        positionValue:
          round(
            finalPositionValue,
            2,
          ),

        riskPerShare:
          round(
            managerRiskPerShare,
            4,
          ),

        dollarRisk:
          round(
            finalDollarRisk,
            2,
          ),

        accountRisk:
          round(
            finalAccountRisk,
            6,
          ),

        accountRiskPercent:
          round(
            finalAccountRisk *
              100,
            4,
          ),

        rewardRiskRatio:
          isFiniteNumber(
            normalized
              .rewardRiskRatio,
          )
            ? round(
                normalized
                  .rewardRiskRatio,
                4,
              )
            : isFiniteNumber(
                rewardRiskRatio,
              )
              ? round(
                  rewardRiskRatio,
                  4,
                )
              : null,
      },

      controls: {
        initialStop:
          Number(
            stopPrice,
          ),

        trailingLoss:
          true,

        trailingGain:
          true,

        eventFreezeChecked:
          true,

        liquidityChecked:
          true,

        riskRewardChecked:
          true,

        decisionGateChecked:
          true,
      },

      warnings,

      reasons: [],

      rawRiskManagerResult:
        managerResult,

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
        "TRADE_RISK_APPROVAL",

      status:
        RISK_APPROVAL_STATUS.ERROR,

      symbol,

      canExecute: false,

      reasons: [
        "Risk approval failed. Trade execution must remain blocked.",
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

export default evaluateRiskApproval;