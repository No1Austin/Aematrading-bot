/**
 * AEMA Private Futures Research Bot
 *
 * Public Bybit V5 linear-perpetual market-data provider.
 *
 * - No API key required.
 * - Public market-data endpoints only.
 * - Research / monitoring only.
 * - No execution authority.
 * - Missing numeric evidence remains null.
 */

const BASE_URL =
  process.env.BYBIT_PUBLIC_BASE_URL ||
  "https://api.bybit.com";

/*
 * ---------------------------------------------------------
 * NUMERIC NORMALIZATION
 * ---------------------------------------------------------
 *
 * IMPORTANT:
 * Number(null) === 0
 * Number("")   === 0
 *
 * We must not convert unavailable market evidence
 * into a fake zero.
 */
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

/*
 * ---------------------------------------------------------
 * INTERNAL PUBLIC BYBIT REQUEST
 * ---------------------------------------------------------
 */

async function get(
  path,
  params = {},
  { timeoutMs = 12000 } = {}
) {
  const url =
    new URL(path, BASE_URL);

  Object.entries(params).forEach(
    ([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }
    }
  );

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
        headers: {
          Accept:
            "application/json",

          "User-Agent":
            "AEMA-Private-Futures-Research/1.0",
        },

        signal:
          controller.signal,
      });

    if (!response.ok) {
      throw new Error(
        `BYBIT_HTTP_${response.status}`
      );
    }

    const body =
      await response.json();

    /*
     * Bybit V5 success code = 0.
     */
    if (
      Number(body?.retCode) !== 0
    ) {
      throw new Error(
        `BYBIT_${body?.retCode ?? "UNKNOWN"}_${
          body?.retMsg || "ERROR"
        }`
      );
    }

    return body?.result ?? {};
  } catch (error) {
    /*
     * Convert AbortError into a clearer provider error.
     */
    if (
      error?.name === "AbortError"
    ) {
      throw new Error(
        `BYBIT_REQUEST_TIMEOUT:${path}`
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/*
 * ---------------------------------------------------------
 * LINEAR PERPETUAL UNIVERSE
 * ---------------------------------------------------------
 */

export async function listBybitLinearPerpetuals(
  options = {}
) {
  const instruments = [];

  let cursor = "";

  /*
   * Bybit instruments-info is paginated.
   */
  do {
    const result =
      await get(
        "/v5/market/instruments-info",
        {
          category: "linear",
          limit: 1000,
          cursor,
        },
        options
      );

    if (
      Array.isArray(result?.list)
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
   * Fetch current futures ticker evidence.
   */
  const tickerResult =
    await get(
      "/v5/market/tickers",
      {
        category: "linear",
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
            ticker?.symbol
        )
        .map(
          (ticker) => [
            ticker.symbol,
            ticker,
          ]
        )
    );

  /*
   * Keep genuine active linear perpetuals only.
   *
   * Do NOT relabel spot instruments as futures.
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

        /*
         * Missing ticker remains null.
         * It is not replaced with fabricated values.
         */
        ticker:
          tickerMap.get(
            instrument.symbol
          ) ?? null,
      })
    );
}

/*
 * ---------------------------------------------------------
 * SINGLE LINEAR FUTURES TICKER
 * ---------------------------------------------------------
 */

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
        category: "linear",
        symbol,
      },
      options
    );

  return Array.isArray(
    result?.list
  )
    ? result.list[0] ?? null
    : null;
}

/*
 * ---------------------------------------------------------
 * LINEAR FUTURES KLINES
 * ---------------------------------------------------------
 */

export async function getBybitLinearKlines(
  symbol,
  {
    interval = "15",
    limit = 96,
    timeoutMs = 12000,
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
        category: "linear",
        symbol,
        interval,
        limit,
      },
      {
        timeoutMs,
      }
    );

  return Array.isArray(
    result?.list
  )
    ? result.list
    : [];
}

/*
 * ---------------------------------------------------------
 * LINEAR FUTURES ORDER BOOK
 * ---------------------------------------------------------
 */

export async function getBybitLinearOrderbook(
  symbol,
  {
    limit = 100,
    timeoutMs = 12000,
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
      category: "linear",
      symbol,
      limit,
    },
    {
      timeoutMs,
    }
  );
}

/*
 * ---------------------------------------------------------
 * OPEN-INTEREST HISTORY
 * ---------------------------------------------------------
 *
 * Useful later for:
 * - OI change
 * - price/OI relationship
 * - participation expansion/contraction
 * - monitoring
 *
 * Absolute OI alone should not determine direction.
 */
export async function getBybitOpenInterest(
  symbol,
  {
    intervalTime = "5min",
    limit = 2,
    timeoutMs = 12000,
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
        category: "linear",
        symbol,
        intervalTime,
        limit,
      },
      {
        timeoutMs,
      }
    );

  return Array.isArray(
    result?.list
  )
    ? result.list
    : [];
}

/*
 * Exported because some existing bot modules
 * use the same normalization helper.
 */
export {
  num,
};