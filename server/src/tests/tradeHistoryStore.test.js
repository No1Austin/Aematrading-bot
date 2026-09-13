import {
  describe,
  test,
  expect,
  beforeEach,
} from "vitest";

import createTradeHistoryStore, {
  normalizeCompletedTrade,
  TRADE_HISTORY_STATUS,
} from "../history/tradeHistoryStore.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildFingerprint({
  symbol = "AAPL",
  side = "LONG",
  timestamp =
    "2026-08-22T14:00:00.000Z",
  version = 1,
} = {}) {
  return {
    version,

    symbol,

    side,

    asOfTimestamp:
      timestamp,

    technical: {
      available: true,
      alignedSupport: 0.9,
      oppositeSupport: 0.1,
    },

    macro: {
      available: true,
      alignedSupport: 0.8,
      oppositeSupport: 0.2,
    },

    marketRegime: {
      available: true,
      alignedSupport: 0.85,
      oppositeSupport: 0.15,
    },

    consensus: {
      available: true,
      alignedSupport: 0.88,
      oppositeSupport: 0.12,
    },

    scoring: {
      available: true,
      sideScore: 92,
      oppositeScore: 18,
      scoreGap: 74,
    },
  };
}

function buildTrade({
  id = "trade-001",
  symbol = "AAPL",
  side = "LONG",
  status = "CLOSED",

  openedAt =
    "2026-08-22T14:00:00.000Z",

  closedAt =
    "2026-08-22T14:30:00.000Z",

  realizedPnL = 120,
  finalR = 2.4,
  peakR = 3.1,

  entryPrice = 100,
  exitPrice = 104,

  originalShares = 50,

  exitReason =
    "TARGET_REACHED",

  fingerprintVersion = 1,
} = {}) {
  return {
    id,

    symbol,

    side,

    status,

    openedAt,

    closedAt,

    entryPrice,

    exitPrice,

    originalShares,

    realizedPnL,

    finalR,

    peakR,

    exitReason,

    entryFingerprint:
      buildFingerprint({
        symbol,
        side,
        timestamp:
          openedAt,
        version:
          fingerprintVersion,
      }),

    reductionHistory: [],

    metadata: {
      test: true,
    },
  };
}

/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

describe(
  "Trade History Store — Normalization",
  () => {
    test(
      "normalizes a valid completed trade",
      () => {
        const result =
          normalizeCompletedTrade({
            trade:
              buildTrade(),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          TRADE_HISTORY_STATUS
            .COMPLETE,
        );

        expect(
          result.record.id,
        ).toBe(
          "trade-001",
        );

        expect(
          result.record.symbol,
        ).toBe("AAPL");

        expect(
          result.record.side,
        ).toBe("LONG");

        expect(
          result.record.status,
        ).toBe("CLOSED");

        expect(
          result.record.outcome,
        ).toBe("WIN");

        expect(
          result.record.realizedPnL,
        ).toBe(120);

        expect(
          result.record.finalR,
        ).toBe(2.4);

        expect(
          result.record.peakR,
        ).toBe(3.1);

        expect(
          result.record
            .durationMs,
        ).toBe(
          30 * 60 * 1000,
        );
      },
    );

    test(
      "classifies loss correctly",
      () => {
        const result =
          normalizeCompletedTrade({
            trade:
              buildTrade({
                id:
                  "trade-loss",

                realizedPnL:
                  -75,

                finalR:
                  -1,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.record.outcome,
        ).toBe("LOSS");
      },
    );

    test(
      "classifies breakeven correctly",
      () => {
        const result =
          normalizeCompletedTrade({
            trade:
              buildTrade({
                id:
                  "trade-flat",

                realizedPnL:
                  0,

                finalR:
                  0,
              }),
          });

        expect(
          result.record.outcome,
        ).toBe(
          "BREAKEVEN",
        );
      },
    );

    test(
      "rejects open trade",
      () => {
        const result =
          normalizeCompletedTrade({
            trade:
              buildTrade({
                status:
                  "OPEN",
              }),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          TRADE_HISTORY_STATUS
            .INVALID,
        );

        expect(
          result.errors,
        ).toContain(
          "Only CLOSED or COMPLETED trades may be stored.",
        );
      },
    );

    test(
      "rejects missing fingerprint",
      () => {
        const trade =
          buildTrade();

        trade.entryFingerprint =
          null;

        const result =
          normalizeCompletedTrade({
            trade,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.errors,
        ).toContain(
          "Entry trade setup fingerprint is required.",
        );
      },
    );

    test(
      "rejects close timestamp before open timestamp",
      () => {
        const result =
          normalizeCompletedTrade({
            trade:
              buildTrade({
                openedAt:
                  "2026-08-22T15:00:00.000Z",

                closedAt:
                  "2026-08-22T14:00:00.000Z",
              }),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.errors,
        ).toContain(
          "Trade closedAt cannot be earlier than openedAt.",
        );
      },
    );
  },
);

/**
 * ============================================================
 * STORE
 * ============================================================
 */

describe(
  "Trade History Store — Storage",
  () => {
    let store;

    beforeEach(
      () => {
        store =
          createTradeHistoryStore();
      },
    );

    test(
      "stores completed trade",
      () => {
        const result =
          store.storeTrade(
            buildTrade(),
          );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          TRADE_HISTORY_STATUS
            .STORED,
        );

        expect(
          store.size,
        ).toBe(1);
      },
    );

    test(
      "rejects duplicate trade ID",
      () => {
        const trade =
          buildTrade();

        const first =
          store.storeTrade(
            trade,
          );

        const second =
          store.storeTrade(
            trade,
          );

        expect(
          first.approved,
        ).toBe(true);

        expect(
          second.approved,
        ).toBe(false);

        expect(
          second.status,
        ).toBe(
          TRADE_HISTORY_STATUS
            .DUPLICATE,
        );

        expect(
          store.size,
        ).toBe(1);
      },
    );

    test(
      "does not store invalid trade",
      () => {
        const result =
          store.storeTrade(
            buildTrade({
              status:
                "OPEN",
            }),
          );

        expect(
          result.approved,
        ).toBe(false);

        expect(
          store.size,
        ).toBe(0);
      },
    );
  },
);

/**
 * ============================================================
 * GET BY ID
 * ============================================================
 */

describe(
  "Trade History Store — Retrieval",
  () => {
    test(
      "retrieves trade by ID",
      () => {
        const store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade(),
        );

        const result =
          store.getTradeById(
            "trade-001",
          );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.record.id,
        ).toBe(
          "trade-001",
        );
      },
    );

    test(
      "returns NOT_FOUND for missing ID",
      () => {
        const store =
          createTradeHistoryStore();

        const result =
          store.getTradeById(
            "missing",
          );

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          TRADE_HISTORY_STATUS
            .NOT_FOUND,
        );
      },
    );

    test(
      "returns cloned records, not mutable internal reference",
      () => {
        const store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade(),
        );

        const first =
          store.getTradeById(
            "trade-001",
          );

        first.record.symbol =
          "CHANGED";

        const second =
          store.getTradeById(
            "trade-001",
          );

        expect(
          second.record.symbol,
        ).toBe("AAPL");
      },
    );
  },
);

/**
 * ============================================================
 * FILTERING
 * ============================================================
 */

describe(
  "Trade History Store — Query",
  () => {
    let store;

    beforeEach(
      () => {
        store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade({
            id: "aapl-long-1",

            symbol: "AAPL",

            side: "LONG",

            openedAt:
              "2026-08-20T14:00:00.000Z",

            closedAt:
              "2026-08-20T15:00:00.000Z",

            realizedPnL: 100,
          }),
        );

        store.storeTrade(
          buildTrade({
            id: "aapl-short-1",

            symbol: "AAPL",

            side: "SHORT",

            openedAt:
              "2026-08-21T14:00:00.000Z",

            closedAt:
              "2026-08-21T15:00:00.000Z",

            realizedPnL:
              -50,
          }),
        );

        store.storeTrade(
          buildTrade({
            id: "tsla-long-1",

            symbol: "TSLA",

            side: "LONG",

            openedAt:
              "2026-08-22T14:00:00.000Z",

            closedAt:
              "2026-08-22T15:00:00.000Z",

            realizedPnL:
              75,
          }),
        );
      },
    );

    test(
      "filters by symbol",
      () => {
        const result =
          store.queryTrades({
            symbol: "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.count,
        ).toBe(2);

        expect(
          result.records.every(
            (record) =>
              record.symbol ===
              "AAPL",
          ),
        ).toBe(true);
      },
    );

    test(
      "filters by side",
      () => {
        const result =
          store.queryTrades({
            side: "LONG",
          });

        expect(
          result.count,
        ).toBe(2);

        expect(
          result.records.every(
            (record) =>
              record.side ===
              "LONG",
          ),
        ).toBe(true);
      },
    );

    test(
      "filters by outcome",
      () => {
        const result =
          store.queryTrades({
            outcome:
              "LOSS",
          });

        expect(
          result.count,
        ).toBe(1);

        expect(
          result.records[0]
            .id,
        ).toBe(
          "aapl-short-1",
        );
      },
    );

    test(
      "sorts newest closed trade first",
      () => {
        const result =
          store.queryTrades();

        expect(
          result.records[0]
            .id,
        ).toBe(
          "tsla-long-1",
        );

        expect(
          result.records[2]
            .id,
        ).toBe(
          "aapl-long-1",
        );
      },
    );

    test(
      "applies result limit",
      () => {
        const result =
          store.queryTrades({
            limit: 2,
          });

        expect(
          result.count,
        ).toBe(2);

        expect(
          result.records,
        ).toHaveLength(2);
      },
    );
  },
);

/**
 * ============================================================
 * POINT-IN-TIME SAFETY
 * ============================================================
 */

describe(
  "Trade History Store — Point In Time Safety",
  () => {
    test(
      "excludes trades that closed after candidate timestamp",
      () => {
        const store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade({
            id: "old-trade",

            openedAt:
              "2026-08-20T14:00:00.000Z",

            closedAt:
              "2026-08-20T15:00:00.000Z",
          }),
        );

        store.storeTrade(
          buildTrade({
            id:
              "future-trade",

            openedAt:
              "2026-08-22T14:00:00.000Z",

            closedAt:
              "2026-08-22T15:00:00.000Z",
          }),
        );

        const result =
          store.queryTrades({
            beforeTimestamp:
              "2026-08-21T12:00:00.000Z",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.count,
        ).toBe(1);

        expect(
          result.records[0]
            .id,
        ).toBe(
          "old-trade",
        );

        expect(
          result.records.some(
            (record) =>
              record.id ===
              "future-trade",
          ),
        ).toBe(false);
      },
    );

    test(
      "trade closing exactly at candidate timestamp is excluded",
      () => {
        const store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade({
            id: "same-time",

            closedAt:
              "2026-08-22T15:00:00.000Z",
          }),
        );

        const result =
          store.queryTrades({
            beforeTimestamp:
              "2026-08-22T15:00:00.000Z",
          });

        /**
         * Strictly BEFORE.
         *
         * This protects us from same-candle /
         * same-timestamp look-ahead leakage.
         */

        expect(
          result.count,
        ).toBe(0);
      },
    );

    test(
      "rejects invalid beforeTimestamp",
      () => {
        const store =
          createTradeHistoryStore();

        const result =
          store.queryTrades({
            beforeTimestamp:
              "not-a-date",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          TRADE_HISTORY_STATUS
            .INVALID,
        );
      },
    );
  },
);

/**
 * ============================================================
 * FINGERPRINT VERSION
 * ============================================================
 */

describe(
  "Trade History Store — Fingerprint Version",
  () => {
    test(
      "filters trades by fingerprint version",
      () => {
        const store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade({
            id:
              "version-1",

            fingerprintVersion:
              1,
          }),
        );

        store.storeTrade(
          buildTrade({
            id:
              "version-2",

            fingerprintVersion:
              2,
          }),
        );

        const result =
          store.queryTrades({
            fingerprintVersion:
              1,
          });

        expect(
          result.count,
        ).toBe(1);

        expect(
          result.records[0]
            .id,
        ).toBe(
          "version-1",
        );
      },
    );
  },
);

/**
 * ============================================================
 * INITIAL RECORDS
 * ============================================================
 */

describe(
  "Trade History Store — Initial Records",
  () => {
    test(
      "loads valid initial records",
      () => {
        const store =
          createTradeHistoryStore({
            initialRecords: [
              buildTrade({
                id: "initial-1",
              }),

              buildTrade({
                id: "initial-2",
              }),
            ],
          });

        expect(
          store.size,
        ).toBe(2);
      },
    );

    test(
      "ignores invalid initial records",
      () => {
        const store =
          createTradeHistoryStore({
            initialRecords: [
              buildTrade({
                id:
                  "valid-one",
              }),

              buildTrade({
                id:
                  "invalid-open",

                status:
                  "OPEN",
              }),
            ],
          });

        expect(
          store.size,
        ).toBe(1);
      },
    );
  },
);

/**
 * ============================================================
 * EXPORT / CLEAR
 * ============================================================
 */

describe(
  "Trade History Store — Utility",
  () => {
    test(
      "exports records safely",
      () => {
        const store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade({
            id: "export-1",
          }),
        );

        const records =
          store.exportRecords();

        expect(
          records,
        ).toHaveLength(1);

        records[0].symbol =
          "CHANGED";

        const second =
          store.exportRecords();

        expect(
          second[0].symbol,
        ).toBe("AAPL");
      },
    );

    test(
      "clear removes all records",
      () => {
        const store =
          createTradeHistoryStore();

        store.storeTrade(
          buildTrade({
            id: "clear-1",
          }),
        );

        store.storeTrade(
          buildTrade({
            id: "clear-2",
          }),
        );

        expect(
          store.size,
        ).toBe(2);

        const result =
          store.clear();

        expect(
          result.approved,
        ).toBe(true);

        expect(
          store.size,
        ).toBe(0);
      },
    );
  },
);