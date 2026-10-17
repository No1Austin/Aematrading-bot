/**
 * AEMA Private Futures Research Bot
 * Liquidity Sweep Reversal Setup Detector
 *
 * Detects a sweep of a meaningful recent price extreme
 * followed by reclaim/rejection in the research direction.
 *
 * BULL:
 *   price trades below a prior low and closes back above it.
 *
 * BEAR:
 *   price trades above a prior high and closes back below it.
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

/*
 * ---------------------------------------------------------
 * RECENT SWEEP SEARCH
 * ---------------------------------------------------------
 *
 * Do not only inspect the latest candle.
 * A sweep may have occurred several candles ago and price
 * may now be producing confirmation.
 *
 * Each potential sweep is evaluated against price action
 * that existed before that candle.
 */

function findRecentLiquiditySweep(
  candles,
  direction,
  atr,
  options = {}
) {
  const referenceLookback =
    Math.max(
      5,
      Number(
        options.referenceLookback ??
        10
      )
    );

  const recentSearch =
    Math.max(
      2,
      Number(
        options.recentSweepCandles ??
        5
      )
    );

  if (
    candles.length <
    referenceLookback + 2
  ) {
    return {
      detected: false,
      reclaimed: false,
      reason:
        "INSUFFICIENT_SWEEP_HISTORY",
    };
  }

  const startIndex =
    Math.max(
      referenceLookback,
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
        i - referenceLookback,
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

    /*
     * BULL:
     * sweep below prior low,
     * then close back above prior low.
     */
    if (
      direction === "BULL" &&
      candle.low < priorLow &&
      candle.close > priorLow
    ) {
      const penetration =
        priorLow -
        candle.low;

      return {
        detected: true,

        reclaimed: true,

        direction:
          "BULL",

        candleIndex:
          i,

        candle,

        level:
          priorLow,

        extreme:
          candle.low,

        priorHigh,
        priorLow,

        penetration,

        penetrationAtr:
          atr !== null &&
          atr > 0
            ? penetration / atr
            : null,

        reason:
          "SELL_SIDE_LIQUIDITY_SWEPT_AND_RECLAIMED",
      };
    }

    /*
     * BEAR:
     * sweep above prior high,
     * then close back below prior high.
     */
    if (
      direction === "BEAR" &&
      candle.high > priorHigh &&
      candle.close < priorHigh
    ) {
      const penetration =
        candle.high -
        priorHigh;

      return {
        detected: true,

        reclaimed: true,

        direction:
          "BEAR",

        candleIndex:
          i,

        candle,

        level:
          priorHigh,

        extreme:
          candle.high,

        priorHigh,
        priorLow,

        penetration,

        penetrationAtr:
          atr !== null &&
          atr > 0
            ? penetration / atr
            : null,

        reason:
          "BUY_SIDE_LIQUIDITY_SWEPT_AND_RECLAIMED",
      };
    }
  }

  return {
    detected: false,

    reclaimed: false,

    direction: null,

    candleIndex: null,

    candle: null,

    level: null,

    extreme: null,

    penetration: null,

    penetrationAtr: null,

    reason:
      "NO_DIRECTIONAL_LIQUIDITY_SWEEP",
  };
}

/*
 * ---------------------------------------------------------
 * CONFIRMATION
 * ---------------------------------------------------------
 *
 * The sweep candle itself is useful evidence, but we prefer
 * subsequent price action that remains on the reclaimed
 * side of the swept level.
 */

function analyzeConfirmation(
  candles,
  sweep,
  direction
) {
  if (
    sweep?.detected !== true ||
    sweep?.candleIndex == null
  ) {
    return {
      available: false,
      confirmed: false,
      reason:
        "SWEEP_REQUIRED",
    };
  }

  const level =
    positiveOrNull(
      sweep.level
    );

  if (level === null) {
    return {
      available: false,
      confirmed: false,
      reason:
        "SWEEP_LEVEL_UNAVAILABLE",
    };
  }

  const after =
    candles.slice(
      sweep.candleIndex + 1
    );

  /*
   * A latest-candle sweep can still be a legitimate
   * pattern candidate, but confirmation is pending.
   */
  if (!after.length) {
    return {
      available: false,

      confirmed: false,

      candlesAfterSweep: 0,

      reason:
        "WAITING_FOR_POST_SWEEP_CONFIRMATION",
    };
  }

  const latest =
    after.at(-1);

  if (direction === "BULL") {
    const failed =
      after.some(
        (candle) =>
          candle.close <
          level
      );

    const confirmed =
      !failed &&
      latest.close >
        level;

    return {
      available: true,

      confirmed,

      candlesAfterSweep:
        after.length,

      latestClose:
        latest.close,

      reason:
        confirmed
          ? "SELL_SIDE_SWEEP_RECLAIM_HELD"
          : "SELL_SIDE_RECLAIM_FAILED",
    };
  }

  if (direction === "BEAR") {
    const failed =
      after.some(
        (candle) =>
          candle.close >
          level
      );

    const confirmed =
      !failed &&
      latest.close <
        level;

    return {
      available: true,

      confirmed,

      candlesAfterSweep:
        after.length,

      latestClose:
        latest.close,

      reason:
        confirmed
          ? "BUY_SIDE_SWEEP_RECLAIM_HELD"
          : "BUY_SIDE_RECLAIM_FAILED",
    };
  }

  return {
    available: false,
    confirmed: false,
    reason:
      "INVALID_DIRECTION",
  };
}

/*
 * ---------------------------------------------------------
 * ENTRY ZONE
 * ---------------------------------------------------------
 *
 * Entry is around the reclaimed structural level.
 * We do not simply use the current ask/bid.
 */

function buildEntryZone(
  direction,
  sweep,
  atr,
  options = {}
) {
  const level =
    positiveOrNull(
      sweep?.level
    );

  if (
    level === null ||
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
    0.25;

  const width =
    atr *
    widthMultiplier;

  let low = null;
  let high = null;
  let preferred = null;

  if (direction === "BULL") {
    low =
      Math.max(
        Number.EPSILON,
        level -
          width * 0.25
      );

    high =
      level + width;

    preferred =
      level +
      width * 0.25;
  }

  if (direction === "BEAR") {
    low =
      Math.max(
        Number.EPSILON,
        level - width
      );

    high =
      level +
      width * 0.25;

    preferred =
      level -
      width * 0.25;
  }

  return {
    available:
      low !== null &&
      high !== null &&
      preferred !== null &&
      preferred > 0,

    low,
    high,
    preferred,

    structuralLevel:
      level,

    atrWidth:
      width,
  };
}

/*
 * ---------------------------------------------------------
 * INVALIDATION
 * ---------------------------------------------------------
 *
 * The thesis fails beyond the actual sweep extreme,
 * with a small volatility buffer.
 */

function buildInvalidation(
  direction,
  sweep,
  atr,
  options = {}
) {
  const extreme =
    positiveOrNull(
      sweep?.extreme
    );

  if (
    extreme === null ||
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
    const price =
      extreme - buffer;

    return {
      available:
        price > 0,

      price:
        price > 0
          ? price
          : null,

      structuralLevel:
        extreme,

      buffer,

      reason:
        "SELL_SIDE_SWEEP_EXTREME_INVALIDATED",
    };
  }

  if (direction === "BEAR") {
    return {
      available: true,

      price:
        extreme + buffer,

      structuralLevel:
        extreme,

      buffer,

      reason:
        "BUY_SIDE_SWEEP_EXTREME_INVALIDATED",
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
 *
 * Targets are actual opposing structural/liquidity levels.
 */

function buildTargets(
  direction,
  sweep,
  structure,
  entry
) {
  const preferredEntry =
    positiveOrNull(entry);

  if (preferredEntry === null) {
    return [];
  }

  const candidates = [];

  if (direction === "BULL") {
    const latestHigh =
      positiveOrNull(
        structure?.latestSwingHigh
          ?.price
      );

    const previousHigh =
      positiveOrNull(
        structure?.previousSwingHigh
          ?.price
      );

    const rangeMid =
      positiveOrNull(
        structure?.range?.midpoint
      );

    const rangeHigh =
      positiveOrNull(
        structure?.range?.high
      );

    if (
      rangeMid !== null &&
      rangeMid >
        preferredEntry
    ) {
      candidates.push({
        price: rangeMid,
        reason:
          "RANGE_MIDPOINT",
      });
    }

    if (
      latestHigh !== null &&
      latestHigh >
        preferredEntry
    ) {
      candidates.push({
        price: latestHigh,
        reason:
          "LATEST_SWING_HIGH_LIQUIDITY",
      });
    }

    if (
      previousHigh !== null &&
      previousHigh >
        preferredEntry
    ) {
      candidates.push({
        price: previousHigh,
        reason:
          "PREVIOUS_SWING_HIGH_LIQUIDITY",
      });
    }

    if (
      rangeHigh !== null &&
      rangeHigh >
        preferredEntry
    ) {
      candidates.push({
        price: rangeHigh,
        reason:
          "RANGE_HIGH_LIQUIDITY",
      });
    }

    const opposingExtreme =
      positiveOrNull(
        sweep?.priorHigh
      );

    if (
      opposingExtreme !== null &&
      opposingExtreme >
        preferredEntry
    ) {
      candidates.push({
        price:
          opposingExtreme,

        reason:
          "OPPOSING_PRE_SWEEP_RANGE_HIGH",
      });
    }
  }

  if (direction === "BEAR") {
    const latestLow =
      positiveOrNull(
        structure?.latestSwingLow
          ?.price
      );

    const previousLow =
      positiveOrNull(
        structure?.previousSwingLow
          ?.price
      );

    const rangeMid =
      positiveOrNull(
        structure?.range?.midpoint
      );

    const rangeLow =
      positiveOrNull(
        structure?.range?.low
      );

    if (
      rangeMid !== null &&
      rangeMid <
        preferredEntry
    ) {
      candidates.push({
        price: rangeMid,
        reason:
          "RANGE_MIDPOINT",
      });
    }

    if (
      latestLow !== null &&
      latestLow <
        preferredEntry
    ) {
      candidates.push({
        price: latestLow,
        reason:
          "LATEST_SWING_LOW_LIQUIDITY",
      });
    }

    if (
      previousLow !== null &&
      previousLow <
        preferredEntry
    ) {
      candidates.push({
        price: previousLow,
        reason:
          "PREVIOUS_SWING_LOW_LIQUIDITY",
      });
    }

    if (
      rangeLow !== null &&
      rangeLow <
        preferredEntry
    ) {
      candidates.push({
        price: rangeLow,
        reason:
          "RANGE_LOW_LIQUIDITY",
      });
    }

    const opposingExtreme =
      positiveOrNull(
        sweep?.priorLow
      );

    if (
      opposingExtreme !== null &&
      opposingExtreme <
        preferredEntry
    ) {
      candidates.push({
        price:
          opposingExtreme,

        reason:
          "OPPOSING_PRE_SWEEP_RANGE_LOW",
      });
    }
  }

  const seen =
    new Set();

  const unique =
    candidates.filter(
      (target) => {
        if (
          positiveOrNull(
            target.price
          ) === null
        ) {
          return false;
        }

        const validDirection =
          direction === "BULL"
            ? target.price >
              preferredEntry
            : target.price <
              preferredEntry;

        if (!validDirection) {
          return false;
        }

        const key =
          Number(
            target.price
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
 * PATTERN QUALITY
 * ---------------------------------------------------------
 */

function scorePattern({
  direction,
  sweep,
  confirmation,
  structure,
  regime,
  market,
  entryZone,
}) {
  let score = 0;

  const evidence = [];
  const risks = [];

  if (
    sweep?.detected === true &&
    sweep?.direction ===
      direction
  ) {
    score += 30;

    evidence.push(
      "DIRECTIONAL_LIQUIDITY_SWEEP"
    );
  }

  if (
    sweep?.reclaimed === true
  ) {
    score += 20;

    evidence.push(
      "SWEPT_LEVEL_RECLAIMED"
    );
  }

  if (
    confirmation?.confirmed ===
    true
  ) {
    score += 20;

    evidence.push(
      "POST_SWEEP_RECLAIM_HELD"
    );
  } else if (
    confirmation?.available ===
    true
  ) {
    risks.push(
      "POST_SWEEP_CONFIRMATION_FAILED"
    );
  } else {
    risks.push(
      "POST_SWEEP_CONFIRMATION_PENDING"
    );
  }

  const penetrationAtr =
    finiteOrNull(
      sweep?.penetrationAtr
    );

  /*
   * Require a meaningful sweep, but don't reward
   * an enormous dislocation excessively.
   */
  if (
    penetrationAtr !== null &&
    penetrationAtr >= 0.10 &&
    penetrationAtr <= 1.25
  ) {
    score += 10;

    evidence.push(
      "MEANINGFUL_SWEEP_PENETRATION"
    );
  } else if (
    penetrationAtr !== null &&
    penetrationAtr > 1.25
  ) {
    risks.push(
      "SWEEP_PENETRATION_EXTREME"
    );
  }

  if (
    regime?.regime ===
      "LIQUIDITY_SWEEP"
  ) {
    score += 10;

    evidence.push(
      "LIQUIDITY_SWEEP_REGIME"
    );
  }

  if (
    regime?.regime ===
      "RANGING"
  ) {
    score += 5;

    evidence.push(
      "RANGE_EXTREME_CONTEXT"
    );
  }

  if (
    structure?.volume?.available ===
      true
  ) {
    const ratio =
      finiteOrNull(
        structure.volume.ratio
      );

    if (
      ratio !== null &&
      ratio >= 1.1
    ) {
      score += 5;

      evidence.push(
        "SWEEP_PARTICIPATION_PRESENT"
      );
    }
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
      score += 5;

      evidence.push(
        "PRICE_NEAR_RECLAIM_ENTRY_ZONE"
      );
    } else {
      risks.push(
        "PRICE_EXTENDED_FROM_SWEEP_ENTRY"
      );
    }
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

export function detectLiquiditySweepSetup(
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
      "LIQUIDITY_SWEEP_DIRECTION_UNAVAILABLE"
    );
  }

  if (
    !market ||
    market.approved !== true
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_MARKET_NOT_READY"
    );
  }

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_STRUCTURE_NOT_READY"
    );
  }

  if (
    !regime ||
    regime.approved !== true
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_REGIME_NOT_READY"
    );
  }

  if (
    Array.isArray(
      regime?.eligibleStrategies
    ) &&
    !regime.eligibleStrategies.includes(
      "LIQUIDITY_SWEEP"
    )
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_NOT_ELIGIBLE_FOR_REGIME"
    );
  }

  const candles =
    normalizeCandles(
      market?.candles
    );

  if (candles.length < 15) {
    blockers.push(
      "LIQUIDITY_SWEEP_INSUFFICIENT_CANDLES"
    );
  }

  const atr =
    positiveOrNull(
      structure?.atr ??
      market?.atr
    );

  if (atr === null) {
    blockers.push(
      "LIQUIDITY_SWEEP_ATR_UNAVAILABLE"
    );
  }

  const sweep =
    findRecentLiquiditySweep(
      candles,
      direction,
      atr,
      options
    );

  if (
    sweep.detected !== true
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_NOT_FOUND"
    );
  }

  const confirmation =
    analyzeConfirmation(
      candles,
      sweep,
      direction
    );

  /*
   * Require post-sweep confirmation.
   *
   * This intentionally rejects a sweep that occurred
   * on the latest candle until subsequent price action
   * confirms that the reclaim held.
   */
  if (
    confirmation.confirmed !== true
  ) {
    blockers.push(
      confirmation.reason ===
        "WAITING_FOR_POST_SWEEP_CONFIRMATION"
        ? "LIQUIDITY_SWEEP_WAITING_FOR_CONFIRMATION"
        : "LIQUIDITY_SWEEP_CONFIRMATION_FAILED"
    );
  }

  const entryZone =
    buildEntryZone(
      direction,
      sweep,
      atr,
      options
    );

  if (
    entryZone.available !== true
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_ENTRY_ZONE_UNAVAILABLE"
    );
  }

  const invalidation =
    buildInvalidation(
      direction,
      sweep,
      atr,
      options
    );

  if (
    invalidation.available !== true
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_INVALIDATION_UNAVAILABLE"
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

  const targets =
    buildTargets(
      direction,
      sweep,
      structure,
      entry
    );

  if (!targets.length) {
    blockers.push(
      "LIQUIDITY_SWEEP_TARGET_UNAVAILABLE"
    );
  }

  const quality =
    scorePattern({
      direction,
      sweep,
      confirmation,
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
      "LIQUIDITY_SWEEP_PATTERN_SCORE_TOO_LOW"
    );
  }

  /*
   * Geometry validation.
   */
  if (
    direction === "BULL" &&
    entry !== null &&
    stop !== null &&
    !(stop < entry)
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_INVALID_BULL_GEOMETRY"
    );
  }

  if (
    direction === "BEAR" &&
    entry !== null &&
    stop !== null &&
    !(stop > entry)
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_INVALID_BEAR_GEOMETRY"
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

  const currentPrice =
    direction === "BULL"
      ? positiveOrNull(
          market?.ask
        )
      : positiveOrNull(
          market?.bid
        );

  const matched =
    blockers.length === 0;

  return {
    strategy:
      "LIQUIDITY_SWEEP",

    matched,

    status:
      matched
        ? "PATTERN_MATCHED"
        : "PATTERN_REJECTED",

    direction,

    patternScore:
      quality.score,

    minimumPatternScore,

    sweep,

    confirmation,

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

      sweepPenetrationAtr:
        finiteOrNull(
          sweep?.penetrationAtr
        ),

      confirmationReason:
        confirmation?.reason ??
        null,
    },

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default detectLiquiditySweepSetup;