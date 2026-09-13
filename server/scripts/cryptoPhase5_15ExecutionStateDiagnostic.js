import {
  createExecutionState,
  reduceExecutionState,
  reconcileExecutionEvents,
  markExecutionStale,
} from "../src/crypto/trading/execution/cryptoExecutionStateMachine.js";

const request = {
  clientOrderId:
    "AEMA-BTCUSDT-OPEN-LONG-1",

  symbol:
    "BTCUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  orderType:
    "MARKET",

  quantity:
    10,

  reduceOnly:
    false,
};

const scenarios = {};

/**
 * ============================================================
 * CREATED
 * ============================================================
 */

scenarios.CREATED =
  createExecutionState(
    request,
  );

/**
 * ============================================================
 * SUBMITTED
 * ============================================================
 */

scenarios.SUBMITTED =
  reduceExecutionState(
    scenarios.CREATED,
    {
      type:
        "SUBMIT",

      exchangeOrderId:
        "EX-1001",
    },
  );

/**
 * ============================================================
 * ACKNOWLEDGED
 * ============================================================
 */

scenarios.ACKNOWLEDGED =
  reduceExecutionState(
    scenarios.SUBMITTED,
    {
      type:
        "ACK",

      exchangeOrderId:
        "EX-1001",
    },
  );

/**
 * ============================================================
 * PARTIAL FILL
 * ============================================================
 */

scenarios.PARTIAL =
  reduceExecutionState(
    scenarios.ACKNOWLEDGED,
    {
      type:
        "FILL",

      quantity:
        6,

      price:
        100,

      feeUsd:
        0.6,

      tradeId:
        "T1",
    },
  );

/**
 * ============================================================
 * COMPLETE FILL
 * ============================================================
 */

scenarios.FILLED =
  reduceExecutionState(
    scenarios.PARTIAL,
    {
      type:
        "FILL",

      quantity:
        4,

      price:
        102,

      feeUsd:
        0.4,

      tradeId:
        "T2",
    },
  );

/**
 * ============================================================
 * DUPLICATE SUBMISSION
 * ============================================================
 */

scenarios.DUPLICATE =
  reduceExecutionState(
    scenarios.SUBMITTED,
    {
      type:
        "SUBMIT",

      exchangeOrderId:
        "EX-1002",
    },
  );

/**
 * ============================================================
 * OVERFILL
 * ============================================================
 */

scenarios.OVERFILL =
  reconcileExecutionEvents(
    request,
    [
      {
        type:
          "SUBMIT",
      },

      {
        type:
          "ACK",
      },

      {
        type:
          "FILL",

        quantity:
          12,

        price:
          100,
      },
    ],
  );

/**
 * ============================================================
 * REJECTED
 * ============================================================
 */

scenarios.REJECTED =
  reconcileExecutionEvents(
    request,
    [
      {
        type:
          "SUBMIT",
      },

      {
        type:
          "REJECTED",

        reason:
          "EXCHANGE_REJECTED",
      },
    ],
  );

/**
 * ============================================================
 * CANCEL PARTIAL
 * ============================================================
 */

scenarios.CANCELLED_PARTIAL =
  reconcileExecutionEvents(
    request,
    [
      {
        type:
          "SUBMIT",
      },

      {
        type:
          "ACK",
      },

      {
        type:
          "FILL",

        quantity:
          3,

        price:
          100,
      },

      {
        type:
          "CANCEL_REQUESTED",
      },

      {
        type:
          "CANCELLED",
      },
    ],
  );

/**
 * ============================================================
 * EXPIRED
 * ============================================================
 */

scenarios.EXPIRED =
  reconcileExecutionEvents(
    request,
    [
      {
        type:
          "SUBMIT",
      },

      {
        type:
          "EXPIRED",

        reason:
          "ORDER_EXPIRED",
      },
    ],
  );

/**
 * ============================================================
 * FAILED
 * ============================================================
 */

scenarios.FAILED =
  reconcileExecutionEvents(
    request,
    [
      {
        type:
          "SUBMIT",
      },

      {
        type:
          "FAILED",

        reason:
          "TRANSPORT_FAILURE",
      },
    ],
  );

/**
 * ============================================================
 * STALE
 * ============================================================
 */

scenarios.STALE =
  markExecutionStale(
    scenarios.PARTIAL,
  );

const rows =
  Object.entries(
    scenarios,
  ).map(
    ([
      scenario,
      state,
    ]) => ({
      scenario,

      status:
        state.status,

      requested:
        state
          .requestedQuantity,

      filled:
        state
          .filledQuantity,

      remaining:
        state
          .remainingQuantity,

      average:
        state
          .averageFillPrice,

      fees:
        state.feesUsd,

      retry:
        state.retryEligible,

      cancel:
        state.cancelEligible,

      duplicate:
        state
          .duplicateSubmission,

      overfill:
        state
          .overfillDetected,

      stale:
        state.stale,
    }),
  );

console.log(
  "\nAEMA CRYPTO PHASE 5.15 — EXECUTION STATE MACHINE & FILL RECONCILIATION\n",
);

console.table(rows);

const invariants = {
  createdCorrectly:
    scenarios.CREATED
      .status ===
      "CREATED",

  submitTransitionValid:
    scenarios.SUBMITTED
      .status ===
      "SUBMITTED",

  acknowledgementValid:
    scenarios.ACKNOWLEDGED
      .status ===
      "ACKNOWLEDGED",

  partialFillRecognized:
    scenarios.PARTIAL
      .status ===
      "PARTIALLY_FILLED" &&
    scenarios.PARTIAL
      .filledQuantity ===
      6 &&
    scenarios.PARTIAL
      .remainingQuantity ===
      4,

  fullFillRecognized:
    scenarios.FILLED
      .status ===
      "FILLED" &&
    scenarios.FILLED
      .filledQuantity ===
      10 &&
    scenarios.FILLED
      .remainingQuantity ===
      0,

  weightedAverageCorrect:
    scenarios.FILLED
      .averageFillPrice ===
      100.8,

  feesAccumulated:
    scenarios.FILLED
      .feesUsd ===
      1,

  duplicateSubmissionBlocked:
    scenarios.DUPLICATE
      .duplicateSubmission ===
      true,

  overfillClamped:
    scenarios.OVERFILL
      .filledQuantity ===
      10 &&
    scenarios.OVERFILL
      .overfillDetected ===
      true,

  rejectedRetryEligible:
    scenarios.REJECTED
      .status ===
      "REJECTED" &&
    scenarios.REJECTED
      .retryEligible ===
      true,

  partialCancellationPreserved:
    scenarios.CANCELLED_PARTIAL
      .status ===
      "CANCELLED" &&
    scenarios.CANCELLED_PARTIAL
      .filledQuantity ===
      3 &&
    scenarios.CANCELLED_PARTIAL
      .remainingQuantity ===
      7,

  cancelledPartialCanRetry:
    scenarios.CANCELLED_PARTIAL
      .retryEligible ===
      true,

  expiredRecognized:
    scenarios.EXPIRED
      .status ===
      "EXPIRED",

  failedRecognized:
    scenarios.FAILED
      .status ===
      "FAILED",

  staleRecognized:
    scenarios.STALE
      .stale ===
      true,

  actualFillNotRequestedUsed:
    scenarios.PARTIAL
      .filledQuantity !==
      scenarios.PARTIAL
        .requestedQuantity,

  noExecutionAuthority:
    Object.values(
      scenarios,
    ).every(
      (state) =>
        state
          .executionAuthority ===
        false,
    ),
};

console.log(
  "\nINVARIANTS",
);

console.log(invariants);

const passed =
  Object.values(
    invariants,
  ).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.15 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.15 PASSED — execution state and fill reconciliation behavior is valid.",
  );
}