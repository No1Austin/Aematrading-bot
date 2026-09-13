import {
  describe,
  test,
  expect,
} from "vitest";

import {
  executeApprovedPaperTrade,
  processPaperPositionUpdate,
} from "../execution/paperExecutionCoordinator.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildRiskApproval() {
  return {
    approved: true,

    status:
      "APPROVED",

    canExecute:
      true,

    side:
      "LONG",

    intelligenceScore:
      92,

    position: {
      shares:
        100,

      entryPrice:
        100,

      stopPrice:
        98,

      targetPrice:
        120,

      riskPerShare:
        2,

      dollarRisk:
        200,

      accountRiskPercent:
        0.5,
    },
  };
}

function buildEntryFingerprint() {
  return {
    version: 1,

    symbol:
      "AAPL",

    side:
      "LONG",

    asOfTimestamp:
      "2026-08-22T18:00:00.000Z",

    technical: {
      available: true,

      alignedSupport:
        0.9,

      oppositeSupport:
        0.1,
    },

    macro: {
      available: true,

      alignedSupport:
        0.85,

      oppositeSupport:
        0.15,
    },

    marketRegime: {
      available: true,

      alignedSupport:
        0.9,

      oppositeSupport:
        0.1,
    },

    consensus: {
      available: true,

      alignedSupport:
        0.88,

      oppositeSupport:
        0.12,
    },
  };
}

/**
 * ============================================================
 * ENTRY FINGERPRINT PERSISTENCE
 * ============================================================
 */

describe(
  "Paper Execution Fingerprint — Persistence",
  () => {
    test(
      "entry fingerprint is attached to opened paper position",
      () => {
        const entryFingerprint =
          buildEntryFingerprint();

        const result =
          executeApprovedPaperTrade({
            symbol:
              "AAPL",

            riskApproval:
              buildRiskApproval(),

            currentPrice:
              100,

            slippagePercent:
              0,

            metadata: {
              timestamp:
                "2026-08-22T18:00:00.000Z",

              entryFingerprint,
            },
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
          result.position,
        ).toBeTruthy();

        expect(
          result.position
            .entryFingerprint,
        ).toEqual(
          entryFingerprint,
        );
      },
    );

    test(
      "entry fingerprint survives normal position update",
      async () => {
        const entryFingerprint =
          buildEntryFingerprint();

        const entry =
          executeApprovedPaperTrade({
            symbol:
              "AAPL",

            riskApproval:
              buildRiskApproval(),

            currentPrice:
              100,

            slippagePercent:
              0,

            metadata: {
              timestamp:
                "2026-08-22T18:00:00.000Z",

              entryFingerprint,
            },
          });

        expect(
          entry.approved,
        ).toBe(true);

        const update =
          await processPaperPositionUpdate({
            position:
              entry.position,

            currentPrice:
              101,

            atr:
              1,

            slippagePercent:
              0,

            monitorThesis:
              false,

            asOfTimestamp:
              "2026-08-22T18:05:00.000Z",
          });

        expect(
          update.approved,
        ).toBe(true);

        expect(
          update.position
            .entryFingerprint,
        ).toEqual(
          entryFingerprint,
        );
      },
    );

    test(
      "entry fingerprint survives until position closes",
      async () => {
        const entryFingerprint =
          buildEntryFingerprint();

        const entry =
          executeApprovedPaperTrade({
            symbol:
              "AAPL",

            riskApproval:
              buildRiskApproval(),

            currentPrice:
              100,

            slippagePercent:
              0,

            metadata: {
              timestamp:
                "2026-08-22T18:00:00.000Z",

              entryFingerprint,
            },
          });

        expect(
          entry.approved,
        ).toBe(true);

        /**
         * Force the position through its hard stop.
         *
         * Entry = 100
         * Stop  = 98
         */

        const update =
          await processPaperPositionUpdate({
            position:
              entry.position,

            currentPrice:
              97.5,

            atr:
              1,

            slippagePercent:
              0,

            monitorThesis:
              false,

            asOfTimestamp:
              "2026-08-22T18:10:00.000Z",
          });

        expect(
          update.approved,
        ).toBe(true);

        expect(
          update.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          update.position
            .entryFingerprint,
        ).toEqual(
          entryFingerprint,
        );
      },
    );
  },
);

/**
 * ============================================================
 * FINGERPRINT IMMUTABILITY
 * ============================================================
 */

describe(
  "Paper Execution Fingerprint — Entry Snapshot",
  () => {
    test(
      "later intelligence does not replace entry fingerprint",
      async () => {
        const entryFingerprint =
          buildEntryFingerprint();

        const entry =
          executeApprovedPaperTrade({
            symbol:
              "AAPL",

            riskApproval:
              buildRiskApproval(),

            currentPrice:
              100,

            slippagePercent:
              0,

            metadata: {
              timestamp:
                "2026-08-22T18:00:00.000Z",

              entryFingerprint,
            },
          });

        const laterIntelligence = {
          technical: {
            approved: true,

            directionalSupport: {
              long:
                0.2,

              short:
                0.8,
            },
          },
        };

        const update =
          await processPaperPositionUpdate({
            position:
              entry.position,

            currentPrice:
              101,

            atr:
              1,

            slippagePercent:
              0,

            intelligence:
              laterIntelligence,

            monitorThesis:
              true,

            asOfTimestamp:
              "2026-08-22T18:05:00.000Z",
          });

        expect(
          update.position
            .entryFingerprint,
        ).toEqual(
          entryFingerprint,
        );

        expect(
          update.position
            .entryFingerprint
            .technical
            .alignedSupport,
        ).toBe(
          0.9,
        );
      },
    );
  },
);