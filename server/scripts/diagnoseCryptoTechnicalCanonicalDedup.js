/**
 * AEMA Crypto — Phase 6.36
 * Technical Canonical Score Deduplication Runtime Test
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

const base=await runTechnical({measurements});
const scanner=await runTechnical({measurements,scannerScore:95});
const discovery=await runTechnical({measurements,directionEdge:25});
const both=await runTechnical({
  measurements,scannerScore:95,directionEdge:25,preferredDirection:"SHORT"
});

for(const r of [base,scanner,discovery,both]){
  assert(r.status==="COMPLETE","Technical did not complete.");
  assert(r.evidence.coverage===100,"Coverage changed unexpectedly.");
  assert(r.evidence.canonicalScoreSource==="AVAILABLE_MARKET_MOVEMENT_EVIDENCE_ONLY",
    "Canonical Technical score source is incorrect.");
  assert(r.evidence.executionAuthority===false,"Execution authority violation.");
  assert(r.evidence.liveExecution===false,"Live execution violation.");
}

assert(close(base.score,scanner.score),"scannerScore still changes canonical Technical score.");
assert(close(base.score,discovery.score),"directionEdge still changes canonical Technical score.");
assert(close(base.score,both.score),"Upstream context still changes canonical Technical score.");
assert(base.direction===both.direction,"preferredDirection changed Technical direction.");

assert(both.evidence.scoreContext.scannerScore===95,
  "scannerScore diagnostic context was not preserved.");
assert(both.evidence.scoreContext.discoveryEdge===25,
  "discoveryEdge diagnostic context was not preserved.");
assert(both.evidence.scoreContext.scannerScoreCanonicalAuthority===false,
  "scannerScore canonical authority must be false.");
assert(both.evidence.scoreContext.discoveryEdgeCanonicalAuthority===false,
  "discoveryEdge canonical authority must be false.");

const partial=await runTechnical({
  measurements:{
    change1hPercent:2,
    change4hPercent:4,
    change24hPercent:null,
    change7dPercent:null,
  },
  scannerScore:100,
  directionEdge:100,
});
assert(partial.status==="COMPLETE","Two-horizon Technical should complete.");
assert(partial.evidence.coverage===50,"Two horizons must report 50% coverage.");

const insufficient=await runTechnical({
  measurements:{
    change1hPercent:2,
    change4hPercent:null,
    change24hPercent:null,
    change7dPercent:null,
  },
  scannerScore:100,
  directionEdge:100,
});
assert(insufficient.status==="INSUFFICIENT_DATA",
  "Upstream context must not rescue insufficient Technical evidence.");
assert(insufficient.score===null,
  "Insufficient Technical evidence must not manufacture a score.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.36",
  canonicalTechnical:{
    movementOnlyScore:base.score,
    scannerContextScore:scanner.score,
    discoveryContextScore:discovery.score,
    bothContextScore:both.score,
    scannerScoreDiagnosticOnly:true,
    discoveryEdgeDiagnosticOnly:true,
    upstreamContextCannotChangeCanonicalScore:true,
    preferredDirectionCannotChangeTechnicalDirection:true
  },
  coverage:{
    full:base.evidence.coverage,
    twoHorizons:partial.evidence.coverage,
    oneHorizonFailsClosed:true,
    upstreamContextCannotRescueMissingEvidence:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"CANONICAL_RESEARCH_CONFIDENCE_WEIGHTING_AUDIT"
},null,2));
