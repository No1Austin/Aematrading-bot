/**
 * ============================================================
 * CANDIDATE REGISTRY
 * ============================================================
 *
 * Stores scanner-qualified candidates and tracks their
 * deep-research lifecycle.
 *
 * IMPORTANT:
 * - This is NOT persistent storage.
 * - This registry has ZERO trading authority.
 * - Scanner score != trade approval.
 * - Deep research remains authoritative.
 */

export const RESEARCH_STATUS = Object.freeze({
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETE: "COMPLETE",
  REJECTED: "REJECTED",
  ERROR: "ERROR",
});

const candidates = new Map();

function normalizeSymbol(symbol) {
  return String(symbol ?? "")
    .trim()
    .toUpperCase();
}

function nowIso() {
  return new Date().toISOString();
}

function finiteOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return structuredClone(value);
}

function requireSymbol(symbol) {
  const normalized = normalizeSymbol(symbol);

  if (!normalized) {
    throw new Error(
      "[CANDIDATE_REGISTRY] Symbol is required.",
    );
  }

  return normalized;
}

/**
 * Add or refresh a scanner-qualified candidate.
 *
 * Existing RUNNING research is never reset by a new scan.
 * Existing QUEUED research also remains queued.
 *
 * Completed/rejected/error candidates can be requeued only when
 * the caller explicitly supplies requeue: true.
 */
export function upsertCandidate(
  scannerResult,
  {
    requeue = false,
  } = {},
) {
  if (
    !scannerResult ||
    scannerResult.qualified !== true
  ) {
    throw new Error(
      "[CANDIDATE_REGISTRY] Only qualified scanner candidates may be registered.",
    );
  }

  const symbol = requireSymbol(
    scannerResult.symbol,
  );

  const existing =
    candidates.get(symbol) ?? null;

  let researchStatus =
    existing?.researchStatus ??
    RESEARCH_STATUS.QUEUED;

  if (
    requeue === true &&
    researchStatus !==
      RESEARCH_STATUS.RUNNING
  ) {
    researchStatus =
      RESEARCH_STATUS.QUEUED;
  }

  const firstQualifiedAt =
    existing?.firstQualifiedAt ??
    scannerResult.qualifiedAt ??
    nowIso();

  const candidate = {
    symbol,

    scannerScore:
      finiteOrNull(
        scannerResult.scannerScore,
      ),

    longScannerScore:
      finiteOrNull(
        scannerResult.longScannerScore,
      ),

    shortScannerScore:
      finiteOrNull(
        scannerResult.shortScannerScore,
      ),

    directionEdge:
      finiteOrNull(
        scannerResult.directionEdge,
      ),

    preferredDirection:
      scannerResult.preferredDirection ??
      "NEUTRAL",

    scannerStatus:
      scannerResult.status ??
      "QUALIFIED",

    scannerReasons:
      Array.isArray(scannerResult.reasons)
        ? [...scannerResult.reasons]
        : [],

    measurements:
      clone(
        scannerResult.measurements ?? {},
      ),

    longScores:
      clone(
        scannerResult.longScores ?? {},
      ),

    shortScores:
      clone(
        scannerResult.shortScores ?? {},
      ),

    researchStatus,

    deepScore:
      existing?.deepScore ?? null,

    finalDecision:
      clone(
        existing?.finalDecision ?? null,
      ),

    deepResearchResult:
      clone(
        existing?.deepResearchResult ??
          null,
      ),

    researchError:
      existing?.researchError ?? null,

    firstQualifiedAt,

    qualifiedAt:
      scannerResult.qualifiedAt ??
      nowIso(),

    lastSeenAt:
      nowIso(),

    researchQueuedAt:
      existing?.researchQueuedAt ??
      nowIso(),

    researchStartedAt:
      existing?.researchStartedAt ??
      null,

    researchCompletedAt:
      existing?.researchCompletedAt ??
      null,

    scanCount:
      (existing?.scanCount ?? 0) + 1,
  };

  /**
   * Explicit requeue clears old terminal research state.
   */
  if (
    requeue === true &&
    existing?.researchStatus !==
      RESEARCH_STATUS.RUNNING
  ) {
    candidate.deepScore = null;
    candidate.finalDecision = null;
    candidate.deepResearchResult = null;
    candidate.researchError = null;
    candidate.researchQueuedAt =
      nowIso();
    candidate.researchStartedAt =
      null;
    candidate.researchCompletedAt =
      null;
  }

  candidates.set(
    symbol,
    candidate,
  );

  return clone(candidate);
}

export function getCandidate(symbol) {
  const normalized =
    normalizeSymbol(symbol);

  if (!normalized) {
    return null;
  }

  const candidate =
    candidates.get(normalized);

  return candidate
    ? clone(candidate)
    : null;
}

export function hasCandidate(symbol) {
  const normalized =
    normalizeSymbol(symbol);

  return normalized
    ? candidates.has(normalized)
    : false;
}

export function listCandidates({
  status = null,
  limit = null,
} = {}) {
  let list = Array.from(
    candidates.values(),
  );

  if (status) {
    const normalizedStatus =
      String(status)
        .trim()
        .toUpperCase();

    list = list.filter(
      candidate =>
        candidate.researchStatus ===
        normalizedStatus,
    );
  }

  /**
   * Highest scanner score first.
   *
   * Stable fallback:
   * earliest qualification first.
   */
  list.sort((a, b) => {
    const scoreDifference =
      (b.scannerScore ?? 0) -
      (a.scannerScore ?? 0);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return String(
      a.firstQualifiedAt ?? "",
    ).localeCompare(
      String(
        b.firstQualifiedAt ?? "",
      ),
    );
  });

  if (
    Number.isInteger(limit) &&
    limit >= 0
  ) {
    list = list.slice(0, limit);
  }

  return clone(list);
}

export function markCandidateQueued(
  symbol,
) {
  const normalized =
    requireSymbol(symbol);

  const candidate =
    candidates.get(normalized);

  if (!candidate) {
    throw new Error(
      `[CANDIDATE_REGISTRY] Candidate ${normalized} does not exist.`,
    );
  }

  /**
   * Never reset active research.
   */
  if (
    candidate.researchStatus ===
    RESEARCH_STATUS.RUNNING
  ) {
    return clone(candidate);
  }

  candidate.researchStatus =
    RESEARCH_STATUS.QUEUED;

  candidate.researchQueuedAt =
    nowIso();

  candidate.researchStartedAt =
    null;

  candidate.researchCompletedAt =
    null;

  candidate.researchError = null;

  candidates.set(
    normalized,
    candidate,
  );

  return clone(candidate);
}

export function markCandidateRunning(
  symbol,
) {
  const normalized =
    requireSymbol(symbol);

  const candidate =
    candidates.get(normalized);

  if (!candidate) {
    throw new Error(
      `[CANDIDATE_REGISTRY] Candidate ${normalized} does not exist.`,
    );
  }

  candidate.researchStatus =
    RESEARCH_STATUS.RUNNING;

  candidate.researchStartedAt =
    nowIso();

  candidate.researchCompletedAt =
    null;

  candidate.researchError = null;

  candidates.set(
    normalized,
    candidate,
  );

  return clone(candidate);
}

export function markCandidateComplete(
  symbol,
  {
    deepScore = null,
    finalDecision = null,
    deepResearchResult = null,
  } = {},
) {
  const normalized =
    requireSymbol(symbol);

  const candidate =
    candidates.get(normalized);

  if (!candidate) {
    throw new Error(
      `[CANDIDATE_REGISTRY] Candidate ${normalized} does not exist.`,
    );
  }

  candidate.researchStatus =
    RESEARCH_STATUS.COMPLETE;

  candidate.deepScore =
    finiteOrNull(deepScore);

  candidate.finalDecision =
    clone(finalDecision);

  candidate.deepResearchResult =
    clone(deepResearchResult);

  candidate.researchCompletedAt =
    nowIso();

  candidate.researchError = null;

  candidates.set(
    normalized,
    candidate,
  );

  return clone(candidate);
}

export function markCandidateRejected(
  symbol,
  {
    deepScore = null,
    finalDecision = null,
    deepResearchResult = null,
  } = {},
) {
  const normalized =
    requireSymbol(symbol);

  const candidate =
    candidates.get(normalized);

  if (!candidate) {
    throw new Error(
      `[CANDIDATE_REGISTRY] Candidate ${normalized} does not exist.`,
    );
  }

  candidate.researchStatus =
    RESEARCH_STATUS.REJECTED;

  candidate.deepScore =
    finiteOrNull(deepScore);

  candidate.finalDecision =
    clone(finalDecision);

  candidate.deepResearchResult =
    clone(deepResearchResult);

  candidate.researchCompletedAt =
    nowIso();

  candidate.researchError = null;

  candidates.set(
    normalized,
    candidate,
  );

  return clone(candidate);
}

export function markCandidateError(
  symbol,
  error,
) {
  const normalized =
    requireSymbol(symbol);

  const candidate =
    candidates.get(normalized);

  if (!candidate) {
    throw new Error(
      `[CANDIDATE_REGISTRY] Candidate ${normalized} does not exist.`,
    );
  }

  candidate.researchStatus =
    RESEARCH_STATUS.ERROR;

  candidate.researchError =
    error instanceof Error
      ? error.message
      : String(
          error ??
            "Unknown deep research error",
        );

  candidate.researchCompletedAt =
    nowIso();

  candidates.set(
    normalized,
    candidate,
  );

  return clone(candidate);
}

export function removeCandidate(symbol) {
  const normalized =
    normalizeSymbol(symbol);

  if (!normalized) {
    return false;
  }

  return candidates.delete(
    normalized,
  );
}

export function clearCandidateRegistry() {
  candidates.clear();
}

export function getCandidateRegistryStats() {
  const list =
    Array.from(
      candidates.values(),
    );

  const byStatus = {};

  for (const candidate of list) {
    const status =
      candidate.researchStatus;

    byStatus[status] =
      (byStatus[status] ?? 0) + 1;
  }

  return {
    total: list.length,
    byStatus,
  };
}

export default {
  upsertCandidate,
  getCandidate,
  hasCandidate,
  listCandidates,
  markCandidateQueued,
  markCandidateRunning,
  markCandidateComplete,
  markCandidateRejected,
  markCandidateError,
  removeCandidate,
  clearCandidateRegistry,
  getCandidateRegistryStats,
};