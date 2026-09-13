// server/src/research/adverseIntelligenceProvider.js

import getCompanyProfile from
  "../data/providers/companyProfileProvider.js";

import {
  getMarketNews,
} from "../data/providers/alpacaMarketNewsProvider.js";

import getFederalRegisterEvents from
  "../data/providers/federalRegisterEventProvider.js";

/**
 * ============================================================
 * ADVERSE INTELLIGENCE PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Build a conservative, evidence-first adverse-intelligence
 * record for a public company.
 *
 * This provider searches existing trusted backend sources for:
 *
 * - lawsuits
 * - regulatory actions
 * - investigations
 * - allegations
 * - fraud / scam reports
 * - settlements
 * - dismissals
 * - judgments
 * - recalls / product safety
 * - cybersecurity / privacy incidents
 * - accounting / financial-reporting concerns
 * - labor disputes
 * - executive misconduct
 * - competition / antitrust issues
 *
 * IMPORTANT SAFETY / ACCURACY RULE
 * --------------------------------
 *
 * A negative article is NOT treated as proof of misconduct.
 *
 * The provider separates:
 *
 * - allegation
 * - investigation
 * - lawsuit filed
 * - regulatory action
 * - settlement
 * - dismissal
 * - judgment
 * - confirmed finding
 * - unverified report
 *
 * This service is RESEARCH ONLY.
 *
 * It does NOT:
 * - approve trades
 * - reject trades
 * - place orders
 * - alter positions
 * - state that misconduct is proven unless the evidence itself
 *   supports a confirmed finding / judgment / regulatory action
 */

export const ADVERSE_INTELLIGENCE_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    NO_DATA:
      "NO_DATA",

    INVALID_REQUEST:
      "INVALID_REQUEST",

    ERROR:
      "ERROR",
  });

export const ADVERSE_CATEGORY =
  Object.freeze({
    LEGAL:
      "LEGAL",

    REGULATORY:
      "REGULATORY",

    FRAUD:
      "FRAUD",

    CYBERSECURITY:
      "CYBERSECURITY",

    PRIVACY:
      "PRIVACY",

    PRODUCT_SAFETY:
      "PRODUCT_SAFETY",

    LABOR:
      "LABOR",

    EXECUTIVE:
      "EXECUTIVE",

    FINANCIAL_REPORTING:
      "FINANCIAL_REPORTING",

    COMPETITION:
      "COMPETITION",

    SANCTIONS:
      "SANCTIONS",

    BANKRUPTCY:
      "BANKRUPTCY",

    OTHER:
      "OTHER",
  });

export const ADVERSE_STATE =
  Object.freeze({
    ALLEGATION:
      "ALLEGATION",

    REPORTED:
      "REPORTED",

    INVESTIGATION:
      "INVESTIGATION",

    LAWSUIT_FILED:
      "LAWSUIT_FILED",

    CHARGED:
      "CHARGED",

    REGULATORY_ACTION:
      "REGULATORY_ACTION",

    SETTLEMENT:
      "SETTLEMENT",

    DISMISSED:
      "DISMISSED",

    JUDGMENT:
      "JUDGMENT",

    CONFIRMED_FINDING:
      "CONFIRMED_FINDING",

    UNVERIFIED:
      "UNVERIFIED",
  });

export const ADVERSE_SEVERITY =
  Object.freeze({
    LOW:
      "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    CRITICAL:
      "CRITICAL",
  });

export const SOURCE_AUTHORITY =
  Object.freeze({
    PRIMARY:
      "PRIMARY",

    HIGH:
      "HIGH",

    MEDIUM:
      "MEDIUM",

    LOW:
      "LOW",
  });

const DEFAULT_NEWS_LIMIT =
  50;

const DEFAULT_MAXIMUM_ITEMS =
  100;

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
  maximum =
    DEFAULT_MAXIMUM_ITEMS,
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

function makeId({
  symbol,
  sourceUrl,
  headline,
  state,
}) {
  const source =
    `${symbol}|${sourceUrl ?? ""}|${headline ?? ""}|${state ?? ""}`;

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

  return `adverse_${(
    hash >>>
    0
  ).toString(16)}`;
}

/**
 * ============================================================
 * PROVIDER SAFETY WRAPPER
 * ============================================================
 */

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
      approved:
        false,

      provider:
        name,

      status:
        "PROVIDER_UNAVAILABLE",

      data:
        null,

      warnings: [
        `${name} provider is unavailable.`,
      ],

      errors:
        [],
    };
  }

  try {
    const result =
      await provider(
        args,
      );

    return {
      approved:
        result
          ?.approved ===
        true,

      provider:
        name,

      status:
        result
          ?.status ??
        (
          result
            ?.approved ===
          true
            ? "COMPLETE"
            : "NO_DATA"
        ),

      data:
        result ??
        null,

      warnings:
        normalizeArray(
          result
            ?.warnings,
        ),

      errors:
        normalizeArray(
          result
            ?.errors,
        ),
    };
  } catch (error) {
    return {
      approved:
        false,

      provider:
        name,

      status:
        "ERROR",

      data:
        null,

      warnings: [
        `${name} failed safely.`,
      ],

      errors: [
        safeErrorMessage(
          error,
        ),
      ],
    };
  }
}

/**
 * ============================================================
 * TEXT HELPERS
 * ============================================================
 */

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
    .trim()
    .toLowerCase();
}

function includesAny(
  text,
  terms,
) {
  return terms.some(
    term =>
      text.includes(
        term,
      ),
  );
}


/**
 * ============================================================
 * STRICT COMPANY RELEVANCE
 * ============================================================
 *
 * Federal Register and other regulatory feeds can contain broad
 * government notices that have nothing to do with the searched
 * company. We therefore require direct company evidence before
 * accepting a regulatory item.
 *
 * A record is relevant when at least one of these is true:
 *
 * - the record explicitly lists the ticker symbol
 * - the record explicitly lists the company legal name
 * - the text contains the complete legal/company name
 *
 * We deliberately do NOT treat a loose/common token such as
 * "Apple" as sufficient evidence for Apple Inc.
 */

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

function normalizeSymbolList(
  value,
) {
  return normalizeArray(
    value,
  )
    .map(
      item =>
        normalizeString(
          typeof item ===
          "string"
            ? item
            : item
                ?.symbol ??
              item
                ?.ticker ??
              item
                ?.name,
        )
          ?.toUpperCase(),
    )
    .filter(Boolean);
}

function companyIsExplicitlyReferenced({
  symbol,
  companyName,
  text,
  symbols = [],
  entities = [],
}) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  const symbolList =
    normalizeSymbolList(
      symbols,
    );

  if (
    normalizedSymbol &&
    symbolList.includes(
      normalizedSymbol,
    )
  ) {
    return true;
  }

  const normalizedText =
    normalizeForMatch(
      text,
    );

  const normalizedCompanyName =
    normalizeForMatch(
      companyName,
    );

  if (
    normalizedCompanyName &&
    normalizedText.includes(
      normalizedCompanyName,
    )
  ) {
    return true;
  }

  const entityText =
    normalizeArray(
      entities,
    )
      .map(
        entity =>
          normalizeForMatch(
            typeof entity ===
            "string"
              ? entity
              : entity
                  ?.name ??
                entity
                  ?.companyName ??
                entity
                  ?.label,
          ),
      )
      .filter(Boolean);

  if (
    normalizedCompanyName &&
    entityText.includes(
      normalizedCompanyName,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * ============================================================
 * CATEGORY CLASSIFICATION
 * ============================================================
 */

function classifyCategory(
  text,
) {
  if (
    includesAny(
      text,
      [
        "antitrust",
        "anti-trust",
        "competition law",
        "monopoly",
        "anti-competitive",
        "anticompetitive",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .COMPETITION;
  }

  if (
    includesAny(
      text,
      [
        "data breach",
        "cyberattack",
        "cyber attack",
        "ransomware",
        "hacked",
        "hack",
        "security incident",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .CYBERSECURITY;
  }

  if (
    includesAny(
      text,
      [
        "privacy",
        "personal data",
        "data protection",
        "gdpr",
        "biometric",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .PRIVACY;
  }

  if (
    includesAny(
      text,
      [
        "recall",
        "product defect",
        "safety defect",
        "unsafe product",
        "product safety",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .PRODUCT_SAFETY;
  }

  if (
    includesAny(
      text,
      [
        "accounting",
        "financial reporting",
        "restatement",
        "misstatement",
        "earnings manipulation",
        "books and records",
        "auditor",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .FINANCIAL_REPORTING;
  }

  if (
    includesAny(
      text,
      [
        "fraud",
        "scam",
        "deception",
        "deceptive",
        "misrepresentation",
        "false claims",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .FRAUD;
  }

  if (
    includesAny(
      text,
      [
        "labor",
        "labour",
        "union",
        "strike",
        "worker",
        "workplace",
        "employment lawsuit",
        "wage",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .LABOR;
  }

  if (
    includesAny(
      text,
      [
        "ceo",
        "cfo",
        "executive",
        "director",
        "chairman",
        "chairwoman",
        "officer misconduct",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .EXECUTIVE;
  }

  if (
    includesAny(
      text,
      [
        "sanction",
        "sanctions",
        "ofac",
        "export restriction",
        "export control",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .SANCTIONS;
  }

  if (
    includesAny(
      text,
      [
        "bankruptcy",
        "chapter 11",
        "chapter 7",
        "insolvency",
        "insolvent",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .BANKRUPTCY;
  }

  if (
    includesAny(
      text,
      [
        "sec ",
        "securities and exchange commission",
        "ftc",
        "federal trade commission",
        "department of justice",
        "doj",
        "regulator",
        "regulatory",
        "agency action",
        "enforcement action",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .REGULATORY;
  }

  if (
    includesAny(
      text,
      [
        "lawsuit",
        "sued",
        "litigation",
        "court",
        "plaintiff",
        "defendant",
        "class action",
      ],
    )
  ) {
    return ADVERSE_CATEGORY
      .LEGAL;
  }

  return ADVERSE_CATEGORY
    .OTHER;
}

/**
 * ============================================================
 * STATE CLASSIFICATION
 * ============================================================
 */

function classifyState(
  text,
) {
  if (
    includesAny(
      text,
      [
        "dismissed",
        "dismissal",
        "thrown out",
        "case dropped",
      ],
    )
  ) {
    return ADVERSE_STATE
      .DISMISSED;
  }

  if (
    includesAny(
      text,
      [
        "settled",
        "settlement",
        "agreed to pay",
        "consent decree",
      ],
    )
  ) {
    return ADVERSE_STATE
      .SETTLEMENT;
  }

  if (
    includesAny(
      text,
      [
        "judgment",
        "judgement",
        "found liable",
        "found guilty",
        "court ruled",
        "jury found",
      ],
    )
  ) {
    return ADVERSE_STATE
      .JUDGMENT;
  }

  if (
    includesAny(
      text,
      [
        "charged",
        "indicted",
        "criminal charges",
        "civil charges",
      ],
    )
  ) {
    return ADVERSE_STATE
      .CHARGED;
  }

  if (
    includesAny(
      text,
      [
        "enforcement action",
        "regulatory action",
        "cease and desist",
        "civil penalty",
        "administrative order",
        "regulator ordered",
        "commission ordered",
      ],
    )
  ) {
    return ADVERSE_STATE
      .REGULATORY_ACTION;
  }

  if (
    includesAny(
      text,
      [
        "investigation",
        "investigating",
        "probe",
        "subpoena",
        "inquiry",
      ],
    )
  ) {
    return ADVERSE_STATE
      .INVESTIGATION;
  }

  if (
    includesAny(
      text,
      [
        "lawsuit filed",
        "filed a lawsuit",
        "sued ",
        "sues ",
        "class action filed",
        "complaint filed",
      ],
    )
  ) {
    return ADVERSE_STATE
      .LAWSUIT_FILED;
  }

  if (
    includesAny(
      text,
      [
        "confirmed",
        "determined that",
        "found that",
        "official finding",
        "regulatory finding",
      ],
    )
  ) {
    return ADVERSE_STATE
      .CONFIRMED_FINDING;
  }

  if (
    includesAny(
      text,
      [
        "alleged",
        "alleges",
        "allegation",
        "accused",
        "accuses",
        "claims that",
        "claiming that",
      ],
    )
  ) {
    return ADVERSE_STATE
      .ALLEGATION;
  }

  if (
    includesAny(
      text,
      [
        "reportedly",
        "reported that",
        "report says",
        "according to a report",
      ],
    )
  ) {
    return ADVERSE_STATE
      .REPORTED;
  }

  return ADVERSE_STATE
    .UNVERIFIED;
}

/**
 * ============================================================
 * SOURCE AUTHORITY
 * ============================================================
 */

function classifyAuthority({
  sourceName,
  sourceType,
  url,
}) {
  const text =
    combinedText(
      sourceName,
      sourceType,
      url,
    );

  if (
    includesAny(
      text,
      [
        ".gov",
        "sec.gov",
        "justice.gov",
        "ftc.gov",
        "federalregister.gov",
        "courtlistener",
        "uscourts.gov",
      ],
    )
  ) {
    return SOURCE_AUTHORITY
      .PRIMARY;
  }

  if (
    includesAny(
      text,
      [
        "reuters",
        "associated press",
        "ap news",
        "bloomberg",
        "wall street journal",
        "financial times",
        "cnbc",
      ],
    )
  ) {
    return SOURCE_AUTHORITY
      .HIGH;
  }

  if (
    includesAny(
      text,
      [
        "benzinga",
        "marketwatch",
        "barrons",
        "forbes",
        "business insider",
      ],
    )
  ) {
    return SOURCE_AUTHORITY
      .MEDIUM;
  }

  return SOURCE_AUTHORITY
    .LOW;
}

/**
 * ============================================================
 * CONFIDENCE
 * ============================================================
 */

function confidenceFor({
  authority,
  state,
  hasUrl,
}) {
  let score =
    0.45;

  if (
    authority ===
    SOURCE_AUTHORITY
      .PRIMARY
  ) {
    score +=
      0.4;
  } else if (
    authority ===
    SOURCE_AUTHORITY
      .HIGH
  ) {
    score +=
      0.3;
  } else if (
    authority ===
    SOURCE_AUTHORITY
      .MEDIUM
  ) {
    score +=
      0.18;
  }

  if (hasUrl) {
    score +=
      0.05;
  }

  if (
    [
      ADVERSE_STATE
        .JUDGMENT,
      ADVERSE_STATE
        .REGULATORY_ACTION,
      ADVERSE_STATE
        .SETTLEMENT,
      ADVERSE_STATE
        .DISMISSED,
      ADVERSE_STATE
        .CONFIRMED_FINDING,
      ADVERSE_STATE
        .CHARGED,
    ].includes(
      state,
    )
  ) {
    score +=
      0.08;
  }

  if (
    state ===
    ADVERSE_STATE
      .UNVERIFIED
  ) {
    score -=
      0.2;
  }

  return clamp(
    score,
    0,
    1,
  );
}

/**
 * ============================================================
 * SEVERITY
 * ============================================================
 */

function classifySeverity({
  category,
  state,
  text,
  authority,
}) {
  let score =
    1;

  if (
    [
      ADVERSE_CATEGORY
        .FRAUD,
      ADVERSE_CATEGORY
        .FINANCIAL_REPORTING,
      ADVERSE_CATEGORY
        .BANKRUPTCY,
      ADVERSE_CATEGORY
        .SANCTIONS,
      ADVERSE_CATEGORY
        .COMPETITION,
    ].includes(
      category,
    )
  ) {
    score +=
      2;
  }

  if (
    [
      ADVERSE_STATE
        .CHARGED,
      ADVERSE_STATE
        .JUDGMENT,
      ADVERSE_STATE
        .REGULATORY_ACTION,
      ADVERSE_STATE
        .CONFIRMED_FINDING,
    ].includes(
      state,
    )
  ) {
    score +=
      2;
  }

  if (
    state ===
    ADVERSE_STATE
      .INVESTIGATION ||
    state ===
    ADVERSE_STATE
      .LAWSUIT_FILED
  ) {
    score +=
      1;
  }

  if (
    authority ===
    SOURCE_AUTHORITY
      .PRIMARY
  ) {
    score +=
      1;
  }

  if (
    includesAny(
      text,
      [
        "billion",
        "criminal",
        "systemic",
        "bankruptcy",
        "massive recall",
        "national security",
      ],
    )
  ) {
    score +=
      1;
  }

  if (
    state ===
    ADVERSE_STATE
      .DISMISSED
  ) {
    score -=
      2;
  }

  if (
    state ===
    ADVERSE_STATE
      .UNVERIFIED
  ) {
    score -=
      1;
  }

  if (score >= 6) {
    return ADVERSE_SEVERITY
      .CRITICAL;
  }

  if (score >= 4) {
    return ADVERSE_SEVERITY
      .HIGH;
  }

  if (score >= 2) {
    return ADVERSE_SEVERITY
      .MEDIUM;
  }

  return ADVERSE_SEVERITY
    .LOW;
}

/**
 * ============================================================
 * MATERIALITY
 * ============================================================
 */

function buildMarketRelevance({
  category,
  state,
  severity,
}) {
  let score =
    20;

  if (
    severity ===
    ADVERSE_SEVERITY
      .CRITICAL
  ) {
    score +=
      60;
  } else if (
    severity ===
    ADVERSE_SEVERITY
      .HIGH
  ) {
    score +=
      40;
  } else if (
    severity ===
    ADVERSE_SEVERITY
      .MEDIUM
  ) {
    score +=
      20;
  }

  if (
    [
      ADVERSE_CATEGORY
        .FRAUD,
      ADVERSE_CATEGORY
        .FINANCIAL_REPORTING,
      ADVERSE_CATEGORY
        .BANKRUPTCY,
      ADVERSE_CATEGORY
        .COMPETITION,
      ADVERSE_CATEGORY
        .SANCTIONS,
    ].includes(
      category,
    )
  ) {
    score +=
      10;
  }

  if (
    state ===
    ADVERSE_STATE
      .DISMISSED
  ) {
    score -=
      25;
  }

  score =
    clamp(
      score,
      0,
      100,
    );

  return {
    material:
      score >= 50,

    score,

    reasons: [
      `Category: ${category}`,
      `Evidence state: ${state}`,
      `Severity: ${severity}`,
    ],
  };
}

/**
 * ============================================================
 * ADVERSE KEYWORD FILTER
 * ============================================================
 */

function looksAdverse(
  text,
) {
  return includesAny(
    text,
    [
      "lawsuit",
      "sued",
      "litigation",
      "court",
      "investigation",
      "probe",
      "subpoena",
      "charged",
      "indicted",
      "settlement",
      "settled",
      "judgment",
      "judgement",
      "regulator",
      "regulatory",
      "enforcement",
      "sec ",
      "ftc",
      "doj",
      "department of justice",
      "fraud",
      "scam",
      "alleged",
      "allegation",
      "accused",
      "recall",
      "data breach",
      "cyberattack",
      "privacy",
      "antitrust",
      "anti-trust",
      "restatement",
      "accounting",
      "bankruptcy",
      "sanction",
      "labor dispute",
      "labour dispute",
      "strike",
    ],
  );
}

/**
 * ============================================================
 * NEWS EXTRACTION
 * ============================================================
 */

function extractNewsItems(
  providerResult,
) {
  const result =
    providerResult
      ?.data ??
    providerResult;

  const candidates =
    result
      ?.news ??
    result
      ?.articles ??
    result
      ?.data
      ?.news ??
    result
      ?.data
      ?.articles ??
    result
      ?.data ??
    [];

  return Array.isArray(
    candidates,
  )
    ? candidates
    : [];
}

function normalizeNewsEvidence({
  article,
  symbol,
  companyName,
}) {
  if (!article) {
    return null;
  }

  const headline =
    normalizeString(
      article
        ?.headline ??
      article
        ?.title,
    );

  const summary =
    normalizeString(
      article
        ?.summary ??
      article
        ?.description ??
      article
        ?.content,
    );

  const text =
    combinedText(
      headline,
      summary,
    );

  if (
    !headline ||
    !looksAdverse(
      text,
    )
  ) {
    return null;
  }

  const articleSymbols =
    article
      ?.symbols ??
    article
      ?.tickers ??
    [];

  const hasExplicitCompanyReference =
    companyIsExplicitlyReferenced({
      symbol,
      companyName,
      text,
      symbols:
        articleSymbols,
      entities:
        article
          ?.entities ??
        [],
    });

  /**
   * Alpaca news is normally symbol-filtered upstream, but keep an
   * explicit relevance gate so malformed/provider-wide results do
   * not contaminate company adverse intelligence.
   */
  if (
    !hasExplicitCompanyReference
  ) {
    return null;
  }

  const sourceName =
    normalizeString(
      article
        ?.source ??
      article
        ?.publisher,
    );

  const sourceUrl =
    normalizeString(
      article
        ?.url ??
      article
        ?.link,
    );

  const category =
    classifyCategory(
      text,
    );

  const state =
    classifyState(
      text,
    );

  const authority =
    classifyAuthority({
      sourceName,
      sourceType:
        "NEWS",
      url:
        sourceUrl,
    });

  const severity =
    classifySeverity({
      category,
      state,
      text,
      authority,
    });

  const confidence =
    confidenceFor({
      authority,
      state,
      hasUrl:
        Boolean(
          sourceUrl,
        ),
    });

  return {
    id:
      makeId({
        symbol,
        sourceUrl,
        headline,
        state,
      }),

    symbol,

    companyName,

    category,

    state,

    severity,

    sentiment:
      state ===
      ADVERSE_STATE
        .DISMISSED
        ? "NEUTRAL"
        : "NEGATIVE",

    title:
      headline,

    summary,

    occurredAt:
      normalizeString(
        article
          ?.eventDate,
      ),

    publishedAt:
      normalizeString(
        article
          ?.createdAt ??
        article
          ?.publishedAt ??
        article
          ?.timestamp,
      ),

    authority,

    sourceName,

    sourceType:
      "NEWS",

    sourceUrl,

    primarySource:
      authority ===
      SOURCE_AUTHORITY
        .PRIMARY,

    verified:
      authority ===
      SOURCE_AUTHORITY
        .PRIMARY,

    confidence,

    entities:
      normalizeArray(
        article
          ?.symbols,
      ),

    allegations:
      state ===
      ADVERSE_STATE
        .ALLEGATION
        ? [
            summary ??
            headline,
          ]
        : [],

    findings:
      [
        ADVERSE_STATE
          .JUDGMENT,
        ADVERSE_STATE
          .REGULATORY_ACTION,
        ADVERSE_STATE
          .CONFIRMED_FINDING,
        ADVERSE_STATE
          .SETTLEMENT,
        ADVERSE_STATE
          .DISMISSED,
      ].includes(
        state,
      )
        ? [
            summary ??
            headline,
          ]
        : [],

    penalties:
      [],

    marketRelevance:
      buildMarketRelevance({
        category,
        state,
        severity,
      }),

    evidence: [
      {
        sourceName,
        sourceType:
          "NEWS",
        sourceUrl,
        authority,
        publishedAt:
          normalizeString(
            article
              ?.createdAt ??
            article
              ?.publishedAt ??
            article
              ?.timestamp,
          ),
      },
    ],

    raw:
      article,
  };
}

/**
 * ============================================================
 * FEDERAL REGISTER EXTRACTION
 * ============================================================
 */

function extractFederalEvents(
  providerResult,
) {
  const result =
    providerResult
      ?.data ??
    providerResult;

  const candidates =
    result
      ?.events ??
    result
      ?.data
      ?.events ??
    result
      ?.results ??
    result
      ?.data ??
    [];

  return Array.isArray(
    candidates,
  )
    ? candidates
    : [];
}

function normalizeFederalEvidence({
  event,
  symbol,
  companyName,
}) {
  if (!event) {
    return null;
  }

  const title =
    normalizeString(
      event
        ?.title ??
      event
        ?.headline ??
      event
        ?.name,
    );

  const summary =
    normalizeString(
      event
        ?.summary ??
      event
        ?.description ??
      event
        ?.abstract ??
      event
        ?.text,
    );

  const text =
    combinedText(
      title,
      summary,
      event
        ?.type,
      event
        ?.agency,
    );

  if (!title) {
    return null;
  }

  /**
   * CRITICAL RELEVANCE GATE
   *
   * Federal Register feeds are broad. A generic government notice
   * must never become company adverse intelligence merely because
   * it contains words such as "privacy", "charged", "accounting",
   * or "court".
   */

  const explicitlyRelevant =
    companyIsExplicitlyReferenced({
      symbol,
      companyName,
      text,
      symbols:
        event
          ?.symbols ??
        event
          ?.tickers ??
        [],
      entities:
        event
          ?.entities ??
        event
          ?.companies ??
        [],
    });

  if (!explicitlyRelevant) {
    return null;
  }

  /**
   * A company mention alone is not enough. The document also has
   * to describe an adverse/enforcement/legal matter.
   */

  if (
    !looksAdverse(
      text,
    )
  ) {
    return null;
  }

  const sourceUrl =
    normalizeString(
      event
        ?.url ??
      event
        ?.htmlUrl ??
      event
        ?.documentUrl,
    );

  const sourceName =
    normalizeString(
      event
        ?.agency ??
      event
        ?.source ??
      "Federal Register",
    );

  const category =
    classifyCategory(
      text,
    );

  const state =
    classifyState(
      text,
    );

  /**
   * Do not manufacture "REGULATORY_ACTION" merely because the
   * item came from the Federal Register. If the language does not
   * establish a meaningful adverse state, discard the item.
   */

  if (
    state ===
    ADVERSE_STATE
      .UNVERIFIED ||
    state ===
    ADVERSE_STATE
      .REPORTED
  ) {
    return null;
  }

  const authority =
    SOURCE_AUTHORITY
      .PRIMARY;

  const normalizedCategory =
    category ===
    ADVERSE_CATEGORY
      .OTHER
      ? ADVERSE_CATEGORY
          .REGULATORY
      : category;

  const severity =
    classifySeverity({
      category:
        normalizedCategory,
      state,
      text,
      authority,
    });

  const confidence =
    confidenceFor({
      authority,
      state,
      hasUrl:
        Boolean(
          sourceUrl,
        ),
    });

  return {
    id:
      makeId({
        symbol,
        sourceUrl,
        headline:
          title,
        state,
      }),

    symbol,

    companyName,

    category:
      normalizedCategory,

    state,

    severity,

    sentiment:
      state ===
      ADVERSE_STATE
        .DISMISSED
        ? "NEUTRAL"
        : "NEGATIVE",

    title,

    summary,

    occurredAt:
      normalizeString(
        event
          ?.effectiveDate ??
        event
          ?.eventDate,
      ),

    publishedAt:
      normalizeString(
        event
          ?.publicationDate ??
        event
          ?.publishedAt ??
        event
          ?.timestamp,
      ),

    authority,

    sourceName,

    sourceType:
      "FEDERAL_REGISTER",

    sourceUrl,

    primarySource:
      true,

    verified:
      true,

    confidence,

    entities:
      normalizeArray(
        event
          ?.entities,
      ),

    allegations:
      state ===
      ADVERSE_STATE
        .ALLEGATION
        ? [
            summary ??
            title,
          ]
        : [],

    findings:
      [
        ADVERSE_STATE
          .REGULATORY_ACTION,
        ADVERSE_STATE
          .JUDGMENT,
        ADVERSE_STATE
          .CONFIRMED_FINDING,
        ADVERSE_STATE
          .SETTLEMENT,
        ADVERSE_STATE
          .DISMISSED,
      ].includes(
        state,
      )
        ? [
            summary ??
            title,
          ]
        : [],

    penalties:
      [],

    marketRelevance:
      buildMarketRelevance({
        category:
          normalizedCategory,
        state,
        severity,
      }),

    evidence: [
      {
        sourceName,
        sourceType:
          "FEDERAL_REGISTER",
        sourceUrl,
        authority,
        publishedAt:
          normalizeString(
            event
              ?.publicationDate ??
            event
              ?.publishedAt ??
            event
              ?.timestamp,
          ),
      },
    ],

    raw:
      event,
  };
}

/**
 * ============================================================
 * DEDUPLICATION
 * ============================================================
 */

function deduplicateItems(
  items,
) {
  const seen =
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
      (
        item
          ?.sourceUrl
          ? `url:${item.sourceUrl}`
          : `text:${String(
              item
                ?.title ??
              "",
            )
              .toLowerCase()
              .slice(
                0,
                180,
              )}`
      );

    const existing =
      seen.get(
        key,
      );

    if (!existing) {
      seen.set(
        key,
        item,
      );

      continue;
    }

    /**
     * Keep the higher-confidence duplicate.
     */

    if (
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
    ) {
      seen.set(
        key,
        item,
      );
    }
  }

  return [
    ...seen.values(),
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

  const byState =
    {};

  const byCategory =
    {};

  const bySeverity =
    {};

  for (
    const item
    of records
  ) {
    byState[
      item.state
    ] =
      (
        byState[
          item.state
        ] ??
        0
      ) +
      1;

    byCategory[
      item.category
    ] =
      (
        byCategory[
          item.category
        ] ??
        0
      ) +
      1;

    bySeverity[
      item.severity
    ] =
      (
        bySeverity[
          item.severity
        ] ??
        0
      ) +
      1;
  }

  const critical =
    records.filter(
      item =>
        item
          ?.severity ===
        ADVERSE_SEVERITY
          .CRITICAL,
    ).length;

  const high =
    records.filter(
      item =>
        item
          ?.severity ===
        ADVERSE_SEVERITY
          .HIGH,
    ).length;

  const material =
    records.filter(
      item =>
        item
          ?.marketRelevance
          ?.material ===
        true,
    ).length;

  const primarySources =
    records.filter(
      item =>
        item
          ?.primarySource ===
        true,
    ).length;

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

  let overallRisk =
    "LOW";

  if (
    critical > 0
  ) {
    overallRisk =
      "CRITICAL";
  } else if (
    high >= 2 ||
    material >= 3
  ) {
    overallRisk =
      "HIGH";
  } else if (
    high > 0 ||
    material > 0
  ) {
    overallRisk =
      "MEDIUM";
  }

  return {
    totalItems:
      records.length,

    overallRisk,

    materialItems:
      material,

    primarySourceItems:
      primarySources,

    averageConfidence,

    byState,

    byCategory,

    bySeverity,

    lawsuits:
      (
        byState[
          ADVERSE_STATE
            .LAWSUIT_FILED
        ] ??
        0
      ),

    investigations:
      (
        byState[
          ADVERSE_STATE
            .INVESTIGATION
        ] ??
        0
      ),

    allegations:
      (
        byState[
          ADVERSE_STATE
            .ALLEGATION
        ] ??
        0
      ),

    regulatoryActions:
      (
        byState[
          ADVERSE_STATE
            .REGULATORY_ACTION
        ] ??
        0
      ),

    settlements:
      (
        byState[
          ADVERSE_STATE
            .SETTLEMENT
        ] ??
        0
      ),

    judgments:
      (
        byState[
          ADVERSE_STATE
            .JUDGMENT
        ] ??
        0
      ),

    dismissed:
      (
        byState[
          ADVERSE_STATE
            .DISMISSED
        ] ??
        0
      ),

    confirmedFindings:
      (
        byState[
          ADVERSE_STATE
            .CONFIRMED_FINDING
        ] ??
        0
      ),

    unverified:
      (
        byState[
          ADVERSE_STATE
            .UNVERIFIED
        ] ??
        0
      ),
  };
}

/**
 * ============================================================
 * FACTORY
 * ============================================================
 */

export function createAdverseIntelligenceProvider({
  profileProvider =
    getCompanyProfile,

  newsProvider =
    getMarketNews,

  regulatoryProvider =
    getFederalRegisterEvents,
} = {}) {
  return async function getAdverseIntelligence({
    symbol,

    newsLimit =
      DEFAULT_NEWS_LIMIT,

    maximumItems =
      DEFAULT_MAXIMUM_ITEMS,
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
          "ADVERSE_INTELLIGENCE",

        status:
          ADVERSE_INTELLIGENCE_STATUS
            .INVALID_REQUEST,

        symbol:
          null,

        companyName:
          null,

        summary:
          buildSummary(
            [],
          ),

        items:
          [],

        evidence:
          [],

        providers:
          {},

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

    try {
      const safeNewsLimit =
        positiveInteger(
          newsLimit,
          DEFAULT_NEWS_LIMIT,
          100,
        );

      const safeMaximumItems =
        positiveInteger(
          maximumItems,
          DEFAULT_MAXIMUM_ITEMS,
          500,
        );

      /**
       * ------------------------------------------------------
       * 1. RESOLVE COMPANY IDENTITY
       * ------------------------------------------------------
       */

      const profileResult =
        await safeProviderCall({
          name:
            "COMPANY_PROFILE",

          provider:
            profileProvider,

          args: {
            symbol:
              normalizedSymbol,
          },
        });

      const profile =
        profileResult
          ?.approved
          ? (
              profileResult
                ?.data
                ?.data ??
              profileResult
                ?.data ??
              null
            )
          : null;

      const companyName =
        normalizeString(
          profile
            ?.companyName ??
          profile
            ?.name,
        );

      /**
       * ------------------------------------------------------
       * 2. LOAD INDEPENDENT ADVERSE EVIDENCE SOURCES
       * ------------------------------------------------------
       */

      const [
        newsResult,
        regulatoryResult,
      ] =
        await Promise.all([
          safeProviderCall({
            name:
              "MARKET_NEWS",

            provider:
              newsProvider,

            args: {
              symbol:
                normalizedSymbol,

              limit:
                safeNewsLimit,
            },
          }),

          safeProviderCall({
            name:
              "FEDERAL_REGISTER",

            provider:
              regulatoryProvider,

            args: {
              symbol:
                normalizedSymbol,
            },
          }),
        ]);

      /**
       * ------------------------------------------------------
       * 3. NORMALIZE NEWS EVIDENCE
       * ------------------------------------------------------
       */

      const newsItems =
        extractNewsItems(
          newsResult,
        )
          .map(
            article =>
              normalizeNewsEvidence({
                article,
                symbol:
                  normalizedSymbol,
                companyName,
              }),
          )
          .filter(Boolean);

      /**
       * ------------------------------------------------------
       * 4. NORMALIZE REGULATORY EVIDENCE
       * ------------------------------------------------------
       */

      const regulatoryItems =
        extractFederalEvents(
          regulatoryResult,
        )
          .map(
            event =>
              normalizeFederalEvidence({
                event,
                symbol:
                  normalizedSymbol,
                companyName,
              }),
          )
          .filter(Boolean);

      /**
       * ------------------------------------------------------
       * 5. DEDUPLICATE + RANK
       * ------------------------------------------------------
       */

      const items =
        deduplicateItems([
          ...newsItems,
          ...regulatoryItems,
        ])
          .sort(
            (
              a,
              b,
            ) => {
              const materialDifference =
                Number(
                  b
                    ?.marketRelevance
                    ?.score ??
                  0,
                ) -
                Number(
                  a
                    ?.marketRelevance
                    ?.score ??
                  0,
                );

              if (
                materialDifference !==
                0
              ) {
                return materialDifference;
              }

              const confidenceDifference =
                Number(
                  b
                    ?.confidence ??
                  0,
                ) -
                Number(
                  a
                    ?.confidence ??
                  0,
                );

              if (
                confidenceDifference !==
                0
              ) {
                return confidenceDifference;
              }

              return (
                new Date(
                  b
                    ?.publishedAt ??
                  0,
                ).getTime() -
                new Date(
                  a
                    ?.publishedAt ??
                  0,
                ).getTime()
              );
            },
          )
          .slice(
            0,
            safeMaximumItems,
          );

      const summary =
        buildSummary(
          items,
        );

      const providerResults =
        [
          profileResult,
          newsResult,
          regulatoryResult,
        ];

      const successfulProviders =
        providerResults.filter(
          result =>
            result
              ?.approved ===
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

      const providerErrors =
        uniqueStrings(
          providerResults
            .flatMap(
              result =>
                result
                  ?.errors ??
                [],
            ),
        );

      const hasProviderData =
        newsResult
          ?.approved ===
        true ||
        regulatoryResult
          ?.approved ===
        true;

      const status =
        !hasProviderData
          ? ADVERSE_INTELLIGENCE_STATUS
              .NO_DATA
          : successfulProviders ===
              providerResults.length
            ? ADVERSE_INTELLIGENCE_STATUS
                .COMPLETE
            : ADVERSE_INTELLIGENCE_STATUS
                .PARTIAL;

      /**
       * IMPORTANT:
       *
       * Zero adverse items is a valid research outcome when
       * providers ran successfully. It does NOT mean the provider
       * failed.
       */

      return {
        approved:
          hasProviderData,

        provider:
          "ADVERSE_INTELLIGENCE",

        status,

        symbol:
          normalizedSymbol,

        companyName,

        summary,

        itemCount:
          items.length,

        items,

        /**
         * Coordinator compatibility.
         *
         * companyResearchCoordinator expects legal.evidence.
         */

        evidence:
          items,

        providers: {
          companyProfile: {
            approved:
              profileResult
                ?.approved ===
              true,

            status:
              profileResult
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

            candidateCount:
              extractNewsItems(
                newsResult,
              ).length,

            adverseCount:
              newsItems.length,
          },

          federalRegister: {
            approved:
              regulatoryResult
                ?.approved ===
              true,

            status:
              regulatoryResult
                ?.status ??
              "NOT_RUN",

            candidateCount:
              extractFederalEvents(
                regulatoryResult,
              ).length,

            adverseCount:
              regulatoryItems.length,
          },
        },

        warnings,

        errors:
          hasProviderData
            ? []
            : providerErrors,

        startedAt,

        timestamp:
          now(),
      };
    } catch (error) {
      return {
        approved:
          false,

        provider:
          "ADVERSE_INTELLIGENCE",

        status:
          ADVERSE_INTELLIGENCE_STATUS
            .ERROR,

        symbol:
          normalizedSymbol,

        companyName:
          null,

        summary:
          buildSummary(
            [],
          ),

        itemCount:
          0,

        items:
          [],

        evidence:
          [],

        providers:
          {},

        warnings: [
          "Adverse intelligence failed safely. No allegation should be treated as a confirmed finding.",
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
  };
}

/**
 * ============================================================
 * PRODUCTION PROVIDER
 * ============================================================
 */

export const getAdverseIntelligence =
  createAdverseIntelligenceProvider();

export default
  getAdverseIntelligence;
