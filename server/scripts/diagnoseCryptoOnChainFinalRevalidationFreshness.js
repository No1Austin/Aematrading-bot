/**
 * AEMA Crypto — Phase 6.39
 * OnChain + Final Revalidation Freshness Audit
 *
 * No production changes. No provider/network calls.
 * Audits the current source contracts supplied by the user.
 */
import fs from "node:fs";

const ok=(c,m)=>{if(!c)throw new Error(m);};
const read=p=>fs.readFileSync(p,"utf8");

const onchain=read("src/crypto/analysis/cryptoOnChainEngine.js");
const finalRisk=read("src/crypto/revalidation/cryptoFinalMarketRiskRevalidationEngine.js");
const orchestrator=read("src/crypto/revalidation/cryptoFinalRevalidationOrchestrator.js");
const canonical=read("src/crypto/revalidation/cryptoCanonicalFreshMarketProvider.js");
const llama=read("src/crypto/data/providers/defiLlamaProvider.js");

const onchainHasTimestampCheck =
  /Date\.parse|ageMs|max.*Age|stale|freshness/i.test(onchain);
const onchainRequiresMeaningful =
  onchain.includes("hasMeaningfulOnChainEvidence");
const llamaHasTimestampMetadata =
  /generatedAt|timestamp|updatedAt|fetchedAt|sourceTimestamp/i.test(llama);

ok(onchainRequiresMeaningful,
  "Expected meaningful OnChain evidence guard is missing.");
ok(!onchainHasTimestampCheck,
  "Audit assumption changed: OnChain engine now appears to contain freshness logic.");
ok(!llamaHasTimestampMetadata,
  "Audit assumption changed: DefiLlama provider now appears to expose freshness metadata.");

ok(canonical.includes("refresh: true"),
  "Canonical fresh-market provider is not forcing universe refresh.");
ok(canonical.includes("generatedAt is NOT substituted") ||
   canonical.includes("generatedAt is NOT"),
  "Canonical provider timestamp boundary comment missing.");
ok(orchestrator.includes("sharedIntelligence: null") &&
   orchestrator.includes("sharedIntelligencePromise: null") &&
   orchestrator.includes("sharedEngineResults: null"),
  "Final revalidation may be reusing research-stage shared evidence.");
ok(orchestrator.includes("FRESH_SOURCE_TIMESTAMP_REQUIRED"),
  "Final revalidation does not require a source timestamp.");
ok(finalRisk.includes("MARKET_DATA_TIMESTAMP_REQUIRED") &&
   finalRisk.includes("MARKET_DATA_STALE"),
  "Final market freshness enforcement missing.");
ok(finalRisk.includes("FRESH_RISK_REVALIDATION_REQUIRED"),
  "Fresh Risk gate missing.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.39",
  onChainFreshness:{
    meaningfulEvidenceRequired:true,
    engineValidatesEvidenceTimestamp:false,
    engineValidatesEvidenceAge:false,
    defiLlamaProviderExposesFreshnessMetadata:false,
    staleSharedOnChainEvidenceCanRemainScoreEligible:true,
    finding:"ONCHAIN_EVIDENCE_HAS_APPLICABILITY_GUARDS_BUT_NO_EXPLICIT_FRESHNESS_CONTRACT"
  },
  finalRevalidation:{
    canonicalUniverseRefreshForced:true,
    generatedAtNotUsedAsMarketTimestamp:true,
    researchSharedIntelligenceCleared:true,
    researchSharedEngineResultsCleared:true,
    sourceTimestampRequired:true,
    marketAgeValidated:true,
    freshRiskRequired:true,
    marketFreshnessBoundary:"PASS"
  },
  finding:{
    productionFixRequired:true,
    area:"ONCHAIN_FRESHNESS",
    finalMarketRefreshContractRequiresFix:false,
    recommendedFix:"ADD_SOURCE_TIMESTAMP_AND_MAX_AGE_CONTRACT_TO_ONCHAIN_EVIDENCE; STALE_OR_UNVERIFIABLE_ONCHAIN_EVIDENCE_MUST_BE_UNAVAILABLE_NOT_NEUTRAL"
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"ONCHAIN_FRESHNESS_CONTRACT_IMPLEMENTATION"
},null,2));
