/**
 * Authoritative U.S. equity market clock backed by Alpaca Trading API.
 *
 * IMPORTANT:
 * - Market session status is independent of quote freshness.
 * - Provider failure returns UNKNOWN, never CLOSED.
 * - This service does not grant execution authority.
 */

const DEFAULT_ALPACA_TRADING_BASE_URL =
  "https://paper-api.alpaca.markets";

export const MARKET_CLOCK_STATUS = Object.freeze({
  OPEN: "OPEN",
  CLOSED: "CLOSED",
  UNKNOWN: "UNKNOWN",
});

function nowIso() {
  return new Date().toISOString();
}

function safeErrorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function credentials() {
  const key =
    process.env.APCA_API_KEY_ID ??
    process.env.ALPACA_API_KEY ??
    "";

  const secret =
    process.env.APCA_API_SECRET_KEY ??
    process.env.ALPACA_SECRET_KEY ??
    "";

  if (!key || !secret) {
    throw new Error(
      "Alpaca API credentials are unavailable.",
    );
  }

  return { key, secret };
}

function baseUrl() {
  return String(
    process.env.ALPACA_TRADING_BASE_URL ??
      DEFAULT_ALPACA_TRADING_BASE_URL,
  ).replace(/\/+$/, "");
}

export async function getMarketClock({
  signal = undefined,
} = {}) {
  const requestedAt = nowIso();

  try {
    const { key, secret } = credentials();

    const response = await fetch(
      `${baseUrl()}/v2/clock`,
      {
        method: "GET",
        headers: {
          "APCA-API-KEY-ID": key,
          "APCA-API-SECRET-KEY": secret,
          Accept: "application/json",
        },
        signal,
      },
    );

    const text = await response.text();

    let payload = null;

    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(
        `Alpaca market clock returned non-JSON data (${response.status}).`,
      );
    }

    if (!response.ok) {
      throw new Error(
        payload?.message ??
          payload?.error ??
          `Alpaca market clock failed with HTTP ${response.status}.`,
      );
    }

    if (typeof payload?.is_open !== "boolean") {
      throw new Error(
        "Alpaca market clock did not provide is_open.",
      );
    }

    return {
      approved: true,
      service: "MARKET_CLOCK",
      provider: "ALPACA",
      status: payload.is_open
        ? MARKET_CLOCK_STATUS.OPEN
        : MARKET_CLOCK_STATUS.CLOSED,
      isOpen: payload.is_open,
      timestamp: payload.timestamp ?? null,
      nextOpen: payload.next_open ?? null,
      nextClose: payload.next_close ?? null,
      requestedAt,
      completedAt: nowIso(),
      warnings: [],
      errors: [],
    };
  } catch (error) {
    return {
      approved: false,
      service: "MARKET_CLOCK",
      provider: "ALPACA",
      status: MARKET_CLOCK_STATUS.UNKNOWN,
      isOpen: null,
      timestamp: null,
      nextOpen: null,
      nextClose: null,
      requestedAt,
      completedAt: nowIso(),
      warnings: [
        "Market session could not be verified. UNKNOWN must not be treated as CLOSED.",
      ],
      errors: [safeErrorMessage(error)],
    };
  }
}

export default getMarketClock;
