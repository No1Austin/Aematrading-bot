// server/src/execution/orderExecutionQualityEngine.js

export const ORDER_EXECUTION_QUALITY_STATUS = Object.freeze({
  APPROVED: "APPROVED",
  REDUCED: "REDUCED",
  BLOCKED: "BLOCKED",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  INVALID_INPUT: "INVALID_INPUT",
  ERROR: "ERROR",
});

export const ORDER_EXECUTION_QUALITY_ACTION = Object.freeze({
  ALLOW: "ALLOW",
  REDUCE: "REDUCE",
  BLOCK: "BLOCK",
});

export const DEFAULT_ORDER_EXECUTION_QUALITY_CONFIG = Object.freeze({
  maxQuoteAgeMs: 5000,
  staleQuoteReduceMs: 2500,

  spreadReducePercent: 0.20,
  spreadSeverePercent: 0.40,
  spreadBlockPercent: 0.80,

  entryDeviationReducePercent: 0.30,
  entryDeviationSeverePercent: 0.60,
  entryDeviationBlockPercent: 1.20,

  slippageReducePercent: 0.15,
  slippageSeverePercent: 0.30,
  slippageBlockPercent: 0.75,

  moderateMultiplier: 0.75,
  severeMultiplier: 0.50,
  minimumExposureMultiplier: 0.20,

  allowMarketOrders: true,
  requireBidAsk: true,
  requireQuoteTimestamp: true,
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

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

function normalizeOrderType(value) {
  const type = String(value ?? "LIMIT").trim().toUpperCase();

  if (["LIMIT", "MARKET"].includes(type)) {
    return type;
  }

  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, decimals = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function parseTimestamp(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveConfig(config = {}) {
  return {
    ...DEFAULT_ORDER_EXECUTION_QUALITY_CONFIG,
    ...(config && typeof config === "object" ? config : {}),
  };
}

function blocked({
  status = ORDER_EXECUTION_QUALITY_STATUS.BLOCKED,
  reason,
  originalShares = 0,
  metrics = null,
  warnings = [],
  errors = [],
} = {}) {
  return {
    approved: false,
    engine: "ORDER_EXECUTION_QUALITY",
    status,
    action: ORDER_EXECUTION_QUALITY_ACTION.BLOCK,
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

/**
 * Final pre-execution quality guard.
 *
 * This engine does NOT discover trades and does NOT increase risk.
 * It may:
 * - allow the upstream-approved size,
 * - reduce the upstream-approved size,
 * - block execution.
 */
export function evaluateOrderExecutionQuality({
  proposedTrade = null,
  execution = null,
  now = Date.now(),
  config = {},
} = {}) {
  try {
    const cfg = resolveConfig(config);

    const symbol = String(proposedTrade?.symbol ?? "")
      .trim()
      .toUpperCase();

    const side = normalizeSide(proposedTrade?.side);
    const originalShares = positiveNumber(proposedTrade?.shares);

    const approvedEntryPrice = positiveNumber(
      proposedTrade?.entryPrice ??
      proposedTrade?.approvedEntryPrice ??
      proposedTrade?.currentPrice,
    );

    if (
      !symbol ||
      !side ||
      originalShares === null ||
      approvedEntryPrice === null
    ) {
      return blocked({
        status: ORDER_EXECUTION_QUALITY_STATUS.INVALID_INPUT,
        reason:
          "Valid proposed trade symbol, side, shares, and approved entry price are required.",
        originalShares: originalShares ?? 0,
      });
    }

    const evidence =
      execution && typeof execution === "object"
        ? execution
        : {};

    const bid = positiveNumber(evidence.bid);
    const ask = positiveNumber(evidence.ask);
    const last = positiveNumber(
      evidence.lastPrice ?? evidence.last,
    );

    const orderType = normalizeOrderType(
      evidence.orderType ?? proposedTrade?.orderType ?? "LIMIT",
    );

    const intendedPrice = positiveNumber(
      evidence.intendedPrice ??
      evidence.limitPrice ??
      approvedEntryPrice,
    );

    const estimatedFillPrice = positiveNumber(
      evidence.estimatedFillPrice ??
      evidence.expectedFillPrice ??
      (side === "LONG" ? ask : bid) ??
      last,
    );

    const quoteTimestamp = parseTimestamp(
      evidence.quoteTimestamp ??
      evidence.timestamp,
    );

    const nowMs = parseTimestamp(now);

    if (orderType === null) {
      return blocked({
        status: ORDER_EXECUTION_QUALITY_STATUS.INVALID_INPUT,
        reason: "Execution order type is invalid.",
        originalShares,
      });
    }

    if (
      cfg.requireBidAsk === true &&
      (bid === null || ask === null)
    ) {
      return blocked({
        status: ORDER_EXECUTION_QUALITY_STATUS.INSUFFICIENT_DATA,
        reason: "Current bid and ask are required before execution.",
        originalShares,
        warnings: [
          "Missing quote data was not treated as acceptable execution quality.",
        ],
      });
    }

    if (
      bid !== null &&
      ask !== null &&
      ask < bid
    ) {
      return blocked({
        status: ORDER_EXECUTION_QUALITY_STATUS.INVALID_INPUT,
        reason: "Ask price cannot be below bid price.",
        originalShares,
      });
    }

    if (
      cfg.requireQuoteTimestamp === true &&
      (quoteTimestamp === null || nowMs === null)
    ) {
      return blocked({
        status: ORDER_EXECUTION_QUALITY_STATUS.INSUFFICIENT_DATA,
        reason: "A valid quote timestamp is required before execution.",
        originalShares,
      });
    }

    const quoteAgeMs =
      quoteTimestamp !== null && nowMs !== null
        ? Math.max(0, nowMs - quoteTimestamp)
        : null;

    const midpoint =
      bid !== null && ask !== null
        ? (bid + ask) / 2
        : last;

    const spreadPercent =
      bid !== null &&
      ask !== null &&
      midpoint !== null &&
      midpoint > 0
        ? ((ask - bid) / midpoint) * 100
        : null;

    const entryDeviationPercent =
      estimatedFillPrice !== null
        ? (
            Math.abs(
              estimatedFillPrice - approvedEntryPrice,
            ) /
            approvedEntryPrice
          ) * 100
        : null;

    const slippagePercent =
      estimatedFillPrice !== null &&
      intendedPrice !== null
        ? (
            Math.abs(
              estimatedFillPrice - intendedPrice,
            ) /
            intendedPrice
          ) * 100
        : null;

    const metrics = {
      symbol,
      side,
      orderType,
      bid,
      ask,
      last,
      midpoint: round(midpoint),
      intendedPrice,
      approvedEntryPrice,
      estimatedFillPrice,
      quoteTimestamp,
      quoteAgeMs,
      spreadPercent: round(spreadPercent),
      entryDeviationPercent: round(entryDeviationPercent),
      slippagePercent: round(slippagePercent),
    };

    if (
      quoteAgeMs !== null &&
      quoteAgeMs > cfg.maxQuoteAgeMs
    ) {
      return blocked({
        reason: "Quote is too stale for safe execution.",
        originalShares,
        metrics,
      });
    }

    if (
      spreadPercent !== null &&
      spreadPercent >= cfg.spreadBlockPercent
    ) {
      return blocked({
        reason: "Bid/ask spread exceeds the execution block threshold.",
        originalShares,
        metrics,
      });
    }

    if (
      entryDeviationPercent !== null &&
      entryDeviationPercent >= cfg.entryDeviationBlockPercent
    ) {
      return blocked({
        reason:
          "Expected fill has moved too far from the approved trade entry.",
        originalShares,
        metrics,
      });
    }

    if (
      slippagePercent !== null &&
      slippagePercent >= cfg.slippageBlockPercent
    ) {
      return blocked({
        reason: "Estimated slippage exceeds the execution block threshold.",
        originalShares,
        metrics,
      });
    }

    if (
      orderType === "MARKET" &&
      cfg.allowMarketOrders !== true
    ) {
      return blocked({
        reason: "Market orders are disabled by execution policy.",
        originalShares,
        metrics,
      });
    }

    let multiplier = 1;
    const reasons = [];
    const warnings = [];

    const moderate = (reason) => {
      multiplier = Math.min(
        multiplier,
        clamp(cfg.moderateMultiplier, 0, 1),
      );
      reasons.push(reason);
    };

    const severe = (reason) => {
      multiplier = Math.min(
        multiplier,
        clamp(cfg.severeMultiplier, 0, 1),
      );
      reasons.push(reason);
    };

    if (
      quoteAgeMs !== null &&
      quoteAgeMs >= cfg.staleQuoteReduceMs
    ) {
      moderate("Quote age requires lower execution size.");
    }

    if (spreadPercent !== null) {
      if (spreadPercent >= cfg.spreadSeverePercent) {
        severe("Wide spread requires substantial execution-size reduction.");
      } else if (spreadPercent >= cfg.spreadReducePercent) {
        moderate("Elevated spread requires lower execution size.");
      }
    }

    if (entryDeviationPercent !== null) {
      if (
        entryDeviationPercent >=
        cfg.entryDeviationSeverePercent
      ) {
        severe(
          "Expected fill has materially moved from the approved entry.",
        );
      } else if (
        entryDeviationPercent >=
        cfg.entryDeviationReducePercent
      ) {
        moderate(
          "Expected fill has moved from the approved entry.",
        );
      }
    }

    if (slippagePercent !== null) {
      if (slippagePercent >= cfg.slippageSeverePercent) {
        severe(
          "Estimated slippage requires substantial size reduction.",
        );
      } else if (
        slippagePercent >= cfg.slippageReducePercent
      ) {
        moderate(
          "Estimated slippage requires lower execution size.",
        );
      }
    }

    if (orderType === "MARKET") {
      warnings.push(
        "Market order execution depends on current quote quality and may fill away from the displayed price.",
      );
    }

    multiplier = clamp(multiplier, 0, 1);

    if (
      multiplier <
      cfg.minimumExposureMultiplier
    ) {
      return blocked({
        reason:
          "Required execution-quality reduction is below the minimum executable exposure.",
        originalShares,
        metrics,
        warnings,
      });
    }

    const approvedShares = Math.min(
      originalShares,
      Math.max(
        1,
        Math.floor(originalShares * multiplier),
      ),
    );

    if (approvedShares < originalShares) {
      return {
        approved: true,
        engine: "ORDER_EXECUTION_QUALITY",
        status: ORDER_EXECUTION_QUALITY_STATUS.REDUCED,
        action: ORDER_EXECUTION_QUALITY_ACTION.REDUCE,
        canExecute: true,
        exposureMultiplier: round(
          approvedShares / originalShares,
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
      engine: "ORDER_EXECUTION_QUALITY",
      status: ORDER_EXECUTION_QUALITY_STATUS.APPROVED,
      action: ORDER_EXECUTION_QUALITY_ACTION.ALLOW,
      canExecute: true,
      exposureMultiplier: 1,
      originalShares,
      approvedShares: originalShares,
      metrics,
      reasons: [
        "Execution quality is within configured limits.",
      ],
      warnings,
      errors: [],
    };
  } catch (error) {
    return blocked({
      status: ORDER_EXECUTION_QUALITY_STATUS.ERROR,
      reason: "Order execution quality evaluation failed safely.",
      errors: [
        error?.message ??
        "Unknown order execution quality error.",
      ],
    });
  }
}

export default evaluateOrderExecutionQuality;
