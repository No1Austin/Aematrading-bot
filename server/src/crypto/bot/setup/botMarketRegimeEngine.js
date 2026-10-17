/**
 * AEMA Private Futures Research Bot
 * Market Regime Engine
 *
 * Converts structural market evidence into a regime
 * classification used by the setup-strategy layer.
 *
 * IMPORTANT:
 * - Does NOT determine BULL / BEAR research direction.
 * - Does NOT create entries, stops or targets.
 * - Does NOT execute orders.
 *
 * The research direction engine remains authoritative.
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

function unique(values = []) {
  return [...new Set(values)];
}

function normalizeResearchDirection(candidate) {
  const raw =
    candidate?.directionDecision?.direction ??
    candidate?.direction ??
    null;

  if (!raw) {
    return null;
  }

  const value =
    String(raw).toUpperCase();

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

/*
 * ---------------------------------------------------------
 * REGIME SCORES
 * ---------------------------------------------------------
 *
 * These are regime-detection scores, not trade confidence.
 *
 * Several regimes may have evidence simultaneously.
 * The highest valid score becomes the primary regime.
 */

function scoreTrend(structure) {
  let score = 0;
  const reasons = [];

  if (
    structure?.structurePattern ===
    "HH_HL"
  ) {
    score += 55;

    reasons.push(
      "HIGHER_HIGH_HIGHER_LOW_STRUCTURE"
    );
  }

  if (
    structure?.structurePattern ===
    "LH_LL"
  ) {
    score += 55;

    reasons.push(
      "LOWER_HIGH_LOWER_LOW_STRUCTURE"
    );
  }

  if (
    structure?.trend ===
      "BULLISH" ||
    structure?.trend ===
      "BEARISH"
  ) {
    score += 20;

    reasons.push(
      "DIRECTIONAL_SWING_STRUCTURE"
    );
  }

  if (
    structure?.volatility?.regime ===
    "NORMAL"
  ) {
    score += 10;

    reasons.push(
      "NORMAL_VOLATILITY"
    );
  }

  if (
    structure?.volatility?.regime ===
    "EXPANDING"
  ) {
    score += 10;

    reasons.push(
      "TREND_WITH_EXPANDING_VOLATILITY"
    );
  }

  if (
    structure?.volume?.available ===
      true &&
    finiteOrNull(
      structure?.volume?.ratio
    ) !== null &&
    structure.volume.ratio >= 1
  ) {
    score += 5;

    reasons.push(
      "PARTICIPATION_SUPPORTS_TREND"
    );
  }

  return {
    score: clamp(score),
    reasons,
  };
}

function scoreCompression(structure) {
  let score = 0;
  const reasons = [];

  if (
    structure?.structurePattern ===
    "COMPRESSION"
  ) {
    score += 45;

    reasons.push(
      "CONVERGING_SWING_STRUCTURE"
    );
  }

  if (
    structure?.volatility?.regime ===
    "COMPRESSED"
  ) {
    score += 40;

    reasons.push(
      "VOLATILITY_COMPRESSION"
    );
  }

  const rangeWidth =
    finiteOrNull(
      structure?.range?.widthPercent
    );

  const atrPercent =
    finiteOrNull(
      structure?.volatility?.atrPercent
    );

  /*
   * Compare range width with ATR rather than
   * hard-coding one universal percentage across
   * all crypto assets.
   */
  if (
    rangeWidth !== null &&
    atrPercent !== null &&
    atrPercent > 0 &&
    rangeWidth <=
      atrPercent * 6
  ) {
    score += 15;

    reasons.push(
      "RELATIVELY_TIGHT_RANGE"
    );
  }

  return {
    score: clamp(score),
    reasons,
  };
}

function scoreExpansion(structure) {
  let score = 0;
  const reasons = [];

  if (
    structure?.volatility?.regime ===
    "EXPANDING"
  ) {
    score += 35;

    reasons.push(
      "VOLATILITY_EXPANSION"
    );
  }

  if (
    structure?.volatility?.regime ===
    "EXTREME"
  ) {
    score += 30;

    reasons.push(
      "EXTREME_VOLATILITY"
    );
  }

  if (
    structure?.breakout?.detected ===
    true
  ) {
    score += 35;

    reasons.push(
      "STRUCTURAL_BREAKOUT"
    );
  }

  const displacementAtr =
    finiteOrNull(
      structure?.breakout
        ?.displacementAtr
    );

  if (
    displacementAtr !== null &&
    displacementAtr >= 0.75
  ) {
    score += 20;

    reasons.push(
      "STRONG_BREAKOUT_DISPLACEMENT"
    );
  }

  if (
    structure?.volume?.available ===
      true &&
    finiteOrNull(
      structure?.volume?.ratio
    ) !== null &&
    structure.volume.ratio >= 1.3
  ) {
    score += 10;

    reasons.push(
      "EXPANDED_VOLUME"
    );
  }

  return {
    score: clamp(score),
    reasons,
  };
}

function scoreSweep(structure) {
  let score = 0;
  const reasons = [];

  if (
    structure?.liquiditySweep
      ?.detected === true
  ) {
    score += 60;

    reasons.push(
      "LIQUIDITY_EXTREME_SWEPT"
    );
  }

  if (
    structure?.liquiditySweep
      ?.reclaimed === true
  ) {
    score += 25;

    reasons.push(
      "SWEPT_LEVEL_RECLAIMED"
    );
  }

  if (
    structure?.volatility?.regime ===
      "EXPANDING" ||
    structure?.volatility?.regime ===
      "EXTREME"
  ) {
    score += 10;

    reasons.push(
      "SWEEP_WITH_VOLATILITY"
    );
  }

  if (
    structure?.volume?.available ===
      true &&
    finiteOrNull(
      structure?.volume?.ratio
    ) !== null &&
    structure.volume.ratio >= 1.2
  ) {
    score += 5;

    reasons.push(
      "SWEEP_WITH_PARTICIPATION"
    );
  }

  return {
    score: clamp(score),
    reasons,
  };
}

function scoreRange(structure) {
  let score = 0;
  const reasons = [];

  if (
    structure?.trend ===
    "NEUTRAL"
  ) {
    score += 30;

    reasons.push(
      "NO_CONFIRMED_DIRECTIONAL_STRUCTURE"
    );
  }

  if (
    structure?.structurePattern ===
    "COMPRESSION"
  ) {
    /*
     * Compression can exist inside a range,
     * but it should not by itself dominate.
     */
    score += 15;

    reasons.push(
      "CONTAINED_STRUCTURE"
    );
  }

  if (
    structure?.breakout?.detected !==
      true &&
    structure?.liquiditySweep
      ?.detected !== true
  ) {
    score += 20;

    reasons.push(
      "NO_ACTIVE_BREAKOUT_OR_SWEEP"
    );
  }

  if (
    structure?.volatility?.regime ===
    "NORMAL"
  ) {
    score += 20;

    reasons.push(
      "STABLE_RANGE_VOLATILITY"
    );
  }

  if (
    structure?.range?.high != null &&
    structure?.range?.low != null &&
    structure?.range?.midpoint != null
  ) {
    score += 15;

    reasons.push(
      "DEFINED_RANGE_BOUNDARIES"
    );
  }

  return {
    score: clamp(score),
    reasons,
  };
}

/*
 * ---------------------------------------------------------
 * DIRECTION ALIGNMENT
 * ---------------------------------------------------------
 */

function determineAlignment(
  researchDirection,
  structure
) {
  if (!researchDirection) {
    return {
      aligned: false,
      state: "UNKNOWN",
      reason:
        "RESEARCH_DIRECTION_UNAVAILABLE",
    };
  }

  const structuralDirection =
    structure?.trend === "BULLISH"
      ? "BULL"
      : structure?.trend === "BEARISH"
        ? "BEAR"
        : null;

  if (!structuralDirection) {
    return {
      aligned: null,
      state: "NEUTRAL_STRUCTURE",
      reason:
        "STRUCTURE_NOT_DIRECTIONAL",
    };
  }

  if (
    structuralDirection ===
    researchDirection
  ) {
    return {
      aligned: true,
      state: "ALIGNED",
      reason:
        "RESEARCH_AND_STRUCTURE_AGREE",
    };
  }

  return {
    aligned: false,
    state: "CONFLICT",
    reason:
      "RESEARCH_AND_STRUCTURE_CONFLICT",
  };
}

/*
 * ---------------------------------------------------------
 * STRATEGY ELIGIBILITY
 * ---------------------------------------------------------
 */

function strategiesForRegime(
  regime,
  structure,
  researchDirection
) {
  const strategies = [];

  const breakoutDirection =
    structure?.breakout?.direction ??
    null;

  const sweepDirection =
    structure?.liquiditySweep
      ?.direction ??
    null;

  if (regime === "TRENDING") {
    strategies.push(
      "TREND_PULLBACK"
    );

    strategies.push(
      "BREAKOUT_RETEST"
    );
  }

  if (regime === "COMPRESSION") {
    strategies.push(
      "BREAKOUT_RETEST"
    );

    /*
     * Momentum breakout will still require
     * actual breakout confirmation in its own
     * strategy detector.
     */
    strategies.push(
      "MOMENTUM_BREAKOUT"
    );
  }

  if (regime === "EXPANSION") {
    if (
      breakoutDirection ===
      researchDirection
    ) {
      strategies.push(
        "MOMENTUM_BREAKOUT"
      );

      strategies.push(
        "BREAKOUT_RETEST"
      );
    }
  }

  if (regime === "LIQUIDITY_SWEEP") {
    if (
      sweepDirection ===
      researchDirection
    ) {
      strategies.push(
        "LIQUIDITY_SWEEP"
      );
    }
  }

  if (regime === "RANGING") {
    strategies.push(
      "RANGE_ROTATION"
    );

    if (
      sweepDirection ===
      researchDirection
    ) {
      strategies.push(
        "LIQUIDITY_SWEEP"
      );
    }
  }

  return unique(strategies);
}

/*
 * ---------------------------------------------------------
 * PRIMARY REGIME SELECTION
 * ---------------------------------------------------------
 */

function selectPrimaryRegime(scores) {
  /*
   * A real sweep is structurally distinct enough
   * to receive priority when strongly confirmed.
   */
  if (
    scores.LIQUIDITY_SWEEP.score >= 75
  ) {
    return "LIQUIDITY_SWEEP";
  }

  /*
   * A confirmed breakout + expansion should take
   * precedence over the previous trending state.
   */
  if (
    scores.EXPANSION.score >= 70
  ) {
    return "EXPANSION";
  }

  if (
    scores.COMPRESSION.score >= 70
  ) {
    return "COMPRESSION";
  }

  if (
    scores.TRENDING.score >= 65
  ) {
    return "TRENDING";
  }

  if (
    scores.RANGING.score >= 60
  ) {
    return "RANGING";
  }

  return "UNCLEAR";
}

/*
 * ---------------------------------------------------------
 * MAIN ENGINE
 * ---------------------------------------------------------
 */

export function classifyBotMarketRegime(
  candidate,
  structure,
  options = {}
) {
  const blockers = [];

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "MARKET_STRUCTURE_NOT_READY"
    );
  }

  const researchDirection =
    normalizeResearchDirection(
      candidate
    );

  if (!researchDirection) {
    blockers.push(
      "RESEARCH_DIRECTION_UNAVAILABLE"
    );
  }

  const trendScore =
    scoreTrend(structure);

  const compressionScore =
    scoreCompression(structure);

  const expansionScore =
    scoreExpansion(structure);

  const sweepScore =
    scoreSweep(structure);

  const rangeScore =
    scoreRange(structure);

  const scores = {
    TRENDING:
      trendScore,

    COMPRESSION:
      compressionScore,

    EXPANSION:
      expansionScore,

    LIQUIDITY_SWEEP:
      sweepScore,

    RANGING:
      rangeScore,
  };

  const primaryRegime =
    selectPrimaryRegime(
      scores
    );

  if (
    primaryRegime === "UNCLEAR"
  ) {
    blockers.push(
      "MARKET_REGIME_UNCLEAR"
    );
  }

  const alignment =
    determineAlignment(
      researchDirection,
      structure
    );

  /*
   * A structural conflict is important evidence,
   * but we do not fabricate a new research direction.
   */
  if (
    alignment.state ===
    "CONFLICT"
  ) {
    blockers.push(
      "STRUCTURE_DIRECTION_CONFLICT"
    );
  }

  /*
   * Regime-specific directional conflicts.
   */
  if (
    primaryRegime ===
      "EXPANSION" &&
    structure?.breakout?.direction &&
    structure.breakout.direction !==
      researchDirection
  ) {
    blockers.push(
      "BREAKOUT_OPPOSES_RESEARCH_DIRECTION"
    );
  }

  if (
    primaryRegime ===
      "LIQUIDITY_SWEEP" &&
    structure?.liquiditySweep
      ?.direction &&
    structure.liquiditySweep.direction !==
      researchDirection
  ) {
    blockers.push(
      "LIQUIDITY_SWEEP_OPPOSES_RESEARCH_DIRECTION"
    );
  }

  const eligibleStrategies =
    strategiesForRegime(
      primaryRegime,
      structure,
      researchDirection
    );

  if (
    eligibleStrategies.length === 0
  ) {
    blockers.push(
      "NO_STRATEGY_ELIGIBLE_FOR_REGIME"
    );
  }

  const primaryScore =
    primaryRegime !== "UNCLEAR"
      ? scores[
          primaryRegime
        ]?.score ?? null
      : null;

  const approved =
    blockers.length === 0;

  return {
    approved,

    status:
      approved
        ? "MARKET_REGIME_READY"
        : "MARKET_REGIME_BLOCKED",

    regime:
      primaryRegime,

    regimeScore:
      primaryScore,

    researchDirection,

    structuralDirection:
      structure?.trend === "BULLISH"
        ? "BULL"
        : structure?.trend === "BEARISH"
          ? "BEAR"
          : "NEUTRAL",

    alignment,

    scores,

    eligibleStrategies,

    /*
     * Useful downstream context.
     */
    context: {
      structurePattern:
        structure?.structurePattern ??
        null,

      volatility:
        structure?.volatility?.regime ??
        null,

      breakout:
        structure?.breakout ??
        null,

      liquiditySweep:
        structure?.liquiditySweep ??
        null,

      range:
        structure?.range ??
        null,

      volume:
        structure?.volume ??
        null,
    },

    blockers:
      unique(blockers),

    observedAt:
      new Date().toISOString(),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default classifyBotMarketRegime;