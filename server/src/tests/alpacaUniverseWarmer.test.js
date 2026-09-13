import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  loadHistoricalBarsBatchIntoHubMock,
  getMarketCandlesMock,
} = vi.hoisted(() => ({
  loadHistoricalBarsBatchIntoHubMock:
    vi.fn(),

  getMarketCandlesMock:
    vi.fn(),
}));

vi.mock(
  "../data/providers/alpacaHistoricalDataService.js",
  () => ({
    ALPACA_FEED: {
      IEX: "iex",
      SIP: "sip",
    },

    ALPACA_TIMEFRAME: {
      FIVE_MINUTES:
        "5Min",
    },

    loadHistoricalBarsBatchIntoHub:
      loadHistoricalBarsBatchIntoHubMock,
  }),
);

vi.mock(
  "../data/marketDataHub.js",
  () => ({
    getMarketCandles:
      getMarketCandlesMock,
  }),
);

import {
  warmAlpacaUniverseBatch,
} from "../scanner/alpacaUniverseWarmer.js";

function asset(
  symbol,
  overrides = {},
) {
  return {
    symbol,
    tradable: true,
    shortable: true,
    ...overrides,
  };
}

function candles(
  count,
  {
    end =
      "2026-08-29T20:00:00.000Z",
  } = {},
) {
  const endMs =
    new Date(end)
      .getTime();

  return Array.from(
    {
      length:
        count,
    },
    (
      _,
      index,
    ) => ({
      timestamp:
        new Date(
          endMs -
          (
            count -
            index -
            1
          ) *
            5 *
            60 *
            1000,
        )
          .toISOString(),

      open: 100,
      high: 101,
      low: 99,
      close: 100,
      volume: 1_000_000,
    }),
  );
}

function batchSuccess({
  symbols,
  barCount = 100,
} = {}) {
  const normalized =
    symbols.map(
      symbol =>
        String(symbol)
          .trim()
          .toUpperCase(),
    );

  return {
    approved: true,
    provider: "ALPACA",
    mode: "BATCH",
    symbols:
      normalized,

    pageCount: 1,

    barCountBySymbol:
      Object.fromEntries(
        normalized.map(
          symbol => [
            symbol,
            barCount,
          ],
        ),
      ),

    loadedSymbols:
      [...normalized],

    failedSymbols:
      [],

    hubResults:
      Object.fromEntries(
        normalized.map(
          symbol => [
            symbol,
            {
              approved: true,
              warnings: [],
              errors: [],
            },
          ],
        ),
      ),

    warnings: [],
    errors: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  getMarketCandlesMock
    .mockReturnValue([]);
});

describe(
  "Alpaca Universe Warmer — Empty Input",
  () => {
    it(
      "returns safe empty result when no assets are supplied",
      async () => {
        const result =
          await warmAlpacaUniverseBatch({
            assets: [],
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.symbolsRequested,
        ).toBe(0);

        expect(
          result.results,
        ).toEqual([]);

        expect(
          loadHistoricalBarsBatchIntoHubMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

describe(
  "Alpaca Universe Warmer — Batch Contract",
  () => {
    it(
      "normalizes symbols and removes duplicates",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            symbol =>
              loaded &&
              ["NVDA", "AMD"]
                .includes(symbol)
                ? candles(100)
                : [],
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async ({
              symbols,
            }) => {
              loaded = true;

              return batchSuccess({
                symbols,
              });
            },
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("nvda"),
              asset("NVDA"),
              asset(" amd "),
            ],

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.symbolsRequested,
        ).toBe(2);

        expect(
          result.warmedSymbols,
        ).toEqual([
          "NVDA",
          "AMD",
        ]);

        expect(
          loadHistoricalBarsBatchIntoHubMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          loadHistoricalBarsBatchIntoHubMock
            .mock.calls[0][0]
            .symbols,
        ).toEqual([
          "NVDA",
          "AMD",
        ]);
      },
    );

    it(
      "supports symbols-only input",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            symbol =>
              loaded &&
              ["AAPL", "MSFT"]
                .includes(symbol)
                ? candles(100)
                : [],
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async ({
              symbols,
            }) => {
              loaded = true;

              return batchSuccess({
                symbols,
              });
            },
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets: [],

            symbols: [
              "AAPL",
              "MSFT",
            ],

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.warmedSymbols,
        ).toEqual([
          "AAPL",
          "MSFT",
        ]);

        expect(
          loadHistoricalBarsBatchIntoHubMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "uses one provider invocation for many missing symbols",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            () =>
              loaded
                ? candles(100)
                : [],
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async ({
              symbols,
            }) => {
              loaded = true;

              return batchSuccess({
                symbols,
              });
            },
          );

        const assets =
          Array.from(
            {
              length: 12,
            },
            (
              _,
              index,
            ) =>
              asset(
                `SYM${index}`,
              ),
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets,

            symbolConcurrency:
              3,

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.providerFetchCount,
        ).toBe(1);

        expect(
          loadHistoricalBarsBatchIntoHubMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          loadHistoricalBarsBatchIntoHubMock
            .mock.calls[0][0]
            .symbols,
        ).toHaveLength(12);
      },
    );
  },
);

describe(
  "Alpaca Universe Warmer — Cache First",
  () => {
    it(
      "does not call Alpaca when MarketDataHub already has sufficient history",
      async () => {
        getMarketCandlesMock
          .mockReturnValue(
            candles(250),
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("AAPL"),
              asset("NVDA"),
            ],

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.reusedSymbols,
        ).toEqual([
          "AAPL",
          "NVDA",
        ]);

        expect(
          result.providerFetchCount,
        ).toBe(0);

        expect(
          loadHistoricalBarsBatchIntoHubMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "requests only symbols that need provider history",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            symbol => {
              if (
                symbol === "AAPL"
              ) {
                return candles(250);
              }

              if (
                symbol === "NVDA" &&
                loaded
              ) {
                return candles(100);
              }

              return [];
            },
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async ({
              symbols,
            }) => {
              loaded = true;

              return batchSuccess({
                symbols,
              });
            },
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("AAPL"),
              asset("NVDA"),
            ],

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          loadHistoricalBarsBatchIntoHubMock
            .mock.calls[0][0]
            .symbols,
        ).toEqual([
          "NVDA",
        ]);

        expect(
          result.symbolsReadyForScanner,
        ).toBe(2);
      },
    );
  },
);

describe(
  "Alpaca Universe Warmer — Scanner Readiness",
  () => {
    it(
      "can load a symbol while leaving it not ready below 50 bars",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            () =>
              loaded
                ? candles(30)
                : [],
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async ({
              symbols,
            }) => {
              loaded = true;

              return batchSuccess({
                symbols,
                barCount: 30,
              });
            },
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("AAPL"),
            ],

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.symbolsWarmed,
        ).toBe(1);

        expect(
          result.symbolsReadyForScanner,
        ).toBe(0);

        expect(
          result.readySymbols,
        ).toEqual([]);

        expect(
          result.warmedSymbols,
        ).toEqual([
          "AAPL",
        ]);
      },
    );
  },
);

describe(
  "Alpaca Universe Warmer — Failure Isolation",
  () => {
    it(
      "preserves successful symbols when one symbol fails",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            symbol =>
              loaded &&
              ["AAPL", "NVDA"]
                .includes(symbol)
                ? candles(100)
                : [],
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async () => {
              loaded = true;

              return {
                approved: true,
                provider: "ALPACA",
                pageCount: 1,

                barCountBySymbol: {
                  AAPL: 100,
                  BAD: 0,
                  NVDA: 100,
                },

                loadedSymbols: [
                  "AAPL",
                  "NVDA",
                ],

                failedSymbols: [
                  "BAD",
                ],

                hubResults: {
                  AAPL: {
                    approved: true,
                    errors: [],
                    warnings: [],
                  },

                  BAD: {
                    approved: false,
                    errors: [
                      "Synthetic Alpaca failure",
                    ],
                    warnings: [],
                  },

                  NVDA: {
                    approved: true,
                    errors: [],
                    warnings: [],
                  },
                },

                warnings: [],
                errors: [],
              };
            },
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("AAPL"),
              asset("BAD"),
              asset("NVDA"),
            ],

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.warmedSymbols,
        ).toEqual([
          "AAPL",
          "NVDA",
        ]);

        expect(
          result.failedSymbols,
        ).toEqual([
          "BAD",
        ]);

        expect(
          result.errors.some(
            error =>
              error.includes(
                "Synthetic Alpaca failure",
              ),
          ),
        ).toBe(true);
      },
    );

    it(
      "fails closed when every symbol is unusable",
      async () => {
        loadHistoricalBarsBatchIntoHubMock
          .mockResolvedValue({
            approved: false,
            provider: "ALPACA",
            pageCount: 1,

            barCountBySymbol: {
              AAA: 0,
              BBB: 0,
            },

            loadedSymbols: [],

            failedSymbols: [
              "AAA",
              "BBB",
            ],

            hubResults: {},

            warnings: [],

            errors: [
              "Synthetic batch failure",
            ],
          });

        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("AAA"),
              asset("BBB"),
            ],

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.symbolsReadyForScanner,
        ).toBe(0);

        expect(
          result.failedSymbols,
        ).toEqual([
          "AAA",
          "BBB",
        ]);
      },
    );
  },
);

describe(
  "Alpaca Universe Warmer — Provider Forwarding",
  () => {
    it(
      "forwards timeframe, feed, window, page size and scaled global bar cap",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            () =>
              loaded
                ? candles(100)
                : [],
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async ({
              symbols,
            }) => {
              loaded = true;

              return batchSuccess({
                symbols,
              });
            },
          );

        await warmAlpacaUniverseBatch({
          assets: [
            asset("NVDA"),
          ],

          timeframe:
            "5Min",

          feed:
            "iex",

          lookbackDays:
            7,

          pageSize:
            5000,

          maximumBarsPerSymbol:
            1500,

          endTimestamp:
            "2026-08-29T20:00:00.000Z",
        });

        const call =
          loadHistoricalBarsBatchIntoHubMock
            .mock.calls[0][0];

        expect(
          call.symbols,
        ).toEqual([
          "NVDA",
        ]);

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
          call.pageSize,
        ).toBe(
          5000,
        );

        expect(
          call.maximumBars,
        ).toBe(
          1500,
        );

        expect(
          call.end,
        ).toBe(
          "2026-08-29T20:00:00.000Z",
        );

        expect(
          call.start,
        ).toBe(
          "2026-08-22T20:00:00.000Z",
        );
      },
    );
  },
);

describe(
  "Alpaca Universe Warmer — Historical Window",
  () => {
    it(
      "fails safely when endTimestamp is invalid",
      async () => {
        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("AAPL"),
            ],

            endTimestamp:
              "NOT-A-DATE",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.failedSymbols,
        ).toEqual([
          "AAPL",
        ]);

        expect(
          result.errors.length,
        ).toBeGreaterThan(0);

        expect(
          loadHistoricalBarsBatchIntoHubMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

describe(
  "Alpaca Universe Warmer — Batch Metadata",
  () => {
    it(
      "preserves the caller batch index",
      async () => {
        let loaded =
          false;

        getMarketCandlesMock
          .mockImplementation(
            () =>
              loaded
                ? candles(100)
                : [],
          );

        loadHistoricalBarsBatchIntoHubMock
          .mockImplementation(
            async ({
              symbols,
            }) => {
              loaded = true;

              return batchSuccess({
                symbols,
              });
            },
          );

        const result =
          await warmAlpacaUniverseBatch({
            assets: [
              asset("AAPL"),
            ],

            batchIndex:
              7,

            endTimestamp:
              "2026-08-29T20:00:00.000Z",
          });

        expect(
          result.batchIndex,
        ).toBe(7);
      },
    );
  },
);
