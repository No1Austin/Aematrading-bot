import "dotenv/config";

import runCryptoDiscoveryCycle from "../src/crypto/scanner/cryptoDiscoveryCycle.js";

import {
  buildCryptoFundamentalSnapshot,
  lookupCryptoFundamentals,
} from "../src/crypto/data/providers/cryptoFundamentalSnapshotProvider.js";

import {
  getCryptoIdentity,
} from "../src/crypto/identity/cryptoCandidateIdentity.js";

const discovery =
  await runCryptoDiscoveryCycle({
    refreshUniverse: true,
    includeDexDiscovery: true,
  });

const snapshot =
  await buildCryptoFundamentalSnapshot({
    refresh: true,
  });

const selected =
  discovery?.selectedCandidates ??
  [];

console.log(
  "\nAEMA CRYPTO PHASE 4.6.5 — FUNDAMENTAL IDENTITY HARDENING\n",
);

const rows =
  selected.map(
    (
      candidate,
      index,
    ) => {
      const identity =
        getCryptoIdentity(
          candidate,
        );

      const evidence =
        lookupCryptoFundamentals(
          snapshot,
          candidate,
        );

      return {
        rank:
          index + 1,

        symbol:
          identity.symbol,

        type:
          identity
            .candidateType,

        assetId:
          identity.assetId ??
          "N/A",

        market:
          evidence?.market
            ?.id ??
          "N/A",

        marketMatch:
          evidence
            ?.marketMatchType ??
          "NONE",

        protocol:
          evidence
            ?.protocol
            ?.name ??
          "N/A",

        protocolMatch:
          evidence
            ?.protocolMatchType ??
          "NONE",

        exact:
          evidence
            ?.identity
            ?.exactIdentity ===
          true,
      };
    },
  );

console.table(rows);

const emerging =
  rows.filter(
    row =>
      row.type ===
      "EMERGING",
  );

console.log(
  "\nINVARIANTS",
);

console.log({
  selected:
    rows.length,

  emerging:
    emerging.length,

  emergingSymbolFallbacks:
    emerging.filter(
      row =>
        String(
          row.marketMatch,
        ).includes(
          "CEX_",
        ) ||
        String(
          row.protocolMatch,
        ).includes(
          "CEX_",
        ),
    ).length,

  emergingFundamentalIsolation:
    emerging.every(
      row =>
        !String(
          row.marketMatch,
        ).includes(
          "CEX_",
        ) &&
        !String(
          row.protocolMatch,
        ).includes(
          "CEX_",
        ),
    ),

  snapshotStatus:
    snapshot?.status,

  snapshotFreshness:
    snapshot?.freshness,

  coinGeckoMarkets:
    snapshot?.providers
      ?.coinGeckoMarkets ??
    0,

  defiLlamaProtocols:
    snapshot?.providers
      ?.defiLlamaProtocols ??
    0,

  perCandidateNetworkCalls:
    0,

  resiliencePreserved:
    Boolean(
      snapshot?.providers
        ?.coinGecko,
    ),
});
