/**
 * ============================================================
 * AEMA CRYPTO — DEX SCREENER PROVIDER
 * ============================================================
 *
 * DEX pair lookup and enrichment provider.
 *
 * NOTE:
 * DEX Screener is an aggregator, not an execution venue.
 */

const BASE =
  "https://api.dexscreener.com";

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function normalizeSymbol(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

function normalizeAddress(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

async function fetchJson(
  url,
  {
    timeoutMs = 12000,
  } = {},
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            accept:
              "application/json",

            "User-Agent":
              "AEMA-Research/1.0",
          },

          signal:
            controller.signal,
        },
      );

    if (
      !response.ok
    ) {
      const body =
        await response
          .text()
          .catch(
            () => "",
          );

      throw new Error(
        `DEXSCREENER_HTTP_${response.status}:${body.slice(0, 200)}`,
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchDexPairs(
  query,
  options = {},
) {
  if (
    !String(
      query ??
      "",
    ).trim()
  ) {
    return [];
  }

  const result =
    await fetchJson(
      `${BASE}/latest/dex/search?q=${encodeURIComponent(
        query,
      )}`,
      options,
    );

  return Array.isArray(
    result?.pairs,
  )
    ? result.pairs
    : [];
}

export async function getDexTokenPairs(
  {
    chainId,
    tokenAddress,
  } = {},
  options = {},
) {
  if (
    !chainId ||
    !tokenAddress
  ) {
    return [];
  }

  const result =
    await fetchJson(
      `${BASE}/token-pairs/v1/${encodeURIComponent(
        chainId,
      )}/${encodeURIComponent(
        tokenAddress,
      )}`,
      options,
    );

  return Array.isArray(
    result,
  )
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

    network:
      pair?.chainId ??
      null,

    pairAddress:
      pair?.pairAddress ??
      null,

    poolAddress:
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

    reserveUsd:
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
        pair
          ?.pairCreatedAt,
      ),

    poolCreatedAt:
      pair?.pairCreatedAt
        ? new Date(
            Number(
              pair.pairCreatedAt,
            ),
          ).toISOString()
        : null,

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