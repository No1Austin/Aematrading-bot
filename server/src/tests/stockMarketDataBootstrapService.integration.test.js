import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * ============================================================
 * MOCK HISTORICAL PROVIDER
 * ============================================================
 */

const loadEngineWarmupHistoryMock =
  vi.fn();

vi.mock(
  "../data/providers/alpacaHistoricalDataService.js",
  () => ({
    ALPACA_TIMEFRAME: {
      FIVE_MINUTES:
        "5Min",
    },

    ALPACA_FEED: {
      IEX:
        "iex",
    },

    loadEngineWarmupHistory:
      loadEngineWarmupHistoryMock,
  }),
);

/**
 * ============================================================
 * MOCK MARKET DATA HUB
 * ============================================================
 */

const getMarketDataStatusMock =
  vi.fn();

const createMarketSnapshotMock =
  vi.fn();

const isQuoteFreshMock =
  vi.fn();

vi.mock(
  "../data/marketDataHub.js",
  () => ({
    getMarketDataStatus:
      getMarketDataStatusMock,

    createMarketSnapshot:
      createMarketSnapshotMock,

    isQuoteFresh:
      isQuoteFreshMock,
  }),
);

const {
  default: bootstrapStockMarketData,
} =
  await import(
    "../services/stockMarketDataBootstrapService.js"
  );

/**
 * ============================================================
 * FIXTURES
 * ============================================================
 */

function makeCandles(
  count = 250,
) {
  const start =
    Date.parse(
      "2026-08-01T13:30:00.000Z",
    );

  return Array.from(
    {
      length:
        count,
    },
    (
      _,
      index,
    ) => ({
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
        200 +
        index *
          0.01,

      high:
        200.5 +
        index *
          0.01,

      low:
        199.5 +
        index *
          0.01,

      close:
        200.2 +
        index *
          0.01,

      volume:
        100000 +
        index,

      source:
        "ALPACA",
    }),
  );
}

function makeHistoricalResult({
  approved = true,

  barCount = 250,

  readyForEngines =
    true,

  loadedIntoHub =
    true,

  warnings = [],

  errors = [],
} = {}) {
  return {
    approved,

    provider:
      "ALPACA",

    symbol:
      "AAPL",

    timeframe:
      "5Min",

    feed:
      "iex",

    start:
      "2026-08-01T00:00:00.000Z",

    end:
      "2026-08-27T00:00:00.000Z",

    barCount,

    bars:
      makeCandles(
        barCount,
      ),

    loadedIntoHub,

    readyForEngines,

    warnings,

    errors,

    fetchedAt:
      "2026-08-27T00:00:00.000Z",
  };
}

function makeStatus({
  candleCount = 250,

  hasQuote = false,

  quoteFresh = false,
} = {}) {
  return {
    symbol:
      "AAPL",

    available:
      true,

    historicalLoaded:
      true,

    candleCount,

    historicalCandleCount:
      candleCount,

    liveBarCount:
      0,

    quoteCount:
      hasQuote
        ? 1
        : 0,

    hasLiveBar:
      false,

    hasQuote,

    quoteFresh,

    latestBarTimestamp:
      "2026-08-27T00:00:00.000Z",

    latestQuoteTimestamp:
      hasQuote
        ? "2026-08-27T00:00:00.000Z"
        : null,

    version:
      1,

    updatedAt:
      "2026-08-27T00:00:00.000Z",
  };
}

function makeSnapshot({
  candleCount = 250,

  hasQuote = false,
} = {}) {
  const candles =
    makeCandles(
      candleCount,
    );

  return {
    symbol:
      "AAPL",

    asOf:
      "2026-08-27T00:00:01.000Z",

    version:
      1,

    latestBar:
      candles[
        candles.length -
        1
      ] ??
      null,

    latestQuote:
      hasQuote
        ? {
            symbol:
              "AAPL",

            timestamp:
              "2026-08-27T00:00:00.000Z",

            bid:
              202.49,

            ask:
              202.51,

            bidSize:
              100,

            askSize:
              120,

            source:
              "TEST",
          }
        : null,

    quoteFresh:
      false,

    candles,

    candleCount,

    historicalLoaded:
      true,

    historicalCandleCount:
      candleCount,

    liveBarCount:
      0,

    quoteCount:
      hasQuote
        ? 1
        : 0,

    updatedAt:
      "2026-08-27T00:00:00.000Z",
  };
}

/**
 * ============================================================
 * TESTS
 * ============================================================
 */

describe(
  "Stock Market Data Bootstrap Service",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        loadEngineWarmupHistoryMock
          .mockResolvedValue(
            makeHistoricalResult(),
          );

        getMarketDataStatusMock
          .mockReturnValue(
            makeStatus(),
          );

        createMarketSnapshotMock
          .mockReturnValue(
            makeSnapshot(),
          );

        isQuoteFreshMock
          .mockReturnValue(
            false,
          );
      },
    );

    it(
      "fails closed when symbol is missing",
      async () => {
        const result =
          await bootstrapStockMarketData({
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
          result.analysisReady,
        ).toBe(false);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          loadEngineWarmupHistoryMock,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "normalizes symbol before loading market data",
      async () => {
        await bootstrapStockMarketData({
          symbol:
            " aapl ",
        });

        const call =
          loadEngineWarmupHistoryMock
            .mock
            .calls[0][0];

        expect(
          call.symbol,
        ).toBe(
          "AAPL",
        );
      },
    );

    it(
      "fails closed when historical provider rejects the warmup",
      async () => {
        loadEngineWarmupHistoryMock
          .mockResolvedValue(
            makeHistoricalResult({
              approved:
                false,

              readyForEngines:
                false,

              errors: [
                "Alpaca unavailable",
              ],
            }),
          );

        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.analysisReady,
        ).toBe(false);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.errors,
        ).toContain(
          "Alpaca unavailable",
        );
      },
    );

    it(
      "fails closed when historical provider throws",
      async () => {
        loadEngineWarmupHistoryMock
          .mockRejectedValue(
            new Error(
              "Network exploded",
            ),
          );

        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
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
          result.analysisReady,
        ).toBe(false);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.errors,
        ).toContain(
          "Network exploded",
        );
      },
    );

    it(
      "rejects an invalid asOfTimestamp before calling Alpaca",
      async () => {
        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",

            asOfTimestamp:
              "not-a-date",
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
          loadEngineWarmupHistoryMock,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "passes timeframe feed and minimumBars into warmup provider",
      async () => {
        await bootstrapStockMarketData({
          symbol:
            "AAPL",

          timeframe:
            "5Min",

          feed:
            "iex",

          minimumBars:
            300,

          lookbackDays:
            20,

          asOfTimestamp:
            "2026-08-27T00:00:00.000Z",
        });

        const call =
          loadEngineWarmupHistoryMock
            .mock
            .calls[0][0];

        expect(
          call.timeframe,
        ).toBe(
          "5Min",
        );

        expect(
          call.feed,
        ).toBe(
          "iex",
        );

        expect(
          call.minimumBars,
        ).toBe(
          300,
        );

        expect(
          new Date(
            call.start,
          ).getTime(),
        ).toBeLessThan(
          new Date(
            call.end,
          ).getTime(),
        );
      },
    );

    it(
      "fails closed if MarketDataHub is unavailable after successful download",
      async () => {
        getMarketDataStatusMock
          .mockReturnValue(
            {
              symbol:
                "AAPL",

              available:
                false,
            },
          );

        createMarketSnapshotMock
          .mockReturnValue(
            null,
          );

        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.analysisReady,
        ).toBe(false);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );
      },
    );

    it(
      "rejects MarketDataHub candle count below the required minimum",
      async () => {
        getMarketDataStatusMock
          .mockReturnValue(
            makeStatus({
              candleCount:
                100,
            }),
          );

        createMarketSnapshotMock
          .mockReturnValue(
            makeSnapshot({
              candleCount:
                100,
            }),
          );

        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",

            minimumBars:
              250,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.analysisReady,
        ).toBe(false);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );
      },
    );

    it(
      "allows historical analysis when enough candles exist but no quote exists",
      async () => {
        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_READY",
        );

        expect(
          result.analysisReady,
        ).toBe(true);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.market
            .hasQuote,
        ).toBe(false);

        expect(
          result.market
            .quoteFresh,
        ).toBe(false);
      },
    );

    it(
      "keeps stale quotes analysis-only",
      async () => {
        getMarketDataStatusMock
          .mockReturnValue(
            makeStatus({
              hasQuote:
                true,

              quoteFresh:
                false,
            }),
          );

        createMarketSnapshotMock
          .mockReturnValue(
            makeSnapshot({
              hasQuote:
                true,
            }),
          );

        isQuoteFreshMock
          .mockReturnValue(
            false,
          );

        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_READY",
        );

        expect(
          result.analysisReady,
        ).toBe(true);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.market
            .hasQuote,
        ).toBe(true);

        expect(
          result.market
            .quoteFresh,
        ).toBe(false);
      },
    );

    it(
      "reports READY when sufficient history and a fresh quote exist",
      async () => {
        getMarketDataStatusMock
          .mockReturnValue(
            makeStatus({
              hasQuote:
                true,

              quoteFresh:
                true,
            }),
          );

        createMarketSnapshotMock
          .mockReturnValue(
            makeSnapshot({
              hasQuote:
                true,
            }),
          );

        isQuoteFreshMock
          .mockReturnValue(
            true,
          );

        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "READY",
        );

        expect(
          result.analysisReady,
        ).toBe(true);

        /**
         * Bootstrap NEVER grants execution.
         */
        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.market
            .quoteFresh,
        ).toBe(true);
      },
    );

    it(
      "never sets executionReady true under any successful bootstrap state",
      async () => {
        getMarketDataStatusMock
          .mockReturnValue(
            makeStatus({
              hasQuote:
                true,

              quoteFresh:
                true,
            }),
          );

        createMarketSnapshotMock
          .mockReturnValue(
            makeSnapshot({
              hasQuote:
                true,
            }),
          );

        isQuoteFreshMock
          .mockReturnValue(
            true,
          );

        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.analysisReady,
        ).toBe(true);

        expect(
          result.executionReady,
        ).toBe(false);
      },
    );

    it(
      "preserves historical provider diagnostics",
      async () => {
        const result =
          await bootstrapStockMarketData({
            symbol:
              "AAPL",
          });

        expect(
          result.historical
            .provider,
        ).toBe(
          "ALPACA",
        );

        expect(
          result.historical
            .barCount,
        ).toBe(
          250,
        );

        expect(
          result.historical
            .loadedIntoHub,
        ).toBe(true);

        expect(
          result.historical
            .readyForEngines,
        ).toBe(true);
      },
    );
  },
);