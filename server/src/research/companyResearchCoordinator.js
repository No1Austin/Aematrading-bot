// server/src/research/companyResearchCoordinator.js

import getAggregatedCompanyFundamentalData
  from "../data/providers/companyFundamentalAggregator.js";

import {
  getMarketNews,
} from "../data/providers/alpacaMarketNewsProvider.js";

import {
  getSocialSentimentData,
} from "../data/providers/socialSentimentDataProvider.js";

import researchCompanyWebsite from
  "./companyWebsiteResearchProvider.js";

  import getAdverseIntelligence from
  "./adverseIntelligenceProvider.js";


  import getWebIntelligence from
  "./webIntelligenceProvider.js";
/**
 * ============================================================
 * COMPANY RESEARCH COORDINATOR
 * ============================================================
 *
 * Purpose:
 *
 * User searches symbol
 *        ↓
 * Company Research Coordinator
 *        ↓
 * ┌───────────────────────────────────────┐
 * │ Existing internal intelligence       │
 * │                                       │
 * │ Fundamentals                          │
 * │ News                                  │
 * │ Social intelligence                   │
 * └───────────────────────────────────────┘
 *        ↓
 * External due-diligence providers
 *        ↓
 * Evidence normalization
 *        ↓
 * Research dossier
 *
 * IMPORTANT:
 *
 * This service is RESEARCH ONLY.
 *
 * It does not:
 * - approve trades
 * - reject trades
 * - execute orders
 * - modify positions
 * - modify scanner candidates
 *
 * It is intentionally separate from DeepResearchCoordinator.
 * ============================================================
 */

export const COMPANY_RESEARCH_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    PARTIAL: "PARTIAL",
    NO_DATA: "NO_DATA",
    INVALID_REQUEST: "INVALID_REQUEST",
    ERROR: "ERROR",
  });

const DEFAULT_OPTIONS =
  Object.freeze({
    newsLimit: 30,
    includeFundamentals: true,
    includeNews: true,
    includeSocial: true,
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date().toISOString();
}

function normalizeSymbol(
  value,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const symbol =
    value
      .trim()
      .toUpperCase();

  if (
    !symbol ||
    symbol.length > 20
  ) {
    return null;
  }

  return symbol;
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

function normalizeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function uniqueStrings(
  values,
) {
  return [
    ...new Set(
      normalizeArray(
        values,
      )
        .filter(
          value =>
            typeof value ===
              "string" &&
            value.trim(),
        )
        .map(
          value =>
            value.trim(),
        ),
    ),
  ];
}

async function safeProviderCall({
  name,
  provider,
  args,
}) {
  if (
    typeof provider !==
    "function"
  ) {
    return {
      approved: false,
      provider: name,
      status:
        "PROVIDER_UNAVAILABLE",
      data: null,
      warnings: [
        `${name} provider is unavailable.`,
      ],
      errors: [],
    };
  }

  try {
    const result =
      await provider(
        args,
      );

    return {
      approved:
        result?.approved ===
        true,

      provider:
        name,

      status:
        result?.status ??
        (
          result?.approved ===
          true
            ? "COMPLETE"
            : "NO_DATA"
        ),

      data:
        result ?? null,

      warnings:
        normalizeArray(
          result?.warnings,
        ),

      errors:
        normalizeArray(
          result?.errors,
        ),
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        name,

      status:
        "ERROR",

      data: null,

      warnings: [
        `${name} failed safely.`,
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
    };
  }
}

/**
 * ============================================================
 * NEWS NORMALIZATION
 * ============================================================
 */

function normalizeNewsArticle(
  article,
  symbol,
) {
  if (!article) {
    return null;
  }

  const headline =
    article.headline ??
    article.title ??
    null;

  const url =
    article.url ??
    article.link ??
    null;

  if (
    !headline &&
    !url
  ) {
    return null;
  }

  return {
    id:
      article.id ??
      null,

    symbol,

    category:
      "NEWS",

    type:
      "ARTICLE",

    headline,

    summary:
      article.summary ??
      article.description ??
      null,

    author:
      article.author ??
      null,

    source: {
      publisher:
        article.source ??
        article.publisher ??
        null,

      url,

      sourceType:
        "NEWS",

      authority:
        "SECONDARY",

      publishedAt:
        article.createdAt ??
        article.publishedAt ??
        article.timestamp ??
        null,
    },

    images:
      article.images ??
      [],

    raw:
      article,
  };
}

/**
 * ============================================================
 * EXTRACT NEWS
 * ============================================================
 */

function extractNewsArticles(
  result,
  symbol,
) {
  if (!result) {
    return [];
  }

  const possible =
    result?.data?.news ??
    result?.data?.articles ??
    result?.news ??
    result?.articles ??
    result?.data ??
    [];

  if (
    !Array.isArray(
      possible,
    )
  ) {
    return [];
  }

  return possible
    .map(
      article =>
        normalizeNewsArticle(
          article,
          symbol,
        ),
    )
    .filter(Boolean);
}

/**
 * ============================================================
 * FUNDAMENTAL SUMMARY
 * ============================================================
 */

function normalizeFundamentals(
  result,
) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return null;
  }

  /**
   * safeProviderCall() wraps the original provider result:
   *
   * {
   *   approved,
   *   provider,
   *   status,
   *   data: ORIGINAL_PROVIDER_RESULT
   * }
   *
   * The company fundamental aggregator itself normally returns:
   *
   * {
   *   approved,
   *   provider,
   *   status,
   *   data: {
   *     symbol,
   *     sector,
   *     industry,
   *     countryCode,
   *     revenue,
   *     earnings,
   *     freeCashFlow,
   *     margins,
   *     debt,
   *     ...
   *   }
   * }
   *
   * Keep extraction defensive in case another wrapper layer is
   * introduced later.
   */

  const payload =
    result
      ?.data
      ?.data
      ?.data ??
    result
      ?.data
      ?.data ??
    result
      ?.data ??
    result;

  if (
    !payload ||
    typeof payload !==
      "object"
  ) {
    return null;
  }

  /**
   * Fundamentals are structured objects in the current backend.
   * Do not coerce revenue/freeCashFlow/margins/debt to numbers,
   * otherwise useful SEC evidence is destroyed.
   */

  const hasUsefulData =
    Boolean(
      payload.symbol ||
      payload.countryCode ||
      payload.sector ||
      payload.industry ||
      payload.revenue ||
      payload.earnings ||
      payload.freeCashFlow ||
      payload.operatingCashFlow ||
      payload.margins ||
      payload.debt ||
      payload.interestCoverage ||
      payload.earningsSurprise ||
      payload.guidance ||
      payload.valuation ||
      payload.sensitivity ||
      payload.source
    );

  if (!hasUsefulData) {
    return null;
  }

  return {
    symbol:
      payload.symbol ??
      null,

    sector:
      payload.sector ??
      null,

    industry:
      payload.industry ??
      null,

    countryCode:
      payload.countryCode ??
      null,

    /**
     * Preserve the structured fundamental engine contract.
     */

    revenue:
      payload.revenue ??
      null,

    earnings:
      payload.earnings ??
      null,

    freeCashFlow:
      payload.freeCashFlow ??
      null,

    operatingCashFlow:
      payload.operatingCashFlow ??
      null,

    margins:
      payload.margins ??
      null,

    debt:
      payload.debt ??
      null,

    interestCoverage:
      payload.interestCoverage ??
      null,

    earningsSurprise:
      payload.earningsSurprise ??
      null,

    guidance:
      payload.guidance ??
      null,

    valuation:
      payload.valuation ??
      null,

    sensitivity:
      payload.sensitivity ??
      null,

    /**
     * Keep compatibility with any provider that still exposes
     * scalar company metrics.
     */

    marketCap:
      finiteOrNull(
        payload.marketCap ??
        payload.marketCapitalization,
      ),

    netIncome:
      finiteOrNull(
        payload.netIncome,
      ),

    totalAssets:
      finiteOrNull(
        payload.totalAssets,
      ),

    totalLiabilities:
      finiteOrNull(
        payload.totalLiabilities,
      ),

    shareholdersEquity:
      finiteOrNull(
        payload.shareholdersEquity,
      ),

    eps:
      finiteOrNull(
        payload.eps,
      ),

    peRatio:
      finiteOrNull(
        payload.peRatio,
      ),

    source:
      payload.source ??
      null,
  };
}

/**
 * ============================================================
 * RESEARCH SUMMARY
 * ============================================================
 */

function buildSummary({
  fundamentals,
  news,
  social,
  externalEvidence,
}) {
  const evidence =
    normalizeArray(
      externalEvidence,
    );

  const legal =
    evidence.filter(
      item =>
        item?.category ===
        "LEGAL",
    );

  const regulatory =
    evidence.filter(
      item =>
        item?.category ===
        "REGULATORY",
    );

  const controversies =
    evidence.filter(
      item =>
        item?.category ===
        "CONTROVERSY",
    );

  const positive =
    evidence.filter(
      item =>
        item?.sentiment ===
        "POSITIVE",
    );

  const negative =
    evidence.filter(
      item =>
        item?.sentiment ===
        "NEGATIVE",
    );

  const critical =
    evidence.filter(
      item =>
        item?.severity ===
        "CRITICAL",
    );

  return {
    hasFundamentals:
      Boolean(
        fundamentals,
      ),

    newsCount:
      normalizeArray(
        news,
      ).length,

    hasSocialData:
      Boolean(
        social,
      ),

    evidenceCount:
      evidence.length,

    positiveMentions:
      positive.length,

    negativeMentions:
      negative.length,

    legalIssues:
      legal.length,

    regulatoryIssues:
      regulatory.length,

    controversies:
      controversies.length,

    criticalIssues:
      critical.length,
  };
}

/**
 * ============================================================
 * FACTORY
 * ============================================================
 */

export function createCompanyResearchCoordinator({
  fundamentalProvider =
    getAggregatedCompanyFundamentalData,

  newsProvider =
    getMarketNews,

  socialProvider =
    getSocialSentimentData,


    
  websiteProvider =
    researchCompanyWebsite,

  legalProvider =
  getAdverseIntelligence,

  webIntelligenceProvider =
  getWebIntelligence,

} = {}) {
  return async function researchCompany({
    symbol,

    options = {},
  } = {}) {
    const startedAt =
      now();

    const normalizedSymbol =
      normalizeSymbol(
        symbol,
      );

    if (!normalizedSymbol) {
      return {
        success: false,

        approved: false,

        service:
          "COMPANY_RESEARCH",

        status:
          COMPANY_RESEARCH_STATUS
            .INVALID_REQUEST,

        symbol: null,

        summary: null,

        company: null,

        fundamentals: null,

        news: [],

        social: null,

        website: null,

        legal: null,

        webIntelligence:
          null,

        evidence: [],

        warnings: [],

        errors: [
          "A valid stock symbol is required.",
        ],

        startedAt,

        timestamp:
          now(),
      };
    }

    const config = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    try {
      /**
       * All research channels are deliberately independent.
       *
       * One provider failing must not destroy the complete dossier.
       */

      const [
        fundamentalsResult,
        newsResult,
        socialResult,
        websiteResult,
        legalResult,
        webResult,
      ] =
        await Promise.all([
          config
            .includeFundamentals
            ? safeProviderCall({
                name:
                  "FUNDAMENTALS",

                provider:
                  fundamentalProvider,

                args: {
                  symbol:
                    normalizedSymbol,
                },
              })
            : Promise.resolve(
                null,
              ),

          config
            .includeNews
            ? safeProviderCall({
                name:
                  "MARKET_NEWS",

                provider:
                  newsProvider,

                args: {
                  symbol:
                    normalizedSymbol,

                  limit:
                    config.newsLimit,
                },
              })
            : Promise.resolve(
                null,
              ),

          config
            .includeSocial
            ? safeProviderCall({
                name:
                  "SOCIAL_SENTIMENT",

                provider:
                  socialProvider,

                args: {
                  symbol:
                    normalizedSymbol,
                },
              })
            : Promise.resolve(
                null,
              ),

          safeProviderCall({
            name:
              "COMPANY_WEBSITE",

            provider:
              websiteProvider,

            args: {
              symbol:
                normalizedSymbol,
            },
          }),

          safeProviderCall({
            name:
              "LEGAL_INTELLIGENCE",

            provider:
              legalProvider,

            args: {
              symbol:
                normalizedSymbol,
            },
          }),

          safeProviderCall({
            name:
              "WEB_INTELLIGENCE",

            provider:
              webIntelligenceProvider,

            args: {
              symbol:
                normalizedSymbol,
            },
          }),
        ]);

      const fundamentals =
        fundamentalsResult
          ?.approved
          ? normalizeFundamentals(
              fundamentalsResult
                .data,
            )
          : null;

      const news =
        newsResult
          ?.approved
          ? extractNewsArticles(
              newsResult.data,
              normalizedSymbol,
            )
          : [];

      const social =
        socialResult
          ?.approved
          ? socialResult.data
          : null;

      const website =
        websiteResult
          ?.approved
          ? websiteResult.data
          : null;

      const legal =
        legalResult
          ?.approved
          ? legalResult.data
          : null;

      const webIntelligence =
        webResult
          ?.approved
          ? webResult.data
          : null;

      /**
       * Future providers return normalized evidence arrays.
       */

      const evidence = [
        ...normalizeArray(
          website
            ?.evidence,
        ),

        ...normalizeArray(
          legal
            ?.evidence,
        ),

        ...normalizeArray(
          webIntelligence
            ?.evidence,
        ),
      ];

      const summary =
        buildSummary({
          fundamentals,
          news,
          social,
          externalEvidence:
            evidence,
        });

      const providerResults =
        [
          fundamentalsResult,
          newsResult,
          socialResult,
          websiteResult,
          legalResult,
          webResult,
        ].filter(Boolean);

      const successfulProviders =
        providerResults.filter(
          result =>
            result?.approved ===
            true,
        ).length;

      const warnings =
        uniqueStrings(
          providerResults
            .flatMap(
              result =>
                result
                  ?.warnings ??
                [],
            ),
        );

      const errors =
        uniqueStrings(
          providerResults
            .flatMap(
              result =>
                result
                  ?.errors ??
                [],
            ),
        );

      /**
       * Provider errors are intentionally not fatal when other
       * research channels returned useful evidence.
       */

      const hasUsefulData =
        Boolean(
          fundamentals,
        ) ||
        news.length >
          0 ||
        Boolean(
          social,
        ) ||
        Boolean(
          website,
        ) ||
        Boolean(
          legal,
        ) ||
        Boolean(
          webIntelligence,
        );

      const status =
        !hasUsefulData
          ? COMPANY_RESEARCH_STATUS
              .NO_DATA
          : successfulProviders ===
              providerResults.length
            ? COMPANY_RESEARCH_STATUS
                .COMPLETE
            : COMPANY_RESEARCH_STATUS
                .PARTIAL;

      return {
        success:
          hasUsefulData,

        approved:
          hasUsefulData,

        service:
          "COMPANY_RESEARCH",

        status,

        symbol:
          normalizedSymbol,

        summary,

        company: {
          symbol:
            normalizedSymbol,

          name:
            website
              ?.companyName ??
            website
              ?.profile
              ?.companyName ??
            null,

          sector:
            fundamentals
              ?.sector ??
            null,

          industry:
            fundamentals
              ?.industry ??
            website
              ?.profile
              ?.industry ??
            null,

          countryCode:
            fundamentals
              ?.countryCode ??
            website
              ?.profile
              ?.country ??
            null,

          exchange:
            website
              ?.profile
              ?.exchange ??
            null,

          currency:
            website
              ?.profile
              ?.currency ??
            null,

          officialWebsite:
            website
              ?.officialWebsite ??
            website
              ?.profile
              ?.officialWebsite ??
            null,

          domain:
            website
              ?.domain ??
            website
              ?.profile
              ?.domain ??
            null,

          logo:
            website
              ?.profile
              ?.logo ??
            null,

          marketCapitalization:
            website
              ?.profile
              ?.marketCapitalization ??
            fundamentals
              ?.marketCap ??
            null,

          ipoDate:
            website
              ?.profile
              ?.ipoDate ??
            null,

          shareOutstanding:
            website
              ?.profile
              ?.shareOutstanding ??
            null,
        },

        fundamentals,

        news,

        social,

        website,

        legal,

        webIntelligence,

        evidence,

        providers: {
          fundamentals: {
            approved:
              fundamentalsResult
                ?.approved ===
              true,

            status:
              fundamentalsResult
                ?.status ??
              "NOT_RUN",
          },

          news: {
            approved:
              newsResult
                ?.approved ===
              true,

            status:
              newsResult
                ?.status ??
              "NOT_RUN",
          },

          social: {
            approved:
              socialResult
                ?.approved ===
              true,

            status:
              socialResult
                ?.status ??
              "NOT_RUN",
          },

          website: {
            approved:
              websiteResult
                ?.approved ===
              true,

            status:
              websiteResult
                ?.status ??
              "NOT_RUN",
          },

          legal: {
            approved:
              legalResult
                ?.approved ===
              true,

            status:
              legalResult
                ?.status ??
              "NOT_RUN",
          },

          webIntelligence: {
            approved:
              webResult
                ?.approved ===
              true,

            status:
              webResult
                ?.status ??
              "NOT_RUN",
          },
        },

        warnings,

        errors:
          hasUsefulData
            ? []
            : errors,

        startedAt,

        timestamp:
          now(),
      };
    } catch (error) {
      return {
        success: false,

        approved: false,

        service:
          "COMPANY_RESEARCH",

        status:
          COMPANY_RESEARCH_STATUS
            .ERROR,

        symbol:
          normalizedSymbol,

        summary: null,

        company: null,

        fundamentals: null,

        news: [],

        social: null,

        website: null,

        legal: null,

        webIntelligence:
          null,

        evidence: [],

        warnings: [
          "Company research failed safely.",
        ],

        errors: [
          error instanceof Error
            ? error.message
            : String(error),
        ],

        startedAt,

        timestamp:
          now(),
      };
    }
  };
}

/**
 * ============================================================
 * PRODUCTION COORDINATOR
 * ============================================================
 */

export const researchCompany =
  createCompanyResearchCoordinator();

export default
  researchCompany;