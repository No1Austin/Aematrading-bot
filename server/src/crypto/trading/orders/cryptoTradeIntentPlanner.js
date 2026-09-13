/**
 * AEMA CRYPTO
 * Phase 5.13 — Trade Intent / Order Planning
 *
 * PURPOSE
 * -------
 * Convert approved trading decisions into normalized order intents.
 *
 * This module DOES NOT:
 * - send orders
 * - cancel orders
 * - modify exchange orders
 * - talk to an exchange API
 *
 * It only creates validated order plans.
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
  const v = String(value ?? "")
    .trim()
    .toUpperCase();

  return v || fallback;
};

export const CRYPTO_TRADE_INTENT = Object.freeze({
  OPEN: "OPEN",
  INCREASE: "INCREASE",
  REDUCE: "REDUCE",
  STOP_UPDATE: "STOP_UPDATE",
  CLOSE: "CLOSE",
  EMERGENCY_CLOSE: "EMERGENCY_CLOSE",
  NONE: "NONE",
});

export const CRYPTO_ORDER_SIDE = Object.freeze({
  BUY: "BUY",
  SELL: "SELL",
});

export const CRYPTO_ORDER_TYPE = Object.freeze({
  MARKET: "MARKET",
  LIMIT: "LIMIT",
  STOP_MARKET: "STOP_MARKET",
  STOP_LIMIT: "STOP_LIMIT",
});

function normalizeDirection(value) {
  const direction = upper(value);

  if (
    direction === "LONG" ||
    direction === "SHORT"
  ) {
    return direction;
  }

  return null;
}

function lifecycleToIntent(action) {
  const normalized =
    upper(action);

  switch (normalized) {
    case "OPEN_POSITION":
      return CRYPTO_TRADE_INTENT.OPEN;

    case "ADD_EXPOSURE":
      return CRYPTO_TRADE_INTENT.INCREASE;

    case "REDUCE_EXPOSURE":
      return CRYPTO_TRADE_INTENT.REDUCE;

    case "PROTECT_POSITION":
      return CRYPTO_TRADE_INTENT.STOP_UPDATE;

    case "EXIT_POSITION":
      return CRYPTO_TRADE_INTENT.CLOSE;

    case "EMERGENCY_EXIT":
      return CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE;

    default:
      return CRYPTO_TRADE_INTENT.NONE;
  }
}

function sideForIntent({
  intent,
  direction,
}) {
  if (
    intent === CRYPTO_TRADE_INTENT.OPEN ||
    intent === CRYPTO_TRADE_INTENT.INCREASE
  ) {
    return direction === "LONG"
      ? CRYPTO_ORDER_SIDE.BUY
      : CRYPTO_ORDER_SIDE.SELL;
  }

  if (
    intent === CRYPTO_TRADE_INTENT.REDUCE ||
    intent === CRYPTO_TRADE_INTENT.CLOSE ||
    intent === CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE
  ) {
    return direction === "LONG"
      ? CRYPTO_ORDER_SIDE.SELL
      : CRYPTO_ORDER_SIDE.BUY;
  }

  return null;
}

function shouldBeReduceOnly(intent) {
  return [
    CRYPTO_TRADE_INTENT.REDUCE,
    CRYPTO_TRADE_INTENT.CLOSE,
    CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE,
    CRYPTO_TRADE_INTENT.STOP_UPDATE,
  ].includes(intent);
}

function resolveEntryType({
  intent,
  requestedOrderType,
}) {
  if (
    intent ===
    CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE
  ) {
    return CRYPTO_ORDER_TYPE.MARKET;
  }

  if (
    intent ===
    CRYPTO_TRADE_INTENT.STOP_UPDATE
  ) {
    return CRYPTO_ORDER_TYPE.STOP_MARKET;
  }

  const requested =
    upper(
      requestedOrderType,
    );

  if (
    Object.values(
      CRYPTO_ORDER_TYPE,
    ).includes(requested)
  ) {
    return requested;
  }

  return CRYPTO_ORDER_TYPE.MARKET;
}

function calculateQuantity({
  notionalUsd,
  referencePrice,
}) {
  if (
    !Number.isFinite(notionalUsd) ||
    !Number.isFinite(referencePrice) ||
    notionalUsd <= 0 ||
    referencePrice <= 0
  ) {
    return null;
  }

  return notionalUsd / referencePrice;
}

function normalizeExposure(value) {
  const n = finite(value);

  if (n === null) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, n),
  );
}

function determineRequestedDelta({
  lifecycle,
  currentExposure,
}) {
  const target =
    normalizeExposure(
      lifecycle?.targetExposure,
    );

  const current =
    normalizeExposure(
      currentExposure ??
      lifecycle?.currentExposure,
    );

  const action =
    upper(
      lifecycle?.action,
    );

  if (
    action === "OPEN_POSITION"
  ) {
    return target;
  }

  if (
    action === "ADD_EXPOSURE"
  ) {
    return Math.max(
      0,
      target - current,
    );
  }

  if (
    action === "REDUCE_EXPOSURE"
  ) {
    return Math.max(
      0,
      current - target,
    );
  }

  if (
    action === "EXIT_POSITION" ||
    action === "EMERGENCY_EXIT"
  ) {
    return current;
  }

  return 0;
}

function resolveApprovedExposure({
  lifecycle,
  portfolioRisk,
  intent,
}) {
  const lifecycleTarget =
    normalizeExposure(
      lifecycle?.targetExposure,
    );

  if (
    intent ===
      CRYPTO_TRADE_INTENT.OPEN ||
    intent ===
      CRYPTO_TRADE_INTENT.INCREASE
  ) {
    if (
      portfolioRisk?.approved === false
    ) {
      return 0;
    }

    const portfolioApproved =
      finite(
        portfolioRisk
          ?.approvedExposure,
      );

    if (
      portfolioApproved !== null
    ) {
      return Math.min(
        lifecycleTarget,
        Math.max(
          0,
          portfolioApproved,
        ),
      );
    }
  }

  return lifecycleTarget;
}

function buildNone({
  reason,
  direction = "NEUTRAL",
}) {
  return {
    approved: false,

    status:
      "NO_ORDER_INTENT",

    intent:
      CRYPTO_TRADE_INTENT.NONE,

    direction,

    side: null,

    reduceOnly: false,

    quantity: 0,

    notionalUsd: 0,

    reason,

    executionAuthority: false,
  };
}

/**
 * ============================================================
 * MAIN PLANNER
 * ============================================================
 */

export function planCryptoTradeIntent({
  symbol,
  lifecycle,
  riskPlan = {},
  portfolioRisk = {},
  stopPlan = {},
  position = {},
  market = {},
  preferences = {},
} = {}) {
  const action =
    upper(
      lifecycle?.action,
    );

  const intent =
    lifecycleToIntent(
      action,
    );

  const direction =
    normalizeDirection(
      lifecycle?.direction ??
      position?.direction ??
      riskPlan?.direction,
    );

  if (
    intent ===
      CRYPTO_TRADE_INTENT.NONE
  ) {
    return buildNone({
      reason:
        "NO_TRADE_ACTION",
      direction:
        direction ??
        "NEUTRAL",
    });
  }

  if (!direction) {
    return buildNone({
      reason:
        "INVALID_DIRECTION",
    });
  }

  const normalizedSymbol =
    upper(symbol);

  if (!normalizedSymbol) {
    return buildNone({
      reason:
        "SYMBOL_REQUIRED",
      direction,
    });
  }

  /*
   * ==========================================================
   * OPEN / INCREASE REQUIRE APPROVAL
   * ==========================================================
   */

  if (
    (
      intent ===
        CRYPTO_TRADE_INTENT.OPEN ||
      intent ===
        CRYPTO_TRADE_INTENT.INCREASE
    ) &&
    lifecycle?.approved !== true
  ) {
    return buildNone({
      reason:
        "LIFECYCLE_NOT_APPROVED",
      direction,
    });
  }

  if (
    (
      intent ===
        CRYPTO_TRADE_INTENT.OPEN ||
      intent ===
        CRYPTO_TRADE_INTENT.INCREASE
    ) &&
    riskPlan?.approved === false
  ) {
    return buildNone({
      reason:
        "RISK_PLAN_BLOCKED",
      direction,
    });
  }

  if (
    (
      intent ===
        CRYPTO_TRADE_INTENT.OPEN ||
      intent ===
        CRYPTO_TRADE_INTENT.INCREASE
    ) &&
    portfolioRisk?.approved === false
  ) {
    return buildNone({
      reason:
        "PORTFOLIO_RISK_BLOCKED",
      direction,
    });
  }

  /*
   * ==========================================================
   * EXPOSURE
   * ==========================================================
   */

  const currentExposure =
    normalizeExposure(
      position?.currentExposure ??
      position?.exposure ??
      lifecycle?.currentExposure,
    );

  const requestedDelta =
    determineRequestedDelta({
      lifecycle,
      currentExposure,
    });

  const approvedExposure =
    resolveApprovedExposure({
      lifecycle,
      portfolioRisk,
      intent,
    });

  let exposureDelta =
    requestedDelta;

  if (
    intent ===
      CRYPTO_TRADE_INTENT.OPEN
  ) {
    exposureDelta =
      approvedExposure;
  }

  if (
    intent ===
      CRYPTO_TRADE_INTENT.INCREASE
  ) {
    exposureDelta =
      Math.max(
        0,
        approvedExposure -
        currentExposure,
      );
  }

  /*
   * Risk-reducing actions are driven by lifecycle,
   * not by portfolio veto.
   */

  if (
    intent ===
      CRYPTO_TRADE_INTENT.REDUCE
  ) {
    exposureDelta =
      Math.max(
        0,
        currentExposure -
        normalizeExposure(
          lifecycle?.targetExposure,
        ),
      );
  }

  if (
    intent ===
      CRYPTO_TRADE_INTENT.CLOSE ||
    intent ===
      CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE
  ) {
    exposureDelta =
      currentExposure;
  }

  /*
   * ==========================================================
   * REFERENCE PRICE
   * ==========================================================
   */

  const referencePrice =
    finite(
      market?.price ??
      market?.markPrice ??
      market?.lastPrice ??
      riskPlan?.entryPrice ??
      position?.currentPrice ??
      position?.entryPrice,
    );

  const basePositionSizeUsd =
    finite(
      riskPlan
        ?.sizing
        ?.positionSizeUsd,
    );

  const currentPositionNotionalUsd =
    finite(
      position
        ?.notionalUsd ??
      position
        ?.positionSizeUsd,
    );

  let notionalUsd = null;

  if (
    intent ===
      CRYPTO_TRADE_INTENT.OPEN
  ) {
    if (
      basePositionSizeUsd !== null
    ) {
      notionalUsd =
        basePositionSizeUsd *
        approvedExposure;
    }
  }

  if (
    intent ===
      CRYPTO_TRADE_INTENT.INCREASE
  ) {
    if (
      basePositionSizeUsd !== null
    ) {
      notionalUsd =
        basePositionSizeUsd *
        exposureDelta;
    }
  }

  if (
    intent ===
      CRYPTO_TRADE_INTENT.REDUCE
  ) {
    if (
      currentPositionNotionalUsd !==
      null
    ) {
      notionalUsd =
        currentPositionNotionalUsd *
        (
          currentExposure > 0
            ? exposureDelta /
              currentExposure
            : 0
        );
    }
  }

  if (
    intent ===
      CRYPTO_TRADE_INTENT.CLOSE ||
    intent ===
      CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE
  ) {
    notionalUsd =
      currentPositionNotionalUsd;
  }

  /*
   * STOP_UPDATE does not alter quantity.
   */

  if (
    intent ===
      CRYPTO_TRADE_INTENT.STOP_UPDATE
  ) {
    notionalUsd = 0;
  }

  if (
    notionalUsd !== null
  ) {
    notionalUsd =
      Math.max(
        0,
        notionalUsd,
      );
  }

  /*
   * ==========================================================
   * ORDER SIDE
   * ==========================================================
   */

  const side =
    sideForIntent({
      intent,
      direction,
    });

  /*
   * ==========================================================
   * ORDER TYPE
   * ==========================================================
   */

  const orderType =
    resolveEntryType({
      intent,

      requestedOrderType:
        preferences
          ?.orderType,
    });

  const limitPrice =
    orderType ===
      CRYPTO_ORDER_TYPE.LIMIT
      ? finite(
          preferences
            ?.limitPrice ??
          market
            ?.limitPrice ??
          referencePrice,
        )
      : null;

  const stopPrice =
    finite(
      stopPlan?.stopPrice ??
      riskPlan
        ?.stop
        ?.currentStopPrice ??
      riskPlan
        ?.stop
        ?.initialStopPrice,
    );

  /*
   * ==========================================================
   * QUANTITY
   * ==========================================================
   */

  let quantity = null;

  if (
    intent ===
      CRYPTO_TRADE_INTENT.STOP_UPDATE
  ) {
    quantity =
      finite(
        position?.quantity,
      );
  } else {
    quantity =
      calculateQuantity({
        notionalUsd,
        referencePrice,
      });
  }

  if (
    quantity !== null
  ) {
    quantity =
      Math.max(
        0,
        quantity,
      );
  }

  /*
   * ==========================================================
   * PROTECTIVE VALIDATION
   * ==========================================================
   */

  if (
    intent ===
      CRYPTO_TRADE_INTENT.STOP_UPDATE &&
    stopPrice === null
  ) {
    return buildNone({
      reason:
        "STOP_PRICE_REQUIRED",
      direction,
    });
  }

  /*
   * OPEN / INCREASE need usable quantity.
   */

  if (
    (
      intent ===
        CRYPTO_TRADE_INTENT.OPEN ||
      intent ===
        CRYPTO_TRADE_INTENT.INCREASE
    ) &&
    (
      quantity === null ||
      quantity <= 0
    )
  ) {
    return buildNone({
      reason:
        "INVALID_OPEN_QUANTITY",
      direction,
    });
  }

  /*
   * REDUCE / CLOSE also require an existing
   * quantity or usable notional.
   */

  if (
    (
      intent ===
        CRYPTO_TRADE_INTENT.REDUCE ||
      intent ===
        CRYPTO_TRADE_INTENT.CLOSE ||
      intent ===
        CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE
    ) &&
    (
      quantity === null ||
      quantity <= 0
    )
  ) {
    return buildNone({
      reason:
        "NO_POSITION_QUANTITY_TO_REDUCE",
      direction,
    });
  }

  const reduceOnly =
    shouldBeReduceOnly(
      intent,
    );

  const postOnly =
    orderType ===
      CRYPTO_ORDER_TYPE.LIMIT &&
    preferences?.postOnly ===
      true &&
    !reduceOnly;

  const timeInForce =
    upper(
      preferences
        ?.timeInForce,
      orderType ===
        CRYPTO_ORDER_TYPE.MARKET
        ? "IOC"
        : "GTC",
    );

  const slippageTolerancePercent =
    Math.max(
      0,
      finite(
        preferences
          ?.slippageTolerancePercent,
        0.25,
      ),
    );

  /*
   * ==========================================================
   * FINAL INVARIANTS
   * ==========================================================
   */

  if (
    reduceOnly &&
    (
      intent ===
        CRYPTO_TRADE_INTENT.OPEN ||
      intent ===
        CRYPTO_TRADE_INTENT.INCREASE
    )
  ) {
    throw new Error(
      "Opening intent cannot be reduceOnly",
    );
  }

  if (
    intent ===
      CRYPTO_TRADE_INTENT.EMERGENCY_CLOSE &&
    reduceOnly !== true
  ) {
    throw new Error(
      "Emergency close must be reduceOnly",
    );
  }

  if (
    quantity !== null &&
    quantity < 0
  ) {
    throw new Error(
      "Order quantity cannot be negative",
    );
  }

  return {
    approved: true,

    status:
      "ORDER_INTENT_READY",

    symbol:
      normalizedSymbol,

    intent,

    lifecycleAction:
      action,

    direction,

    side,

    orderType,

    reduceOnly,

    postOnly,

    timeInForce,

    currentExposure:
      round(
        currentExposure,
        4,
      ),

    requestedExposure:
      round(
        lifecycle
          ?.targetExposure,
        4,
      ),

    approvedExposure:
      round(
        approvedExposure,
        4,
      ),

    exposureDelta:
      round(
        exposureDelta,
        4,
      ),

    referencePrice:
      round(
        referencePrice,
      ),

    limitPrice:
      round(
        limitPrice,
      ),

    stopPrice:
      round(
        stopPrice,
      ),

    quantity:
      round(
        quantity,
      ),

    notionalUsd:
      round(
        notionalUsd,
        2,
      ),

    leverage:
      finite(
        riskPlan
          ?.leverage
          ?.recommended ??
        riskPlan?.leverage,
      ),

    targets: {
      target1:
        finite(
          riskPlan
            ?.targets
            ?.target1,
        ),

      target2:
        finite(
          riskPlan
            ?.targets
            ?.target2,
        ),

      target3:
        finite(
          riskPlan
            ?.targets
            ?.target3,
        ),
    },

    slippageTolerancePercent:
      round(
        slippageTolerancePercent,
        4,
      ),

    reason:
      lifecycle
        ?.reasons ??
      [],

    /*
     * Hard architectural boundary.
     */
    executionAuthority:
      false,

    generatedAt:
      new Date()
        .toISOString(),
  };
}

export default
  planCryptoTradeIntent;