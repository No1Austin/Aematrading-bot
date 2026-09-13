/**
 * ============================================================
 * MARKET SCANNER
 * ============================================================
 *
 * eligible  = safe/usable enough for research discovery
 * qualified = cheap scanner already has high directional conviction
 *
 * Deep research selection ranks ELIGIBLE stocks.
 */

import qualifyScannerCandidate from
  "./candidateQualificationEngine.js";

import {
  MARKET_SCANNER_CONFIG,
} from "./marketScannerConfig.js";

import deepResearchCoordinator from
  "./deepResearchCoordinator.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeSymbol(symbol) {
  return String(symbol ?? "").trim().toUpperCase();
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeMeasurements(measurements) {
  if (!Array.isArray(measurements)) {
    return [];
  }

  const seen = new Set();

  return measurements
    .map(item => ({
      ...item,
      symbol: normalizeSymbol(item?.symbol),
    }))
    .filter(item => {
      if (!item.symbol || seen.has(item.symbol)) {
        return false;
      }

      seen.add(item.symbol);
      return true;
    });
}

function rankByScannerScore(candidates) {
  return [...candidates].sort((a, b) => {
    const scoreDifference =
      finiteOrZero(b?.scannerScore) -
      finiteOrZero(a?.scannerScore);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const edgeDifference =
      finiteOrZero(b?.directionEdge) -
      finiteOrZero(a?.directionEdge);

    if (edgeDifference !== 0) {
      return edgeDifference;
    }

    return String(a?.symbol ?? "").localeCompare(
      String(b?.symbol ?? ""),
    );
  });
}

export async function scanMarket({
  measurements = [],
  config = MARKET_SCANNER_CONFIG,
  submitForDeepResearch = true,
  maximumCandidates =
    config?.candidateManagement?.maximumCandidatesPerScan ?? 20,
} = {}) {
  const startedAt = nowIso();
  const normalized = normalizeMeasurements(measurements);

  const results = normalized.map(measurement =>
    qualifyScannerCandidate(
      measurement,
      config,
    ),
  );

  const qualified = rankByScannerScore(
    results.filter(
      result => result?.qualified === true,
    ),
  );

  const researchable = rankByScannerScore(
    results.filter(
      result => result?.eligible === true,
    ),
  );

  const limited =
    Number.isInteger(maximumCandidates) &&
    maximumCandidates > 0
      ? researchable.slice(0, maximumCandidates)
      : researchable;

  const submissions = [];

  if (submitForDeepResearch === true) {
    for (const candidate of limited) {
      try {
        const submission =
          deepResearchCoordinator.submitCandidate(candidate);

        submissions.push({
          symbol: candidate.symbol,
          scannerScore: candidate.scannerScore,
          preferredDirection:
            candidate.preferredDirection ?? "NEUTRAL",
          qualified: candidate.qualified === true,
          eligible: candidate.eligible === true,
          accepted: submission?.accepted === true,
          reason: submission?.reason ?? null,
        });
      } catch (error) {
        submissions.push({
          symbol: candidate.symbol,
          scannerScore: candidate.scannerScore,
          preferredDirection:
            candidate.preferredDirection ?? "NEUTRAL",
          qualified: candidate.qualified === true,
          eligible: candidate.eligible === true,
          accepted: false,
          reason:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
  }

  return {
    approved: true,
    scanner: "MARKET_SCANNER",
    scanned: results.length,
    researchable: researchable.length,
    qualified: qualified.length,
    submitted: submissions.filter(
      item => item.accepted === true,
    ).length,
    candidates: limited,
    highConvictionCandidates: qualified,
    allResults: results,
    submissions,
    startedAt,
    completedAt: nowIso(),
  };
}

export default scanMarket;
