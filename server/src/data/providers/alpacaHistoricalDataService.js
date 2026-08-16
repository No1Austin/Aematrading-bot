import axios from "axios";

import {
  ingestHistoricalBars,
} from "../marketDataHub.js";

/**
 * ============================================================
 * ALPACA HISTORICAL DATA SERVICE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Download REAL historical stock bars from Alpaca and
 * normalize them for our Market Data Hub.
 *
 * This service:
 *
 * - fetches historical OHLCV bars
 * - handles pagination
 * - validates dates
 * - supports multiple timeframes
 * - supports feed selection
 * - normalizes Alpaca bars
 * - can automatically load them into marketDataHub.js
 *
 * IMPORTANT
 * ---------
 *
 * This file handles MARKET DATA ONLY.
 *
 * It does NOT:
 *
 * - place orders
 * - access live trading
 * - execute paper trades
 * - make trading decisions
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const ALPACA_DATA_BASE_URL =
  "https://data.alpaca.markets";

/**
 * Alpaca supports timeframe values such as:
 *
 * 1Min
 * 5Min
 * 15Min
 * 1Hour
 * 1Day
 *
 * We keep our allowed set explicit so invalid values
 * fail before an API request is sent.
 */

export const ALPACA_TIMEFRAME =
  Object.freeze({
    ONE_MINUTE:
      "1Min",

    FIVE_MINUTES:
      "5Min",

    FIFTEEN_MINUTES:
      "15Min",

    THIRTY_MINUTES:
      "30Min",

    ONE_HOUR:
      "1Hour",

    FOUR_HOURS:
      "4Hour",

    ONE_DAY:
      "1Day",
  });

export const ALPACA_FEED =
  Object.freeze({
    IEX: "iex",

    SIP: "sip",
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

function normalizeDate(
  value,
) {
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

  return date
    .toISOString();
}

function positiveInteger(
  value,
  fallback,
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return number;
}

/**
 * ============================================================
 * API CREDENTIALS
 * ============================================================
 *
 * Market-data credentials should come from environment
 * variables.
 *
 * Never hard-code credentials into this file.
 */

function getCredentials() {
  const apiKey =
    process.env
      .ALPACA_API_KEY;

  const secretKey =
    process.env
      .ALPACA_SECRET_KEY;

  if (
    !apiKey ||
    !secretKey
  ) {
    throw new Error(
      "ALPACA_API_KEY and ALPACA_SECRET_KEY are required.",
    );
  }

  return {
    apiKey,

    secretKey,
  };
}

/**
 * ============================================================
 * HTTP CLIENT
 * ============================================================
 */

function createClient() {
  const {
    apiKey,
    secretKey,
  } =
    getCredentials();

  return axios.create({
    baseURL:
      ALPACA_DATA_BASE_URL,

    timeout: 30_000,

    headers: {
      "APCA-API-KEY-ID":
        apiKey,

      "APCA-API-SECRET-KEY":
        secretKey,

      Accept:
        "application/json",
    },
  });
}

/**
 * ============================================================
 * VALIDATE REQUEST
 * ============================================================
 */

function validateRequest({
  symbol,
  timeframe,
  start,
  end,
}) {
  const errors = [];

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (!normalizedSymbol) {
    errors.push(
      "Symbol is required.",
    );
  }

  if (
    !Object.values(
      ALPACA_TIMEFRAME,
    ).includes(
      timeframe,
    )
  ) {
    errors.push(
      `Unsupported timeframe: ${timeframe}.`,
    );
  }

  const startDate =
    normalizeDate(start);

  const endDate =
    normalizeDate(end);

  if (!startDate) {
    errors.push(
      "Valid start date is required.",
    );
  }

  if (!endDate) {
    errors.push(
      "Valid end date is required.",
    );
  }

  if (
    startDate &&
    endDate &&
    new Date(startDate) >=
      new Date(endDate)
  ) {
    errors.push(
      "Start date must be earlier than end date.",
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,

    symbol:
      normalizedSymbol,

    start:
      startDate,

    end:
      endDate,
  };
}

/**
 * ============================================================
 * NORMALIZE ALPACA BAR
 * ============================================================
 *
 * Alpaca uses:
 *
 * t  timestamp
 * o  open
 * h  high
 * l  low
 * c  close
 * v  volume
 * n  trade count
 * vw VWAP
 */

export function normalizeAlpacaBar({
  symbol,
  bar,
}) {
  if (!bar) {
    return null;
  }

  const timestamp =
    normalizeDate(
      bar.t,
    );

  const open =
    Number(bar.o);

  const high =
    Number(bar.h);

  const low =
    Number(bar.l);

  const close =
    Number(bar.c);

  const volume =
    Number(
      bar.v ?? 0,
    );

  if (
    !timestamp ||
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close)
  ) {
    return null;
  }

  if (
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    return null;
  }

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
    symbol:
      normalizeSymbol(
        symbol,
      ),

    timestamp,

    open,

    high,

    low,

    close,

    volume:
      Number.isFinite(
        volume,
      )
        ? Math.max(
            volume,
            0,
          )
        : 0,

    tradeCount:
      Number.isFinite(
        Number(bar.n),
      )
        ? Number(
            bar.n,
          )
        : null,

    vwap:
      Number.isFinite(
        Number(bar.vw),
      )
        ? Number(
            bar.vw,
          )
        : null,

    source:
      "ALPACA",
  };
}

/**
 * ============================================================
 * FETCH ONE PAGE
 * ============================================================
 */

async function fetchBarsPage({
  symbol,

  timeframe,

  start,

  end,

  feed,

  limit,

  pageToken = null,
}) {
  const client =
    createClient();

  const params = {
    timeframe,

    start,

    end,

    limit,

    adjustment:
      "raw",

    feed,
  };

  if (pageToken) {
    params.page_token =
      pageToken;
  }

  const response =
    await client.get(
      `/v2/stocks/${encodeURIComponent(
        symbol,
      )}/bars`,
      {
        params,
      },
    );

  return response.data;
}

/**
 * ============================================================
 * FETCH ALL HISTORICAL BARS
 * ============================================================
 */

export async function getHistoricalBars({
  symbol,

  timeframe =
    ALPACA_TIMEFRAME
      .FIVE_MINUTES,

  start,

  end,

  feed =
    ALPACA_FEED.IEX,

  pageSize = 10_000,

  maximumBars =
    250_000,
} = {}) {
  const validation =
    validateRequest({
      symbol,
      timeframe,
      start,
      end,
    });

  if (!validation.valid) {
    return {
      approved: false,

      provider:
        "ALPACA",

      symbol:
        validation.symbol,

      timeframe,

      bars: [],

      barCount: 0,

      errors:
        validation.errors,

      warnings: [],
    };
  }

  try {
    const bars = [];

    const limit =
      Math.min(
        positiveInteger(
          pageSize,
          10_000,
        ),
        10_000,
      );

    const maxBars =
      positiveInteger(
        maximumBars,
        250_000,
      );

    let pageToken =
      null;

    let pageCount =
      0;

    do {
      const response =
        await fetchBarsPage({
          symbol:
            validation.symbol,

          timeframe,

          start:
            validation.start,

          end:
            validation.end,

          feed,

          limit,

          pageToken,
        });

      pageCount += 1;

      const pageBars =
        Array.isArray(
          response?.bars,
        )
          ? response.bars
          : [];

      for (
        const rawBar
        of pageBars
      ) {
        const normalized =
          normalizeAlpacaBar({
            symbol:
              validation.symbol,

            bar:
              rawBar,
          });

        if (!normalized) {
          continue;
        }

        bars.push(
          normalized,
        );

        if (
          bars.length >=
          maxBars
        ) {
          break;
        }
      }

      if (
        bars.length >=
        maxBars
      ) {
        break;
      }

      pageToken =
        response
          ?.next_page_token ??
        null;
    } while (pageToken);

    /**
     * Defensive sort.
     */

    bars.sort(
      (a, b) =>
        new Date(
          a.timestamp,
        ).getTime() -
        new Date(
          b.timestamp,
        ).getTime(),
    );

    /**
     * Remove duplicate timestamps.
     */

    const uniqueBars =
      [
        ...new Map(
          bars.map(
            (bar) => [
              bar.timestamp,
              bar,
            ],
          ),
        ).values(),
      ];

    const warnings = [];

    if (
      uniqueBars.length >=
      maxBars
    ) {
      warnings.push(
        `Historical download reached the configured ${maxBars}-bar safety limit.`,
      );
    }

    if (
      uniqueBars.length ===
      0
    ) {
      warnings.push(
        "Alpaca returned no historical bars for the requested period.",
      );
    }

    return {
      approved: true,

      provider:
        "ALPACA",

      symbol:
        validation.symbol,

      timeframe,

      feed,

      start:
        validation.start,

      end:
        validation.end,

      pageCount,

      barCount:
        uniqueBars.length,

      bars:
        uniqueBars,

      warnings,

      errors: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    const status =
      error
        ?.response
        ?.status ??
      null;

    const apiMessage =
      error
        ?.response
        ?.data
        ?.message ??
      null;

    return {
      approved: false,

      provider:
        "ALPACA",

      symbol:
        validation.symbol,

      timeframe,

      feed,

      bars: [],

      barCount: 0,

      httpStatus:
        status,

      errors: [
        apiMessage ??
        (
          error instanceof Error
            ? error.message
            : String(error)
        ),
      ],

      warnings: [
        "Historical market data was not loaded into the trading engines.",
      ],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  }
}

/**
 * ============================================================
 * FETCH + LOAD INTO MARKET DATA HUB
 * ============================================================
 */

export async function loadHistoricalBarsIntoHub({
  symbol,

  timeframe =
    ALPACA_TIMEFRAME
      .FIVE_MINUTES,

  start,

  end,

  feed =
    ALPACA_FEED.IEX,

  pageSize =
    10_000,

  maximumBars =
    250_000,
} = {}) {
  const result =
    await getHistoricalBars({
      symbol,

      timeframe,

      start,

      end,

      feed,

      pageSize,

      maximumBars,
    });

  if (
    result.approved !==
    true
  ) {
    return {
      ...result,

      loadedIntoHub:
        false,
    };
  }

  const hubResult =
    await ingestHistoricalBars({
      symbol:
        result.symbol,

      bars:
        result.bars,

      source:
        "ALPACA",
    });

  if (
    hubResult.approved !==
    true
  ) {
    return {
      approved: false,

      provider:
        "ALPACA",

      symbol:
        result.symbol,

      timeframe,

      bars:
        result.bars,

      barCount:
        result.barCount,

      loadedIntoHub:
        false,

      hubResult,

      warnings: [
        ...result.warnings,

        "Historical bars were downloaded but Market Data Hub rejected them.",
      ],

      errors:
        hubResult.errors ??
        [],
    };
  }

  return {
    ...result,

    loadedIntoHub:
      true,

    hubResult,
  };
}

/**
 * ============================================================
 * GET WARMUP HISTORY
 * ============================================================
 *
 * Intended for booting the live engines.
 *
 * Example:
 *
 * Load enough 5-minute bars before subscribing
 * to the live stream.
 */

export async function loadEngineWarmupHistory({
  symbol,

  start,

  end,

  timeframe =
    ALPACA_TIMEFRAME
      .FIVE_MINUTES,

  feed =
    ALPACA_FEED.IEX,

  minimumBars = 250,
} = {}) {
  const result =
    await loadHistoricalBarsIntoHub({
      symbol,

      start,

      end,

      timeframe,

      feed,
    });

  if (
    result.approved !==
    true
  ) {
    return result;
  }

  if (
    result.barCount <
    minimumBars
  ) {
    return {
      ...result,

      approved: false,

      readyForEngines:
        false,

      warnings: [
        ...result.warnings,

        `Only ${result.barCount} bars were loaded; at least ${minimumBars} are required for engine warmup.`,
      ],
    };
  }

  return {
    ...result,

    readyForEngines:
      true,
  };
}

export default {
  getHistoricalBars,

  loadHistoricalBarsIntoHub,

  loadEngineWarmupHistory,
};