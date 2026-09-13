/**
 * ============================================================
 * AEMA CRYPTO
 * Phase 5.28
 *
 * PERSISTENT STATE & RESTART RECOVERY DIAGNOSTIC
 * ============================================================
 */

import fs
  from "node:fs/promises";


import createCryptoPaperAccountLedger
  from "../src/crypto/trading/account/cryptoPaperAccountLedger.js";


import createCryptoPaperTradingRuntime
  from "../src/crypto/trading/runtime/cryptoPaperTradingRuntime.js";


import createPaperCryptoExchangeAdapter
  from "../src/crypto/trading/execution/paperCryptoExchangeAdapter.js";


import createCryptoPaperStateStore
  from "../src/crypto/trading/persistence/cryptoPaperStateStore.js";


import createCryptoPaperCheckpointManager
  from "../src/crypto/trading/persistence/cryptoPaperCheckpointManager.js";


import createCryptoPaperRecoveryRuntime
  from "../src/crypto/trading/runtime/cryptoPaperRecoveryRuntime.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.28 — PERSISTENT STATE & RESTART RECOVERY\n",
);


const checkpointPath =
  "data/crypto-paper/phase5_28-diagnostic-checkpoint.json";


/**
 * ============================================================
 * CLEAN OLD DIAGNOSTIC STATE
 * ============================================================
 */

try {
  await fs.unlink(
    checkpointPath,
  );
} catch {
  // Fine if absent.
}


/**
 * ============================================================
 * ORIGINAL PROCESS
 * ============================================================
 */

const ledger1 =
  createCryptoPaperAccountLedger({
    startingEquity:
      10_000,
  });


const runtime1 =
  createCryptoPaperTradingRuntime();


const exchange1 =
  createPaperCryptoExchangeAdapter({
    defaultPrice:
      100,

    defaultFillRatio:
      1,
  });


const store1 =
  createCryptoPaperStateStore({
    filePath:
      checkpointPath,
  });


const manager1 =
  createCryptoPaperCheckpointManager({
    stateStore:
      store1,

    ledger:
      ledger1,

    statefulRuntime:
      runtime1,

    exchangeAdapter:
      exchange1,
  });


/**
 * ============================================================
 * CREATE EXCHANGE POSITION
 * ============================================================
 */

const exchangeOpen =
  await exchange1
    .submitOrder({
      symbol:
        "BTCUSDT",

      side:
        "BUY",

      quantity:
        4,

      price:
        100,

      clientOrderId:
        "RESTART-BTC-OPEN",

      reduceOnly:
        false,
    });


/**
 * ============================================================
 * CREATE MATCHING LEDGER TRUTH
 * ============================================================
 */

ledger1.applyFill({
  fillId:
    "RESTART-BTC-FILL",

  symbol:
    "BTCUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    4,

  fillPrice:
    100,

  fee:
    2,
});


ledger1.markPrice({
  symbol:
    "BTCUSDT",

  price:
    110,
});


ledger1.applyFunding({
  fundingId:
    "RESTART-FUNDING-1",

  symbol:
    "BTCUSDT",

  amount:
    -1,
});


/**
 * ============================================================
 * CREATE MATCHING RUNTIME STATE
 * ============================================================
 */

runtime1.adoptExchangePosition({
  symbol:
    "BTCUSDT",

  exchangePosition:
    await exchange1
      .getPosition(
        "BTCUSDT",
      ),
});


runtime1.updateProtectiveStop({
  symbol:
    "BTCUSDT",

  stopPrice:
    95,
});


runtime1.setLifecycleState({
  symbol:
    "BTCUSDT",

  state:
    "OPEN",

  action:
    "HOLD",

  targetExposure:
    1,
});


/**
 * Create a partially filled order that should survive restart.
 */

const partialOrder =
  await exchange1
    .submitOrder(
      {
        symbol:
          "ETHUSDT",

        side:
          "BUY",

        quantity:
          10,

        price:
          200,

        clientOrderId:
          "RESTART-ETH-PARTIAL",

        reduceOnly:
          false,
      },
      {
        fillRatio:
          0.4,
      },
    );


runtime1.adoptExchangePosition({
  symbol:
    "ETHUSDT",

  exchangePosition:
    await exchange1
      .getPosition(
        "ETHUSDT",
      ),
});


runtime1.registerOrder({
  symbol:
    "ETHUSDT",

  order: {
    clientOrderId:
      "RESTART-ETH-PARTIAL",

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


/**
 * Ledger receives only actual filled quantity.
 */

ledger1.applyFill({
  fillId:
    "RESTART-ETH-FILL-4",

  symbol:
    "ETHUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    4,

  fillPrice:
    200,

  fee:
    1,
});


/**
 * ============================================================
 * CAPTURE BEFORE RESTART
 * ============================================================
 */

const beforeLedger =
  ledger1.getSnapshot();


const beforeBtc =
  ledger1.getPosition(
    "BTCUSDT",
  );


const beforeEth =
  ledger1.getPosition(
    "ETHUSDT",
  );


const beforeRuntimeBtc =
  runtime1.getSymbolState(
    "BTCUSDT",
  );


const beforeRuntimeEth =
  runtime1.getSymbolState(
    "ETHUSDT",
  );


const beforeExchangeBtc =
  await exchange1
    .getPosition(
      "BTCUSDT",
    );


const beforeExchangeEth =
  await exchange1
    .getPosition(
      "ETHUSDT",
    );


/**
 * ============================================================
 * SAVE CHECKPOINT
 * ============================================================
 */

const saveResult =
  await manager1
    .saveCheckpoint({
      metadata: {
        diagnostic:
          "PHASE_5_28",
      },
    });


const existsAfterSave =
  await store1.exists();


/**
 * ============================================================
 * SIMULATE TOTAL PROCESS RESTART
 * ============================================================
 *
 * Completely new objects.
 */

const ledger2 =
  createCryptoPaperAccountLedger({
    startingEquity:
      1_000,
  });


const runtime2 =
  createCryptoPaperTradingRuntime();


const exchange2 =
  createPaperCryptoExchangeAdapter({
    defaultPrice:
      999,
  });


const store2 =
  createCryptoPaperStateStore({
    filePath:
      checkpointPath,
  });


const manager2 =
  createCryptoPaperCheckpointManager({
    stateStore:
      store2,

    ledger:
      ledger2,

    statefulRuntime:
      runtime2,

    exchangeAdapter:
      exchange2,
  });


const recovery =
  createCryptoPaperRecoveryRuntime({
    checkpointManager:
      manager2,

    ledger:
      ledger2,

    statefulRuntime:
      runtime2,

    exchangeAdapter:
      exchange2,

    maximumCheckpointAgeMs:
      60_000,
  });


/**
 * ============================================================
 * RECOVERY GATE BEFORE RESTORE
 * ============================================================
 */

const openBlockedBeforeRecovery =
  recovery.evaluateAction(
    "OPEN_POSITION",
  );


const reduceAllowedBeforeRecovery =
  recovery.evaluateAction(
    "REDUCE_EXPOSURE",
  );


const emergencyAllowedBeforeRecovery =
  recovery.evaluateAction(
    "EMERGENCY_EXIT",
  );


/**
 * ============================================================
 * RESTORE
 * ============================================================
 */

const recoveryResult =
  await recovery.recover();


const afterRecoveryState =
  recovery.getRecoveryState();


/**
 * ============================================================
 * CAPTURE AFTER RESTART
 * ============================================================
 */

const afterLedger =
  ledger2.getSnapshot();


const afterBtc =
  ledger2.getPosition(
    "BTCUSDT",
  );


const afterEth =
  ledger2.getPosition(
    "ETHUSDT",
  );


const afterRuntimeBtc =
  runtime2.getSymbolState(
    "BTCUSDT",
  );


const afterRuntimeEth =
  runtime2.getSymbolState(
    "ETHUSDT",
  );


const afterExchangeBtc =
  await exchange2
    .getPosition(
      "BTCUSDT",
    );


const afterExchangeEth =
  await exchange2
    .getPosition(
      "ETHUSDT",
    );


/**
 * ============================================================
 * DUPLICATE FILL PROTECTION AFTER RESTART
 * ============================================================
 */

const transactionCountBeforeDuplicate =
  ledger2
    .getSnapshot()
    .transactionCount;


const duplicateFill =
  ledger2.applyFill({
    fillId:
      "RESTART-BTC-FILL",

    symbol:
      "BTCUSDT",

    intent:
      "OPEN",

    direction:
      "LONG",

    side:
      "BUY",

    filledQuantity:
      4,

    fillPrice:
      100,

    fee:
      2,
  });


const transactionCountAfterDuplicate =
  ledger2
    .getSnapshot()
    .transactionCount;


/**
 * ============================================================
 * DUPLICATE CLIENT ORDER PROTECTION AFTER RESTART
 * ============================================================
 */

const duplicateOrder =
  await exchange2
    .submitOrder({
      symbol:
        "BTCUSDT",

      side:
        "BUY",

      quantity:
        1,

      price:
        100,

      clientOrderId:
        "RESTART-BTC-OPEN",

      reduceOnly:
        false,
    });


/**
 * ============================================================
 * ACTION GATE AFTER RECOVERY
 * ============================================================
 */

const openAllowedAfterRecovery =
  recovery.evaluateAction(
    "OPEN_POSITION",
  );


/**
 * ============================================================
 * CORRUPT CHECKPOINT TEST
 * ============================================================
 */

const corruptPath =
  "data/crypto-paper/phase5_28-corrupt.json";


await fs.writeFile(
  corruptPath,
  "{ this is not valid json",
  "utf8",
);


const corruptStore =
  createCryptoPaperStateStore({
    filePath:
      corruptPath,
  });


const corruptLoad =
  await corruptStore.load();


/**
 * ============================================================
 * UNSUPPORTED VERSION TEST
 * ============================================================
 */

const unsupportedPath =
  "data/crypto-paper/phase5_28-version.json";


await fs.writeFile(
  unsupportedPath,
  JSON.stringify({
    version:
      999,

    createdAt:
      new Date()
        .toISOString(),

    state: {},
  }),
  "utf8",
);


const unsupportedStore =
  createCryptoPaperStateStore({
    filePath:
      unsupportedPath,
  });


const unsupportedLoad =
  await unsupportedStore.load();


/**
 * ============================================================
 * TABLE
 * ============================================================
 */

console.table([
  {
    scenario:
      "BEFORE_RESTART",

    equity:
      beforeLedger.equity,

    btcDirection:
      beforeBtc.direction,

    btcQty:
      beforeBtc.quantity,

    ethDirection:
      beforeEth.direction,

    ethQty:
      beforeEth.quantity,

    recovery:
      "N/A",
  },

  {
    scenario:
      "AFTER_RESTART",

    equity:
      afterLedger.equity,

    btcDirection:
      afterBtc.direction,

    btcQty:
      afterBtc.quantity,

    ethDirection:
      afterEth.direction,

    ethQty:
      afterEth.quantity,

    recovery:
      afterRecoveryState.state,
  },

  {
    scenario:
      "RUNTIME_BTC",

    equity:
      "",

    btcDirection:
      afterRuntimeBtc
        ?.position
        ?.direction,

    btcQty:
      afterRuntimeBtc
        ?.position
        ?.quantity,

    recovery:
      afterRecoveryState.state,
  },

  {
    scenario:
      "EXCHANGE_BTC",

    equity:
      "",

    btcDirection:
      afterExchangeBtc
        ?.direction,

    btcQty:
      afterExchangeBtc
        ?.quantity,

    recovery:
      afterRecoveryState.state,
  },

  {
    scenario:
      "PARTIAL_ETH",

    equity:
      "",

    ethDirection:
      afterExchangeEth
        ?.direction,

    ethQty:
      afterExchangeEth
        ?.quantity,

    recovery:
      afterRecoveryState.state,
  },
]);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const invariants = {
  checkpointCreated:
    saveResult
      ?.approved ===
      true &&
    existsAfterSave ===
      true,

  checkpointVersioned:
    saveResult
      ?.version ===
      1,

  recoveryCompleted:
    recoveryResult
      ?.approved ===
      true &&
    afterRecoveryState
      ?.state ===
      "READY",

  ledgerEquitySurvivesRestart:
    afterLedger.equity ===
      beforeLedger.equity,

  startingEquitySurvivesRestart:
    afterLedger
      .startingEquity ===
      beforeLedger
        .startingEquity,

  realizedPnlSurvivesRestart:
    afterLedger
      .realizedPnl ===
      beforeLedger
        .realizedPnl,

  unrealizedPnlSurvivesRestart:
    afterLedger
      .unrealizedPnl ===
      beforeLedger
        .unrealizedPnl,

  feesSurviveRestart:
    afterLedger
      .tradingFees ===
      beforeLedger
        .tradingFees,

  fundingSurvivesRestart:
    afterLedger
      .fundingPnl ===
      beforeLedger
        .fundingPnl,

  peakEquitySurvivesRestart:
    afterLedger
      .peakEquity ===
      beforeLedger
        .peakEquity,

  drawdownSurvivesRestart:
    afterLedger
      .drawdownPercent ===
      beforeLedger
        .drawdownPercent,

  btcLedgerPositionSurvives:
    afterBtc.direction ===
      beforeBtc.direction &&
    afterBtc.quantity ===
      beforeBtc.quantity,

  partialEthLedgerPositionSurvives:
    afterEth.direction ===
      beforeEth.direction &&
    afterEth.quantity ===
      beforeEth.quantity,

  btcExchangePositionSurvives:
    afterExchangeBtc
      .direction ===
      beforeExchangeBtc
        .direction &&
    afterExchangeBtc
      .quantity ===
      beforeExchangeBtc
        .quantity,

  partialEthExchangePositionSurvives:
    afterExchangeEth
      .direction ===
      beforeExchangeEth
        .direction &&
    afterExchangeEth
      .quantity ===
      beforeExchangeEth
        .quantity,

  runtimeBtcPositionSurvives:
    afterRuntimeBtc
      ?.position
      ?.direction ===
      beforeRuntimeBtc
        ?.position
        ?.direction &&
    afterRuntimeBtc
      ?.position
      ?.quantity ===
      beforeRuntimeBtc
        ?.position
        ?.quantity,

  runtimeEthPositionSurvives:
    afterRuntimeEth
      ?.position
      ?.direction ===
      beforeRuntimeEth
        ?.position
        ?.direction &&
    afterRuntimeEth
      ?.position
      ?.quantity ===
      beforeRuntimeEth
        ?.position
        ?.quantity,

  protectiveStopSurvivesRestart:
    afterRuntimeBtc
      ?.protectiveStopPrice ===
      beforeRuntimeBtc
        ?.protectiveStopPrice ||
    afterRuntimeBtc
      ?.stopPrice ===
      beforeRuntimeBtc
        ?.stopPrice,

  partialOrderSurvivesRestart:
    afterRuntimeEth
      ?.activeOrder
      ?.status ===
      "PARTIALLY_FILLED",

  duplicateFillStillBlocked:
    duplicateFill
      ?.status ===
      "DUPLICATE_FILL" &&
    transactionCountBeforeDuplicate ===
      transactionCountAfterDuplicate,

  duplicateClientOrderStillBlocked:
    duplicateOrder
      ?.status ===
      "DUPLICATE_CLIENT_ORDER_ID",

  newRiskBlockedBeforeRecovery:
    openBlockedBeforeRecovery
      ?.approved ===
      false,

  riskReductionAllowedBeforeRecovery:
    reduceAllowedBeforeRecovery
      ?.approved ===
      true,

  emergencyAllowedBeforeRecovery:
    emergencyAllowedBeforeRecovery
      ?.approved ===
      true,

  newRiskAllowedAfterRecovery:
    openAllowedAfterRecovery
      ?.approved ===
      true,

  reconciliationRan:
    recoveryResult
      ?.reconciliation
      ?.approved ===
      true,

  corruptCheckpointRejected:
    corruptLoad
      ?.status ===
      "CHECKPOINT_CORRUPT",

  unsupportedVersionRejected:
    unsupportedLoad
      ?.status ===
      "CHECKPOINT_VERSION_UNSUPPORTED",

  noExecutionAuthority:
    recoveryResult
      ?.executionAuthority ===
      false &&
    afterRecoveryState
      ?.executionAuthority ===
      false,

  liveExecutionDisabled:
    recoveryResult
      ?.liveExecution ===
      false &&
    afterRecoveryState
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
    "\nPHASE 5.28 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.28 PASSED — persistence and restart recovery behavior is valid.",
  );
}


/**
 * ============================================================
 * CLEAN DIAGNOSTIC FILES
 * ============================================================
 */

try {
  await fs.unlink(
    corruptPath,
  );
} catch {
  // no-op
}


try {
  await fs.unlink(
    unsupportedPath,
  );
} catch {
  // no-op
}