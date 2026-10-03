/**
 * AEMA CEX Research Universe
 *
 * Legacy filename retained to avoid breaking Phase 7 imports.
 *
 * Architecture:
 * - Coinbase = supported research/execution instrument metadata
 * - Kraken   = bulk CEX market measurements
 *
 * We DO NOT perform hundreds of Coinbase ticker/stat requests here.
 * Kraken measurements are joined to Coinbase-supported base assets.
 *
 * Research/discovery only.
 * No execution authority.
 */

import BOT_CONFIG from "../config/botConfig.js";

import {
  listCoinbaseProducts,
} from "../../data/providers/coinbaseProvider.js";

import {
  listKrakenMarkets,
} from "../../data/providers/krakenProvider.js";


const USD_LIKE_QUOTES = new Set([
  "USD",
  "USDT",
  "USDC",
]);


/**
 * Preserve missing market data as null.
 *
 * IMPORTANT:
 * Number(null) === 0, so we must guard missing values
 * before converting to Number.
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


function upper(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}


function isUsdLikeQuote(value) {
  return USD_LIKE_QUOTES.has(
    upper(value),
  );
}


function getKrakenBase(row) {
  return upper(
    row?.baseAsset ??
    row?.base ??
    row?.baseSymbol,
  );
}


function getKrakenQuote(row) {
  return upper(
    row?.quoteAsset ??
    row?.quote ??
    row?.quoteSymbol,
  );
}


function getKrakenPrice(row) {
  return finiteOrNull(
    row?.priceUsd ??
    row?.price ??
    row?.market?.price,
  );
}


/**
 * IMPORTANT:
 *
 * Only USD-like quote pairs are admitted to this bot universe.
 * Therefore quote-volume can be treated as USD-like notional.
 *
 * We deliberately do NOT take EUR/CAD/etc quote volume and label
 * it volume24hUsd.
 */
function getKrakenVolumeUsd(row) {
  const quote =
    getKrakenQuote(row);

  if (!isUsdLikeQuote(quote)) {
    return null;
  }

  return finiteOrNull(
    row?.volume24hUsd ??
    row?.quoteVolumeUsd ??
    row?.market?.quoteVolume,
  );
}


function getKrakenChange(row) {
  return finiteOrNull(
    row?.change24hPercent ??
    row?.market?.priceChangePercent,
  );
}


function hasUsableMeasurement(row) {
  const price =
    getKrakenPrice(row);

  const volume =
    getKrakenVolumeUsd(row);

  return (
    price !== null &&
    price > 0 &&
    volume !== null &&
    volume > 0
  );
}


/**
 * Prefer:
 * 1. USD
 * 2. USDC
 * 3. USDT
 *
 * This keeps native USD measurements ahead of stablecoin
 * quote pairs when multiple Kraken markets exist for one base.
 */
function quotePriority(row) {
  const quote =
    getKrakenQuote(row);

  if (quote === "USD") return 3;
  if (quote === "USDC") return 2;
  if (quote === "USDT") return 1;

  return 0;
}


function buildKrakenMeasurementIndex(
  markets = [],
) {
  const index =
    new Map();

  for (const row of markets) {
    const base =
      getKrakenBase(row);

    const quote =
      getKrakenQuote(row);

    if (!base) continue;

    if (!isUsdLikeQuote(quote)) {
      continue;
    }

    if (!hasUsableMeasurement(row)) {
      continue;
    }

    const existing =
      index.get(base);

    if (!existing) {
      index.set(base, row);
      continue;
    }

    const existingPriority =
      quotePriority(existing);

    const incomingPriority =
      quotePriority(row);

    if (
      incomingPriority >
      existingPriority
    ) {
      index.set(base, row);
      continue;
    }

    /**
     * If both have the same quote priority,
     * prefer the more liquid / higher-volume market.
     */
    if (
      incomingPriority ===
      existingPriority
    ) {
      const existingVolume =
        getKrakenVolumeUsd(existing) ??
        0;

      const incomingVolume =
        getKrakenVolumeUsd(row) ??
        0;

      if (
        incomingVolume >
        existingVolume
      ) {
        index.set(base, row);
      }
    }
  }

  return index;
}


function buildMeasuredAsset(
  coinbaseRow,
  krakenRow,
) {
  const price =
    getKrakenPrice(
      krakenRow,
    );

  const volume24hUsd =
    getKrakenVolumeUsd(
      krakenRow,
    );

  const change24hPercent =
    getKrakenChange(
      krakenRow,
    );

  const krakenMarket =
    krakenRow?.market ??
    {};

  return {
    ...coinbaseRow,

    /**
     * Keep Coinbase product identity because later research
     * modules use Coinbase product IDs.
     */
    exchange:
      "COINBASE",

    venue:
      "COINBASE",

    venueType:
      "CEX",

    productId:
      coinbaseRow.productId,

    symbol:
      coinbaseRow.symbol,

    base:
      coinbaseRow.baseAsset,

    quote:
      coinbaseRow.quoteAsset,

    baseAsset:
      coinbaseRow.baseAsset,

    quoteAsset:
      coinbaseRow.quoteAsset,

    status:
      "TRADING",

    tradable:
      true,

    contractType:
      "SPOT",

    instrumentType:
      "SPOT",

    /**
     * Measurements are supplied by Kraken.
     */
    priceUsd:
      price,

    price,

    volume24hUsd,

    quoteVolumeUsd:
      volume24hUsd,

    change24hPercent,

    market: {
      ...(coinbaseRow.market ?? {}),

      price,

      bid:
        finiteOrNull(
          krakenMarket?.bid,
        ),

      ask:
        finiteOrNull(
          krakenMarket?.ask,
        ),

      bidQty:
        finiteOrNull(
          krakenMarket?.bidQty,
        ),

      askQty:
        finiteOrNull(
          krakenMarket?.askQty,
        ),

      spreadPercent:
        finiteOrNull(
          krakenMarket
            ?.spreadPercent,
        ),

      baseVolume:
        finiteOrNull(
          krakenMarket
            ?.baseVolume,
        ),

      quoteVolume:
        volume24hUsd,

      priceChangePercent:
        change24hPercent,

      highPrice:
        finiteOrNull(
          krakenMarket
            ?.highPrice,
        ),

      lowPrice:
        finiteOrNull(
          krakenMarket
            ?.lowPrice,
        ),

      rangePercent:
        finiteOrNull(
          krakenMarket
            ?.rangePercent,
        ),

      tradeCount24h:
        finiteOrNull(
          krakenMarket
            ?.tradeCount24h,
        ),
    },

    marketDataAvailable:
      true,

    marketDataError:
      null,

    /**
     * Explicit provenance.
     */
    source:
      "COINBASE_METADATA_KRAKEN_MARKET_DATA",

    metadataSource:
      "COINBASE_EXCHANGE_PUBLIC",

    marketDataSource:
      "KRAKEN_PUBLIC",

    measurementVenue:
      "KRAKEN",

    measurementSymbol:
      krakenRow?.symbol ??
      null,

    measurementQuoteAsset:
      getKrakenQuote(
        krakenRow,
      ),

    observedAt:
      krakenRow?.observedAt ??
      new Date()
        .toISOString(),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}


export async function getBotFuturesUniverse(
  options = {},
) {
  const config = {
    ...BOT_CONFIG.universe,
    ...options,
  };

  /**
   * Fetch metadata and bulk measurements concurrently.
   */
  const [
    rawCoinbaseProducts,
    rawKrakenMarkets,
  ] =
    await Promise.all([
      listCoinbaseProducts({
        timeoutMs:
          config.timeoutMs,
      }),

      listKrakenMarkets({
        timeoutMs:
          config.timeoutMs,
      }),
    ]);

  if (
    !Array.isArray(
      rawCoinbaseProducts,
    )
  ) {
    throw new Error(
      "BOT_UNIVERSE_INVALID_COINBASE_RESPONSE",
    );
  }

  if (
    !Array.isArray(
      rawKrakenMarkets,
    )
  ) {
    throw new Error(
      "BOT_UNIVERSE_INVALID_KRAKEN_RESPONSE",
    );
  }

  const configuredQuotes =
    new Set(
      (
        config.quoteAssets ??
        []
      )
        .map(upper),
    );

  /**
   * Coinbase remains the authoritative list of products that
   * later targeted Coinbase research can actually resolve.
   */
  const coinbaseProducts =
  rawCoinbaseProducts
    .filter(
      row =>
        row?.productId &&
        row?.baseAsset &&
        row?.quoteAsset,
    )
      .filter(
        row =>
          row?.status ===
          "TRADING",
      )
      .filter(
        row =>
          !configuredQuotes.size ||
          configuredQuotes.has(
            upper(
              row.quoteAsset,
            ),
          ),
      );

  /**
   * Kraken supplies the broad measurements.
   */
  const krakenIndex =
    buildKrakenMeasurementIndex(
      rawKrakenMarkets,
    );

  const measuredAssets =
    [];

  let noKrakenMatch =
    0;

  let invalidMeasurement =
    0;

  for (
    const coinbaseRow
    of coinbaseProducts
  ) {
    const base =
      upper(
        coinbaseRow.baseAsset,
      );

    const krakenRow =
      krakenIndex.get(base);

    if (!krakenRow) {
      noKrakenMatch +=
        1;

      continue;
    }

    if (
      !hasUsableMeasurement(
        krakenRow,
      )
    ) {
      invalidMeasurement +=
        1;

      continue;
    }

    measuredAssets.push(
      buildMeasuredAsset(
        coinbaseRow,
        krakenRow,
      ),
    );
  }

  /**
   * Prefer the most actively traded markets before applying
   * the configured universe cap.
   */
  measuredAssets.sort(
    (a, b) =>
      (
        finiteOrNull(
          b.volume24hUsd,
        ) ??
        0
      ) -
      (
        finiteOrNull(
          a.volume24hUsd,
        ) ??
        0
      ),
  );

  const maximumSymbols =
    Number.isFinite(
      Number(
        config.maximumSymbols,
      ),
    ) &&
    Number(
      config.maximumSymbols,
    ) >
      0
      ? Math.floor(
          Number(
            config.maximumSymbols,
          ),
        )
      : measuredAssets.length;

  const assets =
    measuredAssets.slice(
      0,
      maximumSymbols,
    );

  console.log(
    `[BOT_CEX_UNIVERSE] ` +
    `coinbase=${coinbaseProducts.length} ` +
    `kraken=${rawKrakenMarkets.length} ` +
    `krakenMeasured=${krakenIndex.size} ` +
    `matched=${measuredAssets.length} ` +
    `selected=${assets.length} ` +
    `noKrakenMatch=${noKrakenMatch} ` +
    `invalidMeasurement=${invalidMeasurement}`,
  );

  return {
    generatedAt:
      new Date()
        .toISOString(),

    exchange:
      "MULTI_CEX",

    source:
      "COINBASE_METADATA_KRAKEN_MARKET_DATA",

    metadataSource:
      "COINBASE_EXCHANGE_PUBLIC",

    marketDataSource:
      "KRAKEN_PUBLIC",

    marketType:
      "SPOT_RESEARCH",

    count:
      assets.length,

    assets,

    diagnostics: {
      coinbaseProducts:
        coinbaseProducts.length,

      krakenMarkets:
        rawKrakenMarkets.length,

      krakenMeasuredBases:
        krakenIndex.size,

      matchedAssets:
        measuredAssets.length,

      selectedAssets:
        assets.length,

      noKrakenMatch,

      invalidMeasurement,
    },

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}


export default getBotFuturesUniverse;