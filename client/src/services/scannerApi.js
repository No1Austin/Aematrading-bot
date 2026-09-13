// client/src/services/scannerApi.js

/**
 * ============================================================
 * SCANNER API COMPATIBILITY FACADE
 * ============================================================
 *
 * IMPORTANT
 * ---------
 *
 * This file intentionally contains NO independent HTTP client.
 *
 * All requests delegate to ./api.js so the application has:
 *
 * - one API base URL
 * - one timeout implementation
 * - one error model
 * - one scanner contract
 * - no duplicate fetch logic
 *
 * Existing imports from scannerApi.js can continue working while
 * new code should prefer importing directly from ./api.js.
 */

import {
  API_BASE_URL,
  ApiError,
  analyzeStock as canonicalAnalyzeStock,
  getMarketOverview as canonicalGetMarketOverview,
  getMarketNews as canonicalGetMarketNews,
  getStockNews as canonicalGetStockNews,
  getStockCandles as canonicalGetStockCandles,
  getPositions as canonicalGetPositions,
  getPositionsStatus as canonicalGetPositionsStatus,
  getScannerSnapshot as canonicalGetScannerSnapshot,
  getScannerStatus as canonicalGetScannerStatus,
  getScannerCandidates as canonicalGetScannerCandidates,
  getScannerQualified as canonicalGetScannerQualified,
  getScannerResearchProgress as canonicalGetScannerResearchProgress,
  runScannerOnce as canonicalRunScannerOnce,
  startScanner as canonicalStartScanner,
  stopScanner as canonicalStopScanner,
  loadScannerWorkspace as canonicalLoadScannerWorkspace,
} from "./api.js";

/**
 * Keep the old exported error name for backwards compatibility.
 */
export class ScannerApiError extends ApiError {
  constructor(
    message,
    options = {},
  ) {
    super(
      message,
      {
        status:
          options
            ?.status ??
          null,

        payload:
          options
            ?.data ??
          options
            ?.payload ??
          null,

        endpoint:
          options
            ?.endpoint ??
          null,

        cause:
          options
            ?.cause ??
          null,
      },
    );

    this.name =
      "ScannerApiError";

    this.data =
      this.payload;
  }
}

export {
  API_BASE_URL,
};

export function analyzeStock(
  symbol,
  options = {},
) {
  return canonicalAnalyzeStock(
    symbol,
    options,
  );
}

export function getMarketOverview(
  options = {},
) {
  return canonicalGetMarketOverview(
    options,
  );
}

export function getMarketNews(
  options = {},
) {
  return canonicalGetMarketNews(
    options,
  );
}

export function getStockNews(
  symbol,
  options = {},
) {
  return canonicalGetStockNews(
    symbol,
    options,
  );
}

export function getStockCandles(
  symbol,
  options = {},
) {
  return canonicalGetStockCandles(
    symbol,
    options,
  );
}

export function getPositions(
  options = {},
) {
  return canonicalGetPositions(
    options,
  );
}

export function getPositionsStatus(
  options = {},
) {
  return canonicalGetPositionsStatus(
    options,
  );
}

export function getScannerSnapshot(
  options = 20,
) {
  return canonicalGetScannerSnapshot(
    options,
  );
}

export function getScannerStatus(
  options = {},
) {
  return canonicalGetScannerStatus(
    options,
  );
}

export function getScannerCandidates(
  options = 20,
) {
  return canonicalGetScannerCandidates(
    options,
  );
}

export function getScannerQualified(
  options = 20,
) {
  return canonicalGetScannerQualified(
    options,
  );
}

export function getScannerResearchProgress(
  options = {},
) {
  return canonicalGetScannerResearchProgress(
    options,
  );
}

export function runScannerOnce(
  options = {},
) {
  return canonicalRunScannerOnce(
    options,
  );
}

export function startScanner(
  options = {},
) {
  return canonicalStartScanner(
    options,
  );
}

export function stopScanner(
  options = {},
) {
  return canonicalStopScanner(
    options,
  );
}

export function loadScannerWorkspace(
  symbol,
  options = {},
) {
  return canonicalLoadScannerWorkspace(
    symbol,
    options,
  );
}

export default {
  API_BASE_URL,

  analyzeStock,

  getMarketOverview,
  getMarketNews,
  getStockNews,
  getStockCandles,

  getPositions,
  getPositionsStatus,

  getScannerSnapshot,
  getScannerStatus,
  getScannerCandidates,
  getScannerQualified,
  getScannerResearchProgress,
  runScannerOnce,
  startScanner,
  stopScanner,

  loadScannerWorkspace,
};
