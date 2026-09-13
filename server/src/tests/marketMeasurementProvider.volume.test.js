import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  createMarketSnapshotMock,
} = vi.hoisted(() => ({
  createMarketSnapshotMock: vi.fn(),
}));

vi.mock(
  "../data/marketDataHub.js",
  () => ({
    createMarketSnapshot: createMarketSnapshotMock,
  }),
);

import {
  buildMarketMeasurement,
} from "../scanner/marketMeasurementProvider.js";

function candles(count = 500) {
  const start = Date.parse("2026-09-10T13:30:00.000Z");

  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.01;
    return {
      timestamp: new Date(start + index * 60_000).toISOString(),
      open: close - 0.02,
      high: close + 0.05,
      low: close - 0.05,
      close,
      volume: index >= count - 15 ? 20_000 : 10_000,
    };
  });
}

describe("Market Measurement Provider — multi-horizon volume", () => {
  beforeEach(() => {
    createMarketSnapshotMock.mockReset();
    createMarketSnapshotMock.mockReturnValue({
      candles: candles(),
      latestQuote: {
        midpoint: 105,
        bid: 104.99,
        ask: 105.01,
        spreadPercent: 0.0001905,
      },
      latestBar: {
        timestamp: "2026-09-10T21:49:00.000Z",
      },
      quoteFresh: true,
    });
  });

  it("derives 1m, 5m, 15m, 30m and 60m from the same candles", () => {
    const result = buildMarketMeasurement({
      asset: {
        symbol: "AAPL",
        tradable: true,
        shortable: true,
      },
    });

    expect(result).toBeTruthy();
    expect(result.sourceTimeframe).toBe("1Min");
    expect(result.volume1m).toBe(20_000);
    expect(result.volume5m).toBe(100_000);
    expect(result.volume15m).toBe(300_000);
    expect(result.volume30m).toBeGreaterThan(result.volume15m);
    expect(result.volume60m).toBeGreaterThan(result.volume30m);
  });

  it("keeps the legacy relativeVolume field while exposing horizon RVOL", () => {
    const result = buildMarketMeasurement({
      asset: { symbol: "NVDA" },
    });

    expect(result.relativeVolume).toBe(
      result.relativeVolume15m,
    );
    expect(result.relativeVolume1m).not.toBeNull();
    expect(result.relativeVolume5m).not.toBeNull();
    expect(result.relativeVolume60m).not.toBeNull();
  });

  it("classifies elevated rising price/volume as buying pressure", () => {
    const result = buildMarketMeasurement({
      asset: { symbol: "MSFT" },
    });

    expect([
      "BUYING",
      "NORMAL",
    ]).toContain(result.volumePressure);

    expect(result.change60mPercent).not.toBeNull();
    expect(result.volumeAcceleration15m).not.toBeNull();
  });
});
