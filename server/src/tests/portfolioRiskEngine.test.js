// server/src/tests/portfolioRiskEngine.test.js

import {
  describe,
  test,
  expect,
} from "vitest";

import evaluatePortfolioRisk from
  "../risk/portfolioRiskEngine.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildAccount({
  equity = 100_000,
  balance = 100_000,
  startingEquity = 100_000,
  dailyPnL = 0,
  consecutiveLosses = 0,
  openPositions = [],
  tradingBlocked = false,
  accountBlocked = false,
} = {}) {
  return {
    equity,

    balance,

    startingEquity,

    buyingPower:
      equity,

    dailyPnL,

    consecutiveLosses,

    openPositions,

    tradingBlocked,

    accountBlocked,

    status:
      "ACTIVE",
  };
}

function buildTrade({
  symbol = "AAPL",
  side = "LONG",
  sector = "TECHNOLOGY",
  shares = 100,
  entryPrice = 100,
  stopPrice = 98,
  dollarRisk = null,
} = {}) {
  const riskPerShare =
    Math.abs(
      entryPrice -
      stopPrice,
    );

  return {
    symbol,

    side,

    sector,

    shares,

    entryPrice,

    stopPrice,

    riskPerShare,

    dollarRisk:
      dollarRisk ??
      (
        shares *
        riskPerShare
      ),
  };
}

function buildOpenPosition({
  symbol = "MSFT",
  side = "LONG",
  sector = "TECHNOLOGY",
  shares = 100,
  entryPrice = 100,
  currentPrice = 100,
  riskPerShare = 2,
} = {}) {
  return {
    symbol,

    side,

    sector,

    shares,

    entryPrice,

    currentPrice,

    riskPerShare,

    dollarRisk:
      shares *
      riskPerShare,
  };
}

/**
 * ============================================================
 * APPROVAL
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Approval",
  () => {
    test(
      "approves healthy proposed trade",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount(),

            proposedTrade:
              buildTrade({
                shares:
                  100,

                entryPrice:
                  100,

                stopPrice:
                  98,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "APPROVED",
        );

        expect(
          result.action,
        ).toBe(
          "APPROVE",
        );

        expect(
          result.canExecute,
        ).toBe(true);

        expect(
          result.exposureMultiplier,
        ).toBe(1);

        expect(
          result.approvedShares,
        ).toBe(100);
      },
    );
  },
);

/**
 * ============================================================
 * PER-TRADE RISK
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Per Trade Risk",
  () => {
    test(
      "reduces oversized trade instead of increasing risk",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount(),

            proposedTrade:
              buildTrade({
                shares:
                  1000,

                entryPrice:
                  100,

                stopPrice:
                  98,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.action,
        ).toBe(
          "REDUCE",
        );

        expect(
          result.exposureMultiplier,
        ).toBeLessThan(1);

        expect(
          result.approvedShares,
        ).toBeLessThan(
          1000,
        );
      },
    );
  },
);

/**
 * ============================================================
 * TOTAL OPEN RISK
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Total Risk",
  () => {
    test(
      "blocks when virtually no portfolio risk capacity remains",
      () => {
        const openPositions = [
          buildOpenPosition({
            shares:
              1900,

            riskPerShare:
              2,
          }),
        ];

        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                openPositions,
              }),

            proposedTrade:
              buildTrade({
                shares:
                  500,

                entryPrice:
                  100,

                stopPrice:
                  98,
              }),
          });

        expect(
          result.action,
        ).toBe(
          "BLOCK",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * SYMBOL CONCENTRATION
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Symbol Concentration",
  () => {
    test(
      "reduces trade that would exceed single-symbol exposure",
      () => {
        const openPositions = [
          buildOpenPosition({
            symbol:
              "AAPL",

            shares:
              150,

            entryPrice:
              100,

            currentPrice:
              100,
          }),
        ];

        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                openPositions,
              }),

            proposedTrade:
              buildTrade({
                symbol:
                  "AAPL",

                shares:
                  100,

                entryPrice:
                  100,

                stopPrice:
                  98,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBeLessThan(
          100,
        );
      },
    );
  },
);

/**
 * ============================================================
 * SECTOR CONCENTRATION
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Sector Concentration",
  () => {
    test(
      "reduces trade that exceeds same-sector exposure",
      () => {
        const openPositions = [
          buildOpenPosition({
            symbol:
              "MSFT",

            sector:
              "TECHNOLOGY",

            shares:
              350,

            entryPrice:
              100,

            currentPrice:
              100,
          }),
        ];

        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                openPositions,
              }),

            proposedTrade:
              buildTrade({
                symbol:
                  "AAPL",

                sector:
                  "TECHNOLOGY",

                shares:
                  100,

                entryPrice:
                  100,

                stopPrice:
                  98,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBeLessThan(
          100,
        );
      },
    );
  },
);

/**
 * ============================================================
 * DIRECTIONAL EXPOSURE
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Directional Exposure",
  () => {
    test(
      "reduces excessive LONG concentration",
      () => {
        const openPositions = [
          buildOpenPosition({
            symbol:
              "MSFT",

            side:
              "LONG",

            sector:
              "FINANCIALS",

            shares:
              650,

            entryPrice:
              100,

            currentPrice:
              100,
          }),
        ];

        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                openPositions,
              }),

            proposedTrade:
              buildTrade({
                side:
                  "LONG",

                shares:
                  100,

                entryPrice:
                  100,

                stopPrice:
                  98,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.exposureMultiplier,
        ).toBeLessThan(1);
      },
    );

    test(
      "applies same directional protection to SHORT exposure",
      () => {
        const openPositions = [
          buildOpenPosition({
            symbol:
              "MSFT",

            side:
              "SHORT",

            sector:
              "FINANCIALS",

            shares:
              650,

            entryPrice:
              100,

            currentPrice:
              100,
          }),
        ];

        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                openPositions,
              }),

            proposedTrade:
              buildTrade({
                side:
                  "SHORT",

                shares:
                  100,

                entryPrice:
                  100,

                stopPrice:
                  102,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.exposureMultiplier,
        ).toBeLessThan(1);
      },
    );
  },
);

/**
 * ============================================================
 * DAILY LOSS
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Daily Loss",
  () => {
    test(
      "blocks after daily loss cutoff",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                dailyPnL:
                  -3500,
              }),

            proposedTrade:
              buildTrade(),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.canExecute,
        ).toBe(false);

        expect(
          result.reasons
            .some(
              (reason) =>
                reason.includes(
                  "Daily loss cutoff",
                ),
            ),
        ).toBe(true);
      },
    );
  },
);

/**
 * ============================================================
 * DRAWDOWN
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Drawdown",
  () => {
    test(
      "blocks after maximum account drawdown",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                equity:
                  89_000,

                balance:
                  89_000,

                startingEquity:
                  100_000,
              }),

            proposedTrade:
              buildTrade(),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * CONSECUTIVE LOSSES
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Consecutive Losses",
  () => {
    test(
      "blocks after configured consecutive loss limit",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                consecutiveLosses:
                  4,
              }),

            proposedTrade:
              buildTrade(),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * ACCOUNT BLOCK
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Account Block",
  () => {
    test(
      "never approves when account trading is blocked",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount({
                tradingBlocked:
                  true,
              }),

            proposedTrade:
              buildTrade(),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.action,
        ).toBe(
          "BLOCK",
        );
      },
    );
  },
);

/**
 * ============================================================
 * MISSING DATA
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Safe Fail",
  () => {
    test(
      "missing account safely blocks",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              null,

            proposedTrade:
              buildTrade(),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );

    test(
      "missing proposed trade safely blocks",
      () => {
        const result =
          evaluatePortfolioRisk({
            account:
              buildAccount(),

            proposedTrade:
              null,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.action,
        ).toBe(
          "BLOCK",
        );
      },
    );
  },
);

/**
 * ============================================================
 * DETERMINISM
 * ============================================================
 */

describe(
  "Portfolio Risk Engine — Determinism",
  () => {
    test(
      "same inputs produce same risk decision",
      () => {
        const account =
          buildAccount({
            openPositions: [
              buildOpenPosition({
                symbol:
                  "MSFT",
              }),
            ],
          });

        const proposedTrade =
          buildTrade({
            symbol:
              "AAPL",
          });

        const first =
          evaluatePortfolioRisk({
            account,

            proposedTrade,
          });

        const second =
          evaluatePortfolioRisk({
            account,

            proposedTrade,
          });

        expect(
          first.status,
        ).toBe(
          second.status,
        );

        expect(
          first.action,
        ).toBe(
          second.action,
        );

        expect(
          first.exposureMultiplier,
        ).toBe(
          second.exposureMultiplier,
        );

        expect(
          first.approvedShares,
        ).toBe(
          second.approvedShares,
        );
      },
    );
  },
);
