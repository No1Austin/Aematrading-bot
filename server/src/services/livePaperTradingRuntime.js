// server/src/services/livePaperTradingRuntime.js

import {
  createMarketSnapshot,
} from "../data/marketDataHub.js";

import {
  DEFAULT_TRADING_ACCOUNT_ID,
  getOrCreateTradingSession,
} from "./tradingSessionRegistry.js";

/**
 * ============================================================
 * LIVE PAPER TRADING RUNTIME
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Bridge:
 *
 *   LiveEngineRunner
 *        ↓
 *   completed analysis
 *        ↓
 *   registered PaperTradingSession
 *        ↓
 *   paper execution / position management
 *
 * IMPORTANT
 * ---------
 *
 * This service does NOT perform analysis.
 *
 * It consumes the analysis that has already been produced by
 * LiveEngineRunner.
 *
 * This prevents duplicate analysis runs.
 *
 * PAPER ONLY.
 */

/**
 * Prevent overlapping position-management calls when multiple
 * live events arrive quickly.
 *
 * Keyed by trading account so this remains compatible with the
 * future SaaS account model.
 */
const accountLocks =
  new Map();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function normalizeSymbol(
  value,
) {
  const symbol =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return symbol ||
    null;
}

function finitePositiveNumber(
  value,
) {
  const number =
    Number(
      value,
    );

  return (
    Number.isFinite(number) &&
    number > 0
  )
    ? number
    : null;
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(
    error,
  );
}

/**
 * ============================================================
 * MARKET PRICE
 * ============================================================
 *
 * Price priority:
 *
 * 1. Fresh quote midpoint
 * 2. Latest live bar close
 *
 * Historical-only candles are NOT sufficient for opening or
 * managing a live paper position.
 */

function getExecutableMarketPrice(
  symbol,
) {
  const snapshot =
    createMarketSnapshot(
      symbol,
    );

  if (!snapshot) {
    return {
      approved:
        false,

      price:
        null,

      source:
        null,

      snapshot:
        null,

      errors: [
        "No MarketDataHub snapshot exists for the symbol.",
      ],
    };
  }

  /**
   * ----------------------------------------------------------
   * FRESH QUOTE
   * ----------------------------------------------------------
   */

  if (
    snapshot.quoteFresh ===
    true
  ) {
    const bid =
      finitePositiveNumber(
        snapshot
          ?.latestQuote
          ?.bid,
      );

    const ask =
      finitePositiveNumber(
        snapshot
          ?.latestQuote
          ?.ask,
      );

    if (
      bid !== null &&
      ask !== null &&
      ask >= bid
    ) {
      return {
        approved:
          true,

        price:
          (
            bid +
            ask
          ) / 2,

        source:
          "LIVE_QUOTE_MIDPOINT",

        snapshot,

        errors:
          [],
      };
    }
  }

  /**
   * ----------------------------------------------------------
   * LIVE BAR FALLBACK
   * ----------------------------------------------------------
   *
   * Only use latestBar when the hub confirms that at least one
   * live bar has been received.
   */

  if (
    Number(
      snapshot.liveBarCount ??
      0,
    ) > 0
  ) {
    const close =
      finitePositiveNumber(
        snapshot
          ?.latestBar
          ?.close,
      );

    if (
      close !== null
    ) {
      return {
        approved:
          true,

        price:
          close,

        source:
          "LIVE_BAR_CLOSE",

        snapshot,

        errors:
          [],
      };
    }
  }

  return {
    approved:
      false,

    price:
      null,

    source:
      null,

    snapshot,

    errors: [
      "No fresh live quote or live bar is available for paper execution.",
    ],
  };
}

/**
 * ============================================================
 * ACCOUNT LOCK
 * ============================================================
 */

async function withAccountLock(
  accountId,
  callback,
) {
  const key =
    String(
      accountId,
    );

  const previous =
    accountLocks.get(
      key,
    ) ??
    Promise.resolve();

  const operation =
    previous
      .catch(
        () => {},
      )
      .then(
        callback,
      );

  accountLocks.set(
    key,
    operation,
  );

  try {
    return await operation;
  } finally {
    if (
      accountLocks.get(
        key,
      ) ===
      operation
    ) {
      accountLocks.delete(
        key,
      );
    }
  }
}

/**
 * ============================================================
 * PROCESS LIVE DECISION
 * ============================================================
 */

export async function processLivePaperDecision({
  symbol,

  analysis,

  accountId =
    DEFAULT_TRADING_ACCOUNT_ID,

  orderType =
    "MARKET",

  slippagePercent =
    null,
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol ??
      analysis
        ?.symbol ??
      analysis
        ?.finalDecision
        ?.symbol,
    );

  if (!normalizedSymbol) {
    return {
      approved:
        false,

      service:
        "LIVE_PAPER_TRADING_RUNTIME",

      status:
        "INVALID_REQUEST",

      action:
        "NONE",

      symbol:
        null,

      accountId,

      errors: [
        "A trading symbol is required.",
      ],

      warnings:
        [],

      timestamp:
        now(),
    };
  }

  if (
    !analysis ||
    typeof analysis !==
      "object"
  ) {
    return {
      approved:
        false,

      service:
        "LIVE_PAPER_TRADING_RUNTIME",

      status:
        "INVALID_REQUEST",

      action:
        "NONE",

      symbol:
        normalizedSymbol,

      accountId,

      errors: [
        "A completed live analysis is required.",
      ],

      warnings:
        [],

      timestamp:
        now(),
    };
  }

  return withAccountLock(
    accountId,

    async () => {
      try {
        const session =
          getOrCreateTradingSession(
            accountId,
          );

        const state =
          session.getState();

        /**
         * ====================================================
         * EXISTING POSITION
         * ====================================================
         *
         * A session with an open position must manage that
         * position instead of trying to open another one.
         */

        if (
          state
            ?.hasOpenPosition ===
          true
        ) {
          const openPosition =
            state
              ?.openPosition ??
            null;

          /**
           * The current PaperTradingSession manages one active
           * position.
           *
           * Only market data for that position's symbol should
           * update it.
           */

          const positionSymbol =
            normalizeSymbol(
              openPosition
                ?.symbol,
            );

          if (
            positionSymbol &&
            positionSymbol !==
              normalizedSymbol
          ) {
            return {
              approved:
                true,

              service:
                "LIVE_PAPER_TRADING_RUNTIME",

              status:
                "POSITION_ALREADY_OPEN",

              action:
                "IGNORED_OTHER_SYMBOL",

              symbol:
                normalizedSymbol,

              accountId,

              position:
                openPosition,

              warnings: [
                `An existing ${positionSymbol} position is being managed by this session.`,
              ],

              errors:
                [],

              timestamp:
                now(),
            };
          }

          const market =
            getExecutableMarketPrice(
              positionSymbol ??
              normalizedSymbol,
            );

          if (
            market
              .approved !==
            true
          ) {
            return {
              approved:
                false,

              service:
                "LIVE_PAPER_TRADING_RUNTIME",

              status:
                "MARKET_DATA_UNAVAILABLE",

              action:
                "POSITION_UPDATE_SKIPPED",

              symbol:
                positionSymbol ??
                normalizedSymbol,

              accountId,

              position:
                openPosition,

              warnings: [
                "The existing position was not modified because current live market data was unavailable.",
              ],

              errors:
                market.errors,

              timestamp:
                now(),
            };
          }

          const intelligence = {
            technical:
              analysis
                ?.results
                ?.technical ??
              null,

            macro:
              analysis
                ?.results
                ?.macro ??
              null,

            marketRegime:
              analysis
                ?.results
                ?.marketRegime ??
              null,

            events:
              analysis
                ?.results
                ?.events ??
              null,

            company:
              analysis
                ?.results
                ?.company ??
              null,

            country:
              analysis
                ?.results
                ?.country ??
              null,

            social:
              analysis
                ?.results
                ?.social ??
              null,

            historical:
              analysis
                ?.results
                ?.historical ??
              null,

            liquidity:
              analysis
                ?.results
                ?.liquidity ??
              null,

            consensus:
              analysis
                ?.results
                ?.consensus ??
              null,
          };

          const update =
            await session
              .updateOpenPosition({
                currentPrice:
                  market.price,

                slippagePercent,

                intelligence,

                monitorThesis:
                  true,

                asOfTimestamp:
                  analysis
                    ?.finalDecision
                    ?.timestamp ??
                  now(),
              });

          return {
            approved:
              update
                ?.approved ===
              true,

            service:
              "LIVE_PAPER_TRADING_RUNTIME",

            status:
              update
                ?.status ??
              "POSITION_UPDATED",

            action:
              update
                ?.status ===
                "POSITION_CLOSED"
                ? "POSITION_CLOSED"
                : "POSITION_MANAGED",

            symbol:
              positionSymbol ??
              normalizedSymbol,

            accountId,

            marketPrice:
              market.price,

            marketPriceSource:
              market.source,

            update,

            position:
              session
                .getState()
                ?.openPosition ??
              null,

            warnings:
              update
                ?.warnings ??
              [],

            errors:
              update
                ?.errors ??
              [],

            timestamp:
              now(),
          };
        }

        /**
         * ====================================================
         * NO OPEN POSITION
         * ====================================================
         *
         * Only an explicitly execution-approved analysis may
         * reach the paper broker.
         */

        const canProceed =
          analysis
            ?.finalDecision
            ?.canProceedToPaperExecution ===
            true;

        const riskCanExecute =
          analysis
            ?.results
            ?.riskApproval
            ?.canExecute ===
            true;

        if (
          !canProceed ||
          !riskCanExecute
        ) {
          return {
            approved:
              true,

            service:
              "LIVE_PAPER_TRADING_RUNTIME",

            status:
              "NO_TRADE",

            action:
              "NONE",

            symbol:
              normalizedSymbol,

            accountId,

            finalDecision:
              analysis
                ?.finalDecision ??
              null,

            warnings:
              [],

            errors:
              [],

            timestamp:
              now(),
          };
        }

        /**
         * ====================================================
         * REAL MARKET PRICE
         * ====================================================
         */

        const market =
          getExecutableMarketPrice(
            normalizedSymbol,
          );

        if (
          market
            .approved !==
          true
        ) {
          return {
            approved:
              false,

            service:
              "LIVE_PAPER_TRADING_RUNTIME",

            status:
              "MARKET_DATA_UNAVAILABLE",

            action:
              "ENTRY_SKIPPED",

            symbol:
              normalizedSymbol,

            accountId,

            warnings: [
              "Trade analysis approved entry, but execution was skipped because no current live market price was available.",
            ],

            errors:
              market.errors,

            timestamp:
              now(),
          };
        }

        /**
         * ====================================================
         * OPEN PAPER POSITION
         * ====================================================
         *
         * Pass the SAME analysis produced by LiveEngineRunner.
         *
         * Do not call session.analyze() here.
         */

        const execution =
          session
            .openApprovedTrade({
              analysis,

              currentPrice:
                market.price,

              orderType,

              slippagePercent,

              metadata: {
                source:
                  "LIVE_ENGINE_RUNNER",

                accountId,

                marketPriceSource:
                  market.source,

                analysisTimestamp:
                  analysis
                    ?.finalDecision
                    ?.timestamp ??
                  null,

                runtimeTimestamp:
                  now(),
              },
            });

        return {
          approved:
            execution
              ?.approved ===
            true,

          service:
            "LIVE_PAPER_TRADING_RUNTIME",

          status:
            execution
              ?.status ??
            "UNKNOWN",

          action:
            execution
              ?.position
              ? "POSITION_OPENED"
              : "ENTRY_NOT_EXECUTED",

          symbol:
            normalizedSymbol,

          accountId,

          marketPrice:
            market.price,

          marketPriceSource:
            market.source,

          execution,

          position:
            session
              .getState()
              ?.openPosition ??
            null,

          warnings:
            execution
              ?.warnings ??
            [],

          errors:
            execution
              ?.errors ??
            [],

          timestamp:
            now(),
        };
      } catch (error) {
        return {
          approved:
            false,

          service:
            "LIVE_PAPER_TRADING_RUNTIME",

          status:
            "ERROR",

          action:
            "NONE",

          symbol:
            normalizedSymbol,

          accountId,

          warnings: [
            "Live paper trading runtime failed safely.",
          ],

          errors: [
            safeErrorMessage(
              error,
            ),
          ],

          timestamp:
            now(),
        };
      }
    },
  );
}

export default
  processLivePaperDecision;