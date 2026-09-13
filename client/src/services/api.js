// client/src/services/api.js

/**
 * ============================================================
 * CANONICAL FRONTEND API CLIENT
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * This is the single source of truth for frontend HTTP access.
 *
 * IMPORTANT
 * ---------
 *
 * - No fake market data.
 * - No fake engine scores.
 * - No trading decisions are created here.
 * - All scanner / market / analysis clients should delegate here.
 * - Both VITE_API_BASE_URL and legacy VITE_API_URL are supported.
 */

const RAW_API_BASE_URL =
  import.meta.env
    .VITE_API_BASE_URL ??
  import.meta.env
    .VITE_API_URL ??
  "http://localhost:8000";

export const API_BASE_URL =
  String(
    RAW_API_BASE_URL,
  )
    .trim()
    .replace(
      /\/+$/,
      "",
    );

/**
 * ============================================================
 * ERROR TYPE
 * ============================================================
 */

export class ApiError extends Error {
  constructor(
    message,
    {
      status = null,
      payload = null,
      endpoint = null,
      cause = null,
    } = {},
  ) {
    super(
      message,
      cause
        ? {
            cause,
          }
        : undefined,
    );

    this.name =
      "ApiError";

    this.status =
      status;

    this.payload =
      payload;

    this.endpoint =
      endpoint;
  }
}

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  value,
) {
  return String(
    value ??
    "",
  )
    .trim()
    .toUpperCase();
}

function normalizeLimit(
  value,
  fallback = 20,
  maximum = null,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  const normalized =
    Math.max(
      1,
      Math.floor(
        parsed,
      ),
    );

  return maximum ===
    null
    ? normalized
    : Math.min(
        maximum,
        normalized,
      );
}

function resolveLimitAndSignal(
  input,
  fallback = 20,
  maximum = null,
) {
  if (
    input &&
    typeof input ===
      "object" &&
    !Array.isArray(
      input,
    )
  ) {
    return {
      limit:
        normalizeLimit(
          input.limit,
          fallback,
          maximum,
        ),

      signal:
        input.signal ??
        null,
    };
  }

  return {
    limit:
      normalizeLimit(
        input,
        fallback,
        maximum,
      ),

    signal:
      null,
  };
}

function createUrl(
  path,
  params = null,
) {
  const url =
    new URL(
      `${API_BASE_URL}${path}`,
    );

  if (
    params &&
    typeof params ===
      "object"
  ) {
    for (
      const [
        key,
        value,
      ] of Object.entries(
        params,
      )
    ) {
      if (
        value ===
          undefined ||
        value ===
          null ||
        value ===
          ""
      ) {
        continue;
      }

      url.searchParams.set(
        key,
        String(
          value,
        ),
      );
    }
  }

  return url.toString();
}

async function parseJsonResponse(
  response,
) {
  const text =
    await response.text();

  let payload =
    null;

  if (
    text
  ) {
    try {
      payload =
        JSON.parse(
          text,
        );
    } catch (
      error
    ) {
      throw new ApiError(
        `Server returned non-JSON data (${response.status}).`,
        {
          status:
            response.status,

          endpoint:
            response.url,

          payload: {
            rawResponse:
              text,
          },

          cause:
            error,
        },
      );
    }
  }

  if (
    !response.ok
  ) {
    const message =
      payload
        ?.error ??
      payload
        ?.errors
        ?.[0] ??
      payload
        ?.message ??
      `Request failed with HTTP ${response.status}.`;

    throw new ApiError(
      message,
      {
        status:
          response.status,

        payload,

        endpoint:
          response.url,
      },
    );
  }

  return payload;
}

/**
 * ============================================================
 * CANONICAL REQUEST FUNCTION
 * ============================================================
 */

export async function apiFetch(
  path,
  {
    method = "GET",
    body = undefined,
    params = null,
    headers = {},
    signal = null,
    timeoutMs = 60_000,
  } = {},
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      Math.max(
        1,
        Number(
          timeoutMs,
        ) ||
          60_000,
      ),
    );

  let externalAbortHandler =
    null;

  if (
    signal
  ) {
    if (
      signal.aborted
    ) {
      controller.abort();
    } else {
      externalAbortHandler =
        () =>
          controller.abort();

      signal.addEventListener(
        "abort",
        externalAbortHandler,
        {
          once: true,
        },
      );
    }
  }

  const endpoint =
    createUrl(
      path,
      params,
    );

  try {
    const response =
      await fetch(
        endpoint,
        {
          method,

          headers: {
            Accept:
              "application/json",

            ...(
              body !==
              undefined
                ? {
                    "Content-Type":
                      "application/json",
                  }
                : {}
            ),

            ...headers,
          },

          ...(
            body !==
            undefined
              ? {
                  body:
                    typeof body ===
                    "string"
                      ? body
                      : JSON.stringify(
                          body,
                        ),
                }
              : {}
          ),

          signal:
            controller.signal,
        },
      );

    return await parseJsonResponse(
      response,
    );
  } catch (
    error
  ) {
    if (
      error instanceof
      ApiError
    ) {
      throw error;
    }

    if (
      error
        ?.name ===
      "AbortError"
    ) {
      throw new ApiError(
        `Request timed out or was cancelled: ${endpoint}`,
        {
          endpoint,

          cause:
            error,
        },
      );
    }

    if (
      error instanceof
      TypeError
    ) {
      throw new ApiError(
        `Unable to connect to the trading server at ${API_BASE_URL}.`,
        {
          endpoint,

          cause:
            error,
        },
      );
    }

    throw new ApiError(
      error
        ?.message ??
      "Unexpected API request failure.",
      {
        endpoint,

        cause:
          error,
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );

    if (
      signal &&
      externalAbortHandler
    ) {
      signal.removeEventListener(
        "abort",
        externalAbortHandler,
      );
    }
  }
}

/**
 * ============================================================
 * HEALTH / ANALYSIS
 * ============================================================
 */

export function getApiHealth(
  {
    signal = null,
  } = {},
) {
  return apiFetch(
    "/api/health",
    {
      signal,
      timeoutMs:
        15_000,
    },
  );
}

export function getAnalysisApiStatus(
  {
    signal = null,
  } = {},
) {
  return apiFetch(
    "/api/analysis/status",
    {
      signal,
      timeoutMs:
        15_000,
    },
  );
}

export async function analyzeStock(
  symbol,
  options = {},
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (
    !normalizedSymbol
  ) {
    throw new ApiError(
      "A stock symbol is required.",
    );
  }

  const payload = {
    symbol:
      normalizedSymbol,

    useLiveSocial:
      options
        ?.useLiveSocial ??
      true,
  };

  for (
    const key
    of [
      "minimumCandles",
      "providerTimeoutMs",
      "engineTimeoutMs",
      "runnerTimeoutMs",
    ]
  ) {
    if (
      options
        ?.[key] !==
      undefined
    ) {
      payload[key] =
        options[key];
    }
  }

  const result =
    await apiFetch(
      "/api/analysis/stock",
      {
        method:
          "POST",

        body:
          payload,

        signal:
          options
            ?.signal ??
          null,

        timeoutMs:
          Number(
            options
              ?.clientTimeoutMs ??
            70_000,
          ),
      },
    );

  /**
   * Frontend safety boundary:
   * analysis output is never itself permission to execute.
   */
  return {
    ...result,

    executionReady:
      false,
  };
}

/**
 * ============================================================
 * SCANNER
 * ============================================================
 */

export function getScannerSnapshot(
  input = 20,
) {
  const {
    limit,
    signal,
  } =
    resolveLimitAndSignal(
      input,
      20,
      100,
    );

  return apiFetch(
    "/api/scanner/snapshot",
    {
      params: {
        limit,
      },

      signal,

      timeoutMs:
        20_000,
    },
  );
}

export function getScannerStatus(
  {
    signal = null,
  } = {},
) {
  return apiFetch(
    "/api/scanner/status",
    {
      signal,
      timeoutMs:
        15_000,
    },
  );
}

export function getScannerCandidates(
  input = 20,
) {
  const {
    limit,
    signal,
  } =
    resolveLimitAndSignal(
      input,
      20,
      100,
    );

  return apiFetch(
    "/api/scanner/candidates",
    {
      params: {
        limit,
      },

      signal,

      timeoutMs:
        20_000,
    },
  );
}

export function getScannerQualified(
  input = 20,
) {
  const {
    limit,
    signal,
  } =
    resolveLimitAndSignal(
      input,
      20,
      100,
    );

  return apiFetch(
    "/api/scanner/qualified",
    {
      params: {
        limit,
      },

      signal,

      timeoutMs:
        20_000,
    },
  );
}

export function getScannerResearchProgress(
  {
    signal = null,
  } = {},
) {
  return apiFetch(
    "/api/scanner/research-progress",
    {
      signal,
      timeoutMs:
        20_000,
    },
  );
}

export function runScannerOnce(
  options = {},
) {
  return apiFetch(
    "/api/scanner/run-once",
    {
      method:
        "POST",

      body:
        options,

      signal:
        options
          ?.signal ??
        null,

      timeoutMs:
        Number(
          options
            ?.clientTimeoutMs ??
          90_000,
        ),
    },
  );
}

export function startScanner(
  options = {},
) {
  return apiFetch(
    "/api/scanner/start",
    {
      method:
        "POST",

      body:
        options,

      signal:
        options
          ?.signal ??
        null,

      timeoutMs:
        30_000,
    },
  );
}

export function stopScanner(
  options = {},
) {
  return apiFetch(
    "/api/scanner/stop",
    {
      method:
        "POST",

      body: {
        waitForCurrentCycle:
          options
            ?.waitForCurrentCycle ??
          true,
      },

      signal:
        options
          ?.signal ??
        null,

      timeoutMs:
        30_000,
    },
  );
}

/**
 * ============================================================
 * MARKET DATA
 * ============================================================
 */

export function getMarketOverview(
  input = 10,
) {
  const {
    limit,
    signal,
  } =
    resolveLimitAndSignal(
      input,
      10,
      50,
    );

  return apiFetch(
    "/api/markets/overview",
    {
      params: {
        limit,
      },

      signal,

      timeoutMs:
        20_000,
    },
  );
}

export function getMarketNews(
  input = {},
) {
  const options =
    typeof input ===
      "number"
      ? {
          limit:
            input,
        }
      : (
          input ??
          {}
        );

  const limit =
    normalizeLimit(
      options.limit,
      20,
      50,
    );

  const symbols =
    Array.isArray(
      options.symbols,
    )
      ? options.symbols
          .map(
            normalizeSymbol,
          )
          .filter(
            Boolean,
          )
          .join(
            ",",
          )
      : normalizeSymbol(
          options.symbols ??
          options.symbol ??
          "",
        );

  return apiFetch(
    "/api/markets/news",
    {
      params: {
        limit,

        symbols:
          symbols ||
          null,
      },

      signal:
        options.signal ??
        null,

      timeoutMs:
        20_000,
    },
  );
}

export function getStockNews(
  symbol,
  {
    limit = 10,
    signal = null,
  } = {},
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (
    !normalizedSymbol
  ) {
    throw new ApiError(
      "A stock symbol is required.",
    );
  }

  return getMarketNews({
    limit,
    symbols: [
      normalizedSymbol,
    ],
    signal,
  });
}

export function getStockCandles(
  symbol,
  {
    limit = 200,
    signal = null,
  } = {},
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (
    !normalizedSymbol
  ) {
    throw new ApiError(
      "A stock symbol is required.",
    );
  }

  return apiFetch(
    `/api/markets/${encodeURIComponent(
      normalizedSymbol,
    )}/candles`,
    {
      params: {
        limit:
          normalizeLimit(
            limit,
            200,
            5_000,
          ),
      },

      signal,

      timeoutMs:
        30_000,
    },
  );
}

/**
 * ============================================================
 * POSITIONS
 * ============================================================
 */

export function getPositions({
  accountId = null,
  signal = null,
} = {}) {
  return apiFetch(
    "/api/positions",
    {
      params: {
        accountId,
      },

      signal,

      timeoutMs:
        20_000,
    },
  );
}

export function getOpenPositions(
  options = {},
) {
  return getPositions(
    options,
  );
}

export function getPositionsStatus({
  accountId = null,
  signal = null,
} = {}) {
  return apiFetch(
    "/api/positions/status",
    {
      params: {
        accountId,
      },

      signal,

      timeoutMs:
        20_000,
    },
  );
}

export function getPositionById(
  positionId,
  {
    signal = null,
  } = {},
) {
  const normalizedId =
    String(
      positionId ??
      "",
    )
      .trim();

  if (
    !normalizedId
  ) {
    throw new ApiError(
      "A position ID is required.",
    );
  }

  return apiFetch(
    `/api/positions/${encodeURIComponent(
      normalizedId,
    )}`,
    {
      signal,
      timeoutMs:
        20_000,
    },
  );
}

/**
 * ============================================================
 * HISTORY
 * ============================================================
 */

export function getTradeHistory(
  input = 100,
) {
  const {
    limit,
    signal,
  } =
    resolveLimitAndSignal(
      input,
      100,
      1_000,
    );

  return apiFetch(
    "/api/history",
    {
      params: {
        limit,
      },

      signal,

      timeoutMs:
        20_000,
    },
  );
}

/**
 * ============================================================
 * COMPLETE SCANNER WORKSPACE LOAD
 * ============================================================
 */

export async function loadScannerWorkspace(
  symbol,
  {
    newsLimit = 8,
    candleLimit = 200,
    useLiveSocial = true,
    signal = null,
  } = {},
) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (
    !normalizedSymbol
  ) {
    throw new ApiError(
      "A stock symbol is required.",
    );
  }

  const analysis =
    await analyzeStock(
      normalizedSymbol,
      {
        useLiveSocial,
        signal,
      },
    );

  const [
    candlesResult,
    newsResult,
  ] =
    await Promise.allSettled([
      getStockCandles(
        normalizedSymbol,
        {
          limit:
            candleLimit,

          signal,
        },
      ),

      getStockNews(
        normalizedSymbol,
        {
          limit:
            newsLimit,

          signal,
        },
      ),
    ]);

  return {
    symbol:
      normalizedSymbol,

    analysis,

    candles:
      candlesResult.status ===
      "fulfilled"
        ? candlesResult.value
        : null,

    news:
      newsResult.status ===
      "fulfilled"
        ? newsResult.value
        : null,

    warnings: [
      ...(
        candlesResult.status ===
        "rejected"
          ? [
              `Chart data unavailable: ${
                candlesResult.reason
                  ?.message ??
                "Unknown error"
              }`,
            ]
          : []
      ),

      ...(
        newsResult.status ===
        "rejected"
          ? [
              `Stock news unavailable: ${
                newsResult.reason
                  ?.message ??
                "Unknown error"
              }`,
            ]
          : []
      ),
    ],

    executionReady:
      false,

    timestamp:
      new Date()
        .toISOString(),
  };
}


/**
 * ============================================================
 * LATEST COMPLETED STOCK ANALYSIS
 * ============================================================
 *
 * Dashboard/manual analysis writes one canonical completed result.
 * Engines reads the exact same result without rerunning analysis.
 */

const LATEST_ANALYSIS_STORAGE_KEY =
  "aema_latest_stock_analysis";

const LATEST_ANALYSIS_EVENT =
  "aema:latest-stock-analysis";

export function saveLatestStockAnalysis(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  const symbol = normalizeSymbol(
    result?.symbol ??
    result?.analysis?.symbol ??
    "",
  );

  const payload = {
    symbol: symbol || null,
    result,
    savedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      LATEST_ANALYSIS_STORAGE_KEY,
      JSON.stringify(payload),
    );

    window.dispatchEvent(
      new CustomEvent(LATEST_ANALYSIS_EVENT, {
        detail: payload,
      }),
    );

    return true;
  } catch (error) {
    console.warn(
      "Unable to persist latest stock analysis.",
      error,
    );
    return false;
  }
}

export function getLatestStockAnalysis() {
  try {
    const raw = window.localStorage.getItem(
      LATEST_ANALYSIS_STORAGE_KEY,
    );

    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return parsed && typeof parsed === "object" && parsed.result
      ? parsed
      : null;
  } catch (error) {
    console.warn(
      "Unable to read latest stock analysis.",
      error,
    );
    return null;
  }
}

export function subscribeLatestStockAnalysis(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const handleCustomEvent = (event) => {
    callback(event?.detail ?? getLatestStockAnalysis());
  };

  const handleStorageEvent = (event) => {
    if (event.key === LATEST_ANALYSIS_STORAGE_KEY) {
      callback(getLatestStockAnalysis());
    }
  };

  window.addEventListener(
    LATEST_ANALYSIS_EVENT,
    handleCustomEvent,
  );
  window.addEventListener(
    "storage",
    handleStorageEvent,
  );

  return () => {
    window.removeEventListener(
      LATEST_ANALYSIS_EVENT,
      handleCustomEvent,
    );
    window.removeEventListener(
      "storage",
      handleStorageEvent,
    );
  };
}

/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default {
  API_BASE_URL,
  ApiError,
  apiFetch,

  getApiHealth,
  getAnalysisApiStatus,
  analyzeStock,

  saveLatestStockAnalysis,
  getLatestStockAnalysis,
  subscribeLatestStockAnalysis,

  getScannerSnapshot,
  getScannerStatus,
  getScannerCandidates,
  getScannerQualified,
  getScannerResearchProgress,
  runScannerOnce,
  startScanner,
  stopScanner,

  getMarketOverview,
  getMarketNews,
  getStockNews,
  getStockCandles,

  getPositions,
  getOpenPositions,
  getPositionsStatus,
  getPositionById,

  getTradeHistory,

  loadScannerWorkspace,
};
