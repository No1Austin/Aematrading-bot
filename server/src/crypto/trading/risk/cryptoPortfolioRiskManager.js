/**
 * AEMA CRYPTO
 * Phase 5.12 — Portfolio Exposure & Correlation Risk Manager
 *
 * PURPOSE
 * -------
 * Controls portfolio-level risk BEFORE risk is increased.
 *
 * It evaluates:
 * - gross exposure
 * - net directional exposure
 * - simultaneous positions
 * - per-asset concentration
 * - correlated same-direction exposure
 * - BTC/ETH/systemic dependency concentration
 * - theme/sector concentration
 * - leverage-weighted exposure
 * - portfolio drawdown
 * - market stress
 *
 * IMPORTANT
 * ---------
 * This module has NO execution authority.
 *
 * Risk-reducing actions are never vetoed:
 * - REDUCE_EXPOSURE
 * - EXIT_POSITION
 * - EMERGENCY_EXIT
 * - PROTECT_POSITION
 */

const DEFAULT_LIMITS = Object.freeze({
  maxGrossExposure: 4.0,
  maxNetExposure: 3.0,
  maxPositions: 8,

  maxAssetExposure: 1.0,

  maxCorrelatedExposure: 2.25,
  maxSystemicExposure: 2.75,
  maxThemeExposure: 2.0,

  maxLeverageWeightedExposure: 10.0,

  warningDrawdownPercent: 4,
  defensiveDrawdownPercent: 7,
  hardDrawdownPercent: 10,

  stressExposureMultiplier: 0.55,
  defensiveExposureMultiplier: 0.65,

  minimumUsefulExposure: 0.15,

  highCorrelationThreshold: 0.72,
  highDependencyThreshold: 0.70,
});

const RISK_REDUCING_ACTIONS =
  new Set([
    "REDUCE_EXPOSURE",
    "EXIT_POSITION",
    "EMERGENCY_EXIT",
    "PROTECT_POSITION",
  ]);

const RISK_INCREASING_ACTIONS =
  new Set([
    "OPEN_POSITION",
    "ADD_EXPOSURE",
  ]);

function finite(
  value,
  fallback = 0,
) {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
}

function clamp(
  value,
  min = 0,
  max = 1,
) {
  return Math.min(
    max,
    Math.max(
      min,
      finite(value, min),
    ),
  );
}

function upper(
  value,
  fallback = "",
) {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
}

function directionSign(direction) {
  const d = upper(direction);

  if (d === "LONG") {
    return 1;
  }

  if (d === "SHORT") {
    return -1;
  }

  return 0;
}

function round(value, decimals = 4) {
  const factor =
    10 ** decimals;

  return (
    Math.round(
      finite(value) *
        factor,
    ) / factor
  );
}

function normalizePosition(
  position = {},
) {
  return {
    symbol:
      upper(
        position.symbol,
        "UNKNOWN",
      ),

    direction:
      upper(
        position.direction,
        "NEUTRAL",
      ),

    exposure:
      Math.max(
        0,
        finite(
          position.exposure ??
            position.currentExposure,
          0,
        ),
      ),

    leverage:
      Math.max(
        1,
        finite(
          position.leverage,
          1,
        ),
      ),

    theme:
      upper(
        position.theme ??
          position.sector ??
          position.category,
        "UNKNOWN",
      ),

    btcDependency:
      clamp(
        position.btcDependency,
      ),

    ethDependency:
      clamp(
        position.ethDependency,
      ),

    systemicDependency:
      clamp(
        position.systemicDependency ??
          position.overallDependency ??
          Math.max(
            finite(
              position.btcDependency,
            ),
            finite(
              position.ethDependency,
            ),
          ),
      ),

    correlations:
      position.correlations &&
      typeof position.correlations ===
        "object"
        ? position.correlations
        : {},
  };
}

function normalizePositions(
  positions,
) {
  return (
    Array.isArray(positions)
      ? positions
      : []
  )
    .map(normalizePosition)
    .filter(
      (position) =>
        position.exposure > 0 &&
        (
          position.direction ===
            "LONG" ||
          position.direction ===
            "SHORT"
        ),
    );
}

function getCorrelation(
  candidate,
  existing,
) {
  const symbol =
    upper(existing.symbol);

  const candidateMap =
    candidate?.correlations ??
    {};

  const existingMap =
    existing?.correlations ??
    {};

  const direct =
    finite(
      candidateMap[symbol],
      NaN,
    );

  if (
    Number.isFinite(direct)
  ) {
    return Math.abs(direct);
  }

  const reverse =
    finite(
      existingMap[
        upper(candidate.symbol)
      ],
      NaN,
    );

  if (
    Number.isFinite(reverse)
  ) {
    return Math.abs(reverse);
  }

  return 0;
}

function calculatePortfolioMetrics(
  positions,
) {
  let grossExposure = 0;
  let netExposure = 0;
  let longExposure = 0;
  let shortExposure = 0;

  let leverageWeightedExposure =
    0;

  for (
    const position of positions
  ) {
    const exposure =
      position.exposure;

    grossExposure += exposure;

    leverageWeightedExposure +=
      exposure *
      position.leverage;

    if (
      position.direction ===
        "LONG"
    ) {
      longExposure += exposure;
      netExposure += exposure;
    }

    if (
      position.direction ===
        "SHORT"
    ) {
      shortExposure += exposure;
      netExposure -= exposure;
    }
  }

  return {
    positionCount:
      positions.length,

    grossExposure:
      round(grossExposure),

    longExposure:
      round(longExposure),

    shortExposure:
      round(shortExposure),

    netExposure:
      round(netExposure),

    absoluteNetExposure:
      round(
        Math.abs(netExposure),
      ),

    leverageWeightedExposure:
      round(
        leverageWeightedExposure,
      ),
  };
}

function sameDirectionExposure(
  positions,
  direction,
) {
  return positions
    .filter(
      (position) =>
        position.direction ===
        direction,
    )
    .reduce(
      (sum, position) =>
        sum +
        position.exposure,
      0,
    );
}

function themeExposure(
  positions,
  candidate,
) {
  if (
    !candidate.theme ||
    candidate.theme ===
      "UNKNOWN"
  ) {
    return 0;
  }

  return positions
    .filter(
      (position) =>
        position.direction ===
          candidate.direction &&
        position.theme ===
          candidate.theme,
    )
    .reduce(
      (sum, position) =>
        sum +
        position.exposure,
      0,
    );
}

function correlatedExposure(
  positions,
  candidate,
  threshold,
) {
  let exposure = 0;

  const correlated = [];

  for (
    const position of positions
  ) {
    if (
      position.direction !==
        candidate.direction
    ) {
      continue;
    }

    const correlation =
      getCorrelation(
        candidate,
        position,
      );

    if (
      correlation >= threshold
    ) {
      exposure +=
        position.exposure;

      correlated.push({
        symbol:
          position.symbol,

        exposure:
          position.exposure,

        correlation:
          round(
            correlation,
          ),
      });
    }
  }

  return {
    exposure:
      round(exposure),

    correlated,
  };
}

function systemicExposure(
  positions,
  candidate,
  threshold,
) {
  if (
    candidate.systemicDependency <
      threshold
  ) {
    return 0;
  }

  return round(
    positions
      .filter(
        (position) =>
          position.direction ===
            candidate.direction &&
          position
            .systemicDependency >=
            threshold,
      )
      .reduce(
        (sum, position) =>
          sum +
          position.exposure,
        0,
      ),
  );
}

function buildResult({
  approved,
  state,
  action,
  requestedExposure,
  approvedExposure,
  currentMetrics,
  projectedMetrics,
  reasons = [],
  warnings = [],
  riskReducing = false,
  portfolioVeto = false,
}) {
  return {
    approved,
    state,
    action,

    requestedExposure:
      round(requestedExposure),

    approvedExposure:
      round(approvedExposure),

    exposureMultiplier:
      requestedExposure > 0
        ? round(
            approvedExposure /
              requestedExposure,
          )
        : 0,

    riskReducing,
    portfolioVeto,

    currentMetrics,
    projectedMetrics,

    reasons: [
      ...new Set(reasons),
    ],

    warnings: [
      ...new Set(warnings),
    ],

    executionAuthority: false,

    generatedAt:
      new Date()
        .toISOString(),
  };
}

function projectMetrics(
  positions,
  candidate,
  exposure,
) {
  const projected = [
    ...positions,
  ];

  if (exposure > 0) {
    projected.push({
      ...candidate,
      exposure,
    });
  }

  return calculatePortfolioMetrics(
    projected,
  );
}

export default async function
evaluateCryptoPortfolioRisk(
  context = {},
) {
  const limits = {
    ...DEFAULT_LIMITS,
    ...(context.limits ?? {}),
  };

  const action =
    upper(
      context.action ??
        context.lifecycle?.action,
      "HOLD",
    );

  const positions =
    normalizePositions(
      context.positions,
    );

  const currentMetrics =
    calculatePortfolioMetrics(
      positions,
    );

  /*
   * ==========================================================
   * RISK REDUCTION BYPASS
   * ==========================================================
   */

  if (
    RISK_REDUCING_ACTIONS.has(
      action,
    )
  ) {
    return buildResult({
      approved: true,

      state:
        "RISK_REDUCTION_ALLOWED",

      action,

      requestedExposure: 0,
      approvedExposure: 0,

      currentMetrics,
      projectedMetrics:
        currentMetrics,

      riskReducing: true,
      portfolioVeto: false,

      reasons: [
        "RISK_REDUCING_ACTION_ALWAYS_PERMITTED",
      ],
    });
  }

  /*
   * HOLD does not increase portfolio risk.
   */

  if (
    !RISK_INCREASING_ACTIONS.has(
      action,
    )
  ) {
    return buildResult({
      approved: true,

      state:
        "NO_PORTFOLIO_CHANGE",

      action,

      requestedExposure: 0,
      approvedExposure: 0,

      currentMetrics,
      projectedMetrics:
        currentMetrics,

      portfolioVeto: false,

      reasons: [
        "NO_RISK_INCREASE_REQUESTED",
      ],
    });
  }

  const rawCandidate = {
    ...(context.candidate ?? {}),
  };

  const candidate =
    normalizePosition({
      ...rawCandidate,

      direction:
        rawCandidate.direction ??
        context.direction ??
        context.lifecycle
          ?.direction,

      exposure:
        context.requestedExposure ??
        context.lifecycle
          ?.targetExposure ??
        rawCandidate.exposure,

      leverage:
        rawCandidate.leverage ??
        context.riskPlan
          ?.leverage ??
        1,
    });

  const requestedExposure =
    Math.max(
      0,
      finite(
        context.requestedExposure ??
          context.lifecycle
            ?.targetExposure ??
          candidate.exposure,
        0,
      ),
    );

  const reasons = [];
  const warnings = [];

  if (
    candidate.direction !==
      "LONG" &&
    candidate.direction !==
      "SHORT"
  ) {
    return buildResult({
      approved: false,

      state:
        "PORTFOLIO_BLOCKED",

      action,

      requestedExposure,
      approvedExposure: 0,

      currentMetrics,
      projectedMetrics:
        currentMetrics,

      portfolioVeto: true,

      reasons: [
        "INVALID_DIRECTION",
      ],
    });
  }

  /*
   * ==========================================================
   * DRAWDOWN / MARKET STRESS
   * ==========================================================
   */

  const drawdown =
    Math.max(
      0,
      finite(
        context
          .portfolioDrawdownPercent,
        0,
      ),
    );

  const marketStress =
    context.marketStress === true ||
    upper(
      context.marketRegime,
    ) ===
      "LIQUIDATION_STRESS";

  /*
   * Hard drawdown stops NEW risk.
   *
   * Existing positions can still be
   * reduced/exited because that logic
   * returned above.
   */
  if (
    drawdown >=
      limits.hardDrawdownPercent
  ) {
    return buildResult({
      approved: false,

      state:
        "PORTFOLIO_BLOCKED",

      action,

      requestedExposure,
      approvedExposure: 0,

      currentMetrics,
      projectedMetrics:
        currentMetrics,

      portfolioVeto: true,

      reasons: [
        "PORTFOLIO_HARD_DRAWDOWN_LIMIT",
      ],
    });
  }

  let allowedExposure =
    requestedExposure;

  /*
   * Defensive scaling rather than
   * immediately killing the trade.
   */
  if (
    drawdown >=
      limits.defensiveDrawdownPercent
  ) {
    allowedExposure *=
      limits
        .defensiveExposureMultiplier;

    warnings.push(
      "PORTFOLIO_DRAWDOWN_DEFENSIVE_SCALING",
    );
  } else if (
    drawdown >=
      limits.warningDrawdownPercent
  ) {
    allowedExposure *= 0.8;

    warnings.push(
      "PORTFOLIO_DRAWDOWN_WARNING",
    );
  }

  if (marketStress) {
    allowedExposure *=
      limits
        .stressExposureMultiplier;

    warnings.push(
      "MARKET_STRESS_PORTFOLIO_SCALING",
    );
  }

  /*
   * ==========================================================
   * POSITION COUNT
   * ==========================================================
   */

  const sameSymbol =
    positions.find(
      (position) =>
        position.symbol ===
        candidate.symbol,
    );

  const isNewPosition =
    action ===
      "OPEN_POSITION" &&
    !sameSymbol;

  if (
    isNewPosition &&
    currentMetrics
      .positionCount >=
      limits.maxPositions
  ) {
    return buildResult({
      approved: false,

      state:
        "PORTFOLIO_BLOCKED",

      action,

      requestedExposure,
      approvedExposure: 0,

      currentMetrics,
      projectedMetrics:
        currentMetrics,

      portfolioVeto: true,

      reasons: [
        "MAX_SIMULTANEOUS_POSITIONS",
      ],

      warnings,
    });
  }

  /*
   * ==========================================================
   * PER-ASSET CONCENTRATION
   * ==========================================================
   */

  const existingAssetExposure =
    positions
      .filter(
        (position) =>
          position.symbol ===
          candidate.symbol &&
        position.direction ===
          candidate.direction,
      )
      .reduce(
        (sum, position) =>
          sum +
          position.exposure,
        0,
      );

  const remainingAssetCapacity =
    Math.max(
      0,
      limits.maxAssetExposure -
        existingAssetExposure,
    );

  if (
    allowedExposure >
      remainingAssetCapacity
  ) {
    allowedExposure =
      remainingAssetCapacity;

    warnings.push(
      "PER_ASSET_EXPOSURE_REDUCED",
    );
  }

  /*
   * ==========================================================
   * GROSS EXPOSURE
   * ==========================================================
   */

  const grossCapacity =
    Math.max(
      0,
      limits.maxGrossExposure -
        currentMetrics
          .grossExposure,
    );

  if (
    allowedExposure >
      grossCapacity
  ) {
    allowedExposure =
      grossCapacity;

    warnings.push(
      "GROSS_EXPOSURE_REDUCED",
    );
  }

  /*
   * ==========================================================
   * NET DIRECTIONAL EXPOSURE
   * ==========================================================
   *
   * Opposite-direction positions can
   * reduce net portfolio exposure.
   */

  const sign =
    directionSign(
      candidate.direction,
    );

  if (sign !== 0) {
    const currentNet =
      currentMetrics.netExposure;

    /*
     * Find maximum candidate exposure
     * that keeps absolute net exposure
     * within the configured limit.
     *
     * For a LONG:
     * currentNet + exposure <= limit
     *
     * For a SHORT:
     * currentNet - exposure >= -limit
     */
    let netCapacity =
      Infinity;

    if (sign > 0) {
      netCapacity =
        limits.maxNetExposure -
        currentNet;
    } else {
      netCapacity =
        limits.maxNetExposure +
        currentNet;
    }

    /*
     * If candidate moves portfolio
     * toward neutral, don't punish it.
     */
    const projectedWithRequest =
      currentNet +
      sign *
        allowedExposure;

    const improvesNetRisk =
      Math.abs(
        projectedWithRequest,
      ) <
      Math.abs(currentNet);

    if (
      !improvesNetRisk &&
      allowedExposure >
        Math.max(
          0,
          netCapacity,
        )
    ) {
      allowedExposure =
        Math.max(
          0,
          netCapacity,
        );

      warnings.push(
        "NET_DIRECTIONAL_EXPOSURE_REDUCED",
      );
    }
  }

  /*
   * ==========================================================
   * LEVERAGE-WEIGHTED EXPOSURE
   * ==========================================================
   */

  const leverageCapacity =
    Math.max(
      0,
      limits
        .maxLeverageWeightedExposure -
        currentMetrics
          .leverageWeightedExposure,
    );

  const candidateLeverage =
    Math.max(
      1,
      candidate.leverage,
    );

  const leverageExposureCapacity =
    leverageCapacity /
    candidateLeverage;

  if (
    allowedExposure >
      leverageExposureCapacity
  ) {
    allowedExposure =
      leverageExposureCapacity;

    warnings.push(
      "LEVERAGE_BUDGET_REDUCED",
    );
  }

  /*
   * ==========================================================
   * CORRELATION CLUSTER
   * ==========================================================
   */

  const correlation =
    correlatedExposure(
      positions,
      candidate,
      limits
        .highCorrelationThreshold,
    );

  const correlationCapacity =
    Math.max(
      0,
      limits
        .maxCorrelatedExposure -
        correlation.exposure,
    );

  if (
    allowedExposure >
      correlationCapacity
  ) {
    allowedExposure =
      correlationCapacity;

    warnings.push(
      "CORRELATED_EXPOSURE_REDUCED",
    );
  }

  /*
   * ==========================================================
   * BTC / ETH / SYSTEMIC DEPENDENCY
   * ==========================================================
   */

  const currentSystemicExposure =
    systemicExposure(
      positions,
      candidate,
      limits
        .highDependencyThreshold,
    );

  if (
    candidate.systemicDependency >=
      limits
        .highDependencyThreshold
  ) {
    const systemicCapacity =
      Math.max(
        0,
        limits
          .maxSystemicExposure -
          currentSystemicExposure,
      );

    if (
      allowedExposure >
        systemicCapacity
    ) {
      allowedExposure =
        systemicCapacity;

      warnings.push(
        "SYSTEMIC_DEPENDENCY_EXPOSURE_REDUCED",
      );
    }
  }

  /*
   * ==========================================================
   * THEME / SECTOR CONCENTRATION
   * ==========================================================
   */

  const currentThemeExposure =
    themeExposure(
      positions,
      candidate,
    );

  if (
    candidate.theme !==
      "UNKNOWN"
  ) {
    const themeCapacity =
      Math.max(
        0,
        limits.maxThemeExposure -
          currentThemeExposure,
      );

    if (
      allowedExposure >
        themeCapacity
    ) {
      allowedExposure =
        themeCapacity;

      warnings.push(
        "THEME_CONCENTRATION_REDUCED",
      );
    }
  }

  allowedExposure =
    Math.max(
      0,
      allowedExposure,
    );

  /*
   * ==========================================================
   * FINAL DECISION
   * ==========================================================
   */

  if (
    allowedExposure <
      limits.minimumUsefulExposure
  ) {
    return buildResult({
      approved: false,

      state:
        "PORTFOLIO_BLOCKED",

      action,

      requestedExposure,
      approvedExposure: 0,

      currentMetrics,
      projectedMetrics:
        currentMetrics,

      portfolioVeto: true,

      reasons: [
        "NO_SAFE_USEFUL_EXPOSURE_REMAINING",
      ],

      warnings,
    });
  }

  const projectedMetrics =
    projectMetrics(
      positions,
      candidate,
      allowedExposure,
    );

  const reduced =
    allowedExposure <
    requestedExposure - 0.0001;

  if (reduced) {
    reasons.push(
      "PORTFOLIO_RISK_REQUIRES_SMALLER_POSITION",
    );
  } else {
    reasons.push(
      "PORTFOLIO_RISK_WITHIN_LIMITS",
    );
  }

  return buildResult({
    approved: true,

    state:
      reduced
        ? "ALLOW_REDUCED"
        : "ALLOW_FULL",

    action,

    requestedExposure,
    approvedExposure:
      allowedExposure,

    currentMetrics,
    projectedMetrics,

    portfolioVeto: false,

    reasons,
    warnings,
  });
}

export {
  DEFAULT_LIMITS as
    CRYPTO_PORTFOLIO_RISK_LIMITS,
};