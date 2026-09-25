/**
 * AEMA Crypto — Phase 6.52
 * Futures Execution Market Provider
 *
 * Fetches fresh Binance USD-M futures market evidence for a single
 * CEX-compatible candidate.
 *
 * Responsibilities:
 * - mark/index price
 * - best bid/ask + spread
 * - order-book depth + imbalance + executable slippage estimate
 * - futures OHLCV candles
 * - ATR / ATR%
 * - recent structural high/low + support/resistance
 *
 * IMPORTANT:
 * - evidence only; no trade decision
 * - no order submission
 * - no execution authority
 * - missing evidence remains null / unavailable
 * - no neutral-score substitution
 * - paper/live execution remains disabled here
 */

const BINANCE =
  process.env.BINANCE_FUTURES_BASE_URL ||
  "https://fapi.binance.com";

const DEFAULTS = Object.freeze({
  quoteAssets: ["USDT", "USDC"],
  interval: "5m",
  candleLimit: 100,
  atrPeriod: 14,
  structureLookback: 20,
  depthLimit: 100,
  slippageNotionalUsd: 1000,
  timeoutMs: 12_000,
  maximumObservationAgeMs: 30_000,
  maximumFutureClockSkewMs: 5_000,
  minimumDepthLevelsPerSide: 5,
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function clamp(value, min = 0, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(max, Math.max(min, number));
}

function iso(value = Date.now()) {
  const ms = finite(value);
  return ms === null ? null : new Date(ms).toISOString();
}

async function getJson(
  url,
  {
    timeoutMs = DEFAULTS.timeoutMs,
  } = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    timeoutMs,
  );

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "cache-control": "no-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response
        .text()
        .catch(() => "");

      throw new Error(
        `BINANCE_FUTURES_HTTP_${response.status}: ${body.slice(0, 180)}`,
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function getCandidateSymbol(candidate = {}) {
  return upper(
    candidate?.symbol ??
      candidate?.asset?.symbol ??
      candidate?.measurements?.symbol,
  );
}

function getCandidateType(candidate = {}) {
  return upper(
    candidate?.candidateType ??
      candidate?.marketType ??
      candidate?.asset?.candidateType ??
      candidate?.asset?.marketType,
  );
}

function isCexCompatible(candidate = {}) {
  const type = getCandidateType(candidate);

  return (
    type === "CEX" ||
    type === "CEX_DEX" ||
    candidate?.isCex === true ||
    candidate?.cex === true
  );
}

function candidateContractHints(candidate = {}) {
  const hints = [
    candidate?.binanceSymbol,
    candidate?.measurements?.binanceSymbol,
    candidate?.derivatives?.evidence?.contract,
    candidate?.finalIntelligence?.derivatives?.evidence
      ?.contract,
    candidate?.research?.derivatives?.evidence?.contract,
  ]
    .map(upper)
    .filter(Boolean);

  return [...new Set(hints)];
}

async function resolveBinanceFuturesSymbol(
  candidate,
  {
    quoteAssets = DEFAULTS.quoteAssets,
    timeoutMs = DEFAULTS.timeoutMs,
  } = {},
) {
  if (!isCexCompatible(candidate)) {
    return {
      approved: false,
      symbol: null,
      reason: "CEX_COMPATIBLE_CANDIDATE_REQUIRED",
    };
  }

  const base = getCandidateSymbol(candidate);

  if (!base) {
    return {
      approved: false,
      symbol: null,
      reason: "CANDIDATE_SYMBOL_REQUIRED",
    };
  }

  const explicitHints =
    candidateContractHints(candidate);

  const quoteCandidates = quoteAssets
    .map(upper)
    .filter(Boolean);

  const derivedHints = quoteCandidates.map(
    quote => `${base}${quote}`,
  );

  const candidates = [
    ...explicitHints,
    ...derivedHints,
  ];

  let exchangeInfo;

  try {
    exchangeInfo = await getJson(
      `${BINANCE}/fapi/v1/exchangeInfo`,
      { timeoutMs },
    );
  } catch (error) {
    return {
      approved: false,
      symbol: null,
      reason: "BINANCE_EXCHANGE_INFO_UNAVAILABLE",
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }

  const rows = Array.isArray(exchangeInfo?.symbols)
    ? exchangeInfo.symbols
    : [];

  const bySymbol = new Map();

  for (const row of rows) {
    const symbol = upper(row?.symbol);
    if (symbol) bySymbol.set(symbol, row);
  }

  for (const symbol of candidates) {
    const row = bySymbol.get(symbol);

    if (!row) continue;

    const contractType = upper(row?.contractType);
    const status = upper(row?.status);
    const quoteAsset = upper(row?.quoteAsset);

    const perpetual =
      !contractType ||
      contractType === "PERPETUAL";

    const trading =
      !status ||
      status === "TRADING";

    const allowedQuote =
      quoteCandidates.includes(quoteAsset);

    if (
      perpetual &&
      trading &&
      allowedQuote
    ) {
      return {
        approved: true,
        symbol,
        reason: "BINANCE_FUTURES_SYMBOL_RESOLVED",
        exchangeInfo: {
          baseAsset: upper(row?.baseAsset),
          quoteAsset,
          contractType:
            row?.contractType ?? null,
          status:
            row?.status ?? null,
          pricePrecision:
            finite(row?.pricePrecision),
          quantityPrecision:
            finite(row?.quantityPrecision),
        },
      };
    }
  }

  return {
    approved: false,
    symbol: null,
    reason: "BINANCE_FUTURES_CONTRACT_NOT_FOUND",
  };
}

function normalizePremium(row = {}) {
  return {
    symbol: upper(row?.symbol),
    markPrice: finite(row?.markPrice),
    indexPrice: finite(row?.indexPrice),
    fundingRate: finite(row?.lastFundingRate),
    interestRate: finite(row?.interestRate),
    nextFundingTime: finite(row?.nextFundingTime),
    observedAtMs:
      finite(row?.time) ??
      finite(row?.nextFundingTime) ??
      null,
  };
}

function normalizeBookTicker(row = {}) {
  return {
    symbol: upper(row?.symbol),
    bestBid: finite(row?.bidPrice),
    bidQuantity: finite(row?.bidQty),
    bestAsk: finite(row?.askPrice),
    askQuantity: finite(row?.askQty),
    observedAtMs: finite(row?.time),
  };
}

function normalizeDepthSide(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map(row => {
      if (!Array.isArray(row)) return null;

      const price = finite(row[0]);
      const quantity = finite(row[1]);

      if (
        price === null ||
        quantity === null ||
        price <= 0 ||
        quantity <= 0
      ) {
        return null;
      }

      return {
        price,
        quantity,
        notionalUsd: price * quantity,
      };
    })
    .filter(Boolean);
}

function normalizeDepth(payload = {}) {
  return {
    lastUpdateId:
      finite(payload?.lastUpdateId),
    eventTimeMs:
      finite(payload?.E) ??
      finite(payload?.T) ??
      null,
    bids: normalizeDepthSide(payload?.bids),
    asks: normalizeDepthSide(payload?.asks),
  };
}

function normalizeCandles(rows) {
  if (!Array.isArray(rows)) return [];

  return rows
    .map(row => {
      if (!Array.isArray(row)) return null;

      const openTime = finite(row[0]);
      const open = finite(row[1]);
      const high = finite(row[2]);
      const low = finite(row[3]);
      const close = finite(row[4]);
      const volume = finite(row[5]);
      const closeTime = finite(row[6]);
      const quoteVolume = finite(row[7]);
      const trades = finite(row[8]);

      if (
        openTime === null ||
        open === null ||
        high === null ||
        low === null ||
        close === null ||
        high < low ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0
      ) {
        return null;
      }

      return {
        openTime,
        closeTime,
        open,
        high,
        low,
        close,
        volume,
        quoteVolume,
        trades,
      };
    })
    .filter(Boolean);
}

function calculateSpread({
  bestBid,
  bestAsk,
}) {
  if (
    bestBid === null ||
    bestAsk === null ||
    bestBid <= 0 ||
    bestAsk <= 0 ||
    bestAsk < bestBid
  ) {
    return {
      available: false,
      midpoint: null,
      spreadAbsolute: null,
      spreadPercent: null,
    };
  }

  const midpoint =
    (bestBid + bestAsk) / 2;

  if (midpoint <= 0) {
    return {
      available: false,
      midpoint: null,
      spreadAbsolute: null,
      spreadPercent: null,
    };
  }

  const spreadAbsolute =
    bestAsk - bestBid;

  return {
    available: true,
    midpoint,
    spreadAbsolute,
    spreadPercent:
      (spreadAbsolute / midpoint) * 100,
  };
}

function sumNotional(levels) {
  if (!Array.isArray(levels)) return null;

  const valid = levels
    .map(level => finite(level?.notionalUsd))
    .filter(value => value !== null);

  if (!valid.length) return null;

  return valid.reduce(
    (sum, value) => sum + value,
    0,
  );
}

function estimateMarketSlippage({
  levels,
  side,
  notionalUsd,
}) {
  const requested = finite(notionalUsd);

  if (
    !Array.isArray(levels) ||
    !levels.length ||
    requested === null ||
    requested <= 0
  ) {
    return {
      available: false,
      side,
      requestedNotionalUsd:
        requested,
      filledNotionalUsd: null,
      averagePrice: null,
      referencePrice: null,
      slippagePercent: null,
      completeFill: false,
    };
  }

  const referencePrice =
    finite(levels[0]?.price);

  if (
    referencePrice === null ||
    referencePrice <= 0
  ) {
    return {
      available: false,
      side,
      requestedNotionalUsd: requested,
      filledNotionalUsd: null,
      averagePrice: null,
      referencePrice: null,
      slippagePercent: null,
      completeFill: false,
    };
  }

  let remaining = requested;
  let filledNotional = 0;
  let filledQuantity = 0;

  for (const level of levels) {
    if (remaining <= 0) break;

    const price = finite(level?.price);
    const quantity = finite(level?.quantity);

    if (
      price === null ||
      quantity === null ||
      price <= 0 ||
      quantity <= 0
    ) {
      continue;
    }

    const availableNotional =
      price * quantity;

    const consumedNotional =
      Math.min(
        remaining,
        availableNotional,
      );

    const consumedQuantity =
      consumedNotional / price;

    filledNotional += consumedNotional;
    filledQuantity += consumedQuantity;
    remaining -= consumedNotional;
  }

  const completeFill =
    remaining <= Math.max(0.01, requested * 1e-8);

  if (
    !completeFill ||
    filledQuantity <= 0
  ) {
    return {
      available: false,
      side,
      requestedNotionalUsd: requested,
      filledNotionalUsd:
        filledNotional || null,
      averagePrice: null,
      referencePrice,
      slippagePercent: null,
      completeFill: false,
    };
  }

  const averagePrice =
    filledNotional / filledQuantity;

  const raw =
    side === "BUY"
      ? (averagePrice / referencePrice - 1) * 100
      : (1 - averagePrice / referencePrice) * 100;

  return {
    available: true,
    side,
    requestedNotionalUsd: requested,
    filledNotionalUsd: filledNotional,
    averagePrice,
    referencePrice,
    slippagePercent:
      Math.max(0, raw),
    completeFill: true,
  };
}

function buildDepthEvidence(
  depth,
  {
    slippageNotionalUsd =
      DEFAULTS.slippageNotionalUsd,
    minimumDepthLevelsPerSide =
      DEFAULTS.minimumDepthLevelsPerSide,
  } = {},
) {
  const bids = depth?.bids ?? [];
  const asks = depth?.asks ?? [];

  const bidDepthUsd =
    sumNotional(bids);

  const askDepthUsd =
    sumNotional(asks);

  const totalDepthUsd =
    bidDepthUsd !== null &&
    askDepthUsd !== null
      ? bidDepthUsd + askDepthUsd
      : null;

  const imbalance =
    totalDepthUsd !== null &&
    totalDepthUsd > 0
      ? (bidDepthUsd - askDepthUsd) /
        totalDepthUsd
      : null;

  const buySlippage =
    estimateMarketSlippage({
      levels: asks,
      side: "BUY",
      notionalUsd:
        slippageNotionalUsd,
    });

  const sellSlippage =
    estimateMarketSlippage({
      levels: bids,
      side: "SELL",
      notionalUsd:
        slippageNotionalUsd,
    });

  const structurallyHealthy =
    bids.length >=
      minimumDepthLevelsPerSide &&
    asks.length >=
      minimumDepthLevelsPerSide &&
    finite(bids[0]?.price) !== null &&
    finite(asks[0]?.price) !== null &&
    Number(bids[0].price) <
      Number(asks[0].price);

  /*
   * Execution liquidity score is based on actual visible
   * Binance futures depth for the configured test notional.
   *
   * It is NOT the research liquidity score used elsewhere.
   * Missing depth/slippage evidence produces null.
   */
  let liquidityScore = null;

  if (
    structurallyHealthy &&
    totalDepthUsd !== null &&
    totalDepthUsd > 0 &&
    buySlippage.available &&
    sellSlippage.available
  ) {
    const depthCoverage =
      clamp(
        (
          Math.log10(
            Math.max(
              1,
              totalDepthUsd /
                Math.max(
                  1,
                  slippageNotionalUsd,
                ),
            ),
          ) /
          4
        ) *
          100,
      );

    const worstSlippage =
      Math.max(
        buySlippage.slippagePercent,
        sellSlippage.slippagePercent,
      );

    const slippageQuality =
      clamp(
        100 -
          Math.min(
            100,
            worstSlippage * 500,
          ),
      );

    if (
      depthCoverage !== null &&
      slippageQuality !== null
    ) {
      liquidityScore =
        clamp(
          depthCoverage * 0.55 +
            slippageQuality * 0.45,
        );
    }
  }

  return {
    available:
      structurallyHealthy,
    structurallyHealthy,
    bidLevels: bids.length,
    askLevels: asks.length,
    bidDepthUsd,
    askDepthUsd,
    totalDepthUsd,
    imbalance,
    slippageNotionalUsd,
    buySlippage,
    sellSlippage,
    liquidityScore,
  };
}

function trueRange(current, previousClose) {
  const high = finite(current?.high);
  const low = finite(current?.low);
  const prev = finite(previousClose);

  if (
    high === null ||
    low === null
  ) {
    return null;
  }

  if (prev === null) {
    return high - low;
  }

  return Math.max(
    high - low,
    Math.abs(high - prev),
    Math.abs(low - prev),
  );
}

function calculateAtr(
  candles,
  period = DEFAULTS.atrPeriod,
) {
  const p =
    Math.max(2, Math.floor(Number(period) || 0));

  if (
    !Array.isArray(candles) ||
    candles.length < p + 1
  ) {
    return {
      available: false,
      period: p,
      atr: null,
      atrPercent: null,
      sampleSize:
        Array.isArray(candles)
          ? candles.length
          : 0,
    };
  }

  const completed =
    candles.slice(0, -1);

  if (completed.length < p + 1) {
    return {
      available: false,
      period: p,
      atr: null,
      atrPercent: null,
      sampleSize: completed.length,
    };
  }

  const window =
    completed.slice(-(p + 1));

  const ranges = [];

  for (
    let index = 1;
    index < window.length;
    index += 1
  ) {
    const tr =
      trueRange(
        window[index],
        window[index - 1]?.close,
      );

    if (tr === null) {
      return {
        available: false,
        period: p,
        atr: null,
        atrPercent: null,
        sampleSize: ranges.length,
      };
    }

    ranges.push(tr);
  }

  if (ranges.length !== p) {
    return {
      available: false,
      period: p,
      atr: null,
      atrPercent: null,
      sampleSize: ranges.length,
    };
  }

  const atr =
    ranges.reduce(
      (sum, value) => sum + value,
      0,
    ) / ranges.length;

  const referenceClose =
    finite(
      completed[
        completed.length - 1
      ]?.close,
    );

  const atrPercent =
    referenceClose !== null &&
    referenceClose > 0
      ? (atr / referenceClose) * 100
      : null;

  return {
    available:
      Number.isFinite(atr) &&
      atr > 0 &&
      atrPercent !== null,
    period: p,
    atr:
      Number.isFinite(atr) && atr > 0
        ? atr
        : null,
    atrPercent,
    sampleSize: ranges.length,
  };
}

function calculateStructure(
  candles,
  lookback =
    DEFAULTS.structureLookback,
) {
  const size =
    Math.max(
      5,
      Math.floor(
        Number(lookback) || 0,
      ),
    );

  if (
    !Array.isArray(candles) ||
    candles.length < size + 1
  ) {
    return {
      available: false,
      lookback: size,
      structuralHigh: null,
      structuralLow: null,
      support: null,
      resistance: null,
      referenceClose: null,
    };
  }

  /*
   * Exclude the current potentially-open candle so the
   * structural levels come from completed market evidence.
   */
  const completed =
    candles.slice(0, -1);

  const window =
    completed.slice(-size);

  if (window.length < size) {
    return {
      available: false,
      lookback: size,
      structuralHigh: null,
      structuralLow: null,
      support: null,
      resistance: null,
      referenceClose: null,
    };
  }

  const highs =
    window
      .map(row => finite(row?.high))
      .filter(value => value !== null);

  const lows =
    window
      .map(row => finite(row?.low))
      .filter(value => value !== null);

  const referenceClose =
    finite(
      window[window.length - 1]
        ?.close,
    );

  if (
    highs.length !== size ||
    lows.length !== size ||
    referenceClose === null
  ) {
    return {
      available: false,
      lookback: size,
      structuralHigh: null,
      structuralLow: null,
      support: null,
      resistance: null,
      referenceClose,
    };
  }

  const structuralHigh =
    Math.max(...highs);

  const structuralLow =
    Math.min(...lows);

  const supportCandidates =
    lows.filter(
      value =>
        value <= referenceClose,
    );

  const resistanceCandidates =
    highs.filter(
      value =>
        value >= referenceClose,
    );

  const support =
    supportCandidates.length
      ? Math.max(...supportCandidates)
      : null;

  const resistance =
    resistanceCandidates.length
      ? Math.min(...resistanceCandidates)
      : null;

  return {
    available:
      structuralHigh >
        structuralLow &&
      support !== null &&
      resistance !== null,
    lookback: size,
    structuralHigh,
    structuralLow,
    support,
    resistance,
    referenceClose,
  };
}

function evaluateObservationFreshness({
  observedAtMs,
  nowMs,
  maximumObservationAgeMs,
  maximumFutureClockSkewMs,
}) {
  if (observedAtMs === null) {
    return {
      authorized: false,
      observedAt: null,
      ageMs: null,
      futureSkewMs: null,
      failure:
        "EXECUTION_OBSERVATION_TIMESTAMP_REQUIRED",
    };
  }

  const signedAgeMs =
    nowMs - observedAtMs;

  const futureSkewMs =
    signedAgeMs < 0
      ? Math.abs(signedAgeMs)
      : 0;

  const ageMs =
    Math.max(0, signedAgeMs);

  if (
    futureSkewMs >
    maximumFutureClockSkewMs
  ) {
    return {
      authorized: false,
      observedAt: iso(observedAtMs),
      ageMs,
      futureSkewMs,
      failure:
        "EXECUTION_OBSERVATION_TIMESTAMP_IN_FUTURE",
    };
  }

  if (
    ageMs >
    maximumObservationAgeMs
  ) {
    return {
      authorized: false,
      observedAt: iso(observedAtMs),
      ageMs,
      futureSkewMs,
      failure:
        "EXECUTION_OBSERVATION_STALE",
    };
  }

  return {
    authorized: true,
    observedAt: iso(observedAtMs),
    ageMs,
    futureSkewMs,
    failure: null,
  };
}

function failureResult({
  symbol = null,
  status,
  reason,
  failures = [],
  metadata = {},
}) {
  return {
    approved: false,
    status,
    reason,
    symbol,
    observedAt: null,

    market: {
      symbol,
      markPrice: null,
      indexPrice: null,
      lastPrice: null,
      bestBid: null,
      bestAsk: null,
      midpoint: null,
      spreadAbsolute: null,
      spreadPercent: null,
      atr: null,
      atrPercent: null,
      structuralHigh: null,
      structuralLow: null,
      support: null,
      resistance: null,
    },

    executionContext: {
      spreadPercent: null,
      liquidityScore: null,
      slippageEstimatePercent: null,
      buySlippageEstimatePercent: null,
      sellSlippageEstimatePercent: null,
      venueHealthy: false,
      orderBookHealthy: false,
    },

    setupEvidence: {
      candles: [],
      atr: null,
      atrPercent: null,
      structuralHigh: null,
      structuralLow: null,
      support: null,
      resistance: null,
    },

    evidence: {
      markPriceAvailable: false,
      bookTickerAvailable: false,
      depthAvailable: false,
      candlesAvailable: false,
      atrAvailable: false,
      structureAvailable: false,
      freshnessAuthorized: false,
      failures,
    },

    metadata: {
      provider:
        "BINANCE_USDM_FUTURES",
      evidenceOnly: true,
      executionAuthority: false,
      liveExecution: false,
      ...metadata,
    },

    executionAuthority: false,
    liveExecution: false,
  };
}

export async function getCryptoFuturesExecutionMarket(
  candidate,
  {
    quoteAssets = DEFAULTS.quoteAssets,
    interval = DEFAULTS.interval,
    candleLimit = DEFAULTS.candleLimit,
    atrPeriod = DEFAULTS.atrPeriod,
    structureLookback =
      DEFAULTS.structureLookback,
    depthLimit = DEFAULTS.depthLimit,
    slippageNotionalUsd =
      DEFAULTS.slippageNotionalUsd,
    timeoutMs = DEFAULTS.timeoutMs,
    maximumObservationAgeMs =
      DEFAULTS.maximumObservationAgeMs,
    maximumFutureClockSkewMs =
      DEFAULTS.maximumFutureClockSkewMs,
    minimumDepthLevelsPerSide =
      DEFAULTS.minimumDepthLevelsPerSide,
    nowMs = Date.now(),
  } = {},
) {
  const resolved =
    await resolveBinanceFuturesSymbol(
      candidate,
      {
        quoteAssets,
        timeoutMs,
      },
    );

  if (!resolved.approved) {
    return failureResult({
      status: "SYMBOL_UNAVAILABLE",
      reason: resolved.reason,
      failures: [
        {
          code: resolved.reason,
          detail:
            resolved.error ?? null,
        },
      ],
    });
  }

  const symbol = resolved.symbol;
  const encodedSymbol =
    encodeURIComponent(symbol);
  const encodedInterval =
    encodeURIComponent(interval);

  const safeCandleLimit =
    Math.max(
      atrPeriod + 2,
      structureLookback + 2,
      Math.min(
        500,
        Math.max(
          20,
          Math.floor(
            Number(candleLimit) ||
              DEFAULTS.candleLimit,
          ),
        ),
      ),
    );

  const safeDepthLimit =
    [5, 10, 20, 50, 100, 500, 1000]
      .includes(Number(depthLimit))
      ? Number(depthLimit)
      : DEFAULTS.depthLimit;

  const urls = {
    premium:
      `${BINANCE}/fapi/v1/premiumIndex?symbol=${encodedSymbol}`,
    bookTicker:
      `${BINANCE}/fapi/v1/ticker/bookTicker?symbol=${encodedSymbol}`,
    depth:
      `${BINANCE}/fapi/v1/depth?symbol=${encodedSymbol}&limit=${safeDepthLimit}`,
    klines:
      `${BINANCE}/fapi/v1/klines?symbol=${encodedSymbol}&interval=${encodedInterval}&limit=${safeCandleLimit}`,
  };

  const [
    premiumResult,
    bookResult,
    depthResult,
    klinesResult,
  ] = await Promise.allSettled([
    getJson(urls.premium, {
      timeoutMs,
    }),
    getJson(urls.bookTicker, {
      timeoutMs,
    }),
    getJson(urls.depth, {
      timeoutMs,
    }),
    getJson(urls.klines, {
      timeoutMs,
    }),
  ]);

  const failures = [];

  function settledValue(
    result,
    code,
  ) {
    if (
      result.status === "fulfilled"
    ) {
      return result.value;
    }

    failures.push({
      code,
      detail:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    });

    return null;
  }

  const premiumRaw =
    settledValue(
      premiumResult,
      "BINANCE_PREMIUM_INDEX_UNAVAILABLE",
    );

  const bookRaw =
    settledValue(
      bookResult,
      "BINANCE_BOOK_TICKER_UNAVAILABLE",
    );

  const depthRaw =
    settledValue(
      depthResult,
      "BINANCE_DEPTH_UNAVAILABLE",
    );

  const klinesRaw =
    settledValue(
      klinesResult,
      "BINANCE_KLINES_UNAVAILABLE",
    );

  const premium =
    premiumRaw
      ? normalizePremium(premiumRaw)
      : {
          symbol,
          markPrice: null,
          indexPrice: null,
          fundingRate: null,
          interestRate: null,
          nextFundingTime: null,
          observedAtMs: null,
        };

  const book =
    bookRaw
      ? normalizeBookTicker(bookRaw)
      : {
          symbol,
          bestBid: null,
          bidQuantity: null,
          bestAsk: null,
          askQuantity: null,
          observedAtMs: null,
        };

  const depth =
    depthRaw
      ? normalizeDepth(depthRaw)
      : {
          lastUpdateId: null,
          eventTimeMs: null,
          bids: [],
          asks: [],
        };

  const candles =
    normalizeCandles(klinesRaw);

  const spread =
    calculateSpread({
      bestBid: book.bestBid,
      bestAsk: book.bestAsk,
    });

  const depthEvidence =
    buildDepthEvidence(
      depth,
      {
        slippageNotionalUsd,
        minimumDepthLevelsPerSide,
      },
    );

  const atr =
    calculateAtr(
      candles,
      atrPeriod,
    );

  const structure =
    calculateStructure(
      candles,
      structureLookback,
    );

  const latestClosedCandle =
    candles.length >= 2
      ? candles[
          candles.length - 2
        ]
      : null;

  const lastPrice =
    finite(
      latestClosedCandle?.close,
    );

  /*
   * Binance bookTicker includes a transaction time on USD-M
   * responses. Prefer it as the execution observation timestamp.
   * Fall back to depth event time, then latest closed candle.
   * We do NOT use local fetch completion time as market evidence.
   */
  const observedAtMs =
    book.observedAtMs ??
    depth.eventTimeMs ??
    finite(
      latestClosedCandle?.closeTime,
    );

  const freshness =
    evaluateObservationFreshness({
      observedAtMs,
      nowMs,
      maximumObservationAgeMs,
      maximumFutureClockSkewMs,
    });

  if (!freshness.authorized) {
    failures.push({
      code: freshness.failure,
      detail: {
        observedAt:
          freshness.observedAt,
        ageMs: freshness.ageMs,
        futureSkewMs:
          freshness.futureSkewMs,
      },
    });
  }

  const markPriceAvailable =
    premium.markPrice !== null &&
    premium.markPrice > 0;

  const bookTickerAvailable =
    spread.available === true;

  const depthAvailable =
    depthEvidence.available === true &&
    depthEvidence.liquidityScore !== null;

  const candlesAvailable =
    candles.length >=
    Math.max(
      atrPeriod + 1,
      structureLookback + 1,
    );

  const atrAvailable =
    atr.available === true;

  const structureAvailable =
    structure.available === true;

  if (!markPriceAvailable) {
    failures.push({
      code: "MARK_PRICE_REQUIRED",
      detail: premium.markPrice,
    });
  }

  if (!bookTickerAvailable) {
    failures.push({
      code: "BOOK_TICKER_REQUIRED",
      detail: {
        bestBid: book.bestBid,
        bestAsk: book.bestAsk,
      },
    });
  }

  if (!depthAvailable) {
    failures.push({
      code: "ORDER_BOOK_DEPTH_REQUIRED",
      detail: {
        bidLevels:
          depthEvidence.bidLevels,
        askLevels:
          depthEvidence.askLevels,
        liquidityScore:
          depthEvidence.liquidityScore,
      },
    });
  }

  if (!candlesAvailable) {
    failures.push({
      code: "FUTURES_CANDLES_REQUIRED",
      detail: {
        candleCount: candles.length,
        required:
          Math.max(
            atrPeriod + 1,
            structureLookback + 1,
          ),
      },
    });
  }

  if (!atrAvailable) {
    failures.push({
      code: "ATR_EVIDENCE_REQUIRED",
      detail: {
        period: atr.period,
        sampleSize: atr.sampleSize,
      },
    });
  }

  if (!structureAvailable) {
    failures.push({
      code: "STRUCTURE_EVIDENCE_REQUIRED",
      detail: {
        lookback:
          structure.lookback,
      },
    });
  }

  const approved =
    failures.length === 0;

  /*
   * Direction-specific slippage is deliberately not chosen here.
   * The pre-entry setup builder will select BUY slippage for LONG
   * entries and SELL slippage for SHORT entries.
   */
  const worstSlippage =
    depthEvidence.buySlippage
        ?.available &&
      depthEvidence.sellSlippage
        ?.available
      ? Math.max(
          depthEvidence.buySlippage
            .slippagePercent,
          depthEvidence.sellSlippage
            .slippagePercent,
        )
      : null;

  return {
    approved,
    status: approved
      ? "EXECUTION_MARKET_EVIDENCE_READY"
      : "EXECUTION_MARKET_EVIDENCE_INCOMPLETE",
    reason: approved
      ? "FRESH_BINANCE_FUTURES_EVIDENCE_AVAILABLE"
      : "REQUIRED_EXECUTION_EVIDENCE_UNAVAILABLE",

    symbol,
    observedAt:
      freshness.observedAt,

    market: {
      symbol,
      markPrice:
        premium.markPrice,
      indexPrice:
        premium.indexPrice,
      lastPrice,
      bestBid:
        book.bestBid,
      bestAsk:
        book.bestAsk,
      midpoint:
        spread.midpoint,
      spreadAbsolute:
        spread.spreadAbsolute,
      spreadPercent:
        spread.spreadPercent,
      fundingRate:
        premium.fundingRate,
      atr:
        atr.atr,
      atrPercent:
        atr.atrPercent,
      structuralHigh:
        structure.structuralHigh,
      structuralLow:
        structure.structuralLow,
      support:
        structure.support,
      resistance:
        structure.resistance,
    },

    executionContext: {
      spreadPercent:
        spread.spreadPercent,
      liquidityScore:
        depthEvidence.liquidityScore,
      slippageEstimatePercent:
        worstSlippage,
      buySlippageEstimatePercent:
        depthEvidence.buySlippage
          ?.available
          ? depthEvidence
              .buySlippage
              .slippagePercent
          : null,
      sellSlippageEstimatePercent:
        depthEvidence.sellSlippage
          ?.available
          ? depthEvidence
              .sellSlippage
              .slippagePercent
          : null,
      venueHealthy:
        freshness.authorized === true &&
        markPriceAvailable,
      orderBookHealthy:
        depthEvidence
          .structurallyHealthy ===
          true &&
        bookTickerAvailable,
    },

    setupEvidence: {
      candles,
      atr: atr.atr,
      atrPercent:
        atr.atrPercent,
      atrPeriod:
        atr.period,
      structuralHigh:
        structure.structuralHigh,
      structuralLow:
        structure.structuralLow,
      support:
        structure.support,
      resistance:
        structure.resistance,
      structureLookback:
        structure.lookback,
    },

    depth: {
      bidLevels:
        depthEvidence.bidLevels,
      askLevels:
        depthEvidence.askLevels,
      bidDepthUsd:
        depthEvidence.bidDepthUsd,
      askDepthUsd:
        depthEvidence.askDepthUsd,
      totalDepthUsd:
        depthEvidence.totalDepthUsd,
      imbalance:
        depthEvidence.imbalance,
      slippageNotionalUsd:
        depthEvidence.slippageNotionalUsd,
      buySlippage:
        depthEvidence.buySlippage,
      sellSlippage:
        depthEvidence.sellSlippage,
    },

    evidence: {
      markPriceAvailable,
      bookTickerAvailable,
      depthAvailable,
      candlesAvailable,
      atrAvailable,
      structureAvailable,
      freshnessAuthorized:
        freshness.authorized,
      observedAt:
        freshness.observedAt,
      observationAgeMs:
        freshness.ageMs,
      futureClockSkewMs:
        freshness.futureSkewMs,
      failures,
    },

    metadata: {
      provider:
        "BINANCE_USDM_FUTURES",
      contract:
        resolved.exchangeInfo,
      interval,
      candleLimit:
        safeCandleLimit,
      atrPeriod,
      structureLookback,
      depthLimit:
        safeDepthLimit,
      slippageNotionalUsd,
      evidenceOnly: true,
      missingEvidenceReceivesNeutralScore:
        false,
      executionAuthority: false,
      liveExecution: false,
    },

    executionAuthority: false,
    liveExecution: false,
  };
}

export function createCryptoFuturesExecutionMarketProvider(
  options = {},
) {
  return async function cryptoFuturesExecutionMarketProvider(
    context = {},
  ) {
    const candidate =
      context?.candidate ??
      context;

    return getCryptoFuturesExecutionMarket(
      candidate,
      options,
    );
  };
}

export default getCryptoFuturesExecutionMarket;
