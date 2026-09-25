import {
  complete,
  insufficient,
} from "./cryptoEngineUtils.js";

/**
 * Phase 6.44:
 * Coverage is accepted only when explicitly supplied upstream.
 * Availability and evidence count do not silently become 100% coverage.
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

function explicitConfidence(source) {
  const raw =
    source?.confidence ??
    source?.evidenceConfidence ??
    source?.sourceConfidence ??
    source?.providerConfidence ??
    null;

  return (
    raw !== null &&
    raw !== undefined &&
    raw !== "" &&
    Number.isFinite(Number(raw))
  )
    ? Number(raw)
    : 0;
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
    c?.preferredDirection ??
    "LONG";

  const bulk =
    finalIntelligence?.news;

  if (
    bulk?.available === false
  ) {
    return insufficient(
      "CRYPTO_NEWS_INTELLIGENCE",
      bulk,
    );
  }

  if (
    Number.isFinite(
      Number(
        bulk?.score,
      ),
    )
  ) {
    return withCoverage(
      complete(
        "CRYPTO_NEWS_INTELLIGENCE",
        bulk.score,
        d,
        {
          evidence:
            bulk?.evidence ?? [],
          confidence:
            bulk?.confidence ?? null,
          summary:
            bulk?.summary ?? null,
          source:
            "GPT_WEB_RESEARCH",
        },
        explicitConfidence(bulk),
      ),
      bulk,
    );
  }

  const m =
    c?.measurements ?? {};

  const x =
    m?.newsIntelligence ??
    {};

  const score =
    x?.score ??
    m?.newsScore;

  if (
    !Number.isFinite(
      Number(score),
    )
  ) {
    return insufficient(
      "CRYPTO_NEWS_INTELLIGENCE",
      x,
    );
  }

  return withCoverage(
    complete(
      "CRYPTO_NEWS_INTELLIGENCE",
      score,
      d,
      x,
      explicitConfidence(x),
    ),
    x,
  );
}
