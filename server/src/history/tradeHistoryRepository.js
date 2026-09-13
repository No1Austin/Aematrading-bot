// server/src/history/tradeHistoryRepository.js

import fs from "node:fs/promises";
import path from "node:path";

/**
 * ============================================================
 * TRADE HISTORY REPOSITORY
 * ============================================================
 *
 * PURPOSE
 * -------
 * Durable persistence boundary for completed bot trades.
 *
 * This repository:
 *
 * - persists completed trades to disk
 * - survives Node/server restarts
 * - uses atomic temp-file -> rename writes
 * - serializes writes to avoid overlapping file corruption
 * - protects against malformed/corrupt persistence files
 * - rejects duplicate trade IDs
 * - validates records before persistence
 * - returns defensive copies
 * - never fabricates missing trade data
 *
 * IMPORTANT
 * ---------
 * This repository does NOT:
 *
 * - score trades
 * - authorize trades
 * - execute orders
 * - perform similarity analysis
 * - perform historical outcome analysis
 *
 * It is persistence only.
 */

export const TRADE_HISTORY_REPOSITORY_VERSION = 1;

export const TRADE_HISTORY_REPOSITORY_STATUS =
  Object.freeze({
    READY: "READY",
    EMPTY: "EMPTY",
    ERROR: "ERROR",
  });

const DEFAULT_HISTORY_FILE =
  path.resolve(
    process.cwd(),
    "data",
    "trade-history.json",
  );

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function nowIso() {
  return new Date().toISOString();
}

function safeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeString(value) {
  const normalized =
    String(value ?? "").trim();

  return normalized || null;
}

function normalizeSymbol(value) {
  const normalized =
    normalizeString(value);

  return normalized
    ? normalized.toUpperCase()
    : null;
}

function normalizeSide(value) {
  const side =
    String(value ?? "")
      .trim()
      .toUpperCase();

  if (
    side === "LONG" ||
    side === "SHORT"
  ) {
    return side;
  }

  return null;
}

function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date.toISOString();
}

function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  /**
   * Trade-history records are JSON-safe persistence
   * objects, so JSON cloning is appropriate here.
   */
  return JSON.parse(
    JSON.stringify(value),
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

async function fileExists(
  filePath,
) {
  try {
    await fs.access(filePath);

    return true;
  } catch (error) {
    if (
      error?.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

/**
 * ============================================================
 * RECORD NORMALIZATION
 * ============================================================
 */

function normalizeTradeRecord(
  trade,
) {
  if (!isPlainObject(trade)) {
    return {
      approved: false,

      trade: null,

      errors: [
        "Trade history record must be an object.",
      ],
    };
  }

  const id =
    normalizeString(
      trade.id ??
      trade.tradeId ??
      trade.positionId ??
      trade.orderId,
    );

  const symbol =
    normalizeSymbol(
      trade.symbol,
    );

  const side =
    normalizeSide(
      trade.side ??
      trade.direction,
    );

  const closedAt =
    normalizeTimestamp(
      trade.closedAt ??
      trade.exitTimestamp ??
      trade.completedAt,
    );

  const errors = [];

  if (!id) {
    errors.push(
      "Completed trade ID is required.",
    );
  }

  if (!symbol) {
    errors.push(
      "Completed trade symbol is required.",
    );
  }

  if (!side) {
    errors.push(
      "Completed trade side must be LONG or SHORT.",
    );
  }

  if (!closedAt) {
    errors.push(
      "Completed trade closedAt timestamp is required.",
    );
  }

  if (errors.length > 0) {
    return {
      approved: false,

      trade: null,

      errors,
    };
  }

  /**
   * Preserve the full original completed-trade record.
   *
   * Only canonical fields are normalized.
   *
   * This is important because fingerprints and future
   * learning metadata must survive persistence unchanged.
   */
  const normalized = {
    ...clone(trade),

    id,

    symbol,

    side,

    closedAt,
  };

  /**
   * Normalize common optional numeric fields without
   * inventing values when they are absent.
   */
  const numericFields = [
    "entryPrice",
    "exitPrice",
    "stopPrice",
    "targetPrice",
    "quantity",
    "pnl",
    "pnlPercent",
    "realizedPnl",
    "realizedPnlPercent",
    "rMultiple",
  ];

  for (
    const field
    of numericFields
  ) {
    if (
      Object.prototype
        .hasOwnProperty
        .call(
          normalized,
          field,
        )
    ) {
      normalized[field] =
        finiteOrNull(
          normalized[field],
        );
    }
  }

  return {
    approved: true,

    trade:
      normalized,

    errors: [],
  };
}

/**
 * ============================================================
 * DOCUMENT VALIDATION
 * ============================================================
 */

function createEmptyDocument() {
  const timestamp =
    nowIso();

  return {
    version:
      TRADE_HISTORY_REPOSITORY_VERSION,

    createdAt:
      timestamp,

    updatedAt:
      timestamp,

    trades: [],
  };
}

function validateDocument(
  document,
) {
  if (!isPlainObject(document)) {
    return {
      approved: false,

      document: null,

      errors: [
        "Trade history persistence document must be an object.",
      ],
    };
  }

  if (
    document.version !==
    TRADE_HISTORY_REPOSITORY_VERSION
  ) {
    return {
      approved: false,

      document: null,

      errors: [
        `Unsupported trade history repository version: ${
          document.version ?? "UNKNOWN"
        }.`,
      ],
    };
  }

  if (
    !Array.isArray(
      document.trades,
    )
  ) {
    return {
      approved: false,

      document: null,

      errors: [
        "Trade history persistence document must contain a trades array.",
      ],
    };
  }

  const normalizedTrades = [];

  const seen =
    new Set();

  const errors = [];

  for (
    const rawTrade
    of document.trades
  ) {
    const validation =
      normalizeTradeRecord(
        rawTrade,
      );

    if (
      validation.approved !==
      true
    ) {
      errors.push(
        ...validation.errors,
      );

      continue;
    }

    const trade =
      validation.trade;

    if (
      seen.has(
        trade.id,
      )
    ) {
      errors.push(
        `Duplicate persisted trade ID detected: ${trade.id}.`,
      );

      continue;
    }

    seen.add(
      trade.id,
    );

    normalizedTrades.push(
      trade,
    );
  }

  /**
   * Fail closed.
   *
   * A partially malformed persistence document should
   * NOT silently discard bad records and continue.
   */
  if (
    errors.length > 0
  ) {
    return {
      approved: false,

      document: null,

      errors,
    };
  }

  return {
    approved: true,

    document: {
      version:
        TRADE_HISTORY_REPOSITORY_VERSION,

      createdAt:
        normalizeTimestamp(
          document.createdAt,
        ) ??
        nowIso(),

      updatedAt:
        normalizeTimestamp(
          document.updatedAt,
        ) ??
        nowIso(),

      trades:
        normalizedTrades,
    },

    errors: [],
  };
}

/**
 * ============================================================
 * REPOSITORY FACTORY
 * ============================================================
 */

export function createTradeHistoryRepository({
  filePath =
    DEFAULT_HISTORY_FILE,

  logger =
    console,
} = {}) {
  const resolvedFilePath =
    path.resolve(
      filePath,
    );

  const directory =
    path.dirname(
      resolvedFilePath,
    );

  /**
   * All mutations are serialized through this promise.
   *
   * This prevents two concurrent writes from both reading
   * the same old document and overwriting one another.
   */
  let mutationQueue =
    Promise.resolve();

  let initialized =
    false;

  let lastError =
    null;

  let lastLoadedAt =
    null;

  let lastPersistedAt =
    null;

  /**
   * ----------------------------------------------------------
   * READ DOCUMENT
   * ----------------------------------------------------------
   */

  async function readDocument() {
    const exists =
      await fileExists(
        resolvedFilePath,
      );

    if (!exists) {
      return {
        approved: true,

        status:
          TRADE_HISTORY_REPOSITORY_STATUS
            .EMPTY,

        document:
          createEmptyDocument(),

        exists: false,

        errors: [],
      };
    }

    let raw;

    try {
      raw =
        await fs.readFile(
          resolvedFilePath,
          "utf8",
        );
    } catch (error) {
      return {
        approved: false,

        status:
          TRADE_HISTORY_REPOSITORY_STATUS
            .ERROR,

        document: null,

        exists: true,

        errors: [
          safeErrorMessage(
            error,
          ),
        ],
      };
    }

    if (
      !String(raw).trim()
    ) {
      /**
       * An existing zero-byte file is suspicious.
       * Do not silently treat it as valid empty history.
       */
      return {
        approved: false,

        status:
          TRADE_HISTORY_REPOSITORY_STATUS
            .ERROR,

        document: null,

        exists: true,

        errors: [
          "Trade history persistence file exists but is empty.",
        ],
      };
    }

    let parsed;

    try {
      parsed =
        JSON.parse(raw);
    } catch (error) {
      return {
        approved: false,

        status:
          TRADE_HISTORY_REPOSITORY_STATUS
            .ERROR,

        document: null,

        exists: true,

        errors: [
          `Trade history persistence file contains invalid JSON: ${safeErrorMessage(
            error,
          )}`,
        ],
      };
    }

    const validation =
      validateDocument(
        parsed,
      );

    if (
      validation.approved !==
      true
    ) {
      return {
        approved: false,

        status:
          TRADE_HISTORY_REPOSITORY_STATUS
            .ERROR,

        document: null,

        exists: true,

        errors:
          validation.errors,
      };
    }

    return {
      approved: true,

      status:
        validation
          .document
          .trades
          .length > 0
          ? TRADE_HISTORY_REPOSITORY_STATUS
              .READY
          : TRADE_HISTORY_REPOSITORY_STATUS
              .EMPTY,

      document:
        validation.document,

      exists: true,

      errors: [],
    };
  }

  /**
   * ----------------------------------------------------------
   * ATOMIC WRITE
   * ----------------------------------------------------------
   */

  async function writeDocument(
    document,
  ) {
    const validation =
      validateDocument(
        document,
      );

    if (
      validation.approved !==
      true
    ) {
      throw new Error(
        validation.errors.join(
          " ",
        ),
      );
    }

    await fs.mkdir(
      directory,
      {
        recursive: true,
      },
    );

    const finalDocument = {
      ...validation.document,

      updatedAt:
        nowIso(),
    };

    const temporaryFile =
      `${resolvedFilePath}.tmp-${process.pid}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2)}`;

    const serialized =
      `${JSON.stringify(
        finalDocument,
        null,
        2,
      )}\n`;

    try {
      /**
       * Write a complete replacement file first.
       */
      await fs.writeFile(
        temporaryFile,
        serialized,
        {
          encoding:
            "utf8",

          flag:
            "wx",
        },
      );

      /**
       * rename() on the same filesystem is atomic.
       *
       * Readers therefore see either the old complete
       * document or the new complete document.
       */
      await fs.rename(
        temporaryFile,
        resolvedFilePath,
      );

      lastPersistedAt =
        nowIso();

      lastError =
        null;

      return finalDocument;
    } catch (error) {
      /**
       * Best-effort cleanup of an abandoned temp file.
       */
      try {
        await fs.rm(
          temporaryFile,
          {
            force: true,
          },
        );
      } catch {
        // Cleanup failure must not hide the original error.
      }

      throw error;
    }
  }

  /**
   * ----------------------------------------------------------
   * SERIALIZED MUTATION
   * ----------------------------------------------------------
   */

  function enqueueMutation(
    mutation,
  ) {
    const operation =
      mutationQueue.then(
        mutation,
        mutation,
      );

    /**
     * Keep the internal queue alive even if this operation
     * rejects. The caller still receives the rejection/result
     * from `operation`.
     */
    mutationQueue =
      operation.catch(
        () => undefined,
      );

    return operation;
  }

  /**
   * ----------------------------------------------------------
   * INITIALIZE
   * ----------------------------------------------------------
   */

  async function initialize() {
    try {
      await fs.mkdir(
        directory,
        {
          recursive: true,
        },
      );

      const readResult =
        await readDocument();

      if (
        readResult.approved !==
        true
      ) {
        lastError =
          readResult.errors.join(
            " ",
          );

        return {
          approved: false,

          status:
            TRADE_HISTORY_REPOSITORY_STATUS
              .ERROR,

          initialized: false,

          filePath:
            resolvedFilePath,

          tradeCount: 0,

          errors:
            readResult.errors,
        };
      }

      if (
        readResult.exists !==
        true
      ) {
        await writeDocument(
          readResult.document,
        );
      }

      initialized =
        true;

      lastLoadedAt =
        nowIso();

      lastError =
        null;

      return {
        approved: true,

        status:
          readResult
            .document
            .trades
            .length > 0
            ? TRADE_HISTORY_REPOSITORY_STATUS
                .READY
            : TRADE_HISTORY_REPOSITORY_STATUS
                .EMPTY,

        initialized: true,

        filePath:
          resolvedFilePath,

        tradeCount:
          readResult
            .document
            .trades
            .length,

        errors: [],
      };
    } catch (error) {
      lastError =
        safeErrorMessage(
          error,
        );

      logger?.error?.(
        "TRADE HISTORY REPOSITORY INITIALIZATION ERROR:",
        error,
      );

      return {
        approved: false,

        status:
          TRADE_HISTORY_REPOSITORY_STATUS
            .ERROR,

        initialized: false,

        filePath:
          resolvedFilePath,

        tradeCount: 0,

        errors: [
          lastError,
        ],
      };
    }
  }

  /**
   * ----------------------------------------------------------
   * LOAD ALL
   * ----------------------------------------------------------
   */

  async function loadAll() {
    try {
      const result =
        await readDocument();

      if (
        result.approved !==
        true
      ) {
        lastError =
          result.errors.join(
            " ",
          );

        return {
          approved: false,

          status:
            TRADE_HISTORY_REPOSITORY_STATUS
              .ERROR,

          trades: [],

          count: 0,

          errors:
            result.errors,
        };
      }

      initialized =
        true;

      lastLoadedAt =
        nowIso();

      lastError =
        null;

      return {
        approved: true,

        status:
          result
            .document
            .trades
            .length > 0
            ? TRADE_HISTORY_REPOSITORY_STATUS
                .READY
            : TRADE_HISTORY_REPOSITORY_STATUS
                .EMPTY,

        trades:
          clone(
            result
              .document
              .trades,
          ),

        count:
          result
            .document
            .trades
            .length,

        errors: [],
      };
    } catch (error) {
      lastError =
        safeErrorMessage(
          error,
        );

      return {
        approved: false,

        status:
          TRADE_HISTORY_REPOSITORY_STATUS
            .ERROR,

        trades: [],

        count: 0,

        errors: [
          lastError,
        ],
      };
    }
  }

  /**
   * ----------------------------------------------------------
   * FIND BY ID
   * ----------------------------------------------------------
   */

  async function findById(
    tradeId,
  ) {
    const normalizedId =
      normalizeString(
        tradeId,
      );

    if (!normalizedId) {
      return {
        approved: false,

        found: false,

        trade: null,

        errors: [
          "Trade ID is required.",
        ],
      };
    }

    const loaded =
      await loadAll();

    if (
      loaded.approved !==
      true
    ) {
      return {
        approved: false,

        found: false,

        trade: null,

        errors:
          loaded.errors,
      };
    }

    const trade =
      loaded.trades.find(
        item =>
          item.id ===
          normalizedId,
      ) ??
      null;

    return {
      approved: true,

      found:
        trade !== null,

      trade:
        clone(trade),

      errors: [],
    };
  }

  /**
   * ----------------------------------------------------------
   * STORE ONE COMPLETED TRADE
   * ----------------------------------------------------------
   */

  async function storeTrade(
    trade,
  ) {
    const normalized =
      normalizeTradeRecord(
        trade,
      );

    if (
      normalized.approved !==
      true
    ) {
      return {
        approved: false,

        stored: false,

        duplicate: false,

        trade: null,

        errors:
          normalized.errors,
      };
    }

    return enqueueMutation(
      async () => {
        try {
          const current =
            await readDocument();

          if (
            current.approved !==
            true
          ) {
            lastError =
              current.errors.join(
                " ",
              );

            return {
              approved: false,

              stored: false,

              duplicate: false,

              trade: null,

              errors:
                current.errors,
            };
          }

          const existing =
            current
              .document
              .trades
              .find(
                item =>
                  item.id ===
                  normalized
                    .trade
                    .id,
              );

          if (existing) {
            return {
              approved: false,

              stored: false,

              duplicate: true,

              trade:
                clone(existing),

              errors: [
                `Trade history record already exists: ${normalized.trade.id}.`,
              ],
            };
          }

          const nextDocument = {
            ...current.document,

            trades: [
              ...current
                .document
                .trades,

              normalized.trade,
            ],
          };

          await writeDocument(
            nextDocument,
          );

          initialized =
            true;

          lastError =
            null;

          return {
            approved: true,

            stored: true,

            duplicate: false,

            trade:
              clone(
                normalized.trade,
              ),

            tradeCount:
              nextDocument
                .trades
                .length,

            errors: [],
          };
        } catch (error) {
          lastError =
            safeErrorMessage(
              error,
            );

          logger?.error?.(
            "TRADE HISTORY REPOSITORY WRITE ERROR:",
            error,
          );

          return {
            approved: false,

            stored: false,

            duplicate: false,

            trade: null,

            errors: [
              lastError,
            ],
          };
        }
      },
    );
  }

  /**
   * ----------------------------------------------------------
   * REPLACE ALL
   * ----------------------------------------------------------
   *
   * Intended primarily for controlled hydration/migration.
   *
   * It validates the entire replacement set before touching
   * the persistence file.
   */

  async function replaceAll(
    trades = [],
  ) {
    if (!Array.isArray(trades)) {
      return {
        approved: false,

        replaced: false,

        count: 0,

        errors: [
          "Trade history replacement must be an array.",
        ],
      };
    }

    const normalizedTrades = [];

    const seen =
      new Set();

    const errors = [];

    for (
      const trade
      of trades
    ) {
      const normalized =
        normalizeTradeRecord(
          trade,
        );

      if (
        normalized.approved !==
        true
      ) {
        errors.push(
          ...normalized.errors,
        );

        continue;
      }

      if (
        seen.has(
          normalized.trade.id,
        )
      ) {
        errors.push(
          `Duplicate replacement trade ID: ${normalized.trade.id}.`,
        );

        continue;
      }

      seen.add(
        normalized.trade.id,
      );

      normalizedTrades.push(
        normalized.trade,
      );
    }

    if (
      errors.length > 0
    ) {
      return {
        approved: false,

        replaced: false,

        count: 0,

        errors,
      };
    }

    return enqueueMutation(
      async () => {
        try {
          const current =
            await readDocument();

          /**
           * If an existing file is corrupt, do NOT overwrite it
           * through replaceAll. This prevents accidental history
           * destruction.
           */
          if (
            current.approved !==
            true &&
            current.exists ===
            true
          ) {
            return {
              approved: false,

              replaced: false,

              count: 0,

              errors:
                current.errors,
            };
          }

          const document =
            createEmptyDocument();

          document.trades =
            normalizedTrades;

          await writeDocument(
            document,
          );

          initialized =
            true;

          lastError =
            null;

          return {
            approved: true,

            replaced: true,

            count:
              normalizedTrades.length,

            errors: [],
          };
        } catch (error) {
          lastError =
            safeErrorMessage(
              error,
            );

          return {
            approved: false,

            replaced: false,

            count: 0,

            errors: [
              lastError,
            ],
          };
        }
      },
    );
  }

  /**
   * ----------------------------------------------------------
   * CLEAR
   * ----------------------------------------------------------
   *
   * This is intentionally explicit.
   *
   * Nothing in normal trade execution should call this.
   */

  async function clear() {
    return enqueueMutation(
      async () => {
        try {
          const current =
            await readDocument();

          if (
            current.approved !==
              true &&
            current.exists ===
              true
          ) {
            return {
              approved: false,

              cleared: false,

              errors:
                current.errors,
            };
          }

          await writeDocument(
            createEmptyDocument(),
          );

          initialized =
            true;

          lastError =
            null;

          return {
            approved: true,

            cleared: true,

            errors: [],
          };
        } catch (error) {
          lastError =
            safeErrorMessage(
              error,
            );

          return {
            approved: false,

            cleared: false,

            errors: [
              lastError,
            ],
          };
        }
      },
    );
  }

  /**
   * ----------------------------------------------------------
   * STATE
   * ----------------------------------------------------------
   */

  function getState() {
    return {
      service:
        "TRADE_HISTORY_REPOSITORY",

      version:
        TRADE_HISTORY_REPOSITORY_VERSION,

      initialized,

      filePath:
        resolvedFilePath,

      lastLoadedAt,

      lastPersistedAt,

      lastError,
    };
  }

  return Object.freeze({
    initialize,

    loadAll,

    findById,

    storeTrade,

    replaceAll,

    clear,

    getState,
  });
}

export default
  createTradeHistoryRepository;