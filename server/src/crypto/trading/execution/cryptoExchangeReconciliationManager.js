/**
 * AEMA CRYPTO
 * Phase 5.16 — Exchange Reconciliation & Recovery
 *
 * PURPOSE
 * -------
 * Compare local execution state against exchange truth.
 *
 * This module does NOT:
 * - submit orders
 * - cancel orders
 * - modify live positions
 * - call exchange APIs
 *
 * It only decides the appropriate recovery action.
 */

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, digits = 8) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return null;
  }

  const factor = 10 ** digits;

  return Math.round(n * factor) / factor;
};

const upper = (value, fallback = "") => {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();

  return text || fallback;
};

export const RECONCILIATION_ACTION =
  Object.freeze({
    IN_SYNC: "IN_SYNC",
    WAIT: "WAIT",
    ADOPT_EXCHANGE_FILL:
      "ADOPT_EXCHANGE_FILL",
    RETRY_REMAINDER:
      "RETRY_REMAINDER",
    CANCEL_STALE:
      "CANCEL_STALE",
    REPAIR_STOP:
      "REPAIR_STOP",
    SYNC_POSITION:
      "SYNC_POSITION",
    MANUAL_REVIEW:
      "MANUAL_REVIEW",
    EMERGENCY_RECONCILIATION:
      "EMERGENCY_RECONCILIATION",
  });

function normalizeOrderStatus(value) {
  return upper(value, "UNKNOWN");
}

function normalizeDirection(value) {
  const direction = upper(value);

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return "NEUTRAL";
}

function buildResult({
  action,
  approved = true,
  urgency = "NONE",
  local,
  exchange,
  position,
  retryQuantity = 0,
  reasons = [],
  warnings = [],
  manualReview = false,
}) {
  return {
    approved,
    action,
    urgency,

    retryQuantity:
      round(
        Math.max(
          0,
          finite(retryQuantity) ?? 0,
        ),
        12,
      ),

    local,
    exchange,
    position,

    reasons: [
      ...new Set(reasons),
    ],

    warnings: [
      ...new Set(warnings),
    ],

    manualReview,

    noExecutionAuthority: true,

    generatedAt:
      new Date()
        .toISOString(),
  };
}

function compareQuantities(
  localState,
  exchangeOrder,
) {
  const localFilled =
    Math.max(
      0,
      finite(
        localState?.filledQuantity,
      ) ?? 0,
    );

  const localRemaining =
    Math.max(
      0,
      finite(
        localState?.remainingQuantity,
      ) ?? 0,
    );

  const exchangeFilled =
    Math.max(
      0,
      finite(
        exchangeOrder?.filledQuantity,
      ) ?? 0,
    );

  const exchangeRemaining =
    Math.max(
      0,
      finite(
        exchangeOrder?.remainingQuantity,
      ) ?? 0,
    );

  return {
    localFilled,
    localRemaining,
    exchangeFilled,
    exchangeRemaining,

    fillDifference:
      round(
        exchangeFilled -
          localFilled,
        12,
      ),

    remainingDifference:
      round(
        exchangeRemaining -
          localRemaining,
        12,
      ),
  };
}

function positionsMatch(
  expected,
  actual,
) {
  const expectedQty =
    Math.max(
      0,
      finite(
        expected?.quantity,
      ) ?? 0,
    );

  const actualQty =
    Math.max(
      0,
      finite(
        actual?.quantity,
      ) ?? 0,
    );

  const expectedDirection =
    normalizeDirection(
      expected?.direction,
    );

  const actualDirection =
    normalizeDirection(
      actual?.direction,
    );

  const qtyClose =
    Math.abs(
      expectedQty -
        actualQty,
    ) <= 1e-9;

  const directionMatch =
    expectedQty === 0
      ? actualQty === 0
      : expectedDirection ===
        actualDirection;

  return (
    qtyClose &&
    directionMatch
  );
}

/**
 * ============================================================
 * MAIN RECONCILIATION
 * ============================================================
 */

export function reconcileCryptoExecution({
  localState,
  exchangeOrder = null,
  expectedPosition = null,
  exchangePosition = null,
  stopState = null,
  policy = {},
} = {}) {
  if (!localState) {
    return buildResult({
      approved: false,

      action:
        RECONCILIATION_ACTION
          .MANUAL_REVIEW,

      urgency:
        "HIGH",

      local: null,
      exchange:
        exchangeOrder,
      position:
        exchangePosition,

      reasons: [
        "LOCAL_EXECUTION_STATE_MISSING",
      ],

      manualReview:
        true,
    });
  }

  const stale =
    localState.stale === true;

  const localStatus =
    normalizeOrderStatus(
      localState.status,
    );

  const exchangeStatus =
    normalizeOrderStatus(
      exchangeOrder?.status,
    );

  const quantities =
    compareQuantities(
      localState,
      exchangeOrder,
    );

  const reasons = [];
  const warnings = [];

  /**
   * ==========================================================
   * 1. LOCAL UNKNOWN / EXCHANGE UNKNOWN
   * ==========================================================
   */

  if (
    !exchangeOrder &&
    [
      "SUBMITTED",
      "ACKNOWLEDGED",
      "PARTIALLY_FILLED",
    ].includes(localStatus)
  ) {
    return buildResult({
      action:
        RECONCILIATION_ACTION
          .WAIT,

      urgency:
        stale
          ? "MEDIUM"
          : "LOW",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      reasons: [
        "EXCHANGE_ORDER_NOT_CONFIRMED_YET",
      ],

      warnings:
        stale
          ? [
              "LOCAL_EXECUTION_STATE_STALE",
            ]
          : [],
    });
  }

  /**
   * ==========================================================
   * 2. EXCHANGE HAS MORE FILLS THAN LOCAL
   * ==========================================================
   */

  if (
    exchangeOrder &&
    quantities.fillDifference >
      1e-9
  ) {
    return buildResult({
      action:
        RECONCILIATION_ACTION
          .ADOPT_EXCHANGE_FILL,

      urgency:
        "HIGH",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      reasons: [
        "EXCHANGE_FILL_AHEAD_OF_LOCAL_STATE",
      ],
    });
  }

  /**
   * ==========================================================
   * 3. LOCAL CLAIMS MORE FILLS THAN EXCHANGE
   * ==========================================================
   */

  if (
    exchangeOrder &&
    quantities.fillDifference <
      -1e-9
  ) {
    return buildResult({
      approved: false,

      action:
        RECONCILIATION_ACTION
          .MANUAL_REVIEW,

      urgency:
        "HIGH",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      reasons: [
        "LOCAL_FILL_EXCEEDS_EXCHANGE_FILL",
      ],

      manualReview:
        true,
    });
  }

  /**
   * ==========================================================
   * 4. PARTIAL FILL + TERMINAL EXCHANGE STATUS
   * ==========================================================
   */

  if (
    exchangeOrder &&
    quantities.exchangeFilled >
      0 &&
    quantities.exchangeRemaining >
      0 &&
    [
      "CANCELLED",
      "EXPIRED",
      "REJECTED",
    ].includes(
      exchangeStatus,
    )
  ) {
    return buildResult({
      action:
        RECONCILIATION_ACTION
          .RETRY_REMAINDER,

      urgency:
        "NORMAL",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      retryQuantity:
        quantities
          .exchangeRemaining,

      reasons: [
        "PARTIAL_FILL_REMAINDER_AVAILABLE",
      ],
    });
  }

  /**
   * ==========================================================
   * 5. STALE OPEN ORDER
   * ==========================================================
   */

  if (
    stale &&
    exchangeOrder &&
    [
      "NEW",
      "OPEN",
      "ACKNOWLEDGED",
      "PARTIALLY_FILLED",
    ].includes(
      exchangeStatus,
    )
  ) {
    return buildResult({
      action:
        RECONCILIATION_ACTION
          .CANCEL_STALE,

      urgency:
        "MEDIUM",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      reasons: [
        "STALE_LIVE_ORDER_REQUIRES_CANCELLATION",
      ],
    });
  }

  /**
   * ==========================================================
   * 6. POSITION MISMATCH
   * ==========================================================
   */

  if (
    expectedPosition &&
    exchangePosition &&
    !positionsMatch(
      expectedPosition,
      exchangePosition,
    )
  ) {
    const expectedQty =
      Math.max(
        0,
        finite(
          expectedPosition.quantity,
        ) ?? 0,
      );

    const exchangeQty =
      Math.max(
        0,
        finite(
          exchangePosition.quantity,
        ) ?? 0,
      );

    const expectedDirection =
      normalizeDirection(
        expectedPosition.direction,
      );

    const exchangeDirection =
      normalizeDirection(
        exchangePosition.direction,
      );

    const dangerousFlip =
      expectedQty > 0 &&
      exchangeQty > 0 &&
      expectedDirection !==
        exchangeDirection;

    if (dangerousFlip) {
      return buildResult({
        approved: false,

        action:
          RECONCILIATION_ACTION
            .EMERGENCY_RECONCILIATION,

        urgency:
          "IMMEDIATE",

        local:
          localState,

        exchange:
          exchangeOrder,

        position:
          exchangePosition,

        reasons: [
          "EXCHANGE_POSITION_DIRECTION_CONFLICT",
        ],

        manualReview:
          true,
      });
    }

    return buildResult({
      action:
        RECONCILIATION_ACTION
          .SYNC_POSITION,

      urgency:
        "HIGH",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      reasons: [
        "POSITION_QUANTITY_MISMATCH",
      ],
    });
  }

  /**
   * ==========================================================
   * 7. PROTECTIVE STOP MISSING
   * ==========================================================
   */

  if (
    expectedPosition &&
    finite(
      expectedPosition.quantity,
    ) > 0 &&
    stopState &&
    stopState.expected === true &&
    stopState.exchangePresent ===
      false
  ) {
    return buildResult({
      action:
        RECONCILIATION_ACTION
          .REPAIR_STOP,

      urgency:
        "HIGH",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      reasons: [
        "PROTECTIVE_STOP_MISSING_ON_EXCHANGE",
      ],
    });
  }

  /**
   * ==========================================================
   * 8. FAILED/REJECTED WITHOUT EXCHANGE POSITION
   * ==========================================================
   */

  if (
    [
      "FAILED",
      "REJECTED",
      "EXPIRED",
      "CANCELLED",
    ].includes(
      localStatus,
    ) &&
    (
      !exchangePosition ||
      finite(
        exchangePosition.quantity,
      ) === 0
    )
  ) {
    const retryQty =
      Math.max(
        0,
        finite(
          localState
            .remainingQuantity,
        ) ?? 0,
      );

    if (
      retryQty > 0 &&
      localState.retryEligible ===
        true
    ) {
      return buildResult({
        action:
          RECONCILIATION_ACTION
            .RETRY_REMAINDER,

        urgency:
          "NORMAL",

        local:
          localState,

        exchange:
          exchangeOrder,

        position:
          exchangePosition,

        retryQuantity:
          retryQty,

        reasons: [
          "RETRY_ELIGIBLE_REMAINDER",
        ],
      });
    }
  }

  /**
   * ==========================================================
   * 9. FULLY FILLED AND POSITION AGREES
   * ==========================================================
   */

  if (
    localStatus ===
      "FILLED" &&
    (
      !expectedPosition ||
      !exchangePosition ||
      positionsMatch(
        expectedPosition,
        exchangePosition,
      )
    )
  ) {
    return buildResult({
      action:
        RECONCILIATION_ACTION
          .IN_SYNC,

      urgency:
        "NONE",

      local:
        localState,

      exchange:
        exchangeOrder,

      position:
        exchangePosition,

      reasons: [
        "LOCAL_AND_EXCHANGE_STATE_ALIGNED",
      ],
    });
  }

  /**
   * ==========================================================
   * DEFAULT — WAIT
   * ==========================================================
   */

  return buildResult({
    action:
      RECONCILIATION_ACTION
        .WAIT,

    urgency:
      "LOW",

    local:
      localState,

    exchange:
      exchangeOrder,

    position:
      exchangePosition,

    reasons: [
      "NO_RECOVERY_ACTION_REQUIRED_YET",
    ],

    warnings,
  });
}

export default
  reconcileCryptoExecution;