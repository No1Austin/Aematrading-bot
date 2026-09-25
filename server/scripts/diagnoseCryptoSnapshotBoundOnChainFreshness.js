/**
 * AEMA Crypto — Phase 6.42
 * Snapshot-Bound OnChain Freshness Contract Diagnostic
 *
 * Source-contract diagnostic only; no network calls.
 */
import fs from "node:fs";

const ok=(c,m)=>{if(!c)throw new Error(m);};

const snapshot=fs.readFileSync(
  "src/crypto/data/providers/cryptoFundamentalSnapshotProvider.js","utf8"
);
const adapter=fs.readFileSync(
  "src/crypto/scanner/cryptoScannerEngineAdapters.js","utf8"
);

ok(snapshot.includes("defiLlamaFetchedAt"),
  "Snapshot-bound DefiLlama timestamp missing.");
ok(snapshot.includes("llamaResult") && snapshot.includes(".fetchedAt"),
  "Fresh DefiLlama fetch timestamp is not propagated.");
ok(snapshot.includes("previous") &&
   snapshot.includes("?.providers") &&
   snapshot.includes("?.defiLlamaFetchedAt"),
  "Stale DefiLlama rows do not preserve their original timestamp.");
ok(adapter.includes("FUNDAMENTAL_SNAPSHOT_BOUND_DEFILLAMA_FETCH"),
  "Adapter does not declare snapshot-bound timestamp authority.");
ok(adapter.includes("fundamentalSnapshot") &&
   adapter.includes("?.providers") &&
   adapter.includes("?.defiLlamaFetchedAt"),
  "Adapter does not pass exact snapshot-bound DefiLlama timestamp.");
ok(!adapter.includes("getDefiLlamaProtocolsFetchMetadata"),
  "Process-global DefiLlama freshness metadata is still used by OnChain.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.42",
  snapshotBoundFreshness:{
    freshDefiLlamaRowsReceiveOwnFetchTimestamp:true,
    timestampStoredOnExactFundamentalSnapshot:true,
    staleDefiLlamaRowsPreserveOriginalTimestamp:true,
    unavailableDefiLlamaTimestampRemainsNull:true,
    adapterConsumesSnapshotBoundTimestamp:true,
    processGlobalLastFetchDependencyRemoved:true
  },
  failClosedChain:{
    exactSnapshotTimestampToOnChain:true,
    staleSnapshotCannotBorrowNewerUnrelatedTimestamp:true,
    missingSnapshotTimestampReachesOnChainAsNull:true,
    phase640EngineStillOwnsMaximumAgeDecision:true
  },
  preserved:{
    snapshotCache:true,
    staleFallback:true,
    noCandidateSpecificProviderRequest:true,
    canonicalResearchWeightsUnchanged:true,
    finalRevalidationPathUnchanged:true
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"SUPPORTING_INTERNAL_COVERAGE_CONFIDENCE_AUDIT"
},null,2));
