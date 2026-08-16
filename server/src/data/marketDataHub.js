/**
 * ============================================================
 * MARKET DATA HUB
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Single source of truth for market-price data consumed
 * by the trading engines.
 *
 * Responsibilities:
 *
 * - Receive real historical candles
 * - Receive real live bars
 * - Receive quotes
 * - Validate incoming market data
 * - Normalize provider-specific formats
 * - Maintain rolling candle history
 * - Maintain latest quote/bar
 * - Reject stale or malformed data
 * - Prevent out-of-order data corruption
 * - Create immutable market snapshots
 * - Notify engine subscribers
 *
 * IMPORTANT
 * ---------
 *
 * This module does NOT:
 *
 * - place orders
 * - connect to a broker
 * - make trading decisions
 * - calculate LONG/SHORT scores
 *
 * It only manages market information.
 */

/**
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

export const MARKET_DATA_CONFIG =
  Object.freeze({
    maxCandlesPerSymbol: 5000,

    /**
     * A quote older than this may be considered stale.
     */
    maxQuoteAgeMs: 30_000,

    /**
     * Prevent duplicate timestamps from creating
     * duplicate candles.
     */
    replaceDuplicateBars: true,

    /**
     * Reject bars older than the latest stored bar.
     */
    rejectOutOfOrderBars: true,
  });

/**
 * ============================================================
 * EVENT TYPES
 * ============================================================
 */

export const MARKET_DATA_EVENT =
  Object.freeze({
    BAR: "BAR",

    QUOTE: "QUOTE",

    SNAPSHOT: "SNAPSHOT",

    ERROR: "ERROR",
  });

/**
 * ============================================================
 * INTERNAL STATE
 * ============================================================
 */

const symbolState =
  new Map();

const subscribers =
  new Set();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return Date.now();
}

function isFiniteNumber(value) {
  return Number.isFinite(
    Number(value),
  );
}

function positiveNumber(value) {
  return (
    isFiniteNumber(value) &&
    Number(value) > 0
  );
}

function normalizeSymbol(
  symbol,
) {
  return String(
    symbol ?? "",
  )
    .trim()
    .toUpperCase();
}

function normalizeTimestamp(
  value,
) {
  if (!value) {
    return null;
  }

  if (
    typeof value === "number"
  ) {
    const date =
      new Date(value);

    return Number.isNaN(
      date.getTime(),
    )
      ? null
      : date.toISOString();
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

function timestampMs(
  value,
) {
  const normalized =
    normalizeTimestamp(
      value,
    );

  if (!normalized) {
    return null;
  }

  return new Date(
    normalized,
  ).getTime();
}

function clone(value) {
  if (
    typeof structuredClone ===
    "function"
  ) {
    return structuredClone(
      value,
    );
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}

/**
 * ============================================================
 * CREATE SYMBOL STATE
 * ============================================================
 */

function createSymbolState(
  symbol,
) {
  return {
    symbol,

    candles: [],

    latestBar: null,

    latestQuote: null,

    lastBarTimestamp: null,

    lastQuoteTimestamp: null,

    historicalLoaded: false,

    historicalCandleCount: 0,

    liveBarCount: 0,

    quoteCount: 0,

    version: 0,

    updatedAt: null,
  };
}

function getOrCreateState(
  symbol,
) {
  const normalized =
    normalizeSymbol(
      symbol,
    );

  if (!normalized) {
    return null;
  }

  if (
    !symbolState.has(
      normalized,
    )
  ) {
    symbolState.set(
      normalized,
      createSymbolState(
        normalized,
      ),
    );
  }

  return symbolState.get(
    normalized,
  );
}

/**
 * ============================================================
 * NORMALIZE BAR
 * ============================================================
 *
 * Providers may use:
 *
 * open / high / low / close / volume
 *
 * OR:
 *
 * o / h / l / c / v
 *
 * We convert everything into one format.
 */

export function normalizeMarketBar(
  input,
) {
  if (!input) {
    return null;
  }

  const symbol =
    normalizeSymbol(
      input.symbol ??
      input.S,
    );

  const timestamp =
    normalizeTimestamp(
      input.timestamp ??
      input.time ??
      input.t,
    );

  const open =
    Number(
      input.open ??
      input.o,
    );

  const high =
    Number(
      input.high ??
      input.h,
    );

  const low =
    Number(
      input.low ??
      input.l,
    );

  const close =
    Number(
      input.close ??
      input.c,
    );

  const volume =
    Number(
      input.volume ??
      input.v ??
      0,
    );

  if (
    !symbol ||
    !timestamp ||
    !positiveNumber(open) ||
    !positiveNumber(high) ||
    !positiveNumber(low) ||
    !positiveNumber(close)
  ) {
    return null;
  }

  /**
   * OHLC integrity check.
   */

  if (
    high < low ||
    high < open ||
    high < close ||
    low > open ||
    low > close
  ) {
    return null;
  }

  return {
    symbol,

    timestamp,

    open,

    high,

    low,

    close,

    volume:
      isFiniteNumber(volume)
        ? Math.max(
            0,
            volume,
          )
        : 0,

    tradeCount:
      isFiniteNumber(
        input.tradeCount ??
        input.n,
      )
        ? Number(
            input.tradeCount ??
            input.n,
          )
        : null,

    vwap:
      positiveNumber(
        input.vwap ??
        input.vw,
      )
        ? Number(
            input.vwap ??
            input.vw,
          )
        : null,

    source:
      input.source ??
      null,
  };
}

/**
 * ============================================================
 * NORMALIZE QUOTE
 * ============================================================
 */

export function normalizeMarketQuote(
  input,
) {
  if (!input) {
    return null;
  }

  const symbol =
    normalizeSymbol(
      input.symbol ??
      input.S,
    );

  const timestamp =
    normalizeTimestamp(
      input.timestamp ??
      input.time ??
      input.t,
    );

  const bid =
    Number(
      input.bid ??
      input.bidPrice ??
      input.bp,
    );

  const ask =
    Number(
      input.ask ??
      input.askPrice ??
      input.ap,
    );

  const bidSize =
    Number(
      input.bidSize ??
      input.bs ??
      0,
    );

  const askSize =
    Number(
      input.askSize ??
      input.as ??
      0,
    );

  if (
    !symbol ||
    !timestamp ||
    !positiveNumber(bid) ||
    !positiveNumber(ask)
  ) {
    return null;
  }

  if (ask < bid) {
    return null;
  }

  return {
    symbol,

    timestamp,

    bid,

    ask,

    midpoint:
      (
        bid +
        ask
      ) / 2,

    spread:
      ask -
      bid,

    spreadPercent:
      bid > 0
        ? (
            ask -
            bid
          ) /
          (
            (
              ask +
              bid
            ) /
            2
          )
        : null,

    bidSize:
      isFiniteNumber(
        bidSize,
      )
        ? Math.max(
            0,
            bidSize,
          )
        : 0,

    askSize:
      isFiniteNumber(
        askSize,
      )
        ? Math.max(
            0,
            askSize,
          )
        : 0,

    source:
      input.source ??
      null,
  };
}

/**
 * ============================================================
 * EVENT EMITTER
 * ============================================================
 */

async function emit(
  event,
) {
  for (
    const subscriber
    of subscribers
  ) {
    try {
      await subscriber(
        clone(event),
      );
    } catch (error) {
      console.error(
        "[MARKET_DATA_HUB] Subscriber error:",
        error instanceof Error
          ? error.message
          : error,
      );
    }
  }
}

/**
 * ============================================================
 * SUBSCRIBE
 * ============================================================
 */

export function subscribeToMarketData(
  handler,
) {
  if (
    typeof handler !==
    "function"
  ) {
    throw new Error(
      "Market data subscriber must be a function.",
    );
  }

  subscribers.add(
    handler,
  );

  /**
   * Return unsubscribe function.
   */

  return () => {
    subscribers.delete(
      handler,
    );
  };
}

/**
 * ============================================================
 * INGEST HISTORICAL BARS
 * ============================================================
 */

export async function ingestHistoricalBars({
  symbol,

  bars,

  source =
    "HISTORICAL",
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (
    !normalizedSymbol
  ) {
    return {
      approved: false,

      errors: [
        "Symbol is required.",
      ],
    };
  }

  if (
    !Array.isArray(bars)
  ) {
    return {
      approved: false,

      errors: [
        "Historical bars must be an array.",
      ],
    };
  }

  const normalized = [];

  let rejected = 0;

  for (
    const rawBar
    of bars
  ) {
    const bar =
      normalizeMarketBar({
        ...rawBar,

        symbol:
          rawBar?.symbol ??
          normalizedSymbol,

        source:
          rawBar?.source ??
          source,
      });

    if (!bar) {
      rejected += 1;

      continue;
    }

    normalized.push(
      bar,
    );
  }

  /**
   * Sort oldest → newest.
   */

  normalized.sort(
    (a, b) =>
      timestampMs(
        a.timestamp,
      ) -
      timestampMs(
        b.timestamp,
      ),
  );

  /**
   * Remove duplicate timestamps.
   */

  const deduplicated =
    new Map();

  for (
    const bar
    of normalized
  ) {
    deduplicated.set(
      bar.timestamp,
      bar,
    );
  }

  const finalBars =
    [
      ...deduplicated.values(),
    ];

  const state =
    getOrCreateState(
      normalizedSymbol,
    );

  state.candles =
    finalBars.slice(
      -MARKET_DATA_CONFIG
        .maxCandlesPerSymbol,
    );

  state.latestBar =
    state.candles[
      state.candles.length -
        1
    ] ?? null;

  state.lastBarTimestamp =
    state.latestBar
      ?.timestamp ??
    null;

  state.historicalLoaded =
    true;

  state.historicalCandleCount =
    state.candles.length;

  state.version += 1;

  state.updatedAt =
    new Date()
      .toISOString();

  return {
    approved: true,

    symbol:
      normalizedSymbol,

    accepted:
      finalBars.length,

    rejected,

    latestBar:
      clone(
        state.latestBar,
      ),

    errors: [],
  };
}

/**
 * ============================================================
 * INGEST LIVE BAR
 * ============================================================
 */

export async function ingestLiveBar(
  input,
) {
  const bar =
    normalizeMarketBar(
      input,
    );

  if (!bar) {
    return {
      approved: false,

      errors: [
        "Invalid live market bar.",
      ],
    };
  }

  const state =
    getOrCreateState(
      bar.symbol,
    );

  const incomingTime =
    timestampMs(
      bar.timestamp,
    );

  const previousTime =
    timestampMs(
      state.lastBarTimestamp,
    );

  /**
   * ========================================================
   * OUT-OF-ORDER PROTECTION
   * ========================================================
   */

  if (
    MARKET_DATA_CONFIG
      .rejectOutOfOrderBars &&
    previousTime !== null &&
    incomingTime <
      previousTime
  ) {
    return {
      approved: false,

      symbol:
        bar.symbol,

      errors: [
        "Out-of-order live bar rejected.",
      ],
    };
  }

  /**
   * ========================================================
   * DUPLICATE BAR
   * ========================================================
   */

  if (
    previousTime !== null &&
    incomingTime ===
      previousTime
  ) {
    if (
      MARKET_DATA_CONFIG
        .replaceDuplicateBars
    ) {
      state.candles[
        state.candles.length -
          1
      ] = bar;

      state.latestBar =
        bar;
    }

    state.version += 1;

    state.updatedAt =
      new Date()
        .toISOString();

    await emit({
      type:
        MARKET_DATA_EVENT.BAR,

      mode:
        "LIVE_UPDATE",

      symbol:
        bar.symbol,

      bar,

      timestamp:
        bar.timestamp,
    });

    return {
      approved: true,

      replaced: true,

      bar:
        clone(bar),

      errors: [],
    };
  }

  /**
   * ========================================================
   * NEW LIVE BAR
   * ========================================================
   */

  state.candles.push(
    bar,
  );

  if (
    state.candles.length >
    MARKET_DATA_CONFIG
      .maxCandlesPerSymbol
  ) {
    state.candles.splice(
      0,
      state.candles.length -
        MARKET_DATA_CONFIG
          .maxCandlesPerSymbol,
    );
  }

  state.latestBar =
    bar;

  state.lastBarTimestamp =
    bar.timestamp;

  state.liveBarCount +=
    1;

  state.version += 1;

  state.updatedAt =
    new Date()
      .toISOString();

  await emit({
    type:
      MARKET_DATA_EVENT.BAR,

    mode:
      "LIVE",

    symbol:
      bar.symbol,

    bar,

    timestamp:
      bar.timestamp,
  });

  return {
    approved: true,

    replaced: false,

    bar:
      clone(bar),

    errors: [],
  };
}

/**
 * ============================================================
 * INGEST LIVE QUOTE
 * ============================================================
 */

export async function ingestLiveQuote(
  input,
) {
  const quote =
    normalizeMarketQuote(
      input,
    );

  if (!quote) {
    return {
      approved: false,

      errors: [
        "Invalid live market quote.",
      ],
    };
  }

  const state =
    getOrCreateState(
      quote.symbol,
    );

  const incomingTime =
    timestampMs(
      quote.timestamp,
    );

  const previousTime =
    timestampMs(
      state.lastQuoteTimestamp,
    );

  if (
    previousTime !== null &&
    incomingTime <
      previousTime
  ) {
    return {
      approved: false,

      symbol:
        quote.symbol,

      errors: [
        "Out-of-order quote rejected.",
      ],
    };
  }

  state.latestQuote =
    quote;

  state.lastQuoteTimestamp =
    quote.timestamp;

  state.quoteCount +=
    1;

  state.version += 1;

  state.updatedAt =
    new Date()
      .toISOString();

  await emit({
    type:
      MARKET_DATA_EVENT.QUOTE,

    mode:
      "LIVE",

    symbol:
      quote.symbol,

    quote,

    timestamp:
      quote.timestamp,
  });

  return {
    approved: true,

    quote:
      clone(quote),

    errors: [],
  };
}

/**
 * ============================================================
 * GET CANDLES
 * ============================================================
 */

export function getMarketCandles(
  symbol,
  limit = null,
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  const state =
    symbolState.get(
      normalizedSymbol,
    );

  if (!state) {
    return [];
  }

  const candles =
    state.candles;

  if (
    positiveNumber(limit)
  ) {
    return clone(
      candles.slice(
        -Math.floor(
          Number(limit),
        ),
      ),
    );
  }

  return clone(
    candles,
  );
}

/**
 * ============================================================
 * GET LATEST BAR
 * ============================================================
 */

export function getLatestBar(
  symbol,
) {
  const state =
    symbolState.get(
      normalizeSymbol(
        symbol,
      ),
    );

  return state
    ?.latestBar
    ? clone(
        state.latestBar,
      )
    : null;
}

/**
 * ============================================================
 * GET LATEST QUOTE
 * ============================================================
 */

export function getLatestQuote(
  symbol,
) {
  const state =
    symbolState.get(
      normalizeSymbol(
        symbol,
      ),
    );

  return state
    ?.latestQuote
    ? clone(
        state.latestQuote,
      )
    : null;
}

/**
 * ============================================================
 * QUOTE FRESHNESS
 * ============================================================
 */

export function isQuoteFresh(
  symbol,
  maxAgeMs =
    MARKET_DATA_CONFIG
      .maxQuoteAgeMs,
) {
  const quote =
    getLatestQuote(
      symbol,
    );

  if (!quote) {
    return false;
  }

  const quoteTime =
    timestampMs(
      quote.timestamp,
    );

  if (quoteTime === null) {
    return false;
  }

  return (
    now() -
      quoteTime <=
    maxAgeMs
  );
}

/**
 * ============================================================
 * CREATE MARKET SNAPSHOT
 * ============================================================
 *
 * This is what the intelligence engines should consume.
 *
 * A snapshot represents what the bot knew at that moment.
 */

export function createMarketSnapshot(
  symbol,
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  const state =
    symbolState.get(
      normalizedSymbol,
    );

  if (!state) {
    return null;
  }

  const snapshot = {
    symbol:
      normalizedSymbol,

    asOf:
      new Date()
        .toISOString(),

    version:
      state.version,

    latestBar:
      state.latestBar
        ? clone(
            state.latestBar,
          )
        : null,

    latestQuote:
      state.latestQuote
        ? clone(
            state.latestQuote,
          )
        : null,

    quoteFresh:
      isQuoteFresh(
        normalizedSymbol,
      ),

    candles:
      clone(
        state.candles,
      ),

    candleCount:
      state.candles.length,

    historicalLoaded:
      state.historicalLoaded,

    historicalCandleCount:
      state
        .historicalCandleCount,

    liveBarCount:
      state.liveBarCount,

    quoteCount:
      state.quoteCount,

    updatedAt:
      state.updatedAt,
  };

  return Object.freeze(
    snapshot,
  );
}

/**
 * ============================================================
 * PUBLISH SNAPSHOT
 * ============================================================
 */

export async function publishMarketSnapshot(
  symbol,
) {
  const snapshot =
    createMarketSnapshot(
      symbol,
    );

  if (!snapshot) {
    return {
      approved: false,

      errors: [
        "No market state exists for symbol.",
      ],
    };
  }

  await emit({
    type:
      MARKET_DATA_EVENT
        .SNAPSHOT,

    symbol:
      snapshot.symbol,

    snapshot,

    timestamp:
      snapshot.asOf,
  });

  return {
    approved: true,

    snapshot,

    errors: [],
  };
}

/**
 * ============================================================
 * GET SYMBOL STATUS
 * ============================================================
 */

export function getMarketDataStatus(
  symbol,
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  const state =
    symbolState.get(
      normalizedSymbol,
    );

  if (!state) {
    return {
      symbol:
        normalizedSymbol,

      available: false,

      historicalLoaded:
        false,

      candleCount: 0,

      hasLiveBar: false,

      hasQuote: false,

      quoteFresh: false,
    };
  }

  return {
    symbol:
      normalizedSymbol,

    available: true,

    historicalLoaded:
      state.historicalLoaded,

    candleCount:
      state.candles.length,

    historicalCandleCount:
      state
        .historicalCandleCount,

    liveBarCount:
      state.liveBarCount,

    quoteCount:
      state.quoteCount,

    hasLiveBar:
      Boolean(
        state.latestBar,
      ),

    hasQuote:
      Boolean(
        state.latestQuote,
      ),

    quoteFresh:
      isQuoteFresh(
        normalizedSymbol,
      ),

    latestBarTimestamp:
      state.lastBarTimestamp,

    latestQuoteTimestamp:
      state
        .lastQuoteTimestamp,

    version:
      state.version,

    updatedAt:
      state.updatedAt,
  };
}

/**
 * ============================================================
 * RESET
 * ============================================================
 *
 * Primarily useful for tests and controlled restarts.
 */

export function resetMarketData(
  symbol = null,
) {
  if (symbol) {
    symbolState.delete(
      normalizeSymbol(
        symbol,
      ),
    );

    return;
  }

  symbolState.clear();
}

/**
 * ============================================================
 * EXPORT
 * ============================================================
 */

export default {
  ingestHistoricalBars,

  ingestLiveBar,

  ingestLiveQuote,

  getMarketCandles,

  getLatestBar,

  getLatestQuote,

  createMarketSnapshot,

  publishMarketSnapshot,

  subscribeToMarketData,

  getMarketDataStatus,

  isQuoteFresh,

  resetMarketData,
};