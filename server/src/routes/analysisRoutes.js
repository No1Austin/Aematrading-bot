// server/src/routes/analysisRoutes.js

import express from "express";

import {
  runLiveStockAnalysisOnly,
} from "../services/liveStockAnalysisService.js";

import bootstrapStockMarketData from
  "../services/stockMarketDataBootstrapService.js";

import ensureLiveMarketData from
  "../services/liveMarketStreamService.js";

import getMarketClock from
  "../services/marketClockService.js";

const router =
  express.Router();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  value,
) {
  const symbol =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return symbol || null;
}

function positiveIntegerOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null;
  }

  return Math.floor(
    number,
  );
}

function booleanOrDefault(
  value,
  fallback,
) {
  if (
    value === undefined
  ) {
    return fallback;
  }

  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    const normalized =
      value
        .trim()
        .toLowerCase();

    if (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes"
    ) {
      return true;
    }

    if (
      normalized === "false" ||
      normalized === "0" ||
      normalized === "no"
    ) {
      return false;
    }
  }

  return fallback;
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

/**
 * ============================================================
 * GET /api/analysis/status
 * ============================================================
 */

router.get(
  "/status",

  (
    req,
    res,
  ) => {
    return res
      .status(200)
      .json({
        success:
          true,

        service:
          "LIVE_STOCK_ANALYSIS_API",

        status:
          "READY",

        timestamp:
          new Date()
            .toISOString(),
      });
  },
);

/**
 * ============================================================
 * POST /api/analysis/stock
 * ============================================================
 *
 * PIPELINE
 * --------
 *
 * Request
 *   ↓
 * Validate symbol
 *   ↓
 * Bootstrap historical Alpaca candles
 *   ↓
 * Populate MarketDataHub
 *   ↓
 * Ensure Alpaca live stream subscription
 *   ↓
 * Wait for fresh bid/ask quote
 *   ↓
 * Run production analysis
 *   ↓
 * Return analysis-only result
 *
 * SAFETY
 * ------
 *
 * This endpoint NEVER authorizes execution.
 *
 * runLiveStockAnalysisOnly() explicitly disables execution
 * readiness.
 */

router.post(
  "/stock",

  async (
    req,
    res,
  ) => {
    const symbol =
      normalizeSymbol(
        req.body
          ?.symbol,
      );

    /**
     * ========================================================
     * 1. VALIDATE REQUEST
     * ========================================================
     */

    if (!symbol) {
      return res
        .status(400)
        .json({
          success:
            false,

          approved:
            false,

          service:
            "LIVE_STOCK_ANALYSIS_API",

          status:
            "INVALID_REQUEST",

          symbol:
            null,

          executionReady:
            false,

          bootstrap:
            null,

          liveMarket:
            null,

          analysis:
            null,

          finalDecision:
            null,

          error:
            "A non-empty trading symbol is required.",

          timestamp:
            new Date()
              .toISOString(),
        });
    }

    try {
      /**
       * ======================================================
       * 2. BOOTSTRAP HISTORICAL MARKET DATA
       * ======================================================
       *
       * Loads real Alpaca historical candles into
       * MarketDataHub.
       *
       * Historical data can support analysis.
       *
       * Historical data alone must NEVER be treated as a live
       * quote and must NEVER authorize execution.
       */

      const bootstrapResult =
        await bootstrapStockMarketData({
          symbol,
        });

      /**
       * Fail closed if historical market data cannot establish
       * an analysis-ready MarketDataHub snapshot.
       */

      if (
        bootstrapResult
          ?.analysisReady !==
        true
      ) {
        return res
          .status(422)
          .json({
            success:
              false,

            approved:
              false,

            service:
              "LIVE_STOCK_ANALYSIS_API",

            status:
              bootstrapResult
                ?.status ??
              "INSUFFICIENT_DATA",

            symbol,

            executionReady:
              false,

            bootstrap:
              bootstrapResult,

            liveMarket:
              null,

            analysis:
              null,

            finalDecision:
              null,

            warnings:
              Array.isArray(
                bootstrapResult
                  ?.warnings,
              )
                ? bootstrapResult
                    .warnings
                : [],

            errors:
              Array.isArray(
                bootstrapResult
                  ?.errors,
              )
                ? bootstrapResult
                    .errors
                : [
                    "Market-data bootstrap did not complete successfully.",
                  ],

            timestamp:
              new Date()
                .toISOString(),
          });
      }

      /**
       * ======================================================
       * 3. ENSURE LIVE MARKET DATA
       * ======================================================
       *
       * The live-market service:
       *
       * - maintains/reuses the Alpaca WebSocket
       * - dynamically subscribes this symbol
       * - receives real bid/ask quotes
       * - allows alpacaLiveMarketStream to ingest those quotes
       *   into MarketDataHub
       * - waits for a fresh quote before returning
       *
       * IMPORTANT:
       *
       * Failure to receive a live quote does NOT fabricate one.
       *
       * We continue into analysis so analytical engines that
       * only require historical information may still operate.
       *
       * Liquidity/risk/execution engines must fail closed when
       * the live quote is unavailable.
       */

      const quoteWaitMs =
        positiveIntegerOrNull(
          req.body
            ?.quoteWaitMs,
        ) ??
        8_000;

      let marketClockResult = null;

      try {
        marketClockResult =
          await getMarketClock();
      } catch (error) {
        marketClockResult = {
          approved: false,
          service: "MARKET_CLOCK",
          status: "UNAVAILABLE",
          isOpen: null,
          warnings: [
            `Market clock was unavailable: ${safeErrorMessage(error)}`,
          ],
          errors: [],
        };
      }

      const marketExplicitlyClosed =
        marketClockResult?.approved === true &&
        marketClockResult?.isOpen === false;

      let liveMarketResult = null;

      if (marketExplicitlyClosed) {
        liveMarketResult = {
          approved: false,
          service: "LIVE_MARKET_DATA",
          status: "MARKET_CLOSED",
          symbol,
          quoteFresh: false,
          skipped: true,
          marketClock:
            marketClockResult,
          warnings: [
            "Live quote wait was skipped because the authoritative market clock reports the market closed.",
          ],
          errors: [],
        };
      } else {
        try {
          liveMarketResult =
            await ensureLiveMarketData({
              symbol,
              quoteWaitMs,
            });
        } catch (error) {
          liveMarketResult = {
            approved: false,
            service: "LIVE_MARKET_DATA",
            status: "UNAVAILABLE",
            symbol,
            quoteFresh: false,
            skipped: false,
            marketClock:
              marketClockResult,
            warnings: [
              "Live market data was unavailable. Historical analysis may continue, but execution remains disabled.",
            ],
            errors: [
              safeErrorMessage(error),
            ],
          };
        }
      }

      /**
       * ======================================================
       * 4. BUILD ANALYSIS OPTIONS
       * ======================================================
       */

      const options = {
        symbol,

        useLiveSocial:
          booleanOrDefault(
            req.body
              ?.useLiveSocial,

            true,
          ),
      };

      const minimumCandles =
        positiveIntegerOrNull(
          req.body
            ?.minimumCandles,
        );

      const providerTimeoutMs =
        positiveIntegerOrNull(
          req.body
            ?.providerTimeoutMs,
        );

      const engineTimeoutMs =
        positiveIntegerOrNull(
          req.body
            ?.engineTimeoutMs,
        );

      const runnerTimeoutMs =
        positiveIntegerOrNull(
          req.body
            ?.runnerTimeoutMs,
        );

      if (
        minimumCandles !==
        null
      ) {
        options.minimumCandles =
          minimumCandles;
      }

      if (
        providerTimeoutMs !==
        null
      ) {
        options.providerTimeoutMs =
          providerTimeoutMs;
      }

      if (
        engineTimeoutMs !==
        null
      ) {
        options.engineTimeoutMs =
          engineTimeoutMs;
      }

      if (
        runnerTimeoutMs !==
        null
      ) {
        options.runnerTimeoutMs =
          runnerTimeoutMs;
      }

      /**
       * ======================================================
       * 5. RUN REAL LIVE ANALYSIS
       * ======================================================
       */

      const result =
        await runLiveStockAnalysisOnly(
          options,
        );

      /**
       * ======================================================
       * 6. MERGE WARNINGS
       * ======================================================
       */

      const warnings = [
        ...(
          Array.isArray(
            bootstrapResult
              ?.warnings,
          )
            ? bootstrapResult
                .warnings
            : []
        ),

        ...(
          Array.isArray(
            marketClockResult
              ?.warnings,
          )
            ? marketClockResult
                .warnings
            : []
        ),

        ...(
          Array.isArray(
            liveMarketResult
              ?.warnings,
          )
            ? liveMarketResult
                .warnings
            : []
        ),

        ...(
          Array.isArray(
            result
              ?.warnings,
          )
            ? result
                .warnings
            : []
        ),
      ];

      /**
       * ======================================================
       * 7. DETERMINE HTTP STATUS
       * ======================================================
       *
       * NO_TRADE / BLOCKED is a valid analytical result.
       *
       * The route does not need to pretend a rejected trade is
       * a server failure.
       */

      let httpStatus =
        200;

      if (
        result
          ?.status ===
        "INVALID_REQUEST"
      ) {
        httpStatus =
          400;
      } else if (
        !result
      ) {
        httpStatus =
          500;
      }

      /**
       * ======================================================
       * 8. RETURN FRONTEND-SAFE RESPONSE
       * ======================================================
       */

      return res
        .status(
          httpStatus,
        )
        .json({
          success:
            true,

          /**
           * Was the trading setup approved by the analytical
           * pipeline?
           */

          approved:
            result
              ?.approved ===
            true,

          /**
           * Historical bootstrap diagnostics.
           */

          bootstrap:
            bootstrapResult,

          /**
           * Live WebSocket / quote diagnostics.
           */

          liveMarket:
            liveMarketResult,

          marketClock:
            marketClockResult,

          /**
           * Production analysis result.
           */

          ...result,

          /**
           * Use our merged warnings after spreading result so
           * none of the upstream warnings are lost.
           */

          warnings,

          /**
           * ==================================================
           * HARD HTTP SAFETY BOUNDARY
           * ==================================================
           *
           * This endpoint is for research/analysis only.
           *
           * It must NEVER become an order authorization
           * endpoint.
           */

          executionReady:
            false,
        });
    } catch (
      error
    ) {
      console.error(
        "LIVE ANALYSIS ROUTE ERROR:",
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
            "LIVE_STOCK_ANALYSIS_API",

          status:
            "ERROR",

          symbol,

          executionReady:
            false,

          bootstrap:
            null,

          liveMarket:
            null,

          analysis:
            null,

          finalDecision:
            null,

          warnings: [
            "Live analysis failed safely. No trade execution should occur.",
          ],

          errors: [
            safeErrorMessage(
              error,
            ),
          ],

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

export default router;