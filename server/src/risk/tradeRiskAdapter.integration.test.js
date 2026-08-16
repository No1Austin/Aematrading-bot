// server/src/risk/tradeRiskAdapter.integration.test.js

import evaluateRiskApproval from "./tradeRiskAdapter.js";

import {
  MARKET_REGIME,
} from "../config/riskConfig.js";

let passed = 0;
let failed = 0;

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertReasonContains(result, text) {
  const reasons =
    Array.isArray(result?.reasons)
      ? result.reasons
      : [];

  assertCondition(
    reasons.some(
      (reason) =>
        String(reason)
          .toLowerCase()
          .includes(
            String(text)
              .toLowerCase(),
          ),
    ),
    `Expected reason containing "${text}".`,
  );
}

function buildDecisionGate({
  side = "LONG",
  score = 90,
  entryPrice = 100,
  stopPrice = null,
  targetPrice = null,
} = {}) {
  const resolvedStop =
    stopPrice ??
    (
      side === "LONG"
        ? 98.5
        : 101.5
    );

  const resolvedTarget =
    targetPrice ??
    (
      side === "LONG"
        ? 105
        : 95
    );

  return {
    approved: true,
    status: "APPROVED",
    decision: side,
    side,
    score,
    canProceedToRiskManager: true,
    tradeGeometry: {
      entryPrice,
      stopPrice: resolvedStop,
      targetPrice: resolvedTarget,
      rewardRiskRatio:
        Math.abs(
          resolvedTarget - entryPrice,
        ) /
        Math.abs(
          entryPrice - resolvedStop,
        ),
    },
    execution: {
      reduceSize: false,
    },
  };
}

function buildAccount(overrides = {}) {
  return {
    balance: 100_000,
    equity: 100_000,
    riskPercent: 0.005,
    buyingPower: 400_000,
    status: "ACTIVE",
    tradingBlocked: false,
    accountBlocked: false,
    shortingEnabled: true,
    dailyPnL: 0,
    dailyLossLimit: 200,
    openPositions: [],
    portfolioExposure: 0,
    ...overrides,
  };
}

function buildLiquidity(overrides = {}) {
  return {
    bid: 99.95,
    ask: 100.05,
    averageDailyVolume: 5_000_000,
    dollarVolume: 500_000_000,
    ...overrides,
  };
}

async function runScenario({
  name,
  decisionGate,
  account,
  expectedApproved,
  expectedReason = null,
  additionalContext = {},
}) {
  console.log("\n====================================");
  console.log(`TEST: ${name}`);
  console.log("====================================");

  try {
    const result =
      await evaluateRiskApproval({
        symbol: "AAPL",
        decisionGate,
        accountBalance: account.balance,
        accountEquity: account.equity,
        accountRiskPercent: account.riskPercent,
        buyingPower: account.buyingPower,
        accountStatus: account.status,
        tradingBlocked: account.tradingBlocked,
        accountBlocked: account.accountBlocked,
        shortingEnabled: account.shortingEnabled,
        dailyPnL: account.dailyPnL,
        dailyLossLimit: account.dailyLossLimit,
        openPositions: account.openPositions,
        portfolioExposure: account.portfolioExposure,
        atr: 1,
        liquidity: buildLiquidity(),
        marketRegime:
          decisionGate.side === "SHORT"
            ? MARKET_REGIME.BEAR
            : MARKET_REGIME.BULL,
        additionalContext: {
          shortable: true,
          hardToBorrow: false,
          borrowDataAvailable: true,
          ...additionalContext,
        },
      });

    console.dir(result, { depth: null });

    assertCondition(
      result?.approved === expectedApproved,
      `Expected approved=${expectedApproved}, got ${result?.approved}.`,
    );

    if (expectedReason) {
      assertReasonContains(result, expectedReason);
    }

    if (expectedApproved) {
      assertCondition(
        result.canExecute === true,
        "Approved adapter result must expose canExecute=true.",
      );

      assertCondition(
        Number(result.position?.shares) > 0,
        "Approved adapter result must have positive share count.",
      );

      const managerQuantity =
        Number(
          result
            .rawRiskManagerResult
            ?.position
            ?.quantity,
        );

      assertCondition(
        Number.isFinite(
          managerQuantity,
        ) &&
        managerQuantity > 0,
        "Underlying risk manager must expose a positive final quantity.",
      );

      assertCondition(
        Number(
          result.position
            ?.shares,
        ) <=
          managerQuantity,
        "Adapter quantity must never exceed the risk manager approved quantity.",
      );

      assertCondition(
        Number(
          result.position
            ?.managerApprovedShares,
        ) ===
          managerQuantity,
        "Adapter managerApprovedShares must match the risk manager final quantity.",
      );

      assertCondition(
        result.rawRiskManagerResult?.executionAllowed !== true,
        "Underlying manager unexpectedly enabled live execution.",
      );
    } else {
      assertCondition(
        result.canExecute !== true,
        "Rejected adapter result must not be executable.",
      );

      assertCondition(
        result.status === "BLOCKED" ||
        result.status === "ERROR" ||
        result.status === "INSUFFICIENT_DATA",
        `Rejected adapter result has unexpected status: ${result.status}.`,
      );
    }

    passed += 1;
    console.log(`PASS: ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL: ${name}`);
    console.error(
      error instanceof Error
        ? error.message
        : String(error),
    );
  }
}

const safeAccount = buildAccount();

await runScenario({
  name: "Approve real-shaped Alpaca LONG",
  decisionGate:
    buildDecisionGate({
      side: "LONG",
      score: 90,
    }),
  account: safeAccount,
  expectedApproved: true,
});

await runScenario({
  name: "Approve real-shaped Alpaca SHORT",
  decisionGate:
    buildDecisionGate({
      side: "SHORT",
      score: 90,
    }),
  account: safeAccount,
  expectedApproved: true,
});

await runScenario({
  name: "Reject broker trading block",
  decisionGate: buildDecisionGate(),
  account:
    buildAccount({
      tradingBlocked: true,
    }),
  expectedApproved: false,
  expectedReason: "blocked trading",
});

await runScenario({
  name: "Reject blocked account",
  decisionGate: buildDecisionGate(),
  account:
    buildAccount({
      accountBlocked: true,
    }),
  expectedApproved: false,
  expectedReason: "account is blocked",
});

await runScenario({
  name: "Reject SHORT when account shorting disabled",
  decisionGate:
    buildDecisionGate({
      side: "SHORT",
    }),
  account:
    buildAccount({
      shortingEnabled: false,
    }),
  expectedApproved: false,
  expectedReason: "not confirmed for short selling",
});

await runScenario({
  name: "Reject daily dollar loss limit",
  decisionGate: buildDecisionGate(),
  account:
    buildAccount({
      dailyPnL: -200,
      dailyLossLimit: 200,
    }),
  expectedApproved: false,
  expectedReason: "daily loss limit",
});

await runScenario({
  name: "Reject zero buying power",
  decisionGate: buildDecisionGate(),
  account:
    buildAccount({
      buyingPower: 0,
    }),
  expectedApproved: false,
  expectedReason: "buying power",
});

await runScenario({
  name: "Reject decision gate that cannot proceed",
  decisionGate: {
    ...buildDecisionGate(),
    canProceedToRiskManager: false,
  },
  account: safeAccount,
  expectedApproved: false,
  expectedReason: "has not approved",
});

console.log("\n====================================");
console.log("TRADE RISK ADAPTER INTEGRATION SUMMARY");
console.log("====================================");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log("====================================");

if (failed > 0) {
  console.error("RESULT: FAILED");
  process.exitCode = 1;
} else {
  console.log("RESULT: ALL TESTS PASSED");
}
