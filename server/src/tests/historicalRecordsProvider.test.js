import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * ============================================================
 * HISTORICAL RECORDS PROVIDER TESTS
 * ============================================================
 *
 * PURPOSE
 * -------
 * Validate the production contracts of:
 *
 *   src/data/providers/historicalRecordsProvider.js
 *
 * These tests deliberately mock external historical-data and
 * snapshot providers. They should never depend on:
 *
 * - Alpaca network availability
 * - SEC availability
 * - FRED availability
 * - Reddit availability
 * - live market conditions
 *
 * The goal is deterministic validation of:
 *
 * - point-in-time safety
 * - forward-outcome safety
 * - caching
 * - READ / REBUILD behavior
 * - in-flight deduplication
 * - bounded concurrency
 * - failure isolation
 * - deterministic ordering
 */

const {
  getHistoricalBarsMock,
  getHistoricalSnapshotMock,
} = vi.hoisted(() => ({
  getHistoricalBarsMock: vi.fn(),
  getHistoricalSnapshotMock: vi.fn(),
}));

vi.mock(
  "../data/providers/alpacaHistoricalDataService.js",
  () => ({
    ALPACA_FEED: {
      IEX: "iex",
    },

    ALPACA_TIMEFRAME: {
      FIVE_MINUTES: "5Min",
    },

    getHistoricalBars:
      getHistoricalBarsMock,
  }),
);

vi.mock(
  "../data/providers/historicalSnapshotProvider.js",
  () => ({
    default:
      getHistoricalSnapshotMock,
  }),
);

import historicalRecordsProvider, {
  HISTORICAL_RECORDS_MODE,
  clearHistoricalRecordsCache,
  getHistoricalRecordsCacheStatus,
} from "../data/providers/historicalRecordsProvider.js";

/**
 * ============================================================
 * TEST HELPERS
 * ============================================================
 */

const BASE_TIME =
  Date.parse("2025-01-02T14:30:00.000Z");

const FIVE_MINUTES_MS =
  5 * 60 * 1000;

function createBars({
  count = 100,
  startTime = BASE_TIME,
  startPrice = 100,
} = {}) {
  return Array.from(
    { length: count },
    (_, index) => {
      const close =
        startPrice +
        index * 0.1;

      return {
        timestamp:
          new Date(
            startTime +
              index *
                FIVE_MINUTES_MS,
          ).toISOString(),

        open:
          close - 0.05,

        high:
          close + 0.1,

        low:
          close - 0.1,

        close,

        volume:
          1000 + index,
      };
    },
  );
}

function approvedHistoricalBars(
  bars,
) {
  return {
    approved: true,
    bars,
  };
}

function approvedSnapshot({
  timestamp,
  marker = "TEST",
} = {}) {
  return {
    approved: true,

    status: "APPROVED",

    data: {
      timestamp,

      coverage: {
        ratio: 1,
      },

      fingerprint: {
        technical: {
          marker,
        },

        macro: null,
        regime: null,
        country: null,
        company: null,
        events: null,
        social: null,
        volatility: null,
        liquidity: null,
      },
    },
  };
}

function buildContext({
  symbol = "AAPL",
  bars,
  mode =
    HISTORICAL_RECORDS_MODE.READ,
  historicalConfig = {},
  asOfTimestamp,
} = {}) {
  const resolvedBars =
    bars ??
    createBars({
      count: 100,
    });

  return {
    symbol,

    asOfTimestamp:
      asOfTimestamp ??
      resolvedBars[
        resolvedBars.length - 1
      ]?.timestamp,

    candles: [],

    historicalMode:
      mode,

    historicalConfig: {
      /**
       * Deliberately tiny values make deterministic unit
       * tests possible without thousands of bars.
       */
      minimumWarmupBars: 3,

      barsPerTradingDay: 1,

      sampleIntervalMinutes: 5,

      maximumRecords: 500,

      maximumBars: 10_000,

      snapshotConcurrency: 2,

      cacheTtlMs: 60_000,

      lookbackDays: 30,

      ...historicalConfig,
    },
  };
}

async function runProvider({
  bars,
  context = {},
} = {}) {
  const resolvedBars =
    bars ??
    createBars({
      count: 100,
    });

  getHistoricalBarsMock
    .mockResolvedValue(
      approvedHistoricalBars(
        resolvedBars,
      ),
    );

  getHistoricalSnapshotMock
    .mockImplementation(
      async ({
        asOfTimestamp,
      }) =>
        approvedSnapshot({
          timestamp:
            asOfTimestamp,
        }),
    );

  return historicalRecordsProvider(
    buildContext({
      bars:
        resolvedBars,

      ...context,
    }),
  );
}

/**
 * ============================================================
 * RESET
 * ============================================================
 */

beforeEach(() => {
  vi.clearAllMocks();

  clearHistoricalRecordsCache();
});

/**
 * ============================================================
 * BASIC CONTRACT
 * ============================================================
 */

describe(
  "Historical Records Provider — Basic Contract",
  () => {
    it(
      "fails closed when symbol is missing",
      async () => {
        const records =
          await historicalRecordsProvider({
            symbol: "",
            asOfTimestamp:
              new Date().toISOString(),
          });

        expect(records).toEqual([]);

        expect(
          getHistoricalBarsMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when asOfTimestamp is missing",
      async () => {
        const records =
          await historicalRecordsProvider({
            symbol: "AAPL",
          });

        expect(records).toEqual([]);

        expect(
          getHistoricalBarsMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails closed when historical data provider rejects the request",
      async () => {
        getHistoricalBarsMock
          .mockResolvedValue({
            approved: false,
            bars: [],
          });

        const bars =
          createBars({
            count: 100,
          });

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,
            }),
          );

        expect(records).toEqual([]);
      },
    );

    it(
      "returns historical records when sufficient approved evidence exists",
      async () => {
        const records =
          await runProvider();

        expect(
          Array.isArray(records),
        ).toBe(true);

        expect(
          records.length,
        ).toBeGreaterThan(0);

        expect(
          records[0],
        ).toMatchObject({
          symbol: "AAPL",

          source:
            "HISTORICAL_RECORDS_PROVIDER",
        });

        expect(
          records[0]
            .forwardReturns,
        ).toHaveProperty(
          "sixtyDay",
        );
      },
    );
  },
);

/**
 * ============================================================
 * CACHE CONTRACT
 * ============================================================
 */

describe(
  "Historical Records Provider — Cache Contract",
  () => {
    it(
      "READ mode reuses a completed cached build",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await runProvider({
          bars,
        });

        const firstCalls =
          getHistoricalBarsMock
            .mock.calls.length;

        const second =
          await historicalRecordsProvider(
            buildContext({
              bars,
            }),
          );

        expect(
          second.length,
        ).toBeGreaterThan(0);

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(
          firstCalls,
        );
      },
    );

    it(
      "caches a valid empty result",
      async () => {
        const bars =
          createBars({
            count: 10,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        const context =
          buildContext({
            bars,

            historicalConfig: {
              minimumWarmupBars:
                200,
            },
          });

        const first =
          await historicalRecordsProvider(
            context,
          );

        const second =
          await historicalRecordsProvider(
            context,
          );

        expect(first).toEqual([]);
        expect(second).toEqual([]);

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "REBUILD bypasses completed cache",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        await runProvider({
          bars,
        });

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(1);

        await historicalRecordsProvider(
          buildContext({
            bars,

            mode:
              HISTORICAL_RECORDS_MODE
                .REBUILD,
          }),
        );

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(2);
      },
    );

    it(
      "different configurations do not collide in cache",
      async () => {
        const bars =
          createBars({
            count: 120,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
            }) =>
              approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              }),
          );

        await historicalRecordsProvider(
          buildContext({
            bars,

            historicalConfig: {
              sampleIntervalMinutes:
                5,
            },
          }),
        );

        await historicalRecordsProvider(
          buildContext({
            bars,

            historicalConfig: {
              sampleIntervalMinutes:
                10,
            },
          }),
        );

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(2);
      },
    );

    it(
      "can clear cache for one symbol without clearing another",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
            }) =>
              approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              }),
          );

        await historicalRecordsProvider(
          buildContext({
            symbol: "AAPL",
            bars,
          }),
        );

        await historicalRecordsProvider(
          buildContext({
            symbol: "MSFT",
            bars,
          }),
        );

        expect(
          getHistoricalRecordsCacheStatus()
            .cachedKeys,
        ).toBe(2);

        clearHistoricalRecordsCache(
          "AAPL",
        );

        expect(
          getHistoricalRecordsCacheStatus()
            .cachedKeys,
        ).toBe(1);

        await historicalRecordsProvider(
          buildContext({
            symbol: "MSFT",
            bars,
          }),
        );

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(2);

        await historicalRecordsProvider(
          buildContext({
            symbol: "AAPL",
            bars,
          }),
        );

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(3);
      },
    );
  },
);

/**
 * ============================================================
 * IN-FLIGHT DEDUPLICATION
 * ============================================================
 */

describe(
  "Historical Records Provider — In-Flight Deduplication",
  () => {
    it(
      "shares one build between simultaneous identical requests",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        let releaseHistoricalBars;

        const gate =
          new Promise(
            (resolve) => {
              releaseHistoricalBars =
                resolve;
            },
          );

        getHistoricalBarsMock
          .mockImplementation(
            async () => {
              await gate;

              return approvedHistoricalBars(
                bars,
              );
            },
          );

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
            }) =>
              approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              }),
          );

        const context =
          buildContext({
            bars,
          });

        const first =
          historicalRecordsProvider(
            context,
          );

        const second =
          historicalRecordsProvider(
            context,
          );

        /**
         * Allow both provider calls to reach the in-flight
         * registry before releasing the mocked download.
         */
        await Promise.resolve();

        expect(
          getHistoricalRecordsCacheStatus()
            .inFlightBuilds,
        ).toBe(1);

        releaseHistoricalBars();

        const [
          firstResult,
          secondResult,
        ] =
          await Promise.all([
            first,
            second,
          ]);

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          firstResult,
        ).toEqual(
          secondResult,
        );

        expect(
          getHistoricalRecordsCacheStatus()
            .inFlightBuilds,
        ).toBe(0);
      },
    );

    it(
      "READ and REBUILD share an already-running identical build",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        let release;

        const gate =
          new Promise(
            (resolve) => {
              release = resolve;
            },
          );

        getHistoricalBarsMock
          .mockImplementation(
            async () => {
              await gate;

              return approvedHistoricalBars(
                bars,
              );
            },
          );

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
            }) =>
              approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              }),
          );

        const read =
          historicalRecordsProvider(
            buildContext({
              bars,

              mode:
                HISTORICAL_RECORDS_MODE
                  .READ,
            }),
          );

        const rebuild =
          historicalRecordsProvider(
            buildContext({
              bars,

              mode:
                HISTORICAL_RECORDS_MODE
                  .REBUILD,
            }),
          );

        await Promise.resolve();

        release();

        const results =
          await Promise.all([
            read,
            rebuild,
          ]);

        expect(
          getHistoricalBarsMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          results[0],
        ).toEqual(
          results[1],
        );
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
  "Historical Records Provider — Point In Time Safety",
  () => {
    it(
      "never supplies future candles to a historical snapshot",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
              candles,
            }) => {
              const cutoff =
                Date.parse(
                  asOfTimestamp,
                );

              for (
                const candle
                of candles
              ) {
                expect(
                  Date.parse(
                    candle.timestamp,
                  ),
                ).toBeLessThanOrEqual(
                  cutoff,
                );
              }

              const finalCandle =
                candles[
                  candles.length - 1
                ];

              expect(
                finalCandle.timestamp,
              ).toBe(
                asOfTimestamp,
              );

              return approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              });
            },
          );

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,
            }),
          );

        expect(
          records.length,
        ).toBeGreaterThan(0);

        expect(
          getHistoricalSnapshotMock,
        ).toHaveBeenCalled();
      },
    );

    it(
      "never uses candles later than the live asOfTimestamp",
      async () => {
        const bars =
          createBars({
            count: 140,
          });

        const cutoffIndex =
          99;

        const cutoff =
          bars[cutoffIndex]
            .timestamp;

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
              candles,
            }) => {
              expect(
                Date.parse(
                  asOfTimestamp,
                ),
              ).toBeLessThanOrEqual(
                Date.parse(cutoff),
              );

              expect(
                candles.every(
                  (candle) =>
                    Date.parse(
                      candle.timestamp,
                    ) <=
                    Date.parse(cutoff),
                ),
              ).toBe(true);

              return approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              });
            },
          );

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,

              asOfTimestamp:
                cutoff,
            }),
          );

        expect(
          records.length,
        ).toBeGreaterThan(0);
      },
    );

    it(
      "does not emit records whose sixty-day forward outcome is unavailable",
      async () => {
        const bars =
          createBars({
            count: 20,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        getHistoricalSnapshotMock
          .mockResolvedValue(
            approvedSnapshot(),
          );

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,

              historicalConfig: {
                minimumWarmupBars:
                  3,

                barsPerTradingDay:
                  1,

                /**
                 * 60 bars are required after a sample,
                 * but only 20 bars exist.
                 */
              },
            }),
          );

        expect(records).toEqual([]);

        expect(
          getHistoricalSnapshotMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/**
 * ============================================================
 * CONCURRENCY CONTRACT
 * ============================================================
 */

describe(
  "Historical Records Provider — Concurrency",
  () => {
    it(
      "never exceeds configured snapshot concurrency",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        let active = 0;
        let maximumActive = 0;

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
            }) => {
              active += 1;

              maximumActive =
                Math.max(
                  maximumActive,
                  active,
                );

              await new Promise(
                (resolve) =>
                  setTimeout(
                    resolve,
                    2,
                  ),
              );

              active -= 1;

              return approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              });
            },
          );

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,

              historicalConfig: {
                snapshotConcurrency:
                  2,
              },
            }),
          );

        expect(
          records.length,
        ).toBeGreaterThan(0);

        expect(
          maximumActive,
        ).toBeLessThanOrEqual(2);

        expect(
          maximumActive,
        ).toBeGreaterThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * FAILURE ISOLATION
 * ============================================================
 */

describe(
  "Historical Records Provider — Failure Isolation",
  () => {
    it(
      "one failed historical snapshot does not destroy the full build",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        let calls = 0;

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
            }) => {
              calls += 1;

              if (calls === 2) {
                throw new Error(
                  "Synthetic snapshot failure",
                );
              }

              return approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              });
            },
          );

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,
            }),
          );

        expect(
          calls,
        ).toBeGreaterThan(1);

        expect(
          records.length,
        ).toBeGreaterThan(0);

        expect(
          records.length,
        ).toBeLessThan(calls);
      },
    );

    it(
      "complete historical provider failure returns an empty array",
      async () => {
        const consoleError =
          vi.spyOn(
            console,
            "error",
          )
            .mockImplementation(
              () => {},
            );

        getHistoricalBarsMock
          .mockRejectedValue(
            new Error(
              "Synthetic Alpaca failure",
            ),
          );

        const bars =
          createBars({
            count: 100,
          });

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,
            }),
          );

        expect(records).toEqual([]);

        expect(
          consoleError,
        ).toHaveBeenCalled();

        consoleError
          .mockRestore();
      },
    );

    it(
      "rejects snapshots containing no usable fingerprint evidence",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        getHistoricalSnapshotMock
          .mockResolvedValue({
            approved: true,

            data: {
              fingerprint: {
                technical: null,
                macro: null,
                regime: null,
                country: null,
                company: null,
                events: null,
                social: null,
                volatility: null,
                liquidity: null,
              },
            },
          });

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,
            }),
          );

        expect(records).toEqual([]);
      },
    );
  },
);

/**
 * ============================================================
 * DETERMINISTIC ORDERING
 * ============================================================
 */

describe(
  "Historical Records Provider — Deterministic Ordering",
  () => {
    it(
      "preserves chronological record ordering even when snapshots finish out of order",
      async () => {
        const bars =
          createBars({
            count: 100,
          });

        getHistoricalBarsMock
          .mockResolvedValue(
            approvedHistoricalBars(
              bars,
            ),
          );

        let call = 0;

        getHistoricalSnapshotMock
          .mockImplementation(
            async ({
              asOfTimestamp,
            }) => {
              const currentCall =
                call;

              call += 1;

              /**
               * Alternate completion latency so later
               * workers can finish before earlier workers.
               */
              const delay =
                currentCall % 2 === 0
                  ? 5
                  : 0;

              await new Promise(
                (resolve) =>
                  setTimeout(
                    resolve,
                    delay,
                  ),
              );

              return approvedSnapshot({
                timestamp:
                  asOfTimestamp,
              });
            },
          );

        const records =
          await historicalRecordsProvider(
            buildContext({
              bars,

              historicalConfig: {
                snapshotConcurrency:
                  4,
              },
            }),
          );

        expect(
          records.length,
        ).toBeGreaterThan(1);

        const timestamps =
          records.map(
            (record) =>
              Date.parse(
                record.timestamp,
              ),
          );

        const sorted =
          [...timestamps].sort(
            (a, b) =>
              a - b,
          );

        expect(
          timestamps,
        ).toEqual(sorted);
      },
    );
  },
);

/**
 * ============================================================
 * FORWARD RETURNS
 * ============================================================
 */

describe(
  "Historical Records Provider — Forward Return Contract",
  () => {
    it(
      "produces finite realized returns for every required horizon",
      async () => {
        const records =
          await runProvider();

        expect(
          records.length,
        ).toBeGreaterThan(0);

        for (
          const record
          of records
        ) {
          expect(
            Number.isFinite(
              record
                .forwardReturns
                .oneHour,
            ),
          ).toBe(true);

          expect(
            Number.isFinite(
              record
                .forwardReturns
                .oneDay,
            ),
          ).toBe(true);

          expect(
            Number.isFinite(
              record
                .forwardReturns
                .fiveDay,
            ),
          ).toBe(true);

          expect(
            Number.isFinite(
              record
                .forwardReturns
                .twentyDay,
            ),
          ).toBe(true);

          expect(
            Number.isFinite(
              record
                .forwardReturns
                .sixtyDay,
            ),
          ).toBe(true);
        }
      },
    );

    it(
      "calculates forward returns from realized future closes rather than fabricated values",
      async () => {
        const bars =
          createBars({
            count: 100,
            startPrice: 100,
          });

        const records =
          await runProvider({
            bars,
          });

        expect(
          records.length,
        ).toBeGreaterThan(0);

        const first =
          records[0];

        const entryIndex =
          bars.findIndex(
            (bar) =>
              bar.timestamp ===
              first.timestamp,
          );

        expect(
          entryIndex,
        ).toBeGreaterThanOrEqual(
          0,
        );

        const entry =
          bars[entryIndex]
            .close;

        const expectedOneDay =
          (
            bars[
              entryIndex + 1
            ].close -
            entry
          ) /
          entry;

        expect(
          first
            .forwardReturns
            .oneDay,
        ).toBeCloseTo(
          expectedOneDay,
          6,
        );
      },
    );
  },
);