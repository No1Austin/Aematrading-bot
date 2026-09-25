import {
  evaluateCryptoQualification2,
} from "../src/crypto/qualification/cryptoQualification2Engine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function engine({
  coverage,
  confidence = 80,
  bullishStrength = 70,
  bearishStrength = 30,
  direction = "LONG",
}) {
  return {
    status: "READY",
    available: true,
    score: 70,
    coverage,
    confidence,
    bullishStrength,
    bearishStrength,
    direction,
    directionStrength: 40,
  };
}

const supporting = {
  status: "READY",
  available: true,
  score: 65,
  coverage: 50,
  confidence: 70,
  bullishStrength: 60,
  bearishStrength: 40,
  direction: "LONG",
};

const percentScale =
  evaluateCryptoQualification2(
    {},
    {
      technical: engine({ coverage: 50 }),
      fundamental: engine({ coverage: 50 }),
      supporting,
    },
  );

const ratioScale =
  evaluateCryptoQualification2(
    {},
    {
      technical: engine({ coverage: 0.5 }),
      fundamental: engine({ coverage: 0.5 }),
      supporting: {
        ...supporting,
        coverage: 0.5,
      },
    },
  );

assert(
  percentScale.mandatoryPillars.technical.coverage === 0.5,
  "Technical 50 must normalize to 0.5.",
);
assert(
  percentScale.mandatoryPillars.fundamental.coverage === 0.5,
  "Fundamental 50 must normalize to 0.5.",
);
assert(
  ratioScale.mandatoryPillars.technical.coverage === 0.5,
  "Technical 0.5 must remain 0.5.",
);
assert(
  ratioScale.mandatoryPillars.fundamental.coverage === 0.5,
  "Fundamental 0.5 must remain 0.5.",
);
assert(
  percentScale.qualified === true &&
    ratioScale.qualified === true,
  "Equivalent coverage scales must produce equivalent qualification.",
);

const belowTechnical =
  evaluateCryptoQualification2(
    {},
    {
      technical: engine({ coverage: 49 }),
      fundamental: engine({ coverage: 80 }),
      supporting,
    },
  );

assert(
  belowTechnical.qualified === false,
  "Technical coverage below 50% must fail Q2.",
);
assert(
  belowTechnical.failures.some(
    x => x.code === "TECHNICAL_COVERAGE_INSUFFICIENT",
  ),
  "Expected TECHNICAL_COVERAGE_INSUFFICIENT.",
);

const belowFundamental =
  evaluateCryptoQualification2(
    {},
    {
      technical: engine({ coverage: 80 }),
      fundamental: engine({ coverage: 49 }),
      supporting,
    },
  );

assert(
  belowFundamental.qualified === false,
  "Fundamental coverage below 50% must fail Q2.",
);
assert(
  belowFundamental.failures.some(
    x => x.code === "FUNDAMENTAL_COVERAGE_INSUFFICIENT",
  ),
  "Expected FUNDAMENTAL_COVERAGE_INSUFFICIENT.",
);

const lowSupporting =
  evaluateCryptoQualification2(
    {},
    {
      technical: engine({ coverage: 80 }),
      fundamental: engine({ coverage: 80 }),
      supporting: {
        ...supporting,
        coverage: 20,
      },
    },
  );

assert(
  lowSupporting.qualified === true,
  "Low supporting coverage must warn, not rescue/block mandatory pillars.",
);
assert(
  lowSupporting.warnings.some(
    x => x.code === "SUPPORTING_COVERAGE_LOW",
  ),
  "Expected SUPPORTING_COVERAGE_LOW warning.",
);

const discoveryConflict =
  evaluateCryptoQualification2(
    { preferredDirection: "SHORT" },
    {
      technical: engine({
        coverage: 80,
        bullishStrength: 70,
        bearishStrength: 30,
        direction: "LONG",
      }),
      fundamental: engine({
        coverage: 80,
        bullishStrength: 68,
        bearishStrength: 32,
        direction: "LONG",
      }),
      supporting,
    },
  );

assert(
  discoveryConflict.decision === "LONG",
  "Discovery preferred direction must not override deep research.",
);
assert(
  discoveryConflict.discoveryDirectionAuthority === false,
  "Discovery direction authority must remain false.",
);
assert(
  discoveryConflict.executionAuthority === false &&
    discoveryConflict.liveExecution === false &&
    discoveryConflict.paperExecutionAuthority === false,
  "Q2 must not grant execution authority.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.25",
  coverageContract: {
    canonicalScale: "0_TO_1",
    percentInputNormalized: true,
    ratioInputPreserved: true,
    technicalMinimum: 0.5,
    fundamentalMinimum: 0.5,
    supportingMinimum: 0.25,
    supportingAuthority: "CONTEXT_ONLY"
  },
  mandatoryPillars: {
    technicalIndependent: true,
    fundamentalIndependent: true,
    belowThresholdFailsClosed: true
  },
  discoveryDirectionAuthority: false,
  executionAuthority: false,
  liveExecution: false,
  paperExecutionAuthority: false,
  nextStage: "CANONICAL_RESEARCH_COVERAGE_PROPAGATION"
}, null, 2));
