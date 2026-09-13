// server/src/risk/volatilityRiskEngine.js

export const VOLATILITY_RISK_STATUS = Object.freeze({
  APPROVED: "APPROVED",
  REDUCED: "REDUCED",
  BLOCKED: "BLOCKED",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  INVALID_INPUT: "INVALID_INPUT",
  ERROR: "ERROR",
});

export const VOLATILITY_RISK_ACTION = Object.freeze({
  ALLOW: "ALLOW",
  REDUCE: "REDUCE",
  BLOCK: "BLOCK",
});

export const DEFAULT_VOLATILITY_RISK_CONFIG = Object.freeze({
  atrReducePercent: 3,
  atrSeverePercent: 5,
  atrBlockPercent: 8,
  realizedReduce: 0.35,
  realizedSevere: 0.55,
  realizedBlock: 0.9,
  expansionReduceRatio: 1.5,
  expansionSevereRatio: 2,
  expansionBlockRatio: 3,
  moderateMultiplier: 0.75,
  severeMultiplier: 0.5,
  minimumExposureMultiplier: 0.2,
  requireVolatilityEvidence: true,
});

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveNumber(value) {
  const n = finiteNumber(value);
  return n !== null && n > 0 ? n : null;
}

function nonNegativeNumber(value) {
  const n = finiteNumber(value);
  return n !== null && n >= 0 ? n : null;
}

function normalizeSide(value) {
  const side = String(value ?? "").trim().toUpperCase();
  return side === "LONG" || side === "SHORT" ? side : null;
}

function normalizeRegime(value) {
  const regime = String(value ?? "").trim().toUpperCase();
  return regime || null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function resolveConfig(config = {}) {
  return {
    ...DEFAULT_VOLATILITY_RISK_CONFIG,
    ...(config && typeof config === "object" ? config : {}),
  };
}

function blocked({
  status = VOLATILITY_RISK_STATUS.BLOCKED,
  reason,
  originalShares = 0,
  metrics = null,
  warnings = [],
  errors = [],
} = {}) {
  return {
    approved: false,
    engine: "VOLATILITY_RISK",
    status,
    action: VOLATILITY_RISK_ACTION.BLOCK,
    canExecute: false,
    exposureMultiplier: 0,
    originalShares,
    approvedShares: 0,
    metrics,
    reasons: reason ? [reason] : [],
    warnings,
    errors,
  };
}

function classifyRegime(value) {
  const regime = normalizeRegime(value);
  if (!regime) return null;

  if (["EXTREME", "EXTREME_VOLATILITY", "CRISIS", "PANIC", "SHOCK"].includes(regime)) {
    return "BLOCK";
  }

  if (["HIGH", "HIGH_VOLATILITY", "VERY_HIGH", "TURBULENT"].includes(regime)) {
    return "SEVERE";
  }

  if (["ELEVATED", "MODERATE_HIGH", "RISING"].includes(regime)) {
    return "MODERATE";
  }

  if (["LOW", "NORMAL", "MODERATE", "STABLE"].includes(regime)) {
    return "NORMAL";
  }

  return null;
}

/**
 * Volatility-aware position sizing safety gate.
 *
 * proposedTrade:
 * { symbol, side, shares, entryPrice }
 *
 * volatility:
 * {
 *   atr,
 *   atrPercent,
 *   realizedVolatility,
 *   baselineVolatility,
 *   volatilityRegime,
 *   shockActive
 * }
 */
export function evaluateVolatilityRisk({
  proposedTrade = null,
  volatility = null,
  config = {},
} = {}) {
  try {
    const cfg = resolveConfig(config);
    const symbol = String(proposedTrade?.symbol ?? "").trim().toUpperCase();
    const side = normalizeSide(proposedTrade?.side);
    const originalShares = positiveNumber(proposedTrade?.shares);
    const entryPrice = positiveNumber(
      proposedTrade?.entryPrice ?? proposedTrade?.currentPrice,
    );

    if (!symbol || !side || originalShares === null || entryPrice === null) {
      return blocked({
        status: VOLATILITY_RISK_STATUS.INVALID_INPUT,
        reason: "Valid proposed trade symbol, side, shares, and entry price are required.",
        originalShares: originalShares ?? 0,
      });
    }

    const input =
      volatility && typeof volatility === "object" ? volatility : {};

    const explicitAtrPercent = nonNegativeNumber(input.atrPercent);
    const atr = nonNegativeNumber(input.atr);

    const atrPercent =
      explicitAtrPercent !== null
        ? explicitAtrPercent
        : atr !== null
          ? round((atr / entryPrice) * 100)
          : null;

    const realizedVolatility = nonNegativeNumber(input.realizedVolatility);
    const baselineVolatility = positiveNumber(input.baselineVolatility);

    const volatilityExpansionRatio =
      realizedVolatility !== null && baselineVolatility !== null
        ? round(realizedVolatility / baselineVolatility)
        : null;

    const volatilityRegime = normalizeRegime(
      input.volatilityRegime ?? input.regime,
    );

    const shockActive =
      input.shockActive === true || input.extremeVolatility === true;

    const evidenceCount = [
      atrPercent !== null,
      realizedVolatility !== null,
      volatilityExpansionRatio !== null,
      volatilityRegime !== null,
      shockActive,
    ].filter(Boolean).length;

    const metrics = {
      atrPercent,
      realizedVolatility,
      baselineVolatility,
      volatilityExpansionRatio,
      volatilityRegime,
      shockActive,
      evidenceCount,
    };

    if (cfg.requireVolatilityEvidence === true && evidenceCount === 0) {
      return blocked({
        status: VOLATILITY_RISK_STATUS.INSUFFICIENT_DATA,
        reason:
          "No usable volatility evidence was available; missing volatility was not treated as low volatility.",
        originalShares,
        metrics,
        warnings: ["Volatility risk could not be evaluated safely."],
      });
    }

    if (shockActive) {
      return blocked({
        reason: "Extreme volatility or market shock is active.",
        originalShares,
        metrics,
      });
    }

    if (atrPercent !== null && atrPercent >= cfg.atrBlockPercent) {
      return blocked({
        reason: "ATR relative to price exceeds the configured volatility block threshold.",
        originalShares,
        metrics,
      });
    }

    if (
      realizedVolatility !== null &&
      realizedVolatility >= cfg.realizedBlock
    ) {
      return blocked({
        reason: "Realized volatility exceeds the configured block threshold.",
        originalShares,
        metrics,
      });
    }

    if (
      volatilityExpansionRatio !== null &&
      volatilityExpansionRatio >= cfg.expansionBlockRatio
    ) {
      return blocked({
        reason: "Volatility expansion exceeds the configured shock threshold.",
        originalShares,
        metrics,
      });
    }

    const regimeClass = classifyRegime(volatilityRegime);

    if (regimeClass === "BLOCK") {
      return blocked({
        reason: "Volatility regime is classified as extreme.",
        originalShares,
        metrics,
      });
    }

    let multiplier = 1;
    const reasons = [];

    const moderate = (reason) => {
      multiplier = Math.min(multiplier, clamp(cfg.moderateMultiplier, 0, 1));
      reasons.push(reason);
    };

    const severe = (reason) => {
      multiplier = Math.min(multiplier, clamp(cfg.severeMultiplier, 0, 1));
      reasons.push(reason);
    };

    if (atrPercent !== null) {
      if (atrPercent >= cfg.atrSeverePercent) {
        severe("ATR relative to price indicates severe volatility.");
      } else if (atrPercent >= cfg.atrReducePercent) {
        moderate("ATR relative to price indicates elevated volatility.");
      }
    }

    if (realizedVolatility !== null) {
      if (realizedVolatility >= cfg.realizedSevere) {
        severe("Realized volatility requires substantial exposure reduction.");
      } else if (realizedVolatility >= cfg.realizedReduce) {
        moderate("Realized volatility requires lower exposure.");
      }
    }

    if (volatilityExpansionRatio !== null) {
      if (volatilityExpansionRatio >= cfg.expansionSevereRatio) {
        severe("Current volatility has expanded sharply relative to baseline.");
      } else if (volatilityExpansionRatio >= cfg.expansionReduceRatio) {
        moderate("Current volatility is elevated relative to baseline.");
      }
    }

    if (regimeClass === "SEVERE") {
      severe("High-volatility regime requires substantial exposure reduction.");
    } else if (regimeClass === "MODERATE") {
      moderate("Elevated volatility regime requires lower exposure.");
    }

    multiplier = clamp(multiplier, 0, 1);

    if (multiplier < cfg.minimumExposureMultiplier) {
      return blocked({
        reason: "Required volatility reduction is below the minimum executable exposure.",
        originalShares,
        metrics,
      });
    }

    const approvedShares = Math.min(
      originalShares,
      Math.max(1, Math.floor(originalShares * multiplier)),
    );

    if (approvedShares < originalShares) {
      return {
        approved: true,
        engine: "VOLATILITY_RISK",
        status: VOLATILITY_RISK_STATUS.REDUCED,
        action: VOLATILITY_RISK_ACTION.REDUCE,
        canExecute: true,
        exposureMultiplier: round(approvedShares / originalShares),
        originalShares,
        approvedShares,
        metrics,
        reasons,
        warnings: [],
        errors: [],
      };
    }

    return {
      approved: true,
      engine: "VOLATILITY_RISK",
      status: VOLATILITY_RISK_STATUS.APPROVED,
      action: VOLATILITY_RISK_ACTION.ALLOW,
      canExecute: true,
      exposureMultiplier: 1,
      originalShares,
      approvedShares: originalShares,
      metrics,
      reasons:
        reasons.length > 0
          ? reasons
          : ["Volatility conditions are within configured exposure limits."],
      warnings: [],
      errors: [],
    };
  } catch (error) {
    return blocked({
      status: VOLATILITY_RISK_STATUS.ERROR,
      reason: "Volatility risk evaluation failed safely.",
      errors: [error?.message ?? "Unknown volatility risk error."],
    });
  }
}

export default evaluateVolatilityRisk;
