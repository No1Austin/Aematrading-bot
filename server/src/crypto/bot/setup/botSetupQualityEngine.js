/**
 * AEMA Private Futures Research Bot
 * Final Setup Quality Engine
 *
 * Responsibilities:
 * - Validate selected strategy geometry.
 * - Preserve structural entry and invalidation.
 * - Evaluate real structural targets.
 * - Select a realistic primary target.
 * - Enforce minimum R:R.
 * - Enforce spread, slippage and freshness.
 * - Evaluate entry quality.
 * - Produce final setup quality score.
 *
 * Important:
 * - Does NOT change research direction.
 * - Does NOT invent targets to manufacture R:R.
 * - Does NOT tighten stops to manufacture R:R.
 * - Does NOT execute orders.
 */

import resolveSetupLifecycle from "./botSetupLifecycleEngine.js";

import BOT_CONFIG from "../config/botConfig.js";

/*
 * ---------------------------------------------------------
 * HELPERS
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

function unique(values = []) {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ];
}

/*
 * ---------------------------------------------------------
 * DIRECTION
 * ---------------------------------------------------------
 */

function normalizeDirection(value) {
  const direction =
    String(
      value || ""
    ).toUpperCase();

  if (
    direction === "LONG" ||
    direction === "BULL"
  ) {
    return "BULL";
  }

  if (
    direction === "SHORT" ||
    direction === "BEAR"
  ) {
    return "BEAR";
  }

  return null;
}

/*
 * ---------------------------------------------------------
 * CONFIG
 * ---------------------------------------------------------
 */

function resolveConfig(options = {}) {
  return {
    minimumRiskReward:
      finiteOrNull(
        options.minimumRiskReward
      ) ??
      finiteOrNull(
        BOT_CONFIG
          ?.setupQualification
          ?.minimumRiskReward
      ) ??
      1.5,

    standardRiskReward:
      finiteOrNull(options.standardRiskReward) ?? 1.0,

    minimumTradableRiskReward:
      finiteOrNull(options.minimumTradableRiskReward) ?? 0.50,

    strategyClassRequirements: options.strategyClassRequirements ?? {},

    classRequirements: {
      SCALP: { pattern: 90, entry: 70, execution: 85 },
      STANDARD: { pattern: 75, entry: 60, execution: 75 },
      ASYMMETRIC: { pattern: 65, entry: 50, execution: 70 },
    },

    maximumSpreadPercent:
      finiteOrNull(
        options.maximumSpreadPercent
      ) ??
      finiteOrNull(
        BOT_CONFIG
          ?.setupQualification
          ?.maximumSpreadPercent
      ) ??
      0.50,

    maximumSlippagePercent:
      finiteOrNull(
        options.maximumSlippagePercent
      ) ??
      0.50,

    minimumSetupQualityScore:
      finiteOrNull(
        options.minimumSetupQualityScore
      ) ??
      70,

    maximumRewardedRiskReward:
      finiteOrNull(
        options.maximumRewardedRiskReward
      ) ??
      4,

    preferNearestQualifiedTarget:
      options.preferNearestQualifiedTarget !==
      false,
  };
}

/*
 * ---------------------------------------------------------
 * MARKET EVIDENCE
 * ---------------------------------------------------------
 */

function resolveSpreadPercent(market) {
  return finiteOrNull(
    market?.spreadPercent ??
    market?.spread?.percent ??
    null
  );
}

function resolveSlippagePercent(
  market,
  direction
) {
  if (direction === "BULL") {
    return finiteOrNull(
      market?.slippage
        ?.buy
        ?.percent ??
      market?.slippage
        ?.buyPercent ??
      null
    );
  }

  if (direction === "BEAR") {
    return finiteOrNull(
      market?.slippage
        ?.sell
        ?.percent ??
      market?.slippage
        ?.sellPercent ??
      null
    );
  }

  return null;
}

function resolveSlippageAvailability(
  market,
  direction
) {
  if (direction === "BULL") {
    const explicit =
      market?.slippage
        ?.buy
        ?.available;

    if (
      explicit === true ||
      explicit === false
    ) {
      return explicit;
    }

    return (
      resolveSlippagePercent(
        market,
        direction
      ) !== null
    );
  }

  if (direction === "BEAR") {
    const explicit =
      market?.slippage
        ?.sell
        ?.available;

    if (
      explicit === true ||
      explicit === false
    ) {
      return explicit;
    }

    return (
      resolveSlippagePercent(
        market,
        direction
      ) !== null
    );
  }

  return false;
}

function resolveFreshness(market) {
  const stale =
    market?.freshness?.stale ??
    market?.freshness?.isStale ??
    null;

  const ageMs =
    finiteOrNull(
      market?.freshness?.ageMs
    );

  return {
    available:
      stale !== null ||
      ageMs !== null,

    stale:
      stale === true,

    ageMs,
  };
}

/*
 * ---------------------------------------------------------
 * GEOMETRY VALIDATION
 * ---------------------------------------------------------
 */

function validateGeometry({
  direction,
  entry,
  stop,
}) {
  const blockers = [];

  if (!direction) {
    blockers.push(
      "SETUP_DIRECTION_UNAVAILABLE"
    );
  }

  if (entry === null) {
    blockers.push(
      "SETUP_ENTRY_UNAVAILABLE"
    );
  }

  if (stop === null) {
    blockers.push(
      "SETUP_STOP_UNAVAILABLE"
    );
  }

  if (
    !direction ||
    entry === null ||
    stop === null
  ) {
    return {
      approved: false,
      risk: null,
      blockers,
    };
  }

  if (
    direction === "BULL" &&
    !(stop < entry)
  ) {
    blockers.push(
      "SETUP_INVALID_BULL_GEOMETRY"
    );
  }

  if (
    direction === "BEAR" &&
    !(stop > entry)
  ) {
    blockers.push(
      "SETUP_INVALID_BEAR_GEOMETRY"
    );
  }

  const risk =
    Math.abs(
      entry - stop
    );

  if (!(risk > 0)) {
    blockers.push(
      "SETUP_RISK_DISTANCE_INVALID"
    );
  }

  return {
    approved:
      blockers.length === 0,

    risk:
      risk > 0
        ? risk
        : null,

    blockers,
  };
}

/*
 * ---------------------------------------------------------
 * TARGET EVALUATION
 * ---------------------------------------------------------
 *
 * Targets must come from the strategy detector.
 *
 * We do not manufacture an arbitrary 1.5R target.
 */

function classifySetupClass(riskReward, config) {
  if (riskReward === null || !(riskReward > 0)) return null;
  if (riskReward >= config.minimumRiskReward) return "ASYMMETRIC";
  if (riskReward >= config.standardRiskReward) return "STANDARD";
  if (riskReward >= config.minimumTradableRiskReward) return "SCALP";
  return null;
}

function evaluateTargets({ targets, direction, entry, risk, config }) {
  if (!Array.isArray(targets) || !targets.length || entry === null || risk === null || !(risk > 0)) return [];
  return targets.map((target, index) => {
    const price = positiveOrNull(typeof target === "number" ? target : target?.price);
    if (price === null) return null;
    const correctSide = direction === "BULL" ? price > entry : direction === "BEAR" ? price < entry : false;
    if (!correctSide) return null;
    const rewardDistance = Math.abs(price - entry);
    const riskReward = rewardDistance / risk;
    const setupClass = classifySetupClass(riskReward, config);
    return {
      price,
      label: typeof target === "object" ? (target?.label ?? `TP${index + 1}`) : `TP${index + 1}`,
      reason: typeof target === "object" ? (target?.reason ?? "STRUCTURAL_TARGET") : "STRUCTURAL_TARGET",
      rewardDistance,
      riskReward,
      setupClass,
      qualifies: setupClass !== null,
      originalIndex: index,
    };
  }).filter(Boolean).sort((x,y)=>x.rewardDistance-y.rewardDistance);
}

// Research-only strategy profiles. Defaults preserve the original thresholds;
// callers may supply measured, strategy-specific overrides after backtesting.
function resolveStrategyRequirements(config, strategySelection, setupClass) {
  const base = config.classRequirements?.[setupClass];
  if (!base) return null;
  const id = String(strategySelection?.selectedStrategy ?? "").toUpperCase();
  const override = config.strategyClassRequirements?.[id]?.[setupClass] ?? {};
  return {
    pattern: Math.max(0, Math.min(100, finiteOrNull(override.pattern) ?? base.pattern)),
    entry: Math.max(0, Math.min(100, finiteOrNull(override.entry) ?? base.entry)),
    execution: Math.max(0, Math.min(100, finiteOrNull(override.execution) ?? base.execution)),
  };
}

function classifyResearchBlockers(blockers) {
  const safetyWords = /SPREAD|SLIPPAGE|STALE|FRESH|LIQUID|MARKET_NOT_APPROVED|EXECUTION|GEOMETRY|STOP|INVALID/;
  const timingWords = /ENTRY|LIFECYCLE|TRIGGER|DISTANCE|CHASE/;
  const economicsWords = /REWARD|RISK_REWARD|TARGET|CLASS/;
  return blockers.map(code => ({
    code,
    category: safetyWords.test(code) ? "SAFETY_OR_DATA" : timingWords.test(code) ? "ENTRY_TIMING" : economicsWords.test(code) ? "ECONOMICS_OR_CLASS" : "RESEARCH_QUALITY",
  }));
}

function classRequirementsMet(setupClass, strategySelection, entryQuality, executionQuality, config) {
  const req = resolveStrategyRequirements(config, strategySelection, setupClass);
  if (!req) return { approved: false, blockers: ["SETUP_CLASS_UNAVAILABLE"] };
  const pattern = finiteOrNull(strategySelection?.selectedResult?.patternScore) ?? 0;
  const blockers = [];
  if (pattern < req.pattern) blockers.push(`${setupClass}_PATTERN_SCORE_TOO_LOW`);
  if (entryQuality.score < req.entry) blockers.push(`${setupClass}_ENTRY_SCORE_TOO_LOW`);
  if (executionQuality.score < req.execution) blockers.push(`${setupClass}_EXECUTION_SCORE_TOO_LOW`);
  return { approved: blockers.length === 0, blockers, requirements: req, patternScore: pattern };
}

function selectPrimaryTarget(evaluatedTargets, config, strategySelection, entryQuality, executionQuality) {
  const economicallyTradable = evaluatedTargets.filter(t => t.qualifies === true);
  const evaluated = economicallyTradable.map(target => ({
    ...target,
    classValidation: classRequirementsMet(target.setupClass, strategySelection, entryQuality, executionQuality, config),
  }));
  const approved = evaluated.filter(t => t.classValidation.approved);
  if (!approved.length) return { selected: null, qualified: evaluated };
  // Prefer the nearest real target among class-approved targets. Learning can later optimize this choice.
  return { selected: config.preferNearestQualifiedTarget ? approved[0] : [...approved].sort((x,y)=>y.riskReward-x.riskReward)[0], qualified: evaluated };
}

/*
 * ---------------------------------------------------------
 * ENTRY QUALITY
 * ---------------------------------------------------------
 */

function evaluateEntryQuality(
  selectedResult,
  market,
  direction
) {
  const blockers = [];
  const evidence = [];
  const risks = [];

  const entry =
    positiveOrNull(
      selectedResult
        ?.preferredEntry
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

  const zone =
    selectedResult
      ?.entryZone ??
    null;

  const chaseState =
    selectedResult
      ?.entryQuality
      ?.chaseState ??
    null;

  let score = 50;

  if (
    chaseState ===
    "ACCEPTABLE"
  ) {
    score += 30;

    evidence.push(
      "ENTRY_NOT_EXTENDED"
    );
  }

  if (
    chaseState ===
    "EXTENDED"
  ) {
    score -= 20;

    risks.push(
      "ENTRY_EXTENDED"
    );
  }

  if (
    chaseState ===
    "TOO_EXTENDED"
  ) {
    score = 0;

    blockers.push(
      "ENTRY_TOO_EXTENDED"
    );
  }

  if (
    currentPrice !== null &&
    zone?.available === true
  ) {
    const low =
      positiveOrNull(
        zone.low
      );

    const high =
      positiveOrNull(
        zone.high
      );

    if (
      low !== null &&
      high !== null &&
      currentPrice >= low &&
      currentPrice <= high
    ) {
      score += 20;

      evidence.push(
        "CURRENT_PRICE_INSIDE_ENTRY_ZONE"
      );
    } else if (
      low !== null &&
      high !== null
    ) {
      /*
       * A structural entry can be valid before price arrives.
       * Reward the existence of a defined entry zone; do not
       * pretend the entry has triggered.
       */
      score += 20;
      evidence.push("STRUCTURAL_ENTRY_ZONE_DEFINED");
      risks.push("WAITING_FOR_ENTRY_ZONE");
    }
  }

  if (entry === null) {
    blockers.push(
      "ENTRY_PRICE_UNAVAILABLE"
    );

    score = 0;
  }

  return {
    approved:
      blockers.length === 0,

    score:
      clamp(score),

    currentPrice,

    preferredEntry:
      entry,

    chaseState,

    evidence,

    risks,

    blockers,
  };
}

/*
 * ---------------------------------------------------------
 * EXECUTION QUALITY
 * ---------------------------------------------------------
 */

function evaluateExecutionQuality(
  market,
  direction,
  config
) {
  const blockers = [];
  const evidence = [];
  const risks = [];

  const spreadPercent =
    resolveSpreadPercent(
      market
    );

  const slippagePercent =
    resolveSlippagePercent(
      market,
      direction
    );

  const slippageAvailable =
    resolveSlippageAvailability(
      market,
      direction
    );

  const freshness =
    resolveFreshness(
      market
    );

  let score = 100;

  /*
   * Spread
   */
  if (
    spreadPercent === null
  ) {
    blockers.push(
      "SETUP_SPREAD_UNAVAILABLE"
    );

    score -= 35;
  } else if (
    spreadPercent >
    config.maximumSpreadPercent
  ) {
    blockers.push(
      "SETUP_SPREAD_TOO_WIDE"
    );

    score -= 40;
  } else {
    evidence.push(
      "SPREAD_ACCEPTABLE"
    );

    const ratio =
      config.maximumSpreadPercent >
      0
        ? (
            spreadPercent /
            config
              .maximumSpreadPercent
          )
        : 1;

    if (ratio > 0.75) {
      score -= 15;

      risks.push(
        "SPREAD_NEAR_MAXIMUM"
      );
    }
  }

  /*
   * Slippage
   */
  if (
    slippageAvailable !== true ||
    slippagePercent === null
  ) {
    blockers.push(
      "SETUP_SLIPPAGE_UNAVAILABLE"
    );

    score -= 35;
  } else if (
    slippagePercent >
    config.maximumSlippagePercent
  ) {
    blockers.push(
      "SETUP_SLIPPAGE_TOO_HIGH"
    );

    score -= 40;
  } else {
    evidence.push(
      "SLIPPAGE_ACCEPTABLE"
    );

    const ratio =
      config.maximumSlippagePercent >
      0
        ? (
            slippagePercent /
            config
              .maximumSlippagePercent
          )
        : 1;

    if (ratio > 0.75) {
      score -= 15;

      risks.push(
        "SLIPPAGE_NEAR_MAXIMUM"
      );
    }
  }

  /*
   * Freshness
   */
  if (
    freshness.stale === true
  ) {
    blockers.push(
      "SETUP_MARKET_DATA_STALE"
    );

    score -= 50;
  } else if (
    freshness.available
  ) {
    evidence.push(
      "MARKET_DATA_FRESH"
    );
  }

  return {
    approved:
      blockers.length === 0,

    score:
      clamp(score),

    spreadPercent,

    maximumSpreadPercent:
      config.maximumSpreadPercent,

    slippagePercent,

    maximumSlippagePercent:
      config.maximumSlippagePercent,

    freshness,

    evidence,

    risks,

    blockers,
  };
}

/*
 * ---------------------------------------------------------
 * REWARD QUALITY
 * ---------------------------------------------------------
 */

function calculateRewardQuality(riskReward, config) {
  if (riskReward === null || !(riskReward > 0)) return 0;
  const min = config.minimumTradableRiskReward;
  const standard = config.standardRiskReward;
  const asymmetric = config.minimumRiskReward;
  const max = Math.max(asymmetric, config.maximumRewardedRiskReward);
  if (riskReward < min) return 0;
  if (riskReward < standard) {
    const span = Math.max(0.000001, standard - min);
    return clamp(50 + ((riskReward - min) / span) * 20);
  }
  if (riskReward < asymmetric) {
    const span = Math.max(0.000001, asymmetric - standard);
    return clamp(70 + ((riskReward - standard) / span) * 15);
  }
  const span = Math.max(0.000001, max - asymmetric);
  return clamp(85 + ((Math.min(riskReward, max) - asymmetric) / span) * 15);
}

/*
 * ---------------------------------------------------------
 * FINAL QUALITY SCORE
 * ---------------------------------------------------------
 */

function calculateSetupQualityScore({
  strategySelection,
  entryQuality,
  executionQuality,
  riskReward,
  config,
}) {
  const strategyScore =
    clamp(
      strategySelection
        ?.selectionScore
    );

  const rewardScore =
    calculateRewardQuality(
      riskReward,
      config
    );

  const weights = {
    strategy: 0.40,
    entry: 0.20,
    reward: 0.20,
    execution: 0.20,
  };

  const score =
    strategyScore *
      weights.strategy +
    entryQuality.score *
      weights.entry +
    rewardScore *
      weights.reward +
    executionQuality.score *
      weights.execution;

  return {
    score:
      clamp(score),

    components: {
      strategy: {
        score:
          strategyScore,

        weight:
          weights.strategy,
      },

      entry: {
        score:
          entryQuality.score,

        weight:
          weights.entry,
      },

      reward: {
        score:
          rewardScore,

        weight:
          weights.reward,

        riskReward,
        setupClass: classifySetupClass(riskReward, config),
      },

      execution: {
        score:
          executionQuality.score,

        weight:
          weights.execution,
      },
    },
  };
}

/*
 * ---------------------------------------------------------
 * MAIN QUALITY ENGINE
 * ---------------------------------------------------------
 */

export function evaluateBotSetupQuality(
  candidate,
  market,
  structure,
  regime,
  strategySelection,
  options = {}
) {
  const config =
    resolveConfig(
      options
    );

  const blockers = [];
  const evidence = [];
  const risks = [];

  /*
   * -------------------------------------------------------
   * 1. UPSTREAM VALIDATION
   * -------------------------------------------------------
   */

  if (
    !strategySelection ||
    strategySelection
      .approved !== true ||
    !strategySelection
      .selectedResult
  ) {
    blockers.push(
      "SETUP_STRATEGY_NOT_SELECTED"
    );
  }

  const selectedResult =
    strategySelection
      ?.selectedResult ??
    null;

  const direction =
    normalizeDirection(
      selectedResult
        ?.direction ??
      strategySelection
        ?.direction ??
      candidate
        ?.directionDecision
        ?.direction ??
      candidate?.direction
    );

  if (!direction) {
    blockers.push(
      "SETUP_DIRECTION_UNAVAILABLE"
    );
  }

  if (
    !market ||
    market.approved !== true
  ) {
    blockers.push(
      "SETUP_MARKET_NOT_APPROVED"
    );
  }

  if (
    !structure ||
    structure.approved !== true
  ) {
    blockers.push(
      "SETUP_STRUCTURE_NOT_APPROVED"
    );
  }

  if (
    !regime ||
    regime.approved !== true
  ) {
    blockers.push(
      "SETUP_REGIME_NOT_APPROVED"
    );
  }

  /*
   * -------------------------------------------------------
   * 2. STRUCTURAL ENTRY + STOP
   * -------------------------------------------------------
   */

  const entry =
    positiveOrNull(
      selectedResult
        ?.preferredEntry
    );

  const stop =
    positiveOrNull(
      selectedResult
        ?.stop ??
      selectedResult
        ?.invalidation
        ?.price
    );

  const geometry =
    validateGeometry({
      direction,
      entry,
      stop,
    });

  blockers.push(
    ...geometry.blockers
  );

  /*
   * -------------------------------------------------------
   * 3. REAL STRUCTURAL TARGETS
   * -------------------------------------------------------
   */

  const evaluatedTargets =
    evaluateTargets({
      targets:
        selectedResult
          ?.targets,

      direction,

      entry,

      risk:
        geometry.risk,

      config,
    });

  if (
    !evaluatedTargets.length
  ) {
    blockers.push(
      "SETUP_STRUCTURAL_TARGETS_UNAVAILABLE"
    );
  }

  /*
   * -------------------------------------------------------
   * 4. PRIMARY TARGET
   * -------------------------------------------------------
   */


  /*
   * -------------------------------------------------------
   * 5. ENTRY QUALITY
   * -------------------------------------------------------
   */

  const entryQuality =
    evaluateEntryQuality(
      selectedResult,
      market,
      direction
    );

  blockers.push(
    ...entryQuality.blockers
  );

  evidence.push(
    ...entryQuality.evidence
  );

  risks.push(
    ...entryQuality.risks
  );

  /*
   * -------------------------------------------------------
   * 6. EXECUTION QUALITY
   * -------------------------------------------------------
   */

  const executionQuality =
    evaluateExecutionQuality(
      market,
      direction,
      config
    );

  blockers.push(
    ...executionQuality.blockers
  );

  evidence.push(
    ...executionQuality.evidence
  );

  risks.push(
    ...executionQuality.risks
  );

  /*
   * Economic classification belongs here, after entry and
   * execution quality are known.
   */
  const targetSelection = selectPrimaryTarget(
    evaluatedTargets,
    config,
    strategySelection,
    entryQuality,
    executionQuality
  );

  const primaryTarget = targetSelection.selected;
  const riskReward = finiteOrNull(primaryTarget?.riskReward);
  const setupClass = primaryTarget?.setupClass ?? null;

  if (!evaluatedTargets.some(t => t.qualifies === true)) {
    blockers.push("REWARD_BELOW_MINIMUM_TRADABLE_THRESHOLD");
  } else if (!primaryTarget) {
    const classBlockers = unique(
      targetSelection.qualified.flatMap(t => t.classValidation?.blockers ?? [])
    );
    blockers.push(...classBlockers);
    if (!classBlockers.length) blockers.push("NO_SETUP_CLASS_PASSED_QUALITY_REQUIREMENTS");
  }

  /*
   * Preserve detector evidence.
   */
  if (
    Array.isArray(
      selectedResult
        ?.evidence
    )
  ) {
    evidence.push(
      ...selectedResult
        .evidence
    );
  }

  if (
    Array.isArray(
      selectedResult
        ?.risks
    )
  ) {
    risks.push(
      ...selectedResult
        .risks
    );
  }

  /*
   * -------------------------------------------------------
   * 7. QUALITY SCORE
   * -------------------------------------------------------
   */

  const quality =
    calculateSetupQualityScore({
      strategySelection,
      entryQuality,
      executionQuality,
      riskReward,
      config,
    });

  if (
    quality.score <
    config.minimumSetupQualityScore
  ) {
    blockers.push(
      "SETUP_QUALITY_SCORE_TOO_LOW"
    );
  }

  /*
   * -------------------------------------------------------
   * 8. FINAL APPROVAL
   * -------------------------------------------------------
   */

  const finalBlockers =
    unique(blockers);

  const approved =
    finalBlockers.length === 0;

  const targetPrices =
    evaluatedTargets.map(
      (target) =>
        target.price
    );

  /*
   * -------------------------------------------------------
   * 9. LIFECYCLE
   * -------------------------------------------------------
   */

  const lifecycle = resolveSetupLifecycle({
    selectedResult,
    market,
    qualityApproved: approved,
  });

  /*
   * -------------------------------------------------------
   * 10. RETURN
   * -------------------------------------------------------
   */

  return {
    lifecycleStatus: lifecycle.status,
    lifecycle,
    approved,

    status:
      approved
        ? "SETUP_QUALITY_APPROVED"
        : "SETUP_QUALITY_REJECTED",

    symbol:
      candidate?.symbol ??
      market?.symbol ??
      market?.productId ??
      null,

    direction,

    strategy: {
      id:
        strategySelection
          ?.selectedStrategy ??
        null,

      selectionScore:
        finiteOrNull(
          strategySelection
            ?.selectionScore
        ),

      patternScore:
        finiteOrNull(
          selectedResult
            ?.patternScore
        ),

      marketRegime:
        regime?.regime ??
        null,
    },

    setupClass,

    expectancyMode:
      "BOOTSTRAP",

    rewardProfile: {
      bestRiskReward: evaluatedTargets.length
        ? Math.max(...evaluatedTargets.map(t => t.riskReward))
        : null,
      selectedRiskReward: riskReward,
      minimumTradableRiskReward: config.minimumTradableRiskReward,
      standardRiskReward: config.standardRiskReward,
      asymmetricRiskReward: config.minimumRiskReward,
      structuralTargetCount: evaluatedTargets.length,
      tradableTargetCount: evaluatedTargets.filter(t => t.qualifies).length,
    },

    /*
     * Structural geometry.
     */
    entry,

    entryZone:
      selectedResult
        ?.entryZone ??
      null,

    stop,

    invalidation:
      selectedResult
        ?.invalidation ??
      null,

    target:
      primaryTarget
        ?.price ??
      null,

    /*
     * Keep numeric target array for compatibility.
     */
    targets:
      targetPrices,

    /*
     * Rich target evidence for V2 UI / monitoring.
     */
    targetsDetailed:
      evaluatedTargets.map(
        (target) => ({
          price:
            target.price,

          label:
            target.label,

          reason:
            target.reason,

          rewardDistance:
            target.rewardDistance,

          riskReward:
            target.riskReward,

          qualifies:
            target.qualifies,

          setupClass:
            target.setupClass,

          classApproved:
            targetSelection.qualified.find(t => t.price === target.price)?.classValidation?.approved ?? false,

          primary:
            primaryTarget
              ?.price ===
            target.price,
        })
      ),

    riskDistance:
      geometry.risk,

    targetDistance:
      primaryTarget
        ?.rewardDistance ??
      null,

    riskReward,

    minimumRiskReward:
      config.minimumRiskReward,

    minimumTradableRiskReward:
      config.minimumTradableRiskReward,

    setupQualityScore:
      quality.score,

    minimumSetupQualityScore:
      config
        .minimumSetupQualityScore,

    qualityComponents:
      quality.components,

    entryQuality,

    executionQuality,

    spreadPercent:
      executionQuality
        .spreadPercent,

    maximumSpreadPercent:
      config
        .maximumSpreadPercent,

    slippagePercent:
      executionQuality
        .slippagePercent,

    maximumSlippagePercent:
      config
        .maximumSlippagePercent,

    freshness:
      executionQuality
        .freshness,

    learningContext: {
      strategy: strategySelection?.selectedStrategy ?? null,
      regime: regime?.regime ?? null,
      direction,
      patternScore: finiteOrNull(selectedResult?.patternScore),
      selectionScore: finiteOrNull(strategySelection?.selectionScore),
      entryScore: entryQuality.score,
      executionScore: executionQuality.score,
      riskReward,
      setupClass,
    },

    evidence:
      unique(evidence),

    risks:
      unique(risks),

    blockers:
      finalBlockers,

    researchDiagnostics: {
      selectedStrategy: strategySelection?.selectedStrategy ?? null,
      rejectionDetails: classifyResearchBlockers(finalBlockers),
      candidateForWatchlist: !approved && finalBlockers.length > 0 &&
        finalBlockers.every(code => !/SPREAD|SLIPPAGE|STALE|FRESH|LIQUID|GEOMETRY|STOP|INVALID/.test(code)),
      strategyRequirements: {
        SCALP: resolveStrategyRequirements(config, strategySelection, "SCALP"),
        STANDARD: resolveStrategyRequirements(config, strategySelection, "STANDARD"),
        ASYMMETRIC: resolveStrategyRequirements(config, strategySelection, "ASYMMETRIC"),
      },
    },

    observedAt:
      new Date()
        .toISOString(),

    /*
     * Explicit safety boundary.
     */
    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default evaluateBotSetupQuality;