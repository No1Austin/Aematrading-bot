import {
  getCoinGeckoMarkets,
  normalizeCoinGeckoMarket,
} from "../data/providers/coinGeckoProvider.js";

import {
  listCoinbaseProducts,
  normalizeCoinbaseProduct,
} from "../data/providers/coinbaseProvider.js";

import {
  getKrakenAssetPairs,
  normalizeKrakenPair,
} from "../data/providers/krakenProvider.js";

import {
  buildVenueIndex,
  summarizeVenues,
} from "./cryptoVenueResolver.js";

import {
  discoverDexAssets,
} from "./cryptoDexDiscoveryService.js";

import {
  CRYPTO_SCANNER_CONFIG,
} from "../scanner/cryptoScannerConfig.js";

export const CRYPTO_UNIVERSE_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    PARTIAL: "PARTIAL",
    EMPTY: "EMPTY",
    ERROR: "ERROR",
  });

let cache = null;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function symbolKey(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function assetKey(asset) {
  if (
    asset?.network &&
    asset?.contractAddress
  ) {
    return `contract:${String(
      asset.network,
    ).toLowerCase()}:${String(
      asset.contractAddress,
    ).toLowerCase()}`;
  }

  if (asset?.assetId) {
    return `id:${String(
      asset.assetId,
    ).toLowerCase()}`;
  }

  return `symbol:${symbolKey(
    asset?.symbol,
  )}`;
}

function dexRank(asset) {
  const volume =
    finite(asset?.volume24hUsd);

  const liquidity =
    finite(
      asset?.venues?.dexLiquidityUsd,
    );

  const momentum =
    Math.abs(
      finite(asset?.change24hPercent),
    );

  return (
    Math.log10(1 + volume) * 10 +
    Math.log10(1 + liquidity) * 8 +
    Math.min(momentum, 30)
  );
}

function dedupe(rows) {
  const map = new Map();

  for (const row of rows) {
    const key = assetKey(row);

    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return [...map.values()];
}

export function clearCryptoUniverseCache() {
  cache = null;
}

export function getCryptoUniverseCacheStatus() {
  return {
    cached: Boolean(cache),
    generatedAt:
      cache?.generatedAt ?? null,
    assetCount:
      cache?.assets?.length ?? 0,
  };
}

export async function getCryptoUniverse({
  refresh = false,
  maximumAssets = 1000,
  coinGeckoPages = 3,
  includeDexDiscovery = true,
  dexNetworks = [
    "solana",
    "base",
    "eth",
    "bsc",
    "arbitrum",
  ],
  dexPagesPerNetwork = 1,
  minimumDexReservedAssets =
    CRYPTO_SCANNER_CONFIG
      .universe
      .minimumDexReservedAssets,
  maximumDexReservedAssets =
    CRYPTO_SCANNER_CONFIG
      .universe
      .maximumDexReservedAssets,
} = {}) {
  if (cache && refresh !== true) {
    return cache;
  }

  const startedAt =
    new Date().toISOString();

  const errors = [];
  const warnings = [];

  let marketRows = [];
  let coinbaseProducts = [];
  let krakenPairs = [];
  let dexAssets = [];

  try {
    marketRows = (
      await getCoinGeckoMarkets({
        pages: coinGeckoPages,
        perPage: 250,
        order: "volume_desc",
      })
    ).map(
      normalizeCoinGeckoMarket,
    );
  } catch (error) {
    errors.push(
      `CoinGecko: ${error.message}`,
    );
  }

  try {
    coinbaseProducts = (
      await listCoinbaseProducts()
    ).map(
      normalizeCoinbaseProduct,
    );
  } catch (error) {
    warnings.push(
      `Coinbase venue discovery unavailable: ${error.message}`,
    );
  }

  try {
    const raw =
      await getKrakenAssetPairs();

    krakenPairs =
      Array.isArray(raw)
        ? raw
        : Object.entries(raw).map(
            ([id, pair]) =>
              normalizeKrakenPair(
                id,
                pair,
              ),
          );
  } catch (error) {
    warnings.push(
      `Kraken venue discovery unavailable: ${error.message}`,
    );
  }

  if (includeDexDiscovery) {
    try {
      const discovery =
        await discoverDexAssets({
          networks: dexNetworks,
          pagesPerNetwork:
            dexPagesPerNetwork,
        });

      dexAssets =
        discovery.assets;

      for (const item of discovery.errors) {
        warnings.push(
          `DEX discovery ${item.network}: ${item.error}`,
        );
      }
    } catch (error) {
      warnings.push(
        `DEX discovery unavailable: ${error.message}`,
      );
    }
  }

  const venueIndex =
    buildVenueIndex({
      coinbaseProducts,
      krakenPairs,
    });

  const broadAssets =
    marketRows.map(market => {
      const symbol =
        symbolKey(market.symbol);

      const venues =
        venueIndex.get(symbol) ??
        [];

      return {
        ...market,
        symbol,
        tradable:
          venues.length > 0,
        venues:
          summarizeVenues(venues),
        discoveredAt:
          startedAt,
      };
    });

  /*
   * Reserve capacity for DEX discovery BEFORE the final
   * universe is truncated.
   */
  const rankedDex =
    dedupe(dexAssets)
      .sort(
        (a, b) =>
          dexRank(b) -
          dexRank(a),
      );

  const dexSlots =
    Math.min(
      maximumAssets,
      maximumDexReservedAssets,
      rankedDex.length,
      Math.max(
        Math.min(
          minimumDexReservedAssets,
          maximumAssets,
        ),
        Math.min(
          rankedDex.length,
          maximumDexReservedAssets,
        ),
      ),
    );

  const selectedDex =
    rankedDex.slice(
      0,
      dexSlots,
    );

  const broadSlots =
    Math.max(
      0,
      maximumAssets -
        selectedDex.length,
    );

  const selectedBroad =
    broadAssets
      .sort(
        (a, b) =>
          finite(
            b?.volume24hUsd,
          ) -
          finite(
            a?.volume24hUsd,
          ),
      )
      .slice(
        0,
        broadSlots,
      );

  const assets =
    dedupe([
      ...selectedBroad,
      ...selectedDex,
    ]).slice(
      0,
      maximumAssets,
    );

  const status =
    assets.length === 0
      ? errors.length > 0
        ? CRYPTO_UNIVERSE_STATUS.ERROR
        : CRYPTO_UNIVERSE_STATUS.EMPTY
      : errors.length > 0 ||
          warnings.length > 0
        ? CRYPTO_UNIVERSE_STATUS.PARTIAL
        : CRYPTO_UNIVERSE_STATUS.COMPLETE;

  cache = {
    approved: assets.length > 0,
    status,
    assetCount: assets.length,
    assets,

    composition: {
      broadAssets:
        selectedBroad.length,

      reservedDexAssets:
        selectedDex.length,

      dexAssetsDiscovered:
        dexAssets.length,

      dexAssetsMeasured:
        assets.filter(
          asset =>
            (
              asset?.venues?.dexCount ??
              0
            ) > 0,
        ).length,
    },

    providers: {
      coinGecko:
        marketRows.length,
      coinbase:
        coinbaseProducts.length,
      kraken:
        krakenPairs.length,
      dexNewPools:
        dexAssets.length,
    },

    errors,
    warnings,

    startedAt,
    generatedAt:
      new Date().toISOString(),
  };

  return cache;
}

export default getCryptoUniverse;
