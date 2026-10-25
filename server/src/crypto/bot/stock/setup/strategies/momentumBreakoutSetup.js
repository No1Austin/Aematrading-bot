/**
 * AEMA Private Stock Research Bot
 * Momentum Breakout Setup Detector
 *
 * Detects directional expansion through recent structure.
 *
 * Unlike BREAKOUT_RETEST:
 * - a completed retest is not required;
 * - displacement and participation matter more;
 * - strict anti-chasing logic prevents entries that
 *   have already moved too far from the breakout level.
 *
 * Research only.
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

function clamp(value, min = 0, max = 100) {
  const n = finiteOrNull(value);

  if (n === null) {
    return min;
  }

  return Math.max(
    min,
    Math.min(max, n)
  );
}

function normalizeDirection(candidate) {
  const raw =
    candidate?.directionDecision?.direction ??
    candidate?.direction ??
    null;

  const value =
    String(raw || "").toUpperCase();

  if (
    value === "LONG" ||
    value === "BULL"
  ) {
    return "BULL";
  }

  if (
    value === "SHORT" ||
    value === "BEAR"
  ) {
    return "BEAR";
  }

  return null;
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
    }))
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
    ) / valid.length
  );
}

/*
 * ---------------------------------------------------------
 * MOMENTUM BREAKOUT DETECTION
 * ---------------------------------------------------------
 */

function detectMomentumBreakout(
  candles,
  direction,
  atr,
  options = {}
) {
  const lookback =
    Math.max(
      5,
      Number(
        options.breakoutLookback ??
        10
      )
    );

  const recentSearch =
    Math.max(
      1,
      Number(
        options.recentBreakoutCandles ??
        3
      )
    );

  if (
    candles.length <
    lookback + 2
  ) {
    return {
      detected: false,
      reason:
        "INSUFFICIENT_MOMENTUM_HISTORY",
    };
  }

  const startIndex =
    Math.max(
      lookback,
      candles.length -
        recentSearch
    );

  for (
    let i =
      candles.length - 1;
    i >= startIndex;
    i -= 1
  ) {
    const candle =
      candles[i];

    const prior =
      candles.slice(
        i - lookback,
        i
      );

    if (!prior.length) {
      continue;
    }

    const priorHigh =
      Math.max(
        ...prior.map(
          (row) =>
            row.high
        )
      );

    const priorLow =
      Math.min(
        ...prior.map(
          (row) =>
            row.low
        )
      );

    const body =
      Math.abs(
        candle.close -
        candle.open
      );

    const candleRange =
      candle.high -
      candle.low;

    const bodyToRange =
      candleRange > 0
        ? body /
          candleRange
        : null;

    const displacementAtr =
      atr !== null &&
      atr > 0
        ? body / atr
        : null;

    const priorVolumes =
      prior
        .map(
          (row) =>
            finiteOrNull(
              row.volume
            )
        )
        .filter(
          (value) =>
            value !== null
        );

    const averageVolume =
      average(priorVolumes);

    const breakoutVolume =
      finiteOrNull(
        candle.volume
      );

    const volumeRatio =
      breakoutVolume !== null &&
      averageVolume !== null &&
      averageVolume > 0
        ? breakoutVolume /
          averageVolume
        : null;

    if (
      direction === "BULL" &&
      candle.close >
        priorHigh
    ) {
      return {
        detected: true,

        direction:
          "BULL",

        candleIndex:
          i,

        candle,

        level:
          priorHigh,

        priorHigh,
        priorLow,

        body,

        candleRange,

        bodyToRange,

        displacementAtr,

        volumeRatio,

        reason:
          "BULLISH_MOMENTUM_BREAKOUT",
      };
    }

    if (
      direction === "BEAR" &&
      candle.close <
        priorLow
    ) {
      return {
        detected: true,

        direction:
          "BEAR",

        candleIndex:
          i,

        candle,

        level:
          priorLow,

        priorHigh,
        priorLow,

        body,

        candleRange,

        bodyToRange,

        displacementAtr,

        volumeRatio,

        reason:
          "BEARISH_MOMENTUM_BREAKOUT",
      };
    }
  }

  return {
    detected: false,

    direction: null,

    candleIndex: null,

    candle: null,

    level: null,

    displacementAtr: null,

    bodyToRange: null,

    volumeRatio: null,

    reason:
      "NO_RECENT_MOMENTUM_BREAKOUT",
  };
}

/*
 * ---------------------------------------------------------
 * BREAKOUT QUALITY
 * ---------------------------------------------------------
 */

function evaluateBreakoutQuality(
  breakout,
  options = {}
) {
  const blockers = [];

  const minimumDisplacementAtr =
    finiteOrNull(
      options.minimumDisplacementAtr
    ) ??
    0.60;

  const minimumBodyToRange =
    finiteOrNull(
      options.minimumBodyToRange
    ) ??
    0.55;

  const displacementAtr =
    finiteOrNull(
      breakout?.displacementAtr
    );

  const bodyToRange =
    finiteOrNull(
      breakout?.bodyToRange
    );

  if (
    displacementAtr === null ||
    displacementAtr <
      minimumDisplacementAtr
  ) {
    blockers.push(
      "MOMENTUM_DISPLACEMENT_TOO_WEAK"
    );
  }

  if (
    bodyToRange === null ||
    bodyToRange <
      minimumBodyToRange
  ) {
    blockers.push(
      "BREAKOUT_CANDLE_BODY_TOO_WEAK"
    );
  }

  return {
    approved:
      blockers.length === 0,

    minimumDisplacementAtr,

    minimumBodyToRange,

    blockers,
  };
}

/*
 * ---------------------------------------------------------
 * ENTRY / ANTI-CHASE
 * ---------------------------------------------------------
 */

function buildEntryPlan(
  direction,
  breakout,
  market,
  atr,
  options = {}
) {
  const level =
    positiveOrNull(
      breakout?.level
    );

  const currentPrice =
    direction === "BULL"
      ? positiveOrNull(
          market?.ask
        )
      : positiveOrNull(
          market?.bid
        );

  if (
    level === null ||
    currentPrice === null ||
    atr === null ||
    !(atr > 0)
  ) {
    return {
      available: false,

      currentPrice,

      breakoutLevel:
        level,

      preferred: null,

      low: null,
      high: null,

      extensionAtr: null,

      chaseState:
        "UNKNOWN",
    };
  }

  const maximumExtensionAtr =
    finiteOrNull(
      options.maximumEntryExtensionAtr
    ) ??
    0.75;

  const extension =
    Math.abs(
      currentPrice -
      level
    );

  const extensionAtr =
    extension / atr;

  /*
   * The preferred momentum entry is a controlled
   * continuation zone just beyond the broken level.
   *
   * We do not move the preferred entry outward merely
   * because current price has already run farther.
   */
  const zoneWidth =
    atr * 0.35;

  let low = null;
  let high = null;
  let preferred = null;

  if (direction === "BULL") {
    low =
      level;

    high =
      level +
      zoneWidth;

    preferred =
      level +
      atr * 0.15;
  }

  if (direction === "BEAR") {
    low =
      Math.max(
        Number.EPSILON,
        level -
          zoneWidth
      );

    high =
      level;

    preferred =
      level -
      atr * 0.15;
  }

  let chaseState =
    "ACCEPTABLE";

  if (
    extensionAtr >
    maximumExtensionAtr
  ) {
    chaseState =
      "TOO_EXTENDED";
  } else if (
    extensionAtr >
    0.50
  ) {
    chaseState =
      "EXTENDED";
  }

  const insideEntryZone =
    currentPrice >= low &&
    currentPrice <= high;

  return {
    available:
      preferred !== null &&
      preferred > 0,

    currentPrice,

    breakoutLevel:
      level,

    low,
    high,
    preferred,

    insideEntryZone,

    extension,

    extensionAtr,

    maximumExtensionAtr,

    chaseState,
  };
}

/*
 * ---------------------------------------------------------
 * INVALIDATION
 * ---------------------------------------------------------
 */

function buildInvalidation(
  direction,
  breakout,
  atr,
  options = {}
) {
  const breakoutCandle =
    breakout?.candle;

  const level =
    positiveOrNull(
      breakout?.level
    );

  if (
    !breakoutCandle ||
    level === null ||
    atr === null ||
    !(atr > 0)
  ) {
    return {
      available: false,
      price: null,
      structuralLevel: null,
      buffer: null,
      reason: null,
    };
  }

  const bufferMultiplier =
    finiteOrNull(
      options.atrStopBufferMultiplier
    ) ??
    0.20;

  const buffer =
    atr *
    bufferMultiplier;

  if (direction === "BULL") {
    /*
     * Failure beneath the breakout candle low is
     * stronger invalidation than an arbitrary ATR stop.
     */
    const structuralLevel =
      positiveOrNull(
        breakoutCandle.low
      );

    if (structuralLevel === null) {
      return {
        available: false,
        price: null,
        structuralLevel: null,
        buffer: null,
        reason: null,
      };
    }

    const price =
      structuralLevel -
      buffer;

    return {
      available:
        price > 0,

      price:
        price > 0
          ? price
          : null,

      structuralLevel,

      buffer,

      reason:
        "BULLISH_MOMENTUM_BREAKOUT_FAILED",
    };
  }

  if (direction === "BEAR") {
    const structuralLevel =
      positiveOrNull(
        breakoutCandle.high
      );

    if (structuralLevel === null) {
      return {
        available: false,
        price: null,
        structuralLevel: null,
        buffer: null,
        reason: null,
      };
    }

    return {
      available: true,

      price:
        structuralLevel +
        buffer,

      structuralLevel,

      buffer,

      reason:
        "BEARISH_MOMENTUM_BREAKOUT_FAILED",
    };
  }

  return {
    available: false,
    price: null,
    structuralLevel: null,
    buffer: null,
    reason: null,
  };
}

/*
 * ---------------------------------------------------------
 * TARGETS
 * ---------------------------------------------------------
 */

function buildTargets(
  direction,
  breakout,
  structure,
  entry
) {
  const preferredEntry =
    positiveOrNull(entry);

  const level =
    positiveOrNull(
      breakout?.level
    );

  const priorHigh =
    positiveOrNull(
      breakout?.priorHigh
    );

  const priorLow =
    positiveOrNull(
      breakout?.priorLow
    );

  if (
    preferredEntry === null ||
    level === null ||
    priorHigh === null ||
    priorLow === null ||
    priorHigh <= priorLow
  ) {
    return [];
  }

  const priorRange =
    priorHigh -
    priorLow;

  const candidates = [];

  /*
   * Structural target first.
   */
  if (direction === "BULL") {
    const structuralHigh =
      positiveOrNull(
        structure?.range?.high
      );

    if (
      structuralHigh !== null &&
      structuralHigh >
        preferredEntry
    ) {
      candidates.push({
        price:
          structuralHigh,

        reason:
          "EXTERNAL_STRUCTURE_HIGH",
      });
    }

    /*
     * Range projections are derived from the actual
     * broken consolidation/range.
     */
    candidates.push({
      price:
        level +
        priorRange * 0.75,

      reason:
        "MOMENTUM_RANGE_PROJECTION_075",
    });

    candidates.push({
      price:
        level +
        priorRange,

      reason:
        "MOMENTUM_RANGE_PROJECTION_100",
    });

    candidates.push({
      price:
        level +
        priorRange * 1.5,

      reason:
        "MOMENTUM_RANGE_PROJECTION_150",
    });
  }

  if (direction === "BEAR") {
    const structuralLow =
      positiveOrNull(
        structure?.range?.low
      );

    if (
      structuralLow !== null &&
      structuralLow <
        preferredEntry
    ) {
      candidates.push({
        price:
          structuralLow,

        reason:
          "EXTERNAL_STRUCTURE_LOW",
      });
    }

    const projected075 =
      level -
      priorRange * 0.75;

    const projected100 =
      level -
      priorRange;

    const projected150 =
      level -
      priorRange * 1.5;

    if (projected075 > 0) {
      candidates.push({
        price:
          projected075,

        reason:
          "MOMENTUM_RANGE_PROJECTION_075",
      });
    }

    if (projected100 > 0) {
      candidates.push({
        price:
          projected100,

        reason:
          "MOMENTUM_RANGE_PROJECTION_100",
      });
    }

    if (projected150 > 0) {
      candidates.push({
        price:
          projected150,

        reason:
          "MOMENTUM_RANGE_PROJECTION_150",
      });
    }
  }

  const seen =
    new Set();

  const valid =
    candidates.filter(
      (target) => {
        const price =
          positiveOrNull(
            target.price
          );

        if (price === null) {
          return false;
        }

        const correctSide =
          direction === "BULL"
            ? price >
              preferredEntry
            : price <
              preferredEntry;

        if (!correctSide) {
          return false;
        }

        const key =
          Number(
            price
          ).toPrecision(12);

        if (seen.has(key)) {
          return false;
        }

        seen.add(key);

        return true;
      }
    );

  valid.sort(
    (a, b) =>
      Math.abs(
        a.price -
        preferredEntry
      ) -
      Math.abs(
        b.price -
        preferredEntry
      )
  );

  return valid;
}

/*
 * ---------------------------------------------------------
 * PATTERN SCORE
 * ---------------------------------------------------------
 */

function scorePattern({
  direction,
  breakout,
  breakoutQuality,
  entryPlan,
  structure,
  regime,
}) {
  let score = 0;

  const evidence = [];
  const risks = [];

  if (
    breakout?.detected === true &&
    breakout?.direction ===
      direction
  ) {
    score += 25;

    evidence.push(
      "DIRECTIONAL_BREAKOUT_CONFIRMED"
    );
  }

  if (
    breakoutQuality?.approved === true
  ) {
    score += 20;

    evidence.push(
      "BREAKOUT_DISPLACEMENT_CONFIRMED"
    );
  }

  const displacement =
    finiteOrNull(
      breakout?.displacementAtr
    );

  if (
    displacement !== null &&
    displacement >= 1
  ) {
    score += 10;

    evidence.push(
      "STRONG_ATR_DISPLACEMENT"
    );
  }

  const bodyToRange =
    finiteOrNull(
      breakout?.bodyToRange
    );

  if (
    bodyToRange !== null &&
    bodyToRange >= 0.65
  ) {
    score += 10;

    evidence.push(
      "STRONG_BREAKOUT_CANDLE_BODY"
    );
  }

  const volumeRatio =
    finiteOrNull(
      breakout?.volumeRatio
    );

  if (
    volumeRatio !== null &&
    volumeRatio >= 1.25
  ) {
    score += 10;

    evidence.push(
      "BREAKOUT_VOLUME_EXPANSION"
    );
  }

  if (
    regime?.regime ===
      "EXPANSION"
  ) {
    score += 15;

    evidence.push(
      "EXPANSION_REGIME"
    );
  } else if (
    regime?.regime ===
      "COMPRESSION"
  ) {
    score += 10;

    evidence.push(
      "BREAKOUT_FROM_COMPRESSION_CONTEXT"
    );
  }

  if (
    structure?.volatility?.regime ===
      "EXPANDING"
  ) {
    score += 5;

    evidence.push(
      "VOLATILITY_EXPANDING"
    );
  }

  if (
    entryPlan?.insideEntryZone ===
    true
  ) {
    score += 5;

    evidence.push(
      "PRICE_INSIDE_MOMENTUM_ENTRY_ZONE"
    );
  }

  if (
    entryPlan?.chaseState ===
    "EXTENDED"
  ) {
    risks.push(
      "ENTRY_MODERATELY_EXTENDED"
    );
  }

  if (
    entryPlan?.chaseState ===
    "TOO_EXTENDED"
  ) {
    risks.push(
      "ENTRY_TOO_EXTENDED"
    );
  }

  if (
    structure?.volatility?.regime ===
    "EXTREME"
  ) {
    risks.push(
      "EXTREME_VOLATILITY"
    );
  }

  return {
    score:
      clamp(score),

    evidence,

    risks,
  };
}

/*
 * ---------------------------------------------------------
 * MAIN DETECTOR
 * ---------------------------------------------------------
 */

export function detectMomentumBreakoutSetup(
  candidate,
  market,
  structure,
  regime,
  options = {}
) {
  const blockers = [];

  const direction =
    normalizeDirection(
      candidate
    );

  if (!direction) {
    blockers.push(
      "MOMENTUM_BREAKOUT_DIRECTION_UNAVAILABLE"
    );
  }

  if (
    !market ||
    market.approved !== true
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_MARKET_NOT_READY"
    );
  }

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_STRUCTURE_NOT_READY"
    );
  }

  if (
    !regime ||
    regime.approved !== true
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_REGIME_NOT_READY"
    );
  }

  if (
    Array.isArray(
      regime?.eligibleStrategies
    ) &&
    !regime.eligibleStrategies.includes(
      "MOMENTUM_BREAKOUT"
    )
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_NOT_ELIGIBLE_FOR_REGIME"
    );
  }

  const candles =
    normalizeCandles(
      market?.candles
    );

  if (candles.length < 15) {
    blockers.push(
      "MOMENTUM_BREAKOUT_INSUFFICIENT_CANDLES"
    );
  }

  const atr =
    positiveOrNull(
      structure?.atr ??
      market?.atr
    );

  if (atr === null) {
    blockers.push(
      "MOMENTUM_BREAKOUT_ATR_UNAVAILABLE"
    );
  }

  const breakout =
    detectMomentumBreakout(
      candles,
      direction,
      atr,
      options
    );

  if (
    breakout.detected !== true
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_NOT_FOUND"
    );
  }

  const breakoutQuality =
    evaluateBreakoutQuality(
      breakout,
      options
    );

  blockers.push(
    ...breakoutQuality.blockers
  );

  const entryPlan =
    buildEntryPlan(
      direction,
      breakout,
      market,
      atr,
      options
    );

  if (
    entryPlan.available !== true
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_ENTRY_UNAVAILABLE"
    );
  }

  /*
   * Critical anti-chasing gate.
   */
  if (
    entryPlan.chaseState ===
    "TOO_EXTENDED"
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_ENTRY_TOO_EXTENDED"
    );
  }

  /*
   * For momentum continuation we allow current price
   * to be slightly outside the ideal zone, but it must
   * remain within the maximum ATR extension.
   */
  const invalidation =
    buildInvalidation(
      direction,
      breakout,
      atr,
      options
    );

  if (
    invalidation.available !== true
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_INVALIDATION_UNAVAILABLE"
    );
  }

  const entry =
    positiveOrNull(
      entryPlan.preferred
    );

  const stop =
    positiveOrNull(
      invalidation.price
    );

  if (
    direction === "BULL" &&
    entry !== null &&
    stop !== null &&
    !(stop < entry)
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_INVALID_BULL_GEOMETRY"
    );
  }

  if (
    direction === "BEAR" &&
    entry !== null &&
    stop !== null &&
    !(stop > entry)
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_INVALID_BEAR_GEOMETRY"
    );
  }

  const targets =
    buildTargets(
      direction,
      breakout,
      structure,
      entry
    );

  if (!targets.length) {
    blockers.push(
      "MOMENTUM_BREAKOUT_TARGET_UNAVAILABLE"
    );
  }

  const quality =
    scorePattern({
      direction,
      breakout,
      breakoutQuality,
      entryPlan,
      structure,
      regime,
    });

  const minimumPatternScore =
    finiteOrNull(
      options.minimumPatternScore
    ) ??
    70;

  if (
    quality.score <
    minimumPatternScore
  ) {
    blockers.push(
      "MOMENTUM_BREAKOUT_PATTERN_SCORE_TOO_LOW"
    );
  }

  const risk =
    entry !== null &&
    stop !== null
      ? Math.abs(
          entry - stop
        )
      : null;

  const targetsWithRisk =
    targets.map(
      (target, index) => {
        const reward =
          entry !== null
            ? Math.abs(
                target.price -
                entry
              )
            : null;

        const riskReward =
          risk !== null &&
          risk > 0 &&
          reward !== null
            ? reward / risk
            : null;

        return {
          ...target,

          label:
            `TP${index + 1}`,

          rewardDistance:
            reward,

          riskReward,
        };
      }
    );

  const matched =
    blockers.length === 0;

  return {
    strategy:
      "MOMENTUM_BREAKOUT",

    matched,

    status:
      matched
        ? "PATTERN_MATCHED"
        : "PATTERN_REJECTED",

    direction,

    patternScore:
      quality.score,

    minimumPatternScore,

    breakout,

    breakoutQuality,

    entryZone: {
      available:
        entryPlan.available,

      low:
        entryPlan.low,

      high:
        entryPlan.high,

      preferred:
        entryPlan.preferred,
    },

    preferredEntry:
      entry,

    entryQuality: {
      currentPrice:
        entryPlan.currentPrice,

      breakoutLevel:
        entryPlan.breakoutLevel,

      extension:
        entryPlan.extension,

      extensionAtr:
        entryPlan.extensionAtr,

      maximumExtensionAtr:
        entryPlan.maximumExtensionAtr,

      insideEntryZone:
        entryPlan.insideEntryZone,

      chaseState:
        entryPlan.chaseState,
    },

    invalidation,

    stop,

    targets:
      targetsWithRisk,

    evidence:
      quality.evidence,

    risks:
      quality.risks,

    blockers:
      [...new Set(blockers)],

    diagnostics: {
      candleCount:
        candles.length,

      marketRegime:
        regime?.regime ??
        null,

      structurePattern:
        structure?.structurePattern ??
        null,

      volatilityRegime:
        structure?.volatility?.regime ??
        null,

      breakoutDisplacementAtr:
        finiteOrNull(
          breakout?.displacementAtr
        ),

      breakoutBodyToRange:
        finiteOrNull(
          breakout?.bodyToRange
        ),

      breakoutVolumeRatio:
        finiteOrNull(
          breakout?.volumeRatio
        ),
    },

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default detectMomentumBreakoutSetup;