/**
 * AEMA Private Futures Research Bot
 * Market Structure Engine
 *
 * Converts normalized OHLCV candles into structural evidence
 * used by setup strategies.
 *
 * Research only.
 * No position sizing.
 * No leverage selection.
 * No execution authority.
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

function percentChange(from, to) {
  const a = positiveOrNull(from);
  const b = positiveOrNull(to);

  if (a === null || b === null) {
    return null;
  }

  return ((b - a) / a) * 100;
}

function normalizeCandles(candles = []) {
  return (Array.isArray(candles) ? candles : [])
    .map((candle) => ({
      openTime:
        finiteOrNull(candle?.openTime),

      open:
        positiveOrNull(candle?.open),

      high:
        positiveOrNull(candle?.high),

      low:
        positiveOrNull(candle?.low),

      close:
        positiveOrNull(candle?.close),

      volume:
        finiteOrNull(candle?.volume),

      turnover:
        finiteOrNull(candle?.turnover),
    }))
    .filter(
      (candle) =>
        candle.openTime !== null &&
        candle.open !== null &&
        candle.high !== null &&
        candle.low !== null &&
        candle.close !== null &&
        candle.high >= candle.low
    )
    .sort(
      (a, b) =>
        a.openTime - b.openTime
    );
}

/*
 * ---------------------------------------------------------
 * ATR
 * ---------------------------------------------------------
 */

function calculateATR(
  candles,
  period = 14
) {
  if (
    !Array.isArray(candles) ||
    candles.length < period + 1
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

    const tr =
      Math.max(
        current.high - current.low,

        Math.abs(
          current.high -
            previous.close
        ),

        Math.abs(
          current.low -
            previous.close
        )
      );

    trueRanges.push(tr);
  }

  const recent =
    trueRanges.slice(-period);

  if (recent.length !== period) {
    return null;
  }

  return (
    recent.reduce(
      (sum, value) =>
        sum + value,
      0
    ) / period
  );
}

/*
 * ---------------------------------------------------------
 * SWING DETECTION
 * ---------------------------------------------------------
 *
 * A swing must be surrounded by lower highs
 * or higher lows.
 */

function detectSwings(
  candles,
  radius = 2
) {
  const swingHighs = [];
  const swingLows = [];

  for (
    let i = radius;
    i < candles.length - radius;
    i += 1
  ) {
    const current =
      candles[i];

    let isSwingHigh = true;
    let isSwingLow = true;

    for (
      let offset = 1;
      offset <= radius;
      offset += 1
    ) {
      const left =
        candles[i - offset];

      const right =
        candles[i + offset];

      if (
        current.high <= left.high ||
        current.high <= right.high
      ) {
        isSwingHigh = false;
      }

      if (
        current.low >= left.low ||
        current.low >= right.low
      ) {
        isSwingLow = false;
      }
    }

    if (isSwingHigh) {
      swingHighs.push({
        index: i,

        openTime:
          current.openTime,

        price:
          current.high,
      });
    }

    if (isSwingLow) {
      swingLows.push({
        index: i,

        openTime:
          current.openTime,

        price:
          current.low,
      });
    }
  }

  return {
    swingHighs,
    swingLows,
  };
}

/*
 * ---------------------------------------------------------
 * STRUCTURE CLASSIFICATION
 * ---------------------------------------------------------
 */

function classifyStructure(
  swingHighs,
  swingLows
) {
  const latestHigh =
    swingHighs.at(-1) ??
    null;

  const previousHigh =
    swingHighs.at(-2) ??
    null;

  const latestLow =
    swingLows.at(-1) ??
    null;

  const previousLow =
    swingLows.at(-2) ??
    null;

  let highStructure =
    "UNKNOWN";

  let lowStructure =
    "UNKNOWN";

  if (
    latestHigh &&
    previousHigh
  ) {
    if (
      latestHigh.price >
      previousHigh.price
    ) {
      highStructure =
        "HIGHER_HIGH";
    } else if (
      latestHigh.price <
      previousHigh.price
    ) {
      highStructure =
        "LOWER_HIGH";
    } else {
      highStructure =
        "EQUAL_HIGH";
    }
  }

  if (
    latestLow &&
    previousLow
  ) {
    if (
      latestLow.price >
      previousLow.price
    ) {
      lowStructure =
        "HIGHER_LOW";
    } else if (
      latestLow.price <
      previousLow.price
    ) {
      lowStructure =
        "LOWER_LOW";
    } else {
      lowStructure =
        "EQUAL_LOW";
    }
  }

  let pattern =
    "UNDEFINED";

  let trend =
    "NEUTRAL";

  if (
    highStructure ===
      "HIGHER_HIGH" &&
    lowStructure ===
      "HIGHER_LOW"
  ) {
    pattern =
      "HH_HL";

    trend =
      "BULLISH";
  }

  if (
    highStructure ===
      "LOWER_HIGH" &&
    lowStructure ===
      "LOWER_LOW"
  ) {
    pattern =
      "LH_LL";

    trend =
      "BEARISH";
  }

  if (
    (
      highStructure ===
        "LOWER_HIGH" &&
      lowStructure ===
        "HIGHER_LOW"
    ) ||
    (
      highStructure ===
        "EQUAL_HIGH" &&
      lowStructure ===
        "HIGHER_LOW"
    ) ||
    (
      highStructure ===
        "LOWER_HIGH" &&
      lowStructure ===
        "EQUAL_LOW"
    )
  ) {
    pattern =
      "COMPRESSION";

    trend =
      "NEUTRAL";
  }

  return {
    trend,
    pattern,

    highStructure,
    lowStructure,

    latestHigh,
    previousHigh,

    latestLow,
    previousLow,
  };
}

/*
 * ---------------------------------------------------------
 * VOLATILITY
 * ---------------------------------------------------------
 */

function classifyVolatility(
  candles,
  atr
) {
  if (
    atr === null ||
    candles.length < 20
  ) {
    return {
      regime:
        "UNKNOWN",

      atrPercent:
        null,

      recentRangeRatio:
        null,
    };
  }

  const current =
    candles.at(-1);

  const atrPercent =
    current.close > 0
      ? (atr / current.close) *
        100
      : null;

  const recent =
    candles.slice(-5);

  const prior =
    candles.slice(-20, -5);

  const averageRange = (
    rows
  ) => {
    if (!rows.length) {
      return null;
    }

    return (
      rows.reduce(
        (sum, candle) =>
          sum +
          (candle.high -
            candle.low),
        0
      ) / rows.length
    );
  };

  const recentRange =
    averageRange(recent);

  const priorRange =
    averageRange(prior);

  const ratio =
    recentRange !== null &&
    priorRange !== null &&
    priorRange > 0
      ? recentRange /
        priorRange
      : null;

  let regime =
    "NORMAL";

  if (
    ratio !== null &&
    ratio <= 0.7
  ) {
    regime =
      "COMPRESSED";
  }

  if (
    ratio !== null &&
    ratio >= 1.35
  ) {
    regime =
      "EXPANDING";
  }

  if (
    ratio !== null &&
    ratio >= 2
  ) {
    regime =
      "EXTREME";
  }

  return {
    regime,

    atrPercent,

    recentRangeRatio:
      ratio,
  };
}

/*
 * ---------------------------------------------------------
 * RANGE
 * ---------------------------------------------------------
 */

function detectRange(
  candles,
  lookback = 20
) {
  const rows =
    candles.slice(-lookback);

  if (!rows.length) {
    return {
      high: null,
      low: null,
      midpoint: null,
      widthPercent: null,
    };
  }

  const high =
    Math.max(
      ...rows.map(
        (candle) =>
          candle.high
      )
    );

  const low =
    Math.min(
      ...rows.map(
        (candle) =>
          candle.low
      )
    );

  const midpoint =
    (high + low) / 2;

  const widthPercent =
    midpoint > 0
      ? ((high - low) /
          midpoint) *
        100
      : null;

  return {
    high,
    low,
    midpoint,
    widthPercent,
  };
}

/*
 * ---------------------------------------------------------
 * BREAKOUT DETECTION
 * ---------------------------------------------------------
 */

function detectBreakout(
  candles,
  atr
) {
  if (
    candles.length < 12
  ) {
    return {
      detected: false,
      direction: null,
      level: null,
      displacementAtr: null,
    };
  }

  const current =
    candles.at(-1);

  /*
   * Exclude the latest candle when defining
   * the level it may have broken.
   */
  const previous =
    candles.slice(-11, -1);

  const previousHigh =
    Math.max(
      ...previous.map(
        (candle) =>
          candle.high
      )
    );

  const previousLow =
    Math.min(
      ...previous.map(
        (candle) =>
          candle.low
      )
    );

  const body =
    Math.abs(
      current.close -
      current.open
    );

  const displacementAtr =
    atr !== null &&
    atr > 0
      ? body / atr
      : null;

  if (
    current.close >
    previousHigh
  ) {
    return {
      detected: true,

      direction:
        "BULL",

      level:
        previousHigh,

      displacementAtr,
    };
  }

  if (
    current.close <
    previousLow
  ) {
    return {
      detected: true,

      direction:
        "BEAR",

      level:
        previousLow,

      displacementAtr,
    };
  }

  return {
    detected: false,

    direction: null,

    level: null,

    displacementAtr,
  };
}

/*
 * ---------------------------------------------------------
 * LIQUIDITY SWEEP
 * ---------------------------------------------------------
 */

function detectLiquiditySweep(
  candles
) {
  if (
    candles.length < 12
  ) {
    return {
      detected: false,
      direction: null,
      level: null,
      extreme: null,
      reclaimed: false,
    };
  }

  const current =
    candles.at(-1);

  const previous =
    candles.slice(-11, -1);

  const previousHigh =
    Math.max(
      ...previous.map(
        (candle) =>
          candle.high
      )
    );

  const previousLow =
    Math.min(
      ...previous.map(
        (candle) =>
          candle.low
      )
    );

  /*
   * Sell-side liquidity swept:
   * price traded below previous range,
   * but closed back above it.
   *
   * This is potentially bullish.
   */
  if (
    current.low <
      previousLow &&
    current.close >
      previousLow
  ) {
    return {
      detected: true,

      direction:
        "BULL",

      level:
        previousLow,

      extreme:
        current.low,

      reclaimed:
        true,
    };
  }

  /*
   * Buy-side liquidity swept:
   * price traded above previous range,
   * but closed back below it.
   *
   * This is potentially bearish.
   */
  if (
    current.high >
      previousHigh &&
    current.close <
      previousHigh
  ) {
    return {
      detected: true,

      direction:
        "BEAR",

      level:
        previousHigh,

      extreme:
        current.high,

      reclaimed:
        true,
    };
  }

  return {
    detected: false,

    direction: null,

    level: null,

    extreme: null,

    reclaimed: false,
  };
}

/*
 * ---------------------------------------------------------
 * VOLUME CONTEXT
 * ---------------------------------------------------------
 */

function analyzeVolume(
  candles
) {
  const rows =
    candles.filter(
      (candle) =>
        finiteOrNull(
          candle.volume
        ) !== null
    );

  if (rows.length < 10) {
    return {
      available: false,

      ratio:
        null,

      state:
        "UNKNOWN",
    };
  }

  const current =
    finiteOrNull(
      rows.at(-1)?.volume
    );

  const baselineRows =
    rows.slice(-11, -1);

  if (
    current === null ||
    !baselineRows.length
  ) {
    return {
      available: false,
      ratio: null,
      state: "UNKNOWN",
    };
  }

  const average =
    baselineRows.reduce(
      (sum, candle) =>
        sum +
        Number(candle.volume),
      0
    ) /
    baselineRows.length;

  if (!(average > 0)) {
    return {
      available: false,
      ratio: null,
      state: "UNKNOWN",
    };
  }

  const ratio =
    current / average;

  let state =
    "NORMAL";

  if (ratio >= 1.5) {
    state =
      "EXPANDED";
  } else if (
    ratio <= 0.7
  ) {
    state =
      "CONTRACTED";
  }

  return {
    available: true,

    ratio,

    state,
  };
}

/*
 * ---------------------------------------------------------
 * MAIN ENGINE
 * ---------------------------------------------------------
 */

export function analyzeBotMarketStructure(
  market,
  options = {}
) {
  const candles =
    normalizeCandles(
      market?.candles
    );

  const minimumCandles =
    Number(
      options.minimumCandles ??
      30
    );

  if (
    candles.length <
    minimumCandles
  ) {
    return {
      approved: false,

      status:
        "INSUFFICIENT_STRUCTURE_DATA",

      candleCount:
        candles.length,

      blockers: [
        "INSUFFICIENT_CANDLES",
      ],

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  const atrPeriod =
    Number(
      options.atrPeriod ??
      14
    );

  const swingRadius =
    Number(
      options.swingRadius ??
      2
    );

  const rangeLookback =
    Number(
      options.rangeLookback ??
      20
    );

  const atr =
    calculateATR(
      candles,
      atrPeriod
    );

  const swings =
    detectSwings(
      candles,
      swingRadius
    );

  const structure =
    classifyStructure(
      swings.swingHighs,
      swings.swingLows
    );

  const volatility =
    classifyVolatility(
      candles,
      atr
    );

  const range =
    detectRange(
      candles,
      rangeLookback
    );

  const breakout =
    detectBreakout(
      candles,
      atr
    );

  const liquiditySweep =
    detectLiquiditySweep(
      candles
    );

  const volume =
    analyzeVolume(
      candles
    );

  const current =
    candles.at(-1);

  const blockers = [];

  if (atr === null) {
    blockers.push(
      "STRUCTURE_ATR_UNAVAILABLE"
    );
  }

  if (
    swings.swingHighs.length <
      2 ||
    swings.swingLows.length <
      2
  ) {
    blockers.push(
      "INSUFFICIENT_CONFIRMED_SWINGS"
    );
  }

  return {
    approved:
      blockers.length === 0,

    status:
      blockers.length === 0
        ? "MARKET_STRUCTURE_READY"
        : "MARKET_STRUCTURE_PARTIAL",

    candleCount:
      candles.length,

    current: {
      openTime:
        current.openTime,

      open:
        current.open,

      high:
        current.high,

      low:
        current.low,

      close:
        current.close,

      changePercent:
        percentChange(
          current.open,
          current.close
        ),
    },

    atr,

    trend:
      structure.trend,

    structurePattern:
      structure.pattern,

    highStructure:
      structure.highStructure,

    lowStructure:
      structure.lowStructure,

    swingHighs:
      swings.swingHighs.slice(-10),

    swingLows:
      swings.swingLows.slice(-10),

    latestSwingHigh:
      structure.latestHigh,

    previousSwingHigh:
      structure.previousHigh,

    latestSwingLow:
      structure.latestLow,

    previousSwingLow:
      structure.previousLow,

    range,

    volatility,

    breakout,

    liquiditySweep,

    volume,

    blockers,

    observedAt:
      new Date().toISOString(),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default analyzeBotMarketStructure;