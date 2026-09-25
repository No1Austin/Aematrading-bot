/**
 * AEMA Crypto — Phase 6.30
 * Q2 Runtime Contract Test
 *
 * Runtime-only diagnostic:
 * - no source-text/regex assertions
 * - executes the real Technical Engine
 * - executes the real Qualification 2 engine
 * - verifies the Phase 6.29 adapter-shaped top-level contract
 *
 * Fundamental results are deterministic runtime fixtures shaped exactly like
 * the canonical Fundamental adapter output. This avoids provider/network
 * dependencies while still exercising Q2's real runtime behavior.
 */

import runCryptoTechnicalEngine
  from "../src/crypto/analysis/cryptoTechnicalEngine.js";

import {
  evaluateCryptoQualification2,
} from "../src/crypto/qualification/cryptoQualification2Engine.js";


function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}


function approx(actual, expected, epsilon = 0.0001) {
  return (
    Number.isFinite(Number(actual)) &&
    Math.abs(Number(actual) - Number(expected)) <= epsilon
  );
}


function adapterShape(result) {
  const evidence =
    result?.evidence &&
    typeof result.evidence === "object"
      ? result.evidence
      : {};

  const rawConfidence =
    result?.confidence;

  const confidence =
    rawConfidence === null ||
    rawConfidence === undefined ||
    rawConfidence === ""
      ? 0
      : Number(rawConfidence) >= 0 &&
          Number(rawConfidence) <= 1
        ? Number(rawConfidence) * 100
        : Number(rawConfidence);

  return {
    approved: true,
    status: "READY",
    score: Number(result?.score),
    confidence,

    availability: {
      available: true,
      source:
        result?.engine ??
        "RUNTIME_TEST",
      reason: null,
      evidenceCount:
        Math.max(
          1,
          Object.keys(evidence).length,
        ),
    },

    coverage:
      result?.coverage ??
      result?.evidenceCoverage ??
      evidence?.coverage ??
      null,

    evidenceCoverage:
      result?.evidenceCoverage ??
      evidence?.evidenceCoverage ??
      null,

    direction:
      result?.direction ??
      "NEUTRAL",

    directionStrength:
      result?.directionStrength ??
      evidence?.directionStrength ??
      null,

    bullishStrength:
      result?.bullishStrength ??
      evidence?.bullishStrength ??
      null,

    bearishStrength:
      result?.bearishStrength ??
      evidence?.bearishStrength ??
      null,

    directionalCoverage:
      result?.directionalCoverage ??
      evidence?.directionalCoverage ??
      null,

    evidence: [
      {
        source:
          result?.engine ??
          "RUNTIME_TEST",
        available: true,
        direction:
          result?.direction ??
          null,
        details: evidence,
      },
    ],

    warnings: [],
    errors: [],
    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}


function fundamentalFixture({
  direction,
  bullishStrength,
  bearishStrength,
  coverage = 80,
  confidence = 80,
  score = 70,
}) {
  return {
    approved: true,
    status: "READY",
    score,
    confidence,

    availability: {
      available: true,
      source: "CRYPTO_FUNDAMENTAL",
      reason: null,
      evidenceCount: 5,
    },

    coverage,
    evidenceCoverage:
      coverage / 100,

    direction,
    directionStrength:
      Math.min(
        100,
        Math.abs(
          bullishStrength -
          bearishStrength,
        ) * 2,
      ),

    bullishStrength,
    bearishStrength,
    directionalCoverage:
      coverage,

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}


function supportingFixture({
  bullishStrength = 50,
  bearishStrength = 50,
  coverage = 100,
  confidence = 80,
} = {}) {
  return {
    approved: true,
    status: "READY",
    score: 60,
    confidence,

    availability: {
      available: true,
      source: "RUNTIME_SUPPORTING",
      reason: null,
      evidenceCount: 2,
    },

    coverage,
    direction: "NEUTRAL",
    directionStrength: 0,
    bullishStrength,
    bearishStrength,

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}


async function technicalFixture(
  measurements,
) {
  const raw =
    await runCryptoTechnicalEngine({
      measurements,
      scannerScore: 70,
      directionEdge: 12,
      preferredDirection: "SHORT",
    });

  assert(
    raw?.status === "COMPLETE",
    `Technical engine did not complete: ${raw?.status}`,
  );

  const normalized =
    adapterShape(raw);

  assert(
    normalized.coverage !== null,
    "Technical coverage was lost before Q2.",
  );

  assert(
    normalized.bullishStrength !== null,
    "Technical bullishStrength was lost before Q2.",
  );

  assert(
    normalized.bearishStrength !== null,
    "Technical bearishStrength was lost before Q2.",
  );

  return {
    raw,
    normalized,
  };
}


function q2({
  technical,
  fundamental,
  supporting =
    supportingFixture(),
  options = {},
}) {
  return evaluateCryptoQualification2(
    {
      preferredDirection: "SHORT",
    },
    {
      technical,
      fundamental,
      supporting,
    },
    options,
  );
}


function failureCodes(result) {
  return new Set(
    (result?.failures ?? [])
      .map(row => row?.code)
      .filter(Boolean),
  );
}


const longTechnical =
  await technicalFixture({
    change1hPercent: 6,
    change4hPercent: 8,
    change24hPercent: 12,
    change7dPercent: 18,
  });

assert(
  approx(
    longTechnical.normalized.coverage,
    100,
  ),
  "Full Technical evidence must preserve 100% coverage.",
);

assert(
  longTechnical.normalized.direction === "LONG",
  "Positive multi-horizon movement must produce LONG Technical direction.",
);

assert(
  longTechnical.normalized.bullishStrength >
    longTechnical.normalized.bearishStrength,
  "LONG Technical result must preserve stronger bullish evidence.",
);


const shortTechnical =
  await technicalFixture({
    change1hPercent: -6,
    change4hPercent: -8,
    change24hPercent: -12,
    change7dPercent: -18,
  });

assert(
  shortTechnical.normalized.direction === "SHORT",
  "Negative multi-horizon movement must produce SHORT Technical direction.",
);

assert(
  shortTechnical.normalized.bearishStrength >
    shortTechnical.normalized.bullishStrength,
  "SHORT Technical result must preserve stronger bearish evidence.",
);


const longFundamental =
  fundamentalFixture({
    direction: "LONG",
    bullishStrength: 70,
    bearishStrength: 30,
  });

const shortFundamental =
  fundamentalFixture({
    direction: "SHORT",
    bullishStrength: 30,
    bearishStrength: 70,
  });


const longResult =
  q2({
    technical:
      longTechnical.normalized,
    fundamental:
      longFundamental,
  });

assert(
  longResult.qualified === true,
  `Full-evidence LONG should qualify. Failures: ${JSON.stringify(longResult.failures)}`,
);

assert(
  longResult.decision === "LONG",
  `Expected LONG decision, got ${longResult.decision}`,
);


const shortResult =
  q2({
    technical:
      shortTechnical.normalized,
    fundamental:
      shortFundamental,
  });

assert(
  shortResult.qualified === true,
  `Full-evidence SHORT should qualify. Failures: ${JSON.stringify(shortResult.failures)}`,
);

assert(
  shortResult.decision === "SHORT",
  `Expected SHORT decision, got ${shortResult.decision}`,
);


const technicalBelowCoverage = {
  ...longTechnical.normalized,
  coverage: 49,
  evidenceCoverage: 0.49,
};

const technicalCoverageResult =
  q2({
    technical:
      technicalBelowCoverage,
    fundamental:
      longFundamental,
  });

assert(
  technicalCoverageResult.qualified === false,
  "Technical coverage below 50% must fail closed.",
);

assert(
  failureCodes(
    technicalCoverageResult,
  ).has(
    "TECHNICAL_COVERAGE_INSUFFICIENT",
  ),
  "Missing TECHNICAL_COVERAGE_INSUFFICIENT failure.",
);


const fundamentalBelowCoverage = {
  ...longFundamental,
  coverage: 49,
  evidenceCoverage: 0.49,
};

const fundamentalCoverageResult =
  q2({
    technical:
      longTechnical.normalized,
    fundamental:
      fundamentalBelowCoverage,
  });

assert(
  fundamentalCoverageResult.qualified === false,
  "Fundamental coverage below 50% must fail closed.",
);

assert(
  failureCodes(
    fundamentalCoverageResult,
  ).has(
    "FUNDAMENTAL_COVERAGE_INSUFFICIENT",
  ),
  "Missing FUNDAMENTAL_COVERAGE_INSUFFICIENT failure.",
);


const technicalLowConfidence = {
  ...longTechnical.normalized,
  confidence: 44,
};

const technicalConfidenceResult =
  q2({
    technical:
      technicalLowConfidence,
    fundamental:
      longFundamental,
  });

assert(
  technicalConfidenceResult.qualified === false,
  "Technical confidence below 45 must fail closed.",
);

assert(
  failureCodes(
    technicalConfidenceResult,
  ).has(
    "TECHNICAL_CONFIDENCE_INSUFFICIENT",
  ),
  "Missing TECHNICAL_CONFIDENCE_INSUFFICIENT failure.",
);


const fundamentalLowConfidence = {
  ...longFundamental,
  confidence: 44,
};

const fundamentalConfidenceResult =
  q2({
    technical:
      longTechnical.normalized,
    fundamental:
      fundamentalLowConfidence,
  });

assert(
  fundamentalConfidenceResult.qualified === false,
  "Fundamental confidence below 45 must fail closed.",
);

assert(
  failureCodes(
    fundamentalConfidenceResult,
  ).has(
    "FUNDAMENTAL_CONFIDENCE_INSUFFICIENT",
  ),
  "Missing FUNDAMENTAL_CONFIDENCE_INSUFFICIENT failure.",
);


const conflictResult =
  q2({
    technical:
      longTechnical.normalized,
    fundamental:
      shortFundamental,
  });

assert(
  conflictResult.qualified === false,
  "Conflicting mandatory Technical/Fundamental direction must not qualify.",
);

assert(
  conflictResult.decision === "NO_TRADE",
  "Mandatory directional conflict must produce NO_TRADE.",
);


const supportingCannotRescue =
  q2({
    technical:
      technicalBelowCoverage,
    fundamental:
      longFundamental,
    supporting:
      supportingFixture({
        bullishStrength: 100,
        bearishStrength: 0,
        coverage: 100,
        confidence: 100,
      }),
  });

assert(
  supportingCannotRescue.qualified === false,
  "Supporting evidence must not rescue failed Technical coverage.",
);

assert(
  failureCodes(
    supportingCannotRescue,
  ).has(
    "TECHNICAL_COVERAGE_INSUFFICIENT",
  ),
  "Mandatory Technical failure disappeared after strong Supporting evidence.",
);


for (const result of [
  longResult,
  shortResult,
  technicalCoverageResult,
  fundamentalCoverageResult,
  technicalConfidenceResult,
  fundamentalConfidenceResult,
  conflictResult,
  supportingCannotRescue,
]) {
  assert(
    result.executionAuthority === false,
    "Q2 executionAuthority must remain false.",
  );

  assert(
    result.liveExecution === false,
    "Q2 liveExecution must remain false.",
  );

  assert(
    result.paperExecutionAuthority === false,
    "Q2 paperExecutionAuthority must remain false.",
  );
}


console.log(
  JSON.stringify(
    {
      passed: true,
      phase: "6.30",

      runtime: {
        realTechnicalEngineExecuted:
          true,
        realQualification2Executed:
          true,
        adapterContractAppliedAtRuntime:
          true,
        providerNetworkRequired:
          false,
      },

      directionalCases: {
        fullEvidenceLong:
          longResult.decision,
        fullEvidenceShort:
          shortResult.decision,
        mandatoryConflict:
          conflictResult.decision,
      },

      failClosed: {
        technicalCoverageBelow50:
          !technicalCoverageResult.qualified,
        fundamentalCoverageBelow50:
          !fundamentalCoverageResult.qualified,
        technicalConfidenceBelow45:
          !technicalConfidenceResult.qualified,
        fundamentalConfidenceBelow45:
          !fundamentalConfidenceResult.qualified,
        supportingCannotRescue:
          !supportingCannotRescue.qualified,
      },

      preserved: {
        technicalCoverage:
          longTechnical.normalized.coverage,
        technicalConfidence:
          longTechnical.normalized.confidence,
        technicalBullishStrength:
          longTechnical.normalized.bullishStrength,
        technicalBearishStrength:
          longTechnical.normalized.bearishStrength,
      },

      executionAuthority:
        false,
      liveExecution:
        false,

      nextStage:
        "FUNDAMENTAL_IDENTITY_AND_EVIDENCE_CONTRACT_AUDIT",
    },
    null,
    2,
  ),
);
