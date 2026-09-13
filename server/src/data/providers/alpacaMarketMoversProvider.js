/**
 * ============================================================
 * ALPACA MARKET MOVERS PROVIDER
 * ============================================================
 *
 * BATCHED MARKET-WIDE DESIGN
 * --------------------------
 * The application makes one logical getMarketMovers() call for the
 * supplied universe. Internally, Alpaca snapshot requests are split
 * into URL-safe multi-symbol batches, executed with bounded
 * concurrency, merged, and globally ranked.
 *
 * No per-symbol HTTP requests.
 * Individual batch failures are isolated when other batches succeed.
 */

const ALPACA_DATA_BASE_URL = "https://data.alpaca.markets";

const DEFAULT_LIMIT = 300;
const DEFAULT_FEED = "iex";
const DEFAULT_MINIMUM_PRICE = 1;
const DEFAULT_MINIMUM_DAILY_VOLUME = 100000;
const DEFAULT_MAX_DATA_AGE_DAYS = 7;
const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_CONCURRENCY = 4;

export const MARKET_MOVERS_STATUS = Object.freeze({
  COMPLETE: "COMPLETE",
  PARTIAL: "PARTIAL",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  INVALID_REQUEST: "INVALID_REQUEST",
  ERROR: "ERROR",
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeSymbols(values) {
  if (!Array.isArray(values)) return [];

  return [
    ...new Set(
      values
        .map(normalizeSymbol)
        .filter(Boolean),
    ),
  ];
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0
    ? number
    : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function getCredentials() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_SECRET_KEY;

  if (!key || !secret) {
    throw new Error(
      "ALPACA_API_KEY and ALPACA_SECRET_KEY are required.",
    );
  }

  return { key, secret };
}

function calculatePercentChange({
  current,
  previous,
}) {
  const currentValue = safeNumber(current);
  const previousValue = safeNumber(previous);

  if (
    currentValue === null ||
    previousValue === null ||
    previousValue <= 0
  ) {
    return null;
  }

  return (
    ((currentValue - previousValue) / previousValue) *
    100
  );
}

function looksLikeExcludedInstrument({
  symbol,
  name,
}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const normalizedName = String(name ?? "").toUpperCase();

  if (!normalizedSymbol) return true;

  const excludedNameTokens = [
    " WARRANT",
    " WARRANTS",
    " RIGHT",
    " RIGHTS",
    " UNIT",
    " UNITS",
  ];

  if (
    excludedNameTokens.some(token =>
      normalizedName.includes(token),
    )
  ) {
    return true;
  }

  return false;
}

function isRecentEnough({
  dailyTimestamp,
  latestTradeTimestamp,
  maximumAgeDays,
}) {
  const raw =
    latestTradeTimestamp ??
    dailyTimestamp ??
    null;

  if (!raw) return false;

  const timestamp = new Date(raw).getTime();

  if (!Number.isFinite(timestamp)) return false;

  const maximumAgeMs =
    maximumAgeDays *
    24 *
    60 *
    60 *
    1000;

  return Date.now() - timestamp <= maximumAgeMs;
}

/**
 * Fetch one URL-safe multi-symbol snapshot batch.
 */
async function fetchSnapshotBatch({
  symbols,
  feed,
}) {
  const normalizedSymbols = normalizeSymbols(symbols);

  if (normalizedSymbols.length === 0) {
    return {};
  }

  const { key, secret } = getCredentials();

  const url = new URL(
    "/v2/stocks/snapshots",
    ALPACA_DATA_BASE_URL,
  );

  url.searchParams.set(
    "symbols",
    normalizedSymbols.join(","),
  );

  if (feed) {
    url.searchParams.set("feed", feed);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
      Accept: "application/json",
    },
  });

  const text = await response.text();

  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(
        `Alpaca snapshots returned non-JSON data (${response.status}).`,
      );
    }
  }

  if (!response.ok) {
    const message =
      payload?.message ??
      payload?.error ??
      `Alpaca snapshots request failed with HTTP ${response.status}.`;

    throw new Error(message);
  }

  return payload && typeof payload === "object"
    ? payload
    : {};
}

function chunkSymbols(symbols, batchSize) {
  const chunks = [];

  for (let index = 0; index < symbols.length; index += batchSize) {
    chunks.push(symbols.slice(index, index + batchSize));
  }

  return chunks;
}

/**
 * Fetch the full universe through bounded, URL-safe batch requests.
 * Returns every successful snapshot even when one or more batches fail.
 */
async function fetchSnapshotsBatched({
  symbols,
  feed,
  batchSize,
  concurrency,
}) {
  const normalizedSymbols = normalizeSymbols(symbols);
  const chunks = chunkSymbols(normalizedSymbols, batchSize);

  const merged = {};
  const failures = [];
  let nextIndex = 0;
  let successfulBatchCount = 0;

  async function worker() {
    while (true) {
      const batchIndex = nextIndex;
      nextIndex += 1;

      if (batchIndex >= chunks.length) {
        return;
      }

      const batch = chunks[batchIndex];

      try {
        const payload = await fetchSnapshotBatch({
          symbols: batch,
          feed,
        });

        Object.assign(merged, payload);
        successfulBatchCount += 1;
      } catch (error) {
        failures.push({
          batchIndex,
          symbolCount: batch.length,
          firstSymbol: batch[0] ?? null,
          lastSymbol: batch[batch.length - 1] ?? null,
          error: safeErrorMessage(error),
        });
      }
    }
  }

  const workerCount = Math.min(
    concurrency,
    Math.max(1, chunks.length),
  );

  await Promise.all(
    Array.from(
      { length: workerCount },
      () => worker(),
    ),
  );

  return {
    snapshots: merged,
    requestCount: chunks.length,
    successfulBatchCount,
    failedBatchCount: failures.length,
    failures,
  };
}

function normalizeSnapshot({
  symbol,
  snapshot,
  asset = null,
}) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  const latestTradePrice =
    safeNumber(snapshot?.latestTrade?.p);

  const bid =
    safeNumber(snapshot?.latestQuote?.bp);

  const ask =
    safeNumber(snapshot?.latestQuote?.ap);

  const minuteClose =
    safeNumber(snapshot?.minuteBar?.c);

  const dailyOpen =
    safeNumber(snapshot?.dailyBar?.o);

  const dailyHigh =
    safeNumber(snapshot?.dailyBar?.h);

  const dailyLow =
    safeNumber(snapshot?.dailyBar?.l);

  const dailyClose =
    safeNumber(snapshot?.dailyBar?.c);

  const previousClose =
    safeNumber(snapshot?.prevDailyBar?.c);

  const volume =
    safeNumber(snapshot?.dailyBar?.v);

  const tradeCount =
    safeNumber(snapshot?.dailyBar?.n);

  const vwap =
    safeNumber(snapshot?.dailyBar?.vw);

  let midpoint = null;

  if (
    bid !== null &&
    ask !== null &&
    bid > 0 &&
    ask > 0 &&
    ask >= bid
  ) {
    midpoint = (bid + ask) / 2;
  }

  const price =
    latestTradePrice ??
    midpoint ??
    minuteClose ??
    dailyClose;

  const changePercent =
    calculatePercentChange({
      current: dailyClose ?? price,
      previous: previousClose,
    });

  const absoluteChange =
    safeNumber(dailyClose ?? price) !== null &&
    previousClose !== null
      ? Number(dailyClose ?? price) - previousClose
      : null;

  return {
    symbol,

    name: asset?.name ?? null,
    exchange: asset?.exchange ?? null,

    tradable: asset?.tradable === true,
    marginable: asset?.marginable === true,
    shortable: asset?.shortable === true,

    borrowStatus:
      asset?.borrowStatus ?? null,

    shortCandidateEligible:
      asset?.shortCandidateEligible === true,

    price,
    latestTradePrice,
    bid,
    ask,
    midpoint,
    minuteClose,
    dailyOpen,
    dailyHigh,
    dailyLow,
    dailyClose,
    previousClose,
    absoluteChange,
    changePercent,
    volume,
    tradeCount,
    vwap,

    latestTradeTimestamp:
      snapshot?.latestTrade?.t ?? null,

    latestQuoteTimestamp:
      snapshot?.latestQuote?.t ?? null,

    minuteTimestamp:
      snapshot?.minuteBar?.t ?? null,

    dailyTimestamp:
      snapshot?.dailyBar?.t ?? null,

    timestamp:
      snapshot?.latestTrade?.t ??
      snapshot?.latestQuote?.t ??
      snapshot?.minuteBar?.t ??
      snapshot?.dailyBar?.t ??
      null,
  };
}

function isEligibleMover({
  item,
  minimumPrice,
  minimumDailyVolume,
  maximumAgeDays,
}) {
  if (!item) return false;

  if (item.tradable !== true) {
    return false;
  }

  if (
    looksLikeExcludedInstrument({
      symbol: item.symbol,
      name: item.name,
    })
  ) {
    return false;
  }

  if (
    !Number.isFinite(Number(item.price)) ||
    Number(item.price) < minimumPrice
  ) {
    return false;
  }

  if (
    !Number.isFinite(Number(item.volume)) ||
    Number(item.volume) < minimumDailyVolume
  ) {
    return false;
  }

  if (
    !Number.isFinite(
      Number(item.changePercent),
    )
  ) {
    return false;
  }

  if (
    !isRecentEnough({
      dailyTimestamp: item.dailyTimestamp,
      latestTradeTimestamp:
        item.latestTradeTimestamp,
      maximumAgeDays,
    })
  ) {
    return false;
  }

  return true;
}

function sortByChangeDescending(a, b) {
  return (
    Number(b.changePercent) -
    Number(a.changePercent)
  );
}

function sortByChangeAscending(a, b) {
  return (
    Number(a.changePercent) -
    Number(b.changePercent)
  );
}

export async function getMarketMovers({
  symbols = [],
  assets = [],
  limit = DEFAULT_LIMIT,
  feed = DEFAULT_FEED,

  batchSize = DEFAULT_BATCH_SIZE,
  concurrency = DEFAULT_CONCURRENCY,

  minimumPrice =
    DEFAULT_MINIMUM_PRICE,

  minimumDailyVolume =
    DEFAULT_MINIMUM_DAILY_VOLUME,

  maximumAgeDays =
    DEFAULT_MAX_DATA_AGE_DAYS,
} = {}) {
  const normalizedSymbols =
    normalizeSymbols(symbols);

  const normalizedLimit =
    positiveInteger(
      limit,
      DEFAULT_LIMIT,
    );

  const normalizedMinimumPrice =
    positiveNumber(
      minimumPrice,
      DEFAULT_MINIMUM_PRICE,
    );

  const normalizedMinimumVolume =
    positiveInteger(
      minimumDailyVolume,
      DEFAULT_MINIMUM_DAILY_VOLUME,
    );

  const normalizedMaximumAgeDays =
    positiveNumber(
      maximumAgeDays,
      DEFAULT_MAX_DATA_AGE_DAYS,
    );

  const normalizedBatchSize =
    positiveInteger(
      batchSize,
      DEFAULT_BATCH_SIZE,
    );

  const normalizedConcurrency =
    positiveInteger(
      concurrency,
      DEFAULT_CONCURRENCY,
    );

  const startedAt = nowIso();

  if (normalizedSymbols.length === 0) {
    return {
      approved: false,
      provider: "ALPACA_MARKET_MOVERS",
      status:
        MARKET_MOVERS_STATUS.INVALID_REQUEST,

      gainers: [],
      losers: [],

      universeSize: 0,
      usableCount: 0,
      eligibleCount: 0,

      warnings: [],
      errors: [
        "At least one symbol is required to calculate market movers.",
      ],

      startedAt,
      completedAt: nowIso(),
    };
  }

  try {
    const assetMap = new Map(
      (
        Array.isArray(assets)
          ? assets
          : []
      )
        .filter(asset => asset?.symbol)
        .map(asset => [
          normalizeSymbol(asset.symbol),
          asset,
        ]),
    );

    /**
     * ========================================================
     * URL-SAFE BATCHED SNAPSHOT REQUESTS
     * ========================================================
     *
     * This remains ONE logical market-movers operation. Provider
     * requests are internally chunked so a 13k+ symbol universe
     * cannot create an HTTP 414 URI Too Long response.
     */
    const batchResult =
      await fetchSnapshotsBatched({
        symbols: normalizedSymbols,
        feed,
        batchSize: normalizedBatchSize,
        concurrency: normalizedConcurrency,
      });

    const raw = batchResult.snapshots;

    if (
      batchResult.successfulBatchCount === 0
    ) {
      throw new Error(
        batchResult.failures[0]?.error ??
        "All Alpaca snapshot batches failed.",
      );
    }

    const normalizedRows =
      normalizedSymbols
        .map(symbol =>
          normalizeSnapshot({
            symbol,
            snapshot:
              raw?.[symbol],
            asset:
              assetMap.get(symbol) ??
              null,
          }),
        )
        .filter(Boolean);

    const eligibleRows =
      normalizedRows.filter(item =>
        isEligibleMover({
          item,
          minimumPrice:
            normalizedMinimumPrice,
          minimumDailyVolume:
            normalizedMinimumVolume,
          maximumAgeDays:
            normalizedMaximumAgeDays,
        }),
      );

    if (eligibleRows.length === 0) {
      return {
        approved: false,
        provider: "ALPACA_MARKET_MOVERS",
        status:
          MARKET_MOVERS_STATUS
            .INSUFFICIENT_DATA,

        feed,

        universeSize:
          normalizedSymbols.length,

        usableCount:
          normalizedRows.length,

        eligibleCount: 0,

        gainers: [],
        losers: [],

        filters: {
          minimumPrice:
            normalizedMinimumPrice,

          minimumDailyVolume:
            normalizedMinimumVolume,

          maximumAgeDays:
            normalizedMaximumAgeDays,

          excludesInstrumentTypes: [
            "WARRANT",
            "RIGHT",
            "UNIT",
          ],
        },

        request: {
          mode: "BATCHED_MULTI_SYMBOL_REQUEST",
          requestCount: batchResult.requestCount,
          successfulBatchCount:
            batchResult.successfulBatchCount,
          failedBatchCount:
            batchResult.failedBatchCount,
          batchSize: normalizedBatchSize,
          concurrency: normalizedConcurrency,
          symbolsRequested:
            normalizedSymbols.length,
        },

        warnings: [
          "No securities passed the market-mover quality filters.",
          ...batchResult.failures.map(
            failure =>
              `Snapshot batch ${failure.batchIndex + 1} failed: ${failure.error}`,
          ),
        ],

        errors: [],

        startedAt,
        completedAt: nowIso(),
      };
    }

    const gainers =
      eligibleRows
        .filter(
          item =>
            Number(
              item.changePercent,
            ) > 0,
        )
        .sort(
          sortByChangeDescending,
        )
        .slice(
          0,
          normalizedLimit,
        );

    const losers =
      eligibleRows
        .filter(
          item =>
            Number(
              item.changePercent,
            ) < 0,
        )
        .sort(
          sortByChangeAscending,
        )
        .slice(
          0,
          normalizedLimit,
        );

    return {
      approved: true,
      provider:
        "ALPACA_MARKET_MOVERS",
      status:
        batchResult.failedBatchCount > 0
          ? MARKET_MOVERS_STATUS.PARTIAL
          : MARKET_MOVERS_STATUS.COMPLETE,

      feed,

      universeSize:
        normalizedSymbols.length,

      usableCount:
        normalizedRows.length,

      eligibleCount:
        eligibleRows.length,

      limit:
        normalizedLimit,

      gainers,
      losers,

      filters: {
        minimumPrice:
          normalizedMinimumPrice,

        minimumDailyVolume:
          normalizedMinimumVolume,

        maximumAgeDays:
          normalizedMaximumAgeDays,

        excludesInstrumentTypes: [
          "WARRANT",
          "RIGHT",
          "UNIT",
        ],
      },

      request: {
        mode: "BATCHED_MULTI_SYMBOL_REQUEST",
        requestCount: batchResult.requestCount,
        successfulBatchCount:
          batchResult.successfulBatchCount,
        failedBatchCount:
          batchResult.failedBatchCount,
        batchSize: normalizedBatchSize,
        concurrency: normalizedConcurrency,
        symbolsRequested:
          normalizedSymbols.length,
      },

      warnings:
        batchResult.failures.map(
          failure =>
            `Snapshot batch ${failure.batchIndex + 1} failed: ${failure.error}`,
        ),

      errors: [],

      startedAt,
      completedAt: nowIso(),
    };
  } catch (error) {
    return {
      approved: false,
      provider:
        "ALPACA_MARKET_MOVERS",

      status:
        MARKET_MOVERS_STATUS.ERROR,

      feed,

      universeSize:
        normalizedSymbols.length,

      usableCount: 0,
      eligibleCount: 0,

      gainers: [],
      losers: [],

      request: {
        mode: "BATCHED_MULTI_SYMBOL_REQUEST",
        requestCount: 0,
        successfulBatchCount: 0,
        failedBatchCount: 0,
        batchSize: normalizedBatchSize,
        concurrency: normalizedConcurrency,
        symbolsRequested:
          normalizedSymbols.length,
      },

      warnings: [],

      errors: [
        safeErrorMessage(error),
      ],

      startedAt,
      completedAt: nowIso(),
    };
  }
}

export default getMarketMovers;
