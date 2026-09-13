// server/src/execution/paperTradingSession.js

import runTradingAnalysis from "../orchestration/engineOrchestrator.js";

import {
  executeApprovedPaperTrade,
  processPaperPositionUpdate,
} from "./paperExecutionCoordinator.js";

import createTradeHistoryStore from "../history/tradeHistoryStore.js";

import executeManualPaperEntryOverride from "./manualEntryOverrideCoordinator.js";

/**
 * ============================================================
 * PAPER TRADING SESSION
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Own one isolated paper-trading session:
 *
 * - account state
 * - one open position
 * - shared trade history store
 * - analysis history
 * - execution lifecycle
 *
 * IMPORTANT
 * ---------
 *
 * This module does NOT connect to a live broker.
 *
 * It does not replace:
 *
 * - engineOrchestrator.js
 * - paperExecutionCoordinator.js
 * - positionManager.js
 * - tradeHistoryStore.js
 *
 * It only coordinates those modules using shared state.
 */

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const PAPER_SESSION_STATUS =
  Object.freeze({
    READY:
      "READY",

    ANALYZING:
      "ANALYZING",

    TRADE_READY:
      "TRADE_READY",

    POSITION_OPEN:
      "POSITION_OPEN",

    POSITION_UPDATED:
      "POSITION_UPDATED",

    POSITION_CLOSED:
      "POSITION_CLOSED",

    BLOCKED:
      "BLOCKED",

    ERROR:
      "ERROR",
  });

/**
 * ============================================================
 * DEFAULT ACCOUNT
 * ============================================================
 */

export const DEFAULT_PAPER_ACCOUNT =
  Object.freeze({
    balance:
      10_000,

    equity:
      10_000,

    buyingPower:
      10_000,

    dailyPnL:
      0,

    openPositions: [],

    portfolioExposure:
      0,

    tradingBlocked:
      false,

    accountBlocked:
      false,

    shortingEnabled:
      true,

    status:
      "ACTIVE",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function isFiniteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

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

function clone(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof structuredClone ===
    "function"
  ) {
    return structuredClone(
      value,
    );
  }

  return JSON.parse(
    JSON.stringify(
      value,
    ),
  );
}

function mergeAccount(
  account,
) {
  return {
    ...DEFAULT_PAPER_ACCOUNT,
    ...(
      account ??
      {}
    ),

    openPositions:
      Array.isArray(
        account
          ?.openPositions,
      )
        ? [
            ...account
              .openPositions,
          ]
        : [],
  };
}

/**
 * ============================================================
 * ACCOUNT HELPERS
 * ============================================================
 */

function calculatePositionExposure(
  position,
) {
  if (
    !position ||
    !positiveNumber(
      position.shares,
    )
  ) {
    return 0;
  }

  const price =
    Number(
      position.currentPrice ??
      position.entryPrice ??
      0,
    );

  if (
    !positiveNumber(
      price,
    )
  ) {
    return 0;
  }

  return (
    Number(
      position.shares,
    ) *
    price
  );
}

function applyOpenPositionToAccount({
  account,
  position,
}) {
  const next = {
    ...account,
  };

  next.openPositions =
    position
      ? [
          position,
        ]
      : [];

  next.portfolioExposure =
    position
      ? calculatePositionExposure(
          position,
        )
      : 0;

  return next;
}

function applyClosedPositionToAccount({
  account,
  position,
}) {
  const realizedPnL =
    isFiniteNumber(
      position
        ?.realizedPnL,
    )
      ? Number(
          position
            .realizedPnL,
        )
      : 0;

  const nextBalance =
    Number(
      account.balance ??
      0,
    ) +
    realizedPnL;

  return {
    ...account,

    balance:
      nextBalance,

    equity:
      nextBalance,

    buyingPower:
      nextBalance,

    dailyPnL:
      Number(
        account.dailyPnL ??
        0,
      ) +
      realizedPnL,

    openPositions: [],

    portfolioExposure:
      0,
  };
}

/**
 * ============================================================
 * FACTORY
 * ============================================================
 */

export function createPaperTradingSession({
  account = null,

  historyStore = null,

  analysisRunner =
    runTradingAnalysis,

  executionCoordinator = {
    executeApprovedPaperTrade,
    processPaperPositionUpdate,
  },

  manualOverrideCoordinator =
    executeManualPaperEntryOverride,
} = {}) {
  const tradeHistoryStore =
    historyStore ??
    createTradeHistoryStore();

  let accountState =
    mergeAccount(
      account,
    );

  let openPosition =
    accountState
      .openPositions[0] ??
    null;

  let lastAnalysis =
    null;

  let lastExecution =
    null;

  let lastUpdate =
    null;

  let sessionStatus =
    openPosition
      ? PAPER_SESSION_STATUS
          .POSITION_OPEN
      : PAPER_SESSION_STATUS
          .READY;

  let sessionError =
    null;

  const analysisLog = [];

  /**
   * ========================================================
   * GET STATE
   * ========================================================
   */

  function getState() {
    return clone({
      status:
        sessionStatus,

      account:
        accountState,

      openPosition,

      hasOpenPosition:
        Boolean(
          openPosition,
        ),

      lastAnalysis,

      lastExecution,

      lastUpdate,

      historyCount:
        Number(
          tradeHistoryStore
            ?.size ??
          0,
        ),

      analysisCount:
        analysisLog.length,

      error:
        sessionError,

      timestamp:
        now(),
    });
  }

  /**
   * ========================================================
   * GET HISTORY
   * ========================================================
   */

  function getHistory() {
    if (
      tradeHistoryStore &&
      typeof tradeHistoryStore
        .exportRecords ===
        "function"
    ) {
      return tradeHistoryStore
        .exportRecords();
    }

    return [];
  }

  /**
   * ========================================================
   * ANALYZE
   * ========================================================
   *
   * Automatically inject the session's completed trade history
   * into the orchestrator.
   */

  async function analyze({
    symbol,

    asOfTimestamp =
      now(),

    ...analysisInput
  } = {}) {
    let botTradeHistory = [];

    try {
      sessionStatus =
        PAPER_SESSION_STATUS
          .ANALYZING;

      sessionError =
        null;

      /**
       * Keep the two history channels separate:
       *
       * - historicalRecords = market historical analogue records
       * - botTradeHistory   = this bot/session's own completed trades
       *
       * The session owns botTradeHistory. Market historical records are
       * supplied by the caller and must never be replaced with bot trades.
       */
      const historicalRecords =
        Array.isArray(
          analysisInput
            ?.historicalRecords,
        )
          ? analysisInput
              .historicalRecords
          : [];

      const botHistoryQuery =
        tradeHistoryStore &&
        typeof tradeHistoryStore
          .queryTrades ===
          "function"
          ? tradeHistoryStore
              .queryTrades({
                beforeTimestamp:
                  asOfTimestamp,
              })
          : null;

      botTradeHistory =
        botHistoryQuery
          ?.approved === true &&
        Array.isArray(
          botHistoryQuery
            ?.records,
        )
          ? botHistoryQuery.records
          : [];

      const result =
        await analysisRunner({
          ...analysisInput,

          symbol,

          account:
            clone(
              accountState,
            ),

          historicalRecords,

          botTradeHistory,

          asOfTimestamp,
        });

      lastAnalysis =
        result;

      analysisLog.push({
        symbol,

        asOfTimestamp,

        approved:
          result
            ?.approved ===
          true,

        finalDecision:
          clone(
            result
              ?.finalDecision ??
            null,
          ),

        timestamp:
          now(),
      });

      /**
       * Analysis completion and execution permission are deliberately
       * separate contracts. A completed analysis may correctly return
       * NO_TRADE / blocked risk while the session analysis itself remains
       * approved.
       */
      if (
        result?.approved !==
        true
      ) {
        sessionStatus =
          PAPER_SESSION_STATUS
            .BLOCKED;

        return {
          approved: false,

          engine:
            "PAPER_TRADING_SESSION",

          status:
            PAPER_SESSION_STATUS
              .BLOCKED,

          analysis:
            result,

          canOpenTrade:
            false,

          // Backward-compatible field: this historically represented the
          // session's completed-trade learning history count.
          historyRecordsUsed:
            botTradeHistory.length,

          botTradeHistoryRecordsUsed:
            botTradeHistory.length,

          marketHistoricalRecordsUsed:
            historicalRecords.length,

          hasOpenPosition:
            Boolean(
              openPosition,
            ),

          errors:
            result
              ?.errors ??
            [
              "Trading analysis did not complete successfully.",
            ],

          warnings:
            result
              ?.warnings ??
            [],

          timestamp:
            now(),
        };
      }

      const canOpenTrade =
        (
          !openPosition &&
          result
            ?.finalDecision
            ?.canProceedToPaperExecution ===
            true &&
          result
            ?.results
            ?.riskApproval
            ?.canExecute ===
            true
        );

      sessionStatus =
        canOpenTrade
          ? PAPER_SESSION_STATUS
              .TRADE_READY
          : openPosition
            ? PAPER_SESSION_STATUS
                .POSITION_OPEN
            : PAPER_SESSION_STATUS
                .READY;

      return {
        approved: true,

        engine:
          "PAPER_TRADING_SESSION",

        status:
          sessionStatus,

        analysis:
          result,

        canOpenTrade,

        // Preserve the existing public contract while keeping the actual
        // market analogue and bot-trade inputs separate internally.
        historyRecordsUsed:
          botTradeHistory.length,

        botTradeHistoryRecordsUsed:
          botTradeHistory.length,

        marketHistoricalRecordsUsed:
          historicalRecords.length,

        hasOpenPosition:
          Boolean(
            openPosition,
          ),

        warnings:
          result
            ?.warnings ??
          [],

        errors:
          result
            ?.errors ??
          [],

        timestamp:
          now(),
      };
    } catch (error) {
      sessionError =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      sessionStatus =
        PAPER_SESSION_STATUS
          .ERROR;

      return {
        approved: false,

        engine:
          "PAPER_TRADING_SESSION",

        status:
          PAPER_SESSION_STATUS
            .ERROR,

        analysis: null,

        canOpenTrade:
          false,

        historyRecordsUsed:
          botTradeHistory.length,

        botTradeHistoryRecordsUsed:
          botTradeHistory.length,

        hasOpenPosition:
          Boolean(
            openPosition,
          ),

        errors: [
          sessionError,
        ],

        warnings: [
          "Paper trading analysis failed safely.",
        ],

        timestamp:
          now(),
      };
    }
  }

  /**
   * ========================================================
   * OPEN APPROVED TRADE
   * ========================================================
   */

  function openApprovedTrade({
    analysis =
      lastAnalysis,

    currentPrice,

    orderType,

    limitPrice = null,

    slippagePercent = null,

    metadata = {},
  } = {}) {
    try {
      sessionError =
        null;

      if (openPosition) {
        sessionStatus =
          PAPER_SESSION_STATUS
            .BLOCKED;

        return {
          approved: false,

          engine:
            "PAPER_TRADING_SESSION",

          status:
            PAPER_SESSION_STATUS
              .BLOCKED,

          position:
            openPosition,

          errors: [
            "A paper position is already open in this session.",
          ],

          warnings: [],

          timestamp:
            now(),
        };
      }

      if (!analysis) {
        return {
          approved: false,

          engine:
            "PAPER_TRADING_SESSION",

          status:
            PAPER_SESSION_STATUS
              .BLOCKED,

          position: null,

          errors: [
            "A completed trading analysis is required before opening a trade.",
          ],

          warnings: [],

          timestamp:
            now(),
        };
      }

      const finalDecision =
        analysis
          ?.finalDecision;

      const riskApproval =
        analysis
          ?.results
          ?.riskApproval;

      if (
        finalDecision
          ?.canProceedToPaperExecution !==
          true ||
        riskApproval
          ?.canExecute !==
          true
      ) {
        sessionStatus =
          PAPER_SESSION_STATUS
            .BLOCKED;

        return {
          approved: false,

          engine:
            "PAPER_TRADING_SESSION",

          status:
            PAPER_SESSION_STATUS
              .BLOCKED,

          position: null,

          errors: [
            "Trading analysis has not approved paper execution.",
          ],

          warnings: [],

          timestamp:
            now(),
        };
      }

      const symbol =
        finalDecision
          ?.symbol ??
        analysis
          ?.symbol ??
        null;

      const tradeFingerprint =
        analysis
          ?.results
          ?.tradeFingerprint ??
        null;

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

      const result =
        executionCoordinator
          .executeApprovedPaperTrade({
            symbol,

            riskApproval,

            currentPrice,

            orderType,

            limitPrice,

            slippagePercent,

            intelligence,

            metadata: {
              ...metadata,

              timestamp:
                metadata
                  ?.timestamp ??
                analysis
                  ?.finalDecision
                  ?.timestamp ??
                now(),

              tradeFingerprint,

              entryFingerprint:
                tradeFingerprint
                  ?.fingerprint ??
                null,
            },
          });

      lastExecution =
        result;

      if (
        result
          ?.approved !== true ||
        !result
          ?.position
      ) {
        sessionStatus =
          result
            ?.status ===
            "ORDER_PENDING"
            ? PAPER_SESSION_STATUS
                .READY
            : PAPER_SESSION_STATUS
                .BLOCKED;

        return {
          ...result,

          sessionStatus,
        };
      }

      openPosition =
        result.position;

      accountState =
        applyOpenPositionToAccount({
          account:
            accountState,

          position:
            openPosition,
        });

      sessionStatus =
        PAPER_SESSION_STATUS
          .POSITION_OPEN;

      return {
        ...result,

        sessionStatus,

        account:
          clone(
            accountState,
          ),
      };
    } catch (error) {
      sessionError =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      sessionStatus =
        PAPER_SESSION_STATUS
          .ERROR;

      return {
        approved: false,

        engine:
          "PAPER_TRADING_SESSION",

        status:
          PAPER_SESSION_STATUS
            .ERROR,

        position:
          openPosition,

        errors: [
          sessionError,
        ],

        warnings: [
          "Paper trade opening failed safely.",
        ],

        timestamp:
          now(),
      };
    }
  }

  /**
   * ========================================================
   * OPEN MANUAL OVERRIDE TRADE
   * ========================================================
   *
   * A human may explicitly authorize ONE below-threshold entry.
   * The override does not change autonomous thresholds or bypass
   * the normal risk/safety layers. After entry, the ordinary bot
   * position-management lifecycle takes over.
   */

  function openManualOverrideTrade({
    analysis = lastAnalysis,
    currentPrice,
    orderType,
    limitPrice = null,
    slippagePercent = null,
    metadata = {},
    configOverrides = {},
  } = {}) {
    try {
      sessionError = null;

      if (openPosition) {
        sessionStatus =
          PAPER_SESSION_STATUS.BLOCKED;

        return {
          approved: false,
          engine: "PAPER_TRADING_SESSION",
          status: PAPER_SESSION_STATUS.BLOCKED,
          position: openPosition,
          errors: [
            "A paper position is already open in this session.",
          ],
          warnings: [],
          timestamp: now(),
        };
      }

      if (
        !analysis ||
        typeof analysis !== "object"
      ) {
        sessionStatus =
          PAPER_SESSION_STATUS.BLOCKED;

        return {
          approved: false,
          engine: "PAPER_TRADING_SESSION",
          status: PAPER_SESSION_STATUS.BLOCKED,
          position: null,
          errors: [
            "A completed trading analysis is required before a manual entry override can be considered.",
          ],
          warnings: [],
          timestamp: now(),
        };
      }

      if (
        typeof manualOverrideCoordinator !==
        "function"
      ) {
        throw new Error(
          "Manual override coordinator is unavailable.",
        );
      }

      const result =
        manualOverrideCoordinator({
          analysis,
          account: clone(accountState),
          currentPrice,
          orderType,
          limitPrice,
          slippagePercent,
          metadata: {
            ...metadata,
            timestamp:
              metadata?.timestamp ??
              analysis?.finalDecision?.timestamp ??
              now(),
            sessionEntryMode:
              "HUMAN_OVERRIDE",
          },
          configOverrides,
        });

      lastExecution = result;

      if (
        result?.approved !== true ||
        result?.executed !== true ||
        !result?.position
      ) {
        sessionStatus =
          PAPER_SESSION_STATUS.BLOCKED;

        return {
          ...result,
          sessionStatus,
          account: clone(accountState),
        };
      }

      /*
       * Override authority ends after entry. From here onward this
       * position is managed through updateOpenPosition() and the
       * same processPaperPositionUpdate() path as autonomous trades.
       */
      openPosition = {
        ...result.position,
        entryMode:
          result.position?.entryMode ??
          "HUMAN_OVERRIDE",
        managementMode: "BOT",
        managedByBot: true,
      };

      accountState =
        applyOpenPositionToAccount({
          account: accountState,
          position: openPosition,
        });

      sessionStatus =
        PAPER_SESSION_STATUS.POSITION_OPEN;

      return {
        ...result,
        position: clone(openPosition),
        sessionStatus,
        account: clone(accountState),
      };
    } catch (error) {
      sessionError =
        error instanceof Error
          ? error.message
          : String(error);

      sessionStatus =
        PAPER_SESSION_STATUS.ERROR;

      return {
        approved: false,
        engine: "PAPER_TRADING_SESSION",
        status: PAPER_SESSION_STATUS.ERROR,
        executed: false,
        position: openPosition,
        errors: [sessionError],
        warnings: [
          "Manual paper-entry override failed safely at session level.",
        ],
        timestamp: now(),
      };
    }
  }

  /**
   * ========================================================
   * UPDATE OPEN POSITION
   * ========================================================
   */

  async function updateOpenPosition({
    currentPrice,

    atr = null,

    slippagePercent = null,

    intelligence = null,

    monitorThesis = false,

    asOfTimestamp =
      now(),
  } = {}) {
    try {
      sessionError =
        null;

      if (!openPosition) {
        sessionStatus =
          PAPER_SESSION_STATUS
            .BLOCKED;

        return {
          approved: false,

          engine:
            "PAPER_TRADING_SESSION",

          status:
            PAPER_SESSION_STATUS
              .BLOCKED,

          position: null,

          errors: [
            "No paper position is currently open.",
          ],

          warnings: [],

          timestamp:
            now(),
        };
      }

      const result =
        await executionCoordinator
          .processPaperPositionUpdate({
            position:
              openPosition,

            currentPrice,

            atr,

            slippagePercent,

            intelligence,

            monitorThesis,

            asOfTimestamp,

            historyStore:
              tradeHistoryStore,
          });

      lastUpdate =
        result;

      if (
        result
          ?.approved !== true
      ) {
        sessionStatus =
          PAPER_SESSION_STATUS
            .ERROR;

        return {
          ...result,

          sessionStatus,
        };
      }

      if (
        result.status ===
        "POSITION_CLOSED"
      ) {
        const closedPosition =
          result.position;

        accountState =
          applyClosedPositionToAccount({
            account:
              accountState,

            position:
              closedPosition,
          });

        openPosition =
          null;

        sessionStatus =
          PAPER_SESSION_STATUS
            .POSITION_CLOSED;

        return {
          ...result,

          sessionStatus,

          account:
            clone(
              accountState,
            ),

          historyCount:
            Number(
              tradeHistoryStore
                ?.size ??
              0,
            ),
        };
      }

      openPosition =
        result.position;

      accountState =
        applyOpenPositionToAccount({
          account:
            accountState,

          position:
            openPosition,
        });

      sessionStatus =
        PAPER_SESSION_STATUS
          .POSITION_UPDATED;

      return {
        ...result,

        sessionStatus,

        account:
          clone(
            accountState,
          ),
      };
    } catch (error) {
      sessionError =
        error instanceof Error
          ? error.message
          : String(
              error,
            );

      sessionStatus =
        PAPER_SESSION_STATUS
          .ERROR;

      return {
        approved: false,

        engine:
          "PAPER_TRADING_SESSION",

        status:
          PAPER_SESSION_STATUS
            .ERROR,

        position:
          openPosition,

        errors: [
          sessionError,
        ],

        warnings: [
          "Paper position update failed safely at session level.",
        ],

        timestamp:
          now(),
      };
    }
  }

  /**
   * ========================================================
   * RESET SESSION STATE
   * ========================================================
   *
   * Trade history is preserved by default.
   */

  function reset({
    preserveHistory =
      true,

    resetAccount =
      true,
  } = {}) {
    openPosition =
      null;

    lastAnalysis =
      null;

    lastExecution =
      null;

    lastUpdate =
      null;

    sessionError =
      null;

    analysisLog
      .splice(
        0,
        analysisLog.length,
      );

    if (
      resetAccount
    ) {
      accountState =
        mergeAccount(
          account,
        );

      accountState
        .openPositions = [];

      accountState
        .portfolioExposure = 0;
    }

    if (
      !preserveHistory &&
      tradeHistoryStore &&
      typeof tradeHistoryStore
        .clear ===
        "function"
    ) {
      tradeHistoryStore
        .clear();
    }

    sessionStatus =
      PAPER_SESSION_STATUS
        .READY;

    return getState();
  }

  /**
   * ========================================================
   * PUBLIC API
   * ========================================================
   */

  return {
    analyze,

    openApprovedTrade,

    openManualOverrideTrade,

    updateOpenPosition,

    getState,

    getHistory,

    reset,

    historyStore:
      tradeHistoryStore,

    get account() {
      return clone(
        accountState,
      );
    },

    get position() {
      return clone(
        openPosition,
      );
    },

    get status() {
      return sessionStatus;
    },

    get historySize() {
      return Number(
        tradeHistoryStore
          ?.size ??
        0,
      );
    },
  };
}

export default
  createPaperTradingSession;
