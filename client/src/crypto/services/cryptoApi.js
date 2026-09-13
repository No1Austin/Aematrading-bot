/**
 * ============================================================
 * AEMA CRYPTO
 * FRONTEND API CLIENT
 * Phase 6.1
 * ============================================================
 *
 * Purpose:
 *
 * - provide one clean frontend interface to /api/crypto
 * - avoid duplicated fetch logic across components
 * - normalize API errors
 * - support dashboard, positions, orders, trades and runtime health
 *
 * IMPORTANT:
 *
 * This client:
 * - does not hardcode account data
 * - does not execute trades
 * - does not submit orders
 * - does not assume live execution
 */


const API_BASE =
  (
    import.meta.env
      .VITE_API_BASE_URL ??
    ""
  )
    .replace(
      /\/+$/,
      "",
    );


const CRYPTO_BASE =
  `${API_BASE}/api/crypto`;


function buildQuery(
  params = {},
) {
  const search =
    new URLSearchParams();

  for (
    const [
      key,
      value,
    ]
    of Object.entries(
      params,
    )
  ) {
    if (
      value === undefined ||
      value === null ||
      value === ""
    ) {
      continue;
    }

    search.set(
      key,
      String(value),
    );
  }

  const text =
    search.toString();

  return text
    ? `?${text}`
    : "";
}


async function request(
  path,
  options = {},
) {
  const response =
    await fetch(
      `${CRYPTO_BASE}${path}`,
      {
        headers: {
          "Content-Type":
            "application/json",

          ...(
            options.headers ??
            {}
          ),
        },

        ...options,
      },
    );


  let body =
    null;


  try {
    body =
      await response.json();
  } catch {
    body =
      null;
  }


  if (!response.ok) {
    const message =
      body
        ?.error ??
      body
        ?.blocker ??
      body
        ?.status ??
      `HTTP_${response.status}`;


    const error =
      new Error(
        message,
      );


    error.status =
      response.status;

    error.data =
      body;

    throw error;
  }


  return body;
}


/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export async function getCryptoStatus() {
  return request(
    "/status",
  );
}


/**
 * ============================================================
 * DASHBOARD
 * ============================================================
 */

export async function getCryptoDashboard() {
  return request(
    "/dashboard",
  );
}


/**
 * ============================================================
 * RUNTIME HEALTH
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


/**
 * ============================================================
 * ACCOUNT
 * ============================================================
 */

export async function getCryptoAccount() {
  return request(
    "/account",
  );
}


/**
 * ============================================================
 * POSITIONS
 * ============================================================
 */

export async function getCryptoPositions({
  symbol = null,
} = {}) {
  return request(
    `/positions${buildQuery({
      symbol,
    })}`,
  );
}


/**
 * ============================================================
 * ORDERS
 * ============================================================
 */

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
 * TRADES
 * ============================================================
 */

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
 * PERSISTENCE
 * ============================================================
 */

export async function getCryptoPersistence() {
  return request(
    "/persistence",
  );
}


/**
 * ============================================================
 * RECOVERY
 * ============================================================
 */

export async function getCryptoRecovery() {
  return request(
    "/recovery",
  );
}


/**
 * ============================================================
 * SUPERVISOR EVALUATION
 * ============================================================
 *
 * Evaluation only.
 * Does not execute an action.
 */

export async function evaluateCryptoRuntimeAction({
  action,

  marketDataFresh =
    undefined,

  marketDataAgeMs =
    undefined,
} = {}) {
  return request(
    "/runtime/evaluate-action",
    {
      method:
        "POST",

      body:
        JSON.stringify({
          action,

          marketDataFresh,

          marketDataAgeMs,
        }),
    },
  );
}


/**
 * ============================================================
 * COMBINED REFRESH
 * ============================================================
 *
 * Useful where the UI needs both the compact dashboard snapshot
 * and expanded recent trade history.
 */

export async function getCryptoWorkspaceSnapshot({
  tradeLimit = 25,
} = {}) {
  const [
    dashboard,
    trades,
  ] =
    await Promise.all([
      getCryptoDashboard(),

      getCryptoTrades({
        limit:
          tradeLimit,
      }),
    ]);


  return {
    dashboard,

    trades,
  };
}


/**
 * ============================================================
 * API METADATA
 * ============================================================
 */

export const cryptoApiConfig =
  Object.freeze({
    baseUrl:
      CRYPTO_BASE,

    paperOnly:
      true,

    liveExecution:
      false,
  });


export default {
  getStatus:
    getCryptoStatus,

  getDashboard:
    getCryptoDashboard,

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

  getTrades:
    getCryptoTrades,

  getPersistence:
    getCryptoPersistence,

  getRecovery:
    getCryptoRecovery,

  evaluateAction:
    evaluateCryptoRuntimeAction,

  getWorkspaceSnapshot:
    getCryptoWorkspaceSnapshot,

  config:
    cryptoApiConfig,
};