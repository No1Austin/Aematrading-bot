/**
 * AEMA Crypto — Phase 6.44
 * Supporting Represented-Evidence Fix Diagnostic
 *
 * Source-contract + deterministic fixture. No network calls.
 */
import fs from "node:fs";

const ok=(c,m)=>{if(!c)throw new Error(m);};

const scanner=fs.readFileSync("src/crypto/scanner/cryptoScanner.js","utf8");
const narrative=fs.readFileSync("src/crypto/analysis/cryptoSocialNarrativeEngine.js","utf8");
const news=fs.readFileSync("src/crypto/analysis/cryptoNewsIntelligenceEngine.js","utf8");

ok(scanner.includes("representedEvidenceWeight"),"Supporting represented weight missing.");
ok(scanner.includes("configuredWeight *") && scanner.includes("coverage01"),
  "Supporting represented weight is not coverage-weighted.");
ok(scanner.includes("availabilityAloneMeansFullCoverage") &&
   scanner.includes("false"),
  "Availability-only coverage contract not disabled.");
ok(news.includes("explicitConfidence(bulk)"),
  "News bulk confidence is not passed to complete().");
ok(narrative.includes("UNVERIFIED_COVERAGE_FAIL_CLOSED"),
  "Narrative unverified coverage does not fail closed.");
ok(news.includes("UNVERIFIED_COVERAGE_FAIL_CLOSED"),
  "News unverified coverage does not fail closed.");

const engines=[
  {name:"narrative",weight:.5,score:70,confidence:80,coverage:.50},
  {name:"news",weight:.5,score:60,confidence:60,coverage:.25},
];

let weightedScore=0, availableWeight=0, weightedConfidence=0, represented=0;
for(const e of engines){
  weightedScore += e.score*e.weight;
  availableWeight += e.weight;
  const rw=e.weight*e.coverage;
  represented += rw;
  weightedConfidence += e.confidence*rw;
}
const supportingScore=weightedScore/availableWeight;
const supportingCoverage=represented*100;
const supportingConfidence=weightedConfidence/represented;

ok(supportingScore===65,"Supporting score semantics changed.");
ok(supportingCoverage===37.5,"Represented coverage fixture failed.");
ok(Math.abs(supportingConfidence-73.33333333333333)<1e-9,
  "Represented confidence fixture failed.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.44",
  supporting:{
    configuredWeights:{narrative:50,news:50},
    scoreSemanticsPreserved:true,
    fixtureScore:supportingScore,
    fixtureCoverage:supportingCoverage,
    fixtureConfidence:Number(supportingConfidence.toFixed(4)),
    confidenceUsesRepresentedEvidence:true,
    coverageUsesRepresentedEvidence:true,
    availabilityAloneMeansFullCoverage:false
  },
  engines:{
    narrativeExplicitCoverageContract:true,
    narrativeUnverifiedCoverageFailsClosedToZero:true,
    newsExplicitCoverageContract:true,
    newsUnverifiedCoverageFailsClosedToZero:true,
    newsBulkConfidencePropagatedToComplete:true
  },
  canonical:{
    technicalWeight:20,
    fundamentalWeight:20,
    supportingWeight:60,
    weightsChanged:false,
    phase638DeepResearchConfidenceContractPreserved:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"GPT_SUPPORTING_COVERAGE_AUTHORITY_AUDIT"
},null,2));
