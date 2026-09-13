import express from "express";
import {
  getMarketNewsFeed,
} from "../services/marketNewsService.js";
import {
  getMarketOverview,
} from "../services/marketOverviewService.js";

import {
  createMarketSnapshot,
} from "../data/marketDataHub.js";

const router =
  express.Router();

function positiveInteger(
  value,
  fallback = 10,
  maximum = 50,
) {
  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return Math.min(
    parsed,
    maximum,
  );
}

/**
 * GET /api/markets/status
 */
router.get(
  "/status",
  (req, res) => {
    return res
      .status(200)
      .json({
        success: true,
        service:
          "MARKET_OVERVIEW_API",
        status:
          "READY",
        timestamp:
          new Date()
            .toISOString(),
      });
  },
);

/**
 * GET /api/markets/overview
 *
 * Returns real market overview data.
 *
 * This endpoint:
 * - does not place trades
 * - does not authorize execution
 * - does not fabricate fallback data
 */
router.get(
  "/overview",
  async (req, res) => {
    try {
      const limit =
        positiveInteger(
          req.query?.limit,
          10,
          50,
        );

      const result =
        await getMarketOverview({
          limit,
        });

      const approved =
        result?.approved ===
        true;

      return res
        .status(
          approved
            ? 200
            : 503,
        )
        .json({
          success:
            approved,

          ...result,

          timestamp:
            result?.timestamp ??
            new Date()
              .toISOString(),
        });
    } catch (error) {
      console.error(
        "MARKET OVERVIEW ROUTE ERROR:",
        error,
      );

      return res
        .status(500)
        .json({
          success: false,
          approved: false,
          service:
            "MARKET_OVERVIEW_API",
          status:
            "ERROR",
          universe: null,
          movers: null,
          gainers: [],
          losers: [],
          warnings: [
            "Market overview failed safely.",
          ],
          errors: [
            error instanceof Error
              ? error.message
              : String(error),
          ],
          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * GET /api/markets/news
 * ============================================================
 *
 * Examples:
 *
 * /api/markets/news
 *
 * /api/markets/news?limit=20
 *
 * /api/markets/news?symbols=AAPL,NVDA,TSLA
 */

router.get(
  "/news",

  async (
    req,
    res,
  ) => {
    try {
      const limit =
        positiveInteger(
          req.query?.limit,
          20,
          50,
        );

      const symbols =
        String(
          req.query?.symbols ??
          "",
        )
          .split(",")
          .map(
            symbol =>
              symbol
                .trim()
                .toUpperCase(),
          )
          .filter(Boolean);

      const result =
        await getMarketNewsFeed({
          symbols,

          limit,

          includeContent:
            false,
        });

      return res
        .status(
          result
            ?.approved ===
          true
            ? 200
            : 503,
        )
        .json({
          success:
            result
              ?.approved ===
            true,

          ...result,
        });
    } catch (
      error
    ) {
      console.error(
        "MARKET NEWS ROUTE ERROR:",
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
            "MARKET_NEWS_API",

          status:
            "ERROR",

          news: [],

          warnings: [],

          errors: [
            error instanceof Error
              ? error.message
              : String(error),
          ],

          timestamp:
            new Date()
              .toISOString(),
        });
    }
  },
);

/**
 * ============================================================
 * GET /api/markets/:symbol/candles
 * ============================================================
 *
 * Read-only chart endpoint.
 *
 * Returns real candles currently stored in MarketDataHub.
 *
 * This route does NOT:
 * - fabricate candles
 * - place trades
 * - authorize execution
 */

router.get(
  "/:symbol/candles",

  (req, res) => {
    const symbol =
      String(
        req.params?.symbol ??
        "",
      )
        .trim()
        .toUpperCase();

    const requestedLimit =
      Number(
        req.query?.limit,
      );

    const limit =
      Number.isInteger(
        requestedLimit,
      ) &&
      requestedLimit > 0
        ? Math.min(
            requestedLimit,
            1000,
          )
        : 200;

    if (!symbol) {
      return res
        .status(400)
        .json({
          success: false,
          approved: false,
          service:
            "MARKET_CANDLES_API",
          status:
            "INVALID_REQUEST",
          symbol: null,
          candles: [],
          errors: [
            "A stock symbol is required.",
          ],
          timestamp:
            new Date()
              .toISOString(),
        });
    }

    const snapshot =
      createMarketSnapshot(
        symbol,
      );

    if (!snapshot) {
      return res
        .status(404)
        .json({
          success: false,
          approved: false,
          service:
            "MARKET_CANDLES_API",
          status:
            "NOT_FOUND",
          symbol,
          candles: [],
          errors: [
            "No MarketDataHub snapshot exists for this symbol.",
          ],
          timestamp:
            new Date()
              .toISOString(),
        });
    }

    const sourceCandles =
      Array.isArray(
        snapshot.candles,
      )
        ? snapshot.candles
        : [];

    const candles =
      sourceCandles
        .slice(
          -limit,
        )
        .map(
          candle => ({
            symbol:
              candle?.symbol ??
              symbol,

            timestamp:
              candle?.timestamp ??
              null,

            open:
              Number.isFinite(
                Number(
                  candle?.open,
                ),
              )
                ? Number(
                    candle.open,
                  )
                : null,

            high:
              Number.isFinite(
                Number(
                  candle?.high,
                ),
              )
                ? Number(
                    candle.high,
                  )
                : null,

            low:
              Number.isFinite(
                Number(
                  candle?.low,
                ),
              )
                ? Number(
                    candle.low,
                  )
                : null,

            close:
              Number.isFinite(
                Number(
                  candle?.close,
                ),
              )
                ? Number(
                    candle.close,
                  )
                : null,

            volume:
              Number.isFinite(
                Number(
                  candle?.volume,
                ),
              )
                ? Number(
                    candle.volume,
                  )
                : 0,

            tradeCount:
              Number.isFinite(
                Number(
                  candle?.tradeCount,
                ),
              )
                ? Number(
                    candle.tradeCount,
                  )
                : null,

            vwap:
              Number.isFinite(
                Number(
                  candle?.vwap,
                ),
              )
                ? Number(
                    candle.vwap,
                  )
                : null,
          }),
        )
        .filter(
          candle =>
            candle.timestamp &&
            candle.open !== null &&
            candle.high !== null &&
            candle.low !== null &&
            candle.close !== null,
        );

    return res
      .status(200)
      .json({
        success: true,
        approved: true,
        service:
          "MARKET_CANDLES_API",
        status:
          "COMPLETE",
        symbol,
        quoteFresh:
          snapshot.quoteFresh ===
          true,
        historicalLoaded:
          snapshot
            .historicalLoaded ===
          true,
        candleCount:
          candles.length,
        totalCandleCount:
          sourceCandles.length,
        latestBar:
          snapshot.latestBar ??
          null,
        latestQuote:
          snapshot.latestQuote ??
          null,
        candles,
        timestamp:
          new Date()
            .toISOString(),
      });
  },
);

export default router;