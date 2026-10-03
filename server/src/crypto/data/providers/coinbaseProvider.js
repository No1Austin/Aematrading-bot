/**
 * ============================================================
 * AEMA CRYPTO — COINBASE PUBLIC MARKET DATA PROVIDER
 * ============================================================
 *
 * ROLE
 * ----
 * Coinbase is:
 *
 * 1. A broad SPOT instrument-discovery source.
 * 2. A targeted single-asset market-data source.
 *
 * IMPORTANT:
 * Broad universe discovery DOES NOT fetch ticker + stats
 * for every Coinbase product.
 *
 * Kraken supplies bulk CEX market measurements.
 *
 * Coinbase ticker/stats remain available for:
 * - Scanner
 * - Research
 * - Single-token lookup
 * - Targeted enrichment
 *
 * SPOT DATA ONLY.
 * RESEARCH ONLY.
 * NO EXECUTION AUTHORITY.
 */

const BASE =
  process.env
    .COINBASE_EXCHANGE_BASE_URL ||
  "https://api.exchange.coinbase.com";


const PRODUCT_CACHE_MS =
  Number(
    process.env
      .AEMA_COINBASE_PRODUCT_CACHE_MS,
  ) ||
  5 * 60 * 1000;


const SINGLE_MARKET_CACHE_MS =
  Number(
    process.env
      .AEMA_COINBASE_MARKET_CACHE_MS,
  ) ||
  30 * 1000;


/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function num(value) {
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


function parts(id) {
  return String(
    id ?? "",
  )
    .toUpperCase()
    .split("-");
}


/**
 * ============================================================
 * HTTP
 * ============================================================
 */

async function getJson(
  path,
  {
    timeoutMs = 12_000,
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
        `${BASE}${path}`,
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
          .catch(
            () => "",
          );

      throw new Error(
        `COINBASE_HTTP_${response.status}:${path}:${body.slice(0, 200)}`,
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}


/**
 * ============================================================
 * PRODUCT CACHE
 * ============================================================
 */

let productCache = {
  at: 0,
  rows: [],
};


async function getProducts(
  options = {},
) {
  const refresh =
    options?.refresh === true;

  if (
    !refresh &&
    Date.now() -
      productCache.at <
      PRODUCT_CACHE_MS &&
    productCache.rows.length > 0
  ) {
    return productCache.rows;
  }

  const rows =
    await getJson(
      "/products",
      options,
    );

  if (!Array.isArray(rows)) {
    throw new Error(
      "COINBASE_PRODUCTS_INVALID_RESPONSE",
    );
  }

  productCache = {
    at:
      Date.now(),

    rows,
  };

  return rows;
}


/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

export function normalizeCoinbaseProduct(
  product = {},
) {
  const [
    baseFromId,
    quoteFromId,
  ] =
    parts(
      product.id ??
      product.product_id,
    );

  const base =
    String(
      product
        ?.base_currency ??
      product
        ?.base_currency_id ??
      baseFromId ??
      "",
    )
      .toUpperCase();

  const quote =
    String(
      product
        ?.quote_currency ??
      product
        ?.quote_currency_id ??
      quoteFromId ??
      "",
    )
      .toUpperCase();


  const ticker =
    product?._ticker ??
    null;

  const stats =
    product?._stats ??
    null;


  const price =
    num(
      ticker?.price ??
      product?.price,
    );


  const bid =
    num(
      ticker?.bid ??
      product?.best_bid,
    );


  const ask =
    num(
      ticker?.ask ??
      product?.best_ask,
    );


  const baseVolume =
    num(
      stats?.volume ??
      ticker?.volume ??
      product?.volume_24h,
    );


  const open =
    num(
      stats?.open ??
      product?.open_24h,
    );


  const high =
    num(
      stats?.high ??
      product?.high_24h,
    );


  const low =
    num(
      stats?.low ??
      product?.low_24h,
    );


  const quoteVolume =
    price !== null &&
    baseVolume !== null
      ? price *
        baseVolume
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


  const marketDataAvailable =
    Boolean(
      product
        ?._marketDataAvailable ??
      (
        ticker &&
        stats
      ),
    );


  return {
    /*
     * Venue resolver compatibility
     */

    exchange:
      "COINBASE",

    venue:
      "COINBASE",

    venueType:
      "CEX",

    base,

    quote,


    /*
     * Existing bot compatibility
     */

    symbol:
      product.id ??
      product.product_id ??
      (
        base &&
        quote
          ? `${base}-${quote}`
          : null
      ),

    productId:
      product.id ??
      product.product_id ??
      null,

    baseAsset:
      base,

    baseSymbol:
      base,

    quoteAsset:
      quote,

    quoteSymbol:
      quote,


    status:
      (
        String(
          product.status ??
          "",
        ).toLowerCase() ===
          "online" ||
        !product.status
      )
        ? "TRADING"
        : String(
            product.status,
          ).toUpperCase(),


    tradable:
      (
        !product.status ||
        String(
          product.status,
        ).toLowerCase() ===
          "online"
      ),


    contractType:
      "SPOT",

    instrumentType:
      "SPOT",

    marginAsset:
      null,

    pricePrecision:
      null,

    quantityPrecision:
      null,


    /*
     * Market measurements.
     *
     * Metadata-only products intentionally contain null.
     */

    priceUsd:
      price,

    price,

    volume24hUsd:
      quoteVolume,

    quoteVolumeUsd:
      quoteVolume,

    change24hPercent:
      change,


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
        null,
    },


    marketDataAvailable,

    marketDataError:
      product
        ?._marketDataError ??
      null,

    source:
      "COINBASE_EXCHANGE_PUBLIC",

    observedAt:
      new Date()
        .toISOString(),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}


/**
 * ============================================================
 * BROAD PRODUCT DISCOVERY
 * ============================================================
 *
 * CRITICAL:
 *
 * This function performs ONE Coinbase /products request.
 *
 * It DOES NOT request ticker/stats for every product.
 */

export async function listCoinbaseProducts(
  options = {},
) {
  const rows =
    await getProducts(
      options,
    );

  const eligible =
    rows
      .filter(
        product =>
          (
            !product?.status ||
            String(
              product.status,
            ).toLowerCase() ===
              "online"
          ),
      )
      .filter(
        product =>
          [
            "USD",
            "USDC",
            "USDT",
          ].includes(
            String(
              product
                ?.quote_currency ??
              "",
            ).toUpperCase(),
          ),
      )
      .map(
        product =>
          normalizeCoinbaseProduct({
            ...product,

            _marketDataAvailable:
              false,
          }),
      );


  console.log(
    `[COINBASE] products=${eligible.length} mode=METADATA_ONLY`,
  );


  return eligible;
}


/**
 * ============================================================
 * PRODUCT RESOLUTION
 * ============================================================
 */

export async function resolveCoinbaseProductId(
  symbol,
  options = {},
) {
  const raw =
    String(
      symbol ?? "",
    )
      .trim()
      .toUpperCase();


  if (!raw) {
    throw new Error(
      "COINBASE_PRODUCT_REQUIRED",
    );
  }


  const products =
    await getProducts(
      options,
    );


  /*
   * Exact product ID.
   */

  if (raw.includes("-")) {
    const exact =
      products.find(
        item =>
          String(
            item?.id ?? "",
          ).toUpperCase() ===
            raw &&
          (
            !item?.status ||
            String(
              item.status,
            ).toLowerCase() ===
              "online"
          ),
      );

    if (exact) {
      return exact.id;
    }
  }


  /*
   * Prefer USD before stablecoin pairs.
   */

  const preferred = [
    "USD",
    "USDC",
    "USDT",
  ];


  for (
    const quote
    of preferred
  ) {
    let base =
      raw;

    if (
      raw.endsWith(
        quote,
      ) &&
      raw.length >
        quote.length
    ) {
      base =
        raw.slice(
          0,
          -quote.length,
        );
    }

    const id =
      `${base}-${quote}`;

    const hit =
      products.find(
        item =>
          String(
            item?.id ?? "",
          ).toUpperCase() ===
            id &&
          (
            !item?.status ||
            String(
              item.status,
            ).toLowerCase() ===
              "online"
          ),
      );

    if (hit) {
      return hit.id;
    }
  }


  /*
   * Compact symbol fallback.
   */

  const compact =
    raw.replace(
      /[^A-Z0-9]/g,
      "",
    );


  const hit =
    products.find(
      item =>
        String(
          item?.id ?? "",
        )
          .replace(
            /[^A-Z0-9]/gi,
            "",
          )
          .toUpperCase() ===
          compact &&
        (
          !item?.status ||
          String(
            item.status,
          ).toLowerCase() ===
            "online"
        ),
    );


  if (hit) {
    return hit.id;
  }


  throw new Error(
    `COINBASE_PRODUCT_NOT_FOUND:${raw}`,
  );
}


/**
 * ============================================================
 * TARGETED MARKET CACHE
 * ============================================================
 */

const singleMarketCache =
  new Map();


function getCachedMarket(id) {
  const cached =
    singleMarketCache.get(id);

  if (!cached) {
    return null;
  }

  if (
    Date.now() -
      cached.at >=
      SINGLE_MARKET_CACHE_MS
  ) {
    singleMarketCache.delete(id);

    return null;
  }

  return cached.value;
}


function setCachedMarket(
  id,
  value,
) {
  singleMarketCache.set(
    id,
    {
      at:
        Date.now(),

      value,
    },
  );

  /*
   * Prevent unlimited cache growth.
   */

  if (
    singleMarketCache.size >
    500
  ) {
    const firstKey =
      singleMarketCache
        .keys()
        .next()
        .value;

    if (firstKey) {
      singleMarketCache.delete(
        firstKey,
      );
    }
  }
}


/**
 * ============================================================
 * SINGLE PRODUCT MARKET DATA
 * ============================================================
 */

export async function getCoinbaseProduct(
  productId,
  options = {},
) {
  const id =
    await resolveCoinbaseProductId(
      productId,
      options,
    );


  if (
    options?.refresh !== true
  ) {
    const cached =
      getCachedMarket(id);

    if (cached) {
      return cached;
    }
  }


  const [
    ticker,
    stats,
  ] =
    await Promise.all([
      getJson(
        `/products/${encodeURIComponent(
          id,
        )}/ticker`,
        options,
      ),

      getJson(
        `/products/${encodeURIComponent(
          id,
        )}/stats`,
        options,
      ),
    ]);


  const normalized =
    normalizeCoinbaseProduct({
      id,

      product_id:
        id,

      _ticker:
        ticker,

      _stats:
        stats,

      _marketDataAvailable:
        true,
    });


  const result = {
    product: {
      id,

      product_id:
        id,

      price:
        ticker?.price,

      best_bid:
        ticker?.bid,

      best_ask:
        ticker?.ask,

      volume_24h:
        stats?.volume,

      high_24h:
        stats?.high,

      low_24h:
        stats?.low,

      open_24h:
        stats?.open,
    },

    ticker,

    stats,

    normalized,
  };


  setCachedMarket(
    id,
    result,
  );


  return result;
}


/**
 * ============================================================
 * TARGETED ENRICHMENT
 * ============================================================
 *
 * Used when Discovery/Research has already shortlisted assets.
 *
 * DO NOT call this for all 426 products.
 */

export async function enrichCoinbaseProducts(
  symbols = [],
  {
    concurrency = 2,
    ...options
  } = {},
) {
  const unique =
    [
      ...new Set(
        (
          Array.isArray(symbols)
            ? symbols
            : []
        )
          .map(
            value =>
              String(
                value ?? "",
              )
                .trim()
                .toUpperCase(),
          )
          .filter(Boolean),
      ),
    ];


  const output =
    new Array(
      unique.length,
    );


  let cursor = 0;


  const workerCount =
    Math.max(
      1,
      Math.min(
        3,
        Number(concurrency) ||
        2,
      ),
    );


  async function worker() {
    while (
      cursor <
      unique.length
    ) {
      const index =
        cursor++;

      const symbol =
        unique[index];

      try {
        const result =
          await getCoinbaseProduct(
            symbol,
            options,
          );

        output[index] =
          result?.normalized ??
          null;
      } catch (error) {
        output[index] = {
          symbol,

          exchange:
            "COINBASE",

          venue:
            "COINBASE",

          venueType:
            "CEX",

          marketDataAvailable:
            false,

          marketDataError:
            error instanceof Error
              ? error.message
              : String(error),

          executionAuthority:
            false,

          liveExecution:
            false,
        };
      }
    }
  }


  await Promise.all(
    Array.from(
      {
        length:
          workerCount,
      },
      () =>
        worker(),
    ),
  );


  return output.filter(Boolean);
}


/**
 * ============================================================
 * ORDER BOOK
 * ============================================================
 */

export async function getCoinbaseProductBook(
  productId,
  {
    level = 2,
    ...options
  } = {},
) {
  const id =
    await resolveCoinbaseProductId(
      productId,
      options,
    );

  return getJson(
    `/products/${encodeURIComponent(
      id,
    )}/book?level=${level}`,
    options,
  );
}


/**
 * ============================================================
 * CANDLES
 * ============================================================
 */

const granularity = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "6h": 21600,
  "1d": 86400,
};


export async function getCoinbaseCandles(
  productId,
  {
    interval = "5m",
    limit = 100,
    ...options
  } = {},
) {
  const id =
    await resolveCoinbaseProductId(
      productId,
      options,
    );


  const g =
    granularity[
      interval
    ] ||
    300;


  const end =
    Math.floor(
      Date.now() /
      1000,
    );


  const requested =
    Math.min(
      300,
      Math.max(
        2,
        Number(limit) ||
        100,
      ),
    );


  const start =
    end -
    requested *
      g;


  const rows =
    await getJson(
      `/products/${encodeURIComponent(
        id,
      )}/candles?granularity=${g}&start=${new Date(
        start * 1000,
      ).toISOString()}&end=${new Date(
        end * 1000,
      ).toISOString()}`,
      options,
    );


  return (
    Array.isArray(rows)
      ? rows
      : []
  )
    .slice(
      0,
      limit,
    )
    .map(
      row => ({
        start:
          row[0],

        low:
          row[1],

        high:
          row[2],

        open:
          row[3],

        close:
          row[4],

        volume:
          row[5],
      }),
    );
}


/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default {
  listCoinbaseProducts,
  normalizeCoinbaseProduct,
  resolveCoinbaseProductId,
  getCoinbaseProduct,
  enrichCoinbaseProducts,
  getCoinbaseProductBook,
  getCoinbaseCandles,
};