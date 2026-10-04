/**
 * ============================================================
 * AEMA CRYPTO
 * COINLORE MARKET DATA PROVIDER
 * ============================================================
 *
 * PURPOSE
 * Free/keyless market-wide crypto data provider.
 *
 * Provides:
 * - global crypto market cap
 * - global 24h volume
 * - BTC / ETH dominance
 * - per-asset market cap
 * - price
 * - volume
 * - circulating / total / max supply
 * - 1h / 24h / 7d change
 *
 * DATA INTEGRITY
 * - Missing values remain null.
 * - Never converts missing values to zero.
 * - Never fabricates market cap.
 * - Research/data provider only.
 */

const BASE_URL =
  process.env.COINLORE_BASE_URL ||
  "https://api.coinlore.net";

const DEFAULT_TIMEOUT_MS =
  Number(process.env.COINLORE_TIMEOUT_MS) ||
  10000;

const DEFAULT_CACHE_MS =
  Number(process.env.COINLORE_CACHE_MS) ||
  5 * 60 * 1000;

let globalCache = null;
let globalCacheAt = 0;

const tickerCache = new Map();

function finiteOrNull(value) {
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

function text(value) {
  return String(value ?? "").trim();
}

function normalizeSymbol(value) {
  const symbol = text(value).toUpperCase();

  return symbol || null;
}

async function request(path) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    DEFAULT_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${BASE_URL}${path}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const body = await response
        .text()
        .catch(() => "");

      throw new Error(
        `CoinLore ${response.status}: ${
          body || response.statusText
        }`,
      );
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(
        `CoinLore request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * ============================================================
 * GLOBAL MARKET DATA
 * ============================================================
 */

export async function getCoinLoreGlobal({
  refresh = false,
} = {}) {
  const now = Date.now();

  if (
    refresh !== true &&
    globalCache &&
    now - globalCacheAt < DEFAULT_CACHE_MS
  ) {
    return globalCache;
  }

  const payload =
    await request("/api/global/");

  const raw =
    Array.isArray(payload)
      ? payload[0]
      : payload;

  if (!raw) {
    throw new Error(
      "CoinLore global response was empty",
    );
  }

  const normalized = {
    totalMarketCapUsd:
      finiteOrNull(raw.total_mcap),

    totalVolume24hUsd:
      finiteOrNull(raw.total_volume),

    btcDominancePercent:
      finiteOrNull(raw.btc_d),

    ethDominancePercent:
      finiteOrNull(raw.eth_d),

    marketCapChange24hPercent:
      finiteOrNull(raw.mcap_change),

    volumeChange24hPercent:
      finiteOrNull(raw.volume_change),

    coinsCount:
      finiteOrNull(raw.coins_count),

    activeMarkets:
      finiteOrNull(raw.active_markets),

    observedAt:
      new Date().toISOString(),

    source: "COINLORE",

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };

  globalCache = normalized;
  globalCacheAt = now;

  return normalized;
}

/**
 * ============================================================
 * TICKER NORMALIZATION
 * ============================================================
 */

export function normalizeCoinLoreTicker(
  row = {},
) {
  return {
    coinLoreId:
      row?.id != null
        ? String(row.id)
        : null,

    assetId:
      row?.nameid
        ? `coinlore:${row.nameid}`
        : row?.id != null
          ? `coinlore:${row.id}`
          : null,

    symbol:
      normalizeSymbol(row.symbol),

    name:
      text(row.name) || null,

    slug:
      text(row.nameid) || null,

    rank:
      finiteOrNull(row.rank),

    priceUsd:
      finiteOrNull(row.price_usd),

    marketCapUsd:
      finiteOrNull(row.market_cap_usd),

    volume24hUsd:
      finiteOrNull(row.volume24),

    change1hPercent:
      finiteOrNull(
        row.percent_change_1h,
      ),

    change24hPercent:
      finiteOrNull(
        row.percent_change_24h,
      ),

    change7dPercent:
      finiteOrNull(
        row.percent_change_7d,
      ),

    circulatingSupply:
      finiteOrNull(row.csupply),

    totalSupply:
      finiteOrNull(row.tsupply),

    maxSupply:
      finiteOrNull(row.msupply),

    priceBtc:
      finiteOrNull(row.price_btc),

    source: "COINLORE",

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

/**
 * ============================================================
 * MARKET TICKERS
 * ============================================================
 *
 * CoinLore allows max 100 rows per request.
 */

export async function getCoinLoreMarkets({
  limit = 1000,
  refresh = false,
} = {}) {
  const safeLimit = Math.max(
    1,
    Math.min(Number(limit) || 1000, 2000),
  );

  const cacheKey = safeLimit;
  const cached = tickerCache.get(cacheKey);

  if (
    refresh !== true &&
    cached &&
    Date.now() - cached.cachedAt <
      DEFAULT_CACHE_MS
  ) {
    return cached.data;
  }

  const rows = [];

  for (
    let start = 0;
    start < safeLimit;
    start += 100
  ) {
    const pageLimit = Math.min(
      100,
      safeLimit - start,
    );

    const payload = await request(
      `/api/tickers/?start=${start}&limit=${pageLimit}`,
    );

    const pageRows =
      Array.isArray(payload?.data)
        ? payload.data
        : [];

    if (pageRows.length === 0) {
      break;
    }

    rows.push(
      ...pageRows.map(
        normalizeCoinLoreTicker,
      ),
    );

    if (pageRows.length < pageLimit) {
      break;
    }

    // CoinLore recommends approximately 1 request/sec.
    if (
      start + pageLimit < safeLimit
    ) {
      await new Promise(resolve =>
        setTimeout(resolve, 1050),
      );
    }
  }

  const data = rows.filter(
    asset =>
      asset.symbol &&
      asset.priceUsd !== null,
  );

  tickerCache.set(cacheKey, {
    cachedAt: Date.now(),
    data,
  });

  return data;
}

/**
 * ============================================================
 * SYMBOL INDEX
 * ============================================================
 *
 * Useful for enriching Coinbase/Kraken assets without replacing
 * their venue identity.
 */

export function buildCoinLoreSymbolIndex(
  rows = [],
) {
  const index = new Map();

  for (const row of rows) {
    const symbol =
      normalizeSymbol(row?.symbol);

    if (!symbol) continue;

    const existing =
      index.get(symbol);

    /*
     * If duplicate symbols exist, prefer the
     * higher-ranked CoinLore asset.
     */
    if (!existing) {
      index.set(symbol, row);
      continue;
    }

    const existingRank =
      finiteOrNull(existing.rank) ??
      Number.MAX_SAFE_INTEGER;

    const candidateRank =
      finiteOrNull(row.rank) ??
      Number.MAX_SAFE_INTEGER;

    if (candidateRank < existingRank) {
      index.set(symbol, row);
    }
  }

  return index;
}

export function clearCoinLoreCache() {
  globalCache = null;
  globalCacheAt = 0;
  tickerCache.clear();
}

export default {
  getCoinLoreGlobal,
  getCoinLoreMarkets,
  normalizeCoinLoreTicker,
  buildCoinLoreSymbolIndex,
  clearCoinLoreCache,
};