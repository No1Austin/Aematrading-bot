/**
 * ============================================================
 * EVENT RELEVANCE ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Filter large volumes of verified government/regulatory
 * events before they reach Event Interpretation.
 *
 * This engine does NOT decide bullish or bearish direction.
 *
 * It only answers:
 *
 * "Is this event relevant enough to the market, sector,
 * country, or symbol to deserve interpretation?"
 *
 * ============================================================
 */

export const EVENT_RELEVANCE_LEVEL =
  Object.freeze({
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MODERATE: "MODERATE",
    LOW: "LOW",
    IRRELEVANT: "IRRELEVANT",
    UNKNOWN: "UNKNOWN",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeText(
  value,
) {
  return String(
    value ?? "",
  )
    .replace(
      /\s+/g,
      " ",
    )
    .trim()
    .toLowerCase();
}

function normalizeUpper(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

function clamp(
  value,
  min,
  max,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return min;
  }

  return Math.min(
    Math.max(
      number,
      min,
    ),
    max,
  );
}

function round(
  value,
  decimals = 4,
) {
  const number =
    Number(value);

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
}

function combineEventText(
  event,
) {
  return normalizeText(
    [
      event?.title,
      event?.summary,
      event?.content,

      Array.isArray(
        event
          ?.metadata
          ?.agencies,
      )
        ? event.metadata.agencies.join(
            " ",
          )
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function escapeRegExp(
  value,
) {
  return String(
    value ?? "",
  ).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

function keywordMatches(
  text,
  keyword,
) {
  const normalizedText =
    normalizeText(
      text,
    );

  const normalizedKeyword =
    normalizeText(
      keyword,
    );

  if (
    !normalizedText ||
    !normalizedKeyword
  ) {
    return false;
  }

  /**
   * Whole-word / whole-phrase matching.
   *
   * This prevents short terms such as "ai" from matching
   * unrelated words such as:
   *
   * - aircraft
   * - available
   * - training
   * - certain
   *
   * We deliberately avoid regex lookbehind so this remains
   * portable across Node runtimes.
   */

  try {
    const escaped =
      escapeRegExp(
        normalizedKeyword,
      ).replace(
        /\\ /g,
        "\\s+",
      );

    const pattern =
      new RegExp(
        `(?:^|[^a-z0-9])(${escaped})(?=$|[^a-z0-9])`,
        "i",
      );

    return pattern.test(
      normalizedText,
    );
  } catch {
    /**
     * Fail safe:
     * malformed keyword matching must never make an event
     * relevant. It simply becomes a non-match.
     */
    return false;
  }
}

function countKeywordMatches(
  text,
  keywords,
) {
  if (
    !Array.isArray(
      keywords,
    ) ||
    keywords.length === 0
  ) {
    return [];
  }

  const matches =
    new Set();

  for (
    const keyword
    of keywords
  ) {
    const normalizedKeyword =
      normalizeText(
        keyword,
      );

    if (
      !normalizedKeyword
    ) {
      continue;
    }

    if (
      keywordMatches(
        text,
        normalizedKeyword,
      )
    ) {
      matches.add(
        normalizedKeyword,
      );
    }
  }

  return [
    ...matches,
  ];
}


/**
 * ============================================================
 * MARKET-SENSITIVE KEYWORDS
 * ============================================================
 */

const CRITICAL_MARKET_KEYWORDS = [
  "national emergency",
  "banking crisis",
  "financial stability",
  "systemic risk",
  "market disruption",
  "exchange outage",
  "capital controls",
  "export controls",
  "sanctions",
  "tariff",
  "trade restriction",
  "cyberattack",
  "cyber attack",
  "semiconductor restrictions",
];

const HIGH_MARKET_KEYWORDS = [
  "trade",
  "imports",
  "exports",
  "technology",
  "semiconductor",
  "artificial intelligence",
  "ai regulation",
  "banking",
  "financial institutions",
  "securities",
  "capital markets",
  "antitrust",
  "competition",
  "energy",
  "oil",
  "natural gas",
  "telecommunications",
  "cybersecurity",
  "government procurement",
  "federal procurement",
  "tax",
  "corporate tax",
  "interest rate",
  "monetary policy",
  "inflation",
];

const MODERATE_MARKET_KEYWORDS = [
  "manufacturing",
  "supply chain",
  "transportation",
  "labor",
  "employment",
  "healthcare",
  "pharmaceutical",
  "defense",
  "aviation",
  "infrastructure",
  "privacy",
  "data security",
  "consumer protection",
  "environmental regulation",
];

const LOW_VALUE_ADMIN_KEYWORDS = [
  "sunshine act meeting",
  "information collection",
  "paperwork reduction act",
  "request for comments",
  "privacy training",
  "architect-engineer qualifications",
  "prospective subcontractor",
  "administrative correction",
  "meeting notice",
];

/**
 * ============================================================
 * SYMBOL / SECTOR KNOWLEDGE
 * ============================================================
 *
 * Small initial mapping.
 *
 * This should later move into dedicated company/sector
 * metadata rather than growing forever in this file.
 */

const SYMBOL_RELEVANCE = {
  AAPL: {
    sectors: [
      "TECHNOLOGY",
      "CONSUMER ELECTRONICS",
    ],

    keywords: [
      "apple",
      "iphone",
      "consumer electronics",
      "semiconductor",
      "chips",
      "artificial intelligence",
      "ai",
      "telecommunications",
      "mobile devices",
      "app store",
      "digital markets",
      "antitrust",
      "privacy",
      "data protection",
      "cybersecurity",
      "export controls",
      "tariff",
      "china",
      "supply chain",
      "consumer technology",
      "smartphone",
      "smartphones",
      "mobile operating system",
      "digital platform",
      "digital platforms",
      "consumer devices",
    ],
  },
};

/**
 * ============================================================
 * RELEVANCE CLASSIFICATION
 * ============================================================
 */

function classifyRelevanceLevel(
  score,
) {
  if (
    score >= 0.85
  ) {
    return EVENT_RELEVANCE_LEVEL
      .CRITICAL;
  }

  if (
    score >= 0.65
  ) {
    return EVENT_RELEVANCE_LEVEL
      .HIGH;
  }

  if (
    score >= 0.4
  ) {
    return EVENT_RELEVANCE_LEVEL
      .MODERATE;
  }

  if (
    score >= 0.2
  ) {
    return EVENT_RELEVANCE_LEVEL
      .LOW;
  }

  return EVENT_RELEVANCE_LEVEL
    .IRRELEVANT;
}

/**
 * ============================================================
 * INTERPRET ONE EVENT'S RELEVANCE
 * ============================================================
 */

export function scoreEventRelevance({
  event,
  symbol = null,
  sector = null,
  country = "US",
} = {}) {
  if (
    !event ||
    typeof event !==
      "object" ||
    Array.isArray(
      event,
    )
  ) {
    return {
      approved: false,
      status: "INVALID_EVENT",
      relevant: false,
      score: 0,
      level:
        EVENT_RELEVANCE_LEVEL
          .UNKNOWN,
      reasons: [
        "Event must be a non-array object.",
      ],

      evidence: {
        criticalMatches: [],
        highMatches: [],
        moderateMatches: [],
        lowValueMatches: [],
      },

      warnings: [],

      errors: [
        "Event must be a non-array object.",
      ],
    };
  }

  const text =
    combineEventText(
      event,
    );

  const normalizedSymbol =
    normalizeUpper(
      symbol,
    );

  const normalizedSector =
    normalizeUpper(
      sector,
    );

  const normalizedCountry =
    normalizeUpper(
      country,
    );

  let score = 0;

  const reasons = [];

  const criticalMatches =
    countKeywordMatches(
      text,
      CRITICAL_MARKET_KEYWORDS,
    );

  const highMatches =
    countKeywordMatches(
      text,
      HIGH_MARKET_KEYWORDS,
    );

  const moderateMatches =
    countKeywordMatches(
      text,
      MODERATE_MARKET_KEYWORDS,
    );

  const lowValueMatches =
    countKeywordMatches(
      text,
      LOW_VALUE_ADMIN_KEYWORDS,
    );

  if (
    criticalMatches.length >
    0
  ) {
    score +=
      Math.min(
        0.7,
        0.45 +
          criticalMatches.length *
            0.08,
      );

    reasons.push(
      `Critical market-sensitive terms: ${criticalMatches.join(
        ", ",
      )}.`,
    );
  }

  if (
    highMatches.length >
    0
  ) {
    score +=
      Math.min(
        0.45,
        highMatches.length *
          0.08,
      );

    reasons.push(
      `High-value market terms: ${highMatches.join(
        ", ",
      )}.`,
    );
  }

  if (
    moderateMatches.length >
    0
  ) {
    score +=
      Math.min(
        0.25,
        moderateMatches.length *
          0.05,
      );

    reasons.push(
      `Moderate market terms: ${moderateMatches.join(
        ", ",
      )}.`,
    );
  }

  /**
   * ----------------------------------------------------------
   * EVENT-TYPE BONUS
   * ----------------------------------------------------------
   */

  const type =
    normalizeUpper(
      event.type,
    );

  if (
    [
      "TARIFF",
      "SANCTIONS",
      "TRADE_POLICY",
      "CENTRAL_BANK",
      "BANKING_CRISIS",
      "CYBERATTACK",
      "WAR",
      "FLASH_CRASH",
    ].includes(
      type,
    )
  ) {
    score += 0.25;

    reasons.push(
      `High-sensitivity event type: ${type}.`,
    );
  } else if (
    [
      "REGULATION",
      "GOVERNMENT_POLICY",
      "GEOPOLITICAL",
    ].includes(
      type,
    )
  ) {
    score += 0.1;
  }

  /**
   * ----------------------------------------------------------
   * COUNTRY RELEVANCE
   * ----------------------------------------------------------
   */

  const countries =
    Array.isArray(
      event.countries,
    )
      ? event.countries.map(
          normalizeUpper,
        )
      : [];

  if (
    normalizedCountry &&
    countries.includes(
      normalizedCountry,
    )
  ) {
    score += 0.05;
  }

  /**
   * ----------------------------------------------------------
   * SECTOR RELEVANCE
   * ----------------------------------------------------------
   */

  const sectors =
    Array.isArray(
      event.sectors,
    )
      ? event.sectors.map(
          normalizeUpper,
        )
      : [];

  if (
    normalizedSector &&
    sectors.includes(
      normalizedSector,
    )
  ) {
    score += 0.2;

    reasons.push(
      `Direct sector match: ${normalizedSector}.`,
    );
  }

  /**
   * ----------------------------------------------------------
   * SYMBOL RELEVANCE
   * ----------------------------------------------------------
   */

  const symbols =
    Array.isArray(
      event.symbols,
    )
      ? event.symbols.map(
          normalizeUpper,
        )
      : [];

  if (
    normalizedSymbol &&
    symbols.includes(
      normalizedSymbol,
    )
  ) {
    score += 0.5;

    reasons.push(
      `Direct symbol match: ${normalizedSymbol}.`,
    );
  }

  const symbolProfile =
    SYMBOL_RELEVANCE[
      normalizedSymbol
    ];

  if (symbolProfile) {
    const symbolMatches =
      countKeywordMatches(
        text,
        symbolProfile.keywords,
      );

    if (
      symbolMatches.length >
      0
    ) {
      score +=
        Math.min(
          0.45,
          0.12 +
            symbolMatches.length *
              0.05,
        );

      reasons.push(
        `Symbol-sensitive terms for ${normalizedSymbol}: ${symbolMatches.join(
          ", ",
        )}.`,
      );
    }
  }

  /**
   * ----------------------------------------------------------
   * ADMINISTRATIVE-NOISE PENALTY
   * ----------------------------------------------------------
   *
   * Administrative documents are penalized only when a real
   * administrative phrase was actually matched.
   *
   * Critical market events are never downgraded merely because
   * their text also contains routine administrative language.
   */

  if (
    lowValueMatches.length >
      0 &&
    criticalMatches.length ===
      0
  ) {
    const adminPenalty =
      Math.min(
        0.6,
        0.25 +
          lowValueMatches.length *
            0.12,
      );

    score -=
      adminPenalty;

    reasons.push(
      `Administrative/noise penalty applied: ${lowValueMatches.join(
        ", ",
      )}.`,
    );
  }

  score =
    clamp(
      score,
      0,
      1,
    );

  const level =
    classifyRelevanceLevel(
      score,
    );

  /**
   * Minimum relevance threshold.
   *
   * 0.40 means MODERATE or higher proceeds to
   * interpretation.
   */

  const relevant =
    score >= 0.4;

  return {
    approved: true,

    status:
      relevant
        ? "RELEVANT"
        : "FILTERED",

    relevant,

    score:
      round(
        score,
      ),

    level,

    reasons,

    evidence: {
      criticalMatches,
      highMatches,
      moderateMatches,
      lowValueMatches,
    },

    warnings: [],

    errors: [],
  };
}

/**
 * ============================================================
 * FILTER MULTIPLE EVENTS
 * ============================================================
 */

export function filterRelevantEvents({
  events = [],
  symbol = null,
  sector = null,
  country = "US",
  minimumScore = 0.4,
} = {}) {
  if (
    !Array.isArray(
      events,
    )
  ) {
    return {
      approved: false,

      status:
        "INVALID_EVENTS",

      events: [],

      evaluations: [],

      originalCount: 0,

      relevantCount: 0,

      filteredCount: 0,

      minimumScore:
        0.4,

      warnings: [],

      errors: [
        "Events must be an array.",
      ],

      timestamp:
        new Date()
          .toISOString(),
    };
  }

  /**
   * Fail-safe threshold normalization.
   *
   * Invalid values fall back to 0.40 rather than accidentally
   * allowing every event through.
   */

  const parsedMinimumScore =
    Number(
      minimumScore,
    );

  const safeMinimumScore =
    Number.isFinite(
      parsedMinimumScore,
    )
      ? clamp(
          parsedMinimumScore,
          0,
          1,
        )
      : 0.4;

  const evaluations = [];

  const relevantEvents = [];

  const warnings = [];

  for (
    let index = 0;
    index < events.length;
    index += 1
  ) {
    const event =
      events[index];

    try {
      const result =
        scoreEventRelevance({
          event,
          symbol,
          sector,
          country,
        });

      evaluations.push({
        eventKey:
          event?.eventKey ??
          event?.externalId ??
          null,

        title:
          event?.title ??
          null,

        ...result,
      });

      if (
        result.approved ===
          true &&
        Number.isFinite(
          Number(
            result.score,
          ),
        ) &&
        Number(
          result.score,
        ) >=
          safeMinimumScore
      ) {
        relevantEvents.push({
          ...event,

          relevance: {
            score:
              result.score,

            level:
              result.level,

            reasons:
              Array.isArray(
                result.reasons,
              )
                ? [
                    ...result.reasons,
                  ]
                : [],
          },
        });
      }
    } catch (error) {
      /**
       * One malformed event must never crash the entire live
       * relevance pipeline.
       */

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      warnings.push(
        `Event at index ${index} could not be scored: ${message}`,
      );

      evaluations.push({
        eventKey:
          event?.eventKey ??
          event?.externalId ??
          null,

        title:
          event?.title ??
          null,

        approved: false,

        status:
          "SCORING_ERROR",

        relevant: false,

        score: 0,

        level:
          EVENT_RELEVANCE_LEVEL
            .UNKNOWN,

        reasons: [],

        evidence: {
          criticalMatches: [],
          highMatches: [],
          moderateMatches: [],
          lowValueMatches: [],
        },

        errors: [
          message,
        ],
      });
    }
  }

  return {
    approved: true,

    status:
      relevantEvents.length >
      0
        ? "READY"
        : "NO_RELEVANT_EVENTS",

    events:
      relevantEvents,

    evaluations,

    originalCount:
      events.length,

    relevantCount:
      relevantEvents.length,

    filteredCount:
      events.length -
      relevantEvents.length,

    minimumScore:
      safeMinimumScore,

    warnings,

    errors: [],

    timestamp:
      new Date()
        .toISOString(),
  };
}

export default filterRelevantEvents;