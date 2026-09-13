import {
  describe,
  test,
  expect,
} from "vitest";

import {
  executeApprovedPaperTrade,
  processPaperPositionUpdate,
} from "../execution/paperExecutionCoordinator.js";

import createTradeHistoryStore from
  "../history/tradeHistoryStore.js";

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

    components: {
      technical: {
        available: true,
        alignedSupport: 0.9,
        oppositeSupport: 0.1,
      },

      macro: {
        available: true,
        alignedSupport: 0.85,
        oppositeSupport: 0.15,
      },

      marketRegime: {
        available: true,
        alignedSupport: 0.9,
        oppositeSupport: 0.1,
      },

      consensus: {
        available: true,
        alignedSupport: 0.88,
        oppositeSupport: 0.12,
      },
    },
  };
}

function openPosition() {
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

  return {
    position:
      result.position,

    entryFingerprint,
  };
}

describe(
  "Paper Trade History Persistence",
  () => {
    test(
      "closed paper trade is automatically stored",
      async () => {
        const historyStore =
          createTradeHistoryStore();

        const {
          position,
        } =
          openPosition();

        const result =
          await processPaperPositionUpdate({
            position,

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

            historyStore,
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
          historyStore.size,
        ).toBe(1);

        expect(
          result.history
            ?.approved,
        ).toBe(true);
      },
    );

    test(
      "stored trade preserves entry fingerprint",
      async () => {
        const historyStore =
          createTradeHistoryStore();

        const {
          position,
          entryFingerprint,
        } =
          openPosition();

        await processPaperPositionUpdate({
          position,

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

          historyStore,
        });

        const records =
          historyStore
            .exportRecords();

        expect(
          records,
        ).toHaveLength(1);

        expect(
          records[0]
            .entryFingerprint,
        ).toEqual(
          entryFingerprint,
        );
      },
    );

    test(
      "stored losing trade is classified as LOSS",
      async () => {
        const historyStore =
          createTradeHistoryStore();

        const {
          position,
        } =
          openPosition();

        await processPaperPositionUpdate({
          position,

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

          historyStore,
        });

        const [
          stored,
        ] =
          historyStore
            .exportRecords();

        expect(
          stored.outcome,
        ).toBe(
          "LOSS",
        );

        expect(
          stored.realizedPnL,
        ).toBeLessThan(0);

        expect(
          stored.finalR,
        ).toBeLessThan(0);
      },
    );

    test(
      "duplicate trade cannot create duplicate history",
      async () => {
        const historyStore =
          createTradeHistoryStore();

        const {
          position,
        } =
          openPosition();

        const first =
          await processPaperPositionUpdate({
            position,

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

            historyStore,
          });

        expect(
          first.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          historyStore.size,
        ).toBe(1);

        const stored =
          historyStore
            .exportRecords()[0];

        const duplicate =
          historyStore
            .storeTrade(
              stored,
            );

        expect(
          duplicate.approved,
        ).toBe(false);

        expect(
          duplicate.status,
        ).toBe(
          "DUPLICATE",
        );

        expect(
          historyStore.size,
        ).toBe(1);
      },
    );

    test(
      "normal close still works without a history store",
      async () => {
        const {
          position,
        } =
          openPosition();

        const result =
          await processPaperPositionUpdate({
            position,

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
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "POSITION_CLOSED",
        );

        expect(
          result.history,
        ).toBeNull();
      },
    );
  },
);