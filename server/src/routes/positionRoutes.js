// server/src/routes/positionRoutes.js

import express from "express";

import {
  DEFAULT_TRADING_ACCOUNT_ID,
  getTradingSession,
  getTradingSessionState,
} from "../services/tradingSessionRegistry.js";

import {
  buildLivePositionsResponse,
  normalizeLivePosition,
} from "../services/livePositionsService.js";

const router =
  express.Router();

/**
 * ============================================================
 * POSITION ROUTES
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Read-only API for positions currently owned by the trading
 * runtime.
 *
 * IMPORTANT
 * ---------
 *
 * These routes NEVER:
 *
 * - create trading sessions
 * - create positions
 * - place orders
 * - close positions
 * - authorize execution
 *
 * They only expose the state of an EXISTING trading session.
 *
 * ============================================================
 * SAAS BOUNDARY
 * ============================================================
 *
 * For development we use DEFAULT_TRADING_ACCOUNT_ID.
 *
 * Later this MUST be resolved from authenticated server-side
 * user/workspace/account context.
 *
 * Never trust an arbitrary browser-provided account ID once
 * multi-user authentication is enabled.
 */

function now() {
  return new Date()
    .toISOString();
}

function normalizeString(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim();

  return normalized ||
    null;
}

/**
 * ============================================================
 * TENANT CONTEXT
 * ============================================================
 *
 * Temporary development implementation.
 *
 * Later:
 *
 * req.auth.userId
 *        ↓
 * workspace membership
 *        ↓
 * authorized trading account
 */

function resolveTenantContext() {
  return {
    userId:
      null,

    workspaceId:
      null,

    accountId:
      DEFAULT_TRADING_ACCOUNT_ID,

    sessionId:
      DEFAULT_TRADING_ACCOUNT_ID,
  };
}

/**
 * ============================================================
 * GET /api/positions/status
 * ============================================================
 */

router.get(
  "/status",

  (req, res) => {
    const tenantContext =
      resolveTenantContext();

    const session =
      getTradingSession(
        tenantContext
          .accountId,
      );

    const state =
      session
        ? getTradingSessionState(
            tenantContext
              .accountId,
          )
        : null;

    return res
      .status(200)
      .json({
        success:
          true,

        service:
          "POSITIONS_API",

        status:
          session
            ? "READY"
            : "NO_ACTIVE_SESSION",

        accountId:
          tenantContext
            .accountId,

        sessionExists:
          Boolean(
            session,
          ),

        sessionStatus:
          state?.status ??
          null,

        hasOpenPosition:
          state
            ?.hasOpenPosition ===
          true,

        timestamp:
          now(),
      });
  },
);

/**
 * ============================================================
 * GET /api/positions
 * ============================================================
 */

router.get(
  "/",

  (req, res) => {
    try {
      const tenantContext =
        resolveTenantContext();

      /**
       * IMPORTANT:
       *
       * getTradingSession() does NOT create a session.
       *
       * A dashboard request must never start a trading runtime.
       */

      const session =
        getTradingSession(
          tenantContext
            .accountId,
        );

      if (!session) {
        return res
          .status(200)
          .json({
            success:
              true,

            approved:
              true,

            service:
              "LIVE_POSITIONS",

            status:
              "NO_POSITIONS",

            source:
              "PAPER_TRADING_SESSION",

            tenant:
              tenantContext,

            session: {
              exists:
                false,

              status:
                null,
            },

            summary: {
              openPositionCount:
                0,

              totalMarketValue:
                0,

              totalUnrealizedPnL:
                0,

              longPositions:
                0,

              shortPositions:
                0,
            },

            positions:
              [],

            warnings: [
              "No active trading session exists for this account.",
            ],

            errors:
              [],

            timestamp:
              now(),
          });
      }

      const state =
        session.getState();

      /**
       * Current PaperTradingSession supports one actively
       * managed position.
       *
       * We still normalize to an ARRAY so the frontend contract
       * already supports multiple positions.
       */

      const positions =
        state?.openPosition
          ? [
              state
                .openPosition,
            ]
          : [];

      /**
       * lastUpdate may contain the most recent output from the
       * position manager.
       *
       * We associate it only when it belongs to the current
       * position.
       */

      const managementByPositionId =
        {};

      const positionId =
        normalizeString(
          state
            ?.openPosition
            ?.id,
        );

      if (
        positionId &&
        state?.lastUpdate &&
        typeof state
          .lastUpdate ===
          "object"
      ) {
        managementByPositionId[
          positionId
        ] =
          state.lastUpdate;
      }

      const result =
        buildLivePositionsResponse({
          positions,

          managementByPositionId,

          tenantContext,

          source:
            "PAPER_TRADING_SESSION",
        });

      return res
        .status(200)
        .json({
          ...result,

          session: {
            exists:
              true,

            status:
              state?.status ??
              null,

            hasOpenPosition:
              state
                ?.hasOpenPosition ===
              true,

            historyCount:
              Number(
                state
                  ?.historyCount ??
                0,
              ),

            analysisCount:
              Number(
                state
                  ?.analysisCount ??
                0,
              ),
          },
        });
    } catch (error) {
      console.error(
        "POSITIONS ROUTE ERROR:",
        error,
      );

      return res
        .status(500)
        .json({
          success:
            false,

          approved:
            false,

          service:
            "POSITIONS_API",

          status:
            "ERROR",

          positions:
            [],

          warnings: [
            "Positions could not be loaded safely.",
          ],

          errors: [
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
          ],

          timestamp:
            now(),
        });
    }
  },
);

/**
 * ============================================================
 * GET /api/positions/:positionId
 * ============================================================
 */

router.get(
  "/:positionId",

  (req, res) => {
    try {
      const requestedId =
        normalizeString(
          req.params
            ?.positionId,
        );

      if (!requestedId) {
        return res
          .status(400)
          .json({
            success:
              false,

            status:
              "INVALID_REQUEST",

            error:
              "A position ID is required.",

            timestamp:
              now(),
          });
      }

      const tenantContext =
        resolveTenantContext();

      const session =
        getTradingSession(
          tenantContext
            .accountId,
        );

      if (!session) {
        return res
          .status(404)
          .json({
            success:
              false,

            status:
              "POSITION_NOT_FOUND",

            error:
              "Position was not found.",

            timestamp:
              now(),
          });
      }

      const state =
        session.getState();

      const position =
        state?.openPosition ??
        null;

      if (
        !position ||
        normalizeString(
          position.id,
        ) !==
          requestedId
      ) {
        return res
          .status(404)
          .json({
            success:
              false,

            status:
              "POSITION_NOT_FOUND",

            error:
              "Position was not found.",

            timestamp:
              now(),
          });
      }

      const normalized =
        normalizeLivePosition({
          position,

          management:
            state
              ?.lastUpdate ??
            null,

          tenantContext,
        });

      return res
        .status(200)
        .json({
          success:
            true,

          approved:
            true,

          service:
            "LIVE_POSITION",

          status:
            "COMPLETE",

          position:
            normalized,

          session: {
            status:
              state?.status ??
              null,
          },

          timestamp:
            now(),
        });
    } catch (error) {
      console.error(
        "POSITION DETAIL ROUTE ERROR:",
        error,
      );

      return res
        .status(500)
        .json({
          success:
            false,

          approved:
            false,

          service:
            "LIVE_POSITION",

          status:
            "ERROR",

          position:
            null,

          errors: [
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
          ],

          timestamp:
            now(),
        });
    }
  },
);

export default router;