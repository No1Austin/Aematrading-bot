/**
 * ============================================================
 * AEMA CRYPTO
 * PAPER P&L MANAGER
 * Phase 5.25
 * ============================================================
 *
 * Pure accounting mathematics for the paper trading runtime.
 *
 * Responsibilities:
 * - LONG / SHORT unrealized P&L
 * - realized P&L
 * - weighted average entry price
 * - position increase calculations
 * - position reduction calculations
 * - fee calculation
 * - equity calculation
 * - drawdown calculation
 *
 * This module:
 * - does NOT place orders
 * - does NOT communicate with an exchange
 * - does NOT have execution authority
 * - does NOT enable live trading
 *
 * Financial truth must always be based on ACTUAL FILLS.
 * Requested order quantity is never treated as filled quantity.
 */

const finite = (
  value,
  fallback = 0,
) => {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
};

const positive = (
  value,
  fallback = 0,
) =>
  Math.max(
    0,
    finite(
      value,
      fallback,
    ),
  );

const upper = (
  value,
) =>
  String(
    value ?? "",
  )
    .trim()
    .toUpperCase();

const round = (
  value,
  decimals = 8,
) => {
  const number =
    finite(value);

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
};

/**
 * ============================================================
 * DIRECTION
 * ============================================================
 */

export function normalizePaperDirection(
  direction,
) {
  const normalized =
    upper(direction);

  if (
    normalized ===
      "LONG" ||
    normalized ===
      "BUY"
  ) {
    return "LONG";
  }

  if (
    normalized ===
      "SHORT" ||
    normalized ===
      "SELL"
  ) {
    return "SHORT";
  }

  return "FLAT";
}

/**
 * ============================================================
 * UNREALIZED P&L
 * ============================================================
 */

export function calculateCryptoUnrealizedPnl({
  direction,
  averageEntryPrice,
  currentPrice,
  quantity,
} = {}) {
  const normalizedDirection =
    normalizePaperDirection(
      direction,
    );

  const entry =
    positive(
      averageEntryPrice,
    );

  const current =
    positive(
      currentPrice,
    );

  const qty =
    positive(
      quantity,
    );

  if (
    normalizedDirection ===
      "FLAT" ||
    entry <= 0 ||
    current <= 0 ||
    qty <= 0
  ) {
    return 0;
  }

  if (
    normalizedDirection ===
    "LONG"
  ) {
    return round(
      (
        current -
        entry
      ) *
        qty,
    );
  }

  return round(
    (
      entry -
      current
    ) *
      qty,
  );
}

/**
 * ============================================================
 * REALIZED P&L
 * ============================================================
 *
 * IMPORTANT:
 * closingQuantity must be the ACTUAL filled closing quantity.
 */

export function calculateCryptoRealizedPnl({
  direction,
  averageEntryPrice,
  exitPrice,
  closingQuantity,
} = {}) {
  const normalizedDirection =
    normalizePaperDirection(
      direction,
    );

  const entry =
    positive(
      averageEntryPrice,
    );

  const exit =
    positive(
      exitPrice,
    );

  const qty =
    positive(
      closingQuantity,
    );

  if (
    normalizedDirection ===
      "FLAT" ||
    entry <= 0 ||
    exit <= 0 ||
    qty <= 0
  ) {
    return 0;
  }

  if (
    normalizedDirection ===
    "LONG"
  ) {
    return round(
      (
        exit -
        entry
      ) *
        qty,
    );
  }

  return round(
    (
      entry -
      exit
    ) *
      qty,
  );
}

/**
 * ============================================================
 * WEIGHTED AVERAGE ENTRY
 * ============================================================
 */

export function calculateWeightedAverageEntry({
  currentQuantity,
  currentAverageEntryPrice,
  addedQuantity,
  addedPrice,
} = {}) {
  const existingQty =
    positive(
      currentQuantity,
    );

  const existingPrice =
    positive(
      currentAverageEntryPrice,
    );

  const newQty =
    positive(
      addedQuantity,
    );

  const newPrice =
    positive(
      addedPrice,
    );

  if (
    newQty <= 0
  ) {
    return round(
      existingPrice,
    );
  }

  if (
    existingQty <= 0
  ) {
    return round(
      newPrice,
    );
  }

  const totalQuantity =
    existingQty +
    newQty;

  if (
    totalQuantity <= 0
  ) {
    return 0;
  }

  return round(
    (
      existingQty *
        existingPrice +
      newQty *
        newPrice
    ) /
      totalQuantity,
  );
}

/**
 * ============================================================
 * POSITION INCREASE
 * ============================================================
 */

export function calculatePositionIncrease({
  currentQuantity = 0,
  currentAverageEntryPrice = 0,
  filledQuantity = 0,
  fillPrice = 0,
} = {}) {
  const existingQuantity =
    positive(
      currentQuantity,
    );

  const actualFillQuantity =
    positive(
      filledQuantity,
    );

  const actualFillPrice =
    positive(
      fillPrice,
    );

  const quantity =
    round(
      existingQuantity +
        actualFillQuantity,
    );

  const averageEntryPrice =
    calculateWeightedAverageEntry({
      currentQuantity:
        existingQuantity,

      currentAverageEntryPrice,

      addedQuantity:
        actualFillQuantity,

      addedPrice:
        actualFillPrice,
    });

  return {
    quantity,
    averageEntryPrice,

    filledQuantity:
      round(
        actualFillQuantity,
      ),

    fillPrice:
      round(
        actualFillPrice,
      ),
  };
}

/**
 * ============================================================
 * POSITION REDUCTION
 * ============================================================
 *
 * Reduction is clamped to the position quantity.
 * A reduce-only fill can therefore NEVER flip a position.
 */

export function calculatePositionReduction({
  direction,
  currentQuantity = 0,
  averageEntryPrice = 0,
  filledQuantity = 0,
  fillPrice = 0,
} = {}) {
  const normalizedDirection =
    normalizePaperDirection(
      direction,
    );

  const existingQuantity =
    positive(
      currentQuantity,
    );

  const requestedFilledQuantity =
    positive(
      filledQuantity,
    );

  const actualClosingQuantity =
    Math.min(
      existingQuantity,
      requestedFilledQuantity,
    );

  const realizedPnl =
    calculateCryptoRealizedPnl({
      direction:
        normalizedDirection,

      averageEntryPrice,

      exitPrice:
        fillPrice,

      closingQuantity:
        actualClosingQuantity,
    });

  const remainingQuantity =
    round(
      Math.max(
        0,
        existingQuantity -
          actualClosingQuantity,
      ),
    );

  return {
    direction:
      remainingQuantity > 0
        ? normalizedDirection
        : "FLAT",

    closedQuantity:
      round(
        actualClosingQuantity,
      ),

    remainingQuantity,

    realizedPnl,

    fullyClosed:
      remainingQuantity <= 0,
  };
}

/**
 * ============================================================
 * TRADING FEES
 * ============================================================
 */

export function calculateTradingFee({
  quantity,
  price,
  feeRate = 0,
} = {}) {
  const qty =
    positive(
      quantity,
    );

  const fillPrice =
    positive(
      price,
    );

  const rate =
    positive(
      feeRate,
    );

  return round(
    qty *
      fillPrice *
      rate,
  );
}

/**
 * ============================================================
 * ACCOUNT EQUITY
 * ============================================================
 *
 * fundingPnl:
 *   positive = funding credit
 *   negative = funding debit
 *
 * realizedPnl is gross trading realized P&L.
 * Fees and funding remain separate accounting dimensions.
 */

export function calculatePaperAccountEquity({
  startingEquity = 0,
  realizedPnl = 0,
  unrealizedPnl = 0,
  tradingFees = 0,
  fundingPnl = 0,
} = {}) {
  return round(
    finite(
      startingEquity,
    ) +
      finite(
        realizedPnl,
      ) +
      finite(
        unrealizedPnl,
      ) -
      positive(
        tradingFees,
      ) +
      finite(
        fundingPnl,
      ),
  );
}

/**
 * ============================================================
 * DRAWDOWN
 * ============================================================
 */

export function calculatePaperDrawdown({
  equity = 0,
  peakEquity = 0,
} = {}) {
  const currentEquity =
    finite(
      equity,
    );

  const peak =
    Math.max(
      0,
      finite(
        peakEquity,
      ),
    );

  if (
    peak <= 0
  ) {
    return {
      drawdownUsd: 0,
      drawdownPercent: 0,
    };
  }

  const drawdownUsd =
    Math.max(
      0,
      peak -
        currentEquity,
    );

  const drawdownPercent =
    (
      drawdownUsd /
      peak
    ) *
    100;

  return {
    drawdownUsd:
      round(
        drawdownUsd,
      ),

    drawdownPercent:
      round(
        drawdownPercent,
        4,
      ),
  };
}

/**
 * ============================================================
 * RETURN CALCULATION
 * ============================================================
 */

export function calculatePaperAccountReturn({
  startingEquity = 0,
  equity = 0,
} = {}) {
  const starting =
    positive(
      startingEquity,
    );

  if (
    starting <= 0
  ) {
    return {
      returnUsd: 0,
      returnPercent: 0,
    };
  }

  const returnUsd =
    finite(equity) -
    starting;

  return {
    returnUsd:
      round(
        returnUsd,
      ),

    returnPercent:
      round(
        (
          returnUsd /
          starting
        ) *
          100,
        4,
      ),
  };
}

/**
 * ============================================================
 * WIN RATE
 * ============================================================
 */

export function calculatePaperWinRate({
  winningTrades = 0,
  closedTrades = 0,
} = {}) {
  const wins =
    positive(
      winningTrades,
    );

  const closed =
    positive(
      closedTrades,
    );

  if (
    closed <= 0
  ) {
    return 0;
  }

  return round(
    (
      wins /
      closed
    ) *
      100,
    4,
  );
}

/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default {
  normalizePaperDirection,

  calculateCryptoUnrealizedPnl,
  calculateCryptoRealizedPnl,

  calculateWeightedAverageEntry,

  calculatePositionIncrease,
  calculatePositionReduction,

  calculateTradingFee,

  calculatePaperAccountEquity,
  calculatePaperDrawdown,
  calculatePaperAccountReturn,
  calculatePaperWinRate,

  executionAuthority:
    false,

  liveExecutionEnabled:
    false,
};