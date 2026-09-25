/**
 * AEMA CRYPTO — RESEARCH ROUTES
 * Phase 1.0
 */

import express from "express";
import {
  getCryptoExchangeIntelligence,
} from "../research/cryptoExchangeIntelligenceService.js";

const router = express.Router();

function assetFromRequest(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};

  return {
    symbol: body.symbol ?? body.query ?? query.symbol ?? query.query,
    name: body.name ?? query.name ?? null,
    assetId: body.assetId ?? query.assetId ?? null,
    chainId: body.chainId ?? body.network ?? query.chainId ?? query.network ?? null,
    address: body.address ?? body.tokenAddress ?? query.address ?? query.tokenAddress ?? null,
  };
}

router.get("/exchange-intelligence", async (req, res) => {
  try {
    const result = await getCryptoExchangeIntelligence(assetFromRequest(req));
    res.status(result.approved ? 200 : 422).json(result);
  } catch (error) {
    res.status(500).json({
      approved: false,
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

router.post("/exchange-intelligence", async (req, res) => {
  try {
    const result = await getCryptoExchangeIntelligence(assetFromRequest(req), {
      arbitrage: req.body?.arbitrage ?? {},
    });
    res.status(result.approved ? 200 : 422).json(result);
  } catch (error) {
    res.status(500).json({
      approved: false,
      status: "FAILED",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
