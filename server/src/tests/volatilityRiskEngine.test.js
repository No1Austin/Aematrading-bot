// server/src/tests/volatilityRiskEngine.test.js

import { describe, expect, test } from "vitest";
import evaluateVolatilityRisk from "../risk/volatilityRiskEngine.js";

const trade = (overrides = {}) => ({
  symbol: "AAPL",
  side: "LONG",
  shares: 100,
  entryPrice: 100,
  ...overrides,
});

const normal = (overrides = {}) => ({
  atr: 2,
  realizedVolatility: 0.22,
  baselineVolatility: 0.2,
  volatilityRegime: "NORMAL",
  shockActive: false,
  ...overrides,
});

describe("Volatility Risk Engine — Approval", () => {
  test("approves healthy volatility conditions", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: normal(),
    });

    expect(result.status).toBe("APPROVED");
    expect(result.canExecute).toBe(true);
    expect(result.approvedShares).toBe(100);
  });
});

describe("Volatility Risk Engine — ATR", () => {
  test("reduces exposure when ATR percent is elevated", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: normal({ atr: 3.5 }),
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBe(75);
  });

  test("applies severe reduction when ATR percent is high", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: normal({ atr: 6 }),
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBe(50);
  });

  test("blocks extreme ATR relative to price", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: normal({ atr: 8 }),
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.canExecute).toBe(false);
  });

  test("accepts explicit atrPercent", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade({ entryPrice: 200 }),
      volatility: normal({ atr: null, atrPercent: 4 }),
    });

    expect(result.metrics.atrPercent).toBe(4);
    expect(result.status).toBe("REDUCED");
  });
});

describe("Volatility Risk Engine — Realized Volatility", () => {
  test("reduces exposure when realized volatility is elevated", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: normal({
        realizedVolatility: 0.4,
        baselineVolatility: 0.35,
      }),
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBeLessThan(100);
  });

  test("blocks extreme realized volatility", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: normal({
        realizedVolatility: 0.95,
        baselineVolatility: 0.3,
      }),
    });

    expect(result.status).toBe("BLOCKED");
  });
});

describe("Volatility Risk Engine — Expansion", () => {
  test("reduces when current volatility expands versus baseline", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: {
        realizedVolatility: 0.32,
        baselineVolatility: 0.2,
        volatilityRegime: "NORMAL",
      },
    });

    expect(result.metrics.volatilityExpansionRatio).toBe(1.6);
    expect(result.status).toBe("REDUCED");
  });

  test("blocks extreme volatility expansion", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: {
        realizedVolatility: 0.6,
        baselineVolatility: 0.19,
        volatilityRegime: "NORMAL",
      },
    });

    expect(result.metrics.volatilityExpansionRatio).toBeGreaterThan(3);
    expect(result.status).toBe("BLOCKED");
  });
});

describe("Volatility Risk Engine — Regime", () => {
  test("reduces in high volatility regime", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: { volatilityRegime: "HIGH" },
    });

    expect(result.status).toBe("REDUCED");
    expect(result.approvedShares).toBe(50);
  });

  test("blocks extreme volatility regime", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: { volatilityRegime: "EXTREME" },
    });

    expect(result.status).toBe("BLOCKED");
  });

  test("blocks explicit market shock", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: { shockActive: true },
    });

    expect(result.status).toBe("BLOCKED");
  });
});

describe("Volatility Risk Engine — Missing Data", () => {
  test("missing volatility is not treated as zero volatility", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: {},
    });

    expect(result.status).toBe("INSUFFICIENT_DATA");
    expect(result.canExecute).toBe(false);
  });

  test("missing baseline does not fabricate expansion ratio", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: { realizedVolatility: 0.2 },
    });

    expect(result.metrics.volatilityExpansionRatio).toBeNull();
    expect(result.status).toBe("APPROVED");
  });
});

describe("Volatility Risk Engine — Safety", () => {
  test("never increases shares", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade({ shares: 37 }),
      volatility: normal({ atr: 3.5 }),
    });

    expect(result.approvedShares).toBeLessThanOrEqual(37);
  });

  test("applies the same protection to SHORT trades", () => {
    const longResult = evaluateVolatilityRisk({
      proposedTrade: trade({ side: "LONG" }),
      volatility: normal({ atr: 6 }),
    });

    const shortResult = evaluateVolatilityRisk({
      proposedTrade: trade({ side: "SHORT" }),
      volatility: normal({ atr: 6 }),
    });

    expect(shortResult.status).toBe(longResult.status);
    expect(shortResult.approvedShares).toBe(longResult.approvedShares);
  });

  test("blocks when required reduction is below minimum executable exposure", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade(),
      volatility: { volatilityRegime: "HIGH" },
      config: {
        severeMultiplier: 0.1,
        minimumExposureMultiplier: 0.2,
      },
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.approvedShares).toBe(0);
  });
});

describe("Volatility Risk Engine — Validation", () => {
  test("missing proposed trade safely blocks", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: null,
      volatility: normal(),
    });

    expect(result.status).toBe("INVALID_INPUT");
    expect(result.canExecute).toBe(false);
  });

  test("invalid side safely blocks", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade({ side: "SIDEWAYS" }),
      volatility: normal(),
    });

    expect(result.status).toBe("INVALID_INPUT");
  });

  test("zero shares safely blocks", () => {
    const result = evaluateVolatilityRisk({
      proposedTrade: trade({ shares: 0 }),
      volatility: normal(),
    });

    expect(result.status).toBe("INVALID_INPUT");
  });
});

describe("Volatility Risk Engine — Determinism", () => {
  test("same inputs produce same decision", () => {
    const input = {
      proposedTrade: trade(),
      volatility: normal({
        atr: 4,
        realizedVolatility: 0.4,
        baselineVolatility: 0.25,
      }),
    };

    expect(evaluateVolatilityRisk(input)).toEqual(
      evaluateVolatilityRisk(input),
    );
  });
});
