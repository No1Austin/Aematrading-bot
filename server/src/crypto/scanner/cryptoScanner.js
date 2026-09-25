/**
 * ============================================================
 * AEMA CRYPTO SCANNER — PHASE 6.30
 * TECHNICAL + FUNDAMENTAL + SUPPORTING RESEARCH
 * ============================================================
 *
 * Preserves Phase 2.4 discovery/qualification behavior.
 *
 * Selected deep-research candidates may additionally be scored by:
 * - Momentum   20%
 * - Liquidity  20%
 * - OnChain    18%
 * - Narrative  12%
 * - News       12%
 * - Risk       18%
 *
 * Missing engine evidence is NOT converted into directional evidence.
 * Available engine weights are re-normalized.
 *
 * Research only.
 * No execution authority.
 */

import {
  CRYPTO_SCANNER_CONFIG,
} from "./cryptoScannerConfig.js";

import qualifyCryptoCandidate from
  "./cryptoCandidateQualificationEngine.js";

import {
  CRYPTO_CANDIDATE_TYPE,
} from "../policy/cryptoCandidateActionPolicy.js";

import {
  rankCryptoOpportunities,
} from "../opportunity/cryptoOpportunityRankingEngine.js";

import evaluateCryptoQualification2 from
  "../qualification/cryptoQualification2Engine.js";

import {
  revalidateQualifiedCryptoCandidates,
} from "../revalidation/cryptoFinalRevalidationOrchestrator.js";

import {
  coordinateCryptoExecutableOpportunities,
} from "../trading/orchestration/cryptoExecutableOpportunityCoordinator.js";

import {
  evaluateCryptoPaperExecutionAuthorities,
} from "../execution/cryptoPaperExecutionAuthorityGate.js";

import {
  buildCryptoPaperAccountSnapshot,
} from "../trading/runtime/cryptoPaperAccountSnapshot.js";

import {
  buildCryptoFundamentalEvidenceBatch,
} from "../data/providers/cryptoFundamentalEvidenceProvider.js";

import {
  getCryptoGptIntelligence,
} from "../intelligence/cryptoGptIntelligenceProvider.js";

import {
  runCryptoScannerTechnical,
  runCryptoScannerFundamental,
  runCryptoScannerMomentum,
  runCryptoScannerMarketStructure,
  runCryptoScannerLiquidity,
  runCryptoScannerOnChain,
  runCryptoScannerNarrative,
  runCryptoScannerNews,
  runCryptoScannerRisk,
} from "./cryptoScannerEngineAdapters.js";


const SIX_ENGINE_WEIGHTS =
  Object.freeze({
    momentum: 0.20,
    liquidity: 0.20,
    onChain: 0.18,
    narrative: 0.12,
    news: 0.12,
    risk: 0.18,
  });


/**
 * Phase 6.8 canonical Deep Research architecture.
 *
 * Technical and Fundamental are independent mandatory research pillars.
 * Supporting intelligence receives the remaining 60%.
 *
 * IMPORTANT:
 * Fundamental already consumes market-quality / protocol evidence.
 * Technical is already its own pillar.
 *
 * Phase 6.22 evidence de-duplication:
 *
 * Canonical Supporting contains ONLY Narrative and News.
 *
 * Risk is deliberately excluded from the canonical Supporting score because
 * the Risk engine consumes Liquidity, OnChain, Project Integrity and Market
 * Structure evidence that overlaps the Fundamental and Technical pillars.
 *
 * Risk remains fully visible as:
 * - a legacy/public diagnostic engine
 * - an explicit safety-quality assessment
 * - a fresh final-revalidation safety gate
 *
 * This keeps risk authority where it belongs without counting correlated
 * evidence again inside the canonical 20/20/60 research score.
 */
const DEEP_RESEARCH_WEIGHTS =
  Object.freeze({
    technical: 0.20,
    fundamental: 0.20,
    supporting: 0.60,
  });

const CANONICAL_SUPPORTING_WEIGHTS =
  Object.freeze({
    narrative: 0.50,
    news: 0.50,
  });


function finite(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}


function finiteOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function keyFor(
  candidate,
) {
  return String(
    candidate?.assetId ??
    candidate?.symbol ??
    "",
  )
    .trim()
    .toLowerCase();
}


function rank(
  rows,
) {
  return [...rows]
    .sort(
      (
        a,
        b,
      ) =>
        finite(
          b?.scannerScore,
        ) -
          finite(
            a?.scannerScore,
          ) ||
        finite(
          b?.directionEdge,
        ) -
          finite(
            a?.directionEdge,
          ),
    );
}


function emergingScore(
  candidate,
) {
  return finite(
    candidate
      ?.measurements
      ?.discoveryIntelligence
      ?.emergingProject
      ?.score,
  );
}


function buildSelected({
  researchable,
  maximumCandidates,
  config,
}) {
  const composition =
    config
      .discovery
      .candidateComposition;

  const emerging =
    researchable
      .filter(
        candidate => {
          if (
            candidate
              ?.candidateType !==
            CRYPTO_CANDIDATE_TYPE
              .EMERGING
          ) {
            return false;
          }

          return (
            emergingScore(
              candidate,
            ) >=
            composition
              .minimumEmergingIntelligenceScore
          );
        },
      )
      .sort(
        (
          a,
          b,
        ) =>
          emergingScore(
            b,
          ) -
            emergingScore(
              a,
            ) ||
          finite(
            b?.scannerScore,
          ) -
            finite(
              a?.scannerScore,
          ),
      )
      .slice(
        0,
        Math.min(
          maximumCandidates,
          composition
            .maximumEmergingCandidates,
        ),
      );

  const emergingKeys =
    new Set(
      emerging.map(
        keyFor,
      ),
    );

  const general =
    researchable
      .filter(
        candidate =>
          !emergingKeys.has(
            keyFor(
              candidate,
            ),
          ),
      )
      .slice(
        0,
        Math.max(
          0,
          maximumCandidates -
            emerging.length,
        ),
      );

  return rank([
    ...general,
    ...emerging,
  ]);
}


function engineAvailable(
  result,
) {
  return (
    result?.status === "READY" &&
    result
      ?.availability
      ?.available === true &&
    finiteOrNull(
      result?.score,
    ) !== null
  );
}


function aggregateSixEngines(
  engines,
) {
  let weightedScore = 0;
  let availableWeight = 0;

  const availability = {};

  for (
    const [
      key,
      configuredWeight,
    ] of Object.entries(
      SIX_ENGINE_WEIGHTS,
    )
  ) {
    const result =
      engines?.[key] ??
      null;

    const available =
      engineAvailable(
        result,
      );

    availability[key] = {
      available,

      configuredWeight,

      score:
        available
          ? finiteOrNull(
              result?.score,
            )
          : null,

      status:
        result?.status ??
        "EVIDENCE_UNAVAILABLE",

      reason:
        result
          ?.availability
          ?.reason ??
        null,
    };

    if (!available) {
      continue;
    }

    weightedScore +=
      Number(result.score) *
      configuredWeight;

    availableWeight +=
      configuredWeight;
  }

  const score =
    availableWeight > 0
      ? weightedScore /
        availableWeight
      : null;

  return {
    score,

    coverage:
      availableWeight * 100,

    availableWeight,

    configuredWeight:
      1,

    availableEngineCount:
      Object.values(
        availability,
      )
        .filter(
          row =>
            row.available,
        )
        .length,

    totalEngineCount:
      Object.keys(
        SIX_ENGINE_WEIGHTS,
      ).length,

    availability,
  };
}


function aggregateConfiguredEngines(
  engines,
  configuredWeights,
) {
  let weightedScore = 0;
  let availableWeight = 0;

  /*
   * Phase 6.44:
   * Supporting confidence and coverage follow represented evidence,
   * not engine availability alone.
   */
  let weightedConfidence = 0;
  let representedEvidenceWeight = 0;

  const availability = {};

  for (
    const [
      key,
      configuredWeight,
    ] of Object.entries(
      configuredWeights,
    )
  ) {
    const result =
      engines?.[key] ??
      null;

    const available =
      engineAvailable(
        result,
      );

    const coverage01 =
      normalizedCoverage01(
        result,
        false,
      );

    const representedWeight =
      available
        ? configuredWeight *
          coverage01
        : 0;

    availability[key] = {
      available,
      configuredWeight,
      representedWeight,
      coverage:
        coverage01 * 100,
      coverage01,
      score:
        available
          ? finiteOrNull(
              result?.score,
            )
          : null,
      confidence:
        available
          ? finiteOrNull(
              result?.confidence,
            )
          : null,
      status:
        result?.status ??
        "EVIDENCE_UNAVAILABLE",
      reason:
        result
          ?.availability
          ?.reason ??
        null,
    };

    if (!available) {
      continue;
    }

    /*
     * Score semantics remain unchanged:
     * available Narrative/News scores are re-normalized by the
     * configured 50/50 Supporting weights.
     */
    weightedScore +=
      Number(
        result.score,
      ) *
      configuredWeight;

    availableWeight +=
      configuredWeight;

    /*
     * Confidence authority follows represented evidence only.
     * An available engine with unverified coverage receives no
     * represented-evidence confidence authority.
     */
    weightedConfidence +=
      (
        finiteOrNull(
          result?.confidence,
        ) ??
        0
      ) *
      representedWeight;

    representedEvidenceWeight +=
      representedWeight;
  }

  return {
    score:
      availableWeight > 0
        ? weightedScore /
          availableWeight
        : null,

    confidence:
      representedEvidenceWeight > 0
        ? weightedConfidence /
          representedEvidenceWeight
        : 0,

    coverage:
      representedEvidenceWeight *
      100,

    availableWeight,

    representedEvidenceWeight,

    availability,
  };
}


function normalizedCoverage01(
  result,
  available = false,
) {
  const raw =
    finiteOrNull(
      result?.coverage ??
      result?.evidenceCoverage ??
      result?.availability?.coverage ??
      result?.evidence?.coverage,
    );

  if (raw === null) {
    return available
      ? 1
      : 0;
  }

  return raw > 1
    ? Math.max(
        0,
        Math.min(
          1,
          raw / 100,
        ),
      )
    : Math.max(
        0,
        Math.min(
          1,
          raw,
        ),
      );
}

function aggregateDeepResearch({
  technical,
  fundamental,
  supporting,
} = {}) {
  const pillars = {
    technical: {
      result:
        technical,
      weight:
        DEEP_RESEARCH_WEIGHTS
          .technical,
    },

    fundamental: {
      result:
        fundamental,
      weight:
        DEEP_RESEARCH_WEIGHTS
          .fundamental,
    },

    supporting: {
      result:
        supporting,
      weight:
        DEEP_RESEARCH_WEIGHTS
          .supporting,
    },
  };

  let weightedScore = 0;
  let weightedConfidence = 0;
  let availableWeight = 0;
  let representedEvidenceWeight = 0;

  const availability = {};

  for (
    const [
      key,
      pillar,
    ] of Object.entries(
      pillars,
    )
  ) {
    const result =
      pillar.result;

    const available =
      key === "supporting"
        ? finiteOrNull(
            result?.score,
          ) !== null
        : engineAvailable(
            result,
          );

    const coverage01 =
      normalizedCoverage01(
        result,
        available,
      );

    const representedWeight =
      available
        ? pillar.weight *
          coverage01
        : 0;

    availability[key] = {
      available,
      configuredWeight:
        pillar.weight,
      representedWeight,
      score:
        available
          ? finiteOrNull(
              result?.score,
            )
          : null,
      confidence:
        available
          ? finiteOrNull(
              result?.confidence,
            )
          : null,
      coverage:
        coverage01 * 100,
      coverage01,
      status:
        available
          ? "READY"
          : (
              result?.status ??
              "EVIDENCE_UNAVAILABLE"
            ),
    };

    if (!available) {
      continue;
    }

    /*
     * Score semantics remain unchanged:
     * available canonical pillars are re-normalized by their configured
     * 20/20/60 weights. Evidence coverage is reported independently and
     * must not silently turn missing evidence into a zero score.
     */
    weightedScore +=
      Number(
        result.score,
      ) *
      pillar.weight;

    /*
     * Phase 6.38 — confidence authority follows represented evidence.
     * A partially covered pillar cannot receive its full configured
     * confidence influence.
     */
    weightedConfidence +=
      (
        finiteOrNull(
          result?.confidence,
        ) ??
        0
      ) *
      representedWeight;

    availableWeight +=
      pillar.weight;

    representedEvidenceWeight +=
      representedWeight;
  }

  return {
    score:
      availableWeight > 0
        ? weightedScore /
          availableWeight
        : null,

    confidence:
      representedEvidenceWeight > 0
        ? weightedConfidence /
          representedEvidenceWeight
        : 0,

    /*
     * Phase 6.26:
     * canonical research coverage now represents underlying evidence:
     *
     * Technical   configured 20% × Technical internal coverage
     * Fundamental configured 20% × Fundamental internal coverage
     * Supporting  configured 60% × Supporting internal coverage
     *
     * Example:
     * T=50%, F=50%, S=50%
     * => 0.20*.50 + 0.20*.50 + 0.60*.50 = 0.50 => 50%.
     */
    coverage:
      representedEvidenceWeight *
      100,

    representedEvidenceWeight,

    /*
     * Retained for compatibility: this is the sum of configured weights
     * whose top-level pillar returned a score, not evidence completeness.
     */
    availableWeight,

    availability,

    technicalAvailable:
      availability
        .technical
        .available,

    fundamentalAvailable:
      availability
        .fundamental
        .available,

    supportingAvailable:
      availability
        .supporting
        .available,
  };
}

async function runSixEngineResearch(
  candidate,
  sharedResearch = {},
) {
  const sharedFundamentalEvidence =
    sharedResearch
      ?.fundamentalEvidenceByKey
      ?.get(
        keyFor(candidate),
      ) ??
    null;

  const context = {
    ...candidate,

    sharedFundamentalEvidence,

    sharedIntelligencePromise:
      sharedResearch
        ?.gptPromiseFactory
        ? sharedResearch
            .gptPromiseFactory(
              candidate,
            )
        : null,

    asset:
      candidate?.asset ??
      candidate,

    measurements:
      candidate?.measurements ??
      candidate,

    preferredDirection:
      candidate?.preferredDirection ??
      candidate?.direction ??
      "LONG",

    executionAuthority:
      false,

    liveExecution:
      false,
  };

  /**
   * Technical + Fundamental are first-class pillars.
   *
   * The six legacy/public engines are still produced for diagnostics and
   * UI compatibility. Their scores do not all flow into the canonical
   * research score because Technical/Fundamental now own overlapping
   * evidence domains.
   */
  /*
   * Phase 6.23 — shared evidence execution graph.
   *
   * Stage A executes independent/base research once.
   * Stage B consumes those normalized results.
   *
   * This prevents:
   * - Momentum from rerunning Technical
   * - Momentum/Risk from separately rerunning Market Structure
   * - Risk from rerunning Liquidity
   * - Risk from rerunning OnChain
   *
   * GPT-backed Narrative/News/Risk continue to use the existing shared
   * intelligence contract in the adapters.
   */
  const [
    technical,
    fundamental,
    liquidity,
    onChain,
    marketStructure,
    narrative,
    news,
  ] =
    await Promise.all([
      runCryptoScannerTechnical(
        context,
      ),

      runCryptoScannerFundamental(
        context,
      ),

      runCryptoScannerLiquidity(
        context,
      ),

      runCryptoScannerOnChain(
        context,
      ),

      runCryptoScannerMarketStructure(
        context,
      ),

      runCryptoScannerNarrative(
        context,
      ),

      runCryptoScannerNews(
        context,
      ),
    ]);

  const sharedEngineResults = {
    technical,
    liquidity,
    onChain,
    marketStructure,
  };

  const sharedContext = {
    ...context,
    sharedEngineResults,
  };

  const [
    momentum,
    risk,
  ] =
    await Promise.all([
      runCryptoScannerMomentum(
        sharedContext,
      ),

      runCryptoScannerRisk(
        sharedContext,
      ),
    ]);

  const engines = {
    momentum,
    liquidity,
    onChain,
    marketStructure,
    narrative,
    news,
    risk,
  };

  /*
   * Legacy six-engine aggregate is retained as diagnostic metadata only.
   */
  const legacyAggregate =
    aggregateSixEngines(
      engines,
    );

  /*
   * Phase 6.22 canonical Supporting 60% excludes:
   * - Momentum: overlaps Technical
   * - Liquidity: represented inside Fundamental
   * - OnChain: represented inside Fundamental
   * - Risk: composite safety engine that reuses Liquidity, OnChain,
   *   Project Integrity and Market Structure evidence
   *
   * Risk remains visible in `engines.risk`, in the legacy diagnostic
   * aggregate, and in final market/risk revalidation. It is not deleted;
   * it is simply prevented from double-counting correlated evidence in
   * the canonical research score.
   */
  const supporting =
    aggregateConfiguredEngines(
      engines,
      CANONICAL_SUPPORTING_WEIGHTS,
    );

  const canonical =
    aggregateDeepResearch({
      technical,
      fundamental,
      supporting,
    });

  const supportingPillar = {
    status:
      supporting.score !== null
        ? "READY"
        : "EVIDENCE_UNAVAILABLE",

    available:
      supporting.score !== null,

    score:
      supporting.score,

    confidence:
      supporting.confidence,

    coverage:
      supporting.coverage,

    availableWeight:
      supporting.availableWeight,

    representedEvidenceWeight:
      supporting.representedEvidenceWeight,

    weights:
      CANONICAL_SUPPORTING_WEIGHTS,

    availability:
      supporting.availability,

    evidencePolicy: {
      phase:
        "6.44",

      coverageAuthority:
        "REPRESENTED_ENGINE_INTERNAL_EVIDENCE",

      confidenceAuthority:
        "REPRESENTED_ENGINE_INTERNAL_EVIDENCE",

      availabilityAloneMeansFullCoverage:
        false,

      canonicalSources: [
        "narrative",
        "news",
      ],
      excludedCorrelatedSources: [
        "momentum",
        "liquidity",
        "onChain",
        "risk",
      ],
      riskRole:
        "DIAGNOSTIC_AND_FINAL_REVALIDATION_SAFETY_ONLY",
      riskIncludedInCanonicalScore:
        false,
    },
  };

  const qualification2 =
    evaluateCryptoQualification2(
      candidate,
      {
        technical,
        fundamental,
        supporting:
          supportingPillar,
      },
    );

  return {
    ...candidate,

    discoveryScannerScore:
      candidate?.scannerScore ??
      null,

    /*
     * Canonical score is now:
     * Technical 20% + Fundamental 20% + Supporting 60%.
     * Missing pillars are excluded and available pillar weights are
     * renormalized. Coverage tells the caller what was actually present.
     */
    scannerScore:
      canonical.score ??
      candidate?.scannerScore ??
      null,

    researchScore:
      canonical.score,

    researchConfidence:
      canonical.confidence,

    researchCoverage:
      canonical.coverage,

    researchAvailableWeight:
      canonical.availableWeight,

    researchRepresentedEvidenceWeight:
      canonical
        .representedEvidenceWeight,

    researchCoverageContract: {
      phase:
        "6.38",
      scale:
        "0_TO_100",
      formula:
        "TECHNICAL_20_X_INTERNAL_COVERAGE_PLUS_FUNDAMENTAL_20_X_INTERNAL_COVERAGE_PLUS_SUPPORTING_60_X_INTERNAL_COVERAGE",
      scoreRenormalizationChanged:
        false,
      missingEvidenceBecomesZeroScore:
        false,
    },

    researchArchitecture:
      "OPPORTUNITY_RANKING_PLUS_TECHNICAL_20_FUNDAMENTAL_20_NON_OVERLAPPING_SUPPORTING_60",

    researchExecutionGraph: {
      phase:
        "6.26",
      sharedBaseResults: [
        "technical",
        "liquidity",
        "onChain",
        "marketStructure",
      ],
      downstreamConsumers: {
        momentum: [
          "technical",
          "marketStructure",
        ],
        risk: [
          "liquidity",
          "onChain",
          "marketStructure",
        ],
      },
      duplicateBaseEngineExecution:
        false,
    },

    researchWeights:
      DEEP_RESEARCH_WEIGHTS,

    pillars: {
      technical,
      fundamental,

      supporting:
        supportingPillar,
    },

    /*
     * Phase 6.10 Qualification 2 is now executed here, immediately after
     * Deep Research. It can return LONG, SHORT or NO_TRADE, but it still
     * has no execution authority.
     */
    qualification2,

    qualification2Readiness: {
      technicalAvailable:
        canonical
          .technicalAvailable,

      fundamentalAvailable:
        canonical
          .fundamentalAvailable,

      supportingAvailable:
        canonical
          .supportingAvailable,

      readyForQualification2:
        canonical
          .technicalAvailable &&
        canonical
          .fundamentalAvailable,

      evaluated:
        true,

      qualified:
        qualification2
          ?.qualified === true,

      decision:
        qualification2
          ?.decision ??
        "NO_TRADE",

      nextStage:
        qualification2
          ?.nextStage ??
        "NONE",
    },

    /*
     * Keep the six existing engines for UI/backward compatibility.
     */
    engines,

    engineAvailability:
      legacyAggregate
        .availability,

    legacySixEngineResearch: {
      score:
        legacyAggregate.score,

      coverage:
        legacyAggregate.coverage,

      availableWeight:
        legacyAggregate
          .availableWeight,

      availableEngineCount:
        legacyAggregate
          .availableEngineCount,

      totalEngineCount:
        legacyAggregate
          .totalEngineCount,

      canonical:
        false,

      diagnosticOnly:
        true,
    },

    researchOnly:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}



function createBoundedGptResearchPromise(asset, options = {}) {
  const hasCredential =
    Boolean(
      String(
        process.env.OPENAI_API_KEY ??
        process.env.OPENAI_API_KEY_CRYPTO ??
        "",
      ).trim(),
    );

  if (!hasCredential) {
    return Promise.resolve({
      approved: false,
      intelligence: null,
      error: "OPENAI_API_KEY_REQUIRED",
      fastFail: true,
    });
  }

  const timeoutMs =
    Math.max(
      1000,
      Number(
        options?.timeoutMs ??
        process.env.CRYPTO_GPT_SCANNER_TIMEOUT_MS ??
        45000,
      ) || 45000,
    );

  let timeoutId = null;

  const providerPromise =
    getCryptoGptIntelligence(
      asset,
      { refresh: false },
    )
      .then(intelligence => ({
        approved: Boolean(intelligence),
        intelligence: intelligence ?? null,
        error: intelligence
          ? null
          : "GPT_INTELLIGENCE_UNAVAILABLE",
      }))
      .catch(error => ({
        approved: false,
        intelligence: null,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      }));

  const timeoutPromise =
    new Promise(resolve => {
      timeoutId =
        setTimeout(
          () =>
            resolve({
              approved: false,
              intelligence: null,
              error: "GPT_INTELLIGENCE_TIMEOUT",
            }),
          timeoutMs,
        );
    });

  return Promise.race([
    providerPromise,
    timeoutPromise,
  ]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}


/**
 * Reusable single-asset Deep Research entry point.
 *
 * This executes research only. It does NOT run discovery selection, final
 * revalidation, paper authority, order construction, or execution.
 * It is the shared authority used by the manual Engines endpoint.
 */
export async function researchCryptoCandidate(
  candidate = {},
) {
  const asset = candidate?.asset ?? candidate;

  if (!asset) {
    throw new Error("CRYPTO_ASSET_REQUIRED");
  }

  let fundamentalEvidence = null;

  try {
    const fundamentalBatch =
      await buildCryptoFundamentalEvidenceBatch(
        [candidate],
        { refresh: false },
      );

    fundamentalEvidence =
      Array.isArray(fundamentalBatch?.results)
        ? fundamentalBatch.results[0] ?? null
        : null;
  } catch {
    fundamentalEvidence = null;
  }

  const gptPromise =
    createBoundedGptResearchPromise(
      asset,
      {
        timeoutMs:
          candidate?.metadata?.gptIntelligenceTimeoutMs ??
          45000,
      },
    );

  return runSixEngineResearch(
    candidate,
    {
      fundamentalEvidenceByKey: new Map(
        fundamentalEvidence
          ? [[keyFor(candidate), fundamentalEvidence]]
          : [],
      ),
      gptPromiseFactory: () => gptPromise,
    },
  );
}


async function enrichDeepResearchCandidates(
  candidates,
) {
  const eligible =
    candidates.filter(
      candidate =>
        candidate?.deepResearchEligible === true,
    );

  let fundamentalBatch = null;

  try {
    fundamentalBatch =
      await buildCryptoFundamentalEvidenceBatch(
        eligible,
        { refresh: false },
      );
  } catch {
    fundamentalBatch = null;
  }

  const fundamentalEvidenceByKey =
    new Map();

  if (Array.isArray(fundamentalBatch?.results)) {
    eligible.forEach((candidate, index) => {
      const evidence =
        fundamentalBatch.results[index] ?? null;

      if (evidence) {
        fundamentalEvidenceByKey.set(
          keyFor(candidate),
          evidence,
        );
      }
    });
  }

  /*
   * One promise registry per research cycle.
   * Narrative, News and Risk/Event evidence receive the same promise
   * for the same candidate instead of independently entering GPT.
   */
  const gptPromises = new Map();

  const gptPromiseFactory =
    candidate => {
      const key = keyFor(candidate);

      if (!key) {
        return Promise.resolve({
          approved: false,
          intelligence: null,
          error: "CRYPTO_ASSET_IDENTITY_REQUIRED",
        });
      }

      if (gptPromises.has(key)) {
        return gptPromises.get(key);
      }

      const asset =
        candidate?.asset ?? candidate;

      const promise =
        createBoundedGptResearchPromise(
          asset,
          {
            timeoutMs:
              candidate?.metadata?.gptIntelligenceTimeoutMs ??
              45000,
          },
        );

      gptPromises.set(key, promise);
      return promise;
    };

  const sharedResearch = {
    fundamentalEvidenceByKey,
    gptPromiseFactory,
  };

  return Promise.all(
    candidates.map(
      async candidate => {
        if (
          candidate?.deepResearchEligible !== true
        ) {
          return candidate;
        }

        try {
          const enriched =
            await runSixEngineResearch(
              candidate,
              sharedResearch,
            );

          return {
            ...enriched,

            sharedResearchGraph: {
              phase: "6.27",
              fundamentalEvidence:
                fundamentalEvidenceByKey.has(
                  keyFor(candidate),
                )
                  ? "BATCH_SHARED"
                  : "FALLBACK_OR_UNAVAILABLE",
              onChainEvidence:
                fundamentalEvidenceByKey.has(keyFor(candidate))
                  ? "REUSED_FROM_FUNDAMENTAL_EVIDENCE"
                  : "UNAVAILABLE",
              gptIntelligence:
                "ONE_PROMISE_PER_ASSET",
              gptConsumers: [
                "narrative",
                "news",
                "risk_events",
              ],
              providerAuthority:
                "RESEARCH_ONLY",
              executionAuthority: false,
              liveExecution: false,
            },
          };
        } catch (error) {
          return {
            ...candidate,
            researchStatus: "RESEARCH_ERROR",
            researchError:
              error?.message ?? String(error),
            researchOnly: true,
            executionAuthority: false,
            liveExecution: false,
          };
        }
      },
    ),
  );
}

export async function scanCryptoMarket({
  measurements = [],
  config =
    CRYPTO_SCANNER_CONFIG,
  maximumCandidates =
    config
      .discovery
      .maximumCandidates,

  /**
   * Must fetch a NEW canonical asset snapshot for final revalidation.
   * If omitted, Qualification-2 candidates fail closed at revalidation.
   */
  refreshCandidateAsset = null,

  /**
   * Phase 6.17 — existing shared paper runtime authorities.
   * If any are absent, the paper execution gate fails closed.
   */
  paperLedger = null,
  paperRuntime = null,
  runtimeSupervisor = null,
  paperExecutionGateOptions = {},

  /**
   * Phase 6.31 — executable opportunity coordination.
   *
   * These contexts/providers are passed to the existing trading
   * intelligence pipeline for evaluation only. No order is executed here.
   */
  executableOpportunityOptions = {},

  /**
   * Phase 6.33 — executable-entry evidence.
   *
   * These are intentionally explicit scanner inputs so the trading
   * intelligence layer does not have to invent execution/risk/account data.
   *
   * Each value may be supplied directly in executableOpportunityOptions,
   * or through the provider callbacks below.
   */
  executableMarket = {},
  executableAccount = {},
  executableExecutionContext = {},
  executableEntryRiskContext = {},

  executableMarketProvider = null,
  executableAccountProvider = null,
  executableExecutionContextProvider = null,
  executableEntryRiskContextProvider = null,
} = {}) {
  const startedAt =
    new Date()
      .toISOString();

  const allResults =
    Array.isArray(
      measurements,
    )
      ? measurements.map(
          measurement =>
            qualifyCryptoCandidate(
              measurement,
              config,
            ),
        )
      : [];

  /**
   * Initial qualified/researchable universe.
   */
  const researchable =
    rank(
      allResults.filter(
        result =>
          result?.qualified ===
          true,
      ),
    );

  /**
   * Strong discovery signals only.
   */
  const highInterest =
    rank(
      allResults.filter(
        result =>
          result?.highInterest ===
          true,
      ),
    );

  /**
   * ============================================================
   * PHASE 6.9 — OPPORTUNITY RANKING
   * ============================================================
   *
   * Qualification 1 decides eligibility.
   * Opportunity Ranking decides research priority.
   *
   * The historical highInterest >= threshold concept remains in the
   * response for compatibility, but it no longer controls which assets
   * are selected for Deep Research.
   */
  const opportunityRanking =
    rankCryptoOpportunities(
      researchable,
    );

  const longSlots =
    Math.ceil(
      maximumCandidates / 2,
    );

  const shortSlots =
    Math.floor(
      maximumCandidates / 2,
    );

  const selectedKeys =
    new Set();

  const selectedBeforeResearch = [];

  const addCandidate =
    candidate => {
      const key =
        keyFor(
          candidate,
        );

      if (
        !key ||
        selectedKeys.has(
          key,
        ) ||
        selectedBeforeResearch.length >=
          maximumCandidates
      ) {
        return;
      }

      selectedKeys.add(
        key,
      );

      selectedBeforeResearch.push(
        candidate,
      );
    };

  opportunityRanking
    .longRanked
    .slice(
      0,
      longSlots,
    )
    .forEach(
      addCandidate,
    );

  opportunityRanking
    .shortRanked
    .slice(
      0,
      shortSlots,
    )
    .forEach(
      addCandidate,
    );

  /*
   * Fill unused slots with the strongest remaining directional
   * opportunities regardless of side. This prevents a thin LONG or
   * SHORT side from wasting research capacity.
   */
  [
    ...opportunityRanking
      .longRanked,
    ...opportunityRanking
      .shortRanked,
  ]
    .sort(
      (a, b) =>
        finite(
          b?.researchPriorityScore,
        ) -
        finite(
          a?.researchPriorityScore,
        ) ||
        finite(
          b?.opportunityRanking
            ?.coverage,
        ) -
        finite(
          a?.opportunityRanking
            ?.coverage,
        ),
    )
    .forEach(
      addCandidate,
    );

  /**
   * Only selected candidates marked deepResearchEligible enter
   * the six-engine research layer.
   */
  const enrichedCandidates =
    await enrichDeepResearchCandidates(
      selectedBeforeResearch,
    );

  const candidates =
    rank(
      enrichedCandidates,
    );

  const cexCandidates =
    candidates.filter(
      candidate =>
        candidate
          ?.candidateType ===
        CRYPTO_CANDIDATE_TYPE.CEX,
    );

  const emergingCandidates =
    candidates.filter(
      candidate =>
        candidate
          ?.candidateType ===
        CRYPTO_CANDIDATE_TYPE
          .EMERGING,
    );

  const deepResearchCandidates =
    candidates.filter(
      candidate =>
        candidate
          ?.deepResearchEligible ===
        true,
    );


  const qualification2QualifiedCandidates =
    deepResearchCandidates.filter(
      candidate =>
        candidate
          ?.qualification2
          ?.qualified === true,
    );

  const qualification2LongCandidates =
    qualification2QualifiedCandidates.filter(
      candidate =>
        candidate
          ?.qualification2
          ?.decision === "LONG",
    );

  const qualification2ShortCandidates =
    qualification2QualifiedCandidates.filter(
      candidate =>
        candidate
          ?.qualification2
          ?.decision === "SHORT",
    );

  const qualification2NoTradeCandidates =
    deepResearchCandidates.filter(
      candidate =>
        candidate
          ?.qualification2
          ?.decision === "NO_TRADE",
    );


  /**
   * Phase 6.13 — only Qualification-2-approved candidates reach final
   * revalidation. The orchestrator requires a genuine refresh callback.
   */
  const revalidatedCandidates =
    await revalidateQualifiedCryptoCandidates(
      qualification2QualifiedCandidates,
      {
        refreshCandidateAsset,
      },
    );

  const finalRevalidatedCandidates =
    revalidatedCandidates.filter(
      candidate =>
        candidate
          ?.finalRevalidation
          ?.approved === true,
    );

  const finalNoTradeCandidates =
    revalidatedCandidates.filter(
      candidate =>
        candidate
          ?.finalRevalidation
          ?.approved !== true,
    );

  /**
   * ============================================================
   * PHASE 6.31 — EXECUTABLE OPPORTUNITY COORDINATION
   * ============================================================
   *
   * Final-revalidated candidates are now evaluated through the
   * existing trading-intelligence pipeline BEFORE paper authority.
   *
   * Each candidate receives:
   * - trading engine evaluation
   * - LONG / SHORT decision
   * - trade-entry qualification
   * - futures risk plan
   *
   * The executable selector then compares the surviving setups and
   * selects the strongest current opportunity(s).
   *
   * IMPORTANT:
   * - research score is not the final trade decision
   * - this stage grants no execution authority
   * - if nothing is executable, the result is NO_TRADE
   */
  /*
   * Phase 6.56 — shared paper-account truth for executable evaluation.
   * Uses the same persistent ledger owned by the shared runtime container.
   * Explicit caller-supplied account providers continue to take precedence.
   * No synthetic/default account equity is created here.
   */
  const sharedPaperAccountProvider =
    paperLedger
      ? async () => {
          const snapshot =
            buildCryptoPaperAccountSnapshot({
              ledger: paperLedger,
            });

          return {
            ...snapshot,
            accountEquity: snapshot.equity,
            source: "SHARED_PAPER_ACCOUNT_LEDGER",
            paperExecution: true,
            executionAuthority: false,
            liveExecution: false,
          };
        }
      : null;

  const executableOpportunityCoordination =
    await coordinateCryptoExecutableOpportunities({
      candidates:
        finalRevalidatedCandidates,

      maximumSelections:
        executableOpportunityOptions
          ?.maximumSelections ??
        1,

      /**
       * Caller-supplied options remain supported for backward compatibility.
       * Explicit scanner inputs below only fill fields that were not already
       * supplied through executableOpportunityOptions.
       */
      ...executableOpportunityOptions,

      market:
        executableOpportunityOptions?.market ??
        executableMarket,

      account:
        executableOpportunityOptions?.account ??
        executableAccount,

      executionContext:
        executableOpportunityOptions?.executionContext ??
        executableExecutionContext,

      entryRiskContext:
        executableOpportunityOptions?.entryRiskContext ??
        executableEntryRiskContext,

      marketProvider:
        executableOpportunityOptions?.marketProvider ??
        executableMarketProvider,

      accountProvider:
        executableOpportunityOptions?.accountProvider ??
        executableAccountProvider ??
        sharedPaperAccountProvider,

      executionContextProvider:
        executableOpportunityOptions?.executionContextProvider ??
        executableExecutionContextProvider,

      entryRiskContextProvider:
        executableOpportunityOptions?.entryRiskContextProvider ??
        executableEntryRiskContextProvider,
    });

  const executableOpportunityEvaluations =
    Array.isArray(
      executableOpportunityCoordination
        ?.evaluations,
    )
      ? executableOpportunityCoordination
          .evaluations
      : [];

  const executableEvaluatedCandidates =
    Array.isArray(
      executableOpportunityCoordination
        ?.evaluatedCandidates,
    )
      ? executableOpportunityCoordination
          .evaluatedCandidates
      : [];

  const executableSelectedOpportunities =
    Array.isArray(
      executableOpportunityCoordination
        ?.selected,
    )
      ? executableOpportunityCoordination
          .selected
      : [];

  const executableSelectedCandidates =
    Array.isArray(
      executableOpportunityCoordination
        ?.selectedCandidates,
    )
      ? executableOpportunityCoordination
          .selectedCandidates
      : [];

  /**
   * ============================================================
   * PHASE 6.32 — PAPER EXECUTION AUTHORITY WIRING
   * ============================================================
   *
   * ONLY the candidate(s) selected by executable-opportunity
   * coordination may reach the existing paper authority gate.
   *
   * IMPORTANT:
   * - this does NOT size a position
   * - this does NOT construct an order
   * - this does NOT submit to the paper exchange
   * - this can NEVER grant live execution authority
   */
  const paperExecutionEvaluations =
    evaluateCryptoPaperExecutionAuthorities({
      candidates:
        executableSelectedCandidates,

      ledger:
        paperLedger,

      runtime:
        paperRuntime,

      supervisor:
        runtimeSupervisor,

      ...paperExecutionGateOptions,
    });

  const paperAuthorizedCandidates =
    paperExecutionEvaluations
      .filter(
        row =>
          row
            ?.paperExecutionGate
            ?.approved === true,
      )
      .map(row => ({
        ...row.candidate,

        paperExecutionGate:
          row.paperExecutionGate,

        paperExecutionAuthority:
          true,

        executionAuthority:
          false,

        liveExecution:
          false,
      }));

  const paperBlockedCandidates =
    paperExecutionEvaluations
      .filter(
        row =>
          row
            ?.paperExecutionGate
            ?.approved !== true,
      )
      .map(row => ({
        ...row.candidate,

        paperExecutionGate:
          row.paperExecutionGate,

        paperExecutionAuthority:
          false,

        executionAuthority:
          false,

        liveExecution:
          false,
      }));

  return {
    approved:
      allResults.length > 0,

    scanner:
      "CRYPTO_DISCOVERY_SCANNER",

    orchestration:
      "OPPORTUNITY_RANKING_DEEP_RESEARCH_QUALIFICATION_2_FINAL_REVALIDATION_TRADING_INTELLIGENCE_EXECUTABLE_SELECTION_PAPER_AUTHORITY_GATE",

    engineWeights:
      SIX_ENGINE_WEIGHTS,

    deepResearchWeights:
      DEEP_RESEARCH_WEIGHTS,

    canonicalSupportingWeights:
      CANONICAL_SUPPORTING_WEIGHTS,

    scanned:
      allResults.length,

    qualified:
      researchable.length,

    researchable:
      researchable.length,

    highInterest:
      highInterest.length,


    /**
     * Phase 6.9:
     * highInterest is legacy compatibility metadata only.
     * It is NOT the research-selection gate.
     */
    opportunityRanking: {
      available:
        opportunityRanking
          .ranked
          .length,

      longRanked:
        opportunityRanking
          .longRanked
          .length,

      shortRanked:
        opportunityRanking
          .shortRanked
          .length,

      unavailable:
        opportunityRanking
          .unavailable
          .length,

      selectionGate:
        "QUALIFICATION_1_PLUS_DIRECTIONAL_RANKING",

      legacyHighInterestGate:
        false,
    },

    topLongOpportunities:
      opportunityRanking
        .longRanked
        .slice(
          0,
          maximumCandidates,
        ),

    topShortOpportunities:
      opportunityRanking
        .shortRanked
        .slice(
          0,
          maximumCandidates,
        ),

    selected:
      candidates.length,

    cexSelected:
      cexCandidates.length,

    emergingSelected:
      emergingCandidates.length,

    deepResearchEligible:
      deepResearchCandidates.length,

    qualification2: {
      evaluated:
        deepResearchCandidates.length,

      qualified:
        qualification2QualifiedCandidates.length,

      long:
        qualification2LongCandidates.length,

      short:
        qualification2ShortCandidates.length,

      noTrade:
        qualification2NoTradeCandidates.length,

      nextStage:
        "FINAL_MARKET_RISK_REVALIDATION",

      executionAuthority:
        false,

      liveExecution:
        false,
    },

    qualification2QualifiedCandidates,

    qualification2LongCandidates,

    qualification2ShortCandidates,

    qualification2NoTradeCandidates,

    finalRevalidation: {
      evaluated:
        revalidatedCandidates.length,

      revalidated:
        finalRevalidatedCandidates.length,

      noTrade:
        finalNoTradeCandidates.length,

      refreshProviderConfigured:
        typeof refreshCandidateAsset === "function",

      nextStage:
        "EXECUTABLE_OPPORTUNITY_COORDINATION",

      paperExecutionAuthority:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    },

    revalidatedCandidates,

    finalRevalidatedCandidates,

    finalNoTradeCandidates,

    executableOpportunityCoordination: {
      evaluated:
        executableOpportunityEvaluations.length,

      intelligenceApproved:
        executableOpportunityCoordination
          ?.counts
          ?.intelligenceApproved ??
        0,

      executable:
        executableOpportunityCoordination
          ?.counts
          ?.executable ??
        0,

      selected:
        executableSelectedCandidates.length,

      decision:
        executableOpportunityCoordination
          ?.decision ??
        "NO_TRADE",

      status:
        executableOpportunityCoordination
          ?.status ??
        "NO_EXECUTABLE_QUALIFIED_OPPORTUNITY",

      evidenceInputs: {
        marketProviderConfigured:
          typeof (
            executableOpportunityOptions?.marketProvider ??
            executableMarketProvider
          ) === "function",

        accountProviderConfigured:
          typeof (
            executableOpportunityOptions?.accountProvider ??
            executableAccountProvider
          ) === "function",

        executionContextProviderConfigured:
          typeof (
            executableOpportunityOptions?.executionContextProvider ??
            executableExecutionContextProvider
          ) === "function",

        entryRiskContextProviderConfigured:
          typeof (
            executableOpportunityOptions?.entryRiskContextProvider ??
            executableEntryRiskContextProvider
          ) === "function",

        directMarketConfigured:
          Object.keys(
            executableOpportunityOptions?.market ??
            executableMarket ??
            {},
          ).length > 0,

        directAccountConfigured:
          Object.keys(
            executableOpportunityOptions?.account ??
            executableAccount ??
            {},
          ).length > 0,

        directExecutionContextConfigured:
          Object.keys(
            executableOpportunityOptions?.executionContext ??
            executableExecutionContext ??
            {},
          ).length > 0,

        directEntryRiskContextConfigured:
          Object.keys(
            executableOpportunityOptions?.entryRiskContext ??
            executableEntryRiskContext ??
            {},
          ).length > 0,

        failClosed:
          true,
      },

      bestOpportunity:
        executableOpportunityCoordination
          ?.bestOpportunity ??
        null,

      nextStage:
        executableSelectedCandidates.length > 0
          ? "PAPER_EXECUTION_AUTHORITY_GATE"
          : "NONE",

      paperExecutionAuthority:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    },

    executableOpportunityEvaluations,

    executableEvaluatedCandidates,

    executableSelectedOpportunities,

    executableSelectedCandidates,

    paperExecutionAuthorityGate: {
      evaluated:
        paperExecutionEvaluations.length,

      authorized:
        paperAuthorizedCandidates.length,

      blocked:
        paperBlockedCandidates.length,

      runtimeAuthoritiesConfigured:
        Boolean(
          paperLedger &&
          paperRuntime &&
          runtimeSupervisor,
        ),

      nextStage:
        paperAuthorizedCandidates.length > 0
          ? "PAPER_ORDER_CONSTRUCTION"
          : "NONE",

      /**
       * Narrow paper progression authority may exist per candidate.
       * The scanner itself still has no general/live execution authority.
       */
      paperExecutionAuthority:
        paperAuthorizedCandidates.length > 0,

      executionAuthority:
        false,

      liveExecution:
        false,
    },

    paperExecutionEvaluations,

    paperAuthorizedCandidates,

    paperBlockedCandidates,

    /**
     * Scanner stage never grants live execution eligibility.
     */
    botEligibleNow:
      0,

    candidates,

    cexCandidates,

    emergingCandidates,

    deepResearchCandidates,

    highInterestCandidates:
      highInterest,

    /**
     * Preserve original qualification results.
     */
    allResults,

    researchOnly:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,

    startedAt,

    completedAt:
      new Date()
        .toISOString(),
  };
}


export default
  scanCryptoMarket;
