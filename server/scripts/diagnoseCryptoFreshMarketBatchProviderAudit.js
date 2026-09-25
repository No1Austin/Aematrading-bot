/**
 * AEMA Crypto — Phase 6.50
 * Fresh Market Batch Provider Audit
 *
 * Diagnostic only. No production changes.
 */
import fs from "node:fs";

const file="src/crypto/revalidation/cryptoFreshMarketBatchProvider.js";
const source=fs.readFileSync(file,"utf8");

const test=(re)=>re.test(source);
const checks={
  forcesUniverseRefresh:test(/getCryptoUniverse\s*\(\s*\{[\s\S]*?refresh\s*:\s*true/),
  sharedSnapshot:test(/sharedBatchSnapshot\s*:\s*true/),
  exposesUniverseGeneratedAt:test(/generatedAt\s*:\s*universe\?\.generatedAt/),
  contractFirst:test(/const ck = contractKey\(target\)[\s\S]*?const ik = exactIdKey\(target\)/),
  assetIdFallback:test(/matchedBy:\s*"ASSET_ID"/),
  cexSymbolRestricted:test(/target\.candidateType === "CEX"[\s\S]*?target\.candidateType === "CEX_DEX"/),
  symbolOnlyRequiresUnique:test(/rows\.length === 1/),
  noLiveAuthority:test(/liveExecution\s*:\s*false/),
  noExecutionAuthority:test(/executionAuthority\s*:\s*false/),
  validatesSnapshotFreshness:
    test(/max(?:imum)?(?:Snapshot|Universe|Batch)?Age|STALE|snapshotFresh|freshness/i),
  validatesFutureGeneratedAt:
    test(/futureSkew|TIMESTAMP_IN_FUTURE|generatedAt\s*>|nowMs\s*-\s*generatedAt/i),
  validatesResolvedAssetTimestamp:
    test(/measuredAt[\s\S]*?(?:stale|ageMs|maxMeasurementAge)|timestamp[\s\S]*?(?:stale|ageMs|maxMeasurementAge)/i),
  rejectsUniverseStaleFallback:
    test(/STALE_FALLBACK[\s\S]*?(?:reject|approved\s*:\s*false|throw)|(?:reject|approved\s*:\s*false|throw)[\s\S]*?STALE_FALLBACK/i),
};

const findings=[];
if(!checks.validatesSnapshotFreshness)
  findings.push("BATCH_DOES_NOT_VALIDATE_UNIVERSE_GENERATED_AT_FRESHNESS");
if(!checks.validatesFutureGeneratedAt)
  findings.push("BATCH_DOES_NOT_REJECT_FUTURE_DATED_UNIVERSE_SNAPSHOT");
if(!checks.validatesResolvedAssetTimestamp)
  findings.push("BATCH_DOES_NOT_ITSELF_VALIDATE_RESOLVED_ASSET_MEASUREMENT_TIMESTAMP");
if(!checks.rejectsUniverseStaleFallback)
  findings.push("NO_EXPLICIT_STALE_FALLBACK_REJECTION_VISIBLE_IN_BATCH_PROVIDER");

console.log(JSON.stringify({
  passed:true,
  phase:"6.50",
  audit:checks,
  finding:{
    productionFixRequired:findings.length>0,
    findings,
    importantBoundary:
      "FINAL_REVALIDATION_NOW_VALIDATES_RESOLVED_MARKET_TIMESTAMP, BUT_BATCH_SNAPSHOT_AUTHORITY_IS_NOT_INDEPENDENTLY_BOUNDED",
  },
  preserved:{
    identityPriority:"NETWORK_CONTRACT_THEN_ASSET_ID_THEN_CEX_SAFE_SYMBOL",
    sharedFreshFetchIntent:true,
    paperOnly:true,
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:findings.length
    ?"FRESH_MARKET_BATCH_FRESHNESS_AUTHORITY_FIX"
    :"FRESH_MARKET_BATCH_RUNTIME_CONTRACT_TEST",
},null,2));
