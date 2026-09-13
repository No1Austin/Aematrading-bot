/**
 * ============================================================
 * AEMA CRYPTO
 * Phase 5.29
 *
 * CRASH-SAFE AUTO CHECKPOINT RUNTIME DIAGNOSTIC
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

import createCryptoPaperAutoCheckpointManager
  from "../src/crypto/trading/persistence/cryptoPaperAutoCheckpointManager.js";

import createCryptoPaperRecoveryRuntime
  from "../src/crypto/trading/runtime/cryptoPaperRecoveryRuntime.js";

import createCryptoCrashSafePaperRuntime
  from "../src/crypto/trading/runtime/cryptoCrashSafePaperRuntime.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.29 — CRASH-SAFE AUTO CHECKPOINT RUNTIME\n",
);


const checkpointPath =
  "data/crypto-paper/phase5_29-checkpoint.json";


try {
  await fs.unlink(
    checkpointPath,
  );
} catch {
  // no-op
}


/**
 * ============================================================
 * BASE COMPONENTS
 * ============================================================
 */

const ledger =
  createCryptoPaperAccountLedger({
    startingEquity:
      10_000,
  });


const runtime =
  createCryptoPaperTradingRuntime();


const exchange =
  createPaperCryptoExchangeAdapter({
    defaultPrice:
      100,
  });


const store =
  createCryptoPaperStateStore({
    filePath:
      checkpointPath,
  });


const checkpointManager =
  createCryptoPaperCheckpointManager({
    stateStore:
      store,

    ledger,

    statefulRuntime:
      runtime,

    exchangeAdapter:
      exchange,
  });


const autoCheckpoint =
  createCryptoPaperAutoCheckpointManager({
    checkpointManager,

    periodicIntervalMs:
      0,
  });


/**
 * ============================================================
 * TEST RUNTIME WRAPPER
 * ============================================================
 *
 * We use a small deterministic underlying runtime here so
 * Phase 5.29 tests durability behavior directly without
 * depending on unrelated trading intelligence.
 */

let syntheticCycle =
  0;


const syntheticRuntime = {
  async processMarketSnapshot(
    input = {},
  ) {
    syntheticCycle +=
      1;

    return {
      approved:
        true,

      status:
        "SYNTHETIC_CYCLE_COMPLETE",

      symbol:
        input.symbol,

      cycleKey:
        `PHASE529:${syntheticCycle}`,

      execution: {
        status:
          input.executionStatus ??
          "FILLED",
      },

      lifecycle: {
        action:
          input.action ??
          "OPEN_POSITION",
      },

      stateMutated:
        input.stateMutated !==
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  },

  start() {
    return {
      approved:
        true,

      status:
        "SYNTHETIC_RUNTIME_STARTED",
    };
  },

  async shutdown() {
    return {
      approved:
        true,

      status:
        "SYNTHETIC_RUNTIME_STOPPED",
    };
  },

  getHealth() {
    return {
      syntheticCycle,
    };
  },
};


const crashSafeRuntime =
  createCryptoCrashSafePaperRuntime({
    runtime:
      syntheticRuntime,

    autoCheckpointManager:
      autoCheckpoint,

    periodicCheckpointing:
      false,
  });


/**
 * ============================================================
 * START
 * ============================================================
 */

const startResult =
  crashSafeRuntime.start();


/**
 * ============================================================
 * OPEN LONG + AUTO CHECKPOINT
 * ============================================================
 */

await exchange.submitOrder({
  symbol:
    "BTCUSDT",

  side:
    "BUY",

  quantity:
    10,

  price:
    100,

  clientOrderId:
    "P529-BTC-OPEN",

  reduceOnly:
    false,
});


ledger.applyFill({
  fillId:
    "P529-BTC-FILL",

  symbol:
    "BTCUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    10,

  fillPrice:
    100,

  fee:
    1,
});


runtime.adoptExchangePosition({
  symbol:
    "BTCUSDT",

  exchangePosition:
    await exchange.getPosition(
      "BTCUSDT",
    ),
});


const openCycle =
  await crashSafeRuntime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      action:
        "OPEN_POSITION",

      executionStatus:
        "FILLED",
    });


const checkpointExistsAfterOpen =
  await store.exists();


/**
 * ============================================================
 * PARTIAL FILL + AUTO CHECKPOINT
 * ============================================================
 */

const partialOrder =
  await exchange.submitOrder({
    symbol:
      "ETHUSDT",

    side:
      "BUY",

    quantity:
      10,

    price:
      200,

    clientOrderId:
      "P529-ETH-PARTIAL",

    reduceOnly:
      false,

    fillRatio:
      0.4,
  });


ledger.applyFill({
  fillId:
    "P529-ETH-FILL-4",

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


runtime.adoptExchangePosition({
  symbol:
    "ETHUSDT",

  exchangePosition:
    await exchange.getPosition(
      "ETHUSDT",
    ),
});


runtime.registerOrder({
  symbol:
    "ETHUSDT",

  order: {
    clientOrderId:
      "P529-ETH-PARTIAL",

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


const partialCycle =
  await crashSafeRuntime
    .processMarketSnapshot({
      symbol:
        "ETHUSDT",

      action:
        "OPEN_POSITION",

      executionStatus:
        "PARTIALLY_FILLED",
    });


/**
 * ============================================================
 * STOP UPDATE + AUTO CHECKPOINT
 * ============================================================
 */

runtime.updateProtectiveStop({
  symbol:
    "BTCUSDT",

  stopPrice:
    98,
});


const stopCycle =
  await crashSafeRuntime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      action:
        "STOP_UPDATE",

      executionStatus:
        "STOP_REPLACED",
    });


/**
 * ============================================================
 * FUNDING / FEE EXTERNAL MUTATIONS
 * ============================================================
 */

ledger.applyFunding({
  fundingId:
    "P529-FUNDING-1",

  symbol:
    "BTCUSDT",

  amount:
    -2,
});


const fundingCheckpoint =
  await crashSafeRuntime
    .checkpointMutation({
      reason:
        "FUNDING_UPDATE",
    });


ledger.applyFee({
  feeId:
    "P529-FEE-1",

  amount:
    3,
});


const feeCheckpoint =
  await crashSafeRuntime
    .checkpointMutation({
      reason:
        "MANUAL_FEE_UPDATE",
    });


/**
 * ============================================================
 * SIMULATED CHECKPOINT FAILURE
 * ============================================================
 */

let failNextCheckpoint =
  true;


const originalSave =
  checkpointManager
    .saveCheckpoint
    .bind(
      checkpointManager,
    );


checkpointManager.saveCheckpoint =
  async (args = {}) => {
    if (failNextCheckpoint) {
      failNextCheckpoint =
        false;

      return {
        approved:
          false,

        status:
          "SIMULATED_CHECKPOINT_FAILURE",

        blocker:
          "SIMULATED_IO_FAILURE",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    return originalSave(
      args,
    );
  };


ledger.markPrice({
  symbol:
    "BTCUSDT",

  price:
    120,
});


const truthBeforeFailure =
  ledger.getSnapshot();


const failedCheckpoint =
  await crashSafeRuntime
    .checkpointMutation({
      reason:
        "SIMULATED_FAILURE_TEST",
    });


const truthAfterFailure =
  ledger.getSnapshot();


const healthAfterFailure =
  crashSafeRuntime
    .getHealth();


/**
 * ============================================================
 * RETRY DIRTY CHECKPOINT
 * ============================================================
 */

const retryResult =
  await crashSafeRuntime
    .retryPersistence();


const healthAfterRetry =
  crashSafeRuntime
    .getHealth();


/**
 * ============================================================
 * RAPID / COALESCED CHECKPOINT REQUESTS
 * ============================================================
 */

const rapidResults =
  await Promise.all([
    autoCheckpoint
      .requestCheckpoint({
        reason:
          "RAPID_1",
      }),

    autoCheckpoint
      .requestCheckpoint({
        reason:
          "RAPID_2",
      }),

    autoCheckpoint
      .requestCheckpoint({
        reason:
          "RAPID_3",
      }),
  ]);


const healthAfterRapid =
  autoCheckpoint.getHealth();


/**
 * ============================================================
 * REDUCE POSITION
 * ============================================================
 */

await exchange.submitOrder({
  symbol:
    "BTCUSDT",

  side:
    "SELL",

  quantity:
    4,

  price:
    115,

  clientOrderId:
    "P529-BTC-REDUCE",

  reduceOnly:
    true,
});


ledger.applyFill({
  fillId:
    "P529-BTC-REDUCE-FILL",

  symbol:
    "BTCUSDT",

  intent:
    "REDUCE",

  direction:
    "LONG",

  side:
    "SELL",

  filledQuantity:
    4,

  fillPrice:
    115,

  fee:
    1,
});


runtime.adoptExchangePosition({
  symbol:
    "BTCUSDT",

  exchangePosition:
    await exchange.getPosition(
      "BTCUSDT",
    ),
});


const reduceCycle =
  await crashSafeRuntime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      action:
        "REDUCE_EXPOSURE",

      executionStatus:
        "FILLED",
    });


/**
 * ============================================================
 * FULL CLOSE
 * ============================================================
 */

const remainingBtc =
  (
    await exchange.getPosition(
      "BTCUSDT",
    )
  ).quantity;


await exchange.submitOrder({
  symbol:
    "BTCUSDT",

  side:
    "SELL",

  quantity:
    remainingBtc,

  price:
    110,

  clientOrderId:
    "P529-BTC-CLOSE",

  reduceOnly:
    true,
});


ledger.applyFill({
  fillId:
    "P529-BTC-CLOSE-FILL",

  symbol:
    "BTCUSDT",

  intent:
    "CLOSE",

  direction:
    "LONG",

  side:
    "SELL",

  filledQuantity:
    remainingBtc,

  fillPrice:
    110,

  fee:
    1,
});


runtime.adoptExchangePosition({
  symbol:
    "BTCUSDT",

  exchangePosition:
    await exchange.getPosition(
      "BTCUSDT",
    ),
});


const closeCycle =
  await crashSafeRuntime
    .processMarketSnapshot({
      symbol:
        "BTCUSDT",

      action:
        "EXIT_POSITION",

      executionStatus:
        "FILLED",
    });


/**
 * ============================================================
 * FINAL SHUTDOWN CHECKPOINT
 * ============================================================
 */

const shutdownResult =
  await crashSafeRuntime
    .shutdown({
      metadata: {
        diagnostic:
          "PHASE_5_29",
      },
    });


const beforeRestartLedger =
  ledger.getSnapshot();


const beforeRestartBtc =
  ledger.getPosition(
    "BTCUSDT",
  );


const beforeRestartEth =
  ledger.getPosition(
    "ETHUSDT",
  );


/**
 * ============================================================
 * RESTART INTO BRAND-NEW OBJECTS
 * ============================================================
 */

const ledger2 =
  createCryptoPaperAccountLedger({
    startingEquity:
      100,
  });


const runtime2 =
  createCryptoPaperTradingRuntime();


const exchange2 =
  createPaperCryptoExchangeAdapter();


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


const recovery2 =
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


const recoveryResult =
  await recovery2.recover();


const afterRestartLedger =
  ledger2.getSnapshot();


const afterRestartBtc =
  ledger2.getPosition(
    "BTCUSDT",
  );


const afterRestartEth =
  ledger2.getPosition(
    "ETHUSDT",
  );


/**
 * ============================================================
 * DUPLICATE PROTECTION AFTER RESTART
 * ============================================================
 */

const duplicateFill =
  ledger2.applyFill({
    fillId:
      "P529-ETH-FILL-4",

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


const duplicateOrder =
  await exchange2.submitOrder({
    symbol:
      "ETHUSDT",

    side:
      "BUY",

    quantity:
      1,

    price:
      200,

    clientOrderId:
      "P529-ETH-PARTIAL",

    reduceOnly:
      false,
  });


/**
 * ============================================================
 * TABLE
 * ============================================================
 */

console.table([
  {
    scenario:
      "OPEN_AUTO_CHECKPOINT",

    persistence:
      openCycle
        ?.crashSafePersistence
        ?.status,

    dirty:
      autoCheckpoint
        .getHealth()
        .dirty,
  },

  {
    scenario:
      "PARTIAL_FILL",

    persistence:
      partialCycle
        ?.crashSafePersistence
        ?.status,

    ethQty:
      ledger
        .getPosition(
          "ETHUSDT",
        )
        .quantity,
  },

  {
    scenario:
      "STOP_UPDATE",

    persistence:
      stopCycle
        ?.crashSafePersistence
        ?.status,

    stop:
      runtime
        .getSymbolState(
          "BTCUSDT",
        )
        ?.protectiveStop
        ?.stopPrice,
  },

  {
    scenario:
      "CHECKPOINT_FAILURE",

    persistence:
      failedCheckpoint
        ?.status,

    dirty:
      healthAfterFailure
        ?.persistence
        ?.dirty,
  },

  {
    scenario:
      "RETRY",

    persistence:
      retryResult
        ?.status,

    dirty:
      healthAfterRetry
        ?.persistence
        ?.dirty,
  },

  {
    scenario:
      "REDUCE",

    persistence:
      reduceCycle
        ?.crashSafePersistence
        ?.status,

    realized:
      ledger
        .getSnapshot()
        .realizedPnl,
  },

  {
    scenario:
      "FULL_CLOSE",

    persistence:
      closeCycle
        ?.crashSafePersistence
        ?.status,

    direction:
      beforeRestartBtc
        .direction,
  },

  {
    scenario:
      "RESTART",

    persistence:
      recoveryResult
        ?.status,

    equity:
      afterRestartLedger
        .equity,

    btc:
      afterRestartBtc
        .direction,

    ethQty:
      afterRestartEth
        .quantity,
  },
]);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const invariants = {
  runtimeStarted:
    startResult
      ?.approved ===
      true,

  openAutomaticallyCheckpointed:
    checkpointExistsAfterOpen ===
      true &&
    openCycle
      ?.crashSafePersistence
      ?.approved ===
      true,

  partialFillAutomaticallyCheckpointed:
    partialCycle
      ?.crashSafePersistence
      ?.approved ===
      true,

  partialFillTruthPreserved:
    partialOrder
      ?.status ===
      "PARTIALLY_FILLED" &&
    ledger
      .getPosition(
        "ETHUSDT",
      )
      .quantity ===
      4,

  stopAutomaticallyCheckpointed:
    stopCycle
      ?.crashSafePersistence
      ?.approved ===
      true,

  fundingCheckpointed:
    fundingCheckpoint
      ?.approved ===
      true,

  feeCheckpointed:
    feeCheckpoint
      ?.approved ===
      true,

  checkpointFailureSurfaced:
    failedCheckpoint
      ?.approved ===
      false,

  checkpointFailureMarksDirty:
    healthAfterFailure
      ?.persistence
      ?.dirty ===
      true,

  checkpointFailureDoesNotRollbackTradingTruth:
    truthAfterFailure
      .equity ===
      truthBeforeFailure
        .equity &&
    truthAfterFailure
      .unrealizedPnl ===
      truthBeforeFailure
        .unrealizedPnl,

  dirtyCheckpointRetrySucceeds:
    retryResult
      ?.approved ===
      true,

  retryClearsDirtyState:
    healthAfterRetry
      ?.persistence
      ?.dirty ===
      false,

  rapidRequestsHandled:
    rapidResults.length ===
      3 &&
    rapidResults.every(
      result =>
        result
          ?.executionAuthority ===
        false,
    ),

  checkpointRequestsCoalesced:
    healthAfterRapid
      ?.coalescedCount >=
      1,

  reductionCheckpointed:
    reduceCycle
      ?.crashSafePersistence
      ?.approved ===
      true,

  closeCheckpointed:
    closeCycle
      ?.crashSafePersistence
      ?.approved ===
      true,

  fullClosePersistedFlat:
    beforeRestartBtc
      .direction ===
      "FLAT",

  finalShutdownCheckpointWritten:
    shutdownResult
      ?.finalCheckpoint
      ?.approved ===
      true,

  restartRecoverySucceeds:
    recoveryResult
      ?.approved ===
      true,

  latestLedgerEquitySurvivesRestart:
    afterRestartLedger
      .equity ===
      beforeRestartLedger
        .equity,

  closedBtcSurvivesRestart:
    afterRestartBtc
      .direction ===
      beforeRestartBtc
        .direction &&
    afterRestartBtc
      .quantity ===
      beforeRestartBtc
        .quantity,

  partialEthSurvivesRestart:
    afterRestartEth
      .direction ===
      beforeRestartEth
        .direction &&
    afterRestartEth
      .quantity ===
      beforeRestartEth
        .quantity,

  duplicateFillBlockedAfterRestart:
    duplicateFill
      ?.status ===
      "DUPLICATE_FILL",

  duplicateOrderBlockedAfterRestart:
    duplicateOrder
      ?.status ===
      "DUPLICATE_CLIENT_ORDER_ID",

  noExecutionAuthority:
    crashSafeRuntime
      ?.executionAuthority ===
      false &&
    recoveryResult
      ?.executionAuthority ===
      false,

  liveExecutionDisabled:
    crashSafeRuntime
      ?.liveExecution ===
      false &&
    recoveryResult
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
    "\nPHASE 5.29 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.29 PASSED — automatic checkpointing and crash-safe runtime behavior is valid.",
  );
}