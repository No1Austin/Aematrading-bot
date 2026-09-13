/**
 * ============================================================
 * AEMA CRYPTO
 * PAPER ACCOUNT LEDGER
 * Phase 5.25
 * ============================================================
 *
 * Stateful accounting authority for paper trading.
 *
 * Responsibilities:
 * - starting equity
 * - realized P&L
 * - unrealized P&L
 * - trading fees
 * - funding P&L
 * - current equity
 * - peak equity
 * - drawdown
 * - open paper positions
 * - closed trade statistics
 * - duplicate fill protection
 * - transaction history
 *
 * IMPORTANT
 * ---------
 * Financial truth is based on ACTUAL FILLS.
 *
 * Requested quantity is never treated as filled quantity.
 *
 * This ledger:
 * - does NOT place orders
 * - does NOT call an exchange
 * - does NOT enable live trading
 * - has NO execution authority
 */

import {
  normalizePaperDirection,
  calculateCryptoUnrealizedPnl,
  calculatePositionIncrease,
  calculatePositionReduction,
  calculateTradingFee,
  calculatePaperAccountEquity,
  calculatePaperDrawdown,
  calculatePaperAccountReturn,
  calculatePaperWinRate,
} from "./cryptoPaperPnLManager.js";


const finite = (
  value,
  fallback = 0,
) => {
  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
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
  decimals = 8,
) => {
  const n =
    finite(value);

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        n +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
};


function clone(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


function nowIso() {
  return new Date()
    .toISOString();
}


function normalizeSymbol(
  symbol,
) {
  return upper(symbol);
}


function createEmptyPosition(
  symbol,
) {
  return {
    symbol:
      normalizeSymbol(symbol),

    direction:
      "FLAT",

    quantity:
      0,

    averageEntryPrice:
      null,

    markPrice:
      null,

    unrealizedPnl:
      0,

    realizedPnl:
      0,

    tradingFees:
      0,

    fundingPnl:
      0,

    openedAt:
      null,

    updatedAt:
      null,
  };
}


/**
 * ============================================================
 * ACCOUNT FACTORY
 * ============================================================
 */

export function createCryptoPaperAccountLedger({
  startingEquity = 10_000,
  defaultFeeRate = 0,
} = {}) {
  const initialEquity =
    positive(
      startingEquity,
      10_000,
    );

  if (
    initialEquity <= 0
  ) {
    throw new Error(
      "STARTING_EQUITY_MUST_BE_POSITIVE",
    );
  }

  const state = {
    startingEquity:
      initialEquity,

    realizedPnl:
      0,

    unrealizedPnl:
      0,

    tradingFees:
      0,

    fundingPnl:
      0,

    equity:
      initialEquity,

    peakEquity:
      initialEquity,

    drawdownUsd:
      0,

    drawdownPercent:
      0,

    grossProfit:
      0,

    grossLoss:
      0,

    closedTrades:
      0,

    winningTrades:
      0,

    losingTrades:
      0,

    breakevenTrades:
      0,

    positions:
      new Map(),

    processedFillIds:
      new Set(),

    processedFundingIds:
      new Set(),

    transactions:
      [],

    startedAt:
      nowIso(),

    updatedAt:
      nowIso(),

    defaultFeeRate:
      positive(
        defaultFeeRate,
        0,
      ),
  };


  /**
   * ==========================================================
   * INTERNAL HELPERS
   * ==========================================================
   */

  function getOrCreatePosition(
    symbol,
  ) {
    const key =
      normalizeSymbol(
        symbol,
      );

    if (!key) {
      throw new Error(
        "SYMBOL_REQUIRED",
      );
    }

    if (
      !state.positions.has(
        key,
      )
    ) {
      state.positions.set(
        key,
        createEmptyPosition(
          key,
        ),
      );
    }

    return state.positions.get(
      key,
    );
  }


  function addTransaction(
    transaction,
  ) {
    state.transactions.push({
      ...clone(transaction),

      timestamp:
        transaction
          ?.timestamp ??
        nowIso(),
    });
  }


  function recalculateUnrealized() {
    let total =
      0;

    for (
      const position
      of state.positions.values()
    ) {
      if (
        position.direction ===
          "FLAT" ||
        position.quantity <= 0
      ) {
        position.unrealizedPnl =
          0;

        continue;
      }

      const unrealized =
        calculateCryptoUnrealizedPnl({
          direction:
            position.direction,

          averageEntryPrice:
            position.averageEntryPrice,

          currentPrice:
            position.markPrice ??
            position.averageEntryPrice,

          quantity:
            position.quantity,
        });

      position.unrealizedPnl =
        unrealized;

      total +=
        unrealized;
    }

    state.unrealizedPnl =
      round(total);
  }


  function recalculateAccount() {
    recalculateUnrealized();

    state.equity =
      calculatePaperAccountEquity({
        startingEquity:
          state.startingEquity,

        realizedPnl:
          state.realizedPnl,

        unrealizedPnl:
          state.unrealizedPnl,

        tradingFees:
          state.tradingFees,

        fundingPnl:
          state.fundingPnl,
      });

    if (
      state.equity >
      state.peakEquity
    ) {
      state.peakEquity =
        state.equity;
    }

    const drawdown =
      calculatePaperDrawdown({
        equity:
          state.equity,

        peakEquity:
          state.peakEquity,
      });

    state.drawdownUsd =
      drawdown.drawdownUsd;

    state.drawdownPercent =
      drawdown.drawdownPercent;

    state.updatedAt =
      nowIso();
  }


  function registerClosedTrade(
    realizedPnl,
  ) {
    const pnl =
      finite(realizedPnl);

    state.closedTrades +=
      1;

    if (
      pnl > 0
    ) {
      state.winningTrades +=
        1;

      state.grossProfit =
        round(
          state.grossProfit +
          pnl,
        );
    } else if (
      pnl < 0
    ) {
      state.losingTrades +=
        1;

      state.grossLoss =
        round(
          state.grossLoss +
          Math.abs(pnl),
        );
    } else {
      state.breakevenTrades +=
        1;
    }
  }


  /**
   * ==========================================================
   * APPLY ACTUAL FILL
   * ==========================================================
   *
   * Supported intents:
   *
   * OPEN
   * INCREASE
   * REDUCE
   * CLOSE
   * EMERGENCY_CLOSE
   *
   * filledQuantity MUST represent actual fill quantity.
   */

  function applyFill({
    fillId,

    symbol,

    intent,

    direction,

    side,

    filledQuantity,

    fillPrice,

    fee = null,

    feeRate = null,

    timestamp = null,
  } = {}) {
    const id =
      String(
        fillId ?? "",
      ).trim();

    if (!id) {
      return {
        approved:
          false,

        status:
          "FILL_REJECTED",

        blocker:
          "FILL_ID_REQUIRED",

        executionAuthority:
          false,
      };
    }

    if (
      state.processedFillIds.has(
        id,
      )
    ) {
      return {
        approved:
          false,

        status:
          "DUPLICATE_FILL",

        blocker:
          "DUPLICATE_FILL_ID",

        fillId:
          id,

        executionAuthority:
          false,
      };
    }

    const key =
      normalizeSymbol(
        symbol,
      );

    if (!key) {
      return {
        approved:
          false,

        status:
          "FILL_REJECTED",

        blocker:
          "SYMBOL_REQUIRED",

        executionAuthority:
          false,
      };
    }

    const qty =
      positive(
        filledQuantity,
      );

    const price =
      positive(
        fillPrice,
      );

    if (
      qty <= 0 ||
      price <= 0
    ) {
      return {
        approved:
          false,

        status:
          "FILL_REJECTED",

        blocker:
          "INVALID_ACTUAL_FILL",

        executionAuthority:
          false,
      };
    }

    const normalizedIntent =
      upper(
        intent,
      );

    const position =
      getOrCreatePosition(
        key,
      );

    const existingDirection =
      normalizePaperDirection(
        position.direction,
      );

    const requestedDirection =
      normalizePaperDirection(
        direction,
      );

    const normalizedSide =
      upper(
        side,
      );


    /**
     * ========================================================
     * OPEN / INCREASE
     * ========================================================
     */

    if (
      normalizedIntent ===
        "OPEN" ||
      normalizedIntent ===
        "INCREASE"
    ) {
      const newDirection =
        requestedDirection !==
          "FLAT"
          ? requestedDirection
          : (
              normalizedSide ===
                "BUY"
                ? "LONG"
                : normalizedSide ===
                    "SELL"
                  ? "SHORT"
                  : "FLAT"
            );

      if (
        newDirection ===
        "FLAT"
      ) {
        return {
          approved:
            false,

          status:
            "FILL_REJECTED",

          blocker:
            "OPEN_DIRECTION_REQUIRED",

          executionAuthority:
            false,
        };
      }

      /**
       * No direct flip inside the ledger.
       *
       * A LONG must be closed before a SHORT may be opened
       * and vice versa.
       */

      if (
        existingDirection !==
          "FLAT" &&
        existingDirection !==
          newDirection &&
        position.quantity > 0
      ) {
        return {
          approved:
            false,

          status:
            "FILL_REJECTED",

          blocker:
            "DIRECT_POSITION_FLIP_BLOCKED",

          executionAuthority:
            false,
        };
      }

      const increased =
        calculatePositionIncrease({
          currentQuantity:
            position.quantity,

          currentAverageEntryPrice:
            position
              .averageEntryPrice ??
            0,

          filledQuantity:
            qty,

          fillPrice:
            price,
        });

      position.direction =
        newDirection;

      position.quantity =
        increased.quantity;

      position.averageEntryPrice =
        increased
          .averageEntryPrice;

      position.markPrice =
        price;

      position.openedAt =
        position.openedAt ??
        timestamp ??
        nowIso();

      position.updatedAt =
        timestamp ??
        nowIso();
    }


    /**
     * ========================================================
     * REDUCE / CLOSE
     * ========================================================
     */

    else if (
      normalizedIntent ===
        "REDUCE" ||
      normalizedIntent ===
        "CLOSE" ||
      normalizedIntent ===
        "EMERGENCY_CLOSE"
    ) {
      if (
        existingDirection ===
          "FLAT" ||
        position.quantity <= 0
      ) {
        return {
          approved:
            false,

          status:
            "FILL_REJECTED",

          blocker:
            "NO_OPEN_POSITION_TO_REDUCE",

          executionAuthority:
            false,
        };
      }

      const reduction =
        calculatePositionReduction({
          direction:
            existingDirection,

          currentQuantity:
            position.quantity,

          averageEntryPrice:
            position
              .averageEntryPrice,

          filledQuantity:
            qty,

          fillPrice:
            price,
        });

      state.realizedPnl =
        round(
          state.realizedPnl +
          reduction.realizedPnl,
        );

      position.realizedPnl =
        round(
          position.realizedPnl +
          reduction.realizedPnl,
        );

      position.quantity =
        reduction
          .remainingQuantity;

      position.markPrice =
        price;

      position.updatedAt =
        timestamp ??
        nowIso();

      /**
       * Only count a closed trade when the position is
       * fully closed.
       */

      if (
        reduction.fullyClosed
      ) {
        registerClosedTrade(
          position.realizedPnl,
        );

        position.direction =
          "FLAT";

        position.quantity =
          0;

        position.averageEntryPrice =
          null;

        position.markPrice =
          null;

        position.unrealizedPnl =
          0;

        position.openedAt =
          null;

        /**
         * Position-level realized P&L can reset after its
         * closed trade has been registered because account
         * realized P&L remains preserved globally.
         */
        position.realizedPnl =
          0;
      }
    }


    else {
      return {
        approved:
          false,

        status:
          "FILL_REJECTED",

        blocker:
          "UNSUPPORTED_FILL_INTENT",

        executionAuthority:
          false,
      };
    }


    /**
     * ========================================================
     * FEE
     * ========================================================
     */

    let actualFee;

    if (
      fee !== null &&
      fee !== undefined
    ) {
      actualFee =
        positive(
          fee,
        );
    } else {
      actualFee =
        calculateTradingFee({
          quantity:
            qty,

          price,

          feeRate:
            feeRate ??
            state
              .defaultFeeRate,
        });
    }

    state.tradingFees =
      round(
        state.tradingFees +
        actualFee,
      );

    position.tradingFees =
      round(
        position.tradingFees +
        actualFee,
      );


    /**
     * Only now is the fill considered processed.
     */

    state.processedFillIds.add(
      id,
    );


    addTransaction({
      type:
        "FILL",

      fillId:
        id,

      symbol:
        key,

      intent:
        normalizedIntent,

      direction:
        requestedDirection,

      side:
        normalizedSide,

      filledQuantity:
        qty,

      fillPrice:
        price,

      fee:
        actualFee,

      timestamp:
        timestamp ??
        nowIso(),
    });


    recalculateAccount();


    return {
      approved:
        true,

      status:
        "FILL_APPLIED",

      fillId:
        id,

      position:
        clone(position),

      account:
        getSnapshot(),

      executionAuthority:
        false,
    };
  }


  /**
   * ==========================================================
   * MARK TO MARKET
   * ==========================================================
   */

  function markPrice({
    symbol,
    price,
    timestamp = null,
  } = {}) {
    const key =
      normalizeSymbol(
        symbol,
      );

    const mark =
      positive(
        price,
      );

    if (
      !key ||
      mark <= 0
    ) {
      return {
        approved:
          false,

        status:
          "MARK_REJECTED",

        executionAuthority:
          false,
      };
    }

    const position =
      getOrCreatePosition(
        key,
      );

    position.markPrice =
      mark;

    position.updatedAt =
      timestamp ??
      nowIso();

    recalculateAccount();

    return {
      approved:
        true,

      status:
        "MARK_UPDATED",

      symbol:
        key,

      price:
        mark,

      unrealizedPnl:
        position
          .unrealizedPnl,

      equity:
        state.equity,

      executionAuthority:
        false,
    };
  }


  function markPrices(
    priceMap = {},
  ) {
    for (
      const [
        symbol,
        price,
      ]
      of Object.entries(
        priceMap,
      )
    ) {
      const key =
        normalizeSymbol(
          symbol,
        );

      const position =
        getOrCreatePosition(
          key,
        );

      const mark =
        positive(
          price,
        );

      if (
        mark > 0
      ) {
        position.markPrice =
          mark;

        position.updatedAt =
          nowIso();
      }
    }

    recalculateAccount();

    return getSnapshot();
  }


  /**
   * ==========================================================
   * FUNDING
   * ==========================================================
   *
   * amount:
   *
   * positive = funding credit
   * negative = funding debit
   */

  function applyFunding({
    fundingId,

    symbol = null,

    amount,

    timestamp = null,
  } = {}) {
    const id =
      String(
        fundingId ?? "",
      ).trim();

    if (!id) {
      return {
        approved:
          false,

        status:
          "FUNDING_REJECTED",

        blocker:
          "FUNDING_ID_REQUIRED",

        executionAuthority:
          false,
      };
    }

    if (
      state.processedFundingIds
        .has(id)
    ) {
      return {
        approved:
          false,

        status:
          "DUPLICATE_FUNDING",

        blocker:
          "DUPLICATE_FUNDING_ID",

        executionAuthority:
          false,
      };
    }

    const fundingAmount =
      finite(
        amount,
      );

    state.fundingPnl =
      round(
        state.fundingPnl +
        fundingAmount,
      );

    if (symbol) {
      const position =
        getOrCreatePosition(
          symbol,
        );

      position.fundingPnl =
        round(
          position.fundingPnl +
          fundingAmount,
        );
    }

    state.processedFundingIds
      .add(id);

    addTransaction({
      type:
        "FUNDING",

      fundingId:
        id,

      symbol:
        symbol
          ? normalizeSymbol(
              symbol,
            )
          : null,

      amount:
        fundingAmount,

      timestamp:
        timestamp ??
        nowIso(),
    });

    recalculateAccount();

    return {
      approved:
        true,

      status:
        "FUNDING_APPLIED",

      fundingId:
        id,

      fundingPnl:
        state.fundingPnl,

      equity:
        state.equity,

      executionAuthority:
        false,
    };
  }


  /**
   * ==========================================================
   * MANUAL FEE
   * ==========================================================
   */

  function applyFee({
    feeId,

    symbol = null,

    amount,

    timestamp = null,
  } = {}) {
    const id =
      String(
        feeId ?? "",
      ).trim();

    const feeAmount =
      positive(
        amount,
      );

    if (
      !id ||
      feeAmount <= 0
    ) {
      return {
        approved:
          false,

        status:
          "FEE_REJECTED",

        executionAuthority:
          false,
      };
    }

    /**
     * Fee IDs share the fill-id namespace so the same
     * accounting event cannot accidentally be applied twice.
     */

    const ledgerKey =
      `FEE:${id}`;

    if (
      state.processedFillIds.has(
        ledgerKey,
      )
    ) {
      return {
        approved:
          false,

        status:
          "DUPLICATE_FEE",

        executionAuthority:
          false,
      };
    }

    state.processedFillIds.add(
      ledgerKey,
    );

    state.tradingFees =
      round(
        state.tradingFees +
        feeAmount,
      );

    if (symbol) {
      const position =
        getOrCreatePosition(
          symbol,
        );

      position.tradingFees =
        round(
          position.tradingFees +
          feeAmount,
        );
    }

    addTransaction({
      type:
        "FEE",

      feeId:
        id,

      symbol:
        symbol
          ? normalizeSymbol(
              symbol,
            )
          : null,

      amount:
        feeAmount,

      timestamp:
        timestamp ??
        nowIso(),
    });

    recalculateAccount();

    return {
      approved:
        true,

      status:
        "FEE_APPLIED",

      tradingFees:
        state.tradingFees,

      equity:
        state.equity,

      executionAuthority:
        false,
    };
  }


  /**
   * ==========================================================
   * POSITION READ
   * ==========================================================
   */

  function getPosition(
    symbol,
  ) {
    const position =
      getOrCreatePosition(
        symbol,
      );

    return clone(
      position,
    );
  }


  function getOpenPositions() {
    return [
      ...state.positions
        .values(),
    ]
      .filter(
        position =>
          position.direction !==
            "FLAT" &&
          position.quantity >
            0,
      )
      .map(clone);
  }


  /**
   * ==========================================================
   * ACCOUNT SNAPSHOT
   * ==========================================================
   */

  function getSnapshot() {
    const accountReturn =
      calculatePaperAccountReturn({
        startingEquity:
          state.startingEquity,

        equity:
          state.equity,
      });

    const winRate =
      calculatePaperWinRate({
        winningTrades:
          state.winningTrades,

        closedTrades:
          state.closedTrades,
      });

    return {
      startingEquity:
        state.startingEquity,

      equity:
        state.equity,

      peakEquity:
        state.peakEquity,

      realizedPnl:
        state.realizedPnl,

      unrealizedPnl:
        state.unrealizedPnl,

      tradingFees:
        state.tradingFees,

      fundingPnl:
        state.fundingPnl,

      drawdownUsd:
        state.drawdownUsd,

      drawdownPercent:
        state.drawdownPercent,

      returnUsd:
        accountReturn
          .returnUsd,

      returnPercent:
        accountReturn
          .returnPercent,

      grossProfit:
        state.grossProfit,

      grossLoss:
        state.grossLoss,

      closedTrades:
        state.closedTrades,

      winningTrades:
        state.winningTrades,

      losingTrades:
        state.losingTrades,

      breakevenTrades:
        state.breakevenTrades,

      winRate,

      openPositions:
        getOpenPositions(),

      transactionCount:
        state.transactions
          .length,

      startedAt:
        state.startedAt,

      updatedAt:
        state.updatedAt,

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  function getTransactions() {
    return clone(
      state.transactions,
    );
  }

function exportPersistentState() {
  return {
    version: 1,

    startingEquity:
      state.startingEquity,

    realizedPnl:
      state.realizedPnl,

    unrealizedPnl:
      state.unrealizedPnl,

    tradingFees:
      state.tradingFees,

    fundingPnl:
      state.fundingPnl,

    equity:
      state.equity,

    peakEquity:
      state.peakEquity,

    drawdownUsd:
      state.drawdownUsd,

    drawdownPercent:
      state.drawdownPercent,

    grossProfit:
      state.grossProfit,

    grossLoss:
      state.grossLoss,

    closedTrades:
      state.closedTrades,

    winningTrades:
      state.winningTrades,

    losingTrades:
      state.losingTrades,

    breakevenTrades:
      state.breakevenTrades,

    positions: [
      ...state.positions.entries(),
    ].map(
      ([
        symbol,
        position,
      ]) => ({
        symbol,
        position:
          clone(position),
      }),
    ),

    processedFillIds: [
      ...state.processedFillIds,
    ],

    processedFundingIds: [
      ...state.processedFundingIds,
    ],

    transactions:
      clone(
        state.transactions,
      ),

    startedAt:
      state.startedAt,

    updatedAt:
      state.updatedAt,

    defaultFeeRate:
      state.defaultFeeRate,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


function restorePersistentState(
  snapshot,
) {
  if (
    !snapshot ||
    typeof snapshot !==
      "object"
  ) {
    return {
      approved: false,

      status:
        "LEDGER_RESTORE_REJECTED",

      blocker:
        "INVALID_LEDGER_SNAPSHOT",

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  if (
    snapshot.version !== 1
  ) {
    return {
      approved: false,

      status:
        "LEDGER_RESTORE_REJECTED",

      blocker:
        "UNSUPPORTED_LEDGER_SNAPSHOT_VERSION",

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  const restoredStartingEquity =
    positive(
      snapshot
        ?.startingEquity,
      0,
    );

  if (
    restoredStartingEquity <=
    0
  ) {
    return {
      approved: false,

      status:
        "LEDGER_RESTORE_REJECTED",

      blocker:
        "INVALID_STARTING_EQUITY",

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  state.startingEquity =
    restoredStartingEquity;

  state.realizedPnl =
    finite(
      snapshot
        ?.realizedPnl,
      0,
    );

  state.unrealizedPnl =
    finite(
      snapshot
        ?.unrealizedPnl,
      0,
    );

  state.tradingFees =
    positive(
      snapshot
        ?.tradingFees,
      0,
    );

  state.fundingPnl =
    finite(
      snapshot
        ?.fundingPnl,
      0,
    );

  state.equity =
    finite(
      snapshot
        ?.equity,
      restoredStartingEquity,
    );

  state.peakEquity =
    positive(
      snapshot
        ?.peakEquity,
      state.equity,
    );

  state.drawdownUsd =
    positive(
      snapshot
        ?.drawdownUsd,
      0,
    );

  state.drawdownPercent =
    positive(
      snapshot
        ?.drawdownPercent,
      0,
    );

  state.grossProfit =
    positive(
      snapshot
        ?.grossProfit,
      0,
    );

  state.grossLoss =
    positive(
      snapshot
        ?.grossLoss,
      0,
    );

  state.closedTrades =
    positive(
      snapshot
        ?.closedTrades,
      0,
    );

  state.winningTrades =
    positive(
      snapshot
        ?.winningTrades,
      0,
    );

  state.losingTrades =
    positive(
      snapshot
        ?.losingTrades,
      0,
    );

  state.breakevenTrades =
    positive(
      snapshot
        ?.breakevenTrades,
      0,
    );

  state.positions =
    new Map();

  for (
    const item
    of (
      snapshot?.positions ??
      []
    )
  ) {
    const symbol =
      normalizeSymbol(
        item?.symbol ??
        item
          ?.position
          ?.symbol,
      );

    if (!symbol) {
      continue;
    }

    state.positions.set(
      symbol,
      clone(
        item?.position ??
        createEmptyPosition(
          symbol,
        ),
      ),
    );
  }

  state.processedFillIds =
    new Set(
      (
        snapshot
          ?.processedFillIds ??
        []
      ).map(
        value =>
          String(value),
      ),
    );

  state.processedFundingIds =
    new Set(
      (
        snapshot
          ?.processedFundingIds ??
        []
      ).map(
        value =>
          String(value),
      ),
    );

  state.transactions =
    clone(
      snapshot
        ?.transactions ??
      [],
    );

  state.startedAt =
    snapshot
      ?.startedAt ??
    nowIso();

  state.updatedAt =
    snapshot
      ?.updatedAt ??
    nowIso();

  state.defaultFeeRate =
    positive(
      snapshot
        ?.defaultFeeRate,
      state.defaultFeeRate,
    );

  /**
   * Recalculate rather than trusting persisted
   * unrealized/equity/drawdown blindly.
   */

  recalculateAccount();

  return {
    approved: true,

    status:
      "LEDGER_STATE_RESTORED",

    snapshot:
      getSnapshot(),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

  /**
   * ==========================================================
   * PUBLIC API
   * ==========================================================
   */

  recalculateAccount();

  return {
    applyFill,

    applyFunding,

    applyFee,

    markPrice,

    markPrices,

    getPosition,

    getOpenPositions,

    getSnapshot,

    getTransactions,
    exportPersistentState,

restorePersistentState,

    paperExecution:
      true,

    liveExecution:
      false,

    liveExecutionEnabled:
      false,

    executionAuthority:
      false,
  };
}


export default
  createCryptoPaperAccountLedger;