// server/src/risk/tradeRiskManager.test.js

import evaluateTradeCandidate from "./tradeRiskManager.js";

import {
  TRADE_SIDE,
  MARKET_REGIME,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * TRADE RISK MANAGER TEST SUITE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Verify that tradeRiskManager.js:
 *
 * - approves valid LONG trades
 * - approves valid SHORT trades when broker shorting is enabled
 * - blocks invalid scores
 * - blocks excessive volatility
 * - blocks wide spreads
 * - blocks low liquidity
 * - blocks non-shortable securities
 * - blocks broker-disabled shorting
 * - blocks broker trading/account restrictions
 * - blocks daily loss limits
 * - blocks consecutive-loss limits
 * - blocks portfolio correlation limits
 * - respects regime-specific scoring
 * - respects the kill switch
 * - fails closed when critical account data is missing
 *
 * IMPORTANT
 * ---------
 *
 * This file tests decision safety only.
 * It does NOT submit orders.
 */

/**
 * ============================================================
 * TEST HELPERS
 * ============================================================
 */

let passed = 0;
let failed = 0;

function divider() {
  console.log(
    "\n====================================",
  );
}

function assertCondition(
  condition,
  message,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

function assertIncludes(
  values,
  expectedSubstring,
  message,
) {
  const list =
    Array.isArray(values)
      ? values
      : [];

  const found =
    list.some(
      (value) =>
        String(value)
          .toLowerCase()
          .includes(
            String(
              expectedSubstring,
            ).toLowerCase(),
          ),
    );

  assertCondition(
    found,
    message,
  );
}

/**
 * ============================================================
 * REAL-SHAPED SAFE ACCOUNT DEFAULTS
 * ============================================================
 *
 * These mirror the important fields returned by the real
 * Alpaca PAPER account provider.
 */

const SAFE_ACCOUNT = Object.freeze({
  accountEquity:
    10_000,

  buyingPower:
    10_000,

  accountStatus:
    "ACTIVE",

  tradingBlocked:
    false,

  accountBlocked:
    false,

  shortingEnabled:
    true,

  dailyPnL:
    0,

  dailyLossLimit:
    200,

  dailyLossPercent:
    0,

  accountDrawdownPercent:
    0,

  consecutiveLosses:
    0,

  killSwitchActive:
    false,

  openPositions:
    0,

  totalOpenRiskPercent:
    0,

  sectorAllocation:
    0,

  highlyCorrelatedPositions:
    0,
});

/**
 * ============================================================
 * NORMAL MARKET DEFAULTS
 * ============================================================
 */

const SAFE_MARKET = Object.freeze({
  entryPrice:
    100,

  targetPrice:
    105,

  atr:
    1,

  bid:
    99.95,

  ask:
    100.05,

  averageDailyVolume:
    5_000_000,

  dollarVolume:
    500_000_000,
});

/**
 * ============================================================
 * BASE INPUT BUILDER
 * ============================================================
 *
 * A fresh object is returned every time so one scenario cannot
 * accidentally mutate another scenario.
 */

function buildInput(
  overrides = {},
) {
  return {
    ...SAFE_ACCOUNT,

    ...SAFE_MARKET,

    symbol:
      "TEST",

    side:
      TRADE_SIDE.LONG,

    score:
      90,

    regime:
      MARKET_REGIME.BULL,

    ...overrides,
  };
}

/**
 * ============================================================
 * SCENARIO RUNNER
 * ============================================================
 */

function runScenario({
  name,
  input,
  verify,
}) {
  divider();

  console.log(
    `TEST: ${name}`,
  );

  divider();

  try {
    const result =
      evaluateTradeCandidate(
        input,
      );

    console.dir(
      result,
      {
        depth: null,
      },
    );

    assertCondition(
      result &&
        typeof result ===
          "object",
      "Risk manager must return an object.",
    );

    assertCondition(
      typeof result.approved ===
        "boolean",
      "Risk manager result must include boolean approved.",
    );

    assertCondition(
      result.status,
      "Risk manager result must include status.",
    );

    /**
     * Even approved risk candidates must not silently enable
     * live execution while live trading is disabled.
     */
    if (
      result.approved === true
    ) {
      assertCondition(
        result.executionAllowed !==
          true,
        "Unit test unexpectedly received executionAllowed=true.",
      );
    }

    if (
      typeof verify ===
      "function"
    ) {
      verify(
        result,
      );
    }

    passed += 1;

    console.log(
      `\nPASS: ${name}`,
    );

    return result;
  } catch (error) {
    failed += 1;

    console.error(
      `\nFAIL: ${name}`,
    );

    console.error(
      error instanceof Error
        ? error.message
        : String(error),
    );

    return null;
  }
}

/**
 * ============================================================
 * 1. VALID LONG TRADE
 * ============================================================
 */

runScenario({
  name:
    "Valid LONG setup",

  input:
    buildInput({
      symbol:
        "TEST-LONG",

      side:
        TRADE_SIDE.LONG,

      score:
        87,

      regime:
        MARKET_REGIME.BULL,

      entryPrice:
        100,

      targetPrice:
        104,

      atr:
        1.25,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === true,
        "Valid LONG trade should be approved.",
      );

      assertCondition(
        result.side ===
          TRADE_SIDE.LONG,
        "LONG result side is incorrect.",
      );

      assertCondition(
        Number(
          result.position
            ?.quantity,
        ) > 0,
        "Valid LONG trade should have positive quantity.",
      );
    },
});

/**
 * ============================================================
 * 2. VALID SHORT TRADE
 * ============================================================
 */

runScenario({
  name:
    "Valid SHORT setup",

  input:
    buildInput({
      symbol:
        "TEST-SHORT",

      side:
        TRADE_SIDE.SHORT,

      score:
        88,

      regime:
        MARKET_REGIME.BEAR,

      targetPrice:
        96,

      atr:
        1.25,

      shortable:
        true,

      hardToBorrow:
        false,

      borrowDataAvailable:
        true,

      shortingEnabled:
        true,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === true,
        "Valid SHORT trade should be approved.",
      );

      assertCondition(
        result.side ===
          TRADE_SIDE.SHORT,
        "SHORT result side is incorrect.",
      );

      assertCondition(
        Number(
          result.position
            ?.quantity,
        ) > 0,
        "Valid SHORT trade should have positive quantity.",
      );
    },
});

/**
 * ============================================================
 * 3. SCORE BELOW REQUIRED THRESHOLD
 * ============================================================
 */

runScenario({
  name:
    "Reject score below 80",

  input:
    buildInput({
      symbol:
        "LOW-SCORE",

      score:
        76,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Low-score trade must be rejected.",
      );

      assertIncludes(
        result.failures,
        "below required score",
        "Low-score rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 4. HIGH VOLATILITY
 * ============================================================
 */

runScenario({
  name:
    "Reject extreme volatility",

  input:
    buildInput({
      symbol:
        "HIGH-VOL",

      score:
        92,

      regime:
        MARKET_REGIME
          .HIGH_VOLATILITY,

      targetPrice:
        120,

      atr:
        10,

      bid:
        99.9,

      ask:
        100.1,

      averageDailyVolume:
        10_000_000,

      dollarVolume:
        1_000_000_000,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Extreme-volatility trade must be rejected.",
      );

      assertIncludes(
        result.failures,
        "volatility exceeds",
        "Volatility rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 5. WIDE SPREAD
 * ============================================================
 */

runScenario({
  name:
    "Reject wide spread",

  input:
    buildInput({
      symbol:
        "WIDE-SPREAD",

      bid:
        99,

      ask:
        101,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Wide-spread trade must be rejected.",
      );

      assertIncludes(
        result.failures,
        "spread is too wide",
        "Spread rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 6. LOW LIQUIDITY
 * ============================================================
 */

runScenario({
  name:
    "Reject low liquidity",

  input:
    buildInput({
      symbol:
        "LOW-LIQUIDITY",

      entryPrice:
        50,

      targetPrice:
        53,

      atr:
        0.75,

      bid:
        49.98,

      ask:
        50.02,

      averageDailyVolume:
        100_000,

      dollarVolume:
        1_000_000,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Low-liquidity trade must be rejected.",
      );

      assertIncludes(
        result.failures,
        "average daily volume",
        "Average-volume rejection reason is missing.",
      );

      assertIncludes(
        result.failures,
        "dollar volume",
        "Dollar-volume rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 7. SECURITY NOT SHORTABLE
 * ============================================================
 */

runScenario({
  name:
    "Reject non-shortable stock",

  input:
    buildInput({
      symbol:
        "NO-SHORT",

      side:
        TRADE_SIDE.SHORT,

      score:
        92,

      regime:
        MARKET_REGIME.BEAR,

      targetPrice:
        94,

      atr:
        1.5,

      shortable:
        false,

      hardToBorrow:
        false,

      borrowDataAvailable:
        true,

      shortingEnabled:
        true,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Non-shortable security must be rejected.",
      );

      assertIncludes(
        result.failures,
        "not confirmed shortable",
        "Shortability rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 8. BROKER SHORTING DISABLED
 * ============================================================
 */

runScenario({
  name:
    "Reject SHORT when broker shorting is disabled",

  input:
    buildInput({
      symbol:
        "BROKER-NO-SHORT",

      side:
        TRADE_SIDE.SHORT,

      score:
        92,

      regime:
        MARKET_REGIME.BEAR,

      targetPrice:
        94,

      shortable:
        true,

      borrowDataAvailable:
        true,

      hardToBorrow:
        false,

      shortingEnabled:
        false,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "SHORT must be rejected when broker shorting is disabled.",
      );

      assertIncludes(
        result.failures,
        "not confirmed for short selling",
        "Broker shorting rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 9. BROKER TRADING BLOCKED
 * ============================================================
 */

runScenario({
  name:
    "Reject broker trading block",

  input:
    buildInput({
      symbol:
        "TRADING-BLOCKED",

      tradingBlocked:
        true,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Broker trading block must reject trade.",
      );

      assertIncludes(
        result.failures,
        "blocked trading",
        "Trading-block rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 10. BROKER ACCOUNT BLOCKED
 * ============================================================
 */

runScenario({
  name:
    "Reject blocked broker account",

  input:
    buildInput({
      symbol:
        "ACCOUNT-BLOCKED",

      accountBlocked:
        true,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Blocked broker account must reject trade.",
      );

      assertIncludes(
        result.failures,
        "account is blocked",
        "Account-block rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 11. BROKER ACCOUNT NOT ACTIVE
 * ============================================================
 */

runScenario({
  name:
    "Reject inactive broker account",

  input:
    buildInput({
      symbol:
        "INACTIVE-ACCOUNT",

      accountStatus:
        "INACTIVE",
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Inactive broker account must reject trade.",
      );

      assertIncludes(
        result.failures,
        "not active",
        "Inactive-account rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 12. DAILY LOSS PERCENT LIMIT
 * ============================================================
 */

runScenario({
  name:
    "Reject after daily loss percent limit",

  input:
    buildInput({
      symbol:
        "DAILY-LOSS-PERCENT",

      score:
        95,

      dailyLossPercent:
        0.02,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Daily-loss-percent limit must reject trade.",
      );

      assertIncludes(
        result.failures,
        "daily loss limit",
        "Daily-loss-percent rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 13. REAL DAILY P&L LOSS LIMIT
 * ============================================================
 */

runScenario({
  name:
    "Reject when broker daily P&L reaches dollar loss limit",

  input:
    buildInput({
      symbol:
        "DAILY-PNL-LIMIT",

      dailyPnL:
        -200,

      dailyLossLimit:
        200,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Dollar daily-loss limit must reject trade.",
      );

      assertIncludes(
        result.failures,
        "daily p&l",
        "Broker daily-P&L rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 14. CONSECUTIVE LOSSES
 * ============================================================
 */

runScenario({
  name:
    "Reject after consecutive loss limit",

  input:
    buildInput({
      symbol:
        "LOSS-STREAK",

      score:
        93,

      consecutiveLosses:
        3,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Consecutive-loss limit must reject trade.",
      );

      assertIncludes(
        result.failures,
        "consecutive loss limit",
        "Consecutive-loss rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 15. PORTFOLIO CORRELATION LIMIT
 * ============================================================
 */

runScenario({
  name:
    "Reject excessive correlation",

  input:
    buildInput({
      symbol:
        "CORRELATED",

      score:
        92,

      highlyCorrelatedPositions:
        2,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Excessive correlation must reject trade.",
      );

      assertIncludes(
        result.failures,
        "correlated position limit",
        "Correlation rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 16. STRONG BEAR — WEAK LONG
 * ============================================================
 */

runScenario({
  name:
    "Reject weak LONG during strong bear market",

  input:
    buildInput({
      symbol:
        "BEAR-LONG",

      side:
        TRADE_SIDE.LONG,

      score:
        82,

      regime:
        MARKET_REGIME
          .STRONG_BEAR,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Weak LONG in strong bear regime must be rejected.",
      );

      assertIncludes(
        result.failures,
        "below required score",
        "Strong-bear score rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 17. STRONG BEAR — EXCEPTIONAL LONG
 * ============================================================
 */

runScenario({
  name:
    "Allow exceptional LONG during strong bear market",

  input:
    buildInput({
      symbol:
        "STRONG-BEAR-LONG",

      side:
        TRADE_SIDE.LONG,

      score:
        90,

      regime:
        MARKET_REGIME
          .STRONG_BEAR,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === true,
        "Exceptional LONG should be allowed when it clears regime threshold.",
      );

      assertCondition(
        Number(
          result.position
            ?.quantity,
        ) > 0,
        "Approved exceptional LONG must have positive quantity.",
      );
    },
});

/**
 * ============================================================
 * 18. KILL SWITCH
 * ============================================================
 */

runScenario({
  name:
    "Reject when kill switch active",

  input:
    buildInput({
      symbol:
        "KILL-SWITCH",

      score:
        99,

      killSwitchActive:
        true,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Kill switch must reject trade.",
      );

      assertIncludes(
        result.failures,
        "kill switch",
        "Kill-switch rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 19. MISSING EQUITY
 * ============================================================
 */

runScenario({
  name:
    "Fail closed when account equity is missing",

  input:
    buildInput({
      symbol:
        "NO-EQUITY",

      accountEquity:
        null,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Missing account equity must reject trade.",
      );

      assertIncludes(
        result.failures,
        "account equity",
        "Missing-equity rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 20. ZERO BUYING POWER
 * ============================================================
 */

runScenario({
  name:
    "Fail closed when buying power is zero",

  input:
    buildInput({
      symbol:
        "NO-BUYING-POWER",

      buyingPower:
        0,
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Zero buying power must reject trade.",
      );

      assertIncludes(
        result.failures,
        "buying power",
        "Buying-power rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * 21. INVALID DAILY P&L
 * ============================================================
 */

runScenario({
  name:
    "Fail closed when daily P&L is invalid",

  input:
    buildInput({
      symbol:
        "BAD-DAILY-PNL",

      dailyPnL:
        "NOT_A_NUMBER",
    }),

  verify:
    (result) => {
      assertCondition(
        result.approved === false,
        "Invalid daily P&L must reject trade.",
      );

      assertIncludes(
        result.failures,
        "daily p&l",
        "Invalid daily-P&L rejection reason is missing.",
      );
    },
});

/**
 * ============================================================
 * FINAL TEST SUMMARY
 * ============================================================
 */

divider();

console.log(
  "TRADE RISK MANAGER TEST SUMMARY",
);

divider();

console.log(
  `Passed: ${passed}`,
);

console.log(
  `Failed: ${failed}`,
);

console.log(
  `Total: ${passed + failed}`,
);

divider();

if (
  failed > 0
) {
  console.error(
    "RESULT: FAILED",
  );

  process.exitCode = 1;
} else {
  console.log(
    "RESULT: ALL TESTS PASSED",
  );
}
