import {
  EVENT_TYPE,
  EVENT_STATUS,
} from "./eventIntelligenceEngine.js";

/**
 * ============================================================
 * EVENT INTERPRETATION ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Convert verified/normalized real-world events into
 * market-impact estimates that can be consumed by:
 *
 * eventIntelligenceEngine.js
 *
 * This layer sits between:
 *
 * source providers
 *       ↓
 * marketEventDataProvider.js
 *       ↓
 * THIS ENGINE
 *       ↓
 * eventIntelligenceEngine.js
 *
 * IMPORTANT
 * ---------
 *
 * This engine does NOT fetch news.
 *
 * It does NOT automatically assume:
 *
 * "bad headline" = SHORT
 * "good headline" = LONG
 *
 * Instead it considers:
 *
 * - event type
 * - full text / summary when available
 * - current macro environment
 * - expectations when available
 * - previous policy/event context
 * - symbol relevance
 * - sector relevance
 * - event credibility
 * - event status
 *
 * Output:
 *
 * surprise: 0 → 1
 * rawImpact: -1 → +1
 *
 * Missing evidence must remain UNKNOWN rather than
 * fabricated neutral evidence.
 */

/**
 * ============================================================
 * INTERPRETATION STANCE
 * ============================================================
 */

export const EVENT_STANCE =
  Object.freeze({
    VERY_HAWKISH:
      "VERY_HAWKISH",

    HAWKISH:
      "HAWKISH",

    NEUTRAL:
      "NEUTRAL",

    DOVISH:
      "DOVISH",

    VERY_DOVISH:
      "VERY_DOVISH",

    POSITIVE:
      "POSITIVE",

    NEGATIVE:
      "NEGATIVE",

    MIXED:
      "MIXED",

    UNKNOWN:
      "UNKNOWN",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return false;
  }

  return Number.isFinite(
    Number(value),
  );
}

function clamp(
  value,
  min,
  max,
) {
  if (
    !isFiniteNumber(value)
  ) {
    return null;
  }

  return Math.min(
    Math.max(
      Number(value),
      min,
    ),
    max,
  );
}

function round(
  value,
  decimals = 4,
) {
  if (
    !isFiniteNumber(value)
  ) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
}

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

function combineText(
  event,
) {
  return [
    event?.title,
    event?.headline,
    event?.summary,
    event?.content,
    event?.body,
    event?.text,
  ]
    .filter(Boolean)
    .join(" ");
}

function includesAny(
  text,
  phrases,
) {
  return phrases.some(
    (phrase) =>
      text.includes(
        phrase,
      ),
  );
}

/**
 * ============================================================
 * KEYWORD SCORING
 * ============================================================
 *
 * Keyword evidence is intentionally conservative.
 *
 * It helps identify stance but should never overpower
 * explicit expectations or quantitative release data.
 */

function scoreKeywords({
  text,
  positive = [],
  negative = [],
}) {
  let score = 0;

  const matchedPositive = [];
  const matchedNegative = [];

  for (
    const phrase
    of positive
  ) {
    if (
      text.includes(
        phrase,
      )
    ) {
      score += 1;

      matchedPositive.push(
        phrase,
      );
    }
  }

  for (
    const phrase
    of negative
  ) {
    if (
      text.includes(
        phrase,
      )
    ) {
      score -= 1;

      matchedNegative.push(
        phrase,
      );
    }
  }

  const totalMatches =
    matchedPositive.length +
    matchedNegative.length;

  if (
    totalMatches === 0
  ) {
    return {
      score: 0,

      confidence: 0,

      matchedPositive,

      matchedNegative,
    };
  }

  return {
    score:
      clamp(
        score /
          totalMatches,
        -1,
        1,
      ),

    confidence:
      clamp(
        totalMatches /
          5,
        0,
        1,
      ),

    matchedPositive,

    matchedNegative,
  };
}

/**
 * ============================================================
 * SURPRISE
 * ============================================================
 */

function calculateSurprise({
  actual = null,
  expected = null,
  previous = null,
  explicitSurprise = null,
}) {
  if (
    isFiniteNumber(
      explicitSurprise,
    )
  ) {
    return clamp(
      explicitSurprise,
      0,
      1,
    );
  }

  if (
    !isFiniteNumber(
      actual,
    ) ||
    !isFiniteNumber(
      expected,
    )
  ) {
    return null;
  }

  const actualValue =
    Number(actual);

  const expectedValue =
    Number(expected);

  const difference =
    Math.abs(
      actualValue -
      expectedValue,
    );

  let referenceMagnitude =
    Math.abs(
      expectedValue,
    );

  if (
    referenceMagnitude <
      0.0001 &&
    isFiniteNumber(
      previous,
    )
  ) {
    referenceMagnitude =
      Math.abs(
        Number(previous),
      );
  }

  if (
    referenceMagnitude <
    0.0001
  ) {
    referenceMagnitude = 1;
  }

  return clamp(
    difference /
      referenceMagnitude,
    0,
    1,
  );
}

/**
 * ============================================================
 * SYMBOL RELEVANCE
 * ============================================================
 */

function calculateSymbolRelevance({
  event,
  symbol,
  country,
  sector,
}) {
  let score = 0.2;

  const normalizedSymbol =
    normalizeUpper(
      symbol,
    );

  const normalizedCountry =
    normalizeUpper(
      country,
    );

  const normalizedSector =
    normalizeUpper(
      sector,
    );

  const symbols =
    Array.isArray(
      event?.symbols,
    )
      ? event.symbols.map(
          normalizeUpper,
        )
      : [];

  const countries =
    Array.isArray(
      event?.countries,
    )
      ? event.countries.map(
          normalizeUpper,
        )
      : [];

  const sectors =
    Array.isArray(
      event?.sectors,
    )
      ? event.sectors.map(
          normalizeUpper,
        )
      : [];

  if (
    normalizedSymbol &&
    symbols.includes(
      normalizedSymbol,
    )
  ) {
    score = Math.max(
      score,
      1,
    );
  }

  if (
    normalizedSector &&
    sectors.includes(
      normalizedSector,
    )
  ) {
    score = Math.max(
      score,
      0.8,
    );
  }

  if (
    normalizedCountry &&
    countries.includes(
      normalizedCountry,
    )
  ) {
    score = Math.max(
      score,
      0.65,
    );
  }

  /**
   * Broad events with no targets can still matter
   * to the whole market.
   */
  if (
    symbols.length === 0 &&
    sectors.length === 0 &&
    countries.length === 0
  ) {
    score = Math.max(
      score,
      0.5,
    );
  }

  return clamp(
    score,
    0,
    1,
  );
}

/**
 * ============================================================
 * FED / CENTRAL BANK INTERPRETATION
 * ============================================================
 */

function interpretCentralBank({
  event,
  macro = null,
  expectations = null,
}) {
  const text =
    normalizeText(
      combineText(
        event,
      ),
    );

  const hawkish =
    [
      "inflation remains elevated",
      "inflation remains high",
      "further tightening",
      "additional tightening",
      "higher for longer",
      "restrictive stance",
      "restrictive policy",
      "upside risks to inflation",
      "inflation risks remain",
      "not appropriate to reduce",
      "not yet appropriate to reduce",
      "raise the target range",
      "increase the target range",
      "rate hike",
      "rates remain restrictive",
    ];

  const dovish =
    [
      "reduce the target range",
      "lower the target range",
      "rate cut",
      "policy easing",
      "easing policy",
      "inflation has eased",
      "inflation has declined",
      "downside risks to employment",
      "labor market has cooled",
      "labour market has cooled",
      "economic activity has slowed",
      "appropriate to begin reducing",
      "less restrictive",
    ];

  const keyword =
    scoreKeywords({
      text,

      positive:
        dovish,

      negative:
        hawkish,
    });

  let impact =
    keyword.score;

  let confidence =
    keyword.confidence;

  const reasons = [];

  if (
    keyword.matchedPositive
      .length >
    0
  ) {
    reasons.push(
      `Dovish language detected: ${keyword.matchedPositive.join(
        ", ",
      )}.`,
    );
  }

  if (
    keyword.matchedNegative
      .length >
    0
  ) {
    reasons.push(
      `Hawkish language detected: ${keyword.matchedNegative.join(
        ", ",
      )}.`,
    );
  }

  /**
   * ========================================================
   * EXPECTATION COMPARISON
   * ========================================================
   */

  const expectedRate =
    expectations
      ?.policyRate
      ?.expected;

  const actualRate =
    expectations
      ?.policyRate
      ?.actual;

  const previousRate =
    expectations
      ?.policyRate
      ?.previous;

  const rateSurprise =
    calculateSurprise({
      actual:
        actualRate,

      expected:
        expectedRate,

      previous:
        previousRate,

      explicitSurprise:
        expectations
          ?.surprise,
    });

  if (
    isFiniteNumber(
      actualRate,
    ) &&
    isFiniteNumber(
      expectedRate,
    )
  ) {
    const delta =
      Number(actualRate) -
      Number(expectedRate);

    if (delta > 0) {
      impact -=
        clamp(
          Math.abs(
            delta,
          ),
          0,
          1,
        );

      reasons.push(
        "Policy rate was higher than market expectation.",
      );
    }

    if (delta < 0) {
      impact +=
        clamp(
          Math.abs(
            delta,
          ),
          0,
          1,
        );

      reasons.push(
        "Policy rate was lower than market expectation.",
      );
    }

    confidence =
      Math.max(
        confidence,
        0.8,
      );
  }

  /**
   * ========================================================
   * DIRECTIONAL EVIDENCE CHECK
   * ========================================================
   */

  const hasKeywordEvidence =
    keyword.matchedPositive.length >
      0 ||
    keyword.matchedNegative.length >
      0;

  const hasExpectationEvidence =
    isFiniteNumber(
      actualRate,
    ) &&
    isFiniteNumber(
      expectedRate,
    );

  if (
    !hasKeywordEvidence &&
    !hasExpectationEvidence
  ) {
    return {
      stance:
        EVENT_STANCE.UNKNOWN,

      rawImpact: null,

      surprise:
        rateSurprise,

      confidence: 0,

      reasons: [
        "Central-bank event does not contain enough directional evidence.",
      ],
    };
  }

  /**
   * ========================================================
   * MACRO CONTEXT
   * ========================================================
   */

  const recessionRisk =
    macro
      ?.recessionRisk
      ?.score ??
    macro
      ?.recessionRiskScore ??
    null;

  const gdpGrowth =
    macro
      ?.gdp
      ?.growth ??
    null;

  const employmentGrowth =
    macro
      ?.employment
      ?.growth ??
    null;

  if (
    impact > 0 &&
    (
      (
        isFiniteNumber(
          recessionRisk,
        ) &&
        Number(
          recessionRisk,
        ) >= 60
      ) ||
      (
        isFiniteNumber(
          gdpGrowth,
        ) &&
        Number(
          gdpGrowth,
        ) < 0
      ) ||
      (
        isFiniteNumber(
          employmentGrowth,
        ) &&
        Number(
          employmentGrowth,
        ) < -0.2
      )
    )
  ) {
    impact *= 0.6;

    reasons.push(
      "Dovish policy support is discounted because macro deterioration is elevated.",
    );
  }

  impact =
    clamp(
      impact,
      -1,
      1,
    );

  let stance =
    EVENT_STANCE.NEUTRAL;

  if (impact >= 0.65) {
    stance =
      EVENT_STANCE
        .VERY_DOVISH;
  } else if (
    impact >= 0.2
  ) {
    stance =
      EVENT_STANCE.DOVISH;
  } else if (
    impact <= -0.65
  ) {
    stance =
      EVENT_STANCE
        .VERY_HAWKISH;
  } else if (
    impact <= -0.2
  ) {
    stance =
      EVENT_STANCE.HAWKISH;
  }

  return {
    stance,

    rawImpact:
      round(
        impact,
      ),

    surprise:
      rateSurprise,

    confidence:
      round(
        confidence,
      ),

    reasons,
  };
}

/**
 * ============================================================
 * ECONOMIC RELEASE INTERPRETATION
 * ============================================================
 */

function interpretEconomicRelease({
  event,
  expectations = null,
}) {
  const actual =
    expectations
      ?.actual;

  const expected =
    expectations
      ?.expected;

  const previous =
    expectations
      ?.previous;

  if (
    !isFiniteNumber(
      actual,
    ) ||
    !isFiniteNumber(
      expected,
    )
  ) {
    return {
      stance:
        EVENT_STANCE.UNKNOWN,

      rawImpact: null,

      surprise: null,

      confidence: 0,

      reasons: [
        "Economic release cannot be directionally interpreted without actual-versus-expected data.",
      ],
    };
  }

  const surprise =
    calculateSurprise({
      actual,

      expected,

      previous,
    });

  const releaseType =
    normalizeUpper(
      event
        ?.metadata
        ?.releaseType ??
      event
        ?.metadata
        ?.indicator,
    );

  let impact = 0;

  const reasons = [];

  /**
   * GDP / retail / output / employment:
   * higher than expected is generally growth-positive.
   */

  if (
    includesAny(
      releaseType,
      [
        "GDP",
        "RETAIL",
        "PAYROLL",
        "EMPLOYMENT",
        "INDUSTRIAL",
        "PCE_SPENDING",
      ],
    )
  ) {
    impact =
      clamp(
        (
          Number(actual) -
          Number(expected)
        ) /
          Math.max(
            Math.abs(
              Number(expected),
            ),
            1,
          ),
        -1,
        1,
      );

    reasons.push(
      "Growth-sensitive release compared with consensus expectations.",
    );
  }

  /**
   * Unemployment:
   * higher than expected is generally negative.
   */

  if (
    releaseType.includes(
      "UNEMPLOYMENT",
    )
  ) {
    impact =
      -clamp(
        (
          Number(actual) -
          Number(expected)
        ) /
          Math.max(
            Math.abs(
              Number(expected),
            ),
            1,
          ),
        -1,
        1,
      );

    reasons.push(
      "Unemployment release interpreted relative to consensus.",
    );
  }

  /**
   * Inflation:
   *
   * For equities, hotter-than-expected inflation is
   * generally restrictive because it can raise rate risk.
   */

  if (
    includesAny(
      releaseType,
      [
        "CPI",
        "INFLATION",
        "PCE_INFLATION",
        "CORE_CPI",
        "CORE_PCE",
      ],
    )
  ) {
    impact =
      -clamp(
        (
          Number(actual) -
          Number(expected)
        ) /
          Math.max(
            Math.abs(
              Number(expected),
            ),
            1,
          ),
        -1,
        1,
      );

    reasons.push(
      "Inflation surprise interpreted through expected monetary-policy impact.",
    );
  }

  if (
    impact === 0 &&
    reasons.length === 0
  ) {
    return {
      stance:
        EVENT_STANCE.UNKNOWN,

      rawImpact: null,

      surprise,

      confidence: 0.4,

      reasons: [
        "Release type is not yet mapped to a directional interpretation.",
      ],
    };
  }

  return {
    stance:
      impact > 0.2
        ? EVENT_STANCE.POSITIVE
        : impact < -0.2
          ? EVENT_STANCE.NEGATIVE
          : EVENT_STANCE.NEUTRAL,

    rawImpact:
      round(
        impact,
      ),

    surprise,

    confidence:
      0.85,

    reasons,
  };
}

/**
 * ============================================================
 * CORPORATE EVENT INTERPRETATION
 * ============================================================
 */

function interpretCorporateEvent({
  event,
}) {
  const text =
    normalizeText(
      combineText(
        event,
      ),
    );

  const positive =
    [
      "raises guidance",
      "raised guidance",
      "beats expectations",
      "beat expectations",
      "record revenue",
      "record profit",
      "share buyback",
      "repurchase program",
      "dividend increase",
      "strategic acquisition",
      "regulatory approval",
      "wins contract",
      "new contract",
      "strong demand",
    ];

  const negative =
    [
      "cuts guidance",
      "lowered guidance",
      "misses expectations",
      "missed expectations",
      "profit warning",
      "revenue warning",
      "recall",
      "investigation",
      "lawsuit",
      "data breach",
      "cyberattack",
      "ceo resigns",
      "bankruptcy",
      "default",
      "layoffs",
      "production halted",
    ];

  const keyword =
    scoreKeywords({
      text,
      positive,
      negative,
    });

  if (
    keyword.confidence ===
    0
  ) {
    return {
      stance:
        EVENT_STANCE.UNKNOWN,

      rawImpact: null,

      surprise: null,

      confidence: 0,

      reasons: [
        "Corporate event has not yet been quantitatively interpreted.",
      ],
    };
  }

  return {
    stance:
      keyword.score >= 0.2
        ? EVENT_STANCE.POSITIVE
        : keyword.score <= -0.2
          ? EVENT_STANCE.NEGATIVE
          : EVENT_STANCE.NEUTRAL,

    rawImpact:
      round(
        keyword.score *
          0.6,
      ),

    surprise: null,

    confidence:
      round(
        keyword.confidence *
          0.65,
      ),

    reasons: [
      ...keyword
        .matchedPositive
        .map(
          (item) =>
            `Positive corporate phrase: ${item}.`,
        ),

      ...keyword
        .matchedNegative
        .map(
          (item) =>
            `Negative corporate phrase: ${item}.`,
        ),
    ],
  };
}

/**
 * ============================================================
 * SHOCK / GEOPOLITICAL EVENT INTERPRETATION
 * ============================================================
 */

function interpretShockEvent({
  event,
}) {
  const type =
    normalizeUpper(
      event?.type,
    );

  const bearishTypes =
    new Set([
      EVENT_TYPE.WAR,
      EVENT_TYPE
        .TERROR_SECURITY,
      EVENT_TYPE
        .BANKING_CRISIS,
      EVENT_TYPE
        .FLASH_CRASH,
      EVENT_TYPE
        .EXCHANGE_OUTAGE,
      EVENT_TYPE
        .CYBERATTACK,
      EVENT_TYPE
        .PANDEMIC,
      EVENT_TYPE
        .NATURAL_DISASTER,
      EVENT_TYPE
        .SUPPLY_CHAIN,
    ]);

  if (
    !bearishTypes.has(
      type,
    )
  ) {
    return null;
  }

  const severity =
    normalizeUpper(
      event?.severity,
    );

  let magnitude =
    0.35;

  if (
    severity === "HIGH"
  ) {
    magnitude = 0.7;
  }

  if (
    severity === "EXTREME"
  ) {
    magnitude = 1;
  }

  /**
   * Shock events default negative for broad equity risk,
   * but downstream symbol relevance can reduce impact.
   */

  return {
    stance:
      magnitude >= 0.7
        ? EVENT_STANCE.NEGATIVE
        : EVENT_STANCE.MIXED,

    rawImpact:
      -magnitude,

    surprise:
      event?.surprise ??
      null,

    confidence:
      0.75,

    reasons: [
      `${type} is treated as a broad risk-off shock until symbol-specific effects are known.`,
    ],
  };
}

/**
 * ============================================================
 * POLITICAL / POLICY EVENT
 * ============================================================
 */

function interpretPolicyEvent({
  event,
}) {
  const text =
    normalizeText(
      combineText(
        event,
      ),
    );

  /**
   * ==========================================================
   * POLICY DIRECTION
   * ==========================================================
   *
   * Important:
   *
   * A policy topic is NOT directional by itself.
   *
   * Example:
   *   "export controls"          -> ambiguous
   *   "easing export controls"   -> supportive
   *   "tightening export controls" -> restrictive
   *
   * Therefore we prioritize explicit policy ACTION phrases
   * before considering generic policy language.
   */

  const supportiveActions = [
    "easing export controls",
    "ease export controls",
    "eased export controls",
    "relaxing export controls",
    "relax export controls",
    "relaxed export controls",
    "removing export controls",
    "remove export controls",
    "removed export controls",
    "reducing export controls",
    "reduce export controls",
    "reduced export controls",
    "lifting export controls",
    "lift export controls",
    "lifted export controls",

    "removing restrictions",
    "remove restrictions",
    "removed restrictions",
    "reducing restrictions",
    "reduce restrictions",
    "reduced restrictions",
    "easing restrictions",
    "ease restrictions",
    "eased restrictions",
    "relaxing restrictions",
    "relax restrictions",
    "relaxed restrictions",

    "deregulation",
    "deregulatory",
    "regulatory relief",
    "regulatory flexibility",
    "reduces regulatory burden",
    "reduce regulatory burden",
    "removes regulatory burden",

    "tariff reduction",
    "tariff reductions",
    "reduce tariffs",
    "reduces tariffs",
    "reduced tariffs",
    "lower tariffs",
    "lowers tariffs",
    "lowered tariffs",
    "tariffs removed",
    "remove tariffs",
    "removed tariffs",

    "sanctions lifted",
    "lift sanctions",
    "lifting sanctions",
    "remove sanctions",
    "removing sanctions",
    "sanctions eased",

    "trade agreement",
    "trade deal",
    "expands market access",
    "increase market access",
    "increases market access",

    "tax cut",
    "tax cuts",
    "stimulus",
    "infrastructure investment",
    "government funding approved",

    "increases the threshold",
    "increase the threshold",
    "raises the threshold",
    "raise the threshold",
    "removes national security controls",
    "remove national security controls",
  ];

  const restrictiveActions = [
    "tightening export controls",
    "tighten export controls",
    "tightened export controls",
    "imposing export controls",
    "impose export controls",
    "imposed export controls",
    "expanding export controls",
    "expand export controls",
    "expanded export controls",
    "new export controls",

    "imposing restrictions",
    "impose restrictions",
    "imposed restrictions",
    "tightening restrictions",
    "tighten restrictions",
    "tightened restrictions",
    "new restrictions",
    "additional restrictions",

    "tariff increase",
    "tariff increases",
    "increase tariffs",
    "increases tariffs",
    "increased tariffs",
    "higher tariffs",
    "new tariffs",
    "impose tariffs",
    "imposes tariffs",
    "imposed tariffs",

    "sanctions imposed",
    "impose sanctions",
    "imposes sanctions",
    "new sanctions",
    "additional sanctions",
    "expand sanctions",
    "expands sanctions",

    "trade restrictions",
    "restrict trade",
    "restricts trade",
    "restricted trade",
    "trade ban",
    "import ban",
    "export ban",

    "regulatory crackdown",
    "new regulation",
    "new regulations",
    "additional regulation",
    "additional regulations",
    "regulatory restrictions",

    "antitrust action",
    "government shutdown",
  ];

  const supportive =
    scoreKeywords({
      text,
      positive:
        supportiveActions,
      negative: [],
    });

  const restrictive =
    scoreKeywords({
      text,
      positive: [],
      negative:
        restrictiveActions,
    });

  const supportiveCount =
    supportive
      .matchedPositive
      .length;

  const restrictiveCount =
    restrictive
      .matchedNegative
      .length;

  const totalDirectionalMatches =
    supportiveCount +
    restrictiveCount;

  /**
   * No explicit directional policy action was found.
   *
   * Fail safely instead of treating generic words such as
   * "export controls", "tariff", "sanctions", "regulation",
   * or "emergency" as automatically bullish/bearish.
   */
  if (
    totalDirectionalMatches ===
    0
  ) {
    return {
      stance:
        EVENT_STANCE.UNKNOWN,

      rawImpact: null,

      surprise:
        event?.surprise ??
        null,

      confidence: 0,

      reasons: [
        "Policy topic was detected, but the text does not provide enough explicit tightening-or-easing evidence to determine market direction.",
      ],
    };
  }

  /**
   * ==========================================================
   * CONFLICT HANDLING
   * ==========================================================
   *
   * A document can contain both easing and tightening language.
   * We therefore calculate net directional evidence rather than
   * allowing one generic keyword to dominate.
   */

  const netEvidence =
    supportiveCount -
    restrictiveCount;

  const evidenceStrength =
    clamp(
      totalDirectionalMatches /
        4,
      0,
      1,
    );

  const normalizedDirection =
    clamp(
      netEvidence /
        Math.max(
          totalDirectionalMatches,
          1,
        ),
      -1,
      1,
    );

  let impact =
    normalizedDirection *
    (
      0.35 +
      (
        0.3 *
        evidenceStrength
      )
    );

  let confidence =
    clamp(
      0.45 +
        (
          0.35 *
          evidenceStrength
        ),
      0,
      0.85,
    );

  const reasons = [];

  if (
    supportiveCount > 0
  ) {
    reasons.push(
      `Supportive/easing policy action detected: ${supportive.matchedPositive.join(
        ", ",
      )}.`,
    );
  }

  if (
    restrictiveCount > 0
  ) {
    reasons.push(
      `Restrictive/tightening policy action detected: ${restrictive.matchedNegative.join(
        ", ",
      )}.`,
    );
  }

  /**
   * If positive and negative evidence are exactly balanced,
   * preserve that ambiguity instead of fabricating direction.
   */
  if (
    netEvidence === 0
  ) {
    return {
      stance:
        EVENT_STANCE.MIXED,

      rawImpact: 0,

      surprise:
        event?.surprise ??
        null,

      confidence:
        round(
          Math.min(
            confidence,
            0.55,
          ),
        ),

      reasons: [
        ...reasons,
        "Supportive and restrictive policy evidence is balanced, so the event is treated as mixed.",
      ],
    };
  }

  /**
   * ==========================================================
   * DIRECT COMPANY / SECTOR TARGETING
   * ==========================================================
   *
   * Direction can be estimated here, but relevance is handled
   * later by calculateSymbolRelevance(). This prevents broad
   * policy from receiving the same final weight as policy that
   * directly targets the traded symbol or sector.
   */

  const directSymbols =
    Array.isArray(
      event?.symbols,
    )
      ? event.symbols.filter(
          Boolean,
        )
      : [];

  const directSectors =
    Array.isArray(
      event?.sectors,
    )
      ? event.sectors.filter(
          Boolean,
        )
      : [];

  if (
    directSymbols.length > 0 ||
    directSectors.length > 0
  ) {
    confidence =
      clamp(
        confidence + 0.1,
        0,
        0.9,
      );

    reasons.push(
      "Policy event contains explicit symbol or sector targeting.",
    );
  }

  impact =
    clamp(
      impact,
      -0.75,
      0.75,
    );

  let stance =
    EVENT_STANCE.MIXED;

  if (
    impact >= 0.2
  ) {
    stance =
      EVENT_STANCE.POSITIVE;
  } else if (
    impact <= -0.2
  ) {
    stance =
      EVENT_STANCE.NEGATIVE;
  }

  return {
    stance,

    rawImpact:
      round(
        impact,
      ),

    surprise:
      event?.surprise ??
      null,

    confidence:
      round(
        confidence,
      ),

    reasons,
  };
}

/**
 * ============================================================
 * INTERPRET ONE EVENT
 * ============================================================
 */

export function interpretMarketEvent({
  event,

  symbol = null,

  country = "US",

  sector = null,

  macro = null,

  expectations = null,
} = {}) {
  try {
    if (!event) {
      return {
        approved: false,

        status:
          "INVALID_EVENT",

        event: null,

        errors: [
          "Event is required.",
        ],

        warnings: [],
      };
    }

    const type =
      normalizeUpper(
        event.type,
      );

    let interpretation =
      null;

    /**
     * ========================================================
     * CENTRAL BANK
     * ========================================================
     */

    if (
      type ===
      EVENT_TYPE.CENTRAL_BANK
    ) {
      interpretation =
        interpretCentralBank({
          event,
          macro,
          expectations,
        });
    }

    /**
     * ========================================================
     * ECONOMIC RELEASE
     * ========================================================
     */

    if (
      type ===
      EVENT_TYPE
        .ECONOMIC_RELEASE
    ) {
      interpretation =
        interpretEconomicRelease({
          event,
          expectations,
        });
    }

    /**
     * ========================================================
     * CORPORATE / EARNINGS
     * ========================================================
     */

    if (
      type ===
        EVENT_TYPE.CORPORATE ||
      type ===
        EVENT_TYPE.EARNINGS
    ) {
      interpretation =
        interpretCorporateEvent({
          event,
        });
    }

    /**
     * ========================================================
     * POLICY / POLITICS
     * ========================================================
     */

    if (
      [
        EVENT_TYPE
          .GOVERNMENT_POLICY,

        EVENT_TYPE
          .TRADE_POLICY,

        EVENT_TYPE.TARIFF,

        EVENT_TYPE.SANCTIONS,

        EVENT_TYPE.REGULATION,

        EVENT_TYPE.ELECTION,

        EVENT_TYPE
          .GEOPOLITICAL,
      ].includes(
        type,
      )
    ) {
      interpretation =
        interpretPolicyEvent({
          event,
        });
    }

    /**
     * ========================================================
     * SHOCK EVENTS
     * ========================================================
     */

    const shock =
      interpretShockEvent({
        event,
      });

    if (shock) {
      interpretation =
        shock;
    }

    /**
     * ========================================================
     * UNKNOWN
     * ========================================================
     */

    if (!interpretation) {
      interpretation = {
        stance:
          EVENT_STANCE.UNKNOWN,

        rawImpact: null,

        surprise: null,

        confidence: 0,

        reasons: [
          "No interpretation model is available for this event type.",
        ],
      };
    }

    const relevance =
      calculateSymbolRelevance({
        event,

        symbol,

        country,

        sector,
      });

    /**
     * Symbol relevance reduces broad event impact.
     *
     * Example:
     *
     * A local disaster unrelated to Apple should not have
     * the same weight as a direct Apple event.
     */

    const adjustedImpact =
      isFiniteNumber(
        interpretation
          .rawImpact,
      )
        ? clamp(
            Number(
              interpretation
                .rawImpact,
            ) *
              relevance,
            -1,
            1,
          )
        : null;

    const interpretedEvent = {
      ...event,

      rawImpact:
        adjustedImpact,

      surprise:
        interpretation
          .surprise ??
        event.surprise ??
        null,

      interpretation: {
        stance:
          interpretation
            .stance,

        confidence:
          round(
            interpretation
              .confidence,
          ),

        relevance:
          round(
            relevance,
          ),

        unadjustedImpact:
          interpretation
            .rawImpact,

        adjustedImpact:
          round(
            adjustedImpact,
          ),

        reasons:
          interpretation
            .reasons ??
          [],
      },
    };

    return {
      approved: true,

      status:
        adjustedImpact ===
        null
          ? "UNRESOLVED"
          : "INTERPRETED",

      event:
        interpretedEvent,

      warnings:
        adjustedImpact ===
        null
          ? [
              "Event remains directionally unresolved and should not contribute directional trading evidence.",
            ]
          : [],

      errors: [],
    };
  } catch (error) {
    return {
      approved: false,

      status:
        "ERROR",

      event: {
        ...event,

        rawImpact: null,

        surprise:
          event
            ?.surprise ??
          null,
      },

      warnings: [
        "Event interpretation failed safely. No directional event evidence should be awarded.",
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
 * INTERPRET MULTIPLE EVENTS
 * ============================================================
 */

export function interpretMarketEvents({
  events = [],

  symbol = null,

  country = "US",

  sector = null,

  macro = null,

  expectationsByEvent = {},
} = {}) {
  if (
    !Array.isArray(
      events,
    )
  ) {
    return {
      approved: false,

      status:
        "ERROR",

      events: [],

      interpretedCount: 0,

      unresolvedCount: 0,

      warnings: [],

      errors: [
        "Events must be an array.",
      ],
    };
  }

  const interpreted = [];

  let resolvedCount = 0;
  let unresolvedCount = 0;

  for (
    const event
    of events
  ) {
    const eventKey =
      event?.eventKey ??
      event?.externalId ??
      event?.id ??
      null;

    const expectations =
      eventKey
        ? expectationsByEvent[
            eventKey
          ] ??
          null
        : null;

    const result =
      interpretMarketEvent({
        event,

        symbol,

        country,

        sector,

        macro,

        expectations,
      });

    if (
      result.approved !==
      true
    ) {
      continue;
    }

    interpreted.push(
      result.event,
    );

    if (
      result.status ===
      "INTERPRETED"
    ) {
      resolvedCount += 1;
    } else {
      unresolvedCount += 1;
    }
  }

  return {
    approved: true,

    status:
      interpreted.length ===
      0
        ? "NO_EVENTS"
        : "COMPLETE",

    events:
      interpreted,

    eventCount:
      interpreted.length,

    interpretedCount:
      resolvedCount,

    unresolvedCount,

    warnings:
      unresolvedCount > 0
        ? [
            `${unresolvedCount} event(s) remain directionally unresolved.`,
          ]
        : [],

    errors: [],

    timestamp:
      new Date()
        .toISOString(),
  };
}

export default interpretMarketEvents;