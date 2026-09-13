import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  axiosGetMock,
  axiosCreateMock,
  ingestHistoricalBarsMock,
} = vi.hoisted(() => {
  const axiosGetMock = vi.fn();

  const axiosCreateMock = vi.fn(() => ({
    get: axiosGetMock,
  }));

  const ingestHistoricalBarsMock =
    vi.fn();

  return {
    axiosGetMock,
    axiosCreateMock,
    ingestHistoricalBarsMock,
  };
});

vi.mock(
  "axios",
  () => ({
    default: {
      create:
        axiosCreateMock,
    },
  }),
);

vi.mock(
  "../marketDataHub.js",
  () => ({
    ingestHistoricalBars:
      ingestHistoricalBarsMock,
  }),
);

import {
  ALPACA_FEED,
  ALPACA_TIMEFRAME,
  getHistoricalBars,
  loadHistoricalBarsIntoHub,
} from "./alpacaHistoricalDataService.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function rawBar({
  timestamp,
  open = 100,
  high = 102,
  low = 99,
  close = 101,
  volume = 1_000,
  tradeCount = 100,
  vwap = 100.5,
} = {}) {
  return {
    t: timestamp,
    o: open,
    h: high,
    l: low,
    c: close,
    v: volume,
    n: tradeCount,
    vw: vwap,
  };
}

function successfulPage({
  bars = [],
  nextPageToken = null,
} = {}) {
  return {
    data: {
      bars,
      next_page_token:
        nextPageToken,
    },
  };
}

const START =
  "2026-08-28T13:30:00.000Z";

const END =
  "2026-08-28T20:00:00.000Z";

/**
 * ============================================================
 * RESET
 * ============================================================
 */

beforeEach(() => {
  vi.clearAllMocks();

  process.env.ALPACA_API_KEY =
    "test-key";

  process.env.ALPACA_SECRET_KEY =
    "test-secret";

  ingestHistoricalBarsMock
    .mockResolvedValue({
      approved: true,
      errors: [],
      warnings: [],
    });
});

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

describe(
  "Alpaca Historical Data Service — Validation",
  () => {
    it(
      "fails closed when symbol is missing",
      async () => {
        const result =
          await getHistoricalBars({
            symbol: "",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.errors,
        ).toContain(
          "Symbol is required.",
        );

        expect(
          axiosCreateMock,
        ).not.toHaveBeenCalled();

        expect(
          axiosGetMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed for an unsupported timeframe",
      async () => {
        const result =
          await getHistoricalBars({
            symbol: "AAPL",
            timeframe:
              "NOT_A_TIMEFRAME",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.errors.some(
            message =>
              message.includes(
                "Unsupported timeframe",
              ),
          ),
        ).toBe(true);

        expect(
          axiosGetMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when start is not earlier than end",
      async () => {
        const result =
          await getHistoricalBars({
            symbol: "AAPL",
            start: END,
            end: START,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.errors,
        ).toContain(
          "Start date must be earlier than end date.",
        );

        expect(
          axiosGetMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/**
 * ============================================================
 * SUCCESSFUL FETCH
 * ============================================================
 */

describe(
  "Alpaca Historical Data Service — Fetch",
  () => {
    it(
      "downloads and normalizes historical bars",
      async () => {
        axiosGetMock
          .mockResolvedValue(
            successfulPage({
              bars: [
                rawBar({
                  timestamp:
                    "2026-08-28T13:35:00.000Z",
                }),
                rawBar({
                  timestamp:
                    "2026-08-28T13:30:00.000Z",
                  close: 100,
                }),
              ],
            }),
          );

        const result =
          await getHistoricalBars({
            symbol: "aapl",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.symbol,
        ).toBe("AAPL");

        expect(
          result.barCount,
        ).toBe(2);

        expect(
          result.bars[0]
            .timestamp,
        ).toBe(
          "2026-08-28T13:30:00.000Z",
        );

        expect(
          result.bars[1]
            .timestamp,
        ).toBe(
          "2026-08-28T13:35:00.000Z",
        );

        expect(
          result.bars.every(
            bar =>
              bar.source ===
              "ALPACA",
          ),
        ).toBe(true);
      },
    );

    it(
      "follows Alpaca pagination until next_page_token is absent",
      async () => {
        axiosGetMock
          .mockResolvedValueOnce(
            successfulPage({
              bars: [
                rawBar({
                  timestamp:
                    "2026-08-28T13:30:00.000Z",
                }),
              ],

              nextPageToken:
                "PAGE_2",
            }),
          )
          .mockResolvedValueOnce(
            successfulPage({
              bars: [
                rawBar({
                  timestamp:
                    "2026-08-28T13:35:00.000Z",
                }),
              ],
            }),
          );

        const result =
          await getHistoricalBars({
            symbol: "NVDA",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.pageCount,
        ).toBe(2);

        expect(
          result.barCount,
        ).toBe(2);

        expect(
          axiosGetMock,
        ).toHaveBeenCalledTimes(2);

        expect(
          axiosGetMock
            .mock
            .calls[1][1]
            .params
            .page_token,
        ).toBe(
          "PAGE_2",
        );
      },
    );

    it(
      "removes duplicate timestamps",
      async () => {
        axiosGetMock
          .mockResolvedValue(
            successfulPage({
              bars: [
                rawBar({
                  timestamp:
                    "2026-08-28T13:30:00.000Z",
                  close: 100,
                }),
                rawBar({
                  timestamp:
                    "2026-08-28T13:30:00.000Z",
                  close: 101,
                }),
              ],
            }),
          );

        const result =
          await getHistoricalBars({
            symbol: "AMD",
            start: START,
            end: END,
          });

        expect(
          result.barCount,
        ).toBe(1);
      },
    );

    it(
      "enforces maximumBars safety limit",
      async () => {
        axiosGetMock
          .mockResolvedValue(
            successfulPage({
              bars: [
                rawBar({
                  timestamp:
                    "2026-08-28T13:30:00.000Z",
                }),
                rawBar({
                  timestamp:
                    "2026-08-28T13:35:00.000Z",
                }),
                rawBar({
                  timestamp:
                    "2026-08-28T13:40:00.000Z",
                }),
              ],
            }),
          );

        const result =
          await getHistoricalBars({
            symbol: "MSFT",
            start: START,
            end: END,
            maximumBars: 2,
          });

        expect(
          result.barCount,
        ).toBe(2);

        expect(
          result.warnings.some(
            warning =>
              warning.includes(
                "2-bar safety limit",
              ),
          ),
        ).toBe(true);
      },
    );

    it(
      "returns approved empty evidence honestly when Alpaca returns no bars",
      async () => {
        axiosGetMock
          .mockResolvedValue(
            successfulPage({
              bars: [],
            }),
          );

        const result =
          await getHistoricalBars({
            symbol: "EMPTY",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.barCount,
        ).toBe(0);

        expect(
          result.bars,
        ).toEqual([]);

        expect(
          result.warnings.some(
            warning =>
              warning.includes(
                "no historical bars",
              ),
          ),
        ).toBe(true);
      },
    );
  },
);

/**
 * ============================================================
 * RATE LIMIT / HTTP FAILURE CONTRACT
 * ============================================================
 */

describe(
  "Alpaca Historical Data Service — HTTP Failure Contract",
  () => {
    it(
      "preserves HTTP 429 and Retry-After for the warmer",
      async () => {
        axiosGetMock
          .mockRejectedValue({
            response: {
              status: 429,

              headers: {
                "retry-after":
                  "3",
              },

              data: {
                message:
                  "too many requests",
              },
            },
          });

        const result =
          await getHistoricalBars({
            symbol: "SPY",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.httpStatus,
        ).toBe(429);

        expect(
          result.retryAfter,
        ).toBe("3");

        expect(
          result.errors,
        ).toContain(
          "too many requests",
        );

        expect(
          result.barCount,
        ).toBe(0);
      },
    );

    it(
      "preserves non-429 HTTP failures",
      async () => {
        axiosGetMock
          .mockRejectedValue({
            response: {
              status: 500,

              headers: {},

              data: {
                message:
                  "synthetic server failure",
              },
            },
          });

        const result =
          await getHistoricalBars({
            symbol: "AAPL",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.httpStatus,
        ).toBe(500);

        expect(
          result.retryAfter,
        ).toBeNull();

        expect(
          result.errors,
        ).toContain(
          "synthetic server failure",
        );
      },
    );

    it(
      "handles a thrown network error without an HTTP response",
      async () => {
        axiosGetMock
          .mockRejectedValue(
            new Error(
              "Synthetic network failure",
            ),
          );

        const result =
          await getHistoricalBars({
            symbol: "TSLA",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.httpStatus,
        ).toBeNull();

        expect(
          result.retryAfter,
        ).toBeNull();

        expect(
          result.errors,
        ).toContain(
          "Synthetic network failure",
        );
      },
    );
  },
);

/**
 * ============================================================
 * MARKET DATA HUB INTEGRATION CONTRACT
 * ============================================================
 */

describe(
  "Alpaca Historical Data Service — MarketDataHub",
  () => {
    it(
      "loads successful historical bars into MarketDataHub",
      async () => {
        axiosGetMock
          .mockResolvedValue(
            successfulPage({
              bars: [
                rawBar({
                  timestamp:
                    "2026-08-28T13:30:00.000Z",
                }),
                rawBar({
                  timestamp:
                    "2026-08-28T13:35:00.000Z",
                }),
              ],
            }),
          );

        ingestHistoricalBarsMock
          .mockResolvedValue({
            approved: true,
            errors: [],
          });

        const result =
          await loadHistoricalBarsIntoHub({
            symbol: "NVDA",
            start: START,
            end: END,
            timeframe:
              ALPACA_TIMEFRAME
                .FIVE_MINUTES,
            feed:
              ALPACA_FEED.IEX,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.loadedIntoHub,
        ).toBe(true);

        expect(
          ingestHistoricalBarsMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          ingestHistoricalBarsMock,
        ).toHaveBeenCalledWith({
          symbol: "NVDA",

          bars:
            expect.arrayContaining([
              expect.objectContaining({
                symbol: "NVDA",
                source: "ALPACA",
              }),
            ]),

          source:
            "ALPACA",
        });
      },
    );

    it(
      "does not call MarketDataHub when the Alpaca fetch fails",
      async () => {
        axiosGetMock
          .mockRejectedValue({
            response: {
              status: 429,

              headers: {
                "retry-after":
                  "2",
              },

              data: {
                message:
                  "too many requests",
              },
            },
          });

        const result =
          await loadHistoricalBarsIntoHub({
            symbol: "SPY",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.loadedIntoHub,
        ).toBe(false);

        expect(
          result.httpStatus,
        ).toBe(429);

        expect(
          result.retryAfter,
        ).toBe("2");

        expect(
          ingestHistoricalBarsMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when MarketDataHub rejects downloaded bars",
      async () => {
        axiosGetMock
          .mockResolvedValue(
            successfulPage({
              bars: [
                rawBar({
                  timestamp:
                    "2026-08-28T13:30:00.000Z",
                }),
              ],
            }),
          );

        ingestHistoricalBarsMock
          .mockResolvedValue({
            approved: false,

            errors: [
              "Synthetic hub rejection",
            ],
          });

        const result =
          await loadHistoricalBarsIntoHub({
            symbol: "AMD",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.loadedIntoHub,
        ).toBe(false);

        expect(
          result.errors,
        ).toContain(
          "Synthetic hub rejection",
        );
      },
    );
  },
);

/**
 * ============================================================
 * AUTHENTICATION FAILURE
 * ============================================================
 */

describe(
  "Alpaca Historical Data Service — Credentials",
  () => {
    it(
      "fails safely when Alpaca credentials are missing",
      async () => {
        delete process.env
          .ALPACA_API_KEY;

        delete process.env
          .ALPACA_SECRET_KEY;

        const result =
          await getHistoricalBars({
            symbol: "AAPL",
            start: START,
            end: END,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.httpStatus,
        ).toBeNull();

        expect(
          result.errors.some(
            message =>
              message.includes(
                "ALPACA_API_KEY",
              ),
          ),
        ).toBe(true);
      },
    );
  },
);
