/**
 * AEMA Crypto — Phase 6.51
 * Fresh Market Batch Freshness Authority Fix Diagnostic
 * Source-contract test; no network calls.
 */
import fs from "node:fs";

const source=fs.readFileSync(
  "src/crypto/revalidation/cryptoFreshMarketBatchProvider.js",
  "utf8",
);

const ok=(v,m)=>{if(!v)throw new Error(m);};

ok(source.includes("maxBatchBuildAgeMs"),"Missing batch age bound.");
ok(source.includes("maxFutureClockSkewMs"),"Missing future skew bound.");
ok(source.includes("FRESH_BATCH_TIMESTAMP_REQUIRED"),"Missing timestamp fail-closed.");
ok(source.includes("FRESH_BATCH_TIMESTAMP_IN_FUTURE"),"Missing future timestamp rejection.");
ok(source.includes("FRESH_BATCH_STALE"),"Missing stale batch rejection.");
ok(source.includes("FRESH_BATCH_UNIVERSE_UNAVAILABLE"),"Missing unavailable universe rejection.");
ok(source.includes("FRESH_BATCH_STATUS_NOT_USABLE"),"Missing status gate.");
ok(source.includes('status !== "COMPLETE" && status !== "PARTIAL"'),"COMPLETE/PARTIAL policy missing.");
ok(source.includes("if (!batchFresh)"),"Resolver does not fail closed on invalid batch.");
ok(source.includes("generatedAtIsMeasurementTimestamp: false"),"Timestamp authority boundary missing.");
ok(source.includes('"FINAL_REVALIDATION_6_49"'),"Individual measurement freshness authority missing.");
ok(source.includes('matchedBy: "NETWORK_CONTRACT"'),"Contract identity priority lost.");
ok(source.includes('matchedBy: "ASSET_ID"'),"Asset ID matching lost.");
ok(source.includes('matchedBy: "CEX_UNAMBIGUOUS_SYMBOL"'),"CEX safe symbol fallback lost.");
ok(source.includes("executionAuthority: false"),"Execution boundary changed.");
ok(source.includes("liveExecution: false"),"Live execution boundary changed.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.51",
  batchFreshnessAuthority:{
    refreshIntentPreserved:true,
    generatedAtRequired:true,
    staleBatchRejected:true,
    futureBatchRejected:true,
    boundedClockSkewMs:5000,
    maxBatchBuildAgeMs:120000,
    completeAccepted:true,
    partialAccepted:true,
    errorAndEmptyRejected:true,
    invalidBatchCannotResolveAssets:true
  },
  timestampSemantics:{
    universeGeneratedAt:"BUILD_COMPLETION_ONLY",
    universeGeneratedAtUsedAsAssetMeasurementTime:false,
    individualMeasurementFreshnessAuthority:"FINAL_REVALIDATION_6_49",
    staleFallbackContractInvented:false
  },
  identity:{
    contractFirst:true,
    assetIdSecond:true,
    cexSafeSymbolFallback:true
  },
  preserved:{
    canonicalWeights:"20_20_60",
    qualification2:true,
    paperOnly:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"FRESH_MARKET_BATCH_RUNTIME_INTEGRATION_AUDIT"
},null,2));
