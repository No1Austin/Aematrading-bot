/**
 * AEMA Private Futures Research Bot
 *
 * Genuine Bybit V5 linear-perpetual research evidence.
 *
 * Supplies raw market evidence to the research engines.
 *
 * IMPORTANT:
 * - Futures/perpetual data only.
 * - Missing evidence remains null.
 * - No directional decision is made here.
 * - No order execution.
 */

import BOT_CONFIG from "../config/botConfig.js";

import {
  getBybitLinearKlines,
  getBybitLinearOrderbook,
  getBybitLinearTicker,
  getBybitOpenInterest,
} from "../../data/providers/bybitFuturesProvider.js";

/*
 * ---------------------------------------------------------
 * NUMERIC NORMALIZATION
 * ---------------------------------------------------------
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
 * INTERVALS
 * ---------------------------------------------------------
 */

const intervalMap = {
  "1m": "1",
  "3m": "3",
  "5m": "5",
  "15m": "15",
  "30m": "30",
  "1h": "60",
  "2h": "120",
  "4h": "240",
  "6h": "360",
  "12h": "720",
  "1d": "D",
};

const intervalMilliseconds = {
  "1m": 60_000,
  "3m": 180_000,
  "5m": 300_000,
  "15m": 900_000,
  "30m": 1_800_000,
  "1h": 3_600_000,
  "2h": 7_200_000,
  "4h": 14_400_000,
  "6h": 21_600_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
};

/*
 * ---------------------------------------------------------
 * CANDLE NORMALIZATION
 * ---------------------------------------------------------
 */

function normalizeCandles(
  rows = [],
  interval
) {
  const intervalMs =
    intervalMilliseconds[interval] ??
    null;

  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const openTime =
        finiteOrNull(row?.[0]);

      /*
       * Bybit gives us candle startTime.
       *
       * We can derive the scheduled close time from
       * the configured interval, but it should not be
       * confused with an exchange-provided close timestamp.
       */
      const estimatedCloseTime =
        openTime !== null &&
        intervalMs !== null
          ? openTime + intervalMs
          : null;

      return {
        openTime,

        estimatedCloseTime,

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

        /*
         * Bybit's seventh kline field is turnover.
         * Keep the provider terminology explicit.
         */
        turnover:
          finiteOrNull(row?.[6]),

        /*
         * Bybit's public kline response does not supply
         * a trade-count field here.
         */
        trades: null,
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
 * ORDER-BOOK NORMALIZATION
 * ---------------------------------------------------------
 */

function normalizeDepth(raw = {}) {
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
    normalizeLevels(raw?.b);

  const asks =
    normalizeLevels(raw?.a);

  /*
   * Ensure deterministic best-price ordering.
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

  const totalNotional =
    bidNotional +
    askNotional;

  const imbalance =
    totalNotional > 0
      ? (
          bidNotional -
          askNotional
        ) /
        totalNotional
      : null;

  return {
    bids,
    asks,

    bestBid:
      bids[0]?.price ??
      null,

    bestAsk:
      asks[0]?.price ??
      null,

    bidNotional,

    askNotional,

    totalNotional,

    imbalance,
  };
}

/*
 * ---------------------------------------------------------
 * OPEN-INTEREST HISTORY
 * ---------------------------------------------------------
 */

function normalizeOpenInterestHistory(
  rows = []
) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      openInterest:
        finiteOrNull(
          row?.openInterest
        ),

      timestamp:
        finiteOrNull(
          row?.timestamp
        ),
    }))
    .filter(
      (row) =>
        row.openInterest !== null
    )
    .sort(
      (a, b) =>
        (a.timestamp ?? 0) -
        (b.timestamp ?? 0)
    );
}

function calculateOpenInterestChange(
  history = []
) {
  if (history.length < 2) {
    return {
      available: false,

      previous:
        null,

      current:
        history.at(-1)
          ?.openInterest ??
        null,

      absoluteChange:
        null,

      percentChange:
        null,
    };
  }

  const previous =
    history.at(-2)
      ?.openInterest ??
    null;

  const current =
    history.at(-1)
      ?.openInterest ??
    null;

  if (
    previous === null ||
    current === null ||
    previous <= 0
  ) {
    return {
      available: false,

      previous,
      current,

      absoluteChange:
        null,

      percentChange:
        null,
    };
  }

  const absoluteChange =
    current - previous;

  const percentChange =
    (absoluteChange /
      previous) *
    100;

  return {
    available: true,

    previous,
    current,

    absoluteChange,

    percentChange,
  };
}

/*
 * ---------------------------------------------------------
 * MAIN RESEARCH MARKET PROVIDER
 * ---------------------------------------------------------
 */

export async function getBotResearchMarketEvidence(
  asset,
  options = {}
) {
  const cfg = {
    ...BOT_CONFIG.research,
    ...options,
  };

  const symbol =
    asset?.symbol ??
    null;

  if (!symbol) {
    throw new Error(
      "BOT_RESEARCH_SYMBOL_REQUIRED"
    );
  }

  /*
   * -------------------------------------------------------
   * FETCH FUTURES EVIDENCE
   * -------------------------------------------------------
   */

  const [
    rawKlines,
    rawOrderBook,
    ticker,
    rawOpenInterestHistory,
  ] = await Promise.all([
    getBybitLinearKlines(
      symbol,
      {
        interval:
          intervalMap[
            cfg.candleInterval
          ] || "15",

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

    /*
     * OI history is supplementary evidence.
     *
     * If this endpoint fails, the entire research
     * candidate should not automatically fail.
     */
    getBybitOpenInterest(
      symbol,
      {
        intervalTime:
          "5min",

        limit: 2,

        timeoutMs:
          cfg.timeoutMs,
      }
    ).catch(() => []),
  ]);

  /*
   * -------------------------------------------------------
   * NORMALIZE EVIDENCE
   * -------------------------------------------------------
   */

  const candles =
    normalizeCandles(
      rawKlines,
      cfg.candleInterval
    );

  const depth =
    normalizeDepth(
      rawOrderBook
    );

  const openInterestHistory =
    normalizeOpenInterestHistory(
      rawOpenInterestHistory
    );

  const openInterestChange =
    calculateOpenInterestChange(
      openInterestHistory
    );

  /*
   * Prefer current ticker OI.
   *
   * Historical endpoint is fallback evidence.
   */
  const openInterest =
    finiteOrNull(
      ticker?.openInterest
    ) ??
    openInterestHistory.at(-1)
      ?.openInterest ??
    null;

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

  const markPrice =
    positiveOrNull(
      ticker?.markPrice
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
   * -------------------------------------------------------
   * DERIVATIVES EVIDENCE AVAILABILITY
   * -------------------------------------------------------
   */

  const derivativesEvidenceAvailable =
    openInterest !== null ||
    openInterestValue !== null ||
    fundingRate !== null ||
    openInterestChange.available;

  /*
   * -------------------------------------------------------
   * RESEARCH EVIDENCE RESULT
   * -------------------------------------------------------
   */

  return {
    symbol,

    productId:
      symbol,

    /*
     * Price/candle evidence
     */
    candles,

    markPrice,

    indexPrice,

    lastPrice,

    /*
     * Liquidity evidence
     */
    depth,

    /*
     * Futures-specific evidence
     */
    fundingRate,

    nextFundingTime,

    openInterest,

    openInterestValue,

    openInterestHistory,

    openInterestChange,

    derivativesEvidenceAvailable,

    /*
     * Observation metadata
     */
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

export default getBotResearchMarketEvidence;