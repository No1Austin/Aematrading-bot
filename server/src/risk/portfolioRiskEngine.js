// server/src/risk/portfolioRiskEngine.js

/**
 * ============================================================
 * PORTFOLIO RISK ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Protect the account at portfolio level before a newly
 * approved trade is allowed to proceed to execution.
 *
 * This engine does NOT execute trades.
 *
 * It evaluates:
 *
 * - proposed trade risk
 * - total open portfolio risk
 * - symbol concentration
 * - sector concentration
 * - directional exposure
 * - daily loss state
 * - account drawdown
 * - consecutive losses
 *
 * OUTPUT
 * ------
 *
 * APPROVE
 * REDUCE
 * BLOCK
 *
 * SAFE FAIL
 * ---------
 *
 * Missing critical account/trade information must never
 * increase exposure.
 */

/**
 * ============================================================
 * STATUS / ACTION
 * ============================================================
 */

export const PORTFOLIO_RISK_STATUS =
  Object.freeze({
    APPROVED:
      "APPROVED",

    REDUCED:
      "REDUCED",

    BLOCKED:
      "BLOCKED",

    INVALID_INPUT:
      "INVALID_INPUT",

    ERROR:
      "ERROR",
  });

export const PORTFOLIO_RISK_ACTION =
  Object.freeze({
    APPROVE:
      "APPROVE",

    REDUCE:
      "REDUCE",

    BLOCK:
      "BLOCK",
  });

/**
 * ============================================================
 * DEFAULT CONFIG
 * ============================================================
 */

export const DEFAULT_PORTFOLIO_RISK_CONFIG =
  Object.freeze({
    maxRiskPerTradePercent:
      1,

    maxTotalOpenRiskPercent:
      4,

    maxSingleSymbolExposurePercent:
      20,

    maxSameSectorExposurePercent:
      40,

    maxDirectionalExposurePercent:
      70,

    dailyLossCutoffPercent:
      3,

    maxDrawdownPercent:
      10,

    maxConsecutiveLosses:
      4,

    minimumReductionMultiplier:
      0.10,

    blockOnMissingCriticalData:
      true,

    allowUnknownSector:
      true,
  });

/**
 * ============================================================
 * HELPERS
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
      Number(min),
    ),
    Number(max),
  );
}

function round(
  value,
  decimals = 4,
) {
  if (
    !isFiniteNumber(
      value,
    )
  ) {
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
    ) /
    factor
  );
}

function now() {
  return new Date()
    .toISOString();
}

function normalizeSide(side) {
  const value =
    String(
      side ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    value === "LONG" ||
    value === "SHORT"
  ) {
    return value;
  }

  return null;
}

function normalizeSymbol(
  symbol,
) {
  const value =
    String(
      symbol ??
      "",
    )
      .trim()
      .toUpperCase();

  return value.length > 0
    ? value
    : null;
}

function normalizeSector(
  sector,
) {
  const value =
    String(
      sector ??
      "",
    )
      .trim()
      .toUpperCase();

  return value.length > 0
    ? value
    : null;
}

function safeArray(value) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

/**
 * ============================================================
 * ACCOUNT METRICS
 * ============================================================
 */

function resolveEquity(
  account,
) {
  const candidates = [
    account?.equity,
    account?.balance,
    account?.buyingPower,
  ];

  for (
    const value
    of candidates
  ) {
    if (
      positiveNumber(
        value,
      )
    ) {
      return Number(
        value,
      );
    }
  }

  return null;
}

function resolveStartingEquity(
  account,
  equity,
) {
  const candidates = [
    account
      ?.startingEquity,
    account
      ?.initialBalance,
    account
      ?.startingBalance,
  ];

  for (
    const value
    of candidates
  ) {
    if (
      positiveNumber(
        value,
      )
    ) {
      return Number(
        value,
      );
    }
  }

  return equity;
}

function calculateDrawdownPercent({
  equity,
  startingEquity,
}) {
  if (
    !positiveNumber(
      equity,
    ) ||
    !positiveNumber(
      startingEquity,
    )
  ) {
    return null;
  }

  if (
    Number(equity) >=
    Number(
      startingEquity,
    )
  ) {
    return 0;
  }

  return (
    (
      Number(
        startingEquity,
      ) -
      Number(
        equity,
      )
    ) /
    Number(
      startingEquity,
    )
  ) *
  100;
}

function calculateDailyLossPercent({
  dailyPnL,
  equity,
}) {
  if (
    !isFiniteNumber(
      dailyPnL,
    ) ||
    !positiveNumber(
      equity,
    )
  ) {
    return null;
  }

  if (
    Number(
      dailyPnL,
    ) >= 0
  ) {
    return 0;
  }

  return (
    Math.abs(
      Number(
        dailyPnL,
      ),
    ) /
    Number(
      equity,
    )
  ) *
  100;
}

/**
 * ============================================================
 * POSITION METRICS
 * ============================================================
 */

function positionValueOf(
  position,
) {
  const shares =
    Number(
      position
        ?.shares ??
      position
        ?.quantity ??
      0,
    );

  const price =
    Number(
      position
        ?.currentPrice ??
      position
        ?.entryPrice ??
      0,
    );

  if (
    !positiveNumber(
      shares,
    ) ||
    !positiveNumber(
      price,
    )
  ) {
    return 0;
  }

  return (
    shares *
    price
  );
}

function riskDollarsOf(
  position,
) {
  const explicitCandidates = [
    position
      ?.dollarRisk,
    position
      ?.riskDollars,
    position
      ?.originalDollarRisk,
  ];

  for (
    const value
    of explicitCandidates
  ) {
    if (
      isFiniteNumber(
        value,
      ) &&
      Number(
        value,
      ) >= 0
    ) {
      return Number(
        value,
      );
    }
  }

  const shares =
    Number(
      position
        ?.shares ??
      position
        ?.quantity ??
      0,
    );

  const riskPerShare =
    Number(
      position
        ?.riskPerShare ??
      position
        ?.originalRiskPerShare ??
      position
        ?.trailingState
        ?.originalRiskPerShare ??
      0,
    );

  if (
    positiveNumber(
      shares,
    ) &&
    positiveNumber(
      riskPerShare,
    )
  ) {
    return (
      shares *
      riskPerShare
    );
  }

  const entryPrice =
    Number(
      position
        ?.entryPrice,
    );

  const stopPrice =
    Number(
      position
        ?.stopPrice ??
      position
        ?.trailingState
        ?.initialStopPrice,
    );

  if (
    positiveNumber(
      shares,
    ) &&
    positiveNumber(
      entryPrice,
    ) &&
    positiveNumber(
      stopPrice,
    )
  ) {
    return (
      shares *
      Math.abs(
        entryPrice -
        stopPrice,
      )
    );
  }

  return 0;
}

/**
 * ============================================================
 * PROPOSED TRADE
 * ============================================================
 */

function buildProposedTrade({
  proposedTrade,
  equity,
}) {
  const side =
    normalizeSide(
      proposedTrade
        ?.side,
    );

  const symbol =
    normalizeSymbol(
      proposedTrade
        ?.symbol,
    );

  const sector =
    normalizeSector(
      proposedTrade
        ?.sector,
    );

  const shares =
    Number(
      proposedTrade
        ?.shares ??
      proposedTrade
        ?.quantity ??
      0,
    );

  const entryPrice =
    Number(
      proposedTrade
        ?.entryPrice ??
      proposedTrade
        ?.currentPrice ??
      0,
    );

  const riskPerShare =
    Number(
      proposedTrade
        ?.riskPerShare ??
      (
        positiveNumber(
          proposedTrade
            ?.entryPrice,
        ) &&
        positiveNumber(
          proposedTrade
            ?.stopPrice,
        )
          ? Math.abs(
              Number(
                proposedTrade
                  .entryPrice,
              ) -
              Number(
                proposedTrade
                  .stopPrice,
              )
            )
          : 0
      ),
    );

  const positionValue =
    (
      positiveNumber(
        shares,
      ) &&
      positiveNumber(
        entryPrice,
      )
    )
      ? (
          shares *
          entryPrice
        )
      : 0;

  const dollarRisk =
    positiveNumber(
      proposedTrade
        ?.dollarRisk,
    )
      ? Number(
          proposedTrade
            .dollarRisk,
        )
      : (
          positiveNumber(
            shares,
          ) &&
          positiveNumber(
            riskPerShare,
          )
            ? (
                shares *
                riskPerShare
              )
            : 0
        );

  const accountRiskPercent =
    (
      positiveNumber(
        equity,
      ) &&
      dollarRisk >= 0
    )
      ? (
          dollarRisk /
          equity
        ) *
        100
      : null;

  const exposurePercent =
    (
      positiveNumber(
        equity,
      ) &&
      positionValue >= 0
    )
      ? (
          positionValue /
          equity
        ) *
        100
      : null;

  return {
    symbol,

    side,

    sector,

    shares,

    entryPrice,

    riskPerShare,

    dollarRisk,

    positionValue,

    accountRiskPercent,

    exposurePercent,
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function evaluatePortfolioRisk({
  account = null,

  proposedTrade = null,

  openPositions = null,

  consecutiveLosses = null,

  config = {},
} = {}) {
  try {
    const mergedConfig = {
      ...DEFAULT_PORTFOLIO_RISK_CONFIG,
      ...(
        config ??
        {}
      ),
    };

    const errors = [];
    const warnings = [];
    const reasons = [];

    if (!account) {
      errors.push(
        "Account state is required.",
      );
    }

    if (!proposedTrade) {
      errors.push(
        "Proposed trade is required.",
      );
    }

    const equity =
      resolveEquity(
        account,
      );

    if (
      !positiveNumber(
        equity,
      )
    ) {
      errors.push(
        "Valid account equity is required.",
      );
    }

    const positions =
      openPositions !==
      null
        ? safeArray(
            openPositions,
          )
        : safeArray(
            account
              ?.openPositions,
          );

    const trade =
      buildProposedTrade({
        proposedTrade,

        equity,
      });

    if (
      !trade.symbol
    ) {
      errors.push(
        "Proposed trade symbol is required.",
      );
    }

    if (
      !trade.side
    ) {
      errors.push(
        "Proposed trade side must be LONG or SHORT.",
      );
    }

    if (
      !positiveNumber(
        trade.shares,
      )
    ) {
      errors.push(
        "Proposed share quantity must be positive.",
      );
    }

    if (
      !positiveNumber(
        trade.entryPrice,
      )
    ) {
      errors.push(
        "Proposed entry price must be positive.",
      );
    }

    if (
      !positiveNumber(
        trade.dollarRisk,
      )
    ) {
      errors.push(
        "Proposed dollar risk must be positive.",
      );
    }

    if (
      errors.length > 0 &&
      mergedConfig
        .blockOnMissingCriticalData
    ) {
      return {
        approved: false,

        engine:
          "PORTFOLIO_RISK",

        status:
          PORTFOLIO_RISK_STATUS
            .INVALID_INPUT,

        action:
          PORTFOLIO_RISK_ACTION
            .BLOCK,

        canExecute:
          false,

        exposureMultiplier:
          0,

        proposedTrade:
          trade,

        metrics: null,

        reasons: [
          "Portfolio risk evaluation could not verify critical data.",
        ],

        warnings,

        errors,

        timestamp:
          now(),
      };
    }

    const startingEquity =
      resolveStartingEquity(
        account,
        equity,
      );

    const dailyLossPercent =
      calculateDailyLossPercent({
        dailyPnL:
          account
            ?.dailyPnL ??
          0,

        equity,
      });

    const drawdownPercent =
      calculateDrawdownPercent({
        equity,

        startingEquity,
      });

    const resolvedConsecutiveLosses =
      isFiniteNumber(
        consecutiveLosses,
      )
        ? Number(
            consecutiveLosses,
          )
        : Number(
            account
              ?.consecutiveLosses ??
            0,
          );

    const currentOpenRiskDollars =
      positions
        .reduce(
          (
            total,
            position,
          ) =>
            total +
            riskDollarsOf(
              position,
            ),
          0,
        );

    const currentOpenRiskPercent =
      (
        positiveNumber(
          equity,
        )
      )
        ? (
            currentOpenRiskDollars /
            equity
          ) *
          100
        : null;

    const projectedOpenRiskDollars =
      currentOpenRiskDollars +
      trade.dollarRisk;

    const projectedOpenRiskPercent =
      (
        positiveNumber(
          equity,
        )
      )
        ? (
            projectedOpenRiskDollars /
            equity
          ) *
          100
        : null;

    const currentSymbolExposure =
      positions
        .filter(
          (position) =>
            normalizeSymbol(
              position
                ?.symbol,
            ) ===
            trade.symbol,
        )
        .reduce(
          (
            total,
            position,
          ) =>
            total +
            positionValueOf(
              position,
            ),
          0,
        );

    const projectedSymbolExposure =
      currentSymbolExposure +
      trade.positionValue;

    const projectedSymbolExposurePercent =
      (
        positiveNumber(
          equity,
        )
      )
        ? (
            projectedSymbolExposure /
            equity
          ) *
          100
        : null;

    const currentSectorExposure =
      trade.sector
        ? positions
            .filter(
              (position) =>
                normalizeSector(
                  position
                    ?.sector,
                ) ===
                trade.sector,
            )
            .reduce(
              (
                total,
                position,
              ) =>
                total +
                positionValueOf(
                  position,
                ),
              0,
            )
        : 0;

    const projectedSectorExposure =
      currentSectorExposure +
      trade.positionValue;

    const projectedSectorExposurePercent =
      trade.sector &&
      positiveNumber(
        equity,
      )
        ? (
            projectedSectorExposure /
            equity
          ) *
          100
        : null;

    const sameDirectionExposure =
      positions
        .filter(
          (position) =>
            normalizeSide(
              position
                ?.side,
            ) ===
            trade.side,
        )
        .reduce(
          (
            total,
            position,
          ) =>
            total +
            positionValueOf(
              position,
            ),
          0,
        );

    const projectedDirectionalExposure =
      sameDirectionExposure +
      trade.positionValue;

    const projectedDirectionalExposurePercent =
      (
        positiveNumber(
          equity,
        )
      )
        ? (
            projectedDirectionalExposure /
            equity
          ) *
          100
        : null;

    /**
     * ======================================================
     * HARD BLOCKS
     * ======================================================
     */

    if (
      account
        ?.tradingBlocked ===
        true ||
      account
        ?.accountBlocked ===
        true
    ) {
      reasons.push(
        "Account is currently blocked from trading.",
      );
    }

    if (
      dailyLossPercent !==
        null &&
      dailyLossPercent >=
        mergedConfig
          .dailyLossCutoffPercent
    ) {
      reasons.push(
        `Daily loss cutoff reached (${round(
          dailyLossPercent,
          2,
        )}%).`,
      );
    }

    if (
      drawdownPercent !==
        null &&
      drawdownPercent >=
        mergedConfig
          .maxDrawdownPercent
    ) {
      reasons.push(
        `Maximum account drawdown reached (${round(
          drawdownPercent,
          2,
        )}%).`,
      );
    }

    if (
      resolvedConsecutiveLosses >=
      mergedConfig
        .maxConsecutiveLosses
    ) {
      reasons.push(
        `Consecutive loss limit reached (${resolvedConsecutiveLosses}).`,
      );
    }

    if (
      reasons.length > 0
    ) {
      return {
        approved: false,

        engine:
          "PORTFOLIO_RISK",

        status:
          PORTFOLIO_RISK_STATUS
            .BLOCKED,

        action:
          PORTFOLIO_RISK_ACTION
            .BLOCK,

        canExecute:
          false,

        exposureMultiplier:
          0,

        proposedTrade:
          trade,

        metrics: {
          equity:
            round(
              equity,
              2,
            ),

          currentOpenRiskPercent:
            round(
              currentOpenRiskPercent,
              4,
            ),

          projectedOpenRiskPercent:
            round(
              projectedOpenRiskPercent,
              4,
            ),

          projectedSymbolExposurePercent:
            round(
              projectedSymbolExposurePercent,
              4,
            ),

          projectedSectorExposurePercent:
            round(
              projectedSectorExposurePercent,
              4,
            ),

          projectedDirectionalExposurePercent:
            round(
              projectedDirectionalExposurePercent,
              4,
            ),

          dailyLossPercent:
            round(
              dailyLossPercent,
              4,
            ),

          drawdownPercent:
            round(
              drawdownPercent,
              4,
            ),

          consecutiveLosses:
            resolvedConsecutiveLosses,
        },

        reasons,

        warnings,

        errors,

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * REDUCTION CALCULATION
     * ======================================================
     */

    let multiplier = 1;

    const constraints = [];

    function applyConstraint({
      name,
      allowed,
      requested,
      message,
    }) {
      if (
        !positiveNumber(
          requested,
        )
      ) {
        return;
      }

      const ratio =
        clamp(
          allowed /
          requested,
          0,
          1,
        );

      constraints.push({
        name,

        ratio:
          round(
            ratio,
            6,
          ),

        allowed:
          round(
            allowed,
            6,
          ),

        requested:
          round(
            requested,
            6,
          ),
      });

      if (
        ratio <
        multiplier
      ) {
        multiplier =
          ratio;
      }

      if (
        ratio <
        1
      ) {
        warnings.push(
          message,
        );
      }
    }

    const maxTradeRiskDollars =
      (
        equity *
        mergedConfig
          .maxRiskPerTradePercent
      ) /
      100;

    applyConstraint({
      name:
        "MAX_RISK_PER_TRADE",

      allowed:
        maxTradeRiskDollars,

      requested:
        trade.dollarRisk,

      message:
        "Proposed trade exceeds maximum per-trade risk.",
    });

    const remainingPortfolioRiskDollars =
      Math.max(
        0,
        (
          equity *
          mergedConfig
            .maxTotalOpenRiskPercent
        ) /
          100 -
        currentOpenRiskDollars,
      );

    applyConstraint({
      name:
        "MAX_TOTAL_OPEN_RISK",

      allowed:
        remainingPortfolioRiskDollars,

      requested:
        trade.dollarRisk,

      message:
        "Proposed trade would exceed total open portfolio risk.",
    });

    const remainingSymbolExposure =
      Math.max(
        0,
        (
          equity *
          mergedConfig
            .maxSingleSymbolExposurePercent
        ) /
          100 -
        currentSymbolExposure,
      );

    applyConstraint({
      name:
        "MAX_SYMBOL_EXPOSURE",

      allowed:
        remainingSymbolExposure,

      requested:
        trade.positionValue,

      message:
        "Proposed trade would exceed single-symbol concentration.",
    });

    if (
      trade.sector
    ) {
      const remainingSectorExposure =
        Math.max(
          0,
          (
            equity *
            mergedConfig
              .maxSameSectorExposurePercent
          ) /
            100 -
          currentSectorExposure,
        );

      applyConstraint({
        name:
          "MAX_SECTOR_EXPOSURE",

        allowed:
          remainingSectorExposure,

        requested:
          trade.positionValue,

        message:
          "Proposed trade would exceed same-sector concentration.",
      });
    } else if (
      !mergedConfig
        .allowUnknownSector
    ) {
      warnings.push(
        "Trade sector is unavailable.",
      );

      multiplier =
        Math.min(
          multiplier,
          0.5,
        );
    }

    const remainingDirectionalExposure =
      Math.max(
        0,
        (
          equity *
          mergedConfig
            .maxDirectionalExposurePercent
        ) /
          100 -
        sameDirectionExposure,
      );

    applyConstraint({
      name:
        "MAX_DIRECTIONAL_EXPOSURE",

      allowed:
        remainingDirectionalExposure,

      requested:
        trade.positionValue,

      message:
        `Proposed ${trade.side} trade would exceed directional exposure limit.`,
    });

    /**
     * ======================================================
     * FINAL DECISION
     * ======================================================
     */

    if (
      multiplier <
      mergedConfig
        .minimumReductionMultiplier
    ) {
      return {
        approved: false,

        engine:
          "PORTFOLIO_RISK",

        status:
          PORTFOLIO_RISK_STATUS
            .BLOCKED,

        action:
          PORTFOLIO_RISK_ACTION
            .BLOCK,

        canExecute:
          false,

        exposureMultiplier:
          0,

        proposedTrade:
          trade,

        metrics: {
          equity:
            round(
              equity,
              2,
            ),

          currentOpenRiskPercent:
            round(
              currentOpenRiskPercent,
              4,
            ),

          projectedOpenRiskPercent:
            round(
              projectedOpenRiskPercent,
              4,
            ),

          projectedSymbolExposurePercent:
            round(
              projectedSymbolExposurePercent,
              4,
            ),

          projectedSectorExposurePercent:
            round(
              projectedSectorExposurePercent,
              4,
            ),

          projectedDirectionalExposurePercent:
            round(
              projectedDirectionalExposurePercent,
              4,
            ),

          dailyLossPercent:
            round(
              dailyLossPercent,
              4,
            ),

          drawdownPercent:
            round(
              drawdownPercent,
              4,
            ),

          consecutiveLosses:
            resolvedConsecutiveLosses,
        },

        constraints,

        reasons: [
          "Required risk reduction is too severe to permit execution safely.",
        ],

        warnings,

        errors,

        timestamp:
          now(),
      };
    }

    const reducedShares =
      Math.max(
        1,
        Math.floor(
          trade.shares *
          multiplier,
        ),
      );

    const action =
      multiplier <
      1
        ? PORTFOLIO_RISK_ACTION
            .REDUCE
        : PORTFOLIO_RISK_ACTION
            .APPROVE;

    const status =
      multiplier <
      1
        ? PORTFOLIO_RISK_STATUS
            .REDUCED
        : PORTFOLIO_RISK_STATUS
            .APPROVED;

    return {
      approved: true,

      engine:
        "PORTFOLIO_RISK",

      status,

      action,

      canExecute:
        true,

      exposureMultiplier:
        round(
          multiplier,
          6,
        ),

      originalShares:
        trade.shares,

      approvedShares:
        reducedShares,

      proposedTrade:
        trade,

      metrics: {
        equity:
          round(
            equity,
            2,
          ),

        currentOpenRiskPercent:
          round(
            currentOpenRiskPercent,
            4,
          ),

        projectedOpenRiskPercent:
          round(
            projectedOpenRiskPercent,
            4,
          ),

        projectedSymbolExposurePercent:
          round(
            projectedSymbolExposurePercent,
            4,
          ),

        projectedSectorExposurePercent:
          round(
            projectedSectorExposurePercent,
            4,
          ),

        projectedDirectionalExposurePercent:
          round(
            projectedDirectionalExposurePercent,
            4,
          ),

        dailyLossPercent:
          round(
            dailyLossPercent,
            4,
          ),

        drawdownPercent:
          round(
            drawdownPercent,
            4,
          ),

        consecutiveLosses:
          resolvedConsecutiveLosses,
      },

      constraints,

      reasons:
        action ===
        PORTFOLIO_RISK_ACTION
          .APPROVE
          ? [
              "Portfolio risk checks passed.",
            ]
          : [
              "Portfolio risk checks require reduced exposure.",
            ],

      warnings,

      errors,

      timestamp:
        now(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "PORTFOLIO_RISK",

      status:
        PORTFOLIO_RISK_STATUS
          .ERROR,

      action:
        PORTFOLIO_RISK_ACTION
          .BLOCK,

      canExecute:
        false,

      exposureMultiplier:
        0,

      proposedTrade: null,

      metrics: null,

      reasons: [
        "Portfolio risk evaluation failed safely.",
      ],

      warnings: [],

      errors: [
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      ],

      timestamp:
        now(),
    };
  }
}

export default
  evaluatePortfolioRisk;
