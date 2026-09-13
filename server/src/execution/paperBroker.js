import {
  TRADE_SIDE,
} from "../config/riskConfig.js";

/**
 * ============================================================
 * PAPER BROKER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Simulate broker execution without sending real orders.
 *
 * Handles:
 *
 * - LONG orders
 * - SHORT orders
 * - Market orders
 * - Limit orders
 * - Simulated fills
 * - Slippage
 * - Fees
 * - Position creation
 * - Position closing
 * - Realized P&L
 *
 * IMPORTANT
 * ---------
 *
 * This module MUST NOT connect to a live brokerage account.
 *
 * It is intentionally designed for:
 *
 * - paper trading
 * - integration testing
 * - historical replay
 * - strategy validation
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const PAPER_ORDER_TYPE =
  Object.freeze({
    MARKET: "MARKET",
    LIMIT: "LIMIT",
  });

export const PAPER_ORDER_STATUS =
  Object.freeze({
    PENDING: "PENDING",
    FILLED: "FILLED",
    PARTIALLY_FILLED:
      "PARTIALLY_FILLED",
    REJECTED: "REJECTED",
    CANCELLED: "CANCELLED",
  });

export const PAPER_POSITION_STATUS =
  Object.freeze({
    OPEN: "OPEN",
    CLOSED: "CLOSED",
  });

export const PAPER_BROKER_CONFIG =
  Object.freeze({
    /**
     * Default estimated slippage.
     *
     * 0.0005 = 0.05%
     */
    defaultSlippagePercent:
      0.0005,

    /**
     * Simple simulated commission.
     */
    commissionPerShare:
      0,

    minimumCommission:
      0,

    maximumPositionValue:
      null,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
  return Number.isFinite(
    Number(value),
  );
}

function positiveNumber(value) {
  return (
    isFiniteNumber(value) &&
    Number(value) > 0
  );
}

function clamp(
  value,
  min,
  max,
) {
  return Math.min(
    Math.max(
      Number(value),
      min,
    ),
    max,
  );
}

function round(
  value,
  decimals = 4,
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
        factor,
    ) / factor
  );
}

function createId(
  prefix,
) {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * ============================================================
 * COMMISSION
 * ============================================================
 */

function calculateCommission({
  shares,
  config,
}) {
  const commission =
    Number(shares) *
    Number(
      config
        .commissionPerShare ??
      0,
    );

  return Math.max(
    commission,
    Number(
      config
        .minimumCommission ??
      0,
    ),
  );
}

/**
 * ============================================================
 * SLIPPAGE
 * ============================================================
 *
 * LONG entry:
 *
 * Worse fill = higher price.
 *
 * SHORT entry:
 *
 * Worse fill = lower price.
 */

function applyEntrySlippage({
  side,
  price,
  slippagePercent,
}) {
  const slippage =
    clamp(
      slippagePercent,
      0,
      1,
    );

  if (
    side === TRADE_SIDE.LONG
  ) {
    return (
      Number(price) *
      (
        1 +
        slippage
      )
    );
  }

  if (
    side === TRADE_SIDE.SHORT
  ) {
    return (
      Number(price) *
      (
        1 -
        slippage
      )
    );
  }

  return Number(price);
}

/**
 * ============================================================
 * EXIT SLIPPAGE
 * ============================================================
 *
 * LONG exit:
 *
 * Worse fill = lower price.
 *
 * SHORT exit:
 *
 * Worse fill = higher price.
 */

function applyExitSlippage({
  side,
  price,
  slippagePercent,
}) {
  const slippage =
    clamp(
      slippagePercent,
      0,
      1,
    );

  if (
    side === TRADE_SIDE.LONG
  ) {
    return (
      Number(price) *
      (
        1 -
        slippage
      )
    );
  }

  if (
    side === TRADE_SIDE.SHORT
  ) {
    return (
      Number(price) *
      (
        1 +
        slippage
      )
    );
  }

  return Number(price);
}

/**
 * ============================================================
 * VALIDATE ORDER
 * ============================================================
 */

function validateOrder({
  symbol,
  side,
  shares,
  orderType,
  currentPrice,
  limitPrice,
}) {
  const errors = [];

  if (!symbol) {
    errors.push(
      "Symbol is required.",
    );
  }

  if (
    side !== TRADE_SIDE.LONG &&
    side !== TRADE_SIDE.SHORT
  ) {
    errors.push(
      "Side must be LONG or SHORT.",
    );
  }

  if (
    !positiveNumber(shares)
  ) {
    errors.push(
      "Shares must be greater than zero.",
    );
  }

  if (
    orderType !==
      PAPER_ORDER_TYPE.MARKET &&
    orderType !==
      PAPER_ORDER_TYPE.LIMIT
  ) {
    errors.push(
      "Order type must be MARKET or LIMIT.",
    );
  }

  if (
    !positiveNumber(
      currentPrice,
    )
  ) {
    errors.push(
      "Current market price is required.",
    );
  }

  if (
    orderType ===
      PAPER_ORDER_TYPE.LIMIT &&
    !positiveNumber(
      limitPrice,
    )
  ) {
    errors.push(
      "Limit price is required for LIMIT orders.",
    );
  }

  return {
    valid:
      errors.length === 0,

    errors,
  };
}

/**
 * ============================================================
 * LIMIT FILL LOGIC
 * ============================================================
 */

function canFillLimitOrder({
  side,
  currentPrice,
  limitPrice,
}) {
  if (
    side === TRADE_SIDE.LONG
  ) {
    return (
      Number(
        currentPrice,
      ) <=
      Number(
        limitPrice,
      )
    );
  }

  if (
    side === TRADE_SIDE.SHORT
  ) {
    return (
      Number(
        currentPrice,
      ) >=
      Number(
        limitPrice,
      )
    );
  }

  return false;
}

/**
 * ============================================================
 * CREATE PAPER ORDER
 * ============================================================
 */

export function createPaperOrder({
  symbol,

  side,

  shares,

  orderType =
    PAPER_ORDER_TYPE.MARKET,

  currentPrice,

  limitPrice = null,

  stopPrice = null,

  targetPrice = null,

  intelligenceScore = null,

  slippagePercent = null,

  metadata = {},

  config =
    PAPER_BROKER_CONFIG,
} = {}) {
  try {
    const validation =
      validateOrder({
        symbol,

        side,

        shares,

        orderType,

        currentPrice,

        limitPrice,
      });

    if (
      !validation.valid
    ) {
      return {
        approved: false,

        engine:
          "PAPER_BROKER",

        status:
          PAPER_ORDER_STATUS.REJECTED,

        order: null,

        errors:
          validation.errors,

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    const orderId =
      createId(
        "paper_order",
      );

    const normalizedShares =
      Math.floor(
        Number(shares),
      );

    const slippage =
      isFiniteNumber(
        slippagePercent,
      )
        ? clamp(
            slippagePercent,
            0,
            1,
          )
        : config
            .defaultSlippagePercent;

    /**
     * ======================================================
     * DETERMINE FILL
     * ======================================================
     */

    let filled = false;

    let rawFillPrice = null;

    if (
      orderType ===
      PAPER_ORDER_TYPE.MARKET
    ) {
      filled = true;

      rawFillPrice =
        Number(
          currentPrice,
        );
    }

    if (
      orderType ===
      PAPER_ORDER_TYPE.LIMIT
    ) {
      filled =
        canFillLimitOrder({
          side,

          currentPrice,

          limitPrice,
        });

      if (filled) {
        rawFillPrice =
          Number(
            currentPrice,
          );
      }
    }

    /**
     * ======================================================
     * PENDING LIMIT ORDER
     * ======================================================
     */

    if (!filled) {
      return {
        approved: true,

        engine:
          "PAPER_BROKER",

        status:
          PAPER_ORDER_STATUS.PENDING,

        order: {
          id:
            orderId,

          symbol,

          side,

          shares:
            normalizedShares,

          orderType,

          currentPrice:
            Number(
              currentPrice,
            ),

          limitPrice:
            Number(
              limitPrice,
            ),

          stopPrice,

          targetPrice,

          intelligenceScore,

          metadata,

          createdAt:
            new Date()
              .toISOString(),
        },

        position: null,

        warnings: [],

        errors: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * FILL PRICE
     * ======================================================
     */

    const fillPrice =
      applyEntrySlippage({
        side,

        price:
          rawFillPrice,

        slippagePercent:
          slippage,
      });

    /**
     * ======================================================
     * COMMISSION
     * ======================================================
     */

    const commission =
      calculateCommission({
        shares:
          normalizedShares,

        config,
      });

    const positionValue =
      normalizedShares *
      fillPrice;

    /**
     * ======================================================
     * OPTIONAL MAX POSITION BLOCK
     * ======================================================
     */

    if (
      positiveNumber(
        config
          .maximumPositionValue,
      ) &&
      positionValue >
        Number(
          config
            .maximumPositionValue,
        )
    ) {
      return {
        approved: false,

        engine:
          "PAPER_BROKER",

        status:
          PAPER_ORDER_STATUS.REJECTED,

        order: null,

        position: null,

        errors: [
          "Position exceeds configured maximum paper position value.",
        ],

        warnings: [],

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * CREATE POSITION
     * ======================================================
     */

    const positionId =
      createId(
        "paper_position",
      );

    const position = {
      id:
        positionId,

      orderId,

      symbol,

      side,

      status:
        PAPER_POSITION_STATUS.OPEN,

      shares:
        normalizedShares,

      entryPrice:
        round(
          fillPrice,
          4,
        ),

      originalEntryPrice:
        Number(
          currentPrice,
        ),

      stopPrice:
        positiveNumber(
          stopPrice,
        )
          ? Number(
              stopPrice,
            )
          : null,

      targetPrice:
        positiveNumber(
          targetPrice,
        )
          ? Number(
              targetPrice,
            )
          : null,

      currentPrice:
        round(
          fillPrice,
          4,
        ),

      bestPrice:
        round(
          fillPrice,
          4,
        ),

      positionValue:
        round(
          positionValue,
          2,
        ),

      entryCommission:
        round(
          commission,
          2,
        ),

      intelligenceScore:
        isFiniteNumber(
          intelligenceScore,
        )
          ? Number(
              intelligenceScore,
            )
          : null,

      realizedPnL: 0,

      unrealizedPnL: 0,

      metadata,

      openedAt:
        new Date()
          .toISOString(),

      closedAt: null,
    };

    return {
      approved: true,

      engine:
        "PAPER_BROKER",

      status:
        PAPER_ORDER_STATUS.FILLED,

      order: {
        id:
          orderId,

        symbol,

        side,

        shares:
          normalizedShares,

        orderType,

        requestedPrice:
          Number(
            currentPrice,
          ),

        fillPrice:
          round(
            fillPrice,
            4,
          ),

        slippagePercent:
          round(
            slippage,
            6,
          ),

        commission:
          round(
            commission,
            2,
          ),

        filledAt:
          new Date()
            .toISOString(),
      },

      position,

      warnings: [],

      errors: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "PAPER_BROKER",

      status:
        PAPER_ORDER_STATUS.REJECTED,

      order: null,

      position: null,

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      warnings: [
        "Paper order failed safely. No position was created.",
      ],

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

/**
 * ============================================================
 * UPDATE PAPER POSITION
 * ============================================================
 */

export function updatePaperPosition({
  position,
  currentPrice,
} = {}) {
  try {
    if (
      !position ||
      position.status !==
        PAPER_POSITION_STATUS.OPEN
    ) {
      return {
        approved: false,

        status:
          "ERROR",

        errors: [
          "Open paper position is required.",
        ],
      };
    }

    if (
      !positiveNumber(
        currentPrice,
      )
    ) {
      return {
        approved: false,

        status:
          "ERROR",

        errors: [
          "Valid current price is required.",
        ],
      };
    }

    const entry =
      Number(
        position.entryPrice,
      );

    const price =
      Number(
        currentPrice,
      );

    const shares =
      Number(
        position.shares,
      );

    let unrealizedPnL = 0;

    let bestPrice =
      position.bestPrice ??
      entry;

    if (
      position.side ===
      TRADE_SIDE.LONG
    ) {
      unrealizedPnL =
        (
          price -
          entry
        ) *
        shares;

      bestPrice =
        Math.max(
          Number(
            bestPrice,
          ),
          price,
        );
    }

    if (
      position.side ===
      TRADE_SIDE.SHORT
    ) {
      unrealizedPnL =
        (
          entry -
          price
        ) *
        shares;

      bestPrice =
        Math.min(
          Number(
            bestPrice,
          ),
          price,
        );
    }

    return {
      approved: true,

      status:
        "UPDATED",

      position: {
        ...position,

        currentPrice:
          round(
            price,
            4,
          ),

        bestPrice:
          round(
            bestPrice,
            4,
          ),

        unrealizedPnL:
          round(
            unrealizedPnL,
            2,
          ),

        updatedAt:
          new Date()
            .toISOString(),
      },

      errors: [],
    };
  } catch (error) {
    return {
      approved: false,

      status:
        "ERROR",

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
    };
  }
}



/**
 * ============================================================
 * REDUCE PAPER POSITION
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Partially close an existing paper position.
 *
 * Used by the Trade Thesis Monitor when the original
 * reason for entering the trade begins to deteriorate.
 *
 * Example:
 *
 * 100 shares
 * REDUCE_50
 *
 * → close 50 shares
 * → keep 50 shares open
 * → realize P&L on the 50 shares that were closed
 *
 * This function NEVER increases exposure.
 */

export function reducePaperPosition({
  position,

  currentPrice,

  reductionPercent,

  reason =
    "THESIS_DETERIORATION",

  slippagePercent = null,

  config =
    PAPER_BROKER_CONFIG,
} = {}) {
  try {
    /**
     * ======================================================
     * VALIDATE POSITION
     * ======================================================
     */

    if (
      !position ||
      position.status !==
        PAPER_POSITION_STATUS.OPEN
    ) {
      return {
        approved: false,

        engine:
          "PAPER_BROKER",

        status:
          "ERROR",

        position,

        execution: null,

        errors: [
          "Open paper position is required.",
        ],

        warnings: [],
      };
    }

    if (
      !positiveNumber(
        currentPrice,
      )
    ) {
      return {
        approved: false,

        engine:
          "PAPER_BROKER",

        status:
          "ERROR",

        position,

        execution: null,

        errors: [
          "Valid current price is required.",
        ],

        warnings: [],
      };
    }

    if (
      !positiveNumber(
        reductionPercent,
      ) ||
      Number(
        reductionPercent,
      ) > 1
    ) {
      return {
        approved: false,

        engine:
          "PAPER_BROKER",

        status:
          "ERROR",

        position,

        execution: null,

        errors: [
          "Reduction percent must be greater than 0 and no greater than 1.",
        ],

        warnings: [],
      };
    }

    const currentShares =
      Math.floor(
        Number(
          position.shares,
        ),
      );

    if (currentShares <= 0) {
      return {
        approved: false,

        engine:
          "PAPER_BROKER",

        status:
          "ERROR",

        position,

        execution: null,

        errors: [
          "Position has no shares available to reduce.",
        ],

        warnings: [],
      };
    }

    /**
     * ======================================================
     * CALCULATE SHARES TO CLOSE
     * ======================================================
     */

    let sharesToClose =
      Math.floor(
        currentShares *
        Number(
          reductionPercent,
        ),
      );

    /**
     * A valid reduction should remove at least one share.
     */

    sharesToClose =
      Math.max(
        1,
        sharesToClose,
      );

    /**
     * Partial reduction must not accidentally close more
     * shares than currently exist.
     */

    sharesToClose =
      Math.min(
        currentShares,
        sharesToClose,
      );

    /**
     * If the requested reduction consumes the entire
     * remaining position, use the normal close path.
     */

    if (
      sharesToClose >=
      currentShares
    ) {
      return closePaperPosition({
        position,

        currentPrice,

        reason,

        slippagePercent,

        config,
      });
    }

    /**
     * ======================================================
     * EXIT SLIPPAGE
     * ======================================================
     */

    const slippage =
      isFiniteNumber(
        slippagePercent,
      )
        ? clamp(
            slippagePercent,
            0,
            1,
          )
        : config
            .defaultSlippagePercent;

    const fillPrice =
      applyExitSlippage({
        side:
          position.side,

        price:
          currentPrice,

        slippagePercent:
          slippage,
      });

    /**
     * ======================================================
     * REALIZED P&L ON CLOSED SHARES
     * ======================================================
     */

    const entryPrice =
      Number(
        position.entryPrice,
      );

    let grossPnL = 0;

    if (
      position.side ===
      TRADE_SIDE.LONG
    ) {
      grossPnL =
        (
          fillPrice -
          entryPrice
        ) *
        sharesToClose;
    }

    if (
      position.side ===
      TRADE_SIDE.SHORT
    ) {
      grossPnL =
        (
          entryPrice -
          fillPrice
        ) *
        sharesToClose;
    }

    const exitCommission =
      calculateCommission({
        shares:
          sharesToClose,

        config,
      });

    /**
     * Allocate entry commission proportionally to
     * the shares being removed.
     */

    const originalEntryCommission =
      Number(
        position
          .entryCommission ??
        0,
      );

    const allocatedEntryCommission =
      currentShares > 0
        ? originalEntryCommission *
          (
            sharesToClose /
            currentShares
          )
        : 0;

    const netPnL =
      grossPnL -
      allocatedEntryCommission -
      exitCommission;

    const remainingShares =
      currentShares -
      sharesToClose;

    const previousRealizedPnL =
      isFiniteNumber(
        position.realizedPnL,
      )
        ? Number(
            position.realizedPnL,
          )
        : 0;

    const remainingEntryCommission =
      Math.max(
        0,
        originalEntryCommission -
        allocatedEntryCommission,
      );

    /**
     * ======================================================
     * UPDATE REMAINING POSITION
     * ======================================================
     */

    const updatedPosition = {
      ...position,

      shares:
        remainingShares,

      currentPrice:
        round(
          fillPrice,
          4,
        ),

      entryCommission:
        round(
          remainingEntryCommission,
          2,
        ),

      realizedPnL:
        round(
          previousRealizedPnL +
          netPnL,
          2,
        ),

      lastReduction: {
        reason,

        sharesClosed:
          sharesToClose,

        sharesRemaining:
          remainingShares,

        reductionPercent:
          round(
            sharesToClose /
            currentShares,
            6,
          ),

        exitPrice:
          round(
            fillPrice,
            4,
          ),

        grossPnL:
          round(
            grossPnL,
            2,
          ),

        netPnL:
          round(
            netPnL,
            2,
          ),

        timestamp:
          new Date()
            .toISOString(),
      },

      reductionHistory: [
        ...(
          Array.isArray(
            position
              .reductionHistory,
          )
            ? position
                .reductionHistory
            : []
        ),

        {
          reason,

          sharesClosed:
            sharesToClose,

          sharesRemaining:
            remainingShares,

          reductionPercent:
            round(
              sharesToClose /
              currentShares,
              6,
            ),

          exitPrice:
            round(
              fillPrice,
              4,
            ),

          netPnL:
            round(
              netPnL,
              2,
            ),

          timestamp:
            new Date()
              .toISOString(),
        },
      ],

      updatedAt:
        new Date()
          .toISOString(),
    };

    /**
     * Recalculate unrealized P&L for the remaining shares.
     */

    if (
      position.side ===
      TRADE_SIDE.LONG
    ) {
      updatedPosition
        .unrealizedPnL =
        round(
          (
            Number(
              currentPrice,
            ) -
            entryPrice
          ) *
          remainingShares,
          2,
        );
    }

    if (
      position.side ===
      TRADE_SIDE.SHORT
    ) {
      updatedPosition
        .unrealizedPnL =
        round(
          (
            entryPrice -
            Number(
              currentPrice,
            )
          ) *
          remainingShares,
          2,
        );
    }

    return {
      approved: true,

      engine:
        "PAPER_BROKER",

      status:
        "POSITION_REDUCED",

      position:
        updatedPosition,

      execution: {
        action:
          "PARTIAL_EXIT",

        reason,

        sharesClosed:
          sharesToClose,

        sharesRemaining:
          remainingShares,

        exitPrice:
          round(
            fillPrice,
            4,
          ),

        grossPnL:
          round(
            grossPnL,
            2,
          ),

        netPnL:
          round(
            netPnL,
            2,
          ),

        reductionPercent:
          round(
            sharesToClose /
            currentShares,
            6,
          ),

        slippagePercent:
          round(
            slippage,
            6,
          ),
      },

      warnings: [],

      errors: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "PAPER_BROKER",

      status:
        "ERROR",

      position,

      execution: null,

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      warnings: [
        "Paper position reduction failed safely. Existing exposure was preserved.",
      ],

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}
/**
 * ============================================================
 * CLOSE PAPER POSITION
 * ============================================================
 */

export function closePaperPosition({
  position,

  currentPrice,

  reason =
    "MANUAL_EXIT",

  slippagePercent = null,

  config =
    PAPER_BROKER_CONFIG,
} = {}) {
  try {
    if (
      !position ||
      position.status !==
        PAPER_POSITION_STATUS.OPEN
    ) {
      return {
        approved: false,

        status:
          "ERROR",

        errors: [
          "Open paper position is required.",
        ],
      };
    }

    if (
      !positiveNumber(
        currentPrice,
      )
    ) {
      return {
        approved: false,

        status:
          "ERROR",

        errors: [
          "Valid exit price is required.",
        ],
      };
    }

    const slippage =
      isFiniteNumber(
        slippagePercent,
      )
        ? clamp(
            slippagePercent,
            0,
            1,
          )
        : config
            .defaultSlippagePercent;

    const fillPrice =
      applyExitSlippage({
        side:
          position.side,

        price:
          currentPrice,

        slippagePercent:
          slippage,
      });

    const shares =
      Number(
        position.shares,
      );

    const entryPrice =
      Number(
        position.entryPrice,
      );

    let grossPnL = 0;

    if (
      position.side ===
      TRADE_SIDE.LONG
    ) {
      grossPnL =
        (
          fillPrice -
          entryPrice
        ) *
        shares;
    }

    if (
      position.side ===
      TRADE_SIDE.SHORT
    ) {
      grossPnL =
        (
          entryPrice -
          fillPrice
        ) *
        shares;
    }

    const exitCommission =
      calculateCommission({
        shares,

        config,
      });

    const entryCommission =
      Number(
        position
          .entryCommission ??
        0,
      );

    const netPnL =
      grossPnL -
      entryCommission -
      exitCommission;

    const closedPosition = {
      ...position,

      status:
        PAPER_POSITION_STATUS.CLOSED,

      currentPrice:
        round(
          fillPrice,
          4,
        ),

      exitPrice:
        round(
          fillPrice,
          4,
        ),

      exitReason:
        reason,

      grossPnL:
        round(
          grossPnL,
          2,
        ),

      exitCommission:
        round(
          exitCommission,
          2,
        ),

      realizedPnL:
        round(
          netPnL,
          2,
        ),

      unrealizedPnL: 0,

      closedAt:
        new Date()
          .toISOString(),
    };

    return {
      approved: true,

      engine:
        "PAPER_BROKER",

      status:
        "POSITION_CLOSED",

      position:
        closedPosition,

      execution: {
        exitPrice:
          round(
            fillPrice,
            4,
          ),

        exitReason:
          reason,

        grossPnL:
          round(
            grossPnL,
            2,
          ),

        netPnL:
          round(
            netPnL,
            2,
          ),

        slippagePercent:
          round(
            slippage,
            6,
          ),
      },

      warnings: [],

      errors: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      engine:
        "PAPER_BROKER",

      status:
        "ERROR",

      position,

      warnings: [
        "Paper position close failed safely.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default {
  createPaperOrder,
  updatePaperPosition,
  closePaperPosition,
};