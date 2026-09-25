import express from "express";

function normalizeQuery(req) {
  return String(req?.body?.query ?? "").trim();
}

function rejection(res) {
  return res.status(400).json({
    approved: false,
    status: "CRYPTO_SCAN_REJECTED",
    blocker: "QUERY_REQUIRED",
    error: "A token symbol, pair, or contract address is required.",
    executionAuthority: false,
    liveExecution: false,
    timestamp: new Date().toISOString(),
  });
}

export function createCryptoScannerRoutes({ scannerService } = {}) {
  if (!scannerService || typeof scannerService.scan !== "function") {
    throw new Error("CRYPTO_SCANNER_SERVICE_REQUIRED");
  }

  const router = express.Router();

  router.get("/status", (req, res) => {
    const capabilities = typeof scannerService.getCapabilities === "function"
      ? scannerService.getCapabilities()
      : null;

    return res.status(200).json({
      approved: true,
      service: "AEMA_CRYPTO_SCANNER",
      status: "READY",
      capabilities,
      researchOnly: true,
      paperExecution: true,
      liveExecution: false,
      executionAuthority: false,
      timestamp: new Date().toISOString(),
    });
  });

  const runScan = async (req, res, source) => {
    const query = normalizeQuery(req);
    if (!query) return rejection(res);

    try {
      const result = await scannerService.scan({ query, metadata: { source } });
      return res.status(result?.approved === false ? 400 : 200).json(result);
    } catch (error) {
      console.error("[AEMA_CRYPTO_SCANNER_FAILED]", error);
      return res.status(500).json({
        approved: false,
        status: "CRYPTO_SCAN_FAILED",
        error: error instanceof Error ? error.message : String(error),
        executionAuthority: false,
        liveExecution: false,
        timestamp: new Date().toISOString(),
      });
    }
  };

  router.post("/scan", (req, res) => runScan(req, res, "HTTP_API"));

  // Presentation-only alias. It reuses the exact scanner pipeline and does
  // not calculate, average, or fabricate a second research result.
  router.post("/engines", (req, res) => runScan(req, res, "CRYPTO_ENGINES_UI"));

  return router;
}

export default createCryptoScannerRoutes;
