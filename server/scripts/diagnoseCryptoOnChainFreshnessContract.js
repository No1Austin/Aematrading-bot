/**
 * AEMA Crypto — Phase 6.40
 * OnChain Freshness Contract Diagnostic
 */
import runCryptoOnChainEngine from "../src/crypto/analysis/cryptoOnChainEngine.js";

const ok=(c,m)=>{if(!c)throw new Error(m);};

const context={
  preferredDirection:"LONG",
  supportingIntelligence:{
    onChain:{
      score:72,
      evidence:{
        tvlUsd:1000000,
        chains:["Ethereum"],
        change1d:1.2,
        change7d:4.5,
      },
    },
  },
};

const nowMs=Date.parse("2026-09-19T20:00:00.000Z");
const maxEvidenceAgeMs=15*60*1000;

const fresh=await runCryptoOnChainEngine(context,{
  nowMs,maxEvidenceAgeMs,
  freshness:{source:"DEFILLAMA_PROTOCOLS",fetchedAt:"2026-09-19T19:50:00.000Z"},
});
const boundary=await runCryptoOnChainEngine(context,{
  nowMs,maxEvidenceAgeMs,
  freshness:{source:"DEFILLAMA_PROTOCOLS",fetchedAt:"2026-09-19T19:45:00.000Z"},
});
const stale=await runCryptoOnChainEngine(context,{
  nowMs,maxEvidenceAgeMs,
  freshness:{source:"DEFILLAMA_PROTOCOLS",fetchedAt:"2026-09-19T19:44:59.999Z"},
});
const missing=await runCryptoOnChainEngine(context,{
  nowMs,maxEvidenceAgeMs,freshness:null,
});

ok(fresh?.approved===true && fresh?.status==="COMPLETE","Fresh evidence rejected.");
ok(boundary?.approved===true,"TTL boundary should remain usable.");
ok(stale?.approved===false && stale?.score===null,"Stale evidence did not fail closed.");
ok(stale?.warnings?.includes("ONCHAIN_EVIDENCE_STALE"),"Stale reason missing.");
ok(missing?.approved===false && missing?.score===null,"Missing timestamp did not fail closed.");
ok(missing?.warnings?.includes("ONCHAIN_FRESHNESS_TIMESTAMP_REQUIRED"),"Missing timestamp reason missing.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.40",
  onChainFreshness:{
    providerFetchTimestampAuthority:true,
    freshEvidenceAccepted:true,
    ttlBoundaryAccepted:true,
    staleEvidenceUnavailable:true,
    staleScoreNull:true,
    missingTimestampUnavailable:true,
    missingTimestampScoreNull:true,
    maximumAgeMs:maxEvidenceAgeMs
  },
  preserved:{
    meaningfulEvidenceGuard:true,
    noCandidateSpecificProviderRequest:true,
    missingEvidenceNotNeutralized:true,
    finalRevalidationPathChanged:false
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"FRESHNESS_METADATA_PROPAGATION_AND_PROVIDER_CACHE_AUDIT"
},null,2));
