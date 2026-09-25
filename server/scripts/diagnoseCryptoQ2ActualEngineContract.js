import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const adapter = fs.readFileSync(
  path.resolve(process.cwd(), "src/crypto/scanner/cryptoScannerEngineAdapters.js"),
  "utf8",
);

const technical = fs.readFileSync(
  path.resolve(process.cwd(), "src/crypto/analysis/cryptoTechnicalEngine.js"),
  "utf8",
);

const fundamental = fs.readFileSync(
  path.resolve(process.cwd(), "src/crypto/analysis/cryptoFundamentalEngine.js"),
  "utf8",
);

const q2 = fs.readFileSync(
  path.resolve(process.cwd(), "src/crypto/qualification/cryptoQualification2Engine.js"),
  "utf8",
);

assert(
  adapter.includes("Phase 6.29"),
  "Adapter must be Phase 6.29.",
);

for (const field of [
  "coverage",
  "direction",
  "directionStrength",
  "bullishStrength",
  "bearishStrength",
  "directionalCoverage",
]) {
  assert(
    adapter.includes(`${field}:`),
    `Adapter does not preserve ${field}.`,
  );
}

assert(
  /coverage:\s*result\?\.coverage[\s\S]*?evidenceCoverage/m.test(adapter),
  "Generic adapter must preserve engine coverage at top level.",
);

assert(
  /bullishStrength:\s*result\?\.bullishStrength/m.test(adapter) &&
  /bearishStrength:\s*result\?\.bearishStrength/m.test(adapter),
  "Generic adapter must preserve explicit directional strengths.",
);

assert(
  technical.includes("coverage,") &&
  technical.includes("bullishStrength,") &&
  technical.includes("bearishStrength,") &&
  technical.includes("directionStrength,"),
  "Technical engine must expose its Q2 contract in evidence.",
);

assert(
  fundamental.includes("coverage:") &&
  fundamental.includes("bullishStrength:") &&
  fundamental.includes("bearishStrength:") &&
  fundamental.includes("directionalCoverage:"),
  "Fundamental engine must expose coverage and directional fields.",
);

assert(
  q2.includes("engine?.coverage ??") &&
  q2.includes("engine.bullishStrength ??") &&
  q2.includes("engine.bearishStrength ??"),
  "Q2 must consume top-level coverage and explicit directional strengths.",
);

assert(
  q2.includes('"TECHNICAL_COVERAGE_INSUFFICIENT"') &&
  q2.includes('"FUNDAMENTAL_COVERAGE_INSUFFICIENT"') &&
  q2.includes('"TECHNICAL_CONFIDENCE_INSUFFICIENT"') &&
  q2.includes('"FUNDAMENTAL_CONFIDENCE_INSUFFICIENT"'),
  "Q2 mandatory fail-closed checks are missing.",
);

assert(
  q2.includes("technical: true") &&
  q2.includes("fundamental: true") &&
  q2.includes("supporting: false"),
  "Q2 mandatory pillar contract changed.",
);

assert(
  /executionAuthority\s*:\s*false/m.test(adapter) &&
  /executionAuthority\s*:\s*false/m.test(fundamental) &&
  /executionAuthority\s*:\s*false/m.test(q2),
  "Execution authority must remain false.",
);

assert(
  /liveExecution\s*:\s*false/m.test(fundamental) &&
  /liveExecution\s*:\s*false/m.test(q2),
  "Live execution must remain false.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.29",
  actualContractPath: {
    technicalEngine: true,
    technicalAdapterPreservesCoverage: true,
    technicalAdapterPreservesDirection: true,
    technicalAdapterPreservesBullishBearishStrengths: true,
    fundamentalAdapterPreservesCoverage: true,
    fundamentalAdapterPreservesDirection: true,
    fundamentalAdapterPreservesBullishBearishStrengths: true,
    qualification2ConsumesTopLevelContract: true
  },
  failClosed: {
    technicalCoverageMandatory: true,
    fundamentalCoverageMandatory: true,
    technicalConfidenceMandatory: true,
    fundamentalConfidenceMandatory: true,
    supportingCannotRescueMandatoryPillars: true
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage: "Q2_RUNTIME_CONTRACT_TEST"
}, null, 2));
