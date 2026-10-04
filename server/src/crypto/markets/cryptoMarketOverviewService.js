import { getCryptoUniverse } from "../universe/cryptoUniverseProvider.js";

/**
 * ============================================================
 * NUMBER HELPERS
 * ============================================================
 */

function finiteOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finiteOrNull(value);

    if (n !== null) {
      return n;
    }
  }

  return null;
}


/**
 * ============================================================
 * MARKET TYPE
 * ============================================================
 */

function marketType(asset) {
  const cex =
    firstFinite(
      asset?.venues?.cexCount,
      asset?.cexCount,
    ) ?? 0;

  const dex =
    firstFinite(
      asset?.venues?.dexCount,
      asset?.dexCount,
    ) ?? 0;

  if (cex > 0 && dex > 0) {
    return "CEX + DEX";
  }

  if (dex > 0) {
    return "DEX";
  }

  if (
    cex > 0 ||
    asset?.tradable === true
  ) {
    return "CEX";
  }

  return (
    asset?.marketType ??
    null
  );
}


/**
 * ============================================================
 * NORMALIZE ASSET
 * ============================================================
 */

function normalize(asset, index) {
  return {
    rank:
      firstFinite(
        asset?.rank,
        asset?.marketCapRank,
        asset?.market_cap_rank,
      ) ??
      index + 1,

    assetId:
      asset?.assetId ??
      asset?.id ??
      null,

    symbol:
      String(
        asset?.symbol ??
        "",
      ).toUpperCase(),

    name:
      asset?.name ??
      asset?.symbol ??
      "Unknown asset",

    price:
      firstFinite(
        asset?.priceUsd,
        asset?.price,
        asset?.currentPrice,
        asset?.current_price,
      ),

    change24h:
      firstFinite(
        asset?.change24hPercent,
        asset?.change24h,
        asset?.priceChange24h,
        asset?.price_change_percentage_24h,
      ),

    marketCap:
      firstFinite(
        asset?.marketCapUsd,
        asset?.marketCap,
        asset?.market_cap,
      ),

    volume24h:
      firstFinite(
        asset?.volume24hUsd,
        asset?.volume24h,
        asset?.totalVolume24h,
        asset?.total_volume,
      ),

    marketType:
      marketType(asset),

    venue:
      asset?.primaryVenue ??
      asset?.venue ??
      asset?.venues?.primaryVenue ??
      asset?.venues?.primary ??
      asset?.exchange ??
      null,

    tradable:
      asset?.tradable === true,

    network:
      asset?.network ??
      null,

    contractAddress:
      asset?.contractAddress ??
      null,

    /*
     * Data provenance.
     *
     * Useful for debugging and for keeping broad-market
     * measurements separate from venue-specific measurements.
     */

    universeSource:
      asset?.universeSource ??
      asset?.source ??
      null,

    marketDataSource:
      asset?.marketDataSource ??
      null,

    marketCapSource:
      asset?.marketCapSource ??
      null,

    supplySource:
      asset?.supplySource ??
      null,
  };
}


/**
 * ============================================================
 * FALLBACK AGGREGATION
 * ============================================================
 *
 * These functions are NOT the preferred source of global market
 * statistics.
 *
 * They are retained only as a fallback if the broad-market
 * provider does not supply global statistics.
 */

function sumKnown(
  assets,
  field,
) {
  let total = 0;
  let count = 0;

  for (const asset of assets) {
    const n =
      finiteOrNull(
        asset?.[field],
      );

    if (n === null) {
      continue;
    }

    total += n;
    count += 1;
  }

  return count > 0
    ? total
    : null;
}


function weightedChange(assets) {
  let sum = 0;
  let weight = 0;

  for (const asset of assets) {
    const change =
      finiteOrNull(
        asset?.change24h,
      );

    const marketCap =
      finiteOrNull(
        asset?.marketCap,
      );

    if (
      change === null ||
      marketCap === null ||
      marketCap <= 0
    ) {
      continue;
    }

    sum +=
      change *
      marketCap;

    weight +=
      marketCap;
  }

  return weight > 0
    ? sum / weight
    : null;
}


/**
 * ============================================================
 * MARKET OVERVIEW
 * ============================================================
 */

export async function getCryptoMarketOverview({
  refresh = false,
  maximumAssets = 1000,
} = {}) {

  const universe =
    await getCryptoUniverse({
      refresh,
      maximumAssets,
      includeDexDiscovery: true,
    });


  /**
   * ----------------------------------------------------------
   * NORMALIZED ASSETS
   * ----------------------------------------------------------
   */

  const assets =
    Array.isArray(
      universe?.assets,
    )
      ? universe.assets
          .map(normalize)
          .filter(
            asset =>
              Boolean(
                asset.symbol,
              ),
          )
      : [];


  /**
   * ----------------------------------------------------------
   * GLOBAL MARKET DATA
   * ----------------------------------------------------------
   *
   * Preferred source:
   *
   *   universe.globalMarket
   *
   * which currently comes from CoinLore.
   *
   * IMPORTANT:
   *
   * We do NOT calculate total crypto market capitalization from
   * the selected scanner universe when a true global provider
   * measurement exists.
   */

  const globalMarket =
    universe?.globalMarket ??
    null;


  /**
   * True global market capitalization.
   */

  const providerTotalMarketCap =
    finiteOrNull(
      globalMarket
        ?.totalMarketCapUsd,
    );


  /**
   * True global 24-hour volume.
   */

  const providerVolume24h =
    finiteOrNull(
      globalMarket
        ?.totalVolume24hUsd,
    );


  /**
   * True BTC dominance.
   */

  const providerBtcDominance =
    finiteOrNull(
      globalMarket
        ?.btcDominancePercent,
    );


  /**
   * ETH dominance.
   */

  const ethDominance =
    finiteOrNull(
      globalMarket
        ?.ethDominancePercent,
    );


  /**
   * Global market-cap change.
   */

  const providerMarketChange24h =
    finiteOrNull(
      globalMarket
        ?.marketCapChange24hPercent,
    );


  /**
   * Global volume change.
   */

  const volumeChange24h =
    finiteOrNull(
      globalMarket
        ?.volumeChange24hPercent,
    );


  /**
   * ----------------------------------------------------------
   * FALLBACK VALUES
   * ----------------------------------------------------------
   *
   * These are used only if the global provider measurement is
   * unavailable.
   */

  const universeMarketCap =
    sumKnown(
      assets,
      "marketCap",
    );


  const universeVolume24h =
    sumKnown(
      assets,
      "volume24h",
    );


  const universeMarketChange =
    weightedChange(
      assets,
    );


  const btc =
    assets.find(
      asset =>
        asset.symbol ===
        "BTC",
    );


  const fallbackBtcDominance =
    universeMarketCap !== null &&
    universeMarketCap > 0 &&
    finiteOrNull(
      btc?.marketCap,
    ) !== null
      ? (
          btc.marketCap /
          universeMarketCap
        ) * 100
      : null;


  /**
   * ----------------------------------------------------------
   * FINAL GLOBAL VALUES
   * ----------------------------------------------------------
   */

  const totalMarketCap =
    providerTotalMarketCap ??
    universeMarketCap;


  const volume24h =
    providerVolume24h ??
    universeVolume24h;


  const btcDominance =
    providerBtcDominance ??
    fallbackBtcDominance;


  const marketChange24h =
    providerMarketChange24h ??
    universeMarketChange;


  /**
   * ----------------------------------------------------------
   * RESPONSE
   * ----------------------------------------------------------
   */

  return {
    approved:
      universe?.approved ===
        true &&
      assets.length > 0,

    status:
      universe?.status ??
      (
        assets.length
          ? "COMPLETE"
          : "EMPTY"
      ),

    assetCount:
      assets.length,

    assets,


    /**
     * Global crypto market measurements.
     */

    totalMarketCap,

    volume24h,

    btcDominance,

    ethDominance,

    marketChange24h,

    volumeChange24h,


    /**
     * Global market metadata.
     */

    globalMarket: {
      totalMarketCap,

      volume24h,

      btcDominance,

      ethDominance,

      marketChange24h,

      volumeChange24h,

      coinsCount:
        finiteOrNull(
          globalMarket
            ?.coinsCount,
        ),

      activeMarkets:
        finiteOrNull(
          globalMarket
            ?.activeMarkets,
        ),

      source:
        globalMarket
          ?.source ??
        null,

      observedAt:
        globalMarket
          ?.observedAt ??
        null,

      fallbackUsed: {
        totalMarketCap:
          providerTotalMarketCap ===
          null,

        volume24h:
          providerVolume24h ===
          null,

        btcDominance:
          providerBtcDominance ===
          null,

        marketChange24h:
          providerMarketChange24h ===
          null,
      },
    },


    /**
     * Universe diagnostics.
     */

    composition:
      universe
        ?.composition ??
      null,

    providers:
      universe
        ?.providers ??
      null,

    warnings:
      Array.isArray(
        universe?.warnings,
      )
        ? universe.warnings
        : [],

    errors:
      Array.isArray(
        universe?.errors,
      )
        ? universe.errors
        : [],


    generatedAt:
      universe?.generatedAt ??
      new Date()
        .toISOString(),

    updatedAt:
      universe?.generatedAt ??
      new Date()
        .toISOString(),

    researchOnly:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default getCryptoMarketOverview;