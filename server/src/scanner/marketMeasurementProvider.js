/**
 * ============================================================
 * MARKET MEASUREMENT PROVIDER — 1 MINUTE / VOLUME INTELLIGENCE
 * ============================================================
 *
 * Consumes MarketDataHub only. It makes NO provider/API calls.
 *
 * The scanner warmer supplies 1-minute candles in one multi-symbol
 * batch provider flow. This module derives 1m / 5m / 15m / 30m /
 * 60m measurements locally.
 */

import {
  createMarketSnapshot,
} from "../data/marketDataHub.js";

const DEFAULT_CONFIG = Object.freeze({
  minimumCandles: 60,
  emaFastPeriod: 20,
  emaSlowPeriod: 50,
  atrPeriod: 14,
  recentRangeBars: 20,

  // Source candles are 1-minute scanner candles.
  bars1m: 1,
  bars5m: 5,
  bars15m: 15,
  bars30m: 30,
  bars60m: 60,

  // Compare each current rolling window with earlier equal-sized
  // windows. No extra API request is required.
  relativeVolumeComparisonWindows: 8,

  // US regular session: 390 minutes.
  regularSessionBars: 390,
});

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positive(value) {
  const n = finite(value);
  return n !== null && n > 0 ? n : null;
}

function nonNegative(value) {
  const n = finite(value);
  return n !== null && n >= 0 ? n : null;
}

function round(value, decimals = 6) {
  const n = finite(value);
  if (n === null) return null;
  const factor = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

function average(values) {
  const clean = values.map(finite).filter(v => v !== null);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

function percentChange(current, previous) {
  const a = positive(current);
  const b = positive(previous);
  if (a === null || b === null) return null;
  return round(((a - b) / b) * 100, 4);
}

function candleVolume(candle) {
  return nonNegative(
    candle?.volume ??
    candle?.v ??
    0,
  ) ?? 0;
}

function candleTimestamp(candle) {
  return candle?.timestamp ?? candle?.time ?? candle?.t ?? null;
}

function sumVolume(candles) {
  if (!Array.isArray(candles) || !candles.length) return null;
  return round(
    candles.reduce((sum, candle) => sum + candleVolume(candle), 0),
    2,
  );
}

function rollingVolume(candles, bars) {
  if (!Array.isArray(candles) || candles.length < bars || bars <= 0) {
    return null;
  }
  return sumVolume(candles.slice(-bars));
}

function changeAtOffset(candles, bars) {
  if (!Array.isArray(candles) || candles.length <= bars || bars <= 0) {
    return null;
  }
  const latest = candles.at(-1);
  const previous = candles[candles.length - 1 - bars];
  return percentChange(latest?.close, previous?.close);
}

function calculateEMA(values, period) {
  if (!Array.isArray(values) || values.length < period || period <= 0) {
    return null;
  }

  const clean = values.map(positive);
  if (clean.some(value => value === null)) return null;

  const multiplier = 2 / (period + 1);
  let ema =
    clean.slice(0, period).reduce((sum, value) => sum + value, 0) /
    period;

  for (let i = period; i < clean.length; i += 1) {
    ema = (clean[i] - ema) * multiplier + ema;
  }

  return round(ema, 6);
}

function trueRange(current, previousClose) {
  const high = positive(current?.high);
  const low = positive(current?.low);
  const prev = positive(previousClose);
  if (high === null || low === null) return null;

  if (prev === null) return high - low;

  return Math.max(
    high - low,
    Math.abs(high - prev),
    Math.abs(low - prev),
  );
}

function calculateATR(candles, period) {
  if (!Array.isArray(candles) || candles.length < period + 1) return null;

  const ranges = [];
  for (let i = 1; i < candles.length; i += 1) {
    const range = trueRange(candles[i], candles[i - 1]?.close);
    if (range !== null) ranges.push(range);
  }

  if (ranges.length < period) return null;
  return round(average(ranges.slice(-period)), 6);
}

function calculateVWAP(candles) {
  if (!Array.isArray(candles) || !candles.length) return null;

  let pv = 0;
  let volume = 0;

  for (const candle of candles) {
    const high = positive(candle?.high);
    const low = positive(candle?.low);
    const close = positive(candle?.close);
    const v = candleVolume(candle);

    if (high === null || low === null || close === null || v <= 0) continue;

    const typical = (high + low + close) / 3;
    pv += typical * v;
    volume += v;
  }

  return volume > 0 ? round(pv / volume, 6) : null;
}

function calculateRecentRange(candles, bars) {
  const rows = Array.isArray(candles) ? candles.slice(-bars) : [];
  const highs = rows.map(row => positive(row?.high)).filter(v => v !== null);
  const lows = rows.map(row => positive(row?.low)).filter(v => v !== null);

  return {
    recentHigh: highs.length ? round(Math.max(...highs), 6) : null,
    recentLow: lows.length ? round(Math.min(...lows), 6) : null,
  };
}

function calculateRangePercent(candles) {
  if (!Array.isArray(candles) || !candles.length) return null;

  const highs = candles.map(c => positive(c?.high)).filter(v => v !== null);
  const lows = candles.map(c => positive(c?.low)).filter(v => v !== null);
  const latest = positive(candles.at(-1)?.close);

  if (!highs.length || !lows.length || latest === null) return null;

  return round(
    ((Math.max(...highs) - Math.min(...lows)) / latest) * 100,
    4,
  );
}

function dateKey(timestamp) {
  const date = timestamp ? new Date(timestamp) : null;
  if (!date || Number.isNaN(date.getTime())) return null;

  // Alpaca timestamps are absolute. UTC date grouping is deterministic;
  // scanner bars should already be restricted to the requested market data.
  return date.toISOString().slice(0, 10);
}

function sessionVolumes(candles) {
  const byDate = new Map();

  for (const candle of Array.isArray(candles) ? candles : []) {
    const key = dateKey(candleTimestamp(candle));
    if (!key) continue;
    byDate.set(key, (byDate.get(key) ?? 0) + candleVolume(candle));
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, volume]) => ({ date, volume }));
}

function estimateAverageDailyVolume(candles) {
  const sessions = sessionVolumes(candles);
  if (!sessions.length) return null;

  // Exclude the newest session when older completed sessions exist.
  const completed = sessions.length > 1 ? sessions.slice(0, -1) : sessions;
  return round(average(completed.map(row => row.volume)), 2);
}

function currentSessionVolume(candles) {
  const sessions = sessionVolumes(candles);
  return sessions.length ? round(sessions.at(-1).volume, 2) : null;
}

function windowRelativeVolume(candles, bars, comparisonWindows = 8) {
  if (!Array.isArray(candles) || candles.length < bars * 2) return null;

  const current = rollingVolume(candles, bars);
  if (current === null) return null;

  const historical = [];
  const end = candles.length - bars;

  for (
    let offset = 0;
    offset < comparisonWindows && end - offset * bars - bars >= 0;
    offset += 1
  ) {
    const to = end - offset * bars;
    const from = to - bars;
    const value = sumVolume(candles.slice(from, to));
    if (value !== null) historical.push(value);
  }

  const baseline = average(historical);
  if (baseline === null || baseline <= 0) return null;

  return round(current / baseline, 4);
}

function volumeAcceleration(candles, bars) {
  if (!Array.isArray(candles) || candles.length < bars * 2) return null;

  const current = sumVolume(candles.slice(-bars));
  const previous = sumVolume(candles.slice(-(bars * 2), -bars));

  if (current === null || previous === null || previous <= 0) return null;
  return round(((current - previous) / previous) * 100, 4);
}

function pressureForWindow(change, rvol) {
  const priceChange = finite(change);
  const relative = finite(rvol);

  if (priceChange === null) return "UNKNOWN";

  const active = relative !== null ? relative >= 1.15 : false;

  if (priceChange >= 0.15 && active) return "BUYING";
  if (priceChange <= -0.15 && active) return "SELLING";
  if (Math.abs(priceChange) < 0.15) return "NORMAL";
  return priceChange > 0 ? "BUYING_LIGHT" : "SELLING_LIGHT";
}

function determineVolumePressure({ change5m, change15m, change60m, rvol5m, rvol15m, rvol60m }) {
  const states = [
    pressureForWindow(change5m, rvol5m),
    pressureForWindow(change15m, rvol15m),
    pressureForWindow(change60m, rvol60m),
  ];

  const buying = states.filter(s => s.startsWith("BUYING")).length;
  const selling = states.filter(s => s.startsWith("SELLING")).length;

  if (buying >= 2 && buying > selling) return "BUYING";
  if (selling >= 2 && selling > buying) return "SELLING";
  if (buying && selling) return "MIXED";
  return "NORMAL";
}

function determineVolumeConfirmation({ change15m, change60m, rvol15m, rvol60m }) {
  const c15 = finite(change15m);
  const c60 = finite(change60m);
  const v15 = finite(rvol15m);
  const v60 = finite(rvol60m);

  if (c15 === null || c60 === null) return "NEUTRAL";

  const sameDirection =
    (c15 > 0 && c60 > 0) ||
    (c15 < 0 && c60 < 0);

  const elevated =
    (v15 !== null && v15 >= 1.15) ||
    (v60 !== null && v60 >= 1.15);

  if (sameDirection && elevated) return "CONFIRMING";

  const oppositeDirection =
    (c15 > 0 && c60 < 0) ||
    (c15 < 0 && c60 > 0);

  return oppositeDirection ? "DIVERGING" : "NEUTRAL";
}

export function buildMarketMeasurement({
  asset = null,
  symbol = null,
  marketRegime = "NEUTRAL",
  configOverrides = {},
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol ?? asset?.symbol);
  if (!normalizedSymbol) return null;

  const config = {
    ...DEFAULT_CONFIG,
    ...configOverrides,
  };

  const snapshot = createMarketSnapshot(normalizedSymbol);
  if (!snapshot) return null;

  const candles = Array.isArray(snapshot.candles)
    ? snapshot.candles
    : [];

  if (candles.length < config.minimumCandles) return null;

  const latest = candles.at(-1);
  const price = positive(snapshot?.latestQuote?.midpoint ?? latest?.close);
  if (price === null) return null;

  const closes = candles.map(candle => positive(candle?.close));
  const ema20 = calculateEMA(closes, config.emaFastPeriod);
  const ema50 = calculateEMA(closes, config.emaSlowPeriod);
  const atr = calculateATR(candles, config.atrPeriod);
  const atrPercent =
    atr !== null ? round((atr / price) * 100, 4) : null;

  // 390 one-minute bars = one regular US session.
  const vwap = calculateVWAP(candles.slice(-config.regularSessionBars));

  const { recentHigh, recentLow } =
    calculateRecentRange(candles, config.recentRangeBars);

  const averageDailyVolume = estimateAverageDailyVolume(candles);
  const sessionVolume = currentSessionVolume(candles);
  const dollarVolume =
    averageDailyVolume !== null
      ? round(averageDailyVolume * price, 2)
      : null;

  const volume1m = rollingVolume(candles, config.bars1m);
  const volume5m = rollingVolume(candles, config.bars5m);
  const volume15m = rollingVolume(candles, config.bars15m);
  const volume30m = rollingVolume(candles, config.bars30m);
  const volume60m = rollingVolume(candles, config.bars60m);

  const rvol1m = windowRelativeVolume(
    candles,
    config.bars1m,
    config.relativeVolumeComparisonWindows,
  );
  const rvol5m = windowRelativeVolume(
    candles,
    config.bars5m,
    config.relativeVolumeComparisonWindows,
  );
  const rvol15m = windowRelativeVolume(
    candles,
    config.bars15m,
    config.relativeVolumeComparisonWindows,
  );
  const rvol30m = windowRelativeVolume(
    candles,
    config.bars30m,
    config.relativeVolumeComparisonWindows,
  );
  const rvol60m = windowRelativeVolume(
    candles,
    config.bars60m,
    config.relativeVolumeComparisonWindows,
  );

  const change1mPercent = changeAtOffset(candles, config.bars1m);
  const change5mPercent = changeAtOffset(candles, config.bars5m);
  const change15mPercent = changeAtOffset(candles, config.bars15m);
  const change30mPercent = changeAtOffset(candles, config.bars30m);
  const change60mPercent = changeAtOffset(candles, config.bars60m);

  const volumePressure = determineVolumePressure({
    change5m: change5mPercent,
    change15m: change15mPercent,
    change60m: change60mPercent,
    rvol5m,
    rvol15m,
    rvol60m,
  });

  const volumeConfirmation = determineVolumeConfirmation({
    change15m: change15mPercent,
    change60m: change60mPercent,
    rvol15m,
    rvol60m,
  });

  const spreadPercent = finite(snapshot?.latestQuote?.spreadPercent);

  return {
    symbol: normalizedSymbol,

    // Market price / liquidity compatibility.
    price,
    bid: positive(snapshot?.latestQuote?.bid),
    ask: positive(snapshot?.latestQuote?.ask),
    spreadPercent,
    averageDailyVolume,
    dollarVolume,

    // Backward-compatible general RVOL. 15m is more stable than
    // a single minute while remaining intraday-responsive.
    relativeVolume: rvol15m,

    // Multi-horizon price changes.
    change1mPercent,
    change5mPercent,
    change15mPercent,
    change30mPercent,
    change60mPercent,

    // Multi-horizon volume.
    volume1m,
    volume5m,
    volume15m,
    volume30m,
    volume60m,
    sessionVolume,

    // Multi-horizon relative volume.
    relativeVolume1m: rvol1m,
    relativeVolume5m: rvol5m,
    relativeVolume15m: rvol15m,
    relativeVolume30m: rvol30m,
    relativeVolume60m: rvol60m,

    // Acceleration: current rolling window vs immediately prior
    // equal-sized window.
    volumeAcceleration5m:
      volumeAcceleration(candles, config.bars5m),
    volumeAcceleration15m:
      volumeAcceleration(candles, config.bars15m),
    volumeAcceleration60m:
      volumeAcceleration(candles, config.bars60m),

    volumePressure,
    volumeConfirmation,

    atrPercent,
    intradayRangePercent: calculateRangePercent(
      candles.slice(-config.regularSessionBars),
    ),

    vwap,
    ema20,
    ema50,
    recentHigh,
    recentLow,

    tradable: asset?.tradable === true,
    shortable: asset?.shortable === true,
    borrowStatus: asset?.borrowStatus ?? null,
    marketRegime,

    source: "MARKET_MEASUREMENT_PROVIDER",
    sourceTimeframe: "1Min",
    asOfTimestamp:
      snapshot?.latestBar?.timestamp ??
      candleTimestamp(latest) ??
      snapshot?.asOf ??
      null,
    quoteFresh: snapshot?.quoteFresh === true,
    candleCount: candles.length,
  };
}

export function buildMarketMeasurements({
  assets = [],
  marketRegime = "NEUTRAL",
  configOverrides = {},
} = {}) {
  if (!Array.isArray(assets)) return [];

  const measurements = [];

  for (const asset of assets) {
    const measurement = buildMarketMeasurement({
      asset,
      symbol: asset?.symbol,
      marketRegime,
      configOverrides,
    });

    if (measurement) measurements.push(measurement);
  }

  return measurements;
}

export default buildMarketMeasurement;
