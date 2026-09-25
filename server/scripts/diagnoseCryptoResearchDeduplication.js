import fs from "node:fs";
import path from "node:path";
import runCryptoRiskEngine from "../src/crypto/analysis/cryptoRiskEngine.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const scannerPath =
  path.resolve(
    process.cwd(),
    "src/crypto/scanner/cryptoScanner.js",
  );

const scannerSource =
  fs.readFileSync(scannerPath, "utf8");

assert(
  /const CANONICAL_SUPPORTING_WEIGHTS[\s\S]*?narrative:\s*0\.50[\s\S]*?news:\s*0\.50/.test(scannerSource),
  "Canonical Supporting must contain Narrative 50% and News 50%.",
);

const supportingBlock =
  scannerSource.match(
    /const CANONICAL_SUPPORTING_WEIGHTS[\s\S]*?\}\);/,
  )?.[0] ?? "";

assert(
  !/\brisk\s*:/.test(supportingBlock),
  "Risk must not be weighted inside canonical Supporting.",
);

const completeInput = (score, confidence = 80) => ({
  status: "READY",
  available: true,
  score,
  confidence,
  evidence: { test: true },
});

const risk =
  await runCryptoRiskEngine(
    { preferredDirection: "LONG" },
    {
      finalIntelligence: {
        events: completeInput(70, 75),
      },
      liquidityResult:
        completeInput(80, 85),
      onChainResult:
        completeInput(65, 70),
      projectIntegrity:
        completeInput(75, 80),
      marketStructure:
        completeInput(60, 75),
    },
  );

assert(
  risk?.status === "COMPLETE",
  "Risk diagnostic should remain operational.",
);

assert(
  risk?.evidence?.canonicalSupportingEligible === false,
  "Risk must explicitly declare itself ineligible for canonical Supporting.",
);

assert(
  risk?.evidence?.finalRevalidationEligible === true,
  "Risk must remain eligible for final revalidation.",
);

assert(
  risk?.evidence?.overlapPolicy?.containsCorrelatedEvidence === true,
  "Risk should disclose correlated evidence.",
);

assert(
  risk?.evidence?.executionAuthority === false,
  "Risk must not grant execution authority.",
);

assert(
  risk?.evidence?.liveExecution === false,
  "Risk must not grant live execution.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.22",
  canonicalSupporting: {
    narrativeWeight: 0.50,
    newsWeight: 0.50,
    riskWeight: 0,
    correlatedRiskExcluded: true,
  },
  risk: {
    operational: true,
    role: risk?.evidence?.role,
    canonicalSupportingEligible:
      risk?.evidence?.canonicalSupportingEligible,
    finalRevalidationEligible:
      risk?.evidence?.finalRevalidationEligible,
    containsCorrelatedEvidence:
      risk?.evidence?.overlapPolicy
        ?.containsCorrelatedEvidence,
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage:
    "DEEP_RESEARCH_EXECUTION_EFFICIENCY_AND_COVERAGE_AUDIT",
}, null, 2));
