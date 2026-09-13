/**
 * ============================================================
 * CRYPTO DEX DISCOVERY SERVICE
 * ============================================================
 *
 * Discovers newly-created pools from configured chains and
 * converts them into scanner-compatible emerging assets.
 */

import {
  getNewPoolsAcrossNetworks,
} from "../data/providers/geckoTerminalProvider.js";

function numberOrZero(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function inferSymbolFromPoolName(
  name,
) {
  const first =
    String(
      name ??
      "",
    )
      .split("/")
      ?.[0]
      ?.trim();

  return String(
    first ??
    "",
  )
    .toUpperCase();
}

export async function discoverDexAssets({
  networks,
  pagesPerNetwork = 1,
  minimumLiquidityUsd = 10_000,
  minimumVolume24hUsd = 10_000,
} = {}) {
  const discovery =
    await getNewPoolsAcrossNetworks({
      networks,
      pagesPerNetwork,
    });

  const assets =
    discovery.pools
      .filter(
        pool =>
          numberOrZero(
            pool?.reserveUsd,
          ) >=
            minimumLiquidityUsd ||
          numberOrZero(
            pool?.volume24hUsd,
          ) >=
            minimumVolume24hUsd,
      )
      .map(
        pool => {
          const symbol =
            inferSymbolFromPoolName(
              pool?.name,
            );

          return {
            assetId:
              pool?.baseAddress
                ? `${pool.network}:${pool.baseAddress}`
                : pool?.poolId,

            contractAddress:
              pool?.baseAddress ??
              null,

            network:
              pool?.network ??
              null,

            symbol:
              symbol ||
              "UNKNOWN",

            name:
              symbol ||
              pool?.name ||
              "Emerging token",

            priceUsd:
              pool?.priceUsd,

            marketCapUsd:
              pool?.marketCapUsd,

            fdvUsd:
              pool?.fdvUsd,

            volume24hUsd:
              pool?.volume24hUsd,

            volume6hUsd:
              pool?.volume6hUsd,

            volume1hUsd:
              pool?.volume1hUsd,

            change1hPercent:
              pool?.change1hPercent,

            change6hPercent:
              pool?.change6hPercent,

            change24hPercent:
              pool?.change24hPercent,

            pairCreatedAt:
              pool?.poolCreatedAt
                ? Date.parse(
                    pool.poolCreatedAt,
                  )
                : null,

            tradable:
              true,

            source:
              "DEX_NEW_POOL",

            venues: {
              venueCount:
                1,

              cexCount:
                0,

              dexCount:
                1,

              exchanges: [
                pool?.exchange,
              ].filter(Boolean),

              primaryVenue:
                pool?.exchange ??
                null,

              cex: [],

              dex: [
                {
                  exchange:
                    pool?.exchange,

                  venueType:
                    "DEX",

                  chainId:
                    pool?.network,

                  pairAddress:
                    pool?.poolAddress,

                  baseAddress:
                    pool?.baseAddress,

                  quoteAddress:
                    pool?.quoteAddress,

                  liquidityUsd:
                    pool?.reserveUsd,

                  volume24hUsd:
                    pool?.volume24hUsd,

                  volume6hUsd:
                    pool?.volume6hUsd,

                  volume1hUsd:
                    pool?.volume1hUsd,

                  buys24h:
                    pool?.buys24h,

                  sells24h:
                    pool?.sells24h,

                  transactions24h:
                    pool?.transactions24h,

                  pairCreatedAt:
                    pool?.poolCreatedAt,
                },
              ],

              dexLiquidityUsd:
                numberOrZero(
                  pool?.reserveUsd,
                ),

              dexVolume24hUsd:
                numberOrZero(
                  pool?.volume24hUsd,
                ),
            },

            discoveredAt:
              new Date()
                .toISOString(),
          };
        },
      );

  return {
    approved:
      assets.length >
      0,

    assets,

    poolCount:
      discovery.pools.length,

    errors:
      discovery.errors,
  };
}

export default
  discoverDexAssets;
