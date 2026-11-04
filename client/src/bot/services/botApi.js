
/**
 * AEMA PRIVATE BOT API
 *
 * Authentication architecture:
 *
 * 1. Main AEMA authentication is handled separately.
 * 2. The private bot requires its own access password.
 * 3. The backend validates the password and issues a bot session.
 * 4. Bot API requests use the private bot session.
 * 5. No Supabase bearer token is required by this API client.
 *
 * Supports:
 * - Private bot authentication
 * - Crypto market research
 * - Stock market research
 * - Setup scenarios
 * - Monitoring
 * - Manual trade history
 * - Dashboard and history
 * - Account controls
 * - V2 research
 */

/* ============================================================
   PRIVATE BOT SESSION
   ============================================================ */

const BOT_SESSION_KEY = "aema_bot_session_v1";

function getBotSession() {
  try {
    return sessionStorage.getItem(BOT_SESSION_KEY) || "";
  } catch {
    return "";
  }
}

function setBotSession(value) {
  try {
    if (value) {
      sessionStorage.setItem(BOT_SESSION_KEY, value);
    } else {
      sessionStorage.removeItem(BOT_SESSION_KEY);
    }
  } catch {
    // The HttpOnly cookie remains available as a fallback.
  }
}

/* ============================================================
   API CONFIGURATION
   ============================================================ */

const BASE = `${
  (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "")
}/api/crypto/bot`;

/* ============================================================
   PRIVATE BOT REQUEST HANDLER
   ============================================================ */

async function req(path, options = {}) {
  const sessionToken = getBotSession();

  const headers = {
    ...(options.headers || {}),
    "Content-Type": "application/json",
    ...(sessionToken
      ? { "X-AEMA-Bot-Session": sessionToken }
      : {}),
  };

  const response = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });

  let body = null;

  try {
    body = await response.json();
  } catch {
    // Preserve the HTTP status if the response is not JSON.
  }

  if (!response.ok) {
    if (body?.error === "BOT_AUTH_REQUIRED") {
      setBotSession("");

      window.dispatchEvent(
        new Event("aema-bot-locked")
      );
    }

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

export async function loginBot(accessKey) {
  const result = await req("/auth/login", {
    method: "POST",
    body: JSON.stringify({ accessKey }),
  });

  if (!result?.authorized || !result?.sessionToken) {
    throw new Error("BOT_SESSION_NOT_ISSUED");
  }

  setBotSession(result.sessionToken);

  return result;
}

export async function logoutBot() {
  try {
    return await req("/auth/logout", {
      method: "POST",
    });
  } finally {
    setBotSession("");

    window.dispatchEvent(
      new Event("aema-bot-locked")
    );
  }
}

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
   SETUP SCENARIOS
   ============================================================ */

export const calculateSetupScenario = (
  setupId,
  { capitalUsd, leverage, feeRatePercent } = {}
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
  { capitalUsd, leverage, feeRatePercent } = {}
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

/**
 * V2 research uses the same private bot API host
 * and authenticated bot session.
 *
 * No separate Supabase bearer token is required.
 */

export const botV2Post = (
  path,
  payload
) =>
  req(
    `/v2/${path.replace(/^\/+/, "")}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
