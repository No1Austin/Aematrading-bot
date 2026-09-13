import updateTrailingPosition from "../risk/trailingEngine.js";

import analyzeTradeThesis, {
  EXPOSURE_ACTION,
} from "../analysis/tradeThesisMonitor.js";

import {
  updatePaperPosition,
  reducePaperPosition,
  closePaperPosition,
  PAPER_POSITION_STATUS,
} from "./paperBroker.js";

/**
 * ============================================================
 * POSITION MANAGER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Manage an already-open paper position.
 *
 * For every new market price:
 *
 * 1. Update unrealized P&L.
 * 2. Update best price.
 * 3. Run trailing-loss logic.
 * 4. Run trailing-gain / profit-lock logic.
 * 5. Check stop trigger.
 * 6. Check target trigger.
 * 7. Close paper position when required.
 *
 * SAFE FAIL
 * ---------
 *
 * If trailing or position management fails:
 *
 * - do not invent a new stop
 * - do not mark the trade as profitable
 * - preserve the current known position state
 * - surface the failure clearly
 */

/**
 * ============================================================
 * POSITION MANAGER STATUS
 * ============================================================
 */

export const POSITION_MANAGER_STATUS =
  Object.freeze({
    UPDATED: "UPDATED",

    REDUCED: "REDUCED",

    EXITED: "EXITED",

    HOLDING: "HOLDING",

    ERROR: "ERROR",

    INVALID_POSITION:
      "INVALID_POSITION",
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
      ) *
        factor,
    ) / factor
  );
}

/**
 * ============================================================
 * TARGET CHECK
 * ============================================================
 */

function isTargetTriggered({
  side,
  currentPrice,
  targetPrice,
}) {
  if (
    !positiveNumber(
      currentPrice,
    ) ||
    !positiveNumber(
      targetPrice,
    )
  ) {
    return false;
  }

  if (side === "LONG") {
    return (
      Number(currentPrice) >=
      Number(targetPrice)
    );
  }

  if (side === "SHORT") {
    return (
      Number(currentPrice) <=
      Number(targetPrice)
    );
  }

  return false;
}

/**
 * ============================================================
 * ORIGINAL RISK
 * ============================================================
 */

function calculateOriginalRiskPerShare({
  entryPrice,
  initialStopPrice,
}) {
  if (
    !positiveNumber(
      entryPrice,
    ) ||
    !positiveNumber(
      initialStopPrice,
    )
  ) {
    return null;
  }

  const risk =
    Math.abs(
      Number(entryPrice) -
      Number(initialStopPrice),
    );

  return risk > 0
    ? risk
    : null;
}

/**
 * ============================================================
 * BUILD TRAILING STATE
 * ============================================================
 *
 * We preserve trailing-engine state inside:
 *
 * position.trailingState
 *
 * This lets each price update continue from the previous one.
 */

function buildTrailingInputs({
  position,
  currentPrice,
  atr,
}) {
  const trailingState =
    position
      ?.trailingState ??
    {};

  const initialStopPrice =
    positiveNumber(
      trailingState
        .initialStopPrice,
    )
      ? Number(
          trailingState
            .initialStopPrice,
        )
      : Number(
          position.stopPrice,
        );

  const originalRiskPerShare =
    positiveNumber(
      trailingState
        .originalRiskPerShare,
    )
      ? Number(
          trailingState
            .originalRiskPerShare,
        )
      : calculateOriginalRiskPerShare({
          entryPrice:
            position.entryPrice,

          initialStopPrice,
        });

  return {
    side:
      position.side,

    entryPrice:
      Number(
        position.entryPrice,
      ),

    currentPrice:
      Number(
        currentPrice,
      ),

    previousBestPrice:
      positiveNumber(
        trailingState
          .bestPrice,
      )
        ? Number(
            trailingState
              .bestPrice,
          )
        : Number(
            position.bestPrice ??
            position.entryPrice,
          ),

    currentStopPrice:
      positiveNumber(
        trailingState
          .currentStopPrice,
      )
        ? Number(
            trailingState
              .currentStopPrice,
          )
        : Number(
            position.stopPrice,
          ),

    initialStopPrice,

    originalRiskPerShare,

    atr:
      positiveNumber(atr)
        ? Number(atr)
        : null,

    previousPeakR:
      isFiniteNumber(
        trailingState.peakR,
      )
        ? Number(
            trailingState
              .peakR,
          )
        : 0,

    previousHighestLockedR:
      isFiniteNumber(
        trailingState
          .highestLockedR,
      )
        ? Number(
            trailingState
              .highestLockedR,
          )
        : null,

    previousStopSource:
      trailingState
        .stopSource ??
      "INITIAL_STOP",
  };
}

/**
 * ============================================================
 * UPDATE TRAILING STATE
 * ============================================================
 */

function mergeTrailingState({
  position,
  trailingResult,
}) {
  return {
    ...position,

    stopPrice:
      positiveNumber(
        trailingResult
          ?.currentStopPrice,
      )
        ? Number(
            trailingResult
              .currentStopPrice,
          )
        : position.stopPrice,

    bestPrice:
      positiveNumber(
        trailingResult
          ?.bestPrice,
      )
        ? Number(
            trailingResult
              .bestPrice,
          )
        : position.bestPrice,

    trailingState: {
      initialStopPrice:
        trailingResult
          ?.initialStopPrice ??
        position
          ?.trailingState
          ?.initialStopPrice ??
        position.stopPrice,

      originalRiskPerShare:
        trailingResult
          ?.originalRiskPerShare ??
        position
          ?.trailingState
          ?.originalRiskPerShare ??
        null,

      bestPrice:
        trailingResult
          ?.bestPrice ??
        position.bestPrice,

      currentStopPrice:
        trailingResult
          ?.currentStopPrice ??
        position.stopPrice,

      peakR:
        isFiniteNumber(
          trailingResult?.peakR,
        )
          ? Number(
              trailingResult
                .peakR,
            )
          : position
              ?.trailingState
              ?.peakR ??
            0,

      highestLockedR:
        isFiniteNumber(
          trailingResult
            ?.highestLockedR,
        )
          ? Number(
              trailingResult
                .highestLockedR,
            )
          : position
              ?.trailingState
              ?.highestLockedR ??
            null,

      stopSource:
        trailingResult
          ?.stopSource ??
        position
          ?.trailingState
          ?.stopSource ??
        "INITIAL_STOP",

      currentR:
        isFiniteNumber(
          trailingResult
            ?.currentR,
        )
          ? Number(
              trailingResult
                .currentR,
            )
          : null,

      profitPercent:
        isFiniteNumber(
          trailingResult
            ?.profitPercent,
        )
          ? Number(
              trailingResult
                .profitPercent,
            )
          : null,

      trailingLossActive:
        trailingResult
          ?.trailingLossActive ===
        true,

      trailingGainActive:
        trailingResult
          ?.trailingGainActive ===
        true,

      updatedAt:
        new Date()
          .toISOString(),
    },
  };
}

/**
 * ============================================================
 * MAIN POSITION UPDATE
 * ============================================================
 *
 * SAFETY ORDER
 * ------------
 * 1. Validate immutable position / price state.
 * 2. Update paper P&L.
 * 3. Run trailing protection.
 * 4. Honor hard price exits first (target / stop / trailing).
 * 5. Only if no hard exit is active, monitor the entry thesis.
 * 6. Thesis invalidation may fully exit.
 * 7. Thesis deterioration may only REDUCE exposure.
 * 8. Exposure is never automatically increased after a reduction.
 *
 * IMPORTANT
 * ---------
 * Thesis exposure actions are treated as TARGET exposure levels
 * measured against originalShares. They are NOT repeated percentage
 * reductions against the current position.
 */

export async function manageOpenPosition({
  position,
  currentPrice,
  atr = null,
  slippagePercent = null,

  /**
   * Preferred current-intelligence package.
   *
   * The coordinator can pass the full set as one object.
   */
  intelligence = null,

  /**
   * Backward-compatible individual inputs.
   */
  technical = null,
  macro = null,
  marketRegime = null,
  events = null,
  company = null,
  country = null,
  social = null,
  historical = null,
  liquidity = null,
  consensus = null,

  /**
   * false = price protection only.
   * true  = price protection + thesis monitoring.
   */
  monitorThesis = false,

  asOfTimestamp = new Date().toISOString(),
} = {}) {
  const timestamp = () => new Date().toISOString();

  const errorResult = ({
    status = POSITION_MANAGER_STATUS.ERROR,
    managedPosition = position ?? null,
    message,
    errors = null,
    warnings = [],
    shouldExit = false,
    exitReason = null,
    trailing = null,
    thesis = null,
  }) => ({
    approved: false,
    engine: "POSITION_MANAGER",
    status,
    position: managedPosition,
    shouldExit,
    exitReason,
    trailing,
    thesis,
    errors: Array.isArray(errors) && errors.length > 0
      ? errors
      : [message ?? "Position management failed."],
    warnings,
    timestamp: timestamp(),
  });

  try {
    /**
     * ======================================================
     * VALIDATION — FAIL CLOSED ON INVALID INPUT
     * ======================================================
     */

    if (!position || typeof position !== "object") {
      return errorResult({
        status: POSITION_MANAGER_STATUS.INVALID_POSITION,
        managedPosition: null,
        message: "Position is required.",
      });
    }

    if (position.status !== PAPER_POSITION_STATUS.OPEN) {
      return errorResult({
        status: POSITION_MANAGER_STATUS.INVALID_POSITION,
        message: "Position must be OPEN.",
      });
    }

    if (!positiveNumber(position.shares)) {
      return errorResult({
        status: POSITION_MANAGER_STATUS.INVALID_POSITION,
        message: "Open position must contain a positive share quantity.",
      });
    }

    if (!positiveNumber(position.entryPrice)) {
      return errorResult({
        status: POSITION_MANAGER_STATUS.INVALID_POSITION,
        message: "Open position must contain a valid entry price.",
      });
    }

    if (position.side !== "LONG" && position.side !== "SHORT") {
      return errorResult({
        status: POSITION_MANAGER_STATUS.INVALID_POSITION,
        message: "Open position side must be LONG or SHORT.",
      });
    }

    if (!positiveNumber(currentPrice)) {
      return errorResult({
        message: "Valid current price is required.",
      });
    }

    if (
      slippagePercent !== null &&
      slippagePercent !== undefined &&
      (!isFiniteNumber(slippagePercent) || Number(slippagePercent) < 0)
    ) {
      return errorResult({
        message: "Slippage percent must be a finite non-negative number when supplied.",
      });
    }

    const resolvedAsOfTimestamp = (() => {
      const parsed = new Date(asOfTimestamp);
      return Number.isNaN(parsed.getTime())
        ? timestamp()
        : parsed.toISOString();
    })();

    /**
     * ======================================================
     * NORMALIZE CURRENT INTELLIGENCE
     * ======================================================
     *
     * Support both:
     *
     * manageOpenPosition({ intelligence: {...} })
     *
     * and the older individual-argument interface.
     */

    const currentIntelligence = {
      technical:
        technical ??
        intelligence?.technical ??
        null,

      macro:
        macro ??
        intelligence?.macro ??
        null,

      marketRegime:
        marketRegime ??
        intelligence?.marketRegime ??
        null,

      events:
        events ??
        intelligence?.events ??
        null,

      company:
        company ??
        intelligence?.company ??
        null,

      country:
        country ??
        intelligence?.country ??
        null,

      social:
        social ??
        intelligence?.social ??
        null,

      historical:
        historical ??
        intelligence?.historical ??
        null,

      liquidity:
        liquidity ??
        intelligence?.liquidity ??
        null,

      consensus:
        consensus ??
        intelligence?.consensus ??
        null,
    };

    /**
     * ======================================================
     * UPDATE PAPER P&L FIRST
     * ======================================================
     */

    const paperUpdate = updatePaperPosition({
      position,
      currentPrice,
    });

    if (paperUpdate?.approved !== true || !paperUpdate?.position) {
      return errorResult({
        message: "Paper position update failed.",
        errors: paperUpdate?.errors,
        warnings: [
          "The known position state was preserved because mark-to-market updating failed.",
        ],
      });
    }

    let workingPosition = paperUpdate.position;

    /**
     * ======================================================
     * RUN TRAILING ENGINE
     * ======================================================
     */

    const trailingInputs = buildTrailingInputs({
      position: workingPosition,
      currentPrice,
      atr,
    });

    if (!positiveNumber(trailingInputs.originalRiskPerShare)) {
      return errorResult({
        managedPosition: workingPosition,
        message: "Unable to determine original risk per share.",
        warnings: [
          "Position remains open because trailing state could not be safely calculated.",
        ],
      });
    }

    const trailingResult = updateTrailingPosition(trailingInputs);

    if (trailingResult?.approved !== true) {
      return errorResult({
        managedPosition: workingPosition,
        message: "Trailing engine failed.",
        errors: trailingResult?.errors,
        trailing: trailingResult,
        warnings: [
          "Position was not automatically closed because trailing analysis failed.",
        ],
      });
    }

    workingPosition = mergeTrailingState({
      position: workingPosition,
      trailingResult,
    });

    /**
     * ======================================================
     * HARD EXIT CHECKS — HIGHEST PRIORITY
     * ======================================================
     */

    const targetTriggered = isTargetTriggered({
      side: workingPosition.side,
      currentPrice,
      targetPrice: workingPosition.targetPrice,
    });

    const trailingExit = trailingResult?.exit?.shouldExit === true;
    const stopTriggered = trailingResult?.stopTriggered === true;
    const hardExitTriggered =
      targetTriggered || trailingExit || stopTriggered;

    if (hardExitTriggered) {
      let exitReason = "TRAILING_EXIT";

      if (targetTriggered) {
        exitReason = "TARGET_REACHED";
      } else if (trailingResult?.exit?.reason) {
        exitReason = trailingResult.exit.reason;
      } else if (stopTriggered) {
        exitReason = "STOP_TRIGGERED";
      }

      const closeResult = closePaperPosition({
        position: workingPosition,
        currentPrice,
        reason: exitReason,
        slippagePercent,
      });

      if (closeResult?.approved !== true || !closeResult?.position) {
        return errorResult({
          managedPosition: workingPosition,
          shouldExit: true,
          exitReason,
          trailing: trailingResult,
          message: "Paper position close failed.",
          errors: closeResult?.errors,
          warnings: [
            "A mandatory exit was triggered but the paper broker failed to close the position. The caller should block new exposure and retry/reconcile execution state.",
          ],
        });
      }

      return {
        approved: true,
        engine: "POSITION_MANAGER",
        status: POSITION_MANAGER_STATUS.EXITED,
        position: closeResult.position,
        shouldExit: true,
        exitReason,
        trailing: trailingResult,
        thesis: null,
        execution: closeResult.execution ?? null,
        metrics: {
          entryPrice: round(workingPosition.entryPrice, 4),
          exitPrice: round(closeResult?.execution?.exitPrice, 4),
          realizedPnL: round(closeResult?.position?.realizedPnL, 2),
          finalR: isFiniteNumber(trailingResult?.currentR)
            ? round(trailingResult.currentR, 4)
            : null,
          peakR: isFiniteNumber(trailingResult?.peakR)
            ? round(trailingResult.peakR, 4)
            : null,
          highestLockedR: isFiniteNumber(trailingResult?.highestLockedR)
            ? round(trailingResult.highestLockedR, 4)
            : null,
        },
        warnings: [],
        errors: [],
        timestamp: timestamp(),
      };
    }

    /**
     * ======================================================
     * RESOLVE IMMUTABLE ENTRY / EXPOSURE STATE
     * ======================================================
     */

    const entryThesis =
      workingPosition?.entryThesis ??
      workingPosition?.metadata?.entryThesis ??
      null;

    // Prefer a value persisted when the trade opened. Falling back to
    // current shares keeps legacy positions manageable, but means thesis
    // reductions should not occur until an entry thesis exists.
    const originalSharesCandidate =
      workingPosition?.originalShares ??
      workingPosition?.metadata?.originalShares ??
      entryThesis?.originalShares ??
      workingPosition.shares;

    const originalShares = positiveNumber(originalSharesCandidate)
      ? Math.floor(Number(originalSharesCandidate))
      : Math.floor(Number(workingPosition.shares));

    const remainingShares = Math.floor(Number(workingPosition.shares));

    if (originalShares < remainingShares) {
      return errorResult({
        managedPosition: workingPosition,
        trailing: trailingResult,
        message: "Original share count cannot be smaller than remaining shares.",
        warnings: [
          "Exposure state is inconsistent. Thesis-based resizing was blocked.",
        ],
      });
    }

    const currentExposureMultiplier =
      originalShares > 0
        ? clamp(remainingShares / originalShares, 0, 1)
        : 1;

    // Persist originalShares once resolved so subsequent calls remain
    // idempotent even after partial reductions.
    workingPosition = {
      ...workingPosition,
      originalShares,
    };

    /**
     * ======================================================
     * PRICE-SAFETY-ONLY PASS
     * ======================================================
     *
     * Used before fresh intelligence is available.
     *
     * Hard exits have already been evaluated above.
     * Do NOT run thesis logic with missing/stale evidence.
     */

    if (monitorThesis !== true) {
      return {
        approved: true,
        engine: "POSITION_MANAGER",
        status: POSITION_MANAGER_STATUS.HOLDING,
        position: workingPosition,
        shouldExit: false,
        exitReason: null,
        trailing: trailingResult,
        thesis: null,
        thesisMonitoringRequested: false,
        metrics: {
          currentPrice: Number(currentPrice),
          originalShares,
          remainingShares,
          exposureMultiplier: round(
            currentExposureMultiplier,
            4,
          ),
          currentR: isFiniteNumber(
            trailingResult?.currentR,
          )
            ? round(
                trailingResult.currentR,
                4,
              )
            : null,
          peakR: isFiniteNumber(
            trailingResult?.peakR,
          )
            ? round(
                trailingResult.peakR,
                4,
              )
            : null,
          currentStop: positiveNumber(
            trailingResult?.currentStopPrice,
          )
            ? round(
                trailingResult.currentStopPrice,
                4,
              )
            : null,
          realizedPnL: round(
            workingPosition.realizedPnL,
            2,
          ),
          unrealizedPnL: round(
            workingPosition.unrealizedPnL,
            2,
          ),
        },
        warnings: [],
        errors: [],
        timestamp: timestamp(),
      };
    }

    /**
     * ======================================================
     * THESIS MONITOR
     * ======================================================
     *
     * Missing/invalid thesis intelligence must NEVER increase exposure.
     * For legacy positions without an entry thesis we simply HOLD and
     * surface the missing monitoring state.
     */

    let thesisResult = null;

    if (entryThesis) {
      try {
        thesisResult = analyzeTradeThesis({
          symbol: workingPosition.symbol,
          side: workingPosition.side,
          entryThesis,
          originalShares,
          remainingShares,
          currentExposureMultiplier,
          technical:
            currentIntelligence.technical,
          macro:
            currentIntelligence.macro,
          marketRegime:
            currentIntelligence.marketRegime,
          events:
            currentIntelligence.events,
          company:
            currentIntelligence.company,
          country:
            currentIntelligence.country,
          social:
            currentIntelligence.social,
          historical:
            currentIntelligence.historical,
          liquidity:
            currentIntelligence.liquidity,
          consensus:
            currentIntelligence.consensus,
          asOfTimestamp: resolvedAsOfTimestamp,
        });
      } catch (thesisError) {
        thesisResult = {
          approved: false,
          engine: "TRADE_THESIS_MONITOR",
          status: "ERROR",
          thesisStatus: null,
          exposureAction: EXPOSURE_ACTION.HOLD,
          recommendedExposureMultiplier: currentExposureMultiplier,
          reasons: [],
          warnings: [
            "Trade thesis monitoring threw an exception. Existing exposure was preserved and no exposure was added.",
          ],
          errors: [
            thesisError instanceof Error
              ? thesisError.message
              : String(thesisError),
          ],
          timestamp: timestamp(),
        };
      }
    } else {
      thesisResult = {
        approved: false,
        engine: "TRADE_THESIS_MONITOR",
        status: "INSUFFICIENT_DATA",
        thesisStatus: null,
        exposureAction: EXPOSURE_ACTION.HOLD,
        recommendedExposureMultiplier: currentExposureMultiplier,
        reasons: ["Entry thesis snapshot is unavailable."],
        warnings: [
          "Legacy/open position has no immutable entry thesis. Thesis-based reduction is disabled for this update.",
        ],
        errors: [],
        timestamp: timestamp(),
      };
    }

    // Never trust a monitor recommendation that asks for more exposure.
    const rawRecommendedMultiplier = isFiniteNumber(
      thesisResult?.recommendedExposureMultiplier,
    )
      ? clamp(Number(thesisResult.recommendedExposureMultiplier), 0, 1)
      : currentExposureMultiplier;

    const safeRecommendedMultiplier = Math.min(
      currentExposureMultiplier,
      rawRecommendedMultiplier,
    );

    workingPosition = {
      ...workingPosition,
      thesisState: {
        ...(workingPosition?.thesisState ?? {}),
        thesisStatus: thesisResult?.thesisStatus ?? null,
        exposureAction:
          thesisResult?.exposureAction ?? EXPOSURE_ACTION.HOLD,
        convictionScore: isFiniteNumber(thesisResult?.convictionScore)
          ? round(thesisResult.convictionScore, 4)
          : null,
        deteriorationScore: isFiniteNumber(thesisResult?.deteriorationScore)
          ? round(thesisResult.deteriorationScore, 4)
          : null,
        oppositeDirectionStrength: isFiniteNumber(
          thesisResult?.oppositeDirectionStrength,
        )
          ? round(thesisResult.oppositeDirectionStrength, 4)
          : null,
        currentExposureMultiplier: round(currentExposureMultiplier, 4),
        recommendedExposureMultiplier: round(
          safeRecommendedMultiplier,
          4,
        ),
        checkedAt: resolvedAsOfTimestamp,
      },
    };

    /**
     * ======================================================
     * THESIS INVALIDATION — FULL EXIT
     * ======================================================
     */

    if (
      thesisResult?.approved === true &&
      thesisResult?.exposureAction === EXPOSURE_ACTION.EXIT
    ) {
      const thesisCloseResult = closePaperPosition({
        position: workingPosition,
        currentPrice,
        reason: "THESIS_INVALIDATED",
        slippagePercent,
      });

      if (
        thesisCloseResult?.approved !== true ||
        !thesisCloseResult?.position
      ) {
        return errorResult({
          managedPosition: workingPosition,
          shouldExit: true,
          exitReason: "THESIS_INVALIDATED",
          trailing: trailingResult,
          thesis: thesisResult,
          message: "Thesis invalidation exit failed.",
          errors: thesisCloseResult?.errors,
          warnings: [
            "The trade thesis was invalidated but the paper broker failed to close the position. The caller should block new exposure and reconcile the position.",
          ],
        });
      }

      return {
        approved: true,
        engine: "POSITION_MANAGER",
        status: POSITION_MANAGER_STATUS.EXITED,
        position: thesisCloseResult.position,
        shouldExit: true,
        exitReason: "THESIS_INVALIDATED",
        trailing: trailingResult,
        thesis: thesisResult,
        execution: thesisCloseResult.execution ?? null,
        metrics: {
          originalShares,
          remainingShares: 0,
          exposureMultiplier: 0,
          entryPrice: round(workingPosition.entryPrice, 4),
          exitPrice: round(thesisCloseResult?.execution?.exitPrice, 4),
          realizedPnL: round(thesisCloseResult?.position?.realizedPnL, 2),
          finalR: isFiniteNumber(trailingResult?.currentR)
            ? round(trailingResult.currentR, 4)
            : null,
          peakR: isFiniteNumber(trailingResult?.peakR)
            ? round(trailingResult.peakR, 4)
            : null,
        },
        warnings: thesisResult?.warnings ?? [],
        errors: [],
        timestamp: timestamp(),
      };
    }

    /**
     * ======================================================
     * THESIS REDUCTION — TARGET EXPOSURE, IDEMPOTENT
     * ======================================================
     */

    const reductionAction =
      thesisResult?.exposureAction === EXPOSURE_ACTION.REDUCE_25 ||
      thesisResult?.exposureAction === EXPOSURE_ACTION.REDUCE_50 ||
      thesisResult?.exposureAction === EXPOSURE_ACTION.REDUCE_75;

    if (thesisResult?.approved === true && reductionAction) {
      const targetShares = Math.max(
        0,
        Math.floor(originalShares * safeRecommendedMultiplier),
      );

      const sharesToRemove = Math.max(
        0,
        remainingShares - targetShares,
      );

      // If already at or below the target, do nothing. This is what makes
      // repeated REDUCE_25 / REDUCE_50 / REDUCE_75 signals idempotent.
      if (sharesToRemove > 0) {
        if (targetShares <= 0 || sharesToRemove >= remainingShares) {
          const closeResult = closePaperPosition({
            position: workingPosition,
            currentPrice,
            reason: thesisResult.exposureAction,
            slippagePercent,
          });

          if (closeResult?.approved !== true || !closeResult?.position) {
            return errorResult({
              managedPosition: workingPosition,
              shouldExit: true,
              exitReason: thesisResult.exposureAction,
              trailing: trailingResult,
              thesis: thesisResult,
              message: "Thesis exposure reduction resolved to a full exit, but closing failed.",
              errors: closeResult?.errors,
              warnings: [
                "Required exposure could not be safely reduced. New exposure should remain blocked until reconciliation.",
              ],
            });
          }

          return {
            approved: true,
            engine: "POSITION_MANAGER",
            status: POSITION_MANAGER_STATUS.EXITED,
            position: closeResult.position,
            shouldExit: true,
            exitReason: thesisResult.exposureAction,
            trailing: trailingResult,
            thesis: thesisResult,
            execution: closeResult.execution ?? null,
            metrics: {
              originalShares,
              remainingShares: 0,
              exposureMultiplier: 0,
              realizedPnL: round(closeResult?.position?.realizedPnL, 2),
            },
            warnings: thesisResult?.warnings ?? [],
            errors: [],
            timestamp: timestamp(),
          };
        }

        const reductionPercent = clamp(
          sharesToRemove / remainingShares,
          0,
          1,
        );

        const reductionResult = reducePaperPosition({
          position: workingPosition,
          currentPrice,
          reductionPercent,
          reason: thesisResult.exposureAction,
          slippagePercent,
        });

        if (
          reductionResult?.approved !== true ||
          !reductionResult?.position
        ) {
          return errorResult({
            managedPosition: workingPosition,
            trailing: trailingResult,
            thesis: thesisResult,
            message: "Thesis exposure reduction failed.",
            errors: reductionResult?.errors,
            warnings: [
              "The thesis monitor requested lower exposure, but the paper broker could not safely reduce the position. No additional exposure was added.",
            ],
          });
        }

        const reducedShares = Math.floor(
          Number(reductionResult.position.shares),
        );

        // Broker post-condition: a reduction must never increase shares.
        if (reducedShares >= remainingShares || reducedShares < 0) {
          return errorResult({
            managedPosition: workingPosition,
            trailing: trailingResult,
            thesis: thesisResult,
            message: "Paper broker returned an invalid post-reduction share count.",
            warnings: [
              "Reduction result was rejected because it violated the monotonic exposure invariant.",
            ],
          });
        }

        workingPosition = {
          ...reductionResult.position,
          originalShares,
          thesisState: {
            ...workingPosition.thesisState,
            appliedExposureMultiplier: round(
              reducedShares / originalShares,
              4,
            ),
            lastReductionAction: thesisResult.exposureAction,
            lastReductionAt: timestamp(),
          },
        };

        return {
          approved: true,
          engine: "POSITION_MANAGER",
          status: POSITION_MANAGER_STATUS.REDUCED,
          position: workingPosition,
          shouldExit: false,
          exitReason: null,
          trailing: trailingResult,
          thesis: thesisResult,
          execution: reductionResult.execution ?? null,
          metrics: {
            originalShares,
            previousShares: remainingShares,
            sharesClosed: remainingShares - reducedShares,
            remainingShares: reducedShares,
            exposureMultiplier: round(
              reducedShares / originalShares,
              4,
            ),
            realizedPnL: round(workingPosition.realizedPnL, 2),
            unrealizedPnL: round(workingPosition.unrealizedPnL, 2),
          },
          warnings: thesisResult?.warnings ?? [],
          errors: [],
          timestamp: timestamp(),
        };
      }
    }

    /**
     * ======================================================
     * HOLD POSITION
     * ======================================================
     */

    return {
      approved: true,
      engine: "POSITION_MANAGER",
      status: POSITION_MANAGER_STATUS.HOLDING,
      position: workingPosition,
      shouldExit: false,
      exitReason: null,
      trailing: trailingResult,
      thesis: thesisResult,
      thesisMonitoringRequested: true,
      metrics: {
        currentPrice: Number(currentPrice),
        originalShares,
        remainingShares,
        exposureMultiplier: round(currentExposureMultiplier, 4),
        currentR: isFiniteNumber(trailingResult?.currentR)
          ? round(trailingResult.currentR, 4)
          : null,
        peakR: isFiniteNumber(trailingResult?.peakR)
          ? round(trailingResult.peakR, 4)
          : null,
        currentStop: positiveNumber(trailingResult?.currentStopPrice)
          ? round(trailingResult.currentStopPrice, 4)
          : null,
        realizedPnL: round(workingPosition.realizedPnL, 2),
        unrealizedPnL: round(workingPosition.unrealizedPnL, 2),
      },
      warnings: [
        ...(Array.isArray(thesisResult?.warnings)
          ? thesisResult.warnings
          : []),
        ...(thesisResult?.approved !== true
          ? [
              "Trade thesis monitor is not fully approved for this update; exposure was preserved and was not increased.",
            ]
          : []),
      ],
      errors: [],
      timestamp: timestamp(),
    };
  } catch (error) {
    return {
      approved: false,
      engine: "POSITION_MANAGER",
      status: POSITION_MANAGER_STATUS.ERROR,
      position: position ?? null,
      shouldExit: false,
      exitReason: null,
      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
      warnings: [
        "Position management failed safely. No synthetic exit or exposure increase was created.",
      ],
      timestamp: timestamp(),
    };
  }
}

export default manageOpenPosition;
