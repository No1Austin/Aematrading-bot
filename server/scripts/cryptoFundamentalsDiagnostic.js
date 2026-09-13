import runCryptoDiscoveryCycle from
  "../src/crypto/scanner/cryptoDiscoveryCycle.js";

import getCryptoFundamentalEvidence from
  "../src/crypto/data/providers/cryptoFundamentalProvider.js";

import runCryptoProtocolFundamentalEngine from
  "../src/crypto/analysis/cryptoProtocolFundamentalEngine.js";

function line(title) {
  console.log(
    "\n" +
      "=".repeat(64),
  );

  console.log(title);

  console.log(
    "=".repeat(64) +
      "\n",
  );
}

async function main() {
  line(
    "AEMA CRYPTO FUNDAMENTALS DIAGNOSTIC",
  );

  const discovery =
    await runCryptoDiscoveryCycle({
      refreshUniverse:
        true,

      includeDexDiscovery:
        true,
    });

  if (
    discovery?.approved !==
    true
  ) {
    throw new Error(
      `Discovery failed: ${(
        discovery?.errors ??
        []
      ).join(", ")}`,
    );
  }

  const candidates =
    (
      discovery
        ?.selectedCandidates ??
      []
    )
      .filter(
        candidate =>
          candidate
            ?.candidateType ===
          "CEX",
      )
      .slice(
        0,
        20,
      );

  const rows = [];

  for (
    const candidate
    of candidates
  ) {
    const evidence =
      await getCryptoFundamentalEvidence(
        candidate,
      );

    const engine =
      await runCryptoProtocolFundamentalEngine(
        candidate,
      );

    rows.push({
      symbol:
        candidate.symbol,

      assetId:
        candidate.assetId,

      coinGecko:
        evidence
          ?.providers
          ?.coinGecko
          ?.status ??
        "—",

      defiLlama:
        evidence
          ?.providers
          ?.defiLlama
          ?.status ??
        "—",

      fundamentalStatus:
        engine?.status,

      fundamentalScore:
        engine?.score ??
        "N/A",

      tvl:
        evidence
          ?.evidence
          ?.defiLlama
          ?.tvlUsd ??
        "—",

      commits4w:
        evidence
          ?.evidence
          ?.coinGecko
          ?.developer
          ?.commitCount4Weeks ??
        "—",

      categories:
        (
          evidence
            ?.evidence
            ?.coinGecko
            ?.categories ??
          []
        )
          .slice(
            0,
            2,
          )
          .join(" | "),
    });
  }

  console.table(rows);

  line(
    "SUMMARY",
  );

  console.log({
    checked:
      rows.length,

    fundamentalsComplete:
      rows.filter(
        row =>
          row
            .fundamentalStatus ===
          "COMPLETE",
      ).length,

    fundamentalsMissing:
      rows.filter(
        row =>
          row
            .fundamentalStatus !==
          "COMPLETE",
      ).length,
  });
}

main().catch(
  error => {
    console.error(
      "\nFUNDAMENTALS DIAGNOSTIC FAILED\n",
      error,
    );

    process.exitCode =
      1;
  },
);
