/**
 * ============================================================
 * AEMA CRYPTO
 * FRONTEND API CLIENT
 * Phase 6.2
 * ============================================================
 *
 * One frontend interface to /api/crypto.
 * Research UI only; no trade submission or live-execution assumptions.
 */

const API_BASE =
  (
    import.meta.env
      .VITE_API_BASE_URL ??
    ""
  ).replace(/\/+$/, "");

const CRYPTO_BASE =
  `${API_BASE}/api/crypto`;

function buildQuery(params = {}) {
  const search =
    new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    search.set(key, String(value));
  }

  const text = search.toString();
  return text ? `?${text}` : "";
}

async function request(path, options = {}) {
  const response =
    await fetch(
      `${CRYPTO_BASE}${path}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...(options.headers ?? {}),
        },
        ...options,
      },
    );

  let body = null;

  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      body?.error ??
      body?.blocker ??
      body?.status ??
      `HTTP_${response.status}`;

    const error =
      new Error(message);

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

/**
 * ============================================================
 * MARKETS
 * ============================================================
 *
 * We try the dedicated overview contract first, then the universe
 * contract. A 404 is the only condition that advances to fallback.
 * No synthetic market data is created.
 */
export async function getCryptoMarketsOverview() {
  const routes = [
    "/markets/overview",
    "/universe",
  ];

  let lastError = null;

  for (const route of routes) {
    try {
      return await request(route);
    } catch (error) {
      lastError = error;

      if (error?.status !== 404) {
        throw error;
      }
    }
  }

  throw (
    lastError ??
    new Error("CRYPTO_MARKETS_UNAVAILABLE")
  );
}

export async function scanCryptoToken(query) {
  const normalizedQuery =
    String(query ?? "").trim();

  if (!normalizedQuery) {
    throw new Error(
      "CRYPTO_SCAN_QUERY_REQUIRED",
    );
  }

  return request(
    "/scanner/scan",
    {
      method: "POST",
      body: JSON.stringify({
        query: normalizedQuery,
      }),
    },
  );
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
  return request(
    "/runtime/evaluate-action",
    {
      method: "POST",
      body: JSON.stringify({
        action,
        marketDataFresh,
        marketDataAgeMs,
      }),
    },
  );
}

export async function getCryptoWorkspaceSnapshot({
  tradeLimit = 25,
} = {}) {
  const [dashboard, trades] =
    await Promise.all([
      getCryptoDashboard(),
      getCryptoTrades({
        limit: tradeLimit,
      }),
    ]);

  return {
    dashboard,
    trades,
  };
}

export const cryptoApiConfig =
  Object.freeze({
    baseUrl: CRYPTO_BASE,
    paperOnly: true,
    liveExecution: false,
  });

export default {
  getStatus: getCryptoStatus,
  getDashboard: getCryptoDashboard,
  getRuntimeHealth: getCryptoRuntimeHealth,
  getRuntimeState: getCryptoRuntimeState,
  getAccount: getCryptoAccount,
  getPositions: getCryptoPositions,
  getOrders: getCryptoOrders,
  getMarketsOverview: getCryptoMarketsOverview,
  scanToken: scanCryptoToken,
  getScannerStatus: getCryptoScannerStatus,
  getTrades: getCryptoTrades,
  getPersistence: getCryptoPersistence,
  getRecovery: getCryptoRecovery,
  evaluateAction: evaluateCryptoRuntimeAction,
  getWorkspaceSnapshot: getCryptoWorkspaceSnapshot,
  config: cryptoApiConfig,
};
