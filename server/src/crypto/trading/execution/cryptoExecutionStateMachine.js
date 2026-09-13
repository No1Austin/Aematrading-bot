/**
 * AEMA CRYPTO
 * Phase 5.15 — Execution State Machine & Fill Reconciliation
 *
 * PURPOSE
 * -------
 * Maintain truthful execution state after an order request exists.
 *
 * This module:
 * - does NOT submit orders
 * - does NOT cancel orders
 * - does NOT call an exchange
 * - does NOT assume requested quantity was filled
 *
 * It only reconciles execution events into a canonical state.
 */

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 8) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  const factor = 10 ** digits;

  return Math.round(n * factor) / factor;
};

const upper = (value, fallback = "") => {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();

  return text || fallback;
};

export const EXECUTION_STATE =
  Object.freeze({
    CREATED: "CREATED",
    SUBMITTED: "SUBMITTED",
    ACKNOWLEDGED: "ACKNOWLEDGED",
    PARTIALLY_FILLED: "PARTIALLY_FILLED",
    FILLED: "FILLED",
    CANCEL_PENDING: "CANCEL_PENDING",
    CANCELLED: "CANCELLED",
    REJECTED: "REJECTED",
    EXPIRED: "EXPIRED",
    FAILED: "FAILED",
  });

export const EXECUTION_EVENT =
  Object.freeze({
    SUBMIT: "SUBMIT",
    ACK: "ACK",
    FILL: "FILL",
    CANCEL_REQUESTED: "CANCEL_REQUESTED",
    CANCELLED: "CANCELLED",
    REJECTED: "REJECTED",
    EXPIRED: "EXPIRED",
    FAILED: "FAILED",
  });

const TERMINAL_STATES = new Set([
  EXECUTION_STATE.FILLED,
  EXECUTION_STATE.CANCELLED,
  EXECUTION_STATE.REJECTED,
  EXECUTION_STATE.EXPIRED,
  EXECUTION_STATE.FAILED,
]);

function normalizeEvent(event) {
  const type = upper(
    event?.type ??
      event?.eventType,
  );

  return Object.values(
    EXECUTION_EVENT,
  ).includes(type)
    ? type
    : null;
}

function initialState(request) {
  const quantity =
    Math.max(
      0,
      finite(
        request?.quantity,
      ) ?? 0,
    );

  return {
    executionId:
      request?.clientOrderId ??
      null,

    clientOrderId:
      request?.clientOrderId ??
      null,

    exchangeOrderId:
      null,

    symbol:
      request?.symbol ??
      null,

    intent:
      request?.intent ??
      null,

    direction:
      request?.direction ??
      null,

    side:
      request?.side ??
      null,

    orderType:
      request?.orderType ??
      null,

    reduceOnly:
      request?.reduceOnly === true,

    requestedQuantity:
      round(quantity, 12),

    filledQuantity: 0,

    remainingQuantity:
      round(quantity, 12),

    averageFillPrice:
      null,

    cumulativeQuote:
      0,

    feesUsd:
      0,

    status:
      EXECUTION_STATE.CREATED,

    retryEligible:
      false,

    cancelEligible:
      false,

    stale:
      false,

    duplicateSubmission:
      false,

    overfillDetected:
      false,

    fills: [],

    reasons: [],

    warnings: [],

    lastEventAt:
      null,

    executionAuthority:
      false,
  };
}

function recalcFillState(state) {
  const requested =
    Math.max(
      0,
      finite(
        state.requestedQuantity,
      ) ?? 0,
    );

  const filled =
    Math.max(
      0,
      finite(
        state.filledQuantity,
      ) ?? 0,
    );

  const remaining =
    Math.max(
      0,
      requested - filled,
    );

  state.remainingQuantity =
    round(
      remaining,
      12,
    );

  if (
    filled <= 0
  ) {
    return;
  }

  if (
    remaining <= 1e-12
  ) {
    state.status =
      EXECUTION_STATE.FILLED;

    state.cancelEligible =
      false;

    state.retryEligible =
      false;

    return;
  }

  state.status =
    EXECUTION_STATE.PARTIALLY_FILLED;

  state.cancelEligible =
    true;
}

function applyFill(
  state,
  event,
) {
  const fillQty =
    Math.max(
      0,
      finite(
        event.quantity ??
          event.fillQuantity,
      ) ?? 0,
    );

  const fillPrice =
    finite(
      event.price ??
        event.fillPrice,
    );

  if (
    fillQty <= 0 ||
    fillPrice === null ||
    fillPrice <= 0
  ) {
    state.warnings.push(
      "INVALID_FILL_EVENT",
    );

    return state;
  }

  const requested =
    state.requestedQuantity;

  const alreadyFilled =
    state.filledQuantity;

  const maximumRemaining =
    Math.max(
      0,
      requested -
        alreadyFilled,
    );

  const acceptedQty =
    Math.min(
      fillQty,
      maximumRemaining,
    );

  if (
    fillQty >
      maximumRemaining +
        1e-12
  ) {
    state.overfillDetected =
      true;

    state.warnings.push(
      "OVERFILL_CLAMPED",
    );
  }

  if (
    acceptedQty <= 0
  ) {
    return state;
  }

  const previousQuote =
    finite(
      state.cumulativeQuote,
    ) ?? 0;

  const addedQuote =
    acceptedQty *
    fillPrice;

  const newFilled =
    alreadyFilled +
    acceptedQty;

  state.cumulativeQuote =
    previousQuote +
    addedQuote;

  state.filledQuantity =
    round(
      newFilled,
      12,
    );

  state.averageFillPrice =
    newFilled > 0
      ? round(
          state.cumulativeQuote /
            newFilled,
          12,
        )
      : null;

  const feeUsd =
    Math.max(
      0,
      finite(
        event.feeUsd,
      ) ?? 0,
    );

  state.feesUsd =
    round(
      (
        finite(
          state.feesUsd,
        ) ?? 0
      ) +
        feeUsd,
      8,
    );

  state.fills.push({
    quantity:
      round(
        acceptedQty,
        12,
      ),

    price:
      round(
        fillPrice,
        12,
      ),

    feeUsd:
      round(
        feeUsd,
        8,
      ),

    tradeId:
      event.tradeId ??
      null,

    timestamp:
      event.timestamp ??
      new Date()
        .toISOString(),
  });

  recalcFillState(
    state,
  );

  return state;
}

function applyTerminalEvent(
  state,
  nextStatus,
  event,
) {
  if (
    state.status ===
    EXECUTION_STATE.FILLED
  ) {
    state.warnings.push(
      "TERMINAL_EVENT_IGNORED_AFTER_FILL",
    );

    return state;
  }

  state.status =
    nextStatus;

  state.cancelEligible =
    false;

  state.retryEligible =
    [
      EXECUTION_STATE.REJECTED,
      EXECUTION_STATE.EXPIRED,
      EXECUTION_STATE.FAILED,
    ].includes(
      nextStatus,
    );

  if (
    nextStatus ===
      EXECUTION_STATE.CANCELLED
  ) {
    state.retryEligible =
      state.remainingQuantity > 0;
  }

  if (
    event.reason
  ) {
    state.reasons.push(
      String(
        event.reason,
      ),
    );
  }

  return state;
}

/**
 * ============================================================
 * MAIN REDUCER
 * ============================================================
 */

export function reduceExecutionState(
  currentState,
  event,
) {
  const state = {
    ...currentState,

    fills: [
      ...(currentState
        ?.fills ?? []),
    ],

    reasons: [
      ...(currentState
        ?.reasons ?? []),
    ],

    warnings: [
      ...(currentState
        ?.warnings ?? []),
    ],
  };

  const type =
    normalizeEvent(
      event,
    );

  if (!type) {
    state.warnings.push(
      "UNKNOWN_EXECUTION_EVENT",
    );

    return state;
  }

  state.lastEventAt =
    event.timestamp ??
    new Date()
      .toISOString();

  if (
    TERMINAL_STATES.has(
      state.status,
    ) &&
    type !==
      EXECUTION_EVENT.FILL
  ) {
    state.warnings.push(
      "EVENT_IGNORED_AFTER_TERMINAL_STATE",
    );

    return state;
  }

  switch (type) {
    case EXECUTION_EVENT.SUBMIT: {
      if (
        state.status !==
        EXECUTION_STATE.CREATED
      ) {
        state.duplicateSubmission =
          true;

        state.warnings.push(
          "DUPLICATE_SUBMISSION_BLOCKED",
        );

        return state;
      }

      state.status =
        EXECUTION_STATE.SUBMITTED;

      state.cancelEligible =
        true;

      state.exchangeOrderId =
        event.exchangeOrderId ??
        state.exchangeOrderId;

      return state;
    }

    case EXECUTION_EVENT.ACK: {
      if (
        state.status ===
          EXECUTION_STATE.SUBMITTED ||
        state.status ===
          EXECUTION_STATE.CREATED
      ) {
        state.status =
          EXECUTION_STATE.ACKNOWLEDGED;

        state.cancelEligible =
          true;

        state.exchangeOrderId =
          event.exchangeOrderId ??
          state.exchangeOrderId;
      }

      return state;
    }

    case EXECUTION_EVENT.FILL:
      return applyFill(
        state,
        event,
      );

    case EXECUTION_EVENT.CANCEL_REQUESTED: {
      if (
        state.status ===
          EXECUTION_STATE.FILLED
      ) {
        state.warnings.push(
          "CANCEL_IGNORED_ORDER_ALREADY_FILLED",
        );

        return state;
      }

      state.status =
        EXECUTION_STATE.CANCEL_PENDING;

      state.cancelEligible =
        false;

      return state;
    }

    case EXECUTION_EVENT.CANCELLED:
      return applyTerminalEvent(
        state,
        EXECUTION_STATE.CANCELLED,
        event,
      );

    case EXECUTION_EVENT.REJECTED:
      return applyTerminalEvent(
        state,
        EXECUTION_STATE.REJECTED,
        event,
      );

    case EXECUTION_EVENT.EXPIRED:
      return applyTerminalEvent(
        state,
        EXECUTION_STATE.EXPIRED,
        event,
      );

    case EXECUTION_EVENT.FAILED:
      return applyTerminalEvent(
        state,
        EXECUTION_STATE.FAILED,
        event,
      );

    default:
      return state;
  }
}

/**
 * ============================================================
 * CREATE STATE
 * ============================================================
 */

export function createExecutionState(
  executionRequest,
) {
  return initialState(
    executionRequest,
  );
}

/**
 * ============================================================
 * APPLY EVENT SEQUENCE
 * ============================================================
 */

export function reconcileExecutionEvents(
  executionRequest,
  events = [],
) {
  let state =
    createExecutionState(
      executionRequest,
    );

  for (
    const event
    of events
  ) {
    state =
      reduceExecutionState(
        state,
        event,
      );
  }

  return state;
}

/**
 * ============================================================
 * STALENESS
 * ============================================================
 */

export function markExecutionStale(
  state,
  {
    stale = true,
  } = {},
) {
  return {
    ...state,

    stale:
      stale === true,

    warnings: [
      ...(state
        ?.warnings ?? []),

      ...(stale
        ? [
            "EXECUTION_STATE_STALE",
          ]
        : []),
    ],

    executionAuthority:
      false,
  };
}

export default {
  createExecutionState,
  reduceExecutionState,
  reconcileExecutionEvents,
  markExecutionStale,
};