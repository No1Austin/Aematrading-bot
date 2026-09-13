export const CRYPTO_RESEARCH_STATUS =
  Object.freeze({
    QUEUED: "QUEUED",
    RUNNING: "RUNNING",
    COMPLETE: "COMPLETE",
    FAILED: "FAILED",
  });

export const CRYPTO_RESEARCH_DECISION =
  Object.freeze({
    APPROVED: "APPROVED",
    REJECTED: "REJECTED",
    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",
  });

export const CRYPTO_CANDIDATE_TYPE =
  Object.freeze({
    CEX: "CEX",
    EMERGING: "EMERGING",
  });

export const CRYPTO_RESEARCH_POLICY =
  Object.freeze({
    minimumApprovalScore: 60,
    minimumEvidenceCoverage: 0.60,
    minimumTechnicalScore: 45,
    minimumFundamentalScore: 45,
    maximumCriticalFlags: 0,
    allowCexBotHandoff: true,
    allowEmergingBotHandoff: false,
  });

const finite =
  (value, fallback = 0) =>
    Number.isFinite(
      Number(value),
    )
      ? Number(value)
      : fallback;

export function getCryptoCandidateType(
  candidate,
) {
  const explicit =
    String(
      candidate?.candidateType ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    explicit === "CEX" ||
    explicit === "EMERGING"
  ) {
    return explicit;
  }

  return finite(
    candidate
      ?.venues
      ?.cexCount,
  ) >
    0
      ? "CEX"
      : "EMERGING";
}

export function evaluateCryptoResearchPolicy({
  candidate,
  researchScore = 0,
  evidenceCoverage = 0,
  criticalFlags = [],
  core = {},
  coreWeakness = [],
  policy =
    CRYPTO_RESEARCH_POLICY,
} = {}) {
  const candidateType =
    getCryptoCandidateType(
      candidate,
    );

  const reasons = [];

  if (
    candidate?.qualified !==
    true
  ) {
    reasons.push(
      "CANDIDATE_NOT_QUALIFIED",
    );
  }

  if (
    finite(
      researchScore,
    ) <
    policy.minimumApprovalScore
  ) {
    reasons.push(
      "RESEARCH_SCORE_BELOW_MINIMUM",
    );
  }

  if (
    finite(
      evidenceCoverage,
    ) <
    policy.minimumEvidenceCoverage
  ) {
    reasons.push(
      "INSUFFICIENT_EVIDENCE_COVERAGE",
    );
  }

  /*
   * Avoid duplicate:
   * FUNDAMENTAL_CORE_WEAKNESS + FUNDAMENTAL_DATA_MISSING
   */
  if (
    core?.technical ===
      null ||
    core?.technical ===
      undefined
  ) {
    reasons.push(
      "TECHNICAL_DATA_MISSING",
    );
  } else if (
    finite(
      core.technical,
    ) <
    policy.minimumTechnicalScore
  ) {
    reasons.push(
      "TECHNICAL_CORE_WEAKNESS",
    );
  }

  if (
    core?.fundamentals ===
      null ||
    core?.fundamentals ===
      undefined
  ) {
    reasons.push(
      "FUNDAMENTAL_DATA_MISSING",
    );
  } else if (
    finite(
      core.fundamentals,
    ) <
    policy.minimumFundamentalScore
  ) {
    reasons.push(
      "FUNDAMENTAL_CORE_WEAKNESS",
    );
  }

  /*
   * Only add non-core weakness reasons here.
   * Core reasons above are authoritative.
   */
  for (
    const reason
    of (
      Array.isArray(
        coreWeakness,
      )
        ? coreWeakness
        : []
    )
  ) {
    if (
      [
        "TECHNICAL_DATA_MISSING",
        "TECHNICAL_CORE_WEAKNESS",
        "FUNDAMENTAL_DATA_MISSING",
        "FUNDAMENTAL_CORE_WEAKNESS",
      ].includes(reason)
    ) {
      continue;
    }

    if (
      reason &&
      !reasons.includes(
        reason,
      )
    ) {
      reasons.push(
        reason,
      );
    }
  }

  if (
    (
      Array.isArray(
        criticalFlags,
      )
        ? criticalFlags
        : []
    ).length >
    policy.maximumCriticalFlags
  ) {
    reasons.push(
      "CRITICAL_RESEARCH_FLAG",
    );
  }

  const approved =
    reasons.length === 0;

  const insufficient =
    reasons.some(
      reason =>
        reason ===
          "INSUFFICIENT_EVIDENCE_COVERAGE" ||
        reason.endsWith(
          "_DATA_MISSING",
        ),
    );

  return {
    approved,

    decision:
      approved
        ? CRYPTO_RESEARCH_DECISION.APPROVED
        : insufficient
          ? CRYPTO_RESEARCH_DECISION.INSUFFICIENT_DATA
          : CRYPTO_RESEARCH_DECISION.REJECTED,

    candidateType,

    researchOnly:
      candidateType ===
      "EMERGING",

    botHandoffAllowed:
      approved &&
      candidateType ===
        "CEX",

    executionEligible:
      false,

    reasons,
  };
}

export default
  CRYPTO_RESEARCH_POLICY;
