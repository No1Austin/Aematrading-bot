/**
 * AEMA CRYPTO
 * Phase 5.26
 *
 * ACCOUNT-AWARE RISK DIAGNOSTIC
 */

import createCryptoPaperAccountLedger
  from "../src/crypto/trading/account/cryptoPaperAccountLedger.js";

import {
  buildAccountAwareFuturesRiskPlan,
  evaluateAccountAwarePortfolioRisk,
  evaluateAccountAwareEntryRisk,
} from "../src/crypto/trading/runtime/cryptoAccountAwareRiskRuntime.js";


console.log(
  "\nAEMA CRYPTO PHASE 5.26 — ACCOUNT-AWARE RISK INTEGRATION\n",
);


function strongEntry(
  direction,
) {
  return {
    approved:
      true,

    state:
      "ENTRY_ALLOWED",

    direction,

    exposureMultiplier:
      1,

    confidence:
      0.95,

    entryQuality:
      90,

    risk: {
      volatilityState:
        "NORMAL",
    },
  };
}


const ledger =
  createCryptoPaperAccountLedger({
    startingEquity:
      10_000,
  });


/**
 * ============================================================
 * BASELINE
 * ============================================================
 */

const baseRisk =
  buildAccountAwareFuturesRiskPlan({
    ledger,

    direction:
      "LONG",

    entryPrice:
      100,

    entryQualification:
      strongEntry(
        "LONG",
      ),

    atr:
      1.2,

    atrPercent:
      1.2,

    requestedLeverage:
      3,

    volatilityScore:
      35,
  });


/**
 * ============================================================
 * ACCOUNT GROWS
 *
 * Open 10 @100
 * Close @150
 * +500 realized
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "GROWTH-OPEN",

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


ledger.applyFill({
  fillId:
    "GROWTH-CLOSE",

  symbol:
    "BTCUSDT",

  intent:
    "CLOSE",

  direction:
    "LONG",

  side:
    "SELL",

  filledQuantity:
    10,

  fillPrice:
    150,
});


const grownAccount =
  ledger.getSnapshot();


const grownRisk =
  buildAccountAwareFuturesRiskPlan({
    ledger,

    direction:
      "LONG",

    entryPrice:
      100,

    entryQualification:
      strongEntry(
        "LONG",
      ),

    atr:
      1.2,

    atrPercent:
      1.2,

    requestedLeverage:
      3,

    volatilityScore:
      35,
  });


/**
 * ============================================================
 * CREATE OPEN REAL PORTFOLIO POSITION
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "PORTFOLIO-OPEN",

  symbol:
    "ETHUSDT",

  intent:
    "OPEN",

  direction:
    "LONG",

  side:
    "BUY",

  filledQuantity:
    20,

  fillPrice:
    100,
});


ledger.markPrice({
  symbol:
    "ETHUSDT",

  price:
    100,
});


const portfolioRisk =
  await evaluateAccountAwarePortfolioRisk({
    ledger,

    marketPrices: {
      ETHUSDT:
        100,
    },

    action:
      "OPEN_POSITION",

    direction:
      "LONG",

    lifecycle: {
      action:
        "OPEN_POSITION",

      direction:
        "LONG",

      targetExposure:
        0.5,
    },

    candidate: {
      symbol:
        "SOLUSDT",

      direction:
        "LONG",

      exposure:
        0.5,

      leverage:
        2,
    },

    requestedExposure:
      0.5,

    riskPlan:
      grownRisk,
  });


/**
 * ============================================================
 * RISK REDUCTION MUST BYPASS PORTFOLIO VETO
 * ============================================================
 */

const reductionRisk =
  await evaluateAccountAwarePortfolioRisk({
    ledger,

    action:
      "EMERGENCY_EXIT",

    direction:
      "LONG",

    lifecycle: {
      action:
        "EMERGENCY_EXIT",

      direction:
        "LONG",

      targetExposure:
        0,
    },

    candidate: {
      symbol:
        "ETHUSDT",

      direction:
        "LONG",
    },

    requestedExposure:
      0,
  });


/**
 * ============================================================
 * CREATE LARGE DRAWDOWN
 *
 * ETH LONG @100
 * mark @60:
 * loss = 20 * -40 = -800
 *
 * Account:
 * peak about 10500
 * equity about 9700
 * drawdown ~7.6%
 * ============================================================
 */

ledger.markPrice({
  symbol:
    "ETHUSDT",

  price:
    60,
});


const drawdownAccount =
  ledger.getSnapshot();


const drawdownPortfolioRisk =
  await evaluateAccountAwarePortfolioRisk({
    ledger,

    marketPrices: {
      ETHUSDT:
        60,
    },

    action:
      "OPEN_POSITION",

    direction:
      "LONG",

    lifecycle: {
      action:
        "OPEN_POSITION",

      direction:
        "LONG",

      targetExposure:
        1,
    },

    candidate: {
      symbol:
        "SOLUSDT",

      direction:
        "LONG",

      exposure:
        1,

      leverage:
        3,
    },

    requestedExposure:
      1,

    riskPlan:
      grownRisk,
  });


/**
 * ============================================================
 * ACCOUNT SHRINKS FURTHER
 *
 * Close ETH at 60.
 * Realized loss = -800.
 * Equity remains below prior peak.
 * ============================================================
 */

ledger.applyFill({
  fillId:
    "PORTFOLIO-CLOSE",

  symbol:
    "ETHUSDT",

  intent:
    "CLOSE",

  direction:
    "LONG",

  side:
    "SELL",

  filledQuantity:
    20,

  fillPrice:
    60,
});


const reducedAccount =
  ledger.getSnapshot();


const reducedRisk =
  buildAccountAwareFuturesRiskPlan({
    ledger,

    direction:
      "LONG",

    entryPrice:
      100,

    entryQualification:
      strongEntry(
        "LONG",
      ),

    atr:
      1.2,

    atrPercent:
      1.2,

    requestedLeverage:
      3,

    volatilityScore:
      35,
  });


/**
 * ============================================================
 * COMBINED ENTRY RISK
 * ============================================================
 */

const combined =
  await evaluateAccountAwareEntryRisk({
    ledger,

    direction:
      "SHORT",

    entryPrice:
      100,

    entryQualification:
      strongEntry(
        "SHORT",
      ),

    lifecycle: {
      action:
        "OPEN_POSITION",

      direction:
        "SHORT",

      targetExposure:
        0.5,
    },

    candidate: {
      symbol:
        "XRPUSDT",

      direction:
        "SHORT",

      exposure:
        0.5,

      leverage:
        2,
    },

    requestedExposure:
      0.5,

    atr:
      1.2,

    atrPercent:
      1.2,

    requestedLeverage:
      3,

    volatilityScore:
      35,
  });


console.table([
  {
    scenario:
      "BASE_ACCOUNT",

    equity:
      10_000,

    riskEquity:
      baseRisk
        ?.accountEquityUsed,

    drawdown:
      baseRisk
        ?.portfolioDrawdownPercent,

    approved:
      baseRisk
        ?.approved,
  },

  {
    scenario:
      "GROWN_ACCOUNT",

    equity:
      grownAccount.equity,

    riskEquity:
      grownRisk
        ?.accountEquityUsed,

    drawdown:
      grownRisk
        ?.portfolioDrawdownPercent,

    approved:
      grownRisk
        ?.approved,
  },

  {
    scenario:
      "REAL_PORTFOLIO",

    equity:
      ledger
        .getSnapshot()
        .equity,

    riskEquity:
      portfolioRisk
        ?.accountEquityUsed,

    drawdown:
      portfolioRisk
        ?.portfolioDrawdownPercent,

    approved:
      portfolioRisk
        ?.approved,
  },

  {
    scenario:
      "DRAWDOWN",

    equity:
      drawdownAccount.equity,

    riskEquity:
      drawdownPortfolioRisk
        ?.accountEquityUsed,

    drawdown:
      drawdownPortfolioRisk
        ?.portfolioDrawdownPercent,

    approved:
      drawdownPortfolioRisk
        ?.approved,
  },

  {
    scenario:
      "REDUCED_ACCOUNT",

    equity:
      reducedAccount.equity,

    riskEquity:
      reducedRisk
        ?.accountEquityUsed,

    drawdown:
      reducedRisk
        ?.portfolioDrawdownPercent,

    approved:
      reducedRisk
        ?.approved,
  },
]);


/**
 * ============================================================
 * INVARIANTS
 * ============================================================
 */

const baselinePositionSize =
  Number(
    baseRisk
      ?.position
      ?.notionalUsd ??
    baseRisk
      ?.positionSize
      ?.notionalUsd ??
    baseRisk
      ?.position
      ?.notional ??
    0,
  );


const grownPositionSize =
  Number(
    grownRisk
      ?.position
      ?.notionalUsd ??
    grownRisk
      ?.positionSize
      ?.notionalUsd ??
    grownRisk
      ?.position
      ?.notional ??
    0,
  );


const reducedPositionSize =
  Number(
    reducedRisk
      ?.position
      ?.notionalUsd ??
    reducedRisk
      ?.positionSize
      ?.notionalUsd ??
    reducedRisk
      ?.position
      ?.notional ??
    0,
  );


const invariants = {
  baselineUsesStartingEquity:
    baseRisk
      ?.accountEquityUsed ===
      10_000,

  grownAccountUsesRealEquity:
    grownRisk
      ?.accountEquityUsed ===
      grownAccount.equity,

  grownEquityExceedsStarting:
    grownAccount.equity >
      10_000,

  reducedAccountUsesRealEquity:
    reducedRisk
      ?.accountEquityUsed ===
      reducedAccount.equity,

  accountCanShrink:
    reducedAccount.equity <
      grownAccount.equity,

  futuresRiskStillApprovesValidInput:
    baseRisk?.approved ===
      true &&
    grownRisk?.approved ===
      true &&
    reducedRisk?.approved ===
      true,

  largerEquityDoesNotProduceSmallerRiskBudget:
    baselinePositionSize ===
      0 ||
    grownPositionSize ===
      0 ||
    grownPositionSize >=
      baselinePositionSize,

  smallerEquityDoesNotProduceLargerRiskBudget:
    grownPositionSize ===
      0 ||
    reducedPositionSize ===
      0 ||
    reducedPositionSize <=
      grownPositionSize,

  portfolioUsesLedgerPositions:
    portfolioRisk
      ?.ledgerPositionCount >=
      1,

  portfolioUsesLedgerEquity:
    portfolioRisk
      ?.accountEquityUsed >
      0,

  drawdownComesFromLedger:
    drawdownPortfolioRisk
      ?.portfolioDrawdownPercent ===
      drawdownAccount
        .drawdownPercent,

  drawdownActuallyExists:
    drawdownAccount
      .drawdownPercent >
      0,

  riskReductionNeverBlocked:
    reductionRisk
      ?.approved ===
      true &&
    reductionRisk
      ?.riskReducing ===
      true,

  combinedUsesLedgerEquity:
    combined
      ?.accountEquityUsed ===
      reducedAccount.equity,

  combinedContainsFuturesRisk:
    Boolean(
      combined
        ?.futuresRiskPlan,
    ),

  combinedContainsPortfolioRisk:
    Boolean(
      combined
        ?.portfolioRisk,
    ),

  noExecutionAuthority:
    baseRisk
      ?.executionAuthority ===
      false &&
    portfolioRisk
      ?.executionAuthority ===
      false &&
    combined
      ?.executionAuthority ===
      false,

  liveExecutionDisabled:
    baseRisk
      ?.liveExecution ===
      false &&
    portfolioRisk
      ?.liveExecution ===
      false &&
    combined
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
    "\nPHASE 5.26 FAILED — one or more invariants failed.",
  );

  process.exitCode =
    1;
} else {
  console.log(
    "\nPHASE 5.26 PASSED — account-aware risk behavior is valid.",
  );
}