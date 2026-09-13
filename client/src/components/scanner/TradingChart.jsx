// client/src/components/scanner/TradingChart.jsx

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from "lightweight-charts";

import {
  Activity,
  Expand,
  Eye,
  EyeOff,
  Maximize2,
  RotateCcw,
  TrendingUp,
} from "lucide-react";

import "./TradingChart.css";

/* =========================================================
   01. CONSTANTS
   ========================================================= */

const TIMEFRAMES = ["5m", "15m", "30m", "1h", "1D"];

const NEW_YORK_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* =========================================================
   02. BASIC HELPERS
   ========================================================= */

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toUnixSeconds(timestamp) {
  const milliseconds = new Date(timestamp).getTime();

  if (!Number.isFinite(milliseconds)) {
    return null;
  }

  return Math.floor(milliseconds / 1000);
}

function formatPrice(value) {
  const number = numberOrNull(value);

  if (number === null) {
    return "—";
  }

  const digits = Math.abs(number) >= 1 ? 2 : 4;

  return number.toLocaleString("en-CA", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatVolume(value) {
  const number = numberOrNull(value);

  if (number === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-CA", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

function directionClass(value) {
  const number = numberOrNull(value);

  if (number === null || number === 0) {
    return "neutral";
  }

  return number > 0 ? "positive" : "negative";
}

/* =========================================================
   03. CANDLE NORMALIZATION
   - validates OHLC
   - deduplicates timestamps
   - keeps the newest valid candle for duplicate timestamps
   ========================================================= */

function normalizeCandles(candles) {
  if (!Array.isArray(candles)) {
    return [];
  }

  const byTime = new Map();

  for (const candle of candles) {
    const time = toUnixSeconds(candle?.timestamp);
    const open = numberOrNull(candle?.open);
    const high = numberOrNull(candle?.high);
    const low = numberOrNull(candle?.low);
    const close = numberOrNull(candle?.close);
    const volume = numberOrNull(candle?.volume) ?? 0;
    const vwap = numberOrNull(candle?.vwap);

    if (
      time === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      continue;
    }

    byTime.set(time, {
      time,
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      volume: Math.max(0, volume),
      vwap,
    });
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

/* =========================================================
   04. NEW YORK SESSION HELPERS
   Keeps 15m / 30m / 1h bars aligned to the U.S. session.
   ========================================================= */

function getNewYorkParts(unixSeconds) {
  const parts = NEW_YORK_TIME_FORMATTER.formatToParts(
    new Date(unixSeconds * 1000),
  );

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function timeframeMinutes(timeframe) {
  switch (timeframe) {
    case "15m":
      return 15;
    case "30m":
      return 30;
    case "1h":
      return 60;
    default:
      return null;
  }
}

function buildAggregatedCandle(current, candle) {
  if (!current) {
    return {
      time: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      vwapNumerator: (candle.vwap ?? candle.close) * candle.volume,
      vwapVolume: candle.volume,
    };
  }

  current.high = Math.max(current.high, candle.high);
  current.low = Math.min(current.low, candle.low);
  current.close = candle.close;
  current.volume += candle.volume;
  current.vwapNumerator += (candle.vwap ?? candle.close) * candle.volume;
  current.vwapVolume += candle.volume;

  return current;
}

function finalizeAggregatedCandle(candle) {
  return {
    time: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
    vwap:
      candle.vwapVolume > 0
        ? candle.vwapNumerator / candle.vwapVolume
        : null,
  };
}

/* =========================================================
   05. TIMEFRAME AGGREGATION
   Source data is 5-minute candles.
   We intentionally do not synthesize 1-minute candles.
   ========================================================= */

function aggregateIntraday(candles, timeframe) {
  if (timeframe === "5m") {
    return candles;
  }

  const minutes = timeframeMinutes(timeframe);

  if (!minutes) {
    return candles;
  }

  const buckets = new Map();

  for (const candle of candles) {
    const { dateKey, hour, minute } = getNewYorkParts(candle.time);
    const minutesFromMidnight = hour * 60 + minute;

    // 09:30 ET regular-session anchor.
    const sessionOffset = minutesFromMidnight - 570;
    const bucketIndex = Math.floor(sessionOffset / minutes);
    const key = `${dateKey}:${bucketIndex}`;

    buckets.set(
      key,
      buildAggregatedCandle(buckets.get(key), candle),
    );
  }

  return Array.from(buckets.values())
    .map(finalizeAggregatedCandle)
    .sort((a, b) => a.time - b.time);
}

function aggregateDaily(candles) {
  const days = new Map();

  for (const candle of candles) {
    const { dateKey } = getNewYorkParts(candle.time);

    days.set(
      dateKey,
      buildAggregatedCandle(days.get(dateKey), candle),
    );
  }

  return Array.from(days.values())
    .map(finalizeAggregatedCandle)
    .sort((a, b) => a.time - b.time);
}

function aggregateCandles(candles, timeframe) {
  if (timeframe === "1D") {
    return aggregateDaily(candles);
  }

  return aggregateIntraday(candles, timeframe);
}

/* =========================================================
   06. INDICATORS
   ========================================================= */

function calculateSMA(candles, period) {
  if (candles.length < period) {
    return [];
  }

  const output = [];
  let sum = 0;

  for (let index = 0; index < candles.length; index += 1) {
    sum += candles[index].close;

    if (index >= period) {
      sum -= candles[index - period].close;
    }

    if (index >= period - 1) {
      output.push({
        time: candles[index].time,
        value: sum / period,
      });
    }
  }

  return output;
}

function calculateEMA(candles, period) {
  if (candles.length < period) {
    return [];
  }

  const multiplier = 2 / (period + 1);

  let ema =
    candles
      .slice(0, period)
      .reduce((sum, candle) => sum + candle.close, 0) / period;

  const output = [
    {
      time: candles[period - 1].time,
      value: ema,
    },
  ];

  for (let index = period; index < candles.length; index += 1) {
    ema = (candles[index].close - ema) * multiplier + ema;

    output.push({
      time: candles[index].time,
      value: ema,
    });
  }

  return output;
}

function calculateVWAP(candles) {
  return candles
    .filter((candle) => numberOrNull(candle.vwap) !== null)
    .map((candle) => ({
      time: candle.time,
      value: candle.vwap,
    }));
}

/* =========================================================
   07. COMPONENT
   ========================================================= */

export default function TradingChart({
  symbol,
  candles = [],
  loading = false,
}) {
  const containerRef = useRef(null);
  const wrapperRef = useRef(null);
  const chartRef = useRef(null);

  const seriesRef = useRef({
    candles: null,
    volume: null,
    sma: null,
    ema: null,
    vwap: null,
  });

  const volumeByTimeRef = useRef(new Map());
  const previousTimeframeRef = useRef("5m");

  const [timeframe, setTimeframe] = useState("5m");
  const [showVolume, setShowVolume] = useState(true);
  const [showSMA, setShowSMA] = useState(false);
  const [showEMA, setShowEMA] = useState(false);
  const [showVWAP, setShowVWAP] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [crosshairData, setCrosshairData] = useState(null);

  const normalized = useMemo(
    () => normalizeCandles(candles),
    [candles],
  );

  const chartCandles = useMemo(
    () => aggregateCandles(normalized, timeframe),
    [normalized, timeframe],
  );

  const latest = chartCandles[chartCandles.length - 1] ?? null;
  const previous = chartCandles[chartCandles.length - 2] ?? null;

  const latestMove =
    latest && previous && previous.close !== 0
      ? {
          amount: latest.close - previous.close,
          percent:
            ((latest.close - previous.close) / previous.close) * 100,
        }
      : null;

  const displayedBar = crosshairData ?? latest;

  /* =======================================================
     08. CREATE CHART ONCE
     ======================================================= */

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    const chart = createChart(container, {
      autoSize: true,

      layout: {
        background: {
          type: ColorType.Solid,
          color: "#07111f",
        },
        textColor: "#7186a5",
        fontSize: 11,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      },

      grid: {
        vertLines: {
          color: "rgba(38, 59, 88, 0.42)",
        },
        horzLines: {
          color: "rgba(38, 59, 88, 0.42)",
        },
      },

      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "rgba(139, 169, 210, 0.45)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1b3353",
        },
        horzLine: {
          color: "rgba(139, 169, 210, 0.45)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#1b3353",
        },
      },

      rightPriceScale: {
        borderColor: "#1d3049",
        scaleMargins: {
          top: 0.08,
          bottom: 0.24,
        },
      },

      timeScale: {
        borderColor: "#1d3049",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 3,
        lockVisibleTimeRangeOnResize: true,
      },

      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },

      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#2ad6a2",
      downColor: "#f06470",
      borderVisible: false,
      wickUpColor: "#2ad6a2",
      wickDownColor: "#f06470",
      priceLineVisible: true,
      priceLineColor: "rgba(126, 167, 224, 0.55)",
      priceLineWidth: 1,
      lastValueVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "",
      lastValueVisible: false,
      priceLineVisible: false,
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });

    const smaSeries = chart.addSeries(LineSeries, {
      color: "#f1bd64",
      lineWidth: 2,
      title: "SMA 20",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const emaSeries = chart.addSeries(LineSeries, {
      color: "#a88cff",
      lineWidth: 2,
      title: "EMA 20",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    const vwapSeries = chart.addSeries(LineSeries, {
      color: "#59b8ff",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      title: "VWAP",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });

    seriesRef.current = {
      candles: candleSeries,
      volume: volumeSeries,
      sma: smaSeries,
      ema: emaSeries,
      vwap: vwapSeries,
    };

    const handleCrosshairMove = (param) => {
      if (!param?.time || !param?.point) {
        setCrosshairData(null);
        return;
      }

      const candle = param.seriesData.get(candleSeries);

      if (!candle) {
        setCrosshairData(null);
        return;
      }

      const time = Number(param.time);

      setCrosshairData({
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: volumeByTimeRef.current.get(time) ?? 0,
      });
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

    return () => {
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {
        candles: null,
        volume: null,
        sma: null,
        ema: null,
        vwap: null,
      };
    };
  }, []);

  /* =======================================================
     09. UPDATE DATA WITHOUT REBUILDING THE CHART
     ======================================================= */

  useEffect(() => {
    const chart = chartRef.current;
    const {
      candles: candleSeries,
      volume: volumeSeries,
      sma: smaSeries,
      ema: emaSeries,
      vwap: vwapSeries,
    } = seriesRef.current;

    if (
      !chart ||
      !candleSeries ||
      !volumeSeries ||
      !smaSeries ||
      !emaSeries ||
      !vwapSeries
    ) {
      return;
    }

    const volumeMap = new Map();

    for (const candle of chartCandles) {
      volumeMap.set(candle.time, candle.volume);
    }

    volumeByTimeRef.current = volumeMap;

    candleSeries.setData(
      chartCandles.map((candle) => ({
        time: candle.time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );

    volumeSeries.setData(
      chartCandles.map((candle) => ({
        time: candle.time,
        value: candle.volume,
        color:
          candle.close >= candle.open
            ? "rgba(42,214,162,0.32)"
            : "rgba(240,100,112,0.30)",
      })),
    );

    smaSeries.setData(calculateSMA(chartCandles, 20));
    emaSeries.setData(calculateEMA(chartCandles, 20));
    vwapSeries.setData(calculateVWAP(chartCandles));

    if (previousTimeframeRef.current !== timeframe) {
      chart.timeScale().fitContent();
      previousTimeframeRef.current = timeframe;
    }
  }, [chartCandles, timeframe]);

  /* =======================================================
     10. UPDATE VISIBILITY / SCALE OPTIONS
     ======================================================= */

  useEffect(() => {
    const chart = chartRef.current;
    const { volume, sma, ema, vwap } = seriesRef.current;

    if (!chart) {
      return;
    }

    volume?.applyOptions({ visible: showVolume });
    sma?.applyOptions({ visible: showSMA });
    ema?.applyOptions({ visible: showEMA });
    vwap?.applyOptions({ visible: showVWAP });

    chart.applyOptions({
      rightPriceScale: {
        scaleMargins: {
          top: 0.08,
          bottom: showVolume ? 0.24 : 0.08,
        },
      },
      timeScale: {
        timeVisible: timeframe !== "1D",
        barSpacing: timeframe === "1D" ? 12 : 8,
      },
    });
  }, [showVolume, showSMA, showEMA, showVWAP, timeframe]);

  /* =======================================================
     11. FULLSCREEN STATE
     ======================================================= */

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(
        document.fullscreenElement === wrapperRef.current,
      );

      requestAnimationFrame(() => {
        chartRef.current?.timeScale()?.fitContent();
      });
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  /* =======================================================
     12. ACTIONS
     ======================================================= */

  function resetChart() {
    chartRef.current?.timeScale()?.fitContent();
  }

  async function toggleFullscreen() {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (wrapper.requestFullscreen) {
        await wrapper.requestFullscreen();
      }
    } catch {
      // Some mobile browsers do not support element fullscreen.
    }
  }

  /* =======================================================
     13. RENDER
     ======================================================= */

  return (
    <section
      ref={wrapperRef}
      className="scanner-chart-card scanner-advanced-chart"
    >
      <div className="scanner-chart-header">
        <div className="scanner-chart-identity">
          <div className="scanner-chart-title-row">
            <span className="scanner-chart-kicker">Market chart</span>
            <span className="scanner-chart-live-dot" aria-hidden="true" />
          </div>

          <div className="scanner-chart-symbol-row">
            <strong>{symbol ?? "—"}</strong>

            {latest && (
              <>
                <span className="scanner-chart-last-price">
                  {formatPrice(latest.close)}
                </span>

                {latestMove && (
                  <span
                    className={`scanner-chart-change ${directionClass(
                      latestMove.amount,
                    )}`}
                  >
                    {latestMove.amount >= 0 ? "+" : ""}
                    {formatPrice(latestMove.amount)}
                    <span>
                      ({latestMove.percent >= 0 ? "+" : ""}
                      {latestMove.percent.toFixed(2)}%)
                    </span>
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="scanner-timeframes" aria-label="Chart timeframe">
          <button
            type="button"
            disabled
            title="Requires true 1-minute source candles."
          >
            1m
          </button>

          {TIMEFRAMES.map((item) => (
            <button
              key={item}
              type="button"
              className={timeframe === item ? "active" : ""}
              aria-pressed={timeframe === item}
              onClick={() => setTimeframe(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="scanner-chart-readout">
        <div>
          <span>O</span>
          <strong>{formatPrice(displayedBar?.open)}</strong>
        </div>

        <div>
          <span>H</span>
          <strong>{formatPrice(displayedBar?.high)}</strong>
        </div>

        <div>
          <span>L</span>
          <strong>{formatPrice(displayedBar?.low)}</strong>
        </div>

        <div>
          <span>C</span>
          <strong>{formatPrice(displayedBar?.close)}</strong>
        </div>

        <div className="scanner-chart-readout-volume">
          <span>VOL</span>
          <strong>{formatVolume(displayedBar?.volume)}</strong>
        </div>

        <span className="scanner-chart-timeframe-chip">{timeframe}</span>
      </div>

      <div className="scanner-chart-toolbar">
        <div className="scanner-chart-toolbar-scroll">
          <button
            type="button"
            className={showVolume ? "active" : ""}
            aria-pressed={showVolume}
            onClick={() => setShowVolume((value) => !value)}
          >
            {showVolume ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Volume</span>
          </button>

          <button
            type="button"
            className={showSMA ? "active indicator-sma" : "indicator-sma"}
            aria-pressed={showSMA}
            onClick={() => setShowSMA((value) => !value)}
          >
            <TrendingUp size={14} />
            <span>SMA 20</span>
          </button>

          <button
            type="button"
            className={showEMA ? "active indicator-ema" : "indicator-ema"}
            aria-pressed={showEMA}
            onClick={() => setShowEMA((value) => !value)}
          >
            <Activity size={14} />
            <span>EMA 20</span>
          </button>

          <button
            type="button"
            className={showVWAP ? "active indicator-vwap" : "indicator-vwap"}
            aria-pressed={showVWAP}
            onClick={() => setShowVWAP((value) => !value)}
          >
            <span className="scanner-vwap-icon">V</span>
            <span>VWAP</span>
          </button>
        </div>

        <div className="scanner-chart-toolbar-actions">
          <button
            type="button"
            title="Reset visible range"
            aria-label="Reset visible range"
            onClick={resetChart}
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            title="Fit all candles"
            aria-label="Fit all candles"
            onClick={resetChart}
          >
            <Maximize2 size={14} />
          </button>

          <button
            type="button"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={
              isFullscreen ? "Exit fullscreen" : "Open fullscreen chart"
            }
            onClick={toggleFullscreen}
          >
            <Expand size={14} />
          </button>
        </div>
      </div>

      <div className="scanner-chart-stage">
        <div ref={containerRef} className="scanner-chart-container" />

        {loading && (
          <div className="scanner-chart-message scanner-chart-overlay">
            <span className="scanner-chart-loader" />
            <strong>Loading market data</strong>
            <span>Preparing candles and indicators...</span>
          </div>
        )}

        {!loading && chartCandles.length === 0 && (
          <div className="scanner-chart-message scanner-chart-overlay">
            <span className="scanner-chart-empty-icon">
              <TrendingUp size={20} />
            </span>
            <strong>No chart loaded</strong>
            <span>
              Search and analyze a stock to display its market history.
            </span>
          </div>
        )}
      </div>

      <div className="scanner-chart-footer">
        <span>Drag to pan</span>
        <span>Scroll or pinch to zoom</span>
        <span className="scanner-chart-footer-source">5m source data</span>
      </div>
    </section>
  );
}
