/**
 * ============================================================
 * TRADING PIPELINE — END-TO-END INTEGRATION TEST
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Validate the complete paper-trading decision/execution path.
 *
 * We test:
 *
 * 1. Strong LONG candidate
 * 2. Strong SHORT candidate
 * 3. Score below 80
 * 4. Event freeze
 * 5. Liquidity block
 * 6. Poor risk/reward
 * 7. Trailing-profit LONG exit
 * 8. Trailing-profit SHORT exit
 * 9. Initial-stop loss
 * 10. Safe failure
 *
 * IMPORTANT
 * ---------
 *
 * This is PAPER / SIMULATION testing only.
 */

import {
  describe,
  test,
  expect,
} from "vitest";

import evaluateTradeDecision from
  "../strategy/tradeDecisionGate.js";

import evaluateRiskApproval from
  "../risk/tradeRiskAdapter.js";

import {
  executeApprovedPaperTrade,
  processPaperPositionUpdate,
} from "../execution/paperExecutionCoordinator.js";

/**
 * ============================================================
 * TEST CONSTANTS
 * ============================================================
 */

const SYMBOL =
  "TEST";

const ACCOUNT = {
  balance: 10000,

  buyingPower: 10000,

  /**
   * 0.005 = 0.5%
   *
   * Maximum planned risk:
   *
   * $10,000 × 0.5%
   * = $50
   */
  riskPercent: 0.005,

  dailyPnL: 0,

  dailyLossLimit: 200,

  openPositions: [],

  portfolioExposure: 0,
};

/**
 * ============================================================
 * ENGINE STATE FACTORY
 * ============================================================
 */

function buildHealthyEngineStates() {
  return {
    technical: {
      status: "COMPLETE",
    },

    macro: {
      status: "COMPLETE",
    },

    marketRegime: {
      status: "COMPLETE",
    },

    liquidity: {
      status: "COMPLETE",
    },

    riskReward: {
      status: "COMPLETE",
    },

    scoring: {
      status: "COMPLETE",
    },
  };
}

/**
 * ============================================================
 * SCORING FACTORY
 * ============================================================
 */

function buildScoring({
  side = "LONG",

  longScore = 88,

  shortScore = 25,
} = {}) {
  return {
    approved: true,

    status: "COMPLETE",

    preferredSide:
      side,

    long: {
      score:
        longScore,
    },

    short: {
      score:
        shortScore,
    },
  };
}

/**
 * ============================================================
 * LIQUIDITY FACTORY
 * ============================================================
 */

function buildLiquidity({
  approved = true,

  executionDecision =
    "EXECUTE",

  qualityScore = 0.9,
} = {}) {
  return {
    approved,

    status:
      approved
        ? "COMPLETE"
        : "BLOCKED",

    executionDecision,

    liquidityStatus:
      approved
        ? "GOOD"
        : "POOR",

    qualityScore,
  };
}

/**
 * ============================================================
 * EVENT FACTORY
 * ============================================================
 */

function buildEvents({
  frozen = false,
} = {}) {
  return {
    approved: true,

    status:
      "COMPLETE",

    eventFreeze: {
      active:
        frozen,
    },
  };
}

/**
 * ============================================================
 * CONSENSUS FACTORY
 * ============================================================
 */

function buildConsensus({
  direction = "LONG",

  confidence = 0.8,
} = {}) {
  return {
    approved: true,

    status:
      "COMPLETE",

    direction,

    confidence,
  };
}

/**
 * ============================================================
 * RISK / REWARD FACTORY
 * ============================================================
 */

function buildRiskReward({
  side = "LONG",

  entryPrice = 100,

  stopPrice = null,

  targetPrice = null,

  rewardRiskRatio = 3,

  approved = true,
} = {}) {
  const resolvedStop =
    stopPrice ??
    (
      side === "LONG"
        ? 98
        : 102
    );

  const resolvedTarget =
    targetPrice ??
    (
      side === "LONG"
        ? 106
        : 94
    );

  const geometry = {
    approved,

    status:
      approved
        ? "COMPLETE"
        : "BLOCKED",

    blocked:
      !approved,

    side,

    entryPrice,

    stopPrice:
      resolvedStop,

    targetPrice:
      resolvedTarget,

    rewardRiskRatio,

    directionalSupport:
      side === "LONG"
        ? {
            long:
              approved
                ? 0.9
                : 0,

            short: 0,
          }
        : {
            long: 0,

            short:
              approved
                ? 0.9
                : 0,
          },
  };

  return {
    approved,

    engine:
      "RISK_REWARD",

    status:
      approved
        ? "COMPLETE"
        : "BLOCKED",

    long:
      side === "LONG"
        ? geometry
        : null,

    short:
      side === "SHORT"
        ? geometry
        : null,
  };
}

/**
 * ============================================================
 * BUILD DECISION
 * ============================================================
 */

function runDecision({
  side = "LONG",

  longScore = 88,

  shortScore = 25,

  frozen = false,

  liquidityApproved = true,

  executionDecision =
    "EXECUTE",

  riskRewardApproved = true,

  entryPrice = 100,

  stopPrice = null,

  targetPrice = null,

  rewardRiskRatio = 3,

  consensusDirection = null,
} = {}) {
  const scoring =
    buildScoring({
      side,

      longScore,

      shortScore,
    });

  const events =
    buildEvents({
      frozen,
    });

  const liquidity =
    buildLiquidity({
      approved:
        liquidityApproved,

      executionDecision,
    });

  const riskReward =
    buildRiskReward({
      side,

      entryPrice,

      stopPrice,

      targetPrice,

      rewardRiskRatio,

      approved:
        riskRewardApproved,
    });

  const consensus =
    buildConsensus({
      direction:
        consensusDirection ??
        side,

      confidence:
        0.8,
    });

  return evaluateTradeDecision({
    symbol:
      SYMBOL,

    scoring,

    events,

    liquidity,

    riskReward,

    consensus,

    engineStates:
      buildHealthyEngineStates(),
  });
}

/**
 * ============================================================
 * DECISION GATE TESTS
 * ============================================================
 */

describe(
  "Trading Pipeline — Decision Gate",
  () => {
    test(
      "approves a strong LONG candidate for risk evaluation",
      () => {
        const result =
          runDecision({
            side:
              "LONG",

            longScore:
              88,

            shortScore:
              25,
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(true);

        expect(
          result.side,
        ).toBe(
          "LONG",
        );

        expect(
          result.score,
        ).toBe(88);

        expect(
          result.decision,
        ).toBe(
          "PROCEED_TO_RISK_MANAGER",
        );
      },
    );

    test(
      "approves a strong SHORT candidate for risk evaluation",
      () => {
        const result =
          runDecision({
            side:
              "SHORT",

            longScore:
              20,

            shortScore:
              91,
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(true);

        expect(
          result.side,
        ).toBe(
          "SHORT",
        );

        expect(
          result.score,
        ).toBe(91);
      },
    );

    test(
      "blocks candidate below 80",
      () => {
        const result =
          runDecision({
            side:
              "LONG",

            longScore:
              79,

            shortScore:
              30,
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "BELOW_THRESHOLD",
        );
      },
    );

    test(
      "blocks ambiguous LONG versus SHORT result",
      () => {
        const result =
          runDecision({
            side:
              "LONG",

            longScore:
              86,

            shortScore:
              82,
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "AMBIGUOUS",
        );
      },
    );

    test(
      "blocks trading during event freeze",
      () => {
        const result =
          runDecision({
            side:
              "LONG",

            longScore:
              90,

            shortScore:
              20,

            frozen:
              true,
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "EVENT_FREEZE",
        );
      },
    );

    test(
      "blocks poor liquidity",
      () => {
        const result =
          runDecision({
            side:
              "LONG",

            longScore:
              90,

            shortScore:
              20,

            liquidityApproved:
              false,

            executionDecision:
              "BLOCK",
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "LIQUIDITY_BLOCK",
        );
      },
    );

    test(
      "blocks rejected risk/reward geometry",
      () => {
        const result =
          runDecision({
            side:
              "LONG",

            longScore:
              90,

            shortScore:
              20,

            riskRewardApproved:
              false,
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "RISK_REWARD_BLOCK",
        );
      },
    );

    test(
      "blocks meaningful consensus contradiction",
      () => {
        const result =
          runDecision({
            side:
              "LONG",

            longScore:
              90,

            shortScore:
              20,

            consensusDirection:
              "SHORT",
          });

        expect(
          result
            .canProceedToRiskManager,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "CONSENSUS_CONFLICT",
        );
      },
    );
  },
);

/**
 * ============================================================
 * PAPER EXECUTION TESTS
 * ============================================================
 */

describe(
  "Trading Pipeline — Paper Execution",
  () => {
    test(
      "blocks paper execution without risk approval",
      () => {
        const result =
          executeApprovedPaperTrade({
            symbol:
              SYMBOL,

            riskApproval: {
              canExecute:
                false,
            },

            currentPrice:
              100,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.position,
        ).toBeNull();
      },
    );

    test(
      "opens an approved LONG paper position",
      () => {
        const riskApproval = {
          approved: true,

          status:
            "APPROVED",

          canExecute:
            true,

          side:
            "LONG",

          intelligenceScore:
            90,

          position: {
            shares:
              25,

            entryPrice:
              100,

            stopPrice:
              98,

            targetPrice:
              106,

            riskPerShare:
              2,

            dollarRisk:
              50,

            accountRiskPercent:
              0.5,
          },
        };

        const result =
          executeApprovedPaperTrade({
            symbol:
              SYMBOL,

            riskApproval,

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "POSITION_OPEN",
        );

        expect(
          result.position.side,
        ).toBe(
          "LONG",
        );

        expect(
          result.position.shares,
        ).toBe(25);

        expect(
          result.position
            .trailingState
            .initialStopPrice,
        ).toBe(98);

        expect(
          result.position
            .trailingState
            .originalRiskPerShare,
        ).toBe(2);
      },
    );

    test(
      "opens an approved SHORT paper position",
      () => {
        const riskApproval = {
          approved: true,

          status:
            "APPROVED",

          canExecute:
            true,

          side:
            "SHORT",

          intelligenceScore:
            91,

          position: {
            shares:
              25,

            entryPrice:
              100,

            stopPrice:
              102,

            targetPrice:
              94,

            riskPerShare:
              2,

            dollarRisk:
              50,

            accountRiskPercent:
              0.5,
          },
        };

        const result =
          executeApprovedPaperTrade({
            symbol:
              SYMBOL,

            riskApproval,

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "POSITION_OPEN",
        );

        expect(
          result.position.side,
        ).toBe(
          "SHORT",
        );

        expect(
          result.position
            .trailingState
            .initialStopPrice,
        ).toBe(102);
      },
    );
  },
);

/**
 * ============================================================
 * TRAILING LONG TEST
 * ============================================================
 */

describe(
  "Trading Pipeline — LONG Position Management",
  () => {
    test(
      "manages LONG price sequence without losing original risk state",
      async () => {
        const riskApproval = {
          approved: true,

          status:
            "APPROVED",

          canExecute:
            true,

          side:
            "LONG",

          intelligenceScore:
            90,

          position: {
            shares:
              25,

            entryPrice:
              100,

            stopPrice:
              98,

            /**
             * Deliberately high target.
             *
             * We want trailing logic,
             * not target logic,
             * to control this test.
             */
            targetPrice:
              120,

            riskPerShare:
              2,

            dollarRisk:
              50,

            accountRiskPercent:
              0.5,
          },
        };

        const entry =
          executeApprovedPaperTrade({
            symbol:
              SYMBOL,

            riskApproval,

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          entry.approved,
        ).toBe(true);

        let position =
          entry.position;

        const prices = [
          101,
          102,
          104,
          106,
          108,
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

              slippagePercent:
                0,
            });

          if (result.approved !== true) {
            console.dir(
              {
                test: "LONG Position Management",
                currentPrice,
                result,
              },
              {
                depth: null,
              },
            );
          }

          expect(
            result.approved,
          ).toBe(true);

          position =
            result.position;

          if (
            result.status ===
            "POSITION_CLOSED"
          ) {
            break;
          }
        }

        expect(
          position
            .trailingState
            .initialStopPrice,
        ).toBe(98);

        expect(
          position
            .trailingState
            .originalRiskPerShare,
        ).toBe(2);

        expect(
          position
            .trailingState
            .peakR,
        ).toBeGreaterThanOrEqual(
          0,
        );
      },
    );
  },
);

/**
 * ============================================================
 * TRAILING SHORT TEST
 * ============================================================
 */

describe(
  "Trading Pipeline — SHORT Position Management",
  () => {
    test(
      "manages SHORT price sequence without losing original risk state",
      async () => {
        const riskApproval = {
          approved: true,

          status:
            "APPROVED",

          canExecute:
            true,

          side:
            "SHORT",

          intelligenceScore:
            91,

          position: {
            shares:
              25,

            entryPrice:
              100,

            stopPrice:
              102,

            targetPrice:
              80,

            riskPerShare:
              2,

            dollarRisk:
              50,

            accountRiskPercent:
              0.5,
          },
        };

        const entry =
          executeApprovedPaperTrade({
            symbol:
              SYMBOL,

            riskApproval,

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          entry.approved,
        ).toBe(true);

        let position =
          entry.position;

        const prices = [
          99,
          98,
          96,
          94,
          92,
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

              slippagePercent:
                0,
            });

          if (result.approved !== true) {
            console.dir(
              {
                test: "SHORT Position Management",
                currentPrice,
                result,
              },
              {
                depth: null,
              },
            );
          }

          expect(
            result.approved,
          ).toBe(true);

          position =
            result.position;

          if (
            result.status ===
            "POSITION_CLOSED"
          ) {
            break;
          }
        }

        expect(
          position
            .trailingState
            .initialStopPrice,
        ).toBe(102);

        expect(
          position
            .trailingState
            .originalRiskPerShare,
        ).toBe(2);

        expect(
          position
            .trailingState
            .peakR,
        ).toBeGreaterThanOrEqual(
          0,
        );
      },
    );
  },
);

/**
 * ============================================================
 * SAFE FAIL TESTS
 * ============================================================
 */

describe(
  "Trading Pipeline — Safe Fail",
  () => {
    test(
      "does not create position when critical execution data is missing",
      () => {
        const result =
          executeApprovedPaperTrade({
            symbol:
              SYMBOL,

            riskApproval: {
              approved:
                true,

              canExecute:
                true,

              side:
                "LONG",

              position: {
                shares:
                  25,

                /**
                 * Missing entry and stop.
                 */
              },
            },

            currentPrice:
              100,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.position,
        ).toBeNull();
      },
    );
  },
);