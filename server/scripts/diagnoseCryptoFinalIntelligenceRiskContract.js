/**
 * AEMA Crypto — Phase 6.32
 * Final Intelligence Identity & Stale-Data Audit
 *
 * Runtime audit of the real Risk engine using deterministic intelligence
 * fixtures. No provider HTTP required.
 */

import runCryptoRiskEngine from "../src/crypto/analysis/cryptoRiskEngine.js";

function assert(c,m){ if(!c) throw new Error(m); }

const ready=(score,confidence=80,evidence={})=>({
  approved:true,status:"READY",score,confidence,
  availability:{available:true},
  evidence
});

const unavailable=()=>({
  approved:false,status:"UNAVAILABLE",score:null,confidence:0,
  availability:{available:false}
});

const ctx={preferredDirection:"LONG"};

const event = ready(82,88,{kind:"EVENT_RISK"});
const liquidity = ready(75,80,{kind:"LIQUIDITY"});
const onChain = ready(70,76,{kind:"ON_CHAIN"});
const integrity = ready(78,74,{kind:"PROJECT"});
const structure = ready(72,79,{kind:"STRUCTURE"});

const full = await runCryptoRiskEngine(ctx,{
  finalIntelligence:{events:event},
  liquidityResult:liquidity,
  onChainResult:onChain,
  projectIntegrity:integrity,
  marketStructure:structure,
});

assert(full.status==="COMPLETE","Full Risk runtime did not complete.");
assert(full.evidence?.canonicalSupportingEligible===false,
  "Risk must remain excluded from canonical Supporting.");
assert(full.evidence?.canonicalScoreAuthority===false,
  "Risk must not gain canonical score authority.");
assert(full.evidence?.finalRevalidationEligible===true,
  "Risk should remain eligible for final safety revalidation.");
assert(full.evidence?.coverage===100,
  `Expected full Risk coverage=100, got ${full.evidence?.coverage}.`);
assert(full.evidence?.inputs?.length===5,
  "Expected five represented Risk inputs.");

const noEvent = await runCryptoRiskEngine(ctx,{
  finalIntelligence:{events:unavailable()},
  liquidityResult:liquidity,
  onChainResult:onChain,
  projectIntegrity:integrity,
  marketStructure:structure,
});

assert(noEvent.status==="COMPLETE",
  "Risk should renormalize over available non-event evidence.");
assert(Math.abs(noEvent.evidence.coverage-70)<0.0001,
  `Expected 70% coverage without event evidence, got ${noEvent.evidence.coverage}.`);
assert(!noEvent.evidence.inputs.some(x=>x.source==="GPT_EVENT_INTELLIGENCE"),
  "Unavailable event evidence must be excluded, not neutralized.");

const eventOnly = await runCryptoRiskEngine(ctx,{
  finalIntelligence:{events:event},
  liquidityResult:unavailable(),
  onChainResult:unavailable(),
  projectIntegrity:unavailable(),
  marketStructure:unavailable(),
});

assert(eventOnly.status==="COMPLETE","Event-only Risk should complete.");
assert(Math.abs(eventOnly.evidence.coverage-30)<0.0001,
  `Expected event-only coverage=30, got ${eventOnly.evidence.coverage}.`);
assert(eventOnly.evidence.inputs.length===1,
  "Unavailable evidence must not become synthetic Risk inputs.");

const none = await runCryptoRiskEngine(ctx,{
  finalIntelligence:{events:unavailable()},
  liquidityResult:unavailable(),
  onChainResult:unavailable(),
  projectIntegrity:unavailable(),
  marketStructure:unavailable(),
});

assert(none.status==="INSUFFICIENT_DATA",
  "No Risk evidence must fail closed as INSUFFICIENT_DATA.");
assert(none.score===null,"No evidence must not become score 0/50.");

for(const r of [full,noEvent,eventOnly,none]){
  assert(r.evidence?.executionAuthority===false,
    "Risk evidence must not gain execution authority.");
  assert(r.evidence?.liveExecution===false,
    "Risk evidence must not gain live execution authority.");
}

console.log(JSON.stringify({
  passed:true,
  phase:"6.32",
  runtimeRiskAudit:{
    realRiskEngineExecuted:true,
    fullEvidenceCoverage:full.evidence.coverage,
    unavailableEventExcluded:true,
    remainingEvidenceRenormalized:true,
    eventOnlyCoverage:eventOnly.evidence.coverage,
    noEvidenceFailsClosed:true
  },
  finalIntelligenceBoundary:{
    eventIntelligenceIsSafetyEvidence:true,
    riskExcludedFromCanonicalSupporting:true,
    riskFinalRevalidationEligible:true,
    missingIntelligenceNotNeutralized:true
  },
  staleDataFinding:{
    riskEngineConsumesProvidedEventSnapshot:true,
    riskEngineDoesNotValidateEventTimestampOrAge:true,
    requiresUpstreamFreshnessEnforcement:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"FINAL_INTELLIGENCE_FRESHNESS_ENFORCEMENT"
},null,2));
