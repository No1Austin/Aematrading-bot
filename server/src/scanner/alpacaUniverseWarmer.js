/**
 * ============================================================
 * ALPACA UNIVERSE WARMER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Warm a scanner batch with recent Alpaca market history.
 *
 * Flow:
 *
 *   batch of assets
 *        ↓
 *   loadHistoricalBarsIntoHub()
 *        ↓
 *   Alpaca historical bars
 *        ↓
 *   MarketDataHub
 *        ↓
 *   marketMeasurementProvider
 *
 * IMPORTANT
 * ---------
 *
 * This module:
 *
 * - does NOT score stocks
 * - does NOT perform deep research
 * - does NOT place orders
 * - does NOT fabricate missing market data
 *
 * Individual symbol failures are fail-soft.
 */

import {
  ALPACA_FEED,
  ALPACA_TIMEFRAME,
  loadHistoricalBarsBatchIntoHub,
} from "../data/providers/alpacaHistoricalDataService.js";

import { getMarketCandles } from "../data/marketDataHub.js";

/**
 * ============================================================
 * DEFAULT CONFIG
 * ============================================================
 */

const DEFAULT_CONFIG =
  Object.freeze({
    timeframe:
      ALPACA_TIMEFRAME
        .ONE_MINUTE,

    feed:
      ALPACA_FEED.IEX,

    /**
     * Enough recent history for:
     *
     * - EMA50
     * - ATR
     * - relative volume
     * - recent ranges
     * - scanner momentum
     *
     * Three calendar days normally gives enough recent regular-session
     * 1-minute bars for the cheap scanner and multi-horizon volume
     * intelligence without forcing the scanner to retain a full week
     * of minute data.
     */
    lookbackDays: 3,

    pageSize: 10_000,

    /**
     * Scanner warmup should remain bounded.
     */
    maximumBarsPerSymbol:
      1_500,

    /**
     * Avoid firing hundreds of HTTP calls simultaneously.
     */
    symbolConcurrency: 5,
    minimumScannerBars: 50,
    minimumPreferredBars: 220,
    maximumHubAgeMs: 20 * 60 * 1000,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

function positiveInteger(
  value,
  fallback,
) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  )
    ? number
    : fallback;
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

function normalizeAssets(
  assets,
) {
  if (
    !Array.isArray(assets)
  ) {
    return [];
  }

  const seen =
    new Set();

  const normalized = [];

  for (
    const asset
    of assets
  ) {
    const symbol =
      normalizeSymbol(
        asset?.symbol,
      );

    if (
      !symbol ||
      seen.has(symbol)
    ) {
      continue;
    }

    seen.add(symbol);

    normalized.push({
      ...asset,
      symbol,
    });
  }

  return normalized;
}

function createHistoricalWindow({
  lookbackDays,
  endTimestamp = null,
} = {}) {
  const resolvedEnd =
    endTimestamp
      ? new Date(
          endTimestamp,
        )
      : new Date();

  if (
    Number.isNaN(
      resolvedEnd.getTime(),
    )
  ) {
    throw new Error(
      "Invalid Alpaca universe warmer endTimestamp.",
    );
  }

  const start =
    new Date(
      resolvedEnd.getTime() -
      lookbackDays *
        24 *
        60 *
        60 *
        1000,
    );

  return {
    start:
      start.toISOString(),

    end:
      resolvedEnd.toISOString(),
  };
}

/**
 * ============================================================
 * HUB INSPECTION / RESULT HELPERS
 * ============================================================
 */

function inspectHubHistory(
  symbol,
  minimumBars = 50,
  maximumAgeMs = 1200000,
) {
  try {
    const candles = getMarketCandles(symbol);
    const rows = Array.isArray(candles) ? candles : [];
    const latest = rows.at(-1) ?? null;
    const rawTime =
      latest?.timestamp ??
      latest?.time ??
      latest?.t ??
      null;

    const parsed =
      rawTime
        ? new Date(rawTime).getTime()
        : NaN;

    const ageMs =
      Number.isFinite(parsed)
        ? Math.max(0, Date.now() - parsed)
        : null;

    return {
      available: rows.length > 0,
      sufficient: rows.length >= minimumBars,
      fresh:
        rows.length >= minimumBars &&
        (
          ageMs === null ||
          ageMs <= maximumAgeMs
        ),
      barCount: rows.length,
      latestTimestamp: rawTime,
      ageMs,
    };
  } catch (error) {
    return {
      available: false,
      sufficient: false,
      fresh: false,
      barCount: 0,
      latestTimestamp: null,
      ageMs: null,
      error: safeErrorMessage(error),
    };
  }
}

function getBatchSymbolResult(
  batchResult,
  symbol,
) {
  const normalized =
    normalizeSymbol(symbol);

  if (!normalized) {
    return null;
  }

  const candidates = [
    ...(Array.isArray(batchResult?.results)
      ? batchResult.results
      : []),

    ...(Array.isArray(batchResult?.symbolResults)
      ? batchResult.symbolResults
      : []),
  ];

  const direct =
    candidates.find(
      row =>
        normalizeSymbol(
          row?.symbol,
        ) ===
        normalized,
    );

  if (direct) {
    return direct;
  }

  /**
   * Canonical contract returned by
   * loadHistoricalBarsBatchIntoHub().
   */
  const barCount =
    Number(
      batchResult
        ?.barCountBySymbol
        ?.[normalized] ??
      0,
    ) || 0;

  const loadedIntoHub =
    Array.isArray(
      batchResult
        ?.loadedSymbols,
    ) &&
    batchResult
      .loadedSymbols
      .map(normalizeSymbol)
      .includes(
        normalized,
      );

  const failed =
    Array.isArray(
      batchResult
        ?.failedSymbols,
    ) &&
    batchResult
      .failedSymbols
      .map(normalizeSymbol)
      .includes(
        normalized,
      );

  const hubResult =
    batchResult
      ?.hubResults
      ?.[normalized] ??
    null;

  if (
    barCount > 0 ||
    loadedIntoHub ||
    failed ||
    hubResult
  ) {
    return {
      approved:
        loadedIntoHub ||
        hubResult?.approved === true,

      symbol:
        normalized,

      barCount,

      loadedIntoHub,

      hubResult,

      warnings:
        Array.isArray(
          hubResult?.warnings,
        )
          ? [...hubResult.warnings]
          : [],

      errors:
        Array.isArray(
          hubResult?.errors,
        )
          ? [...hubResult.errors]
          : [],
    };
  }

  const maps = [
    batchResult?.bySymbol,
    batchResult?.data,
  ];

  for (const map of maps) {
    if (
      map &&
      typeof map === "object" &&
      !Array.isArray(map) &&
      map[normalized]
    ) {
      return map[normalized];
    }
  }

  return null;
}

function collectMessages(value) {
  return Array.isArray(value)
    ? value.filter(Boolean).map(String)
    : [];
}

function buildCachedResult({
  symbol,
  hub,
  timeframe,
  feed,
}) {
  return {
    approved: true,
    symbol,
    loadedIntoHub: true,
    reusedFromHub: true,
    providerFetched: false,
    readyForScanner: true,
    barCount: hub.barCount,
    timeframe,
    feed,
    hub,
    errors: [],
    warnings:
      hub.fresh
        ? []
        : [
            "Using sufficient cached MarketDataHub history; provider refresh was not required.",
          ],
    providerResult: null,
  };
}

function buildFetchedResult({
  symbol,
  batchResult,
  timeframe,
  feed,
  minimumScannerBars,
  maximumHubAgeMs,
}) {
  const providerResult =
    getBatchSymbolResult(
      batchResult,
      symbol,
    );

  const hub =
    inspectHubHistory(
      symbol,
      minimumScannerBars,
      maximumHubAgeMs,
    );

  const providerBars =
    Number(
      providerResult?.barCount ??
      providerResult?.barsLoaded ??
      providerResult?.count ??
      0,
    ) || 0;

  const providerLoaded =
    providerResult?.loadedIntoHub === true ||
    providerResult?.ingested === true;

  const readyForScanner =
    hub.sufficient ||
    (
      providerLoaded &&
      providerBars >= minimumScannerBars
    );

  const providerErrors = [
    ...collectMessages(providerResult?.errors),
  ];

  const providerWarnings = [
    ...collectMessages(providerResult?.warnings),
  ];

  if (
    providerErrors.length === 0 &&
    batchResult?.approved !== true &&
    !readyForScanner
  ) {
    providerErrors.push(
      ...collectMessages(batchResult?.errors),
    );
  }

  if (
    providerWarnings.length === 0 &&
    batchResult?.approved !== true
  ) {
    providerWarnings.push(
      ...collectMessages(batchResult?.warnings),
    );
  }

  if (
    batchResult?.approved !== true &&
    readyForScanner
  ) {
    providerWarnings.push(
      "Batch provider refresh was incomplete, but MarketDataHub contains sufficient history for this symbol.",
    );
  }

  return {
    approved: readyForScanner,
    symbol,
    loadedIntoHub:
      providerLoaded ||
      hub.available,
    reusedFromHub:
      !providerLoaded &&
      hub.available,
    providerFetched: true,
    readyForScanner,
    barCount:
      Math.max(
        hub.barCount,
        providerBars,
      ),
    timeframe,
    feed,
    hub,
    errors:
      readyForScanner
        ? []
        : providerErrors.length
          ? providerErrors
          : [
              "Batch historical provider did not leave enough usable bars in MarketDataHub.",
            ],
    warnings: providerWarnings,
    providerResult,
  };
}
/**
 * ============================================================
 * MAIN BATCH WARMER
 * ============================================================
 */

export async function warmAlpacaUniverseBatch({
  assets = [],
  symbols = null,
  batchIndex = null,

  timeframe =
    DEFAULT_CONFIG.timeframe,

  feed =
    DEFAULT_CONFIG.feed,

  lookbackDays =
    DEFAULT_CONFIG.lookbackDays,

  pageSize =
    DEFAULT_CONFIG.pageSize,

  maximumBarsPerSymbol =
    DEFAULT_CONFIG.maximumBarsPerSymbol,

  // Kept for backwards-compatible configuration.
  // Batch mode intentionally does not issue one HTTP request per symbol.
  symbolConcurrency =
    DEFAULT_CONFIG.symbolConcurrency,

  minimumScannerBars =
    DEFAULT_CONFIG.minimumScannerBars,

  minimumPreferredBars =
    DEFAULT_CONFIG.minimumPreferredBars,

  maximumHubAgeMs =
    DEFAULT_CONFIG.maximumHubAgeMs,

  endTimestamp = null,
} = {}) {
  const startedAt =
    new Date().toISOString();

  const normalizedAssets =
    normalizeAssets(
      Array.isArray(assets)
        ? assets
        : [],
    );

  if (
    normalizedAssets.length === 0 &&
    Array.isArray(symbols)
  ) {
    const seen =
      new Set();

    for (const rawSymbol of symbols) {
      const symbol =
        normalizeSymbol(rawSymbol);

      if (
        !symbol ||
        seen.has(symbol)
      ) {
        continue;
      }

      seen.add(symbol);
      normalizedAssets.push({
        symbol,
      });
    }
  }

  if (normalizedAssets.length === 0) {
    return {
      approved: true,
      provider:
        "ALPACA_UNIVERSE_WARMER",
      mode:
        "BATCH_CACHE_FIRST",
      batchIndex,
      symbolsRequested: 0,
      symbolsWarmed: 0,
      symbolsReadyForScanner: 0,
      symbolsNeedingProvider: 0,
      warmedSymbols: [],
      readySymbols: [],
      reusedSymbols: [],
      providerFetchCount: 0,
      failedSymbols: [],
      results: [],
      errors: [],
      warnings: [],
      startedAt,
      completedAt:
        new Date().toISOString(),
    };
  }

  const safeLookbackDays =
    positiveInteger(
      lookbackDays,
      DEFAULT_CONFIG.lookbackDays,
    );

  const safePageSize =
    positiveInteger(
      pageSize,
      DEFAULT_CONFIG.pageSize,
    );

  const safeMaximumBars =
    positiveInteger(
      maximumBarsPerSymbol,
      DEFAULT_CONFIG.maximumBarsPerSymbol,
    );

  const safeMinimumScannerBars =
    positiveInteger(
      minimumScannerBars,
      DEFAULT_CONFIG.minimumScannerBars,
    );

  const safeMinimumPreferredBars =
    positiveInteger(
      minimumPreferredBars,
      DEFAULT_CONFIG.minimumPreferredBars,
    );

  const safeMaximumHubAgeMs =
    positiveInteger(
      maximumHubAgeMs,
      DEFAULT_CONFIG.maximumHubAgeMs,
    );

  // Parse for compatibility and diagnostics, but do not use it
  // to create per-symbol provider requests.
  const safeConcurrency =
    positiveInteger(
      symbolConcurrency,
      DEFAULT_CONFIG.symbolConcurrency,
    );

  let historicalWindow;

  try {
    historicalWindow =
      createHistoricalWindow({
        lookbackDays:
          safeLookbackDays,
        endTimestamp,
      });
  } catch (error) {
    return {
      approved: false,
      provider:
        "ALPACA_UNIVERSE_WARMER",
      mode:
        "BATCH_CACHE_FIRST",
      batchIndex,
      symbolsRequested:
        normalizedAssets.length,
      symbolsWarmed: 0,
      symbolsReadyForScanner: 0,
      symbolsNeedingProvider: 0,
      warmedSymbols: [],
      readySymbols: [],
      reusedSymbols: [],
      providerFetchCount: 0,
      failedSymbols:
        normalizedAssets.map(
          asset => asset.symbol,
        ),
      results: [],
      errors: [
        safeErrorMessage(error),
      ],
      warnings: [],
      startedAt,
      completedAt:
        new Date().toISOString(),
    };
  }

  /**
   * ========================================================
   * PHASE 1 — CACHE FIRST
   * ========================================================
   *
   * A symbol with enough usable Hub history never consumes
   * another Alpaca historical request.
   */
  const cachedResults =
    new Map();

  const assetsNeedingProvider = [];

  for (const asset of normalizedAssets) {
    const symbol =
      normalizeSymbol(asset?.symbol);

    const hub =
      inspectHubHistory(
        symbol,
        safeMinimumScannerBars,
        safeMaximumHubAgeMs,
      );

    const reusable =
      hub.sufficient &&
      (
        hub.fresh ||
        hub.barCount >=
          safeMinimumPreferredBars
      );

    if (reusable) {
      cachedResults.set(
        symbol,
        buildCachedResult({
          symbol,
          hub,
          timeframe,
          feed,
        }),
      );
    } else {
      assetsNeedingProvider.push(
        asset,
      );
    }
  }

  /**
   * ========================================================
   * PHASE 2 — ONE BATCH PROVIDER FLOW
   * ========================================================
   *
   * The provider owns pagination internally. This warmer calls
   * the batch provider once for all missing/stale symbols.
   *
   * "providerFetchCount" therefore represents batch invocations,
   * not the provider's internal paginated HTTP request count.
   */
  let batchProviderResult = null;
  let batchProviderError = null;
  let providerFetchCount = 0;

  if (assetsNeedingProvider.length > 0) {
    try {
      providerFetchCount = 1;

      const requestedSymbols =
        assetsNeedingProvider.map(
          asset => asset.symbol,
        );

      const batchMaximumBars =
        Math.min(
          250_000,
          safeMaximumBars *
            Math.max(
              1,
              requestedSymbols.length,
            ),
        );

      batchProviderResult =
        await loadHistoricalBarsBatchIntoHub({
          symbols:
            requestedSymbols,

          timeframe,

          start:
            historicalWindow.start,

          end:
            historicalWindow.end,

          feed,

          pageSize:
            safePageSize,

          maximumBars:
            batchMaximumBars,
        });
    } catch (error) {
      batchProviderError =
        safeErrorMessage(error);
    }
  }

  /**
   * ========================================================
   * PHASE 3 — BUILD PER-SYMBOL OUTCOMES
   * ========================================================
   *
   * Always re-check MarketDataHub. Even if the provider reports
   * a partial/error state, successfully ingested symbols remain
   * usable and one failed symbol cannot invalidate the batch.
   */
  const fetchedResults =
    new Map();

  for (const asset of assetsNeedingProvider) {
    const symbol =
      normalizeSymbol(asset?.symbol);

    if (batchProviderError) {
      const hub =
        inspectHubHistory(
          symbol,
          safeMinimumScannerBars,
          safeMaximumHubAgeMs,
        );

      if (hub.sufficient) {
        fetchedResults.set(
          symbol,
          {
            approved: true,
            symbol,
            loadedIntoHub: true,
            reusedFromHub: true,
            providerFetched: true,
            readyForScanner: true,
            barCount: hub.barCount,
            timeframe,
            feed,
            hub,
            errors: [],
            warnings: [
              `Batch provider failed (${batchProviderError}); cached MarketDataHub history remains usable.`,
            ],
            providerResult: null,
          },
        );
      } else {
        fetchedResults.set(
          symbol,
          {
            approved: false,
            symbol,
            loadedIntoHub:
              hub.available,
            reusedFromHub:
              hub.available,
            providerFetched: true,
            readyForScanner: false,
            barCount: hub.barCount,
            timeframe,
            feed,
            hub,
            errors: [
              batchProviderError,
            ],
            warnings: [],
            providerResult: null,
          },
        );
      }

      continue;
    }

    fetchedResults.set(
      symbol,
      buildFetchedResult({
        symbol,
        batchResult:
          batchProviderResult,
        timeframe,
        feed,
        minimumScannerBars:
          safeMinimumScannerBars,
        maximumHubAgeMs:
          safeMaximumHubAgeMs,
      }),
    );
  }

  // Preserve the original asset order.
  const results =
    normalizedAssets.map(
      asset => {
        const symbol =
          normalizeSymbol(
            asset?.symbol,
          );

        return (
          cachedResults.get(symbol) ??
          fetchedResults.get(symbol) ??
          {
            approved: false,
            symbol,
            loadedIntoHub: false,
            reusedFromHub: false,
            providerFetched: false,
            readyForScanner: false,
            barCount: 0,
            timeframe,
            feed,
            errors: [
              "No warmer result was produced for symbol.",
            ],
            warnings: [],
            providerResult: null,
          }
        );
      },
    );

  const warmedSymbols =
    results
      .filter(
        result =>
          result?.loadedIntoHub ===
          true,
      )
      .map(
        result => result.symbol,
      )
      .filter(Boolean);

  const readySymbols =
    results
      .filter(
        result =>
          result?.readyForScanner ===
          true,
      )
      .map(
        result => result.symbol,
      )
      .filter(Boolean);

  const reusedSymbols =
    results
      .filter(
        result =>
          result?.reusedFromHub ===
          true,
      )
      .map(
        result => result.symbol,
      )
      .filter(Boolean);

  const failedSymbols =
    results
      .filter(
        result =>
          result?.readyForScanner !==
          true,
      )
      .map(
        result => result.symbol,
      )
      .filter(Boolean);

  const errors =
    results.flatMap(
      result =>
        collectMessages(
          result?.errors,
        ).map(
          error =>
            `${result.symbol ?? "UNKNOWN"}: ${error}`,
        ),
    );

  const warnings =
    results.flatMap(
      result =>
        collectMessages(
          result?.warnings,
        ).map(
          warning =>
            `${result.symbol ?? "UNKNOWN"}: ${warning}`,
        ),
    );

  /**
   * A partial batch remains useful.
   * The scanner may continue with every ready symbol.
   */
  return {
    approved:
      readySymbols.length > 0,

    provider:
      "ALPACA_UNIVERSE_WARMER",

    mode:
      "BATCH_CACHE_FIRST",

    batchIndex,

    symbolsRequested:
      normalizedAssets.length,

    symbolsNeedingProvider:
      assetsNeedingProvider.length,

    symbolsWarmed:
      warmedSymbols.length,

    symbolsReadyForScanner:
      readySymbols.length,

    warmedSymbols,
    readySymbols,
    reusedSymbols,

    providerFetchCount,

    failedSymbols,

    timeframe,
    feed,

    start:
      historicalWindow.start,

    end:
      historicalWindow.end,

    results,

    batchProvider: {
      attempted:
        assetsNeedingProvider.length >
        0,
      requestedSymbols:
        assetsNeedingProvider.map(
          asset => asset.symbol,
        ),
      approved:
        batchProviderResult?.approved ??
        false,
      status:
        batchProviderResult?.status ??
        (
          batchProviderError
            ? "ERROR"
            : assetsNeedingProvider.length
              ? null
              : "NOT_REQUIRED"
        ),
      error:
        batchProviderError,
    },

    diagnostics: {
      cacheReadyCount:
        cachedResults.size,
      providerNeededCount:
        assetsNeedingProvider.length,
      configuredLegacyConcurrency:
        safeConcurrency,
      providerMode:
        "MULTI_SYMBOL_BATCH",

      providerBatchInvocations:
        providerFetchCount,

      providerHttpPages:
        Number(
          batchProviderResult
            ?.pageCount ??
          0,
        ) || 0,
    },

    errors,
    warnings,

    startedAt,

    completedAt:
      new Date().toISOString(),
  };
}


export default
  warmAlpacaUniverseBatch;
