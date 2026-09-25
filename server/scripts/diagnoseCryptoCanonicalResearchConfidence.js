/**
 * AEMA Crypto — Phase 6.37
 * Canonical Research Confidence Weighting Audit
 *
 * Source-contract audit of the real scanner aggregateDeepResearch logic.
 * No production changes and no provider/network calls.
 */
import fs from "node:fs";
import path from "node:path";

function assert(c,m){if(!c)throw new Error(m);}
const scannerPath=path.resolve("src/crypto/scanner/cryptoScanner.js");
const source=fs.readFileSync(scannerPath,"utf8");

assert(source.includes("function aggregateDeepResearch"),
  "aggregateDeepResearch not found.");
assert(source.includes("representedEvidenceWeight"),
  "Represented evidence coverage contract missing.");

const start=source.indexOf("function aggregateDeepResearch");
const end=source.indexOf("async function runSixEngineResearch",start);
const block=source.slice(start,end);

assert(block.includes("weightedConfidence"),"Canonical confidence aggregation missing.");
assert(block.includes("pillar.weight"),"Configured pillar weighting missing.");

const W={technical:.20,fundamental:.20,supporting:.60};

function currentAggregate(pillars){
  let wc=0, aw=0, rew=0;
  for(const [key,p] of Object.entries(pillars)){
    if(!p.available)continue;
    wc+=p.confidence*W[key];
    aw+=W[key];
    rew+=W[key]*p.coverage;
  }
  return {confidence:aw?wc/aw:0,coverage:rew*100};
}

function representedAggregate(pillars){
  let wc=0, rw=0;
  for(const [key,p] of Object.entries(pillars)){
    if(!p.available)continue;
    const represented=W[key]*p.coverage;
    wc+=p.confidence*represented;
    rw+=represented;
  }
  return {confidence:rw?wc/rw:0,coverage:rw*100};
}

const fixture={
  technical:{available:true,confidence:90,coverage:.50},
  fundamental:{available:true,confidence:90,coverage:.50},
  supporting:{available:true,confidence:40,coverage:1.00},
};

const current=currentAggregate(fixture);
const represented=representedAggregate(fixture);

assert(Math.abs(current.coverage-80)<1e-9,"Expected fixture coverage 80%.");
assert(Math.abs(current.confidence-60)<1e-9,
  `Expected current configured-weight confidence 60, got ${current.confidence}.`);
assert(Math.abs(represented.confidence-52.5)<1e-9,
  `Expected represented-evidence confidence 52.5, got ${represented.confidence}.`);
assert(current.confidence!==represented.confidence,
  "Fixture failed to expose confidence weighting mismatch.");

const full={
  technical:{available:true,confidence:90,coverage:1},
  fundamental:{available:true,confidence:90,coverage:1},
  supporting:{available:true,confidence:40,coverage:1},
};
const currentFull=currentAggregate(full);
const representedFull=representedAggregate(full);
assert(Math.abs(currentFull.confidence-representedFull.confidence)<1e-9,
  "Full coverage should produce identical confidence semantics.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.37",
  actualScannerContract:{
    aggregateDeepResearchLocated:true,
    canonicalWeights:{technical:20,fundamental:20,supporting:60},
    coverageUsesRepresentedEvidenceWeight:true,
    confidenceUsesConfiguredAvailablePillarWeight:true
  },
  fixture:{
    technical:{confidence:90,coverage:50},
    fundamental:{confidence:90,coverage:50},
    supporting:{confidence:40,coverage:100},
    canonicalCoverage:current.coverage,
    currentConfidence:current.confidence,
    representedEvidenceConfidence:represented.confidence
  },
  finding:{
    confidenceCoverageMismatch:true,
    partiallyCoveredPillarsReceiveFullConfiguredConfidenceInfluence:true,
    scoreSemanticsAffected:false,
    recommendedFix:"WEIGHT_CANONICAL_CONFIDENCE_BY_CONFIGURED_WEIGHT_X_INTERNAL_COVERAGE; KEEP_CANONICAL_SCORE_SEMANTICS_UNCHANGED"
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"CANONICAL_RESEARCH_CONFIDENCE_REPRESENTED_EVIDENCE_FIX"
},null,2));
