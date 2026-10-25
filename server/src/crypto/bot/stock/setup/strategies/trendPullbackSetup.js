/**
 * AEMA Private Stock Research Bot
 * Trend Pullback Setup Detector
 *
 * Detects controlled retracements inside an established
 * directional market structure.
 *
 * Pattern first. Geometry second.
 *
 * This module:
 * - DOES evaluate trend-pullback quality
 * - DOES propose an entry zone
 * - DOES identify structural invalidation
 * - DOES identify structural target candidates
 * - DOES NOT approve the final setup
 * - DOES NOT execute orders
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
 * RETRACEMENT
 * ---------------------------------------------------------
 *
 * Measures how far price has retraced from the most
 * relevant confirmed impulse swing.
 */

function calculateRetracement(
  direction,
  structure,
  currentPrice
) {
  const price =
    positiveOrNull(currentPrice);

  if (price === null) {
    return {
      available: false,
      percent: null,
      zone: "UNKNOWN",
    };
  }

  let impulseStart = null;
  let impulseEnd = null;

  if (direction === "BULL") {
    impulseStart =
      positiveOrNull(
        structure?.latestSwingLow
          ?.price
      );

    impulseEnd =
      positiveOrNull(
        structure?.latestSwingHigh
          ?.price
      );
  }

  if (direction === "BEAR") {
    impulseStart =
      positiveOrNull(
        structure?.latestSwingHigh
          ?.price
      );

    impulseEnd =
      positiveOrNull(
        structure?.latestSwingLow
          ?.price
      );
  }

  if (
    impulseStart === null ||
    impulseEnd === null
  ) {
    return {
      available: false,
      percent: null,
      zone: "UNKNOWN",
    };
  }

  const impulseSize =
    Math.abs(
      impulseEnd -
      impulseStart
    );

  if (!(impulseSize > 0)) {
    return {
      available: false,
      percent: null,
      zone: "UNKNOWN",
    };
  }

  let retracement = null;

  if (direction === "BULL") {
    retracement =
      ((impulseEnd - price) /
        impulseSize) *
      100;
  }

  if (direction === "BEAR") {
    retracement =
      ((price - impulseEnd) /
        impulseSize) *
      100;
  }

  if (!Number.isFinite(retracement)) {
    return {
      available: false,
      percent: null,
      zone: "UNKNOWN",
    };
  }

  let zone = "SHALLOW";

  if (
    retracement >= 25 &&
    retracement <= 65
  ) {
    zone = "HEALTHY";
  } else if (
    retracement > 65 &&
    retracement <= 80
  ) {
    zone = "DEEP";
  } else if (
    retracement > 80
  ) {
    zone = "STRUCTURE_AT_RISK";
  } else if (
    retracement < 0
  ) {
    zone = "NO_PULLBACK";
  }

  return {
    available: true,

    percent:
      retracement,

    zone,

    impulseStart,

    impulseEnd,

    impulseSize,
  };
}

/*
 * ---------------------------------------------------------
 * ENTRY ZONE
 * ---------------------------------------------------------
 *
 * Entry is based on structural pullback territory,
 * not simply the current ask/bid.
 */

function buildEntryZone(
  direction,
  structure,
  market,
  retracement
) {
  const atr =
    positiveOrNull(
      structure?.atr ??
      market?.atr
    );

  if (
    atr === null ||
    retracement?.available !== true
  ) {
    return {
      available: false,
      low: null,
      high: null,
      preferred: null,
    };
  }

  const impulseStart =
    retracement.impulseStart;

  const impulseEnd =
    retracement.impulseEnd;

  const impulseSize =
    retracement.impulseSize;

  let zoneLow = null;
  let zoneHigh = null;

  /*
   * Use a broad structural retracement area.
   *
   * These are not treated as magical Fibonacci
   * numbers. They simply define a controlled
   * retracement band inside the impulse.
   */
  if (direction === "BULL") {
    const shallow =
      impulseEnd -
      impulseSize * 0.30;

    const deep =
      impulseEnd -
      impulseSize * 0.62;

    zoneLow =
      Math.min(
        shallow,
        deep
      );

    zoneHigh =
      Math.max(
        shallow,
        deep
      );
  }

  if (direction === "BEAR") {
    const shallow =
      impulseEnd +
      impulseSize * 0.30;

    const deep =
      impulseEnd +
      impulseSize * 0.62;

    zoneLow =
      Math.min(
        shallow,
        deep
      );

    zoneHigh =
      Math.max(
        shallow,
        deep
      );
  }

  if (
    zoneLow === null ||
    zoneHigh === null
  ) {
    return {
      available: false,
      low: null,
      high: null,
      preferred: null,
    };
  }

  /*
   * Preferred entry is weighted toward the deeper
   * half of the pullback, reducing chase risk.
   */
  const preferred =
    direction === "BULL"
      ? zoneLow +
        (zoneHigh - zoneLow) *
          0.35
      : zoneHigh -
        (zoneHigh - zoneLow) *
          0.35;

  return {
    available: true,

    low:
      zoneLow,

    high:
      zoneHigh,

    preferred,

    atr,
  };
}

/*
 * ---------------------------------------------------------
 * INVALIDATION
 * ---------------------------------------------------------
 */

function buildInvalidation(
  direction,
  structure,
  market,
  atrBufferMultiplier
) {
  const atr =
    positiveOrNull(
      structure?.atr ??
      market?.atr
    );

  if (atr === null) {
    return {
      available: false,
      price: null,
      structuralLevel: null,
      buffer: null,
      reason: null,
    };
  }

  let structuralLevel = null;

  if (direction === "BULL") {
    structuralLevel =
      positiveOrNull(
        structure?.latestSwingLow
          ?.price
      );
  }

  if (direction === "BEAR") {
    structuralLevel =
      positiveOrNull(
        structure?.latestSwingHigh
          ?.price
      );
  }

  if (structuralLevel === null) {
    return {
      available: false,
      price: null,
      structuralLevel: null,
      buffer: null,
      reason: null,
    };
  }

  const buffer =
    atr *
    atrBufferMultiplier;

  const price =
    direction === "BULL"
      ? structuralLevel - buffer
      : structuralLevel + buffer;

  return {
    available:
      Number.isFinite(price) &&
      price > 0,

    price:
      price > 0
        ? price
        : null,

    structuralLevel,

    buffer,

    reason:
      direction === "BULL"
        ? "BULLISH_HIGHER_LOW_INVALIDATED"
        : "BEARISH_LOWER_HIGH_INVALIDATED",
  };
}

/*
 * ---------------------------------------------------------
 * TARGETS
 * ---------------------------------------------------------
 */

function buildTargets(
  direction,
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

    const rangeHigh =
      positiveOrNull(
        structure?.range?.high
      );

    if (
      latestHigh !== null &&
      latestHigh > preferredEntry
    ) {
      candidates.push({
        price: latestHigh,
        reason:
          "LATEST_SWING_HIGH",
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
          "PREVIOUS_SWING_HIGH",
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
          "RANGE_HIGH",
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

    const rangeLow =
      positiveOrNull(
        structure?.range?.low
      );

    if (
      latestLow !== null &&
      latestLow < preferredEntry
    ) {
      candidates.push({
        price: latestLow,
        reason:
          "LATEST_SWING_LOW",
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
          "PREVIOUS_SWING_LOW",
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
          "RANGE_LOW",
      });
    }
  }

  /*
   * Remove duplicate price levels.
   */
  const seen = new Set();

  const unique =
    candidates.filter(
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

  /*
   * Sort nearest target first.
   */
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
  structure,
  regime,
  retracement,
  entryZone,
  market,
}) {
  let score = 0;

  const evidence = [];
  const risks = [];

  /*
   * 1. Trend structure
   */
  if (
    direction === "BULL" &&
    structure?.structurePattern ===
      "HH_HL"
  ) {
    score += 30;

    evidence.push(
      "BULLISH_HH_HL_STRUCTURE"
    );
  } else if (
    direction === "BEAR" &&
    structure?.structurePattern ===
      "LH_LL"
  ) {
    score += 30;

    evidence.push(
      "BEARISH_LH_LL_STRUCTURE"
    );
  } else {
    risks.push(
      "TREND_STRUCTURE_NOT_FULLY_ALIGNED"
    );
  }

  /*
   * 2. Regime
   */
  if (
    regime?.regime ===
    "TRENDING"
  ) {
    score += 20;

    evidence.push(
      "TRENDING_REGIME"
    );
  }

  /*
   * 3. Pullback depth
   */
  if (
    retracement?.zone ===
    "HEALTHY"
  ) {
    score += 20;

    evidence.push(
      "HEALTHY_RETRACEMENT_DEPTH"
    );
  } else if (
    retracement?.zone ===
    "DEEP"
  ) {
    score += 10;

    evidence.push(
      "DEEP_RETRACEMENT"
    );

    risks.push(
      "DEEP_PULLBACK_INCREASES_INVALIDATION_RISK"
    );
  } else if (
    retracement?.zone ===
    "STRUCTURE_AT_RISK"
  ) {
    risks.push(
      "PULLBACK_TOO_DEEP"
    );
  } else if (
    retracement?.zone ===
    "NO_PULLBACK"
  ) {
    risks.push(
      "PRICE_EXTENDED_NO_PULLBACK"
    );
  }

  /*
   * 4. Volatility
   */
  if (
    structure?.volatility?.regime ===
      "NORMAL" ||
    structure?.volatility?.regime ===
      "EXPANDING"
  ) {
    score += 10;

    evidence.push(
      "SUITABLE_VOLATILITY"
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

  /*
   * 5. Volume
   *
   * A pullback does not require extreme volume.
   * We mainly avoid rewarding unavailable evidence.
   */
  if (
    structure?.volume?.available ===
      true
  ) {
    const volumeRatio =
      finiteOrNull(
        structure.volume.ratio
      );

    if (
      volumeRatio !== null &&
      volumeRatio >= 0.7
    ) {
      score += 5;

      evidence.push(
        "ADEQUATE_MARKET_PARTICIPATION"
      );
    }
  }

  /*
   * 6. Entry-zone relationship
   */
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
      score += 15;

      evidence.push(
        "PRICE_INSIDE_PULLBACK_ENTRY_ZONE"
      );
    } else {
      risks.push(
        "PRICE_OUTSIDE_PREFERRED_ENTRY_ZONE"
      );
    }
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

export function detectTrendPullbackSetup(
  candidate,
  market,
  structure,
  regime,
  options = {}
) {
  const direction =
    normalizeDirection(
      candidate
    );

  const blockers = [];

  if (!direction) {
    blockers.push(
      "TREND_PULLBACK_DIRECTION_UNAVAILABLE"
    );
  }

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "TREND_PULLBACK_STRUCTURE_NOT_READY"
    );
  }

  if (
    !regime ||
    regime.approved !== true
  ) {
    blockers.push(
      "TREND_PULLBACK_REGIME_NOT_READY"
    );
  }

  if (
    Array.isArray(
      regime?.eligibleStrategies
    ) &&
    !regime.eligibleStrategies.includes(
      "TREND_PULLBACK"
    )
  ) {
    blockers.push(
      "TREND_PULLBACK_NOT_ELIGIBLE_FOR_REGIME"
    );
  }

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
      "TREND_PULLBACK_CURRENT_PRICE_UNAVAILABLE"
    );
  }

  const retracement =
    calculateRetracement(
      direction,
      structure,
      currentPrice
    );

  if (
    retracement.available !== true
  ) {
    blockers.push(
      "TREND_PULLBACK_RETRACEMENT_UNAVAILABLE"
    );
  }

  /*
   * A trend-pullback setup requires an actual
   * retracement. Do not chase an extension.
   */
  if (
    retracement.zone ===
    "NO_PULLBACK"
  ) {
    blockers.push(
      "TREND_PULLBACK_NOT_PRESENT"
    );
  }

  if (
    retracement.zone ===
    "STRUCTURE_AT_RISK"
  ) {
    blockers.push(
      "TREND_PULLBACK_TOO_DEEP"
    );
  }

  const entryZone =
    buildEntryZone(
      direction,
      structure,
      market,
      retracement
    );

  if (
    entryZone.available !== true
  ) {
    blockers.push(
      "TREND_PULLBACK_ENTRY_ZONE_UNAVAILABLE"
    );
  }

  const atrBufferMultiplier =
    finiteOrNull(
      options.atrStopBufferMultiplier
    ) ??
    0.25;

  const invalidation =
    buildInvalidation(
      direction,
      structure,
      market,
      atrBufferMultiplier
    );

  if (
    invalidation.available !== true
  ) {
    blockers.push(
      "TREND_PULLBACK_INVALIDATION_UNAVAILABLE"
    );
  }

  const targets =
    buildTargets(
      direction,
      structure,
      entryZone.preferred
    );

  if (!targets.length) {
    blockers.push(
      "TREND_PULLBACK_STRUCTURAL_TARGET_UNAVAILABLE"
    );
  }

  const quality =
    scorePattern({
      direction,
      structure,
      regime,
      retracement,
      entryZone,
      market,
    });

  const minimumPatternScore =
    finiteOrNull(
      options.minimumPatternScore
    ) ??
    65;

  if (
    quality.score <
    minimumPatternScore
  ) {
    blockers.push(
      "TREND_PULLBACK_PATTERN_SCORE_TOO_LOW"
    );
  }

  /*
   * Calculate preliminary R:R against every real
   * structural target.
   *
   * Do not manufacture a target to satisfy R:R.
   */
  const entry =
    positiveOrNull(
      entryZone.preferred
    );

  const stop =
    positiveOrNull(
      invalidation.price
    );

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

  /*
   * Geometry safety.
   */
  if (
    direction === "BULL" &&
    entry !== null &&
    stop !== null &&
    !(stop < entry)
  ) {
    blockers.push(
      "TREND_PULLBACK_INVALID_BULL_GEOMETRY"
    );
  }

  if (
    direction === "BEAR" &&
    entry !== null &&
    stop !== null &&
    !(stop > entry)
  ) {
    blockers.push(
      "TREND_PULLBACK_INVALID_BEAR_GEOMETRY"
    );
  }

  const matched =
    blockers.length === 0;

  return {
    strategy:
      "TREND_PULLBACK",

    matched,

    status:
      matched
        ? "PATTERN_MATCHED"
        : "PATTERN_REJECTED",

    direction,

    patternScore:
      quality.score,

    minimumPatternScore,

    retracement,

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

      structurePattern:
        structure?.structurePattern ??
        null,

      marketRegime:
        regime?.regime ??
        null,

      volatilityRegime:
        structure?.volatility?.regime ??
        null,

      volumeRatio:
        finiteOrNull(
          structure?.volume?.ratio
        ),

      averageTargetRiskReward:
        average(
          targetsWithRisk.map(
            (target) =>
              target.riskReward
          )
        ),
    },

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default detectTrendPullbackSetup;