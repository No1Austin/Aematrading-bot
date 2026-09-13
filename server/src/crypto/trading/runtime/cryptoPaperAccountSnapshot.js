/**
 * ============================================================
 * AEMA CRYPTO
 * PAPER ACCOUNT SNAPSHOT
 * Phase 5.25
 * ============================================================
 *
 * Read-only account snapshot adapter.
 *
 * Purpose:
 * - expose paper-account financial truth to the runtime
 * - provide portfolio-risk-compatible account metrics
 * - keep ledger internals encapsulated
 *
 * This module:
 * - does NOT mutate the ledger
 * - does NOT place orders
 * - does NOT call an exchange
 * - has NO execution authority
 */

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


function directionSign(
  direction,
) {
  const normalized =
    upper(direction);

  if (
    normalized === "LONG"
  ) {
    return 1;
  }

  if (
    normalized === "SHORT"
  ) {
    return -1;
  }

  return 0;
}


/**
 * ============================================================
 * BUILD ACCOUNT SNAPSHOT
 * ============================================================
 */

export function buildCryptoPaperAccountSnapshot({
  ledger,
  marketPrices = {},
} = {}) {
  if (!ledger) {
    throw new Error(
      "PAPER_ACCOUNT_LEDGER_REQUIRED",
    );
  }

  if (
    typeof ledger.getSnapshot !==
      "function" ||
    typeof ledger.getOpenPositions !==
      "function"
  ) {
    throw new Error(
      "INVALID_PAPER_ACCOUNT_LEDGER",
    );
  }

  /**
   * Keep marks current if market prices were supplied.
   */

  if (
    marketPrices &&
    typeof marketPrices ===
      "object" &&
    !Array.isArray(
      marketPrices,
    ) &&
    Object.keys(
      marketPrices,
    ).length > 0 &&
    typeof ledger.markPrices ===
      "function"
  ) {
    ledger.markPrices(
      marketPrices,
    );
  }

  const account =
    ledger.getSnapshot();

  const positions =
    ledger.getOpenPositions();

  let grossExposureUsd =
    0;

  let longExposureUsd =
    0;

  let shortExposureUsd =
    0;

  let netExposureUsd =
    0;

  let grossQuantity =
    0;


  const normalizedPositions =
    positions.map(
      position => {
        const symbol =
          upper(
            position?.symbol,
          );

        const direction =
          upper(
            position?.direction,
            "FLAT",
          );

        const quantity =
          Math.max(
            0,
            finite(
              position?.quantity,
            ),
          );

        const averageEntryPrice =
          finite(
            position
              ?.averageEntryPrice,
            null,
          );

        const currentPrice =
          finite(
            marketPrices?.[
              symbol
            ] ??
            position?.markPrice ??
            averageEntryPrice,
            null,
          );

        const notionalUsd =
          (
            quantity > 0 &&
            currentPrice !==
              null &&
            currentPrice > 0
          )
            ? quantity *
              currentPrice
            : 0;

        const sign =
          directionSign(
            direction,
          );

        grossExposureUsd +=
          Math.abs(
            notionalUsd,
          );

        grossQuantity +=
          quantity;

        if (
          direction ===
          "LONG"
        ) {
          longExposureUsd +=
            notionalUsd;
        }

        if (
          direction ===
          "SHORT"
        ) {
          shortExposureUsd +=
            notionalUsd;
        }

        netExposureUsd +=
          notionalUsd *
          sign;

        return {
          symbol,

          direction,

          quantity,

          averageEntryPrice,

          currentPrice,

          notionalUsd,

          unrealizedPnl:
            finite(
              position
                ?.unrealizedPnl,
            ),

          realizedPnl:
            finite(
              position
                ?.realizedPnl,
            ),

          tradingFees:
            finite(
              position
                ?.tradingFees,
            ),

          fundingPnl:
            finite(
              position
                ?.fundingPnl,
            ),

          openedAt:
            position
              ?.openedAt ??
            null,

          updatedAt:
            position
              ?.updatedAt ??
            null,
        };
      },
    );


  const equity =
    finite(
      account?.equity,
    );


  const grossExposureRatio =
    equity > 0
      ? grossExposureUsd /
        equity
      : 0;


  const netExposureRatio =
    equity > 0
      ? netExposureUsd /
        equity
      : 0;


  return {
    /**
     * ========================================================
     * ACCOUNT
     * ========================================================
     */

    startingEquity:
      finite(
        account
          ?.startingEquity,
      ),

    equity,

    peakEquity:
      finite(
        account
          ?.peakEquity,
      ),

    realizedPnl:
      finite(
        account
          ?.realizedPnl,
      ),

    unrealizedPnl:
      finite(
        account
          ?.unrealizedPnl,
      ),

    tradingFees:
      finite(
        account
          ?.tradingFees,
      ),

    fundingPnl:
      finite(
        account
          ?.fundingPnl,
      ),

    drawdownUsd:
      finite(
        account
          ?.drawdownUsd,
      ),

    drawdownPercent:
      finite(
        account
          ?.drawdownPercent,
      ),

    returnUsd:
      finite(
        account
          ?.returnUsd,
      ),

    returnPercent:
      finite(
        account
          ?.returnPercent,
      ),

    /**
     * ========================================================
     * PERFORMANCE
     * ========================================================
     */

    grossProfit:
      finite(
        account
          ?.grossProfit,
      ),

    grossLoss:
      finite(
        account
          ?.grossLoss,
      ),

    closedTrades:
      finite(
        account
          ?.closedTrades,
      ),

    winningTrades:
      finite(
        account
          ?.winningTrades,
      ),

    losingTrades:
      finite(
        account
          ?.losingTrades,
      ),

    breakevenTrades:
      finite(
        account
          ?.breakevenTrades,
      ),

    winRate:
      finite(
        account
          ?.winRate,
      ),

    /**
     * ========================================================
     * PORTFOLIO
     * ========================================================
     */

    openPositionCount:
      normalizedPositions
        .length,

    grossQuantity,

    grossExposureUsd,

    longExposureUsd,

    shortExposureUsd,

    netExposureUsd,

    grossExposureRatio,

    netExposureRatio,

    positions:
      clone(
        normalizedPositions,
      ),

    /**
     * ========================================================
     * METADATA
     * ========================================================
     */

    transactionCount:
      finite(
        account
          ?.transactionCount,
      ),

    startedAt:
      account
        ?.startedAt ??
      null,

    updatedAt:
      account
        ?.updatedAt ??
      null,

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


/**
 * ============================================================
 * PORTFOLIO-RISK CONTEXT
 * ============================================================
 *
 * This gives Phase 5.12 / later runtime layers a clean
 * account-aware context.
 */

export function buildCryptoPaperRiskContext({
  ledger,
  marketPrices = {},
  marketStress = false,
} = {}) {
  const snapshot =
    buildCryptoPaperAccountSnapshot({
      ledger,
      marketPrices,
    });

  return {
    accountEquity:
      snapshot.equity,

    startingEquity:
      snapshot
        .startingEquity,

    peakEquity:
      snapshot.peakEquity,

    realizedPnl:
      snapshot.realizedPnl,

    unrealizedPnl:
      snapshot.unrealizedPnl,

    drawdownUsd:
      snapshot.drawdownUsd,

    drawdownPercent:
      snapshot
        .drawdownPercent,

    grossExposureUsd:
      snapshot
        .grossExposureUsd,

    netExposureUsd:
      snapshot
        .netExposureUsd,

    grossExposureRatio:
      snapshot
        .grossExposureRatio,

    netExposureRatio:
      snapshot
        .netExposureRatio,

    marketStress:
      Boolean(
        marketStress,
      ),

    positions:
      clone(
        snapshot.positions,
      ),

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default
  buildCryptoPaperAccountSnapshot;