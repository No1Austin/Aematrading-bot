import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock(
  "../data/providers/alpacaHistoricalDataService.js",
  () => ({
    ALPACA_FEED: { IEX: "iex" },
    ALPACA_TIMEFRAME: {
      ONE_MINUTE: "1Min",
      FIVE_MINUTES: "5Min",
    },
    loadHistoricalBarsBatchIntoHub: vi.fn(async () => ({
      approved: true,
      status: "COMPLETE",
      loadedSymbols: [],
      barCountBySymbol: {},
      hubResults: {},
    })),
  }),
);

vi.mock(
  "../data/marketDataHub.js",
  () => ({
    getMarketCandles: vi.fn(() => []),
  }),
);

import {
  loadHistoricalBarsBatchIntoHub,
} from "../data/providers/alpacaHistoricalDataService.js";

import {
  warmAlpacaUniverseBatch,
} from "../scanner/alpacaUniverseWarmer.js";

describe("Alpaca Universe Warmer — 1 minute batch contract", () => {
  it("uses one provider invocation for many symbols", async () => {
    await warmAlpacaUniverseBatch({
      symbols: ["AAPL", "MSFT", "NVDA"],
    });

    expect(loadHistoricalBarsBatchIntoHub).toHaveBeenCalledTimes(1);

    const call =
      loadHistoricalBarsBatchIntoHub.mock.calls[0][0];

    expect(call.symbols).toEqual(["AAPL", "MSFT", "NVDA"]);
    expect(call.timeframe).toBe("1Min");
  });

  it("still accepts an explicit timeframe override", async () => {
    await warmAlpacaUniverseBatch({
      symbols: ["AAPL"],
      timeframe: "5Min",
    });

    const call =
      loadHistoricalBarsBatchIntoHub.mock.calls.at(-1)[0];

    expect(call.timeframe).toBe("5Min");
  });
});
