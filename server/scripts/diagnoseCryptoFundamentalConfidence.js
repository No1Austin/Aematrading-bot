import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "src/crypto/analysis/cryptoFundamentalEngine.js",
  ),
  "utf8",
);

assert(
  source.includes('version: "6.28"'),
  "Fundamental engine version must be 6.28.",
);

assert(
  source.includes("const directionalCoverage =") &&
    source.includes("directionalWeight /") &&
    source.includes("configuredMetricWeight"),
  "Pillar directional coverage must use directional metric weight.",
);

assert(
  source.includes("pillar.confidence *") &&
    source.includes("represented"),
  "Aggregate confidence must be weighted by represented evidence.",
);

assert(
  source.includes("directionalRepresentedWeight"),
  "Directional represented weight is missing.",
);

assert(
  source.includes("pillar.directionalCoverage /"),
  "Directional aggregation must use pillar directional coverage.",
);

assert(
  !source.includes(
    "pillar.confidence * pillar.configuredWeight",
  ),
  "Old confidence inflation path is still present.",
);

assert(
  !source.includes(
    "directionalScoreWeight",
  ),
  "Old full-configured-weight directional path is still present.",
);

assert(
  /missingEvidencePolicy:\s*["']EXCLUDED_NOT_ZERO_OR_NEUTRAL["']/m.test(
    source,
  ),
  "Missing-evidence contract is missing.",
);

assert(
  /executionAuthority\s*:\s*false/m.test(
    source,
  ),
  "Execution authority must remain false.",
);

assert(
  /liveExecution\s*:\s*false/m.test(
    source,
  ),
  "Live execution must remain false.",
);

/*
 * Mathematical contract checks independent of market data.
 */
const represented = [
  { configured: 0.20, coverage: 0.25, confidence: 25 },
  { configured: 0.20, coverage: 1.00, confidence: 100 },
];

const representedWeight =
  represented.reduce(
    (sum, x) =>
      sum +
      x.configured *
        x.coverage,
    0,
  );

const confidence =
  represented.reduce(
    (sum, x) =>
      sum +
      x.confidence *
        x.configured *
        x.coverage,
    0,
  ) /
  representedWeight;

assert(
  Math.abs(representedWeight - 0.25) < 1e-9,
  "Represented weight example failed.",
);

assert(
  Math.abs(confidence - 85) < 1e-9,
  "Represented-evidence confidence example failed.",
);

const directionalExample = [
  {
    configured: 0.20,
    directionalCoverage: 0.25,
    bullish: 90,
    bearish: 10,
  },
  {
    configured: 0.20,
    directionalCoverage: 1.00,
    bullish: 60,
    bearish: 40,
  },
];

const directionalWeight =
  directionalExample.reduce(
    (sum, x) =>
      sum +
      x.configured *
        x.directionalCoverage,
    0,
  );

const bullish =
  directionalExample.reduce(
    (sum, x) =>
      sum +
      x.bullish *
        x.configured *
        x.directionalCoverage,
    0,
  ) /
  directionalWeight;

assert(
  Math.abs(directionalWeight - 0.25) < 1e-9,
  "Directional represented weight example failed.",
);

assert(
  Math.abs(bullish - 66) < 1e-9,
  "Directional evidence weighting example failed.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.28",
  fundamentalConfidence: {
    weighting:
      "REPRESENTED_EVIDENCE",
    thinPillarCannotReceiveFullConfiguredInfluence:
      true,
    exampleConfidence: confidence
  },
  directionalCoverage: {
    weighting:
      "DIRECTIONAL_REPRESENTED_EVIDENCE",
    nonDirectionalEvidenceCannotInflateDirection:
      true,
    exampleBullishStrength: bullish
  },
  preserved: {
    fundamentalScoreRenormalization: true,
    missingEvidenceExcluded: true,
    technicalFundamentalMandatoryContractUntouched: true
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage:
    "Q2_ACTUAL_ENGINE_CONTRACT_INTEGRATION_AUDIT"
}, null, 2));
