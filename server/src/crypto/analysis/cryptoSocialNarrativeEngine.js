import {
  complete,
  insufficient,
} from "./cryptoEngineUtils.js";

/**
 * Phase 6.44:
 * Coverage is evidence representation, not confidence and not mere availability.
 * Only an explicit upstream coverage contract is accepted.
 */
function explicitCoverage(source) {
  const raw =
    source?.coverage ??
    source?.evidenceCoverage ??
    source?.availability?.coverage ??
    null;

  if (
    raw === null ||
    raw === undefined ||
    raw === "" ||
    !Number.isFinite(Number(raw))
  ) {
    return 0;
  }

  const value = Number(raw);
  return value > 1
    ? Math.max(0, Math.min(100, value))
    : Math.max(0, Math.min(1, value)) * 100;
}

function confidenceFromEvidence(source) {
  const candidates = [
    source?.confidence,
    source?.evidenceConfidence,
    source?.sourceConfidence,
    source?.providerConfidence,
  ];

  for (const candidate of candidates) {
    if (
      candidate !== null &&
      candidate !== undefined &&
      candidate !== "" &&
      Number.isFinite(Number(candidate))
    ) {
      return Number(candidate);
    }
  }

  const evidence =
    Array.isArray(source?.evidence)
      ? source.evidence
      : [];

  if (evidence.length > 0) {
    return Math.min(
      85,
      45 + evidence.length * 8,
    );
  }

  return 40;
}

function withCoverage(result, source) {
  const coverage = explicitCoverage(source);

  return {
    ...result,
    coverage,
    evidenceCoverage: coverage,
    evidence: {
      ...(result?.evidence &&
      typeof result.evidence === "object" &&
      !Array.isArray(result.evidence)
        ? result.evidence
        : {
            evidence:
              result?.evidence ?? [],
          }),
      coverage,
      evidenceCoverage: coverage,
      coverageAuthority:
        coverage > 0
          ? "EXPLICIT_UPSTREAM_COVERAGE"
          : "UNVERIFIED_COVERAGE_FAIL_CLOSED",
    },
  };
}

export default async function run(
  c,
  {
    finalIntelligence = null,
  } = {},
) {
  const d =
    c?.preferredDirection ?? "LONG";

  const bulk =
    finalIntelligence
      ?.socialNarrative;

  if (
    bulk?.available === false
  ) {
    return insufficient(
      "CRYPTO_SOCIAL_NARRATIVE",
      bulk,
    );
  }

  if (
    Number.isFinite(
      Number(bulk?.score),
    )
  ) {
    return withCoverage(
      complete(
        "CRYPTO_SOCIAL_NARRATIVE",
        bulk.score,
        d,
        bulk.evidence,
        confidenceFromEvidence(bulk),
      ),
      bulk,
    );
  }

  const m =
    c?.measurements ?? {};

  const x =
    m?.socialNarrative ?? {};

  const score =
    x?.score ??
    m?.socialScore;

  if (
    !Number.isFinite(
      Number(score),
    )
  ) {
    return insufficient(
      "CRYPTO_SOCIAL_NARRATIVE",
      x,
    );
  }

  return withCoverage(
    complete(
      "CRYPTO_SOCIAL_NARRATIVE",
      score,
      d,
      x,
      confidenceFromEvidence(x),
    ),
    x,
  );
}
