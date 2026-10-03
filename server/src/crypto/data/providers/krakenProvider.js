/**
 * ============================================================
 * AEMA CRYPTO — KRAKEN PUBLIC MARKET DATA PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 * Kraken is the primary BULK CEX market-data feeder.
 *
 * One AssetPairs request:
 *   -> discovers instruments
 *
 * One Ticker request:
 *   -> supplies market measurements for many instruments
 *
 * This avoids hundreds of per-product requests.
 *
 * SPOT DATA ONLY.
 * RESEARCH ONLY.
 * NO EXECUTION AUTHORITY.
 */

const KRAKEN_API_BASE =
  process.env.KRAKEN_API_BASE_URL ||
  "https://api.kraken.com/0/public";

const PAIR_CACHE_MS =
  Number(
    process.env.AEMA_KRAKEN_PAIR_CACHE_MS,
  ) || 5 * 60 * 1000;

const MARKET_CACHE_MS =
  Number(
    process.env.AEMA_KRAKEN_MARKET_CACHE_MS,
  ) || 60 * 1000;


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

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

  return Number.isFinite(number)
    ? number
    : null;
}


function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}


function normalizeKrakenAsset(value) {
  const symbol =
    normalizeSymbol(value);

  const replacements = {
    XBT: "BTC",
    XXBT: "BTC",

    XETH: "ETH",

    XXRP: "XRP",

    XLTC: "LTC",

    XXLM: "XLM",

    XETC: "ETC",

    ZUSD: "USD",
    ZEUR: "EUR",
    ZGBP: "GBP",
    ZJPY: "JPY",
    ZCAD: "CAD",
    ZAUD: "AUD",

    USDT: "USDT",
    USDC: "USDC",
  };

  return replacements[symbol] ?? symbol;
}


/**
 * ============================================================
 * HTTP
 * ============================================================
 */

async function fetchJson(
  path,
  {
    timeoutMs = 15_000,
  } = {},
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        `${KRAKEN_API_BASE}${path}`,
        {
          headers: {
            Accept:
              "application/json",

            "User-Agent":
              "AEMA-Research/1.0",
          },

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      const body =
        await response
          .text()
          .catch(() => "");

      throw new Error(
        `KRAKEN_HTTP_${response.status}:${path}:${body.slice(0, 200)}`,
      );
    }

    const payload =
      await response.json();

    if (
      Array.isArray(
        payload?.error,
      ) &&
      payload.error.length > 0
    ) {
      throw new Error(
        `KRAKEN_API:${payload.error.join(",")}`,
      );
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}


/**
 * ============================================================
 * PAIR NORMALIZATION
 * ============================================================
 */

export function normalizeKrakenPair(
  pairId,
  pair = {},
) {
  const wsname =
    String(
      pair?.wsname ?? "",
    ).trim();

  const wsParts =
    wsname
      ? wsname.split("/")
      : [];

  const rawBase =
    wsParts[0] ||
    pair?.base ||
    null;

  const rawQuote =
    wsParts[1] ||
    pair?.quote ||
    null;

  const base =
    normalizeKrakenAsset(
      rawBase,
    );

  const quote =
    normalizeKrakenAsset(
      rawQuote,
    );

  const altname =
    String(
      pair?.altname ??
      pairId ??
      "",
    ).trim();

  return {
    exchange:
      "KRAKEN",

    venue:
      "KRAKEN",

    venueType:
      "CEX",

    productId:
      pairId ?? null,

    symbol:
      altname || pairId || null,

    altname:
      altname || null,

    wsname:
      wsname || null,

    base:
      base || null,

    baseSymbol:
      base || null,

    baseAsset:
      base || null,

    quote:
      quote || null,

    quoteSymbol:
      quote || null,

    quoteAsset:
      quote || null,

    tradable:
      pair?.status !==
      "cancel_only",

    status:
      pair?.status ??
      "online",

    contractType:
      "SPOT",

    instrumentType:
      "SPOT",

    orderMinimum:
      numberOrNull(
        pair?.ordermin,
      ),

    costMinimum:
      numberOrNull(
        pair?.costmin,
      ),

    priceDecimals:
      numberOrNull(
        pair?.pair_decimals,
      ),

    lotDecimals:
      numberOrNull(
        pair?.lot_decimals,
      ),

    source:
      "KRAKEN",

    executionAuthority:
      false,

    liveExecution:
      false,

    raw:
      pair,
  };
}


/**
 * ============================================================
 * PAIR CACHE
 * ============================================================
 */

let pairCache = {
  at: 0,
  rows: [],
};


export async function getKrakenAssetPairs({
  quoteCurrencies = [
    "USD",
    "USDT",
    "USDC",
    "EUR",
    "CAD",
  ],

  refresh = false,
} = {}) {
  if (
    !refresh &&
    Date.now() -
      pairCache.at <
      PAIR_CACHE_MS &&
    pairCache.rows.length > 0
  ) {
    return pairCache.rows;
  }

  const payload =
    await fetchJson(
      "/AssetPairs",
    );

  const result =
    payload?.result ?? {};

  const allowedQuotes =
    new Set(
      quoteCurrencies.map(
        normalizeKrakenAsset,
      ),
    );

  const rows =
    Object.entries(result)
      .map(
        ([
          pairId,
          pair,
        ]) =>
          normalizeKrakenPair(
            pairId,
            pair,
          ),
      )
      .filter(
        pair =>
          Boolean(
            pair.baseSymbol,
          ) &&
          Boolean(
            pair.quoteSymbol,
          ),
      )
      .filter(
        pair =>
          allowedQuotes.size === 0 ||
          allowedQuotes.has(
            pair.quoteSymbol,
          ),
      )
      .filter(
        pair =>
          pair.status !==
          "cancel_only",
      );

  pairCache = {
    at:
      Date.now(),

    rows,
  };

  return rows;
}


/**
 * ============================================================
 * KRAKEN BULK TICKER
 * ============================================================
 */

let marketCache = {
  at: 0,
  rows: [],
};


/**
 * Kraken ticker arrays:
 *
 * a = ask [price, wholeLotVolume, lotVolume]
 * b = bid
 * c = last trade [price, lotVolume]
 * v = volume [today, last24h]
 * p = volume weighted avg price [today, last24h]
 * t = trades [today, last24h]
 * l = low [today, last24h]
 * h = high [today, last24h]
 * o = opening price
 */
function attachTicker(
  pair,
  ticker,
) {
  const price =
    numberOrNull(
      ticker?.c?.[0],
    );

  const bid =
    numberOrNull(
      ticker?.b?.[0],
    );

  const ask =
    numberOrNull(
      ticker?.a?.[0],
    );

  const baseVolume =
    numberOrNull(
      ticker?.v?.[1],
    );

  const vwap =
    numberOrNull(
      ticker?.p?.[1],
    );

  const open =
    numberOrNull(
      ticker?.o,
    );

  const high =
    numberOrNull(
      ticker?.h?.[1],
    );

  const low =
    numberOrNull(
      ticker?.l?.[1],
    );

  const trades =
    numberOrNull(
      ticker?.t?.[1],
    );

  /*
   * Use VWAP for quote notional when available.
   * Otherwise use current price.
   */
  const notionalPrice =
    vwap ??
    price;

  const quoteVolume =
    baseVolume !== null &&
    notionalPrice !== null
      ? baseVolume *
        notionalPrice
      : null;

  const change =
    open !== null &&
    open > 0 &&
    price !== null
      ? (
          (
            price -
            open
          ) /
          open
        ) *
        100
      : null;

  const spreadPercent =
    bid !== null &&
    ask !== null &&
    bid > 0 &&
    ask > 0
      ? (
          (
            ask -
            bid
          ) /
          (
            (
              ask +
              bid
            ) /
            2
          )
        ) *
        100
      : null;

  return {
    ...pair,

    priceUsd:
      price,

    price,

    volume24hUsd:
      quoteVolume,

    quoteVolumeUsd:
      quoteVolume,

    change24hPercent:
      change,

    marketDataAvailable:
      price !== null,

    market: {
      price,

      bid,

      ask,

      bidQty:
        null,

      askQty:
        null,

      spreadPercent,

      baseVolume,

      quoteVolume,

      vwap,

      priceChangePercent:
        change,

      highPrice:
        high,

      lowPrice:
        low,

      rangePercent:
        price !== null &&
        price > 0 &&
        high !== null &&
        low !== null
          ? (
              (
                high -
                low
              ) /
              price
            ) *
            100
          : null,

      tradeCount24h:
        trades,
    },

    observedAt:
      new Date()
        .toISOString(),
  };
}


function findTicker(
  tickerResult,
  pair,
) {
  const candidates = [
    pair?.productId,
    pair?.altname,
    pair?.symbol,
  ]
    .filter(Boolean)
    .map(String);

  for (
    const candidate
    of candidates
  ) {
    if (
      tickerResult?.[
        candidate
      ]
    ) {
      return tickerResult[
        candidate
      ];
    }
  }

  /*
   * Kraken sometimes returns canonical pair IDs
   * different from altname.
   *
   * Try normalized comparison.
   */

  const normalizedCandidates =
    new Set(
      candidates.map(
        value =>
          value
            .replace(
              /[^A-Z0-9]/gi,
              "",
            )
            .toUpperCase(),
      ),
    );

  for (
    const [
      key,
      ticker,
    ]
    of Object.entries(
      tickerResult ?? {},
    )
  ) {
    const normalizedKey =
      key
        .replace(
          /[^A-Z0-9]/gi,
          "",
        )
        .toUpperCase();

    if (
      normalizedCandidates.has(
        normalizedKey,
      )
    ) {
      return ticker;
    }
  }

  return null;
}


/**
 * Fetch measurements for the Kraken universe.
 *
 * Kraken supports multiple pairs in one Ticker request.
 * We batch them to keep URLs reasonably sized.
 */
export async function listKrakenMarkets({
  quoteCurrencies = [
    "USD",
    "USDT",
    "USDC",
    "EUR",
    "CAD",
  ],

  refresh = false,

  batchSize = 100,
} = {}) {
  if (
    !refresh &&
    Date.now() -
      marketCache.at <
      MARKET_CACHE_MS &&
    marketCache.rows.length > 0
  ) {
    return marketCache.rows;
  }

  const pairs =
    await getKrakenAssetPairs({
      quoteCurrencies,
      refresh,
    });

  const output = [];

  const safeBatchSize =
    Math.max(
      1,
      Math.min(
        100,
        Number(batchSize) ||
        100,
      ),
    );

  for (
    let index = 0;
    index < pairs.length;
    index += safeBatchSize
  ) {
    const batch =
      pairs.slice(
        index,
        index +
          safeBatchSize,
      );

    const pairIds =
      batch
        .map(
          pair =>
            pair.altname ??
            pair.productId,
        )
        .filter(Boolean);

    if (!pairIds.length) {
      continue;
    }

    try {
      const payload =
        await fetchJson(
          `/Ticker?pair=${encodeURIComponent(
            pairIds.join(","),
          )}`,
        );

      const tickerResult =
        payload?.result ?? {};

      for (
        const pair
        of batch
      ) {
        const ticker =
          findTicker(
            tickerResult,
            pair,
          );

        if (!ticker) {
          output.push({
            ...pair,

            priceUsd:
              null,

            price:
              null,

            volume24hUsd:
              null,

            quoteVolumeUsd:
              null,

            change24hPercent:
              null,

            marketDataAvailable:
              false,

            market:
              null,

            observedAt:
              new Date()
                .toISOString(),
          });

          continue;
        }

        output.push(
          attachTicker(
            pair,
            ticker,
          ),
        );
      }
    } catch (error) {
      console.error(
        "[KRAKEN_TICKER_BATCH_FAILED]",
        error instanceof Error
          ? error.message
          : String(error),
      );

      /*
       * Preserve metadata without inventing measurements.
       */
      for (
        const pair
        of batch
      ) {
        output.push({
          ...pair,

          priceUsd:
            null,

          price:
            null,

          volume24hUsd:
            null,

          quoteVolumeUsd:
            null,

          change24hPercent:
            null,

          marketDataAvailable:
            false,

          market:
            null,

          marketDataError:
            error instanceof Error
              ? error.message
              : String(error),

          observedAt:
            new Date()
              .toISOString(),
        });
      }
    }
  }

  const measured =
    output.filter(
      row =>
        row
          ?.marketDataAvailable ===
        true,
    ).length;

  console.log(
    `[KRAKEN] pairs=${pairs.length} measured=${measured} unavailable=${output.length - measured}`,
  );

  marketCache = {
    at:
      Date.now(),

    rows:
      output,
  };

  return output;
}


/**
 * ============================================================
 * BACKWARD-COMPATIBLE VENUE MAP
 * ============================================================
 */

export async function getKrakenVenueMap(
  options = {},
) {
  /*
   * Prefer measured rows so the venue resolver receives
   * actual market measurements.
   */
  const pairs =
    await listKrakenMarkets(
      options,
    );

  const map =
    new Map();

  for (
    const pair
    of pairs
  ) {
    const symbol =
      pair?.baseSymbol ??
      pair?.base;

    if (!symbol) {
      continue;
    }

    if (!map.has(symbol)) {
      map.set(
        symbol,
        [],
      );
    }

    map
      .get(symbol)
      .push(pair);
  }

  return map;
}


export default {
  getKrakenAssetPairs,
  listKrakenMarkets,
  getKrakenVenueMap,
  normalizeKrakenPair,
};