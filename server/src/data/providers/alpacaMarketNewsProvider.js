// server/src/data/providers/alpacaMarketNewsProvider.js

/**
 * ============================================================
 * ALPACA MARKET NEWS PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 * Fetch real stock/market news from Alpaca.
 *
 * Provider responsibilities:
 * - normalize Alpaca responses
 * - preserve HTTP/rate-limit metadata
 * - bounded retry for 429 / transient failures
 * - never throw provider failures into callers
 *
 * IMPORTANT:
 * - read-only
 * - does not authorize trades
 * - provider-specific only; failover lives in marketNewsService.js
 */

export const MARKET_NEWS_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    PARTIAL: "PARTIAL",
    RATE_LIMITED: "RATE_LIMITED",
    INVALID_REQUEST: "INVALID_REQUEST",
    ERROR: "ERROR",
  });

const DEFAULT_LIMIT = 20;
const MAXIMUM_LIMIT = 50;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 750;
const MAX_RETRY_DELAY_MS = 10_000;

function positiveInteger(
  value,
  fallback,
  maximum = MAXIMUM_LIMIT,
) {
  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(number),
    maximum,
  );
}

function safeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function normalizeSymbols(symbols) {
  if (!Array.isArray(symbols)) {
    return [];
  }

  return Array.from(
    new Set(
      symbols
        .map(value =>
          String(value ?? "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  );
}

function getCredentials() {
  const key =
    process.env.ALPACA_API_KEY;

  const secret =
    process.env.ALPACA_SECRET_KEY;

  if (!key || !secret) {
    throw new Error(
      "ALPACA_API_KEY and ALPACA_SECRET_KEY are required.",
    );
  }

  return { key, secret };
}

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms),
  );
}

function retryAfterToMs(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const seconds = Number(value);

  if (
    Number.isFinite(seconds) &&
    seconds >= 0
  ) {
    return Math.min(
      seconds * 1000,
      MAX_RETRY_DELAY_MS,
    );
  }

  const timestamp =
    new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return Math.min(
    Math.max(
      0,
      timestamp - Date.now(),
    ),
    MAX_RETRY_DELAY_MS,
  );
}

function normalizeArticle(article) {
  if (
    !article ||
    typeof article !== "object"
  ) {
    return null;
  }

  const headline =
    String(article.headline ?? "")
      .trim();

  if (!headline) {
    return null;
  }

  const symbols =
    Array.isArray(article.symbols)
      ? article.symbols
          .map(symbol =>
            String(symbol ?? "")
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean)
      : [];

  return {
    id:
      article.id ??
      null,

    headline,

    summary:
      article.summary ??
      null,

    author:
      article.author ??
      null,

    source:
      article.source ??
      null,

    symbols,

    createdAt:
      article.created_at ??
      null,

    updatedAt:
      article.updated_at ??
      null,

    url:
      article.url ??
      null,

    content:
      article.content ??
      null,

    provider:
      "ALPACA",

    sentiment:
      null,
  };
}

async function performRequest({
  url,
  key,
  secret,
}) {
  const response =
    await fetch(
      url,
      {
        method: "GET",

        headers: {
          "APCA-API-KEY-ID":
            key,

          "APCA-API-SECRET-KEY":
            secret,

          Accept:
            "application/json",
        },
      },
    );

  const text =
    await response.text();

  let payload = null;

  if (text) {
    try {
      payload =
        JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  return {
    response,
    payload,
    text,
  };
}

export async function getMarketNews({
  symbols = [],

  limit =
    DEFAULT_LIMIT,

  includeContent =
    false,

  sort =
    "desc",

  pageToken =
    null,

  maxRetries =
    DEFAULT_MAX_RETRIES,

  retryDelayMs =
    DEFAULT_RETRY_DELAY_MS,
} = {}) {
  const startedAt =
    new Date().toISOString();

  const normalizedSymbols =
    normalizeSymbols(symbols);

  const normalizedLimit =
    positiveInteger(
      limit,
      DEFAULT_LIMIT,
    );

  const normalizedMaxRetries =
    Math.max(
      0,
      Math.min(
        3,
        Number.isFinite(
          Number(maxRetries),
        )
          ? Math.floor(
              Number(maxRetries),
            )
          : DEFAULT_MAX_RETRIES,
      ),
    );

  try {
    const {
      key,
      secret,
    } =
      getCredentials();

    const url =
      new URL(
        "https://data.alpaca.markets/v1beta1/news",
      );

    url.searchParams.set(
      "limit",
      String(normalizedLimit),
    );

    url.searchParams.set(
      "sort",
      sort === "asc"
        ? "asc"
        : "desc",
    );

    url.searchParams.set(
      "include_content",
      includeContent
        ? "true"
        : "false",
    );

    if (
      normalizedSymbols.length >
      0
    ) {
      url.searchParams.set(
        "symbols",
        normalizedSymbols.join(","),
      );
    }

    if (pageToken) {
      url.searchParams.set(
        "page_token",
        String(pageToken),
      );
    }

    let attempt = 0;
    let lastHttpStatus = null;
    let lastRetryAfter = null;
    let lastMessage = null;

    while (
      attempt <=
      normalizedMaxRetries
    ) {
      const {
        response,
        payload,
        text,
      } =
        await performRequest({
          url,
          key,
          secret,
        });

      lastHttpStatus =
        response.status;

      lastRetryAfter =
        response.headers.get(
          "retry-after",
        );

      if (response.ok) {
        const rawNews =
          Array.isArray(
            payload?.news,
          )
            ? payload.news
            : [];

        const news =
          rawNews
            .map(normalizeArticle)
            .filter(Boolean);

        return {
          approved: true,

          provider:
            "ALPACA_MARKET_NEWS",

          status:
            MARKET_NEWS_STATUS.COMPLETE,

          symbols:
            normalizedSymbols,

          count:
            news.length,

          news,

          nextPageToken:
            payload
              ?.next_page_token ??
            null,

          httpStatus:
            response.status,

          retryAfter:
            null,

          attempts:
            attempt + 1,

          warnings: [],

          errors: [],

          startedAt,

          completedAt:
            new Date().toISOString(),
        };
      }

      lastMessage =
        payload?.message ??
        payload?.error ??
        (
          text
            ? String(text).slice(
                0,
                500,
              )
            : null
        ) ??
        `Alpaca news request failed with HTTP ${response.status}.`;

      const retryable =
        response.status === 429 ||
        response.status === 408 ||
        response.status >= 500;

      if (
        !retryable ||
        attempt >=
          normalizedMaxRetries
      ) {
        break;
      }

      const retryAfterMs =
        retryAfterToMs(
          lastRetryAfter,
        );

      const backoffMs =
        retryAfterMs ??
        Math.min(
          MAX_RETRY_DELAY_MS,
          Math.max(
            100,
            Number(retryDelayMs) ||
              DEFAULT_RETRY_DELAY_MS,
          ) *
            2 ** attempt,
        );

      await sleep(backoffMs);

      attempt += 1;
    }

    const rateLimited =
      lastHttpStatus ===
      429;

    return {
      approved: false,

      provider:
        "ALPACA_MARKET_NEWS",

      status:
        rateLimited
          ? MARKET_NEWS_STATUS
              .RATE_LIMITED
          : MARKET_NEWS_STATUS
              .ERROR,

      symbols:
        normalizedSymbols,

      count: 0,

      news: [],

      nextPageToken:
        null,

      httpStatus:
        lastHttpStatus,

      retryAfter:
        lastRetryAfter,

      attempts:
        attempt + 1,

      warnings:
        rateLimited
          ? [
              "Alpaca market news is temporarily rate-limited.",
            ]
          : [],

      errors: [
        lastMessage ??
          "Alpaca market news request failed.",
      ],

      startedAt,

      completedAt:
        new Date().toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "ALPACA_MARKET_NEWS",

      status:
        MARKET_NEWS_STATUS.ERROR,

      symbols:
        normalizedSymbols,

      count: 0,

      news: [],

      nextPageToken:
        null,

      httpStatus:
        null,

      retryAfter:
        null,

      attempts: 0,

      warnings: [],

      errors: [
        safeErrorMessage(error),
      ],

      startedAt,

      completedAt:
        new Date().toISOString(),
    };
  }
}

export default
  getMarketNews;
