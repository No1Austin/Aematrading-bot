/**
 * ============================================================
 * AEMA CRYPTO
 * EXECUTABLE OPPORTUNITY SELECTOR
 * ============================================================
 *
 * Purpose:
 * - operate AFTER Q2, final revalidation and entry qualification
 * - build the current executable opportunity pool
 * - compare approved LONG and SHORT trade setups
 * - rank trade quality, NOT research priority
 * - select the strongest currently executable opportunity(s)
 * - never grant paper or live execution authority
 *
 * IMPORTANT:
 *
 * cryptoOpportunityRankingEngine.js
 *   = PRE-RESEARCH ranking / research priority.
 *
 * cryptoExecutableOpportunitySelector.js
 *   = POST-REVALIDATION trade-opportunity ranking.
 *
 * Research score is supporting context only.
 * It is NOT the execution decision.
 */

const DEFAULT_POLICY = Object.freeze({
  maximumSelections: 1,

  /**
   * Minimum entry quality is intentionally conservative.
   *
   * The entry qualification gate is the authority on whether
   * an entry is acceptable. This value is an additional
   * ranking-pool quality floor, not a research-score threshold.
   */
  minimumEntryQuality: 0,

  requireDirectionAgreement: true,
  requireExecutionEvidence: true,
  requireEntryRiskEvidence: true,
  requireRiskPlanEvidence: true,

  /**
   * Final ranking weights.
   *
   * These describe CURRENT TRADE QUALITY.
   *
   * Research score is deliberately excluded from the weighted
   * executable score. Q2/research determines whether the
   * candidate reaches this stage; it does not determine which
   * executable setup wins.
   */
  weights: Object.freeze({
    entryQuality: 0.40,
    directionalQuality: 0.15,
    directionalSeparation: 0.10,
    confidence: 0.10,
    riskReward: 0.10,
    liquidity: 0.10,
    executionQuality: 0.05,
  }),
});

function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clamp(
  value,
  minimum = 0,
  maximum = 100,
) {
  const number =
    finiteOrNull(value);

  if (number === null) {
    return null;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      number,
    ),
  );
}

function round(
  value,
  decimals = 4,
) {
  const number =
    finiteOrNull(value);

  if (number === null) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      number * factor,
    ) / factor
  );
}

function upper(value) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

function firstFinite(
  ...values
) {
  for (
    const value
    of values
  ) {
    const number =
      finiteOrNull(value);

    if (number !== null) {
      return number;
    }
  }

  return null;
}

function normalizeConfidence(
  value,
) {
  const number =
    finiteOrNull(value);

  if (number === null) {
    return null;
  }

  /**
   * Accept either:
   *
   * 0.82
   * or
   * 82
   */
  return number <= 1
    ? clamp(
        number * 100,
      )
    : clamp(number);
}

function normalizeDirection(
  candidate,
) {
  const direction =
    upper(
      candidate
        ?.tradingIntelligence
        ?.decision
        ?.preferredDirection ??
      candidate
        ?.tradingIntelligence
        ?.entryGate
        ?.direction ??
      candidate
        ?.intelligence
        ?.decision
        ?.preferredDirection ??
      candidate
        ?.intelligence
        ?.entryGate
        ?.direction ??
      candidate
        ?.finalRevalidation
        ?.decision ??
      candidate
        ?.entryQualification
        ?.direction ??
      candidate
        ?.tradeEntryQualification
        ?.direction ??
      candidate
        ?.entryGate
        ?.direction ??
      candidate
        ?.decision
        ?.direction ??
      candidate
        ?.decision,
    );

  return (
    direction === "LONG" ||
    direction === "SHORT"
  )
    ? direction
    : "NO_TRADE";
}

function getEntryQualification(
  candidate,
) {
  return (
    candidate
      ?.tradingIntelligence
      ?.entryGate ??

    candidate
      ?.intelligence
      ?.entryGate ??

    candidate
      ?.entryQualification ??

    candidate
      ?.tradeEntryQualification ??

    candidate
      ?.tradeEntryGate ??

    candidate
      ?.entryGate ??

    candidate
      ?.qualification
      ?.entry ??

    null
  );
}

function getRiskPlan(
  candidate,
) {
  return (
    candidate
      ?.tradingIntelligence
      ?.riskPlan ??

    candidate
      ?.intelligence
      ?.riskPlan ??

    candidate
      ?.riskPlan ??

    null
  );
}

function getDirectionAgreement(
  candidate,
) {
  return (
    candidate
      ?.directionAgreement ??

    candidate
      ?.tradingIntelligence
      ?.directionAgreement ??

    null
  );
}


function getSymbol(
  candidate,
) {
  return upper(
    candidate?.symbol ??
    candidate
      ?.asset
      ?.symbol ??
    candidate
      ?.freshRevalidationEvidence
      ?.measurements
      ?.symbol,
  );
}

function getResearchScore(
  candidate,
) {
  return firstFinite(
    candidate
      ?.deepResearch
      ?.researchScore,

    candidate
      ?.research
      ?.researchScore,

    candidate
      ?.research
      ?.score,

    candidate
      ?.researchScore,
  );
}

/**
 * ------------------------------------------------------------
 * EXECUTION QUALITY
 * ------------------------------------------------------------
 *
 * This converts execution friction into a ranking dimension.
 *
 * Missing execution evidence does NOT receive a neutral/default
 * score. Missing evidence is simply unavailable and therefore
 * excluded from weighted ranking.
 */

function buildExecutionQuality(
  metrics = {},
) {
  const components = [];

  const spreadPercent =
    finiteOrNull(
      metrics?.spreadPercent,
    );

  const slippagePercent =
    finiteOrNull(
      metrics
        ?.slippageEstimatePercent,
    );

  /**
   * Lower spread is better.
   *
   * 0%   -> 100
   * 0.5% -> 0
   */
  if (
    spreadPercent !== null
  ) {
    components.push({
      name:
        "SPREAD_QUALITY",

      score:
        clamp(
          100 -
          (
            Math.max(
              0,
              spreadPercent,
            ) /
            0.5
          ) *
          100,
        ),

      weight:
        0.50,

      raw:
        spreadPercent,
    });
  }

  /**
   * Lower expected slippage is better.
   *
   * 0% -> 100
   * 1% -> 0
   */
  if (
    slippagePercent !== null
  ) {
    components.push({
      name:
        "SLIPPAGE_QUALITY",

      score:
        clamp(
          100 -
          (
            Math.max(
              0,
              slippagePercent,
            ) /
            1
          ) *
          100,
        ),

      weight:
        0.50,

      raw:
        slippagePercent,
    });
  }

  let weightedTotal = 0;
  let availableWeight = 0;

  for (
    const component
    of components
  ) {
    if (
      component?.score ===
      null
    ) {
      continue;
    }

    weightedTotal +=
      component.score *
      component.weight;

    availableWeight +=
      component.weight;
  }

  return {
    available:
      availableWeight > 0,

    score:
      availableWeight > 0
        ? round(
            weightedTotal /
            availableWeight,
          )
        : null,

    coverage:
      round(
        availableWeight *
        100,
        2,
      ),

    components,
  };
}

/**
 * ------------------------------------------------------------
 * RISK / REWARD QUALITY
 * ------------------------------------------------------------
 *
 * 1.0 R:R = 40
 * 1.5 R:R = 60
 * 2.0 R:R = 80
 * 2.5+    = 100
 */

function riskRewardQuality(
  value,
) {
  const rr =
    finiteOrNull(value);

  if (rr === null) {
    return null;
  }

  return clamp(
    (
      Math.max(
        0,
        rr,
      ) /
      2.5
    ) *
    100,
  );
}

/**
 * ------------------------------------------------------------
 * DIRECTIONAL SEPARATION QUALITY
 * ------------------------------------------------------------
 *
 * Existing entry gate uses separation as a meaningful measure.
 * 35 points of separation is treated as full ranking quality.
 */

function separationQuality(
  value,
) {
  const separation =
    finiteOrNull(value);

  if (separation === null) {
    return null;
  }

  return clamp(
    (
      Math.max(
        0,
        separation,
      ) /
      35
    ) *
    100,
  );
}

/**
 * ------------------------------------------------------------
 * WEIGHTED QUALITY
 * ------------------------------------------------------------
 *
 * Missing metrics are excluded.
 *
 * Available weights are renormalized.
 *
 * There is deliberately NO:
 *
 * missing ? 70 : score
 *
 * behavior.
 */

function weightedQuality(
  dimensions,
) {
  let weightedTotal = 0;
  let availableWeight = 0;

  const used = [];
  const unavailable = [];

  for (
    const dimension
    of dimensions
  ) {
    const score =
      finiteOrNull(
        dimension?.score,
      );

    const weight =
      finiteOrNull(
        dimension?.weight,
      );

    if (
      score === null ||
      weight === null ||
      weight <= 0
    ) {
      unavailable.push(
        dimension?.name,
      );

      continue;
    }

    weightedTotal +=
      clamp(score) *
      weight;

    availableWeight +=
      weight;

    used.push({
      name:
        dimension.name,

      score:
        round(
          clamp(score),
        ),

      weight,
    });
  }

  if (
    availableWeight <= 0
  ) {
    return {
      available: false,
      score: null,
      coverage: 0,
      used,
      unavailable,
    };
  }

  return {
    available: true,

    score:
      round(
        weightedTotal /
        availableWeight,
      ),

    coverage:
      round(
        availableWeight *
        100,
        2,
      ),

    used,
    unavailable,
  };
}

/**
 * ------------------------------------------------------------
 * HARD ELIGIBILITY
 * ------------------------------------------------------------
 */

function evaluateEligibility(
  candidate,
  policy,
) {
  const blockers = [];

  const symbol =
    getSymbol(candidate);

  const entry =
    getEntryQualification(
      candidate,
    );

  const riskPlan =
    getRiskPlan(
      candidate,
    );

  const direction =
    normalizeDirection(
      candidate,
    );

  if (!symbol) {
    blockers.push(
      "SYMBOL_REQUIRED",
    );
  }

  if (
    candidate
      ?.qualification2
      ?.qualified !== true
  ) {
    blockers.push(
      "QUALIFICATION_2_REQUIRED",
    );
  }

  if (
    candidate
      ?.finalRevalidation
      ?.approved !== true
  ) {
    blockers.push(
      "FINAL_REVALIDATION_REQUIRED",
    );
  }

  if (
    upper(
      candidate
        ?.finalRevalidation
        ?.status,
    ) !==
    "REVALIDATED"
  ) {
    blockers.push(
      "FINAL_REVALIDATION_STATUS_INVALID",
    );
  }

  if (
    direction !== "LONG" &&
    direction !== "SHORT"
  ) {
    blockers.push(
      "DIRECTIONAL_DECISION_REQUIRED",
    );
  }

  if (
    !entry ||
    entry?.approved !== true
  ) {
    blockers.push(
      "TRADE_ENTRY_QUALIFICATION_REQUIRED",
    );
  }

  if (
    !riskPlan ||
    riskPlan?.approved !== true
  ) {
    blockers.push(
      "FUTURES_RISK_PLAN_REQUIRED",
    );
  }

  const directionAgreement =
    getDirectionAgreement(
      candidate,
    );

  if (
    policy.requireDirectionAgreement === true &&
    directionAgreement?.approved !== true
  ) {
    blockers.push(
      "DIRECTION_AGREEMENT_REQUIRED",
    );
  }

  const metrics =
    entry?.metrics ?? {};

  const executionEvidencePresent =
    finiteOrNull(
      metrics?.spreadPercent,
    ) !== null &&
    finiteOrNull(
      metrics?.liquidityScore,
    ) !== null;

  if (
    policy.requireExecutionEvidence === true &&
    !executionEvidencePresent
  ) {
    blockers.push(
      "EXECUTION_EVIDENCE_REQUIRED",
    );
  }

  const entryRiskEvidencePresent =
    finiteOrNull(
      metrics?.riskReward,
    ) !== null &&
    finiteOrNull(
      metrics?.stopDistancePercent,
    ) !== null;

  if (
    policy.requireEntryRiskEvidence === true &&
    !entryRiskEvidencePresent
  ) {
    blockers.push(
      "ENTRY_RISK_EVIDENCE_REQUIRED",
    );
  }

  const riskPlanEvidencePresent =
    finiteOrNull(
      riskPlan?.entryPrice,
    ) !== null &&
    finiteOrNull(
      riskPlan?.accountEquity,
    ) !== null &&
    riskPlan
      ?.evidence
      ?.stopEvidenceAvailable === true;

  if (
    policy.requireRiskPlanEvidence === true &&
    !riskPlanEvidencePresent
  ) {
    blockers.push(
      "FUTURES_RISK_EVIDENCE_REQUIRED",
    );
  }

  const entryQuality =
    finiteOrNull(
      entry?.entryQuality,
    );

  if (
    entryQuality === null
  ) {
    blockers.push(
      "ENTRY_QUALITY_REQUIRED",
    );
  }

  if (
    entryQuality !== null &&
    entryQuality <
      policy.minimumEntryQuality
  ) {
    blockers.push(
      "ENTRY_QUALITY_BELOW_POOL_MINIMUM",
    );
  }

  /**
   * Freshness must already have been explicitly authorized
   * by final revalidation.
   */
  if (
    candidate
      ?.freshRevalidationEvidence
      ?.freshnessAuthorized !==
      true
  ) {
    blockers.push(
      "FRESH_REVALIDATION_REQUIRED",
    );
  }

  if (
    candidate
      ?.freshRevalidationEvidence
      ?.batchFreshness
      ?.authorized !==
      true
  ) {
    blockers.push(
      "BATCH_FRESHNESS_REQUIRED",
    );
  }

  return {
    approved:
      blockers.length === 0,

    blockers,

    symbol,

    direction,

    entry,

    riskPlan,

    directionAgreement,

    evidence: {
      executionEvidencePresent,
      entryRiskEvidencePresent,
      riskPlanEvidencePresent,
      failClosed: true,
    },
  };
}

/**
 * ------------------------------------------------------------
 * SCORE ONE EXECUTABLE OPPORTUNITY
 * ------------------------------------------------------------
 */

export function scoreExecutableOpportunity(
  candidate = {},
  options = {},
) {
  const policy = {
    ...DEFAULT_POLICY,
    ...options,

    weights: {
      ...DEFAULT_POLICY.weights,
      ...(
        options?.weights ??
        {}
      ),
    },
  };

  const eligibility =
    evaluateEligibility(
      candidate,
      policy,
    );

  const {
    symbol,
    direction,
    entry,
    riskPlan,
    blockers,
  } = eligibility;

  if (
    eligibility.approved !==
    true
  ) {
    return {
      candidate,

      approved: false,

      status:
        "NOT_EXECUTABLE",

      symbol:
        symbol || null,

      direction,

      executableOpportunityScore:
        null,

      rank:
        null,

      blockers,

      nextStage:
        "NONE",

      paperExecutionAuthority:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  const metrics =
    entry?.metrics ?? {};

  const entryQuality =
    clamp(
      entry?.entryQuality,
    );

  const directionalQuality =
    clamp(
      metrics
        ?.directionalScore,
    );

  const directionalSeparation =
    separationQuality(
      metrics?.separation,
    );

  const confidence =
    normalizeConfidence(
      metrics?.confidence,
    );

  const rrQuality =
    riskRewardQuality(
      metrics?.riskReward,
    );

  const liquidity =
    clamp(
      metrics?.liquidityScore,
    );

  const executionQuality =
    buildExecutionQuality(
      metrics,
    );

  const ranking =
    weightedQuality([
      {
        name:
          "ENTRY_QUALITY",

        score:
          entryQuality,

        weight:
          policy
            .weights
            .entryQuality,
      },

      {
        name:
          "DIRECTIONAL_QUALITY",

        score:
          directionalQuality,

        weight:
          policy
            .weights
            .directionalQuality,
      },

      {
        name:
          "DIRECTIONAL_SEPARATION",

        score:
          directionalSeparation,

        weight:
          policy
            .weights
            .directionalSeparation,
      },

      {
        name:
          "CONFIDENCE",

        score:
          confidence,

        weight:
          policy
            .weights
            .confidence,
      },

      {
        name:
          "RISK_REWARD",

        score:
          rrQuality,

        weight:
          policy
            .weights
            .riskReward,
      },

      {
        name:
          "LIQUIDITY",

        score:
          liquidity,

        weight:
          policy
            .weights
            .liquidity,
      },

      {
        name:
          "EXECUTION_QUALITY",

        score:
          executionQuality.score,

        weight:
          policy
            .weights
            .executionQuality,
      },
    ]);

  const requiredRankingEvidenceAvailable =
    entryQuality !== null &&
    directionalQuality !== null &&
    directionalSeparation !== null &&
    confidence !== null &&
    rrQuality !== null &&
    liquidity !== null &&
    executionQuality?.available === true;

  if (
    ranking.available !== true ||
    requiredRankingEvidenceAvailable !== true
  ) {
    return {
      candidate,

      approved: false,

      status:
        "EXECUTABLE_RANKING_EVIDENCE_UNAVAILABLE",

      symbol,

      direction,

      executableOpportunityScore:
        null,

      rank:
        null,

      blockers: [
        "COMPLETE_EXECUTABLE_RANKING_EVIDENCE_REQUIRED",
      ],

      nextStage:
        "NONE",

      paperExecutionAuthority:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  return {
    candidate,

    approved: true,

    status:
      "EXECUTABLE_OPPORTUNITY",

    symbol,

    direction,

    executableOpportunityScore:
      ranking.score,

    rankingCoverage:
      ranking.coverage,

    rank:
      null,

    researchContext: {
      /**
       * Diagnostic only.
       * NOT part of executable opportunity score.
       */
      researchScore:
        getResearchScore(
          candidate,
        ),
    },

    quality: {
      entryQuality,

      directionalQuality,

      directionalSeparation,

      confidence,

      riskReward:
        finiteOrNull(
          metrics
            ?.riskReward,
        ),

      riskRewardQuality:
        rrQuality,

      liquidityQuality:
        liquidity,

      executionQuality:
        executionQuality.score,

      spreadPercent:
        finiteOrNull(
          metrics
            ?.spreadPercent,
        ),

      slippageEstimatePercent:
        finiteOrNull(
          metrics
            ?.slippageEstimatePercent,
        ),

      stopDistancePercent:
        finiteOrNull(
          metrics
            ?.stopDistancePercent,
        ),

      volatilityScore:
        finiteOrNull(
          metrics
            ?.volatilityScore,
        ),
    },

    ranking: {
      ...ranking,

      model:
        "CURRENT_EXECUTABLE_TRADE_QUALITY",
    },

    entryState:
      entry?.state ?? null,

    exposureMultiplier:
      finiteOrNull(
        entry
          ?.exposureMultiplier,
      ),

    riskPlan,

    blockers: [],

    nextStage:
      "EXECUTABLE_OPPORTUNITY_SELECTION",

    paperExecutionAuthority:
      false,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

/**
 * ------------------------------------------------------------
 * SELECT BEST CURRENT EXECUTABLE OPPORTUNITY(S)
 * ------------------------------------------------------------
 */

export function selectExecutableCryptoOpportunities({
  candidates = [],
  maximumSelections =
    DEFAULT_POLICY.maximumSelections,
  ...options
} = {}) {
  const input =
    Array.isArray(candidates)
      ? candidates
      : [];

  const evaluated =
    input.map(
      candidate =>
        scoreExecutableOpportunity(
          candidate,
          options,
        ),
    );

  const executable =
    evaluated
      .filter(
        result =>
          result?.approved ===
          true,
      )
      .sort(
        (a, b) =>
          (
            finiteOrNull(
              b
                ?.executableOpportunityScore,
            ) ?? -1
          ) -
            (
              finiteOrNull(
                a
                  ?.executableOpportunityScore,
              ) ?? -1
            ) ||

          (
            finiteOrNull(
              b
                ?.rankingCoverage,
            ) ?? 0
          ) -
            (
              finiteOrNull(
                a
                  ?.rankingCoverage,
              ) ?? 0
            ) ||

          (
            finiteOrNull(
              b
                ?.quality
                ?.liquidityQuality,
            ) ?? -1
          ) -
            (
              finiteOrNull(
                a
                  ?.quality
                  ?.liquidityQuality,
              ) ?? -1
            ) ||

          (
            finiteOrNull(
              b
                ?.quality
                ?.entryQuality,
            ) ?? -1
          ) -
            (
              finiteOrNull(
                a
                  ?.quality
                  ?.entryQuality,
              ) ?? -1
            ) ||

          (
            finiteOrNull(
              b
                ?.quality
                ?.riskReward,
            ) ?? -1
          ) -
            (
              finiteOrNull(
                a
                  ?.quality
                  ?.riskReward,
              ) ?? -1
            ) ||

          (
            finiteOrNull(
              b
                ?.quality
                ?.confidence,
            ) ?? -1
          ) -
            (
              finiteOrNull(
                a
                  ?.quality
                  ?.confidence,
              ) ?? -1
            ),
      )
      .map(
        (
          result,
          index,
        ) => ({
          ...result,

          rank:
            index + 1,
        }),
      );

  const requestedMaximum =
    Math.max(
      0,
      Math.floor(
        finiteOrNull(
          maximumSelections,
        ) ??
          DEFAULT_POLICY
            .maximumSelections,
      ),
    );

  const selected =
    executable
      .slice(
        0,
        requestedMaximum,
      )
      .map(
        result => ({
          ...result,

          status:
            "SELECTED_EXECUTABLE_OPPORTUNITY",

          selectionReason:
            result.rank === 1
              ? "BEST_CURRENT_EXECUTABLE_OPPORTUNITY"
              : "TOP_CURRENT_EXECUTABLE_OPPORTUNITY",

          nextStage:
            "PAPER_EXECUTION_AUTHORITY_GATE",

          /**
           * Still false here.
           *
           * The existing paper execution authority gate remains
           * the only component allowed to grant paper authority.
           */
          paperExecutionAuthority:
            false,

          executionAuthority:
            false,

          liveExecution:
            false,
        }),
      );

  const selectedKeys =
    new Set(
      selected.map(
        item =>
          `${item.symbol}:${item.direction}`,
      ),
    );

  const executableNotSelected =
    executable.filter(
      item =>
        !selectedKeys.has(
          `${item.symbol}:${item.direction}`,
        ),
    );

  const rejected =
    evaluated.filter(
      result =>
        result?.approved !==
        true,
    );

  if (
    selected.length === 0
  ) {
    return {
      approved: false,

      status:
        "NO_EXECUTABLE_QUALIFIED_OPPORTUNITY",

      decision:
        "NO_TRADE",

      counts: {
        received:
          input.length,

        executable:
          executable.length,

        selected:
          0,

        rejected:
          rejected.length,
      },

      selected: [],

      executable,

      executableNotSelected,

      rejected,

      nextStage:
        "NONE",

      paperExecutionAuthority:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  return {
    approved: true,

    status:
      "EXECUTABLE_OPPORTUNITY_SELECTED",

    decision:
      selected.length === 1
        ? selected[0].direction
        : "MULTIPLE",

    counts: {
      received:
        input.length,

      executable:
        executable.length,

      selected:
        selected.length,

      rejected:
        rejected.length,
    },

    selected,

    executable,

    executableNotSelected,

    rejected,

    nextStage:
      "PAPER_EXECUTION_AUTHORITY_GATE",

    paperExecutionAuthority:
      false,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export {
  DEFAULT_POLICY as
    CRYPTO_EXECUTABLE_OPPORTUNITY_POLICY,
};

export default
  selectExecutableCryptoOpportunities;