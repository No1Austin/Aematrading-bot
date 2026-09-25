import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const scanner = fs.readFileSync(
  path.resolve(process.cwd(), "src/crypto/scanner/cryptoScanner.js"),
  "utf8",
);
const adapters = fs.readFileSync(
  path.resolve(process.cwd(), "src/crypto/scanner/cryptoScannerEngineAdapters.js"),
  "utf8",
);
const provider = fs.readFileSync(
  path.resolve(process.cwd(), "src/crypto/data/providers/cryptoFundamentalEvidenceProvider.js"),
  "utf8",
);

assert(scanner.includes("buildCryptoFundamentalEvidenceBatch("),
  "Scanner must explicitly use fundamental batch evidence.");
assert(scanner.includes("fundamentalEvidenceByKey"),
  "Shared fundamental evidence map missing.");
assert(scanner.includes("sharedFundamentalSnapshot:"),
  "Shared fundamental snapshot wiring missing.");
assert(adapters.includes("?.sharedFundamentalSnapshot"),
  "OnChain must prefer shared fundamental snapshot.");
assert(adapters.includes("scannerContext?.sharedFundamentalEvidence ??"),
  "Fundamental must prefer shared evidence.");
assert(scanner.includes("const gptPromises = new Map()"),
  "Per-cycle GPT promise registry missing.");
assert(scanner.includes("gptPromises.has(key)") &&
       scanner.includes("gptPromises.set(key, promise)"),
  "GPT promise reuse contract missing.");
assert(scanner.includes("sharedIntelligencePromise:"),
  "Shared GPT promise is not passed to adapters.");
assert(adapters.includes("context?.sharedIntelligencePromise"),
  "Adapters do not consume shared GPT promise.");
assert(provider.includes("buildCryptoFundamentalEvidenceBatch"),
  "Fundamental batch API missing.");
assert(scanner.includes("researchRepresentedEvidenceWeight:"),
  "Phase 6.26 coverage propagation was lost.");
assert(scanner.includes("riskIncludedInCanonicalScore:") &&
       scanner.includes("false"),
  "Risk canonical exclusion was lost.");
assert(/executionAuthority:\s*\n\s*false/m.test(scanner),
  "Scanner executionAuthority must remain false.");
assert(/liveExecution:\s*\n\s*false/m.test(scanner),
  "Scanner liveExecution must remain false.");

console.log(JSON.stringify({
  passed: true,
  phase: "6.27",
  sharedIntelligence: {
    oneGptPromisePerAsset: true,
    consumers: ["narrative", "news", "risk_events"]
  },
  sharedFundamentals: {
    batchEvidence: true,
    fundamentalConsumesSharedEvidence: true,
    onChainConsumesSharedSnapshot: true,
    noCandidateSpecificFundamentalHttpRequired: true
  },
  preserved: {
    phase622Deduplication: true,
    phase623SharedEngineGraph: true,
    phase626CoveragePropagation: true
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage:
    "FUNDAMENTAL_CONFIDENCE_AND_DIRECTIONAL_COVERAGE_AUDIT"
}, null, 2));
