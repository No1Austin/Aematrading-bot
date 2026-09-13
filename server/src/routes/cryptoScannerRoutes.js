/**
 * ============================================================
 * AEMA CRYPTO
 * CRYPTO SCANNER ROUTES
 * Phase 5.32
 * ============================================================
 */

import express
  from "express";


export function createCryptoScannerRoutes({
  scannerService,
} = {}) {
  if (
    !scannerService ||
    typeof scannerService
      .scan !==
      "function"
  ) {
    throw new Error(
      "CRYPTO_SCANNER_SERVICE_REQUIRED",
    );
  }

  const router =
    express.Router();


  /**
   * GET /api/crypto/scanner/status
   */
  router.get(
    "/status",
    (
      req,
      res,
    ) => {
      const capabilities =
        typeof scannerService
          .getCapabilities ===
        "function"
          ? scannerService
              .getCapabilities()
          : null;

      return res
        .status(200)
        .json({
          approved:
            true,

          service:
            "AEMA_CRYPTO_SCANNER",

          status:
            "READY",

          capabilities,

          paperExecution:
            true,

          liveExecution:
            false,

          executionAuthority:
            false,

          timestamp:
            new Date()
              .toISOString(),
        });
    },
  );


  /**
   * POST /api/crypto/scanner/scan
   *
   * Body:
   * {
   *   "query": "BTC"
   * }
   */
  router.post(
    "/scan",
    async (
      req,
      res,
    ) => {
      const query =
        String(
          req
            ?.body
            ?.query ??
          "",
        )
          .trim();

      if (
        !query
      ) {
        return res
          .status(400)
          .json({
            approved:
              false,

            status:
              "CRYPTO_SCAN_REJECTED",

            blocker:
              "QUERY_REQUIRED",

            error:
              "A token symbol, pair, or contract address is required.",

            executionAuthority:
              false,

            liveExecution:
              false,

            timestamp:
              new Date()
                .toISOString(),
          });
      }

      try {
        const result =
          await scannerService
            .scan({
              query,

              metadata: {
                source:
                  "HTTP_API",
              },
            });

        const statusCode =
          result
            ?.approved ===
          false
            ? 400
            : 200;

        return res
          .status(
            statusCode,
          )
          .json(
            result,
          );
      } catch (error) {
        console.error(
          "[AEMA_CRYPTO_SCANNER_FAILED]",
          error,
        );

        return res
          .status(500)
          .json({
            approved:
              false,

            status:
              "CRYPTO_SCAN_FAILED",

            error:
              error instanceof Error
                ? error
                    .message
                : String(
                    error,
                  ),

            executionAuthority:
              false,

            liveExecution:
              false,

            timestamp:
              new Date()
                .toISOString(),
          });
      }
    },
  );


  return router;
}


export default createCryptoScannerRoutes;
