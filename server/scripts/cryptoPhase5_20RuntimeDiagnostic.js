/**
 * AEMA CRYPTO
 * Phase 5.20 Diagnostic
 *
 * STATEFUL PAPER TRADING RUNTIME
 */

import createCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoPaperTradingRuntime.js";

console.log(
  "\nAEMA CRYPTO PHASE 5.20 — STATEFUL PAPER TRADING RUNTIME\n",
);

const runtime =
  createCryptoPaperTradingRuntime();

const rows = [];

function addRow(
  scenario,
  result,
  symbol = "BTCUSDT",
) {
  const state =
    runtime.getSymbolState(
      symbol,
    );

  rows.push({
    scenario,

    status:
      result?.status ??
      "N/A",

    approved:
      result?.approved ??
      false,

    direction:
      state?.position
        ?.direction ??
      "N/A",

    quantity:
      state?.position
        ?.quantity ??
      0,

    exposure:
      state?.position
        ?.exposure ??
      0,

    lifecycle:
      state?.position
        ?.lifecycleState ??
      "N/A",

    exitPending:
      state?.position
        ?.exitPending ??
      false,

    stop:
      state?.protectiveStop
        ?.stopPrice ??
      "N/A",

    blocker:
      result?.blocker ??
      "NONE",

    authority:
      result
        ?.executionAuthority ??
      false,
  });
}

/*
 * ---------------------------------------------------------
 * 1. OPEN LONG
 * ---------------------------------------------------------
 */

const openCycle =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:OPEN:1",

    action:
      "OPEN_POSITION",

    requestedDirection:
      "LONG",
  });

runtime.registerOrder({
  symbol:
    "BTCUSDT",

  order: {
    clientOrderId:
      "paper-open-1",

    status:
      "CREATED",

    quantity:
      10,
  },
});

runtime.updateOrderState({
  symbol:
    "BTCUSDT",

  executionState: {
    status:
      "FILLED",

    requestedQuantity:
      10,

    filledQuantity:
      10,

    remainingQuantity:
      0,
  },
});

runtime.adoptExchangePosition({
  symbol:
    "BTCUSDT",

  exchangePosition: {
    direction:
      "LONG",

    quantity:
      10,

    exposure:
      1,

    averageEntryPrice:
      100,
  },
});

runtime.clearTerminalOrder({
  symbol:
    "BTCUSDT",
});

runtime.completeCycle({
  symbol:
    "BTCUSDT",

  cycleKey:
    "BTC:OPEN:1",
});

addRow(
  "OPEN_LONG",
  openCycle,
);

/*
 * ---------------------------------------------------------
 * 2. DUPLICATE CYCLE
 * ---------------------------------------------------------
 */

const duplicate =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:OPEN:1",

    action:
      "OPEN_POSITION",

    requestedDirection:
      "LONG",
  });

addRow(
  "DUPLICATE_CYCLE",
  duplicate,
);

/*
 * ---------------------------------------------------------
 * 3. CONCURRENT SYMBOL LOCK
 * ---------------------------------------------------------
 */

const lockOne =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:HOLD:2",

    action:
      "HOLD",

    requestedDirection:
      "LONG",
  });

const lockTwo =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:HOLD:3",

    action:
      "HOLD",

    requestedDirection:
      "LONG",
  });

addRow(
  "CONCURRENT_LOCK",
  lockTwo,
);

runtime.completeCycle({
  symbol:
    "BTCUSDT",

  cycleKey:
    "BTC:HOLD:2",
});

/*
 * ---------------------------------------------------------
 * 4. HOLD DOES NOT ADD EXPOSURE
 * ---------------------------------------------------------
 */

const beforeHold =
  runtime.getSymbolState(
    "BTCUSDT",
  );

const hold =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:HOLD:4",

    action:
      "HOLD",

    requestedDirection:
      "LONG",
  });

runtime.completeCycle({
  symbol:
    "BTCUSDT",

  cycleKey:
    "BTC:HOLD:4",
});

const afterHold =
  runtime.getSymbolState(
    "BTCUSDT",
  );

addRow(
  "HEALTHY_HOLD",
  hold,
);

/*
 * ---------------------------------------------------------
 * 5. DIRECT LONG -> SHORT FLIP BLOCKED
 * ---------------------------------------------------------
 */

const flip =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:FLIP:5",

    action:
      "OPEN_POSITION",

    requestedDirection:
      "SHORT",
  });

addRow(
  "DIRECT_FLIP_BLOCKED",
  flip,
);

/*
 * ---------------------------------------------------------
 * 6. PARTIAL FILL TRUTH
 * ---------------------------------------------------------
 */

const ethCycle =
  runtime.beginCycle({
    symbol:
      "ETHUSDT",

    cycleKey:
      "ETH:OPEN:1",

    action:
      "OPEN_POSITION",

    requestedDirection:
      "LONG",
  });

runtime.registerOrder({
  symbol:
    "ETHUSDT",

  order: {
    clientOrderId:
      "paper-eth-partial",

    status:
      "CREATED",

    quantity:
      10,
  },
});

runtime.updateOrderState({
  symbol:
    "ETHUSDT",

  executionState: {
    status:
      "PARTIALLY_FILLED",

    requestedQuantity:
      10,

    filledQuantity:
      4,

    remainingQuantity:
      6,
  },
});

runtime.adoptExchangePosition({
  symbol:
    "ETHUSDT",

  exchangePosition: {
    direction:
      "LONG",

    quantity:
      4,

    exposure:
      0.4,

    averageEntryPrice:
      2000,
  },
});

runtime.completeCycle({
  symbol:
    "ETHUSDT",

  cycleKey:
    "ETH:OPEN:1",
});

addRow(
  "PARTIAL_FILL_PRESERVED",
  ethCycle,
  "ETHUSDT",
);

/*
 * ---------------------------------------------------------
 * 7. ACTIVE PARTIAL ORDER PREVENTS NEW ADD
 * ---------------------------------------------------------
 */

const addDuringPartial =
  runtime.beginCycle({
    symbol:
      "ETHUSDT",

    cycleKey:
      "ETH:ADD:2",

    action:
      "ADD_EXPOSURE",

    requestedDirection:
      "LONG",
  });

addRow(
  "PARTIAL_PREVENTS_DUPLICATE_ADD",
  addDuringPartial,
  "ETHUSDT",
);

/*
 * ---------------------------------------------------------
 * 8. PROTECTIVE STOP
 * ---------------------------------------------------------
 */

const stopOne =
  runtime.updateProtectiveStop({
    symbol:
      "BTCUSDT",

    stopPrice:
      98,
  });

addRow(
  "INITIAL_STOP",
  stopOne,
);

/*
 * ---------------------------------------------------------
 * 9. LONG STOP MAY TIGHTEN
 * ---------------------------------------------------------
 */

const stopTighten =
  runtime.updateProtectiveStop({
    symbol:
      "BTCUSDT",

    stopPrice:
      99.2,
  });

addRow(
  "STOP_TIGHTEN",
  stopTighten,
);

/*
 * ---------------------------------------------------------
 * 10. LONG STOP CANNOT LOOSEN
 * ---------------------------------------------------------
 */

const stopLoosen =
  runtime.updateProtectiveStop({
    symbol:
      "BTCUSDT",

    stopPrice:
      97,
  });

addRow(
  "STOP_LOOSEN_BLOCKED",
  stopLoosen,
);

/*
 * ---------------------------------------------------------
 * 11. EXIT PENDING
 * ---------------------------------------------------------
 */

runtime.setLifecycleState({
  symbol:
    "BTCUSDT",

  state:
    "EXIT_PENDING",

  action:
    "EXIT_POSITION",

  targetExposure:
    0,
});

const rebuild =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:REBUILD:6",

    action:
      "ADD_EXPOSURE",

    requestedDirection:
      "LONG",
  });

addRow(
  "EXIT_PENDING_NO_REBUILD",
  rebuild,
);

/*
 * ---------------------------------------------------------
 * 12. RISK REDUCTION STILL ALLOWED
 * ---------------------------------------------------------
 */

const exitAllowed =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:EXIT:7",

    action:
      "EMERGENCY_EXIT",

    requestedDirection:
      "LONG",
  });

addRow(
  "EMERGENCY_EXIT_ALLOWED",
  exitAllowed,
);

runtime.completeCycle({
  symbol:
    "BTCUSDT",

  cycleKey:
    "BTC:EXIT:7",
});

/*
 * ---------------------------------------------------------
 * 13. EXCHANGE CONFIRMS FLAT
 * ---------------------------------------------------------
 */

runtime.adoptExchangePosition({
  symbol:
    "BTCUSDT",

  exchangePosition: {
    direction:
      "FLAT",

    quantity:
      0,

    exposure:
      0,
  },
});

const flatState =
  runtime.getSymbolState(
    "BTCUSDT",
  );

addRow(
  "EXCHANGE_FLAT_TERMINAL",
  {
    approved: true,
    status:
      "EXCHANGE_POSITION_ADOPTED",
  },
);

/*
 * ---------------------------------------------------------
 * 14. AFTER FLAT, SHORT MAY OPEN
 * ---------------------------------------------------------
 */

const shortAfterFlat =
  runtime.beginCycle({
    symbol:
      "BTCUSDT",

    cycleKey:
      "BTC:SHORT:8",

    action:
      "OPEN_POSITION",

    requestedDirection:
      "SHORT",
  });

addRow(
  "SHORT_AFTER_FLAT_ALLOWED",
  shortAfterFlat,
);

runtime.completeCycle({
  symbol:
    "BTCUSDT",

  cycleKey:
    "BTC:SHORT:8",
});

/*
 * ---------------------------------------------------------
 * OUTPUT
 * ---------------------------------------------------------
 */

console.table(
  rows,
);

/*
 * ---------------------------------------------------------
 * INVARIANTS
 * ---------------------------------------------------------
 */

const ethState =
  runtime.getSymbolState(
    "ETHUSDT",
  );

const runtimeSnapshot =
  runtime.getRuntimeState();

const invariants = {
  openLongStatePreserved:
    beforeHold
      ?.position
      ?.direction ===
      "LONG" &&
    beforeHold
      ?.position
      ?.quantity ===
      10,

  duplicateCycleBlocked:
    duplicate?.approved ===
      false &&
    duplicate?.blocker ===
      "DUPLICATE_CYCLE",

  concurrentSymbolCycleBlocked:
    lockOne?.approved ===
      true &&
    lockTwo?.approved ===
      false &&
    lockTwo?.blocker ===
      "SYMBOL_CYCLE_ALREADY_RUNNING",

  holdDoesNotIncreasePosition:
    beforeHold
      ?.position
      ?.quantity ===
    afterHold
      ?.position
      ?.quantity,

  directPositionFlipBlocked:
    flip?.approved ===
      false &&
    flip?.blocker ===
      "DIRECT_POSITION_FLIP_BLOCKED",

  partialFillTruthPreserved:
    ethState
      ?.position
      ?.quantity ===
      4,

  partialOrderStillActive:
    ethState
      ?.activeOrder
      ?.status ===
      "PARTIALLY_FILLED",

  activePartialPreventsDuplicateAdd:
    addDuringPartial
      ?.approved ===
      false &&
    addDuringPartial
      ?.blocker ===
      "ACTIVE_ORDER_ALREADY_EXISTS",

  stopCanTighten:
    stopTighten?.approved ===
      true,

  stopCannotLoosen:
    stopLoosen?.approved ===
      false &&
    stopLoosen?.blocker ===
      "LONG_STOP_CANNOT_LOOSEN",

  exitPendingCannotRebuild:
    rebuild?.approved ===
      false &&
    rebuild?.blocker ===
      "EXIT_PENDING_CANNOT_INCREASE_RISK",

  emergencyExitStillAllowed:
    exitAllowed?.approved ===
      true,

  flatClearsExitPending:
    flatState
      ?.position
      ?.direction ===
      "FLAT" &&
    flatState
      ?.position
      ?.quantity ===
      0 &&
    flatState
      ?.position
      ?.exitPending ===
      false,

  oppositeDirectionAllowedAfterFlat:
    shortAfterFlat
      ?.approved ===
      true,

  liveExecutionDisabled:
    runtimeSnapshot
      ?.liveExecutionEnabled ===
      false,

  paperOnly:
    runtimeSnapshot
      ?.paperOnly ===
      true,

  runtimeCannotExecute:
    runtimeSnapshot
      ?.executionAuthority ===
      false,
};

console.log(
  "\nINVARIANTS",
);

console.log(
  invariants,
);

const passed =
  Object
    .values(
      invariants,
    )
    .every(Boolean);

if (!passed) {
  console.error(
    "\nPHASE 5.20 FAILED — one or more invariants failed.",
  );

  process.exitCode = 1;
} else {
  console.log(
    "\nPHASE 5.20 PASSED — stateful paper trading runtime behavior is valid.",
  );
}