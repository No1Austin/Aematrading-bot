// server/src/tests/marketShockHaltEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import evaluateMarketShockHalt
  from "../risk/marketShockHaltEngine.js";

const trade = (overrides = {}) => ({
  symbol: "AAPL",
  side: "LONG",
  shares: 100,
  entryPrice: 200,
  ...overrides,
});

const healthyState = (overrides = {}) => ({
  marketStatus: "OPEN",
  exchangeStatus: "OPEN",
  tradingHalted: false,
  luldActive: false,
  circuitBreakerActive: false,
  priceMovePercent: 1,
  gapPercent: 1,
  currentVolume: 100000,
  averageComparableVolume: 100000,
  currentVolatility: 0.2,
  baselineVolatility: 0.2,
  newsShockActive: false,
  abnormalPrintsActive: false,
  ...overrides,
});

describe("Market Shock / Halt Engine — Approval", () => {
  test("approves healthy market structure", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade(),
      marketState: healthyState(),
    });

    expect(result.status).toBe("APPROVED");
    expect(result.canExecute).toBe(true);
    expect(result.approvedShares).toBe(100);
  });
});

describe("Market Shock / Halt Engine — Hard Halt", () => {
  test("blocks explicit trading halt", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          tradingHalted: true,
        }),
      }).status,
    ).toBe("BLOCKED");
  });

  test("blocks active LULD state", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          luldActive: true,
        }),
      }).status,
    ).toBe("BLOCKED");
  });

  test("blocks circuit breaker", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          circuitBreakerActive: true,
        }),
      }).status,
    ).toBe("BLOCKED");
  });

  test("blocks halted market status", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          marketStatus: "HALTED",
        }),
      }).status,
    ).toBe("BLOCKED");
  });
});

describe("Market Shock / Halt Engine — Price Shock", () => {
  test("reduces on elevated price move", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          priceMovePercent: 3.5,
        }),
      }).status,
    ).toBe("REDUCED");
  });

  test("uses severe sizing on larger price shock", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade(),
      marketState: healthyState({
        priceMovePercent: 6,
      }),
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBe(50);
  });

  test("blocks extreme price shock", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          priceMovePercent: 9,
        }),
      }).status,
    ).toBe("BLOCKED");
  });
});

describe("Market Shock / Halt Engine — Gap Risk", () => {
  test("reduces for elevated gap", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          gapPercent: 4,
        }),
      }).status,
    ).toBe("REDUCED");
  });

  test("blocks extreme gap", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          gapPercent: 11,
        }),
      }).status,
    ).toBe("BLOCKED");
  });
});

describe("Market Shock / Halt Engine — Volume Shock", () => {
  test("reduces on abnormal volume spike", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade(),
      marketState: healthyState({
        currentVolume: 300000,
        averageComparableVolume: 100000,
      }),
    });

    expect(result.metrics.volumeSpikeRatio).toBe(3);
    expect(result.status).toBe("REDUCED");
  });

  test("blocks extreme volume shock", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          currentVolume: 900000,
          averageComparableVolume: 100000,
        }),
      }).status,
    ).toBe("BLOCKED");
  });
});

describe("Market Shock / Halt Engine — Volatility Shock", () => {
  test("reduces when volatility expands sharply", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade(),
      marketState: healthyState({
        currentVolatility: 0.4,
        baselineVolatility: 0.2,
      }),
    });

    expect(
      result.metrics.volatilityShockRatio,
    ).toBe(2);

    expect(result.status).toBe("REDUCED");
  });

  test("blocks extreme volatility shock", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          currentVolatility: 1,
          baselineVolatility: 0.2,
        }),
      }).status,
    ).toBe("BLOCKED");
  });
});

describe("Market Shock / Halt Engine — Shock Flags", () => {
  test("uses defensive sizing for breaking-news shock", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade(),
      marketState: healthyState({
        newsShockActive: true,
      }),
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBe(50);
  });

  test("reduces for abnormal prints", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade(),
        marketState: healthyState({
          abnormalPrintsActive: true,
        }),
      }).status,
    ).toBe("REDUCED");
  });
});

describe("Market Shock / Halt Engine — Missing Data", () => {
  test("missing market status does not count as healthy", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade(),
      marketState: {
        priceMovePercent: 1,
      },
    });

    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.canExecute).toBe(false);
  });
});

describe("Market Shock / Halt Engine — Safety", () => {
  test("never increases shares", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade({
        shares: 37,
      }),
      marketState: healthyState({
        priceMovePercent: 4,
      }),
    });

    expect(
      result.approvedShares,
    ).toBeLessThanOrEqual(37);
  });

  test("applies same protection to SHORT trades", () => {
    const longResult = evaluateMarketShockHalt({
      proposedTrade: trade({
        side: "LONG",
      }),
      marketState: healthyState({
        priceMovePercent: 6,
      }),
    });

    const shortResult = evaluateMarketShockHalt({
      proposedTrade: trade({
        side: "SHORT",
      }),
      marketState: healthyState({
        priceMovePercent: 6,
      }),
    });

    expect(shortResult.status).toBe(longResult.status);
    expect(shortResult.approvedShares).toBe(
      longResult.approvedShares,
    );
  });

  test("blocks when required reduction is below minimum exposure", () => {
    const result = evaluateMarketShockHalt({
      proposedTrade: trade(),
      marketState: healthyState({
        priceMovePercent: 6,
      }),
      config: {
        severeMultiplier: 0.1,
        minimumExposureMultiplier: 0.2,
      },
    });

    expect(result.status).toBe("BLOCKED");
  });
});

describe("Market Shock / Halt Engine — Validation", () => {
  test("missing proposed trade safely blocks", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: null,
        marketState: healthyState(),
      }).status,
    ).toBe("INVALID_INPUT");
  });

  test("invalid side safely blocks", () => {
    expect(
      evaluateMarketShockHalt({
        proposedTrade: trade({
          side: "SIDEWAYS",
        }),
        marketState: healthyState(),
      }).status,
    ).toBe("INVALID_INPUT");
  });
});

describe("Market Shock / Halt Engine — Determinism", () => {
  test("same inputs produce same result", () => {
    const input = {
      proposedTrade: trade(),
      marketState: healthyState({
        priceMovePercent: 4,
        currentVolume: 300000,
      }),
    };

    expect(
      evaluateMarketShockHalt(input),
    ).toEqual(
      evaluateMarketShockHalt(input),
    );
  });
});
