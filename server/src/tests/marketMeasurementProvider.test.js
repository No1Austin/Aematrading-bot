import {
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  ingestHistoricalBars,
  ingestLiveQuote,
  resetMarketData,
} from "../data/marketDataHub.js";

import {
  buildMarketMeasurement,
  buildMarketMeasurements,
} from "../scanner/marketMeasurementProvider.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

const START_TIME =
  Date.parse(
    "2026-08-29T13:30:00.000Z",
  );

const FIVE_MINUTES_MS =
  5 * 60 * 1000;

function createBars({
  symbol = "NVDA",
  count = 100,
  startPrice = 100,
  priceStep = 0.2,
  baseVolume = 10_000,
  latestVolumeMultiplier = 1,
} = {}) {
  return Array.from(
    {
      length: count,
    },
    (_, index) => {
      const close =
        startPrice +
        index *
          priceStep;

      const volume =
        index ===
        count - 1
          ? baseVolume *
            latestVolumeMultiplier
          : baseVolume;

      return {
        symbol,

        timestamp:
          new Date(
            START_TIME +
              index *
                FIVE_MINUTES_MS,
          ).toISOString(),

        open:
          close - 0.1,

        high:
          close + 0.3,

        low:
          close - 0.3,

        close,

        volume,
      };
    },
  );
}

async function loadSymbol({
  symbol = "NVDA",
  bars,
  bid = null,
  ask = null,
} = {}) {
  await ingestHistoricalBars({
    symbol,

    bars,
    source: "TEST",
  });

  if (
    bid !== null &&
    ask !== null
  ) {
    await ingestLiveQuote({
      symbol,

      timestamp:
        new Date().toISOString(),

      bid,
      ask,

      source: "TEST",
    });
  }
}

/**
 * ============================================================
 * RESET
 * ============================================================
 */

beforeEach(() => {
  resetMarketData();
});

/**
 * ============================================================
 * BASIC CONTRACT
 * ============================================================
 */

describe(
  "Market Measurement Provider — Basic Contract",
  () => {
    it(
      "returns null when symbol is missing",
      () => {
        const result =
          buildMarketMeasurement({
            symbol: "",
          });

        expect(result).toBeNull();
      },
    );

    it(
      "returns null when no MarketDataHub state exists",
      () => {
        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(result).toBeNull();
      },
    );

    it(
      "returns null when candle history is insufficient",
      async () => {
        const bars =
          createBars({
            count: 20,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(result).toBeNull();
      },
    );
  },
);

/**
 * ============================================================
 * PRICE / QUOTE
 * ============================================================
 */

describe(
  "Market Measurement Provider — Price and Quote",
  () => {
    it(
      "uses latest candle close when no quote exists",
      async () => {
        const bars =
          createBars({
            count: 100,
            startPrice: 100,
            priceStep: 0.2,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.price,
        ).toBeCloseTo(
          bars[
            bars.length - 1
          ].close,
          6,
        );

        expect(
          result.bid,
        ).toBeNull();

        expect(
          result.ask,
        ).toBeNull();
      },
    );

    it(
      "prefers quote midpoint when a quote exists",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,

          bid: 120,
          ask: 122,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.price,
        ).toBe(121);

        expect(
          result.bid,
        ).toBe(120);

        expect(
          result.ask,
        ).toBe(122);

        expect(
          result.spreadPercent,
        ).toBeCloseTo(
          2 / 121,
          6,
        );
      },
    );
  },
);

/**
 * ============================================================
 * MOMENTUM
 * ============================================================
 */

describe(
  "Market Measurement Provider — Momentum",
  () => {
    it(
      "calculates positive 5m, 15m, and 60m momentum for rising prices",
      async () => {
        const bars =
          createBars({
            count: 100,
            startPrice: 100,
            priceStep: 0.5,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result
            .change5mPercent,
        ).toBeGreaterThan(0);

        expect(
          result
            .change15mPercent,
        ).toBeGreaterThan(0);

        expect(
          result
            .change60mPercent,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "calculates negative momentum for falling prices",
      async () => {
        const bars =
          createBars({
            count: 100,
            startPrice: 200,
            priceStep: -0.5,
          });

        await loadSymbol({
          symbol: "TSLA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "TSLA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result
            .change5mPercent,
        ).toBeLessThan(0);

        expect(
          result
            .change15mPercent,
        ).toBeLessThan(0);

        expect(
          result
            .change60mPercent,
        ).toBeLessThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * TREND
 * ============================================================
 */

describe(
  "Market Measurement Provider — Trend",
  () => {
    it(
      "produces EMA20 and EMA50 when enough history exists",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          Number.isFinite(
            result.ema20,
          ),
        ).toBe(true);

        expect(
          Number.isFinite(
            result.ema50,
          ),
        ).toBe(true);
      },
    );

    it(
      "produces bullish EMA structure for steadily rising prices",
      async () => {
        const bars =
          createBars({
            count: 100,
            priceStep: 0.5,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.ema20,
        ).toBeGreaterThan(
          result.ema50,
        );

        expect(
          result.price,
        ).toBeGreaterThan(
          result.ema20,
        );
      },
    );

    it(
      "produces bearish EMA structure for steadily falling prices",
      async () => {
        const bars =
          createBars({
            count: 100,
            startPrice: 200,
            priceStep: -0.5,
          });

        await loadSymbol({
          symbol: "TSLA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "TSLA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.ema20,
        ).toBeLessThan(
          result.ema50,
        );

        expect(
          result.price,
        ).toBeLessThan(
          result.ema20,
        );
      },
    );
  },
);

/**
 * ============================================================
 * VWAP
 * ============================================================
 */

describe(
  "Market Measurement Provider — VWAP",
  () => {
    it(
      "produces finite VWAP from price and volume",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          Number.isFinite(
            result.vwap,
          ),
        ).toBe(true);

        expect(
          result.vwap,
        ).toBeGreaterThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * VOLATILITY
 * ============================================================
 */

describe(
  "Market Measurement Provider — Volatility",
  () => {
    it(
      "calculates finite ATR percent",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          Number.isFinite(
            result.atrPercent,
          ),
        ).toBe(true);

        expect(
          result.atrPercent,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "calculates finite intraday range percent",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          Number.isFinite(
            result
              .intradayRangePercent,
          ),
        ).toBe(true);

        expect(
          result
            .intradayRangePercent,
        ).toBeGreaterThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * PRICE ACTION
 * ============================================================
 */

describe(
  "Market Measurement Provider — Recent Range",
  () => {
    it(
      "excludes current bar from recent breakout range",
      async () => {
        const bars =
          createBars({
            count: 100,
            startPrice: 100,
            priceStep: 0.1,
          });

        /**
         * Force latest candle to break above prior range.
         */
        const previous =
          bars[
            bars.length - 2
          ];

        bars[
          bars.length - 1
        ] = {
          ...bars[
            bars.length - 1
          ],

          open:
            previous.close,

          low:
            previous.close,

          close:
            previous.close + 5,

          high:
            previous.close + 5.5,
        };

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.price,
        ).toBeGreaterThan(
          result.recentHigh,
        );
      },
    );

    it(
      "detects price below recent low in a downside break",
      async () => {
        const bars =
          createBars({
            count: 100,
            startPrice: 200,
            priceStep: -0.1,
          });

        const previous =
          bars[
            bars.length - 2
          ];

        bars[
          bars.length - 1
        ] = {
          ...bars[
            bars.length - 1
          ],

          open:
            previous.close,

          high:
            previous.close,

          close:
            previous.close - 5,

          low:
            previous.close - 5.5,
        };

        await loadSymbol({
          symbol: "TSLA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "TSLA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.price,
        ).toBeLessThan(
          result.recentLow,
        );
      },
    );
  },
);

/**
 * ============================================================
 * RELATIVE VOLUME
 * ============================================================
 */

describe(
  "Market Measurement Provider — Relative Volume",
  () => {
    it(
      "produces relative volume near one when latest volume matches baseline",
      async () => {
        const bars =
          createBars({
            count: 100,
            baseVolume:
              10_000,

            latestVolumeMultiplier:
              1,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.relativeVolume,
        ).toBeCloseTo(
          1,
          2,
        );
      },
    );

    it(
      "detects abnormal latest-bar volume",
      async () => {
        const bars =
          createBars({
            count: 100,
            baseVolume:
              10_000,

            latestVolumeMultiplier:
              3,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.relativeVolume,
        ).toBeGreaterThan(
          2.5,
        );
      },
    );
  },
);

/**
 * ============================================================
 * LIQUIDITY ESTIMATES
 * ============================================================
 */

describe(
  "Market Measurement Provider — Liquidity",
  () => {
    it(
      "calculates positive average daily volume estimate",
      async () => {
        const bars =
          createBars({
            count: 156,
            baseVolume:
              20_000,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result
            .averageDailyVolume,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "calculates positive dollar volume",
      async () => {
        const bars =
          createBars({
            count: 156,
            baseVolume:
              20_000,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.dollarVolume,
        ).toBeGreaterThan(0);

        expect(
          result.dollarVolume,
        ).toBeCloseTo(
          result
            .averageDailyVolume *
            result.price,
          2,
        );
      },
    );
  },
);

/**
 * ============================================================
 * BROKER / ASSET METADATA
 * ============================================================
 */

describe(
  "Market Measurement Provider — Asset Metadata",
  () => {
    it(
      "preserves tradable and shortable metadata",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: false,

              borrowStatus:
                "unavailable",
            },
          });

        expect(
          result.tradable,
        ).toBe(true);

        expect(
          result.shortable,
        ).toBe(false);

        expect(
          result.borrowStatus,
        ).toBe(
          "unavailable",
        );
      },
    );
  },
);

/**
 * ============================================================
 * MARKET REGIME
 * ============================================================
 */

describe(
  "Market Measurement Provider — Market Regime",
  () => {
    it(
      "preserves shared market-regime context",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },

            marketRegime:
              "BULLISH",
          });

        expect(
          result.marketRegime,
        ).toBe("BULLISH");
      },
    );
  },
);

/**
 * ============================================================
 * BATCH CONTRACT
 * ============================================================
 */

describe(
  "Market Measurement Provider — Batch",
  () => {
    it(
      "builds measurements only for symbols with sufficient market state",
      async () => {
        const nvdaBars =
          createBars({
            symbol: "NVDA",
            count: 100,
          });

        const tslaBars =
          createBars({
            symbol: "TSLA",
            count: 20,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars: nvdaBars,
        });

        await loadSymbol({
          symbol: "TSLA",
          bars: tslaBars,
        });

        const results =
          buildMarketMeasurements({
            assets: [
              {
                symbol: "NVDA",
                tradable: true,
                shortable: true,
              },

              {
                symbol: "TSLA",
                tradable: true,
                shortable: true,
              },

              {
                symbol: "MISSING",
                tradable: true,
                shortable: true,
              },
            ],
          });

        expect(
          results,
        ).toHaveLength(1);

        expect(
          results[0].symbol,
        ).toBe("NVDA");
      },
    );
  },
);

/**
 * ============================================================
 * PROVENANCE
 * ============================================================
 */

describe(
  "Market Measurement Provider — Provenance",
  () => {
    it(
      "returns scanner provenance and market timestamp",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await loadSymbol({
          symbol: "NVDA",
          bars,
        });

        const result =
          buildMarketMeasurement({
            symbol: "NVDA",

            asset: {
              tradable: true,
              shortable: true,
            },
          });

        expect(
          result.source,
        ).toBe(
          "MARKET_MEASUREMENT_PROVIDER",
        );

        expect(
          result.asOfTimestamp,
        ).toBe(
          bars[
            bars.length - 1
          ].timestamp,
        );

        expect(
          result.candleCount,
        ).toBe(100);
      },
    );
  },
);