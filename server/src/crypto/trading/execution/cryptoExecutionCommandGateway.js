/**
 * AEMA CRYPTO
 * Phase 5.17 — Execution Command Gateway
 *
 * PURPOSE
 * -------
 * Single controlled boundary that converts validated execution
 * and reconciliation decisions into canonical exchange commands.
 *
 * This module DOES NOT call an exchange.
 *
 * It only emits validated commands.
 */

const finite = (value) => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
};

const upper = (
  value,
  fallback = "",
) => {
  const text =
    String(value ?? "")
      .trim()
      .toUpperCase();

  return text || fallback;
};

const round = (
  value,
  digits = 12,
) => {
  /*
   * IMPORTANT:
   * Number(null) === 0 in JavaScript.
   *
   * Prices that do not exist must remain null,
   * otherwise null limit/stop prices accidentally
   * become real zero-dollar prices.
   */
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  if (
    !Number.isFinite(n)
  ) {
    return null;
  }

  const factor =
    10 ** digits;

  return (
    Math.round(
      n * factor,
    ) / factor
  );
};

export const EXECUTION_COMMAND =
  Object.freeze({
    SUBMIT_ORDER:
      "SUBMIT_ORDER",

    CANCEL_ORDER:
      "CANCEL_ORDER",

    REPLACE_STOP:
      "REPLACE_STOP",

    CLOSE_POSITION:
      "CLOSE_POSITION",

    EMERGENCY_CLOSE:
      "EMERGENCY_CLOSE",

    RETRY_REMAINDER:
      "RETRY_REMAINDER",

    NO_ACTION:
      "NO_ACTION",

    MANUAL_REVIEW:
      "MANUAL_REVIEW",
  });

function blocked(
  reason,
  {
    warnings = [],
  } = {},
) {
  return {
    approved: false,

    command:
      EXECUTION_COMMAND.NO_ACTION,

    payload: null,

    blockers: [
      reason,
    ],

    warnings: [
      ...new Set(
        warnings,
      ),
    ],

    executionAuthority:
      false,
  };
}

function command({
  type,
  payload = null,
  reasons = [],
  warnings = [],
}) {
  return {
    approved: true,

    command:
      type,

    payload,

    reasons: [
      ...new Set(
        reasons,
      ),
    ],

    warnings: [
      ...new Set(
        warnings,
      ),
    ],

    executionAuthority:
      false,
  };
}

function validateExecutionRequest(
  request,
) {
  if (!request) {
    return false;
  }

  if (
    !upper(
      request.symbol,
    )
  ) {
    return false;
  }

  if (
    !upper(
      request.intent,
    )
  ) {
    return false;
  }

  const intent =
    upper(
      request.intent,
    );

  /*
   * STOP_UPDATE still requires a protected quantity,
   * but it does not represent new notional exposure.
   */
  if (
    [
      "OPEN",
      "INCREASE",
      "REDUCE",
      "CLOSE",
      "EMERGENCY_CLOSE",
      "STOP_UPDATE",
    ].includes(intent)
  ) {
    const quantity =
      finite(
        request.quantity,
      );

    if (
      quantity === null ||
      quantity <= 0
    ) {
      return false;
    }
  }

  return true;
}

function buildSubmitPayload(
  request,
) {
  return {
    symbol:
      upper(
        request.symbol,
      ),

    intent:
      upper(
        request.intent,
      ),

    direction:
      upper(
        request.direction,
      ),

    side:
      request.side == null
        ? null
        : upper(
            request.side,
          ),

    orderType:
      upper(
        request.orderType,
        "MARKET",
      ),

    quantity:
      round(
        request.quantity,
      ),

    /*
     * IMPORTANT
     * ---------
     * Preserve the reference price through the
     * command gateway.
     *
     * Phase 5.19 depends on this when translating
     * the command into paper execution.
     */
    referencePrice:
      round(
        request.referencePrice,
      ),

    limitPrice:
      round(
        request.limitPrice,
      ),

    stopPrice:
      round(
        request.stopPrice,
      ),

    notionalUsd:
      round(
        request.notionalUsd,
        2,
      ),

    leverage:
      finite(
        request.leverage,
      ),

    reduceOnly:
      request.reduceOnly ===
      true,

    postOnly:
      request.postOnly ===
      true,

    timeInForce:
      upper(
        request.timeInForce,
        request.orderType ===
          "MARKET"
          ? "IOC"
          : "GTC",
      ),

    clientOrderId:
      request.clientOrderId ??
      null,

    slippageTolerancePercent:
      finite(
        request
          .slippageTolerancePercent,
      ),

    /*
     * Paper-only controls can pass through this
     * object when deliberately added later by
     * the paper orchestrator.
     *
     * A live adapter should ignore or reject these.
     */
    fillRatio:
      request.fillRatio,

    forceReject:
      request.forceReject ===
      true,

    rejectReason:
      request.rejectReason ??
      null,
  };
}

function buildEmergencyPayload({
  symbol,
  direction,
  quantity,
  referencePrice = null,
  clientOrderId = null,
}) {
  const normalizedDirection =
    upper(
      direction,
    );

  const side =
    normalizedDirection ===
      "LONG"
      ? "SELL"
      : normalizedDirection ===
          "SHORT"
        ? "BUY"
        : null;

  return {
    symbol:
      upper(
        symbol,
      ),

    intent:
      "EMERGENCY_CLOSE",

    direction:
      normalizedDirection,

    side,

    orderType:
      "MARKET",

    quantity:
      round(
        quantity,
      ),

    referencePrice:
      round(
        referencePrice,
      ),

    limitPrice:
      null,

    stopPrice:
      null,

    leverage:
      null,

    reduceOnly:
      true,

    postOnly:
      false,

    timeInForce:
      "IOC",

    clientOrderId,

    slippageTolerancePercent:
      null,
  };
}

/**
 * ============================================================
 * MAIN GATEWAY
 * ============================================================
 */

export function buildExecutionCommand({
  executionAdapterResult = null,
  reconciliation = null,
  executionState = null,
  stopPlan = null,
  position = null,
} = {}) {
  /**
   * ==========================================================
   * PRIORITY 1
   * RECONCILIATION
   * ==========================================================
   *
   * Recovery/reconciliation always has priority over a fresh
   * execution request.
   */

  const recoveryAction =
    upper(
      reconciliation?.action,
    );

  /**
   * ----------------------------------------------------------
   * MANUAL REVIEW
   * ----------------------------------------------------------
   */

  if (
    recoveryAction ===
      "MANUAL_REVIEW"
  ) {
    return {
      approved: false,

      command:
        EXECUTION_COMMAND
          .MANUAL_REVIEW,

      payload: null,

      blockers: [
        "RECONCILIATION_REQUIRES_MANUAL_REVIEW",
      ],

      warnings: [],

      executionAuthority:
        false,
    };
  }

  /**
   * ----------------------------------------------------------
   * EMERGENCY RECONCILIATION
   * ----------------------------------------------------------
   */

  if (
    recoveryAction ===
      "EMERGENCY_RECONCILIATION"
  ) {
    const reconciliationPosition =
      reconciliation
        ?.position ??
      {};

    const quantity =
      Math.max(
        0,
        finite(
          position?.quantity ??
          reconciliationPosition
            ?.quantity,
        ) ?? 0,
      );

    if (
      quantity <= 0
    ) {
      return blocked(
        "NO_POSITION_FOR_EMERGENCY_RECONCILIATION",
      );
    }

    const symbol =
      upper(
        position?.symbol ??
        reconciliation
          ?.local
          ?.symbol,
      );

    const direction =
      upper(
        position?.direction ??
        reconciliationPosition
          ?.direction,
      );

    if (
      !symbol ||
      ![
        "LONG",
        "SHORT",
      ].includes(direction)
    ) {
      return blocked(
        "INVALID_EMERGENCY_RECONCILIATION_POSITION",
      );
    }

    return command({
      type:
        EXECUTION_COMMAND
          .EMERGENCY_CLOSE,

      payload:
        buildEmergencyPayload({
          symbol,
          direction,
          quantity,

          referencePrice:
            position
              ?.currentPrice ??
            reconciliationPosition
              ?.currentPrice ??
            null,

          clientOrderId:
            null,
        }),

      reasons: [
        "EMERGENCY_RECONCILIATION_REQUIRED",
      ],
    });
  }

  /**
   * ----------------------------------------------------------
   * CANCEL STALE ORDER
   * ----------------------------------------------------------
   */

  if (
    recoveryAction ===
      "CANCEL_STALE"
  ) {
    const exchangeOrderId =
      reconciliation
        ?.exchange
        ?.exchangeOrderId ??
      executionState
        ?.exchangeOrderId ??
      null;

    const clientOrderId =
      reconciliation
        ?.local
        ?.clientOrderId ??
      executionState
        ?.clientOrderId ??
      null;

    if (
      !exchangeOrderId &&
      !clientOrderId
    ) {
      return blocked(
        "ORDER_IDENTIFIER_REQUIRED_FOR_CANCEL",
      );
    }

    return command({
      type:
        EXECUTION_COMMAND
          .CANCEL_ORDER,

      payload: {
        symbol:
          upper(
            reconciliation
              ?.local
              ?.symbol ??
            executionState
              ?.symbol,
          ),

        exchangeOrderId,

        clientOrderId,
      },

      reasons: [
        "STALE_ORDER_REQUIRES_CANCELLATION",
      ],
    });
  }

  /**
   * ----------------------------------------------------------
   * RETRY REMAINDER
   * ----------------------------------------------------------
   *
   * Important:
   * retry eligibility must come from reconciliation.
   * This gateway must never independently infer that a failed
   * or timed-out order should be resubmitted.
   */

  if (
    recoveryAction ===
      "RETRY_REMAINDER"
  ) {
    const retryQuantity =
      Math.max(
        0,
        finite(
          reconciliation
            ?.retryQuantity,
        ) ?? 0,
      );

    if (
      retryQuantity <= 0
    ) {
      return blocked(
        "INVALID_RETRY_QUANTITY",
      );
    }

    const local =
      reconciliation
        ?.local ??
      executionState ??
      {};

    const symbol =
      upper(
        local.symbol,
      );

    const direction =
      upper(
        local.direction,
      );

    const side =
      upper(
        local.side,
      );

    if (
      !symbol ||
      ![
        "LONG",
        "SHORT",
      ].includes(direction) ||
      ![
        "BUY",
        "SELL",
      ].includes(side)
    ) {
      return blocked(
        "RETRY_EXECUTION_METADATA_MISSING",
      );
    }

    return command({
      type:
        EXECUTION_COMMAND
          .RETRY_REMAINDER,

      payload: {
        symbol,

        intent:
          upper(
            local.intent,
          ),

        direction,

        side,

        orderType:
          upper(
            local.orderType,
            "MARKET",
          ),

        quantity:
          round(
            retryQuantity,
          ),

        referencePrice:
          round(
            local.referencePrice ??
            local.averageFillPrice,
          ),

        limitPrice:
          round(
            local.limitPrice,
          ),

        stopPrice:
          round(
            local.stopPrice,
          ),

        leverage:
          finite(
            local.leverage,
          ),

        reduceOnly:
          local.reduceOnly ===
          true,

        postOnly: false,

        timeInForce:
          upper(
            local.timeInForce,
            "IOC",
          ),

        previousClientOrderId:
          local.clientOrderId ??
          null,

        /*
         * A fresh client order ID should eventually be generated
         * by the live adapter / idempotency layer for a retry.
         */
        clientOrderId:
          null,

        slippageTolerancePercent:
          finite(
            local
              .slippageTolerancePercent,
          ),
      },

      reasons: [
        "RECONCILED_REMAINDER_RETRY_ALLOWED",
      ],
    });
  }

  /**
   * ----------------------------------------------------------
   * REPAIR PROTECTIVE STOP
   * ----------------------------------------------------------
   */

  if (
    recoveryAction ===
      "REPAIR_STOP"
  ) {
    const stopPrice =
      finite(
        stopPlan?.stopPrice,
      );

    const reconciliationPosition =
      reconciliation
        ?.position ??
      {};

    const quantity =
      Math.max(
        0,
        finite(
          position?.quantity ??
          reconciliationPosition
            ?.quantity,
        ) ?? 0,
      );

    const direction =
      upper(
        position?.direction ??
        reconciliationPosition
          ?.direction,
      );

    const symbol =
      upper(
        position?.symbol ??
        reconciliation
          ?.local
          ?.symbol,
      );

    if (
      stopPrice === null ||
      stopPrice <= 0 ||
      quantity <= 0 ||
      !symbol ||
      ![
        "LONG",
        "SHORT",
      ].includes(direction)
    ) {
      return blocked(
        "STOP_REPAIR_DATA_MISSING",
      );
    }

    return command({
      type:
        EXECUTION_COMMAND
          .REPLACE_STOP,

      payload: {
        symbol,

        intent:
          "STOP_UPDATE",

        direction,

        side: null,

        orderType:
          "STOP_MARKET",

        quantity:
          round(
            quantity,
          ),

        referencePrice:
          round(
            position?.currentPrice ??
            reconciliationPosition
              ?.currentPrice,
          ),

        limitPrice:
          null,

        stopPrice:
          round(
            stopPrice,
          ),

        leverage:
          null,

        reduceOnly:
          true,

        postOnly:
          false,

        timeInForce:
          "GTC",

        clientOrderId:
          null,

        slippageTolerancePercent:
          null,
      },

      reasons: [
        "PROTECTIVE_STOP_REPAIR_REQUIRED",
      ],
    });
  }

  /**
   * ----------------------------------------------------------
   * RECONCILIATION ACTIONS REQUIRING NO EXCHANGE COMMAND
   * ----------------------------------------------------------
   */

  if (
    [
      "IN_SYNC",
      "WAIT",
      "ADOPT_EXCHANGE_FILL",
      "SYNC_POSITION",
    ].includes(
      recoveryAction,
    )
  ) {
    return command({
      type:
        EXECUTION_COMMAND
          .NO_ACTION,

      payload: null,

      reasons: [
        `RECONCILIATION_${recoveryAction}`,
      ],
    });
  }

  /**
   * ==========================================================
   * PRIORITY 2
   * NORMAL EXECUTION REQUEST
   * ==========================================================
   */

  if (
    executionAdapterResult
      ?.approved !== true
  ) {
    return blocked(
      "EXECUTION_ADAPTER_NOT_APPROVED",
    );
  }

  const request =
    executionAdapterResult
      ?.executionRequest;

  if (
    !validateExecutionRequest(
      request,
    )
  ) {
    return blocked(
      "INVALID_EXECUTION_REQUEST",
    );
  }

  const intent =
    upper(
      request.intent,
    );

  /**
   * ==========================================================
   * STOP UPDATE
   * ==========================================================
   */

  if (
    intent ===
      "STOP_UPDATE"
  ) {
    const stopPrice =
      finite(
        request.stopPrice,
      );

    if (
      stopPrice === null ||
      stopPrice <= 0
    ) {
      return blocked(
        "STOP_PRICE_REQUIRED",
      );
    }

    if (
      request.reduceOnly !==
      true
    ) {
      return blocked(
        "STOP_UPDATE_MUST_BE_REDUCE_ONLY",
      );
    }

    return command({
      type:
        EXECUTION_COMMAND
          .REPLACE_STOP,

      payload:
        buildSubmitPayload(
          request,
        ),

      reasons: [
        "PROTECTIVE_STOP_UPDATE",
      ],
    });
  }

  /**
   * ==========================================================
   * EMERGENCY CLOSE
   * ==========================================================
   */

  if (
    intent ===
      "EMERGENCY_CLOSE"
  ) {
    if (
      request.reduceOnly !==
      true
    ) {
      return blocked(
        "EMERGENCY_CLOSE_MUST_BE_REDUCE_ONLY",
      );
    }

    const payload =
      buildSubmitPayload(
        request,
      );

    return command({
      type:
        EXECUTION_COMMAND
          .EMERGENCY_CLOSE,

      payload: {
        ...payload,

        /*
         * Emergency exit is always a market-style
         * risk-reduction request.
         */
        orderType:
          "MARKET",

        limitPrice:
          null,

        reduceOnly:
          true,

        postOnly:
          false,

        timeInForce:
          "IOC",
      },

      reasons: [
        "EMERGENCY_POSITION_CLOSE",
      ],
    });
  }

  /**
   * ==========================================================
   * REDUCE / CLOSE
   * ==========================================================
   */

  if (
    intent === "CLOSE" ||
    intent === "REDUCE"
  ) {
    if (
      request.reduceOnly !==
      true
    ) {
      return blocked(
        "RISK_REDUCTION_MUST_BE_REDUCE_ONLY",
      );
    }

    return command({
      type:
        EXECUTION_COMMAND
          .CLOSE_POSITION,

      payload:
        buildSubmitPayload(
          request,
        ),

      reasons: [
        intent === "REDUCE"
          ? "POSITION_REDUCTION"
          : "POSITION_CLOSE",
      ],
    });
  }

  /**
   * ==========================================================
   * OPEN / INCREASE
   * ==========================================================
   */

  if (
    intent === "OPEN" ||
    intent === "INCREASE"
  ) {
    if (
      request.reduceOnly ===
      true
    ) {
      return blocked(
        "OPENING_ORDER_CANNOT_BE_REDUCE_ONLY",
      );
    }

    const direction =
      upper(
        request.direction,
      );

    const side =
      upper(
        request.side,
      );

    const validOpenMapping =
      (
        direction === "LONG" &&
        side === "BUY"
      ) ||
      (
        direction === "SHORT" &&
        side === "SELL"
      );

    if (
      !validOpenMapping
    ) {
      return blocked(
        "INVALID_OPEN_DIRECTION_SIDE_MAPPING",
      );
    }

    return command({
      type:
        EXECUTION_COMMAND
          .SUBMIT_ORDER,

      payload:
        buildSubmitPayload(
          request,
        ),

      reasons: [
        intent === "OPEN"
          ? "OPEN_APPROVED_POSITION"
          : "INCREASE_APPROVED_POSITION",
      ],
    });
  }

  return blocked(
    "UNSUPPORTED_EXECUTION_INTENT",
  );
}

export default
  buildExecutionCommand;