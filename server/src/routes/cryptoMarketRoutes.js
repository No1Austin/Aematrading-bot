import express from "express";

import { getCryptoMarketOverview } from "../crypto/markets/cryptoMarketOverviewService.js";
import {
  getCryptoUniverse,
  getCryptoUniverseCacheStatus,
} from "../crypto/universe/cryptoUniverseProvider.js";

const router = express.Router();

const refreshRequested = value =>
  String(value ?? "").trim().toLowerCase() === "true";

function limitValue(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? Math.min(n, 1000) : 1000;
}

router.get("/markets/overview", async (req, res, next) => {
  try {
    const result = await getCryptoMarketOverview({
      refresh: refreshRequested(req.query?.refresh),
      maximumAssets: limitValue(req.query?.limit),
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/universe", async (req, res, next) => {
  try {
    const result = await getCryptoUniverse({
      refresh: refreshRequested(req.query?.refresh),
      maximumAssets: limitValue(req.query?.limit),
    });
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

router.get("/universe/status", (req, res) => {
  return res.status(200).json({
    approved: true,
    status: "READY",
    cache: getCryptoUniverseCacheStatus(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
