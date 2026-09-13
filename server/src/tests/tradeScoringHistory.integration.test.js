import {
  describe,
  test,
  expect,
} from "vitest";

import {
  calculateSideScore,
  scoreTradeOpportunity,
} from "../strategy/tradeScoringEngine.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function directional({
  long = 0.9,
  short = 0.1,
  approved = true,
  status = "COMPLETE",
} = {}) {
  return {
    approved,
    status,

    directionalSupport: {
      long,
      short,
    },
  };
}

function liquidity({
  qualityScore = 0.95,
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",
    qualityScore,
  };
}

function buildStrongInputs({
  historyOutcome = null,
  historical = null,
  eventFreeze = false,
} = {}) {
  return {
    symbol: "AAPL",

    technical:
      directional({
        long: 1,
        short: 0,
      }),

    macro:
      directional({
        long: 1,
        short: 0,
      }),

    marketRegime:
      directional({
        long: 1,
        short: 0,
      }),

    events: {
      ...directional({
        long: 1,
        short: 0,
      }),

      eventFreeze: {
        active:
          eventFreeze,
      },
    },

    company:
      directional({
        long: 1,
        short: 0,
      }),

    country:
      directional({
        long: 1,
        short: 0,
      }),

    social:
      directional({
        long: 1,
        short: 0,
      }),

    historical,

    historyOutcome,

    liquidity:
      liquidity(),

    riskReward:
      directional({
        long: 1,
        short: 0,
      }),

    consensus:
      directional({
        long: 1,
        short: 0,
      }),
  };
}

/**
 * ============================================================
 * NEW BOT HISTORY TAKES PRECEDENCE
 * ============================================================
 */

describe(
  "Trade Scoring History — Preferred Source",
  () => {
    test(
      "uses COMPLETE bot trade-history outcome instead of legacy historical analogue",
      () => {
        const result =
          calculateSideScore({
            side: "LONG",

            technical:
              directional(),

            macro:
              directional(),

            marketRegime:
              directional(),

            events:
              directional(),

            company:
              directional(),

            country:
              directional(),

            social:
              directional(),

            historical:
              directional({
                long: 0.1,
                short: 0.9,
              }),

            historyOutcome: {
              approved: true,
              status: "COMPLETE",
              confidence: "HIGH",

              directionalSupport: {
                long: 0.9,
                short: 0.1,
              },
            },

            liquidity:
              liquidity(),

            riskReward:
              directional(),

            consensus:
              directional(),
          });

        const component =
          result.components.find(
            (item) =>
              item.name ===
              "HISTORICAL",
          );

        expect(
          component,
        ).toBeTruthy();

        expect(
          component.source,
        ).toBe(
          "TRADE_HISTORY_OUTCOME",
        );

        expect(
          component.support,
        ).toBe(0.9);

        expect(
          component.points,
        ).toBe(4.5);
      },
    );
  },
);

/**
 * ============================================================
 * INSUFFICIENT BOT HISTORY FALLS BACK SAFELY
 * ============================================================
 */

describe(
  "Trade Scoring History — Fallback",
  () => {
    test(
      "falls back to legacy historical analogue when bot-history evidence is insufficient",
      () => {
        const result =
          calculateSideScore({
            side: "LONG",

            technical:
              directional(),

            macro:
              directional(),

            marketRegime:
              directional(),

            events:
              directional(),

            company:
              directional(),

            country:
              directional(),

            social:
              directional(),

            historical:
              directional({
                long: 0.8,
                short: 0.2,
              }),

            historyOutcome: {
              approved: true,
              status:
                "INSUFFICIENT_DATA",
              confidence:
                "INSUFFICIENT",

              directionalSupport: {
                long: null,
                short: null,
              },
            },

            liquidity:
              liquidity(),

            riskReward:
              directional(),

            consensus:
              directional(),
          });

        const component =
          result.components.find(
            (item) =>
              item.name ===
              "HISTORICAL",
          );

        expect(
          component.source,
        ).toBe(
          "HISTORICAL_ANALOGUE",
        );

        expect(
          component.support,
        ).toBe(0.8);

        expect(
          component.points,
        ).toBe(4);
      },
    );

    test(
      "leaves historical slot unavailable when neither source has usable evidence",
      () => {
        const result =
          calculateSideScore({
            side: "LONG",

            technical:
              directional(),

            macro:
              directional(),

            marketRegime:
              directional(),

            events:
              directional(),

            company:
              directional(),

            country:
              directional(),

            social:
              directional(),

            historical: null,

            historyOutcome: {
              approved: true,
              status:
                "NO_MATCHES",
              confidence:
                "INSUFFICIENT",

              directionalSupport: {
                long: null,
                short: null,
              },
            },

            liquidity:
              liquidity(),

            riskReward:
              directional(),

            consensus:
              directional(),
          });

        const component =
          result.components.find(
            (item) =>
              item.name ===
              "HISTORICAL",
          );

        expect(
          component.available,
        ).toBe(false);

        expect(
          component.support,
        ).toBeNull();

        expect(
          component.points,
        ).toBe(0);

        expect(
          component.source,
        ).toBe(
          "UNAVAILABLE",
        );
      },
    );
  },
);

/**
 * ============================================================
 * NEGATIVE HISTORY REMAINS DIRECTIONAL
 * ============================================================
 */

describe(
  "Trade Scoring History — Negative Evidence",
  () => {
    test(
      "negative LONG history gives more historical points to SHORT",
      () => {
        const historyOutcome = {
          approved: true,
          status: "COMPLETE",
          confidence: "HIGH",

          directionalSupport: {
            long: 0.15,
            short: 0.85,
          },
        };

        const long =
          calculateSideScore({
            side: "LONG",
            historyOutcome,
          });

        const short =
          calculateSideScore({
            side: "SHORT",
            historyOutcome,
          });

        const longHistory =
          long.components.find(
            (item) =>
              item.name ===
              "HISTORICAL",
          );

        const shortHistory =
          short.components.find(
            (item) =>
              item.name ===
              "HISTORICAL",
          );

        expect(
          longHistory.points,
        ).toBe(0.75);

        expect(
          shortHistory.points,
        ).toBe(4.25);
      },
    );
  },
);

/**
 * ============================================================
 * SAFETY BOUNDARY
 * ============================================================
 */

describe(
  "Trade Scoring History — Safety Boundary",
  () => {
    test(
      "perfect bot history cannot bypass an event freeze",
      () => {
        const result =
          scoreTradeOpportunity(
            buildStrongInputs({
              eventFreeze:
                true,

              historyOutcome: {
                approved: true,
                status: "COMPLETE",
                confidence: "HIGH",

                directionalSupport: {
                  long: 1,
                  short: 0,
                },
              },

              historical:
                directional({
                  long: 0,
                  short: 1,
                }),
            }),
          );

        expect(
          result.status,
        ).toBe(
          "EVENT_FREEZE",
        );

        expect(
          result.tradeEligible,
        ).toBe(false);

        expect(
          result.eventFreeze,
        ).toBe(true);
      },
    );

    test(
      "history outcome does not add a second historical weight",
      () => {
        const result =
          scoreTradeOpportunity(
            buildStrongInputs({
              historyOutcome: {
                approved: true,
                status: "COMPLETE",
                confidence: "HIGH",

                directionalSupport: {
                  long: 1,
                  short: 0,
                },
              },

              historical:
                directional({
                  long: 1,
                  short: 0,
                }),
            }),
          );

        const historicalComponents =
          result.long.components
            .filter(
              (component) =>
                component.name ===
                "HISTORICAL",
            );

        expect(
          historicalComponents,
        ).toHaveLength(1);

        expect(
          historicalComponents[0]
            .maximumPoints,
        ).toBe(5);

        expect(
          result.long.score,
        ).toBeLessThanOrEqual(
          100,
        );
      },
    );
  },
);
