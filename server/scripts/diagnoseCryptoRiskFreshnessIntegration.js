/**
 * AEMA Crypto — Phase 6.34
 * Risk Freshness Runtime Integration Test
 *
 * Executes the real Phase 6.22 Risk engine with provider-shaped fresh/stale
 * event buckets. No network calls and no production modifications.
 */

import runCryptoRiskEngine from "../src/crypto/analysis/cryptoRiskEngine.js";

function assert(c,m){if(!c)throw new Error(m);}

const ready=(score,confidence=80,evidence={})=>({
  available:true, approved:true, status:"COMPLETE",
  score, confidence, evidence
});

const staleEvent={
  available:false,
  approved:true,
  status:"COMPLETE",
  score:null,
  confidence:0,
  summary:"Preserved stale summary for diagnostics only.",
  evidence:[{claim:"Historical event evidence"}],
  warnings:["GPT_INTELLIGENCE_STALE"],
  freshness:{
    fresh:false,
    ageMs:900001,
    maxAgeMs:900000,
    reason:"GPT_INTELLIGENCE_STALE"
  }
};

const freshEvent={
  ...ready(84,90,{items:[{claim:"Fresh event evidence"}]}),
  freshness:{
    fresh:true,
    ageMs:300000,
    maxAgeMs:900000,
    reason:null
  }
};

const liquidity=ready(76,82,{kind:"LIQUIDITY"});
const onChain=ready(72,78,{kind:"ON_CHAIN"});
const integrity=ready(80,75,{kind:"PROJECT"});
const structure=ready(74,81,{kind:"STRUCTURE"});
const context={preferredDirection:"LONG"};

const fresh=await runCryptoRiskEngine(context,{
  finalIntelligence:{events:freshEvent},
  liquidityResult:liquidity,
  onChainResult:onChain,
  projectIntegrity:integrity,
  marketStructure:structure
});

const stale=await runCryptoRiskEngine(context,{
  finalIntelligence:{events:staleEvent},
  liquidityResult:liquidity,
  onChainResult:onChain,
  projectIntegrity:integrity,
  marketStructure:structure
});

assert(fresh.status==="COMPLETE","Fresh intelligence Risk run failed.");
assert(fresh.evidence.coverage===100,
  `Fresh evidence should provide 100 coverage, got ${fresh.evidence.coverage}.`);
assert(fresh.evidence.inputs.some(x=>x.source==="GPT_EVENT_INTELLIGENCE"),
  "Fresh event intelligence should contribute to Risk.");

assert(stale.status==="COMPLETE","Stale intelligence should not break remaining Risk evidence.");
assert(Math.abs(stale.evidence.coverage-70)<0.0001,
  `Stale event must remove its 30% weight; got ${stale.evidence.coverage}.`);
assert(!stale.evidence.inputs.some(x=>x.source==="GPT_EVENT_INTELLIGENCE"),
  "Stale event intelligence entered Risk despite available:false/score:null.");

const staleOnly=await runCryptoRiskEngine(context,{
  finalIntelligence:{events:staleEvent},
  liquidityResult:null,
  onChainResult:null,
  projectIntegrity:null,
  marketStructure:null
});

assert(staleOnly.status==="INSUFFICIENT_DATA",
  "Stale-only Risk evidence must fail closed.");
assert(staleOnly.score===null,
  "Stale-only Risk evidence must not manufacture a score.");

for(const result of [fresh,stale,staleOnly]){
  assert(result.evidence?.executionAuthority===false,
    "Risk gained execution authority.");
  assert(result.evidence?.liveExecution===false,
    "Risk gained live execution authority.");
}

console.log(JSON.stringify({
  passed:true,
  phase:"6.34",
  runtimeIntegration:{
    realRiskEngineExecuted:true,
    freshEventAccepted:true,
    freshCoverage:fresh.evidence.coverage,
    staleEventRejected:true,
    staleEventWeightRemoved:30,
    remainingCoverage:stale.evidence.coverage,
    remainingEvidenceRenormalized:true,
    staleOnlyFailsClosed:true,
    staleOnlyScoreNull:true
  },
  canonicalBoundary:{
    riskExcludedFromCanonicalSupporting:
      fresh.evidence.canonicalSupportingEligible===false &&
      stale.evidence.canonicalSupportingEligible===false,
    finalRevalidationEligible:
      fresh.evidence.finalRevalidationEligible===true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"TECHNICAL_CONTEXT_DOUBLE_COUNT_AND_COVERAGE_AUDIT"
},null,2));
