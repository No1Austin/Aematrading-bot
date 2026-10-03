import {
  getCoinGeckoMarkets,
  normalizeCoinGeckoMarket,
} from "../data/providers/coinGeckoProvider.js";

import {
  listCoinbaseProducts,
  normalizeCoinbaseProduct,
} from "../data/providers/coinbaseProvider.js";

import {
  listKrakenMarkets,
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


/**
 * ============================================================
 * NUMBER HELPERS
 * ============================================================
 */

function finite(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
}


function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}


/**
 * ============================================================
 * SYMBOL / ASSET HELPERS
 * ============================================================
 */

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
    finite(
      asset?.volume24hUsd,
    );

  const liquidity =
    finite(
      asset?.venues
        ?.dexLiquidityUsd,
    );

  const momentum =
    Math.abs(
      finite(
        asset
          ?.change24hPercent,
      ),
    );

  return (
    Math.log10(
      1 + volume,
    ) *
      10 +
    Math.log10(
      1 + liquidity,
    ) *
      8 +
    Math.min(
      momentum,
      30,
    )
  );
}


function dedupe(rows) {
  const map =
    new Map();

  for (
    const row
    of rows
  ) {
    const key =
      assetKey(row);

    if (!map.has(key)) {
      map.set(
        key,
        row,
      );
    }
  }

  return [
    ...map.values(),
  ];
}


/**
 * ============================================================
 * CEX MARKET-DATA HELPERS
 * ============================================================
 */

function getVenueName(row) {
  return String(
    row?.exchange ??
    row?.venue ??
    "",
  )
    .trim()
    .toUpperCase();
}


function getVenuePrice(row) {
  return finiteOrNull(
    row?.market?.price ??
    row?.priceUsd ??
    row?.price,
  );
}


function getVenueVolume(row) {
  return finiteOrNull(
    row?.market
      ?.quoteVolume ??
    row?.volume24hUsd ??
    row?.quoteVolumeUsd,
  );
}


function getVenueChange(row) {
  return finiteOrNull(
    row?.market
      ?.priceChangePercent ??
    row?.change24hPercent,
  );
}


function hasMarketData(row) {
  const price =
    getVenuePrice(row);

  const volume =
    getVenueVolume(row);

  return (
    price !== null &&
    price > 0 &&
    volume !== null &&
    volume >= 0
  );
}


/**
 * ============================================================
 * CEX FALLBACK ASSET
 * ============================================================
 *
 * Build a research asset from CEX market data when CoinGecko
 * does not provide the asset.
 *
 * PROVIDER PRIORITY
 * -----------------
 *
 * 1. Kraken with measurements
 * 2. Coinbase with measurements
 * 3. Any measured CEX venue
 * 4. Coinbase metadata
 * 5. Kraken metadata
 * 6. Any remaining venue
 *
 * Kraken is intentionally first for measured market data
 * because it can retrieve the broad CEX universe efficiently
 * through bulk ticker requests.
 *
 * Coinbase remains valuable for instrument discovery and
 * targeted enrichment.
 *
 * IMPORTANT:
 * - marketCap is not fabricated.
 * - unavailable measurements remain null.
 * - CEX spot data is never represented as futures data.
 */

function buildCexFallbackAsset({
  symbol,
  venueRows,
  startedAt,
}) {
  const normalizedSymbol =
    symbolKey(symbol);

  if (!normalizedSymbol) {
    return null;
  }


  const rows =
    Array.isArray(
      venueRows,
    )
      ? venueRows
      : [];


  /*
   * ----------------------------------------------------------
   * 1. KRAKEN WITH MEASUREMENTS
   * ----------------------------------------------------------
   */

  const measuredKraken =
    rows.find(
      row =>
        getVenueName(row) ===
          "KRAKEN" &&
        hasMarketData(row),
    );


  /*
   * ----------------------------------------------------------
   * 2. COINBASE WITH MEASUREMENTS
   * ----------------------------------------------------------
   *
   * Coinbase broad discovery is metadata-only now, but
   * targeted enrichment may still provide measured rows.
   */

  const measuredCoinbase =
    rows.find(
      row =>
        getVenueName(row) ===
          "COINBASE" &&
        hasMarketData(row),
    );


  /*
   * ----------------------------------------------------------
   * 3. ANY MEASURED CEX
   * ----------------------------------------------------------
   */

  const measuredAny =
    rows.find(
      hasMarketData,
    );


  /*
   * ----------------------------------------------------------
   * 4. METADATA FALLBACKS
   * ----------------------------------------------------------
   */

  const coinbaseMetadata =
    rows.find(
      row =>
        getVenueName(row) ===
        "COINBASE",
    );


  const krakenMetadata =
    rows.find(
      row =>
        getVenueName(row) ===
        "KRAKEN",
    );


  const preferred =
    measuredKraken ??
    measuredCoinbase ??
    measuredAny ??
    coinbaseMetadata ??
    krakenMetadata ??
    rows[0] ??
    null;


  if (!preferred) {
    return null;
  }


  const priceUsd =
    getVenuePrice(
      preferred,
    );


  const volume24hUsd =
    getVenueVolume(
      preferred,
    );


  const change24hPercent =
    getVenueChange(
      preferred,
    );


  return {
    assetId:
      `cex:${normalizedSymbol.toLowerCase()}`,

    symbol:
      normalizedSymbol,

    name:
      preferred?.name ??
      preferred?.baseAsset ??
      preferred?.baseSymbol ??
      preferred?.base ??
      normalizedSymbol,

    priceUsd,

    volume24hUsd,

    change24hPercent,

    /*
     * These cannot be safely derived from the CEX
     * measurements available here.
     */

    marketCapUsd:
      null,

    change1hPercent:
      null,

    change7dPercent:
      null,


    tradable:
      rows.length > 0,


    venues:
      summarizeVenues(
        rows,
      ),


    universeSource:
      "CEX_FALLBACK",


    marketDataSource:
      hasMarketData(
        preferred,
      )
        ? (
            preferred
              ?.exchange ??
            preferred
              ?.venue ??
            null
          )
        : null,


    marketDataAvailable:
      hasMarketData(
        preferred,
      ),


    discoveredAt:
      startedAt,


    researchOnly:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}


/**
 * ============================================================
 * CACHE
 * ============================================================
 */

export function clearCryptoUniverseCache() {
  cache = null;
}


export function getCryptoUniverseCacheStatus() {
  return {
    cached:
      Boolean(cache),

    generatedAt:
      cache?.generatedAt ??
      null,

    assetCount:
      cache?.assets
        ?.length ??
      0,
  };
}


/**
 * ============================================================
 * GET CRYPTO UNIVERSE
 * ============================================================
 */

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
  if (
    cache &&
    refresh !== true
  ) {
    return cache;
  }


  const startedAt =
    new Date()
      .toISOString();


  const errors = [];

  const warnings = [];


  let marketRows = [];

  let coinbaseProducts = [];

  let krakenPairs = [];

  let dexAssets = [];


  /**
   * ==========================================================
   * COINGECKO
   * ==========================================================
   */

  try {
    marketRows =
      (
        await getCoinGeckoMarkets({
          pages:
            coinGeckoPages,

          perPage:
            250,

          order:
            "volume_desc",
        })
      ).map(
        normalizeCoinGeckoMarket,
      );
  } catch (error) {
    warnings.push(
      `CoinGecko market discovery unavailable: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }


  /**
   * ==========================================================
   * COINBASE
   * ==========================================================
   *
   * Coinbase now supplies broad instrument metadata.
   *
   * listCoinbaseProducts() intentionally DOES NOT fetch
   * ticker + stats for every instrument.
   */

  try {
    const raw =
      await listCoinbaseProducts();


    /*
     * The updated Coinbase provider already returns normalized
     * rows, but normalizeCoinbaseProduct remains idempotent
     * enough for backward compatibility.
     */

    coinbaseProducts =
      Array.isArray(raw)
        ? raw.map(
            row => {
              /*
               * Avoid unnecessarily destroying an already
               * normalized market object.
               */
              if (
                row?.exchange ===
                  "COINBASE" &&
                row?.venueType ===
                  "CEX" &&
                row?.base
              ) {
                return row;
              }

              return normalizeCoinbaseProduct(
                row,
              );
            },
          )
        : [];
  } catch (error) {
    warnings.push(
      `Coinbase venue discovery unavailable: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }


  /**
   * ==========================================================
   * KRAKEN — BULK MARKET MEASUREMENTS
   * ==========================================================
   *
   * This is the important architecture change.
   *
   * OLD:
   *
   *   getKrakenAssetPairs()
   *
   * returned primarily venue metadata.
   *
   * NEW:
   *
   *   listKrakenMarkets()
   *
   * retrieves the Kraken pairs and then obtains bulk ticker
   * measurements.
   *
   * The returned rows therefore contain:
   *
   * - price
   * - quote volume
   * - 24h change
   * - bid / ask
   * - VWAP
   * - high / low
   * - trade count
   *
   * where Kraken supplies those measurements.
   */

  try {
    const raw =
      await listKrakenMarkets();


    krakenPairs =
      Array.isArray(raw)
        ? raw
        : [];


    const measured =
      krakenPairs.filter(
        hasMarketData,
      ).length;


    console.log(
      `[CRYPTO_UNIVERSE] Kraken rows=${krakenPairs.length} measured=${measured}`,
    );


    if (
      krakenPairs.length > 0 &&
      measured === 0
    ) {
      warnings.push(
        "Kraken returned venue metadata but no usable bulk market measurements.",
      );
    }
  } catch (error) {
    warnings.push(
      `Kraken market discovery unavailable: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }


  /**
   * ==========================================================
   * DEX DISCOVERY
   * ==========================================================
   */

  if (
    includeDexDiscovery
  ) {
    try {
      const discovery =
        await discoverDexAssets({
          networks:
            dexNetworks,

          pagesPerNetwork:
            dexPagesPerNetwork,
        });


      dexAssets =
        Array.isArray(
          discovery?.assets,
        )
          ? discovery.assets
          : [];


      for (
        const item
        of discovery?.errors ??
          []
      ) {
        const provider =
          item?.provider
            ? `${item.provider} `
            : "";

        const network =
          item?.network
            ? `${item.network}: `
            : "";

        const message =
          item?.error ??
          "Unknown DEX discovery error";


        warnings.push(
          `DEX discovery ${provider}${network}${message}`,
        );
      }
    } catch (error) {
      warnings.push(
        `DEX discovery unavailable: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }


  /**
   * ==========================================================
   * BUILD CEX VENUE INDEX
   * ==========================================================
   *
   * Coinbase:
   *   broad metadata
   *
   * Kraken:
   *   broad metadata + bulk measurements
   */

  const venueIndex =
    buildVenueIndex({
      coinbaseProducts,
      krakenPairs,
    });


  /**
   * ==========================================================
   * PRIMARY COINGECKO ASSETS
   * ==========================================================
   */

  const broadAssetMap =
    new Map();


  for (
    const market
    of marketRows
  ) {
    const symbol =
      symbolKey(
        market?.symbol,
      );


    if (!symbol) {
      continue;
    }


    const venues =
      venueIndex.get(
        symbol,
      ) ??
      [];


    broadAssetMap.set(
      symbol,
      {
        ...market,

        symbol,

        tradable:
          venues.length >
          0,

        venues:
          summarizeVenues(
            venues,
          ),

        universeSource:
          "COINGECKO",

        discoveredAt:
          startedAt,
      },
    );
  }


  /**
   * ==========================================================
   * CEX FALLBACK ASSETS
   * ==========================================================
   *
   * This section makes the system resilient to CoinGecko
   * outages/rate limits.
   *
   * Every symbol in the Coinbase/Kraken venue index can become
   * a universe asset.
   *
   * When Kraken has measurements, those measurements are used.
   *
   * Coinbase metadata-only rows do NOT create fake prices.
   */

  let cexFallbackAssets =
    0;


  let measuredCexFallbackAssets =
    0;


  for (
    const [
      symbol,
      venueRows,
    ]
    of venueIndex.entries()
  ) {
    const normalizedSymbol =
      symbolKey(symbol);


    if (
      !normalizedSymbol ||
      broadAssetMap.has(
        normalizedSymbol,
      )
    ) {
      continue;
    }


    const fallback =
      buildCexFallbackAsset({
        symbol:
          normalizedSymbol,

        venueRows,

        startedAt,
      });


    if (!fallback) {
      continue;
    }


    broadAssetMap.set(
      normalizedSymbol,
      fallback,
    );


    cexFallbackAssets +=
      1;


    if (
      fallback
        ?.marketDataAvailable ===
      true
    ) {
      measuredCexFallbackAssets +=
        1;
    }
  }


  const broadAssets = [
    ...broadAssetMap
      .values(),
  ];


  /**
   * ==========================================================
   * DEX RESERVATION
   * ==========================================================
   */

  const rankedDex =
    dedupe(
      dexAssets,
    )
      .sort(
        (
          a,
          b,
        ) =>
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


  /**
   * Prefer measured broad assets.
   *
   * Missing volume is treated as 0 only for ranking.
   * The actual stored measurement remains null.
   */

  const selectedBroad =
    broadAssets
      .sort(
        (
          a,
          b,
        ) =>
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
    ])
      .slice(
        0,
        maximumAssets,
      );


  /**
   * ==========================================================
   * STATUS
   * ==========================================================
   */

  const allPrimaryProvidersFailed =
    marketRows.length ===
      0 &&
    coinbaseProducts.length ===
      0 &&
    krakenPairs.length ===
      0 &&
    dexAssets.length ===
      0;


  if (
    allPrimaryProvidersFailed
  ) {
    errors.push(
      "All crypto universe providers returned no usable assets.",
    );
  }


  const status =
    assets.length === 0
      ? errors.length > 0
        ? CRYPTO_UNIVERSE_STATUS
            .ERROR
        : CRYPTO_UNIVERSE_STATUS
            .EMPTY
      : warnings.length >
            0 ||
          errors.length >
            0
        ? CRYPTO_UNIVERSE_STATUS
            .PARTIAL
        : CRYPTO_UNIVERSE_STATUS
            .COMPLETE;


  /**
   * ==========================================================
   * DIAGNOSTICS
   * ==========================================================
   */

  const krakenMeasured =
    krakenPairs.filter(
      hasMarketData,
    ).length;


  const coinbaseMeasured =
    coinbaseProducts.filter(
      hasMarketData,
    ).length;


  console.log(
    [
      "[CRYPTO_UNIVERSE]",
      `assets=${assets.length}`,
      `coinGecko=${marketRows.length}`,
      `coinbase=${coinbaseProducts.length}`,
      `coinbaseMeasured=${coinbaseMeasured}`,
      `kraken=${krakenPairs.length}`,
      `krakenMeasured=${krakenMeasured}`,
      `cexFallback=${cexFallbackAssets}`,
      `cexFallbackMeasured=${measuredCexFallbackAssets}`,
      `dex=${dexAssets.length}`,
    ].join(" "),
  );


  /**
   * ==========================================================
   * CACHE / RESPONSE
   * ==========================================================
   */

  cache = {
    approved:
      assets.length > 0,

    status,

    assetCount:
      assets.length,

    assets,


    composition: {
      broadAssets:
        selectedBroad.length,

      coinGeckoBroadAssets:
        marketRows.length,

      cexFallbackAssets,

      measuredCexFallbackAssets,

      reservedDexAssets:
        selectedDex.length,

      dexAssetsDiscovered:
        dexAssets.length,

      dexAssetsMeasured:
        assets.filter(
          asset =>
            (
              asset?.venues
                ?.dexCount ??
              0
            ) > 0,
        ).length,
    },


    providers: {
      coinGecko:
        marketRows.length,

      coinbase:
        coinbaseProducts.length,

      coinbaseMeasured,

      kraken:
        krakenPairs.length,

      krakenMeasured,

      dexNewPools:
        dexAssets.length,
    },


    errors,

    warnings,

    startedAt,

    generatedAt:
      new Date()
        .toISOString(),
  };


  return cache;
}


export default getCryptoUniverse;