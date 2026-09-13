import {
  createPaperOrder,
  PAPER_ORDER_TYPE,
} from "./paperBroker.js";

import manageOpenPosition from "./positionManager.js";

import {
  createEntryThesisSnapshot,
} from "../analysis/tradeThesisMonitor.js";

/**
 * ============================================================
 * PAPER EXECUTION COORDINATOR
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Coordinate:
 *
 * Risk approval
 *      ↓
 * Paper order creation
 *      ↓
 * Simulated fill
 *      ↓
 * Open position
 *      ↓
 * Position manager
 *      ↓
 * Trailing loss / trailing gain
 *      ↓
 * Simulated exit
 *
 * IMPORTANT
 * ---------
 *
 * PAPER TRADING ONLY.
 *
 * This module must not connect to a live brokerage account.
 */

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const PAPER_EXECUTION_STATUS =
  Object.freeze({
    READY:
      "READY",

    ORDER_FILLED:
      "ORDER_FILLED",

    ORDER_PENDING:
      "ORDER_PENDING",

    POSITION_OPEN:
      "POSITION_OPEN",

    POSITION_UPDATED:
      "POSITION_UPDATED",

    POSITION_CLOSED:
      "POSITION_CLOSED",

    BLOCKED:
      "BLOCKED",

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

function now() {
  return new Date()
    .toISOString();
}

/**
 * Resolve a point-in-time timestamp safely.
 *
 * Priority:
 * 1. explicit asOfTimestamp supplied by backtest/session
 * 2. existing source timestamp
 * 3. wall-clock now()
 *
 * This prevents wall-clock leakage into historical replay.
 */
function resolvePointInTimeTimestamp({
  asOfTimestamp = null,
  sourceTimestamp = null,
} = {}) {
  const candidates = [
    asOfTimestamp,
    sourceTimestamp,
  ];

  for (
    const candidate
    of candidates
  ) {
    if (
      candidate === null ||
      candidate === undefined ||
      candidate === ""
    ) {
      continue;
    }

    const date =
      new Date(
        candidate,
      );

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return date
        .toISOString();
    }
  }

  return now();
}

/**
 * ============================================================
 * VALIDATE RISK APPROVAL
 * ============================================================
 */

function validateRiskApproval(
  riskApproval,
) {
  const errors = [];

  if (!riskApproval) {
    errors.push(
      "Risk approval result is required.",
    );

    return {
      valid: false,
      errors,
    };
  }

  if (
    riskApproval
      .canExecute !== true
  ) {
    errors.push(
      "Risk manager has not approved execution.",
    );
  }

  const side =
    riskApproval.side;

  if (
    side !== "LONG" &&
    side !== "SHORT"
  ) {
    errors.push(
      "Approved side must be LONG or SHORT.",
    );
  }

  if (
    !positiveNumber(
      riskApproval
        ?.position
        ?.shares,
    )
  ) {
    errors.push(
      "Approved share quantity is required.",
    );
  }

  if (
    !positiveNumber(
      riskApproval
        ?.position
        ?.entryPrice,
    )
  ) {
    errors.push(
      "Approved entry price is required.",
    );
  }

  if (
    !positiveNumber(
      riskApproval
        ?.position
        ?.stopPrice,
    )
  ) {
    errors.push(
      "Approved stop price is required.",
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
 * CREATE PAPER ENTRY
 * ============================================================
 */

export function executeApprovedPaperTrade({
  symbol,

  riskApproval,

  currentPrice,

  orderType =
    PAPER_ORDER_TYPE.MARKET,

  limitPrice = null,

  slippagePercent = null,

  intelligence = null,

  metadata = {},
} = {}) {
  try {
    /**
     * ======================================================
     * RISK APPROVAL REQUIRED
     * ======================================================
     */

    const validation =
      validateRiskApproval(
        riskApproval,
      );

    if (!validation.valid) {
      return {
        approved: false,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS
            .BLOCKED,

        symbol,

        order: null,

        position: null,

        errors:
          validation.errors,

        warnings: [],

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * CURRENT PRICE
     * ======================================================
     */

    if (
      !positiveNumber(
        currentPrice,
      )
    ) {
      return {
        approved: false,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS
            .BLOCKED,

        symbol,

        order: null,

        position: null,

        errors: [
          "Valid current market price is required.",
        ],

        warnings: [],

        timestamp:
          now(),
      };
    }

    const approvedPosition =
      riskApproval.position;

    /**
     * ======================================================
     * CREATE PAPER ORDER
     * ======================================================
     */

    const result =
      createPaperOrder({
        symbol,

        side:
          riskApproval.side,

        shares:
          approvedPosition
            .shares,

        orderType,

        currentPrice,

        limitPrice,

        stopPrice:
          approvedPosition
            .stopPrice,

        targetPrice:
          approvedPosition
            .targetPrice,

        intelligenceScore:
          riskApproval
            .intelligenceScore,

        slippagePercent,

        metadata: {
          ...metadata,

          riskApprovalStatus:
            riskApproval.status,

          originalRiskPerShare:
            approvedPosition
              .riskPerShare,

          dollarRisk:
            approvedPosition
              .dollarRisk,

          accountRiskPercent:
            approvedPosition
              .accountRiskPercent,
        },
      });

    /**
     * ======================================================
     * PAPER ORDER REJECTED
     * ======================================================
     */

    if (
      result?.approved !== true
    ) {
      return {
        approved: false,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS
            .BLOCKED,

        symbol,

        order:
          result?.order ??
          null,

        position: null,

        errors:
          result?.errors ??
          [
            "Paper broker rejected order.",
          ],

        warnings:
          result?.warnings ??
          [],

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * PENDING LIMIT ORDER
     * ======================================================
     */

    if (
      result.status ===
      "PENDING"
    ) {
      return {
        approved: true,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS
            .ORDER_PENDING,

        symbol,

        order:
          result.order,

        position: null,

        canManagePosition:
          false,

        warnings:
          result.warnings ??
          [],

        errors: [],

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * FILLED
     * ======================================================
     */

    const position =
      result.position;

    if (!position) {
      return {
        approved: false,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS
            .ERROR,

        symbol,

        order:
          result.order,

        position: null,

        errors: [
          "Paper broker reported a fill without returning a position.",
        ],

        warnings: [],

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * INITIALIZE TRAILING STATE
     * ======================================================
     *
     * This is important.
     *
     * We preserve the ORIGINAL stop and risk,
     * even after the trailing stop starts moving.
     */

    const initialStopPrice =
      Number(
        approvedPosition
          .stopPrice,
      );

    const originalRiskPerShare =
      positiveNumber(
        approvedPosition
          .riskPerShare,
      )
        ? Number(
            approvedPosition
              .riskPerShare,
          )
        : Math.abs(
            Number(
              position.entryPrice,
            ) -
            initialStopPrice,
          );

    const entryThesis =
      createEntryThesisSnapshot({
        symbol,
        side: riskApproval.side,
        entryScore: riskApproval.intelligenceScore,
        originalShares: position.shares,
        technical: intelligence?.technical ?? null,
        macro: intelligence?.macro ?? null,
        marketRegime: intelligence?.marketRegime ?? null,
        events: intelligence?.events ?? null,
        company: intelligence?.company ?? null,
        country: intelligence?.country ?? null,
        social: intelligence?.social ?? null,
        historical: intelligence?.historical ?? null,
        liquidity: intelligence?.liquidity ?? null,
        consensus: intelligence?.consensus ?? null,
        asOfTimestamp: metadata?.timestamp ?? now(),
      });

    const initializedPosition = {
      ...position,

      /**
       * ======================================================
       * ORIGINAL EXPOSURE
       * ======================================================
       *
       * Preserve the original position size permanently.
       * Later partial reductions must never destroy this value.
       */

      originalShares:
        position.shares,

      /**
       * ======================================================
       * ENTRY THESIS
       * ======================================================
       */

      entryThesis,

      /**
       * ======================================================
       * ENTRY FINGERPRINT
       * ======================================================
       *
       * Preserve the exact point-in-time setup fingerprint that
       * existed when the trade was opened.
       *
       * Never regenerate or replace this using later intelligence.
       */

      entryFingerprint:
        metadata
          ?.entryFingerprint ??
        metadata
          ?.tradeFingerprint
          ?.fingerprint ??
        null,

      /**
       * ======================================================
       * ENTRY TIMESTAMP
       * ======================================================
       */

      entryTimestamp:
        resolvePointInTimeTimestamp({
          asOfTimestamp:
            metadata
              ?.timestamp ??
            null,

          sourceTimestamp:
            position
              ?.openedAt ??
            null,
        }),

      /**
       * ======================================================
       * TRAILING STATE
       * ======================================================
       */

      trailingState: {
        initialStopPrice,

        originalRiskPerShare,

        bestPrice:
          Number(
            position.entryPrice,
          ),

        currentStopPrice:
          initialStopPrice,

        peakR: 0,

        highestLockedR:
          null,

        stopSource:
          "INITIAL_STOP",

        currentR: 0,

        profitPercent: 0,

        trailingLossActive:
          false,

        trailingGainActive:
          false,

        createdAt:
          now(),

        updatedAt:
          now(),
      },
    };

    return {
      approved: true,

      engine:
        "PAPER_EXECUTION_COORDINATOR",

      status:
        PAPER_EXECUTION_STATUS
          .POSITION_OPEN,

      symbol,

      order:
        result.order,

      position:
        initializedPosition,

      canManagePosition:
        true,

      warnings:
        result.warnings ??
        [],

      errors: [],

      summary:
        `${riskApproval.side} paper position opened successfully.`,

      timestamp:
        now(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "PAPER_EXECUTION_COORDINATOR",

      status:
        PAPER_EXECUTION_STATUS.ERROR,

      symbol,

      order: null,

      position: null,

      canManagePosition:
        false,

      warnings: [
        "Paper execution failed safely. No simulated position should be assumed open.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      timestamp:
        now(),
    };
  }
}

/**
 * ============================================================
 * PROCESS PRICE UPDATE
 * ============================================================
 *
 * Call this whenever a new market price arrives.
 */

/**
 * ============================================================
 * POINT-IN-TIME CONTRACT
 * ============================================================
 *
 * The execution path supports both:
 *
 * - live/paper wall-clock execution
 * - deterministic historical replay/backtesting
 *
 * Any explicit asOfTimestamp must always outrank wall-clock
 * timestamps produced deeper in the execution stack.
 *
 * This is intentional architecture:
 *
 * analysis → execution → close → history → future analysis
 *
 * Historical replay must never learn from information that was
 * not available at the simulated point in time.
 */

export async function processPaperPositionUpdate({
  position,

  currentPrice,

  atr = null,

  slippagePercent = null,

  intelligence = null,

  monitorThesis = false,

  asOfTimestamp = now(),

  historyStore = null,
} = {}) {
  try {
    if (!position) {
      return {
        approved: false,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS.ERROR,

        position: null,

        errors: [
          "Paper position is required.",
        ],

        warnings: [],

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * POSITION MANAGER
     * ======================================================
     */

    const managementResult =
      await manageOpenPosition({
        position,

        currentPrice,

        atr,

        slippagePercent,

        intelligence,

        monitorThesis,

        asOfTimestamp,
      });

    if (
      managementResult
        ?.approved !== true
    ) {
      return {
        approved: false,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS.ERROR,

        position:
          managementResult
            ?.position ??
          position,

        management:
          managementResult,

        errors:
          managementResult
            ?.errors ??
          [
            "Position manager failed.",
          ],

        warnings:
          managementResult
            ?.warnings ??
          [],

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * POSITION CLOSED
     * ======================================================
     */

    if (
      managementResult
        .status ===
        "EXITED" ||
      managementResult
        .shouldExit === true
    ) {
      /**
       * ======================================================
       * STORE COMPLETED TRADE IN HISTORY
       * ======================================================
       *
       * History persistence is optional and fail-safe.
       *
       * A storage failure must NEVER undo or invalidate a
       * correctly closed paper position.
       */

      let historyResult =
        null;

      if (
        historyStore &&
        typeof historyStore
          .storeTrade ===
          "function"
      ) {
        try {
          const closedPosition =
            managementResult
              .position;

          const entryPrice =
            Number(
              closedPosition
                ?.entryPrice ??
              position
                ?.entryPrice,
            );

          const originalRiskPerShare =
            Number(
              closedPosition
                ?.trailingState
                ?.originalRiskPerShare ??
              position
                ?.trailingState
                ?.originalRiskPerShare ??
              0,
            );

          const realizedPnL =
            Number(
              closedPosition
                ?.realizedPnL ??
              0,
            );

          const originalShares =
            Number(
              closedPosition
                ?.originalShares ??
              position
                ?.originalShares ??
              position
                ?.shares ??
              0,
            );

          const originalDollarRisk =
            (
              Number.isFinite(
                originalRiskPerShare,
              ) &&
              originalRiskPerShare > 0 &&
              Number.isFinite(
                originalShares,
              ) &&
              originalShares > 0
            )
              ? (
                  originalRiskPerShare *
                  originalShares
                )
              : null;

          const finalR =
            (
              originalDollarRisk &&
              Number.isFinite(
                realizedPnL,
              )
            )
              ? (
                  realizedPnL /
                  originalDollarRisk
                )
              : null;

          const peakR =
            Number.isFinite(
              Number(
                closedPosition
                  ?.trailingState
                  ?.peakR,
              ),
            )
              ? Number(
                  closedPosition
                    .trailingState
                    .peakR,
                )
              : null;

          const completedTrade = {
            id:
              closedPosition
                ?.id ??
              position
                ?.id,

            symbol:
              closedPosition
                ?.symbol ??
              position
                ?.symbol,

            side:
              closedPosition
                ?.side ??
              position
                ?.side,

            status:
              "CLOSED",

            openedAt:
              closedPosition
                ?.entryTimestamp ??
              position
                ?.entryTimestamp ??
              closedPosition
                ?.openedAt ??
              position
                ?.openedAt,

            closedAt:
              resolvePointInTimeTimestamp({
                asOfTimestamp,

                sourceTimestamp:
                  closedPosition
                    ?.closedAt ??
                  null,
              }),

            entryPrice:
              Number.isFinite(
                entryPrice,
              )
                ? entryPrice
                : null,

            exitPrice:
              managementResult
                ?.execution
                ?.exitPrice ??
              closedPosition
                ?.exitPrice ??
              currentPrice,

            originalShares:
              Number.isFinite(
                originalShares,
              )
                ? originalShares
                : null,

            realizedPnL:
              Number.isFinite(
                realizedPnL,
              )
                ? realizedPnL
                : null,

            finalR,

            peakR,

            exitReason:
              managementResult
                ?.exitReason ??
              managementResult
                ?.execution
                ?.exitReason ??
              null,

            reductionHistory:
              Array.isArray(
                closedPosition
                  ?.reductionHistory,
              )
                ? closedPosition
                    .reductionHistory
                : [],

            entryFingerprint:
              closedPosition
                ?.entryFingerprint ??
              position
                ?.entryFingerprint ??
              null,

            metadata: {
              ...(
                closedPosition
                  ?.metadata ??
                {}
              ),

              paperTrade:
                true,

              persistedFrom:
                "PAPER_EXECUTION_COORDINATOR",

              historicalAsOfTimestamp:
                resolvePointInTimeTimestamp({
                  asOfTimestamp,

                  sourceTimestamp:
                    closedPosition
                      ?.closedAt ??
                    null,
                }),
            },
          };

          historyResult =
            historyStore
              .storeTrade(
                completedTrade,
              );
        } catch (historyError) {
          historyResult = {
            approved: false,

            engine:
              "TRADE_HISTORY_STORE",

            status:
              "ERROR",

            record: null,

            errors: [
              historyError
                instanceof Error
                ? historyError.message
                : String(
                    historyError,
                  ),
            ],

            warnings: [
              "Paper position closed successfully, but trade history persistence failed safely.",
            ],
          };
        }
      }

      return {
        approved: true,

        engine:
          "PAPER_EXECUTION_COORDINATOR",

        status:
          PAPER_EXECUTION_STATUS
            .POSITION_CLOSED,

        position:
          managementResult
            .position,

        management:
          managementResult,

        realizedPnL:
          managementResult
            ?.position
            ?.realizedPnL ??
          null,

        exitReason:
          managementResult
            ?.exitReason ??
          null,

        history:
          historyResult,

        warnings: [
          ...(
            managementResult
              ?.warnings ??
            []
          ),

          ...(
            Array.isArray(
              historyResult
                ?.warnings,
            )
              ? historyResult
                  .warnings
              : []
          ),
        ],

        errors: [],

        timestamp:
          now(),
      };
    }

    /**
     * ======================================================
     * POSITION REMAINS OPEN
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "PAPER_EXECUTION_COORDINATOR",

      status:
        PAPER_EXECUTION_STATUS
          .POSITION_UPDATED,

      position:
        managementResult
          .position,

      management:
        managementResult,

      realizedPnL: null,

      warnings:
        managementResult
          ?.warnings ??
        [],

      errors: [],

      timestamp:
        now(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "PAPER_EXECUTION_COORDINATOR",

      status:
        PAPER_EXECUTION_STATUS.ERROR,

      position,

      warnings: [
        "Paper position update failed safely.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      timestamp:
        now(),
    };
  }
}

export default {
  executeApprovedPaperTrade,
  processPaperPositionUpdate,
};