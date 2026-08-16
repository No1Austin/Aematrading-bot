import updateTrailingPosition from "../risk/trailingEngine.js";

import {
  updatePaperPosition,
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
 */

export async function manageOpenPosition({
  position,

  currentPrice,

  atr = null,

  slippagePercent = null,
} = {}) {
  try {
    /**
     * ======================================================
     * VALIDATION
     * ======================================================
     */

    if (!position) {
      return {
        approved: false,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .INVALID_POSITION,

        position: null,

        shouldExit: false,

        errors: [
          "Position is required.",
        ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    if (
      position.status !==
      PAPER_POSITION_STATUS.OPEN
    ) {
      return {
        approved: false,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .INVALID_POSITION,

        position,

        shouldExit: false,

        errors: [
          "Position must be OPEN.",
        ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    if (
      !positiveNumber(
        currentPrice,
      )
    ) {
      return {
        approved: false,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .ERROR,

        position,

        shouldExit: false,

        errors: [
          "Valid current price is required.",
        ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * UPDATE PAPER P&L FIRST
     * ======================================================
     */

    const paperUpdate =
      updatePaperPosition({
        position,

        currentPrice,
      });

    if (
      paperUpdate
        ?.approved !== true
    ) {
      return {
        approved: false,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .ERROR,

        position,

        shouldExit: false,

        errors:
          paperUpdate
            ?.errors ??
          [
            "Paper position update failed.",
          ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    let workingPosition =
      paperUpdate.position;

    /**
     * ======================================================
     * RUN TRAILING ENGINE
     * ======================================================
     */

    const trailingInputs =
      buildTrailingInputs({
        position:
          workingPosition,

        currentPrice,

        atr,
      });

    if (
      !positiveNumber(
        trailingInputs
          .originalRiskPerShare,
      )
    ) {
      return {
        approved: false,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .ERROR,

        position:
          workingPosition,

        shouldExit: false,

        errors: [
          "Unable to determine original risk per share.",
        ],

        warnings: [
          "Position remains open because trailing state could not be safely calculated.",
        ],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    const trailingResult =
      updateTrailingPosition(
        trailingInputs,
      );

    if (
      trailingResult
        ?.approved !== true
    ) {
      return {
        approved: false,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .ERROR,

        position:
          workingPosition,

        shouldExit: false,

        trailing:
          trailingResult,

        errors:
          trailingResult
            ?.errors ??
          [
            "Trailing engine failed.",
          ],

        warnings: [
          "Position was not automatically closed because trailing analysis failed.",
        ],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * SAVE TRAILING STATE
     * ======================================================
     */

    workingPosition =
      mergeTrailingState({
        position:
          workingPosition,

        trailingResult,
      });

    /**
     * ======================================================
     * TARGET EXIT
     * ======================================================
     */

    const targetTriggered =
      isTargetTriggered({
        side:
          workingPosition.side,

        currentPrice,

        targetPrice:
          workingPosition
            .targetPrice,
      });

    /**
     * ======================================================
     * TRAILING / STOP EXIT
     * ======================================================
     */

    const trailingExit =
      trailingResult
        ?.exit
        ?.shouldExit ===
      true;

    const stopTriggered =
      trailingResult
        ?.stopTriggered ===
      true;

    const shouldExit =
      targetTriggered ||
      trailingExit ||
      stopTriggered;

    /**
     * ======================================================
     * HOLD POSITION
     * ======================================================
     */

    if (!shouldExit) {
      return {
        approved: true,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .HOLDING,

        position:
          workingPosition,

        shouldExit: false,

        exitReason: null,

        trailing:
          trailingResult,

        metrics: {
          currentPrice:
            Number(
              currentPrice,
            ),

          currentR:
            isFiniteNumber(
              trailingResult
                ?.currentR,
            )
              ? round(
                  trailingResult
                    .currentR,
                  4,
                )
              : null,

          peakR:
            isFiniteNumber(
              trailingResult
                ?.peakR,
            )
              ? round(
                  trailingResult
                    .peakR,
                  4,
                )
              : null,

          currentStop:
            positiveNumber(
              trailingResult
                ?.currentStopPrice,
            )
              ? round(
                  trailingResult
                    .currentStopPrice,
                  4,
                )
              : null,

          unrealizedPnL:
            round(
              workingPosition
                .unrealizedPnL,
              2,
            ),
        },

        warnings: [],

        errors: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * DETERMINE EXIT REASON
     * ======================================================
     */

    let exitReason =
      "TRAILING_EXIT";

    if (targetTriggered) {
      exitReason =
        "TARGET_REACHED";
    } else if (
      trailingResult
        ?.exit
        ?.reason
    ) {
      exitReason =
        trailingResult
          .exit
          .reason;
    } else if (
      stopTriggered
    ) {
      exitReason =
        "STOP_TRIGGERED";
    }

    /**
     * ======================================================
     * CLOSE PAPER POSITION
     * ======================================================
     */

    const closeResult =
      closePaperPosition({
        position:
          workingPosition,

        currentPrice,

        reason:
          exitReason,

        slippagePercent,
      });

    if (
      closeResult
        ?.approved !== true
    ) {
      return {
        approved: false,

        engine:
          "POSITION_MANAGER",

        status:
          POSITION_MANAGER_STATUS
            .ERROR,

        position:
          workingPosition,

        shouldExit: true,

        exitReason,

        trailing:
          trailingResult,

        errors:
          closeResult
            ?.errors ??
          [
            "Paper position close failed.",
          ],

        warnings: [
          "Exit was triggered but the paper broker failed to close the position.",
        ],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * EXIT RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "POSITION_MANAGER",

      status:
        POSITION_MANAGER_STATUS
          .EXITED,

      position:
        closeResult.position,

      shouldExit: true,

      exitReason,

      trailing:
        trailingResult,

      execution:
        closeResult
          .execution,

      metrics: {
        entryPrice:
          round(
            workingPosition
              .entryPrice,
            4,
          ),

        exitPrice:
          round(
            closeResult
              ?.execution
              ?.exitPrice,
            4,
          ),

        realizedPnL:
          round(
            closeResult
              ?.position
              ?.realizedPnL,
            2,
          ),

        finalR:
          isFiniteNumber(
            trailingResult
              ?.currentR,
          )
            ? round(
                trailingResult
                  .currentR,
                4,
              )
            : null,

        peakR:
          isFiniteNumber(
            trailingResult
              ?.peakR,
          )
            ? round(
                trailingResult
                  .peakR,
                4,
              )
            : null,

        highestLockedR:
          isFiniteNumber(
            trailingResult
              ?.highestLockedR,
          )
            ? round(
                trailingResult
                  .highestLockedR,
                4,
              )
            : null,
      },

      warnings: [],

      errors: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "POSITION_MANAGER",

      status:
        POSITION_MANAGER_STATUS
          .ERROR,

      position,

      shouldExit: false,

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      warnings: [
        "Position management failed safely. No synthetic exit was created.",
      ],

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default manageOpenPosition;