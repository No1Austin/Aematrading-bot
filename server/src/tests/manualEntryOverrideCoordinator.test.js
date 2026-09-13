// server/src/tests/manualEntryOverrideCoordinator.test.js

import {
  describe,
  expect,
  test,
  vi,
} from "vitest";

/**
 * ============================================================
 * MOCK NORMAL RISK LAYER
 * ============================================================
 */

vi.mock(
  "../risk/tradeRiskAdapter.js",
  () => ({
    default: vi.fn(() => ({
      approved: true,
      status: "APPROVED",
      canExecute: true,
      side: "LONG",
      intelligenceScore: 78,

      position: {
        shares: 10,
        entryPrice: 100,
        stopPrice: 98,
        targetPrice: 106,
        riskPerShare: 2,
        dollarRisk: 20,
        accountRiskPercent: 0.2,
      },

      reasons: [],
      warnings: [],
    })),
  }),
);

/**
 * ============================================================
 * MOCK NORMAL PAPER EXECUTION LAYER
 * ============================================================
 */

vi.mock(
  "../execution/paperExecutionCoordinator.js",
  () => ({
    executeApprovedPaperTrade:
      vi.fn(
        ({
          symbol,
          riskApproval,
          metadata,
        }) => ({
          approved: true,
          status: "POSITION_OPEN",

          position: {
            id: "manual-test",

            symbol,

            side:
              riskApproval.side,

            shares:
              riskApproval
                .position
                .shares,

            entryPrice:
              riskApproval
                .position
                .entryPrice,

            stopPrice:
              riskApproval
                .position
                .stopPrice,

            targetPrice:
              riskApproval
                .position
                .targetPrice,

            metadata,
          },

          errors: [],
          warnings: [],
        }),
      ),
  }),
);

import {
  evaluateManualEntryOverride,
  executeManualPaperEntryOverride,
} from "../execution/manualEntryOverrideCoordinator.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildAnalysis({
  score = 78,
  eventFreeze = false,
  ambiguous = false,
  requiredEnginesReady = true,
} = {}) {
  return {
    approved: true,

    symbol: "AAPL",

    finalDecision: {
      symbol: "AAPL",

      preferredSide:
        "LONG",

      preferredScore:
        score,

      timestamp:
        "2026-08-30T14:00:00.000Z",
    },

    results: {
      scoring: {
        approved: true,

        status:
          score >= 80
            ? "TRADE_ELIGIBLE"
            : "BELOW_THRESHOLD",

        symbol: "AAPL",

        preferredSide:
          "LONG",

        preferredScore:
          score,

        minimumRequiredScore:
          80,

        eventFreeze,

        ambiguous,

        requiredEnginesReady,
      },

      events: {
        approved: true,

        eventFreeze: {
          active:
            eventFreeze,
        },
      },

      technical: {
        indicators: {
          atr: {
            value: 2,
          },
        },
      },

      liquidity: {
        approved: true,
        status: "COMPLETE",
      },

      marketRegime: {
        approved: true,
        status: "COMPLETE",
      },

      consensus: {
        approved: true,
        status: "COMPLETE",
      },

      tradeFingerprint: {
        approved: true,
        status: "COMPLETE",

        fingerprint: {
          version: 1,
          symbol: "AAPL",
          side: "LONG",

          asOfTimestamp:
            "2026-08-30T14:00:00.000Z",
        },
      },
    },
  };
}

function buildAccount(
  overrides = {},
) {
  return {
    balance:
      10_000,

    equity:
      10_000,

    buyingPower:
      10_000,

    riskPercent:
      0.5,

    status:
      "ACTIVE",

    tradingBlocked:
      false,

    accountBlocked:
      false,

    shortingEnabled:
      true,

    dailyPnL:
      0,

    openPositions:
      [],

    portfolioExposure:
      0,

    ...overrides,
  };
}

/**
 * ============================================================
 * TESTS
 * ============================================================
 */

describe(
  "Manual Entry Override Coordinator",
  () => {
    test(
      "allows a below-80 score for one-time override review",
      () => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score: 78,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.overrideScope,
        ).toBe(
          "ONE_ENTRY_ONLY",
        );
      },
    );

    test(
      "zero is valid manual-score territory",
      () => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score: 0,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.entryAuthorized,
        ).toBe(true);
      },
    );

    test(
      "79.99 is still valid manual-score territory",
      () => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score:
                  79.99,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(true);
      },
    );

    test(
      "80+ score uses normal autonomous path instead",
      () => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score: 82,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.reasons.some(
            reason =>
              reason.includes(
                "autonomous score threshold",
              ),
          ),
        ).toBe(true);
      },
    );

    test(
      "event freeze cannot be overridden",
      () => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score: 20,

                eventFreeze:
                  true,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(false);
      },
    );

    test(
      "successful override hands position to bot",
      () => {
        const result =
          executeManualPaperEntryOverride({
            analysis:
              buildAnalysis({
                score: 45,
              }),

            account:
              buildAccount(),

            currentPrice:
              100,

            slippagePercent:
              0,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.executed,
        ).toBe(true);

        expect(
          result.position
            .entryMode,
        ).toBe(
          "HUMAN_OVERRIDE",
        );

        expect(
          result.position
            .managementMode,
        ).toBe(
          "BOT",
        );

        expect(
          result.position
            .managedByBot,
        ).toBe(true);
      },
    );
  },
);
