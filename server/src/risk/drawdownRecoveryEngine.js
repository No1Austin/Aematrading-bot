// server/src/risk/drawdownRecoveryEngine.js

/**
 * ============================================================
 * DRAWDOWN / LOSS-STREAK RECOVERY ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Apply adaptive de-risking after recent losses or drawdown.
 *
 * This engine is intentionally different from hard portfolio
 * protection:
 *
 * Portfolio Risk:
 * - enforces absolute account-level limits,
 * - may hard-block at configured thresholds.
 *
 * Drawdown Recovery:
 * - gradually reduces exposure as performance deteriorates,
 * - can restore normal sizing as the account recovers,
 * - never increases the incoming share count,
 * - never creates a trade.
 *
 * OUTPUT
 * ------
 * APPROVED
 * REDUCED
 * BLOCKED
 *
 * SAFETY CONTRACT
 * ---------------
 * - Never increases shares.
 * - Never bypasses upstream blocks.
 * - Missing critical account state cannot justify more exposure.
 * - Deterministic for identical inputs.
 */

export const DRAWDOWN_RECOVERY_STATUS =
  Object.freeze({
    APPROVED: "APPROVED",
    REDUCED: "REDUCED",
    BLOCKED: "BLOCKED",
    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
    INVALID_INPUT:
      "INVALID_INPUT",
    ERROR: "ERROR",
  });

export const DRAWDOWN_RECOVERY_ACTION =
  Object.freeze({
    ALLOW: "ALLOW",
    REDUCE: "REDUCE",
    BLOCK: "BLOCK",
  });

export const DRAWDOWN_RECOVERY_MODE =
  Object.freeze({
    NORMAL: "NORMAL",
    CAUTION: "CAUTION",
    DEFENSIVE: "DEFENSIVE",
    RECOVERY: "RECOVERY",
    HALTED: "HALTED",
  });

export const DEFAULT_DRAWDOWN_RECOVERY_CONFIG =
  Object.freeze({
    /**
     * Consecutive loss tiers.
     */
    cautionLossStreak: 2,
    defensiveLossStreak: 3,
    blockLossStreak: 5,

    /**
     * Drawdown tiers expressed in percent.
     */
    cautionDrawdownPercent: 3,
    defensiveDrawdownPercent: 6,
    blockDrawdownPercent: 12,

    /**
     * Recent rolling loss rate tiers.
     * Values are decimals: 0.60 = 60% losing trades.
     */
    recentLossRateReduce: 0.6,
    recentLossRateSevere: 0.75,

    /**
     * Position multipliers.
     */
    cautionMultiplier: 0.75,
    defensiveMultiplier: 0.5,
    recoveryMultiplier: 0.75,

    /**
     * Minimum size that is worth executing.
     */
    minimumExposureMultiplier: 0.2,

    /**
     * Recovery conditions.
     */
    recoveryWinningTrades: 2,
    recoveryDrawdownPercent: 2,

    /**
     * Minimum recent sample before using loss rate.
     */
    minimumRecentTrades: 4,

    /**
     * Missing account equity / peak equity should fail closed.
     */
    requireAccountState: true,
  });

function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function positiveNumber(value) {
  const number =
    finiteNumber(value);

  return (
    number !== null &&
    number > 0
  )
    ? number
    : null;
}

function nonNegativeNumber(value) {
  const number =
    finiteNumber(value);

  return (
    number !== null &&
    number >= 0
  )
    ? number
    : null;
}

function normalizeSide(value) {
  const side =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return (
    side === "LONG" ||
    side === "SHORT"
  )
    ? side
    : null;
}

function clamp(
  value,
  minimum,
  maximum,
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
}

function round(
  value,
  decimals = 6,
) {
  if (
    !Number.isFinite(value)
  ) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      value *
      factor,
    ) /
    factor
  );
}

function resolveConfig(
  config = {},
) {
  return {
    ...DEFAULT_DRAWDOWN_RECOVERY_CONFIG,

    ...(
      config &&
      typeof config === "object"
        ? config
        : {}
    ),
  };
}

function calculateDrawdownPercent({
  equity,
  peakEquity,
}) {
  if (
    equity === null ||
    peakEquity === null ||
    peakEquity <= 0
  ) {
    return null;
  }

  if (
    equity >=
    peakEquity
  ) {
    return 0;
  }

  return (
    (
      peakEquity -
      equity
    ) /
    peakEquity
  ) *
  100;
}

function calculateRecentLossRate(
  recentTrades,
) {
  if (
    !Array.isArray(
      recentTrades,
    ) ||
    recentTrades.length === 0
  ) {
    return null;
  }

  let valid = 0;
  let losses = 0;

  for (
    const trade
    of recentTrades
  ) {
    const outcome =
      String(
        trade
          ?.outcome ??
        trade
          ?.result ??
        "",
      )
        .trim()
        .toUpperCase();

    if (
      outcome === "WIN"
    ) {
      valid += 1;
      continue;
    }

    if (
      outcome === "LOSS"
    ) {
      valid += 1;
      losses += 1;
    }
  }

  if (
    valid === 0
  ) {
    return null;
  }

  return losses / valid;
}

function countRecentWinningTrades(
  recentTrades,
) {
  if (
    !Array.isArray(
      recentTrades,
    )
  ) {
    return 0;
  }

  let count = 0;

  for (
    let index =
      recentTrades.length - 1;
    index >= 0;
    index -= 1
  ) {
    const outcome =
      String(
        recentTrades[index]
          ?.outcome ??
        recentTrades[index]
          ?.result ??
        "",
      )
        .trim()
        .toUpperCase();

    if (
      outcome === "WIN"
    ) {
      count += 1;
      continue;
    }

    if (
      outcome === "LOSS"
    ) {
      break;
    }
  }

  return count;
}

function buildBlockedResult({
  status =
    DRAWDOWN_RECOVERY_STATUS
      .BLOCKED,
  reason,
  originalShares = 0,
  metrics = null,
  mode =
    DRAWDOWN_RECOVERY_MODE
      .HALTED,
  warnings = [],
  errors = [],
} = {}) {
  return {
    approved: false,

    engine:
      "DRAWDOWN_RECOVERY",

    status,

    action:
      DRAWDOWN_RECOVERY_ACTION
        .BLOCK,

    mode,

    canExecute: false,

    exposureMultiplier: 0,

    originalShares,

    approvedShares: 0,

    metrics,

    reasons:
      reason
        ? [reason]
        : [],

    warnings,

    errors,
  };
}

/**
 * ============================================================
 * EVALUATE DRAWDOWN RECOVERY
 * ============================================================
 *
 * proposedTrade:
 * {
 *   symbol,
 *   side,
 *   shares,
 *   entryPrice
 * }
 *
 * account:
 * {
 *   equity,
 *   peakEquity,
 *   startingEquity,
 *   consecutiveLosses,
 *   recentTrades
 * }
 */
export function evaluateDrawdownRecovery({
  proposedTrade = null,
  account = null,
  recentTrades = null,
  config = {},
} = {}) {
  try {
    const cfg =
      resolveConfig(
        config,
      );

    const symbol =
      String(
        proposedTrade
          ?.symbol ??
        "",
      )
        .trim()
        .toUpperCase();

    const side =
      normalizeSide(
        proposedTrade
          ?.side,
      );

    const originalShares =
      positiveNumber(
        proposedTrade
          ?.shares,
      );

    const entryPrice =
      positiveNumber(
        proposedTrade
          ?.entryPrice ??
        proposedTrade
          ?.currentPrice,
      );

    if (
      !symbol ||
      !side ||
      originalShares === null ||
      entryPrice === null
    ) {
      return buildBlockedResult({
        status:
          DRAWDOWN_RECOVERY_STATUS
            .INVALID_INPUT,

        reason:
          "Valid proposed trade symbol, side, shares, and entry price are required.",

        originalShares:
          originalShares ?? 0,
      });
    }

    const equity =
      positiveNumber(
        account
          ?.equity ??
        account
          ?.balance,
      );

    const peakEquity =
      positiveNumber(
        account
          ?.peakEquity ??
        account
          ?.highWaterMark ??
        account
          ?.startingEquity,
      );

    if (
      cfg
        .requireAccountState ===
        true &&
      (
        equity === null ||
        peakEquity === null
      )
    ) {
      return buildBlockedResult({
        status:
          DRAWDOWN_RECOVERY_STATUS
            .INSUFFICIENT_DATA,

        reason:
          "Account equity and peak equity are required for drawdown recovery evaluation.",

        originalShares,

        warnings: [
          "Missing account state was not treated as healthy recovery conditions.",
        ],
      });
    }

    const consecutiveLosses =
      Math.max(
        0,
        Number(
          nonNegativeNumber(
            account
              ?.consecutiveLosses,
          ) ??
          0,
        ),
      );

    const trades =
      Array.isArray(
        recentTrades,
      )
        ? recentTrades
        : (
            Array.isArray(
              account
                ?.recentTrades,
            )
              ? account
                  .recentTrades
              : []
          );

    const drawdownPercent =
      calculateDrawdownPercent({
        equity,

        peakEquity,
      });

    const recentLossRate =
      calculateRecentLossRate(
        trades,
      );

    const trailingWins =
      countRecentWinningTrades(
        trades,
      );

    const validRecentTrades =
      trades.filter(
        (trade) => {
          const outcome =
            String(
              trade
                ?.outcome ??
              trade
                ?.result ??
              "",
            )
              .trim()
              .toUpperCase();

          return (
            outcome === "WIN" ||
            outcome === "LOSS"
          );
        },
      ).length;

    const metrics = {
      equity,

      peakEquity,

      drawdownPercent:
        round(
          drawdownPercent,
          6,
        ),

      consecutiveLosses,

      recentLossRate:
        round(
          recentLossRate,
          6,
        ),

      recentTradeCount:
        validRecentTrades,

      trailingWins,
    };

    /**
     * ======================================================
     * HARD BLOCK CONDITIONS
     * ======================================================
     */

    if (
      consecutiveLosses >=
      cfg
        .blockLossStreak
    ) {
      return buildBlockedResult({
        reason:
          "Consecutive loss streak reached the configured recovery halt threshold.",

        originalShares,

        metrics,
      });
    }

    if (
      drawdownPercent !==
        null &&
      drawdownPercent >=
        cfg
          .blockDrawdownPercent
    ) {
      return buildBlockedResult({
        reason:
          "Account drawdown reached the configured recovery halt threshold.",

        originalShares,

        metrics,
      });
    }

    /**
     * ======================================================
     * ADAPTIVE REDUCTION
     * ======================================================
     */

    let multiplier = 1;

    let mode =
      DRAWDOWN_RECOVERY_MODE
        .NORMAL;

    const reasons = [];

    const applyCaution =
      (reason) => {
        multiplier =
          Math.min(
            multiplier,
            clamp(
              cfg
                .cautionMultiplier,
              0,
              1,
            ),
          );

        mode =
          mode ===
          DRAWDOWN_RECOVERY_MODE
            .DEFENSIVE
            ? mode
            : DRAWDOWN_RECOVERY_MODE
                .CAUTION;

        reasons.push(
          reason,
        );
      };

    const applyDefensive =
      (reason) => {
        multiplier =
          Math.min(
            multiplier,
            clamp(
              cfg
                .defensiveMultiplier,
              0,
              1,
            ),
          );

        mode =
          DRAWDOWN_RECOVERY_MODE
            .DEFENSIVE;

        reasons.push(
          reason,
        );
      };

    if (
      consecutiveLosses >=
      cfg
        .defensiveLossStreak
    ) {
      applyDefensive(
        "Recent consecutive losses require defensive sizing.",
      );
    } else if (
      consecutiveLosses >=
      cfg
        .cautionLossStreak
    ) {
      applyCaution(
        "Recent consecutive losses require cautious sizing.",
      );
    }

    if (
      drawdownPercent !==
        null
    ) {
      if (
        drawdownPercent >=
        cfg
          .defensiveDrawdownPercent
      ) {
        applyDefensive(
          "Current account drawdown requires defensive sizing.",
        );
      } else if (
        drawdownPercent >=
        cfg
          .cautionDrawdownPercent
      ) {
        applyCaution(
          "Current account drawdown requires cautious sizing.",
        );
      }
    }

    if (
      recentLossRate !==
        null &&
      validRecentTrades >=
        cfg
          .minimumRecentTrades
    ) {
      if (
        recentLossRate >=
        cfg
          .recentLossRateSevere
      ) {
        applyDefensive(
          "Recent rolling loss rate requires defensive sizing.",
        );
      } else if (
        recentLossRate >=
        cfg
          .recentLossRateReduce
      ) {
        applyCaution(
          "Recent rolling loss rate requires cautious sizing.",
        );
      }
    }

    /**
     * ======================================================
     * RECOVERY MODE
     * ======================================================
     *
     * Recovery does not increase incoming exposure.
     * It only identifies when the account has improved enough
     * to use the configured recovery cap.
     */

    const recovering =
      (
        drawdownPercent !==
          null &&
        drawdownPercent <=
          cfg
            .recoveryDrawdownPercent
      ) &&
      trailingWins >=
        cfg
          .recoveryWinningTrades &&
      consecutiveLosses ===
        0;

    if (
      recovering &&
      multiplier === 1
    ) {
      multiplier =
        Math.min(
          1,
          clamp(
            cfg
              .recoveryMultiplier,
            0,
            1,
          ),
        );

      mode =
        DRAWDOWN_RECOVERY_MODE
          .RECOVERY;

      reasons.push(
        "Account is recovering; exposure remains capped until recovery is confirmed.",
      );
    }

    multiplier =
      clamp(
        multiplier,
        0,
        1,
      );

    if (
      multiplier <
      cfg
        .minimumExposureMultiplier
    ) {
      return buildBlockedResult({
        reason:
          "Required recovery sizing is below the minimum executable exposure.",

        originalShares,

        metrics,

        mode:
          DRAWDOWN_RECOVERY_MODE
            .HALTED,
      });
    }

    const approvedShares =
      Math.min(
        originalShares,

        Math.max(
          1,

          Math.floor(
            originalShares *
            multiplier,
          ),
        ),
      );

    if (
      approvedShares <
      originalShares
    ) {
      return {
        approved: true,

        engine:
          "DRAWDOWN_RECOVERY",

        status:
          DRAWDOWN_RECOVERY_STATUS
            .REDUCED,

        action:
          DRAWDOWN_RECOVERY_ACTION
            .REDUCE,

        mode,

        canExecute: true,

        exposureMultiplier:
          round(
            approvedShares /
            originalShares,
            6,
          ),

        originalShares,

        approvedShares,

        metrics,

        reasons,

        warnings: [],

        errors: [],
      };
    }

    return {
      approved: true,

      engine:
        "DRAWDOWN_RECOVERY",

      status:
        DRAWDOWN_RECOVERY_STATUS
          .APPROVED,

      action:
        DRAWDOWN_RECOVERY_ACTION
          .ALLOW,

      mode,

      canExecute: true,

      exposureMultiplier: 1,

      originalShares,

      approvedShares:
        originalShares,

      metrics,

      reasons:
        reasons.length > 0
          ? reasons
          : [
              "Drawdown and recent loss conditions are within normal exposure limits.",
            ],

      warnings: [],

      errors: [],
    };
  } catch (error) {
    return buildBlockedResult({
      status:
        DRAWDOWN_RECOVERY_STATUS
          .ERROR,

      reason:
        "Drawdown recovery evaluation failed safely.",

      errors: [
        error?.message ??
        "Unknown drawdown recovery error.",
      ],
    });
  }
}

export default
  evaluateDrawdownRecovery;
