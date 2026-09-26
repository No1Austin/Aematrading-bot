import BOT_CONFIG from "../config/botConfig.js";

const BASE_URL = process.env.AEMA_BOT_BINANCE_FUTURES_BASE_URL || "https://fapi.binance.com";
const num = value => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

async function getJson(endpoint, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`BINANCE_HTTP_${response.status}:${endpoint}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Final, fail-closed paper-order validation against fresh market prices.
 * Keeps the existing candidate/revalidation contract and NEVER sends orders.
 * This checks modeled stop risk, not a guarantee against gaps or slippage.
 */
export async function revalidateBotOrder(candidate, options = {}) {
  const cfg = { ...BOT_CONFIG.revalidation, ...options };
  const s = candidate?.setup || {};
  const r = candidate?.riskPlan || {};
  const symbol = candidate?.symbol;
  const blockers = [];

  if (!symbol || typeof symbol !== "string" || !/^[A-Za-z0-9_]+$/.test(symbol)) {
    blockers.push("SYMBOL_REQUIRED");
  }
  if (!s.approved) blockers.push("SETUP_NOT_APPROVED");
  if (!r.approved) blockers.push("RISK_PLAN_NOT_APPROVED");
  if (s.direction !== "LONG" && s.direction !== "SHORT") {
    blockers.push("INVALID_DIRECTION");
  }

  // Invalid candidates must not initiate exchange-data requests.
  if (blockers.length) {
    return {
      ...candidate,
      revalidation: {
        approved: false, status: "REVALIDATION_BLOCKED",
        freshEntry: null, markPrice: null, bid: null, ask: null,
        spreadPercent: null, entryDriftPercent: null,
        freshPlannedRiskUsd: null, freshMarginRequiredUsd: null,
        freshNotionalUsd: null, blockers,
        observedAt: new Date().toISOString(), paperOnly: true, liveExecution: false,
      },
    };
  }

  const timeoutMs = num(cfg.timeoutMs);
  if (!(timeoutMs > 0)) throw new Error("INVALID_REVALIDATION_TIMEOUT");

  const [premium, book] = await Promise.all([
    getJson(`/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`, timeoutMs),
    getJson(`/fapi/v1/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`, timeoutMs),
  ]);

  const mark = num(premium?.markPrice);
  const bid = num(book?.bidPrice);
  const ask = num(book?.askPrice);
  const mid = bid > 0 && ask > 0 ? (bid + ask) / 2 : null;
  const spread = mid > 0 ? ((ask - bid) / mid) * 100 : null;
  const freshEntry = s.direction === "LONG" ? ask : bid;
  const setupEntry = num(s.entry);
  const stop = num(s.stop);
  const target = num(s.target);
  const drift = setupEntry > 0 && freshEntry > 0
    ? Math.abs(freshEntry - setupEntry) / setupEntry * 100
    : null;

  if (!(mark > 0 && bid > 0 && ask > 0 && ask >= bid && freshEntry > 0)) {
    blockers.push("INVALID_FRESH_PRICE");
  }
  const maxSpread = num(cfg.maximumSpreadPercent);
  if (!(maxSpread >= 0 && spread !== null && spread >= 0 && spread <= maxSpread)) {
    blockers.push("SPREAD_REVALIDATION_FAILED");
  }
  const maxDrift = num(cfg.maximumEntryDriftPercent);
  if (!(maxDrift >= 0 && drift !== null && drift >= 0 && drift <= maxDrift)) {
    blockers.push("ENTRY_DRIFT_TOO_LARGE");
  }
  if (s.direction === "LONG" && !(stop > 0 && stop < freshEntry && target > freshEntry)) {
    blockers.push("LONG_GEOMETRY_INVALIDATED");
  }
  if (s.direction === "SHORT" && !(stop > freshEntry && target > 0 && target < freshEntry)) {
    blockers.push("SHORT_GEOMETRY_INVALIDATED");
  }

  const quantity = num(r.quantity);
  const leverage = num(r.leverage);
  const riskBudget = num(r.riskBudgetUsd);
  const availableMargin = num(r.availableMarginUsd);
  const equity = num(r.equityUsd);
  const maxPositionPct = num(BOT_CONFIG.account.maximumPositionNotionalPercent);
  const maxMarginPct = num(BOT_CONFIG.account.maximumMarginPercent);
  const minLeverage = num(BOT_CONFIG.account.minimumLeverage);
  const maxLeverage = num(BOT_CONFIG.account.maximumLeverage);

  let freshPlannedRisk = null;
  let freshMargin = null;
  let freshNotional = null;

  if (!(quantity > 0 && leverage > 0 && riskBudget > 0 && availableMargin > 0 &&
        equity > 0 && maxPositionPct > 0 && maxMarginPct > 0 &&
        minLeverage > 0 && maxLeverage >= minLeverage &&
        leverage >= minLeverage && leverage <= maxLeverage)) {
    blockers.push("INVALID_REVALIDATED_RISK_INPUTS");
  } else if (freshEntry > 0 && stop > 0) {
    freshNotional = freshEntry * quantity;
    freshMargin = freshNotional / leverage;
    freshPlannedRisk = Math.abs(freshEntry - stop) * quantity;
    if (freshPlannedRisk > riskBudget + 1e-8) {
      blockers.push("FRESH_ENTRY_RISK_BUDGET_EXCEEDED");
    }
    if (freshMargin > availableMargin + 1e-8 ||
        freshMargin > equity * maxMarginPct / 100 + 1e-8) {
      blockers.push("FRESH_ENTRY_MARGIN_EXCEEDED");
    }
    if (freshNotional > equity * maxPositionPct / 100 + 1e-8) {
      blockers.push("FRESH_ENTRY_NOTIONAL_EXCEEDED");
    }
  } else {
    blockers.push("INVALID_REVALIDATED_RISK_INPUTS");
  }

  return {
    ...candidate,
    revalidation: {
      approved: blockers.length === 0,
      status: blockers.length ? "REVALIDATION_BLOCKED" : "REVALIDATION_READY",
      freshEntry, markPrice: mark, bid, ask,
      spreadPercent: spread, entryDriftPercent: drift,
      freshPlannedRiskUsd: freshPlannedRisk,
      freshMarginRequiredUsd: freshMargin,
      freshNotionalUsd: freshNotional,
      blockers, observedAt: new Date().toISOString(),
      paperOnly: true, liveExecution: false,
    },
  };
}

export default revalidateBotOrder;
