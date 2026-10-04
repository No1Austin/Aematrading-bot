/**
 * AEMA CRYPTO API CLIENT
 *
 * Frontend API adapter for the crypto workspace.
 * Crypto API base: /api/crypto
 *
 * Paper execution only.
 * Live execution disabled.
 */

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ?? ""
).replace(/\/+$/, "");

const CRYPTO_BASE = `${API_BASE}/api/crypto`;

function buildQuery(params = {}) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      search.set(key, String(value));
    }
  }

  const query = search.toString();

  return query
    ? `?${query}`
    : "";
}

function requireQuery(query) {
  const normalized =
    String(query ?? "").trim();

  if (!normalized) {
    throw new Error(
      "CRYPTO_SCAN_QUERY_REQUIRED",
    );
  }

  return normalized;
}

function requireValue(
  value,
  errorCode,
) {
  const normalized =
    String(value ?? "").trim();

  if (!normalized) {
    throw new Error(errorCode);
  }

  return normalized;
}

async function request(
  path,
  options = {},
) {
  const response = await fetch(
    `${CRYPTO_BASE}${path}`,
    {
      ...options,

      headers: {
        "Content-Type":
          "application/json",

        ...(options.headers ?? {}),
      },
    },
  );

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

/**
 * ============================================================
 * STATUS / DASHBOARD
 * ============================================================
 */

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
      refresh:
        refresh
          ? "true"
          : undefined,
    })}`,
    {
      headers: {
        Accept:
          "application/json",
      },
    },
  );
}

/**
 * ============================================================
 * RUNTIME
 * ============================================================
 */

export async function getCryptoRuntimeHealth() {
  return request(
    "/runtime/health",
  );
}

export async function getCryptoRuntimeState() {
  return request(
    "/runtime/state",
  );
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

/**
 * ============================================================
 * ACCOUNT / PAPER EXECUTION
 * ============================================================
 */

export async function getCryptoAccount() {
  return request("/account");
}

export async function getCryptoPositions({
  symbol = null,
} = {}) {
  return request(
    `/positions${buildQuery({
      symbol,
    })}`,
  );
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

/**
 * ============================================================
 * MARKETS
 * ============================================================
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
    new Error(
      "CRYPTO_MARKETS_UNAVAILABLE",
    )
  );
}

/**
 * ============================================================
 * CEX DISCOVERY
 * ============================================================
 */

export async function getCryptoDiscovery({
  refresh = false,
} = {}) {
  return request(
    `/discovery${buildQuery({
      refresh:
        refresh
          ? "true"
          : undefined,
    })}`,
  );
}

export async function getCryptoDiscoveryStatus() {
  return request(
    "/discovery/status",
  );
}

export async function getCexDiscoveryRuntime() {
  return request(
    "/bot-discovery/state",
  );
}

/**
 * ============================================================
 * TOKEN SCANNER
 * ============================================================
 */

export async function scanCryptoToken(
  query,
) {
  const normalizedQuery =
    requireQuery(query);

  return request(
    "/scanner/scan",
    {
      method: "POST",

      body: JSON.stringify({
        query:
          normalizedQuery,
      }),
    },
  );
}

export async function getCryptoScannerStatus() {
  return request(
    "/scanner/status",
  );
}

/**
 * ============================================================
 * EMERGING DEX RESEARCH
 * ============================================================
 */

/**
 * Current Emerging DEX research snapshot.
 *
 * Does not run Helius.
 */
export async function getEmergingDexResearch() {
  return request(
    "/research/emerging-dex",
  );
}

/**
 * Current market research for one
 * Emerging DEX candidate.
 *
 * Does not run Helius.
 */
export async function getEmergingDexAsset({
  network,
  contract,
} = {}) {
  const normalizedNetwork =
    requireValue(
      network,
      "EMERGING_DEX_NETWORK_REQUIRED",
    );

  const normalizedContract =
    requireValue(
      contract,
      "EMERGING_DEX_CONTRACT_REQUIRED",
    );

  return request(
    `/research/emerging-dex/${encodeURIComponent(
      normalizedNetwork,
    )}/${encodeURIComponent(
      normalizedContract,
    )}`,
  );
}

/**
 * Run Solana on-chain intelligence
 * for one Emerging DEX candidate.
 *
 * Helius remains backend-only.
 */
export async function getSolanaEmergingDexOnChain({
  contract,
} = {}) {
  const normalizedContract =
    requireValue(
      contract,
      "SOLANA_CONTRACT_REQUIRED",
    );

  return request(
    `/research/emerging-dex/solana/${encodeURIComponent(
      normalizedContract,
    )}/onchain`,
  );
}

/**
 * ============================================================
 * PERSISTENCE / RECOVERY
 * ============================================================
 */

export async function getCryptoPersistence() {
  return request(
    "/persistence",
  );
}

export async function getCryptoRecovery() {
  return request(
    "/recovery",
  );
}

/**
 * ============================================================
 * WORKSPACE SNAPSHOT
 * ============================================================
 */

export async function getCryptoWorkspaceSnapshot({
  tradeLimit = 25,
} = {}) {
  const [
    dashboard,
    trades,
  ] = await Promise.all([
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

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

export const cryptoApiConfig =
  Object.freeze({
    baseUrl:
      CRYPTO_BASE,

    researchBase:
      `${CRYPTO_BASE}/research`,

    emergingDexBase:
      `${CRYPTO_BASE}/research/emerging-dex`,

    paperOnly:
      true,

    liveExecution:
      false,
  });

/**
 * ============================================================
 * DEFAULT API CLIENT
 * ============================================================
 */

export default {
  getStatus:
    getCryptoStatus,

  getDashboard:
    getCryptoDashboard,

  getNews:
    getCryptoNews,

  getRuntimeHealth:
    getCryptoRuntimeHealth,

  getRuntimeState:
    getCryptoRuntimeState,

  getAccount:
    getCryptoAccount,

  getPositions:
    getCryptoPositions,

  getOrders:
    getCryptoOrders,

  getMarketsOverview:
    getCryptoMarketsOverview,

  getDiscovery:
    getCryptoDiscovery,

  getDiscoveryStatus:
    getCryptoDiscoveryStatus,

  scanToken:
    scanCryptoToken,

  getScannerStatus:
    getCryptoScannerStatus,

  getTrades:
    getCryptoTrades,

  getPersistence:
    getCryptoPersistence,

  getRecovery:
    getCryptoRecovery,

  evaluateAction:
    evaluateCryptoRuntimeAction,

  getCexDiscoveryRuntime,

  getWorkspaceSnapshot:
    getCryptoWorkspaceSnapshot,

  getEmergingDexResearch,

  getEmergingDexAsset,

  getSolanaEmergingDexOnChain,

  config:
    cryptoApiConfig,
};