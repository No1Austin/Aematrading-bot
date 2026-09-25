/**
 * AEMA CRYPTO DISCOVERY ROUTES — PHASE 6.4
 */
import express from "express";
import {
  getCryptoDiscoveryOverview,
  getCryptoDiscoveryCacheStatus,
  clearCryptoDiscoveryCache,
} from "../crypto/discovery/cryptoDiscoveryService.js";

const router = express.Router();

router.get("/discovery", async (req, res) => {
  try {
    const refresh = String(req.query.refresh ?? "false").toLowerCase() === "true";
    const refreshUniverse = String(req.query.refreshUniverse ?? refresh).toLowerCase() === "true";
    const result = await getCryptoDiscoveryOverview({ refresh, refreshUniverse });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      approved: false,
      status: "ERROR",
      error: error instanceof Error ? error.message : String(error),
      researchOnly: true,
      executionAuthority: false,
      liveExecution: false,
    });
  }
});

router.get("/discovery/status", (req, res) => {
  return res.status(200).json({
    approved: true,
    status: "READY",
    cache: getCryptoDiscoveryCacheStatus(),
    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  });
});

router.post("/discovery/cache/clear", (req, res) => {
  clearCryptoDiscoveryCache();
  return res.status(200).json({ approved: true, status: "CACHE_CLEARED" });
});

export default router;
