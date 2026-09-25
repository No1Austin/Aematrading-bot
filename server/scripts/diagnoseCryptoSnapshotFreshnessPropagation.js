/**
 * AEMA Crypto — Phase 6.41
 * Freshness Metadata Propagation & Provider Cache Audit
 *
 * Audit only. No provider/network calls and no production changes.
 */
import fs from "node:fs";

const ok=(c,m)=>{if(!c)throw new Error(m);};
const src=fs.readFileSync(
  "src/crypto/data/providers/cryptoFundamentalSnapshotProvider.js",
  "utf8"
);

ok(src.includes("let cache ="),"Snapshot cache not found.");
ok(src.includes("sourceFetchedAt"),"Snapshot sourceFetchedAt contract missing.");
ok(src.includes("previousFetchedAt"),"Stale fallback timestamp preservation missing.");
ok(src.includes('freshness === "LIVE"'),"LIVE snapshot contract missing.");
ok(src.includes('"STALE_FALLBACK"'),"STALE_FALLBACK contract missing.");
ok(src.includes("fetchDefiLlama"),"Embedded DefiLlama fetch path missing.");

const importsSharedProvider =
  /from\s+["'][^"']*defiLlamaProvider\.js["']/.test(src);
const embedsOwnLlamaFetch =
  src.includes('`${LLAMA}/protocols`');
const hasProviderSpecificLlamaTimestamp =
  /defiLlama[^\\n]{0,120}(fetchedAt|sourceFetchedAt|timestamp)/i.test(src) ||
  /(fetchedAt|sourceFetchedAt|timestamp)[^\\n]{0,120}defiLlama/i.test(src);

ok(!importsSharedProvider,
  "Audit assumption changed: snapshot provider now imports defiLlamaProvider.");
ok(embedsOwnLlamaFetch,
  "Audit assumption changed: embedded DefiLlama fetch no longer found.");
ok(!hasProviderSpecificLlamaTimestamp,
  "Audit assumption changed: provider-specific DefiLlama timestamp appears present.");

console.log(JSON.stringify({
  passed:true,
  phase:"6.41",
  snapshotLifecycle:{
    snapshotCachePresent:true,
    snapshotLevelSourceFetchedAtPresent:true,
    staleFallbackPreservesPreviousSnapshotTimestamp:true,
    embeddedDefiLlamaFetch:true,
    importsPhase640DefiLlamaProvider:false,
    providerSpecificDefiLlamaTimestampBoundToSnapshot:false
  },
  phase640Integration:{
    globalDefiLlamaFetchMetadataCanDescribeDifferentFetch:true,
    exactConsumedSnapshotFreshnessNotProven:true,
    falseFreshnessRisk:true,
    failClosedGuaranteeIncomplete:true
  },
  finding:{
    productionFixRequired:true,
    area:"SNAPSHOT_BOUND_ONCHAIN_FRESHNESS",
    recommendedFix:"BIND_DEFILLAMA_FETCHED_AT_TO_THE_FUNDAMENTAL_SNAPSHOT_AND_PROPAGATE_THAT_EXACT_METADATA_TO_ONCHAIN; DO_NOT_USE_PROCESS_GLOBAL_LAST_FETCH_METADATA"
  },
  executionAuthority:false,
  liveExecution:false,
  nextStage:"SNAPSHOT_BOUND_ONCHAIN_FRESHNESS_FIX"
},null,2));
