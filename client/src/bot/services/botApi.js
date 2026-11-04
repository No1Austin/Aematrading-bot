
import { researchAuthHeaders } from "../../services/researchAuth.js";

// Private unlock token is short-lived and scoped to this browser tab.
// The server verifies its HMAC and binds it to the current Supabase user.
const BOT_SESSION_KEY = "aema_bot_session_v1";

function getBotSession() {
  try { return sessionStorage.getItem(BOT_SESSION_KEY) || ""; }
  catch { return ""; }
}
function setBotSession(value) {
  try {
    if (value) sessionStorage.setItem(BOT_SESSION_KEY, value);
    else sessionStorage.removeItem(BOT_SESSION_KEY);
  } catch { /* restricted storage: HttpOnly cookie remains a fallback */ }
}

const BASE = `${(import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "")}/api/crypto/bot`;

async function req(path, options = {}) {
  // Use the same Supabase session as the rest of AEMA.
  let headers;

  try {
    headers = await researchAuthHeaders({
      "Content-Type": "application/json",
      ...(options.headers || {})
    });
  } catch (error) {
    error.code = "SUPABASE_USER_REQUIRED";
    throw error;
  }

  const sessionToken = getBotSession();
  const r = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...headers,
      ...(sessionToken ? { "X-AEMA-Bot-Session": sessionToken } : {}),
    },
  });

  let b = null;

  try {
    b = await r.json();
  } catch {
    // Preserve the HTTP error below if the response is not JSON.
  }

  if (!r.ok) {
    if (b?.error === "BOT_AUTH_REQUIRED") {
      setBotSession("");
      window.dispatchEvent(new Event("aema-bot-locked"));
    }
    const e = new Error(b?.error || `HTTP_${r.status}`);
    e.status = r.status;
    e.body = b;
    throw e;
  }

  return b;
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
    return await req("/auth/logout", { method: "POST" });
  } finally {
    setBotSession("");
    window.dispatchEvent(new Event("aema-bot-locked"));
  }
}

/* ============================================================
   CRYPTO MARKET RESEARCH
   ============================================================ */

export const searchBotMarket = (options = {}) =>
  req("/market/search", {
    method: "POST",
    body: JSON.stringify({ options })
  });

/* ============================================================
   STOCK MARKET RESEARCH
   ============================================================ */

export const searchBotStockMarket = (options = {}) =>
  req("/stock/research", {
    method: "POST",
    body: JSON.stringify(options)
  });

export const discoverBotStockMarket = (options = {}) =>
  req("/stock/discover", {
    method: "POST",
    body: JSON.stringify(options)
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
  req(`/setups/${encodeURIComponent(setupId)}/scenario`, {
    method: "POST",
    body: JSON.stringify({
      capitalUsd,
      leverage,
      feeRatePercent
    })
  });

/* ============================================================
   MONITORING
   ============================================================ */

export const monitorSetup = (
  setupId,
  { capitalUsd, leverage, feeRatePercent } = {}
) =>
  req(`/setups/${encodeURIComponent(setupId)}/monitor`, {
    method: "POST",
    body: JSON.stringify({
      capitalUsd,
      leverage,
      feeRatePercent
    })
  });

export const getBotMonitors = () =>
  req("/monitoring");

export const getBotMonitor = (id) =>
  req(`/monitoring/${encodeURIComponent(id)}`);

export const refreshBotMonitor = (id, options = {}) =>
  req(`/monitoring/${encodeURIComponent(id)}/refresh`, {
    method: "POST",
    body: JSON.stringify({ options })
  });

/* ============================================================
   MANUAL HISTORY
   ============================================================ */

export const getBotManualHistory = () =>
  req("/manual-history");

export const saveBotManualResult = (monitorId, data) =>
  req(`/manual-history/${encodeURIComponent(monitorId)}/result`, {
    method: "POST",
    body: JSON.stringify(data)
  });

/* ============================================================
   DASHBOARD AND HISTORY
   ============================================================ */

export const getBotDashboard = () =>
  req("/dashboard");

export const getBotHistory = () =>
  req("/history");

export const getTradeExplanation = (id) =>
  req(`/positions/${encodeURIComponent(id)}/explanation`);

/* ============================================================
   ACCOUNT CONTROLS
   ============================================================ */

export const setBotAllocation = (allocationUsd) =>
  req("/controls/allocation", {
    method: "PUT",
    body: JSON.stringify({
      allocationUsd: Number(allocationUsd)
    })
  });

export const pauseBot = () =>
  req("/controls/pause", {
    method: "POST"
  });

export const resumeBot = () =>
  req("/controls/resume", {
    method: "POST"
  });

export const closeBotPosition = (id) =>
  req(`/positions/${encodeURIComponent(id)}/close`, {
    method: "POST"
  });

export const emergencyStopBot = () =>
  req("/controls/emergency-stop", {
    method: "POST"
  });

/* V2 research: use the SAME API host, Supabase bearer and bot unlock session. */
export const botV2Post = (path, payload) =>
  req(`/v2/${path.replace(/^\/+/, "")}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
