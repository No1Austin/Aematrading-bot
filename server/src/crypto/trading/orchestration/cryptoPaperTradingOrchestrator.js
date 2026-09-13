/**
 * AEMA CRYPTO
 * Phase 5.19 — End-to-End Paper Trading Orchestrator
 *
 * PURPOSE
 * -------
 * Connect the trading architecture into one paper-trading flow.
 *
 * This orchestrator:
 * - receives already-produced decision/risk/lifecycle inputs
 * - applies portfolio risk
 * - creates trade intent
 * - validates through exchange contract
 * - builds execution command
 * - executes against PAPER exchange only
 * - builds execution state
 * - reconciles fills
 * - exposes truthful resulting position state
 *
 * IMPORTANT
 * ---------
 * liveExecution remains FALSE.
 */

import evaluateCryptoPortfolioRisk
  from "../risk/cryptoPortfolioRiskManager.js";

import {
  planCryptoTradeIntent,
} from "../orders/cryptoTradeIntentPlanner.js";

import {
  buildExchangeExecutionRequest,
} from "../execution/cryptoExchangeExecutionAdapter.js";

import {
  buildExecutionCommand,
} from "../execution/cryptoExecutionCommandGateway.js";

import {
  createExecutionState,
  reduceExecutionState,
} from "../execution/cryptoExecutionStateMachine.js";

import {
  reconcileCryptoExecution,
} from "../execution/cryptoExchangeReconciliationManager.js";

const finite = (value) => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
};

const upper = (
  value,
  fallback = "",
) => {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
};

function clone(value) {
  if (value == null) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}

/**
 * ============================================================
 * COMMAND → PAPER REQUEST
 * ============================================================
 *
 * Important fix:
 * preserve reference price and paper-only simulation controls.
 */

function commandToPaperRequest(
  commandResult,
  market = {},
) {
  const payload =
    commandResult?.payload;

  if (!payload) {
    return null;
  }

  const command =
    upper(
      commandResult.command,
    );

  if (
    [
      "SUBMIT_ORDER",
      "CLOSE_POSITION",
      "EMERGENCY_CLOSE",
      "RETRY_REMAINDER",
    ].includes(command)
  ) {
    const marketPrice =
      finite(
        market?.price ??
        market?.markPrice ??
        market?.lastPrice,
      );

    const validPrice = (
  ...values
) => {
  for (
    const value
    of values
  ) {
    const n =
      finite(value);

    if (
      n !== null &&
      n > 0
    ) {
      return n;
    }
  }

  return null;
};

const price =
  validPrice(
    payload.limitPrice,
    payload.referencePrice,
    marketPrice,
  );

    return {
      symbol:
        payload.symbol,

      side:
        payload.side,

      quantity:
        payload.quantity,

      price,

      reduceOnly:
        payload.reduceOnly === true,

      clientOrderId:
        payload.clientOrderId ??
        null,

      /**
       * Paper-only simulation controls.
       *
       * These do not belong in the live
       * exchange adapter.
       */
      fillRatio:
        payload.fillRatio,

      forceReject:
        payload.forceReject === true,

      rejectReason:
        payload.rejectReason,
    };
  }

  return null;
}

/**
 * ============================================================
 * PAPER ORDER → EXECUTION EVENTS
 * ============================================================
 */

function paperOrderToExecutionEvents(
  result,
) {
  if (!result?.order) {
    return [];
  }

  const order =
    result.order;

  const events = [];

  if (
    order.status !== "REJECTED"
  ) {
    events.push({
      type:
        "SUBMIT",

      exchangeOrderId:
        order.orderId,
    });

    events.push({
      type:
        "ACK",

      exchangeOrderId:
        order.orderId,
    });
  }

  if (
    Number(order.filledQuantity) >
      0 &&
    Number(order.averageFillPrice) >
      0
  ) {
    events.push({
      type:
        "FILL",

      quantity:
        order.filledQuantity,

      price:
        order.averageFillPrice,

      tradeId:
        `PAPER-${order.orderId}`,
    });
  }

  if (
    order.status ===
      "REJECTED"
  ) {
    events.push({
      type:
        "REJECTED",

      reason:
        result.reason ??
        "PAPER_REJECTION",
    });
  }

  if (
    order.status ===
      "CANCELLED"
  ) {
    events.push({
      type:
        "CANCELLED",
    });
  }

  if (
    order.status ===
      "EXPIRED"
  ) {
    events.push({
      type:
        "EXPIRED",
    });
  }

  return events;
}

/**
 * ============================================================
 * PAPER ORDER → EXCHANGE ORDER VIEW
 * ============================================================
 */

function buildExchangeOrderView(
  paperResult,
) {
  const order =
    paperResult?.order;

  if (!order) {
    return null;
  }

  return {
    exchangeOrderId:
      order.orderId,

    clientOrderId:
      order.clientOrderId,

    status:
      order.status,

    filledQuantity:
      order.filledQuantity,

    remainingQuantity:
      order.remainingQuantity,

    averageFillPrice:
      order.averageFillPrice,
  };
}

/**
 * ============================================================
 * EXPECTED POSITION
 * ============================================================
 *
 * This represents the position we expect if the
 * requested execution is fully completed.
 *
 * The reconciliation layer can then detect:
 * - partial fills
 * - quantity mismatches
 * - directional conflicts
 */

function buildExpectedPosition({
  lifecycle,
  executionRequest,
  previousPosition,
}) {
  const action =
    upper(
      lifecycle?.action,
    );

  const direction =
    upper(
      lifecycle?.direction,
    );

  const previousQuantity =
    Math.max(
      0,
      finite(
        previousPosition
          ?.quantity,
      ) ?? 0,
    );

  const quantity =
    Math.max(
      0,
      finite(
        executionRequest
          ?.quantity,
      ) ?? 0,
    );

  if (
    action ===
      "OPEN_POSITION"
  ) {
    return {
      direction,
      quantity,
    };
  }

  if (
    action ===
      "ADD_EXPOSURE"
  ) {
    return {
      direction,

      quantity:
        previousQuantity +
        quantity,
    };
  }

  if (
    action ===
      "REDUCE_EXPOSURE"
  ) {
    return {
      direction,

      quantity:
        Math.max(
          0,
          previousQuantity -
          quantity,
        ),
    };
  }

  if (
    action ===
      "EXIT_POSITION" ||
    action ===
      "EMERGENCY_EXIT"
  ) {
    return {
      direction:
        "NEUTRAL",

      quantity:
        0,
    };
  }

  return {
    direction:
      previousQuantity > 0
        ? direction
        : "NEUTRAL",

    quantity:
      previousQuantity,
  };
}

/**
 * ============================================================
 * PAPER COMMAND EXECUTION
 * ============================================================
 */

async function executePaperCommand({
  adapter,
  commandResult,
  stopPlan,
  market = {},
}) {
  switch (
    upper(
      commandResult?.command,
    )
  ) {
    case "SUBMIT_ORDER":
    case "RETRY_REMAINDER": {
      const request =
        commandToPaperRequest(
          commandResult,
          market,
        );

      return adapter.submitOrder(
        request,
      );
    }

    case "CLOSE_POSITION": {
      const payload =
        commandResult.payload;

      return adapter.closePosition({
        symbol:
          payload.symbol,

        quantity:
          payload.quantity,

        price:
          finite(
            payload.limitPrice ??
            payload.referencePrice ??
            market?.price ??
            market?.markPrice ??
            market?.lastPrice,
          ),

        clientOrderId:
          payload.clientOrderId ??
          null,
      });
    }

    case "EMERGENCY_CLOSE": {
      const payload =
        commandResult.payload;

      return adapter.emergencyClose({
        symbol:
          payload.symbol,

        price:
          finite(
            payload.referencePrice ??
            market?.price ??
            market?.markPrice ??
            market?.lastPrice,
          ),

        clientOrderId:
          payload.clientOrderId ??
          null,
      });
    }

    case "REPLACE_STOP": {
      const payload =
        commandResult.payload;

      return adapter.replaceStop({
        symbol:
          payload.symbol,

        quantity:
          payload.quantity,

        stopPrice:
          finite(
            payload.stopPrice ??
            stopPlan?.stopPrice,
          ),
      });
    }

    case "CANCEL_ORDER": {
      const payload =
        commandResult.payload;

      return adapter.cancelOrder({
        orderId:
          payload.exchangeOrderId,

        clientOrderId:
          payload.clientOrderId,
      });
    }

    case "NO_ACTION":
      return {
        status:
          "NO_ACTION",
      };

    default:
      return {
        status:
          "COMMAND_NOT_EXECUTABLE_IN_PAPER",
      };
  }
}

/**
 * ============================================================
 * MAIN PAPER TRADE CYCLE
 * ============================================================
 */

export async function runCryptoPaperTradeCycle({
  adapter,

  symbol,

  lifecycle,

  riskPlan,

  portfolioContext = {},

  position = {},

  market = {},

  stopPlan = {},

  exchangeRules = {},

  preferences = {},

  executionAdapterOverrides = {},

  paperOverrides = {},
} = {}) {
  if (!adapter) {
    throw new Error(
      "PAPER_EXCHANGE_ADAPTER_REQUIRED",
    );
  }

  /**
   * Phase 5.19 is paper-only.
   */
  if (
    adapter.liveExecution === true
  ) {
    throw new Error(
      "LIVE_ADAPTER_NOT_ALLOWED_IN_PHASE_5_19",
    );
  }

  /**
   * ==========================================================
   * 1. PORTFOLIO RISK
   * ==========================================================
   */

  const portfolioRisk =
    await evaluateCryptoPortfolioRisk({
      ...portfolioContext,

      action:
        lifecycle?.action,

      lifecycle,

      candidate: {
        symbol,

        direction:
          lifecycle?.direction,

        exposure:
          lifecycle
            ?.targetExposure,

        leverage:
          riskPlan
            ?.leverage
            ?.recommended ??
          riskPlan?.leverage,

        ...(portfolioContext
          ?.candidate ?? {}),
      },

      requestedExposure:
        lifecycle
          ?.targetExposure,
    });

  /**
   * ==========================================================
   * 2. TRADE INTENT
   * ==========================================================
   */

  const tradeIntent =
    planCryptoTradeIntent({
      symbol,

      lifecycle,

      riskPlan,

      portfolioRisk,

      stopPlan,

      position,

      market,

      preferences,
    });

  if (
    tradeIntent.approved !== true
  ) {
    return {
      status:
        "TRADE_INTENT_BLOCKED",

      portfolioRisk,
      tradeIntent,

      executionAdapter:
        null,

      command:
        null,

      paperResult:
        null,

      executionState:
        null,

      reconciliation:
        null,

      resultingPosition:
        clone(position),

      paperExecution:
        true,

      liveExecution:
        false,
    };
  }

  /**
   * ==========================================================
   * 3. EXCHANGE EXECUTION CONTRACT
   * ==========================================================
   */

  const executionAdapter =
    buildExchangeExecutionRequest({
      tradeIntent: {
        ...tradeIntent,

        ...executionAdapterOverrides,
      },

      exchangeRules,

      position,
    });

  if (
    executionAdapter.approved !== true
  ) {
    return {
      status:
        "EXECUTION_CONTRACT_BLOCKED",

      portfolioRisk,
      tradeIntent,
      executionAdapter,

      command:
        null,

      paperResult:
        null,

      executionState:
        null,

      reconciliation:
        null,

      resultingPosition:
        clone(position),

      paperExecution:
        true,

      liveExecution:
        false,
    };
  }

  /**
   * ==========================================================
   * 4. COMMAND GATEWAY
   * ==========================================================
   */

  const command =
    buildExecutionCommand({
      executionAdapterResult:
        executionAdapter,

      stopPlan,

      position,
    });

  if (
    command.approved !== true
  ) {
    return {
      status:
        "COMMAND_BLOCKED",

      portfolioRisk,
      tradeIntent,
      executionAdapter,
      command,

      paperResult:
        null,

      executionState:
        null,

      reconciliation:
        null,

      resultingPosition:
        clone(position),

      paperExecution:
        true,

      liveExecution:
        false,
    };
  }

  /**
   * ==========================================================
   * 5. PAPER SIMULATION OVERRIDES
   * ==========================================================
   *
   * Examples:
   * fillRatio: 0.4
   * forceReject: true
   */

  if (
    command.payload &&
    Object.keys(
      paperOverrides,
    ).length > 0
  ) {
    command.payload = {
      ...command.payload,
      ...paperOverrides,
    };
  }

  /**
   * ==========================================================
   * 6. PAPER EXECUTION
   * ==========================================================
   */

  const paperResult =
    await executePaperCommand({
      adapter,

      commandResult:
        command,

      stopPlan,

      market,
    });

  /**
   * ==========================================================
   * STOP UPDATE
   * ==========================================================
   *
   * Stop updates do not produce a position-entry
   * execution state.
   */

  if (
    command.command ===
      "REPLACE_STOP"
  ) {
    return {
      status:
        paperResult
          ?.replaced
          ? "STOP_UPDATED"
          : "STOP_UPDATE_FAILED",

      portfolioRisk,
      tradeIntent,
      executionAdapter,
      command,
      paperResult,

      executionState:
        null,

      reconciliation:
        null,

      resultingPosition:
        await adapter.getPosition(
          symbol,
        ),

      paperExecution:
        true,

      liveExecution:
        false,
    };
  }

  /**
   * ==========================================================
   * NO ACTION
   * ==========================================================
   */

  if (
    command.command ===
      "NO_ACTION"
  ) {
    return {
      status:
        "NO_ACTION",

      portfolioRisk,
      tradeIntent,
      executionAdapter,
      command,
      paperResult,

      executionState:
        null,

      reconciliation:
        null,

      resultingPosition:
        await adapter.getPosition(
          symbol,
        ),

      paperExecution:
        true,

      liveExecution:
        false,
    };
  }

  /**
   * ==========================================================
   * 7. EXECUTION STATE MACHINE
   * ==========================================================
   */

  let executionState =
    createExecutionState(
      executionAdapter
        .executionRequest,
    );

  const events =
    paperOrderToExecutionEvents(
      paperResult,
    );

  for (
    const event
    of events
  ) {
    executionState =
      reduceExecutionState(
        executionState,
        event,
      );
  }

  /**
   * ==========================================================
   * 8. EXCHANGE POSITION TRUTH
   * ==========================================================
   */

  const resultingPosition =
    await adapter.getPosition(
      symbol,
    );

  /**
   * ==========================================================
   * 9. EXPECTED POSITION
   * ==========================================================
   */

  const expectedPosition =
    buildExpectedPosition({
      lifecycle,

      executionRequest:
        executionAdapter
          .executionRequest,

      previousPosition:
        position,
    });

  /**
   * ==========================================================
   * 10. RECONCILIATION
   * ==========================================================
   */

  const reconciliation =
    reconcileCryptoExecution({
      localState:
        executionState,

      exchangeOrder:
        buildExchangeOrderView(
          paperResult,
        ),

      expectedPosition,

      exchangePosition:
        resultingPosition,

      stopState:
        null,
    });

  /**
   * ==========================================================
   * FINAL RESULT
   * ==========================================================
   */

  return {
    status:
      "PAPER_CYCLE_COMPLETE",

    portfolioRisk,

    tradeIntent,

    executionAdapter,

    command,

    paperResult,

    executionState,

    reconciliation,

    expectedPosition,

    resultingPosition,

    paperExecution:
      true,

    liveExecution:
      false,
  };
}

export default
  runCryptoPaperTradeCycle;