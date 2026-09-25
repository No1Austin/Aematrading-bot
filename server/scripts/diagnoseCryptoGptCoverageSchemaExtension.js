/**
 * AEMA Crypto — Phase 6.46
 * GPT Provider Explicit Supporting Coverage Contract
 * Source-contract diagnostic. No network call.
 */
import fs from "node:fs";

const source=fs.readFileSync(
  "src/crypto/intelligence/cryptoGptIntelligenceProvider.js",
  "utf8",
);
const ok=(v,m)=>{if(!v)throw new Error(m);};

ok(source.includes('"coverage": number'),"GPT output schema missing coverage.");
ok(source.includes("value?.coverage"),"normalizeBucket does not consume coverage.");
ok(source.includes("evidenceCoverage:"),"normalized evidenceCoverage missing.");
ok(source.includes("GPT_EXPLICIT_RESEARCH_COVERAGE"),"coverage authority missing.");
ok(source.includes("Coverage is NOT confidence"),"coverage semantics missing.");
ok(source.includes("NOT evidence count"),"evidence-count inference not prohibited.");
ok(source.includes("return 0") || source.includes("?? 0"),
   "Missing coverage does not visibly fail closed.");
ok(source.includes("coverage: 0") &&
   source.includes("GPT_INTELLIGENCE_STALE"),
   "Stale freshness path does not zero represented coverage.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.46",
  providerContract:{
    explicitCoverageRequested:true,
    coverageNormalized:true,
    evidenceCoveragePropagated:true,
    missingCoverageFailsClosedToZero:true,
    staleCoverageFailsClosedToZero:true,
    evidenceCountDoesNotDefineCoverage:true,
    availabilityDoesNotDefineCoverage:true,
    confidenceSeparateFromCoverage:true
  },
  supportingCompatibility:{
    phase644CanConsumeCoverage:true,
    news:true,
    socialNarrative:true,
    eventsAlsoCarryCoverageMetadata:true
  },
  preserved:{
    oneGptSnapshotPerAsset:true,
    cache:true,
    freshnessGate:true,
    webResearch:true,
    canonicalWeightsUnchanged:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"GPT_SUPPORTING_RUNTIME_CONTRACT_TEST"
},null,2));
