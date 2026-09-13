// server/src/risk/marketShockHaltEngine.js

export const MARKET_SHOCK_HALT_STATUS = Object.freeze({
  APPROVED: "APPROVED",
  REDUCED: "REDUCED",
  BLOCKED: "BLOCKED",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  INVALID_INPUT: "INVALID_INPUT",
  ERROR: "ERROR",
});

export const MARKET_SHOCK_HALT_ACTION = Object.freeze({
  ALLOW: "ALLOW",
  REDUCE: "REDUCE",
  BLOCK: "BLOCK",
});

export const DEFAULT_MARKET_SHOCK_HALT_CONFIG = Object.freeze({
  priceMoveReducePercent: 3,
  priceMoveSeverePercent: 5,
  priceMoveBlockPercent: 8,

  gapReducePercent: 3,
  gapSeverePercent: 6,
  gapBlockPercent: 10,

  volumeSpikeReduceRatio: 2.5,
  volumeSpikeSevereRatio: 4,
  volumeSpikeBlockRatio: 8,

  volatilityShockReduceRatio: 1.8,
  volatilityShockSevereRatio: 2.5,
  volatilityShockBlockRatio: 4,

  moderateMultiplier: 0.75,
  severeMultiplier: 0.5,
  minimumExposureMultiplier: 0.2,

  requireMarketStatusEvidence: true,
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

function nonNegativeNumber(value) {
  const number = finiteNumber(value);

  return number !== null &&
    number >= 0
    ? number
    : null;
}

function normalizeSide(value) {
  const side =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return side === "LONG" ||
    side === "SHORT"
    ? side
    : null;
}

function normalizeStatus(value) {
  const status =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return status || null;
}

function clamp(value, minimum, maximum) {
  return Math.min(
    maximum,
    Math.max(minimum, value),
  );
}

function round(value, decimals = 6) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
}

function resolveConfig(config = {}) {
  return {
    ...DEFAULT_MARKET_SHOCK_HALT_CONFIG,
    ...(config && typeof config === "object"
      ? config
      : {}),
  };
}

function buildBlockedResult({
  status = MARKET_SHOCK_HALT_STATUS.BLOCKED,
  reason,
  originalShares = 0,
  metrics = null,
  warnings = [],
  errors = [],
} = {}) {
  return {
    approved: false,
    engine: "MARKET_SHOCK_HALT",
    status,
    action: MARKET_SHOCK_HALT_ACTION.BLOCK,
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

function isHardHaltStatus(status) {
  return [
    "HALTED",
    "TRADING_HALT",
    "LULD_HALT",
    "SUSPENDED",
    "PAUSED",
    "NOT_TRADABLE",
    "CLOSED",
  ].includes(status);
}

function isWarningMarketStatus(status) {
  return [
    "LIMIT_STATE",
    "LULD_WARNING",
    "VOLATILITY_PAUSE_WARNING",
    "DELAYED",
    "INDICATIVE",
  ].includes(status);
}

export function evaluateMarketShockHalt({
  proposedTrade = null,
  marketState = null,
  config = {},
} = {}) {
  try {
    const cfg = resolveConfig(config);

    const symbol =
      String(proposedTrade?.symbol ?? "")
        .trim()
        .toUpperCase();

    const side = normalizeSide(
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
      !symbol ||
      !side ||
      originalShares === null ||
      entryPrice === null
    ) {
      return buildBlockedResult({
        status:
          MARKET_SHOCK_HALT_STATUS.INVALID_INPUT,
        reason:
          "Valid proposed trade symbol, side, shares, and entry price are required.",
        originalShares:
          originalShares ?? 0,
      });
    }

    const input =
      marketState &&
      typeof marketState === "object"
        ? marketState
        : {};

    const marketStatus =
      normalizeStatus(
        input.marketStatus,
      );

    const exchangeStatus =
      normalizeStatus(
        input.exchangeStatus,
      );

    const tradingHalted =
      input.tradingHalted === true;

    const luldActive =
      input.luldActive === true;

    const circuitBreakerActive =
      input.circuitBreakerActive === true;

    const newsShockActive =
      input.newsShockActive === true;

    const abnormalPrintsActive =
      input.abnormalPrintsActive === true;

    const rawPriceMove =
      finiteNumber(
        input.priceMovePercent,
      );

    const priceMovePercent =
      rawPriceMove === null
        ? null
        : Math.abs(rawPriceMove);

    const rawGap =
      finiteNumber(
        input.gapPercent,
      );

    const gapPercent =
      rawGap === null
        ? null
        : Math.abs(rawGap);

    const currentVolume =
      nonNegativeNumber(
        input.currentVolume,
      );

    const averageComparableVolume =
      positiveNumber(
        input.averageComparableVolume,
      );

    const volumeSpikeRatio =
      currentVolume !== null &&
      averageComparableVolume !== null
        ? round(
            currentVolume /
            averageComparableVolume,
          )
        : null;

    const currentVolatility =
      nonNegativeNumber(
        input.currentVolatility,
      );

    const baselineVolatility =
      positiveNumber(
        input.baselineVolatility,
      );

    const volatilityShockRatio =
      currentVolatility !== null &&
      baselineVolatility !== null
        ? round(
            currentVolatility /
            baselineVolatility,
          )
        : null;

    const hasStatusEvidence =
      marketStatus !== null ||
      exchangeStatus !== null ||
      tradingHalted ||
      luldActive ||
      circuitBreakerActive;

    const metrics = {
      marketStatus,
      exchangeStatus,
      tradingHalted,
      luldActive,
      circuitBreakerActive,
      newsShockActive,
      abnormalPrintsActive,
      priceMovePercent:
        round(priceMovePercent),
      gapPercent:
        round(gapPercent),
      currentVolume,
      averageComparableVolume,
      volumeSpikeRatio,
      currentVolatility,
      baselineVolatility,
      volatilityShockRatio,
    };

    if (
      cfg.requireMarketStatusEvidence === true &&
      !hasStatusEvidence
    ) {
      return buildBlockedResult({
        status:
          MARKET_SHOCK_HALT_STATUS.INSUFFICIENT_DATA,
        reason:
          "No usable halt or market-status evidence was available.",
        originalShares,
        metrics,
        warnings: [
          "Missing halt status was not treated as a healthy market state.",
        ],
      });
    }

    if (
      tradingHalted ||
      luldActive ||
      circuitBreakerActive
    ) {
      return buildBlockedResult({
        reason:
          "Trading halt, LULD condition, or circuit breaker is active.",
        originalShares,
        metrics,
      });
    }

    if (
      isHardHaltStatus(marketStatus) ||
      isHardHaltStatus(exchangeStatus)
    ) {
      return buildBlockedResult({
        reason:
          "Market or exchange status does not permit safe execution.",
        originalShares,
        metrics,
      });
    }

    if (
      priceMovePercent !== null &&
      priceMovePercent >= cfg.priceMoveBlockPercent
    ) {
      return buildBlockedResult({
        reason:
          "Recent price move exceeds the configured shock block threshold.",
        originalShares,
        metrics,
      });
    }

    if (
      gapPercent !== null &&
      gapPercent >= cfg.gapBlockPercent
    ) {
      return buildBlockedResult({
        reason:
          "Price gap exceeds the configured shock block threshold.",
        originalShares,
        metrics,
      });
    }

    if (
      volumeSpikeRatio !== null &&
      volumeSpikeRatio >= cfg.volumeSpikeBlockRatio
    ) {
      return buildBlockedResult({
        reason:
          "Volume spike exceeds the configured shock block threshold.",
        originalShares,
        metrics,
      });
    }

    if (
      volatilityShockRatio !== null &&
      volatilityShockRatio >= cfg.volatilityShockBlockRatio
    ) {
      return buildBlockedResult({
        reason:
          "Volatility shock exceeds the configured block threshold.",
        originalShares,
        metrics,
      });
    }

    let multiplier = 1;
    const reasons = [];

    const applyModerate = (reason) => {
      multiplier =
        Math.min(
          multiplier,
          clamp(
            cfg.moderateMultiplier,
            0,
            1,
          ),
        );

      reasons.push(reason);
    };

    const applySevere = (reason) => {
      multiplier =
        Math.min(
          multiplier,
          clamp(
            cfg.severeMultiplier,
            0,
            1,
          ),
        );

      reasons.push(reason);
    };

    if (
      isWarningMarketStatus(marketStatus) ||
      isWarningMarketStatus(exchangeStatus)
    ) {
      applySevere(
        "Market-status warning requires defensive execution sizing.",
      );
    }

    if (newsShockActive) {
      applySevere(
        "Breaking-news shock requires defensive execution sizing.",
      );
    }

    if (abnormalPrintsActive) {
      applyModerate(
        "Abnormal prints require lower execution size.",
      );
    }

    if (priceMovePercent !== null) {
      if (
        priceMovePercent >=
        cfg.priceMoveSeverePercent
      ) {
        applySevere(
          "Recent price move indicates severe shock conditions.",
        );
      } else if (
        priceMovePercent >=
        cfg.priceMoveReducePercent
      ) {
        applyModerate(
          "Recent price move indicates elevated shock risk.",
        );
      }
    }

    if (gapPercent !== null) {
      if (
        gapPercent >=
        cfg.gapSeverePercent
      ) {
        applySevere(
          "Price gap indicates severe shock conditions.",
        );
      } else if (
        gapPercent >=
        cfg.gapReducePercent
      ) {
        applyModerate(
          "Price gap indicates elevated shock risk.",
        );
      }
    }

    if (volumeSpikeRatio !== null) {
      if (
        volumeSpikeRatio >=
        cfg.volumeSpikeSevereRatio
      ) {
        applySevere(
          "Volume spike requires substantial size reduction.",
        );
      } else if (
        volumeSpikeRatio >=
        cfg.volumeSpikeReduceRatio
      ) {
        applyModerate(
          "Volume spike requires lower execution size.",
        );
      }
    }

    if (volatilityShockRatio !== null) {
      if (
        volatilityShockRatio >=
        cfg.volatilityShockSevereRatio
      ) {
        applySevere(
          "Volatility shock requires substantial size reduction.",
        );
      } else if (
        volatilityShockRatio >=
        cfg.volatilityShockReduceRatio
      ) {
        applyModerate(
          "Volatility shock requires lower execution size.",
        );
      }
    }

    multiplier =
      clamp(multiplier, 0, 1);

    if (
      multiplier <
      cfg.minimumExposureMultiplier
    ) {
      return buildBlockedResult({
        reason:
          "Required shock-risk reduction is below the minimum executable exposure.",
        originalShares,
        metrics,
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
          "MARKET_SHOCK_HALT",
        status:
          MARKET_SHOCK_HALT_STATUS.REDUCED,
        action:
          MARKET_SHOCK_HALT_ACTION.REDUCE,
        canExecute: true,
        exposureMultiplier:
          round(
            approvedShares /
            originalShares,
          ),
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
      engine:
        "MARKET_SHOCK_HALT",
      status:
        MARKET_SHOCK_HALT_STATUS.APPROVED,
      action:
        MARKET_SHOCK_HALT_ACTION.ALLOW,
      canExecute: true,
      exposureMultiplier: 1,
      originalShares,
      approvedShares:
        originalShares,
      metrics,
      reasons:
        reasons.length > 0
          ? reasons
          : [
              "Market structure and shock conditions are within configured limits.",
            ],
      warnings: [],
      errors: [],
    };
  } catch (error) {
    return buildBlockedResult({
      status:
        MARKET_SHOCK_HALT_STATUS.ERROR,
      reason:
        "Market shock / halt evaluation failed safely.",
      errors: [
        error?.message ??
        "Unknown market shock / halt error.",
      ],
    });
  }
}

export default evaluateMarketShockHalt;
