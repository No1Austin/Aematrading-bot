/**
 * AEMA Private Futures Research Bot
 * Setup Strategy Selection Engine
 *
 * Chooses among regime-eligible setup detectors.
 * Pattern legitimacy is evaluated here; economic reward
 * classification is deliberately left to the Quality Engine.
 * Research only. No execution authority.
 */

import detectTrendPullbackSetup from "./strategies/trendPullbackSetup.js";
import detectBreakoutRetestSetup from "./strategies/breakoutRetestSetup.js";
import detectLiquiditySweepSetup from "./strategies/liquiditySweepSetup.js";
import detectMomentumBreakoutSetup from "./strategies/momentumBreakoutSetup.js";
import detectRangeRotationSetup from "./strategies/rangeRotationSetup.js";

const STRATEGY_REGISTRY = Object.freeze({
  TREND_PULLBACK: detectTrendPullbackSetup,
  BREAKOUT_RETEST: detectBreakoutRetestSetup,
  LIQUIDITY_SWEEP: detectLiquiditySweepSetup,
  MOMENTUM_BREAKOUT: detectMomentumBreakoutSetup,
  RANGE_ROTATION: detectRangeRotationSetup,
});

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min = 0, max = 100) {
  const n = finiteOrNull(value);
  if (n === null) return min;
  return Math.min(max, Math.max(min, n));
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeDirection(candidate) {
  const raw =
    candidate?.directionDecision?.direction ??
    candidate?.researchDirection ??
    candidate?.direction ??
    null;
  if (!raw) return null;
  const v = String(raw).toUpperCase();
  if (v === "BULL" || v === "LONG") return "BULL";
  if (v === "BEAR" || v === "SHORT") return "BEAR";
  return null;
}

function resolveStrategyOptions(strategy, options = {}) {
  const shared = options?.shared && typeof options.shared === "object"
    ? options.shared
    : {};
  const specific = options?.[strategy] && typeof options[strategy] === "object"
    ? options[strategy]
    : {};
  return { ...shared, ...specific };
}

/*
 * ---------------------------------------------------------
 * STRUCTURAL GEOMETRY QUALITY
 * ---------------------------------------------------------
 *
 * This score asks whether a matched detector produced usable
 * entry / invalidation / structural-target geometry. It does
 * NOT reward a larger R:R. R:R economics belong to V3 Quality.
 */
function calculateGeometryQuality(result) {
  const entry = finiteOrNull(result?.preferredEntry);
  const stop = finiteOrNull(result?.stop ?? result?.invalidation?.price);
  const direction = String(result?.direction || "").toUpperCase();

  if (entry === null || stop === null || !(entry > 0) || !(stop > 0)) {
    return { available: false, score: 0, bestRiskReward: null, validTargetCount: 0 };
  }

  const isBull = direction === "BULL" || direction === "LONG";
  const isBear = direction === "BEAR" || direction === "SHORT";
  if (!isBull && !isBear) {
    return { available: false, score: 0, bestRiskReward: null, validTargetCount: 0 };
  }

  const validStop = isBull ? stop < entry : stop > entry;
  const risk = Math.abs(entry - stop);
  if (!validStop || !(risk > 0)) {
    return { available: false, score: 0, bestRiskReward: null, validTargetCount: 0 };
  }

  const targets = Array.isArray(result?.targets) ? result.targets : [];
  const riskRewards = targets.map((target) => {
    const price = finiteOrNull(typeof target === "number" ? target : target?.price);
    if (price === null || !(price > 0)) return null;
    const correctSide = isBull ? price > entry : price < entry;
    if (!correctSide) return null;
    const reward = Math.abs(price - entry);
    return reward > 0 ? reward / risk : null;
  }).filter((v) => Number.isFinite(v) && v > 0);

  if (!riskRewards.length) {
    return { available: false, score: 0, bestRiskReward: null, validTargetCount: 0 };
  }

  const bestRiskReward = Math.max(...riskRewards);
  let score = 70;
  if (riskRewards.length >= 2) score += 15;
  if (riskRewards.length >= 3) score += 10;
  if (riskRewards.length >= 4) score += 5;

  return {
    available: true,
    score: clamp(score),
    bestRiskReward,
    validTargetCount: riskRewards.length,
  };
}

/*
 * ---------------------------------------------------------
 * ENTRY QUALITY
 * ---------------------------------------------------------
 */

function calculateEntryQuality(
  result
) {
  const zone =
    result?.entryZone ??
    null;

  const entry =
    finiteOrNull(
      result?.preferredEntry
    );

  if (
    !zone ||
    zone.available !== true ||
    entry === null
  ) {
    return {
      available: false,
      score: 0,
    };
  }

  let score = 50;

  const chaseState =
    result
      ?.entryQuality
      ?.chaseState ??
    null;

  if (
    chaseState ===
    "ACCEPTABLE"
  ) {
    score += 30;
  }

  if (
    chaseState ===
    "EXTENDED"
  ) {
    score -= 15;
  }

  if (
    chaseState ===
    "TOO_EXTENDED"
  ) {
    score = 0;
  }

  const evidence =
    Array.isArray(
      result?.evidence
    )
      ? result.evidence
      : [];

  const priceNearEntry =
    evidence.some(
      (item) => {
        const value =
          String(
            item || ""
          ).toUpperCase();

        return (
          value.includes(
            "PRICE_INSIDE"
          ) ||
          value.includes(
            "PRICE_NEAR"
          )
        );
      }
    );

  if (priceNearEntry) {
    score += 20;
  }

  return {
    available: true,

    score:
      clamp(score),
  };
}

/*
 * ---------------------------------------------------------
 * SELECTION SCORE
 * ---------------------------------------------------------
 *
 * Pattern quality dominates.
 *
 * Geometry and entry quality help distinguish between
 * multiple legitimate patterns.
 */

function calculateSelectionScore(
  result
) {
  const patternScore =
    clamp(
      result?.patternScore
    );

  const geometry =
    calculateGeometryQuality(
      result
    );

  const entry =
    calculateEntryQuality(
      result
    );

  const weights = {
    pattern: 0.70,
    geometry: 0.20,
    entry: 0.10,
  };

  const score =
    patternScore *
      weights.pattern +
    geometry.score *
      weights.geometry +
    entry.score *
      weights.entry;

  return {
    score:
      clamp(score),

    components: {
      pattern: {
        score:
          patternScore,

        weight:
          weights.pattern,
      },

      geometry: {
        score:
          geometry.score,

        weight:
          weights.geometry,

        bestRiskReward:
          geometry
            .bestRiskReward,

        validTargetCount:
          geometry
            .validTargetCount,
      },

      entry: {
        score:
          entry.score,

        weight:
          weights.entry,
      },
    },
  };
}

/*
 * ---------------------------------------------------------
 * RUN STRATEGY
 * ---------------------------------------------------------
 */

function runStrategy(
  strategy,
  candidate,
  market,
  structure,
  regime,
  options
) {
  const detector =
    STRATEGY_REGISTRY[
      strategy
    ];

  if (
    typeof detector !==
    "function"
  ) {
    return {
      strategy,

      matched: false,

      status:
        "STRATEGY_UNAVAILABLE",

      patternScore: 0,

      blockers: [
        "STRATEGY_DETECTOR_UNAVAILABLE",
      ],

      evidence: [],

      risks: [],

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  try {
    const result =
      detector(
        candidate,
        market,
        structure,
        regime,
        resolveStrategyOptions(
          strategy,
          options
        )
      );

    /*
     * Ensure every detector result carries a stable
     * strategy identifier.
     */
    return {
      ...result,

      strategy:
        result?.strategy ??
        strategy,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  } catch (error) {
    return {
      strategy,

      matched: false,

      status:
        "STRATEGY_ERROR",

      patternScore: 0,

      blockers: [
        "STRATEGY_DETECTOR_ERROR",
      ],

      evidence: [],

      risks: [
        String(
          error?.message ??
          error ??
          "UNKNOWN_STRATEGY_ERROR"
        ),
      ],

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }
}

/*
 * ---------------------------------------------------------
 * AMBIGUITY
 * ---------------------------------------------------------
 *
 * Multiple patterns can legitimately coexist.
 *
 * We do not reject merely because two strategies match.
 *
 * Ambiguity becomes meaningful when:
 *
 * - their selection scores are very close; AND
 * - their proposed entries materially disagree; OR
 * - their structural invalidation prices materially
 *   disagree.
 */

function evaluateAmbiguity(
  first,
  second,
  market,
  options = {}
) {
  if (
    !first ||
    !second
  ) {
    return {
      ambiguous: false,

      scoreDifference:
        null,

      entryDifferencePercent:
        null,

      stopDifferencePercent:
        null,

      reasons: [],
    };
  }

  const scoreDifference =
    Math.abs(
      first.selectionScore -
      second.selectionScore
    );

  const maximumScoreDifference =
    finiteOrNull(
      options
        ?.maximumAmbiguousScoreDifference
    ) ??
    5;

  const firstEntry =
    finiteOrNull(
      first
        ?.result
        ?.preferredEntry
    );

  const secondEntry =
    finiteOrNull(
      second
        ?.result
        ?.preferredEntry
    );

  const firstStop =
    finiteOrNull(
      first
        ?.result
        ?.stop ??
      first
        ?.result
        ?.invalidation
        ?.price
    );

  const secondStop =
    finiteOrNull(
      second
        ?.result
        ?.stop ??
      second
        ?.result
        ?.invalidation
        ?.price
    );

  const referencePrice =
    finiteOrNull(
      market?.markPrice ??
      market?.lastPrice ??
      market?.last ??
      market?.ask ??
      market?.bid
    );

  let entryDifferencePercent =
    null;

  let stopDifferencePercent =
    null;

  if (
    referencePrice !== null &&
    referencePrice > 0 &&
    firstEntry !== null &&
    secondEntry !== null
  ) {
    entryDifferencePercent =
      (
        Math.abs(
          firstEntry -
          secondEntry
        ) /
        referencePrice
      ) *
      100;
  }

  if (
    referencePrice !== null &&
    referencePrice > 0 &&
    firstStop !== null &&
    secondStop !== null
  ) {
    stopDifferencePercent =
      (
        Math.abs(
          firstStop -
          secondStop
        ) /
        referencePrice
      ) *
      100;
  }

  const maximumEntryDifferencePercent =
    finiteOrNull(
      options
        ?.maximumAmbiguousEntryDifferencePercent
    ) ??
    0.50;

  const maximumStopDifferencePercent =
    finiteOrNull(
      options
        ?.maximumAmbiguousStopDifferencePercent
    ) ??
    0.75;

  const reasons = [];

  if (
    scoreDifference <=
    maximumScoreDifference
  ) {
    if (
      entryDifferencePercent !==
        null &&
      entryDifferencePercent >
        maximumEntryDifferencePercent
    ) {
      reasons.push(
        "COMPETING_STRATEGIES_DISAGREE_ON_ENTRY"
      );
    }

    if (
      stopDifferencePercent !==
        null &&
      stopDifferencePercent >
        maximumStopDifferencePercent
    ) {
      reasons.push(
        "COMPETING_STRATEGIES_DISAGREE_ON_INVALIDATION"
      );
    }
  }

  return {
    ambiguous:
      reasons.length > 0,

    scoreDifference,

    maximumScoreDifference,

    entryDifferencePercent,

    maximumEntryDifferencePercent,

    stopDifferencePercent,

    maximumStopDifferencePercent,

    reasons,
  };
}

/*
 * ---------------------------------------------------------
 * MAIN STRATEGY SELECTION ENGINE
 * ---------------------------------------------------------
 */

export function selectBotSetupStrategy(
  candidate,
  market,
  structure,
  regime,
  options = {}
) {
  const blockers = [];

  /*
   * -------------------------------------------------------
   * 1. INPUT VALIDATION
   * -------------------------------------------------------
   */

  const direction =
    normalizeDirection(
      candidate
    );

  if (!direction) {
    blockers.push(
      "SETUP_STRATEGY_DIRECTION_UNAVAILABLE"
    );
  }

  if (
    !market ||
    market.approved !== true
  ) {
    blockers.push(
      "SETUP_STRATEGY_MARKET_NOT_READY"
    );
  }

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "SETUP_STRATEGY_STRUCTURE_NOT_READY"
    );
  }

  if (
    !regime ||
    regime.approved !== true
  ) {
    blockers.push(
      "SETUP_STRATEGY_REGIME_NOT_READY"
    );
  }

  /*
   * -------------------------------------------------------
   * 2. ELIGIBLE STRATEGIES
   * -------------------------------------------------------
   *
   * Regime controls which setup families may compete.
   *
   * We deliberately do NOT run all five strategies on
   * every market.
   */

  const eligibleStrategies =
    Array.isArray(
      regime
        ?.eligibleStrategies
    )
      ? unique(
          regime
            .eligibleStrategies
        )
      : [];

  if (
    eligibleStrategies.length ===
    0
  ) {
    blockers.push(
      "NO_ELIGIBLE_SETUP_STRATEGIES"
    );
  }

  /*
   * -------------------------------------------------------
   * 3. RUN ELIGIBLE DETECTORS
   * -------------------------------------------------------
   */

  const attempted =
    eligibleStrategies.map(
      (strategy) =>
        runStrategy(
          strategy,
          candidate,
          market,
          structure,
          regime,
          options
        )
    );

  /*
   * -------------------------------------------------------
   * 4. GENUINE MATCHES ONLY
   * -------------------------------------------------------
   */

  const matched =
    attempted.filter(
      (result) =>
        result?.matched === true
    );

  /*
   * -------------------------------------------------------
   * 5. RANK MATCHED STRATEGIES
   * -------------------------------------------------------
   */

  const ranked =
    matched
      .map((result) => {
        const selection =
          calculateSelectionScore(
            result
          );

        return {
          strategy:
            result.strategy,

          selectionScore:
            selection.score,

          selectionComponents:
            selection.components,

          result,
        };
      })
      .sort(
        (a, b) =>
          b.selectionScore -
          a.selectionScore
      );

  const minimumSelectionScore =
    finiteOrNull(
      options
        ?.minimumSelectionScore
    ) ??
    60;

  if (!ranked.length) {
    blockers.push(
      "NO_SETUP_PATTERN_MATCHED"
    );
  }

  const best =
    ranked[0] ??
    null;

  const second =
    ranked[1] ??
    null;

  if (
    best &&
    best.selectionScore <
      minimumSelectionScore
  ) {
    blockers.push(
      "BEST_SETUP_SELECTION_SCORE_TOO_LOW"
    );
  }

  /*
   * -------------------------------------------------------
   * 6. AMBIGUITY
   * -------------------------------------------------------
   */

  const ambiguity =
    evaluateAmbiguity(
      best,
      second,
      market,
      options
    );

  if (
    ambiguity.ambiguous
  ) {
    blockers.push(
      "SETUP_STRATEGY_AMBIGUOUS"
    );
  }

  /*
   * -------------------------------------------------------
   * 7. DIRECTION SAFETY
   * -------------------------------------------------------
   */

  if (
    best?.result?.direction
  ) {
    const selectedDirection =
      String(
        best.result.direction
      ).toUpperCase();

    const normalizedSelected =
      (
        selectedDirection ===
          "LONG" ||
        selectedDirection ===
          "BULL"
      )
        ? "BULL"
        : (
            selectedDirection ===
              "SHORT" ||
            selectedDirection ===
              "BEAR"
          )
          ? "BEAR"
          : null;

    if (
      normalizedSelected !==
      direction
    ) {
      blockers.push(
        "SETUP_STRATEGY_DIRECTION_CONFLICT"
      );
    }
  }

  /*
   * -------------------------------------------------------
   * 8. FINAL SELECTION
   * -------------------------------------------------------
   */

  const finalBlockers =
    unique(blockers);

  const selected =
    (
      best &&
      best.selectionScore >=
        minimumSelectionScore &&
      finalBlockers.length ===
        0
    )
      ? best
      : null;

  /*
   * -------------------------------------------------------
   * 9. RETURN
   * -------------------------------------------------------
   */

  return {
    approved:
      selected !== null,

    status:
      selected
        ? "SETUP_STRATEGY_SELECTED"
        : "NO_SETUP_STRATEGY",

    direction,

    marketRegime:
      regime?.regime ??
      null,

    eligibleStrategies,

    /*
     * Every strategy attempted, including failures.
     *
     * This is useful for explaining WHY the bot didnot
     * generate a setup.
     */
    attemptedStrategies:
      attempted.map(
        (result) => ({
          strategy:
            result?.strategy ??
            null,

          matched:
            result?.matched ===
            true,

          status:
            result?.status ??
            null,

          patternScore:
            finiteOrNull(
              result
                ?.patternScore
            ),

          blockers:
            Array.isArray(
              result?.blockers
            )
              ? result.blockers
              : [],

          evidence:
            Array.isArray(
              result?.evidence
            )
              ? result.evidence
              : [],

          risks:
            Array.isArray(
              result?.risks
            )
              ? result.risks
              : [],
        })
      ),

    /*
     * Only successfully matched patterns.
     */
    matchedStrategies:
      ranked.map(
        (item) => ({
          strategy:
            item.strategy,

          selectionScore:
            item.selectionScore,

          patternScore:
            finiteOrNull(
              item
                ?.result
                ?.patternScore
            ),

          bestRiskReward:
            item
              ?.selectionComponents
              ?.geometry
              ?.bestRiskReward ??
            null,

          selectionComponents:
            item
              .selectionComponents,
        })
      ),

    /*
     * Winning setup family.
     */
    selectedStrategy:
      selected
        ?.strategy ??
      null,

    selectionScore:
      selected
        ?.selectionScore ??
      null,

    minimumSelectionScore,

    selectionComponents:
      selected
        ?.selectionComponents ??
      null,

    /*
     * Full detector output.
     *
     * The Quality Engine consumes this object to perform
     * final geometry / R:R / execution validation.
     */
    selectedResult:
      selected
        ?.result ??
      null,

    runnerUp:
      second
        ? {
            strategy:
              second.strategy,

            selectionScore:
              second.selectionScore,

            patternScore:
              finiteOrNull(
                second
                  ?.result
                  ?.patternScore
              ),
          }
        : null,

    ambiguity,

    blockers:
      finalBlockers,

    observedAt:
      new Date()
        .toISOString(),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

/*
 * ---------------------------------------------------------
 * DEFAULT EXPORT
 * ---------------------------------------------------------
 *
 * Required because botFuturesSetupBuilder.js imports:
 *
 * import selectBotSetupStrategy
 *   from "./botSetupStrategyEngine.js";
 */

export default selectBotSetupStrategy;              