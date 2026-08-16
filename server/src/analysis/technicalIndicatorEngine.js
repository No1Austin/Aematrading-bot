import {
  EMA,
  RSI,
  MACD,
  ATR,
  SMA,
} from "technicalindicators";

/**
 * ============================================================
 * TECHNICAL INDICATOR ENGINE
 * ============================================================
 *
 * Responsibilities:
 *
 * - Validate OHLCV market data
 * - Calculate:
 *   - EMA 9
 *   - EMA 20
 *   - EMA 50
 *   - SMA 200
 *   - RSI 14
 *   - MACD
 *   - ATR 14
 *   - VWAP
 *   - Volume ratio
 * - Determine:
 *   - Trend
 *   - Momentum
 *   - Volume confirmation
 *   - Technical bias
 *
 * This engine does NOT decide whether to trade.
 *
 * It produces technical evidence that will later be
 * scored by the trade scoring engine.
 */

/**
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
  return Number.isFinite(
    Number(value),
  );
}

function isPositiveNumber(value) {
  return (
    isFiniteNumber(value) &&
    Number(value) > 0
  );
}

function round(
  value,
  decimals = 4,
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) * factor,
    ) / factor
  );
}

function getLast(array) {
  if (
    !Array.isArray(array) ||
    array.length === 0
  ) {
    return null;
  }

  return array[
    array.length - 1
  ];
}

/**
 * ============================================================
 * MARKET DATA VALIDATION
 * ============================================================
 */

export function validateCandles(
  candles,
) {
  const errors = [];

  if (!Array.isArray(candles)) {
    return {
      approved: false,
      errors: [
        "Candles must be an array.",
      ],
    };
  }

  if (candles.length < 200) {
    errors.push(
      "At least 200 candles are required for full technical analysis.",
    );
  }

  candles.forEach(
    (candle, index) => {
      if (!candle) {
        errors.push(
          `Candle ${index} is missing.`,
        );

        return;
      }

      const {
        open,
        high,
        low,
        close,
        volume,
      } = candle;

      if (
        !isPositiveNumber(open) ||
        !isPositiveNumber(high) ||
        !isPositiveNumber(low) ||
        !isPositiveNumber(close)
      ) {
        errors.push(
          `Candle ${index} contains invalid OHLC prices.`,
        );
      }

      if (
        !isFiniteNumber(volume) ||
        Number(volume) < 0
      ) {
        errors.push(
          `Candle ${index} contains invalid volume.`,
        );
      }

      if (
        isPositiveNumber(high) &&
        isPositiveNumber(low) &&
        Number(high) <
          Number(low)
      ) {
        errors.push(
          `Candle ${index} has high below low.`,
        );
      }
    },
  );

  return {
    approved:
      errors.length === 0,

    errors,
  };
}

/**
 * ============================================================
 * VWAP
 * ============================================================
 */

export function calculateVWAP(
  candles,
) {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;

  for (const candle of candles) {
    const high =
      Number(candle.high);

    const low =
      Number(candle.low);

    const close =
      Number(candle.close);

    const volume =
      Number(candle.volume);

    if (
      !isPositiveNumber(high) ||
      !isPositiveNumber(low) ||
      !isPositiveNumber(close) ||
      !isFiniteNumber(volume) ||
      volume <= 0
    ) {
      continue;
    }

    const typicalPrice =
      (
        high +
        low +
        close
      ) / 3;

    cumulativePriceVolume +=
      typicalPrice *
      volume;

    cumulativeVolume +=
      volume;
  }

  if (
    cumulativeVolume <= 0
  ) {
    return null;
  }

  return round(
    cumulativePriceVolume /
      cumulativeVolume,
  );
}

/**
 * ============================================================
 * VOLUME ANALYSIS
 * ============================================================
 */

export function calculateVolumeAnalysis(
  candles,
  period = 20,
) {
  if (
    !Array.isArray(candles) ||
    candles.length <
      period + 1
  ) {
    return {
      currentVolume: null,
      averageVolume: null,
      volumeRatio: null,
      confirmation: false,
    };
  }

  const latest =
    getLast(candles);

  const previous =
    candles.slice(
      -(period + 1),
      -1,
    );

  const validVolumes =
    previous
      .map(
        (candle) =>
          Number(candle.volume),
      )
      .filter(
        (volume) =>
          Number.isFinite(volume) &&
          volume >= 0,
      );

  if (
    validVolumes.length === 0
  ) {
    return {
      currentVolume: null,
      averageVolume: null,
      volumeRatio: null,
      confirmation: false,
    };
  }

  const averageVolume =
    validVolumes.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    validVolumes.length;

  const currentVolume =
    Number(latest.volume);

  const volumeRatio =
    averageVolume > 0
      ? currentVolume /
        averageVolume
      : null;

  /**
   * Initial rule:
   *
   * 1.20 means current volume is
   * at least 20% above recent average.
   *
   * This can later be optimized.
   */
  const confirmation =
    isFiniteNumber(volumeRatio) &&
    volumeRatio >= 1.2;

  return {
    currentVolume:
      round(currentVolume),

    averageVolume:
      round(averageVolume),

    volumeRatio:
      round(volumeRatio),

    confirmation,
  };
}

/**
 * ============================================================
 * TREND ANALYSIS
 * ============================================================
 */

export function determineTrend({
  price,
  ema9,
  ema20,
  ema50,
  sma200,
}) {
  if (
    ![
      price,
      ema9,
      ema20,
      ema50,
      sma200,
    ].every(
      isPositiveNumber,
    )
  ) {
    return {
      direction: "UNKNOWN",
      strength: 0,
    };
  }

  let bullishPoints = 0;
  let bearishPoints = 0;

  if (price > ema9) {
    bullishPoints += 1;
  } else {
    bearishPoints += 1;
  }

  if (ema9 > ema20) {
    bullishPoints += 1;
  } else {
    bearishPoints += 1;
  }

  if (ema20 > ema50) {
    bullishPoints += 1;
  } else {
    bearishPoints += 1;
  }

  if (ema50 > sma200) {
    bullishPoints += 1;
  } else {
    bearishPoints += 1;
  }

  if (price > sma200) {
    bullishPoints += 1;
  } else {
    bearishPoints += 1;
  }

  if (bullishPoints >= 4) {
    return {
      direction:
        bullishPoints === 5
          ? "STRONG_BULLISH"
          : "BULLISH",

      strength:
        bullishPoints / 5,
    };
  }

  if (bearishPoints >= 4) {
    return {
      direction:
        bearishPoints === 5
          ? "STRONG_BEARISH"
          : "BEARISH",

      strength:
        bearishPoints / 5,
    };
  }

  return {
    direction: "SIDEWAYS",

    strength:
      Math.max(
        bullishPoints,
        bearishPoints,
      ) / 5,
  };
}

/**
 * ============================================================
 * RSI ANALYSIS
 * ============================================================
 */

export function analyzeRSI(
  value,
) {
  if (!isFiniteNumber(value)) {
    return {
      value: null,
      state: "UNKNOWN",
      bullishScore: 0,
      bearishScore: 0,
    };
  }

  const rsi =
    Number(value);

  /**
   * We do not automatically treat
   * RSI < 30 as BUY or RSI > 70 as SELL.
   *
   * RSI is supporting evidence only.
   */

  let state =
    "NEUTRAL";

  let bullishScore = 0;
  let bearishScore = 0;

  if (rsi <= 30) {
    state =
      "OVERSOLD";

    bullishScore =
      0.65;

    bearishScore =
      0.15;
  } else if (
    rsi >= 70
  ) {
    state =
      "OVERBOUGHT";

    bullishScore =
      0.15;

    bearishScore =
      0.65;
  } else if (
    rsi >= 50 &&
    rsi < 70
  ) {
    state =
      "BULLISH";

    bullishScore =
      0.75;

    bearishScore =
      0.15;
  } else if (
    rsi > 30 &&
    rsi < 50
  ) {
    state =
      "BEARISH";

    bullishScore =
      0.15;

    bearishScore =
      0.75;
  }

  return {
    value:
      round(rsi, 2),

    state,

    bullishScore,

    bearishScore,
  };
}

/**
 * ============================================================
 * MACD ANALYSIS
 * ============================================================
 */

export function analyzeMACD(
  macd,
) {
  if (
    !macd ||
    !isFiniteNumber(
      macd.MACD,
    ) ||
    !isFiniteNumber(
      macd.signal,
    )
  ) {
    return {
      direction: "UNKNOWN",
      momentumStrength: 0,
    };
  }

  const macdLine =
    Number(macd.MACD);

  const signalLine =
    Number(macd.signal);

  const histogram =
    isFiniteNumber(
      macd.histogram,
    )
      ? Number(
          macd.histogram,
        )
      : macdLine -
        signalLine;

  if (
    macdLine >
      signalLine &&
    histogram > 0
  ) {
    return {
      direction: "BULLISH",

      momentumStrength:
        Math.min(
          Math.abs(
            histogram,
          ),
          1,
        ),
    };
  }

  if (
    macdLine <
      signalLine &&
    histogram < 0
  ) {
    return {
      direction: "BEARISH",

      momentumStrength:
        Math.min(
          Math.abs(
            histogram,
          ),
          1,
        ),
    };
  }

  return {
    direction: "NEUTRAL",

    momentumStrength: 0,
  };
}

/**
 * ============================================================
 * TECHNICAL BIAS
 * ============================================================
 */

function determineTechnicalBias({
  trend,
  rsi,
  macd,
  price,
  vwap,
  volume,
}) {
  let bullish = 0;
  let bearish = 0;

  /**
   * Trend has the greatest importance.
   */
  if (
    trend.direction ===
      "STRONG_BULLISH"
  ) {
    bullish += 3;
  } else if (
    trend.direction ===
      "BULLISH"
  ) {
    bullish += 2;
  } else if (
    trend.direction ===
      "STRONG_BEARISH"
  ) {
    bearish += 3;
  } else if (
    trend.direction ===
      "BEARISH"
  ) {
    bearish += 2;
  }

  /**
   * RSI support.
   */
  bullish +=
    rsi.bullishScore;

  bearish +=
    rsi.bearishScore;

  /**
   * MACD.
   */
  if (
    macd.direction ===
    "BULLISH"
  ) {
    bullish += 1.5;
  }

  if (
    macd.direction ===
    "BEARISH"
  ) {
    bearish += 1.5;
  }

  /**
   * VWAP.
   */
  if (
    isPositiveNumber(vwap)
  ) {
    if (
      Number(price) >
      Number(vwap)
    ) {
      bullish += 1;
    } else if (
      Number(price) <
      Number(vwap)
    ) {
      bearish += 1;
    }
  }

  /**
   * Volume confirmation strengthens
   * whichever direction is winning.
   */
  if (
    volume.confirmation
  ) {
    if (
      bullish > bearish
    ) {
      bullish += 0.5;
    } else if (
      bearish > bullish
    ) {
      bearish += 0.5;
    }
  }

  const difference =
    bullish -
    bearish;

  if (difference >= 2) {
    return {
      direction: "LONG",
      bullishPoints:
        round(bullish, 2),
      bearishPoints:
        round(bearish, 2),
    };
  }

  if (difference <= -2) {
    return {
      direction: "SHORT",
      bullishPoints:
        round(bullish, 2),
      bearishPoints:
        round(bearish, 2),
    };
  }

  return {
    direction: "NEUTRAL",
    bullishPoints:
      round(bullish, 2),
    bearishPoints:
      round(bearish, 2),
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeTechnicalIndicators({
  candles,
}) {
  const validation =
    validateCandles(candles);

  if (!validation.approved) {
    return {
      approved: false,

      errors:
        validation.errors,
    };
  }

  const closes =
    candles.map(
      (candle) =>
        Number(
          candle.close,
        ),
    );

  const highs =
    candles.map(
      (candle) =>
        Number(
          candle.high,
        ),
    );

  const lows =
    candles.map(
      (candle) =>
        Number(
          candle.low,
        ),
    );

  const latest =
    getLast(candles);

  const currentPrice =
    Number(
      latest.close,
    );

  /**
   * ========================================================
   * EMA
   * ========================================================
   */

  const ema9 =
    getLast(
      EMA.calculate({
        period: 9,
        values: closes,
      }),
    );

  const ema20 =
    getLast(
      EMA.calculate({
        period: 20,
        values: closes,
      }),
    );

  const ema50 =
    getLast(
      EMA.calculate({
        period: 50,
        values: closes,
      }),
    );

  /**
   * ========================================================
   * SMA 200
   * ========================================================
   */

  const sma200 =
    getLast(
      SMA.calculate({
        period: 200,
        values: closes,
      }),
    );

  /**
   * ========================================================
   * RSI
   * ========================================================
   */

  const rsiValue =
    getLast(
      RSI.calculate({
        period: 14,
        values: closes,
      }),
    );

  const rsi =
    analyzeRSI(
      rsiValue,
    );

  /**
   * ========================================================
   * MACD
   * ========================================================
   */

  const macdValue =
    getLast(
      MACD.calculate({
        values:
          closes,

        fastPeriod: 12,

        slowPeriod: 26,

        signalPeriod: 9,

        SimpleMAOscillator:
          false,

        SimpleMASignal:
          false,
      }),
    );

  const macd =
    analyzeMACD(
      macdValue,
    );

  /**
   * ========================================================
   * ATR
   * ========================================================
   */

  const atrValue =
    getLast(
      ATR.calculate({
        period: 14,

        high:
          highs,

        low:
          lows,

        close:
          closes,
      }),
    );

  const atrPercent =
    isPositiveNumber(
      atrValue,
    )
      ? Number(atrValue) /
        currentPrice
      : null;

  /**
   * ========================================================
   * VWAP
   * ========================================================
   */

  const vwap =
    calculateVWAP(
      candles,
    );

  /**
   * ========================================================
   * VOLUME
   * ========================================================
   */

  const volume =
    calculateVolumeAnalysis(
      candles,
      20,
    );

  /**
   * ========================================================
   * TREND
   * ========================================================
   */

  const trend =
    determineTrend({
      price:
        currentPrice,

      ema9:
        Number(ema9),

      ema20:
        Number(ema20),

      ema50:
        Number(ema50),

      sma200:
        Number(sma200),
    });

  /**
   * ========================================================
   * TECHNICAL BIAS
   * ========================================================
   */

  const bias =
    determineTechnicalBias({
      trend,

      rsi,

      macd,

      price:
        currentPrice,

      vwap,

      volume,
    });

  return {
    approved: true,

    price:
      round(
        currentPrice,
      ),

    indicators: {
      ema: {
        ema9:
          round(
            ema9,
          ),

        ema20:
          round(
            ema20,
          ),

        ema50:
          round(
            ema50,
          ),
      },

      sma: {
        sma200:
          round(
            sma200,
          ),
      },

      rsi,

      macd: {
        raw:
          macdValue
            ? {
                macd:
                  round(
                    macdValue.MACD,
                  ),

                signal:
                  round(
                    macdValue.signal,
                  ),

                histogram:
                  round(
                    macdValue.histogram,
                  ),
              }
            : null,

        analysis:
          macd,
      },

      atr: {
        value:
          round(
            atrValue,
          ),

        percent:
          round(
            atrPercent,
            6,
          ),
      },

      vwap,

      volume,
    },

    trend,

    bias,

    confirmation: {
      bullishTrend:
        trend.direction ===
          "BULLISH" ||
        trend.direction ===
          "STRONG_BULLISH",

      bearishTrend:
        trend.direction ===
          "BEARISH" ||
        trend.direction ===
          "STRONG_BEARISH",

      bullishMomentum:
        macd.direction ===
          "BULLISH",

      bearishMomentum:
        macd.direction ===
          "BEARISH",

      volume:
        volume.confirmation,

      aboveVWAP:
        isPositiveNumber(vwap)
          ? currentPrice >
            vwap
          : null,

      belowVWAP:
        isPositiveNumber(vwap)
          ? currentPrice <
            vwap
          : null,
    },

    errors: [],
  };
}

export default analyzeTechnicalIndicators;