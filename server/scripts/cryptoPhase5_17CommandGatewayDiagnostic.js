import {
  buildExecutionCommand,
} from "../src/crypto/trading/execution/cryptoExecutionCommandGateway.js";

function adapter({
  intent,
  direction = "LONG",
  side = "BUY",
  reduceOnly = false,
  quantity = 1,
  stopPrice = null,
} = {}) {
  return {
    approved: true,

    executionRequest: {
      symbol:
        "BTCUSDT",

      intent,

      direction,

      side,

      orderType:
        intent ===
          "EMERGENCY_CLOSE"
          ? "MARKET"
          : intent ===
              "STOP_UPDATE"
            ? "STOP_MARKET"
            : "MARKET",

      quantity,

      stopPrice,

      leverage: 2,

      reduceOnly,

      postOnly: false,

      timeInForce:
        "IOC",

      clientOrderId:
        `AEMA-${intent}-1`,
    },
  };
}

const scenarios = [
  {
    name:
      "OPEN",

    input: {
      executionAdapterResult:
        adapter({
          intent: "OPEN",
          direction: "LONG",
          side: "BUY",
        }),
    },
  },

  {
    name:
      "INCREASE",

    input: {
      executionAdapterResult:
        adapter({
          intent: "INCREASE",
          direction: "LONG",
          side: "BUY",
        }),
    },
  },

  {
    name:
      "REDUCE",

    input: {
      executionAdapterResult:
        adapter({
          intent: "REDUCE",
          direction: "LONG",
          side: "SELL",
          reduceOnly: true,
        }),
    },
  },

  {
    name:
      "CLOSE",

    input: {
      executionAdapterResult:
        adapter({
          intent: "CLOSE",
          direction: "LONG",
          side: "SELL",
          reduceOnly: true,
        }),
    },
  },

  {
    name:
      "EMERGENCY",

    input: {
      executionAdapterResult:
        adapter({
          intent:
            "EMERGENCY_CLOSE",
          direction: "LONG",
          side: "SELL",
          reduceOnly: true,
        }),
    },
  },

  {
    name:
      "STOP_UPDATE",

    input: {
      executionAdapterResult:
        adapter({
          intent:
            "STOP_UPDATE",
          direction: "LONG",
          side: null,
          reduceOnly: true,
          stopPrice: 98,
        }),
    },
  },

  {
    name:
      "RETRY_REMAINDER",

    input: {
      reconciliation: {
        action:
          "RETRY_REMAINDER",

        retryQuantity:
          3,

        local: {
          symbol:
            "BTCUSDT",

          intent:
            "OPEN",

          direction:
            "LONG",

          side:
            "BUY",

          reduceOnly:
            false,

          clientOrderId:
            "OLD-1",
        },
      },
    },
  },

  {
    name:
      "CANCEL_STALE",

    input: {
      reconciliation: {
        action:
          "CANCEL_STALE",

        local: {
          symbol:
            "BTCUSDT",

          clientOrderId:
            "AEMA-STALE-1",
        },

        exchange: {
          exchangeOrderId:
            "EX-1",
        },
      },
    },
  },

  {
    name:
      "REPAIR_STOP",

    input: {
      reconciliation: {
        action:
          "REPAIR_STOP",

        local: {
          symbol:
            "BTCUSDT",
        },

        position: {
          quantity: 2,
        },
      },

      position: {
        symbol:
          "BTCUSDT",

        direction:
          "LONG",

        quantity:
          2,
      },

      stopPlan: {
        stopPrice:
          99,
      },
    },
  },

  {
    name:
      "WAIT",

    input: {
      reconciliation: {
        action:
          "WAIT",
      },
    },
  },

  {
    name:
      "IN_SYNC",

    input: {
      reconciliation: {
        action:
          "IN_SYNC",
      },
    },
  },

  {
    name:
      "MANUAL_REVIEW",

    input: {
      reconciliation: {
        action:
          "MANUAL_REVIEW",
      },
    },
  },

  {
    name:
      "EMERGENCY_RECONCILIATION",

    input: {
      reconciliation: {
        action:
          "EMERGENCY_RECONCILIATION",

        local: {
          symbol:
            "BTCUSDT",
        },

        position: {
          direction:
            "SHORT",

          quantity:
            4,
        },
      },

      position: {
        symbol:
          "BTCUSDT",

        direction:
          "SHORT",

        quantity:
          4,
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
    buildExecutionCommand(
      scenario.input,
    );

  outputs[
    scenario.name
  ] =
    result;

  rows.push({
    scenario:
      scenario.name,

    approved:
      result.approved,

    command:
      result.command,

    symbol:
      result.payload
        ?.symbol ??
      "N/A",

    quantity:
      result.payload
        ?.quantity ??
      0,

    reduceOnly:
      result.payload
        ?.reduceOnly ??
      false,

    authority:
      result.executionAuthority,

    blocker:
      result.blockers
        ?.join(", ") ??
      "NONE",
  });
}

console.log(
  "\nAEMA CRYPTO PHASE 5.17 — EXECUTION COMMAND GATEWAY\n",
);

console.table(rows);

const invariants = {
  openBecomesSubmit:
    outputs.OPEN
      ?.command ===
      "SUBMIT_ORDER",

  increaseBecomesSubmit:
    outputs.INCREASE
      ?.command ===
      "SUBMIT_ORDER",

  reduceBecomesClose:
    outputs.REDUCE
      ?.command ===
      "CLOSE_POSITION",

  closeBecomesClose:
    outputs.CLOSE
      ?.command ===
      "CLOSE_POSITION",

  emergencyRecognized:
    outputs.EMERGENCY
      ?.command ===
      "EMERGENCY_CLOSE",

  emergencyRemainsReduceOnly:
    outputs.EMERGENCY
      ?.payload
      ?.reduceOnly ===
      true,

  stopUpdateBecomesReplacement:
    outputs.STOP_UPDATE
      ?.command ===
      "REPLACE_STOP",

  stopUpdateRemainsReduceOnly:
    outputs.STOP_UPDATE
      ?.payload
      ?.reduceOnly ===
      true,

  retryRemainderUsesExactQuantity:
    outputs.RETRY_REMAINDER
      ?.command ===
      "RETRY_REMAINDER" &&
    outputs.RETRY_REMAINDER
      ?.payload
      ?.quantity ===
      3,

  staleOrderCancellationGenerated:
    outputs.CANCEL_STALE
      ?.command ===
      "CANCEL_ORDER",

  stopRepairGenerated:
    outputs.REPAIR_STOP
      ?.command ===
      "REPLACE_STOP",

  waitProducesNoAction:
    outputs.WAIT
      ?.command ===
      "NO_ACTION",

  syncProducesNoAction:
    outputs.IN_SYNC
      ?.command ===
      "NO_ACTION",

  manualReviewBlocksAutomation:
    outputs.MANUAL_REVIEW
      ?.command ===
      "MANUAL_REVIEW" &&
    outputs.MANUAL_REVIEW
      ?.approved ===
      false,

  reconciliationEmergencyGenerated:
    outputs.EMERGENCY_RECONCILIATION
      ?.command ===
      "EMERGENCY_CLOSE" &&
    outputs.EMERGENCY_RECONCILIATION
      ?.payload
      ?.reduceOnly ===
      true,

  noExecutionAuthority:
    Object.values(
      outputs,
    ).every(
      result =>
        result
          .executionAuthority ===
        false,
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
    "\nPHASE 5.17 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.17 PASSED — execution command gateway behavior is valid.",
  );
}