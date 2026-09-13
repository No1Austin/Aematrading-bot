import {
  ALPACA_FEED,
  ALPACA_TIMEFRAME,
  getHistoricalBars,
} from "./alpacaHistoricalDataService.js";

import getHistoricalSnapshot from "./historicalSnapshotProvider.js";

/**
 * ============================================================
 * HISTORICAL RECORDS PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 * Build point-in-time historical records for:
 *
 *   src/analysis/historicalAnalogueEngine.js
 *
 * LiveEngineRunner calls this provider as:
 *
 *   historicalRecordsProvider(context)
 *
 * and expects an ARRAY as the result.
 *
 * RECORD CONTRACT
 * ---------------
 * {
 *   timestamp,
 *   fingerprint: {
 *     technical,
 *     macro,
 *     regime,
 *     country,
 *     company,
 *     events,
 *     social,
 *     volatility,
 *     liquidity
 *   },
 *   forwardReturns: {
 *     oneHour,
 *     oneDay,
 *     fiveDay,
 *     twentyDay,
 *     sixtyDay
 *   }
 * }
 *
 * LOOK-AHEAD RULE
 * ---------------
 * A record is returned to a live analysis only when every
 * forward-return horizon attached to that record is already
 * observable by context.asOfTimestamp.
 *
 * Missing historical inputs remain missing. We never replace
 * unavailable historical information with current/live data.
 */

const DEFAULT_CONFIG = Object.freeze({
  timeframe:
    ALPACA_TIMEFRAME.FIVE_MINUTES,

  feed:
    ALPACA_FEED.IEX,

  /**
   * Enough calendar history to produce a useful analogue pool.
   * This is configurable through environment variables.
   */
  lookbackDays: 730,

  /**
   * We build one state per trading day by default instead of
   * rebuilding macro/SEC/event snapshots for every 5-minute bar.
   */
  sampleIntervalMinutes: 390,

  /**
   * Technical engine needs warm-up candles.
   */
  minimumWarmupBars: 200,

  /**
   * Maximum records returned to the analogue engine.
   */
  maximumRecords: 500,

  /**
   * Alpaca download safety limit.
   */
  maximumBars: 250_000,

  /**
   * Cache completed record sets because this provider is called
   * during every live analysis cycle.
   */
  cacheTtlMs:
    6 * 60 * 60 * 1000,

  /**
   * Historical snapshots can invoke several point-in-time
   * providers. Keep concurrency deliberately bounded.
   */
  snapshotConcurrency: 4,

  /**
   * Trading-session approximation used for intraday horizons.
   */
  barsPerTradingDay: 78,
});

const cache =
  new Map();

/**
 * Deduplicate expensive historical database construction.
 *
 * Several live/manual requests for the same symbol/config/day
 * must share one build rather than launching duplicate Alpaca,
 * SEC, macro, country and event work.
 */
const inFlightBuilds =
  new Map();

export const HISTORICAL_RECORDS_MODE =
  Object.freeze({
    READ:
      "READ",

    REBUILD:
      "REBUILD",
  });

function normalizeMode(
  value,
) {
  const normalized =
    String(
      value ??
        HISTORICAL_RECORDS_MODE
          .READ,
    )
      .trim()
      .toUpperCase();

  return normalized ===
    HISTORICAL_RECORDS_MODE
      .REBUILD
    ? HISTORICAL_RECORDS_MODE
        .REBUILD
    : HISTORICAL_RECORDS_MODE
        .READ;
}

function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function finiteNumber(value) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function positiveInteger(
  value,
  fallback,
) {
  const number =
    Number(value);

  return Number.isInteger(number) &&
    number > 0
    ? number
    : fallback;
}

function envPositiveInteger(
  name,
  fallback,
) {
  return positiveInteger(
    process.env[name],
    fallback,
  );
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

function timestampMs(value) {
  const normalized =
    normalizeTimestamp(value);

  if (!normalized) {
    return null;
  }

  return new Date(
    normalized,
  ).getTime();
}

function getBarTimestamp(bar) {
  return (
    bar?.timestamp ??
    bar?.time ??
    bar?.t ??
    null
  );
}

function getBarClose(bar) {
  return finiteNumber(
    bar?.close ??
      bar?.c,
  );
}

function round(
  value,
  decimals = 6,
) {
  const number =
    finiteNumber(value);

  if (number === null) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
}

function percentReturn({
  entry,
  exit,
}) {
  const start =
    finiteNumber(entry);

  const end =
    finiteNumber(exit);

  if (
    start === null ||
    end === null ||
    start <= 0
  ) {
    return null;
  }

  return round(
    (
      end -
      start
    ) /
      start,
    6,
  );
}

function daysAgoIso({
  timestamp,
  days,
}) {
  const end =
    new Date(timestamp);

  const start =
    new Date(
      end.getTime() -
        days *
          24 *
          60 *
          60 *
          1000,
    );

  return start.toISOString();
}

function addDaysIso({
  timestamp,
  days,
}) {
  const date =
    new Date(timestamp);

  return new Date(
    date.getTime() +
      days *
        24 *
        60 *
        60 *
        1000,
  ).toISOString();
}

function mergeBars(...collections) {
  const byTimestamp =
    new Map();

  for (
    const collection
    of collections
  ) {
    if (
      !Array.isArray(
        collection,
      )
    ) {
      continue;
    }

    for (
      const bar
      of collection
    ) {
      const timestamp =
        normalizeTimestamp(
          getBarTimestamp(
            bar,
          ),
        );

      if (!timestamp) {
        continue;
      }

      byTimestamp.set(
        timestamp,
        {
          ...bar,
          timestamp,
        },
      );
    }
  }

  return [
    ...byTimestamp.values(),
  ].sort(
    (a, b) =>
      timestampMs(
        a.timestamp,
      ) -
      timestampMs(
        b.timestamp,
      ),
  );
}

function filterBarsAtOrBefore({
  bars,
  asOfTimestamp,
}) {
  const cutoff =
    timestampMs(
      asOfTimestamp,
    );

  if (cutoff === null) {
    return [];
  }

  return bars.filter(
    (bar) => {
      const time =
        timestampMs(
          getBarTimestamp(
            bar,
          ),
        );

      return (
        time !== null &&
        time <= cutoff
      );
    },
  );
}

function firstBarAtOrAfter({
  bars,
  timestamp,
}) {
  const target =
    timestampMs(timestamp);

  if (target === null) {
    return null;
  }

  for (
    const bar
    of bars
  ) {
    const time =
      timestampMs(
        getBarTimestamp(
          bar,
        ),
      );

    if (
      time !== null &&
      time >= target
    ) {
      return bar;
    }
  }

  return null;
}

/**
 * Find the first bar at/after a trading-bar offset.
 *
 * Because Alpaca's series contains market bars only, using bar
 * offsets avoids treating weekends/overnights as 5-minute bars.
 */
function barAtOffset({
  bars,
  index,
  offset,
}) {
  const targetIndex =
    index + offset;

  if (
    targetIndex < 0 ||
    targetIndex >=
      bars.length
  ) {
    return null;
  }

  return (
    bars[targetIndex] ??
    null
  );
}

function buildForwardReturns({
  bars,
  index,
  barsPerTradingDay,
}) {
  const entryBar =
    bars[index];

  const entry =
    getBarClose(
      entryBar,
    );

  if (entry === null) {
    return null;
  }

  const oneHourBar =
    barAtOffset({
      bars,
      index,
      offset: 12,
    });

  const oneDayBar =
    barAtOffset({
      bars,
      index,
      offset:
        barsPerTradingDay,
    });

  const fiveDayBar =
    barAtOffset({
      bars,
      index,
      offset:
        barsPerTradingDay *
        5,
    });

  const twentyDayBar =
    barAtOffset({
      bars,
      index,
      offset:
        barsPerTradingDay *
        20,
    });

  const sixtyDayBar =
    barAtOffset({
      bars,
      index,
      offset:
        barsPerTradingDay *
        60,
    });

  return {
    oneHour:
      percentReturn({
        entry,
        exit:
          getBarClose(
            oneHourBar,
          ),
      }),

    oneDay:
      percentReturn({
        entry,
        exit:
          getBarClose(
            oneDayBar,
          ),
      }),

    fiveDay:
      percentReturn({
        entry,
        exit:
          getBarClose(
            fiveDayBar,
          ),
      }),

    twentyDay:
      percentReturn({
        entry,
        exit:
          getBarClose(
            twentyDayBar,
          ),
      }),

    sixtyDay:
      percentReturn({
        entry,
        exit:
          getBarClose(
            sixtyDayBar,
          ),
      }),
  };
}

function hasCompleteForwardReturns(
  forwardReturns,
) {
  if (!forwardReturns) {
    return false;
  }

  return [
    forwardReturns.oneHour,
    forwardReturns.oneDay,
    forwardReturns.fiveDay,
    forwardReturns.twentyDay,
    forwardReturns.sixtyDay,
  ].every(
    (value) =>
      finiteNumber(value) !==
      null,
  );
}

function fingerprintHasEvidence(
  fingerprint,
) {
  if (
    !fingerprint ||
    typeof fingerprint !==
      "object"
  ) {
    return false;
  }

  return [
    fingerprint.technical,
    fingerprint.macro,
    fingerprint.regime,
    fingerprint.country,
    fingerprint.company,
    fingerprint.events,
    fingerprint.social,
    fingerprint.volatility,
    fingerprint.liquidity,
  ].some(
    (value) =>
      value !== null &&
      value !== undefined,
  );
}

function buildConfig(
  overrides = {},
) {
  return {
    timeframe:
      overrides.timeframe ??
      process.env
        .HISTORICAL_ANALOGUE_TIMEFRAME ??
      DEFAULT_CONFIG.timeframe,

    feed:
      overrides.feed ??
      process.env
        .HISTORICAL_ANALOGUE_FEED ??
      DEFAULT_CONFIG.feed,

    lookbackDays:
      positiveInteger(
        overrides.lookbackDays,
        envPositiveInteger(
          "HISTORICAL_ANALOGUE_LOOKBACK_DAYS",
          DEFAULT_CONFIG
            .lookbackDays,
        ),
      ),

    sampleIntervalMinutes:
      positiveInteger(
        overrides
          .sampleIntervalMinutes,
        envPositiveInteger(
          "HISTORICAL_ANALOGUE_SAMPLE_MINUTES",
          DEFAULT_CONFIG
            .sampleIntervalMinutes,
        ),
      ),

    minimumWarmupBars:
      positiveInteger(
        overrides
          .minimumWarmupBars,
        envPositiveInteger(
          "HISTORICAL_ANALOGUE_WARMUP_BARS",
          DEFAULT_CONFIG
            .minimumWarmupBars,
        ),
      ),

    maximumRecords:
      positiveInteger(
        overrides.maximumRecords,
        envPositiveInteger(
          "HISTORICAL_ANALOGUE_MAX_RECORDS",
          DEFAULT_CONFIG
            .maximumRecords,
        ),
      ),

    maximumBars:
      positiveInteger(
        overrides.maximumBars,
        DEFAULT_CONFIG
          .maximumBars,
      ),

    cacheTtlMs:
      positiveInteger(
        overrides.cacheTtlMs,
        DEFAULT_CONFIG
          .cacheTtlMs,
      ),

    snapshotConcurrency:
      positiveInteger(
        overrides
          .snapshotConcurrency,
        envPositiveInteger(
          "HISTORICAL_ANALOGUE_SNAPSHOT_CONCURRENCY",
          DEFAULT_CONFIG
            .snapshotConcurrency,
        ),
      ),

    barsPerTradingDay:
      positiveInteger(
        overrides
          .barsPerTradingDay,
        DEFAULT_CONFIG
          .barsPerTradingDay,
      ),
  };
}

/**
 * Sample historical state timestamps.
 *
 * We intentionally use a coarse interval. Building a snapshot can
 * involve FRED, SEC and event providers, so rebuilding one snapshot
 * for every 5-minute bar would be wasteful and could hit API limits.
 */
function selectSampleIndexes({
  bars,
  minimumWarmupBars,
  sampleIntervalMinutes,
  maximumRecords,
}) {
  if (
    !Array.isArray(bars) ||
    bars.length <=
      minimumWarmupBars
  ) {
    return [];
  }

  const intervalMs =
    sampleIntervalMinutes *
    60 *
    1000;

  const selected = [];

  let lastSelectedTime =
    null;

  for (
    let index =
      minimumWarmupBars - 1;
    index < bars.length;
    index += 1
  ) {
    const time =
      timestampMs(
        getBarTimestamp(
          bars[index],
        ),
      );

    if (time === null) {
      continue;
    }

    if (
      lastSelectedTime !==
        null &&
      time -
        lastSelectedTime <
        intervalMs
    ) {
      continue;
    }

    selected.push(index);

    lastSelectedTime =
      time;
  }

  /**
   * Prefer the most recent records when the configured history
   * contains more samples than the analogue database needs.
   */
  if (
    selected.length >
    maximumRecords
  ) {
    return selected.slice(
      selected.length -
        maximumRecords,
    );
  }

  return selected;
}

function makeCacheKey({
  symbol,
  asOfTimestamp,
  config,
}) {
  /**
   * Bucket by UTC day so a 5-minute live bar does not generate
   * a new cache key on every cycle.
   */
  const date =
    new Date(
      asOfTimestamp,
    )
      .toISOString()
      .slice(0, 10);

  return [
    symbol,
    date,
    config.timeframe,
    config.feed,
    config.lookbackDays,
    config.sampleIntervalMinutes,
    config.minimumWarmupBars,
    config.maximumRecords,
    config.maximumBars,
    config.barsPerTradingDay,
  ].join(":");
}

function getCached(key) {
  const item =
    cache.get(key);

  if (!item) {
    return null;
  }

  if (
    Date.now() -
      item.createdAt >
    item.ttl
  ) {
    cache.delete(key);

    return null;
  }

  return item.records;
}

function setCached({
  key,
  records,
  ttl,
}) {
  cache.set(
    key,
    {
      createdAt:
        Date.now(),

      ttl,

      records,
    },
  );
}

export function clearHistoricalRecordsCache(
  symbol = null,
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (!normalizedSymbol) {
    cache.clear();
    return;
  }

  for (
    const key
    of cache.keys()
  ) {
    if (
      key.startsWith(
        `${normalizedSymbol}:`,
      )
    ) {
      cache.delete(
        key,
      );
    }
  }
}

export function getHistoricalRecordsCacheStatus() {
  return {
    cachedKeys:
      cache.size,

    inFlightBuilds:
      inFlightBuilds.size,
  };
}

/**
 * Map asynchronous work while enforcing a hard concurrency ceiling.
 *
 * Result ordering matches input ordering.
 */
async function mapWithConcurrency({
  items,
  concurrency,
  worker,
}) {
  if (
    !Array.isArray(
      items,
    ) ||
    items.length === 0
  ) {
    return [];
  }

  if (
    typeof worker !==
    "function"
  ) {
    throw new TypeError(
      "mapWithConcurrency worker must be a function.",
    );
  }

  const limit =
    Math.min(
      positiveInteger(
        concurrency,
        DEFAULT_CONFIG
          .snapshotConcurrency,
      ),
      items.length,
    );

  const results =
    new Array(
      items.length,
    );

  let cursor = 0;

  async function runWorker() {
    while (true) {
      const position =
        cursor;

      cursor += 1;

      if (
        position >=
        items.length
      ) {
        return;
      }

      results[position] =
        await worker(
          items[position],
          position,
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          limit,
      },
      () =>
        runWorker(),
    ),
  );

  return results;
}

/**
 * ============================================================
 * BUILD RECORD DATABASE
 * ============================================================
 */

export async function buildHistoricalRecords({
  symbol,
  asOfTimestamp,
  currentCandles = [],
  config: configOverrides = {},
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(symbol);

  const normalizedAsOf =
    normalizeTimestamp(
      asOfTimestamp,
    );

  if (
    !normalizedSymbol ||
    !normalizedAsOf
  ) {
    return [];
  }

  const config =
    buildConfig(
      configOverrides,
    );

  /**
   * The 60-day outcome requires future market bars relative to
   * each historical state. We therefore download extra historical
   * calendar time before the current as-of timestamp, but NEVER
   * download beyond the current as-of timestamp.
   *
   * This means all labels returned to the live engine were already
   * knowable by the current live timestamp.
   */
  const start =
    daysAgoIso({
      timestamp:
        normalizedAsOf,

      days:
        config.lookbackDays +
        120,
    });

  const historicalResult =
    await getHistoricalBars({
      symbol:
        normalizedSymbol,

      timeframe:
        config.timeframe,

      start,

      end:
        normalizedAsOf,

      feed:
        config.feed,

      maximumBars:
        config.maximumBars,
    });

  if (
    historicalResult
      ?.approved !== true ||
    !Array.isArray(
      historicalResult?.bars,
    )
  ) {
    return [];
  }

  /**
   * Merge LiveEngineRunner's already-observed candles with Alpaca
   * history, then enforce the live cutoff again defensively.
   */
  const bars =
    filterBarsAtOrBefore({
      bars:
        mergeBars(
          historicalResult.bars,
          currentCandles,
        ),

      asOfTimestamp:
        normalizedAsOf,
    });

  if (
    bars.length <
    config.minimumWarmupBars
  ) {
    return [];
  }

  /**
   * A historical state can only be used if its entire 60-trading-day
   * forward label is already present before the current as-of time.
   *
   * Therefore, sample only indexes that leave enough bars after them.
   */
  const maximumForwardOffset =
    config.barsPerTradingDay *
    60;

  const lastEligibleIndex =
    bars.length -
    maximumForwardOffset -
    1;

  if (
    lastEligibleIndex <
    config.minimumWarmupBars -
      1
  ) {
    return [];
  }

  const eligibleBars =
    bars.slice(
      0,
      lastEligibleIndex + 1,
    );

  const sampleIndexes =
    selectSampleIndexes({
      bars:
        eligibleBars,

      minimumWarmupBars:
        config.minimumWarmupBars,

      sampleIntervalMinutes:
        config
          .sampleIntervalMinutes,

      maximumRecords:
        config.maximumRecords,
    });

  const candidates =
    await mapWithConcurrency({
      items:
        sampleIndexes,

      concurrency:
        config
          .snapshotConcurrency,

      worker:
        async (index) => {
          const bar =
            bars[index];

          const timestamp =
            normalizeTimestamp(
              getBarTimestamp(
                bar,
              ),
            );

          if (!timestamp) {
            return null;
          }

          /**
           * POINT-IN-TIME SAFETY
           * --------------------
           *
           * Only candles visible at this exact historical timestamp
           * are supplied to historicalSnapshotProvider.
           *
           * No later candle is exposed.
           */
          const snapshotCandles =
            bars.slice(
              0,
              index + 1,
            );

          let snapshot;

          try {
            snapshot =
              await getHistoricalSnapshot({
                symbol:
                  normalizedSymbol,

                asOfTimestamp:
                  timestamp,

                candles:
                  snapshotCandles,
              });
          } catch (error) {
            /**
             * One failed historical snapshot must not destroy the
             * entire analogue database build.
             */
            console.warn(
              `[HISTORICAL_RECORDS_PROVIDER] Snapshot ${normalizedSymbol} ${timestamp}:`,
              error instanceof Error
                ? error.message
                : String(error),
            );

            return null;
          }

          if (
            snapshot?.approved !==
              true ||
            !snapshot?.data
          ) {
            return null;
          }

          const fingerprint =
            snapshot
              .data
              .fingerprint;

          if (
            !fingerprintHasEvidence(
              fingerprint,
            )
          ) {
            return null;
          }

          const forwardReturns =
            buildForwardReturns({
              bars,

              index,

              barsPerTradingDay:
                config
                  .barsPerTradingDay,
            });

          /**
           * Never manufacture a forward-return horizon.
           *
           * All five realized outcomes must already exist before
           * this record is allowed into the production pool.
           */
          if (
            !hasCompleteForwardReturns(
              forwardReturns,
            )
          ) {
            return null;
          }

          return {
            timestamp,

            fingerprint,

            forwardReturns,

            symbol:
              normalizedSymbol,

            source:
              "HISTORICAL_RECORDS_PROVIDER",

            snapshotStatus:
              snapshot.status ??
              null,

            snapshotCoverage:
              snapshot
                ?.data
                ?.coverage
                ?.ratio ??
              null,
          };
        },
    });

  const records =
    candidates.filter(
      (record) =>
        record !== null,
    );

  return records;
}

/**
 * ============================================================
 * LIVE PROVIDER
 * ============================================================
 *
 * Signature intentionally matches LiveEngineRunner.callProvider:
 *
 *   await provider(context)
 *
 * IMPORTANT:
 * Returns ARRAY directly.
 */

export async function historicalRecordsProvider(
  context = {},
) {
  const symbol =
    normalizeSymbol(
      context.symbol,
    );

  const asOfTimestamp =
    normalizeTimestamp(
      context.asOfTimestamp ??
        context
          ?.bar
          ?.timestamp,
    );

  if (
    !symbol ||
    !asOfTimestamp
  ) {
    return [];
  }

  const config =
    buildConfig(
      context
        .historicalConfig ??
        {},
    );

  const mode =
    normalizeMode(
      context
        .historicalMode ??
      context.mode ??
      (
        context
          .refreshHistoricalRecords ===
        true
          ? HISTORICAL_RECORDS_MODE
              .REBUILD
          : HISTORICAL_RECORDS_MODE
              .READ
      ),
    );

  const key =
    makeCacheKey({
      symbol,
      asOfTimestamp,
      config,
    });

  /**
   * READ MODE
   * ---------
   *
   * Normal live/manual research first consumes a completed cache.
   *
   * On a cache miss, this provider is still allowed to initialize
   * the database once so existing callers remain backward-compatible.
   *
   * REBUILD deliberately bypasses only the completed-cache lookup.
   */
  if (
    mode ===
    HISTORICAL_RECORDS_MODE
      .READ
  ) {
    const cached =
      getCached(
        key,
      );

    if (
      Array.isArray(
        cached,
      )
    ) {
      return cached;
    }
  }

  /**
   * IN-FLIGHT DEDUPLICATION
   * -----------------------
   *
   * If the same historical database is already being built,
   * reuse that Promise instead of duplicating external requests.
   */
  const existingBuild =
    inFlightBuilds.get(
      key,
    );

  if (existingBuild) {
    try {
      return await existingBuild;
    } catch {
      return [];
    }
  }

  const buildPromise =
    (async () => {
      const records =
        await buildHistoricalRecords({
          symbol,

          asOfTimestamp,

          currentCandles:
            Array.isArray(
              context.candles,
            )
              ? context.candles
              : [],

          config,
        });

      /**
       * Cache successful empty arrays too.
       *
       * An empty but valid result should not cause every live cycle
       * to hammer the same providers repeatedly.
       */
      setCached({
        key,

        records,

        ttl:
          config.cacheTtlMs,
      });

      return records;
    })();

  inFlightBuilds.set(
    key,
    buildPromise,
  );

  try {
    return await buildPromise;
  } catch (error) {
    /**
     * Historical intelligence is optional evidence.
     *
     * Failure must never crash the broader trading-analysis
     * pipeline or become positive evidence.
     */
    console.error(
      `[HISTORICAL_RECORDS_PROVIDER] ${symbol}:`,
      error instanceof Error
        ? error.message
        : String(error),
    );

    return [];
  } finally {
    if (
      inFlightBuilds.get(
        key,
      ) ===
      buildPromise
    ) {
      inFlightBuilds.delete(
        key,
      );
    }
  }
}

export default historicalRecordsProvider;
