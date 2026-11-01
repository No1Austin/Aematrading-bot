
import { researchAuthHeaders } from "../../services/researchAuth.js";

/*
 * AEMA PRIVATE BOT API
 *
 * All private bot requests use the Vercel same-origin proxy.
 *
 * Vercel:
 *   /api/* -> Render backend
 *
 * Authentication:
 *   1. Supabase Bearer token
 *   2. Private bot HttpOnly cookie
 */

const BASE = "/api/crypto/bot";

/* ============================================================
   SHARED AUTHENTICATED REQUEST
   ============================================================ */

async function req(path, options = {}) {
  const {
    headers: additionalHeaders = {},
    ...requestOptions
  } = options;

  let headers;

  try {
    headers = await researchAuthHeaders({
      "Content-Type": "application/json",
      ...additionalHeaders,
    });
  } catch (error) {
    const e = new Error(
      error?.message || "Unable to retrieve Supabase session."
    );

    e.code = "SUPABASE_SESSION_UNAVAILABLE";
    throw e;
  }

  const response = await fetch(`${BASE}${path}`, {
    ...requestOptions,
    method: requestOptions.method || "GET",
    credentials: "include",
    headers,
    cache: "no-store",
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    // Preserve HTTP status if response is not JSON.
  }

  if (!response.ok) {
    const error = new Error(
      body?.error || `HTTP_${response.status}`
    );

    error.status = response.status;
    error.code = body?.error || `HTTP_${response.status}`;
    error.body = body;

    throw error;
  }

  return body;
}

/* ============================================================
   AUTHENTICATION
   ============================================================ */

export const getBotAuthStatus = () =>
  req("/auth/status");

export const loginBot = (accessKey) =>
  req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ accessKey }),
  });

export const logoutBot = () =>
  req("/auth/logout", {
    method: "POST",
  });

/* ============================================================
   CRYPTO MARKET RESEARCH
   ============================================================ */

export const searchBotMarket = (options = {}) =>
  req("/market/search", {
    method: "POST",
    body: JSON.stringify({ options }),
  });

/* ============================================================
   STOCK MARKET RESEARCH
   ============================================================ */

export const searchBotStockMarket = (options = {}) =>
  req("/stock/research", {
    method: "POST",
    body: JSON.stringify(options),
  });

export const discoverBotStockMarket = (options = {}) =>
  req("/stock/discover", {
    method: "POST",
    body: JSON.stringify(options),
  });

export const getBotStockSetups = () =>
  req("/stock/setups");

/* ============================================================
   POSITION SCENARIO
   ============================================================ */

export const calculateSetupScenario = (
  setupId,
  {
    capitalUsd,
    leverage,
    feeRatePercent,
  } = {}
) =>
  req(
    `/setups/${encodeURIComponent(setupId)}/scenario`,
    {
      method: "POST",
      body: JSON.stringify({
        capitalUsd,
        leverage,
        feeRatePercent,
      }),
    }
  );

/* ============================================================
   MONITOR TRADE
   ============================================================ */

export const monitorSetup = (
  setupId,
  {
    capitalUsd,
    leverage,
    feeRatePercent,
  } = {}
) => {
  if (!setupId) {
    throw new Error("SETUP_ID_REQUIRED");
  }

  return req(
    `/setups/${encodeURIComponent(setupId)}/monitor`,
    {
      method: "POST",
      body: JSON.stringify({
        capitalUsd,
        leverage,
        feeRatePercent,
      }),
    }
  );
};

/* ============================================================
   MONITORING HISTORY
   ============================================================ */

export const getBotMonitors = () =>
  req("/monitoring");

export const getBotMonitor = (id) =>
  req(`/monitoring/${encodeURIComponent(id)}`);

export const refreshBotMonitor = (
  id,
  options = {}
) =>
  req(
    `/monitoring/${encodeURIComponent(id)}/refresh`,
    {
      method: "POST",
      body: JSON.stringify({ options }),
    }
  );

/* ============================================================
   MANUAL TRADE HISTORY
   ============================================================ */

export const getBotManualHistory = () =>
  req("/manual-history");

export const saveBotManualResult = (
  monitorId,
  data
) =>
  req(
    `/manual-history/${encodeURIComponent(monitorId)}/result`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );

/* ============================================================
   DASHBOARD
   ============================================================ */

export const getBotDashboard = () =>
  req("/dashboard");

/* ============================================================
   TRADE HISTORY
   ============================================================ */

export const getBotHistory = () =>
  req("/history");

export const getTradeExplanation = (id) =>
  req(
    `/positions/${encodeURIComponent(id)}/explanation`
  );

/* ============================================================
   ACCOUNT CONTROLS
   ============================================================ */

export const setBotAllocation = (
  allocationUsd
) =>
  req("/controls/allocation", {
    method: "PUT",
    body: JSON.stringify({
      allocationUsd: Number(allocationUsd),
    }),
  });

export const pauseBot = () =>
  req("/controls/pause", {
    method: "POST",
  });

export const resumeBot = () =>
  req("/controls/resume", {
    method: "POST",
  });

export const closeBotPosition = (id) =>
  req(
    `/positions/${encodeURIComponent(id)}/close`,
    {
      method: "POST",
    }
  );

export const emergencyStopBot = () =>
  req("/controls/emergency-stop", {
    method: "POST",
  });

/* ============================================================
   V2 SINGLE-SYMBOL ANALYSIS
   ============================================================ */

export const analyzeBotV2 = (symbol) =>
  req("/v2/analyze", {
    method: "POST",
    body: JSON.stringify({
      market: "crypto",
      symbol,
    }),
  });

/* ============================================================
   V2 ENTRY REFINEMENT
   ============================================================ */

export const refineBotV2Entry = (setupId) =>
  req("/v2/refine-entry", {
    method: "POST",
    body: JSON.stringify({
      setupId,
    }),
  });

/* ============================================================
   DEVELOPING SETUP REFINEMENT
   ============================================================ */

export const refineDevelopingSetup = (
  symbol,
  direction
) =>
  req("/v2/refine-developing", {
    method: "POST",
    body: JSON.stringify({
      symbol,
      direction,
    }),
  });
