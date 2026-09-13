/**
 * ============================================================
 * UNIFIED CRYPTO FUNDAMENTAL PROVIDER
 * ============================================================
 */

import getCoinGeckoFundamentals from
  "./coinGeckoFundamentalProvider.js";

import getDefiLlamaFundamentals from
  "./defiLlamaFundamentalProvider.js";

export async function getCryptoFundamentalEvidence(
  candidate,
) {
  const [
    coinGecko,
    defiLlama,
  ] =
    await Promise.all([
      getCoinGeckoFundamentals(
        candidate,
      ),

      getDefiLlamaFundamentals(
        candidate,
      ),
    ]);

  const usable =
    [
      coinGecko,
      defiLlama,
    ].filter(
      result =>
        result?.approved ===
        true,
    );

  return {
    approved:
      usable.length >
      0,

    status:
      usable.length >
        0
        ? "COMPLETE"
        : (
            [
              coinGecko,
              defiLlama,
            ].some(
              result =>
                result?.status ===
                "ERROR",
            )
              ? "PARTIAL"
              : "INSUFFICIENT_DATA"
          ),

    providers: {
      coinGecko,
      defiLlama,
    },

    evidence: {
      coinGecko:
        coinGecko
          ?.evidence ??
        null,

      defiLlama:
        defiLlama
          ?.evidence ??
        null,
    },

    warnings:
      [
        coinGecko,
        defiLlama,
      ]
        .filter(
          result =>
            result?.approved !==
            true,
        )
        .map(
          result =>
            result?.reason,
        )
        .filter(Boolean),
  };
}

export default
  getCryptoFundamentalEvidence;
