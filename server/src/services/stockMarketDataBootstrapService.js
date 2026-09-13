import {
  loadEngineWarmupHistory,
  ALPACA_TIMEFRAME,
  ALPACA_FEED,
} from "../data/providers/alpacaHistoricalDataService.js";

import {
  createMarketSnapshot,
  getMarketDataStatus,
  isQuoteFresh,
} from "../data/marketDataHub.js";

/**
 * ============================================================
 * STOCK MARKET DATA BOOTSTRAP SERVICE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Prepare MarketDataHub for one-shot stock analysis.
 *
 * This service:
 *
 * 1. Validates the symbol.
 * 2. Loads real Alpaca historical candles.
 * 3. Loads those candles into MarketDataHub.
 * 4. Verifies the resulting MarketDataHub state.
 * 5. Reports quote availability/freshness.
 *
 * SAFETY
 * ------
 *
 * This service NEVER:
 *
 * - places orders
 * - authorizes execution
 * - fabricates quotes
 * - fabricates candles
 * - treats historical prices as live quotes
 * - treats stale quotes as fresh
 *
 * Historical candles may make ANALYSIS possible.
 * They can NEVER make EXECUTION possible by themselves.
 */

export const STOCK_MARKET_BOOTSTRAP_STATUS =
  Object.freeze({
    READY:
      "READY",

    ANALYSIS_READY:
      "ANALYSIS_READY",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    INVALID_REQUEST:
      "INVALID_REQUEST",

    ERROR:
      "ERROR",
  });

export const DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG =
  Object.freeze({
    timeframe:
      ALPACA_TIMEFRAME
        .FIVE_MINUTES,

    feed:
      ALPACA_FEED.IEX,

    lookbackDays: 30,

    minimumBars: 250,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function normalizeSymbol(
  value,
) {
  const symbol =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return symbol ||
    null;
}

function positiveInteger(
  value,
  fallback,
) {
  const parsed =
    Number(value);

  if (
    Number.isFinite(parsed) &&
    parsed > 0
  ) {
    return Math.floor(
      parsed,
    );
  }

  return fallback;
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

function buildWarmupRange({
  lookbackDays,
  asOfTimestamp = null,
}) {
  const requestedEnd =
    asOfTimestamp ===
      null ||
    asOfTimestamp ===
      undefined
      ? new Date()
      : new Date(
          asOfTimestamp,
        );

  if (
    Number.isNaN(
      requestedEnd.getTime(),
    )
  ) {
    return null;
  }

  const days =
    positiveInteger(
      lookbackDays,
      DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG
        .lookbackDays,
    );

  const start =
    new Date(
      requestedEnd.getTime() -
        days *
          24 *
          60 *
          60 *
          1000,
    );

  return {
    start:
      start.toISOString(),

    end:
      requestedEnd
        .toISOString(),
  };
}

function normalizeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

/**
 * ============================================================
 * FAILURE RESULT
 * ============================================================
 */

function failureResult({
  symbol = null,

  status =
    STOCK_MARKET_BOOTSTRAP_STATUS
      .ERROR,

  errors = [],

  warnings = [],

  startedAt,

  historicalResult = null,
} = {}) {
  return {
    approved: false,

    service:
      "STOCK_MARKET_DATA_BOOTSTRAP",

    status,

    symbol,

    /**
     * Analysis cannot proceed from this bootstrap result.
     */
    analysisReady: false,

    /**
     * IMPORTANT:
     *
     * This service never authorizes execution.
     */
    executionReady: false,

    market: {
      available: false,

      historicalLoaded: false,

      candleCount: 0,

      hasLiveBar: false,

      hasQuote: false,

      quoteFresh: false,

      latestBar: null,

      latestQuote: null,
    },

    historicalResult,

    warnings:
      normalizeArray(
        warnings,
      ),

    errors:
      normalizeArray(
        errors,
      ),

    startedAt,

    completedAt:
      now(),
  };
}

/**
 * ============================================================
 * MAIN SERVICE
 * ============================================================
 */

export async function bootstrapStockMarketData({
  symbol,

  timeframe =
    DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG
      .timeframe,

  feed =
    DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG
      .feed,

  lookbackDays =
    DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG
      .lookbackDays,

  minimumBars =
    DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG
      .minimumBars,

  asOfTimestamp = null,
} = {}) {
  const startedAt =
    now();

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  /**
   * ========================================================
   * SYMBOL VALIDATION
   * ========================================================
   */

  if (!normalizedSymbol) {
    return failureResult({
      symbol: null,

      status:
        STOCK_MARKET_BOOTSTRAP_STATUS
          .INVALID_REQUEST,

      errors: [
        "A non-empty stock symbol is required.",
      ],

      startedAt,
    });
  }

  /**
   * ========================================================
   * CONFIG VALIDATION
   * ========================================================
   */

  const safeMinimumBars =
    positiveInteger(
      minimumBars,
      DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG
        .minimumBars,
    );

  const safeLookbackDays =
    positiveInteger(
      lookbackDays,
      DEFAULT_STOCK_MARKET_BOOTSTRAP_CONFIG
        .lookbackDays,
    );

  const range =
    buildWarmupRange({
      lookbackDays:
        safeLookbackDays,

      asOfTimestamp,
    });

  if (!range) {
    return failureResult({
      symbol:
        normalizedSymbol,

      status:
        STOCK_MARKET_BOOTSTRAP_STATUS
          .INVALID_REQUEST,

      errors: [
        "Invalid asOfTimestamp.",
      ],

      startedAt,
    });
  }

  try {
    /**
     * ======================================================
     * LOAD REAL HISTORICAL DATA
     * ======================================================
     *
     * loadEngineWarmupHistory already:
     *
     * Alpaca
     *   ↓
     * getHistoricalBars()
     *   ↓
     * loadHistoricalBarsIntoHub()
     *   ↓
     * ingestHistoricalBars()
     *   ↓
     * MarketDataHub
     */

    let historicalResult = null;
    let historicalRefreshError = null;

    try {
      historicalResult =
        await loadEngineWarmupHistory({
          symbol:
            normalizedSymbol,

          start:
            range.start,

          end:
            range.end,

          timeframe,

          feed,

          minimumBars:
            safeMinimumBars,
        });
    } catch (error) {
      historicalRefreshError =
        safeErrorMessage(error);

      historicalResult = {
        approved: false,
        provider: "ALPACA",
        status: "ERROR",
        warnings: [],
        errors: [
          historicalRefreshError,
        ],
      };
    }

    /**
     * ======================================================
     * VERIFY MARKET DATA HUB
     * ======================================================
     *
     * MarketDataHub is the authority consumed by downstream
     * engines. A transient historical-provider refresh failure
     * must not invalidate sufficient real candles already loaded.
     */

    let status = null;
    let snapshot = null;

    try {
      status =
        getMarketDataStatus(
          normalizedSymbol,
        );

      snapshot =
        createMarketSnapshot(
          normalizedSymbol,
        );
    } catch (error) {
      return failureResult({
        symbol:
          normalizedSymbol,

        status:
          STOCK_MARKET_BOOTSTRAP_STATUS
            .ERROR,

        historicalResult,

        warnings:
          historicalResult
            ?.warnings ??
          [],

        errors: [
          ...(
            historicalResult
              ?.errors ??
            []
          ),
          `MarketDataHub verification failed: ${safeErrorMessage(error)}`,
        ],

        startedAt,
      });
    }

    const candleCount =
      Array.isArray(
        snapshot?.candles,
      )
        ? snapshot.candles.length
        : Number(
            status?.candleCount ??
            0,
          );

    const safeCandleCount =
      Number.isFinite(candleCount)
        ? candleCount
        : 0;

    const hubAvailable =
      Boolean(snapshot) &&
      (
        status?.available === true ||
        safeCandleCount > 0
      );

    const hubHasSufficientHistory =
      hubAvailable &&
      safeCandleCount >=
        safeMinimumBars;

    const providerApproved =
      historicalResult
        ?.approved ===
      true;

    if (!hubHasSufficientHistory) {
      return {
        approved: false,

        service:
          "STOCK_MARKET_DATA_BOOTSTRAP",

        status:
          STOCK_MARKET_BOOTSTRAP_STATUS
            .INSUFFICIENT_DATA,

        symbol:
          normalizedSymbol,

        analysisReady:
          false,

        executionReady:
          false,

        market: {
          available:
            hubAvailable,

          historicalLoaded:
            status
              ?.historicalLoaded ===
            true,

          candleCount:
            safeCandleCount,

          historicalCandleCount:
            Number(
              status
                ?.historicalCandleCount ??
              safeCandleCount,
            ) || safeCandleCount,

          hasLiveBar:
            status
              ?.hasLiveBar ===
            true,

          hasQuote:
            status
              ?.hasQuote ===
            true,

          quoteFresh:
            false,

          latestBar:
            snapshot
              ?.latestBar ??
            null,

          latestQuote:
            snapshot
              ?.latestQuote ??
            null,
        },

        historicalResult,

        warnings: [
          ...(
            historicalResult
              ?.warnings ??
            []
          ),
          `MarketDataHub contains only ${safeCandleCount} candles; at least ${safeMinimumBars} are required.`,
        ],

        errors: [
          ...(
            historicalResult
              ?.errors ??
            []
          ),
          ...(
            !providerApproved &&
            !historicalRefreshError &&
            (
              historicalResult
                ?.errors?.length ??
              0
            ) === 0
              ? [
                  "Historical provider refresh did not become ready and MarketDataHub does not contain sufficient cached history.",
                ]
              : []
          ),
        ],

        startedAt,

        completedAt:
          now(),
      };
    }

    const bootstrapWarnings = [
      ...(
        historicalResult
          ?.warnings ??
        []
      ),
    ];

    if (!providerApproved) {
      bootstrapWarnings.push(
        "Historical provider refresh was unavailable or incomplete, but MarketDataHub already contains sufficient real candles. Historical analysis may continue from the verified hub snapshot.",
      );

      for (
        const message of (
          historicalResult
            ?.errors ??
          []
        )
      ) {
        bootstrapWarnings.push(
          `Historical refresh diagnostic: ${message}`,
        );
      }
    }

    const candleCountForAnalysis =
      safeCandleCount;

    /**
     * ======================================================
     * QUOTE SAFETY
     * ======================================================
     *
     * A quote is NOT required for historical/analytical
     * processing.
     *
     * A fresh quote IS required later by the execution
     * pipeline.
     *
     * We therefore report quote state but NEVER fabricate one.
     */

    const latestQuote =
      snapshot
        ?.latestQuote ??
      null;

    const hasQuote =
      latestQuote !==
      null;

    const quoteFresh =
      hasQuote &&
      isQuoteFresh(
        normalizedSymbol,
      ) === true;

    const warnings = [
      ...bootstrapWarnings,
    ];

    if (!hasQuote) {
      warnings.push(
        "No live quote is currently available. Historical analysis may proceed, but execution must remain disabled.",
      );
    } else if (!quoteFresh) {
      warnings.push(
        "The available market quote is stale. Analysis may proceed, but execution must remain disabled.",
      );
    }

    /**
     * ======================================================
     * SUCCESS
     * ======================================================
     *
     * READY means:
     *
     * - sufficient historical candles
     * - MarketDataHub populated
     * - fresh quote available
     *
     * ANALYSIS_READY means:
     *
     * - sufficient historical candles
     * - MarketDataHub populated
     * - no fresh quote
     *
     * Neither status authorizes an order.
     */

    const bootstrapStatus =
      quoteFresh
        ? STOCK_MARKET_BOOTSTRAP_STATUS
            .READY
        : STOCK_MARKET_BOOTSTRAP_STATUS
            .ANALYSIS_READY;

    return {
      approved: true,

      service:
        "STOCK_MARKET_DATA_BOOTSTRAP",

      status:
        bootstrapStatus,

      symbol:
        normalizedSymbol,

      analysisReady:
        true,

      /**
       * HARD SAFETY INVARIANT
       *
       * Market-data bootstrap NEVER grants execution.
       */
      executionReady:
        false,

      market: {
        available:
          true,

        historicalLoaded:
          status
            ?.historicalLoaded ===
          true,

        candleCount:
          candleCountForAnalysis,

        historicalCandleCount:
          status
            ?.historicalCandleCount ??
          historicalResult
            ?.barCount ??
          candleCountForAnalysis,

        hasLiveBar:
          status
            ?.hasLiveBar ===
          true,

        hasQuote,

        quoteFresh,

        latestBar:
          snapshot
            ?.latestBar ??
          null,

        latestQuote,

        asOf:
          snapshot
            ?.asOf ??
          null,

        version:
          snapshot
            ?.version ??
          null,
      },

      historical: {
        provider:
          historicalResult
            ?.provider ??
          "ALPACA",

        timeframe:
          historicalResult
            ?.timeframe ??
          timeframe,

        feed:
          historicalResult
            ?.feed ??
          feed,

        start:
          historicalResult
            ?.start ??
          range.start,

        end:
          historicalResult
            ?.end ??
          range.end,

        barCount:
  historicalResult
    ?.barCount ??
  candleCountForAnalysis,

        loadedIntoHub:
          historicalResult
            ?.loadedIntoHub ===
          true,

        readyForEngines:
          historicalResult
            ?.readyForEngines ===
          true,

        fetchedAt:
          historicalResult
            ?.fetchedAt ??
          null,
      },

      historicalResult,

      warnings,

      errors: [],

      startedAt,

      completedAt:
        now(),
    };
  } catch (error) {
    /**
     * ======================================================
     * UNEXPECTED FAILURE — FAIL CLOSED
     * ======================================================
     */

    return failureResult({
      symbol:
        normalizedSymbol,

      status:
        STOCK_MARKET_BOOTSTRAP_STATUS
          .ERROR,

      errors: [
        safeErrorMessage(
          error,
        ),
      ],

      warnings: [
        "Stock market-data bootstrap failed safely. Analysis and execution were not authorized.",
      ],

      startedAt,
    });
  }
}

export default bootstrapStockMarketData;