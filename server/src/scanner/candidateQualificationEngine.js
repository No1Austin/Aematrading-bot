import MARKET_SCANNER_CONFIG, {
  SCANNER_DIRECTION,
  SCANNER_STATUS,
} from "./marketScannerConfig.js";

/**
 * ============================================================
 * CANDIDATE QUALIFICATION ENGINE
 * ============================================================
 *
 * Separates hard research eligibility from scanner conviction.
 * A stock may be eligible for deeper research without already
 * reaching the cheap scanner's high-conviction threshold.
 */

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeSymbol(symbol) {
  return String(symbol ?? "").trim().toUpperCase();
}

function normalizeRegime(regime) {
  const value = String(regime ?? "").trim().toUpperCase();

  if (["BULLISH", "BULL", "RISK_ON"].includes(value)) {
    return "BULLISH";
  }

  if (["BEARISH", "BEAR", "RISK_OFF"].includes(value)) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

function percentageScore(value, threshold, maximumPoints) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(threshold) ||
    threshold <= 0
  ) {
    return 0;
  }

  return clamp(
    (Math.abs(value) / threshold) * maximumPoints,
    0,
    maximumPoints,
  );
}

/** ==========================================================
 * HARD ELIGIBILITY GATES
 * =========================================================== */
function evaluateHardGates(input, config) {
  const rejectionReasons = [];

  const price = positive(input.price);
  const averageDailyVolume = finite(input.averageDailyVolume);
  const dollarVolume = finite(input.dollarVolume);
  const spreadPercent = finite(input.spreadPercent);

  if (config.requireTradable && input.tradable !== true) {
    rejectionReasons.push("NOT_TRADABLE");
  }

  if (price === null) {
    rejectionReasons.push("INVALID_PRICE");
  } else if (price < config.minimumPrice) {
    rejectionReasons.push("PRICE_BELOW_MINIMUM");
  }

  if (
    averageDailyVolume === null ||
    averageDailyVolume < config.minimumAverageDailyVolume
  ) {
    rejectionReasons.push("INSUFFICIENT_AVERAGE_VOLUME");
  }

  if (
    dollarVolume === null ||
    dollarVolume < config.minimumDollarVolume
  ) {
    rejectionReasons.push("INSUFFICIENT_DOLLAR_VOLUME");
  }

  if (
    spreadPercent !== null &&
    spreadPercent > config.maximumSpreadPercent
  ) {
    rejectionReasons.push("SPREAD_TOO_WIDE");
  }

  return rejectionReasons;
}

function scoreLiquidity(input, config) {
  const maximum = config.weights.tradabilityLiquidity;

  if (input.tradable !== true) {
    return 0;
  }

  const averageVolume = finite(input.averageDailyVolume) ?? 0;
  const dollarVolume = finite(input.dollarVolume) ?? 0;
  const spread = finite(input.spreadPercent);

  let score = maximum * 0.3;

  if (averageVolume >= config.minimumAverageDailyVolume) {
    score += maximum * 0.25;
  }

  if (dollarVolume >= config.minimumDollarVolume) {
    score += maximum * 0.25;
  }

  if (spread !== null && spread <= config.maximumSpreadPercent) {
    const spreadQuality =
      1 - clamp(spread / config.maximumSpreadPercent, 0, 1);

    score += maximum * 0.2 * (0.5 + spreadQuality * 0.5);
  }

  return clamp(score, 0, maximum);
}

function scoreVolume(input, config) {
  const maximum = config.weights.volume;
  const relativeVolume = finite(input.relativeVolume);

  if (relativeVolume === null || relativeVolume <= 0) {
    return 0;
  }

  const thresholds = config.relativeVolume;

  if (relativeVolume >= thresholds.exceptional) return maximum;
  if (relativeVolume >= thresholds.strong) return maximum * 0.85;
  if (relativeVolume >= thresholds.minimumInteresting) {
    return maximum * 0.65;
  }

  return clamp(
    (relativeVolume / thresholds.minimumInteresting) * maximum * 0.5,
    0,
    maximum * 0.5,
  );
}

function scoreDirectionalMomentum(input, direction, config) {
  const maximum = config.weights.momentum;
  const sign = direction === SCANNER_DIRECTION.LONG ? 1 : -1;

  const five = (finite(input.change5mPercent) ?? 0) * sign;
  const fifteen = (finite(input.change15mPercent) ?? 0) * sign;
  const sixty = (finite(input.change60mPercent) ?? 0) * sign;
  const thresholds = config.momentum;

  let score = 0;

  if (five > 0) {
    score += percentageScore(
      five,
      thresholds.fiveMinuteStrong,
      maximum * 0.25,
    );
  }

  if (fifteen > 0) {
    score += percentageScore(
      fifteen,
      thresholds.fifteenMinuteStrong,
      maximum * 0.35,
    );
  }

  if (sixty > 0) {
    score += percentageScore(
      sixty,
      thresholds.sixtyMinuteStrong,
      maximum * 0.4,
    );
  }

  return clamp(score, 0, maximum);
}

function scoreVolatility(input, config) {
  const maximum = config.weights.volatility;
  const atr = finite(input.atrPercent);
  const range = finite(input.intradayRangePercent);

  if (atr === null && range === null) return 0;

  const thresholds = config.volatility;

  if (
    (atr !== null && atr > thresholds.maximumAtrPercent) ||
    (range !== null && range > thresholds.maximumRangePercent)
  ) {
    return 0;
  }

  let score = 0;

  if (atr !== null && atr >= thresholds.minimumAtrPercent) {
    score += percentageScore(
      atr,
      thresholds.preferredAtrPercent,
      maximum * 0.6,
    );
  }

  if (range !== null && range >= thresholds.minimumRangePercent) {
    score += maximum * 0.4;
  }

  return clamp(score, 0, maximum);
}

function scoreTrend(input, direction, config) {
  const maximum = config.weights.trend;
  const price = positive(input.price);
  const vwap = positive(input.vwap);
  const ema20 = positive(input.ema20);
  const ema50 = positive(input.ema50);

  if (price === null) return 0;

  let score = 0;

  if (direction === SCANNER_DIRECTION.LONG) {
    if (vwap !== null && price > vwap) score += maximum * 0.35;
    if (ema20 !== null && price > ema20) score += maximum * 0.25;
    if (ema20 !== null && ema50 !== null && ema20 > ema50) {
      score += maximum * 0.4;
    }
  } else {
    if (vwap !== null && price < vwap) score += maximum * 0.35;
    if (ema20 !== null && price < ema20) score += maximum * 0.25;
    if (ema20 !== null && ema50 !== null && ema20 < ema50) {
      score += maximum * 0.4;
    }
  }

  return clamp(score, 0, maximum);
}

function scorePriceAction(input, direction, config) {
  const maximum = config.weights.priceAction;
  const price = positive(input.price);
  const recentHigh = positive(input.recentHigh);
  const recentLow = positive(input.recentLow);
  const relativeVolume = finite(input.relativeVolume) ?? 0;

  if (price === null) return 0;

  let score = 0;

  if (direction === SCANNER_DIRECTION.LONG) {
    if (recentHigh !== null && price > recentHigh) {
      score += maximum * 0.65;
      if (relativeVolume >= config.relativeVolume.strong) {
        score += maximum * 0.35;
      }
    }
  } else if (recentLow !== null && price < recentLow) {
    score += maximum * 0.65;
    if (relativeVolume >= config.relativeVolume.strong) {
      score += maximum * 0.35;
    }
  }

  return clamp(score, 0, maximum);
}

function scoreMarketRegime(input, direction, config) {
  const maximum = config.weights.marketRegime;
  const regime = normalizeRegime(input.marketRegime);

  if (regime === "NEUTRAL") return maximum * 0.5;

  if (
    direction === SCANNER_DIRECTION.LONG &&
    regime === "BULLISH"
  ) {
    return maximum;
  }

  if (
    direction === SCANNER_DIRECTION.SHORT &&
    regime === "BEARISH"
  ) {
    return maximum;
  }

  return maximum * 0.15;
}

function calculateDirection(input, direction, config) {
  const scores = {
    tradabilityLiquidity: scoreLiquidity(input, config),
    volume: scoreVolume(input, config),
    momentum: scoreDirectionalMomentum(input, direction, config),
    volatility: scoreVolatility(input, config),
    trend: scoreTrend(input, direction, config),
    priceAction: scorePriceAction(input, direction, config),
    marketRegime: scoreMarketRegime(input, direction, config),
  };

  const rawScore = Object.values(scores).reduce(
    (total, score) => total + score,
    0,
  );

  return {
    direction,
    score:
      Math.round(clamp(rawScore, 0, 100) * 100) / 100,
    scores: Object.fromEntries(
      Object.entries(scores).map(([key, value]) => [
        key,
        Math.round(value * 100) / 100,
      ]),
    ),
  };
}

function buildReasons(
  input,
  preferredDirection,
  directionResult,
  config,
) {
  const reasons = [];
  const relativeVolume = finite(input.relativeVolume);

  if (
    relativeVolume !== null &&
    relativeVolume >= config.relativeVolume.strong
  ) {
    reasons.push("Strong relative volume");
  }

  if (
    directionResult.scores.momentum >=
    config.weights.momentum * 0.65
  ) {
    reasons.push(
      preferredDirection === SCANNER_DIRECTION.LONG
        ? "Strong positive multi-timeframe momentum"
        : "Strong negative multi-timeframe momentum",
    );
  }

  if (
    directionResult.scores.trend >=
    config.weights.trend * 0.65
  ) {
    reasons.push(
      preferredDirection === SCANNER_DIRECTION.LONG
        ? "Bullish trend structure"
        : "Bearish trend structure",
    );
  }

  if (directionResult.scores.priceAction > 0) {
    reasons.push(
      preferredDirection === SCANNER_DIRECTION.LONG
        ? "Bullish breakout price action"
        : "Bearish breakdown price action",
    );
  }

  if (
    directionResult.scores.volatility >=
    config.weights.volatility * 0.6
  ) {
    reasons.push("Actionable volatility");
  }

  return reasons;
}

/** ==========================================================
 * MAIN QUALIFICATION ENGINE
 * =========================================================== */
export function qualifyScannerCandidate(
  input = {},
  config = MARKET_SCANNER_CONFIG,
) {
  const symbol = normalizeSymbol(input.symbol);

  if (!symbol) {
    return {
      symbol: null,
      eligible: false,
      qualified: false,
      discoveryStatus: "REJECTED",
      status: SCANNER_STATUS.REJECTED,
      preferredDirection: SCANNER_DIRECTION.NEUTRAL,
      scannerScore: 0,
      longScannerScore: 0,
      shortScannerScore: 0,
      directionEdge: 0,
      longScores: {},
      shortScores: {},
      reasons: [],
      rejectionReasons: ["SYMBOL_REQUIRED"],
      qualificationReasons: [],
      measurements: {},
      qualifiedAt: null,
    };
  }

  const rejectionReasons = evaluateHardGates(input, config);
  const eligible = rejectionReasons.length === 0;

  const longResult = calculateDirection(
    input,
    SCANNER_DIRECTION.LONG,
    config,
  );

  const shortResult = calculateDirection(
    input,
    SCANNER_DIRECTION.SHORT,
    config,
  );

  const longScore = longResult.score;
  const shortScore = shortResult.score;
  const directionEdge = Math.abs(longScore - shortScore);

  let preferredDirection = SCANNER_DIRECTION.NEUTRAL;

  if (longScore > shortScore) {
    preferredDirection = SCANNER_DIRECTION.LONG;
  } else if (shortScore > longScore) {
    preferredDirection = SCANNER_DIRECTION.SHORT;
  }

  const scannerScore = Math.max(longScore, shortScore);
  const qualificationReasons = [];

  if (
    preferredDirection === SCANNER_DIRECTION.SHORT &&
    input.shortable !== true
  ) {
    qualificationReasons.push("SHORT_DIRECTION_NOT_SHORTABLE");
  }

  if (directionEdge < config.minimumDirectionEdge) {
    qualificationReasons.push("INSUFFICIENT_DIRECTION_EDGE");
  }

  if (scannerScore < config.minimumScannerScore) {
    qualificationReasons.push("SCANNER_SCORE_BELOW_THRESHOLD");
  }

  const qualified =
    eligible &&
    qualificationReasons.length === 0;

  const preferredResult =
    preferredDirection === SCANNER_DIRECTION.LONG
      ? longResult
      : shortResult;

  return {
    symbol,
    eligible,
    qualified,
    discoveryStatus: eligible
      ? qualified
        ? "HIGH_CONVICTION"
        : "RESEARCHABLE"
      : "REJECTED",

    // Legacy field preserved for compatibility.
    status: qualified
      ? SCANNER_STATUS.QUALIFIED
      : SCANNER_STATUS.REJECTED,

    preferredDirection,
    scannerScore,
    longScannerScore: longScore,
    shortScannerScore: shortScore,
    directionEdge:
      Math.round(directionEdge * 100) / 100,
    longScores: longResult.scores,
    shortScores: shortResult.scores,
    reasons: eligible
      ? buildReasons(
          input,
          preferredDirection,
          preferredResult,
          config,
        )
      : [],
    rejectionReasons: [...new Set(rejectionReasons)],
    qualificationReasons: [...new Set(qualificationReasons)],
    shortable: input.shortable === true,
    measurements: {
      price: finite(input.price),
      averageDailyVolume: finite(input.averageDailyVolume),
      dollarVolume: finite(input.dollarVolume),
      spreadPercent: finite(input.spreadPercent),
      relativeVolume: finite(input.relativeVolume),
      change5mPercent: finite(input.change5mPercent),
      change15mPercent: finite(input.change15mPercent),
      change60mPercent: finite(input.change60mPercent),
      atrPercent: finite(input.atrPercent),
      intradayRangePercent: finite(input.intradayRangePercent),
      marketRegime: normalizeRegime(input.marketRegime),
    },
    qualifiedAt: qualified
      ? new Date().toISOString()
      : null,
  };
}

export default qualifyScannerCandidate;
