// server/src/data/providers/marketauxNewsProvider.js

/**
 * ============================================================
 * MARKETAUX NEWS PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 * Secondary/fallback stock-news provider for AEMA.
 *
 * IMPORTANT
 * ---------
 * The current Marketaux plan used by this project returns a
 * maximum of 3 articles per request, so this provider clamps
 * requests to 3 by default.
 *
 * Read-only. It never authorizes trades.
 */

export const MARKETAUX_NEWS_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    PARTIAL: "PARTIAL",
    RATE_LIMITED: "RATE_LIMITED",
    NOT_CONFIGURED: "NOT_CONFIGURED",
    INVALID_REQUEST: "INVALID_REQUEST",
    ERROR: "ERROR",
  });

const DEFAULT_LIMIT = 3;
const MAXIMUM_LIMIT = 3;

function positiveInteger(
  value,
  fallback,
  maximum = MAXIMUM_LIMIT,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return Math.min(
    Math.floor(number),
    maximum,
  );
}

function normalizeSymbols(symbols) {
  if (!Array.isArray(symbols)) {
    return [];
  }

  return Array.from(
    new Set(
      symbols
        .map(value =>
          String(value ?? "")
            .trim()
            .toUpperCase(),
        )
        .filter(Boolean),
    ),
  );
}

function safeErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function getToken() {
  const token =
    process.env
      .MARKETAUX_API_TOKEN;

  return String(
    token ?? "",
  ).trim();
}

function normalizeEntity(
  entity,
) {
  if (
    !entity ||
    typeof entity !==
      "object"
  ) {
    return null;
  }

  return {
    symbol:
      entity.symbol ??
      null,

    name:
      entity.name ??
      null,

    exchange:
      entity.exchange ??
      null,

    country:
      entity.country ??
      null,

    type:
      entity.type ??
      null,

    industry:
      entity.industry ??
      null,

    matchScore:
      Number.isFinite(
        Number(
          entity.match_score,
        ),
      )
        ? Number(
            entity.match_score,
          )
        : null,

    sentimentScore:
      Number.isFinite(
        Number(
          entity.sentiment_score,
        ),
      )
        ? Number(
            entity.sentiment_score,
          )
        : null,
  };
}


function normalizeText(
  value,
) {
  const text =
    String(
      value ?? "",
    ).trim();

  return text ||
    null;
}

function normalizeCountryCode(
  value,
) {
  const raw =
    normalizeText(
      value,
    );

  if (!raw) {
    return null;
  }

  const normalized =
    raw
      .replaceAll(
        ".",
        "",
      )
      .trim()
      .toUpperCase();

  if (
    [
      "US",
      "USA",
      "UNITED STATES",
      "UNITED STATES OF AMERICA",
    ].includes(
      normalized,
    )
  ) {
    return "US";
  }

  return normalized;
}

function buildCompanyProfiles({
  news = [],
  requestedSymbols = [],
} = {}) {
  const profiles = {};

  for (
    const requestedSymbol
    of requestedSymbols
  ) {
    const symbol =
      String(
        requestedSymbol ?? "",
      )
        .trim()
        .toUpperCase();

    if (!symbol) {
      continue;
    }

    const matches = [];

    for (
      const article
      of news
    ) {
      const entities =
        Array.isArray(
          article
            ?.entities,
        )
          ? article.entities
          : [];

      for (
        const entity
        of entities
      ) {
        const entitySymbol =
          String(
            entity
              ?.symbol ??
            "",
          )
            .trim()
            .toUpperCase();

        if (
          entitySymbol !==
          symbol
        ) {
          continue;
        }

        matches.push({
          ...entity,

          articleId:
            article
              ?.id ??
            null,

          createdAt:
            article
              ?.createdAt ??
            null,

          source:
            article
              ?.source ??
            null,
        });
      }
    }

    if (
      matches.length ===
      0
    ) {
      continue;
    }

    const ranked =
      [...matches]
        .sort(
          (
            left,
            right,
          ) =>
            (
              Number(
                right
                  ?.matchScore,
              ) ||
              0
            ) -
            (
              Number(
                left
                  ?.matchScore,
              ) ||
              0
            ),
        );

    const best =
      ranked[0];

    const matchScores =
      ranked
        .map(
          item =>
            Number(
              item
                ?.matchScore,
            ),
        )
        .filter(
          Number.isFinite,
        );

    const sentimentScores =
      ranked
        .map(
          item =>
            Number(
              item
                ?.sentimentScore,
            ),
        )
        .filter(
          Number.isFinite,
        );

    const average =
      values =>
        values.length >
        0
          ? values.reduce(
              (
                total,
                value,
              ) =>
                total +
                value,
              0,
            ) /
            values.length
          : null;

    profiles[
      symbol
    ] = {
      symbol,

      name:
        normalizeText(
          best
            ?.name,
        ),

      industry:
        normalizeText(
          best
            ?.industry,
        ),

      country:
        normalizeCountryCode(
          best
            ?.country,
        ),

      exchange:
        normalizeText(
          best
            ?.exchange,
        ),

      type:
        normalizeText(
          best
            ?.type,
        ),

      articleCount:
        matches.length,

      sourceCount:
        new Set(
          ranked
            .map(
              item =>
                item
                  ?.source,
            )
            .filter(Boolean),
        ).size,

      averageMatchScore:
        average(
          matchScores,
        ),

      maximumMatchScore:
        matchScores.length >
        0
          ? Math.max(
              ...matchScores,
            )
          : null,

      averageSentiment:
        average(
          sentimentScores,
        ),

      evidence:
        ranked,
    };
  }

  return profiles;
}

function normalizeArticle(
  article,
  requestedSymbols,
) {
  if (
    !article ||
    typeof article !==
      "object"
  ) {
    return null;
  }

  const headline =
    String(
      article.title ??
      "",
    )
      .trim();

  if (!headline) {
    return null;
  }

  const entities =
    Array.isArray(
      article.entities,
    )
      ? article.entities
          .map(normalizeEntity)
          .filter(Boolean)
      : [];

  const matchedSymbols =
    Array.from(
      new Set(
        entities
          .map(entity =>
            String(
              entity?.symbol ??
              "",
            )
              .trim()
              .toUpperCase(),
          )
          .filter(Boolean),
      ),
    );

  const symbols =
    matchedSymbols.length >
    0
      ? matchedSymbols
      : requestedSymbols;

  const primaryEntity =
    entities.find(entity =>
      requestedSymbols.includes(
        String(
          entity
            ?.symbol ??
          "",
        )
          .trim()
          .toUpperCase(),
      ),
    ) ??
    entities[0] ??
    null;

  return {
    id:
      article.uuid ??
      null,

    headline,

    summary:
      article.description ??
      article.snippet ??
      null,

    author:
      null,

    source:
      article.source ??
      null,

    symbols,

    createdAt:
      article.published_at ??
      null,

    updatedAt:
      null,

    url:
      article.url ??
      null,

    content:
      article.snippet ??
      null,

    provider:
      "MARKETAUX",

    sentiment: {
      symbol:
        primaryEntity
          ?.symbol ??
        null,

      score:
        primaryEntity
          ?.sentimentScore ??
        null,

      matchScore:
        primaryEntity
          ?.matchScore ??
        null,

      industry:
        primaryEntity
          ?.industry ??
        null,
    },

    entities,
  };
}

export async function getMarketauxNews({
  symbols = [],

  limit =
    DEFAULT_LIMIT,

  includeContent =
    false,

  sort =
    "desc",
} = {}) {
  const startedAt =
    new Date().toISOString();

  const normalizedSymbols =
    normalizeSymbols(symbols);

  const normalizedLimit =
    positiveInteger(
      limit,
      DEFAULT_LIMIT,
    );

  const token =
    getToken();

  if (!token) {
    return {
      approved: false,

      provider:
        "MARKETAUX_NEWS",

      status:
        MARKETAUX_NEWS_STATUS
          .NOT_CONFIGURED,

      symbols:
        normalizedSymbols,

      count: 0,

      news: [],

      companyProfiles: {},

      companyProfile: null,

      warnings: [
        "MARKETAUX_API_TOKEN is not configured.",
      ],

      errors: [],

      startedAt,

      completedAt:
        new Date().toISOString(),
    };
  }

  try {
    const url =
      new URL(
        "https://api.marketaux.com/v1/news/all",
      );

    if (
      normalizedSymbols.length >
      0
    ) {
      url.searchParams.set(
        "symbols",
        normalizedSymbols.join(","),
      );
    }

    url.searchParams.set(
      "filter_entities",
      "true",
    );

    url.searchParams.set(
      "language",
      "en",
    );

    url.searchParams.set(
      "limit",
      String(
        normalizedLimit,
      ),
    );

    /**
     * Marketaux uses published_at order by default for this
     * endpoint. We intentionally do not send unsupported sort
     * parameters. `sort` is accepted here only to keep the
     * provider contract compatible with Alpaca callers.
     */
    void sort;
    void includeContent;

    url.searchParams.set(
      "api_token",
      token,
    );

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {
            Accept:
              "application/json",
          },
        },
      );

    const text =
      await response.text();

    let payload = null;

    if (text) {
      try {
        payload =
          JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      const message =
        payload
          ?.error
          ?.message ??
        payload
          ?.message ??
        `Marketaux news request failed with HTTP ${response.status}.`;

      const rateLimited =
        response.status ===
        429;

      return {
        approved: false,

        provider:
          "MARKETAUX_NEWS",

        status:
          rateLimited
            ? MARKETAUX_NEWS_STATUS
                .RATE_LIMITED
            : MARKETAUX_NEWS_STATUS
                .ERROR,

        symbols:
          normalizedSymbols,

        count: 0,

        news: [],

        companyProfiles: {},

        companyProfile: null,

        httpStatus:
          response.status,

        warnings:
          rateLimited
            ? [
                "Marketaux news is temporarily rate-limited.",
              ]
            : [],

        errors: [
          message,
        ],

        startedAt,

        completedAt:
          new Date().toISOString(),
      };
    }

    const rawNews =
      Array.isArray(
        payload?.data,
      )
        ? payload.data
        : [];

    const news =
      rawNews
        .map(article =>
          normalizeArticle(
            article,
            normalizedSymbols,
          ),
        )
        .filter(Boolean);


    const companyProfiles =
      buildCompanyProfiles({
        news,
        requestedSymbols:
          normalizedSymbols,
      });

    const companyProfile =
      normalizedSymbols.length ===
        1
        ? companyProfiles[
            normalizedSymbols[0]
          ] ??
          null
        : null;

    const providerWarnings =
      Array.isArray(
        payload?.warnings,
      )
        ? payload.warnings
            .map(value =>
              String(
                value ??
                "",
              ).trim(),
            )
            .filter(Boolean)
        : [];

    return {
      approved: true,

      provider:
        "MARKETAUX_NEWS",

      status:
        providerWarnings.length >
        0
          ? MARKETAUX_NEWS_STATUS
              .PARTIAL
          : MARKETAUX_NEWS_STATUS
              .COMPLETE,

      symbols:
        normalizedSymbols,

      count:
        news.length,

      news,

      companyProfiles,

      companyProfile,

      meta:
        payload?.meta ??
        null,

      httpStatus:
        response.status,

      warnings:
        providerWarnings,

      errors: [],

      startedAt,

      completedAt:
        new Date().toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "MARKETAUX_NEWS",

      status:
        MARKETAUX_NEWS_STATUS
          .ERROR,

      symbols:
        normalizedSymbols,

      count: 0,

      news: [],

      companyProfiles: {},

      companyProfile: null,

      httpStatus:
        null,

      warnings: [],

      errors: [
        safeErrorMessage(error),
      ],

      startedAt,

      completedAt:
        new Date().toISOString(),
    };
  }
}

export default
  getMarketauxNews;
