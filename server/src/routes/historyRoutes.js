// server/src/routes/historyRoutes.js

import express from "express";

import {
  DEFAULT_TRADING_ACCOUNT_ID,
} from "../services/tradingSessionRegistry.js";

import {
  getTradeHistory,
} from "../services/tradeHistoryService.js";

const router =
  express.Router();

function positiveInteger(
  value,
  fallback = 100,
  maximum = 1000,
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return Math.min(
    number,
    maximum,
  );
}

/**
 * ============================================================
 * GET /api/history
 * ============================================================
 */

router.get(
  "/",
  (req, res) => {
    const result =
      getTradeHistory({
        accountId:
          DEFAULT_TRADING_ACCOUNT_ID,

        limit:
          positiveInteger(
            req.query?.limit,
          ),
      });

    return res
      .status(
        result?.success ===
        false
          ? 500
          : 200,
      )
      .json(
        result,
      );
  },
);

export default router;