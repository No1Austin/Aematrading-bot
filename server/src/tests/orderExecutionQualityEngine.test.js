// server/src/tests/orderExecutionQualityEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import evaluateOrderExecutionQuality, {
  DEFAULT_ORDER_EXECUTION_QUALITY_CONFIG,
} from "../execution/orderExecutionQualityEngine.js";

const NOW = Date.parse("2026-08-23T14:30:00.000Z");

const trade = (overrides = {}) => ({
  symbol: "AAPL",
  side: "LONG",
  shares: 100,
  entryPrice: 200,
  ...overrides,
});

const execution = (overrides = {}) => ({
  bid: 199.95,
  ask: 200.05,
  lastPrice: 200,
  orderType: "LIMIT",
  intendedPrice: 200.05,
  estimatedFillPrice: 200.05,
  quoteTimestamp: NOW - 500,
  ...overrides,
});

describe("Order Execution Quality Engine — Approval", () => {
  test("approves healthy execution conditions", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution(),
      now: NOW,
    });

    expect(result.status).toBe("APPROVED");
    expect(result.canExecute).toBe(true);
    expect(result.approvedShares).toBe(100);
  });
});

describe("Order Execution Quality Engine — Quote Freshness", () => {
  test("reduces exposure for aging quote", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        quoteTimestamp: NOW - 3000,
      }),
      now: NOW,
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBe(75);
  });

  test("blocks stale quote", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        quoteTimestamp: NOW - 6000,
      }),
      now: NOW,
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.canExecute).toBe(false);
  });
});

describe("Order Execution Quality Engine — Spread", () => {
  test("reduces for elevated spread", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        bid: 199.75,
        ask: 200.25,
        intendedPrice: 200.25,
        estimatedFillPrice: 200.25,
      }),
      now: NOW,
    });

    expect(result.status).toBe("REDUCED");
  });

  test("uses severe sizing for wide spread", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        bid: 199.5,
        ask: 200.5,
        intendedPrice: 200.5,
        estimatedFillPrice: 200.5,
      }),
      now: NOW,
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBe(50);
  });

  test("blocks extreme spread", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        bid: 199,
        ask: 201,
        intendedPrice: 201,
        estimatedFillPrice: 201,
      }),
      now: NOW,
    });

    expect(result.status).toBe("BLOCKED");
  });
});

describe("Order Execution Quality Engine — Entry Deviation", () => {
  test("reduces when expected fill moves from approved entry", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        bid: 200.65,
        ask: 200.75,
        intendedPrice: 200.75,
        estimatedFillPrice: 200.75,
      }),
      now: NOW,
    });

    expect(result.status).toBe("REDUCED");
  });

  test("blocks when expected fill moves too far", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        bid: 202.5,
        ask: 202.6,
        intendedPrice: 202.6,
        estimatedFillPrice: 202.6,
      }),
      now: NOW,
    });

    expect(result.status).toBe("BLOCKED");
  });
});

describe("Order Execution Quality Engine — Slippage", () => {
  test("reduces for elevated estimated slippage", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        bid: 200.25,
        ask: 200.35,
        intendedPrice: 200,
        estimatedFillPrice: 200.35,
      }),
      now: NOW,
    });

    expect(result.status).toBe("REDUCED");
  });

  test("blocks extreme estimated slippage", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade({
        entryPrice: 202,
      }),
      execution: execution({
        bid: 201.55,
        ask: 201.65,
        intendedPrice: 200,
        estimatedFillPrice: 201.6,
      }),
      now: NOW,
    });

    expect(result.status).toBe("BLOCKED");
  });
});

describe("Order Execution Quality Engine — Market Orders", () => {
  test("can block market orders by configuration", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        orderType: "MARKET",
      }),
      now: NOW,
      config: {
        allowMarketOrders: false,
      },
    });

    expect(result.status).toBe("BLOCKED");
  });

  test("approved market order carries warning", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        orderType: "MARKET",
      }),
      now: NOW,
    });

    expect(result.canExecute).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("Order Execution Quality Engine — Missing Data", () => {
  test("missing bid/ask is not treated as healthy", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: {
        orderType: "LIMIT",
        intendedPrice: 200,
        estimatedFillPrice: 200,
        quoteTimestamp: NOW - 500,
      },
      now: NOW,
    });

    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.canExecute).toBe(false);
  });

  test("missing quote timestamp is not treated as fresh", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        quoteTimestamp: null,
      }),
      now: NOW,
    });

    expect(result.status).toBe("INSUFFICIENT_DATA");
  });
});

describe("Order Execution Quality Engine — Safety", () => {
  test("never increases shares", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade({
        shares: 37,
      }),
      execution: execution({
        quoteTimestamp: NOW - 3000,
      }),
      now: NOW,
    });

    expect(result.approvedShares).toBeLessThanOrEqual(37);
  });

  test("applies same protection to SHORT trades", () => {
    const longResult = evaluateOrderExecutionQuality({
      proposedTrade: trade({
        side: "LONG",
      }),
      execution: execution({
        quoteTimestamp: NOW - 3000,
      }),
      now: NOW,
    });

    const shortResult = evaluateOrderExecutionQuality({
      proposedTrade: trade({
        side: "SHORT",
      }),
      execution: execution({
        quoteTimestamp: NOW - 3000,
      }),
      now: NOW,
    });

    expect(shortResult.status).toBe(longResult.status);
    expect(shortResult.approvedShares).toBe(
      longResult.approvedShares,
    );
  });

  test("blocks when required reduction is below minimum exposure", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        quoteTimestamp: NOW - 3000,
      }),
      now: NOW,
      config: {
        moderateMultiplier: 0.1,
        minimumExposureMultiplier: 0.2,
      },
    });

    expect(result.status).toBe("BLOCKED");
  });

  test("rejects crossed bid/ask quote", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade(),
      execution: execution({
        bid: 201,
        ask: 200,
      }),
      now: NOW,
    });

    expect(result.status).toBe("INVALID_INPUT");
  });
});

describe("Order Execution Quality Engine — Validation", () => {
  test("missing proposed trade safely blocks", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: null,
      execution: execution(),
      now: NOW,
    });

    expect(result.status).toBe("INVALID_INPUT");
  });

  test("invalid side safely blocks", () => {
    const result = evaluateOrderExecutionQuality({
      proposedTrade: trade({
        side: "SIDEWAYS",
      }),
      execution: execution(),
      now: NOW,
    });

    expect(result.status).toBe("INVALID_INPUT");
  });
});

describe("Order Execution Quality Engine — Configuration", () => {
  test("exports frozen default configuration", () => {
    expect(
      Object.isFrozen(
        DEFAULT_ORDER_EXECUTION_QUALITY_CONFIG,
      ),
    ).toBe(true);
  });
});

describe("Order Execution Quality Engine — Determinism", () => {
  test("same inputs produce same decision", () => {
    const input = {
      proposedTrade: trade(),
      execution: execution({
        quoteTimestamp: NOW - 3000,
      }),
      now: NOW,
    };

    expect(
      evaluateOrderExecutionQuality(input),
    ).toEqual(
      evaluateOrderExecutionQuality(input),
    );
  });
});
