/**
 * AEMA Private Futures Research Bot
 *
 * Bybit V5 public linear-perpetual market-data provider.
 *
 * PURPOSE
 * -------
 * - Public market-data only.
 * - No API key required.
 * - Research / monitoring only.
 * - No execution authority.
 * - Missing numeric evidence remains null.
 *
 * RESILIENCE
 * ----------
 * - Supports an explicitly configured BYBIT_PUBLIC_BASE_URL.
 * - Otherwise tries official Bybit public API hosts.
 * - Retries transient failures.
 * - Does NOT fabricate market data.
 * - Does NOT bypass geographic or access restrictions.
 */


/* =========================================================
 * OFFICIAL PUBLIC API HOSTS
 * ========================================================= */

const CONFIGURED_BASE_URL =
  String(
    process.env.BYBIT_PUBLIC_BASE_URL || ""
  ).trim();


const DEFAULT_BASE_URLS = [
  "https://api.bybit.com",
  "https://api.bytick.com",
];


/*
 * If a base URL is explicitly configured, respect it.
 *
 * Otherwise use the known official public hosts.
 */
function getBaseUrls() {
  if (CONFIGURED_BASE_URL) {
    return [
      CONFIGURED_BASE_URL.replace(/\/+$/, ""),
    ];
  }

  return DEFAULT_BASE_URLS;
}


/* =========================================================
 * NUMERIC NORMALIZATION
 * ========================================================= */

function num(value) {
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


/* =========================================================
 * SMALL DELAY HELPER
 * ========================================================= */

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(resolve, ms)
  );
}


/* =========================================================
 * RESPONSE PREVIEW
 * ========================================================= */

async function responsePreview(response) {
  try {
    const text =
      await response.text();

    return String(text)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  } catch {
    return "";
  }
}


/* =========================================================
 * SINGLE-HOST REQUEST
 * ========================================================= */

async function requestHost(
  baseUrl,
  path,
  params,
  timeoutMs
) {
  const url =
    new URL(path, baseUrl);

  for (
    const [key, value]
    of Object.entries(params || {})
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    url.searchParams.set(
      key,
      String(value)
    );
  }


  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );


  try {
    const response =
      await fetch(url, {
        method: "GET",

        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "AEMA-Private-Futures-Research/1.0",
        },

        signal:
          controller.signal,
      });


    /*
     * Do not attempt to parse an HTML
     * 403/404/5xx response as Bybit JSON.
     */
    if (!response.ok) {
      const preview =
        await responsePreview(response);

      const error =
        new Error(
          `BYBIT_HTTP_${response.status}`
        );

      error.status =
        response.status;

      error.baseUrl =
        baseUrl;

      error.path =
        path;

      error.preview =
        preview;

      error.requestId =
        response.headers.get(
          "x-request-id"
        ) ||
        response.headers.get(
          "cf-ray"
        ) ||
        null;

      throw error;
    }


    let body;

    try {
      body =
        await response.json();
    } catch {
      const error =
        new Error(
          "BYBIT_INVALID_JSON_RESPONSE"
        );

      error.baseUrl =
        baseUrl;

      error.path =
        path;

      throw error;
    }


    /*
     * Bybit V5:
     * retCode === 0 means success.
     */
    if (
      Number(body?.retCode) !== 0
    ) {
      const error =
        new Error(
          `BYBIT_${
            body?.retCode ?? "UNKNOWN"
          }_${
            body?.retMsg || "ERROR"
          }`
        );

      error.retCode =
        body?.retCode ?? null;

      error.retMsg =
        body?.retMsg ?? null;

      error.baseUrl =
        baseUrl;

      error.path =
        path;

      throw error;
    }


    return (
      body?.result ?? {}
    );

  } catch (error) {

    if (
      error?.name ===
      "AbortError"
    ) {
      const timeoutError =
        new Error(
          `BYBIT_REQUEST_TIMEOUT:${path}`
        );

      timeoutError.baseUrl =
        baseUrl;

      timeoutError.path =
        path;

      throw timeoutError;
    }

    throw error;

  } finally {
    clearTimeout(timer);
  }
}


/* =========================================================
 * ERROR CLASSIFICATION
 * ========================================================= */

function shouldTryAnotherHost(error) {
  /*
   * Another official host can reasonably
   * be attempted for transport/CDN/server
   * failures.
   *
   * This is NOT an instruction to bypass
   * an explicit jurisdiction restriction.
   */

  if (
    error?.status === 403
  ) {
    return true;
  }

  if (
    error?.status === 408 ||
    error?.status === 425 ||
    error?.status === 429
  ) {
    return true;
  }

  if (
    Number(error?.status) >= 500
  ) {
    return true;
  }

  if (
    String(error?.message || "")
      .startsWith(
        "BYBIT_REQUEST_TIMEOUT"
      )
  ) {
    return true;
  }

  if (
    String(error?.message || "") ===
    "BYBIT_INVALID_JSON_RESPONSE"
  ) {
    return true;
  }

  return false;
}


/* =========================================================
 * PUBLIC BYBIT REQUEST
 * ========================================================= */

async function get(
  path,
  params = {},
  {
    timeoutMs = 12000,
    retries = 1,
  } = {}
) {
  const baseUrls =
    getBaseUrls();

  const failures = [];


  for (
    const baseUrl
    of baseUrls
  ) {
    for (
      let attempt = 0;
      attempt <= retries;
      attempt += 1
    ) {
      try {
        return await requestHost(
          baseUrl,
          path,
          params,
          timeoutMs
        );

      } catch (error) {

        failures.push({
          baseUrl,

          attempt:
            attempt + 1,

          status:
            error?.status ??
            null,

          message:
            error?.message ||
            "UNKNOWN_ERROR",

          preview:
            error?.preview ||
            "",

          requestId:
            error?.requestId ||
            null,
        });


        console.error(
          "[AEMA BYBIT REQUEST FAILED]",
          {
            baseUrl,
            endpoint:
              path,

            attempt:
              attempt + 1,

            status:
              error?.status ??
              null,

            message:
              error?.message ||
              "UNKNOWN_ERROR",

            responsePreview:
              error?.preview ||
              "",

            requestId:
              error?.requestId ||
              null,
          }
        );


        /*
         * Don't repeatedly hammer an endpoint
         * that returned a deterministic client
         * error.
         */
        if (
          !shouldTryAnotherHost(
            error
          )
        ) {
          throw error;
        }


        /*
         * Small retry delay for transient
         * failures.
         */
        if (
          attempt < retries
        ) {
          await sleep(
            300 *
            (attempt + 1)
          );
        }
      }
    }
  }


  /*
   * Every configured/official host failed.
   *
   * Preserve the original BYBIT_HTTP_xxx
   * style where possible so existing callers
   * continue to work.
   */
  const last =
    failures[
      failures.length - 1
    ];


  if (
    last?.status
  ) {
    throw new Error(
      `BYBIT_HTTP_${last.status}`
    );
  }


  throw new Error(
    last?.message ||
    "BYBIT_PUBLIC_MARKET_DATA_UNAVAILABLE"
  );
}


/* =========================================================
 * LINEAR PERPETUAL UNIVERSE
 * ========================================================= */

export async function listBybitLinearPerpetuals(
  options = {}
) {
  const instruments = [];

  let cursor = "";


  do {
    const result =
      await get(
        "/v5/market/instruments-info",
        {
          category:
            "linear",

          limit:
            1000,

          cursor,
        },
        options
      );


    if (
      Array.isArray(
        result?.list
      )
    ) {
      instruments.push(
        ...result.list
      );
    }


    cursor =
      result?.nextPageCursor ||
      "";

  } while (
    cursor &&
    instruments.length < 5000
  );


  /*
   * Current futures ticker evidence.
   */
  const tickerResult =
    await get(
      "/v5/market/tickers",
      {
        category:
          "linear",
      },
      options
    );


  const tickers =
    Array.isArray(
      tickerResult?.list
    )
      ? tickerResult.list
      : [];


  const tickerMap =
    new Map(
      tickers
        .filter(
          (ticker) =>
            Boolean(
              ticker?.symbol
            )
        )
        .map(
          (ticker) => [
            ticker.symbol,
            ticker,
          ]
        )
    );


  /*
   * Genuine active linear perpetuals only.
   *
   * Spot instruments must never be
   * relabelled as futures.
   */
  return instruments
    .filter(
      (instrument) =>
        String(
          instrument?.contractType ||
          ""
        ) ===
          "LinearPerpetual" &&

        String(
          instrument?.status ||
          ""
        ) ===
          "Trading" &&

        Boolean(
          instrument?.symbol
        )
    )
    .map(
      (instrument) => ({
        instrument,

        ticker:
          tickerMap.get(
            instrument.symbol
          ) ?? null,
      })
    );
}


/* =========================================================
 * SINGLE LINEAR FUTURES TICKER
 * ========================================================= */

export async function getBybitLinearTicker(
  symbol,
  options = {}
) {
  if (!symbol) {
    throw new Error(
      "BYBIT_SYMBOL_REQUIRED"
    );
  }


  const result =
    await get(
      "/v5/market/tickers",
      {
        category:
          "linear",

        symbol,
      },
      options
    );


  return Array.isArray(
    result?.list
  )
    ? (
        result.list[0] ??
        null
      )
    : null;
}


/* =========================================================
 * LINEAR FUTURES KLINES
 * ========================================================= */

export async function getBybitLinearKlines(
  symbol,
  {
    interval = "15",
    limit = 96,
    timeoutMs = 12000,
    retries = 1,
  } = {}
) {
  if (!symbol) {
    throw new Error(
      "BYBIT_SYMBOL_REQUIRED"
    );
  }


  const result =
    await get(
      "/v5/market/kline",
      {
        category:
          "linear",

        symbol,

        interval,

        limit,
      },
      {
        timeoutMs,
        retries,
      }
    );


  return Array.isArray(
    result?.list
  )
    ? result.list
    : [];
}


/* =========================================================
 * LINEAR FUTURES ORDER BOOK
 * ========================================================= */

export async function getBybitLinearOrderbook(
  symbol,
  {
    limit = 100,
    timeoutMs = 12000,
    retries = 1,
  } = {}
) {
  if (!symbol) {
    throw new Error(
      "BYBIT_SYMBOL_REQUIRED"
    );
  }


  return get(
    "/v5/market/orderbook",
    {
      category:
        "linear",

      symbol,

      limit,
    },
    {
      timeoutMs,
      retries,
    }
  );
}


/* =========================================================
 * OPEN INTEREST HISTORY
 * ========================================================= */

export async function getBybitOpenInterest(
  symbol,
  {
    intervalTime = "5min",
    limit = 2,
    timeoutMs = 12000,
    retries = 1,
  } = {}
) {
  if (!symbol) {
    throw new Error(
      "BYBIT_SYMBOL_REQUIRED"
    );
  }


  const result =
    await get(
      "/v5/market/open-interest",
      {
        category:
          "linear",

        symbol,

        intervalTime,

        limit,
      },
      {
        timeoutMs,
        retries,
      }
    );


  return Array.isArray(
    result?.list
  )
    ? result.list
    : [];
}


/* =========================================================
 * SHARED NORMALIZER
 * ========================================================= */

export {
  num,
};