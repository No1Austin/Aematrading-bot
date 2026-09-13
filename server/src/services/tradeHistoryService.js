// server/src/services/tradeHistoryService.js

import {
  DEFAULT_TRADING_ACCOUNT_ID,
  getTradingSession,
  getTradingSessionHistory,
} from "./tradingSessionRegistry.js";

/**
 * ============================================================
 * TRADE HISTORY SERVICE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Expose completed bot trades through a stable SaaS contract.
 *
 * This service:
 *
 * - reads real session history
 * - does NOT fabricate trades
 * - does NOT mutate history
 * - does NOT place orders
 *
 * Future:
 *
 * authenticated user
 *      ↓
 * workspace
 *      ↓
 * trading account
 *      ↓
 * persisted trade history
 */

export const TRADE_HISTORY_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    NO_HISTORY:
      "NO_HISTORY",

    NO_SESSION:
      "NO_SESSION",

    ERROR:
      "ERROR",
  });

function now() {
  return new Date()
    .toISOString();
}

function normalizeString(
  value,
) {
  const result =
    String(
      value ?? "",
    )
      .trim();

  return result || null;
}

function finiteNumber(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function normalizeSide(
  value,
) {
  const side =
    normalizeString(
      value,
    )
      ?.toUpperCase();

  return side ??
    null;
}

function normalizeStatus(
  value,
) {
  return (
    normalizeString(
      value,
    )
      ?.toUpperCase() ??
    null
  );
}

function durationMs(
  openedAt,
  closedAt,
) {
  const start =
    new Date(
      openedAt,
    ).getTime();

  const end =
    new Date(
      closedAt,
    ).getTime();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start
  ) {
    return null;
  }

  return end - start;
}

function normalizeHistoryRecord(
  record,
) {
  if (
    !record ||
    typeof record !==
      "object"
  ) {
    return null;
  }

  const entryPrice =
    finiteNumber(
      record.entryPrice ??
      record.entry?.price,
    );

  const exitPrice =
    finiteNumber(
      record.exitPrice ??
      record.exit?.price ??
      record.closePrice,
    );

  const shares =
    finiteNumber(
      record.shares ??
      record.quantity ??
      record.entry?.shares,
    );

  const realizedPnL =
    finiteNumber(
      record.realizedPnL ??
      record.pnl ??
      record.performance
        ?.realizedPnL,
    );

  const returnPercent =
    finiteNumber(
      record.returnPercent ??
      record.pnlPercent ??
      record.performance
        ?.returnPercent ??
      record.performance
        ?.realizedPnLPercent,
    );

  const rMultiple =
    finiteNumber(
      record.rMultiple ??
      record.resultR ??
      record.performance
        ?.rMultiple ??
      record.performance
        ?.finalR,
    );

  const entryScore =
    finiteNumber(
      record.intelligenceScore ??
      record.entryScore ??
      record.analysis
        ?.finalDecision
        ?.preferredScore,
    );

  const openedAt =
    normalizeString(
      record.openedAt ??
      record.entryTimestamp ??
      record.entry?.timestamp,
    );

  const closedAt =
    normalizeString(
      record.closedAt ??
      record.exitTimestamp ??
      record.exit?.timestamp,
    );

  const result =
    realizedPnL === null
      ? null
      : realizedPnL > 0
        ? "WIN"
        : realizedPnL < 0
          ? "LOSS"
          : "BREAKEVEN";

  return {
    id:
      normalizeString(
        record.id ??
        record.tradeId ??
        record.positionId,
      ),

    positionId:
      normalizeString(
        record.positionId ??
        record.id,
      ),

    orderId:
      normalizeString(
        record.orderId,
      ),

    symbol:
      normalizeString(
        record.symbol,
      )
        ?.toUpperCase() ??
      null,

    side:
      normalizeSide(
        record.side,
      ),

    status:
      normalizeStatus(
        record.status ??
        "CLOSED",
      ),

    result,

    entry: {
      price:
        entryPrice,

      shares,

      timestamp:
        openedAt,

      score:
        entryScore,

      stopPrice:
        finiteNumber(
          record.stopPrice ??
          record.entry?.stopPrice,
        ),

      targetPrice:
        finiteNumber(
          record.targetPrice ??
          record.entry?.targetPrice,
        ),
    },

    exit: {
      price:
        exitPrice,

      timestamp:
        closedAt,

      reason:
        normalizeString(
          record.exitReason ??
          record.closeReason ??
          record.exit?.reason,
        ),
    },

    performance: {
      realizedPnL,

      returnPercent,

      rMultiple,

      peakR:
        finiteNumber(
          record.peakR ??
          record.performance
            ?.peakR,
        ),

      bestPrice:
        finiteNumber(
          record.bestPrice ??
          record.performance
            ?.bestPrice,
        ),
    },

    durationMs:
      durationMs(
        openedAt,
        closedAt,
      ),

    intelligence: {
      technical:
        record.intelligence
          ?.technical ??
        record.analysis
          ?.results
          ?.technical ??
        null,

      macro:
        record.intelligence
          ?.macro ??
        record.analysis
          ?.results
          ?.macro ??
        null,

      marketRegime:
        record.intelligence
          ?.marketRegime ??
        record.analysis
          ?.results
          ?.marketRegime ??
        null,

      institutional:
        record.intelligence
          ?.institutional ??
        record.analysis
          ?.results
          ?.institutionalPosition ??
        null,

      events:
        record.intelligence
          ?.events ??
        record.analysis
          ?.results
          ?.events ??
        null,

      social:
        record.intelligence
          ?.social ??
        record.analysis
          ?.results
          ?.social ??
        null,

      historical:
        record.intelligence
          ?.historical ??
        record.analysis
          ?.results
          ?.historical ??
        null,

      liquidity:
        record.intelligence
          ?.liquidity ??
        record.analysis
          ?.results
          ?.liquidity ??
        null,

      consensus:
        record.intelligence
          ?.consensus ??
        record.analysis
          ?.results
          ?.consensus ??
        null,
    },

    fingerprint:
      record.tradeFingerprint ??
      record.entryFingerprint ??
      record.fingerprint ??
      null,

    learning:
      record.learning ??
      record.historicalIntelligence ??
      null,

    metadata:
      (
        record.metadata &&
        typeof record.metadata ===
          "object"
      )
        ? record.metadata
        : {},

    raw:
      record,
  };
}

/**
 * ============================================================
 * SUMMARY
 * ============================================================
 */

function buildSummary(
  trades,
) {
  const closedTrades =
    trades.filter(
      trade =>
        trade
          ?.status ===
        "CLOSED" ||
        trade
          ?.result !==
        null,
    );

  const wins =
    closedTrades.filter(
      trade =>
        trade.result ===
        "WIN",
    );

  const losses =
    closedTrades.filter(
      trade =>
        trade.result ===
        "LOSS",
    );

  const realizedPnL =
    closedTrades.reduce(
      (
        total,
        trade,
      ) =>
        total +
        (
          finiteNumber(
            trade
              ?.performance
              ?.realizedPnL,
          ) ??
          0
        ),
      0,
    );

  const rValues =
    closedTrades
      .map(
        trade =>
          finiteNumber(
            trade
              ?.performance
              ?.rMultiple,
          ),
      )
      .filter(
        value =>
          value !== null,
      );

  const averageR =
    rValues.length >
    0
      ? (
          rValues.reduce(
            (
              total,
              value,
            ) =>
              total +
              value,
            0,
          ) /
          rValues.length
        )
      : null;

  const grossProfit =
    wins.reduce(
      (
        total,
        trade,
      ) =>
        total +
        Math.max(
          0,
          finiteNumber(
            trade
              ?.performance
              ?.realizedPnL,
          ) ??
          0,
        ),
      0,
    );

  const grossLoss =
    Math.abs(
      losses.reduce(
        (
          total,
          trade,
        ) =>
          total +
          Math.min(
            0,
            finiteNumber(
              trade
                ?.performance
                ?.realizedPnL,
            ) ??
            0,
          ),
        0,
      ),
    );

  return {
    totalTrades:
      closedTrades.length,

    wins:
      wins.length,

    losses:
      losses.length,

    breakeven:
      closedTrades.filter(
        trade =>
          trade.result ===
          "BREAKEVEN",
      ).length,

    winRate:
      closedTrades.length >
      0
        ? (
            wins.length /
            closedTrades.length
          ) *
          100
        : null,

    realizedPnL,

    averageR,

    profitFactor:
      grossLoss > 0
        ? grossProfit /
          grossLoss
        : grossProfit > 0
          ? null
          : null,

    longTrades:
      closedTrades.filter(
        trade =>
          trade.side ===
          "LONG",
      ).length,

    shortTrades:
      closedTrades.filter(
        trade =>
          trade.side ===
          "SHORT",
      ).length,
  };
}

/**
 * ============================================================
 * MAIN
 * ============================================================
 */

export function getTradeHistory({
  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,

  limit = 100,
} = {}) {
  try {
    const session =
      getTradingSession(
        accountId,
      );

    if (!session) {
      return {
        success: true,
        approved: true,
        service:
          "TRADE_HISTORY",
        status:
          TRADE_HISTORY_STATUS
            .NO_SESSION,
        accountId,
        summary:
          buildSummary([]),
        trades: [],
        warnings: [
          "No active trading session exists for this account.",
        ],
        errors: [],
        timestamp:
          now(),
      };
    }

    const source =
      getTradingSessionHistory(
        accountId,
      );

    const normalized =
      (
        Array.isArray(
          source,
        )
          ? source
          : []
      )
        .map(
          normalizeHistoryRecord,
        )
        .filter(Boolean)
        .sort(
          (
            a,
            b,
          ) =>
            new Date(
              b
                ?.exit
                ?.timestamp ??
              0,
            ).getTime() -
            new Date(
              a
                ?.exit
                ?.timestamp ??
              0,
            ).getTime(),
        );

    const safeLimit =
      Math.max(
        1,
        Math.min(
          1000,
          Number.isFinite(
            Number(limit),
          )
            ? Math.floor(
                Number(limit),
              )
            : 100,
        ),
      );

    const trades =
      normalized.slice(
        0,
        safeLimit,
      );

    return {
      success: true,
      approved: true,
      service:
        "TRADE_HISTORY",

      status:
        normalized.length >
        0
          ? TRADE_HISTORY_STATUS
              .COMPLETE
          : TRADE_HISTORY_STATUS
              .NO_HISTORY,

      accountId,

      summary:
        buildSummary(
          normalized,
        ),

      totalCount:
        normalized.length,

      returnedCount:
        trades.length,

      trades,

      warnings: [],

      errors: [],

      timestamp:
        now(),
    };
  } catch (error) {
    return {
      success: false,
      approved: false,
      service:
        "TRADE_HISTORY",
      status:
        TRADE_HISTORY_STATUS
          .ERROR,
      accountId,
      summary:
        buildSummary([]),
      trades: [],
      warnings: [
        "Trade history could not be loaded safely.",
      ],
      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
      timestamp:
        now(),
    };
  }
}

export default
  getTradeHistory;