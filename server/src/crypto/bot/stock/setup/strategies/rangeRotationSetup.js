/**
 * AEMA Private Stock Research Bot
 * Range Rotation Setup Detector
 *
 * Detects directional rejection from a confirmed range edge.
 *
 * BULL:
 *   Research direction = BULL
 *   Price rejects the lower range boundary
 *   Target liquidity exists toward midpoint / range high
 *
 * BEAR:
 *   Research direction = BEAR
 *   Price rejects the upper range boundary
 *   Target liquidity exists toward midpoint / range low
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
 * RANGE QUALITY
 * ---------------------------------------------------------
 */

function analyzeRangeQuality(
  structure,
  atr,
  options = {}
) {
  const high =
    positiveOrNull(
      structure?.range?.high
    );

  const low =
    positiveOrNull(
      structure?.range?.low
    );

  const midpoint =
    positiveOrNull(
      structure?.range?.midpoint
    );

  if (
    high === null ||
    low === null ||
    midpoint === null ||
    high <= low
  ) {
    return {
      available: false,

      high: null,
      low: null,
      midpoint: null,

      width: null,
      widthAtr: null,

      approved: false,

      blockers: [
        "RANGE_BOUNDARIES_UNAVAILABLE",
      ],
    };
  }

  const width =
    high - low;

  const widthAtr =
    atr !== null &&
    atr > 0
      ? width / atr
      : null;

  const blockers = [];

  const minimumWidthAtr =
    finiteOrNull(
      options.minimumRangeWidthAtr
    ) ??
    2.5;

  /*
   * A range must provide enough room for price
   * to rotate. A tiny consolidation belongs to
   * compression/breakout logic instead.
   */
  if (
    widthAtr === null ||
    widthAtr <
      minimumWidthAtr
  ) {
    blockers.push(
      "RANGE_TOO_NARROW"
    );
  }

  return {
    available: true,

    high,
    low,
    midpoint,

    width,
    widthAtr,

    minimumWidthAtr,

    approved:
      blockers.length === 0,

    blockers,
  };
}

/*
 * ---------------------------------------------------------
 * RANGE POSITION
 * ---------------------------------------------------------
 */

function calculateRangePosition(
  price,
  range
) {
  const p =
    positiveOrNull(price);

  if (
    p === null ||
    range?.available !== true ||
    !(range.width > 0)
  ) {
    return {
      available: false,
      fraction: null,
      percent: null,
      zone: "UNKNOWN",
    };
  }

  const fraction =
    (p - range.low) /
    range.width;

  const percent =
    fraction * 100;

  let zone =
    "MIDDLE";

  if (fraction <= 0.30) {
    zone =
      "LOWER_EDGE";
  } else if (
    fraction >= 0.70
  ) {
    zone =
      "UPPER_EDGE";
  }

  if (
    fraction < 0 ||
    fraction > 1
  ) {
    zone =
      "OUTSIDE_RANGE";
  }

  return {
    available: true,
    fraction,
    percent,
    zone,
  };
}

/*
 * ---------------------------------------------------------
 * REJECTION DETECTION
 * ---------------------------------------------------------
 *
 * Look for rejection near the correct range edge.
 *
 * BULL:
 *   lower wick / recovery near range low.
 *
 * BEAR:
 *   upper wick / rejection near range high.
 */

function detectRangeRejection(
  candles,
  direction,
  range,
  atr,
  options = {}
) {
  if (
    !Array.isArray(candles) ||
    candles.length < 3 ||
    range?.available !== true ||
    atr === null ||
    !(atr > 0)
  ) {
    return {
      detected: false,
      reason:
        "RANGE_REJECTION_INPUT_UNAVAILABLE",
    };
  }

  const recentCount =
    Math.max(
      1,
      Number(
        options.rejectionSearchCandles ??
        3
      )
    );

  const edgeToleranceAtr =
    finiteOrNull(
      options.edgeToleranceAtr
    ) ??
    0.50;

  const tolerance =
    atr *
    edgeToleranceAtr;

  const recent =
    candles.slice(
      -recentCount
    );

  /*
   * Search newest first.
   */
  for (
    let i =
      recent.length - 1;
    i >= 0;
    i -= 1
  ) {
    const candle =
      recent[i];

    const bodyHigh =
      Math.max(
        candle.open,
        candle.close
      );

    const bodyLow =
      Math.min(
        candle.open,
        candle.close
      );

    const body =
      Math.abs(
        candle.close -
        candle.open
      );

    const lowerWick =
      bodyLow -
      candle.low;

    const upperWick =
      candle.high -
      bodyHigh;

    const candleRange =
      candle.high -
      candle.low;

    const closeLocation =
      candleRange > 0
        ? (
            candle.close -
            candle.low
          ) /
          candleRange
        : null;

    if (direction === "BULL") {
      const reachedEdge =
        candle.low <=
        range.low +
          tolerance;

      const recovered =
        candle.close >
        range.low;

      const rejectionWick =
        lowerWick >
        upperWick &&
        (
          body === 0 ||
          lowerWick >=
            body * 0.5
        );

      const strongClose =
        closeLocation !== null &&
        closeLocation >= 0.55;

      if (
        reachedEdge &&
        recovered &&
        (
          rejectionWick ||
          strongClose
        )
      ) {
        return {
          detected: true,

          direction:
            "BULL",

          candle,

          rangeLevel:
            range.low,

          extreme:
            candle.low,

          lowerWick,
          upperWick,
          body,
          closeLocation,

          reason:
            "LOWER_RANGE_BOUNDARY_REJECTED",
        };
      }
    }

    if (direction === "BEAR") {
      const reachedEdge =
        candle.high >=
        range.high -
          tolerance;

      const rejected =
        candle.close <
        range.high;

      const rejectionWick =
        upperWick >
        lowerWick &&
        (
          body === 0 ||
          upperWick >=
            body * 0.5
        );

      const strongClose =
        closeLocation !== null &&
        closeLocation <= 0.45;

      if (
        reachedEdge &&
        rejected &&
        (
          rejectionWick ||
          strongClose
        )
      ) {
        return {
          detected: true,

          direction:
            "BEAR",

          candle,

          rangeLevel:
            range.high,

          extreme:
            candle.high,

          lowerWick,
          upperWick,
          body,
          closeLocation,

          reason:
            "UPPER_RANGE_BOUNDARY_REJECTED",
        };
      }
    }
  }

  return {
    detected: false,

    direction: null,

    candle: null,

    rangeLevel: null,

    extreme: null,

    reason:
      "NO_RANGE_EDGE_REJECTION",
  };
}

/*
 * ---------------------------------------------------------
 * ENTRY ZONE
 * ---------------------------------------------------------
 */

function buildEntryZone(
  direction,
  range,
  atr,
  options = {}
) {
  if (
    range?.available !== true ||
    atr === null ||
    !(atr > 0)
  ) {
    return {
      available: false,
      low: null,
      high: null,
      preferred: null,
    };
  }

  const widthMultiplier =
    finiteOrNull(
      options.entryZoneAtr
    ) ??
    0.40;

  const width =
    atr *
    widthMultiplier;

  if (direction === "BULL") {
    return {
      available: true,

      low:
        Math.max(
          Number.EPSILON,
          range.low -
            width * 0.10
        ),

      high:
        range.low +
        width,

      preferred:
        range.low +
        width * 0.25,

      structuralLevel:
        range.low,

      atrWidth:
        width,
    };
  }

  if (direction === "BEAR") {
    return {
      available: true,

      low:
        Math.max(
          Number.EPSILON,
          range.high -
            width
        ),

      high:
        range.high +
        width * 0.10,

      preferred:
        range.high -
        width * 0.25,

      structuralLevel:
        range.high,

      atrWidth:
        width,
    };
  }

  return {
    available: false,
    low: null,
    high: null,
    preferred: null,
  };
}

/*
 * ---------------------------------------------------------
 * INVALIDATION
 * ---------------------------------------------------------
 */

function buildInvalidation(
  direction,
  range,
  rejection,
  atr,
  options = {}
) {
  if (
    range?.available !== true ||
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
    const rejectionExtreme =
      positiveOrNull(
        rejection?.extreme
      );

    const structuralLevel =
      rejectionExtreme !== null
        ? Math.min(
            range.low,
            rejectionExtreme
          )
        : range.low;

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
        "LOWER_RANGE_BOUNDARY_INVALIDATED",
    };
  }

  if (direction === "BEAR") {
    const rejectionExtreme =
      positiveOrNull(
        rejection?.extreme
      );

    const structuralLevel =
      rejectionExtreme !== null
        ? Math.max(
            range.high,
            rejectionExtreme
          )
        : range.high;

    return {
      available: true,

      price:
        structuralLevel +
        buffer,

      structuralLevel,

      buffer,

      reason:
        "UPPER_RANGE_BOUNDARY_INVALIDATED",
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
  range,
  structure,
  entry
) {
  const preferredEntry =
    positiveOrNull(entry);

  if (
    preferredEntry === null ||
    range?.available !== true
  ) {
    return [];
  }

  const candidates = [];

  if (direction === "BULL") {
    if (
      range.midpoint >
      preferredEntry
    ) {
      candidates.push({
        price:
          range.midpoint,

        reason:
          "RANGE_MIDPOINT",
      });
    }

    const latestHigh =
      positiveOrNull(
        structure?.latestSwingHigh
          ?.price
      );

    if (
      latestHigh !== null &&
      latestHigh >
        preferredEntry
    ) {
      candidates.push({
        price:
          latestHigh,

        reason:
          "INTERNAL_SWING_HIGH",
      });
    }

    if (
      range.high >
      preferredEntry
    ) {
      candidates.push({
        price:
          range.high,

        reason:
          "OPPOSITE_RANGE_BOUNDARY",
      });
    }
  }

  if (direction === "BEAR") {
    if (
      range.midpoint <
      preferredEntry
    ) {
      candidates.push({
        price:
          range.midpoint,

        reason:
          "RANGE_MIDPOINT",
      });
    }

    const latestLow =
      positiveOrNull(
        structure?.latestSwingLow
          ?.price
      );

    if (
      latestLow !== null &&
      latestLow <
        preferredEntry
    ) {
      candidates.push({
        price:
          latestLow,

        reason:
          "INTERNAL_SWING_LOW",
      });
    }

    if (
      range.low <
      preferredEntry
    ) {
      candidates.push({
        price:
          range.low,

        reason:
          "OPPOSITE_RANGE_BOUNDARY",
      });
    }
  }

  const seen =
    new Set();

  const unique =
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

  unique.sort(
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

  return unique;
}

/*
 * ---------------------------------------------------------
 * PATTERN SCORE
 * ---------------------------------------------------------
 */

function scorePattern({
  direction,
  range,
  rangePosition,
  rejection,
  structure,
  regime,
  market,
  entryZone,
}) {
  let score = 0;

  const evidence = [];
  const risks = [];

  if (
    regime?.regime ===
    "RANGING"
  ) {
    score += 25;

    evidence.push(
      "RANGING_REGIME"
    );
  }

  if (
    range?.approved === true
  ) {
    score += 15;

    evidence.push(
      "SUFFICIENT_RANGE_WIDTH"
    );
  }

  if (
    direction === "BULL" &&
    rangePosition?.zone ===
      "LOWER_EDGE"
  ) {
    score += 15;

    evidence.push(
      "PRICE_NEAR_LOWER_RANGE_EDGE"
    );
  }

  if (
    direction === "BEAR" &&
    rangePosition?.zone ===
      "UPPER_EDGE"
  ) {
    score += 15;

    evidence.push(
      "PRICE_NEAR_UPPER_RANGE_EDGE"
    );
  }

  if (
    rejection?.detected === true &&
    rejection?.direction ===
      direction
  ) {
    score += 25;

    evidence.push(
      "DIRECTIONAL_RANGE_REJECTION"
    );
  }

  if (
    structure?.trend ===
    "NEUTRAL"
  ) {
    score += 10;

    evidence.push(
      "NON_TRENDING_STRUCTURE"
    );
  }

  const currentPrice =
    direction === "BULL"
      ? positiveOrNull(
          market?.ask
        )
      : positiveOrNull(
          market?.bid
        );

  if (
    currentPrice !== null &&
    entryZone?.available === true
  ) {
    if (
      currentPrice >=
        entryZone.low &&
      currentPrice <=
        entryZone.high
    ) {
      score += 10;

      evidence.push(
        "PRICE_INSIDE_RANGE_ENTRY_ZONE"
      );
    } else {
      risks.push(
        "PRICE_AWAY_FROM_RANGE_ENTRY_ZONE"
      );
    }
  }

  if (
    structure?.breakout?.detected ===
    true
  ) {
    risks.push(
      "ACTIVE_BREAKOUT_MAY_INVALIDATE_RANGE"
    );
  }

  if (
    structure?.volatility?.regime ===
    "EXTREME"
  ) {
    risks.push(
      "EXTREME_VOLATILITY_UNSUITABLE_FOR_RANGE_ROTATION"
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

export function detectRangeRotationSetup(
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
      "RANGE_ROTATION_DIRECTION_UNAVAILABLE"
    );
  }

  if (
    !market ||
    market.approved !== true
  ) {
    blockers.push(
      "RANGE_ROTATION_MARKET_NOT_READY"
    );
  }

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "RANGE_ROTATION_STRUCTURE_NOT_READY"
    );
  }

  if (
    !regime ||
    regime.approved !== true
  ) {
    blockers.push(
      "RANGE_ROTATION_REGIME_NOT_READY"
    );
  }

  if (
    Array.isArray(
      regime?.eligibleStrategies
    ) &&
    !regime.eligibleStrategies.includes(
      "RANGE_ROTATION"
    )
  ) {
    blockers.push(
      "RANGE_ROTATION_NOT_ELIGIBLE_FOR_REGIME"
    );
  }

  const candles =
    normalizeCandles(
      market?.candles
    );

  if (candles.length < 20) {
    blockers.push(
      "RANGE_ROTATION_INSUFFICIENT_CANDLES"
    );
  }

  const atr =
    positiveOrNull(
      structure?.atr ??
      market?.atr
    );

  if (atr === null) {
    blockers.push(
      "RANGE_ROTATION_ATR_UNAVAILABLE"
    );
  }

  const range =
    analyzeRangeQuality(
      structure,
      atr,
      options
    );

  blockers.push(
    ...range.blockers
  );

  const currentPrice =
    direction === "BULL"
      ? positiveOrNull(
          market?.ask
        )
      : direction === "BEAR"
        ? positiveOrNull(
            market?.bid
          )
        : null;

  if (currentPrice === null) {
    blockers.push(
      "RANGE_ROTATION_CURRENT_PRICE_UNAVAILABLE"
    );
  }

  const rangePosition =
    calculateRangePosition(
      currentPrice,
      range
    );

  if (
    rangePosition.available !== true
  ) {
    blockers.push(
      "RANGE_ROTATION_POSITION_UNAVAILABLE"
    );
  }

  if (
    direction === "BULL" &&
    rangePosition.zone !==
      "LOWER_EDGE"
  ) {
    blockers.push(
      "RANGE_ROTATION_BULL_NOT_AT_LOWER_EDGE"
    );
  }

  if (
    direction === "BEAR" &&
    rangePosition.zone !==
      "UPPER_EDGE"
  ) {
    blockers.push(
      "RANGE_ROTATION_BEAR_NOT_AT_UPPER_EDGE"
    );
  }

  const rejection =
    detectRangeRejection(
      candles,
      direction,
      range,
      atr,
      options
    );

  if (
    rejection.detected !== true
  ) {
    blockers.push(
      "RANGE_ROTATION_REJECTION_NOT_CONFIRMED"
    );
  }

  /*
   * An active breakout means this may no longer
   * be a range. Don't fade it as a range trade.
   */
  if (
    structure?.breakout?.detected ===
    true
  ) {
    blockers.push(
      "RANGE_ROTATION_ACTIVE_BREAKOUT"
    );
  }

  if (
    structure?.volatility?.regime ===
    "EXTREME"
  ) {
    blockers.push(
      "RANGE_ROTATION_EXTREME_VOLATILITY"
    );
  }

  const entryZone =
    buildEntryZone(
      direction,
      range,
      atr,
      options
    );

  if (
    entryZone.available !== true
  ) {
    blockers.push(
      "RANGE_ROTATION_ENTRY_ZONE_UNAVAILABLE"
    );
  }

  const invalidation =
    buildInvalidation(
      direction,
      range,
      rejection,
      atr,
      options
    );

  if (
    invalidation.available !== true
  ) {
    blockers.push(
      "RANGE_ROTATION_INVALIDATION_UNAVAILABLE"
    );
  }

  const entry =
    positiveOrNull(
      entryZone.preferred
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
      "RANGE_ROTATION_INVALID_BULL_GEOMETRY"
    );
  }

  if (
    direction === "BEAR" &&
    entry !== null &&
    stop !== null &&
    !(stop > entry)
  ) {
    blockers.push(
      "RANGE_ROTATION_INVALID_BEAR_GEOMETRY"
    );
  }

  const targets =
    buildTargets(
      direction,
      range,
      structure,
      entry
    );

  if (!targets.length) {
    blockers.push(
      "RANGE_ROTATION_TARGET_UNAVAILABLE"
    );
  }

  const quality =
    scorePattern({
      direction,
      range,
      rangePosition,
      rejection,
      structure,
      regime,
      market,
      entryZone,
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
      "RANGE_ROTATION_PATTERN_SCORE_TOO_LOW"
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
      "RANGE_ROTATION",

    matched,

    status:
      matched
        ? "PATTERN_MATCHED"
        : "PATTERN_REJECTED",

    direction,

    patternScore:
      quality.score,

    minimumPatternScore,

    range,

    rangePosition,

    rejection,

    entryZone,

    preferredEntry:
      entry,

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
      currentPrice,

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

      rangeWidthAtr:
        finiteOrNull(
          range?.widthAtr
        ),

      rangePositionPercent:
        finiteOrNull(
          rangePosition?.percent
        ),
    },

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default detectRangeRotationSetup;