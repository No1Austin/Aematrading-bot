/**
 * ============================================================
 * AEMA CRYPTO — DEX SCREENER PROVIDER
 * ============================================================
 */

const BASE =
  "https://api.dexscreener.com";

async function fetchJson(
  url,
) {
  const response =
    await fetch(
      url,
      {
        headers: {
          accept:
            "application/json",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `DEX Screener ${response.status}: ${await response.text()}`,
    );
  }

  return response.json();
}

function numberOrNull(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function normalizeSymbol(
  value,
) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeAddress(
  value,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export async function searchDexPairs(
  query,
) {
  const result =
    await fetchJson(
      `${BASE}/latest/dex/search?q=${encodeURIComponent(
        query,
      )}`,
    );

  return Array.isArray(
    result?.pairs,
  )
    ? result.pairs
    : [];
}

export async function getDexTokenPairs({
  chainId,
  tokenAddress,
} = {}) {
  const result =
    await fetchJson(
      `${BASE}/token-pairs/v1/${encodeURIComponent(
        chainId,
      )}/${encodeURIComponent(
        tokenAddress,
      )}`,
    );

  return Array.isArray(result)
    ? result
    : [];
}

export function normalizeDexPair(
  pair,
) {
  const buys24h =
    numberOrNull(
      pair
        ?.txns
        ?.h24
        ?.buys,
    );

  const sells24h =
    numberOrNull(
      pair
        ?.txns
        ?.h24
        ?.sells,
    );

  return {
    source:
      "DEXSCREENER",

    exchange:
      String(
        pair?.dexId ??
        "DEX",
      )
        .trim()
        .toUpperCase(),

    venueType:
      "DEX",

    chainId:
      pair?.chainId ??
      null,

    pairAddress:
      pair?.pairAddress ??
      null,

    baseAddress:
      normalizeAddress(
        pair
          ?.baseToken
          ?.address,
      ),

    baseSymbol:
      normalizeSymbol(
        pair
          ?.baseToken
          ?.symbol,
      ),

    baseName:
      pair
        ?.baseToken
        ?.name ??
      null,

    quoteAddress:
      normalizeAddress(
        pair
          ?.quoteToken
          ?.address,
      ),

    quoteSymbol:
      normalizeSymbol(
        pair
          ?.quoteToken
          ?.symbol,
      ),

    priceUsd:
      numberOrNull(
        pair?.priceUsd,
      ),

    liquidityUsd:
      numberOrNull(
        pair
          ?.liquidity
          ?.usd,
      ),

    volume24hUsd:
      numberOrNull(
        pair
          ?.volume
          ?.h24,
      ),

    volume6hUsd:
      numberOrNull(
        pair
          ?.volume
          ?.h6,
      ),

    volume1hUsd:
      numberOrNull(
        pair
          ?.volume
          ?.h1,
      ),

    buys24h,
    sells24h,

    transactions24h:
      buys24h !== null &&
      sells24h !== null
        ? buys24h +
          sells24h
        : null,

    change1hPercent:
      numberOrNull(
        pair
          ?.priceChange
          ?.h1,
      ),

    change6hPercent:
      numberOrNull(
        pair
          ?.priceChange
          ?.h6,
      ),

    change24hPercent:
      numberOrNull(
        pair
          ?.priceChange
          ?.h24,
      ),

    marketCapUsd:
      numberOrNull(
        pair?.marketCap,
      ),

    fdvUsd:
      numberOrNull(
        pair?.fdv,
      ),

    pairCreatedAt:
      numberOrNull(
        pair?.pairCreatedAt,
      ),

    url:
      pair?.url ??
      null,

    labels:
      Array.isArray(
        pair?.labels,
      )
        ? pair.labels
        : [],

    raw:
      pair,
  };
}

export default {
  searchDexPairs,
  getDexTokenPairs,
  normalizeDexPair,
};
