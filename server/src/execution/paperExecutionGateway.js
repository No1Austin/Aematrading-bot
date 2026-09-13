/**
 * ============================================================
 * PAPER EXECUTION GATEWAY
 * ============================================================
 *
 * Final safety boundary between the trading decision pipeline
 * and a paper-trading broker.
 *
 * IMPORTANT:
 * - This module does NOT submit orders to a broker.
 * - This module does NOT generate trade signals.
 * - This module does NOT increase position size.
 * - This module only validates whether an already-approved
 *   trade may be handed to the paper broker adapter.
 *
 * Fail closed:
 * Anything malformed, stale, duplicated, oversized, or not
 * explicitly approved is rejected.
 * ============================================================
 */

export const DEFAULT_PAPER_EXECUTION_CONFIG = Object.freeze({
  paperOnly: true,

  maxSharesPerOrder: 10000,

  maxDecisionAgeMs: 60_000,

  requireFinalApproval: true,

  allowedSides: Object.freeze([
    "LONG",
    "SHORT",
    "BUY",
    "SELL",
  ]),
});

/**
 * Normalize numeric values safely.
 */
function finiteNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

/**
 * Normalize strings.
 */
function normalizeString(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

/**
 * Generate deterministic execution identity.
 *
 * This is intentionally NOT random.
 * The caller can use this value for duplicate protection.
 */
function createExecutionKey({
  symbol,
  side,
  shares,
  decisionTimestamp,
}) {
  return [
    symbol,
    side,
    shares,
    decisionTimestamp,
  ].join(":");
}

/**
 * ============================================================
 * validatePaperExecution
 * ============================================================
 */
export default function validatePaperExecution({
  finalDecision,
  now = Date.now(),
  config = {},
  previouslySubmittedKeys = [],
} = {}) {
  const effectiveConfig = {
    ...DEFAULT_PAPER_EXECUTION_CONFIG,
    ...config,
  };

  const reasons = [];
  const warnings = [];

  /**
   * ----------------------------------------------------------
   * PAPER-ONLY PROTECTION
   * ----------------------------------------------------------
   */

  if (effectiveConfig.paperOnly !== true) {
    return {
      approved: false,
      canSubmit: false,
      status: "BLOCKED",
      action: "BLOCK",
      reasonCode: "PAPER_MODE_REQUIRED",
      reasons: [
        "Paper execution gateway requires paper-only mode.",
      ],
      warnings,
      order: null,
      executionKey: null,
    };
  }

  /**
   * ----------------------------------------------------------
   * FINAL DECISION VALIDATION
   * ----------------------------------------------------------
   */

  if (
    !finalDecision ||
    typeof finalDecision !== "object"
  ) {
    return {
      approved: false,
      canSubmit: false,
      status: "BLOCKED",
      action: "BLOCK",
      reasonCode: "MISSING_FINAL_DECISION",
      reasons: [
        "Final trading decision is missing.",
      ],
      warnings,
      order: null,
      executionKey: null,
    };
  }

  if (
    effectiveConfig.requireFinalApproval === true &&
    finalDecision.canProceedToPaperExecution !== true
  ) {
    return {
      approved: false,
      canSubmit: false,
      status: "BLOCKED",
      action: "BLOCK",
      reasonCode: "FINAL_APPROVAL_REQUIRED",
      reasons: [
        "Trading pipeline did not approve paper execution.",
      ],
      warnings,
      order: null,
      executionKey: null,
    };
  }

  /**
   * ----------------------------------------------------------
   * SYMBOL
   * ----------------------------------------------------------
   */

  const symbol =
    normalizeString(finalDecision.symbol)
      .toUpperCase();

  if (!symbol) {
    reasons.push(
      "A valid symbol is required.",
    );
  }

  /**
   * ----------------------------------------------------------
   * POSITION
   * ----------------------------------------------------------
   */

  const position =
    finalDecision.position;

  if (
    !position ||
    typeof position !== "object"
  ) {
    reasons.push(
      "Approved position is missing.",
    );
  }

  const shares =
    finiteNumber(position?.shares);

  if (
    shares === null ||
    shares <= 0
  ) {
    reasons.push(
      "Approved shares must be greater than zero.",
    );
  }

  if (
    shares !== null &&
    !Number.isInteger(shares)
  ) {
    reasons.push(
      "Approved shares must be a whole number.",
    );
  }

  if (
    shares !== null &&
    shares >
      effectiveConfig.maxSharesPerOrder
  ) {
    reasons.push(
      "Approved shares exceed the maximum paper order size.",
    );
  }

  /**
   * ----------------------------------------------------------
   * SIDE
   * ----------------------------------------------------------
   */

  const side =
    normalizeString(
      finalDecision.preferredSide ??
      position?.side,
    ).toUpperCase();

  if (
    !effectiveConfig.allowedSides.includes(
      side,
    )
  ) {
    reasons.push(
      "Trade side is invalid.",
    );
  }

  /**
   * ----------------------------------------------------------
   * DECISION TIMESTAMP
   * ----------------------------------------------------------
   */

  const decisionTimestamp =
    finalDecision.timestamp;

  const decisionTime =
    new Date(
      decisionTimestamp,
    ).getTime();

  const currentTime =
    finiteNumber(now);

  if (
    !decisionTimestamp ||
    !Number.isFinite(decisionTime)
  ) {
    reasons.push(
      "Final decision timestamp is missing or invalid.",
    );
  }

  if (
    currentTime === null
  ) {
    reasons.push(
      "Execution clock is invalid.",
    );
  }

  let decisionAgeMs = null;

  if (
    Number.isFinite(decisionTime) &&
    currentTime !== null
  ) {
    decisionAgeMs =
      currentTime -
      decisionTime;

    if (decisionAgeMs < 0) {
      reasons.push(
        "Final decision timestamp is in the future.",
      );
    }

    if (
      decisionAgeMs >
      effectiveConfig.maxDecisionAgeMs
    ) {
      reasons.push(
        "Final trading decision is stale.",
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * STOP IF STRUCTURAL VALIDATION FAILED
   * ----------------------------------------------------------
   */

  if (reasons.length > 0) {
    return {
      approved: false,
      canSubmit: false,
      status: "BLOCKED",
      action: "BLOCK",
      reasonCode: "EXECUTION_VALIDATION_FAILED",
      reasons,
      warnings,
      order: null,
      executionKey: null,

      metrics: {
        decisionAgeMs,
        shares,
      },
    };
  }

  /**
   * ----------------------------------------------------------
   * CREATE EXECUTION KEY
   * ----------------------------------------------------------
   */

  const executionKey =
    createExecutionKey({
      symbol,
      side,
      shares,
      decisionTimestamp,
    });

  /**
   * ----------------------------------------------------------
   * DUPLICATE PROTECTION
   * ----------------------------------------------------------
   */

  const submittedKeys =
    previouslySubmittedKeys instanceof Set
      ? previouslySubmittedKeys
      : new Set(
          Array.isArray(
            previouslySubmittedKeys,
          )
            ? previouslySubmittedKeys
            : [],
        );

  if (
    submittedKeys.has(
      executionKey,
    )
  ) {
    return {
      approved: false,
      canSubmit: false,
      status: "BLOCKED",
      action: "BLOCK",
      reasonCode: "DUPLICATE_EXECUTION",
      reasons: [
        "This approved trade has already been submitted.",
      ],
      warnings,
      order: null,
      executionKey,

      metrics: {
        decisionAgeMs,
        shares,
      },
    };
  }

  /**
   * ----------------------------------------------------------
   * SIDE TRANSLATION
   * ----------------------------------------------------------
   *
   * LONG  -> BUY
   * SHORT -> SELL
   *
   * We preserve explicit BUY / SELL too.
   */

  const brokerSide =
    side === "LONG"
      ? "BUY"
      : side === "SHORT"
        ? "SELL"
        : side;

  /**
   * ----------------------------------------------------------
   * ORDER INTENT
   * ----------------------------------------------------------
   *
   * Still NOT submitted.
   */

  const order = Object.freeze({
    symbol,

    side:
      brokerSide.toLowerCase(),

    qty:
      shares,

    type:
      "market",

    timeInForce:
      "day",

    paper:
      true,

    executionKey,
  });

  return {
    approved: true,
    canSubmit: true,
    status: "APPROVED",
    action: "SUBMIT_TO_PAPER_BROKER",

    reasonCode:
      "PAPER_EXECUTION_APPROVED",

    reasons: [
      "Trade passed the paper execution gateway.",
    ],

    warnings,

    executionKey,

    order,

    metrics: {
      decisionAgeMs,
      shares,
    },
  };
}