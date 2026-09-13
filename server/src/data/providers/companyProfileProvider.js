// server/src/data/providers/companyProfileProvider.js

/**
 * ============================================================
 * COMPANY PROFILE PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Resolve trusted company identity/profile metadata:
 *
 * - company name
 * - official website
 * - industry
 * - country
 * - exchange
 * - market capitalization
 *
 * This provider does NOT perform fundamental scoring.
 * SEC remains the primary financial/regulatory source.
 */

export const COMPANY_PROFILE_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    NOT_FOUND:
      "NOT_FOUND",

    AUTH_MISSING:
      "AUTH_MISSING",

    INVALID_REQUEST:
      "INVALID_REQUEST",

    PROVIDER_ERROR:
      "PROVIDER_ERROR",
  });

const DEFAULT_FINNHUB_BASE_URL =
  "https://finnhub.io/api/v1";

const DEFAULT_TIMEOUT_MS =
  12_000;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function normalizeString(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim();

  return normalized ||
    null;
}

function normalizeSymbol(
  value,
) {
  return normalizeString(
    value,
  )
    ?.toUpperCase() ??
    null;
}

function finiteOrNull(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function safeErrorMessage(
  error,
) {
  return error instanceof Error
    ? error.message
    : String(error);
}

function normalizeWebsite(
  value,
) {
  const raw =
    normalizeString(
      value,
    );

  if (!raw) {
    return null;
  }

  try {
    const url =
      new URL(
        raw.startsWith("http://") ||
        raw.startsWith("https://")
          ? raw
          : `https://${raw}`,
      );

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    url.hash =
      "";

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * ============================================================
 * FETCH WITH TIMEOUT
 * ============================================================
 */

async function fetchJson({
  url,
  timeoutMs,
}) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        url,
        {
          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json",
          },
        },
      );

    if (!response.ok) {
      throw new Error(
        `Company profile provider returned HTTP ${response.status}.`,
      );
    }

    return await response.json();
  } finally {
    clearTimeout(
      timer,
    );
  }
}

/**
 * ============================================================
 * NORMALIZE FINNHUB PROFILE
 * ============================================================
 */

function normalizeFinnhubProfile({
  symbol,
  data,
}) {
  if (
    !data ||
    typeof data !==
      "object"
  ) {
    return null;
  }

  const website =
    normalizeWebsite(
      data.weburl,
    );

  const companyName =
    normalizeString(
      data.name,
    );

  /**
   * Finnhub commonly returns an empty object for an unresolved
   * symbol.
   */

  if (
    !companyName &&
    !website
  ) {
    return null;
  }

  let domain =
    null;

  if (website) {
    try {
      domain =
        new URL(
          website,
        )
          .hostname
          .replace(
            /^www\./,
            "",
          );
    } catch {
      domain =
        null;
    }
  }

  return {
    symbol,

    companyName,

    officialWebsite:
      website,

    domain,

    exchange:
      normalizeString(
        data.exchange,
      ),

    country:
      normalizeString(
        data.country,
      ),

    currency:
      normalizeString(
        data.currency,
      ),

    industry:
      normalizeString(
        data.finnhubIndustry,
      ),

    marketCapitalization:
      finiteOrNull(
        data.marketCapitalization,
      ),

    ipoDate:
      normalizeString(
        data.ipo,
      ),

    logo:
      normalizeWebsite(
        data.logo,
      ),

    phone:
      normalizeString(
        data.phone,
      ),

    shareOutstanding:
      finiteOrNull(
        data.shareOutstanding,
      ),

    source: {
      provider:
        "FINNHUB",

      sourceType:
        "COMPANY_PROFILE",

      retrievedAt:
        now(),
    },
  };
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getCompanyProfile({
  symbol,

  timeoutMs =
    DEFAULT_TIMEOUT_MS,
} = {}) {
  const startedAt =
    now();

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (!normalizedSymbol) {
    return {
      approved:
        false,

      provider:
        "COMPANY_PROFILE",

      status:
        COMPANY_PROFILE_STATUS
          .INVALID_REQUEST,

      symbol:
        null,

      data:
        null,

      warnings:
        [],

      errors: [
        "A stock symbol is required.",
      ],

      startedAt,

      fetchedAt:
        now(),
    };
  }

  const apiKey =
    normalizeString(
      process.env
        .FINNHUB_API_KEY,
    );

  if (!apiKey) {
    return {
      approved:
        false,

      provider:
        "COMPANY_PROFILE",

      status:
        COMPANY_PROFILE_STATUS
          .AUTH_MISSING,

      symbol:
        normalizedSymbol,

      data:
        null,

      warnings: [
        "FINNHUB_API_KEY is not configured.",
      ],

      errors:
        [],

      startedAt,

      fetchedAt:
        now(),
    };
  }

  try {
    const baseUrl =
      (
        process.env
          .FINNHUB_BASE_URL ??
        DEFAULT_FINNHUB_BASE_URL
      ).replace(
        /\/+$/,
        "",
      );

    const url =
      new URL(
        `${baseUrl}/stock/profile2`,
      );

    url.searchParams.set(
      "symbol",
      normalizedSymbol,
    );

    url.searchParams.set(
      "token",
      apiKey,
    );

    const raw =
      await fetchJson({
        url:
          url.toString(),

        timeoutMs,
      });

    const data =
      normalizeFinnhubProfile({
        symbol:
          normalizedSymbol,

        data:
          raw,
      });

    if (!data) {
      return {
        approved:
          false,

        provider:
          "COMPANY_PROFILE",

        status:
          COMPANY_PROFILE_STATUS
            .NOT_FOUND,

        symbol:
          normalizedSymbol,

        data:
          null,

        warnings: [
          "No company profile was returned for this symbol.",
        ],

        errors:
          [],

        startedAt,

        fetchedAt:
          now(),
      };
    }

    const completeness =
      [
        data.companyName,
        data.officialWebsite,
        data.exchange,
        data.country,
        data.industry,
      ].filter(Boolean)
        .length;

    return {
      approved:
        true,

      provider:
        "COMPANY_PROFILE",

      status:
        completeness >= 4
          ? COMPANY_PROFILE_STATUS
              .COMPLETE
          : COMPANY_PROFILE_STATUS
              .PARTIAL,

      symbol:
        normalizedSymbol,

      data,

      warnings:
        data.officialWebsite
          ? []
          : [
              "Company profile was returned without an official website.",
            ],

      errors:
        [],

      startedAt,

      fetchedAt:
        now(),
    };
  } catch (error) {
    return {
      approved:
        false,

      provider:
        "COMPANY_PROFILE",

      status:
        COMPANY_PROFILE_STATUS
          .PROVIDER_ERROR,

      symbol:
        normalizedSymbol,

      data:
        null,

      warnings: [
        "Company profile lookup failed safely.",
      ],

      errors: [
        safeErrorMessage(
          error,
        ),
      ],

      startedAt,

      fetchedAt:
        now(),
    };
  }
}

export default
  getCompanyProfile;