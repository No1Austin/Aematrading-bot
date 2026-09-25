const CG_PUBLIC = "https://api.coingecko.com/api/v3";
const CG_PRO = "https://pro-api.coingecko.com/api/v3";
const LLAMA = "https://api.llama.fi";

let cache = {
  value: null,
  expiresAt: 0,
  promise: null,
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const txt = (v) => String(v ?? "").trim();
const norm = (v) => txt(v).toLowerCase();
const compact = (v) => norm(v).replace(/[^a-z0-9]/g, "");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function cgConfig() {
  const pro = txt(process.env.COINGECKO_PRO_API_KEY);
  const demo = txt(process.env.COINGECKO_API_KEY);

  const headers = { accept: "application/json" };

  if (pro) headers["x-cg-pro-api-key"] = pro;
  else if (demo) headers["x-cg-demo-api-key"] = demo;

  return {
    base: pro ? CG_PRO : CG_PUBLIC,
    headers,
    tier: pro ? "PRO" : demo ? "DEMO" : "PUBLIC",
  };
}

function retryAfterMs(response) {
  const raw = response?.headers?.get?.("retry-after");
  if (!raw) return null;

  const seconds = Number(raw);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(raw);

  return Number.isFinite(date)
    ? Math.max(0, date - Date.now())
    : null;
}

async function fetchJsonWithRetry(
  url,
  options = {},
  {
    retries = envNumber("CRYPTO_PROVIDER_RETRIES", 3),
    baseBackoffMs = envNumber("CRYPTO_PROVIDER_BACKOFF_MS", 1500),
    timeoutMs = envNumber("CRYPTO_PROVIDER_TIMEOUT_MS", 15000),
    provider = "UNKNOWN",
  } = {},
) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (response.ok) {
        return await response.json();
      }

      const status = response.status;

      const retryable =
        status === 408 ||
        status === 425 ||
        status === 429 ||
        (status >= 500 && status <= 599);

      const error = new Error(`HTTP ${status} ${url}`);
      error.status = status;
      error.provider = provider;
      error.retryable = retryable;

      if (!retryable || attempt >= retries) {
        throw error;
      }

      const waitMs = Math.max(
        retryAfterMs(response) ?? 0,
        baseBackoffMs * (2 ** attempt) + Math.floor(Math.random() * 350),
      );

      await sleep(waitMs);
      lastError = error;
    } catch (error) {
      const aborted = error?.name === "AbortError";

      const wrapped = aborted
        ? Object.assign(
            new Error(`TIMEOUT ${timeoutMs}ms ${url}`),
            {
              provider,
              retryable: true,
              status: null,
            },
          )
        : error;

      lastError = wrapped;

      const canRetry =
        wrapped?.retryable === true ||
        aborted ||
        error instanceof TypeError;

      if (!canRetry || attempt >= retries) {
        throw wrapped;
      }

      await sleep(
        baseBackoffMs * (2 ** attempt) + Math.floor(Math.random() * 350),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error(`FETCH_FAILED ${url}`);
}

function cgRow(x) {
  return {
    id: x.id ?? null,
    symbol: x.symbol?.toUpperCase() ?? null,
    name: x.name ?? null,
    priceUsd: num(x.current_price),
    marketCapUsd: num(x.market_cap),
    marketCapRank: num(x.market_cap_rank),
    fdvUsd: num(x.fully_diluted_valuation),
    volume24hUsd: num(x.total_volume),
    circulatingSupply: num(x.circulating_supply),
    totalSupply: num(x.total_supply),
    maxSupply: num(x.max_supply),
    high24h: num(x.high_24h),
    low24h: num(x.low_24h),
    change24hPercent: num(x.price_change_percentage_24h),
    change1hPercent: num(x.price_change_percentage_1h_in_currency),
    change7dPercent: num(x.price_change_percentage_7d_in_currency),
    lastUpdated: x.last_updated ?? null,
  };
}

function llamaRow(x) {
  return {
    id: x.id ?? null,
    name: x.name ?? null,
    symbol: x.symbol?.toUpperCase() ?? null,
    geckoId: x.gecko_id ?? null,
    slug: x.slug ?? null,
    category: x.category ?? null,
    chains: Array.isArray(x.chains) ? x.chains : [],
    tvlUsd: num(x.tvl),
    change1d: num(x.change_1d),
    change7d: num(x.change_7d),
    mcapUsd: num(x.mcap),
    url: x.url ?? null,
  };
}

function add(map, key, value) {
  if (key && !map.has(key)) {
    map.set(key, value);
  }
}

function indexRows(cg, llama) {
  const byId = new Map();
  const bySymbol = new Map();
  const byName = new Map();

  const llamaByGecko = new Map();
  const llamaBySymbol = new Map();
  const llamaByName = new Map();

  for (const row of cg) {
    add(byId, norm(row.id), row);
    add(bySymbol, norm(row.symbol), row);
    add(byName, compact(row.name), row);
  }

  for (const row of llama) {
    add(llamaByGecko, norm(row.geckoId), row);
    add(llamaBySymbol, norm(row.symbol), row);
    add(llamaByName, compact(row.name), row);
  }

  return {
    byId,
    bySymbol,
    byName,
    llamaByGecko,
    llamaBySymbol,
    llamaByName,
  };
}

function candidateType(candidate) {
  return String(
    candidate?.candidateType ??
    candidate?.type ??
    "",
  )
    .trim()
    .toUpperCase();
}

export function lookupCryptoFundamentals(snapshot, candidate) {
  const i = snapshot?.index;

  if (!i) {
    return null;
  }

  const id = norm(
    candidate?.assetId ??
    candidate?.coinGeckoId,
  );

  const symbol = norm(
    candidate?.symbol,
  );

  const name = compact(
    candidate?.name,
  );

  const type = candidateType(candidate);
  const isCex = type === "CEX";
  const isEmerging = type === "EMERGING";

  let market = null;
  let marketMatchType = "NONE";

  /*
   * ----------------------------------------------------------
   * 1. EXACT ASSET-ID MATCH
   * ----------------------------------------------------------
   *
   * Allowed for both CEX and EMERGING candidates because this is
   * canonical evidence rather than ticker attribution.
   */
  if (id) {
    market =
      i.byId.get(id) ??
      null;

    if (market) {
      marketMatchType =
        "ASSET_ID";
    }
  }

  /*
   * ----------------------------------------------------------
   * 2. CEX FALLBACKS
   * ----------------------------------------------------------
   *
   * Only a CEX candidate may fall back to project name / ticker.
   * EMERGING contract-only assets may NOT inherit a market merely
   * because another asset shares their symbol.
   */
  if (!market && isCex) {
    const byName =
      name
        ? i.byName.get(name) ?? null
        : null;

    if (byName) {
      market =
        byName;

      marketMatchType =
        "CEX_NAME_FALLBACK";
    } else if (symbol) {
      const bySymbol =
        i.bySymbol.get(symbol) ??
        null;

      if (bySymbol) {
        market =
          bySymbol;

        marketMatchType =
          "CEX_SYMBOL_FALLBACK";
      }
    }
  }

  const canonicalGeckoId =
    norm(
      market?.id ||
      id,
    );

  let protocol = null;
  let protocolMatchType = "NONE";

  /*
   * ----------------------------------------------------------
   * 3. EXACT DEFILLAMA GECKO MAPPING
   * ----------------------------------------------------------
   */
  if (canonicalGeckoId) {
    protocol =
      i.llamaByGecko.get(
        canonicalGeckoId,
      ) ??
      null;

    if (protocol) {
      protocolMatchType =
        "GECKO_ID";
    }
  }

  /*
   * ----------------------------------------------------------
   * 4. CEX-ONLY PROTOCOL FALLBACKS
   * ----------------------------------------------------------
   */
  if (!protocol && isCex) {
    const byName =
      name
        ? i.llamaByName.get(name) ?? null
        : null;

    if (byName) {
      protocol =
        byName;

      protocolMatchType =
        "CEX_NAME_FALLBACK";
    } else if (symbol) {
      const bySymbol =
        i.llamaBySymbol.get(symbol) ??
        null;

      if (bySymbol) {
        protocol =
          bySymbol;

        protocolMatchType =
          "CEX_SYMBOL_FALLBACK";
      }
    }
  }

  /*
   * EMERGING candidate with no exact canonical mapping:
   * return null rather than attributing unrelated ticker evidence.
   */
  if (
    isEmerging &&
    !market &&
    !protocol
  ) {
    return null;
  }

  if (!market && !protocol) {
    return null;
  }

  return {
    market,
    protocol,

    identity: {
      candidateType: type || "UNKNOWN",
      assetId: id || null,
      symbol: symbol || null,
      marketMatchType,
      protocolMatchType,
      exactIdentity:
        marketMatchType === "ASSET_ID" ||
        protocolMatchType === "GECKO_ID",
    },

    marketMatchType,
    protocolMatchType,

    source:
      snapshot?.freshness === "LIVE"
        ? "BULK_SNAPSHOT"
        : "BULK_SNAPSHOT_DEGRADED",

    snapshotAt:
      snapshot?.sourceFetchedAt ??
      snapshot?.fetchedAt,

    freshness:
      snapshot?.freshness ??
      "UNKNOWN",
  };
}

async function fetchCoinGeckoPages({
  pages,
  perPage,
  base,
  headers,
  pageDelayMs,
}) {
  const marketPages = [];
  const pageStatus = [];

  for (
    let page = 1;
    page <= pages;
    page += 1
  ) {
    const params =
      new URLSearchParams({
        vs_currency: "usd",
        order: "volume_desc",
        per_page: String(perPage),
        page: String(page),
        sparkline: "false",
        price_change_percentage: "1h,24h,7d",
      });

    try {
      const data =
        await fetchJsonWithRetry(
          `${base}/coins/markets?${params}`,
          { headers },
          {
            provider:
              "COINGECKO",
          },
        );

      const rows =
        Array.isArray(data)
          ? data
          : [];

      marketPages.push(
        rows,
      );

      pageStatus.push({
        page,
        ok: true,
        rows: rows.length,
        error: null,
      });
    } catch (error) {
      pageStatus.push({
        page,
        ok: false,
        rows: 0,
        error:
          error?.message ??
          String(error),
        status:
          error?.status ??
          null,
      });

      break;
    }

    if (
      page < pages &&
      pageDelayMs > 0
    ) {
      await sleep(
        pageDelayMs,
      );
    }
  }

  return {
    rows:
      marketPages.flat(),

    pages:
      pageStatus,

    complete:
      pageStatus.length ===
        pages &&
      pageStatus.every(
        (x) => x.ok,
      ),
  };
}

async function fetchDefiLlama() {
  try {
    const data =
      await fetchJsonWithRetry(
        `${LLAMA}/protocols`,
        {},
        {
          retries: 2,
          provider:
            "DEFILLAMA",
        },
      );

    return {
      ok: true,

      rows:
        (
          Array.isArray(data)
            ? data
            : []
        ).map(llamaRow),

      /*
       * Phase 6.42:
       * Bind freshness to these exact DefiLlama rows. This timestamp
       * travels with the fundamental snapshot and is never replaced by
       * an unrelated process-global provider fetch.
       */
      fetchedAt:
        new Date()
          .toISOString(),

      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      rows: [],
      fetchedAt: null,
      error:
        error?.message ??
        String(error),
    };
  }
}

function buildValue({
  cgRows,
  llamaRows,
  providerStatus,
  freshness,
  previousFetchedAt = null,
  defiLlamaFetchedAt = null,
}) {
  const now =
    new Date()
      .toISOString();

  return {
    approved: true,

    status:
      freshness === "LIVE"
        ? "COMPLETE"
        : "DEGRADED",

    freshness,

    fetchedAt:
      now,

    sourceFetchedAt:
      previousFetchedAt ??
      now,

    providers: {
      coinGeckoMarkets:
        cgRows.length,

      defiLlamaProtocols:
        llamaRows.length,

      /*
       * Phase 6.42 snapshot-bound OnChain freshness authority.
       * This timestamp describes the DefiLlama rows stored in THIS
       * snapshot, including preserved stale rows when applicable.
       */
      defiLlamaFetchedAt:
        defiLlamaFetchedAt,

      coinGecko:
        providerStatus
          .coinGecko,

      defiLlama:
        providerStatus
          .defiLlama,
    },

    index:
      indexRows(
        cgRows,
        llamaRows,
      ),
  };
}

export async function buildCryptoFundamentalSnapshot({
  refresh = false,
  pages = 3,
  perPage = 250,
  ttlMs = 15 * 60 * 1000,
  staleTtlMs = envNumber(
    "CRYPTO_FUNDAMENTAL_STALE_TTL_MS",
    6 * 60 * 60 * 1000,
  ),
  pageDelayMs = envNumber(
    "COINGECKO_BULK_PAGE_DELAY_MS",
    1400,
  ),
} = {}) {
  const now =
    Date.now();

  if (
    !refresh &&
    cache.value &&
    now <
      cache.expiresAt
  ) {
    return cache.value;
  }

  if (cache.promise) {
    return cache.promise;
  }

  const previous =
    cache.value;

  cache.promise =
    (async () => {
      const {
        base,
        headers,
        tier,
      } = cgConfig();

      const llamaPromise =
        fetchDefiLlama();

      const cgResult =
        await fetchCoinGeckoPages({
          pages,
          perPage,
          base,
          headers,
          pageDelayMs,
        });

      const llamaResult =
        await llamaPromise;

      const freshCgRows =
        cgResult.rows.map(
          cgRow,
        );

      const freshLlamaRows =
        llamaResult.rows;

      const previousCgRows =
        previous?.index?.byId
          ? [
              ...previous
                .index
                .byId
                .values(),
            ]
          : [];

      const previousLlamaRows =
        previous
          ?.index
          ?.llamaByGecko
          ? [
              ...previous
                .index
                .llamaByGecko
                .values(),
            ]
          : previous
              ?.index
              ?.llamaByName
            ? [
                ...previous
                  .index
                  .llamaByName
                  .values(),
              ]
            : [];

      const cgUsable =
        cgResult.complete &&
        freshCgRows.length > 0;

      const llamaUsable =
        llamaResult.ok &&
        freshLlamaRows.length > 0;

      if (
        cgUsable &&
        llamaUsable
      ) {
        const value =
          buildValue({
            cgRows:
              freshCgRows,

            llamaRows:
              freshLlamaRows,

            freshness:
              "LIVE",

            defiLlamaFetchedAt:
              llamaResult
                .fetchedAt ??
              null,

            providerStatus: {
              coinGecko: {
                ok: true,
                tier,
                complete: true,
                pages:
                  cgResult.pages,
                usingStale:
                  false,
              },

              defiLlama: {
                ok: true,
                usingStale:
                  false,
                error: null,
              },
            },
          });

        cache = {
          value,
          expiresAt:
            Date.now() +
            ttlMs,
          promise: null,
        };

        return value;
      }

      const chosenCgRows =
        cgUsable
          ? freshCgRows
          : previousCgRows
              .length
            ? previousCgRows
            : freshCgRows;

      const chosenLlamaRows =
        llamaUsable
          ? freshLlamaRows
          : previousLlamaRows
              .length
            ? previousLlamaRows
            : freshLlamaRows;

      if (
        chosenCgRows.length ||
        chosenLlamaRows.length
      ) {
        const staleProviderUsed =
          (
            !cgUsable &&
            previousCgRows
              .length > 0
          ) ||
          (
            !llamaUsable &&
            previousLlamaRows
              .length > 0
          );

        const value =
          buildValue({
            cgRows:
              chosenCgRows,

            llamaRows:
              chosenLlamaRows,

            freshness:
              staleProviderUsed
                ? "STALE_FALLBACK"
                : "PARTIAL",

            previousFetchedAt:
              staleProviderUsed
                ? previous
                    ?.sourceFetchedAt ??
                  previous
                    ?.fetchedAt ??
                  null
                : null,

            defiLlamaFetchedAt:
              llamaUsable
                ? llamaResult
                    .fetchedAt ??
                  null
                : previous
                    ?.providers
                    ?.defiLlamaFetchedAt ??
                  null,

            providerStatus: {
              coinGecko: {
                ok:
                  cgUsable,

                tier,

                complete:
                  cgResult
                    .complete,

                pages:
                  cgResult
                    .pages,

                usingStale:
                  !cgUsable &&
                  previousCgRows
                    .length > 0,

                partialRows:
                  freshCgRows
                    .length,
              },

              defiLlama: {
                ok:
                  llamaUsable,

                usingStale:
                  !llamaUsable &&
                  previousLlamaRows
                    .length > 0,

                error:
                  llamaResult
                    .error,
              },
            },
          });

        cache = {
          value,

          expiresAt:
            Date.now() +
            Math.min(
              ttlMs,
              staleTtlMs,
            ),

          promise:
            null,
        };

        return value;
      }

      const value =
        buildValue({
          cgRows: [],
          llamaRows: [],
          freshness:
            "UNAVAILABLE",

          defiLlamaFetchedAt:
            null,

          providerStatus: {
            coinGecko: {
              ok: false,
              tier,
              complete: false,
              pages:
                cgResult.pages,
              usingStale:
                false,
              partialRows:
                freshCgRows
                  .length,
            },

            defiLlama: {
              ok: false,
              usingStale:
                false,
              error:
                llamaResult
                  .error,
            },
          },
        });

      cache = {
        value,

        expiresAt:
          Date.now() +
          Math.min(
            60_000,
            ttlMs,
          ),

        promise:
          null,
      };

      return value;
    })()
      .catch((error) => {
        if (previous) {
          const fallback = {
            ...previous,

            status:
              "DEGRADED",

            freshness:
              "STALE_FALLBACK",

            fallbackAt:
              new Date()
                .toISOString(),

            fallbackReason:
              error?.message ??
              String(error),
          };

          cache = {
            value:
              fallback,

            expiresAt:
              Date.now() +
              Math.min(
                ttlMs,
                staleTtlMs,
              ),

            promise:
              null,
          };

          return fallback;
        }

        cache.promise =
          null;

        return {
          approved: true,

          status:
            "DEGRADED",

          freshness:
            "UNAVAILABLE",

          fetchedAt:
            new Date()
              .toISOString(),

          sourceFetchedAt:
            null,

          providers: {
            coinGeckoMarkets:
              0,

            defiLlamaProtocols:
              0,

            coinGecko: {
              ok: false,
              usingStale:
                false,
              error:
                error?.message ??
                String(error),
            },

            defiLlama: {
              ok: false,
              usingStale:
                false,
            },
          },

          index:
            indexRows(
              [],
              [],
            ),
        };
      });

  return cache.promise;
}

export function clearCryptoFundamentalSnapshot() {
  cache = {
    value: null,
    expiresAt: 0,
    promise: null,
  };
}

export default buildCryptoFundamentalSnapshot;
