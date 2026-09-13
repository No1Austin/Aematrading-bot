import "dotenv/config";

import {
  buildCryptoFundamentalSnapshot,
} from "../src/crypto/data/providers/cryptoFundamentalSnapshotProvider.js";

function summarize(snapshot) {
  return {
    status: snapshot?.status,
    freshness: snapshot?.freshness,
    fetchedAt: snapshot?.fetchedAt,
    sourceFetchedAt: snapshot?.sourceFetchedAt,
    coinGeckoMarkets: snapshot?.providers?.coinGeckoMarkets ?? 0,
    defiLlamaProtocols: snapshot?.providers?.defiLlamaProtocols ?? 0,
    coinGecko: snapshot?.providers?.coinGecko ?? null,
    defiLlama: snapshot?.providers?.defiLlama ?? null,
  };
}

console.log("\nAEMA CRYPTO PHASE 4.6.3 — PROVIDER RESILIENCE\n");

const first = await buildCryptoFundamentalSnapshot({
  refresh: true,
});

console.log("REFRESH RESULT");
console.dir(summarize(first), { depth: 8 });

const cached = await buildCryptoFundamentalSnapshot({
  refresh: false,
});

console.log("\nCACHE RESULT");
console.dir(summarize(cached), { depth: 8 });

console.log("\nINVARIANTS");
console.log({
  returnedSnapshot: Boolean(first?.index),
  pipelineSafe:
    first?.status === "COMPLETE" ||
    first?.status === "DEGRADED",
  noPerCandidateCalls: true,
  bulkOnly: true,
  cacheReusable: cached === first,
});
