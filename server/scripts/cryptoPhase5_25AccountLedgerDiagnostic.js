/**
 * AEMA CRYPTO
 * Phase 5.25 — Paper Account Ledger Diagnostic
 *
 * Tests:
 * - LONG / SHORT unrealized P&L
 * - weighted average entry
 * - partial closes
 * - full closes
 * - fees
 * - funding
 * - drawdown
 * - equity highs
 * - partial fills
 * - duplicate fill protection
 * - snapshot consistency
 *
 * NO live execution.
 */

import createCryptoPaperAccountLedger
  from "../src/crypto/trading/account/cryptoPaperAccountLedger.js";

import {
  buildCryptoPaperAccountSnapshot,
} from "../src/crypto/trading/runtime/cryptoPaperAccountSnapshot.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.25 — PAPER ACCOUNT LEDGER & P&L\n",
);


const ledger =
  createCryptoPaperAccountLedger({
    startingEquity:
      10_000,

    defaultFeeRate:
      0,
  });


const rows = [];


function pushRow(
  scenario,
  extra = {},
) {
  const snapshot =
    ledger.getSnapshot();

  rows.push({
    scenario,

    equity:
      snapshot.equity,

    realized:
      snapshot.realizedPnl,

    unrealized:
      snapshot.unrealizedPnl,

    fees:
      snapshot.tradingFees,

    funding:
      snapshot.fundingPnl,

    peak:
      snapshot.peakEquity,

    drawdown:
      snapshot.drawdownPercent,

    openPositions:
      snapshot
        .openPositions
        .length,

    ...extra,
  });
}


/**
 * ============================================================
 * INITIAL
 * ============================================================
 */

const initial =
  ledger.getSnapshot();

pushRow(
  "INITIAL_ACCOUNT",
);


/**
 * ============================================================
 * OPEN LONG 10 @ 100
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "LONG-OPEN-1",

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
});

pushRow(
  "OPEN_LONG",
);


/**
 * ============================================================
 * LONG PROFIT: MARK 110
 * ============================================================
 */

ledger.markPrice({
  symbol:
    "BTCUSDT",

  price:
    110,
});

const longProfit =
  ledger.getSnapshot();

pushRow(
  "LONG_UNREALIZED_PROFIT",
);


/**
 * ============================================================
 * LONG LOSS: MARK 95
 * ============================================================
 */

ledger.markPrice({
  symbol:
    "BTCUSDT",

  price:
    95,
});

const longLoss =
  ledger.getSnapshot();

pushRow(
  "LONG_UNREALIZED_LOSS",
);


/**
 * ============================================================
 * ADD 10 @ 120
 *
 * Weighted average:
 * (10*100 + 10*120) / 20 = 110
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "LONG-ADD-1",

  symbol:
    "BTCUSDT",

  intent:
    "INCREASE",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    10,

  fillPrice:
    120,
});

const longAfterAdd =
  ledger.getPosition(
    "BTCUSDT",
  );

pushRow(
  "ADD_TO_LONG",
  {
    btcQty:
      longAfterAdd.quantity,

    btcAvg:
      longAfterAdd
        .averageEntryPrice,
  },
);


/**
 * ============================================================
 * PARTIAL CLOSE 5 @ 130
 *
 * Profit:
 * (130 - 110) * 5 = 100
 * Remaining = 15
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "LONG-REDUCE-1",

  symbol:
    "BTCUSDT",

  intent:
    "REDUCE",

  direction:
    "LONG",

  side:
    "SELL",

  filledQuantity:
    5,

  fillPrice:
    130,
});

const afterPartialLong =
  ledger.getSnapshot();

const longPositionAfterPartial =
  ledger.getPosition(
    "BTCUSDT",
  );

pushRow(
  "PARTIAL_CLOSE_LONG_PROFIT",
  {
    btcQty:
      longPositionAfterPartial
        .quantity,
  },
);


/**
 * ============================================================
 * FULL CLOSE REMAINING 15 @ 120
 *
 * Profit:
 * (120 - 110) * 15 = 150
 *
 * Total realized long:
 * 250
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "LONG-CLOSE-1",

  symbol:
    "BTCUSDT",

  intent:
    "CLOSE",

  direction:
    "LONG",

  side:
    "SELL",

  filledQuantity:
    15,

  fillPrice:
    120,
});

const afterLongClosed =
  ledger.getSnapshot();

pushRow(
  "FULL_CLOSE_LONG_PROFIT",
);


/**
 * ============================================================
 * OPEN SHORT 8 @ 200
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "SHORT-OPEN-1",

  symbol:
    "ETHUSDT",

  intent:
    "OPEN",

  direction:
    "SHORT",

  side:
    "SELL",

  filledQuantity:
    8,

  fillPrice:
    200,
});

pushRow(
  "OPEN_SHORT",
);


/**
 * ============================================================
 * SHORT PROFIT: MARK 180
 *
 * (200 - 180) * 8 = 160
 * ============================================================
 */

ledger.markPrice({
  symbol:
    "ETHUSDT",

  price:
    180,
});

const shortProfit =
  ledger.getSnapshot();

pushRow(
  "SHORT_UNREALIZED_PROFIT",
);


/**
 * ============================================================
 * SHORT LOSS: MARK 220
 *
 * (200 - 220) * 8 = -160
 * ============================================================
 */

ledger.markPrice({
  symbol:
    "ETHUSDT",

  price:
    220,
});

const shortLoss =
  ledger.getSnapshot();

pushRow(
  "SHORT_UNREALIZED_LOSS",
);


/**
 * ============================================================
 * PARTIAL SHORT CLOSE 3 @ 180
 *
 * (200 - 180) * 3 = 60
 * Remaining = 5
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "SHORT-REDUCE-1",

  symbol:
    "ETHUSDT",

  intent:
    "REDUCE",

  direction:
    "SHORT",

  side:
    "BUY",

  filledQuantity:
    3,

  fillPrice:
    180,
});

const shortAfterPartial =
  ledger.getPosition(
    "ETHUSDT",
  );

pushRow(
  "PARTIAL_CLOSE_SHORT",
  {
    ethQty:
      shortAfterPartial.quantity,
  },
);


/**
 * ============================================================
 * FULL SHORT CLOSE 5 @ 190
 *
 * (200 - 190) * 5 = 50
 *
 * Total short realized = 110
 * Total account realized now = 360
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "SHORT-CLOSE-1",

  symbol:
    "ETHUSDT",

  intent:
    "CLOSE",

  direction:
    "SHORT",

  side:
    "BUY",

  filledQuantity:
    5,

  fillPrice:
    190,
});

const afterShortClosed =
  ledger.getSnapshot();

pushRow(
  "FULL_CLOSE_SHORT",
);


/**
 * ============================================================
 * MANUAL TRADING FEE
 * ============================================================
 */

const equityBeforeFee =
  ledger
    .getSnapshot()
    .equity;

ledger.applyFee({
  feeId:
    "MANUAL-FEE-1",

  amount:
    20,
});

const afterFee =
  ledger.getSnapshot();

pushRow(
  "TRADING_FEE",
);


/**
 * ============================================================
 * FUNDING DEBIT
 * ============================================================
 */

const equityBeforeFundingDebit =
  ledger
    .getSnapshot()
    .equity;

ledger.applyFunding({
  fundingId:
    "FUNDING-DEBIT-1",

  amount:
    -15,
});

const afterFundingDebit =
  ledger.getSnapshot();

pushRow(
  "FUNDING_DEBIT",
);


/**
 * ============================================================
 * FUNDING CREDIT
 * ============================================================
 */

const equityBeforeFundingCredit =
  ledger
    .getSnapshot()
    .equity;

ledger.applyFunding({
  fundingId:
    "FUNDING-CREDIT-1",

  amount:
    25,
});

const afterFundingCredit =
  ledger.getSnapshot();

pushRow(
  "FUNDING_CREDIT",
);


/**
 * ============================================================
 * LOSING TRADE
 *
 * Open SOL LONG 10 @ 100
 * Close @ 80
 * Loss = -200
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "LOSS-OPEN-1",

  symbol:
    "SOLUSDT",

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
});

ledger.applyFill({
  fillId:
    "LOSS-CLOSE-1",

  symbol:
    "SOLUSDT",

  intent:
    "CLOSE",

  direction:
    "LONG",

  side:
    "SELL",

  filledQuantity:
    10,

  fillPrice:
    80,
});

const afterLoss =
  ledger.getSnapshot();

pushRow(
  "LOSING_TRADE",
);


/**
 * ============================================================
 * CREATE DRAWDOWN WITH OPEN POSITION
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "DD-OPEN-1",

  symbol:
    "XRPUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    100,

  fillPrice:
    10,
});

ledger.markPrice({
  symbol:
    "XRPUSDT",

  price:
    8,
});

const drawdownSnapshot =
  ledger.getSnapshot();

pushRow(
  "DRAWDOWN",
);


/**
 * ============================================================
 * NEW EQUITY HIGH
 * ============================================================
 */

ledger.markPrice({
  symbol:
    "XRPUSDT",

  price:
    15,
});

const newHighSnapshot =
  ledger.getSnapshot();

pushRow(
  "NEW_EQUITY_HIGH",
);


/**
 * ============================================================
 * PARTIAL FILL TRUTH
 *
 * Requested quantity might be 10 elsewhere,
 * but ledger receives ACTUAL FILL = 4.
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "PARTIAL-FILL-1",

  symbol:
    "ADAUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    4,

  fillPrice:
    50,
});

const partialPosition =
  ledger.getPosition(
    "ADAUSDT",
  );

pushRow(
  "PARTIAL_FILL",
  {
    adaQty:
      partialPosition.quantity,
  },
);


/**
 * ============================================================
 * DUPLICATE FILL
 * ============================================================
 */

const beforeDuplicate =
  ledger.getPosition(
    "ADAUSDT",
  );

const duplicateResult =
  ledger.applyFill({
    fillId:
      "PARTIAL-FILL-1",

    symbol:
      "ADAUSDT",

    intent:
      "OPEN",

    direction:
      "LONG",

    side:
      "BUY",

    filledQuantity:
      4,

    fillPrice:
      50,
  });

const afterDuplicate =
  ledger.getPosition(
    "ADAUSDT",
  );

pushRow(
  "DUPLICATE_FILL_PROTECTION",
  {
    adaQty:
      afterDuplicate.quantity,
  },
);


/**
 * ============================================================
 * ACCOUNT SNAPSHOT ADAPTER
 * ============================================================
 */

const accountSnapshot =
  buildCryptoPaperAccountSnapshot({
    ledger,

    marketPrices: {
      XRPUSDT:
        15,

      ADAUSDT:
        50,
    },
  });


console.table(
  rows,
);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const finalLedgerSnapshot =
  ledger.getSnapshot();


const invariants = {
  startingEquityPreserved:
    initial.startingEquity ===
      10_000,

  longUnrealizedProfitCorrect:
    longProfit
      .unrealizedPnl ===
      100,

  longUnrealizedLossCorrect:
    longLoss
      .unrealizedPnl ===
      -50,

  shortUnrealizedProfitCorrect:
    shortProfit
      .unrealizedPnl ===
      160,

  shortUnrealizedLossCorrect:
    shortLoss
      .unrealizedPnl ===
      -160,

  weightedAverageEntryCorrect:
    longAfterAdd
      .quantity ===
      20 &&
    longAfterAdd
      .averageEntryPrice ===
      110,

  partialLongCloseRealizesOnlyFilledQuantity:
    afterPartialLong
      .realizedPnl ===
      100 &&
    longPositionAfterPartial
      .quantity ===
      15,

  fullLongCloseCorrect:
    afterLongClosed
      .realizedPnl ===
      250 &&
    ledger
      .getPosition(
        "BTCUSDT",
      )
      .direction ===
      "FLAT",

  partialShortCloseRealizesOnlyFilledQuantity:
    shortAfterPartial
      .quantity ===
      5,

  fullShortCloseCorrect:
    afterShortClosed
      .realizedPnl ===
      360 &&
    ledger
      .getPosition(
        "ETHUSDT",
      )
      .direction ===
      "FLAT",

  realizedPnlPreservedAfterClose:
    finalLedgerSnapshot
      .realizedPnl !==
      0,

  tradingFeesReduceEquity:
    afterFee.equity ===
      equityBeforeFee -
        20,

  fundingDebitReducesEquity:
    afterFundingDebit
      .equity ===
      equityBeforeFundingDebit -
        15,

  fundingCreditIncreasesEquity:
    afterFundingCredit
      .equity ===
      equityBeforeFundingCredit +
        25,

  losingTradeReducesRealizedPnl:
    afterLoss.realizedPnl ===
      160,

  unrealizedPnlAffectsEquity:
    longProfit.equity >
      initial.equity &&
    longLoss.equity <
      initial.equity,

  realizedPnlAffectsEquity:
    afterLongClosed.equity >
      initial.equity,

  peakEquityTracked:
    newHighSnapshot
      .peakEquity >=
      newHighSnapshot
        .equity,

  drawdownCalculated:
    drawdownSnapshot
      .drawdownPercent >
      0,

  partialFillUsesActualFill:
    partialPosition
      .quantity ===
      4,

  duplicateFillDoesNotDoubleCount:
    duplicateResult
      .status ===
      "DUPLICATE_FILL" &&
    beforeDuplicate
      .quantity ===
    afterDuplicate
      .quantity,

  accountSnapshotMatchesLedger:
    accountSnapshot.equity ===
      finalLedgerSnapshot
        .equity &&
    accountSnapshot
      .realizedPnl ===
      finalLedgerSnapshot
        .realizedPnl &&
    accountSnapshot
      .unrealizedPnl ===
      finalLedgerSnapshot
        .unrealizedPnl,

  snapshotContainsRealPositions:
    accountSnapshot
      .positions
      .some(
        position =>
          position.symbol ===
          "XRPUSDT",
      ) &&
    accountSnapshot
      .positions
      .some(
        position =>
          position.symbol ===
          "ADAUSDT",
      ),

  transactionHistoryExists:
    ledger
      .getTransactions()
      .length >
      0,

  noExecutionAuthority:
    finalLedgerSnapshot
      .executionAuthority ===
      false &&
    accountSnapshot
      .executionAuthority ===
      false,

  liveExecutionDisabled:
    finalLedgerSnapshot
      .liveExecution ===
      false &&
    accountSnapshot
      .liveExecution ===
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
    "\nPHASE 5.25 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.25 PASSED — paper account ledger, P&L, equity and drawdown behavior is valid.",
  );
}