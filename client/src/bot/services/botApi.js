
/**
 * AEMA PRIVATE BOT API
 *
 * Single-login architecture.
 *
 * The user signs in to AEMA through Supabase.
 * The private bot reuses that authenticated session.
 *
 * No separate bot password or bot session token.
 *
 * Existing API functions are preserved.
 */

import {
  researchAuthHeaders,
} from "../../services/researchAuth.js";

/* ============================================================
   API CONFIGURATION
   ============================================================ */

const BASE = `${
  (import.meta.env.VITE_API_BASE_URL ?? "")
    .replace(/\/+$/, "")
}/api/crypto/bot`;

/* ============================================================
   AUTHENTICATED REQUEST HANDLER
   ============================================================ */

async function req(path, options = {}) {
  const headers = await researchAuthHeaders({
    ...(options.headers || {}),
    "Content-Type": "application/json",
  });

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    // Preserve HTTP errors.
  }

  if (!response.ok) {
    const error = new Error(
      body?.error || `HTTP_${response.status}`
    );

    error.status = response.status;
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

export const loginBot = () =>
  req("/auth/login", {
    method: "POST",
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

export const discoverBotStockMarket = (
  options = {}
) =>
  req("/stock/discover", {
    method: "POST",
    body: JSON.stringify(options),
  });

export const getBotStockSetups = () =>
  req("/stock/setups");

/* ============================================================
   SETUP SCENARIOS
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
   MONITORING
   ============================================================ */

export const monitorSetup = (
  setupId,
  {
    capitalUsd,
    leverage,
    feeRatePercent,
  } = {}
) =>
  req(
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
   MANUAL HISTORY
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
   DASHBOARD AND HISTORY
   ============================================================ */

export const getBotDashboard = () =>
  req("/dashboard");

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
   V2 RESEARCH API
   ============================================================ */

export const botV2Post = (
  path,
  payload
) =>
  req(
    `/v2/${String(path).replace(/^\/+/, "")}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
