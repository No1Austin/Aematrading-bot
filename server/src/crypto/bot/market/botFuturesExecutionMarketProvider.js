/**
 * AEMA Private Futures Research Bot
 *
 * Fresh Bybit linear-perpetual market evidence used for
 * setup construction.
 *
 * Legacy filename retained for import compatibility.
 *
 * IMPORTANT:
 * - Public Bybit futures market data only.
 * - No order execution.
 * - No fabricated market values.
 * - Missing values remain null.
 */

import BOT_CONFIG from "../config/botConfig.js";

import {
  getBybitLinearKlines,
  getBybitLinearOrderbook,
  getBybitLinearTicker,
} from "../../data/providers/bybitFuturesProvider.js";

/*
 * ---------------------------------------------------------
 * NUMERIC NORMALIZATION
 * ---------------------------------------------------------
 *
 * Never allow:
 *
 * Number(null)      -> 0
 * Number("")        -> 0
 *
 * Missing evidence must remain null.
 */
function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function positiveOrNull(value) {
  const n = finiteOrNull(value);

  return n !== null && n > 0
    ? n
    : null;
}

/*
 * ---------------------------------------------------------
 * BYBIT INTERVAL MAPPING
 * ---------------------------------------------------------
 */

const intervalMap = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
};

const intervalMilliseconds = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
};

/*
 * ---------------------------------------------------------
 * NORMALIZE BYBIT KLINES
 * ---------------------------------------------------------
 */

function normalizeCandles(rows = []) {
  return rows
    .map((row) => {
      const openTime =
        finiteOrNull(row?.[0]);

      return {
        /*
         * Bybit returns candle start time here.
         */
        openTime,

        open:
          positiveOrNull(row?.[1]),

        high:
          positiveOrNull(row?.[2]),

        low:
          positiveOrNull(row?.[3]),

        close:
          positiveOrNull(row?.[4]),

        volume:
          finiteOrNull(row?.[5]),

        turnover:
          finiteOrNull(row?.[6]),
      };
    })
    .filter(
      (candle) =>
        candle.openTime !== null &&
        candle.open !== null &&
        candle.high !== null &&
        candle.low !== null &&
        candle.close !== null
    )
    .sort(
      (a, b) =>
        a.openTime - b.openTime
    );
}

/*
 * ---------------------------------------------------------
 * NORMALIZE ORDER BOOK
 * ---------------------------------------------------------
 */

function normalizeDepth(rawDepth = {}) {
  const normalizeLevels = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        price:
          positiveOrNull(row?.[0]),

        qty:
          positiveOrNull(row?.[1]),
      }))
      .filter(
        (level) =>
          level.price !== null &&
          level.qty !== null
      );

  const bids =
    normalizeLevels(rawDepth?.b);

  const asks =
    normalizeLevels(rawDepth?.a);

  /*
   * Do not assume API ordering when determining
   * the best available prices.
   */
  bids.sort(
    (a, b) =>
      b.price - a.price
  );

  asks.sort(
    (a, b) =>
      a.price - b.price
  );

  const bidNotional =
    bids.reduce(
      (sum, level) =>
        sum +
        level.price *
          level.qty,
      0
    );

  const askNotional =
    asks.reduce(
      (sum, level) =>
        sum +
        level.price *
          level.qty,
      0
    );

  return {
    bids,
    asks,

    bidNotional,
    askNotional,

    totalNotional:
      bidNotional +
      askNotional,
  };
}

/*
 * ---------------------------------------------------------
 * ORDER-BOOK SLIPPAGE ESTIMATE
 * ---------------------------------------------------------
 */

function estimateSlippage(
  levels,
  side,
  requestedNotional
) {
  const notional =
    positiveOrNull(
      requestedNotional
    );

  if (
    !Array.isArray(levels) ||
    levels.length === 0 ||
    notional === null
  ) {
    return {
      available: false,

      percent: null,

      averagePrice: null,

      filledNotional: 0,

      requestedNotional:
        notional,
    };
  }

  let remaining =
    notional;

  let quantity = 0;

  let cost = 0;

  for (const level of levels) {
    const levelNotional =
      level.price *
      level.qty;

    const take =
      Math.min(
        remaining,
        levelNotional
      );

    if (take <= 0) {
      continue;
    }

    quantity +=
      take /
      level.price;

    cost += take;

    remaining -= take;

    if (remaining <= 1e-8) {
      break;
    }
  }

  /*
   * Not enough order-book depth to fill the
   * requested research notional.
   */
  if (
    remaining > 1e-6 ||
    quantity <= 0
  ) {
    return {
      available: false,

      percent: null,

      averagePrice: null,

      filledNotional:
        cost,

      requestedNotional:
        notional,
    };
  }

  const averagePrice =
    cost /
    quantity;

  const bestPrice =
    positiveOrNull(
      levels[0]?.price
    );

  if (bestPrice === null) {
    return {
      available: false,

      percent: null,

      averagePrice,

      filledNotional:
        cost,

      requestedNotional:
        notional,
    };
  }

  let slippagePercent =
    null;

  if (side === "BUY") {
    slippagePercent =
      ((averagePrice - bestPrice) /
        bestPrice) *
      100;
  }

  if (side === "SELL") {
    slippagePercent =
      ((bestPrice - averagePrice) /
        bestPrice) *
      100;
  }

  /*
   * Tiny floating-point artifacts should never create
   * negative slippage.
   */
  if (
    Number.isFinite(
      slippagePercent
    )
  ) {
    slippagePercent =
      Math.max(
        0,
        slippagePercent
      );
  }

  return {
    available:
      Number.isFinite(
        slippagePercent
      ),

    percent:
      Number.isFinite(
        slippagePercent
      )
        ? slippagePercent
        : null,

    averagePrice,

    filledNotional:
      cost,

    requestedNotional:
      notional,
  };
}

/*
 * ---------------------------------------------------------
 * ATR
 * ---------------------------------------------------------
 */

function calculateATR(
  candles,
  period
) {
  const atrPeriod =
    Number(period);

  if (
    !Number.isInteger(
      atrPeriod
    ) ||
    atrPeriod <= 0 ||
    candles.length <
      atrPeriod + 1
  ) {
    return null;
  }

  const trueRanges = [];

  for (
    let i = 1;
    i < candles.length;
    i += 1
  ) {
    const current =
      candles[i];

    const previous =
      candles[i - 1];

    const trueRange =
      Math.max(
        current.high -
          current.low,

        Math.abs(
          current.high -
            previous.close
        ),

        Math.abs(
          current.low -
            previous.close
        )
      );

    trueRanges.push(
      trueRange
    );
  }

  const recent =
    trueRanges.slice(
      -atrPeriod
    );

  if (
    recent.length !==
    atrPeriod
  ) {
    return null;
  }

  const result =
    recent.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    atrPeriod;

  return positiveOrNull(
    result
  );
}

/*
 * ---------------------------------------------------------
 * MAIN FUTURES MARKET EVIDENCE PROVIDER
 * ---------------------------------------------------------
 */

export async function getBotFuturesExecutionMarket(
  candidate,
  options = {}
) {
  const cfg = {
    ...BOT_CONFIG.setup,
    ...options,
  };

  const symbol =
    candidate?.symbol ??
    candidate?.asset?.symbol ??
    null;

  if (!symbol) {
    throw new Error(
      "BOT_SETUP_SYMBOL_REQUIRED"
    );
  }

  /*
   * Fetch independent market evidence concurrently.
   */
  const [
    rawKlines,
    rawDepth,
    ticker,
  ] = await Promise.all([
    getBybitLinearKlines(
      symbol,
      {
        interval:
          intervalMap[
            cfg.candleInterval
          ] || "5",

        limit:
          cfg.candleLimit,

        timeoutMs:
          cfg.timeoutMs,
      }
    ),

    getBybitLinearOrderbook(
      symbol,
      {
        limit:
          cfg.depthLimit,

        timeoutMs:
          cfg.timeoutMs,
      }
    ),

    getBybitLinearTicker(
      symbol,
      {
        timeoutMs:
          cfg.timeoutMs,
      }
    ),
  ]);

  /*
   * ---------------------------------------------------------
   * NORMALIZE DATA
   * ---------------------------------------------------------
   */

  const orderBook =
    normalizeDepth(
      rawDepth
    );

  const candles =
    normalizeCandles(
      rawKlines
    );

  /*
   * Prefer order-book prices.
   * Ticker is fallback evidence.
   */
  const bid =
    positiveOrNull(
      orderBook.bids[0]?.price
    ) ??
    positiveOrNull(
      ticker?.bid1Price
    );

  const ask =
    positiveOrNull(
      orderBook.asks[0]?.price
    ) ??
    positiveOrNull(
      ticker?.ask1Price
    );

  const markPrice =
    positiveOrNull(
      ticker?.markPrice
    ) ??
    positiveOrNull(
      ticker?.lastPrice
    );

  const indexPrice =
    positiveOrNull(
      ticker?.indexPrice
    );

  const lastPrice =
    positiveOrNull(
      ticker?.lastPrice
    );

  /*
   * ---------------------------------------------------------
   * SPREAD
   * ---------------------------------------------------------
   */

  const midPrice =
    bid !== null &&
    ask !== null
      ? (bid + ask) / 2
      : markPrice;

  const spreadPercent =
    midPrice !== null &&
    midPrice > 0 &&
    bid !== null &&
    ask !== null &&
    ask >= bid
      ? ((ask - bid) /
          midPrice) *
        100
      : null;

  /*
   * ---------------------------------------------------------
   * ATR
   * ---------------------------------------------------------
   */

  const atr =
    calculateATR(
      candles,
      cfg.atrPeriod
    );

  /*
   * ---------------------------------------------------------
   * MARKET STRUCTURE
   * ---------------------------------------------------------
   */

  const structureLookback =
    Math.max(
      1,
      Number(
        cfg.structureLookback
      ) || 1
    );

  const structureCandles =
    candles.slice(
      -structureLookback
    );

  const support =
    structureCandles.length > 0
      ? Math.min(
          ...structureCandles.map(
            (candle) =>
              candle.low
          )
        )
      : null;

  const resistance =
    structureCandles.length > 0
      ? Math.max(
          ...structureCandles.map(
            (candle) =>
              candle.high
          )
        )
      : null;

  /*
   * ---------------------------------------------------------
   * FRESHNESS
   * ---------------------------------------------------------
   *
   * Bybit kline timestamp is the candle START time.
   *
   * Therefore the estimated close time is:
   *
   * openTime + interval
   */

  const latestOpenTime =
    candles.at(-1)?.openTime ??
    null;

  const intervalMs =
    intervalMilliseconds[
      cfg.candleInterval
    ] || 300_000;

  const latestEstimatedCloseTime =
    latestOpenTime !== null
      ? latestOpenTime +
        intervalMs
      : null;

  /*
   * If the latest candle is still open,
   * its estimated close can be in the future.
   *
   * For freshness purposes, that is age 0.
   */
  const ageMs =
    latestEstimatedCloseTime !==
    null
      ? Math.max(
          0,
          Date.now() -
            latestEstimatedCloseTime
        )
      : null;

  /*
   * ---------------------------------------------------------
   * SLIPPAGE
   * ---------------------------------------------------------
   */

  const buySlippage =
    estimateSlippage(
      orderBook.asks,
      "BUY",
      cfg.slippageNotionalUsd
    );

  const sellSlippage =
    estimateSlippage(
      orderBook.bids,
      "SELL",
      cfg.slippageNotionalUsd
    );

  /*
   * ---------------------------------------------------------
   * FUTURES-SPECIFIC EVIDENCE
   * ---------------------------------------------------------
   */

  const openInterest =
    finiteOrNull(
      ticker?.openInterest
    );

  const openInterestValue =
    finiteOrNull(
      ticker?.openInterestValue
    );

  const fundingRate =
    finiteOrNull(
      ticker?.fundingRate
    );

  const nextFundingTime =
    finiteOrNull(
      ticker?.nextFundingTime
    );

  /*
   * ---------------------------------------------------------
   * EVIDENCE VALIDATION
   * ---------------------------------------------------------
   */

  const blockers = [];

  if (
    markPrice === null ||
    bid === null ||
    ask === null
  ) {
    blockers.push(
      "INVALID_MARKET_PRICES"
    );
  }

  if (
    bid !== null &&
    ask !== null &&
    ask < bid
  ) {
    blockers.push(
      "CROSSED_ORDER_BOOK"
    );
  }

  if (
    spreadPercent === null
  ) {
    blockers.push(
      "MISSING_SPREAD"
    );
  }

  if (
    orderBook.totalNotional <=
    0
  ) {
    blockers.push(
      "MISSING_DEPTH"
    );
  }

  if (atr === null) {
    blockers.push(
      "MISSING_ATR"
    );
  }

  if (
    support === null ||
    resistance === null ||
    resistance <= support
  ) {
    blockers.push(
      "INVALID_STRUCTURE"
    );
  }

  if (
    ageMs === null ||
    ageMs >
      cfg.maximumObservationAgeMs
  ) {
    blockers.push(
      "STALE_CANDLES"
    );
  }

  const approved =
    blockers.length === 0;

  /*
   * ---------------------------------------------------------
   * RESULT
   * ---------------------------------------------------------
   */

  return {
    approved,

    status:
      approved
        ? "RESEARCH_MARKET_EVIDENCE_READY"
        : "RESEARCH_MARKET_EVIDENCE_BLOCKED",

    symbol,

    productId:
      symbol,

    /*
     * Prices
     */
    markPrice,
    indexPrice,
    lastPrice,

    bid,
    ask,

    spreadPercent,

    /*
     * Futures evidence
     */
    openInterest,
    openInterestValue,
    fundingRate,
    nextFundingTime,

    /*
     * Market depth
     */
    depth:
      orderBook,

    /*
     * Setup evidence
     */
    atr,
    support,
    resistance,

    /*
     * Estimated directional slippage.
     */
    slippage: {
      buy:
        buySlippage,

      sell:
        sellSlippage,

      notionalUsd:
        finiteOrNull(
          cfg.slippageNotionalUsd
        ),
    },

    /*
     * Freshness diagnostics
     */
    freshness: {
      latestOpenTime,

      latestEstimatedCloseTime,

      ageMs,

      maximumAgeMs:
        cfg.maximumObservationAgeMs,

      candleInterval:
        cfg.candleInterval,
    },

    /*
     * Keep candles available for diagnostics
     * and later monitoring.
     */
    candles,

    blockers,

    observedAt:
      new Date().toISOString(),

    source:
      "BYBIT_V5_PUBLIC_LINEAR",

    exchange:
      "BYBIT",

    instrumentType:
      "PERPETUAL",

    contractType:
      "PERPETUAL",

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default getBotFuturesExecutionMarket;