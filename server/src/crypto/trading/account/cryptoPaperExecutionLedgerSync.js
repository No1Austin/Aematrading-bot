/**
 * AEMA CRYPTO
 * Phase 5.27
 *
 * PAPER EXECUTION -> ACCOUNT LEDGER SYNCHRONIZER
 *
 * Principle:
 * lifecycle intent is NOT financial truth.
 * execution fill truth IS financial truth.
 *
 * This module:
 * - consumes paper execution state
 * - maps actual fills into the paper account ledger
 * - preserves partial-fill truth
 * - prevents duplicate fill accounting
 * - forwards actual fees only
 *
 * NO live execution authority.
 */

const finite = (value, fallback = null) => {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : fallback;
};

const upper = (value, fallback = "") => {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
};

function normalizeIntent(value) {
  const intent =
    upper(value);

  if (
    [
      "OPEN",
      "INCREASE",
      "REDUCE",
      "CLOSE",
      "EMERGENCY_CLOSE",
    ].includes(intent)
  ) {
    return intent;
  }

  return null;
}

function normalizeDirection(
  execution,
) {
  const direction =
    upper(
      execution?.direction,
    );

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  const side =
    upper(
      execution?.side,
    );

  if (
    side === "BUY"
  ) {
    return "LONG";
  }

  if (
    side === "SELL"
  ) {
    return "SHORT";
  }

  return null;
}

function getActualFilledQuantity(
  execution,
) {
  return Math.max(
    0,
    finite(
      execution?.filledQuantity ??
      execution?.fillQuantity ??
      execution?.executedQuantity,
      0,
    ),
  );
}

function getActualFillPrice(
  execution,
) {
  return finite(
    execution?.averageFillPrice ??
    execution?.averagePrice ??
    execution?.fillPrice ??
    execution?.price,
    null,
  );
}

function buildFillId({
  executionState,
  paperResult,
  command,
}) {
  const explicit =
    executionState?.fillId ??
    executionState?.executionId ??
    paperResult?.fillId ??
    paperResult?.executionId;

  if (explicit) {
    return String(explicit);
  }

  const orderId =
    executionState?.exchangeOrderId ??
    executionState?.orderId ??
    command?.clientOrderId ??
    command?.orderId;

  const filled =
    getActualFilledQuantity(
      executionState,
    );

  if (!orderId) {
    return null;
  }

  return `${orderId}:${filled}`;
}

export function syncPaperExecutionToLedger({
  ledger,

  symbol,

  lifecycle = null,

  command = null,

  executionState = null,

  paperResult = null,
} = {}) {
  if (!ledger) {
    throw new Error(
      "PAPER_ACCOUNT_LEDGER_REQUIRED",
    );
  }

  if (
    typeof ledger.applyFill !==
    "function"
  ) {
    throw new Error(
      "INVALID_PAPER_ACCOUNT_LEDGER",
    );
  }

  const status =
    upper(
      executionState?.status ??
      paperResult?.status,
    );

  if (
    ![
      "FILLED",
      "PARTIALLY_FILLED",
    ].includes(status)
  ) {
    return {
      approved: true,
      status:
        "LEDGER_SYNC_NOT_REQUIRED",
      reason:
        "NO_ACTUAL_FILL",
      executionAuthority:
        false,
      liveExecution:
        false,
    };
  }

  const filledQuantity =
    getActualFilledQuantity(
      executionState ??
      paperResult,
    );

  const fillPrice =
    getActualFillPrice(
      executionState ??
      paperResult,
    );

  if (
    filledQuantity <= 0 ||
    fillPrice === null ||
    fillPrice <= 0
  ) {
    return {
      approved: false,
      status:
        "LEDGER_SYNC_BLOCKED",
      blocker:
        "INVALID_EXECUTION_FILL",
      executionAuthority:
        false,
      liveExecution:
        false,
    };
  }

  const intent =
    normalizeIntent(
      command?.intent ??
      command?.orderIntent ??
      lifecycle?.intent ??
      lifecycle?.action
        ?.replace?.(
          "OPEN_POSITION",
          "OPEN",
        ),
    );

  const normalizedIntent =
    intent ??
    (
      upper(
        lifecycle?.action,
      ) === "OPEN_POSITION"
        ? "OPEN"
        : upper(
            lifecycle?.action,
          ) === "ADD_EXPOSURE"
          ? "INCREASE"
          : upper(
              lifecycle?.action,
            ) === "REDUCE_EXPOSURE"
            ? "REDUCE"
            : upper(
                lifecycle?.action,
              ) === "EXIT_POSITION"
              ? "CLOSE"
              : upper(
                  lifecycle?.action,
                ) === "EMERGENCY_EXIT"
                ? "EMERGENCY_CLOSE"
                : null
    );

  if (!normalizedIntent) {
    return {
      approved: false,
      status:
        "LEDGER_SYNC_BLOCKED",
      blocker:
        "EXECUTION_INTENT_UNKNOWN",
      executionAuthority:
        false,
      liveExecution:
        false,
    };
  }

  const direction =
    normalizeDirection(
      {
        ...command,
        ...executionState,
      },
    ) ??
    upper(
      lifecycle?.direction,
    );

  const fillId =
    buildFillId({
      executionState,
      paperResult,
      command,
    });

  if (!fillId) {
    return {
      approved: false,
      status:
        "LEDGER_SYNC_BLOCKED",
      blocker:
        "FILL_ID_UNAVAILABLE",
      executionAuthority:
        false,
      liveExecution:
        false,
    };
  }

  const fee =
    finite(
      executionState?.fees ??
      executionState?.fee ??
      paperResult?.fees ??
      paperResult?.fee,
      null,
    );

  const result =
    ledger.applyFill({
      fillId,

      symbol,

      intent:
        normalizedIntent,

      direction,

      side:
        upper(
          command?.side ??
          executionState?.side,
        ),

      filledQuantity,

      fillPrice,

      fee,
    });

  return {
    approved:
      result?.approved ===
      true,

    status:
      result?.status,

    ledgerResult:
      result,

    filledQuantity,

    fillPrice,

    intent:
      normalizedIntent,

    direction,

    duplicate:
      result?.status ===
      "DUPLICATE_FILL",

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default
  syncPaperExecutionToLedger;