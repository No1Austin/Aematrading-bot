/**
 * AEMA Private Stock Research Bot
 * Setup Candle Utilities
 *
 * Purpose:
 * - Normalize candle timestamps.
 * - Determine candle interval duration.
 * - Exclude candles that have not fully closed.
 * - Prevent setup engines from treating an active candle
 *   as confirmed market structure.
 *
 * Gate candle timestamps are already normalized to
 * milliseconds by gateFuturesProvider.js.
 */

const INTERVAL_MS = Object.freeze({
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "30m": 30 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
});

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

export function getCandleIntervalMs(interval) {
  return INTERVAL_MS[
    String(interval || "")
  ] ?? null;
}

export function normalizeCandleOpenTime(candle) {
  if (!candle) {
    return null;
  }

  if (Array.isArray(candle)) {
    return finiteOrNull(
      candle[0]
    );
  }

  return finiteOrNull(
    candle.openTime ??
    candle.time ??
    candle.timestamp ??
    candle.t ??
    null
  );
}

export function isClosedCandle(
  candle,
  {
    interval = "5m",
    nowMs = Date.now(),
    closeGraceMs = 1_000,
  } = {}
) {
  const openTime =
    normalizeCandleOpenTime(
      candle
    );

  const intervalMs =
    getCandleIntervalMs(
      interval
    );

  if (
    openTime === null ||
    intervalMs === null
  ) {
    return false;
  }

  const closeTime =
    openTime + intervalMs;

  return (
    closeTime <=
    nowMs - closeGraceMs
  );
}

export function normalizeClosedCandles(
  candles,
  {
    interval = "5m",
    nowMs = Date.now(),
    closeGraceMs = 1_000,
  } = {}
) {
  if (!Array.isArray(candles)) {
    return [];
  }

  const normalized =
    candles
      .filter(Boolean)
      .map((candle) => ({
        candle,

        openTime:
          normalizeCandleOpenTime(
            candle
          ),
      }))
      .filter(
        (item) =>
          item.openTime !== null
      )
      .sort(
        (a, b) =>
          a.openTime -
          b.openTime
      );

  return normalized
    .filter(({ candle }) =>
      isClosedCandle(
        candle,
        {
          interval,
          nowMs,
          closeGraceMs,
        }
      )
    )
    .map(
      ({ candle }) =>
        candle
    );
}

export default normalizeClosedCandles;