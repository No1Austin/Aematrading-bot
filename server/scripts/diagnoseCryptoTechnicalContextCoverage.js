/**
 * AEMA Crypto — Phase 6.35
 * Technical Context Double-Count & Coverage Audit
 *
 * Executes the real Technical engine. No production changes.
 */

import runTechnical from "../src/crypto/analysis/cryptoTechnicalEngine.js";

function assert(c,m){if(!c)throw new Error(m);}
const close=(a,b,e=1e-6)=>Math.abs(Number(a)-Number(b))<=e;

const measurements={
  change1hPercent:2,
  change4hPercent:4,
  change24hPercent:6,
  change7dPercent:8,
};

const movementOnly=await runTechnical({measurements});
const withScanner=await runTechnical({
  measurements,
  scannerScore:95,
});
const withDiscovery=await runTechnical({
  measurements,
  directionEdge:25,
});
const withBoth=await runTechnical({
  measurements,
  scannerScore:95,
  directionEdge:25,
});

for(const r of [movementOnly,withScanner,withDiscovery,withBoth]){
  assert(r.status==="COMPLETE","Expected Technical COMPLETE.");
  assert(r.evidence?.coverage===100,"Expected 100% horizon coverage.");
  assert(r.evidence?.directionalCoverage===100,"Expected 100% directional coverage.");
  assert(r.evidence?.executionAuthority===false,"Technical gained execution authority.");
  assert(r.evidence?.liveExecution===false,"Technical gained live execution authority.");
}

assert(
  !close(movementOnly.score,withScanner.score),
  "scannerScore did not affect Technical score; audit assumption changed."
);
assert(
  !close(movementOnly.score,withDiscovery.score),
  "directionEdge did not affect Technical score; audit assumption changed."
);
assert(
  !close(movementOnly.score,withBoth.score),
  "Upstream context did not affect Technical score; audit assumption changed."
);

// Coverage/confidence remain identical despite extra score inputs.
assert(withBoth.evidence.coverage===movementOnly.evidence.coverage,
  "Technical coverage unexpectedly changed with upstream context.");
assert(close(withBoth.confidence,movementOnly.confidence),
  "Technical confidence unexpectedly changed with upstream context.");

// Direction must remain derived from market movement, not preferred direction.
const oppositePreference=await runTechnical({
  measurements,
  preferredDirection:"SHORT",
  scannerScore:95,
  directionEdge:-25,
});
assert(
  oppositePreference.direction===movementOnly.direction,
  "Discovery preference changed Technical market-evidence direction."
);

const partial=await runTechnical({
  measurements:{
    change1hPercent:2,
    change4hPercent:4,
    change24hPercent:null,
    change7dPercent:null,
  },
  scannerScore:95,
  directionEdge:25,
});
assert(partial.status==="COMPLETE","Two horizons should satisfy current minimum.");
assert(partial.evidence.coverage===50,"Two of four horizons should report 50% coverage.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.35",
  runtimeAudit:{
    realTechnicalEngineExecuted:true,
    movementOnlyScore:movementOnly.score,
    withScannerScore:withScanner.score,
    withDiscoveryEdgeScore:withDiscovery.score,
    withBothScore:withBoth.score,
    upstreamScannerScoreChangesTechnicalScore:true,
    upstreamDiscoveryEdgeChangesTechnicalScore:true,
    coverageIgnoresThoseScoreInputs:true,
    confidenceIgnoresThoseScoreInputs:true,
    technicalDirectionRemainsMovementDerived:true,
    twoHorizonCoverage:partial.evidence.coverage
  },
  finding:{
    contextDoubleCountRisk:true,
    reason:"SCANNER_SCORE_AND_DISCOVERY_EDGE_ARE_UPSTREAM_DERIVED_CONTEXT_BUT_CURRENTLY_ENTER_CANONICAL_TECHNICAL_SCORE",
    coverageContractMismatch:true,
    recommendedFix:"CANONICAL_TECHNICAL_SCORE_FROM_TECHNICAL_MARKET_EVIDENCE_ONLY; KEEP_SCANNER_AND_DISCOVERY_VALUES_DIAGNOSTIC_ONLY"
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"TECHNICAL_CANONICAL_SCORE_DEDUPLICATION"
},null,2));
