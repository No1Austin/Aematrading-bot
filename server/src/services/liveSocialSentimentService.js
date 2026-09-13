// server/src/services/liveSocialSentimentService.js

import getAdanosSocialSnapshots
  from "../data/providers/social/adanosSocialAdapter.js";

import getSocialSentimentData
  from "../data/providers/socialSentimentDataProvider.js";

import analyzeSocialSentiment
  from "../analysis/socialSentimentEngine.js";

/**
 * ============================================================
 * LIVE SOCIAL SENTIMENT SERVICE
 * ============================================================
 *
 * PURPOSE
 * -------
 * One clean entry point for:
 *
 * ticker
 *   -> Adanos Reddit + X
 *   -> socialSentimentDataProvider
 *   -> socialSentimentEngine
 *
 * This service does NOT place trades and does NOT alter scoring.
 * It only returns verified social intelligence.
 *
 * Cost control is delegated to adanosSocialAdapter.js, which has
 * an in-memory TTL cache and can selectively disable Reddit/X.
 */

export const LIVE_SOCIAL_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    CONFIG_ERROR:
      "CONFIG_ERROR",

    ERROR:
      "ERROR",
  });

function normalizedSymbol(
  value,
) {
  const symbol =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase()
      .replace(
        /^\$/,
        "",
      );

  return symbol || null;
}

function safeTimestamp(
  value,
) {
  const date =
    new Date(
      value,
    );

  return Number.isFinite(
    date.getTime(),
  )
    ? date.toISOString()
    : new Date()
        .toISOString();
}

export default async function getLiveSocialSentiment({
  symbol,
  apiKey =
    process.env
      .ADANOS_API_KEY,

  now =
    Date.now(),

  /**
   * Pass through to adanosSocialAdapter.
   * Useful for quota control:
   *
   * {
   *   includeReddit: true,
   *   includeX: true,
   *   cacheTtlMs: 300000
   * }
   */
  adanosConfig = {},

  /**
   * Dependency injection for tests.
   * Production uses global fetch.
   */
  fetchImpl =
    globalThis.fetch,
} = {}) {
  const ticker =
    normalizedSymbol(
      symbol,
    );

  const timestamp =
    safeTimestamp(
      now,
    );

  if (!ticker) {
    return {
      approved: false,

      service:
        "LIVE_SOCIAL_SENTIMENT",

      status:
        LIVE_SOCIAL_STATUS
          .INSUFFICIENT_DATA,

      symbol: null,

      sourceResult: null,

      providerResult: null,

      engineResult: null,

      warnings: [
        "A valid symbol is required for live social sentiment.",
      ],

      errors: [],

      fetchedAt:
        timestamp,
    };
  }

  try {
    /**
     * ========================================================
     * 1. LIVE ADANOS ACQUISITION
     * ========================================================
     */
    const sourceResult =
      await getAdanosSocialSnapshots({
        symbol:
          ticker,

        apiKey,

        now,

        config:
          adanosConfig,

        fetchImpl,
      });

    if (
      sourceResult
        ?.approved !== true ||
      !Array.isArray(
        sourceResult
          ?.snapshots,
      ) ||
      sourceResult
        .snapshots
        .length === 0
    ) {
      return {
        approved: false,

        service:
          "LIVE_SOCIAL_SENTIMENT",

        status:
          sourceResult
            ?.status ===
            "CONFIG_ERROR"
              ? LIVE_SOCIAL_STATUS
                  .CONFIG_ERROR
              : LIVE_SOCIAL_STATUS
                  .INSUFFICIENT_DATA,

        symbol:
          ticker,

        sourceResult,

        providerResult: null,

        engineResult: null,

        warnings: [
          ...(
            sourceResult
              ?.warnings ??
            []
          ),

          "No usable live Adanos social snapshots were available.",
        ],

        errors: [
          ...(
            sourceResult
              ?.errors ??
            []
          ),
        ],

        fetchedAt:
          sourceResult
            ?.fetchedAt ??
          timestamp,
      };
    }

    /**
     * ========================================================
     * 2. EXISTING SOCIAL DATA PROVIDER
     * ========================================================
     */
    const providerResult =
      await getSocialSentimentData({
        symbol:
          ticker,

        platformSnapshots:
          sourceResult
            .snapshots,

        fetchedAt:
          sourceResult
            .fetchedAt ??
          timestamp,
      });

    if (
      providerResult
        ?.approved !== true ||
      !providerResult
        ?.data
    ) {
      return {
        approved: false,

        service:
          "LIVE_SOCIAL_SENTIMENT",

        status:
          LIVE_SOCIAL_STATUS
            .INSUFFICIENT_DATA,

        symbol:
          ticker,

        sourceResult,

        providerResult,

        engineResult: null,

        warnings: [
          ...(
            sourceResult
              ?.warnings ??
            []
          ),

          ...(
            providerResult
              ?.warnings ??
            []
          ),
        ],

        errors: [
          ...(
            sourceResult
              ?.errors ??
            []
          ),

          ...(
            providerResult
              ?.errors ??
            []
          ),
        ],

        fetchedAt:
          providerResult
            ?.fetchedAt ??
          timestamp,
      };
    }

    /**
     * ========================================================
     * 3. EXISTING SOCIAL SENTIMENT ENGINE
     * ========================================================
     */
    const engineResult =
      analyzeSocialSentiment({
        symbol:
          ticker,

        sentiment:
          providerResult
            .data
            .sentiment,

        mentions:
          providerResult
            .data
            .mentions,

        platforms:
          providerResult
            .data
            .platforms,

        manipulation:
          providerResult
            .data
            .manipulation,

        manipulationCoverage:
          providerResult
            .data
            .manipulationCoverage,
      });

    const approved =
      engineResult
        ?.approved ===
      true;

    return {
      approved,

      service:
        "LIVE_SOCIAL_SENTIMENT",

      status:
        approved
          ? (
              sourceResult
                ?.status ===
                "PARTIAL" ||
              providerResult
                ?.status ===
                "PARTIAL"
                ? LIVE_SOCIAL_STATUS
                    .PARTIAL
                : LIVE_SOCIAL_STATUS
                    .COMPLETE
            )
          : LIVE_SOCIAL_STATUS
              .INSUFFICIENT_DATA,

      symbol:
        ticker,

      /**
       * Compact result used by a runner/orchestrator.
       */
      social:
        approved
          ? {
              direction:
                engineResult
                  ?.direction ??
                null,

              confidence:
                engineResult
                  ?.confidence ??
                0,

              rawScore:
                engineResult
                  ?.rawScore ??
                0,

              directionalSupport:
                engineResult
                  ?.directionalSupport ??
                {
                  long: 0,
                  short: 0,
                },

              crowdState:
                engineResult
                  ?.crowdState ??
                null,

              manipulationRisk:
                engineResult
                  ?.manipulationRisk ??
                null,

              activity:
                engineResult
                  ?.activity ??
                null,

              platformAgreement:
                engineResult
                  ?.platformAgreement ??
                null,

              platformCount:
                providerResult
                  ?.platformCount ??
                0,
            }
          : null,

      /**
       * Full evidence retained for debugging/frontend/audit.
       */
      sourceResult,

      providerResult,

      engineResult,

      warnings: [
        ...(
          sourceResult
            ?.warnings ??
          []
        ),

        ...(
          providerResult
            ?.warnings ??
          []
        ),

        ...(
          engineResult
            ?.warnings ??
          []
        ),
      ],

      errors: [
        ...(
          sourceResult
            ?.errors ??
          []
        ),

        ...(
          providerResult
            ?.errors ??
          []
        ),

        ...(
          engineResult
            ?.errors ??
          []
        ),
      ],

      fetchedAt:
        sourceResult
          ?.fetchedAt ??
        timestamp,
    };
  } catch (error) {
    return {
      approved: false,

      service:
        "LIVE_SOCIAL_SENTIMENT",

      status:
        LIVE_SOCIAL_STATUS
          .ERROR,

      symbol:
        ticker,

      social: null,

      sourceResult: null,

      providerResult: null,

      engineResult: null,

      warnings: [
        "Live social sentiment failed safely.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      fetchedAt:
        timestamp,
    };
  }
}
