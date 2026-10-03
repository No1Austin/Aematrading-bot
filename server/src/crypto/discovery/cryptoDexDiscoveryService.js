/**
 * ============================================================
 * AEMA CRYPTO — DEX DISCOVERY SERVICE
 * ============================================================
 *
 * PROVIDER ORDER
 * --------------
 * 1. CoinMarketCap public DEX discovery
 * 2. GeckoTerminal fallback
 *
 * DEX Screener remains available for token/pair enrichment.
 *
 * RESEARCH ONLY.
 * No execution authority.
 */

import {
  getLatestDexPairsAcrossNetworks,
} from "../data/providers/coinMarketCapDexProvider.js";

import {
  getNewPoolsAcrossNetworks,
} from "../data/providers/geckoTerminalProvider.js";


function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}


function inferSymbolFromPoolName(name) {
  const first = String(name ?? "")
    .split("/")
    ?.[0]
    ?.trim();

  return String(first ?? "")
    .toUpperCase();
}


function normalizeNetworkForCmc(network) {
  const key = String(
    network ?? "",
  ).toLowerCase();

  const aliases = {
    eth: "ethereum",
    ethereum: "ethereum",

    bsc: "bnb",
    bnb: "bnb",

    solana: "solana",
    base: "base",
    arbitrum: "arbitrum",
  };

  return aliases[key] ?? key;
}


function normalizeNetworkForGecko(network) {
  const key = String(
    network ?? "",
  ).toLowerCase();

  const aliases = {
    ethereum: "eth",
    eth: "eth",

    bnb: "bsc",
    bsc: "bsc",

    solana: "solana",
    base: "base",
    arbitrum: "arbitrum",
  };

  return aliases[key] ?? key;
}


function poolToAsset(pool) {
  const symbol =
    pool?.baseSymbol ||
    inferSymbolFromPoolName(
      pool?.name,
    );

  const network =
    pool?.network ??
    pool?.chainId ??
    null;

  const poolAddress =
    pool?.poolAddress ??
    pool?.pairAddress ??
    pool?.poolId ??
    null;

  const liquidityUsd =
    numberOrNull(
      pool?.liquidityUsd ??
      pool?.reserveUsd,
    );

  const volume24hUsd =
    numberOrNull(
      pool?.volume24hUsd,
    );

  return {
    assetId:
      pool?.baseAddress
        ? `${network}:${pool.baseAddress}`
        : poolAddress,

    contractAddress:
      pool?.baseAddress ??
      null,

    network,

    symbol:
      symbol ||
      "UNKNOWN",

    name:
      pool?.baseName ??
      symbol ??
      pool?.name ??
      "Emerging token",

    priceUsd:
      numberOrNull(
        pool?.priceUsd,
      ),

    marketCapUsd:
      numberOrNull(
        pool?.marketCapUsd,
      ),

    fdvUsd:
      numberOrNull(
        pool?.fdvUsd,
      ),

    volume24hUsd,

    volume6hUsd:
      numberOrNull(
        pool?.volume6hUsd,
      ),

    volume1hUsd:
      numberOrNull(
        pool?.volume1hUsd,
      ),

    change1hPercent:
      numberOrNull(
        pool?.change1hPercent,
      ),

    change6hPercent:
      numberOrNull(
        pool?.change6hPercent,
      ),

    change24hPercent:
      numberOrNull(
        pool?.change24hPercent,
      ),

    pairCreatedAt:
      pool?.pairCreatedAt ??
      (
        pool?.poolCreatedAt
          ? Date.parse(
              pool.poolCreatedAt,
            )
          : null
      ),

    tradable: true,

    source:
      pool?.source ??
      "DEX_DISCOVERY",

    venues: {
      venueCount: 1,

      cexCount: 0,

      dexCount: 1,

      exchanges: [
        pool?.exchange,
      ].filter(Boolean),

      primaryVenue:
        pool?.exchange ??
        null,

      cex: [],

      dex: [
        {
          source:
            pool?.source ??
            null,

          exchange:
            pool?.exchange ??
            null,

          venueType:
            "DEX",

          chainId:
            network,

          pairAddress:
            poolAddress,

          baseAddress:
            pool?.baseAddress ??
            null,

          quoteAddress:
            pool?.quoteAddress ??
            null,

          liquidityUsd,

          volume24hUsd,

          volume6hUsd:
            numberOrNull(
              pool?.volume6hUsd,
            ),

          volume1hUsd:
            numberOrNull(
              pool?.volume1hUsd,
            ),

          buys24h:
            numberOrNull(
              pool?.buys24h,
            ),

          sells24h:
            numberOrNull(
              pool?.sells24h,
            ),

          transactions24h:
            numberOrNull(
              pool?.transactions24h,
            ),

          pairCreatedAt:
            pool?.poolCreatedAt ??
            pool?.pairCreatedAt ??
            null,
        },
      ],

      dexLiquidityUsd:
        numberOrZero(
          liquidityUsd,
        ),

      dexVolume24hUsd:
        numberOrZero(
          volume24hUsd,
        ),
    },

    discoveredAt:
      new Date().toISOString(),

    researchOnly: true,

    executionAuthority: false,

    liveExecution: false,
  };
}


function filterPools(
  pools,
  {
    minimumLiquidityUsd,
    minimumVolume24hUsd,
  },
) {
  return (
    Array.isArray(pools)
      ? pools
      : []
  )
    .filter(
      pool =>
        numberOrZero(
          pool?.liquidityUsd ??
          pool?.reserveUsd,
        ) >= minimumLiquidityUsd ||

        numberOrZero(
          pool?.volume24hUsd,
        ) >= minimumVolume24hUsd,
    )
    .map(poolToAsset);
}


/**
 * Discover DEX assets.
 *
 * CoinMarketCap is attempted first.
 * GeckoTerminal is used only when the primary provider
 * cannot produce usable assets.
 */
export async function discoverDexAssets({
  networks = [
    "solana",
    "base",
    "eth",
    "bsc",
    "arbitrum",
  ],

  pagesPerNetwork = 1,

  minimumLiquidityUsd = 10_000,

  minimumVolume24hUsd = 10_000,
} = {}) {
  const errors = [];

  /*
   * ==========================================================
   * PRIMARY — COINMARKETCAP DEX
   * ==========================================================
   */

  try {
    const cmcNetworks =
      networks.map(
        normalizeNetworkForCmc,
      );

    const discovery =
      await getLatestDexPairsAcrossNetworks({
        networks:
          cmcNetworks,

        limitPerNetwork:
          100,
      });

    for (
      const item
      of discovery?.errors ?? []
    ) {
      errors.push({
        provider:
          "COINMARKETCAP_DEX",

        ...item,
      });
    }

    const pools =
      Array.isArray(
        discovery?.pools,
      )
        ? discovery.pools
        : [];

    const assets =
      filterPools(
        pools,
        {
          minimumLiquidityUsd,
          minimumVolume24hUsd,
        },
      );

    if (assets.length > 0) {
      console.log(
        `[DEX_DISCOVERY] provider=COINMARKETCAP_DEX pools=${pools.length} assets=${assets.length}`,
      );

      return {
        approved: true,

        provider:
          "COINMARKETCAP_DEX",

        assets,

        poolCount:
          pools.length,

        errors,

        researchOnly: true,

        executionAuthority: false,

        liveExecution: false,
      };
    }
  } catch (error) {
    errors.push({
      provider:
        "COINMARKETCAP_DEX",

      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }


  /*
   * ==========================================================
   * FALLBACK — GECKOTERMINAL
   * ==========================================================
   */

  try {
    const geckoNetworks =
      networks.map(
        normalizeNetworkForGecko,
      );

    const discovery =
      await getNewPoolsAcrossNetworks({
        networks:
          geckoNetworks,

        pagesPerNetwork,
      });

    for (
      const item
      of discovery?.errors ?? []
    ) {
      errors.push({
        provider:
          "GECKOTERMINAL",

        ...item,
      });
    }

    const pools =
      Array.isArray(
        discovery?.pools,
      )
        ? discovery.pools
        : [];

    const assets =
      filterPools(
        pools,
        {
          minimumLiquidityUsd,
          minimumVolume24hUsd,
        },
      );

    if (assets.length > 0) {
      console.log(
        `[DEX_DISCOVERY] provider=GECKOTERMINAL pools=${pools.length} assets=${assets.length}`,
      );

      return {
        approved: true,

        provider:
          "GECKOTERMINAL",

        assets,

        poolCount:
          pools.length,

        errors,

        researchOnly: true,

        executionAuthority: false,

        liveExecution: false,
      };
    }
  } catch (error) {
    errors.push({
      provider:
        "GECKOTERMINAL",

      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }


  return {
    approved: false,

    provider: null,

    assets: [],

    poolCount: 0,

    errors,

    researchOnly: true,

    executionAuthority: false,

    liveExecution: false,
  };
}


export default discoverDexAssets;