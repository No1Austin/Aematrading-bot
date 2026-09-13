import {
  describe,
  test,
  expect,
} from "vitest";

import {
  executeApprovedPaperTrade,
  processPaperPositionUpdate,
} from "../execution/paperExecutionCoordinator.js";

const SYMBOL = "AAPL";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildRiskApproval({
  side = "LONG",
  shares = 100,
  entryPrice = 100,
  stopPrice = 98,
  targetPrice = 120,
} = {}) {
  return {
    approved: true,
    status: "APPROVED",
    canExecute: true,

    side,

    intelligenceScore: 92,

    position: {
      shares,
      entryPrice,
      stopPrice,
      targetPrice,

      riskPerShare:
        Math.abs(
          entryPrice -
          stopPrice,
        ),

      dollarRisk:
        shares *
        Math.abs(
          entryPrice -
          stopPrice,
        ),

      accountRiskPercent: 0.5,
    },
  };
}

/**
 * Build a simple intelligence package.
 *
 * We deliberately keep the same shape used by the
 * orchestration/execution pipeline.
 */
function buildIntelligence({
  long = 0.9,
  short = 0.1,
  direction = "LONG",
  score = 90,
} = {}) {
  const directional = {
    approved: true,
    status: "COMPLETE",

    directionalSupport: {
      long,
      short,
    },
  };

  return {
    technical: {
      ...directional,

      trend: {
        direction:
          direction === "LONG"
            ? "BULLISH"
            : "BEARISH",
      },

      bias: {
        direction,
      },
    },

    macro: {
      ...directional,
    },

    marketRegime: {
      ...directional,

      regime:
        direction === "LONG"
          ? "BULL"
          : "BEAR",
    },

    events: {
      ...directional,

      eventFreeze: {
        active: false,
      },
    },

    company: {
      ...directional,
    },

    country: {
      ...directional,
    },

    social: {
      ...directional,
    },

    historical: {
      ...directional,
    },

    liquidity: {
      approved: true,
      status: "COMPLETE",
      qualityScore: 0.9,
    },

    consensus: {
      ...directional,

      direction,

      confidence:
        Math.max(
          long,
          short,
        ),
    },

    scoring: {
      approved: true,
      status: "TRADE_CANDIDATE",

      preferredSide:
        direction,

      preferredScore:
        score,

      long: {
        score:
          direction === "LONG"
            ? score
            : 100 - score,
      },

      short: {
        score:
          direction === "SHORT"
            ? score
            : 100 - score,
      },
    },

    finalDecision: {
      preferredSide:
        direction,

      preferredScore:
        score,

      consensus:
        direction,
    },
  };
}

function openLongPosition({
  shares = 100,
} = {}) {
  const intelligence =
    buildIntelligence({
      long: 0.95,
      short: 0.05,
      direction: "LONG",
      score: 94,
    });

  const result =
    executeApprovedPaperTrade({
      symbol:
        SYMBOL,

      riskApproval:
        buildRiskApproval({
          side: "LONG",
          shares,
          entryPrice: 100,
          stopPrice: 98,

          /**
           * Keep target deliberately far away so
           * thesis tests are not accidentally
           * converted into target exits.
           */
          targetPrice: 150,
        }),

      currentPrice: 100,

      slippagePercent: 0,

      intelligence,

      metadata: {
        integrationTest: true,
      },
    });

  expect(
    result.approved,
  ).toBe(true);

  expect(
    result.position,
  ).toBeTruthy();

  return result.position;
}

function openShortPosition({
  shares = 100,
} = {}) {
  const intelligence =
    buildIntelligence({
      long: 0.05,
      short: 0.95,
      direction: "SHORT",
      score: 94,
    });

  const result =
    executeApprovedPaperTrade({
      symbol:
        SYMBOL,

      riskApproval:
        buildRiskApproval({
          side: "SHORT",
          shares,
          entryPrice: 100,
          stopPrice: 102,
          targetPrice: 50,
        }),

      currentPrice: 100,

      slippagePercent: 0,

      intelligence,

      metadata: {
        integrationTest: true,
      },
    });

  expect(
    result.approved,
  ).toBe(true);

  expect(
    result.position,
  ).toBeTruthy();

  return result.position;
}

/**
 * ============================================================
 * PRICE-ONLY SAFETY PASS
 * ============================================================
 */

describe(
  "Trade Thesis Position — Price Safety",
  () => {
    test(
      "monitorThesis false does not reduce a healthy open position",
      async () => {
        const position =
          openLongPosition({
            shares: 100,
          });

        const result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 101,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: false,
          });

        expect(
          result.approved,
        ).toBe(true);

        

        expect(
          result.position.shares,
        ).toBe(100);

        expect(
          result.position
            .originalShares,
        ).toBe(100);

        expect(
          result.management
            ?.thesisMonitoringRequested,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * ORIGINAL SHARE STATE
 * ============================================================
 */

describe(
  "Trade Thesis Position — Original Exposure",
  () => {
    test(
      "originalShares survives repeated position updates",
      async () => {
        let position =
          openLongPosition({
            shares: 100,
          });

        const prices = [
          101,
          102,
          103,
        ];

        for (
          const currentPrice
          of prices
        ) {
          const result =
            await processPaperPositionUpdate({
              position,

              currentPrice,

              atr: 1,

              slippagePercent: 0,

              monitorThesis: false,
            });

          expect(
            result.approved,
          ).toBe(true);

          position =
            result.position;

          expect(
            position.originalShares,
          ).toBe(100);
        }
      },
    );
  },
);

/**
 * ============================================================
 * HARD EXIT PRECEDENCE
 * ============================================================
 */

describe(
  "Trade Thesis Position — Hard Exit Priority",
  () => {
    test(
      "LONG stop protection outranks thesis monitoring",
      async () => {
        const position =
          openLongPosition({
            shares: 100,
          });

        const result =
          await processPaperPositionUpdate({
            position,

            /**
             * Entry = 100
             * Initial stop = 98
             */
            currentPrice: 97.5,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildIntelligence({
                long: 0.95,
                short: 0.05,
                direction: "LONG",
                score: 95,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          result.position.status,
        ).not.toBe("OPEN");
      },
    );

    test(
      "SHORT stop protection outranks thesis monitoring",
      async () => {
        const position =
          openShortPosition({
            shares: 100,
          });

        const result =
          await processPaperPositionUpdate({
            position,

            /**
             * SHORT stop = 102
             */
            currentPrice: 102.5,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildIntelligence({
                long: 0.05,
                short: 0.95,
                direction: "SHORT",
                score: 95,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          result.position.status,
        ).not.toBe("OPEN");
      },
    );
  },
);

/**
 * ============================================================
 * MISSING THESIS DATA
 * ============================================================
 */

describe(
  "Trade Thesis Position — Missing Intelligence",
  () => {
    test(
      "missing intelligence never increases exposure",
      async () => {
        const position =
          openLongPosition({
            shares: 100,
          });

        const originalShares =
          position.shares;

        const result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 100.5,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence: {},
          });

        /**
         * The monitor may HOLD or safely degrade,
         * depending on its coverage rules.
         *
         * What it must NEVER do is create more shares.
         */

        expect(
          result.position,
        ).toBeTruthy();

        expect(
          result.position.shares,
        ).toBeLessThanOrEqual(
          originalShares,
        );

        expect(
          result.position
            .originalShares,
        ).toBe(100);
      },
    );
  },
);

/**
 * ============================================================
 * ONE-WAY EXPOSURE
 * ============================================================
 */

describe(
  "Trade Thesis Position — One Way Exposure",
  () => {
    test(
      "position management never restores previously removed shares",
      async () => {
        let position =
          openLongPosition({
            shares: 100,
          });

        /**
         * We simulate an already-reduced position.
         *
         * This isolates the critical invariant from
         * the thesis scoring thresholds themselves:
         *
         * 100 original
         * → 50 remaining
         * → future HOLD/recovery must NOT return to 100.
         */

        position = {
          ...position,

          originalShares: 100,

          shares: 50,

          thesisState: {
            ...(
              position
                .thesisState ??
              {}
            ),

            currentExposureMultiplier:
              0.5,

            lowestExposureMultiplier:
              0.5,
          },
        };

        const result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 101,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            /**
             * Strong recovery.
             *
             * Even if thesis becomes healthy again,
             * removed exposure must stay removed.
             */
            intelligence:
              buildIntelligence({
                long: 0.99,
                short: 0.01,
                direction: "LONG",
                score: 99,
              }),
          });

        expect(
          result.position.shares,
        ).toBeLessThanOrEqual(50);

        expect(
          result.position
            .originalShares,
        ).toBe(100);
      },
    );
  },
);

/**
 * ============================================================
 * REDUCTION HISTORY
 * ============================================================
 */

describe(
  "Trade Thesis Position — Reduction State",
  () => {
    test(
      "existing reduction history survives future updates",
      async () => {
        let position =
          openLongPosition({
            shares: 100,
          });

        const previousReduction = {
          reason:
            "THESIS_REDUCE_50",

          sharesClosed: 50,

          sharesRemaining: 50,

          reductionPercent: 0.5,

          exitPrice: 100,

          netPnL: 0,

          timestamp:
            new Date()
              .toISOString(),
        };

        position = {
          ...position,

          originalShares: 100,

          shares: 50,

          reductionHistory: [
            previousReduction,
          ],

          thesisState: {
            ...(
              position
                .thesisState ??
              {}
            ),

            currentExposureMultiplier:
              0.5,

            lowestExposureMultiplier:
              0.5,
          },
        };

        const result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 101,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: false,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          Array.isArray(
            result
              .position
              .reductionHistory,
          ),
        ).toBe(true);

        expect(
          result
            .position
            .reductionHistory
            .length,
        ).toBeGreaterThanOrEqual(1);

        expect(
          result
            .position
            .reductionHistory[0]
            .sharesClosed,
        ).toBe(50);
      },
    );
  },
);

/**
 * ============================================================
 * LONG / SHORT SYMMETRY
 * ============================================================
 */

describe(
  "Trade Thesis Position — LONG / SHORT Symmetry",
  () => {
    test(
      "LONG price-only update preserves exposure",
      async () => {
        const position =
          openLongPosition();

        const result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 101,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: false,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.position.shares,
        ).toBe(100);
      },
    );

    test(
      "SHORT price-only update preserves exposure",
      async () => {
        const position =
          openShortPosition();

        const result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 99,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: false,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.position.shares,
        ).toBe(100);
      },
    );
  },
);

/**
 * ============================================================
 * DETERMINISTIC THESIS LIFECYCLE
 * ============================================================
 *
 * Proves:
 *
 * 100 shares
 *    ↓
 * REDUCE_25 → 75
 *    ↓
 * same REDUCE_25 → still 75
 *    ↓
 * REDUCE_50 → 50
 *    ↓
 * thesis recovery → still 50
 *    ↓
 * REDUCE_75 → 25
 *    ↓
 * thesis invalidation → EXIT
 */

function buildDeterministicThesisIntelligence({
  longSupport,
} = {}) {
  const normalizedLong =
    Math.max(
      0,
      Math.min(
        1,
        Number(
          longSupport,
        ),
      ),
    );

  const normalizedShort =
    1 -
    normalizedLong;

  const directional = {
    approved: true,

    status:
      "COMPLETE",

    directionalSupport: {
      long:
        normalizedLong,

      short:
        normalizedShort,
    },
  };

  return {
    technical: {
      ...directional,

      trend: {
        direction:
          normalizedLong >= 0.5
            ? "BULLISH"
            : "BEARISH",
      },

      bias: {
        direction:
          normalizedLong >= 0.5
            ? "LONG"
            : "SHORT",
      },
    },

    macro: {
      ...directional,
    },

    marketRegime: {
      ...directional,

      regime:
        normalizedLong >= 0.5
          ? "BULL"
          : "BEAR",
    },

    events: {
      ...directional,

      eventFreeze: {
        active: false,
      },
    },

    company: {
      ...directional,
    },

    country: {
      ...directional,
    },

    social: {
      ...directional,
    },

    historical: {
      ...directional,
    },

    /**
     * Give liquidity directionalSupport too so
     * thesis coverage is deterministic.
     */
    liquidity: {
      ...directional,

      qualityScore: 0.95,
    },

    consensus: {
      ...directional,

      direction:
        normalizedLong >= 0.5
          ? "LONG"
          : "SHORT",

      confidence:
        Math.max(
          normalizedLong,
          normalizedShort,
        ),
    },
  };
}

function openDeterministicLongThesisPosition() {
  const entryIntelligence =
    buildDeterministicThesisIntelligence({
      longSupport: 0.95,
    });

  const result =
    executeApprovedPaperTrade({
      symbol:
        SYMBOL,

      riskApproval:
        buildRiskApproval({
          side: "LONG",

          shares: 100,

          entryPrice: 100,

          stopPrice: 90,

          /**
           * Keep price exits far away.
           *
           * We want thesis logic to control this test.
           */
          targetPrice: 200,
        }),

      currentPrice: 100,

      slippagePercent: 0,

      intelligence:
        entryIntelligence,

      metadata: {
        deterministicThesisTest:
          true,
      },
    });

  expect(
    result.approved,
  ).toBe(true);

  expect(
    result.position,
  ).toBeTruthy();

  expect(
    result.position
      .entryThesis,
  ).toBeTruthy();

  expect(
    result.position
      .originalShares,
  ).toBe(100);

  return result.position;
}

describe(
  "Trade Thesis Position — Deterministic Exposure Lifecycle",
  () => {
    test(
      "moves 100 → 75 → 75 → 50 → 50 → 25 → EXIT",
      async () => {
        let position =
          openDeterministicLongThesisPosition();

        /**
         * ==================================================
         * STEP 1
         * SOFT WEAKENING
         *
         * Entry ≈ 0.95
         * Current ≈ 0.80
         *
         * Deterioration ≈ 0.15
         *
         * Threshold:
         * softDeterioration = 0.12
         *
         * Expected:
         * REDUCE_25
         * 100 → 75
         * ==================================================
         */

        let result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 100,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildDeterministicThesisIntelligence({
                longSupport:
                  0.80,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        console.log(
          "\n=== STEP 1 THESIS DEBUG ===",
        );

        console.dir(
          {
            shares:
              result.position?.shares,

            originalShares:
              result.position?.originalShares,

            status:
              result.status,

            exitReason:
              result.exitReason,

            managementStatus:
              result.management?.status,

            managementExitReason:
              result.management?.exitReason,

            trailing:
              result.management?.trailing,

            thesis:
              result.management?.thesis,

            thesisState:
              result.position?.thesisState,

            entryThesis:
              result.position?.entryThesis,

            execution:
              result.management?.execution,
          },
          {
            depth: null,
          },
        );

        expect(
          result.position.shares,
        ).toBe(75);

        expect(
          result.position
            .originalShares,
        ).toBe(100);

        expect(
          result.management
            ?.thesis
            ?.exposureAction,
        ).toBe(
          "REDUCE_25",
        );

        position =
          result.position;

        /**
         * ==================================================
         * STEP 2
         * SAME SOFT SIGNAL AGAIN
         *
         * Must NOT reduce another 25%.
         *
         * Expected:
         * still 75
         * ==================================================
         */

        result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 100,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildDeterministicThesisIntelligence({
                longSupport:
                  0.80,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);
expect(
          result.position.shares,
        ).toBe(75);

        expect(
          result.position
            .originalShares,
        ).toBe(100);

        position =
          result.position;

        /**
         * ==================================================
         * STEP 3
         * MATERIAL WEAKENING
         *
         * Entry ≈ 0.95
         * Current ≈ 0.70
         *
         * Deterioration ≈ 0.25
         *
         * Threshold:
         * materialDeterioration = 0.22
         *
         * Expected:
         * target exposure = 50%
         * 75 → 50
         * ==================================================
         */

        result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 100,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildDeterministicThesisIntelligence({
                longSupport:
                  0.70,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.position.shares,
        ).toBe(50);

        expect(
          result.management
            ?.thesis
            ?.exposureAction,
        ).toBe(
          "REDUCE_50",
        );

        position =
          result.position;

        /**
         * ==================================================
         * STEP 4
         * THESIS RECOVERS
         *
         * Current evidence becomes strong again.
         *
         * Critical safety invariant:
         *
         * 50 shares must NEVER become 75/100 again.
         * ==================================================
         */

        result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 100,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildDeterministicThesisIntelligence({
                longSupport:
                  0.90,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.position.shares,
        ).toBe(50);

        expect(
          result.position
            .originalShares,
        ).toBe(100);

        position =
          result.position;

        /**
         * ==================================================
         * STEP 5
         * SEVERE WEAKENING
         *
         * Entry ≈ 0.95
         * Current ≈ 0.60
         *
         * Deterioration ≈ 0.35
         *
         * Threshold:
         * severeDeterioration = 0.32
         *
         * Expected:
         * target exposure = 25%
         *
         * 50 → 25
         * ==================================================
         */

        result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 100,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildDeterministicThesisIntelligence({
                longSupport:
                  0.60,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.position.shares,
        ).toBe(25);

        expect(
          result.management
            ?.thesis
            ?.exposureAction,
        ).toBe(
          "REDUCE_75",
        );

        position =
          result.position;

        /**
         * ==================================================
         * STEP 6
         * THESIS INVALIDATED
         *
         * Entry ≈ 0.95
         * Current ≈ 0.45
         *
         * Deterioration ≈ 0.50
         *
         * Threshold:
         * invalidationDeterioration = 0.45
         *
         * Expected:
         * EXIT
         * ==================================================
         */

        result =
          await processPaperPositionUpdate({
            position,

            currentPrice: 100,

            atr: 1,

            slippagePercent: 0,

            monitorThesis: true,

            intelligence:
              buildDeterministicThesisIntelligence({
                longSupport:
                  0.45,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          result.position.status,
        ).not.toBe(
          "OPEN",
        );

        expect(
          result.exitReason,
        ).toBe(
          "THESIS_INVALIDATED",
        );

        expect(
          result.management
            ?.thesis
            ?.exposureAction,
        ).toBe(
          "EXIT",
        );
      },
    );
  },
);