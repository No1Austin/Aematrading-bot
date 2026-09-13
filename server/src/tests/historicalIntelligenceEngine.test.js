import {
  describe,
  it,
  expect,
} from "vitest";

import {
  evaluateHistoricalIntelligence,
  HISTORICAL_INTELLIGENCE_STATUS,
  HISTORICAL_INTELLIGENCE_SIGNAL,
} from "../history/historicalIntelligenceEngine.js";

/**
 * ============================================================
 * TEST HELPERS
 * ============================================================
 */

function marketHistory({
  approved = true,
  status = "COMPLETE",
  confidence = 1,
  long = 1,
  short = 0,
  rawScore = 100,
} = {}) {
  return {
    approved,
    status,
    direction:
      long >= short
        ? "LONG"
        : "SHORT",
    confidence,
    rawScore,
    directionalSupport: {
      long,
      short,
    },
  };
}

function botHistory({
  approved = true,
  status = "COMPLETE",
  signal = "SUPPORTIVE",
  confidence = "HIGH",
  long = 1,
  short = 0,
  expectancyR = 1.5,
  winRate = 0.7,
  averageSimilarity = 0.85,
  matchCount = 20,
} = {}) {
  return {
    approved,
    status,
    signal,
    confidence,

    directionalSupport: {
      long,
      short,
    },

    stats: {
      expectancyR,
      winRate,
      averageSimilarity,
      matchCount,
    },
  };
}

/**
 * ============================================================
 * TESTS
 * ============================================================
 */

describe(
  "Historical Intelligence Engine",
  () => {
    it(
      "fails closed when candidate side is missing",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            historicalAnalogue:
              marketHistory(),

            historyOutcome:
              botHistory(),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          HISTORICAL_INTELLIGENCE_STATUS
            .INVALID_INPUT,
        );

        expect(
          result.points,
        ).toBe(0);
      },
    );

    it(
      "fails closed for an invalid candidate side",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "SIDEWAYS",

            historicalAnalogue:
              marketHistory(),

            historyOutcome:
              botHistory(),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.points,
        ).toBe(0);
      },
    );

    it(
      "awards the full 3 market-history points for maximum LONG support",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 1,
                short: 0,
              }),

            historyOutcome: null,
          });

        expect(
          result.components
            .marketHistory
            .points,
        ).toBe(3);

        expect(
          result.components
            .botHistory
            .points,
        ).toBe(0);

        expect(
          result.points,
        ).toBe(3);
      },
    );

    it(
      "awards the full 2 bot-history points for maximum LONG support",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue: null,

            historyOutcome:
              botHistory({
                signal:
                  "SUPPORTIVE",

                confidence:
                  "HIGH",

                long: 1,

                short: 0,
              }),
          });

        expect(
          result.components
            .marketHistory
            .points,
        ).toBe(0);

        expect(
          result.components
            .botHistory
            .points,
        ).toBe(2);

        expect(
          result.points,
        ).toBe(2);
      },
    );

    it(
      "can award the complete 5 point allocation",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 1,
                short: 0,
              }),

            historyOutcome:
              botHistory({
                signal:
                  "STRONGLY_SUPPORTIVE",

                confidence:
                  "HIGH",

                long: 1,

                short: 0,
              }),
          });

        expect(
          result.points,
        ).toBe(5);

        expect(
          result.scorePercent,
        ).toBe(100);

        expect(
          result.status,
        ).toBe(
          HISTORICAL_INTELLIGENCE_STATUS
            .COMPLETE,
        );

        expect(
          result.signal,
        ).toBe(
          HISTORICAL_INTELLIGENCE_SIGNAL
            .STRONGLY_SUPPORTIVE,
        );
      },
    );

    it(
      "never redistributes missing bot-history points to market history",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 1,
                short: 0,
              }),

            historyOutcome: null,
          });

        expect(
          result.points,
        ).toBe(3);

        expect(
          result.points,
        ).toBeLessThan(5);

        expect(
          result.status,
        ).toBe(
          HISTORICAL_INTELLIGENCE_STATUS
            .PARTIAL,
        );

        expect(
          result.warnings,
        ).toContain(
          "Bot trade-history evidence is unavailable; its 2 points were not redistributed.",
        );
      },
    );

    it(
      "never redistributes missing market-history points to bot history",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue: null,

            historyOutcome:
              botHistory({
                confidence:
                  "HIGH",

                long: 1,

                short: 0,
              }),
          });

        expect(
          result.points,
        ).toBe(2);

        expect(
          result.points,
        ).toBeLessThan(5);

        expect(
          result.status,
        ).toBe(
          HISTORICAL_INTELLIGENCE_STATUS
            .PARTIAL,
        );

        expect(
          result.warnings,
        ).toContain(
          "Market-history evidence is unavailable; its 3 points were not redistributed.",
        );
      },
    );

    it(
      "returns insufficient data when neither historical source is available",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue: null,

            historyOutcome: null,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          HISTORICAL_INTELLIGENCE_STATUS
            .INSUFFICIENT_DATA,
        );

        expect(
          result.signal,
        ).toBe(
          HISTORICAL_INTELLIGENCE_SIGNAL
            .INSUFFICIENT_DATA,
        );

        expect(
          result.points,
        ).toBe(0);
      },
    );

    it(
      "does not give market-history points for neutral 50 percent support",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 0.5,
                short: 0.5,
              }),

            historyOutcome: null,
          });

        expect(
          result.components
            .marketHistory
            .points,
        ).toBe(0);

        expect(
          result.points,
        ).toBe(0);
      },
    );

    it(
      "does not award points below the minimum support threshold",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 0.54,
                short: 0.46,
              }),

            historyOutcome: null,
          });

        expect(
          result.components
            .marketHistory
            .points,
        ).toBe(0);
      },
    );

    it(
      "awards progressively more market-history points as evidence strengthens",
      () => {
        const weak =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 0.6,
                short: 0.4,
              }),
          });

        const strong =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 0.9,
                short: 0.1,
              }),
          });

        expect(
          strong.components
            .marketHistory
            .points,
        ).toBeGreaterThan(
          weak.components
            .marketHistory
            .points,
        );
      },
    );

    it(
      "reduces market-history contribution when confidence is lower",
      () => {
        const high =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 0.9,
                short: 0.1,
              }),
          });

        const low =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 0.5,
                long: 0.9,
                short: 0.1,
              }),
          });

        expect(
          high.components
            .marketHistory
            .points,
        ).toBeGreaterThan(
          low.components
            .marketHistory
            .points,
        );
      },
    );

    it(
      "scores the requested SHORT side instead of blindly using LONG support",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "SHORT",

            historicalAnalogue:
              marketHistory({
                confidence: 1,
                long: 0.1,
                short: 0.9,
              }),

            historyOutcome:
              botHistory({
                signal:
                  "SUPPORTIVE",

                confidence:
                  "HIGH",

                long: 0.1,
                short: 0.9,
              }),
          });

        expect(
          result.components
            .marketHistory
            .points,
        ).toBeGreaterThan(0);

        expect(
          result.components
            .botHistory
            .points,
        ).toBeGreaterThan(0);

        expect(
          result.side,
        ).toBe("SHORT");
      },
    );

    it(
      "does not allow a negative bot-history signal to earn positive points",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue: null,

            historyOutcome:
              botHistory({
                signal:
                  "STRONGLY_NEGATIVE",

                confidence:
                  "HIGH",

                /**
                 * Deliberately malformed/conflicting:
                 * directional support says LONG is strong,
                 * but the outcome signal says strongly
                 * negative.
                 *
                 * The negative outcome must win.
                 */
                long: 1,

                short: 0,
              }),
          });

        expect(
          result.components
            .botHistory
            .points,
        ).toBe(0);

        expect(
          result.signal,
        ).toBe(
          HISTORICAL_INTELLIGENCE_SIGNAL
            .STRONGLY_NEGATIVE,
        );
      },
    );

    it(
      "does not allow a CAUTION bot-history signal to earn positive points",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historyOutcome:
              botHistory({
                signal:
                  "CAUTION",

                confidence:
                  "HIGH",

                long: 1,

                short: 0,
              }),
          });

        expect(
          result.components
            .botHistory
            .points,
        ).toBe(0);

        expect(
          result.signal,
        ).toBe(
          HISTORICAL_INTELLIGENCE_SIGNAL
            .CAUTION,
        );
      },
    );

    it(
      "does not give neutral bot history any points",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historyOutcome:
              botHistory({
                signal:
                  "NEUTRAL",

                confidence:
                  "HIGH",

                long: 1,

                short: 0,
              }),
          });

        expect(
          result.components
            .botHistory
            .points,
        ).toBe(0);
      },
    );

    it(
      "treats rejected market-history evidence as unavailable",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                approved: false,

                status:
                  "INSUFFICIENT_DATA",

                long: 1,
              }),

            historyOutcome: null,
          });

        expect(
          result.components
            .marketHistory
            .available,
        ).toBe(false);

        expect(
          result.components
            .marketHistory
            .points,
        ).toBe(0);
      },
    );

    it(
      "treats rejected bot-history evidence as unavailable",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historyOutcome:
              botHistory({
                approved: false,

                status:
                  "INSUFFICIENT_DATA",

                long: 1,
              }),
          });

        expect(
          result.components
            .botHistory
            .available,
        ).toBe(false);

        expect(
          result.components
            .botHistory
            .points,
        ).toBe(0);
      },
    );

    it(
      "never exceeds the five point historical allocation",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory({
                confidence: 5,
                long: 5,
                short: 0,
              }),

            historyOutcome:
              botHistory({
                signal:
                  "STRONGLY_SUPPORTIVE",

                confidence:
                  "HIGH",

                long: 5,

                short: 0,
              }),
          });

        expect(
          result.points,
        ).toBeLessThanOrEqual(5);

        expect(
          result.components
            .marketHistory
            .points,
        ).toBeLessThanOrEqual(3);

        expect(
          result.components
            .botHistory
            .points,
        ).toBeLessThanOrEqual(2);
      },
    );

    it(
      "reports 50 percent source coverage when only one historical source is usable",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory(),

            historyOutcome: null,
          });

        expect(
          result.coverage
            .availableSources,
        ).toBe(1);

        expect(
          result.coverage
            .totalSources,
        ).toBe(2);

        expect(
          result.coverage
            .ratio,
        ).toBe(0.5);
      },
    );

    it(
      "reports complete source coverage when both sources are usable",
      () => {
        const result =
          evaluateHistoricalIntelligence({
            side: "LONG",

            historicalAnalogue:
              marketHistory(),

            historyOutcome:
              botHistory(),
          });

        expect(
          result.coverage
            .availableSources,
        ).toBe(2);

        expect(
          result.coverage
            .ratio,
        ).toBe(1);
      },
    );
  },
);
