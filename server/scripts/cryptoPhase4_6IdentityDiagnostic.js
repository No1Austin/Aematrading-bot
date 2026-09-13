import "dotenv/config";

import runCryptoDiscoveryCycle from "../src/crypto/scanner/cryptoDiscoveryCycle.js";
import {
  analyzeCryptoCandidateIdentities,
  dedupeCryptoCandidates,
} from "../src/crypto/identity/cryptoCandidateIdentity.js";

const discovery = await runCryptoDiscoveryCycle({
  refreshUniverse: true,
  includeDexDiscovery: true,
});

const selected = discovery.selectedCandidates ?? [];
const rows = analyzeCryptoCandidateIdentities(selected);
const deduped = dedupeCryptoCandidates(selected);

console.log("\nAEMA CRYPTO PHASE 4.6.1 — CANONICAL IDENTITY NORMALIZATION\n");

console.table(rows.map((row, i) => ({
  rank: i + 1,
  symbol: row.identity.symbol,
  assetId: row.identity.assetId ?? "N/A",
  contract: row.identity.contractAddress ?? "N/A",
  chain: row.identity.chain ?? "N/A",
  candidateId: row.identity.canonicalKey,
  type: row.identity.candidateType,
  strength: row.identity.identityStrength,
  normalizedBadAssetId: row.identity.invalidAssetIdNormalized,
  duplicate: row.duplicate,
  symbolCollision: row.symbolCollision,
})));

console.log({
  selected: selected.length,
  unique: deduped.candidates.length,
  duplicatesRemoved: deduped.duplicates.length,
  symbolCollisionRows: rows.filter((x) => x.symbolCollision).length,
  invalidAssetIdsNormalized: rows.filter((x) => x.identity.invalidAssetIdNormalized).length,
  weakIdentities: rows.filter((x) => x.identity.identityStrength === "WEAK").length,
});
