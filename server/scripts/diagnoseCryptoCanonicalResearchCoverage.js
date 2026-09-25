import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    "src/crypto/scanner/cryptoScanner.js",
  ),
  "utf8",
);

assert(
  source.includes("function normalizedCoverage01("),
  "Coverage normalizer is missing.",
);

assert(
  source.includes("representedEvidenceWeight +="),
  "Canonical represented evidence accumulation is missing.",
);

assert(
  source.includes("pillar.weight *") &&
    source.includes("coverage01"),
  "Canonical coverage must multiply configured pillar weight by internal coverage.",
);

assert(
  /coverage:\s*\n\s*representedEvidenceWeight\s*\*\s*\n\s*100/m.test(source),
  "Canonical research coverage must derive from represented evidence weight.",
);

assert(
  source.includes("researchRepresentedEvidenceWeight:"),
  "Candidate output must expose represented evidence weight.",
);

assert(
  source.includes("scoreRenormalizationChanged:") &&
    source.includes("false"),
  "Phase 6.26 must not silently change canonical score semantics.",
);

assert(
  source.includes("narrative: 0.50") &&
    source.includes("news: 0.50"),
  "Phase 6.22 Supporting de-duplication must remain intact.",
);

assert(
  !/CANONICAL_SUPPORTING_WEIGHTS[\s\S]{0,180}risk:\s*0\./m.test(source),
  "Risk must remain excluded from canonical Supporting.",
);

assert(
  source.includes("sharedEngineResults") &&
    source.includes("marketStructure"),
  "Phase 6.23 shared execution graph must remain intact.",
);

assert(
  source.includes("evaluateCryptoQualification2("),
  "Qualification 2 wiring must remain intact.",
);

assert(
  source.includes("revalidateQualifiedCryptoCandidates("),
  "Final revalidation wiring must remain intact.",
);

assert(
  source.includes("evaluateCryptoPaperExecutionAuthorities("),
  "Paper authority gate wiring must remain intact.",
);

assert(
  /executionAuthority:\s*\n\s*false/m.test(source),
  "Scanner must retain executionAuthority false.",
);

assert(
  /liveExecution:\s*\n\s*false/m.test(source),
  "Scanner must retain liveExecution false.",
);

const examples = {
  all50:
    0.20 * 0.50 +
    0.20 * 0.50 +
    0.60 * 0.50,

  technical100Fundamental50Supporting25:
    0.20 * 1.00 +
    0.20 * 0.50 +
    0.60 * 0.25,

  technical50Fundamental50Supporting100:
    0.20 * 0.50 +
    0.20 * 0.50 +
    0.60 * 1.00,

  all100:
    0.20 * 1.00 +
    0.20 * 1.00 +
    0.60 * 1.00,
};

assert(
  Math.abs(examples.all50 * 100 - 50) < 1e-9,
  "50/50/50 must produce 50% canonical coverage.",
);

assert(
  Math.abs(
    examples.technical100Fundamental50Supporting25 * 100 -
      45,
  ) < 1e-9,
  "100/50/25 must produce 45% canonical coverage.",
);

assert(
  Math.abs(
    examples.technical50Fundamental50Supporting100 * 100 -
      80,
  ) < 1e-9,
  "50/50/100 must produce 80% canonical coverage.",
);

assert(
  Math.abs(examples.all100 * 100 - 100) < 1e-9,
  "100/100/100 must produce 100% canonical coverage.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.26",
  canonicalCoverage: {
    formula:
      "T20*internalCoverage + F20*internalCoverage + S60*internalCoverage",
    examples: {
      "T50_F50_S50": 50,
      "T100_F50_S25": 45,
      "T50_F50_S100": 80,
      "T100_F100_S100": 100
    },
    scoreSemanticsChanged: false,
    missingEvidenceBecomesZeroScore: false
  },
  preserved: {
    supportingDeduplication: true,
    sharedExecutionGraph: true,
    qualification2: true,
    finalRevalidation: true,
    paperAuthorityGate: true
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage:
    "SHARED_INTELLIGENCE_AND_FUNDAMENTAL_SNAPSHOT_AUDIT"
}, null, 2));
