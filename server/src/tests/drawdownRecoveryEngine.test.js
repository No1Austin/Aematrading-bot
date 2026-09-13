// server/src/tests/drawdownRecoveryEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import evaluateDrawdownRecovery
  from "../risk/drawdownRecoveryEngine.js";

function trade(
  overrides = {},
) {
  return {
    symbol:
      "AAPL",

    side:
      "LONG",

    shares:
      100,

    entryPrice:
      100,

    ...overrides,
  };
}

function account(
  overrides = {},
) {
  return {
    equity:
      100000,

    peakEquity:
      100000,

    startingEquity:
      100000,

    consecutiveLosses:
      0,

    recentTrades: [],

    ...overrides,
  };
}

function recentTrades(
  outcomes,
) {
  return outcomes.map(
    (
      outcome,
      index,
    ) => ({
      id:
        `trade-${index + 1}`,

      outcome,
    }),
  );
}

describe(
  "Drawdown Recovery Engine — Approval",
  () => {
    test(
      "approves healthy account state",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account(),
          });

        expect(
          result.status,
        ).toBe(
          "APPROVED",
        );

        expect(
          result.mode,
        ).toBe(
          "NORMAL",
        );

        expect(
          result.approvedShares,
        ).toBe(
          100,
        );
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Loss Streak",
  () => {
    test(
      "reduces cautiously after two consecutive losses",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                consecutiveLosses:
                  2,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.mode,
        ).toBe(
          "CAUTION",
        );

        expect(
          result.approvedShares,
        ).toBe(
          75,
        );
      },
    );

    test(
      "reduces defensively after three consecutive losses",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                consecutiveLosses:
                  3,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.mode,
        ).toBe(
          "DEFENSIVE",
        );

        expect(
          result.approvedShares,
        ).toBe(
          50,
        );
      },
    );

    test(
      "blocks at configured hard loss-streak threshold",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                consecutiveLosses:
                  5,
              }),
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

describe(
  "Drawdown Recovery Engine — Drawdown",
  () => {
    test(
      "reduces cautiously at moderate drawdown",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                equity:
                  96000,

                peakEquity:
                  100000,
              }),
          });

        expect(
          result.metrics
            .drawdownPercent,
        ).toBe(4);

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBe(75);
      },
    );

    test(
      "reduces defensively at deeper drawdown",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                equity:
                  93000,

                peakEquity:
                  100000,
              }),
          });

        expect(
          result.metrics
            .drawdownPercent,
        ).toBe(7);

        expect(
          result.mode,
        ).toBe(
          "DEFENSIVE",
        );

        expect(
          result.approvedShares,
        ).toBe(50);
      },
    );

    test(
      "blocks at hard drawdown threshold",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                equity:
                  87000,

                peakEquity:
                  100000,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.approvedShares,
        ).toBe(0);
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Recent Loss Rate",
  () => {
    test(
      "reduces when recent loss rate is elevated",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account(),

            recentTrades:
              recentTrades([
                "LOSS",
                "LOSS",
                "WIN",
                "LOSS",
                "WIN",
              ]),
          });

        expect(
          result.metrics
            .recentLossRate,
        ).toBe(0.6);

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );
      },
    );

    test(
      "uses defensive sizing when recent loss rate is severe",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account(),

            recentTrades:
              recentTrades([
                "LOSS",
                "LOSS",
                "LOSS",
                "WIN",
              ]),
          });

        expect(
          result.metrics
            .recentLossRate,
        ).toBe(0.75);

        expect(
          result.mode,
        ).toBe(
          "DEFENSIVE",
        );

        expect(
          result.approvedShares,
        ).toBe(50);
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Recovery",
  () => {
    test(
      "keeps reduced sizing during early recovery",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                equity:
                  99000,

                peakEquity:
                  100000,

                consecutiveLosses:
                  0,
              }),

            recentTrades:
              recentTrades([
                "LOSS",
                "WIN",
                "WIN",
              ]),
          });

        expect(
          result.mode,
        ).toBe(
          "RECOVERY",
        );

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBe(75);
      },
    );

    test(
      "recovery mode never increases incoming shares",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade({
                shares:
                  43,
              }),

            account:
              account({
                equity:
                  99500,

                peakEquity:
                  100000,
              }),

            recentTrades:
              recentTrades([
                "WIN",
                "WIN",
              ]),
          });

        expect(
          result.approvedShares,
        ).toBeLessThanOrEqual(
          43,
        );
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Combined Pressure",
  () => {
    test(
      "uses the most defensive active constraint",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                equity:
                  96000,

                peakEquity:
                  100000,

                consecutiveLosses:
                  3,
              }),

            recentTrades:
              recentTrades([
                "LOSS",
                "LOSS",
                "LOSS",
                "WIN",
              ]),
          });

        expect(
          result.mode,
        ).toBe(
          "DEFENSIVE",
        );

        expect(
          result.approvedShares,
        ).toBe(50);
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Symmetry",
  () => {
    test(
      "applies same protection to SHORT trades",
      () => {
        const longResult =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade({
                side:
                  "LONG",
              }),

            account:
              account({
                consecutiveLosses:
                  3,
              }),
          });

        const shortResult =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade({
                side:
                  "SHORT",
              }),

            account:
              account({
                consecutiveLosses:
                  3,
              }),
          });

        expect(
          shortResult.status,
        ).toBe(
          longResult.status,
        );

        expect(
          shortResult
            .approvedShares,
        ).toBe(
          longResult
            .approvedShares,
        );
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Missing Data",
  () => {
    test(
      "missing account state fails safely",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              {},
          });

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Validation",
  () => {
    test(
      "missing proposed trade blocks safely",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              null,

            account:
              account(),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );
      },
    );

    test(
      "invalid side blocks safely",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade({
                side:
                  "SIDEWAYS",
              }),

            account:
              account(),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Minimum Exposure",
  () => {
    test(
      "blocks when defensive sizing falls below minimum executable exposure",
      () => {
        const result =
          evaluateDrawdownRecovery({
            proposedTrade:
              trade(),

            account:
              account({
                consecutiveLosses:
                  3,
              }),

            config: {
              defensiveMultiplier:
                0.1,

              minimumExposureMultiplier:
                0.2,
            },
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.approvedShares,
        ).toBe(0);
      },
    );
  },
);

describe(
  "Drawdown Recovery Engine — Determinism",
  () => {
    test(
      "same inputs produce same decision",
      () => {
        const input = {
          proposedTrade:
            trade(),

          account:
            account({
              equity:
                96000,

              peakEquity:
                100000,

              consecutiveLosses:
                2,
            }),

          recentTrades:
            recentTrades([
              "LOSS",
              "WIN",
              "LOSS",
              "WIN",
            ]),
        };

        const first =
          evaluateDrawdownRecovery(
            input,
          );

        const second =
          evaluateDrawdownRecovery(
            input,
          );

        expect(
          second,
        ).toEqual(
          first,
        );
      },
    );
  },
);
