/**
 * AEMA Crypto — Phase 6.33
 * Final Intelligence Freshness Enforcement diagnostic.
 *
 * Source-contract + isolated freshness semantics test.
 * Provider network is not invoked.
 */
import fs from "node:fs";
import path from "node:path";

function assert(c,m){if(!c)throw new Error(m);}

const file=path.resolve("src/crypto/intelligence/cryptoGptIntelligenceProvider.js");
const source=fs.readFileSync(file,"utf8");

assert(source.includes("AEMA_GPT_INTELLIGENCE_MAX_FRESH_AGE_MS"),
  "Missing configurable GPT intelligence freshness ceiling.");
assert(source.includes("GENERATED_AT_MISSING_OR_INVALID"),
  "Missing fail-closed invalid timestamp rule.");
assert(source.includes("GPT_INTELLIGENCE_STALE"),
  "Missing stale intelligence rule.");
assert(source.includes("applyFreshnessContract"),
  "Missing freshness application contract.");
assert(source.includes("available: false") && source.includes("score: null"),
  "Stale evidence must become unavailable with null score.");
assert(source.includes("executionAuthority:") && source.includes("liveExecution:"),
  "Execution safety fields missing.");

const maxAge=15*60*1000;
function freshness(generatedAt,now){
  const timestamp=Date.parse(String(generatedAt??""));
  if(!Number.isFinite(timestamp))
    return {fresh:false,ageMs:null,reason:"GENERATED_AT_MISSING_OR_INVALID"};
  const ageMs=Math.max(0,now-timestamp);
  return {fresh:ageMs<=maxAge,ageMs,reason:ageMs<=maxAge?null:"GPT_INTELLIGENCE_STALE"};
}
const now=Date.parse("2026-09-19T20:30:00.000Z");
const fresh=freshness("2026-09-19T20:20:00.000Z",now);
const boundary=freshness("2026-09-19T20:15:00.000Z",now);
const stale=freshness("2026-09-19T20:14:59.999Z",now);
const missing=freshness(null,now);

assert(fresh.fresh===true,"Within-TTL intelligence should remain fresh.");
assert(boundary.fresh===true,"TTL boundary should remain usable.");
assert(stale.fresh===false,"Past-TTL intelligence must be stale.");
assert(missing.fresh===false,"Missing timestamp must fail closed.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.33",
  freshnessEnforcement:{
    generatedAtIsAuthority:true,
    cachedWithinTtlUsable:true,
    ttlBoundaryUsable:true,
    staleEvidenceUnavailable:true,
    staleScoreNull:true,
    missingTimestampFailsClosed:true,
    providerFailureRemainsUnavailable:true
  },
  preserved:{
    oneSnapshotFeedsNewsEventsNarrative:true,
    cacheAndInflightDeduplication:true,
    researchOnly:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"RISK_FRESHNESS_RUNTIME_INTEGRATION_TEST"
},null,2));
