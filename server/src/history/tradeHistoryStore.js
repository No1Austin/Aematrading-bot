// server/src/history/tradeHistoryStore.js

/**
 * ============================================================
 * TRADE HISTORY STORE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Store completed trades taken by the bot so future trade
 * candidates can compare their setup against historical
 * outcomes.
 *
 * SAFETY PRINCIPLES
 * -----------------
 *
 * 1. Only CLOSED / COMPLETED trades are stored.
 * 2. Every record must preserve its entry fingerprint.
 * 3. Duplicate trade IDs are rejected.
 * 4. Historical queries can be restricted to trades that
 *    existed before a candidate timestamp.
 * 5. Future trades must never leak into backtests.
 * 6. Malformed records fail safely.
 */

import createTradeHistoryRepository from
  "./tradeHistoryRepository.js";

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const TRADE_HISTORY_STATUS =
  Object.freeze({
    STORED:
      "STORED",

    DUPLICATE:
      "DUPLICATE",

    INVALID:
      "INVALID",

    NOT_FOUND:
      "NOT_FOUND",

    COMPLETE:
      "COMPLETE",

    ERROR:
      "ERROR",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  return Number.isFinite(
    Number(value),
  );
}

function round(
  value,
  decimals = 4,
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) * factor,
    ) / factor
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value)
    .trim()
    .toUpperCase();
}

function normalizeSide(side) {
  const value =
    normalizeText(side);

  if (
    value === "LONG" ||
    value === "SHORT"
  ) {
    return value;
  }

  return null;
}

function safeDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

function safeISOString(value) {
  const date =
    safeDate(value);

  return date
    ? date.toISOString()
    : null;
}

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return structuredClone(
    value,
  );
}

/**
 * ============================================================
 * RESULT CLASSIFICATION
 * ============================================================
 */

function classifyOutcome({
  realizedPnL,
}) {
  if (
    !isFiniteNumber(
      realizedPnL,
    )
  ) {
    return "UNKNOWN";
  }

  const pnl =
    Number(
      realizedPnL,
    );

  if (pnl > 0) {
    return "WIN";
  }

  if (pnl < 0) {
    return "LOSS";
  }

  return "BREAKEVEN";
}

/**
 * ============================================================
 * TRADE DURATION
 * ============================================================
 */

function calculateDurationMs({
  openedAt,
  closedAt,
}) {
  const opened =
    safeDate(
      openedAt,
    );

  const closed =
    safeDate(
      closedAt,
    );

  if (
    !opened ||
    !closed
  ) {
    return null;
  }

  const duration =
    closed.getTime() -
    opened.getTime();

  return duration >= 0
    ? duration
    : null;
}

/**
 * ============================================================
 * NORMALIZE COMPLETED TRADE
 * ============================================================
 */

export function normalizeCompletedTrade({
  trade,
} = {}) {
  const errors = [];

  if (!trade) {
    return {
      approved: false,

      status:
        TRADE_HISTORY_STATUS
          .INVALID,

      record: null,

      errors: [
        "Trade record is required.",
      ],

      warnings: [],
    };
  }

  const id =
    trade.id ??
    trade.tradeId ??
    trade.positionId ??
    null;

  if (
    !id ||
    String(id)
      .trim()
      .length === 0
  ) {
    errors.push(
      "Trade ID is required.",
    );
  }

  const symbol =
    normalizeText(
      trade.symbol,
    );

  if (!symbol) {
    errors.push(
      "Trade symbol is required.",
    );
  }

  const side =
    normalizeSide(
      trade.side,
    );

  if (!side) {
    errors.push(
      "Trade side must be LONG or SHORT.",
    );
  }

  const status =
    normalizeText(
      trade.status,
    );

  if (
    status !== "CLOSED" &&
    status !== "COMPLETED"
  ) {
    errors.push(
      "Only CLOSED or COMPLETED trades may be stored.",
    );
  }

  const openedAt =
    safeISOString(
      trade.openedAt ??
      trade.entryTimestamp,
    );

  const closedAt =
    safeISOString(
      trade.closedAt ??
      trade.exitTimestamp,
    );

  if (!openedAt) {
    errors.push(
      "Valid trade openedAt timestamp is required.",
    );
  }

  if (!closedAt) {
    errors.push(
      "Valid trade closedAt timestamp is required.",
    );
  }

  if (
    openedAt &&
    closedAt &&
    new Date(
      closedAt,
    ).getTime() <
    new Date(
      openedAt,
    ).getTime()
  ) {
    errors.push(
      "Trade closedAt cannot be earlier than openedAt.",
    );
  }

  const fingerprint =
    trade.entryFingerprint ??
    trade.fingerprint ??
    trade.entrySetupFingerprint ??
    null;

  if (!fingerprint) {
    errors.push(
      "Entry trade setup fingerprint is required.",
    );
  }

  if (
    errors.length > 0
  ) {
    return {
      approved: false,

      status:
        TRADE_HISTORY_STATUS
          .INVALID,

      record: null,

      errors,

      warnings: [],
    };
  }

  const realizedPnL =
    isFiniteNumber(
      trade.realizedPnL,
    )
      ? Number(
          trade.realizedPnL,
        )
      : null;

  const finalR =
    isFiniteNumber(
      trade.finalR,
    )
      ? Number(
          trade.finalR,
        )
      : null;

  const peakR =
    isFiniteNumber(
      trade.peakR,
    )
      ? Number(
          trade.peakR,
        )
      : null;

  const entryPrice =
    isFiniteNumber(
      trade.entryPrice,
    )
      ? Number(
          trade.entryPrice,
        )
      : null;

  const exitPrice =
    isFiniteNumber(
      trade.exitPrice,
    )
      ? Number(
          trade.exitPrice,
        )
      : null;

  const originalShares =
    isFiniteNumber(
      trade.originalShares,
    )
      ? Number(
          trade.originalShares,
        )
      : (
          isFiniteNumber(
            trade.shares,
          )
            ? Number(
                trade.shares,
              )
            : null
        );

  const durationMs =
    calculateDurationMs({
      openedAt,
      closedAt,
    });

  const record = {
    id:
      String(id),

    symbol,

    side,

    status:
      "CLOSED",

    fingerprintVersion:
      isFiniteNumber(
        fingerprint?.version,
      )
        ? Number(
            fingerprint.version,
          )
        : null,

    entryFingerprint:
      clone(
        fingerprint,
      ),

    openedAt,

    closedAt,

    durationMs,

    entryPrice:
      entryPrice !== null
        ? round(
            entryPrice,
            4,
          )
        : null,

    exitPrice:
      exitPrice !== null
        ? round(
            exitPrice,
            4,
          )
        : null,

    originalShares:
      originalShares !== null
        ? round(
            originalShares,
            4,
          )
        : null,

    realizedPnL:
      realizedPnL !== null
        ? round(
            realizedPnL,
            2,
          )
        : null,

    finalR:
      finalR !== null
        ? round(
            finalR,
            4,
          )
        : null,

    peakR:
      peakR !== null
        ? round(
            peakR,
            4,
          )
        : null,

    outcome:
      classifyOutcome({
        realizedPnL,
      }),

    exitReason:
      normalizeText(
        trade.exitReason,
      ),

    reductionHistory:
      Array.isArray(
        trade.reductionHistory,
      )
        ? clone(
            trade.reductionHistory,
          )
        : [],

    metadata:
      trade.metadata
        ? clone(
            trade.metadata,
          )
        : {},

    storedAt:
      new Date()
        .toISOString(),
  };

  return {
    approved: true,

    status:
      TRADE_HISTORY_STATUS
        .COMPLETE,

    record,

    errors: [],

    warnings: [],
  };
}

/**
 * ============================================================
 * STORE
 * ============================================================
 */

export class TradeHistoryStore {
  constructor({
    initialRecords = [],

    /**
     * Optional durable persistence repository.
     *
     * Existing callers remain fully synchronous when this is null.
     * Production callers can inject createTradeHistoryRepository().
     */
    repository = null,
  } = {}) {
    this.records =
      new Map();

    this.repository =
      repository;

    this.persistenceInitialized =
      false;

    this.persistenceLastError =
      null;

    this.persistenceLastWriteAt =
      null;

    /**
     * Serial promise chain used only for persistence side effects.
     *
     * storeTrade() itself intentionally remains synchronous so the
     * existing execution pipeline keeps its current contract.
     */
    this.persistenceQueue =
      Promise.resolve();

    for (
      const trade
      of initialRecords
    ) {
      const normalized =
        normalizeCompletedTrade({
          trade,
        });

      if (
        normalized
          .approved === true
      ) {
        this.records.set(
          normalized
            .record
            .id,

          normalized
            .record,
        );
      }
    }
  }

  /**
   * ========================================================
   * INITIALIZE PERSISTENCE
   * ========================================================
   *
   * Hydrates durable completed-trade history into memory.
   *
   * This method is intentionally explicit and asynchronous.
   * Construction remains synchronous for backward compatibility.
   */

  async initialize() {
    if (!this.repository) {
      this.persistenceInitialized =
        false;

      return {
        approved: true,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .COMPLETE,

        persistenceEnabled:
          false,

        hydrated: 0,

        count:
          this.records.size,

        errors: [],

        warnings: [
          "Trade history persistence repository is not configured.",
        ],
      };
    }

    try {
      const repositoryInitialization =
        typeof this.repository
          .initialize ===
          "function"
          ? await this.repository
              .initialize()
          : {
              approved: true,
              errors: [],
            };

      if (
        repositoryInitialization
          ?.approved !== true
      ) {
        const errors =
          Array.isArray(
            repositoryInitialization
              ?.errors,
          )
            ? repositoryInitialization
                .errors
            : [
                "Trade history repository initialization failed.",
              ];

        this.persistenceLastError =
          errors.join(" ");

        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .ERROR,

          persistenceEnabled:
            true,

          hydrated: 0,

          count:
            this.records.size,

          errors,

          warnings: [],
        };
      }

      if (
        typeof this.repository
          .loadAll !==
        "function"
      ) {
        this.persistenceLastError =
          "Configured trade history repository does not implement loadAll().";

        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .ERROR,

          persistenceEnabled:
            true,

          hydrated: 0,

          count:
            this.records.size,

          errors: [
            this.persistenceLastError,
          ],

          warnings: [],
        };
      }

      const loaded =
        await this.repository
          .loadAll();

      if (loaded?.approved !== true) {
        const errors =
          Array.isArray(
            loaded?.errors,
          )
            ? loaded.errors
            : [
                "Trade history repository hydration failed.",
              ];

        this.persistenceLastError =
          errors.join(" ");

        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .ERROR,

          persistenceEnabled:
            true,

          hydrated: 0,

          count:
            this.records.size,

          errors,

          warnings: [],
        };
      }

      let hydrated = 0;

      const warnings = [];

      for (
        const trade
        of (
          Array.isArray(loaded.trades)
            ? loaded.trades
            : []
        )
      ) {
        const normalized =
          normalizeCompletedTrade({
            trade,
          });

        if (
          normalized.approved !==
          true
        ) {
          warnings.push(
            `Skipped invalid persisted trade ${
              trade?.id ??
              "UNKNOWN"
            }: ${normalized.errors.join(" ")}`,
          );

          continue;
        }

        /**
         * In-memory initialRecords win on ID collision.
         *
         * This avoids silently replacing explicitly supplied replay/test
         * state during hydration.
         */
        if (
          this.records.has(
            normalized.record.id,
          )
        ) {
          continue;
        }

        this.records.set(
          normalized.record.id,
          normalized.record,
        );

        hydrated += 1;
      }

      this.persistenceInitialized =
        true;

      this.persistenceLastError =
        null;

      return {
        approved: true,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .COMPLETE,

        persistenceEnabled:
          true,

        hydrated,

        count:
          this.records.size,

        errors: [],

        warnings,
      };
    } catch (error) {
      this.persistenceLastError =
        error instanceof Error
          ? error.message
          : String(error);

      return {
        approved: false,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .ERROR,

        persistenceEnabled:
          true,

        hydrated: 0,

        count:
          this.records.size,

        errors: [
          this.persistenceLastError,
        ],

        warnings: [],
      };
    }
  }

  /**
   * ========================================================
   * QUEUE DURABLE WRITE
   * ========================================================
   */

  queuePersistence(record) {
    if (
      !this.repository ||
      typeof this.repository
        .storeTrade !==
        "function"
    ) {
      return;
    }

    this.persistenceQueue =
      this.persistenceQueue
        .then(
          async () => {
            const result =
              await this.repository
                .storeTrade(
                  clone(record),
                );

            /**
             * A duplicate on disk is safe when the same ID already
             * exists there. It commonly means a replayed in-memory
             * record was already persisted.
             */
            if (
              result?.approved ===
                true ||
              result?.duplicate ===
                true
            ) {
              this.persistenceLastError =
                null;

              this.persistenceLastWriteAt =
                new Date()
                  .toISOString();

              return result;
            }

            const message =
              Array.isArray(
                result?.errors,
              ) &&
              result.errors.length > 0
                ? result.errors.join(" ")
                : "Trade history persistence write failed.";

            this.persistenceLastError =
              message;

            throw new Error(
              message,
            );
          },
        )
        .catch(
          (error) => {
            this.persistenceLastError =
              error instanceof Error
                ? error.message
                : String(error);

            /**
             * Do not rethrow here.
             *
             * The trade is already CLOSED and safely present in the
             * in-memory history store. Persistence failure must be
             * observable, but it must not retroactively turn the
             * completed execution into a failed trade.
             */
            return {
              approved: false,

              errors: [
                this.persistenceLastError,
              ],
            };
          },
        );
  }

  /**
   * ========================================================
   * FLUSH PERSISTENCE
   * ========================================================
   *
   * Allows tests and graceful shutdown to wait until every queued
   * durable write has finished.
   */

  async flushPersistence() {
    await this.persistenceQueue;

    return {
      approved:
        this.persistenceLastError ===
        null,

      engine:
        "TRADE_HISTORY_STORE",

      status:
        this.persistenceLastError ===
        null
          ? TRADE_HISTORY_STATUS
              .COMPLETE
          : TRADE_HISTORY_STATUS
              .ERROR,

      persistenceEnabled:
        Boolean(
          this.repository,
        ),

      lastWriteAt:
        this.persistenceLastWriteAt,

      errors:
        this.persistenceLastError
          ? [
              this.persistenceLastError,
            ]
          : [],

      warnings: [],
    };
  }

  /**
   * ========================================================
   * PERSISTENCE STATE
   * ========================================================
   */

  getPersistenceState() {
    return {
      enabled:
        Boolean(
          this.repository,
        ),

      initialized:
        this.persistenceInitialized,

      pending:
        Boolean(
          this.repository,
        ),

      lastWriteAt:
        this.persistenceLastWriteAt,

      lastError:
        this.persistenceLastError,

      repository:
        this.repository &&
        typeof this.repository
          .getState ===
          "function"
          ? this.repository
              .getState()
          : null,
    };
  }

  /**
   * ========================================================
   * SIZE
   * ========================================================
   */

  get size() {
    return this.records.size;
  }

  /**
   * ========================================================
   * STORE TRADE
   * ========================================================
   */

  storeTrade(
    trade,
  ) {
    try {
      const normalized =
        normalizeCompletedTrade({
          trade,
        });

      if (
        normalized
          .approved !== true
      ) {
        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .INVALID,

          record: null,

          errors:
            normalized
              .errors,

          warnings:
            normalized
              .warnings,
        };
      }

      const record =
        normalized.record;

      if (
        this.records.has(
          record.id,
        )
      ) {
        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .DUPLICATE,

          record:
            clone(
              this.records.get(
                record.id,
              ),
            ),

          errors: [
            "Trade ID already exists in history store.",
          ],

          warnings: [],
        };
      }

      this.records.set(
        record.id,
        record,
      );

      /**
       * Persistence is intentionally fire-and-observe here.
       *
       * storeTrade() remains synchronous for the execution pipeline.
       * Graceful shutdown/tests can await flushPersistence().
       */
      this.queuePersistence(
        record,
      );

      return {
        approved: true,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .STORED,

        record:
          clone(
            record,
          ),

        errors: [],

        warnings: [],
      };
    } catch (error) {
      return {
        approved: false,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .ERROR,

        record: null,

        errors: [
          error instanceof Error
            ? error.message
            : String(error),
        ],

        warnings: [],
      };
    }
  }

  /**
   * ========================================================
   * GET BY ID
   * ========================================================
   */

  getTradeById(
    id,
  ) {
    if (
      !id ||
      !this.records.has(
        String(id),
      )
    ) {
      return {
        approved: false,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .NOT_FOUND,

        record: null,

        errors: [],

        warnings: [],
      };
    }

    return {
      approved: true,

      engine:
        "TRADE_HISTORY_STORE",

      status:
        TRADE_HISTORY_STATUS
          .COMPLETE,

      record:
        clone(
          this.records.get(
            String(id),
          ),
        ),

      errors: [],

      warnings: [],
    };
  }

  /**
   * ========================================================
   * QUERY HISTORY
   * ========================================================
   */

  queryTrades({
    symbol = null,

    side = null,

    beforeTimestamp = null,

    afterTimestamp = null,

    fingerprintVersion = null,

    outcome = null,

    limit = null,
  } = {}) {
    try {
      const normalizedSymbol =
        normalizeText(
          symbol,
        );

      const normalizedSide =
        side !== null
          ? normalizeSide(
              side,
            )
          : null;

      const normalizedOutcome =
        normalizeText(
          outcome,
        );

      const beforeDate =
        beforeTimestamp !==
        null
          ? safeDate(
              beforeTimestamp,
            )
          : null;

      const afterDate =
        afterTimestamp !==
        null
          ? safeDate(
              afterTimestamp,
            )
          : null;

      if (
        beforeTimestamp !==
          null &&
        !beforeDate
      ) {
        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .INVALID,

          records: [],

          errors: [
            "Invalid beforeTimestamp.",
          ],

          warnings: [],
        };
      }

      if (
        afterTimestamp !==
          null &&
        !afterDate
      ) {
        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .INVALID,

          records: [],

          errors: [
            "Invalid afterTimestamp.",
          ],

          warnings: [],
        };
      }

      let records =
        Array.from(
          this.records.values(),
        );

      if (normalizedSymbol) {
        records =
          records.filter(
            (record) =>
              record.symbol ===
              normalizedSymbol,
          );
      }

      if (normalizedSide) {
        records =
          records.filter(
            (record) =>
              record.side ===
              normalizedSide,
          );
      }

      /**
       * POINT-IN-TIME SAFETY
       *
       * A historical trade is only eligible if it
       * CLOSED before the candidate timestamp.
       */

      if (beforeDate) {
        records =
          records.filter(
            (record) => {
              const closed =
                safeDate(
                  record.closedAt,
                );

              return (
                closed &&
                closed.getTime() <
                beforeDate.getTime()
              );
            },
          );
      }

      if (afterDate) {
        records =
          records.filter(
            (record) => {
              const closed =
                safeDate(
                  record.closedAt,
                );

              return (
                closed &&
                closed.getTime() >
                afterDate.getTime()
              );
            },
          );
      }

      if (
        isFiniteNumber(
          fingerprintVersion,
        )
      ) {
        records =
          records.filter(
            (record) =>
              Number(
                record
                  .fingerprintVersion,
              ) ===
              Number(
                fingerprintVersion,
              ),
          );
      }

      if (normalizedOutcome) {
        records =
          records.filter(
            (record) =>
              record.outcome ===
              normalizedOutcome,
          );
      }

      /**
       * Newest historical trade first.
       */

      records.sort(
        (a, b) =>
          new Date(
            b.closedAt,
          ).getTime() -
          new Date(
            a.closedAt,
          ).getTime(),
      );

      if (
        isFiniteNumber(
          limit,
        ) &&
        Number(limit) >= 0
      ) {
        records =
          records.slice(
            0,
            Math.floor(
              Number(limit),
            ),
          );
      }

      return {
        approved: true,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .COMPLETE,

        records:
          clone(
            records,
          ),

        count:
          records.length,

        errors: [],

        warnings: [],
      };
    } catch (error) {
      return {
        approved: false,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .ERROR,

        records: [],

        count: 0,

        errors: [
          error instanceof Error
            ? error.message
            : String(error),
        ],

        warnings: [],
      };
    }
  }

  /**
   * ========================================================
   * CLEAR STORE
   * ========================================================
   *
   * Mainly useful for tests / replay sessions.
   */

  clear() {
    this.records.clear();

    return {
      approved: true,

      engine:
        "TRADE_HISTORY_STORE",

      status:
        TRADE_HISTORY_STATUS
          .COMPLETE,

      count: 0,

      errors: [],

      warnings: [],
    };
  }

  /**
   * ========================================================
   * CLEAR PERSISTENT HISTORY
   * ========================================================
   *
   * Explicit destructive operation.
   *
   * clear() above remains memory-only so existing replay/test
   * semantics do not unexpectedly erase durable learning history.
   */

  async clearPersistentHistory({
    clearMemory = true,
  } = {}) {
    if (
      !this.repository ||
      typeof this.repository
        .clear !==
        "function"
    ) {
      return {
        approved: false,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .ERROR,

        count:
          this.records.size,

        errors: [
          "Trade history persistence repository is not configured.",
        ],

        warnings: [],
      };
    }

    /**
     * Ensure earlier writes finish before destructive clearing.
     */
    await this.persistenceQueue;

    try {
      const result =
        await this.repository
          .clear();

      if (result?.approved !== true) {
        const errors =
          Array.isArray(
            result?.errors,
          )
            ? result.errors
            : [
                "Persistent trade history could not be cleared.",
              ];

        this.persistenceLastError =
          errors.join(" ");

        return {
          approved: false,

          engine:
            "TRADE_HISTORY_STORE",

          status:
            TRADE_HISTORY_STATUS
              .ERROR,

          count:
            this.records.size,

          errors,

          warnings: [],
        };
      }

      if (clearMemory) {
        this.records.clear();
      }

      this.persistenceLastError =
        null;

      this.persistenceLastWriteAt =
        new Date()
          .toISOString();

      return {
        approved: true,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .COMPLETE,

        count:
          this.records.size,

        errors: [],

        warnings: [],
      };
    } catch (error) {
      this.persistenceLastError =
        error instanceof Error
          ? error.message
          : String(error);

      return {
        approved: false,

        engine:
          "TRADE_HISTORY_STORE",

        status:
          TRADE_HISTORY_STATUS
            .ERROR,

        count:
          this.records.size,

        errors: [
          this.persistenceLastError,
        ],

        warnings: [],
      };
    }
  }

  /**
   * ========================================================
   * EXPORT
   * ========================================================
   */

  exportRecords() {
    return clone(
      Array.from(
        this.records.values(),
      ),
    );
  }
}

/**
 * ============================================================
 * DEFAULT FACTORY
 * ============================================================
 */

export function createTradeHistoryStore(
  options = {},
) {
  const {
    persistence = null,
    repository = null,
    ...storeOptions
  } = options ?? {};

  /**
   * Persistence remains opt-in.
   *
   * Existing callers receive the exact in-memory behavior they had
   * before this repository integration.
   */
  const resolvedRepository =
    repository ??
    (
      persistence?.enabled ===
      true
        ? createTradeHistoryRepository({
            filePath:
              persistence.filePath,

            logger:
              persistence.logger ??
              console,
          })
        : null
    );

  return new TradeHistoryStore({
    ...storeOptions,

    repository:
      resolvedRepository,
  });
}

export default createTradeHistoryStore;