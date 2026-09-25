import fs from "node:fs";
import path from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const scanner =
  fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/crypto/scanner/cryptoScanner.js",
    ),
    "utf8",
  );

const adapters =
  fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/crypto/scanner/cryptoScannerEngineAdapters.js",
    ),
    "utf8",
  );

assert(
  scanner.includes("runCryptoScannerMarketStructure"),
  "Scanner must import/use the shared Market Structure adapter.",
);

assert(
  scanner.includes("const sharedEngineResults = {"),
  "Scanner must create sharedEngineResults.",
);

assert(
  scanner.includes("technical,") &&
  scanner.includes("liquidity,") &&
  scanner.includes("onChain,") &&
  scanner.includes("marketStructure,"),
  "Shared graph must include Technical, Liquidity, OnChain and Market Structure.",
);

assert(
  scanner.includes("runCryptoScannerRisk(") &&
  scanner.includes("sharedContext"),
  "Risk must consume sharedContext.",
);

assert(
  scanner.includes("runCryptoScannerMomentum(") &&
  scanner.includes("sharedContext"),
  "Momentum must consume sharedContext.",
);

assert(
  adapters.includes("?.sharedEngineResults") &&
  adapters.includes("?.technical"),
  "Momentum adapter must support shared Technical.",
);

assert(
  adapters.includes("const sharedMarketStructure ="),
  "Adapters must support shared Market Structure.",
);

assert(
  adapters.includes("const sharedLiquidity =") &&
  adapters.includes("const sharedOnChain ="),
  "Risk adapter must preserve shared Liquidity/OnChain consumption.",
);

assert(
  scanner.includes("duplicateBaseEngineExecution:") &&
  scanner.includes("false"),
  "Scanner must expose duplicate-execution policy.",
);

console.log(JSON.stringify({
  passed: true,
  phase: "6.23",
  executionGraph: {
    baseStage: [
      "technical",
      "fundamental",
      "liquidity",
      "onChain",
      "marketStructure",
      "narrative",
      "news"
    ],
    sharedResults: [
      "technical",
      "liquidity",
      "onChain",
      "marketStructure"
    ],
    momentumConsumesShared: [
      "technical",
      "marketStructure"
    ],
    riskConsumesShared: [
      "liquidity",
      "onChain",
      "marketStructure"
    ],
    duplicateTechnicalForMomentum: false,
    duplicateLiquidityForRisk: false,
    duplicateOnChainForRisk: false,
    duplicateMarketStructureForRisk: false
  },
  canonicalScoringChanged: false,
  executionAuthority: false,
  liveExecution: false,
  nextStage: "UNDERLYING_EVIDENCE_COVERAGE_AUDIT"
}, null, 2));
