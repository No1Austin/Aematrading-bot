import "dotenv/config";

import runCryptoDiscoveryCycle from "../src/crypto/scanner/cryptoDiscoveryCycle.js";
import { buildCryptoBulkResearchContext } from "../src/crypto/research/cryptoBulkResearchContext.js";
import { getCryptoIdentity } from "../src/crypto/identity/cryptoCandidateIdentity.js";
import { resolveCandidateEvents } from "../src/crypto/research/cryptoEventIdentityResolver.js";

const discovery = await runCryptoDiscoveryCycle({
  refreshUniverse: true,
  includeDexDiscovery: true,
});

const context = await buildCryptoBulkResearchContext({
  refreshFundamentals: false,
  refreshFinalIntelligence: true,
});

const snapshot = context.finalIntelligenceSnapshot;
const selected = discovery.selectedCandidates ?? [];

console.log("\nAEMA CRYPTO PHASE 4.6.2 — EVENT IDENTITY HARDENING\n");

const rows = selected.map((candidate, index) => {
  const identity = getCryptoIdentity(candidate);
  const resolved = resolveCandidateEvents(snapshot, candidate);

  return {
    rank: index + 1,
    symbol: identity.symbol,
    assetId: identity.assetId ?? "N/A",
    candidateId: identity.canonicalKey,
    type: identity.candidateType,
    eventMatch: resolved.matchType,
    ambiguous: resolved.ambiguous,
    matchedEvents: resolved.events?.length ?? 0,
    matchedSlugs: (resolved.matchedSlugs ?? []).join(", ") || "N/A",
  };
});

console.table(rows);

console.log({
  selected: rows.length,
  slugMatched: rows.filter((x) => x.eventMatch === "SLUG").length,
  symbolFallbackMatched: rows.filter((x) => x.eventMatch === "SYMBOL_FALLBACK").length,
  ambiguousRejected: rows.filter((x) => x.ambiguous).length,
  noEventMatch: rows.filter((x) => x.eventMatch === "NONE").length,
  coinMarketCalEvents: snapshot?.providers?.coinMarketCal?.events ?? null,
  perCandidateEventNetworkCalls: 0,
});
