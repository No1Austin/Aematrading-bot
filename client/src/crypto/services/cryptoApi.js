/**
 * AEMA CRYPTO API CLIENT
 *
 * Frontend API adapter for the crypto workspace.
 * Crypto API base: /api/crypto
 * Paper execution only. Live execution disabled.
 */

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ?? ""
).replace(/\/+$/, "");

const CRYPTO_BASE = `${API_BASE}/api/crypto`;

function buildQuery(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : "";
}

function requireQuery(query) {
  const normalized = String(query ?? "").trim();
  if (!normalized) throw new Error("CRYPTO_SCAN_QUERY_REQUIRED");
  return normalized;
}

async function request(path, options = {}) {
  const response = await fetch(`${CRYPTO_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const error = new Error(
      body?.error ??
      body?.blocker ??
      body?.status ??
      `HTTP_${response.status}`,
    );
    error.status = response.status;
    error.data = body;
    throw error;
  }

  return body;
}

export async function getCryptoStatus() {
  return request("/status");
}

export async function getCryptoDashboard() {
  return request("/dashboard");
}

export async function getCryptoNews({
  limit = 20,
  refresh = false,
} = {}) {
  return request(
    `/news${buildQuery({
      limit,
      refresh: refresh ? "true" : undefined,
    })}`,
    {
      headers: {
        Accept: "application/json",
      },
    },
  );
}

export async function getCryptoRuntimeHealth() {
  return request("/runtime/health");
}

export async function getCryptoRuntimeState() {
  return request("/runtime/state");
}

export async function getCryptoAccount() {
  return request("/account");
}

export async function getCryptoPositions({ symbol = null } = {}) {
  return request(`/positions${buildQuery({ symbol })}`);
}

export async function getCryptoOrders({
  symbol = null,
  openOnly = false,
  limit = 100,
} = {}) {
  return request(
    `/orders${buildQuery({
      symbol,
      openOnly,
      limit,
    })}`,
  );
}

export async function getCryptoMarketsOverview() {
  const routes = ["/markets/overview", "/universe"];
  let lastError = null;

  for (const route of routes) {
    try {
      return await request(route);
    } catch (error) {
      lastError = error;
      if (error?.status !== 404) throw error;
    }
  }

  throw lastError ?? new Error("CRYPTO_MARKETS_UNAVAILABLE");
}

export async function getCryptoDiscovery({ refresh = false } = {}) {
  return request(
    `/discovery${buildQuery({
      refresh: refresh ? "true" : undefined,
    })}`,
  );
}

export async function getCryptoDiscoveryStatus() {
  return request("/discovery/status");
}

export async function scanCryptoToken(query) {
  const normalizedQuery = requireQuery(query);

  return request("/scanner/scan", {
    method: "POST",
    body: JSON.stringify({
      query: normalizedQuery,
    }),
  });
}

export async function getCryptoScannerStatus() {
  return request("/scanner/status");
}

export async function getCryptoTrades({
  symbol = null,
  limit = 100,
} = {}) {
  return request(
    `/trades${buildQuery({
      symbol,
      limit,
    })}`,
  );
}

export async function getCryptoPersistence() {
  return request("/persistence");
}

export async function getCryptoRecovery() {
  return request("/recovery");
}

export async function evaluateCryptoRuntimeAction({
  action,
  marketDataFresh = undefined,
  marketDataAgeMs = undefined,
} = {}) {
  return request("/runtime/evaluate-action", {
    method: "POST",
    body: JSON.stringify({
      action,
      marketDataFresh,
      marketDataAgeMs,
    }),
  });
}


export async function getCexDiscoveryRuntime() {
  return request("/bot-discovery/state");
}

export async function getCryptoWorkspaceSnapshot({
  tradeLimit = 25,
} = {}) {
  const [dashboard, trades] = await Promise.all([
    getCryptoDashboard(),
    getCryptoTrades({ limit: tradeLimit }),
  ]);

  return { dashboard, trades };
}

export const cryptoApiConfig = Object.freeze({
  baseUrl: CRYPTO_BASE,
  paperOnly: true,
  liveExecution: false,
});

export default {
  getStatus: getCryptoStatus,
  getDashboard: getCryptoDashboard,
  getNews: getCryptoNews,
  getRuntimeHealth: getCryptoRuntimeHealth,
  getRuntimeState: getCryptoRuntimeState,
  getAccount: getCryptoAccount,
  getPositions: getCryptoPositions,
  getOrders: getCryptoOrders,
  getMarketsOverview: getCryptoMarketsOverview,
  getDiscovery: getCryptoDiscovery,
  getDiscoveryStatus: getCryptoDiscoveryStatus,
  scanToken: scanCryptoToken,
  getScannerStatus: getCryptoScannerStatus,
  getTrades: getCryptoTrades,
  getPersistence: getCryptoPersistence,
  getRecovery: getCryptoRecovery,
  evaluateAction: evaluateCryptoRuntimeAction,
  getCexDiscoveryRuntime,
  getWorkspaceSnapshot: getCryptoWorkspaceSnapshot,
  config: cryptoApiConfig,
};
