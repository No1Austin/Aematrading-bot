/**
 * AEMA Private Stock Research Bot
 * Breakout + Retest Setup Detector
 *
 * Detects:
 * 1. A confirmed structural breakout
 * 2. A subsequent return toward the broken level
 * 3. Evidence that the broken level is holding
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
 * BREAKOUT SEARCH
 * ---------------------------------------------------------
 *
 * Search recent candles for a close beyond the previous
 * local range.
 *
 * The breakout level is derived only from candles that
 * existed BEFORE the breakout candle.
 */

function findRecentBreakout(
  candles,
  direction,
  atr,
  options = {}
) {
  const breakoutLookback =
    Math.max(
      5,
      Number(
        options.breakoutLookback ??
        10
      )
    );

  const recentSearch =
    Math.max(
      2,
      Number(
        options.recentBreakoutCandles ??
        6
      )
    );

  if (
    candles.length <
    breakoutLookback + 2
  ) {
    return {
      detected: false,
      reason:
        "INSUFFICIENT_BREAKOUT_HISTORY",
    };
  }

  const startIndex =
    Math.max(
      breakoutLookback,
      candles.length -
        recentSearch
    );

  /*
   * Search newest first.
   */
  for (
    let i =
      candles.length - 1;
    i >= startIndex;
    i -= 1
  ) {
    const breakoutCandle =
      candles[i];

    const prior =
      candles.slice(
        i - breakoutLookback,
        i
      );

    if (!prior.length) {
      continue;
    }

    const rangeHigh =
      Math.max(
        ...prior.map(
          (candle) =>
            candle.high
        )
      );

    const rangeLow =
      Math.min(
        ...prior.map(
          (candle) =>
            candle.low
        )
      );

    const body =
      Math.abs(
        breakoutCandle.close -
        breakoutCandle.open
      );

    const displacementAtr =
      atr !== null &&
      atr > 0
        ? body / atr
        : null;

    if (
      direction === "BULL" &&
      breakoutCandle.close >
        rangeHigh
    ) {
      return {
        detected: true,

        direction:
          "BULL",

        candleIndex:
          i,

        candle:
          breakoutCandle,

        level:
          rangeHigh,

        priorRangeHigh:
          rangeHigh,

        priorRangeLow:
          rangeLow,

        displacementAtr,
      };
    }

    if (
      direction === "BEAR" &&
      breakoutCandle.close <
        rangeLow
    ) {
      return {
        detected: true,

        direction:
          "BEAR",

        candleIndex:
          i,

        candle:
          breakoutCandle,

        level:
          rangeLow,

        priorRangeHigh:
          rangeHigh,

        priorRangeLow:
          rangeLow,

        displacementAtr,
      };
    }
  }

  return {
    detected: false,
    reason:
      "NO_RECENT_DIRECTIONAL_BREAKOUT",
  };
}

/*
 * ---------------------------------------------------------
 * RETEST
 * ---------------------------------------------------------
 */

function detectRetest(
  candles,
  breakout,
  direction,
  atr,
  options = {}
) {
  if (
    breakout?.detected !== true ||
    breakout?.candleIndex == null
  ) {
    return {
      detected: false,
      held: false,
      candle: null,
      distanceToLevel: null,
      reason:
        "BREAKOUT_REQUIRED",
    };
  }

  const level =
    positiveOrNull(
      breakout.level
    );

  if (
    level === null ||
    atr === null ||
    !(atr > 0)
  ) {
    return {
      detected: false,
      held: false,
      candle: null,
      distanceToLevel: null,
      reason:
        "RETEST_INPUT_UNAVAILABLE",
    };
  }

  const toleranceAtr =
    finiteOrNull(
      options.retestToleranceAtr
    ) ??
    0.35;

  const tolerance =
    atr * toleranceAtr;

  const afterBreakout =
    candles.slice(
      breakout.candleIndex + 1
    );

  /*
   * If the breakout is the latest candle, the setup
   * has not yet produced a confirmed retest.
   */
  if (!afterBreakout.length) {
    return {
      detected: false,
      held: false,
      candle: null,
      distanceToLevel: null,
      reason:
        "WAITING_FOR_RETEST",
    };
  }

  for (
    let i = 0;
    i < afterBreakout.length;
    i += 1
  ) {
    const candle =
      afterBreakout[i];

    if (direction === "BULL") {
      const touched =
        candle.low <=
          level + tolerance &&
        candle.high >=
          level - tolerance;

      if (!touched) {
        continue;
      }

      const held =
        candle.close >=
        level;

      return {
        detected: true,
        held,
        candle,
        distanceToLevel:
          candle.close - level,
        tolerance,
        reason:
          held
            ? "BROKEN_RESISTANCE_HELD_AS_SUPPORT"
            : "BULL_BREAKOUT_RETEST_FAILED",
      };
    }

    if (direction === "BEAR") {
      const touched =
        candle.high >=
          level - tolerance &&
        candle.low <=
          level + tolerance;

      if (!touched) {
        continue;
      }

      const held =
        candle.close <=
        level;

      return {
        detected: true,
        held,
        candle,
        distanceToLevel:
          level - candle.close,
        tolerance,
        reason:
          held
            ? "BROKEN_SUPPORT_HELD_AS_RESISTANCE"
            : "BEAR_BREAKOUT_RETEST_FAILED",
      };
    }
  }

  return {
    detected: false,
    held: false,
    candle: null,
    distanceToLevel: null,
    tolerance,
    reason:
      "RETEST_NOT_REACHED",
  };
}

/*
 * ---------------------------------------------------------
 * ENTRY ZONE
 * ---------------------------------------------------------
 */

function buildEntryZone(
  direction,
  breakout,
  atr,
  options = {}
) {
  const level =
    positiveOrNull(
      breakout?.level
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

  const zoneAtr =
    finiteOrNull(
      options.entryZoneAtr
    ) ??
    0.25;

  const width =
    atr * zoneAtr;

  /*
   * Preferred price is the actual broken
   * structural level.
   */
  return {
    available: true,

    low:
      Math.max(
        Number.EPSILON,
        level - width
      ),

    high:
      level + width,

    preferred:
      level,

    structuralLevel:
      level,

    atrWidth:
      width,

    direction,
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
  retest,
  atr,
  options = {}
) {
  if (
    atr === null ||
    !(atr > 0)
  ) {
    return {
      available: false,
      price: null,
      structuralLevel: null,
      reason: null,
    };
  }

  const bufferMultiplier =
    finiteOrNull(
      options.atrStopBufferMultiplier
    ) ??
    0.25;

  const buffer =
    atr *
    bufferMultiplier;

  let structuralLevel = null;

  if (
    direction === "BULL"
  ) {
    structuralLevel =
      positiveOrNull(
        retest?.candle?.low
      ) ??
      positiveOrNull(
        breakout?.level
      );

    if (structuralLevel === null) {
      return {
        available: false,
        price: null,
        structuralLevel: null,
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
        "BREAKOUT_RETEST_SUPPORT_FAILURE",
    };
  }

  if (
    direction === "BEAR"
  ) {
    structuralLevel =
      positiveOrNull(
        retest?.candle?.high
      ) ??
      positiveOrNull(
        breakout?.level
      );

    if (structuralLevel === null) {
      return {
        available: false,
        price: null,
        structuralLevel: null,
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
        "BREAKOUT_RETEST_RESISTANCE_FAILURE",
    };
  }

  return {
    available: false,
    price: null,
    structuralLevel: null,
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

  if (
    preferredEntry === null ||
    level === null
  ) {
    return [];
  }

  const rangeHigh =
    positiveOrNull(
      breakout?.priorRangeHigh
    );

  const rangeLow =
    positiveOrNull(
      breakout?.priorRangeLow
    );

  if (
    rangeHigh === null ||
    rangeLow === null ||
    rangeHigh <= rangeLow
  ) {
    return [];
  }

  const rangeSize =
    rangeHigh -
    rangeLow;

  const targets = [];

  /*
   * First use real known structure where possible.
   */
  if (direction === "BULL") {
    const swingHigh =
      positiveOrNull(
        structure?.latestSwingHigh
          ?.price
      );

    const externalHigh =
      positiveOrNull(
        structure?.range?.high
      );

    if (
      swingHigh !== null &&
      swingHigh > preferredEntry
    ) {
      targets.push({
        price:
          swingHigh,

        reason:
          "STRUCTURAL_SWING_HIGH",
      });
    }

    if (
      externalHigh !== null &&
      externalHigh >
        preferredEntry
    ) {
      targets.push({
        price:
          externalHigh,

        reason:
          "EXTERNAL_RANGE_HIGH",
      });
    }

    /*
     * Measured move is allowed because it is
     * derived from the actual pre-breakout range.
     */
    targets.push({
      price:
        level + rangeSize,

      reason:
        "BREAKOUT_RANGE_PROJECTION",
    });
  }

  if (direction === "BEAR") {
    const swingLow =
      positiveOrNull(
        structure?.latestSwingLow
          ?.price
      );

    const externalLow =
      positiveOrNull(
        structure?.range?.low
      );

    if (
      swingLow !== null &&
      swingLow < preferredEntry
    ) {
      targets.push({
        price:
          swingLow,

        reason:
          "STRUCTURAL_SWING_LOW",
      });
    }

    if (
      externalLow !== null &&
      externalLow <
        preferredEntry
    ) {
      targets.push({
        price:
          externalLow,

        reason:
          "EXTERNAL_RANGE_LOW",
      });
    }

    const projected =
      level - rangeSize;

    if (projected > 0) {
      targets.push({
        price:
          projected,

        reason:
          "BREAKOUT_RANGE_PROJECTION",
      });
    }
  }

  const valid =
    targets.filter(
      (target) =>
        positiveOrNull(
          target.price
        ) !== null &&
        (
          direction === "BULL"
            ? target.price >
              preferredEntry
            : target.price <
              preferredEntry
        )
    );

  const seen =
    new Set();

  const unique =
    valid.filter(
      (target) => {
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
 * PATTERN SCORE
 * ---------------------------------------------------------
 */

function scorePattern({
  direction,
  breakout,
  retest,
  structure,
  regime,
  market,
  entryZone,
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

  const displacement =
    finiteOrNull(
      breakout?.displacementAtr
    );

  if (
    displacement !== null &&
    displacement >= 0.5
  ) {
    score += 10;

    evidence.push(
      "MEANINGFUL_BREAKOUT_DISPLACEMENT"
    );
  }

  if (
    displacement !== null &&
    displacement >= 1
  ) {
    score += 5;

    evidence.push(
      "STRONG_BREAKOUT_DISPLACEMENT"
    );
  }

  if (
    retest?.detected === true
  ) {
    score += 15;

    evidence.push(
      "BROKEN_LEVEL_RETESTED"
    );
  }

  if (
    retest?.held === true
  ) {
    score += 25;

    evidence.push(
      "RETEST_HELD"
    );
  } else if (
    retest?.detected === true
  ) {
    risks.push(
      "RETEST_FAILED_TO_HOLD"
    );
  }

  if (
    regime?.regime ===
      "TRENDING" ||
    regime?.regime ===
      "EXPANSION" ||
    regime?.regime ===
      "COMPRESSION"
  ) {
    score += 10;

    evidence.push(
      "REGIME_SUPPORTS_BREAKOUT_SETUP"
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
      ratio >= 1.2
    ) {
      score += 5;

      evidence.push(
        "ABOVE_NORMAL_PARTICIPATION"
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
      score += 10;

      evidence.push(
        "PRICE_NEAR_RETEST_ENTRY"
      );
    } else {
      risks.push(
        "PRICE_AWAY_FROM_RETEST_ENTRY"
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

export function detectBreakoutRetestSetup(
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
      "BREAKOUT_RETEST_DIRECTION_UNAVAILABLE"
    );
  }

  if (
    !market ||
    market.approved !== true
  ) {
    blockers.push(
      "BREAKOUT_RETEST_MARKET_NOT_READY"
    );
  }

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "BREAKOUT_RETEST_STRUCTURE_NOT_READY"
    );
  }

  if (
    !regime ||
    regime.approved !== true
  ) {
    blockers.push(
      "BREAKOUT_RETEST_REGIME_NOT_READY"
    );
  }

  if (
    Array.isArray(
      regime?.eligibleStrategies
    ) &&
    !regime.eligibleStrategies.includes(
      "BREAKOUT_RETEST"
    )
  ) {
    blockers.push(
      "BREAKOUT_RETEST_NOT_ELIGIBLE_FOR_REGIME"
    );
  }

  const candles =
    normalizeCandles(
      market?.candles
    );

  if (candles.length < 15) {
    blockers.push(
      "BREAKOUT_RETEST_INSUFFICIENT_CANDLES"
    );
  }

  const atr =
    positiveOrNull(
      structure?.atr ??
      market?.atr
    );

  if (atr === null) {
    blockers.push(
      "BREAKOUT_RETEST_ATR_UNAVAILABLE"
    );
  }

  const breakout =
    findRecentBreakout(
      candles,
      direction,
      atr,
      options
    );

  if (
    breakout.detected !== true
  ) {
    blockers.push(
      "BREAKOUT_RETEST_BREAKOUT_NOT_FOUND"
    );
  }

  const retest =
    detectRetest(
      candles,
      breakout,
      direction,
      atr,
      options
    );

  if (
    retest.detected !== true
  ) {
    blockers.push(
      retest.reason ===
        "WAITING_FOR_RETEST"
        ? "BREAKOUT_RETEST_WAITING_FOR_RETEST"
        : "BREAKOUT_RETEST_RETEST_NOT_CONFIRMED"
    );
  }

  if (
    retest.detected === true &&
    retest.held !== true
  ) {
    blockers.push(
      "BREAKOUT_RETEST_LEVEL_FAILED"
    );
  }

  const entryZone =
    buildEntryZone(
      direction,
      breakout,
      atr,
      options
    );

  if (
    entryZone.available !== true
  ) {
    blockers.push(
      "BREAKOUT_RETEST_ENTRY_ZONE_UNAVAILABLE"
    );
  }

  const invalidation =
    buildInvalidation(
      direction,
      breakout,
      retest,
      atr,
      options
    );

  if (
    invalidation.available !== true
  ) {
    blockers.push(
      "BREAKOUT_RETEST_INVALIDATION_UNAVAILABLE"
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
      breakout,
      structure,
      entry
    );

  if (!targets.length) {
    blockers.push(
      "BREAKOUT_RETEST_TARGET_UNAVAILABLE"
    );
  }

  const quality =
    scorePattern({
      direction,
      breakout,
      retest,
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
      "BREAKOUT_RETEST_PATTERN_SCORE_TOO_LOW"
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
      "BREAKOUT_RETEST_INVALID_BULL_GEOMETRY"
    );
  }

  if (
    direction === "BEAR" &&
    entry !== null &&
    stop !== null &&
    !(stop > entry)
  ) {
    blockers.push(
      "BREAKOUT_RETEST_INVALID_BEAR_GEOMETRY"
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
      "BREAKOUT_RETEST",

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

    retest,

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

      breakoutDisplacementAtr:
        finiteOrNull(
          breakout?.displacementAtr
        ),

      retestReason:
        retest?.reason ??
        null,
    },

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default detectBreakoutRetestSetup;