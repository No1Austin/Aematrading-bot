import {
  createPaperCryptoExchangeAdapter,
} from "../src/crypto/trading/execution/paperCryptoExchangeAdapter.js";

import {
  validateExchangeAdapter,
} from "../src/crypto/trading/execution/exchangeAdapterContract.js";

function pass(value) {
  return value === true;
}

function row(
  scenario,
  result,
  position = null,
) {
  return {
    scenario,
    status:
      result?.status ?? "N/A",
    accepted:
      result?.accepted ??
      result?.cancelled ??
      result?.replaced ??
      false,
    direction:
      position?.direction ??
      result?.position?.direction ??
      "N/A",
    quantity:
      position?.quantity ??
      result?.position?.quantity ??
      0,
    filled:
      result?.order?.filledQuantity ??
      0,
    remaining:
      result?.order?.remainingQuantity ??
      0,
    reduceOnly:
      result?.order?.reduceOnly ??
      result?.stop?.reduceOnly ??
      false,
  };
}

async function main() {
  console.log(
    "\nAEMA CRYPTO PHASE 5.18 — PAPER EXECUTION ADAPTER\n",
  );

  const adapter =
    createPaperCryptoExchangeAdapter({
      defaultPrice: 100,
    });

  const contract =
    validateExchangeAdapter(
      adapter,
    );

  const rows = [];

  /*
   * 1. OPEN LONG
   */
  const openLong =
    await adapter.submitOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 10,
      price: 100,
      clientOrderId:
        "P518-OPEN-LONG",
    });

  const longPosition =
    await adapter.getPosition(
      "BTCUSDT",
    );

  rows.push(
    row(
      "OPEN_LONG_FILLED",
      openLong,
      longPosition,
    ),
  );

  /*
   * 2. ADD LONG
   */
  const addLong =
    await adapter.submitOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 5,
      price: 102,
      clientOrderId:
        "P518-ADD-LONG",
    });

  const addedPosition =
    await adapter.getPosition(
      "BTCUSDT",
    );

  rows.push(
    row(
      "ADD_EXPOSURE",
      addLong,
      addedPosition,
    ),
  );

  /*
   * 3. REDUCE LONG
   */
  const reduceLong =
    await adapter.submitOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      quantity: 4,
      price: 103,
      reduceOnly: true,
      clientOrderId:
        "P518-REDUCE-LONG",
    });

  const reducedPosition =
    await adapter.getPosition(
      "BTCUSDT",
    );

  rows.push(
    row(
      "REDUCE_EXPOSURE",
      reduceLong,
      reducedPosition,
    ),
  );

  /*
   * 4. Reduce-only cannot flip.
   */
  const noFlip =
    await adapter.submitOrder({
      symbol: "BTCUSDT",
      side: "SELL",
      quantity: 1000,
      price: 104,
      reduceOnly: true,
      clientOrderId:
        "P518-NO-FLIP",
    });

  const noFlipPosition =
    await adapter.getPosition(
      "BTCUSDT",
    );

  rows.push(
    row(
      "REDUCE_ONLY_NO_FLIP",
      noFlip,
      noFlipPosition,
    ),
  );

  /*
   * 5. OPEN SHORT
   */
  const openShort =
    await adapter.submitOrder({
      symbol: "ETHUSDT",
      side: "SELL",
      quantity: 8,
      price: 100,
      clientOrderId:
        "P518-OPEN-SHORT",
    });

  const shortPosition =
    await adapter.getPosition(
      "ETHUSDT",
    );

  rows.push(
    row(
      "OPEN_SHORT_FILLED",
      openShort,
      shortPosition,
    ),
  );

  /*
   * 6. PARTIAL FILL
   */
  const partial =
    await adapter.submitOrder({
      symbol: "SOLUSDT",
      side: "BUY",
      quantity: 10,
      price: 100,
      fillRatio: 0.4,
      clientOrderId:
        "P518-PARTIAL",
    });

  const partialPosition =
    await adapter.getPosition(
      "SOLUSDT",
    );

  rows.push(
    row(
      "PARTIAL_FILL",
      partial,
      partialPosition,
    ),
  );

  /*
   * 7. STOP REPLACEMENT
   */
  const stop =
    await adapter.replaceStop({
      symbol: "SOLUSDT",
      stopPrice: 97.5,
    });

  rows.push(
    row(
      "STOP_REPLACEMENT",
      stop,
      partialPosition,
    ),
  );

  /*
   * 8. CANCEL OPEN REMAINDER
   */
  const cancel =
    await adapter.cancelOrder({
      orderId:
        partial.order.orderId,
    });

  rows.push(
    row(
      "CANCEL_OPEN_ORDER",
      cancel,
      partialPosition,
    ),
  );

  /*
   * 9. DUPLICATE CLIENT ID
   */
  const duplicate =
    await adapter.submitOrder({
      symbol: "BTCUSDT",
      side: "BUY",
      quantity: 1,
      price: 100,
      clientOrderId:
        "P518-OPEN-LONG",
    });

  rows.push(
    row(
      "DUPLICATE_CLIENT_ORDER_ID",
      duplicate,
    ),
  );

  /*
   * 10. FORCED REJECTION
   */
  const rejected =
    await adapter.submitOrder({
      symbol: "XRPUSDT",
      side: "BUY",
      quantity: 100,
      price: 1,
      forceReject: true,
      clientOrderId:
        "P518-REJECT",
    });

  rows.push(
    row(
      "REJECTED_ORDER",
      rejected,
    ),
  );

  /*
   * 11. CLOSE SHORT
   */
  const closeShort =
    await adapter.closePosition({
      symbol: "ETHUSDT",
      price: 96,
      clientOrderId:
        "P518-CLOSE-SHORT",
    });

  const closedShort =
    await adapter.getPosition(
      "ETHUSDT",
    );

  rows.push(
    row(
      "CLOSE_SHORT",
      closeShort,
      closedShort,
    ),
  );

  /*
   * 12. EMERGENCY CLOSE
   *
   * SOL still has the partial
   * position from earlier.
   */
  const emergency =
    await adapter.emergencyClose({
      symbol: "SOLUSDT",
      price: 95,
      clientOrderId:
        "P518-EMERGENCY",
    });

  const emergencyPosition =
    await adapter.getPosition(
      "SOLUSDT",
    );

  rows.push(
    row(
      "EMERGENCY_CLOSE",
      emergency,
      emergencyPosition,
    ),
  );

  /*
   * 13. Separate normal close-long test.
   */
  const closeTestOpen =
    await adapter.submitOrder({
      symbol: "ADAUSDT",
      side: "BUY",
      quantity: 20,
      price: 1,
      clientOrderId:
        "P518-ADA-OPEN",
    });

  const closeLong =
    await adapter.closePosition({
      symbol: "ADAUSDT",
      price: 1.1,
      clientOrderId:
        "P518-CLOSE-LONG",
    });

  const closedLong =
    await adapter.getPosition(
      "ADAUSDT",
    );

  rows.push(
    row(
      "CLOSE_LONG",
      closeLong,
      closedLong,
    ),
  );

  const snapshot =
    adapter.getSnapshot();

  console.table(rows);

  const invariants = {
    contractValid:
      contract.valid,

    paperExecutionEnabled:
      adapter.paperExecution ===
      true,

    liveExecutionDisabled:
      adapter.liveExecution ===
      false,

    openLongWorks:
      openLong.status ===
        "FILLED" &&
      longPosition.direction ===
        "LONG",

    addExposureWorks:
      addLong.status ===
        "FILLED" &&
      addedPosition.quantity ===
        15,

    reductionWorks:
      reduceLong.status ===
        "FILLED" &&
      reducedPosition.quantity ===
        11,

    reduceOnlyCannotFlip:
      noFlipPosition.direction ===
        "FLAT" &&
      noFlipPosition.quantity ===
        0,

    shortOpenWorks:
      openShort.status ===
        "FILLED" &&
      shortPosition.direction ===
        "SHORT",

    partialFillRecognized:
      partial.status ===
        "PARTIALLY_FILLED" &&
      partial.order.filledQuantity ===
        4 &&
      partial.order.remainingQuantity ===
        6,

    stopReplacementWorks:
      stop.status ===
        "STOP_REPLACED" &&
      stop.stop.reduceOnly === true,

    openOrderCancellationWorks:
      cancel.status ===
        "CANCELLED",

    duplicateBlocked:
      duplicate.status ===
        "DUPLICATE_CLIENT_ORDER_ID" &&
      duplicate.accepted === false,

    rejectionHandled:
      rejected.status ===
        "REJECTED" &&
      rejected.accepted === false,

    closeShortWorks:
      closedShort.direction ===
        "FLAT" &&
      closedShort.quantity ===
        0,

    emergencyCloseWorks:
      emergency.emergency ===
        true &&
      emergencyPosition.direction ===
        "FLAT",

    closeLongWorks:
      closeTestOpen.status ===
        "FILLED" &&
      closedLong.direction ===
        "FLAT",

    fillsRecorded:
      snapshot.fills.length > 0,

    stateAvailableForReconciliation:
      Array.isArray(
        snapshot.orders,
      ) &&
      Array.isArray(
        snapshot.positions,
      ) &&
      Array.isArray(
        snapshot.fills,
      ) &&
      Array.isArray(
        snapshot.stops,
      ),

    noLiveExecution:
      snapshot.liveExecution ===
      false,
  };

  console.log(
    "\nINVARIANTS",
  );

  console.log(invariants);

  const success =
    Object.values(
      invariants,
    ).every(pass);

  if (!success) {
    console.error(
      "\nPHASE 5.18 FAILED — one or more invariants failed.",
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "\nPHASE 5.18 PASSED — paper exchange execution behavior is valid.",
  );
}

main().catch((error) => {
  console.error(
    "\nPHASE 5.18 CRASHED",
  );

  console.error(error);

  process.exitCode = 1;
});