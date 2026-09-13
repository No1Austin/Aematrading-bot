import {
  describe,
  test,
  expect,
} from "vitest";

import createPaperTradingSession from
  "../execution/paperTradingSession.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildAnalysisResult({
  symbol = "AAPL",
  side = "LONG",
  canExecute = true,
  fingerprint = null,
} = {}) {
  const entryFingerprint =
    fingerprint ?? {
      version: 1,

      symbol,

      side,

      asOfTimestamp:
        "2026-08-22T18:00:00.000Z",

      components: {
        technical: {
          available: true,
          alignedSupport: 0.9,
          oppositeSupport: 0.1,
        },

        macro: {
          available: true,
          alignedSupport: 0.85,
          oppositeSupport: 0.15,
        },

        marketRegime: {
          available: true,
          alignedSupport: 0.9,
          oppositeSupport: 0.1,
        },

        consensus: {
          available: true,
          alignedSupport: 0.88,
          oppositeSupport: 0.12,
        },
      },
    };

  return {
    approved: true,

    symbol,

    finalDecision: {
      symbol,

      decision:
        canExecute
          ? "APPROVED_FOR_PAPER_EXECUTION"
          : "NO_TRADE",

      preferredSide:
        side,

      preferredScore:
        canExecute
          ? 90
          : 60,

      canProceedToRiskManager:
        canExecute,

      riskApproved:
        canExecute,

      canProceedToPaperExecution:
        canExecute,

      timestamp:
        "2026-08-22T18:00:00.000Z",
    },

    results: {
      technical: {
        approved: true,
      },

      macro: {
        approved: true,
      },

      marketRegime: {
        approved: true,
      },

      events: {
        approved: true,
      },

      company: {
        approved: true,
      },

      country: {
        approved: true,
      },

      social: {
        approved: true,
      },

      historical: {
        approved: true,
      },

      liquidity: {
        approved: true,
      },

      consensus: {
        approved: true,
      },

      tradeFingerprint: {
        approved: true,

        status: "COMPLETE",

        fingerprint:
          entryFingerprint,
      },

      riskApproval: {
        approved:
          canExecute,

        status:
          canExecute
            ? "APPROVED"
            : "BLOCKED",

        canExecute,

        side,

        intelligenceScore:
          canExecute
            ? 90
            : 60,

        position: canExecute
          ? {
              shares: 100,

              entryPrice: 100,

              stopPrice: 98,

              targetPrice: 120,

              riskPerShare: 2,

              dollarRisk: 200,

              accountRiskPercent: 0.5,
            }
          : null,
      },
    },
  };
}

function buildAnalysisRunner({
  result,
  calls,
}) {
  return async (
    input,
  ) => {
    calls.push(
      input,
    );

    return result;
  };
}

/**
 * ============================================================
 * INITIAL STATE
 * ============================================================
 */

describe(
  "Paper Trading Session — Initial State",
  () => {
    test(
      "starts ready with no open position and empty history",
      () => {
        const session =
          createPaperTradingSession();

        const state =
          session.getState();

        expect(
          state.status,
        ).toBe(
          "READY",
        );

        expect(
          state.hasOpenPosition,
        ).toBe(false);

        expect(
          state.historyCount,
        ).toBe(0);

        expect(
          session.historySize,
        ).toBe(0);
      },
    );
  },
);

/**
 * ============================================================
 * ANALYSIS
 * ============================================================
 */

describe(
  "Paper Trading Session — Analysis",
  () => {
    test(
      "passes account and session history into analysis runner",
      async () => {
        const calls = [];

        const result =
          buildAnalysisResult();

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result,
                calls,
              }),
          });

        const analysis =
          await session.analyze({
            symbol:
              "AAPL",

            candles: [
              {
                close:
                  100,
              },
            ],
          });

        expect(
          analysis.approved,
        ).toBe(true);

        expect(
          calls,
        ).toHaveLength(1);

        expect(
          calls[0].symbol,
        ).toBe(
          "AAPL",
        );

        expect(
          calls[0].account,
        ).toBeTruthy();

        expect(
          calls[0]
            .historicalRecords,
        ).toEqual([]);

        expect(
          analysis
            .historyRecordsUsed,
        ).toBe(0);

        expect(
          analysis
            .canOpenTrade,
        ).toBe(true);
      },
    );

    test(
      "analysis cannot authorize opening when risk approval is blocked",
      async () => {
        const calls = [];

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result:
                  buildAnalysisResult({
                    canExecute:
                      false,
                  }),

                calls,
              }),
          });

        const analysis =
          await session.analyze({
            symbol:
              "AAPL",
          });

        expect(
          analysis.approved,
        ).toBe(true);

        expect(
          analysis
            .canOpenTrade,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * OPEN TRADE
 * ============================================================
 */

describe(
  "Paper Trading Session — Open Trade",
  () => {
    test(
      "opens approved paper trade and preserves fingerprint",
      async () => {
        const calls = [];

        const analysisResult =
          buildAnalysisResult();

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result:
                  analysisResult,

                calls,
              }),
          });

        await session.analyze({
          symbol:
            "AAPL",
        });

        const opened =
          session.openApprovedTrade({
            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          opened.approved,
        ).toBe(true);

        expect(
          opened.status,
        ).toBe(
          "POSITION_OPEN",
        );

        expect(
          session.position,
        ).toBeTruthy();

        expect(
          session.position
            .entryFingerprint,
        ).toEqual(
          analysisResult
            .results
            .tradeFingerprint
            .fingerprint,
        );
      },
    );

    test(
      "blocks second position while one is already open",
      async () => {
        const calls = [];

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result:
                  buildAnalysisResult(),

                calls,
              }),
          });

        await session.analyze({
          symbol:
            "AAPL",
        });

        const first =
          session.openApprovedTrade({
            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          first.approved,
        ).toBe(true);

        const second =
          session.openApprovedTrade({
            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          second.approved,
        ).toBe(false);

        expect(
          second.status,
        ).toBe(
          "BLOCKED",
        );
      },
    );
  },
);

/**
 * ============================================================
 * CLOSE + STORE
 * ============================================================
 */

describe(
  "Paper Trading Session — Closed Trade",
  () => {
    test(
      "closing position automatically stores completed trade",
      async () => {
        const calls = [];

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result:
                  buildAnalysisResult(),

                calls,
              }),
          });

        await session.analyze({
          symbol:
            "AAPL",
        });

        session.openApprovedTrade({
          currentPrice:
            100,

          slippagePercent:
            0,
        });

        const closed =
          await session
            .updateOpenPosition({
              currentPrice:
                97.5,

              atr:
                1,

              slippagePercent:
                0,

              monitorThesis:
                false,

              asOfTimestamp:
                "2026-08-22T18:10:00.000Z",
            });

        expect(
          closed.approved,
        ).toBe(true);

        expect(
          closed.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          session.position,
        ).toBeNull();

        expect(
          session.historySize,
        ).toBe(1);

        expect(
          session.getHistory(),
        ).toHaveLength(1);
      },
    );

    test(
      "account balance is updated after closed losing trade",
      async () => {
        const calls = [];

        const session =
          createPaperTradingSession({
            account: {
              balance:
                10_000,

              equity:
                10_000,

              buyingPower:
                10_000,
            },

            analysisRunner:
              buildAnalysisRunner({
                result:
                  buildAnalysisResult(),

                calls,
              }),
          });

        await session.analyze({
          symbol:
            "AAPL",
        });

        session.openApprovedTrade({
          currentPrice:
            100,

          slippagePercent:
            0,
        });

        const closed =
          await session
            .updateOpenPosition({
              currentPrice:
                97.5,

              atr:
                1,

              slippagePercent:
                0,

              asOfTimestamp:
                "2026-08-22T18:10:00.000Z",
            });

        expect(
          closed.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          session.account
            .balance,
        ).toBeLessThan(
          10_000,
        );

        expect(
          session.account
            .openPositions,
        ).toHaveLength(0);
      },
    );
  },
);

/**
 * ============================================================
 * TWO-TRADE LEARNING LOOP
 * ============================================================
 */

describe(
  "Paper Trading Session — Automatic Learning Loop",
  () => {
    test(
      "trade one is automatically supplied to analysis of trade two",
      async () => {
        const calls = [];

        const analysisResult =
          buildAnalysisResult();

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result:
                  analysisResult,

                calls,
              }),
          });

        /**
         * Trade #1 analysis.
         */

        const firstAnalysis =
          await session.analyze({
            symbol:
              "AAPL",

            asOfTimestamp:
              "2026-08-22T18:00:00.000Z",
          });

        expect(
          firstAnalysis
            .historyRecordsUsed,
        ).toBe(0);

        /**
         * Trade #1 entry.
         */

        const firstEntry =
          session.openApprovedTrade({
            currentPrice:
              100,

            slippagePercent:
              0,

            metadata: {
              timestamp:
                "2026-08-22T18:00:00.000Z",
            },
          });

        expect(
          firstEntry.approved,
        ).toBe(true);

        /**
         * Trade #1 exit.
         */

        const firstExit =
          await session
            .updateOpenPosition({
              currentPrice:
                97.5,

              atr:
                1,

              slippagePercent:
                0,

              monitorThesis:
                false,

              asOfTimestamp:
                "2026-08-22T18:10:00.000Z",
            });

        expect(
          firstExit.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          session.historySize,
        ).toBe(1);

        /**
         * Trade #2 analysis.
         *
         * No historicalRecords argument is passed manually.
         * The session must inject trade #1 automatically.
         */

        const secondAnalysis =
          await session.analyze({
            symbol:
              "AAPL",

            asOfTimestamp:
              "2026-08-22T19:00:00.000Z",
          });

        expect(
          secondAnalysis
            .historyRecordsUsed,
        ).toBe(1);

        expect(
          calls,
        ).toHaveLength(2);

        /**
         * Market historical analogue records and the bot's own
         * completed trades are intentionally separate sources.
         *
         * The paper session must inject completed paper trades
         * through botTradeHistory only.
         */
        expect(
          calls[1]
            .historicalRecords,
        ).toEqual([]);

        expect(
          calls[1]
            .botTradeHistory,
        ).toHaveLength(1);

        expect(
          calls[1]
            .botTradeHistory[0]
            .entryFingerprint,
        ).toBeTruthy();

        expect(
          calls[1]
            .botTradeHistory[0]
            .symbol,
        ).toBe(
          "AAPL",
        );

        expect(
          calls[1]
            .botTradeHistory[0]
            .status,
        ).toBe(
          "CLOSED",
        );
      },
    );
  },
);

/**
 * ============================================================
 * RESET
 * ============================================================
 */

describe(
  "Paper Trading Session — Reset",
  () => {
    test(
      "reset preserves history by default",
      async () => {
        const calls = [];

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result:
                  buildAnalysisResult(),

                calls,
              }),
          });

        await session.analyze({
          symbol:
            "AAPL",
        });

        session.openApprovedTrade({
          currentPrice:
            100,

          slippagePercent:
            0,
        });

        await session
          .updateOpenPosition({
            currentPrice:
              97.5,

            atr:
              1,

            slippagePercent:
              0,
          });

        expect(
          session.historySize,
        ).toBe(1);

        session.reset();

        expect(
          session.historySize,
        ).toBe(1);

        expect(
          session.position,
        ).toBeNull();
      },
    );

    test(
      "reset can explicitly clear history",
      async () => {
        const calls = [];

        const session =
          createPaperTradingSession({
            analysisRunner:
              buildAnalysisRunner({
                result:
                  buildAnalysisResult(),

                calls,
              }),
          });

        await session.analyze({
          symbol:
            "AAPL",
        });

        session.openApprovedTrade({
          currentPrice:
            100,

          slippagePercent:
            0,
        });

        await session
          .updateOpenPosition({
            currentPrice:
              97.5,

            atr:
              1,

            slippagePercent:
              0,
          });

        expect(
          session.historySize,
        ).toBe(1);

        session.reset({
          preserveHistory:
            false,
        });

        expect(
          session.historySize,
        ).toBe(0);
      },
    );
  },
);