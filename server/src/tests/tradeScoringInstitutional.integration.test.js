// server/src/tests/tradeScoringInstitutional.integration.test.js

import { describe, expect, test } from "vitest";

import {
  calculateSideScore,
  scoreTradeOpportunity,
  FINAL_SCORING_CONFIG,
} from "../strategy/tradeScoringEngine.js";

import { TRADE_SIDE } from "../config/riskConfig.js";

function directional({
  long = 0.5,
  short = 0.5,
  approved = true,
  status = "COMPLETE",
  ...rest
} = {}) {
  return {
    approved,
    status,
    directionalSupport: { long, short },
    ...rest,
  };
}

function buildStrongInputs(overrides = {}) {
  return {
    technical: directional({ long: 0.95, short: 0.05 }),
    macro: directional({ long: 0.9, short: 0.1 }),
    marketRegime: directional({ long: 0.9, short: 0.1 }),
    events: directional({
      long: 0.9,
      short: 0.1,
      eventFreeze: { active: false },
    }),
    company: directional({ long: 0.9, short: 0.1 }),
    institutional: directional({ long: 0.9, short: 0.1 }),
    country: directional({ long: 0.85, short: 0.15 }),
    social: directional({ long: 0.8, short: 0.2 }),
    historical: directional({ long: 0.8, short: 0.2 }),

    // Execution evidence is deliberately separate from directional points.
    liquidity: {
      approved: true,
      status: "COMPLETE",
      qualityScore: 0.9,
    },
    riskReward: {
      approved: true,
      status: "COMPLETE",
      longRewardRiskRatio: 3,
      shortRewardRiskRatio: 1,
      directionalSupport: { long: 1, short: 0.3 },
    },
    consensus: directional({ long: 0.9, short: 0.1 }),

    ...overrides,
  };
}

function findComponent(result, name) {
  return result.components.find((item) => item.name === name);
}

describe("Trade Scoring Institutional — New Configuration", () => {
  test("institutional allocation is 7.5", () => {
    expect(FINAL_SCORING_CONFIG.weights.institutional).toBe(7.5);
  });

  test("the eight directional weights total exactly 100", () => {
    const weights = FINAL_SCORING_CONFIG.weights;

    const total =
      weights.technical +
      weights.company +
      weights.macroRegime +
      weights.events +
      weights.institutional +
      weights.historical +
      weights.social +
      weights.country;

    expect(total).toBe(100);
  });
});

describe("Trade Scoring Institutional — Independent Allocation", () => {
  test("company/fundamental remains 30 and institutional remains 7.5", () => {
    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildStrongInputs(),
    });

    expect(findComponent(result, "COMPANY").maximumPoints).toBe(30);
    expect(findComponent(result, "INSTITUTIONAL").maximumPoints).toBe(7.5);
    expect(result.intendedPoints).toBe(100);
  });

  test("perfect institutional support cannot contribute more than 7.5 points", () => {
    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildStrongInputs({
        institutional: directional({ long: 1, short: 0 }),
      }),
    });

    const institutional = findComponent(result, "INSTITUTIONAL");

    expect(institutional.points).toBe(7.5);
    expect(institutional.points).toBeLessThanOrEqual(
      institutional.maximumPoints,
    );
  });
});

describe("Trade Scoring Institutional — Direction", () => {
  test("institutional accumulation supports LONG more than SHORT", () => {
    const inputs = buildStrongInputs({
      institutional: directional({ long: 0.9, short: 0.1 }),
    });

    const long = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...inputs,
    });

    const short = calculateSideScore({
      side: TRADE_SIDE.SHORT,
      ...inputs,
    });

    expect(findComponent(long, "INSTITUTIONAL").points).toBeGreaterThan(
      findComponent(short, "INSTITUTIONAL").points,
    );
  });

  test("institutional distribution supports SHORT more than LONG", () => {
    const inputs = buildStrongInputs({
      institutional: directional({ long: 0.1, short: 0.9 }),
    });

    const long = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...inputs,
    });

    const short = calculateSideScore({
      side: TRADE_SIDE.SHORT,
      ...inputs,
    });

    expect(findComponent(short, "INSTITUTIONAL").points).toBeGreaterThan(
      findComponent(long, "INSTITUTIONAL").points,
    );
  });
});

describe("Trade Scoring Institutional — Missing Evidence", () => {
  test("missing institutional evidence is unavailable, not bearish", () => {
    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildStrongInputs({
        institutional: {
          approved: false,
          status: "INSUFFICIENT_DATA",
          directionalSupport: { long: null, short: null },
        },
      }),
    });

    const institutional = findComponent(result, "INSTITUTIONAL");

    expect(institutional).toBeDefined();
    expect(institutional.available).toBe(false);
    expect(institutional.points).toBe(0);
    expect(institutional.maximumPoints).toBe(7.5);

    expect(findComponent(result, "COMPANY").maximumPoints).toBe(30);

    expect(result.intendedPoints).toBe(100);
    expect(result.availablePoints).toBe(92.5);
    expect(result.evidenceCoveragePercent).toBe(92.5);
  });

  test("omitted institutional input is represented as unavailable evidence", () => {
    const inputs = buildStrongInputs();
    delete inputs.institutional;

    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...inputs,
    });

    const institutional = findComponent(result, "INSTITUTIONAL");

    expect(institutional).toBeDefined();
    expect(institutional.available).toBe(false);
    expect(institutional.points).toBe(0);
    expect(result.evidenceCoveragePercent).toBe(92.5);
  });
});

describe("Trade Scoring Institutional — Safety", () => {
  test("perfect institutional evidence cannot bypass event freeze", () => {
    const result = scoreTradeOpportunity({
      symbol: "AAPL",
      ...buildStrongInputs({
        institutional: directional({ long: 1, short: 0 }),
        events: directional({
          long: 1,
          short: 0,
          eventFreeze: { active: true },
        }),
      }),
    });

    expect(result.tradeEligible).toBe(false);
    expect(result.eventFreeze).toBe(true);
    expect(result.status).toBe("EVENT_FREEZE");
  });

  test("institutional scoring does not create execution authority", () => {
    const result = scoreTradeOpportunity({
      symbol: "AAPL",
      ...buildStrongInputs({
        institutional: directional({ long: 1, short: 0 }),
      }),
    });

    expect(result).not.toHaveProperty("executeTrade");
    expect(result).not.toHaveProperty("orderAuthorized");
    expect(result).not.toHaveProperty("executionAuthorized");
  });

  test("institutional evidence cannot increase directional score above 100", () => {
    const result = scoreTradeOpportunity({
      symbol: "AAPL",
      ...buildStrongInputs({
        institutional: directional({ long: 1, short: 0 }),
      }),
    });

    expect(result.long.score).toBeLessThanOrEqual(100);
    expect(result.short.score).toBeLessThanOrEqual(100);
  });

  test("liquidity, risk/reward and consensus are not directional components", () => {
    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildStrongInputs(),
    });

    expect(findComponent(result, "LIQUIDITY")).toBeUndefined();
    expect(findComponent(result, "RISK_REWARD")).toBeUndefined();
    expect(findComponent(result, "CONSENSUS")).toBeUndefined();
  });
});
