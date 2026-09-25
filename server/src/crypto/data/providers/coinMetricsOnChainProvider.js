/**
 * AEMA CRYPTO — COIN METRICS ON-CHAIN PROVIDER
 * Phase 6.50 — fail-proof asset resolution + catalog diagnostics + historical trends
 *
 * Rules:
 * - Resolve AEMA/CoinGecko symbols to Coin Metrics asset IDs explicitly.
 * - Verify the asset against Coin Metrics reference data before metric discovery.
 * - Discover metrics from the credential-aware Catalog V2 first.
 * - Optionally inspect Full Catalog V2 only for diagnostics/future paid coverage.
 * - Request only metrics actually available to the current credentials.
 * - Follow pagination safely.
 * - Preserve provider diagnostics on every success/failure.
 * - Missing evidence remains unavailable. No synthetic/neutral evidence.
 * - Research only; no execution authority.
 */

const COMMUNITY_BASE = "https://community-api.coinmetrics.io/v4";
const PAID_BASE = "https://api.coinmetrics.io/v4";

const DEFAULT_TTL_MS =
  Number(process.env.COIN_METRICS_ONCHAIN_TTL_MS) || 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS =
  Number(process.env.COIN_METRICS_TIMEOUT_MS) || 12000;
const DEFAULT_HISTORY_DAYS =
  Number(process.env.COIN_METRICS_ONCHAIN_HISTORY_DAYS) || 31;
const DEFAULT_MAX_PAGES =
  Math.max(1, Number(process.env.COIN_METRICS_MAX_PAGES) || 10);

/*
 * Explicit aliases prevent accidental use of CoinGecko IDs such as "solana"
 * where Coin Metrics expects "sol". Candidate.coinMetricsAsset still has
 * highest authority.
 */
const ASSET_ALIASES = Object.freeze({
  bitcoin: "btc",
  btc: "btc",
  ethereum: "eth",
  ether: "eth",
  eth: "eth",
  solana: "sol",
  sol: "sol",
  cardano: "ada",
  ada: "ada",
  avalanche: "avax",
  avax: "avax",
  polkadot: "dot",
  dot: "dot",
  dogecoin: "doge",
  doge: "doge",
  litecoin: "ltc",
  ltc: "ltc",
  bitcoin_cash: "bch",
  "bitcoin-cash": "bch",
  bch: "bch",
  chainlink: "link",
  link: "link",
  polygon: "matic",
  "polygon-ecosystem-token": "pol",
  matic: "matic",
  pol: "pol",
  xrp: "xrp",
  ripple: "xrp",
});

const DESIRED_METRICS = Object.freeze([
  "AdrActCnt",
  "AdrBalCnt",
  "BlkCnt",
  "FeeTotNtv",
  "FlowInExNtv",
  "FlowInExUSD",
  "FlowOutExNtv",
  "FlowOutExUSD",
  "HashRate",
  "IssTotNtv",
  "IssTotUSD",
  "SplyCur",
  "SplyExNtv",
  "SplyExUSD",
  "TxCnt",
  "TxTfrCnt",
  "TxTfrValUSD",
  "CapMVRVCur",
]);

const cache = new Map();
const catalogCache = new Map();
const assetResolutionCache = new Map();
const inflight = new Map();

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const text = (value) => String(value ?? "").trim();
const norm = (value) => text(value).toLowerCase();

function getBaseUrl() {
  return text(process.env.COIN_METRICS_API_KEY)
    ? PAID_BASE
    : COMMUNITY_BASE;
}

function providerMode() {
  return text(process.env.COIN_METRICS_API_KEY) ? "PAID" : "COMMUNITY";
}

function rawAssetCandidates(candidate = {}) {
  return [
    candidate?.coinMetricsAsset,
    candidate?.measurements?.coinMetricsAsset,
    candidate?.assetId,
    candidate?.coinGeckoId,
    candidate?.id,
    candidate?.symbol,
    candidate?.name,
  ]
    .map(norm)
    .filter(Boolean);
}

function localAssetCode(candidate = {}) {
  for (const raw of rawAssetCandidates(candidate)) {
    if (ASSET_ALIASES[raw]) return ASSET_ALIASES[raw];
  }
  return norm(
    candidate?.coinMetricsAsset ??
    candidate?.measurements?.coinMetricsAsset ??
    candidate?.symbol ??
    candidate?.assetId ??
    candidate?.coinGeckoId ??
    candidate?.id,
  );
}

function isoDateDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

function percentChange(current, previous) {
  const c = finite(current);
  const p = finite(previous);
  if (c === null || p === null || p === 0) return null;
  return ((c - p) / Math.abs(p)) * 100;
}

function delta(current, previous) {
  const c = finite(current);
  const p = finite(previous);
  if (c === null || p === null) return null;
  return c - p;
}

function safeUrlForDiagnostics(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("api_key");
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const headers = { accept: "application/json" };
    const apiKey = text(process.env.COIN_METRICS_API_KEY);
    const finalUrl = new URL(url);
    if (apiKey) finalUrl.searchParams.set("api_key", apiKey);

    const response = await fetch(finalUrl, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = "";
      try {
        detail = await response.text();
      } catch {}

      const error = new Error(`COIN_METRICS_${response.status}`);
      error.status = response.status;
      error.detail = detail.slice(0, 1000);
      error.requestUrl = safeUrlForDiagnostics(finalUrl);
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeout = new Error("COIN_METRICS_TIMEOUT");
      timeout.name = "AbortError";
      timeout.requestUrl = safeUrlForDiagnostics(url);
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllPages(initialUrl, { maxPages = DEFAULT_MAX_PAGES } = {}) {
  const data = [];
  let url = initialUrl;
  let pages = 0;

  while (url && pages < maxPages) {
    const payload = await fetchJson(url);
    if (Array.isArray(payload?.data)) data.push(...payload.data);
    pages += 1;

    const next = text(payload?.next_page_url);
    if (!next) break;

    /*
     * next_page_url may already contain api_key. fetchJson safely re-applies
     * the configured key; diagnostics never expose it.
     */
    url = next;
  }

  return {
    data,
    pages,
    truncated: Boolean(url && pages >= maxPages),
  };
}

function unavailable(reason, extra = {}) {
  return {
    approved: false,
    status: "INSUFFICIENT_EVIDENCE",
    reason,
    evidence: null,
    fetchedAt: new Date().toISOString(),
    source: "COIN_METRICS",
    providerMode: providerMode(),
    executionAuthority: false,
    liveExecution: false,
    ...extra,
  };
}

function normalizeRow(row, metrics) {
  if (!row) return null;
  const values = {};
  for (const metric of metrics) {
    values[metric] = finite(row?.[metric]);
  }
  return {
    asset: row.asset ?? null,
    time: row.time ?? null,
    metrics: values,
  };
}

function closestHistoricalRow(rows, latestTimeMs, targetDaysAgo) {
  if (!rows.length || !Number.isFinite(latestTimeMs)) return null;
  const target = latestTimeMs - targetDaysAgo * 86400000;
  let best = null;
  let bestDistance = Infinity;

  for (const row of rows) {
    const t = Date.parse(row?.time);
    if (!Number.isFinite(t) || t >= latestTimeMs) continue;
    const distance = Math.abs(t - target);
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}

function buildTrends(rows, metrics) {
  if (!rows.length) return {};
  const latest = rows.at(-1);
  const latestMs = Date.parse(latest?.time);
  if (!Number.isFinite(latestMs)) return {};

  const prior1d = closestHistoricalRow(rows, latestMs, 1);
  const prior7d = closestHistoricalRow(rows, latestMs, 7);
  const prior30d = closestHistoricalRow(rows, latestMs, 30);
  const trends = {};

  for (const metric of metrics) {
    const current = finite(latest?.[metric]);
    trends[metric] = {
      current,
      change1dPercent: percentChange(current, prior1d?.[metric]),
      change7dPercent: percentChange(current, prior7d?.[metric]),
      change30dPercent: percentChange(current, prior30d?.[metric]),
      delta1d: delta(current, prior1d?.[metric]),
      delta7d: delta(current, prior7d?.[metric]),
      delta30d: delta(current, prior30d?.[metric]),
    };
  }
  return trends;
}

function buildDerivedEvidence(latestMetrics, trends) {
  const flowInUsd = finite(latestMetrics?.FlowInExUSD);
  const flowOutUsd = finite(latestMetrics?.FlowOutExUSD);
  const flowInNtv = finite(latestMetrics?.FlowInExNtv);
  const flowOutNtv = finite(latestMetrics?.FlowOutExNtv);

  return {
    exchangeNetFlowUsd:
      flowInUsd !== null && flowOutUsd !== null ? flowInUsd - flowOutUsd : null,
    exchangeNetFlowNative:
      flowInNtv !== null && flowOutNtv !== null ? flowInNtv - flowOutNtv : null,
    activeAddressesChange7dPercent:
      trends?.AdrActCnt?.change7dPercent ?? null,
    addressBalanceCountChange7dPercent:
      trends?.AdrBalCnt?.change7dPercent ?? null,
    blockCountChange7dPercent:
      trends?.BlkCnt?.change7dPercent ?? null,
    transactionCountChange7dPercent:
      trends?.TxCnt?.change7dPercent ?? null,
    transferCountChange7dPercent:
      trends?.TxTfrCnt?.change7dPercent ?? null,
    transferValueChange7dPercent:
      trends?.TxTfrValUSD?.change7dPercent ?? null,
    feeChange7dPercent:
      trends?.FeeTotNtv?.change7dPercent ?? null,
    hashRateChange7dPercent:
      trends?.HashRate?.change7dPercent ?? null,
    issuanceNativeChange7dPercent:
      trends?.IssTotNtv?.change7dPercent ?? null,
    issuanceUsdChange7dPercent:
      trends?.IssTotUSD?.change7dPercent ?? null,
    exchangeSupplyUsdChange7dPercent:
      trends?.SplyExUSD?.change7dPercent ?? null,
    exchangeSupplyNativeChange7dPercent:
      trends?.SplyExNtv?.change7dPercent ?? null,
  };
}

async function resolveAsset(candidate, { refresh = false } = {}) {
  const local = localAssetCode(candidate);
  if (!local) {
    return {
      resolved: false,
      asset: null,
      localAsset: null,
      referenceFound: false,
      reason: "COIN_METRICS_ASSET_REQUIRED",
    };
  }

  const key = `${getBaseUrl()}|asset|${local}`;
  const hit = assetResolutionCache.get(key);
  if (!refresh && hit?.expiresAt > Date.now()) return hit.value;

  const url = new URL(`${getBaseUrl()}/reference-data/assets`);
  url.searchParams.set("assets", local);
  url.searchParams.set("page_size", "100");

  try {
    const payload = await fetchJson(url);
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const exact = rows.find((row) => norm(row?.asset) === local) ?? null;

    const value = {
      resolved: Boolean(exact),
      asset: exact?.asset ? norm(exact.asset) : local,
      localAsset: local,
      referenceFound: Boolean(exact),
      fullName: exact?.full_name ?? null,
      reason: exact ? null : "COIN_METRICS_ASSET_NOT_IN_REFERENCE_DATA",
    };

    assetResolutionCache.set(key, {
      value,
      expiresAt: Date.now() + DEFAULT_TTL_MS,
    });
    return value;
  } catch (error) {
    /*
     * Reference-data failure must not destroy a valid explicit/local alias.
     * Continue with the local code and preserve the failure diagnostically.
     */
    return {
      resolved: true,
      asset: local,
      localAsset: local,
      referenceFound: null,
      fullName: null,
      reason: null,
      referenceWarning: String(error?.message ?? "REFERENCE_LOOKUP_FAILED"),
    };
  }
}

function metricNamesFromCatalogRow(row) {
  return (Array.isArray(row?.metrics) ? row.metrics : [])
    .filter((item) =>
      (Array.isArray(item?.frequencies) ? item.frequencies : []).some(
        (f) => f?.frequency === "1d",
      ),
    )
    .map((item) => item?.metric)
    .filter(Boolean);
}

async function queryCatalog(asset, path) {
  const url = new URL(`${getBaseUrl()}${path}`);
  url.searchParams.set("assets", asset);
  url.searchParams.set("page_size", "10000");

  const paged = await fetchAllPages(url);
  const row = paged.data.find((item) => norm(item?.asset) === asset) ?? null;

  return {
    row,
    pages: paged.pages,
    truncated: paged.truncated,
    endpoint: path,
  };
}

async function discoverAvailableMetrics(asset, { refresh = false } = {}) {
  const key = `${getBaseUrl()}|catalog|${asset}`;
  const hit = catalogCache.get(key);
  if (!refresh && hit?.expiresAt > Date.now()) return hit.value;

  let availableCatalog = null;
  let availableError = null;

  try {
    availableCatalog = await queryCatalog(asset, "/catalog-v2/asset-metrics");
  } catch (error) {
    availableError = {
      message: String(error?.message ?? error),
      status: error?.status ?? null,
      detail: error?.detail ?? null,
    };
  }

  const availableMetrics = availableCatalog?.row
    ? metricNamesFromCatalogRow(availableCatalog.row)
    : [];

  /*
   * Full Catalog V2 is diagnostic only. It answers:
   * "Does Coin Metrics support this data at all, even if the current
   * credentials do not license it?"
   *
   * We NEVER request unlicensed metrics merely because Full Catalog lists them.
   */
  let fullCatalog = null;
  let fullError = null;
  try {
    fullCatalog = await queryCatalog(asset, "/catalog-all-v2/asset-metrics");
  } catch (error) {
    fullError = {
      message: String(error?.message ?? error),
      status: error?.status ?? null,
      detail: error?.detail ?? null,
    };
  }

  const fullMetrics = fullCatalog?.row
    ? metricNamesFromCatalogRow(fullCatalog.row)
    : [];

  const availableSet = new Set(availableMetrics);
  const fullSet = new Set(fullMetrics);

  const selectedMetrics =
    DESIRED_METRICS.filter((metric) => availableSet.has(metric));

  const desiredSupportedButUnavailable =
    DESIRED_METRICS.filter(
      (metric) => fullSet.has(metric) && !availableSet.has(metric),
    );

  const desiredUnsupported =
    DESIRED_METRICS.filter(
      (metric) => !fullSet.has(metric) && !availableSet.has(metric),
    );

  const value = {
    asset,
    catalogFound: Boolean(availableCatalog?.row),
    fullCatalogFound: Boolean(fullCatalog?.row),
    supported1dMetrics: availableMetrics,
    fullSupported1dMetrics: fullMetrics,
    selectedMetrics,
    desiredSupportedButUnavailable,
    desiredUnsupported,
    diagnostics: {
      providerMode: providerMode(),
      availableCatalogEndpoint: "/catalog-v2/asset-metrics",
      fullCatalogEndpoint: "/catalog-all-v2/asset-metrics",
      availableCatalogError: availableError,
      fullCatalogError: fullError,
      availableCatalogPages: availableCatalog?.pages ?? 0,
      fullCatalogPages: fullCatalog?.pages ?? 0,
    },
  };

  catalogCache.set(key, {
    value,
    expiresAt: Date.now() + DEFAULT_TTL_MS,
  });
  return value;
}

async function load(candidate, { refresh = false } = {}) {
  const resolution = await resolveAsset(candidate, { refresh });
  const asset = resolution.asset;

  if (!asset) {
    return unavailable(
      resolution.reason ?? "COIN_METRICS_ASSET_REQUIRED",
      { resolution },
    );
  }

  try {
    const catalog = await discoverAvailableMetrics(asset, { refresh });

    if (!catalog.catalogFound) {
      const reason = catalog.fullCatalogFound
        ? "COIN_METRICS_ASSET_SUPPORTED_BUT_NOT_AVAILABLE_TO_CURRENT_CREDENTIALS"
        : "COIN_METRICS_ASSET_NOT_IN_CATALOG";

      return unavailable(reason, {
        asset,
        resolution,
        catalog: {
          catalogFound: catalog.catalogFound,
          fullCatalogFound: catalog.fullCatalogFound,
          providerMode: providerMode(),
          supported1dMetricCount: catalog.supported1dMetrics.length,
          fullSupported1dMetricCount: catalog.fullSupported1dMetrics.length,
          desiredSupportedButUnavailable: catalog.desiredSupportedButUnavailable,
          desiredUnsupported: catalog.desiredUnsupported,
          diagnostics: catalog.diagnostics,
        },
      });
    }

    if (!catalog.selectedMetrics.length) {
      const reason = catalog.desiredSupportedButUnavailable.length
        ? "COIN_METRICS_DESIRED_METRICS_NOT_AVAILABLE_TO_CURRENT_CREDENTIALS"
        : "COIN_METRICS_NO_APPLICABLE_1D_METRICS";

      return unavailable(reason, {
        asset,
        resolution,
        catalog: {
          catalogFound: true,
          fullCatalogFound: catalog.fullCatalogFound,
          providerMode: providerMode(),
          supported1dMetricCount: catalog.supported1dMetrics.length,
          fullSupported1dMetricCount: catalog.fullSupported1dMetrics.length,
          selectedMetrics: [],
          desiredSupportedButUnavailable: catalog.desiredSupportedButUnavailable,
          desiredUnsupported: catalog.desiredUnsupported,
          diagnostics: catalog.diagnostics,
        },
      });
    }

    const url = new URL(`${getBaseUrl()}/timeseries/asset-metrics`);
    url.searchParams.set("assets", asset);
    url.searchParams.set("metrics", catalog.selectedMetrics.join(","));
    url.searchParams.set("frequency", "1d");
    url.searchParams.set(
      "start_time",
      isoDateDaysAgo(Math.max(8, DEFAULT_HISTORY_DAYS + 2)),
    );
    url.searchParams.set("page_size", "10000");

    const paged = await fetchAllPages(url);
    const rows = paged.data
      .filter((row) => norm(row?.asset) === asset)
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));

    if (!rows.length) {
      return unavailable("COIN_METRICS_NO_TIMESERIES_ROWS", {
        asset,
        resolution,
        catalog: {
          supported1dMetricCount: catalog.supported1dMetrics.length,
          selectedMetrics: catalog.selectedMetrics,
          desiredSupportedButUnavailable: catalog.desiredSupportedButUnavailable,
          desiredUnsupported: catalog.desiredUnsupported,
        },
        timeseries: {
          pages: paged.pages,
          truncated: paged.truncated,
        },
      });
    }

    const latestRaw = rows.at(-1);
    const latest = normalizeRow(latestRaw, catalog.selectedMetrics);
    const availableMetrics = Object.entries(latest.metrics)
      .filter(([, value]) => value !== null)
      .map(([metric]) => metric);

    if (!availableMetrics.length) {
      return unavailable("COIN_METRICS_NO_APPLICABLE_METRIC_VALUES", {
        asset,
        resolution,
        catalog: {
          selectedMetrics: catalog.selectedMetrics,
        },
        history: {
          rowCount: rows.length,
          startTime: rows[0]?.time ?? null,
          endTime: latest?.time ?? null,
        },
      });
    }

    const trends = buildTrends(rows, catalog.selectedMetrics);
    const derived = buildDerivedEvidence(latest.metrics, trends);
    const fetchedAt = new Date().toISOString();

    return {
      approved: true,
      status: "READY",
      reason: null,
      source: "COIN_METRICS",
      providerMode: providerMode(),
      asset,
      resolution,

      observedAt: latest.time,
      fetchedAt,

      metrics: latest.metrics,
      trends,
      derived,

      availableMetrics,
      availableMetricCount: availableMetrics.length,
      requestedMetrics: catalog.selectedMetrics,
      requestedMetricCount: catalog.selectedMetrics.length,

      catalog: {
        catalogFound: true,
        fullCatalogFound: catalog.fullCatalogFound,
        supported1dMetricCount: catalog.supported1dMetrics.length,
        fullSupported1dMetricCount: catalog.fullSupported1dMetrics.length,
        selectedMetrics: catalog.selectedMetrics,
        desiredSupportedButUnavailable: catalog.desiredSupportedButUnavailable,
        desiredUnsupported: catalog.desiredUnsupported,
        diagnostics: catalog.diagnostics,
      },

      history: {
        frequency: "1d",
        requestedDays: DEFAULT_HISTORY_DAYS,
        rowCount: rows.length,
        pages: paged.pages,
        truncated: paged.truncated,
        startTime: rows[0]?.time ?? null,
        endTime: latest.time ?? null,
      },

      executionAuthority: false,
      liveExecution: false,
    };
  } catch (error) {
    return unavailable(
      error?.name === "AbortError"
        ? "COIN_METRICS_TIMEOUT"
        : String(error?.message ?? "COIN_METRICS_REQUEST_FAILED"),
      {
        asset,
        resolution,
        providerDetail: error?.detail ?? null,
        providerStatus: error?.status ?? null,
        requestUrl: error?.requestUrl ?? null,
      },
    );
  }
}

export async function getCoinMetricsOnChainEvidence(
  candidate,
  { refresh = false } = {},
) {
  const localAsset = localAssetCode(candidate);
  if (!localAsset) return unavailable("COIN_METRICS_ASSET_REQUIRED");

  const key = `${getBaseUrl()}|${localAsset}`;
  const now = Date.now();
  const hit = cache.get(key);

  if (!refresh && hit?.expiresAt > now) return hit.value;
  if (!refresh && inflight.has(key)) return inflight.get(key);

  const promise = load(candidate, { refresh })
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + DEFAULT_TTL_MS,
      });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, promise);
  return promise;
}

export function clearCoinMetricsOnChainCache() {
  cache.clear();
  catalogCache.clear();
  assetResolutionCache.clear();
  inflight.clear();
}

export const coinMetricsOnChainProviderDiagnostics = Object.freeze({
  phase: "6.50",
  desiredMetrics: [...DESIRED_METRICS],
  aliases: { ...ASSET_ALIASES },
  communityBase: COMMUNITY_BASE,
  paidBase: PAID_BASE,
});

export default getCoinMetricsOnChainEvidence;
