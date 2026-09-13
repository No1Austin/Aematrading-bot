// server/src/tests/tradeHistoryRepository.test.js

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from "vitest";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import createTradeHistoryRepository from
  "../history/tradeHistoryRepository.js";

/**
 * ============================================================
 * TRADE HISTORY REPOSITORY TESTS
 * ============================================================
 *
 * PURPOSE
 * -------
 * Verify the durable persistence boundary independently from:
 *
 * - paper trading session
 * - execution coordinator
 * - similarity engine
 * - scoring engine
 *
 * These tests intentionally use a temporary directory.
 *
 * Nothing should touch the real:
 *
 * data/trade-history.json
 */

/**
 * ============================================================
 * TEST HELPERS
 * ============================================================
 */

function buildFingerprint({
  symbol = "AAPL",
  side = "LONG",
} = {}) {
  return {
    symbol,

    side,

    asOfTimestamp:
      "2026-08-29T14:00:00.000Z",

    coverage: 0.85,

    technical: {
      available: true,
      direction:
        side,
      trend:
        side === "LONG"
          ? "BULLISH"
          : "BEARISH",
    },

    macro: {
      available: true,
      regime:
        "NORMAL",
    },

    marketRegime: {
      available: true,
      regime:
        side === "LONG"
          ? "BULLISH"
          : "BEARISH",
    },

    liquidity: {
      available: true,
      quality:
        "HIGH",
    },

    riskReward: {
      available: true,
      ratio: 3,
    },
  };
}

function buildCompletedTrade({
  id = "trade-001",

  symbol = "AAPL",

  side = "LONG",

  closedAt =
    "2026-08-29T15:00:00.000Z",

  pnl = 125,

  pnlPercent = 1.25,

  rMultiple = 1.5,
} = {}) {
  return {
    id,

    symbol,

    side,

    status:
      "CLOSED",

    entryPrice:
      100,

    exitPrice:
      side === "LONG"
        ? 101.25
        : 98.75,

    stopPrice:
      side === "LONG"
        ? 98
        : 102,

    targetPrice:
      side === "LONG"
        ? 106
        : 94,

    quantity: 100,

    pnl,

    pnlPercent,

    realizedPnl:
      pnl,

    realizedPnlPercent:
      pnlPercent,

    rMultiple,

    openedAt:
      "2026-08-29T14:00:00.000Z",

    closedAt,

    closeReason:
      "TEST_CLOSE",

    fingerprint:
      buildFingerprint({
        symbol,
        side,
      }),

    metadata: {
      source:
        "TEST",

      strategy:
        "SELF_LEARNING_TEST",
    },
  };
}

/**
 * ============================================================
 * TEST STATE
 * ============================================================
 */

let temporaryDirectory;
let historyFile;
let repository;

/**
 * ============================================================
 * SETUP
 * ============================================================
 */

beforeEach(
  async () => {
    temporaryDirectory =
      await fs.mkdtemp(
        path.join(
          os.tmpdir(),
          "trade-history-repository-",
        ),
      );

    historyFile =
      path.join(
        temporaryDirectory,
        "trade-history.json",
      );

    repository =
      createTradeHistoryRepository({
        filePath:
          historyFile,

        /**
         * Silence expected failure logging during tests.
         */
        logger: {
          error() {},
          warn() {},
          log() {},
        },
      });
  },
);

/**
 * ============================================================
 * CLEANUP
 * ============================================================
 */

afterEach(
  async () => {
    if (
      temporaryDirectory
    ) {
      await fs.rm(
        temporaryDirectory,
        {
          recursive: true,
          force: true,
        },
      );
    }

    temporaryDirectory =
      null;

    historyFile =
      null;

    repository =
      null;
  },
);

/**
 * ============================================================
 * INITIALIZATION
 * ============================================================
 */

describe(
  "Trade History Repository — Initialization",
  () => {
    test(
      "creates a durable empty persistence file safely",
      async () => {
        const result =
          await repository
            .initialize();

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.initialized,
        ).toBe(true);

        expect(
          result.tradeCount,
        ).toBe(0);

        const raw =
          await fs.readFile(
            historyFile,
            "utf8",
          );

        const document =
          JSON.parse(raw);

        expect(
          document.version,
        ).toBe(1);

        expect(
          document.trades,
        ).toEqual([]);

        expect(
          typeof document.createdAt,
        ).toBe(
          "string",
        );

        expect(
          typeof document.updatedAt,
        ).toBe(
          "string",
        );
      },
    );

    test(
      "initialization is safe when the persistence file already exists",
      async () => {
        const first =
          await repository
            .initialize();

        expect(
          first.approved,
        ).toBe(true);

        const second =
          await repository
            .initialize();

        expect(
          second.approved,
        ).toBe(true);

        expect(
          second.tradeCount,
        ).toBe(0);
      },
    );
  },
);

/**
 * ============================================================
 * STORE TRADE
 * ============================================================
 */

describe(
  "Trade History Repository — Store Trade",
  () => {
    test(
      "stores a completed trade durably",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade();

        const result =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.stored,
        ).toBe(true);

        expect(
          result.duplicate,
        ).toBe(false);

        expect(
          result.trade.id,
        ).toBe(
          trade.id,
        );

        const loaded =
          await repository
            .loadAll();

        expect(
          loaded.approved,
        ).toBe(true);

        expect(
          loaded.count,
        ).toBe(1);

        expect(
          loaded.trades[0].id,
        ).toBe(
          trade.id,
        );
      },
    );

    test(
      "preserves the complete trade fingerprint",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade();

        await repository
          .storeTrade(
            trade,
          );

        const loaded =
          await repository
            .loadAll();

        expect(
          loaded.trades[0]
            .fingerprint,
        ).toEqual(
          trade.fingerprint,
        );

        expect(
          loaded.trades[0]
            .fingerprint
            .coverage,
        ).toBe(0.85);

        expect(
          loaded.trades[0]
            .fingerprint
            .technical
            .direction,
        ).toBe("LONG");
      },
    );

    test(
      "normalizes symbol and side",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade({
            id:
              "normalized-001",
          });

        trade.symbol =
          "  aapl  ";

        trade.side =
          " long ";

        const result =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.trade.symbol,
        ).toBe("AAPL");

        expect(
          result.trade.side,
        ).toBe("LONG");
      },
    );
  },
);

/**
 * ============================================================
 * RESTART RECOVERY
 * ============================================================
 */

describe(
  "Trade History Repository — Restart Recovery",
  () => {
    test(
      "a new repository instance reloads trades written by an earlier instance",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade({
            id:
              "restart-001",
          });

        const stored =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          stored.approved,
        ).toBe(true);

        /**
         * Simulate:
         *
         * Node process stops
         *       ↓
         * application starts again
         *       ↓
         * new repository instance
         */

        const restartedRepository =
          createTradeHistoryRepository({
            filePath:
              historyFile,

            logger: {
              error() {},
              warn() {},
              log() {},
            },
          });

        const initialized =
          await restartedRepository
            .initialize();

        expect(
          initialized.approved,
        ).toBe(true);

        expect(
          initialized.tradeCount,
        ).toBe(1);

        const loaded =
          await restartedRepository
            .loadAll();

        expect(
          loaded.approved,
        ).toBe(true);

        expect(
          loaded.count,
        ).toBe(1);

        expect(
          loaded.trades[0].id,
        ).toBe(
          "restart-001",
        );

        expect(
          loaded.trades[0]
            .fingerprint,
        ).toEqual(
          trade.fingerprint,
        );
      },
    );
  },
);

/**
 * ============================================================
 * DUPLICATE PROTECTION
 * ============================================================
 */

describe(
  "Trade History Repository — Duplicate Protection",
  () => {
    test(
      "rejects duplicate completed trade IDs",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade({
            id:
              "duplicate-001",
          });

        const first =
          await repository
            .storeTrade(
              trade,
            );

        const second =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          first.approved,
        ).toBe(true);

        expect(
          first.stored,
        ).toBe(true);

        expect(
          second.approved,
        ).toBe(false);

        expect(
          second.stored,
        ).toBe(false);

        expect(
          second.duplicate,
        ).toBe(true);

        const loaded =
          await repository
            .loadAll();

        expect(
          loaded.count,
        ).toBe(1);
      },
    );
  },
);

/**
 * ============================================================
 * MULTIPLE TRADES
 * ============================================================
 */

describe(
  "Trade History Repository — Multiple Trades",
  () => {
    test(
      "persists multiple independent completed trades",
      async () => {
        await repository
          .initialize();

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "trade-a",
            }),
          );

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "trade-b",

              symbol:
                "MSFT",
            }),
          );

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "trade-c",

              symbol:
                "NVDA",

              side:
                "SHORT",
            }),
          );

        const loaded =
          await repository
            .loadAll();

        expect(
          loaded.approved,
        ).toBe(true);

        expect(
          loaded.count,
        ).toBe(3);

        expect(
          loaded.trades.map(
            trade =>
              trade.id,
          ),
        ).toEqual([
          "trade-a",
          "trade-b",
          "trade-c",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * CONCURRENT WRITE SAFETY
 * ============================================================
 */

describe(
  "Trade History Repository — Concurrent Writes",
  () => {
    test(
      "serializes concurrent writes without losing trades",
      async () => {
        await repository
          .initialize();

        const trades =
          Array.from(
            {
              length: 20,
            },
            (_, index) =>
              buildCompletedTrade({
                id:
                  `concurrent-${index + 1}`,

                symbol:
                  index % 2 === 0
                    ? "AAPL"
                    : "MSFT",

                closedAt:
                  new Date(
                    Date.UTC(
                      2026,
                      7,
                      29,
                      15,
                      index,
                      0,
                    ),
                  ).toISOString(),
              }),
          );

        const results =
          await Promise.all(
            trades.map(
              trade =>
                repository
                  .storeTrade(
                    trade,
                  ),
            ),
          );

        expect(
          results.every(
            result =>
              result.approved ===
              true,
          ),
        ).toBe(true);

        const loaded =
          await repository
            .loadAll();

        expect(
          loaded.approved,
        ).toBe(true);

        expect(
          loaded.count,
        ).toBe(20);

        const ids =
          new Set(
            loaded.trades.map(
              trade =>
                trade.id,
            ),
          );

        expect(
          ids.size,
        ).toBe(20);
      },
    );
  },
);

/**
 * ============================================================
 * INVALID RECORDS
 * ============================================================
 */

describe(
  "Trade History Repository — Validation",
  () => {
    test(
      "rejects a non-object trade",
      async () => {
        await repository
          .initialize();

        const result =
          await repository
            .storeTrade(
              null,
            );

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.stored,
        ).toBe(false);
      },
    );

    test(
      "rejects a trade without an ID",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade();

        delete trade.id;

        const result =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.stored,
        ).toBe(false);

        expect(
          result.errors.length,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "rejects a trade without a symbol",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade();

        delete trade.symbol;

        const result =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.stored,
        ).toBe(false);
      },
    );

    test(
      "rejects an invalid trade side",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade();

        trade.side =
          "SIDEWAYS";

        const result =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.stored,
        ).toBe(false);
      },
    );

    test(
      "rejects an invalid closedAt timestamp",
      async () => {
        await repository
          .initialize();

        const trade =
          buildCompletedTrade();

        trade.closedAt =
          "not-a-date";

        const result =
          await repository
            .storeTrade(
              trade,
            );

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.stored,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * CORRUPTION PROTECTION
 * ============================================================
 */

describe(
  "Trade History Repository — Corruption Protection",
  () => {
    test(
      "fails safely when persisted JSON is corrupted",
      async () => {
        await fs.mkdir(
          path.dirname(
            historyFile,
          ),
          {
            recursive: true,
          },
        );

        const corrupted =
          `{
            "version": 1,
            "trades": [
              THIS IS NOT JSON
          `;

        await fs.writeFile(
          historyFile,
          corrupted,
          "utf8",
        );

        const result =
          await repository
            .initialize();

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.initialized,
        ).toBe(false);

        /**
         * Critical:
         *
         * Repository must NOT silently overwrite the
         * corrupted file with empty history.
         */

        const after =
          await fs.readFile(
            historyFile,
            "utf8",
          );

        expect(after).toBe(
          corrupted,
        );
      },
    );

    test(
      "fails safely when an existing persistence file is empty",
      async () => {
        await fs.writeFile(
          historyFile,
          "",
          "utf8",
        );

        const result =
          await repository
            .initialize();

        expect(
          result.approved,
        ).toBe(false);

        const stat =
          await fs.stat(
            historyFile,
          );

        expect(
          stat.size,
        ).toBe(0);
      },
    );

    test(
      "does not overwrite corrupt history through replaceAll",
      async () => {
        const corrupted =
          "{ definitely-not-valid-json";

        await fs.writeFile(
          historyFile,
          corrupted,
          "utf8",
        );

        const result =
          await repository
            .replaceAll([
              buildCompletedTrade({
                id:
                  "replacement",
              }),
            ]);

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.replaced,
        ).toBe(false);

        const after =
          await fs.readFile(
            historyFile,
            "utf8",
          );

        expect(after).toBe(
          corrupted,
        );
      },
    );
  },
);

/**
 * ============================================================
 * FIND BY ID
 * ============================================================
 */

describe(
  "Trade History Repository — Find",
  () => {
    test(
      "finds a persisted trade by ID",
      async () => {
        await repository
          .initialize();

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "find-me",
            }),
          );

        const result =
          await repository
            .findById(
              "find-me",
            );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.found,
        ).toBe(true);

        expect(
          result.trade.id,
        ).toBe(
          "find-me",
        );
      },
    );

    test(
      "returns a safe not-found result",
      async () => {
        await repository
          .initialize();

        const result =
          await repository
            .findById(
              "does-not-exist",
            );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.found,
        ).toBe(false);

        expect(
          result.trade,
        ).toBeNull();
      },
    );
  },
);

/**
 * ============================================================
 * REPLACE ALL
 * ============================================================
 */

describe(
  "Trade History Repository — Replace All",
  () => {
    test(
      "replaces history only after validating the full replacement set",
      async () => {
        await repository
          .initialize();

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "old-trade",
            }),
          );

        const result =
          await repository
            .replaceAll([
              buildCompletedTrade({
                id:
                  "new-a",
              }),

              buildCompletedTrade({
                id:
                  "new-b",
                symbol:
                  "MSFT",
              }),
            ]);

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.replaced,
        ).toBe(true);

        expect(
          result.count,
        ).toBe(2);

        const loaded =
          await repository
            .loadAll();

        expect(
          loaded.trades.map(
            trade =>
              trade.id,
          ),
        ).toEqual([
          "new-a",
          "new-b",
        ]);
      },
    );

    test(
      "does not modify existing history when replacement validation fails",
      async () => {
        await repository
          .initialize();

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "protected-trade",
            }),
          );

        const invalid =
          buildCompletedTrade({
            id:
              "invalid-trade",
          });

        invalid.side =
          "INVALID";

        const result =
          await repository
            .replaceAll([
              buildCompletedTrade({
                id:
                  "valid-new",
              }),

              invalid,
            ]);

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.replaced,
        ).toBe(false);

        const loaded =
          await repository
            .loadAll();

        expect(
          loaded.count,
        ).toBe(1);

        expect(
          loaded.trades[0].id,
        ).toBe(
          "protected-trade",
        );
      },
    );

    test(
      "rejects duplicate IDs inside replacement data",
      async () => {
        await repository
          .initialize();

        const result =
          await repository
            .replaceAll([
              buildCompletedTrade({
                id:
                  "same-id",
              }),

              buildCompletedTrade({
                id:
                  "same-id",
              }),
            ]);

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.replaced,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * EXPLICIT CLEAR
 * ============================================================
 */

describe(
  "Trade History Repository — Clear",
  () => {
    test(
      "clears persisted history only when explicitly requested",
      async () => {
        await repository
          .initialize();

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "clear-a",
            }),
          );

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "clear-b",
            }),
          );

        let loaded =
          await repository
            .loadAll();

        expect(
          loaded.count,
        ).toBe(2);

        const cleared =
          await repository
            .clear();

        expect(
          cleared.approved,
        ).toBe(true);

        expect(
          cleared.cleared,
        ).toBe(true);

        loaded =
          await repository
            .loadAll();

        expect(
          loaded.count,
        ).toBe(0);

        expect(
          loaded.trades,
        ).toEqual([]);
      },
    );
  },
);

/**
 * ============================================================
 * DEFENSIVE COPIES
 * ============================================================
 */

describe(
  "Trade History Repository — Defensive Copies",
  () => {
    test(
      "mutating a loaded trade does not mutate persisted history",
      async () => {
        await repository
          .initialize();

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "defensive-copy",
            }),
          );

        const first =
          await repository
            .loadAll();

        first.trades[0].symbol =
          "HACKED";

        first.trades[0]
          .fingerprint
          .coverage = 0;

        const second =
          await repository
            .loadAll();

        expect(
          second.trades[0]
            .symbol,
        ).toBe("AAPL");

        expect(
          second.trades[0]
            .fingerprint
            .coverage,
        ).toBe(0.85);
      },
    );
  },
);

/**
 * ============================================================
 * REPOSITORY STATE
 * ============================================================
 */

describe(
  "Trade History Repository — State",
  () => {
    test(
      "reports useful repository state",
      async () => {
        const before =
          repository
            .getState();

        expect(
          before.service,
        ).toBe(
          "TRADE_HISTORY_REPOSITORY",
        );

        expect(
          before.version,
        ).toBe(1);

        expect(
          before.initialized,
        ).toBe(false);

        await repository
          .initialize();

        await repository
          .storeTrade(
            buildCompletedTrade({
              id:
                "state-test",
            }),
          );

        const after =
          repository
            .getState();

        expect(
          after.initialized,
        ).toBe(true);

        expect(
          after.filePath,
        ).toBe(
          path.resolve(
            historyFile,
          ),
        );

        expect(
          typeof after.lastLoadedAt,
        ).toBe(
          "string",
        );

        expect(
          typeof after.lastPersistedAt,
        ).toBe(
          "string",
        );

        expect(
          after.lastError,
        ).toBeNull();
      },
    );
  },
);