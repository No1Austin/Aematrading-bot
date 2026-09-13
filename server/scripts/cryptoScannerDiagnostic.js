import {
  runCryptoDiscoveryCycle,
} from "../src/crypto/scanner/cryptoDiscoveryCycle.js";

function divider(title) {
  console.log(
    "\n============================================================",
  );
  console.log(title);
  console.log(
    "============================================================\n",
  );
}

const result =
  await runCryptoDiscoveryCycle({
    refreshUniverse: true,
    maximumUniverseAssets: 750,
    includeDexDiscovery: true,
  });

divider(
  "AEMA CRYPTO DISCOVERY DIAGNOSTIC",
);

console.dir(
  {
    approved:
      result.approved,
    status:
      result.status,
    universe:
      result?.universe?.assetCount ??
      0,
    providers:
      result?.universe?.providers ??
      {},
    universeComposition:
      result?.universe?.composition ??
      {},
    measured:
      result?.measurements?.built ??
      0,
    dexMeasured:
      result?.measurements?.dexMeasured ??
      0,
    enriched:
      result?.measurements?.enriched ??
      0,
    scanned:
      result?.scanner?.scanned ??
      0,
    researchable:
      result?.scanner?.researchable ??
      0,
    highInterest:
      result?.scanner?.qualified ??
      0,
    selected:
      result?.scanner?.selected ??
      0,
    emergingSelected:
      result?.scanner?.emergingSelected ??
      0,
    warnings:
      result?.warnings ?? [],
    errors:
      result?.errors ?? [],
  },
  {
    depth: null,
  },
);

divider(
  "TOP CRYPTO RESEARCH CANDIDATES",
);

console.table(
  (
    result?.selectedCandidates ??
    []
  ).map(
    (candidate, index) => ({
      rank: index + 1,
      symbol:
        candidate.symbol,
      name:
        candidate.name,
      score:
        candidate.scannerScore,
      direction:
        candidate.preferredDirection,
      edge:
        candidate.directionEdge,
      venues:
        candidate?.venues?.venueCount ??
        0,
      cex:
        candidate?.venues?.cexCount ??
        0,
      dex:
        candidate?.venues?.dexCount ??
        0,
      primaryVenue:
        candidate?.venues?.primaryVenue ??
        "—",
      volumeQuality:
        candidate?.intelligence
          ?.volumeQuality?.score ??
        "—",
      liquidity:
        candidate?.intelligence
          ?.liquidity?.score ??
        "—",
      venueScore:
        candidate?.intelligence
          ?.venueIntelligence?.score ??
        "—",
      emerging:
        candidate?.intelligence
          ?.emergingProject?.score ??
        "—",
      integrity:
        candidate?.intelligence
          ?.projectIntegrity?.score ??
        "—",
      classification:
        candidate?.intelligence
          ?.emergingProject
          ?.classification ??
        "—",
    }),
  ),
);

divider(
  "DEX / EMERGING PROJECTS IN TOP 20",
);

console.table(
  (
    result?.selectedCandidates ??
    []
  )
    .filter(
      candidate =>
        (
          candidate?.venues?.dexCount ??
          0
        ) > 0,
    )
    .map(
      (candidate, index) => ({
        row: index + 1,
        symbol:
          candidate.symbol,
        network:
          candidate?.measurements?.network ??
          "—",
        scannerScore:
          candidate.scannerScore,
        dex:
          candidate?.venues?.dexCount ??
          0,
        primaryVenue:
          candidate?.venues?.primaryVenue ??
          "—",
        volume24h:
          candidate?.measurements
            ?.volume24hUsd ??
          0,
        liquidity:
          candidate?.measurements
            ?.liquidityUsd ??
          0,
        emergingScore:
          candidate?.intelligence
            ?.emergingProject?.score ??
          "—",
        integrity:
          candidate?.intelligence
            ?.projectIntegrity?.score ??
          "—",
        classification:
          candidate?.intelligence
            ?.emergingProject
            ?.classification ??
          "—",
      }),
    ),
);

divider(
  "DIAGNOSTIC COMPLETE",
);
