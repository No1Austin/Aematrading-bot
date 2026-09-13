// server/src/risk/correlationExposureEngine.js

/**
 * ============================================================
 * CORRELATION & EXPOSURE ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Detect hidden portfolio concentration that symbol/sector limits
 * alone cannot see.
 *
 * SAFETY CONTRACT
 * ---------------
 * - Never creates a trade.
 * - Never increases shares.
 * - Can APPROVE, REDUCE, or BLOCK only.
 * - Missing/weak correlation data cannot justify more exposure.
 * - Uses only observations supplied by the caller.
 * - Deterministic for identical inputs.
 */

export const CORRELATION_EXPOSURE_STATUS = Object.freeze({
  APPROVED: "APPROVED",
  REDUCED: "REDUCED",
  BLOCKED: "BLOCKED",
  INVALID_INPUT: "INVALID_INPUT",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  ERROR: "ERROR",
});

export const CORRELATION_EXPOSURE_ACTION = Object.freeze({
  ALLOW: "ALLOW",
  REDUCE: "REDUCE",
  BLOCK: "BLOCK",
});

export const DEFAULT_CORRELATION_CONFIG = Object.freeze({
  minimumObservations: 20,

  // Absolute correlation is used for concentration detection.
  // This is deliberately conservative for risk management.
  highCorrelationThreshold: 0.75,
  extremeCorrelationThreshold: 0.9,

  // Candidate may have at most this many highly-correlated
  // existing positions before sizing pressure is applied.
  maxHighlyCorrelatedPositions: 2,

  // Weighted candidate-vs-portfolio correlation thresholds.
  reduceWeightedCorrelation: 0.7,
  blockWeightedCorrelation: 0.9,

  // Maximum fraction of equity represented by the candidate +
  // highly-correlated positions.
  maxCorrelatedExposurePercent: 0.35,
  hardCorrelatedExposurePercent: 0.5,

  // Smallest executable reduction allowed by this engine.
  minimumExposureMultiplier: 0.25,

  // If data coverage is below this level, correlation evidence is
  // advisory only and may not approve additional risk by itself.
  minimumCoverage: 0.5,
});

function finiteNumber(value) {
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

function positiveNumber(value) {
  const number = finiteNumber(value);

  return number !== null &&
    number > 0
    ? number
    : null;
}

function normalizeSymbol(value) {
  const symbol =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return symbol || null;
}

function normalizeSide(value) {
  const side =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return (
    side === "LONG" ||
    side === "SHORT"
  )
    ? side
    : null;
}

function clamp(value, min, max) {
  return Math.min(
    Math.max(
      Number(value),
      Number(min),
    ),
    Number(max),
  );
}

function round(value, decimals = 4) {
  const number = finiteNumber(value);

  if (number === null) {
    return null;
  }

  const factor = 10 ** decimals;

  return (
    Math.round(
      (number + Number.EPSILON) *
        factor,
    ) / factor
  );
}

function normalizeReturns(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map(finiteNumber)
    .filter(
      (value) =>
        value !== null,
    );
}

/**
 * Pearson correlation using the most recent common observations.
 */
export function calculateCorrelation(
  first = [],
  second = [],
  minimumObservations = 2,
) {
  const a = normalizeReturns(first);
  const b = normalizeReturns(second);

  const count =
    Math.min(
      a.length,
      b.length,
    );

  if (
    count <
    Math.max(
      2,
      Number(minimumObservations) || 2,
    )
  ) {
    return null;
  }

  const x =
    a.slice(
      a.length - count,
    );

  const y =
    b.slice(
      b.length - count,
    );

  const meanX =
    x.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / count;

  const meanY =
    y.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) / count;

  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const dx =
      x[index] - meanX;

    const dy =
      y[index] - meanY;

    covariance += dx * dy;
    varianceX += dx * dx;
    varianceY += dy * dy;
  }

  if (
    varianceX <= 0 ||
    varianceY <= 0
  ) {
    return null;
  }

  return round(
    clamp(
      covariance /
        Math.sqrt(
          varianceX *
            varianceY,
        ),
      -1,
      1,
    ),
    6,
  );
}

function getPositionValue(position) {
  const explicit =
    positiveNumber(
      position?.marketValue ??
      position?.positionValue,
    );

  if (explicit !== null) {
    return explicit;
  }

  const shares =
    positiveNumber(
      position?.shares,
    );

  const price =
    positiveNumber(
      position?.currentPrice ??
      position?.marketPrice ??
      position?.entryPrice,
    );

  if (
    shares === null ||
    price === null
  ) {
    return 0;
  }

  return shares * price;
}

function buildBlockedResult({
  status =
    CORRELATION_EXPOSURE_STATUS.BLOCKED,
  reason,
  originalShares = 0,
  metrics = null,
  warnings = [],
  errors = [],
} = {}) {
  return {
    approved: false,
    engine: "CORRELATION_EXPOSURE",
    status,
    action:
      CORRELATION_EXPOSURE_ACTION.BLOCK,
    canExecute: false,
    exposureMultiplier: 0,
    originalShares,
    approvedShares: 0,
    metrics,
    reasons:
      reason
        ? [reason]
        : [],
    warnings,
    errors,
  };
}

function resolveConfig(config = {}) {
  return {
    ...DEFAULT_CORRELATION_CONFIG,
    ...(config ?? {}),
  };
}

/**
 * ============================================================
 * EVALUATE CORRELATION EXPOSURE
 * ============================================================
 *
 * INPUT
 * -----
 * proposedTrade:
 * {
 *   symbol,
 *   side,
 *   shares,
 *   entryPrice/currentPrice,
 *   returns: number[]
 * }
 *
 * openPositions:
 * [{
 *   symbol,
 *   side,
 *   shares,
 *   currentPrice,
 *   returns: number[]
 * }]
 *
 * account:
 * {
 *   equity
 * }
 */
export function evaluateCorrelationExposure({
  account = null,
  proposedTrade = null,
  openPositions = [],
  config = {},
} = {}) {
  try {
    const mergedConfig =
      resolveConfig(config);

    const equity =
      positiveNumber(
        account?.equity ??
        account?.balance,
      );

    const symbol =
      normalizeSymbol(
        proposedTrade?.symbol,
      );

    const side =
      normalizeSide(
        proposedTrade?.side,
      );

    const originalShares =
      positiveNumber(
        proposedTrade?.shares,
      );

    const entryPrice =
      positiveNumber(
        proposedTrade?.entryPrice ??
        proposedTrade?.currentPrice,
      );

    if (
      equity === null ||
      !symbol ||
      !side ||
      originalShares === null ||
      entryPrice === null
    ) {
      return buildBlockedResult({
        status:
          CORRELATION_EXPOSURE_STATUS
            .INVALID_INPUT,
        reason:
          "Valid account equity and proposed trade are required.",
        originalShares:
          originalShares ?? 0,
      });
    }

    const candidateReturns =
      normalizeReturns(
        proposedTrade?.returns,
      );

    const positions =
      Array.isArray(openPositions)
        ? openPositions
        : [];

    if (positions.length === 0) {
      return {
        approved: true,
        engine:
          "CORRELATION_EXPOSURE",
        status:
          CORRELATION_EXPOSURE_STATUS
            .APPROVED,
        action:
          CORRELATION_EXPOSURE_ACTION
            .ALLOW,
        canExecute: true,
        exposureMultiplier: 1,
        originalShares,
        approvedShares:
          originalShares,
        metrics: {
          evaluatedPositions: 0,
          usableCorrelations: 0,
          coverage: 1,
          highlyCorrelatedPositions: 0,
          extremeCorrelatedPositions: 0,
          weightedAbsoluteCorrelation: 0,
          correlatedExposurePercent:
            round(
              (
                originalShares *
                entryPrice
              ) / equity,
              6,
            ),
        },
        reasons: [
          "No existing positions create correlation concentration.",
        ],
        warnings: [],
        errors: [],
      };
    }

    const correlations = [];

    for (
      const position
      of positions
    ) {
      const positionSymbol =
        normalizeSymbol(
          position?.symbol,
        );

      if (!positionSymbol) {
        continue;
      }

      const correlation =
        calculateCorrelation(
          candidateReturns,
          position?.returns,
          mergedConfig
            .minimumObservations,
        );

      if (correlation === null) {
        continue;
      }

      correlations.push({
        symbol:
          positionSymbol,
        side:
          normalizeSide(
            position?.side,
          ),
        correlation,
        absoluteCorrelation:
          Math.abs(correlation),
        positionValue:
          getPositionValue(
            position,
          ),
      });
    }

    const evaluatedPositions =
      positions.length;

    const usableCorrelations =
      correlations.length;

    const coverage =
      evaluatedPositions > 0
        ? (
            usableCorrelations /
            evaluatedPositions
          )
        : 1;

    const high =
      correlations.filter(
        (item) =>
          item.absoluteCorrelation >=
          mergedConfig
            .highCorrelationThreshold,
      );

    const extreme =
      correlations.filter(
        (item) =>
          item.absoluteCorrelation >=
          mergedConfig
            .extremeCorrelationThreshold,
      );

    const totalWeight =
      correlations.reduce(
        (sum, item) =>
          sum +
          Math.max(
            item.positionValue,
            1,
          ),
        0,
      );

    const weightedAbsoluteCorrelation =
      totalWeight > 0
        ? correlations.reduce(
            (sum, item) =>
              sum +
              (
                item.absoluteCorrelation *
                Math.max(
                  item.positionValue,
                  1,
                )
              ),
            0,
          ) / totalWeight
        : 0;

    const candidateValue =
      originalShares *
      entryPrice;

    const correlatedExistingValue =
      high.reduce(
        (sum, item) =>
          sum +
          item.positionValue,
        0,
      );

    const correlatedExposurePercent =
      (
        candidateValue +
        correlatedExistingValue
      ) / equity;

    const metrics = {
      evaluatedPositions,
      usableCorrelations,
      coverage:
        round(
          coverage,
          6,
        ),
      highlyCorrelatedPositions:
        high.length,
      extremeCorrelatedPositions:
        extreme.length,
      weightedAbsoluteCorrelation:
        round(
          weightedAbsoluteCorrelation,
          6,
        ),
      correlatedExposurePercent:
        round(
          correlatedExposurePercent,
          6,
        ),
      correlations,
    };

    const warnings = [];

    if (
      coverage <
      mergedConfig.minimumCoverage
    ) {
      warnings.push(
        "Correlation coverage is below the preferred minimum; missing data was not treated as zero correlation.",
      );
    }

    /*
     * No usable observations means this engine has no evidence
     * with which to justify a reduction. It therefore passes the
     * already-approved size unchanged but explicitly marks the
     * evidence as insufficient.
     *
     * Upstream Trade Risk + Portfolio Risk remain authoritative.
     */
    if (
      usableCorrelations === 0
    ) {
      return {
        approved: true,
        engine:
          "CORRELATION_EXPOSURE",
        status:
          CORRELATION_EXPOSURE_STATUS
            .INSUFFICIENT_DATA,
        action:
          CORRELATION_EXPOSURE_ACTION
            .ALLOW,
        canExecute: true,
        exposureMultiplier: 1,
        originalShares,
        approvedShares:
          originalShares,
        metrics,
        reasons: [
          "No usable correlation observations were available.",
        ],
        warnings,
        errors: [],
      };
    }

    /*
     * HARD CORRELATION BLOCK
     */
    if (
      weightedAbsoluteCorrelation >=
        mergedConfig
          .blockWeightedCorrelation &&
      correlatedExposurePercent >=
        mergedConfig
          .hardCorrelatedExposurePercent
    ) {
      return buildBlockedResult({
        reason:
          "Candidate would create excessive highly-correlated portfolio exposure.",
        originalShares,
        metrics,
        warnings,
      });
    }

    let multiplier = 1;
    const reasons = [];

    /*
     * CORRELATED POSITION COUNT
     */
    if (
      high.length >
      mergedConfig
        .maxHighlyCorrelatedPositions
    ) {
      multiplier =
        Math.min(
          multiplier,
          mergedConfig
            .maxHighlyCorrelatedPositions /
            high.length,
        );

      reasons.push(
        "Candidate is highly correlated with too many existing positions.",
      );
    }

    /*
     * WEIGHTED CORRELATION
     */
    if (
      weightedAbsoluteCorrelation >=
      mergedConfig
        .reduceWeightedCorrelation
    ) {
      const correlationMultiplier =
        clamp(
          (
            mergedConfig
              .blockWeightedCorrelation -
            weightedAbsoluteCorrelation
          ) /
            Math.max(
              mergedConfig
                .blockWeightedCorrelation -
                mergedConfig
                  .reduceWeightedCorrelation,
              0.000001,
            ),
          mergedConfig
            .minimumExposureMultiplier,
          1,
        );

      multiplier =
        Math.min(
          multiplier,
          correlationMultiplier,
        );

      reasons.push(
        "Portfolio-weighted correlation requires lower exposure.",
      );
    }

    /*
     * CORRELATED EXPOSURE CAP
     *
     * Solve for the candidate value that keeps:
     *
     * correlatedExistingValue + candidateValue
     * <= equity * maxCorrelatedExposurePercent
     */
    if (
      correlatedExposurePercent >
      mergedConfig
        .maxCorrelatedExposurePercent
    ) {
      const remainingCapacity =
        (
          equity *
          mergedConfig
            .maxCorrelatedExposurePercent
        ) -
        correlatedExistingValue;

      const exposureMultiplier =
        remainingCapacity <= 0
          ? 0
          : clamp(
              remainingCapacity /
                candidateValue,
              0,
              1,
            );

      multiplier =
        Math.min(
          multiplier,
          exposureMultiplier,
        );

      reasons.push(
        "Correlated portfolio exposure exceeds the configured concentration limit.",
      );
    }

    multiplier =
      clamp(
        multiplier,
        0,
        1,
      );

    if (
      multiplier <
      mergedConfig
        .minimumExposureMultiplier
    ) {
      return buildBlockedResult({
        reason:
          "Required correlation reduction is below the minimum executable exposure.",
        originalShares,
        metrics,
        warnings,
      });
    }

    const approvedShares =
      Math.min(
        originalShares,
        Math.max(
          1,
          Math.floor(
            originalShares *
            multiplier,
          ),
        ),
      );

    if (
      approvedShares <
      originalShares
    ) {
      return {
        approved: true,
        engine:
          "CORRELATION_EXPOSURE",
        status:
          CORRELATION_EXPOSURE_STATUS
            .REDUCED,
        action:
          CORRELATION_EXPOSURE_ACTION
            .REDUCE,
        canExecute: true,
        exposureMultiplier:
          round(
            approvedShares /
              originalShares,
            6,
          ),
        originalShares,
        approvedShares,
        metrics,
        reasons,
        warnings,
        errors: [],
      };
    }

    return {
      approved: true,
      engine:
        "CORRELATION_EXPOSURE",
      status:
        CORRELATION_EXPOSURE_STATUS
          .APPROVED,
      action:
        CORRELATION_EXPOSURE_ACTION
          .ALLOW,
      canExecute: true,
      exposureMultiplier: 1,
      originalShares,
      approvedShares:
        originalShares,
      metrics,
      reasons: [
        "Correlation exposure is within configured limits.",
      ],
      warnings,
      errors: [],
    };
  } catch (error) {
    return buildBlockedResult({
      status:
        CORRELATION_EXPOSURE_STATUS
          .ERROR,
      reason:
        "Correlation exposure engine failed closed.",
      errors: [
        error?.message ??
        "Unknown correlation exposure error.",
      ],
    });
  }
}

export default evaluateCorrelationExposure;
