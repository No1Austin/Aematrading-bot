/**
 * AEMA CRYPTO
 * Phase 5.27
 *
 * PAPER EXECUTION -> LEDGER SYNC DIAGNOSTIC
 */

import createCryptoPaperAccountLedger
  from "../src/crypto/trading/account/cryptoPaperAccountLedger.js";

import syncPaperExecutionToLedger
  from "../src/crypto/trading/account/cryptoPaperExecutionLedgerSync.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.27 — PAPER EXECUTION LEDGER SYNC\n",
);


const ledger =
  createCryptoPaperAccountLedger({
    startingEquity:
      10_000,
  });


function sync({
  symbol,
  action,
  intent,
  direction,
  side,
  status,
  orderId,
  filledQuantity,
  averageFillPrice,
  fee = null,
}) {
  return syncPaperExecutionToLedger({
    ledger,

    symbol,

    lifecycle: {
      action,
      direction,
    },

    command: {
      intent,
      direction,
      side,
      clientOrderId:
        orderId,
    },

    executionState: {
      status,

      orderId,

      filledQuantity,

      averageFillPrice,

      fee,
    },
  });
}


/**
 * OPEN LONG
 */

const openLong =
  sync({
    symbol:
      "BTCUSDT",

    action:
      "OPEN_POSITION",

    intent:
      "OPEN",

    direction:
      "LONG",

    side:
      "BUY",

    status:
      "FILLED",

    orderId:
      "BTC-OPEN-1",

    filledQuantity:
      10,

    averageFillPrice:
      100,

    fee:
      5,
  });


/**
 * PARTIAL ADD
 *
 * Requested might have been 10.
 * Only actual 4 reaches ledger.
 */

const partialAdd =
  sync({
    symbol:
      "BTCUSDT",

    action:
      "ADD_EXPOSURE",

    intent:
      "INCREASE",

    direction:
      "LONG",

    side:
      "BUY",

    status:
      "PARTIALLY_FILLED",

    orderId:
      "BTC-ADD-1",

    filledQuantity:
      4,

    averageFillPrice:
      110,

    fee:
      2,
  });


const afterPartial =
  ledger.getPosition(
    "BTCUSDT",
  );


/**
 * DUPLICATE PARTIAL EVENT
 */

const duplicate =
  sync({
    symbol:
      "BTCUSDT",

    action:
      "ADD_EXPOSURE",

    intent:
      "INCREASE",

    direction:
      "LONG",

    side:
      "BUY",

    status:
      "PARTIALLY_FILLED",

    orderId:
      "BTC-ADD-1",

    filledQuantity:
      4,

    averageFillPrice:
      110,

    fee:
      2,
  });


const afterDuplicate =
  ledger.getPosition(
    "BTCUSDT",
  );


/**
 * PARTIAL REDUCTION
 */

const reduce =
  sync({
    symbol:
      "BTCUSDT",

    action:
      "REDUCE_EXPOSURE",

    intent:
      "REDUCE",

    direction:
      "LONG",

    side:
      "SELL",

    status:
      "FILLED",

    orderId:
      "BTC-REDUCE-1",

    filledQuantity:
      4,

    averageFillPrice:
      120,

    fee:
      2,
  });


const afterReduce =
  ledger.getSnapshot();


/**
 * FULL CLOSE
 */

const remaining =
  ledger
    .getPosition(
      "BTCUSDT",
    )
    .quantity;


const close =
  sync({
    symbol:
      "BTCUSDT",

    action:
      "EXIT_POSITION",

    intent:
      "CLOSE",

    direction:
      "LONG",

    side:
      "SELL",

    status:
      "FILLED",

    orderId:
      "BTC-CLOSE-1",

    filledQuantity:
      remaining,

    averageFillPrice:
      115,

    fee:
      3,
  });


/**
 * OPEN SHORT
 */

const openShort =
  sync({
    symbol:
      "ETHUSDT",

    action:
      "OPEN_POSITION",

    intent:
      "OPEN",

    direction:
      "SHORT",

    side:
      "SELL",

    status:
      "FILLED",

    orderId:
      "ETH-OPEN-1",

    filledQuantity:
      5,

    averageFillPrice:
      200,

    fee:
      1,
  });


/**
 * EMERGENCY CLOSE SHORT
 */

const emergency =
  sync({
    symbol:
      "ETHUSDT",

    action:
      "EMERGENCY_EXIT",

    intent:
      "EMERGENCY_CLOSE",

    direction:
      "SHORT",

    side:
      "BUY",

    status:
      "FILLED",

    orderId:
      "ETH-EMERGENCY-1",

    filledQuantity:
      5,

    averageFillPrice:
      180,

    fee:
      1,
  });


/**
 * NON-FILL MUST NOT TOUCH LEDGER
 */

const beforeNoFill =
  ledger.getSnapshot();

const noFill =
  syncPaperExecutionToLedger({
    ledger,

    symbol:
      "SOLUSDT",

    lifecycle: {
      action:
        "OPEN_POSITION",

      direction:
        "LONG",
    },

    command: {
      intent:
        "OPEN",

      side:
        "BUY",

      clientOrderId:
        "SOL-NOT-FILLED",
    },

    executionState: {
      status:
        "ACKNOWLEDGED",

      filledQuantity:
        0,

      averageFillPrice:
        null,
    },
  });

const afterNoFill =
  ledger.getSnapshot();


const final =
  ledger.getSnapshot();


console.table([
  {
    scenario:
      "OPEN_LONG",

    status:
      openLong?.status,

    qty:
      ledger
        .getPosition(
          "BTCUSDT",
        )
        .quantity,
  },

  {
    scenario:
      "PARTIAL_ADD",

    status:
      partialAdd?.status,

    qty:
      afterPartial.quantity,
  },

  {
    scenario:
      "DUPLICATE",

    status:
      duplicate?.status,

    qty:
      afterDuplicate.quantity,
  },

  {
    scenario:
      "REDUCE",

    status:
      reduce?.status,

    realized:
      afterReduce.realizedPnl,
  },

  {
    scenario:
      "CLOSE",

    status:
      close?.status,

    direction:
      ledger
        .getPosition(
          "BTCUSDT",
        )
        .direction,
  },

  {
    scenario:
      "OPEN_SHORT",

    status:
      openShort?.status,
  },

  {
    scenario:
      "EMERGENCY_CLOSE",

    status:
      emergency?.status,

    direction:
      ledger
        .getPosition(
          "ETHUSDT",
        )
        .direction,
  },

  {
    scenario:
      "NO_FILL",

    status:
      noFill?.status,
  },
]);


const invariants = {
  openFillAutomaticallyReachesLedger:
    openLong?.approved ===
      true,

  partialFillUsesActualQuantity:
    afterPartial.quantity ===
      14,

  duplicateExecutionNotDoubleCounted:
    duplicate?.duplicate ===
      true &&
    afterDuplicate.quantity ===
      14,

  reductionRealizesPnl:
    afterReduce.realizedPnl >
      0,

  fullCloseClearsLong:
    ledger
      .getPosition(
        "BTCUSDT",
      )
      .direction ===
      "FLAT",

  feesReachedLedger:
    final.tradingFees ===
      14,

  shortOpenRecorded:
    openShort?.approved ===
      true,

  emergencyCloseRecorded:
    emergency?.approved ===
      true &&
    ledger
      .getPosition(
        "ETHUSDT",
      )
      .direction ===
      "FLAT",

  emergencyCloseRealizesProfit:
    final.realizedPnl >
      afterReduce.realizedPnl,

  nonFillDoesNotTouchLedger:
    noFill?.status ===
      "LEDGER_SYNC_NOT_REQUIRED" &&
    beforeNoFill
      .transactionCount ===
    afterNoFill
      .transactionCount,

  ledgerHasFinancialHistory:
    final.transactionCount >
      0,

  equityChangedAutomatically:
    final.equity !==
      final.startingEquity,

  noExecutionAuthority:
    openLong
      ?.executionAuthority ===
      false &&
    emergency
      ?.executionAuthority ===
      false,

  liveExecutionDisabled:
    openLong
      ?.liveExecution ===
      false &&
    emergency
      ?.liveExecution ===
      false,
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
    "\nPHASE 5.27 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.27 PASSED — paper execution ledger synchronization behavior is valid.",
  );
}