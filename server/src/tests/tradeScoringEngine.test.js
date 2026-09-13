// server/src/tests/tradeScoringEngine.test.js

import { describe, expect, test } from "vitest";

import {
  calculateSideScore,
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

function buildDirectionalInputs(overrides = {}) {
  return {
    technical: directional({ long: 0.9, short: 0.1 }),
    macro: directional({ long: 0.8, short: 0.2 }),
    marketRegime: directional({ long: 0.8, short: 0.2 }),
    events: directional({ long: 0.8, short: 0.2 }),
    company: directional({ long: 0.85, short: 0.15 }),
    institutional: directional({ long: 0.75, short: 0.25 }),
    historical: directional({ long: 0.7, short: 0.3 }),
    social: directional({ long: 0.65, short: 0.35 }),
    country: directional({ long: 0.6, short: 0.4 }),
    ...overrides,
  };
}

function component(result, name) {
  return result.components.find((item) => item.name === name);
}

describe("Trade Scoring Engine — 100 Point Directional Architecture", () => {
  test("directional weights total exactly 100", () => {
    const weights = FINAL_SCORING_CONFIG.weights;

    expect(
      weights.technical +
        weights.company +
        weights.macroRegime +
        weights.events +
        weights.institutional +
        weights.historical +
        weights.social +
        weights.country,
    ).toBe(100);
  });

  test("uses the agreed 30/30 directional allocation", () => {
    const weights = FINAL_SCORING_CONFIG.weights;

    expect(weights.technical).toBe(30);
    expect(weights.company).toBe(30);
    expect(weights.macroRegime).toBe(10);
    expect(weights.events).toBe(10);
    expect(weights.institutional).toBe(7.5);
    expect(weights.historical).toBe(5);
    expect(weights.social).toBe(5);
    expect(weights.country).toBe(2.5);
  });

  test("contains only the eight directional engines in the score", () => {
    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildDirectionalInputs(),
    });

    expect(result.components.map((item) => item.name)).toEqual([
      "TECHNICAL",
      "MACRO_REGIME",
      "EVENTS",
      "COMPANY",
      "INSTITUTIONAL",
      "COUNTRY",
      "SOCIAL",
      "HISTORICAL",
    ]);

    expect(component(result, "LIQUIDITY")).toBeUndefined();
    expect(component(result, "RISK_REWARD")).toBeUndefined();
    expect(component(result, "CONSENSUS")).toBeUndefined();
  });

  test("fundamental/company keeps its full 30 points when institutional evidence exists", () => {
    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildDirectionalInputs(),
    });

    expect(component(result, "COMPANY").maximumPoints).toBe(30);
    expect(component(result, "INSTITUTIONAL").maximumPoints).toBe(7.5);
    expect(result.intendedPoints).toBe(100);
  });

  test("perfect available evidence produces 100 directional conviction", () => {
    const perfect = directional({ long: 1, short: 0 });

    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildDirectionalInputs({
        technical: perfect,
        macro: perfect,
        marketRegime: perfect,
        events: perfect,
        company: perfect,
        institutional: perfect,
        historical: perfect,
        social: perfect,
        country: perfect,
      }),
    });

    expect(result.score).toBe(100);
    expect(result.rawPoints).toBe(100);
    expect(result.availablePoints).toBe(100);
    expect(result.intendedPoints).toBe(100);
    expect(result.evidenceCoveragePercent).toBe(100);
  });

  test("missing institutional evidence lowers coverage instead of becoming bearish evidence", () => {
    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildDirectionalInputs({
        institutional: {
          approved: false,
          status: "INSUFFICIENT_DATA",
          directionalSupport: {
            long: null,
            short: null,
          },
        },
      }),
    });

    const institutional = component(result, "INSTITUTIONAL");

    expect(institutional.available).toBe(false);
    expect(institutional.points).toBe(0);
    expect(institutional.maximumPoints).toBe(7.5);

    expect(result.intendedPoints).toBe(100);
    expect(result.availablePoints).toBe(92.5);
    expect(result.evidenceCoveragePercent).toBe(92.5);

    // Fundamental/company is independent and keeps all 30 points.
    expect(component(result, "COMPANY").maximumPoints).toBe(30);
  });

  test("directional conviction is normalized over available evidence", () => {
    const perfect = directional({ long: 1, short: 0 });

    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildDirectionalInputs({
        technical: perfect,
        macro: perfect,
        marketRegime: perfect,
        events: perfect,
        company: perfect,
        institutional: {
          approved: false,
          status: "INSUFFICIENT_DATA",
          directionalSupport: { long: null, short: null },
        },
        historical: perfect,
        social: perfect,
        country: perfect,
      }),
    });

    expect(result.rawPoints).toBe(92.5);
    expect(result.availablePoints).toBe(92.5);
    expect(result.score).toBe(100);
    expect(result.evidenceCoveragePercent).toBe(92.5);
  });

  test("directional score can never exceed 100", () => {
    const impossible = directional({ long: 5, short: -5 });

    const result = calculateSideScore({
      side: TRADE_SIDE.LONG,
      ...buildDirectionalInputs({
        technical: impossible,
        macro: impossible,
        marketRegime: impossible,
        events: impossible,
        company: impossible,
        institutional: impossible,
        historical: impossible,
        social: impossible,
        country: impossible,
      }),
    });

    expect(result.score).toBeLessThanOrEqual(100);
  });
});
