import {
  createPaperOrder,
  PAPER_ORDER_TYPE,
} from "./paperBroker.js";

import manageOpenPosition from "./positionManager.js";

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

    const initializedPosition = {
      ...position,

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

export async function processPaperPositionUpdate({
  position,

  currentPrice,

  atr = null,

  slippagePercent = null,
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

        warnings:
          managementResult
            ?.warnings ??
          [],

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