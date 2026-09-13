import {
  describe,
  test,
  expect,
} from "vitest";

import runTradingAnalysis from
  "../orchestration/engineOrchestrator.js";

import createTradeSetupFingerprint from
  "../history/tradeSetupFingerprint.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const SYMBOL = "AAPL";

function buildDirectional({
  long = 0.9,
  short = 0.1,
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",

    directionalSupport: {
      long,
      short,
    },
  };
}

function buildHistoricalTrade({
  id,
  symbol = SYMBOL,
  side = "LONG",
  closedAt,
  realizedPnL = 200,
  finalR = 2,
  support = 0.9,
} = {}) {
  const fingerprintResult =
    createTradeSetupFingerprint({
      symbol,

      side,

      technical:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      macro:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      marketRegime:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      events:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      company:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      country:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      social:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      historical:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      liquidity: {
        approved: true,
        status: "COMPLETE",
        qualityScore: 0.9,
      },

      riskReward:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      consensus:
        buildDirectional({
          long:
            side === "LONG"
              ? support
              : 1 - support,

          short:
            side === "SHORT"
              ? support
              : 1 - support,
        }),

      asOfTimestamp:
        new Date(
          new Date(
            closedAt,
          ).getTime() -
          60 * 60 * 1000,
        ).toISOString(),
    });

  expect(
    fingerprintResult.approved,
  ).toBe(true);

  return {
    id,

    symbol,

    side,

    status: "CLOSED",

    openedAt:
      new Date(
        new Date(
          closedAt,
        ).getTime() -
        60 * 60 * 1000,
      ).toISOString(),

    closedAt,

    realizedPnL,

    finalR,

    outcome:
      realizedPnL > 0
        ? "WIN"
        : realizedPnL < 0
          ? "LOSS"
          : "BREAKEVEN",

    entryFingerprint:
      fingerprintResult
        .fingerprint,
  };
}

function buildAccount() {
  return {
    balance: 10000,
    equity: 10000,
    buyingPower: 10000,

    riskPercent: 0.5,

    dailyPnL: 0,

    dailyLossLimit: 500,

    openPositions: [],

    portfolioExposure: 0,

    status: "ACTIVE",

    tradingBlocked: false,

    accountBlocked: false,

    shortingEnabled: true,
  };
}

function buildCandles() {
  const candles = [];

  for (
    let index = 0;
    index < 80;
    index += 1
  ) {
    const price =
      100 +
      index * 0.15;

    candles.push({
      timestamp:
        new Date(
          Date.UTC(
            2026,
            0,
            10,
            14,
            index,
          ),
        ).toISOString(),

      open:
        price - 0.1,

      high:
        price + 0.3,

      low:
        price - 0.3,

      close:
        price,

      volume:
        1_000_000 +
        index * 1000,
    });
  }

  return candles;
}

function buildCommonAnalysisInput({
  historicalRecords = [],
  botTradeHistory = [],
  asOfTimestamp =
    "2026-01-10T16:00:00.000Z",
} = {}) {
  return {
    symbol:
      SYMBOL,

    account:
      buildAccount(),

    candles:
      buildCandles(),

    breadth: {
      advancing:
        3500,

      declining:
        1500,
    },

    volatility: {
      vix: 15,
    },

    liquidity: {
      price: 111.85,
      bid: 111.83,
      ask: 111.87,

      currentVolume:
        2_000_000,

      averageVolume:
        1_500_000,

      positionValue:
        2500,

      volatilityPercent:
        1.2,

      session:
        "REGULAR",
    },

    riskReward: {
      entryPrice:
        111.85,

      longStopPrice:
        109.85,

      shortStopPrice:
        113.85,

      longTargetPrice:
        117.85,

      shortTargetPrice:
        105.85,

      longTargetR:
        3,

      shortTargetR:
        3,

      longWinProbability:
        0.7,

      shortWinProbability:
        0.3,
    },

    macroInput: {
      growthScore:
        0.8,

      inflationScore:
        0.6,

      liquidityScore:
        0.8,
    },

    countryInput: {
      country:
        "US",

      stabilityScore:
        0.9,
    },

    companyInput: {
      symbol:
        SYMBOL,

      sector:
        "TECHNOLOGY",

      revenueGrowth:
        0.15,

      earningsGrowth:
        0.12,
    },

    events: [],

    socialInput: {
      posts: [],
    },

    /**
     * General market-history analogue records.
     *
     * These are historical MARKET records and must never be
     * interpreted as the bot's own completed-trade history.
     */
    historicalRecords,

    /**
     * Bot's own CLOSED / COMPLETED trades.
     *
     * This evidence remains completely separate from
     * historical market analogue records.
     */
    botTradeHistory,

    asOfTimestamp,

    onUpdate: null,
  };
}

/**
 * ============================================================
 * HISTORY PIPELINE EXISTS
 * ============================================================
 */

describe(
  "Trade History Pipeline — Orchestrator Integration",
  () => {
    test(
      "exposes trade fingerprint, similarity, and outcome results",
      async () => {
        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput(),
          );

        expect(
          result,
        ).toBeTruthy();

        expect(
          result.results,
        ).toBeTruthy();

        expect(
          result.results
            .tradeFingerprint,
        ).toBeTruthy();

        expect(
          result.results
            .historySimilarity,
        ).toBeTruthy();

        expect(
          result.results
            .historyOutcome,
        ).toBeTruthy();
      },
    );

    test(
      "trade fingerprint preserves candidate symbol",
      async () => {
        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput(),
          );

        expect(
          result.results
            .tradeFingerprint
            ?.fingerprint
            ?.symbol,
        ).toBe(
          SYMBOL,
        );
      },
    );
  },
);

/**
 * ============================================================
 * NO HISTORY
 * ============================================================
 */

describe(
  "Trade History Pipeline — No History",
  () => {
    test(
      "no historical records produces insufficient historical intelligence safely",
      async () => {
        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              botTradeHistory: [],
            }),
          );

        expect(
          result.results
            .historySimilarity
            ?.matches ??
            [],
        ).toHaveLength(0);

        expect(
          [
            "NO_MATCHES",
            "INSUFFICIENT_DATA",
          ],
        ).toContain(
          result.results
            .historyOutcome
            ?.status,
        );

        expect(
          result.results
            .historyOutcome
            ?.directionalSupport
            ?.long ??
            null,
        ).toBeNull();
      },
    );
  },
);

/**
 * ============================================================
 * POINT-IN-TIME SAFETY
 * ============================================================
 */

describe(
  "Trade History Pipeline — Point In Time Safety",
  () => {
    test(
      "future completed trades do not influence earlier candidate",
      async () => {
        const futureTrade =
          buildHistoricalTrade({
            id:
              "future-trade",

            closedAt:
              "2026-01-11T15:00:00.000Z",

            realizedPnL:
              1000,

            finalR:
              5,
          });

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              botTradeHistory: [
                futureTrade,
              ],

              asOfTimestamp:
                "2026-01-10T16:00:00.000Z",
            }),
          );

        expect(
          result.results
            .historySimilarity
            ?.evaluatedTrades ??
            0,
        ).toBe(0);

        expect(
          result.results
            .historySimilarity
            ?.matches ??
            [],
        ).toHaveLength(0);
      },
    );

    test(
      "trade closed exactly at candidate timestamp is excluded",
      async () => {
        const timestamp =
          "2026-01-10T16:00:00.000Z";

        const sameTimeTrade =
          buildHistoricalTrade({
            id:
              "same-time",

            closedAt:
              timestamp,

            realizedPnL:
              1000,

            finalR:
              5,
          });

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              botTradeHistory: [
                sameTimeTrade,
              ],

              asOfTimestamp:
                timestamp,
            }),
          );

        expect(
          result.results
            .historySimilarity
            ?.evaluatedTrades ??
            0,
        ).toBe(0);
      },
    );
  },
);

/**
 * ============================================================
 * HISTORICAL MATCHES
 * ============================================================
 */

describe(
  "Trade History Pipeline — Historical Matches",
  () => {
    test(
      "past similar completed trades are evaluated",
      async () => {
        const botTradeHistory = [
          buildHistoricalTrade({
            id:
              "old-1",

            closedAt:
              "2026-01-07T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "old-2",

            closedAt:
              "2026-01-08T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "old-3",

            closedAt:
              "2026-01-09T15:00:00.000Z",
          }),
        ];

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              botTradeHistory,
            }),
          );

        expect(
          result.results
            .historySimilarity
            ?.evaluatedTrades,
        ).toBeGreaterThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * STRONG POSITIVE HISTORY
 * ============================================================
 */

describe(
  "Trade History Pipeline — Positive Outcomes",
  () => {
    test(
      "strong historical winners are surfaced as historical outcome intelligence",
      async () => {
        const botTradeHistory =
          Array.from(
            {
              length: 12,
            },
            (
              _,
              index,
            ) =>
              buildHistoricalTrade({
                id:
                  `winner-${index}`,

                closedAt:
                  new Date(
                    Date.UTC(
                      2026,
                      0,
                      9,
                      0,
                      index,
                    ),
                  ).toISOString(),

                realizedPnL:
                  250,

                finalR:
                  1.5,
              }),
          );

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              botTradeHistory,
            }),
          );

        const historyOutcome =
          result.results
            .historyOutcome;

        expect(
          historyOutcome,
        ).toBeTruthy();

        /**
         * Depending on exact similarity between the live
         * technical fingerprint and synthetic records, the
         * engine may have fewer than all 12 qualifying matches.
         *
         * But it must never manufacture a negative result from
         * purely winning historical evidence.
         */

        expect(
          [
            "STRONGLY_SUPPORTIVE",
            "SUPPORTIVE",
            "INSUFFICIENT_DATA",
          ],
        ).toContain(
          historyOutcome
            ?.signal,
        );

        if (
          historyOutcome
            ?.stats
            ?.knownOutcomes >
          0
        ) {
          expect(
            historyOutcome
              .stats
              .weightedWinRate,
          ).toBe(1);
        }
      },
    );
  },
);

/**
 * ============================================================
 * NEGATIVE HISTORY
 * ============================================================
 */

describe(
  "Trade History Pipeline — Negative Outcomes",
  () => {
    test(
      "historical losers are surfaced without directly executing anything",
      async () => {
        const botTradeHistory =
          Array.from(
            {
              length: 12,
            },
            (
              _,
              index,
            ) =>
              buildHistoricalTrade({
                id:
                  `loser-${index}`,

                closedAt:
                  new Date(
                    Date.UTC(
                      2026,
                      0,
                      9,
                      1,
                      index,
                    ),
                  ).toISOString(),

                realizedPnL:
                  -200,

                finalR:
                  -1,
              }),
          );

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              botTradeHistory,
            }),
          );

        const historyOutcome =
          result.results
            .historyOutcome;

        expect(
          historyOutcome,
        ).toBeTruthy();

        expect(
          [
            "STRONGLY_NEGATIVE",
            "CAUTION",
            "INSUFFICIENT_DATA",
          ],
        ).toContain(
          historyOutcome
            ?.signal,
        );

        /**
         * History outcome is advisory at this stage.
         *
         * It must not create an execution decision of its own.
         */

        expect(
          historyOutcome
            ?.canExecute,
        ).toBeUndefined();

        expect(
          historyOutcome
            ?.canProceedToRiskManager,
        ).toBeUndefined();
      },
    );
  },
);

/**
 * ============================================================
 * HISTORY CANNOT BYPASS NORMAL PIPELINE
 * ============================================================
 */

describe(
  "Trade History Pipeline — Safety Boundary",
  () => {
    test(
      "history outcome cannot independently authorize paper execution",
      async () => {
        const botTradeHistory =
          Array.from(
            {
              length: 20,
            },
            (
              _,
              index,
            ) =>
              buildHistoricalTrade({
                id:
                  `perfect-${index}`,

                closedAt:
                  new Date(
                    Date.UTC(
                      2026,
                      0,
                      8,
                      1,
                      index,
                    ),
                  ).toISOString(),

                realizedPnL:
                  1000,

                finalR:
                  5,
              }),
          );

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              botTradeHistory,
            }),
          );

        /**
         * The only source of execution permission must remain
         * finalDecision / riskApproval.
         */

        expect(
          result.results
            .historyOutcome
            ?.canExecute,
        ).toBeUndefined();

        expect(
          result.results
            .historyOutcome
            ?.tradeEligible,
        ).toBeUndefined();

        expect(
          typeof result
            .finalDecision
            ?.canProceedToPaperExecution,
        ).toBe(
          "boolean",
        );
      },
    );
  },
);

/**
 * ============================================================
 * ORCHESTRATOR ENGINE STATES
 * ============================================================
 */

describe(
  "Trade History Pipeline — Engine States",
  () => {
    test(
      "all three history-learning engines are tracked in orchestrator state",
      async () => {
        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput(),
          );

        expect(
          result.engines
            ?.tradeFingerprint,
        ).toBeTruthy();

        expect(
          result.engines
            ?.historySimilarity,
        ).toBeTruthy();

        expect(
          result.engines
            ?.historyOutcome,
        ).toBeTruthy();
      },
    );
  },
);

/**
 * ============================================================
 * MARKET HISTORY / BOT HISTORY SEPARATION
 * ============================================================
 */

describe(
  "Trade History Pipeline — Source Separation",
  () => {
    test(
      "market historicalRecords are not treated as bot completed trades",
      async () => {
        const marketHistoricalRecords = [
          buildHistoricalTrade({
            id:
              "market-history-1",

            closedAt:
              "2026-01-07T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "market-history-2",

            closedAt:
              "2026-01-08T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "market-history-3",

            closedAt:
              "2026-01-09T15:00:00.000Z",
          }),
        ];

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              historicalRecords:
                marketHistoricalRecords,

              botTradeHistory: [],
            }),
          );

        expect(
          result.results
            .historySimilarity
            ?.evaluatedTrades ??
            0,
        ).toBe(0);

        expect(
          result.results
            .historySimilarity
            ?.qualifyingTrades ??
            0,
        ).toBe(0);
      },
    );

    test(
      "botTradeHistory is independently evaluated by bot trade similarity",
      async () => {
        const botTradeHistory = [
          buildHistoricalTrade({
            id:
              "bot-history-1",

            closedAt:
              "2026-01-07T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "bot-history-2",

            closedAt:
              "2026-01-08T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "bot-history-3",

            closedAt:
              "2026-01-09T15:00:00.000Z",
          }),
        ];

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              historicalRecords: [],

              botTradeHistory,
            }),
          );

        expect(
          result.results
            .historySimilarity
            ?.evaluatedTrades ??
            0,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "market history and bot history remain independent when both are supplied",
      async () => {
        const marketHistoricalRecords = [
          buildHistoricalTrade({
            id:
              "market-independent-1",

            closedAt:
              "2026-01-07T14:00:00.000Z",
          }),
        ];

        const botTradeHistory = [
          buildHistoricalTrade({
            id:
              "bot-independent-1",

            closedAt:
              "2026-01-07T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "bot-independent-2",

            closedAt:
              "2026-01-08T15:00:00.000Z",
          }),

          buildHistoricalTrade({
            id:
              "bot-independent-3",

            closedAt:
              "2026-01-09T15:00:00.000Z",
          }),
        ];

        const result =
          await runTradingAnalysis(
            buildCommonAnalysisInput({
              historicalRecords:
                marketHistoricalRecords,

              botTradeHistory,
            }),
          );

        expect(
          result.results
            .historySimilarity
            ?.evaluatedTrades ??
            0,
        ).toBe(
          botTradeHistory.length,
        );
      },
    );
  },
);

