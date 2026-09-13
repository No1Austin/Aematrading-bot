/**
 * ============================================================
 * AEMA CRYPTO
 * RUNTIME API ROUTES
 * Phase 5.31
 * ============================================================
 *
 * Frontend-facing read-only runtime API.
 *
 * IMPORTANT:
 * - no trade execution
 * - no order submission
 * - no live execution
 * - no execution authority
 */

import express
  from "express";


export function createCryptoRuntimeRouter({
  runtimeApiService,
} = {}) {
  if (!runtimeApiService) {
    throw new Error(
      "CRYPTO_RUNTIME_API_SERVICE_REQUIRED",
    );
  }


  const router =
    express.Router();


  /**
   * ==========================================================
   * GET /api/crypto/runtime/health
   * ==========================================================
   */

  router.get(
    "/runtime/health",
    (req, res) => {
      try {
        const result =
          runtimeApiService
            .getRuntimeHealth();

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_RUNTIME_HEALTH_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/runtime/state
   * ==========================================================
   */

  router.get(
    "/runtime/state",
    (req, res) => {
      try {
        const result =
          runtimeApiService
            .getRuntimeState();

        return res
          .status(
            result?.approved ===
              false
              ? 503
              : 200,
          )
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_RUNTIME_STATE_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/account
   * ==========================================================
   */

  router.get(
    "/account",
    (req, res) => {
      try {
        const result =
          runtimeApiService
            .getAccount();

        return res
          .status(
            result?.approved ===
              false
              ? 503
              : 200,
          )
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_ACCOUNT_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/positions
   *
   * Optional:
   * ?symbol=BTCUSDT
   * ==========================================================
   */

  router.get(
    "/positions",
    (req, res) => {
      try {
        const result =
          runtimeApiService
            .getPositions({
              symbol:
                req.query
                  ?.symbol ??
                null,
            });

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_POSITIONS_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/orders
   *
   * Optional:
   * ?symbol=BTCUSDT
   * ?openOnly=true
   * ?limit=100
   * ==========================================================
   */

  router.get(
    "/orders",
    async (req, res) => {
      try {
        const openOnly =
          String(
            req.query
              ?.openOnly ??
            "",
          )
            .trim()
            .toLowerCase() ===
          "true";


        const result =
          await runtimeApiService
            .getOrders({
              symbol:
                req.query
                  ?.symbol ??
                null,

              openOnly,

              limit:
                req.query
                  ?.limit ??
                100,
            });


        return res
          .status(200)
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_ORDERS_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/trades
   *
   * Optional:
   * ?symbol=BTCUSDT
   * ?limit=100
   * ==========================================================
   */

  router.get(
    "/trades",
    (req, res) => {
      try {
        const result =
          runtimeApiService
            .getTrades({
              symbol:
                req.query
                  ?.symbol ??
                null,

              limit:
                req.query
                  ?.limit ??
                100,
            });

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_TRADES_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/persistence
   * ==========================================================
   */

  router.get(
    "/persistence",
    (req, res) => {
      try {
        const result =
          runtimeApiService
            .getPersistenceHealth();

        return res
          .status(
            result?.approved ===
              false
              ? 503
              : 200,
          )
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_PERSISTENCE_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/recovery
   * ==========================================================
   */

  router.get(
    "/recovery",
    (req, res) => {
      try {
        const result =
          runtimeApiService
            .getRecoveryState();

        return res
          .status(
            result?.approved ===
              false
              ? 503
              : 200,
          )
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_RECOVERY_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * GET /api/crypto/dashboard
   * ==========================================================
   */

  router.get(
    "/dashboard",
    async (req, res) => {
      try {
        const result =
          await runtimeApiService
            .getDashboardSnapshot();

        return res
          .status(200)
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_DASHBOARD_ERROR",

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * POST /api/crypto/runtime/evaluate-action
   *
   * IMPORTANT:
   *
   * Evaluation only.
   * Never executes anything.
   *
   * Body:
   *
   * {
   *   "action": "OPEN_POSITION",
   *   "marketDataFresh": true,
   *   "marketDataAgeMs": 1000
   * }
   * ==========================================================
   */

  router.post(
    "/runtime/evaluate-action",
    (req, res) => {
      try {
        const action =
          req.body
            ?.action;


        if (
          !action ||
          typeof action !==
            "string"
        ) {
          return res
            .status(400)
            .json({
              approved:
                false,

              status:
                "INVALID_RUNTIME_ACTION",

              blocker:
                "ACTION_REQUIRED",

              evaluatedOnly:
                true,

              executionAuthority:
                false,

              liveExecution:
                false,
            });
        }


        const result =
          runtimeApiService
            .evaluateAction({
              action,

              marketDataFresh:
                req.body
                  ?.marketDataFresh,

              marketDataAgeMs:
                req.body
                  ?.marketDataAgeMs,
            });


        return res
          .status(
            result?.approved ===
              false
              ? 403
              : 200,
          )
          .json(result);
      } catch (error) {
        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "RUNTIME_ACTION_EVALUATION_ERROR",

            evaluatedOnly:
              true,

            error:
              String(
                error?.message ??
                error,
              ),

            executionAuthority:
              false,

            liveExecution:
              false,
          });
      }
    },
  );


  /**
   * ==========================================================
   * API STATUS
   * ==========================================================
   */

  router.get(
    "/status",
    (req, res) => {
      return res
        .status(200)
        .json({
          approved:
            true,

          service:
            "AEMA_CRYPTO_RUNTIME_API",

          status:
            "READY",

          timestamp:
            new Date()
              .toISOString(),

          paperExecution:
            true,

          liveExecution:
            false,

          executionAuthority:
            false,
        });
    },
  );


  return router;
}


export default
  createCryptoRuntimeRouter;