/**
 * ============================================================
 * AEMA CRYPTO — DEX SCREENER PROVIDER
 * ============================================================
 *
 * Defensive DEX Screener research-data provider.
 *
 * PURPOSE
 * -------
 * - Search DEX pairs.
 * - Look up a specific pair.
 * - Look up all pairs for a token.
 * - Batch-enrich token addresses (max 30 addresses/request).
 * - Read latest/recent token profiles.
 * - Read latest/top paid boosts as metadata only.
 * - Normalize pair data into a stable AEMA research contract.
 *
 * DATA-INTEGRITY RULES
 * --------------------
 * - DEX Screener is an aggregator, not an execution venue.
 * - Unknown numeric values remain null. Never convert missing data to 0.
 * - FDV and market cap are separate fields and are never substituted.
 * - Paid boosts are metadata only and are NOT organic momentum.
 * - EVM addresses are lower-cased for identity matching.
 * - Non-EVM addresses (e.g. Solana) preserve case.
 * - Raw percentage changes are preserved; scoring engines should cap
 *   their contribution separately rather than altering market data.
 * - This provider has no execution authority.
 */

const BASE =
  String(
    process.env.DEXSCREENER_BASE_URL ??
      "https://api.dexscreener.com",
  ).replace(/\/+$/, "");

const DEFAULT_TIMEOUT_MS =
  positiveInteger(
    process.env.DEXSCREENER_TIMEOUT_MS,
    12_000,
  );

const DEFAULT_RETRIES =
  nonNegativeInteger(
    process.env.DEXSCREENER_RETRIES,
    2,
  );

const CACHE_TTL_MS =
  positiveInteger(
    process.env.DEXSCREENER_CACHE_TTL_MS,
    30_000,
  );

const MAX_CACHE_ENTRIES =
  positiveInteger(
    process.env.DEXSCREENER_MAX_CACHE_ENTRIES,
    500,
  );

const MAX_BATCH_TOKEN_ADDRESSES = 30;

/*
 * ============================================================
 * GENERIC HELPERS
 * ============================================================
 */

function positiveInteger(
  value,
  fallback,
) {
  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : fallback;
}

function nonNegativeInteger(
  value,
  fallback,
) {
  const parsed = Number(value);

  return Number.isInteger(parsed) &&
    parsed >= 0
    ? parsed
    : fallback;
}

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function integerOrNull(value) {
  const number = numberOrNull(value);

  return number !== null &&
    Number.isInteger(number)
    ? number
    : null;
}

function stringOrNull(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value).trim();

  return normalized
    ? normalized
    : null;
}

function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizeChainId(value) {
  const key =
    String(value ?? "")
      .trim()
      .toLowerCase();

  const aliases = {
    eth: "ethereum",
    ethereum: "ethereum",

    bnb: "bsc",
    bnbchain: "bsc",
    binance: "bsc",
    bsc: "bsc",

    arb: "arbitrum",
    arbitrumone: "arbitrum",
    arbitrum: "arbitrum",

    sol: "solana",
    solana: "solana",

    base: "base",

    polygon: "polygon",
    matic: "polygon",

    avalanche: "avalanche",
    avax: "avalanche",

    optimism: "optimism",
    op: "optimism",
  };

  return aliases[key] ?? key;
}

function isEvmAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(
    String(value ?? "").trim(),
  );
}

function normalizeAddress(
  value,
  chainId = null,
) {
  const address =
    String(value ?? "").trim();

  if (!address) {
    return null;
  }

  const chain =
    normalizeChainId(chainId);

  const evmChains =
    new Set([
      "ethereum",
      "bsc",
      "base",
      "arbitrum",
      "polygon",
      "avalanche",
      "optimism",
    ]);

  if (
    isEvmAddress(address) ||
    evmChains.has(chain)
  ) {
    return address.toLowerCase();
  }

  // Solana/base58 and other case-sensitive address formats
  // must not be lower-cased.
  return address;
}

function safeIsoFromEpochMs(value) {
  const milliseconds =
    numberOrNull(value);

  if (
    milliseconds === null ||
    milliseconds <= 0
  ) {
    return null;
  }

  const date =
    new Date(milliseconds);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms,
      ),
  );
}

function uniqueStrings(values) {
  return [
    ...new Set(
      (Array.isArray(values)
        ? values
        : [])
        .map(value =>
          String(value ?? "").trim(),
        )
        .filter(Boolean),
    ),
  ];
}

function chunkArray(
  values,
  size,
) {
  const chunks = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    chunks.push(
      values.slice(
        index,
        index + size,
      ),
    );
  }

  return chunks;
}

/*
 * ============================================================
 * CACHE
 * ============================================================
 */

const responseCache =
  new Map();

function readCache(key) {
  const item =
    responseCache.get(key);

  if (!item) {
    return null;
  }

  if (
    Date.now() >
    item.expiresAt
  ) {
    responseCache.delete(key);
    return null;
  }

  return item.value;
}

function writeCache(
  key,
  value,
  ttlMs = CACHE_TTL_MS,
) {
  if (
    responseCache.size >=
    MAX_CACHE_ENTRIES
  ) {
    const oldestKey =
      responseCache.keys().next()
        .value;

    if (oldestKey !== undefined) {
      responseCache.delete(
        oldestKey,
      );
    }
  }

  responseCache.set(
    key,
    {
      value,
      expiresAt:
        Date.now() +
        Math.max(
          1_000,
          Number(ttlMs) ||
            CACHE_TTL_MS,
        ),
    },
  );
}

export function clearDexScreenerCache() {
  responseCache.clear();
}

/*
 * ============================================================
 * HTTP
 * ============================================================
 */

function retryDelayMs(
  attempt,
  retryAfterHeader,
) {
  const retryAfter =
    Number(
      retryAfterHeader,
    );

  if (
    Number.isFinite(retryAfter) &&
    retryAfter > 0
  ) {
    return Math.min(
      retryAfter * 1000,
      30_000,
    );
  }

  return Math.min(
    500 *
      2 ** attempt,
    5_000,
  );
}

function shouldRetryStatus(status) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function fetchJson(
  url,
  {
    timeoutMs =
      DEFAULT_TIMEOUT_MS,

    retries =
      DEFAULT_RETRIES,

    cacheKey = null,

    cacheTtlMs =
      CACHE_TTL_MS,

    refresh = false,
  } = {},
) {
  const normalizedTimeout =
    positiveInteger(
      timeoutMs,
      DEFAULT_TIMEOUT_MS,
    );

  const normalizedRetries =
    nonNegativeInteger(
      retries,
      DEFAULT_RETRIES,
    );

  if (
    cacheKey &&
    !refresh
  ) {
    const cached =
      readCache(cacheKey);

    if (cached !== null) {
      return cached;
    }
  }

  let lastError = null;

  for (
    let attempt = 0;
    attempt <= normalizedRetries;
    attempt += 1
  ) {
    const controller =
      new AbortController();

    const timer =
      setTimeout(
        () =>
          controller.abort(),
        normalizedTimeout,
      );

    try {
      const response =
        await fetch(
          url,
          {
            method: "GET",

            headers: {
              accept:
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

        const error =
          new Error(
            `DEXSCREENER_HTTP_${response.status}:${body.slice(0, 300)}`,
          );

        error.status =
          response.status;

        lastError =
          error;

        if (
          attempt <
            normalizedRetries &&
          shouldRetryStatus(
            response.status,
          )
        ) {
          const delay =
            retryDelayMs(
              attempt,
              response.headers.get(
                "retry-after",
              ),
            );

          await sleep(delay);
          continue;
        }

        throw error;
      }

      const result =
        await response.json();

      if (cacheKey) {
        writeCache(
          cacheKey,
          result,
          cacheTtlMs,
        );
      }

      return result;
    } catch (error) {
      const normalizedError =
        error?.name ===
        "AbortError"
          ? new Error(
              `DEXSCREENER_TIMEOUT_${normalizedTimeout}MS`,
            )
          : error;

      lastError =
        normalizedError;

      const retryable =
        error?.name ===
          "AbortError" ||
        error instanceof TypeError;

      if (
        attempt <
          normalizedRetries &&
        retryable
      ) {
        await sleep(
          retryDelayMs(
            attempt,
            null,
          ),
        );

        continue;
      }

      throw normalizedError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw (
    lastError ??
    new Error(
      "DEXSCREENER_REQUEST_FAILED",
    )
  );
}

/*
 * ============================================================
 * RAW API METHODS
 * ============================================================
 */

export async function searchDexPairs(
  query,
  options = {},
) {
  const normalizedQuery =
    String(query ?? "").trim();

  if (!normalizedQuery) {
    return [];
  }

  const result =
    await fetchJson(
      `${BASE}/latest/dex/search?q=${encodeURIComponent(
        normalizedQuery,
      )}`,
      {
        ...options,
        cacheKey:
          options.cacheKey ??
          `search:${normalizedQuery.toLowerCase()}`,
      },
    );

  return Array.isArray(
    result?.pairs,
  )
    ? result.pairs
    : [];
}

export async function getDexPair(
  {
    chainId,
    pairAddress,
  } = {},
  options = {},
) {
  const chain =
    normalizeChainId(
      chainId,
    );

  const pair =
    normalizeAddress(
      pairAddress,
      chain,
    );

  if (
    !chain ||
    !pair
  ) {
    return null;
  }

  const result =
    await fetchJson(
      `${BASE}/latest/dex/pairs/${encodeURIComponent(
        chain,
      )}/${encodeURIComponent(
        pair,
      )}`,
      {
        ...options,
        cacheKey:
          options.cacheKey ??
          `pair:${chain}:${pair}`,
      },
    );

  const pairs =
    Array.isArray(
      result?.pairs,
    )
      ? result.pairs
      : [];

  return pairs[0] ?? null;
}

export async function getDexTokenPairs(
  {
    chainId,
    tokenAddress,
  } = {},
  options = {},
) {
  const chain =
    normalizeChainId(
      chainId,
    );

  const token =
    normalizeAddress(
      tokenAddress,
      chain,
    );

  if (
    !chain ||
    !token
  ) {
    return [];
  }

  const result =
    await fetchJson(
      `${BASE}/token-pairs/v1/${encodeURIComponent(
        chain,
      )}/${encodeURIComponent(
        token,
      )}`,
      {
        ...options,
        cacheKey:
          options.cacheKey ??
          `token-pairs:${chain}:${token}`,
      },
    );

  return Array.isArray(result)
    ? result
    : [];
}

/**
 * DEX Screener supports up to 30 token addresses in the
 * /tokens/v1/{chainId}/{tokenAddresses} request.
 *
 * This helper automatically chunks larger requests.
 */
export async function getDexTokens(
  {
    chainId,
    tokenAddresses = [],
  } = {},
  options = {},
) {
  const chain =
    normalizeChainId(
      chainId,
    );

  if (!chain) {
    return [];
  }

  const addresses =
    uniqueStrings(
      tokenAddresses,
    )
      .map(address =>
        normalizeAddress(
          address,
          chain,
        ),
      )
      .filter(Boolean);

  if (
    addresses.length === 0
  ) {
    return [];
  }

  const chunks =
    chunkArray(
      addresses,
      MAX_BATCH_TOKEN_ADDRESSES,
    );

  const pairs = [];

  // Sequential by default to avoid accidental provider bursts.
  for (
    const chunk
    of chunks
  ) {
    const joined =
      chunk.join(",");

    const result =
      await fetchJson(
        `${BASE}/tokens/v1/${encodeURIComponent(
          chain,
        )}/${joined
          .split(",")
          .map(encodeURIComponent)
          .join(",")}`,
        {
          ...options,
          cacheKey:
            `tokens:${chain}:${joined}`,
        },
      );

    if (
      Array.isArray(result)
    ) {
      pairs.push(
        ...result,
      );
    }
  }

  return pairs;
}

export async function getLatestTokenProfiles(
  options = {},
) {
  const result =
    await fetchJson(
      `${BASE}/token-profiles/latest/v1`,
      {
        ...options,
        cacheKey:
          options.cacheKey ??
          "token-profiles:latest",

        cacheTtlMs:
          options.cacheTtlMs ??
          60_000,
      },
    );

  return Array.isArray(result)
    ? result
    : [];
}

export async function getRecentTokenProfileUpdates(
  options = {},
) {
  const result =
    await fetchJson(
      `${BASE}/token-profiles/recent-updates/v1`,
      {
        ...options,
        cacheKey:
          options.cacheKey ??
          "token-profiles:recent",

        cacheTtlMs:
          options.cacheTtlMs ??
          60_000,
      },
    );

  return Array.isArray(result)
    ? result
    : [];
}

/**
 * IMPORTANT:
 * Boosts are paid promotional metadata.
 * They must not be interpreted as organic demand or momentum.
 */
export async function getLatestTokenBoosts(
  options = {},
) {
  const result =
    await fetchJson(
      `${BASE}/token-boosts/latest/v1`,
      {
        ...options,
        cacheKey:
          options.cacheKey ??
          "token-boosts:latest",

        cacheTtlMs:
          options.cacheTtlMs ??
          60_000,
      },
    );

  return Array.isArray(result)
    ? result
    : [];
}

export async function getTopTokenBoosts(
  options = {},
) {
  const result =
    await fetchJson(
      `${BASE}/token-boosts/top/v1`,
      {
        ...options,
        cacheKey:
          options.cacheKey ??
          "token-boosts:top",

        cacheTtlMs:
          options.cacheTtlMs ??
          60_000,
      },
    );

  return Array.isArray(result)
    ? result
    : [];
}

/*
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

function normalizeTransactions(
  pair,
  window,
) {
  const buys =
    integerOrNull(
      pair
        ?.txns
        ?.[window]
        ?.buys,
    );

  const sells =
    integerOrNull(
      pair
        ?.txns
        ?.[window]
        ?.sells,
    );

  return {
    buys,
    sells,

    transactions:
      buys !== null &&
      sells !== null
        ? buys + sells
        : null,
  };
}

function normalizeVolume(
  pair,
  window,
) {
  return numberOrNull(
    pair
      ?.volume
      ?.[window],
  );
}

function normalizePriceChange(
  pair,
  window,
) {
  return numberOrNull(
    pair
      ?.priceChange
      ?.[window],
  );
}

function normalizeWebsites(pair) {
  return (
    Array.isArray(
      pair?.info?.websites,
    )
      ? pair.info.websites
      : []
  )
    .map(item => ({
      url:
        stringOrNull(
          item?.url,
        ),
    }))
    .filter(item =>
      Boolean(item.url),
    );
}

function normalizeSocials(pair) {
  return (
    Array.isArray(
      pair?.info?.socials,
    )
      ? pair.info.socials
      : []
  )
    .map(item => ({
      platform:
        stringOrNull(
          item?.platform,
        ),

      handle:
        stringOrNull(
          item?.handle,
        ),
    }))
    .filter(item =>
      Boolean(
        item.platform ||
        item.handle,
      ),
    );
}

export function normalizeDexPair(
  pair,
) {
  if (
    !pair ||
    typeof pair !==
      "object"
  ) {
    return null;
  }

  const chainId =
    normalizeChainId(
      pair?.chainId,
    ) || null;

  const pairAddress =
    normalizeAddress(
      pair?.pairAddress,
      chainId,
    );

  const baseAddress =
    normalizeAddress(
      pair
        ?.baseToken
        ?.address,
      chainId,
    );

  const quoteAddress =
    normalizeAddress(
      pair
        ?.quoteToken
        ?.address,
      chainId,
    );

  const tx5m =
    normalizeTransactions(
      pair,
      "m5",
    );

  const tx1h =
    normalizeTransactions(
      pair,
      "h1",
    );

  const tx6h =
    normalizeTransactions(
      pair,
      "h6",
    );

  const tx24h =
    normalizeTransactions(
      pair,
      "h24",
    );

  const pairCreatedAt =
    numberOrNull(
      pair?.pairCreatedAt,
    );

  const marketCapUsd =
    numberOrNull(
      pair?.marketCap,
    );

  const fdvUsd =
    numberOrNull(
      pair?.fdv,
    );

  const liquidityUsd =
    numberOrNull(
      pair
        ?.liquidity
        ?.usd,
    );

  const boostActive =
    integerOrNull(
      pair
        ?.boosts
        ?.active,
    );

  return {
    source:
      "DEXSCREENER",

    provider:
      "DEXSCREENER",

    venueType:
      "DEX",

    exchange:
      String(
        pair?.dexId ??
        "DEX",
      )
        .trim()
        .toUpperCase(),

    dexId:
      stringOrNull(
        pair?.dexId,
      ),

    chainId,

    network:
      chainId,

    pairAddress,

    poolAddress:
      pairAddress,

    baseAddress,

    baseSymbol:
      normalizeSymbol(
        pair
          ?.baseToken
          ?.symbol,
      ),

    baseName:
      stringOrNull(
        pair
          ?.baseToken
          ?.name,
      ),

    quoteAddress,

    quoteSymbol:
      normalizeSymbol(
        pair
          ?.quoteToken
          ?.symbol,
      ),

    quoteName:
      stringOrNull(
        pair
          ?.quoteToken
          ?.name,
      ),

    priceNative:
      numberOrNull(
        pair?.priceNative,
      ),

    priceUsd:
      numberOrNull(
        pair?.priceUsd,
      ),

    liquidityUsd,

    reserveUsd:
      liquidityUsd,

    liquidityBase:
      numberOrNull(
        pair
          ?.liquidity
          ?.base,
      ),

    liquidityQuote:
      numberOrNull(
        pair
          ?.liquidity
          ?.quote,
      ),

    volume5mUsd:
      normalizeVolume(
        pair,
        "m5",
      ),

    volume1hUsd:
      normalizeVolume(
        pair,
        "h1",
      ),

    volume6hUsd:
      normalizeVolume(
        pair,
        "h6",
      ),

    volume24hUsd:
      normalizeVolume(
        pair,
        "h24",
      ),

    buys5m:
      tx5m.buys,

    sells5m:
      tx5m.sells,

    transactions5m:
      tx5m.transactions,

    buys1h:
      tx1h.buys,

    sells1h:
      tx1h.sells,

    transactions1h:
      tx1h.transactions,

    buys6h:
      tx6h.buys,

    sells6h:
      tx6h.sells,

    transactions6h:
      tx6h.transactions,

    buys24h:
      tx24h.buys,

    sells24h:
      tx24h.sells,

    transactions24h:
      tx24h.transactions,

    change5mPercent:
      normalizePriceChange(
        pair,
        "m5",
      ),

    change1hPercent:
      normalizePriceChange(
        pair,
        "h1",
      ),

    change6hPercent:
      normalizePriceChange(
        pair,
        "h6",
      ),

    change24hPercent:
      normalizePriceChange(
        pair,
        "h24",
      ),

    // Never substitute FDV for market cap.
    marketCapUsd,

    fdvUsd,

    pairCreatedAt,

    poolCreatedAt:
      safeIsoFromEpochMs(
        pairCreatedAt,
      ),

    url:
      stringOrNull(
        pair?.url,
      ),

    labels:
      Array.isArray(
        pair?.labels,
      )
        ? pair.labels
            .map(stringOrNull)
            .filter(Boolean)
        : [],

    imageUrl:
      stringOrNull(
        pair
          ?.info
          ?.imageUrl,
      ),

    websites:
      normalizeWebsites(
        pair,
      ),

    socials:
      normalizeSocials(
        pair,
      ),

    /*
     * Paid boost metadata.
     *
     * Do not use this field as organic bullish evidence.
     */
    boostActive,

    paidPromotion:
      boostActive !== null &&
      boostActive > 0,

    observedAt:
      new Date().toISOString(),

    researchOnly: true,

    executionAuthority:
      false,

    liveExecution:
      false,

    raw: pair,
  };
}

/*
 * ============================================================
 * NORMALIZED CONVENIENCE METHODS
 * ============================================================
 */

export async function searchNormalizedDexPairs(
  query,
  options = {},
) {
  const rows =
    await searchDexPairs(
      query,
      options,
    );

  return rows
    .map(
      normalizeDexPair,
    )
    .filter(Boolean);
}

export async function getNormalizedDexTokenPairs(
  {
    chainId,
    tokenAddress,
  } = {},
  options = {},
) {
  const rows =
    await getDexTokenPairs(
      {
        chainId,
        tokenAddress,
      },
      options,
    );

  return rows
    .map(
      normalizeDexPair,
    )
    .filter(Boolean);
}

export async function getNormalizedDexTokens(
  {
    chainId,
    tokenAddresses = [],
  } = {},
  options = {},
) {
  const rows =
    await getDexTokens(
      {
        chainId,
        tokenAddresses,
      },
      options,
    );

  return rows
    .map(
      normalizeDexPair,
    )
    .filter(Boolean);
}

/*
 * ============================================================
 * BEST-PAIR SELECTION
 * ============================================================
 */

/**
 * Chooses the most useful pair for research.
 *
 * This is NOT an investment score.
 * It only prioritizes measurable pool quality:
 * 1. liquidity
 * 2. 24h volume
 * 3. transaction count
 */
export function selectBestDexPair(
  pairs,
) {
  const normalized =
    (Array.isArray(pairs)
      ? pairs
      : [])
      .map(pair =>
        pair?.provider ===
          "DEXSCREENER" &&
        Object.prototype.hasOwnProperty.call(
          pair,
          "liquidityUsd",
        )
          ? pair
          : normalizeDexPair(
              pair,
            ),
      )
      .filter(Boolean);

  if (
    normalized.length === 0
  ) {
    return null;
  }

  return [
    ...normalized,
  ].sort(
    (a, b) => {
      const liquidityDifference =
        (b.liquidityUsd ?? -1) -
        (a.liquidityUsd ?? -1);

      if (
        liquidityDifference !== 0
      ) {
        return liquidityDifference;
      }

      const volumeDifference =
        (b.volume24hUsd ?? -1) -
        (a.volume24hUsd ?? -1);

      if (
        volumeDifference !== 0
      ) {
        return volumeDifference;
      }

      return (
        (b.transactions24h ?? -1) -
        (a.transactions24h ?? -1)
      );
    },
  )[0];
}

export default {
  searchDexPairs,
  searchNormalizedDexPairs,

  getDexPair,

  getDexTokenPairs,
  getNormalizedDexTokenPairs,

  getDexTokens,
  getNormalizedDexTokens,

  getLatestTokenProfiles,
  getRecentTokenProfileUpdates,

  getLatestTokenBoosts,
  getTopTokenBoosts,

  normalizeDexPair,
  selectBestDexPair,

  clearDexScreenerCache,
};
