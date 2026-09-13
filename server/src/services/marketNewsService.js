// server/src/services/marketNewsService.js

import {
  getMarketNews as getAlpacaMarketNews,
} from "../data/providers/alpacaMarketNewsProvider.js";

import {
  getMarketauxNews,
} from "../data/providers/marketauxNewsProvider.js";

/**
 * ============================================================
 * RESILIENT MARKET NEWS SERVICE
 * ============================================================
 *
 * Provider order:
 *
 * 1. Fresh in-memory cache
 * 2. Alpaca
 * 3. Marketaux
 * 4. Stale cache
 * 5. Safe unavailable response
 *
 * Also deduplicates identical concurrent requests so multiple
 * research subsystems do not hit external providers separately.
 */

const CACHE_TTL_MS =
  5 * 60 * 1000;

const STALE_CACHE_TTL_MS =
  60 * 60 * 1000;

const cache =
  new Map();

const inFlight =
  new Map();

function normalizeSymbols(
  symbols,
) {
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
  ).sort();
}

function positiveInteger(
  value,
  fallback = 20,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return Math.min(
    50,
    Math.floor(number),
  );
}

function buildCacheKey({
  symbols,
  limit,
  includeContent,
}) {
  return JSON.stringify({
    symbols:
      normalizeSymbols(symbols),

    limit:
      positiveInteger(
        limit,
      ),

    includeContent:
      includeContent ===
      true,
  });
}

function nowMs() {
  return Date.now();
}

function isFresh(
  entry,
) {
  return (
    entry &&
    nowMs() -
      entry.savedAtMs <=
      CACHE_TTL_MS
  );
}

function isUsableStale(
  entry,
) {
  return (
    entry &&
    nowMs() -
      entry.savedAtMs <=
      STALE_CACHE_TTL_MS
  );
}

function dedupeNews(
  news,
) {
  if (!Array.isArray(news)) {
    return [];
  }

  const seen =
    new Set();

  const output = [];

  for (const item of news) {
    if (
      !item ||
      typeof item !==
        "object"
    ) {
      continue;
    }

    const urlKey =
      String(
        item.url ??
        "",
      )
        .trim()
        .toLowerCase();

    const headlineKey =
      String(
        item.headline ??
        "",
      )
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          " ",
        );

    const key =
      urlKey ||
      headlineKey;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(item);
  }

  return output;
}

function cacheResult(
  key,
  result,
) {
  if (
    result
      ?.approved !==
      true ||
    !Array.isArray(
      result?.news,
    )
  ) {
    return;
  }

  cache.set(
    key,
    {
      savedAtMs:
        nowMs(),

      result: {
        ...result,

        news:
          dedupeNews(
            result.news,
          ),
      },
    },
  );
}

function fromCache(
  entry,
  {
    stale =
      false,
  } = {},
) {
  const result =
    entry?.result;

  if (!result) {
    return null;
  }

  return {
    ...result,

    service:
      "MARKET_NEWS",

    source:
      stale
        ? "STALE_CACHE"
        : "CACHE",

    status:
      stale
        ? "STALE_CACHE"
        : result.status,

    warnings: [
      ...(
        Array.isArray(
          result.warnings,
        )
          ? result.warnings
          : []
      ),

      ...(
        stale
          ? [
              "Using the last successful cached news because live providers are currently unavailable.",
            ]
          : []
      ),
    ],

    cache: {
      hit: true,

      stale,

      savedAt:
        new Date(
          entry.savedAtMs,
        ).toISOString(),

      ageMs:
        Math.max(
          0,
          nowMs() -
            entry.savedAtMs,
        ),
    },

    timestamp:
      new Date()
        .toISOString(),
  };
}

async function loadNews({
  symbols,
  limit,
  includeContent,
}) {
  const normalizedSymbols =
    normalizeSymbols(symbols);

  /**
   * ========================================================
   * PRIMARY — ALPACA
   * ========================================================
   */

  const alpaca =
    await getAlpacaMarketNews({
      symbols:
        normalizedSymbols,

      limit,

      includeContent,

      sort:
        "desc",

      maxRetries: 1,
    });

  if (
    alpaca?.approved ===
      true &&
    Array.isArray(
      alpaca.news,
    )
  ) {
    return {
      approved: true,

      service:
        "MARKET_NEWS",

      provider:
        alpaca.provider,

      source:
        "ALPACA",

      status:
        alpaca.status,

      news:
        dedupeNews(
          alpaca.news,
        ),

      count:
        alpaca.news.length,

      nextPageToken:
        alpaca
          ?.nextPageToken ??
        null,

      warnings:
        alpaca.warnings ??
        [],

      errors: [],

      providerAttempts: {
        alpaca: {
          attempted:
            true,

          approved:
            true,

          status:
            alpaca.status,

          httpStatus:
            alpaca
              ?.httpStatus ??
            null,
        },

        marketaux: {
          attempted:
            false,

          approved:
            null,

          status:
            "NOT_RUN",
        },
      },

      timestamp:
        new Date()
          .toISOString(),
    };
  }

  /**
   * ========================================================
   * SECONDARY — MARKETAUX
   * ========================================================
   *
   * Current plan cap = 3, therefore do not ask Marketaux for
   * the caller's full 20-item Alpaca limit.
   */

  const marketaux =
    await getMarketauxNews({
      symbols:
        normalizedSymbols,

      limit:
        Math.min(
          3,
          positiveInteger(
            limit,
            3,
          ),
        ),

      includeContent,

      sort:
        "desc",
    });

  if (
    marketaux
      ?.approved ===
      true &&
    Array.isArray(
      marketaux.news,
    )
  ) {
    const news =
      dedupeNews(
        marketaux.news,
      );

    return {
      approved: true,

      service:
        "MARKET_NEWS",

      provider:
        marketaux.provider,

      source:
        "MARKETAUX_FALLBACK",

      status:
        marketaux.status ===
        "PARTIAL"
          ? "PARTIAL"
          : "COMPLETE",

      news,

      count:
        news.length,

      nextPageToken:
        null,

      warnings: [
        "Alpaca market news was unavailable; Marketaux fallback was used.",
        ...(
          alpaca?.warnings ??
          []
        ),
        ...(
          marketaux?.warnings ??
          []
        ),
      ],

      errors: [],

      providerAttempts: {
        alpaca: {
          attempted:
            true,

          approved:
            false,

          status:
            alpaca
              ?.status ??
            "ERROR",

          httpStatus:
            alpaca
              ?.httpStatus ??
            null,

          retryAfter:
            alpaca
              ?.retryAfter ??
            null,

          errors:
            alpaca
              ?.errors ??
            [],
        },

        marketaux: {
          attempted:
            true,

          approved:
            true,

          status:
            marketaux.status,

          httpStatus:
            marketaux
              ?.httpStatus ??
            null,
        },
      },

      timestamp:
        new Date()
          .toISOString(),
    };
  }

  return {
    approved: false,

    service:
      "MARKET_NEWS",

    provider:
      null,

    source:
      "LIVE_PROVIDERS_FAILED",

    status:
      (
        alpaca?.status ===
          "RATE_LIMITED" ||
        marketaux?.status ===
          "RATE_LIMITED"
      )
        ? "RATE_LIMITED"
        : "ERROR",

    news: [],

    count: 0,

    nextPageToken:
      null,

    warnings: [
      ...(
        alpaca?.warnings ??
        []
      ),
      ...(
        marketaux?.warnings ??
        []
      ),
    ],

    errors: [
      ...(
        alpaca?.errors ??
        []
      ),
      ...(
        marketaux?.errors ??
        []
      ),
    ],

    providerAttempts: {
      alpaca: {
        attempted:
          true,

        approved:
          alpaca
            ?.approved ===
          true,

        status:
          alpaca
            ?.status ??
          "ERROR",

        httpStatus:
          alpaca
            ?.httpStatus ??
          null,

        retryAfter:
          alpaca
            ?.retryAfter ??
          null,
      },

      marketaux: {
        attempted:
          true,

        approved:
          marketaux
            ?.approved ===
          true,

        status:
          marketaux
            ?.status ??
          "ERROR",

        httpStatus:
          marketaux
            ?.httpStatus ??
          null,
      },
    },

    timestamp:
      new Date()
        .toISOString(),
  };
}

export async function getMarketNewsFeed({
  symbols = [],

  limit = 20,

  includeContent =
    false,

  bypassCache =
    false,
} = {}) {
  const normalizedSymbols =
    normalizeSymbols(symbols);

  const normalizedLimit =
    positiveInteger(
      limit,
      20,
    );

  const key =
    buildCacheKey({
      symbols:
        normalizedSymbols,

      limit:
        normalizedLimit,

      includeContent,
    });

  const cached =
    cache.get(key);

  if (
    !bypassCache &&
    isFresh(cached)
  ) {
    return fromCache(
      cached,
      {
        stale: false,
      },
    );
  }

  /**
   * Identical simultaneous requests share one Promise.
   */
  if (
    !bypassCache &&
    inFlight.has(key)
  ) {
    return inFlight.get(
      key,
    );
  }

  const requestPromise =
    (async () => {
      try {
        const result =
          await loadNews({
            symbols:
              normalizedSymbols,

            limit:
              normalizedLimit,

            includeContent,
          });

        if (
          result
            ?.approved ===
          true
        ) {
          cacheResult(
            key,
            result,
          );

          return {
            ...result,

            cache: {
              hit: false,
              stale: false,
            },
          };
        }

        /**
         * Live providers failed. Preserve service availability by
         * returning the last known good result when reasonably recent.
         */
        const stale =
          cache.get(key);

        if (
          isUsableStale(
            stale,
          )
        ) {
          return fromCache(
            stale,
            {
              stale: true,
            },
          );
        }

        return {
          ...result,

          cache: {
            hit: false,
            stale: false,
          },
        };
      } finally {
        inFlight.delete(
          key,
        );
      }
    })();

  inFlight.set(
    key,
    requestPromise,
  );

  return requestPromise;
}

/**
 * Test/debug helpers. They do not perform I/O.
 */
export function clearMarketNewsCache() {
  cache.clear();
  inFlight.clear();
}

export function getMarketNewsCacheStats() {
  return {
    cachedRequests:
      cache.size,

    inFlightRequests:
      inFlight.size,

    freshTtlMs:
      CACHE_TTL_MS,

    staleTtlMs:
      STALE_CACHE_TTL_MS,
  };
}

export default
  getMarketNewsFeed;
