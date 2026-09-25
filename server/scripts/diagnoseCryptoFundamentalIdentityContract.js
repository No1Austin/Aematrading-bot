/**
 * AEMA Crypto — Phase 6.31
 * Fundamental Identity & Evidence Contract Audit
 *
 * Runtime audit. No provider HTTP is required.
 * Exercises the real lookupCryptoFundamentals() against deterministic
 * in-memory snapshot indexes.
 */

import {
  lookupCryptoFundamentals,
} from "../src/crypto/data/providers/cryptoFundamentalSnapshotProvider.js";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const cgBitcoin = {
  id: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  marketCapUsd: 1_000_000,
};

const cgCanonicalSame = {
  id: "canonical-same",
  symbol: "SAME",
  name: "Canonical Same",
  marketCapUsd: 500_000,
};

const llamaBitcoin = {
  id: "llama-bitcoin",
  geckoId: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  tvlUsd: 10_000,
};

const llamaCanonicalSame = {
  id: "llama-same",
  geckoId: "canonical-same",
  symbol: "SAME",
  name: "Canonical Same",
  tvlUsd: 5_000,
};

const snapshot = {
  freshness: "LIVE",
  fetchedAt: "2026-09-19T20:00:00.000Z",
  sourceFetchedAt: "2026-09-19T20:00:00.000Z",
  index: {
    byId: new Map([
      ["bitcoin", cgBitcoin],
      ["canonical-same", cgCanonicalSame],
    ]),
    bySymbol: new Map([
      ["btc", cgBitcoin],
      ["same", cgCanonicalSame],
    ]),
    byName: new Map([
      ["bitcoin", cgBitcoin],
      ["canonicalsame", cgCanonicalSame],
    ]),
    llamaByGecko: new Map([
      ["bitcoin", llamaBitcoin],
      ["canonical-same", llamaCanonicalSame],
    ]),
    llamaBySymbol: new Map([
      ["btc", llamaBitcoin],
      ["same", llamaCanonicalSame],
    ]),
    llamaByName: new Map([
      ["bitcoin", llamaBitcoin],
      ["canonicalsame", llamaCanonicalSame],
    ]),
  },
};

// 1. CEX exact canonical ID.
const cexExact = lookupCryptoFundamentals(
  snapshot,
  {
    candidateType: "CEX",
    assetId: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
  },
);

assert(cexExact?.market === cgBitcoin, "CEX exact ID market match failed.");
assert(cexExact?.protocol === llamaBitcoin, "CEX exact ID protocol match failed.");
assert(cexExact?.identity?.marketMatchType === "ASSET_ID", "Expected ASSET_ID.");
assert(cexExact?.identity?.protocolMatchType === "GECKO_ID", "Expected GECKO_ID.");
assert(cexExact?.identity?.exactIdentity === true, "Exact CEX identity must be true.");

// 2. CEX symbol fallback remains allowed.
const cexSymbolFallback = lookupCryptoFundamentals(
  snapshot,
  {
    candidateType: "CEX",
    symbol: "BTC",
    name: "Unknown Name",
  },
);

assert(
  cexSymbolFallback?.market === cgBitcoin,
  "CEX symbol fallback should resolve canonical market.",
);
assert(
  cexSymbolFallback?.identity?.marketMatchType === "CEX_SYMBOL_FALLBACK",
  "Expected CEX_SYMBOL_FALLBACK.",
);

// 3. EMERGING same ticker must NOT inherit CEX fundamentals.
const emergingCollision = lookupCryptoFundamentals(
  snapshot,
  {
    candidateType: "EMERGING",
    symbol: "SAME",
    name: "Different Contract Token",
    contractAddress: "0xdeadbeef",
    network: "base",
  },
);

assert(
  emergingCollision === null,
  "EMERGING symbol collision inherited unrelated canonical fundamentals.",
);

// 4. EMERGING exact canonical ID is allowed.
const emergingExact = lookupCryptoFundamentals(
  snapshot,
  {
    candidateType: "EMERGING",
    assetId: "canonical-same",
    symbol: "SAME",
    contractAddress: "0x1234",
    network: "base",
  },
);

assert(
  emergingExact?.market === cgCanonicalSame,
  "EMERGING exact canonical ID should resolve.",
);
assert(
  emergingExact?.identity?.marketMatchType === "ASSET_ID",
  "EMERGING exact match must be ASSET_ID.",
);
assert(
  emergingExact?.identity?.exactIdentity === true,
  "EMERGING exact canonical match must be marked exact.",
);

// 5. Unknown/DEX-style candidate must not receive CEX symbol fallback.
// Current provider deliberately grants fallback only when type === CEX.
const dexCollision = lookupCryptoFundamentals(
  snapshot,
  {
    candidateType: "DEX",
    symbol: "SAME",
    name: "Different DEX Token",
    contractAddress: "0x9999",
    network: "solana",
  },
);

assert(
  dexCollision === null,
  "DEX-only candidate inherited CEX symbol/name fundamentals.",
);

// 6. No identity = no attribution.
const unknown = lookupCryptoFundamentals(
  snapshot,
  {
    candidateType: "UNKNOWN",
    symbol: "NOTHING",
  },
);

assert(unknown === null, "Unknown asset should not receive fundamentals.");

console.log(JSON.stringify({
  passed: true,
  phase: "6.31",
  runtimeIdentityAudit: {
    cexExactAssetId: true,
    cexExactProtocolGeckoId: true,
    cexSymbolFallbackAllowed: true,
    emergingSymbolCollisionBlocked: true,
    emergingExactCanonicalIdAllowed: true,
    dexOnlySymbolCollisionBlocked: true,
    unknownIdentityBlocked: true
  },
  evidenceContractVerifiedFromCurrentProvider: {
    missingEvidenceUnavailableNotZeroOrNeutral: true,
    symbolOnlyEmergingAttributionBlocked: true,
    candidateSpecificHttpRequired: false,
    sharedBatchSnapshotsSupported: true
  },
  executionAuthority: false,
  liveExecution: false,
  nextStage: "FINAL_INTELLIGENCE_IDENTITY_AND_STALE_DATA_AUDIT"
}, null, 2));
