/**
 * ============================================================
 * AEMA CRYPTO
 * RISK QUALITY ENGINE
 * Phase 6.22
 * ============================================================
 *
 * HIGH score = stronger / healthier risk profile.
 * LOW score  = weaker / riskier profile.
 *
 * Risk is a SAFETY / DIAGNOSTIC composite, not a canonical
 * Supporting-score component.
 *
 * It may intentionally inspect evidence also used by Technical or
 * Fundamental because a safety gate is allowed to re-check risk.
 * The scanner prevents double-counting by excluding this composite
 * Risk score from the canonical 20/20/60 research aggregate.
 *
 * Score and confidence are independent.
 * Unavailable evidence is excluded and available weights renormalized.
 */

import {
  complete,
  insufficient,
} from "./cryptoEngineUtils.js";

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min = 0, max = 100) {
  const number = finiteOrNull(value);
  if (number === null) return null;
  return Math.min(max, Math.max(min, number));
}

function isExplicitlyUnavailable(value) {
  return (
    value?.available === false ||
    value?.availability?.available === false ||
    value?.status === "EVIDENCE_UNAVAILABLE" ||
    value?.status === "INSUFFICIENT_DATA" ||
    value?.status === "UNAVAILABLE"
  );
}

function usableScore(value) {
  if (!value || isExplicitlyUnavailable(value)) return null;
  return clamp(value?.score);
}

function usableConfidence(value) {
  if (!value || isExplicitlyUnavailable(value)) return null;

  const raw = finiteOrNull(value?.confidence);
  if (raw === null) return null;

  return raw >= 0 && raw <= 1
    ? raw * 100
    : clamp(raw);
}

function addInput(
  inputs,
  {
    source,
    score,
    confidence = null,
    weight,
    evidence = null,
    evidenceDomain,
    overlapsCanonicalPillar = null,
  },
) {
  const usable = clamp(score);
  if (usable === null) return;

  inputs.push({
    source,
    score: usable,
    confidence: clamp(confidence),
    weight,
    evidence,
    evidenceDomain,
    overlapsCanonicalPillar,
  });
}

export default async function runCryptoRiskEngine(
  context,
  {
    finalIntelligence = null,
    liquidityResult = null,
    onChainResult = null,
    projectIntegrity = null,
    marketStructure = null,
  } = {},
) {
  const direction =
    context?.preferredDirection ??
    "LONG";

  const inputs = [];

  const eventIntelligence =
    finalIntelligence?.events ??
    null;

  addInput(inputs, {
    source: "GPT_EVENT_INTELLIGENCE",
    score: usableScore(eventIntelligence),
    confidence: usableConfidence(eventIntelligence),
    weight: 0.30,
    evidence: eventIntelligence?.evidence ?? null,
    evidenceDomain: "EVENT_RISK",
    overlapsCanonicalPillar: null,
  });

  addInput(inputs, {
    source: "CRYPTO_LIQUIDITY",
    score: usableScore(liquidityResult),
    confidence: usableConfidence(liquidityResult),
    weight: 0.25,
    evidence: liquidityResult?.evidence ?? null,
    evidenceDomain: "MARKET_QUALITY",
    overlapsCanonicalPillar: "FUNDAMENTAL",
  });

  addInput(inputs, {
    source: "CRYPTO_ON_CHAIN",
    score: usableScore(onChainResult),
    confidence: usableConfidence(onChainResult),
    weight: 0.20,
    evidence: onChainResult?.evidence ?? null,
    evidenceDomain: "PROTOCOL_USAGE",
    overlapsCanonicalPillar: "FUNDAMENTAL",
  });

  addInput(inputs, {
    source: "CRYPTO_PROJECT_INTEGRITY",
    score: usableScore(projectIntegrity),
    confidence: usableConfidence(projectIntegrity),
    weight: 0.15,
    evidence: projectIntegrity?.evidence ?? null,
    evidenceDomain: "PROJECT_INTEGRITY",
    overlapsCanonicalPillar: "FUNDAMENTAL",
  });

  addInput(inputs, {
    source: "CRYPTO_MARKET_STRUCTURE",
    score: usableScore(marketStructure),
    confidence: usableConfidence(marketStructure),
    weight: 0.10,
    evidence: marketStructure?.evidence ?? null,
    evidenceDomain: "MARKET_STRUCTURE",
    overlapsCanonicalPillar: "TECHNICAL",
  });

  if (inputs.length === 0) {
    return insufficient(
      "CRYPTO_RISK",
      {
        reason: "RISK_EVIDENCE_UNAVAILABLE",
        role: "SAFETY_DIAGNOSTIC",
        canonicalSupportingEligible: false,
        executionAuthority: false,
        liveExecution: false,
      },
    );
  }

  const availableWeight =
    inputs.reduce(
      (sum, input) => sum + input.weight,
      0,
    );

  if (availableWeight <= 0) {
    return insufficient(
      "CRYPTO_RISK",
      {
        reason: "RISK_WEIGHT_UNAVAILABLE",
        role: "SAFETY_DIAGNOSTIC",
        canonicalSupportingEligible: false,
        executionAuthority: false,
        liveExecution: false,
      },
    );
  }

  const score =
    inputs.reduce(
      (sum, input) =>
        sum + input.score * input.weight,
      0,
    ) / availableWeight;

  const coverage =
    Math.min(
      100,
      Math.max(0, availableWeight * 100),
    );

  const confidentInputs =
    inputs.filter(
      input =>
        Number.isFinite(
          Number(input.confidence),
        ),
    );

  const confidentWeight =
    confidentInputs.reduce(
      (sum, input) => sum + input.weight,
      0,
    );

  const evidenceConfidence =
    confidentWeight > 0
      ? confidentInputs.reduce(
          (sum, input) =>
            sum +
            input.confidence *
              input.weight,
          0,
        ) / confidentWeight
      : 50;

  const confidence =
    Math.min(
      evidenceConfidence,
      40 + coverage * 0.6,
    );

  const overlappingInputs =
    inputs
      .filter(
        input =>
          input.overlapsCanonicalPillar !== null,
      )
      .map(
        input => ({
          source: input.source,
          overlapsCanonicalPillar:
            input.overlapsCanonicalPillar,
        }),
      );

  return complete(
    "CRYPTO_RISK",
    score,
    direction,
    {
      semantics:
        "HIGHER_SCORE_MEANS_STRONGER_RISK_QUALITY",

      role:
        "SAFETY_DIAGNOSTIC",

      /*
       * Critical Phase 6.22 contract:
       * this composite score must NOT be inserted into canonical Supporting.
       */
      canonicalSupportingEligible:
        false,

      canonicalScoreAuthority:
        false,

      finalRevalidationEligible:
        true,

      overlapPolicy: {
        containsCorrelatedEvidence:
          overlappingInputs.length > 0,
        overlappingInputs,
        handling:
          "ALLOWED_FOR_SAFETY_RECHECK_BUT_EXCLUDED_FROM_CANONICAL_SUPPORTING_SCORE",
      },

      coverage,
      configuredWeight: 1,
      availableWeight,
      inputCount: inputs.length,
      evidenceConfidence,

      inputs:
        inputs.map(input => ({
          source: input.source,
          score: input.score,
          confidence: input.confidence,
          configuredWeight: input.weight,
          normalizedWeight:
            input.weight / availableWeight,
          evidenceDomain:
            input.evidenceDomain,
          overlapsCanonicalPillar:
            input.overlapsCanonicalPillar,
          evidence: input.evidence,
        })),

      executionAuthority: false,
      liveExecution: false,
    },
    confidence,
  );
}
