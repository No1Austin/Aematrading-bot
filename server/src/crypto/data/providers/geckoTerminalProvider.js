/**
 * ============================================================
 * AEMA CRYPTO — GECKOTERMINAL PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 * Discover new DEX pools and emerging token markets.
 *
 * Public API base:
 *   https://api.geckoterminal.com/api/v2
 *
 * This provider is deliberately isolated so another DEX source
 * can replace or supplement it without changing scanner logic.
 */

const BASE =
  "https://api.geckoterminal.com/api/v2";

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
      `GeckoTerminal ${response.status}: ${await response.text()}`,
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

function normalizeAddress(
  value,
) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

export function normalizeGeckoTerminalPool(
  item,
) {
  const attributes =
    item?.attributes ?? {};

  const relationships =
    item?.relationships ?? {};

  const baseTokenId =
    relationships
      ?.base_token
      ?.data
      ?.id ??
    null;

  const quoteTokenId =
    relationships
      ?.quote_token
      ?.data
      ?.id ??
    null;

  const dexId =
    relationships
      ?.dex
      ?.data
      ?.id ??
    null;

  return {
    source:
      "GECKOTERMINAL",

    venueType:
      "DEX",

    exchange:
      String(
        dexId ??
        "DEX",
      )
        .trim()
        .toUpperCase(),

    network:
      item
        ?.relationships
        ?.network
        ?.data
        ?.id ??
      null,

    poolId:
      item?.id ??
      null,

    poolAddress:
      attributes
        ?.address ??
      null,

    name:
      attributes
        ?.name ??
      null,

    baseTokenId,
    quoteTokenId,

    baseAddress:
      normalizeAddress(
        String(
          baseTokenId ??
          "",
        )
          .split("_")
          .pop(),
      ),

    quoteAddress:
      normalizeAddress(
        String(
          quoteTokenId ??
          "",
        )
          .split("_")
          .pop(),
      ),

    priceUsd:
      numberOrNull(
        attributes
          ?.base_token_price_usd,
      ),

    quotePriceUsd:
      numberOrNull(
        attributes
          ?.quote_token_price_usd,
      ),

    reserveUsd:
      numberOrNull(
        attributes
          ?.reserve_in_usd,
      ),

    volume24hUsd:
      numberOrNull(
        attributes
          ?.volume_usd
          ?.h24,
      ),

    volume6hUsd:
      numberOrNull(
        attributes
          ?.volume_usd
          ?.h6,
      ),

    volume1hUsd:
      numberOrNull(
        attributes
          ?.volume_usd
          ?.h1,
      ),

    change24hPercent:
      numberOrNull(
        attributes
          ?.price_change_percentage
          ?.h24,
      ),

    change6hPercent:
      numberOrNull(
        attributes
          ?.price_change_percentage
          ?.h6,
      ),

    change1hPercent:
      numberOrNull(
        attributes
          ?.price_change_percentage
          ?.h1,
      ),

    transactions24h:
      numberOrNull(
        attributes
          ?.transactions
          ?.h24
          ?.buys,
      ) !== null &&
      numberOrNull(
        attributes
          ?.transactions
          ?.h24
          ?.sells,
      ) !== null
        ? (
            Number(
              attributes
                ?.transactions
                ?.h24
                ?.buys,
            ) +
            Number(
              attributes
                ?.transactions
                ?.h24
                ?.sells,
            )
          )
        : null,

    buys24h:
      numberOrNull(
        attributes
          ?.transactions
          ?.h24
          ?.buys,
      ),

    sells24h:
      numberOrNull(
        attributes
          ?.transactions
          ?.h24
          ?.sells,
      ),

    poolCreatedAt:
      attributes
        ?.pool_created_at ??
      null,

    fdvUsd:
      numberOrNull(
        attributes
          ?.fdv_usd,
      ),

    marketCapUsd:
      numberOrNull(
        attributes
          ?.market_cap_usd,
      ),

    raw:
      item,
  };
}

export async function getNewPools({
  network = null,
  page = 1,
} = {}) {
  const path =
    network
      ? `/networks/${encodeURIComponent(
          network,
        )}/new_pools`
      : "/networks/new_pools";

  const params =
    new URLSearchParams({
      page:
        String(
          Math.max(
            1,
            Number(page) || 1,
          ),
        ),
    });

  const payload =
    await fetchJson(
      `${BASE}${path}?${params}`,
    );

  return Array.isArray(
    payload?.data,
  )
    ? payload.data.map(
        normalizeGeckoTerminalPool,
      )
    : [];
}

export async function getNewPoolsAcrossNetworks({
  networks = [
    "solana",
    "base",
    "eth",
    "bsc",
    "arbitrum",
  ],
  pagesPerNetwork = 1,
} = {}) {
  const pools = [];
  const errors = [];

  for (
    const network
    of networks
  ) {
    for (
      let page = 1;
      page <= pagesPerNetwork;
      page += 1
    ) {
      try {
        const rows =
          await getNewPools({
            network,
            page,
          });

        pools.push(
          ...rows,
        );
      } catch (error) {
        errors.push({
          network,
          page,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
  }

  return {
    pools,
    errors,
  };
}

export default {
  getNewPools,
  getNewPoolsAcrossNetworks,
  normalizeGeckoTerminalPool,
};
