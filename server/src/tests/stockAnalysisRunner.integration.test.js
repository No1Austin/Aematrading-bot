import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * ============================================================
 * MOCK MARKET DATA HUB
 * ============================================================
 */

const createMarketSnapshotMock =
  vi.fn();

const getMarketDataStatusMock =
  vi.fn();

vi.mock(
  "../data/marketDataHub.js",
  () => ({
    createMarketSnapshot:
      createMarketSnapshotMock,

    getMarketDataStatus:
      getMarketDataStatusMock,
  }),
);

/**
 * ============================================================
 * MOCK ORCHESTRATOR
 * ============================================================
 */

const runTradingAnalysisMock =
  vi.fn();

vi.mock(
  "../orchestration/engineOrchestrator.js",
  () => ({
    runTradingAnalysis:
      runTradingAnalysisMock,
  }),
);

const {
  default: runStockAnalysis,
} =
  await import(
    "../services/stockAnalysisRunner.js"
  );

/**
 * ============================================================
 * FIXTURES
 * ============================================================
 */

function createCandles(
  count = 100,
) {
  const start =
    Date.parse(
      "2026-08-24T14:30:00.000Z",
    );

  return Array.from(
    {
      length:
        count,
    },
    (
      _,
      index,
    ) => {
      const close =
        200 +
        index *
          0.1;

      return {
        symbol:
          "AAPL",

        timestamp:
          new Date(
            start +
              index *
                5 *
                60 *
                1000,
          )
            .toISOString(),

        open:
          close -
          0.2,

        high:
          close +
          0.5,

        low:
          close -
          0.5,

        close,

        volume:
          100_000 +
          index,

        source:
          "TEST",
      };
    },
  );
}

function createSnapshot({
  candleCount = 100,

  quote = true,

  quoteFresh = true,
} = {}) {
  const candles =
    createCandles(
      candleCount,
    );

  const latestBar =
    candles.length >
    0
      ? candles[
          candles.length -
          1
        ]
      : null;

  return {
    symbol:
      "AAPL",

    asOf:
      "2026-08-24T20:00:00.000Z",

    version:
      10,

    latestBar,

    latestQuote:
      quote
        ? {
            symbol:
              "AAPL",

            timestamp:
              "2026-08-24T19:59:59.000Z",

            bid:
              209.89,

            ask:
              209.91,

            bidSize:
              100,

            askSize:
              120,

            source:
              "TEST",
          }
        : null,

    quoteFresh,

    candles,

    candleCount:
      candles.length,

    historicalLoaded:
      true,

    historicalCandleCount:
      candles.length,

    liveBarCount:
      5,

    quoteCount:
      quote
        ? 10
        : 0,

    updatedAt:
      "2026-08-24T20:00:00.000Z",
  };
}

function createOrchestratorResult({
  approved = true,

  canProceedToPaperExecution =
    false,
} = {}) {
  return {
    approved,

    status:
      "COMPLETE",

    symbol:
      "AAPL",

    finalDecision: {
      symbol:
        "AAPL",

      status:
        "COMPLETE",

      decision:
        canProceedToPaperExecution
          ? "LONG"
          : "NO_TRADE",

      canProceedToRiskManager:
        canProceedToPaperExecution,

      canProceedToPaperExecution,

      reasons: [],

      warnings: [],

      timestamp:
        "2026-08-24T20:00:01.000Z",
    },
  };
}

/**
 * ============================================================
 * TESTS
 * ============================================================
 */

describe(
  "Stock Analysis Runner",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        getMarketDataStatusMock
          .mockReturnValue({
            symbol:
              "AAPL",

            available:
              true,

            historicalLoaded:
              true,

            candleCount:
              100,

            hasLiveBar:
              true,

            hasQuote:
              true,

            quoteFresh:
              true,
          });

        runTradingAnalysisMock
          .mockResolvedValue(
            createOrchestratorResult(),
          );
      },
    );

    it(
      "fails closed when symbol is missing",
      async () => {
        const result =
          await runStockAnalysis({
            symbol:
              "",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INVALID_REQUEST",
        );

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          runTradingAnalysisMock,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "fails closed when MarketDataHub has no snapshot",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            null,
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          runTradingAnalysisMock,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "rejects insufficient candle history",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot({
              candleCount:
                20,
            }),
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",

            minimumCandles:
              50,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          runTradingAnalysisMock,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "allows analysis without a live quote but blocks execution",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot({
              quote:
                false,

              quoteFresh:
                false,
            }),
          );

        runTradingAnalysisMock
          .mockResolvedValue(
            createOrchestratorResult({
              canProceedToPaperExecution:
                true,
            }),
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",

            useLiveSocial:
              false,
          });

        expect(
          runTradingAnalysisMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_ONLY",
        );
      },
    );

    it(
      "allows analysis with a stale quote but blocks execution",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot({
              quote:
                true,

              quoteFresh:
                false,
            }),
          );

        runTradingAnalysisMock
          .mockResolvedValue(
            createOrchestratorResult({
              canProceedToPaperExecution:
                true,
            }),
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",

            useLiveSocial:
              false,
          });

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_ONLY",
        );
      },
    );

    it(
      "requires both fresh market data and orchestrator approval for execution readiness",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot({
              quote:
                true,

              quoteFresh:
                true,
            }),
          );

        runTradingAnalysisMock
          .mockResolvedValue(
            createOrchestratorResult({
              canProceedToPaperExecution:
                true,
            }),
          );

        const result =
          await runStockAnalysis({
            symbol:
              "aapl",

            useLiveSocial:
              false,
          });

        expect(
          result.symbol,
        ).toBe(
          "AAPL",
        );

        expect(
          result.executionReady,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "COMPLETE",
        );
      },
    );

    it(
      "does not allow a fresh quote to bypass orchestrator rejection",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot(),
          );

        runTradingAnalysisMock
          .mockResolvedValue(
            createOrchestratorResult({
              canProceedToPaperExecution:
                false,
            }),
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",

            useLiveSocial:
              false,
          });

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_ONLY",
        );
      },
    );

    it(
      "partial stopAfter runs can never become execution ready",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot(),
          );

        runTradingAnalysisMock
          .mockResolvedValue(
            createOrchestratorResult({
              canProceedToPaperExecution:
                true,
            }),
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",

            useLiveSocial:
              false,

            stopAfter:
              "VOLATILITY_RISK",
          });

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_ONLY",
        );
      },
    );

    it(
      "passes MarketDataHub candles into the orchestrator",
      async () => {
        const snapshot =
          createSnapshot({
            candleCount:
              100,
          });

        createMarketSnapshotMock
          .mockReturnValue(
            snapshot,
          );

        await runStockAnalysis({
          symbol:
            "AAPL",

          useLiveSocial:
            false,
        });

        expect(
          runTradingAnalysisMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const call =
          runTradingAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.symbol,
        ).toBe(
          "AAPL",
        );

        expect(
          call.candles,
        ).toHaveLength(
          100,
        );

        expect(
          call.candles,
        ).toEqual(
          snapshot.candles,
        );
      },
    );

    it(
      "passes fresh bid and ask into liquidity and execution evidence",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot(),
          );

        await runStockAnalysis({
          symbol:
            "AAPL",

          useLiveSocial:
            false,
        });

        const call =
          runTradingAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.liquidity.bid,
        ).toBe(
          209.89,
        );

        expect(
          call.liquidity.ask,
        ).toBe(
          209.91,
        );

        expect(
          call.orderExecution.bid,
        ).toBe(
          209.89,
        );

        expect(
          call.orderExecution.ask,
        ).toBe(
          209.91,
        );
      },
    );

    it(
      "does not fabricate risk reward stops, targets, or probabilities",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot(),
          );

        await runStockAnalysis({
          symbol:
            "AAPL",

          useLiveSocial:
            false,
        });

        const call =
          runTradingAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.riskReward
            .longStopPrice,
        ).toBeNull();

        expect(
          call.riskReward
            .shortStopPrice,
        ).toBeNull();

        expect(
          call.riskReward
            .longTargetPrice,
        ).toBeNull();

        expect(
          call.riskReward
            .shortTargetPrice,
        ).toBeNull();

        expect(
          call.riskReward
            .longWinProbability,
        ).toBeNull();

        expect(
          call.riskReward
            .shortWinProbability,
        ).toBeNull();
      },
    );

    it(
      "provider failure does not crash analysis or become approved evidence",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot(),
          );

        const companyProvider =
          vi.fn(
            async () => {
              throw new Error(
                "Provider unavailable",
              );
            },
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",

            useLiveSocial:
              false,

            providers: {
              company:
                companyProvider,
            },
          });

        expect(
          runTradingAnalysisMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result.providers
            .company
            .approved,
        ).toBe(false);

        expect(
          result.providers
            .company
            .status,
        ).toBe(
          "ERROR",
        );

        expect(
          result.providers
            .company
            .error,
        ).toBe(
          "Provider unavailable",
        );
      },
    );

    it(
  "passes asOfDate to the company fundamentals provider",
  async () => {
    createMarketSnapshotMock
      .mockReturnValue(
        createSnapshot(),
      );

    const companyProvider =
      vi.fn(
        async ({
          symbol,
          asOfDate,
        }) => ({
          approved:
            true,

          status:
            "COMPLETE",

          data: {
            symbol,
            asOfDate,
          },

          warnings: [],

          errors: [],
        }),
      );

    const asOfDate =
      "2026-01-15T15:30:00.000Z";

    await runStockAnalysis({
      symbol:
        "AAPL",

      useLiveSocial:
        false,

      inputs: {
        asOfDate,
      },

      providers: {
        company:
          companyProvider,
      },
    });

    expect(
      companyProvider,
    ).toHaveBeenCalledTimes(
      1,
    );

    expect(
      companyProvider,
    ).toHaveBeenCalledWith({
      symbol:
        "AAPL",

      asOfDate,
    });
  },
);

    it(
      "explicit socialInput disables live social acquisition",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot(),
          );

        const socialInput = {
          sentiment: {
            bullish:
              0.6,

            bearish:
              0.2,

            neutral:
              0.2,
          },
        };

        await runStockAnalysis({
          symbol:
            "AAPL",

          useLiveSocial:
            true,

          inputs: {
            socialInput,
          },
        });

        const call =
          runTradingAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.socialInput,
        ).toEqual(
          socialInput,
        );

        expect(
          call.useLiveSocial,
        ).toBe(false);
      },
    );

    it(
      "fails safely if the orchestrator throws",
      async () => {
        createMarketSnapshotMock
          .mockReturnValue(
            createSnapshot(),
          );

        runTradingAnalysisMock
          .mockRejectedValue(
            new Error(
              "Orchestrator failure",
            ),
          );

        const result =
          await runStockAnalysis({
            symbol:
              "AAPL",

            useLiveSocial:
              false,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ERROR",
        );

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.finalDecision,
        ).toBeNull();

        expect(
          result.errors,
        ).toContain(
          "Orchestrator failure",
        );
      },
    );
  },
);