/**
 * AEMA Private Futures Research Bot
 *
 * Six independent research dimensions.
 *
 * Each available engine emits:
 * - LONG support  (0..100)
 * - SHORT support (0..100)
 * - confidence    (0..100)
 * - evidence
 *
 * Engines DO NOT approve setups or execute trades.
 *
 * Missing evidence remains unavailable.
 * It is never converted into a fabricated neutral 50.
 */

const clamp = (
  value,
  min = 0,
  max = 100
) =>
  Math.max(
    min,
    Math.min(max, value)
  );

/*
 * ---------------------------------------------------------
 * NUMERIC HELPERS
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

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function percentChange(
  from,
  to
) {
  const a =
    finiteOrNull(from);

  const b =
    finiteOrNull(to);

  if (
    a === null ||
    b === null ||
    a <= 0
  ) {
    return null;
  }

  return (
    ((b - a) / a) *
    100
  );
}

function average(values = []) {
  const valid =
    values.filter(
      (value) =>
        Number.isFinite(value)
    );

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (sum, value) =>
        sum + value,
      0
    ) /
    valid.length
  );
}

/*
 * ---------------------------------------------------------
 * STANDARD DIRECTIONAL ENGINE OUTPUT
 * ---------------------------------------------------------
 */

function directional(
  name,
  raw,
  confidence,
  evidence,
  available = true
) {
  if (
    available !== true ||
    !Number.isFinite(raw)
  ) {
    return {
      engine: name,

      available: false,

      long: null,
      short: null,

      confidence: 0,

      evidence,

      executionAuthority: false,
      liveExecution: false,
    };
  }

  const signed =
    clamp(
      raw,
      -100,
      100
    );

  return {
    engine: name,

    available: true,

    long:
      Number(
        clamp(
          50 +
            signed / 2
        ).toFixed(4)
      ),

    short:
      Number(
        clamp(
          50 -
            signed / 2
        ).toFixed(4)
      ),

    confidence:
      Number(
        clamp(
          Number.isFinite(
            confidence
          )
            ? confidence
            : 0
        ).toFixed(4)
      ),

    evidence,

    executionAuthority: false,
    liveExecution: false,
  };
}

/*
 * =========================================================
 * TECHNICAL ENGINE
 * =========================================================
 *
 * Uses multiple momentum windows plus turnover expansion.
 */

export function runTechnicalEngine(
  asset,
  evidence
) {
  const candles =
    Array.isArray(
      evidence?.candles
    )
      ? evidence.candles
      : [];

  if (candles.length < 20) {
    return directional(
      "TECHNICAL",
      0,
      0,
      {
        reason:
          "INSUFFICIENT_CANDLES",

        candleCount:
          candles.length,
      },
      false
    );
  }

  const closes =
    candles
      .map(
        (candle) =>
          finiteOrNull(
            candle.close
          )
      );

  /*
   * Bybit's seventh kline value is turnover.
   * Do not use the old quoteVolume property here.
   */
  const turnovers =
    candles.map(
      (candle) =>
        finiteOrNull(
          candle.turnover
        )
    );

  const last =
    closes.at(-1);

  const m1 =
    percentChange(
      closes.at(-5),
      last
    );

  const m2 =
    percentChange(
      closes.at(-13),
      last
    );

  const m3 =
    percentChange(
      closes.at(-20),
      last
    );

  if (
    m1 === null ||
    m2 === null ||
    m3 === null
  ) {
    return directional(
      "TECHNICAL",
      0,
      0,
      {
        reason:
          "TECHNICAL_PRICE_EVIDENCE_UNAVAILABLE",
      },
      false
    );
  }

  const recentTurnover =
    average(
      turnovers.slice(-8)
    );

  const priorTurnover =
    average(
      turnovers.slice(
        -16,
        -8
      )
    );

  const turnoverExpansion =
    recentTurnover !== null &&
    priorTurnover !== null &&
    priorTurnover > 0
      ? recentTurnover /
        priorTurnover
      : null;

  /*
   * Price momentum determines direction.
   *
   * Turnover expansion affects confidence,
   * not directional sign.
   */
  const raw =
    clamp(
      m1 * 8 +
        m2 * 4 +
        m3 * 2,
      -100,
      100
    );

  let confidence =
    45 +
    Math.abs(m1) * 5 +
    Math.abs(m2) * 2;

  if (
    turnoverExpansion !== null
  ) {
    /*
     * Increasing participation strengthens confidence.
     *
     * Do not invent a value when turnover evidence
     * is unavailable.
     */
    confidence +=
      clamp(
        turnoverExpansion,
        0,
        3
      ) * 8;
  }

  confidence =
    clamp(confidence);

  return directional(
    "TECHNICAL",
    raw,
    confidence,
    {
      m1,
      m2,
      m3,

      turnoverExpansion,

      recentTurnover,
      priorTurnover,

      lastPrice:
        last,
    }
  );
}

/*
 * =========================================================
 * FUNDAMENTAL / DERIVATIVES ENGINE
 * =========================================================
 *
 * For crypto futures, this engine evaluates market
 * participation and derivatives positioning.
 *
 * IMPORTANT:
 * Absolute open interest is primarily participation
 * evidence.
 *
 * OI change + price change provides directional context.
 *
 * Funding is treated as positioning/crowding evidence,
 * not blindly as:
 *
 * positive funding = bullish
 * negative funding = bearish
 */

export function runFundamentalEngine(
  asset,
  evidence
) {
  const quoteVolume =
    finiteOrNull(
      asset?.market
        ?.quoteVolume
    );

  const openInterest =
    finiteOrNull(
      evidence?.openInterest
    );

  const openInterestValue =
    finiteOrNull(
      evidence
        ?.openInterestValue
    );

  const fundingRate =
    finiteOrNull(
      evidence?.fundingRate
    );

  const priceChange =
    finiteOrNull(
      asset?.market
        ?.priceChangePercent
    );

  const oiChange =
    evidence
      ?.openInterestChange
      ?.available === true
      ? finiteOrNull(
          evidence
            .openInterestChange
            .percentChange
        )
      : null;

  /*
   * We need real participation evidence.
   */
  if (
    quoteVolume === null ||
    quoteVolume <= 0 ||
    openInterest === null ||
    openInterest <= 0
  ) {
    return directional(
      "FUNDAMENTAL",
      0,
      0,
      {
        reason:
          "DERIVATIVES_PARTICIPATION_UNAVAILABLE",

        quoteVolume,

        openInterest,

        openInterestValue,

        fundingRate,

        priceChangePercent:
          priceChange,

        openInterestChangePercent:
          oiChange,
      },
      false
    );
  }

  /*
   * -------------------------------------------------------
   * PARTICIPATION QUALITY
   * -------------------------------------------------------
   */

  const volumeParticipation =
    clamp(
      (
        Math.log10(
          Math.max(
            quoteVolume,
            1
          )
        ) -
        6
      ) /
        4,
      0,
      1
    );

  const oiParticipation =
    openInterestValue !==
      null &&
    openInterestValue > 0
      ? clamp(
          (
            Math.log10(
              openInterestValue
            ) -
            5
          ) /
            5,
          0,
          1
        )
      : null;

  /*
   * -------------------------------------------------------
   * PRICE + OPEN INTEREST RELATIONSHIP
   * -------------------------------------------------------
   *
   * Rising price + rising OI:
   * new participation is entering an upward move.
   *
   * Falling price + rising OI:
   * new participation is entering a downward move.
   *
   * Falling OI means participation is contracting.
   * We therefore reduce directional conviction rather
   * than automatically reversing the signal.
   */

  let derivativesBias = 0;

  let oiRelationship =
    "UNAVAILABLE";

  if (
    priceChange !== null &&
    oiChange !== null
  ) {
    if (
      priceChange > 0 &&
      oiChange > 0
    ) {
      oiRelationship =
        "PRICE_UP_OI_UP";

      derivativesBias =
        Math.min(
          35,
          Math.abs(
            priceChange
          ) * 2 +
            Math.abs(
              oiChange
            ) * 3
        );
    } else if (
      priceChange < 0 &&
      oiChange > 0
    ) {
      oiRelationship =
        "PRICE_DOWN_OI_UP";

      derivativesBias =
        -Math.min(
          35,
          Math.abs(
            priceChange
          ) * 2 +
            Math.abs(
              oiChange
            ) * 3
        );
    } else if (
      priceChange > 0 &&
      oiChange < 0
    ) {
      oiRelationship =
        "PRICE_UP_OI_DOWN";

      derivativesBias =
        Math.min(
          15,
          Math.abs(
            priceChange
          )
        );
    } else if (
      priceChange < 0 &&
      oiChange < 0
    ) {
      oiRelationship =
        "PRICE_DOWN_OI_DOWN";

      derivativesBias =
        -Math.min(
          15,
          Math.abs(
            priceChange
          )
        );
    } else {
      oiRelationship =
        "MIXED";
    }
  } else if (
    priceChange !== null
  ) {
    /*
     * OI history unavailable.
     *
     * Price may still contribute weak directional
     * evidence, but with lower confidence.
     */
    derivativesBias =
      clamp(
        priceChange * 1.5,
        -20,
        20
      );

    oiRelationship =
      "PRICE_ONLY";
  }

  /*
   * -------------------------------------------------------
   * FUNDING / CROWDING
   * -------------------------------------------------------
   *
   * Funding does NOT determine direction by itself.
   *
   * Large positive funding indicates long-side crowding.
   * Large negative funding indicates short-side crowding.
   *
   * We use it as a modest crowding adjustment.
   */

  let fundingAdjustment = 0;

  let fundingState =
    "UNAVAILABLE";

  if (fundingRate !== null) {
    if (
      fundingRate > 0
    ) {
      fundingState =
        "LONGS_PAYING";

      /*
       * Mild positive funding can accompany a healthy
       * bullish market, but increasingly positive funding
       * represents crowding.
       */
      fundingAdjustment =
        -clamp(
          fundingRate *
            100000,
          0,
          12
        );
    } else if (
      fundingRate < 0
    ) {
      fundingState =
        "SHORTS_PAYING";

      fundingAdjustment =
        clamp(
          Math.abs(
            fundingRate
          ) *
            100000,
          0,
          12
        );
    } else {
      fundingState =
        "NEUTRAL";
    }
  }

  const raw =
    clamp(
      derivativesBias +
        fundingAdjustment,
      -100,
      100
    );

  /*
   * -------------------------------------------------------
   * CONFIDENCE
   * -------------------------------------------------------
   */

  let confidence =
    35 +
    volumeParticipation *
      25;

  if (
    oiParticipation !== null
  ) {
    confidence +=
      oiParticipation *
      20;
  }

  if (oiChange !== null) {
    confidence += 15;
  }

  if (
    fundingRate !== null
  ) {
    confidence += 5;
  }

  confidence =
    clamp(confidence);

  return directional(
    "FUNDAMENTAL",
    raw,
    confidence,
    {
      quoteVolume,

      openInterest,

      openInterestValue,

      openInterestChangePercent:
        oiChange,

      priceChangePercent:
        priceChange,

      oiRelationship,

      fundingRate,

      fundingState,

      fundingAdjustment,

      derivativesBias,

      volumeParticipation,

      openInterestParticipation:
        oiParticipation,
    }
  );
}

/*
 * =========================================================
 * NARRATIVE ENGINE
 * =========================================================
 */

export function runNarrativeEngine(
  asset,
  evidence
) {
  /*
   * No external narrative source is configured.
   *
   * Do not fabricate social sentiment or narrative scores.
   */
  return directional(
    "NARRATIVE",
    0,
    0,
    {
      reason:
        "EXTERNAL_NARRATIVE_FEED_NOT_CONFIGURED",

      symbol:
        asset?.symbol ??
        null,
    },
    false
  );
}

/*
 * =========================================================
 * NEWS ENGINE
 * =========================================================
 */

export function runNewsEngine(
  asset,
  evidence
) {
  /*
   * No external news source is configured.
   *
   * Do not fabricate news sentiment.
   */
  return directional(
    "NEWS",
    0,
    0,
    {
      reason:
        "EXTERNAL_NEWS_FEED_NOT_CONFIGURED",

      symbol:
        asset?.symbol ??
        null,
    },
    false
  );
}

/*
 * =========================================================
 * MARKET STRUCTURE ENGINE
 * =========================================================
 */

export function runMarketStructureEngine(
  asset,
  evidence
) {
  const candles =
    Array.isArray(
      evidence?.candles
    )
      ? evidence.candles
      : [];

  if (candles.length < 20) {
    return directional(
      "MARKET_STRUCTURE",
      0,
      0,
      {
        reason:
          "INSUFFICIENT_CANDLES",

        candleCount:
          candles.length,
      },
      false
    );
  }

  const recent =
    candles.slice(-20);

  const highs =
    recent.map(
      (candle) =>
        finiteOrNull(
          candle.high
        )
    );

  const lows =
    recent.map(
      (candle) =>
        finiteOrNull(
          candle.low
        )
    );

  const closes =
    recent.map(
      (candle) =>
        finiteOrNull(
          candle.close
        )
    );

  if (
    highs.some(
      (value) =>
        value === null
    ) ||
    lows.some(
      (value) =>
        value === null
    ) ||
    closes.some(
      (value) =>
        value === null
    )
  ) {
    return directional(
      "MARKET_STRUCTURE",
      0,
      0,
      {
        reason:
          "INVALID_STRUCTURE_CANDLES",
      },
      false
    );
  }

  const firstMid =
    (
      highs[0] +
      lows[0]
    ) /
    2;

  const lastMid =
    (
      highs.at(-1) +
      lows.at(-1)
    ) /
    2;

  const structureMove =
    percentChange(
      firstMid,
      lastMid
    );

  if (
    structureMove === null
  ) {
    return directional(
      "MARKET_STRUCTURE",
      0,
      0,
      {
        reason:
          "STRUCTURE_MOVE_UNAVAILABLE",
      },
      false
    );
  }

  const rangeHigh =
    Math.max(...highs);

  const rangeLow =
    Math.min(...lows);

  const range =
    rangeHigh -
    rangeLow;

  if (!(range > 0)) {
    return directional(
      "MARKET_STRUCTURE",
      0,
      0,
      {
        reason:
          "INVALID_STRUCTURE_RANGE",

        high:
          rangeHigh,

        low:
          rangeLow,
      },
      false
    );
  }

  const closeLocation =
    (
      closes.at(-1) -
      rangeLow
    ) /
    range;

  /*
   * closeLocation:
   *
   * 1.0 = near top of recent range
   * 0.5 = middle
   * 0.0 = near bottom
   */

  const locationBias =
    (
      closeLocation -
      0.5
    ) *
    40;

  /*
   * Add simple higher-high / higher-low evidence.
   *
   * Compare first half with second half of
   * the 20-candle structure window.
   */

  const firstHalf =
    recent.slice(0, 10);

  const secondHalf =
    recent.slice(10);

  const firstHigh =
    Math.max(
      ...firstHalf.map(
        (candle) =>
          candle.high
      )
    );

  const secondHigh =
    Math.max(
      ...secondHalf.map(
        (candle) =>
          candle.high
      )
    );

  const firstLow =
    Math.min(
      ...firstHalf.map(
        (candle) =>
          candle.low
      )
    );

  const secondLow =
    Math.min(
      ...secondHalf.map(
        (candle) =>
          candle.low
      )
    );

  const higherHigh =
    secondHigh >
    firstHigh;

  const higherLow =
    secondLow >
    firstLow;

  const lowerHigh =
    secondHigh <
    firstHigh;

  const lowerLow =
    secondLow <
    firstLow;

  let structuralBias = 0;

  if (
    higherHigh &&
    higherLow
  ) {
    structuralBias += 20;
  }

  if (
    lowerHigh &&
    lowerLow
  ) {
    structuralBias -= 20;
  }

  const raw =
    clamp(
      structureMove * 7 +
        locationBias +
        structuralBias,
      -100,
      100
    );

  const confidence =
    clamp(
      45 +
        Math.abs(
          structureMove
        ) *
          5 +
        Math.abs(
          locationBias
        ) +
        Math.abs(
          structuralBias
        ) *
          0.5
    );

  return directional(
    "MARKET_STRUCTURE",
    raw,
    confidence,
    {
      structureMovePercent:
        structureMove,

      closeLocation,

      locationBias,

      structuralBias,

      higherHigh,
      higherLow,
      lowerHigh,
      lowerLow,

      high:
        rangeHigh,

      low:
        rangeLow,
    }
  );
}

/*
 * =========================================================
 * LIQUIDITY ENGINE
 * =========================================================
 */

export function runLiquidityEngine(
  asset,
  evidence
) {
  /*
   * Prefer fresh research depth rather than relying only
   * on the universe snapshot.
   */
  const depth =
    evidence?.depth;

  const bestBid =
    finiteOrNull(
      depth?.bestBid
    );

  const bestAsk =
    finiteOrNull(
      depth?.bestAsk
    );

  let spreadPercent =
    null;

  if (
    bestBid !== null &&
    bestAsk !== null &&
    bestAsk >= bestBid
  ) {
    const mid =
      (
        bestBid +
        bestAsk
      ) /
      2;

    if (mid > 0) {
      spreadPercent =
        (
          (bestAsk -
            bestBid) /
          mid
        ) *
        100;
    }
  }

  /*
   * Fall back to universe spread only if fresh
   * depth cannot provide it.
   */
  if (
    spreadPercent === null
  ) {
    spreadPercent =
      finiteOrNull(
        asset?.market
          ?.spreadPercent
      );
  }

  const totalNotional =
    finiteOrNull(
      depth?.totalNotional
    );

  const imbalance =
    finiteOrNull(
      depth?.imbalance
    );

  if (
    spreadPercent === null ||
    totalNotional === null ||
    totalNotional <= 0 ||
    imbalance === null
  ) {
    return directional(
      "LIQUIDITY",
      0,
      0,
      {
        reason:
          "LIQUIDITY_EVIDENCE_UNAVAILABLE",

        spreadPercent,

        totalNotional,

        imbalance,
      },
      false
    );
  }

  /*
   * Positive imbalance:
   * more visible bid-side notional.
   *
   * Negative imbalance:
   * more visible ask-side notional.
   */

  const raw =
    clamp(
      imbalance * 100,
      -100,
      100
    );

  const spreadQuality =
    spreadPercent <= 0.02
      ? 100
      : spreadPercent >= 0.5
        ? 0
        : 100 *
          (
            1 -
            (
              spreadPercent -
              0.02
            ) /
              0.48
          );

  const depthQuality =
    clamp(
      Math.log10(
        totalNotional +
        1
      ) *
        10
    );

  const confidence =
    clamp(
      spreadQuality *
        0.55 +
        depthQuality *
          0.45
    );

  return directional(
    "LIQUIDITY",
    raw,
    confidence,
    {
      spreadPercent,

      bestBid,

      bestAsk,

      bidNotional:
        finiteOrNull(
          depth?.bidNotional
        ),

      askNotional:
        finiteOrNull(
          depth?.askNotional
        ),

      totalNotional,

      imbalance,

      spreadQuality,

      depthQuality,
    }
  );
}

/*
 * =========================================================
 * RUN ALL RESEARCH ENGINES
 * =========================================================
 */

export function runAllBotResearchEngines(
  asset,
  evidence
) {
  return {
    technical:
      runTechnicalEngine(
        asset,
        evidence
      ),

    fundamental:
      runFundamentalEngine(
        asset,
        evidence
      ),

    narrative:
      runNarrativeEngine(
        asset,
        evidence
      ),

    news:
      runNewsEngine(
        asset,
        evidence
      ),

    marketStructure:
      runMarketStructureEngine(
        asset,
        evidence
      ),

    liquidity:
      runLiquidityEngine(
        asset,
        evidence
      ),
  };
}