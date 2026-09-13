// server/src/research/webIntelligenceProvider.jsx

import getCompanyProfile from
  "../data/providers/companyProfileProvider.js";

/**
 * ============================================================
 * WEB INTELLIGENCE PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Search the broader public web for company-specific intelligence
 * that may not appear in the official company website, Alpaca news,
 * SEC fundamentals, or Federal Register feeds.
 *
 * This provider is designed for the SaaS Research product.
 *
 * It can surface:
 *
 * - latest company developments
 * - positive coverage
 * - negative coverage
 * - partnerships
 * - acquisitions
 * - product developments
 * - executive changes
 * - analyst / industry commentary
 * - lawsuits / investigations
 * - allegations / controversies
 * - regulatory matters
 * - recalls / safety concerns
 * - cybersecurity / privacy incidents
 *
 * IMPORTANT
 * ---------
 *
 * Search-result snippets are evidence leads, not proof.
 *
 * This provider:
 *
 * - does NOT claim allegations are confirmed
 * - does NOT make trading decisions
 * - does NOT place orders
 * - does NOT alter scanner or position state
 * - does NOT scrape arbitrary result pages
 *
 * Downstream legal/adverse intelligence may further verify,
 * classify, corroborate, or reject these leads.
 */

export const WEB_INTELLIGENCE_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    NO_DATA:
      "NO_DATA",

    AUTH_MISSING:
      "AUTH_MISSING",

    INVALID_REQUEST:
      "INVALID_REQUEST",

    PROVIDER_ERROR:
      "PROVIDER_ERROR",

    ERROR:
      "ERROR",
  });

export const WEB_INTELLIGENCE_SENTIMENT =
  Object.freeze({
    POSITIVE:
      "POSITIVE",

    NEGATIVE:
      "NEGATIVE",

    NEUTRAL:
      "NEUTRAL",

    MIXED:
      "MIXED",

    UNKNOWN:
      "UNKNOWN",
  });

export const WEB_INTELLIGENCE_TYPE =
  Object.freeze({
    LATEST_DEVELOPMENT:
      "LATEST_DEVELOPMENT",

    POSITIVE_MENTION:
      "POSITIVE_MENTION",

    NEGATIVE_MENTION:
      "NEGATIVE_MENTION",

    LEGAL:
      "LEGAL",

    REGULATORY:
      "REGULATORY",

    CONTROVERSY:
      "CONTROVERSY",

    FRAUD_ALLEGATION:
      "FRAUD_ALLEGATION",

    CYBERSECURITY:
      "CYBERSECURITY",

    PRIVACY:
      "PRIVACY",

    PRODUCT_SAFETY:
      "PRODUCT_SAFETY",

    PARTNERSHIP:
      "PARTNERSHIP",

    ACQUISITION:
      "ACQUISITION",

    PRODUCT:
      "PRODUCT",

    EXECUTIVE:
      "EXECUTIVE",

    FINANCIAL:
      "FINANCIAL",

    INDUSTRY:
      "INDUSTRY",

    OTHER:
      "OTHER",
  });

export const WEB_SOURCE_AUTHORITY =
  Object.freeze({
    PRIMARY:
      "PRIMARY",

    HIGH:
      "HIGH",

    MEDIUM:
      "MEDIUM",

    LOW:
      "LOW",

    UNKNOWN:
      "UNKNOWN",
  });

const DEFAULT_BRAVE_BASE_URL =
  "https://api.search.brave.com/res/v1/web/search";

const DEFAULT_TIMEOUT_MS =
  12_000;

const DEFAULT_RESULTS_PER_QUERY =
  10;

const MAX_RESULTS_PER_QUERY =
  20;

const DEFAULT_MAXIMUM_RESULTS =
  100;

const DEFAULT_FRESHNESS =
  "pm";

/**
 * ============================================================
 * SEARCH PURPOSES
 * ============================================================
 */

const SEARCH_PURPOSE =
  Object.freeze({
    LATEST:
      "LATEST",

    POSITIVE:
      "POSITIVE",

    NEGATIVE:
      "NEGATIVE",

    LEGAL:
      "LEGAL",

    REGULATORY:
      "REGULATORY",

    FRAUD:
      "FRAUD",

    CYBER:
      "CYBER",

    PRODUCT:
      "PRODUCT",

    EXECUTIVE:
      "EXECUTIVE",

    FINANCIAL:
      "FINANCIAL",
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
  const symbol =
    normalizeString(
      value,
    )
      ?.toUpperCase();

  if (
    !symbol ||
    symbol.length > 20
  ) {
    return null;
  }

  return symbol;
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

function safeErrorMessage(
  error,
) {
  return error instanceof Error
    ? error.message
    : String(
        error,
      );
}

function positiveInteger(
  value,
  fallback,
  maximum,
) {
  const number =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      number,
    ) ||
    number <= 0
  ) {
    return fallback;
  }

  return Math.min(
    number,
    maximum,
  );
}

function clamp(
  value,
  minimum,
  maximum,
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  );
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

function normalizeForMatch(
  value,
) {
  return String(
    value ?? "",
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function combinedText(
  ...values
) {
  return values
    .filter(Boolean)
    .join(" ")
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function includesAny(
  text,
  terms,
) {
  const normalized =
    String(
      text ?? "",
    )
      .toLowerCase();

  return terms.some(
    term =>
      normalized.includes(
        term,
      ),
  );
}

function makeId({
  symbol,
  url,
  title,
  purpose,
}) {
  const source =
    `${symbol}|${url ?? ""}|${title ?? ""}|${purpose ?? ""}`;

  let hash =
    2166136261;

  for (
    let index = 0;
    index <
    source.length;
    index += 1
  ) {
    hash ^=
      source.charCodeAt(
        index,
      );

    hash +=
      (
        hash << 1
      ) +
      (
        hash << 4
      ) +
      (
        hash << 7
      ) +
      (
        hash << 8
      ) +
      (
        hash << 24
      );
  }

  return `webintel_${(
    hash >>>
    0
  ).toString(16)}`;
}

function getHostname(
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
    return new URL(
      raw,
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
 * SOURCE AUTHORITY
 * ============================================================
 */

function classifySourceAuthority({
  url,
  sourceName,
}) {
  const hostname =
    getHostname(
      url,
    );

  const text =
    combinedText(
      hostname,
      sourceName,
    )
      .toLowerCase();

  if (
    hostname?.endsWith(
      ".gov",
    ) ||
    includesAny(
      text,
      [
        "sec.gov",
        "justice.gov",
        "ftc.gov",
        "fda.gov",
        "cpsc.gov",
        "federalregister.gov",
        "uscourts.gov",
      ],
    )
  ) {
    return WEB_SOURCE_AUTHORITY
      .PRIMARY;
  }

  if (
    includesAny(
      text,
      [
        "reuters",
        "apnews",
        "associated press",
        "bloomberg",
        "wsj",
        "wall street journal",
        "ft.com",
        "financial times",
        "nytimes",
        "washingtonpost",
        "bbc",
        "cnbc",
      ],
    )
  ) {
    return WEB_SOURCE_AUTHORITY
      .HIGH;
  }

  if (
    includesAny(
      text,
      [
        "marketwatch",
        "barrons",
        "benzinga",
        "forbes",
        "businessinsider",
        "theverge",
        "techcrunch",
        "arstechnica",
        "wired",
      ],
    )
  ) {
    return WEB_SOURCE_AUTHORITY
      .MEDIUM;
  }

  if (
    hostname
  ) {
    return WEB_SOURCE_AUTHORITY
      .LOW;
  }

  return WEB_SOURCE_AUTHORITY
    .UNKNOWN;
}

/**
 * ============================================================
 * COMPANY RELEVANCE
 * ============================================================
 */

function companyIsReferenced({
  symbol,
  companyName,
  title,
  description,
  url,
}) {
  const text =
    normalizeForMatch(
      combinedText(
        title,
        description,
      ),
    );

  const normalizedCompany =
    normalizeForMatch(
      companyName,
    );

  const normalizedSymbol =
    normalizeForMatch(
      symbol,
    );

  /**
   * Full company name is the strongest text match.
   */

  if (
    normalizedCompany &&
    text.includes(
      normalizedCompany,
    )
  ) {
    return true;
  }

  /**
   * Ticker match is accepted only as an isolated-ish token.
   */

  if (
    normalizedSymbol
  ) {
    const tokens =
      text.split(
        " ",
      );

    if (
      tokens.includes(
        normalizedSymbol,
      )
    ) {
      return true;
    }
  }

  /**
   * Search engines sometimes return the official company domain
   * for company-specific queries even when the snippet omits the
   * complete legal name. That is useful first-party context.
   */

  const hostname =
    getHostname(
      url,
    );

  if (
    hostname &&
    normalizedCompany
  ) {
    const simpleCompanyToken =
      normalizedCompany
        .split(
          " ",
        )
        .filter(
          token =>
            token.length >= 4 &&
            ![
              "inc",
              "corp",
              "corporation",
              "company",
              "limited",
              "holdings",
              "plc",
            ].includes(
              token,
            ),
        )
        .at(
          0,
        );

    if (
      simpleCompanyToken &&
      hostname.includes(
        simpleCompanyToken,
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * ============================================================
 * SENTIMENT / TYPE CLASSIFICATION
 * ============================================================
 */

function classifySentiment({
  purpose,
  text,
}) {
  const negativeTerms = [
    "lawsuit",
    "sued",
    "investigation",
    "probe",
    "fraud",
    "scam",
    "alleged",
    "accused",
    "recall",
    "breach",
    "antitrust",
    "fine",
    "penalty",
    "decline",
    "miss",
    "downgrade",
    "warning",
    "risk",
    "controversy",
    "settlement",
    "charged",
  ];

  const positiveTerms = [
    "partnership",
    "record revenue",
    "record profit",
    "beats estimates",
    "beat estimates",
    "upgrade",
    "launch",
    "growth",
    "expansion",
    "contract win",
    "award",
    "approval",
    "strong demand",
    "raises guidance",
  ];

  const hasNegative =
    includesAny(
      text,
      negativeTerms,
    );

  const hasPositive =
    includesAny(
      text,
      positiveTerms,
    );

  if (
    hasNegative &&
    hasPositive
  ) {
    return WEB_INTELLIGENCE_SENTIMENT
      .MIXED;
  }

  if (hasNegative) {
    return WEB_INTELLIGENCE_SENTIMENT
      .NEGATIVE;
  }

  if (hasPositive) {
    return WEB_INTELLIGENCE_SENTIMENT
      .POSITIVE;
  }

  if (
    purpose ===
    SEARCH_PURPOSE
      .NEGATIVE ||
    purpose ===
    SEARCH_PURPOSE
      .LEGAL ||
    purpose ===
    SEARCH_PURPOSE
      .REGULATORY ||
    purpose ===
    SEARCH_PURPOSE
      .FRAUD ||
    purpose ===
    SEARCH_PURPOSE
      .CYBER
  ) {
    return WEB_INTELLIGENCE_SENTIMENT
      .UNKNOWN;
  }

  return WEB_INTELLIGENCE_SENTIMENT
    .NEUTRAL;
}

function classifyType({
  purpose,
  text,
}) {
  if (
    includesAny(
      text,
      [
        "data breach",
        "cyberattack",
        "cyber attack",
        "ransomware",
        "hacked",
        "security incident",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .CYBERSECURITY;
  }

  if (
    includesAny(
      text,
      [
        "privacy",
        "gdpr",
        "data protection",
        "personal data",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .PRIVACY;
  }

  if (
    includesAny(
      text,
      [
        "recall",
        "product safety",
        "safety defect",
        "defective",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .PRODUCT_SAFETY;
  }

  if (
    includesAny(
      text,
      [
        "fraud",
        "scam",
        "alleged",
        "allegation",
        "accused",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .FRAUD_ALLEGATION;
  }

  if (
    includesAny(
      text,
      [
        "lawsuit",
        "sued",
        "litigation",
        "court",
        "class action",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .LEGAL;
  }

  if (
    includesAny(
      text,
      [
        "regulator",
        "regulatory",
        "sec ",
        "ftc",
        "doj",
        "department of justice",
        "antitrust",
        "anti-trust",
        "enforcement",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .REGULATORY;
  }

  if (
    includesAny(
      text,
      [
        "controversy",
        "backlash",
        "criticism",
        "criticized",
        "dispute",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .CONTROVERSY;
  }

  if (
    includesAny(
      text,
      [
        "acquisition",
        "acquire",
        "merger",
        "buyout",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .ACQUISITION;
  }

  if (
    includesAny(
      text,
      [
        "partnership",
        "partnered",
        "collaboration",
        "strategic alliance",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .PARTNERSHIP;
  }

  if (
    includesAny(
      text,
      [
        "ceo",
        "cfo",
        "executive",
        "management",
        "board",
        "director",
        "resigns",
        "appointed",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .EXECUTIVE;
  }

  if (
    includesAny(
      text,
      [
        "earnings",
        "revenue",
        "profit",
        "guidance",
        "margin",
        "cash flow",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .FINANCIAL;
  }

  if (
    includesAny(
      text,
      [
        "product",
        "launch",
        "device",
        "platform",
        "service",
        "software",
      ],
    )
  ) {
    return WEB_INTELLIGENCE_TYPE
      .PRODUCT;
  }

  if (
    purpose ===
    SEARCH_PURPOSE
      .POSITIVE
  ) {
    return WEB_INTELLIGENCE_TYPE
      .POSITIVE_MENTION;
  }

  if (
    purpose ===
    SEARCH_PURPOSE
      .NEGATIVE
  ) {
    return WEB_INTELLIGENCE_TYPE
      .NEGATIVE_MENTION;
  }

  if (
    purpose ===
    SEARCH_PURPOSE
      .LATEST
  ) {
    return WEB_INTELLIGENCE_TYPE
      .LATEST_DEVELOPMENT;
  }

  return WEB_INTELLIGENCE_TYPE
    .OTHER;
}

/**
 * ============================================================
 * CONFIDENCE
 * ============================================================
 */

function authorityWeight(
  authority,
) {
  switch (
    authority
  ) {
    case WEB_SOURCE_AUTHORITY
      .PRIMARY:
      return 1;

    case WEB_SOURCE_AUTHORITY
      .HIGH:
      return 0.9;

    case WEB_SOURCE_AUTHORITY
      .MEDIUM:
      return 0.75;

    case WEB_SOURCE_AUTHORITY
      .LOW:
      return 0.55;

    default:
      return 0.4;
  }
}

function buildConfidence({
  authority,
  companyReferenced,
  hasDescription,
  hasUrl,
}) {
  let score =
    0.2;

  score +=
    authorityWeight(
      authority,
    ) *
    0.45;

  if (
    companyReferenced
  ) {
    score +=
      0.25;
  }

  if (
    hasDescription
  ) {
    score +=
      0.05;
  }

  if (hasUrl) {
    score +=
      0.05;
  }

  return clamp(
    score,
    0,
    1,
  );
}

/**
 * ============================================================
 * SEARCH QUERY BUILDING
 * ============================================================
 */

function quotedCompany(
  companyName,
) {
  const normalized =
    normalizeString(
      companyName,
    );

  return normalized
    ? `"${normalized}"`
    : null;
}

function buildSearchQueries({
  symbol,
  companyName,
}) {
  const company =
    quotedCompany(
      companyName,
    ) ??
    `"${symbol}"`;

  return [
    {
      purpose:
        SEARCH_PURPOSE
          .LATEST,

      query:
        `${company} latest developments news`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .POSITIVE,

      query:
        `${company} growth partnership launch contract award expansion`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .NEGATIVE,

      query:
        `${company} controversy criticism risk warning`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .LEGAL,

      query:
        `${company} lawsuit litigation court class action settlement`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .REGULATORY,

      query:
        `${company} investigation regulatory antitrust SEC FTC DOJ`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .FRAUD,

      query:
        `${company} fraud allegation scam accounting misconduct`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .CYBER,

      query:
        `${company} data breach cybersecurity privacy incident`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .PRODUCT,

      query:
        `${company} product launch recall safety defect`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .EXECUTIVE,

      query:
        `${company} CEO CFO executive management resignation appointment`,
    },

    {
      purpose:
        SEARCH_PURPOSE
          .FINANCIAL,

      query:
        `${company} earnings revenue guidance financial results`,
    },
  ];
}

/**
 * ============================================================
 * BRAVE SEARCH
 * ============================================================
 */

async function braveSearch({
  apiKey,
  baseUrl,
  query,
  count,
  freshness,
  timeoutMs,
  country,
  searchLanguage,
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
    const url =
      new URL(
        baseUrl,
      );

    url.searchParams.set(
      "q",
      query,
    );

    url.searchParams.set(
      "count",
      String(
        count,
      ),
    );

    if (freshness) {
      url.searchParams.set(
        "freshness",
        freshness,
      );
    }

    if (country) {
      url.searchParams.set(
        "country",
        country,
      );
    }

    if (searchLanguage) {
      url.searchParams.set(
        "search_lang",
        searchLanguage,
      );
    }

    url.searchParams.set(
      "safesearch",
      "moderate",
    );

    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          signal:
            controller.signal,

          headers: {
            Accept:
              "application/json",

            "X-Subscription-Token":
              apiKey,
          },
        },
      );

    if (!response.ok) {
      return {
        approved:
          false,

        status:
          `HTTP_${response.status}`,

        query,

        data:
          null,

        warnings:
          [],

        errors: [
          `Brave Search returned HTTP ${response.status}.`,
        ],
      };
    }

    const data =
      await response.json();

    return {
      approved:
        true,

      status:
        "COMPLETE",

      query,

      data,

      warnings:
        [],

      errors:
        [],
    };
  } catch (error) {
    return {
      approved:
        false,

      status:
        "ERROR",

      query,

      data:
        null,

      warnings: [
        "Web search failed safely.",
      ],

      errors: [
        safeErrorMessage(
          error,
        ),
      ],
    };
  } finally {
    clearTimeout(
      timer,
    );
  }
}

/**
 * ============================================================
 * RESULT EXTRACTION
 * ============================================================
 */

function extractBraveResults(
  response,
) {
  if (!response) {
    return [];
  }

  const webResults =
    normalizeArray(
      response
        ?.web
        ?.results,
    );

  const newsResults =
    normalizeArray(
      response
        ?.news
        ?.results,
    );

  return [
    ...webResults.map(
      item => ({
        ...item,
        braveResultType:
          "WEB",
      }),
    ),

    ...newsResults.map(
      item => ({
        ...item,
        braveResultType:
          "NEWS",
      }),
    ),
  ];
}

/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

function normalizeSearchResult({
  result,
  symbol,
  companyName,
  purpose,
  query,
}) {
  if (!result) {
    return null;
  }

  const title =
    normalizeString(
      result
        ?.title,
    );

  const description =
    normalizeString(
      result
        ?.description ??
      result
        ?.snippet,
    );

  const url =
    normalizeString(
      result
        ?.url,
    );

  if (
    !title ||
    !url
  ) {
    return null;
  }

  const companyReferenced =
    companyIsReferenced({
      symbol,
      companyName,
      title,
      description,
      url,
    });

  if (
    !companyReferenced
  ) {
    return null;
  }

  const sourceName =
    normalizeString(
      result
        ?.profile
        ?.long_name ??
      result
        ?.profile
        ?.name ??
      result
        ?.source ??
      getHostname(
        url,
      ),
    );

  const authority =
    classifySourceAuthority({
      url,
      sourceName,
    });

  const text =
    combinedText(
      title,
      description,
    );

  const sentiment =
    classifySentiment({
      purpose,
      text,
    });

  const type =
    classifyType({
      purpose,
      text,
    });

  const confidence =
    buildConfidence({
      authority,
      companyReferenced,
      hasDescription:
        Boolean(
          description,
        ),
      hasUrl:
        Boolean(
          url,
        ),
    });

  const publishedAt =
    normalizeString(
      result
        ?.page_age ??
      result
        ?.publishedAt ??
      result
        ?.published_at ??
      result
        ?.date,
    );

  return {
    id:
      makeId({
        symbol,
        url,
        title,
        purpose,
      }),

    symbol,

    companyName,

    category:
      "WEB_INTELLIGENCE",

    type,

    sentiment,

    title,

    summary:
      description,

    url,

    sourceName,

    hostname:
      getHostname(
        url,
      ),

    sourceType:
      result
        ?.braveResultType ??
      "WEB",

    authority,

    primarySource:
      authority ===
      WEB_SOURCE_AUTHORITY
        .PRIMARY,

    confidence,

    publishedAt,

    queryPurpose:
      purpose,

    searchQuery:
      query,

    /**
     * This remains a research lead until corroborated.
     */

    verificationStatus:
      authority ===
      WEB_SOURCE_AUTHORITY
        .PRIMARY
        ? "PRIMARY_SOURCE"
        : "UNCORROBORATED",

    evidence: [
      {
        sourceName,
        sourceType:
          result
            ?.braveResultType ??
          "WEB",
        url,
        authority,
        publishedAt,
      },
    ],

    raw: {
      subtype:
        result
          ?.subtype ??
        null,

      age:
        result
          ?.age ??
        null,

      language:
        result
          ?.language ??
        null,
    },
  };
}

/**
 * ============================================================
 * DEDUPLICATION / CORROBORATION
 * ============================================================
 */

function canonicalUrl(
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
        raw,
      );

    url.hash =
      "";

    for (
      const key
      of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "ref",
      ]
    ) {
      url.searchParams.delete(
        key,
      );
    }

    return url.toString();
  } catch {
    return raw;
  }
}

function deduplicateResults(
  items,
) {
  const byUrl =
    new Map();

  for (
    const item
    of normalizeArray(
      items,
    )
  ) {
    if (!item) {
      continue;
    }

    const key =
      canonicalUrl(
        item.url,
      ) ??
      normalizeForMatch(
        item.title,
      );

    const existing =
      byUrl.get(
        key,
      );

    if (!existing) {
      byUrl.set(
        key,
        {
          ...item,

          queryPurposes: [
            item
              .queryPurpose,
          ],

          corroborationCount:
            1,
        },
      );

      continue;
    }

    const queryPurposes =
      uniqueStrings([
        ...normalizeArray(
          existing
            ?.queryPurposes,
        ),
        item
          .queryPurpose,
      ]);

    const higherConfidence =
      Number(
        item
          ?.confidence ??
        0,
      ) >
      Number(
        existing
          ?.confidence ??
        0,
      )
        ? item
        : existing;

    byUrl.set(
      key,
      {
        ...higherConfidence,

        queryPurposes,

        corroborationCount:
          Math.max(
            Number(
              existing
                ?.corroborationCount ??
              1,
            ),
            queryPurposes.length,
          ),
      },
    );
  }

  return [
    ...byUrl.values(),
  ];
}

/**
 * ============================================================
 * SUMMARY
 * ============================================================
 */

function buildSummary(
  items,
) {
  const records =
    normalizeArray(
      items,
    );

  const positive =
    records.filter(
      item =>
        item
          ?.sentiment ===
        WEB_INTELLIGENCE_SENTIMENT
          .POSITIVE,
    );

  const negative =
    records.filter(
      item =>
        item
          ?.sentiment ===
        WEB_INTELLIGENCE_SENTIMENT
          .NEGATIVE,
    );

  const neutral =
    records.filter(
      item =>
        item
          ?.sentiment ===
        WEB_INTELLIGENCE_SENTIMENT
          .NEUTRAL,
    );

  const mixed =
    records.filter(
      item =>
        item
          ?.sentiment ===
        WEB_INTELLIGENCE_SENTIMENT
          .MIXED,
    );

  const primarySources =
    records.filter(
      item =>
        item
          ?.primarySource ===
        true,
    );

  const legalRisk =
    records.filter(
      item =>
        [
          WEB_INTELLIGENCE_TYPE
            .LEGAL,
          WEB_INTELLIGENCE_TYPE
            .REGULATORY,
          WEB_INTELLIGENCE_TYPE
            .FRAUD_ALLEGATION,
          WEB_INTELLIGENCE_TYPE
            .CYBERSECURITY,
          WEB_INTELLIGENCE_TYPE
            .PRIVACY,
          WEB_INTELLIGENCE_TYPE
            .PRODUCT_SAFETY,
          WEB_INTELLIGENCE_TYPE
            .CONTROVERSY,
        ].includes(
          item
            ?.type,
        ),
    );

  const byType =
    {};

  for (
    const item
    of records
  ) {
    const key =
      item
        ?.type ??
      "OTHER";

    byType[
      key
    ] =
      (
        byType[
          key
        ] ??
        0
      ) +
      1;
  }

  const averageConfidence =
    records.length >
    0
      ? (
          records.reduce(
            (
              total,
              item,
            ) =>
              total +
              Number(
                item
                  ?.confidence ??
                0,
              ),
            0,
          ) /
          records.length
        )
      : null;

  let sentimentTrend =
    "NEUTRAL";

  if (
    positive.length >
    negative.length *
      1.5
  ) {
    sentimentTrend =
      "POSITIVE";
  } else if (
    negative.length >
    positive.length *
      1.5
  ) {
    sentimentTrend =
      "NEGATIVE";
  } else if (
    positive.length >
      0 ||
    negative.length >
      0
  ) {
    sentimentTrend =
      "MIXED";
  }

  return {
    totalResults:
      records.length,

    positiveMentions:
      positive.length,

    negativeMentions:
      negative.length,

    neutralMentions:
      neutral.length,

    mixedMentions:
      mixed.length,

    primarySourceResults:
      primarySources.length,

    adverseLeadCount:
      legalRisk.length,

    averageConfidence,

    sentimentTrend,

    byType,
  };
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getWebIntelligence({
  symbol,

  companyName = null,

  resultsPerQuery =
    DEFAULT_RESULTS_PER_QUERY,

  maximumResults =
    DEFAULT_MAXIMUM_RESULTS,

  freshness =
    DEFAULT_FRESHNESS,

  country =
    "US",

  searchLanguage =
    "en",

  timeoutMs =
    DEFAULT_TIMEOUT_MS,

  profileProvider =
    getCompanyProfile,
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
        "WEB_INTELLIGENCE",

      status:
        WEB_INTELLIGENCE_STATUS
          .INVALID_REQUEST,

      symbol:
        null,

      companyName:
        null,

      summary:
        buildSummary(
          [],
        ),

      results:
        [],

      evidence:
        [],

      queries:
        [],

      warnings:
        [],

      errors: [
        "A valid stock symbol is required.",
      ],

      startedAt,

      timestamp:
        now(),
    };
  }

  const apiKey =
    normalizeString(
      process.env
        .BRAVE_SEARCH_API_KEY,
    );

  if (!apiKey) {
    return {
      approved:
        false,

      provider:
        "WEB_INTELLIGENCE",

      status:
        WEB_INTELLIGENCE_STATUS
          .AUTH_MISSING,

      symbol:
        normalizedSymbol,

      companyName:
        normalizeString(
          companyName,
        ),

      summary:
        buildSummary(
          [],
        ),

      results:
        [],

      evidence:
        [],

      queries:
        [],

      warnings: [
        "BRAVE_SEARCH_API_KEY is not configured.",
      ],

      errors:
        [],

      startedAt,

      timestamp:
        now(),
    };
  }

  try {
    let resolvedCompanyName =
      normalizeString(
        companyName,
      );

    let profileResult =
      null;

    /**
     * Resolve the legal/company name so broad searches do not
     * rely on ticker-only queries.
     */

    if (
      !resolvedCompanyName &&
      typeof profileProvider ===
        "function"
    ) {
      try {
        profileResult =
          await profileProvider({
            symbol:
              normalizedSymbol,
          });

        resolvedCompanyName =
          normalizeString(
            profileResult
              ?.data
              ?.companyName ??
            profileResult
              ?.data
              ?.name,
          );
      } catch {
        // Search can still proceed with the ticker.
      }
    }

    const safeResultsPerQuery =
      positiveInteger(
        resultsPerQuery,
        DEFAULT_RESULTS_PER_QUERY,
        MAX_RESULTS_PER_QUERY,
      );

    const safeMaximumResults =
      positiveInteger(
        maximumResults,
        DEFAULT_MAXIMUM_RESULTS,
        500,
      );

    const safeTimeout =
      positiveInteger(
        timeoutMs,
        DEFAULT_TIMEOUT_MS,
        60_000,
      );

    const baseUrl =
      (
        process.env
          .BRAVE_SEARCH_BASE_URL ??
        DEFAULT_BRAVE_BASE_URL
      )
        .replace(
          /\/+$/,
          "",
        );

    const queries =
      buildSearchQueries({
        symbol:
          normalizedSymbol,

        companyName:
          resolvedCompanyName,
      });

    /**
     * Search sequentially rather than firing all queries at once.
     * This is friendlier to provider rate limits and easier to
     * reason about in a SaaS environment.
     */

    const queryResults =
      [];

    const warnings =
      [];

    const errors =
      [];

    for (
      const descriptor
      of queries
    ) {
      const response =
        await braveSearch({
          apiKey,

          baseUrl,

          query:
            descriptor
              .query,

          count:
            safeResultsPerQuery,

          freshness,

          timeoutMs:
            safeTimeout,

          country,

          searchLanguage,
        });

      queryResults.push({
        purpose:
          descriptor
            .purpose,

        query:
          descriptor
            .query,

        approved:
          response
            ?.approved ===
          true,

        status:
          response
            ?.status ??
          "UNKNOWN",

        rawCount:
          extractBraveResults(
            response
              ?.data,
          ).length,
      });

      warnings.push(
        ...normalizeArray(
          response
            ?.warnings,
        ),
      );

      errors.push(
        ...normalizeArray(
          response
            ?.errors,
        ),
      );

      if (
        response
          ?.approved !==
        true
      ) {
        continue;
      }

      const normalized =
        extractBraveResults(
          response.data,
        )
          .map(
            result =>
              normalizeSearchResult({
                result,

                symbol:
                  normalizedSymbol,

                companyName:
                  resolvedCompanyName,

                purpose:
                  descriptor
                    .purpose,

                query:
                  descriptor
                    .query,
              }),
          )
          .filter(Boolean);

      descriptor
        .normalizedResults =
        normalized;
    }

    const allResults =
      queries.flatMap(
        descriptor =>
          normalizeArray(
            descriptor
              ?.normalizedResults,
          ),
      );

    const deduplicated =
      deduplicateResults(
        allResults,
      )
        .sort(
          (
            a,
            b,
          ) => {
            const primaryDifference =
              Number(
                b
                  ?.primarySource ===
                true,
              ) -
              Number(
                a
                  ?.primarySource ===
                true,
              );

            if (
              primaryDifference !==
              0
            ) {
              return primaryDifference;
            }

            const authorityDifference =
              authorityWeight(
                b
                  ?.authority,
              ) -
              authorityWeight(
                a
                  ?.authority,
              );

            if (
              authorityDifference !==
              0
            ) {
              return authorityDifference;
            }

            return (
              Number(
                b
                  ?.confidence ??
                0,
              ) -
              Number(
                a
                  ?.confidence ??
                0,
              )
            );
          },
        )
        .slice(
          0,
          safeMaximumResults,
        );

    const successfulQueryCount =
      queryResults.filter(
        query =>
          query
            ?.approved ===
          true,
      ).length;

    const hasSearchData =
      successfulQueryCount >
      0;

    const status =
      !hasSearchData
        ? WEB_INTELLIGENCE_STATUS
            .NO_DATA
        : successfulQueryCount ===
            queryResults.length
          ? WEB_INTELLIGENCE_STATUS
              .COMPLETE
          : WEB_INTELLIGENCE_STATUS
              .PARTIAL;

    const summary =
      buildSummary(
        deduplicated,
      );

    return {
      approved:
        hasSearchData,

      provider:
        "WEB_INTELLIGENCE",

      status,

      symbol:
        normalizedSymbol,

      companyName:
        resolvedCompanyName,

      summary,

      resultCount:
        deduplicated.length,

      results:
        deduplicated,

      /**
       * Coordinator compatibility:
       *
       * companyResearchCoordinator consumes
       * webIntelligence.evidence.
       */

      evidence:
        deduplicated,

      queries:
        queryResults,

      providerMetadata: {
        searchProvider:
          "BRAVE_SEARCH",

        freshness,

        country,

        searchLanguage,

        resultsPerQuery:
          safeResultsPerQuery,

        maximumResults:
          safeMaximumResults,

        profileResolved:
          profileResult
            ?.approved ===
          true,
      },

      warnings:
        uniqueStrings(
          warnings,
        ),

      errors:
        hasSearchData
          ? []
          : uniqueStrings(
              errors,
            ),

      startedAt,

      timestamp:
        now(),
    };
  } catch (error) {
    return {
      approved:
        false,

      provider:
        "WEB_INTELLIGENCE",

      status:
        WEB_INTELLIGENCE_STATUS
          .ERROR,

      symbol:
        normalizedSymbol,

      companyName:
        normalizeString(
          companyName,
        ),

      summary:
        buildSummary(
          [],
        ),

      resultCount:
        0,

      results:
        [],

      evidence:
        [],

      queries:
        [],

      warnings: [
        "Web intelligence failed safely.",
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
  getWebIntelligence;
