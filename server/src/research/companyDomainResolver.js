// server/src/research/companyDomainResolver.js

import getCompanyProfile from
  "../data/providers/companyProfileProvider.js";

export const COMPANY_DOMAIN_RESOLVER_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    NOT_FOUND:
      "NOT_FOUND",

    INVALID_REQUEST:
      "INVALID_REQUEST",

    ERROR:
      "ERROR",
  });

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
  return (
    normalizeString(
      value,
    )
      ?.toUpperCase() ??
    null
  );
}

function safeErrorMessage(
  error,
) {
  return error instanceof Error
    ? error.message
    : String(
        error,
      );
}

/**
 * ============================================================
 * WEBSITE NORMALIZATION
 * ============================================================
 */

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
    const hasProtocol =
      raw.startsWith(
        "http://",
      ) ||
      raw.startsWith(
        "https://",
      );

    const url =
      new URL(
        hasProtocol
          ? raw
          : `https://${raw}`,
      );

    if (
      url.protocol !==
        "https:" &&
      url.protocol !==
        "http:"
    ) {
      return null;
    }

    /**
     * Remove fragments because they do not identify
     * a different official domain.
     */

    url.hash =
      "";

    return url.toString();
  } catch {
    return null;
  }
}

/**
 * ============================================================
 * DOMAIN NORMALIZATION
 * ============================================================
 */

function extractDomain(
  website,
) {
  const normalized =
    normalizeWebsite(
      website,
    );

  if (!normalized) {
    return null;
  }

  try {
    return new URL(
      normalized,
    )
      .hostname
      .toLowerCase()
      .replace(
        /^www\./,
        "",
      );
  } catch {
    return null;
  }
}

/**
 * ============================================================
 * PROFILE EXTRACTION
 * ============================================================
 */

function extractProfileData(
  profileResult,
) {
  if (
    !profileResult ||
    typeof profileResult !==
      "object"
  ) {
    return null;
  }

  /**
   * Primary expected contract from companyProfileProvider.js:
   *
   * {
   *   approved: true,
   *   data: {
   *     companyName,
   *     officialWebsite,
   *     domain,
   *     ...
   *   }
   * }
   *
   * A few defensive fallbacks remain so this resolver is not
   * tightly coupled to one exact wrapper shape.
   */

  const data =
    profileResult
      ?.data
      ?.data ??
    profileResult
      ?.data ??
    profileResult
      ?.profile ??
    null;

  if (
    !data ||
    typeof data !==
      "object"
  ) {
    return null;
  }

  return data;
}

/**
 * ============================================================
 * MAIN RESOLVER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Resolve:
 *
 * trading symbol
 *      ↓
 * trusted company profile
 *      ↓
 * official website
 *      ↓
 * normalized company domain
 *
 * This resolver does NOT guess domains from company names.
 *
 * If the company profile provider cannot establish an official
 * website, this service returns NOT_FOUND.
 */

export async function resolveCompanyDomain({
  symbol,

  profileProvider =
    getCompanyProfile,
} = {}) {
  const startedAt =
    now();

  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  /**
   * ==========================================================
   * INVALID REQUEST
   * ==========================================================
   */

  if (!normalizedSymbol) {
    return {
      approved:
        false,

      provider:
        "COMPANY_DOMAIN_RESOLVER",

      status:
        COMPANY_DOMAIN_RESOLVER_STATUS
          .INVALID_REQUEST,

      symbol:
        null,

      website:
        null,

      domain:
        null,

      companyName:
        null,

      exchange:
        null,

      country:
        null,

      industry:
        null,

      source:
        null,

      confidence:
        0,

      profile:
        null,

      warnings:
        [],

      errors: [
        "A stock symbol is required.",
      ],

      startedAt,

      timestamp:
        now(),
    };
  }

  /**
   * ==========================================================
   * PROVIDER CONTRACT
   * ==========================================================
   */

  if (
    typeof profileProvider !==
    "function"
  ) {
    return {
      approved:
        false,

      provider:
        "COMPANY_DOMAIN_RESOLVER",

      status:
        COMPANY_DOMAIN_RESOLVER_STATUS
          .ERROR,

      symbol:
        normalizedSymbol,

      website:
        null,

      domain:
        null,

      companyName:
        null,

      exchange:
        null,

      country:
        null,

      industry:
        null,

      source:
        null,

      confidence:
        0,

      profile:
        null,

      warnings: [
        "Company profile provider is unavailable.",
      ],

      errors: [
        "profileProvider must be a function.",
      ],

      startedAt,

      timestamp:
        now(),
    };
  }

  try {
    /**
     * ========================================================
     * LOAD TRUSTED COMPANY PROFILE
     * ========================================================
     */

    const profileResult =
      await profileProvider({
        symbol:
          normalizedSymbol,
      });

    const profile =
      extractProfileData(
        profileResult,
      );

    const companyName =
      normalizeString(
        profile
          ?.companyName ??
        profile
          ?.name ??
        profile
          ?.legalName,
      );

    const website =
      normalizeWebsite(
        profile
          ?.officialWebsite ??
        profile
          ?.website ??
        profile
          ?.weburl ??
        null,
      );

    const domain =
      normalizeString(
        profile
          ?.domain,
      )
        ?.toLowerCase() ??
      extractDomain(
        website,
      );

    const source =
      normalizeString(
        profile
          ?.source
          ?.provider ??
        profileResult
          ?.provider ??
        null,
      );

    /**
     * ========================================================
     * NO VERIFIED WEBSITE
     * ========================================================
     *
     * Do not manufacture or infer one from companyName.
     */

    if (
      !website ||
      !domain
    ) {
      return {
        approved:
          false,

        provider:
          "COMPANY_DOMAIN_RESOLVER",

        status:
          COMPANY_DOMAIN_RESOLVER_STATUS
            .NOT_FOUND,

        symbol:
          normalizedSymbol,

        website:
          null,

        domain:
          null,

        companyName,

        exchange:
          normalizeString(
            profile
              ?.exchange,
          ),

        country:
          normalizeString(
            profile
              ?.country ??
            profile
              ?.countryCode,
          ),

        industry:
          normalizeString(
            profile
              ?.industry,
          ),

        source,

        confidence:
          0,

        profile:
          profile ??
          null,

        warnings: [
          ...(
            Array.isArray(
              profileResult
                ?.warnings,
            )
              ? profileResult
                  .warnings
              : []
          ),

          "No verified official company website was returned by the company profile provider.",
        ],

        errors:
          Array.isArray(
            profileResult
              ?.errors,
          )
            ? profileResult
                .errors
            : [],

        startedAt,

        timestamp:
          now(),
      };
    }

    /**
     * ========================================================
     * CONFIDENCE
     * ========================================================
     *
     * We currently give full confidence only when the dedicated
     * company profile provider explicitly supplies the official
     * website.
     *
     * Later, this can become source-weighted:
     *
     * exchange metadata
     * regulator filing
     * provider profile
     * company-domain confirmation
     */

    const providerApproved =
      profileResult
        ?.approved ===
      true;

    const confidence =
      providerApproved
        ? 1
        : 0.8;

    /**
     * ========================================================
     * SUCCESS
     * ========================================================
     */

    return {
      approved:
        true,

      provider:
        "COMPANY_DOMAIN_RESOLVER",

      status:
        providerApproved
          ? COMPANY_DOMAIN_RESOLVER_STATUS
              .COMPLETE
          : COMPANY_DOMAIN_RESOLVER_STATUS
              .PARTIAL,

      symbol:
        normalizedSymbol,

      website,

      domain,

      companyName,

      exchange:
        normalizeString(
          profile
            ?.exchange,
        ),

      country:
        normalizeString(
          profile
            ?.country ??
          profile
            ?.countryCode,
        ),

      industry:
        normalizeString(
          profile
            ?.industry,
        ),

      currency:
        normalizeString(
          profile
            ?.currency,
        ),

      marketCapitalization:
        Number.isFinite(
          Number(
            profile
              ?.marketCapitalization,
          ),
        )
          ? Number(
              profile
                .marketCapitalization,
            )
          : null,

      source,

      confidence,

      profile,

      warnings:
        Array.isArray(
          profileResult
            ?.warnings,
        )
          ? profileResult
              .warnings
          : [],

      errors:
        [],

      startedAt,

      timestamp:
        now(),
    };
  } catch (error) {
    /**
     * ========================================================
     * FAIL CLOSED
     * ========================================================
     */

    return {
      approved:
        false,

      provider:
        "COMPANY_DOMAIN_RESOLVER",

      status:
        COMPANY_DOMAIN_RESOLVER_STATUS
          .ERROR,

      symbol:
        normalizedSymbol,

      website:
        null,

      domain:
        null,

      companyName:
        null,

      exchange:
        null,

      country:
        null,

      industry:
        null,

      source:
        null,

      confidence:
        0,

      profile:
        null,

      warnings: [
        "Official company domain resolution failed safely.",
      ],

      errors: [
        safeErrorMessage(
          error,
        ),
      ],

      startedAt,

      timestamp:
        now(),
    };
  }
}

export default
  resolveCompanyDomain;