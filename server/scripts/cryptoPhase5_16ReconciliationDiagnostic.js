import {
  reconcileCryptoExecution,
} from "../src/crypto/trading/execution/cryptoExchangeReconciliationManager.js";

const baseLocal = {
  clientOrderId:
    "AEMA-BTC-1",

  status:
    "ACKNOWLEDGED",

  requestedQuantity:
    10,

  filledQuantity:
    0,

  remainingQuantity:
    10,

  retryEligible:
    false,

  stale:
    false,
};

const scenarios = [
  {
    name:
      "IN_SYNC",

    input: {
      localState: {
        ...baseLocal,

        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      exchangeOrder: {
        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      expectedPosition: {
        direction:
          "LONG",

        quantity:
          10,
      },

      exchangePosition: {
        direction:
          "LONG",

        quantity:
          10,
      },
    },
  },

  {
    name:
      "WAIT_UNKNOWN",

    input: {
      localState: {
        ...baseLocal,

        status:
          "SUBMITTED",
      },

      exchangeOrder:
        null,
    },
  },

  {
    name:
      "ADOPT_EXCHANGE_FILL",

    input: {
      localState: {
        ...baseLocal,

        status:
          "PARTIALLY_FILLED",

        filledQuantity:
          4,

        remainingQuantity:
          6,
      },

      exchangeOrder: {
        status:
          "PARTIALLY_FILLED",

        filledQuantity:
          7,

        remainingQuantity:
          3,
      },
    },
  },

  {
    name:
      "LOCAL_AHEAD_MANUAL",

    input: {
      localState: {
        ...baseLocal,

        status:
          "PARTIALLY_FILLED",

        filledQuantity:
          7,

        remainingQuantity:
          3,
      },

      exchangeOrder: {
        status:
          "PARTIALLY_FILLED",

        filledQuantity:
          4,

        remainingQuantity:
          6,
      },
    },
  },

  {
    name:
      "RETRY_PARTIAL_REMAINDER",

    input: {
      localState: {
        ...baseLocal,

        status:
          "CANCELLED",

        filledQuantity:
          3,

        remainingQuantity:
          7,

        retryEligible:
          true,
      },

      exchangeOrder: {
        status:
          "CANCELLED",

        filledQuantity:
          3,

        remainingQuantity:
          7,
      },

      exchangePosition: {
        direction:
          "LONG",

        quantity:
          3,
      },
    },
  },

  {
    name:
      "CANCEL_STALE",

    input: {
      localState: {
        ...baseLocal,

        status:
          "ACKNOWLEDGED",

        stale:
          true,
      },

      exchangeOrder: {
        status:
          "OPEN",

        filledQuantity:
          0,

        remainingQuantity:
          10,
      },
    },
  },

  {
    name:
      "SYNC_POSITION",

    input: {
      localState: {
        ...baseLocal,

        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      exchangeOrder: {
        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      expectedPosition: {
        direction:
          "LONG",

        quantity:
          10,
      },

      exchangePosition: {
        direction:
          "LONG",

        quantity:
          8,
      },
    },
  },

  {
    name:
      "DIRECTION_CONFLICT",

    input: {
      localState: {
        ...baseLocal,

        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      exchangeOrder: {
        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      expectedPosition: {
        direction:
          "LONG",

        quantity:
          10,
      },

      exchangePosition: {
        direction:
          "SHORT",

        quantity:
          10,
      },
    },
  },

  {
    name:
      "REPAIR_STOP",

    input: {
      localState: {
        ...baseLocal,

        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      exchangeOrder: {
        status:
          "FILLED",

        filledQuantity:
          10,

        remainingQuantity:
          0,
      },

      expectedPosition: {
        direction:
          "LONG",

        quantity:
          10,
      },

      exchangePosition: {
        direction:
          "LONG",

        quantity:
          10,
      },

      stopState: {
        expected:
          true,

        exchangePresent:
          false,
      },
    },
  },

  {
    name:
      "FAILED_RETRY",

    input: {
      localState: {
        ...baseLocal,

        status:
          "FAILED",

        filledQuantity:
          0,

        remainingQuantity:
          10,

        retryEligible:
          true,
      },

      exchangeOrder: {
        status:
          "FAILED",

        filledQuantity:
          0,

        remainingQuantity:
          10,
      },

      exchangePosition: {
        direction:
          "NEUTRAL",

        quantity:
          0,
      },
    },
  },
];

const outputs = {};
const rows = [];

for (
  const scenario
  of scenarios
) {
  const result =
    reconcileCryptoExecution(
      scenario.input,
    );

  outputs[
    scenario.name
  ] =
    result;

  rows.push({
    scenario:
      scenario.name,

    action:
      result.action,

    approved:
      result.approved,

    urgency:
      result.urgency,

    retry:
      result.retryQuantity,

    manual:
      result.manualReview,

    reason:
      result.reasons
        ?.join(", ") ||
      "NONE",

    execution:
      result.noExecutionAuthority,
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.16 — EXCHANGE RECONCILIATION & RECOVERY\n",
);

console.table(
  rows,
);

const invariants = {
  alignedStateRecognized:
    outputs.IN_SYNC
      ?.action ===
      "IN_SYNC",

  unknownDoesNotRetry:
    outputs.WAIT_UNKNOWN
      ?.action ===
      "WAIT",

  exchangeFillAdopted:
    outputs.ADOPT_EXCHANGE_FILL
      ?.action ===
      "ADOPT_EXCHANGE_FILL",

  localAheadRequiresReview:
    outputs.LOCAL_AHEAD_MANUAL
      ?.action ===
      "MANUAL_REVIEW",

  partialRemainderRetryable:
    outputs.RETRY_PARTIAL_REMAINDER
      ?.action ===
      "RETRY_REMAINDER" &&
    outputs.RETRY_PARTIAL_REMAINDER
      ?.retryQuantity ===
      7,

  staleOrderCancelled:
    outputs.CANCEL_STALE
      ?.action ===
      "CANCEL_STALE",

  quantityMismatchSynced:
    outputs.SYNC_POSITION
      ?.action ===
      "SYNC_POSITION",

  directionConflictEmergency:
    outputs.DIRECTION_CONFLICT
      ?.action ===
      "EMERGENCY_RECONCILIATION",

  missingStopRepaired:
    outputs.REPAIR_STOP
      ?.action ===
      "REPAIR_STOP",

  failedOrderRetryConsidered:
    outputs.FAILED_RETRY
      ?.action ===
      "RETRY_REMAINDER",

  noExecutionAuthority:
    Object.values(
      outputs,
    ).every(
      result =>
        result
          .noExecutionAuthority ===
        true,
    ),
};

console.log(
  "\nINVARIANTS",
);

console.log(
  invariants,
);

const passed =
  Object.values(
    invariants,
  ).every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.16 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.16 PASSED — reconciliation and recovery behavior is valid.",
  );
}