// server/src/tests/manualOverrideManagedLifecycle.integration.test.js

import {
  describe,
  expect,
  test,
  vi,
} from "vitest";

import createPaperTradingSession from
  "../execution/paperTradingSession.js";

import {
  executeApprovedPaperTrade,
} from
  "../execution/paperExecutionCoordinator.js";

/**
 * ============================================================
 * PURPOSE
 * ============================================================
 *
 * This test closes the gap between:
 *
 *   "manual override can open a position"
 *
 * and:
 *
 *   "a manually entered position is genuinely managed by the
 *    normal bot lifecycle after entry."
 *
 * IMPORTANT:
 *
 * We intentionally stub ONLY the human-entry authorization step.
 *
 * After the position enters the session, this test uses the REAL:
 *
 * - paperTradingSession.updateOpenPosition()
 * - paperExecutionCoordinator.processPaperPositionUpdate()
 * - positionManager
 * - trailingEngine
 * - paper close path
 * - tradeHistoryStore
 *
 * Therefore the management/exit/history path is not mocked.
 */

const SYMBOL = "AAPL";

const ENTRY_TIMESTAMP =
  "2026-08-30T14:00:00.000Z";

function buildBelowThresholdAnalysis() {
  return {
    approved: true,

    symbol: SYMBOL,

    finalDecision: {
      symbol: SYMBOL,

      decision: "NO_TRADE",

      preferredSide: "LONG",

      preferredScore: 78,

      canProceedToRiskManager: true,

      riskApproved: false,

      canProceedToPaperExecution: false,

      timestamp:
        ENTRY_TIMESTAMP,
    },

    results: {
      scoring: {
        approved: true,

        status:
          "BELOW_THRESHOLD",

        symbol: SYMBOL,

        preferredSide:
          "LONG",

        preferredScore:
          78,

        minimumRequiredScore:
          80,

        requiredEnginesReady:
          true,

        eventFreeze:
          false,

        ambiguous:
          false,
      },

      events: {
        approved: true,

        status: "COMPLETE",

        eventFreeze: {
          active: false,
        },
      },

      tradeFingerprint: {
        approved: true,

        status: "COMPLETE",

        fingerprint: {
          version: 1,

          symbol: SYMBOL,

          side: "LONG",

          asOfTimestamp:
            ENTRY_TIMESTAMP,

          components: {
            technical: {
              available: true,

              alignedSupport:
                0.78,

              oppositeSupport:
                0.22,
            },

            marketRegime: {
              available: true,

              alignedSupport:
                0.75,

              oppositeSupport:
                0.25,
            },

            riskReward: {
              available: true,

              alignedSupport:
                1,

              oppositeSupport:
                0,
            },
          },
        },
      },

      riskApproval: {
        approved: false,

        status: "BLOCKED",

        canExecute: false,

        side: "LONG",

        intelligenceScore:
          78,

        position: null,
      },
    },
  };
}

function buildEntryIntelligence() {
  return {
    technical: {
      approved: true,

      status: "COMPLETE",

      directionalSupport: {
        long: 0.78,

        short: 0.22,
      },
    },

    marketRegime: {
      approved: true,

      status: "COMPLETE",

      regime: "BULL",

      directionalSupport: {
        long: 0.75,

        short: 0.25,
      },
    },

    events: {
      approved: true,

      status: "COMPLETE",

      eventFreeze: {
        active: false,
      },

      directionalSupport: {
        long: 0.7,

        short: 0.3,
      },
    },

    liquidity: {
      approved: true,

      status: "COMPLETE",

      qualityScore: 0.95,

      directionalSupport: {
        long: 0.75,

        short: 0.25,
      },
    },

    consensus: {
      approved: true,

      status: "COMPLETE",

      direction: "LONG",

      confidence: 0.78,

      directionalSupport: {
        long: 0.78,

        short: 0.22,
      },
    },
  };
}

/**
 * Build a position through the REAL paper execution coordinator.
 *
 * This is preferable to manually inventing trailing state because
 * executeApprovedPaperTrade() initializes the exact state expected
 * by positionManager/trailingEngine.
 */
function buildRealManualPosition() {
  const analysis =
    buildBelowThresholdAnalysis();

  const execution =
    executeApprovedPaperTrade({
      symbol:
        SYMBOL,

      riskApproval: {
        approved: true,

        status: "APPROVED",

        canExecute: true,

        side: "LONG",

        intelligenceScore:
          78,

        position: {
          shares: 10,

          entryPrice: 100,

          stopPrice: 98,

          /**
           * Keep the ordinary target well above the first
           * management tick. We want trailing/stop management,
           * not the profit target, to drive the lifecycle.
           */
          targetPrice: 120,

          riskPerShare: 2,

          dollarRisk: 20,

          accountRiskPercent:
            0.2,
        },

        reasons: [],

        warnings: [],
      },

      currentPrice: 100,

      slippagePercent: 0,

      intelligence:
        buildEntryIntelligence(),

      metadata: {
        timestamp:
          ENTRY_TIMESTAMP,

        entryMode:
          "HUMAN_OVERRIDE",

        managementMode:
          "BOT",

        managedByBot:
          true,

        entryFingerprint:
          analysis.results
            .tradeFingerprint
            .fingerprint,

        tradeFingerprint:
          analysis.results
            .tradeFingerprint,
      },
    });

  expect(
    execution.approved,
  ).toBe(true);

  expect(
    execution.position,
  ).toBeTruthy();

  return {
    ...execution.position,

    entryMode:
      "HUMAN_OVERRIDE",

    managementMode:
      "BOT",

    managedByBot:
      true,

    entryFingerprint:
      analysis.results
        .tradeFingerprint
        .fingerprint,

    metadata: {
      ...(
        execution.position
          ?.metadata ??
        {}
      ),

      entryMode:
        "HUMAN_OVERRIDE",

      managementMode:
        "BOT",

      managedByBot:
        true,
    },
  };
}

function buildManualOverrideCoordinator() {
  return vi.fn(
    () => ({
      approved: true,

      engine:
        "MANUAL_ENTRY_OVERRIDE",

      status:
        "EXECUTED",

      symbol:
        SYMBOL,

      side:
        "LONG",

      score:
        78,

      entryAuthorized:
        true,

      riskApproved:
        true,

      executed:
        true,

      overrideScope:
        "ONE_ENTRY_ONLY",

      managementMode:
        "BOT",

      position:
        buildRealManualPosition(),

      reasons: [
        "Human override was accepted for this entry only.",
        "Position has been handed to the normal bot position-management pipeline.",
      ],

      warnings: [],

      errors: [],
    }),
  );
}

describe(
  "Manual Override — Real Managed Lifecycle",
  () => {
    test(
      "78 remains below the autonomous threshold before human override",
      () => {
        const session =
          createPaperTradingSession();

        const result =
          session.openApprovedTrade({
            analysis:
              buildBelowThresholdAnalysis(),

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          session.position,
        ).toBeNull();

        expect(
          session.historySize,
        ).toBe(0);
      },
    );

    test(
      "human-entered 78 position is handed to the real bot management lifecycle",
      () => {
        const manualOverrideCoordinator =
          buildManualOverrideCoordinator();

        const session =
          createPaperTradingSession({
            manualOverrideCoordinator,
          });

        const opened =
          session.openManualOverrideTrade({
            analysis:
              buildBelowThresholdAnalysis(),

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          opened.approved,
        ).toBe(true);

        expect(
          opened.executed,
        ).toBe(true);

        expect(
          manualOverrideCoordinator,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          session.position,
        ).toBeTruthy();

        expect(
          session.position
            .entryMode,
        ).toBe(
          "HUMAN_OVERRIDE",
        );

        expect(
          session.position
            .managementMode,
        ).toBe(
          "BOT",
        );

        expect(
          session.position
            .managedByBot,
        ).toBe(true);

        /**
         * The one-time authorization must not mutate the
         * original autonomous threshold.
         */
        expect(
          buildBelowThresholdAnalysis()
            .results
            .scoring
            .minimumRequiredScore,
        ).toBe(80);
      },
    );

    test(
      "real position manager keeps the manual position open while protection remains valid",
      async () => {
        const session =
          createPaperTradingSession({
            manualOverrideCoordinator:
              buildManualOverrideCoordinator(),
          });

        session
          .openManualOverrideTrade({
            analysis:
              buildBelowThresholdAnalysis(),

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        const initialStop =
          Number(
            session.position
              ?.trailingState
              ?.currentStopPrice ??
            session.position
              ?.stopPrice,
          );

        expect(
          Number.isFinite(
            initialStop,
          ),
        ).toBe(true);

        /**
         * +1R move:
         *
         * Entry = 100
         * Initial stop = 98
         * Original risk/share = 2
         * Price = 102
         *
         * This gives the real trailing engine a profitable tick
         * while staying far below the 120 target.
         */
        const updated =
          await session
            .updateOpenPosition({
              currentPrice:
                102,

              atr:
                1,

              slippagePercent:
                0,

              monitorThesis:
                false,

              asOfTimestamp:
                "2026-08-30T14:05:00.000Z",
            });

        expect(
          updated.approved,
        ).toBe(true);

        expect(
          updated.status,
        ).toBe(
          "POSITION_UPDATED",
        );

        expect(
          session.position,
        ).toBeTruthy();

        expect(
          session.position
            .managedByBot,
        ).toBe(true);

        const updatedStop =
          Number(
            session.position
              ?.trailingState
              ?.currentStopPrice ??
            session.position
              ?.stopPrice,
          );

        expect(
          Number.isFinite(
            updatedStop,
          ),
        ).toBe(true);

        /**
         * Protection on a LONG must never loosen below the
         * original stop.
         */
        expect(
          updatedStop,
        ).toBeGreaterThanOrEqual(
          initialStop,
        );

        expect(
          session.historySize,
        ).toBe(0);
      },
    );

    test(
      "real trailing/stop path exits the human-entered trade and persists it to history",
      async () => {
        const session =
          createPaperTradingSession({
            manualOverrideCoordinator:
              buildManualOverrideCoordinator(),
          });

        const opened =
          session
            .openManualOverrideTrade({
              analysis:
                buildBelowThresholdAnalysis(),

              currentPrice:
                100,

              slippagePercent:
                0,
            });

        expect(
          opened.approved,
        ).toBe(true);

        /**
         * First give the real trailing engine favorable movement.
         */
        const favorable =
          await session
            .updateOpenPosition({
              currentPrice:
                102,

              atr:
                1,

              slippagePercent:
                0,

              monitorThesis:
                false,

              asOfTimestamp:
                "2026-08-30T14:05:00.000Z",
            });

        expect(
          favorable.approved,
        ).toBe(true);

        expect(
          favorable.status,
        ).toBe(
          "POSITION_UPDATED",
        );

        const activeStop =
          Number(
            session.position
              ?.trailingState
              ?.currentStopPrice ??
            session.position
              ?.stopPrice,
          );

        expect(
          Number.isFinite(
            activeStop,
          ),
        ).toBe(true);

        /**
         * Cross the REAL active stop.
         *
         * We derive this price from the engine's own state instead
         * of assuming a particular trailing configuration.
         */
        const stopCrossPrice =
          Math.max(
            0.01,
            activeStop - 0.25,
          );

        const closed =
          await session
            .updateOpenPosition({
              currentPrice:
                stopCrossPrice,

              atr:
                1,

              slippagePercent:
                0,

              monitorThesis:
                false,

              asOfTimestamp:
                "2026-08-30T14:10:00.000Z",
            });

        expect(
          closed.approved,
        ).toBe(true);

        expect(
          closed.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          closed.management
            ?.shouldExit,
        ).toBe(true);

        expect(
          closed.exitReason,
        ).toBeTruthy();

        expect(
          session.position,
        ).toBeNull();

        /**
         * The paper execution coordinator stores the completed
         * trade through the session's real history store.
         */
        expect(
          session.historySize,
        ).toBe(1);

        const history =
          session.getHistory();

        expect(
          history,
        ).toHaveLength(1);

        const completed =
          history[0];

        expect(
          completed.symbol,
        ).toBe(
          SYMBOL,
        );

        expect(
          completed.side,
        ).toBe(
          "LONG",
        );

        expect(
          completed.status,
        ).toBe(
          "CLOSED",
        );

        expect(
          completed.closedAt,
        ).toBe(
          "2026-08-30T14:10:00.000Z",
        );

        expect(
          completed.exitReason,
        ).toBeTruthy();

        expect(
          completed.entryFingerprint,
        ).toEqual(
          buildBelowThresholdAnalysis()
            .results
            .tradeFingerprint
            .fingerprint,
        );
      },
    );

    test(
      "completed manual trade becomes historical input for the next analysis",
      async () => {
        const analysisCalls =
          [];

        const analysisRunner =
          vi.fn(
            async (input) => {
              analysisCalls.push(
                input,
              );

              return {
                ...buildBelowThresholdAnalysis(),

                /**
                 * Keep the next analysis below autonomous entry.
                 * We only care that history is supplied.
                 */
                approved: true,
              };
            },
          );

        const session =
          createPaperTradingSession({
            analysisRunner,

            manualOverrideCoordinator:
              buildManualOverrideCoordinator(),
          });

        session
          .openManualOverrideTrade({
            analysis:
              buildBelowThresholdAnalysis(),

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        await session
          .updateOpenPosition({
            currentPrice:
              102,

            atr:
              1,

            slippagePercent:
              0,

            monitorThesis:
              false,

            asOfTimestamp:
              "2026-08-30T14:05:00.000Z",
          });

        const activeStop =
          Number(
            session.position
              ?.trailingState
              ?.currentStopPrice ??
            session.position
              ?.stopPrice,
          );

        const stopCrossPrice =
          Math.max(
            0.01,
            activeStop - 0.25,
          );

        const closed =
          await session
            .updateOpenPosition({
              currentPrice:
                stopCrossPrice,

              atr:
                1,

              slippagePercent:
                0,

              monitorThesis:
                false,

              asOfTimestamp:
                "2026-08-30T14:10:00.000Z",
            });

        expect(
          closed.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          session.historySize,
        ).toBe(1);

        await session.analyze({
          symbol:
            SYMBOL,

          candles: [
            {
              close:
                101,
            },
          ],
        });

        expect(
          analysisRunner,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          analysisCalls,
        ).toHaveLength(1);

        /**
         * The session's existing learning contract supplies
         * completed bot trades to subsequent analysis.
         */
        /**
         * IMPORTANT:
         *
         * paperTradingSession deliberately keeps these two history
         * channels separate:
         *
         * - historicalRecords = market historical analogue data
         * - botTradeHistory   = the bot/session's completed trades
         *
         * historicalRecords is expected to remain [] here.
         * The completed manual trade must appear in botTradeHistory.
         */
        expect(
          analysisCalls[0]
            ?.historicalRecords,
        ).toEqual([]);

        const suppliedHistory =
          analysisCalls[0]
            ?.botTradeHistory ??
          [];

        expect(
          suppliedHistory,
        ).toHaveLength(1);

        expect(
          suppliedHistory[0]
            .symbol,
        ).toBe(
          SYMBOL,
        );

        expect(
          suppliedHistory[0]
            .status,
        ).toBe(
          "CLOSED",
        );
      },
    );
  },
);
