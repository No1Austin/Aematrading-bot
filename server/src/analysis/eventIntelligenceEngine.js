/**
 * ============================================================
 * EVENT INTELLIGENCE ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Convert raw events into structured market intelligence.
 *
 * Handles:
 *
 * - Government policy
 * - Presidential / executive actions
 * - Tariffs
 * - Regulation
 * - Central-bank decisions
 * - Elections
 * - Wars / geopolitical shocks
 * - Natural disasters
 * - Cyberattacks
 * - Infrastructure failures
 * - Supply-chain disruptions
 * - Corporate events
 * - Economic releases
 *
 * IMPORTANT
 * ---------
 *
 * This engine does NOT blindly map:
 *
 * "negative news" -> SHORT
 * "positive news" -> LONG
 *
 * It evaluates:
 *
 * - credibility
 * - authority
 * - surprise
 * - severity
 * - scope
 * - duration
 * - affected countries
 * - affected sectors
 * - affected companies
 * - whether impact is bullish / bearish / mixed
 *
 * Maximum contribution:
 *
 * 10 points
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const EVENT_DIRECTION =
  Object.freeze({
    STRONG_BULLISH:
      "STRONG_BULLISH",

    BULLISH:
      "BULLISH",

    NEUTRAL:
      "NEUTRAL",

    BEARISH:
      "BEARISH",

    STRONG_BEARISH:
      "STRONG_BEARISH",

    MIXED:
      "MIXED",

    UNKNOWN:
      "UNKNOWN",
  });

export const EVENT_SEVERITY =
  Object.freeze({
    LOW: "LOW",

    MODERATE:
      "MODERATE",

    HIGH:
      "HIGH",

    EXTREME:
      "EXTREME",

    UNKNOWN:
      "UNKNOWN",
  });

export const EVENT_STATUS =
  Object.freeze({
    RUMOR: "RUMOR",

    UNCONFIRMED:
      "UNCONFIRMED",

    REPORTED:
      "REPORTED",

    CONFIRMED:
      "CONFIRMED",

    ANNOUNCED:
      "ANNOUNCED",

    SIGNED:
      "SIGNED",

    IMPLEMENTED:
      "IMPLEMENTED",

    RESOLVED:
      "RESOLVED",

    UNKNOWN:
      "UNKNOWN",
  });

export const EVENT_TYPE =
  Object.freeze({
    TRADE_POLICY:
      "TRADE_POLICY",

    TARIFF:
      "TARIFF",

    SANCTIONS:
      "SANCTIONS",

    REGULATION:
      "REGULATION",

    CENTRAL_BANK:
      "CENTRAL_BANK",

    ECONOMIC_RELEASE:
      "ECONOMIC_RELEASE",

    GOVERNMENT_POLICY:
      "GOVERNMENT_POLICY",

    ELECTION:
      "ELECTION",

    GEOPOLITICAL:
      "GEOPOLITICAL",

    WAR:
      "WAR",

    TERROR_SECURITY:
      "TERROR_SECURITY",

    NATURAL_DISASTER:
      "NATURAL_DISASTER",

    PANDEMIC:
      "PANDEMIC",

    CYBERATTACK:
      "CYBERATTACK",

    INFRASTRUCTURE:
      "INFRASTRUCTURE",

    SUPPLY_CHAIN:
      "SUPPLY_CHAIN",

    CORPORATE:
      "CORPORATE",

    EARNINGS:
      "EARNINGS",

    BANKING_CRISIS:
      "BANKING_CRISIS",

    EXCHANGE_OUTAGE:
      "EXCHANGE_OUTAGE",

    FLASH_CRASH:
      "FLASH_CRASH",

    OTHER:
      "OTHER",
  });

export const AUTHORITY_LEVEL =
  Object.freeze({
    LOW: "LOW",

    MEDIUM:
      "MEDIUM",

    HIGH:
      "HIGH",

    OFFICIAL:
      "OFFICIAL",

    UNKNOWN:
      "UNKNOWN",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
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
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) * factor,
    ) / factor
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value)
    .trim()
    .toUpperCase();
}

/**
 * ============================================================
 * SOURCE CREDIBILITY
 * ============================================================
 */

function scoreCredibility({
  sourceTier,
  credibility,
}) {
  if (
    isFiniteNumber(
      credibility,
    )
  ) {
    return clamp(
      credibility,
      0,
      1,
    );
  }

  const tier =
    Number(
      sourceTier,
    );

  if (tier === 1) {
    return 0.95;
  }

  if (tier === 2) {
    return 0.80;
  }

  if (tier === 3) {
    return 0.60;
  }

  if (tier === 4) {
    return 0.35;
  }

  return 0.20;
}

/**
 * ============================================================
 * EVENT STATUS CONFIDENCE
 * ============================================================
 */

function scoreEventStatus(
  status,
) {
  switch (
    normalizeText(status)
  ) {
    case EVENT_STATUS
      .IMPLEMENTED:
      return 1;

    case EVENT_STATUS
      .SIGNED:
      return 0.98;

    case EVENT_STATUS
      .ANNOUNCED:
      return 0.90;

    case EVENT_STATUS
      .CONFIRMED:
      return 0.90;

    case EVENT_STATUS
      .REPORTED:
      return 0.70;

    case EVENT_STATUS
      .UNCONFIRMED:
      return 0.35;

    case EVENT_STATUS
      .RUMOR:
      return 0.15;

    case EVENT_STATUS
      .RESOLVED:
      return 0.75;

    default:
      return 0.30;
  }
}

/**
 * ============================================================
 * AUTHORITY SCORE
 * ============================================================
 *
 * Examples:
 *
 * Official central bank:
 * high authority
 *
 * Government executive:
 * high authority
 *
 * Random commentator:
 * low authority
 */

function scoreAuthority(
  authority,
) {
  switch (
    normalizeText(authority)
  ) {
    case AUTHORITY_LEVEL
      .OFFICIAL:
      return 1;

    case AUTHORITY_LEVEL
      .HIGH:
      return 0.85;

    case AUTHORITY_LEVEL
      .MEDIUM:
      return 0.55;

    case AUTHORITY_LEVEL
      .LOW:
      return 0.25;

    default:
      return 0.30;
  }
}

/**
 * ============================================================
 * SURPRISE SCORE
 * ============================================================
 */

function normalizeSurprise(
  surprise,
) {
  if (
    !isFiniteNumber(
      surprise,
    )
  ) {
    return 0.5;
  }

  return clamp(
    surprise,
    0,
    1,
  );
}

/**
 * ============================================================
 * SEVERITY SCORE
 * ============================================================
 */

function severityScore(
  severity,
) {
  switch (
    normalizeText(
      severity,
    )
  ) {
    case EVENT_SEVERITY
      .EXTREME:
      return 1;

    case EVENT_SEVERITY
      .HIGH:
      return 0.8;

    case EVENT_SEVERITY
      .MODERATE:
      return 0.5;

    case EVENT_SEVERITY
      .LOW:
      return 0.25;

    default:
      return 0.35;
  }
}

/**
 * ============================================================
 * NEWS / EVENT DECAY
 * ============================================================
 */

function calculateFreshnessWeight({
  eventTimestamp,
  currentTimestamp =
    Date.now(),
}) {
  const eventTime =
    new Date(
      eventTimestamp,
    ).getTime();

  if (
    !Number.isFinite(
      eventTime,
    )
  ) {
    return 0.5;
  }

  const ageMs =
    currentTimestamp -
    eventTime;

  if (ageMs < 0) {
    return 1;
  }

  const minutes =
    ageMs /
    (1000 * 60);

  if (minutes <= 15) {
    return 1;
  }

  if (minutes <= 60) {
    return 0.9;
  }

  if (minutes <= 240) {
    return 0.8;
  }

  if (minutes <= 1440) {
    return 0.55;
  }

  if (minutes <= 4320) {
    return 0.30;
  }

  return 0.15;
}

/**
 * ============================================================
 * IMPACT DIRECTION
 * ============================================================
 *
 * rawImpact:
 *
 * -1 = strongly bearish
 *  0 = neutral
 * +1 = strongly bullish
 */

function classifyDirection(
  rawImpact,
) {
  const value =
    clamp(
      rawImpact,
      -1,
      1,
    );

  if (value >= 0.70) {
    return EVENT_DIRECTION
      .STRONG_BULLISH;
  }

  if (value >= 0.20) {
    return EVENT_DIRECTION
      .BULLISH;
  }

  if (value <= -0.70) {
    return EVENT_DIRECTION
      .STRONG_BEARISH;
  }

  if (value <= -0.20) {
    return EVENT_DIRECTION
      .BEARISH;
  }

  return EVENT_DIRECTION
    .NEUTRAL;
}

/**
 * ============================================================
 * EVENT TYPE BASE IMPACT
 * ============================================================
 *
 * IMPORTANT:
 *
 * These are not trade decisions.
 *
 * They represent how disruptive a category can be.
 *
 * Direction still comes from supplied impact context.
 */

function getEventTypeMultiplier(
  type,
) {
  switch (
    normalizeText(type)
  ) {
    case EVENT_TYPE.WAR:
      return 1;

    case EVENT_TYPE
      .BANKING_CRISIS:
      return 1;

    case EVENT_TYPE
      .FLASH_CRASH:
      return 1;

    case EVENT_TYPE
      .CYBERATTACK:
      return 0.9;

    case EVENT_TYPE
      .NATURAL_DISASTER:
      return 0.85;

    case EVENT_TYPE
      .PANDEMIC:
      return 1;

    case EVENT_TYPE
      .CENTRAL_BANK:
      return 0.9;

    case EVENT_TYPE.TARIFF:
      return 0.8;

    case EVENT_TYPE
      .TRADE_POLICY:
      return 0.75;

    case EVENT_TYPE
      .SANCTIONS:
      return 0.85;

    case EVENT_TYPE
      .REGULATION:
      return 0.7;

    case EVENT_TYPE
      .ECONOMIC_RELEASE:
      return 0.75;

    case EVENT_TYPE
      .SUPPLY_CHAIN:
      return 0.75;

    case EVENT_TYPE
      .CORPORATE:
      return 0.7;

    case EVENT_TYPE
      .EARNINGS:
      return 0.8;

    default:
      return 0.5;
  }
}

/**
 * ============================================================
 * EVENT IMPACT CONFIDENCE
 * ============================================================
 */

function calculateImpactConfidence({
  credibilityScore,
  statusScore,
  authorityScore,
  surpriseScore,
  severity,
  freshness,
}) {
  const weighted =
    (
      credibilityScore *
      0.25
    ) +
    (
      statusScore *
      0.20
    ) +
    (
      authorityScore *
      0.20
    ) +
    (
      surpriseScore *
      0.15
    ) +
    (
      severity *
      0.10
    ) +
    (
      freshness *
      0.10
    );

  return clamp(
    weighted,
    0,
    1,
  );
}

/**
 * ============================================================
 * ONE EVENT
 * ============================================================
 *
 * Event input example:
 *
 * {
 *   id,
 *   type,
 *   timestamp,
 *   sourceTier,
 *   credibility,
 *   authority,
 *   status,
 *   severity,
 *   surprise,
 *   rawImpact,
 *   countries,
 *   sectors,
 *   symbols
 * }
 */

export function analyzeSingleEvent({
  event,
  currentTimestamp =
    Date.now(),
}) {
  if (!event) {
    return {
      approved: false,
      errors: [
        "Event is required.",
      ],
    };
  }

  const credibility =
    scoreCredibility({
      sourceTier:
        event.sourceTier,

      credibility:
        event.credibility,
    });

  const statusScore =
    scoreEventStatus(
      event.status,
    );

  const authority =
    scoreAuthority(
      event.authority,
    );

  const surprise =
    normalizeSurprise(
      event.surprise,
    );

  const severity =
    severityScore(
      event.severity,
    );

  const freshness =
    calculateFreshnessWeight({
      eventTimestamp:
        event.timestamp,

      currentTimestamp,
    });

  const typeMultiplier =
    getEventTypeMultiplier(
      event.type,
    );

  /**
   * rawImpact must be derived later
   * from event interpretation.
   *
   * For now caller can supply:
   *
   * -1 to +1.
   */

  const hasDirectionalImpact =
  isFiniteNumber(
    event.rawImpact,
  );

const baseImpact =
  hasDirectionalImpact
    ? clamp(
        event.rawImpact,
        -1,
        1,
      )
    : null;

  const confidence =
    calculateImpactConfidence({
      credibilityScore:
        credibility,

      statusScore,

      authorityScore:
        authority,

      surpriseScore:
        surprise,

      severity,

      freshness,
    });

  const adjustedImpact =
  hasDirectionalImpact
    ? clamp(
        baseImpact *
          typeMultiplier *
          confidence,
        -1,
        1,
      )
    : null;

  return {
    approved: true,

    id:
      event.id ??
      null,

    type:
      normalizeText(
        event.type,
      ) ||
      EVENT_TYPE.OTHER,

    status:
      normalizeText(
        event.status,
      ) ||
      EVENT_STATUS.UNKNOWN,

    direction:
  hasDirectionalImpact
    ? classifyDirection(
        adjustedImpact,
      )
    : EVENT_DIRECTION
        .UNKNOWN,

    rawImpact:
      baseImpact,

    adjustedImpact:
      round(
        adjustedImpact,
        4,
      ),

    confidence:
  hasDirectionalImpact
    ? round(
        confidence,
      )
    : 0,

    attributes: {
      credibility:
        round(
          credibility,
          4,
        ),

      eventStatus:
        round(
          statusScore,
          4,
        ),

      authority:
        round(
          authority,
          4,
        ),

      surprise:
        round(
          surprise,
          4,
        ),

      severity:
        round(
          severity,
          4,
        ),

      freshness:
        round(
          freshness,
          4,
        ),

      typeMultiplier:
        round(
          typeMultiplier,
          4,
        ),
    },

    countries:
      Array.isArray(
        event.countries,
      )
        ? event.countries
        : [],

    sectors:
      Array.isArray(
        event.sectors,
      )
        ? event.sectors
        : [],

    symbols:
      Array.isArray(
        event.symbols,
      )
        ? event.symbols
        : [],

    headline:
      event.headline ??
      null,

    summary:
      event.summary ??
      null,

    timestamp:
      event.timestamp ??
      null,

    warnings: [],

    errors: [],
  };
}

/**
 * ============================================================
 * AGGREGATE MULTIPLE EVENTS
 * ============================================================
 */

function combineEvents(
  analyzedEvents,
) {
  if (
    !Array.isArray(
      analyzedEvents,
    ) ||
    analyzedEvents.length === 0
  ) {
    return {
      rawScore: 0,
      confidence: 0,
      direction:
        EVENT_DIRECTION.UNKNOWN,
    };
  }

  let scoreTotal = 0;
  let confidenceTotal = 0;

  for (
    const event
    of analyzedEvents
  ) {
    if (
      event.approved !== true
    ) {
      continue;
    }

    const confidence =
      Number(
        event.confidence ??
        0,
      );

    scoreTotal +=
      Number(
        event.adjustedImpact ??
        0,
      ) *
      confidence;

    confidenceTotal +=
      confidence;
  }

  if (
    confidenceTotal <= 0
  ) {
    return {
      rawScore: 0,
      confidence: 0,
      direction:
        EVENT_DIRECTION.UNKNOWN,
    };
  }

  const rawScore =
    clamp(
      scoreTotal /
        confidenceTotal,
      -1,
      1,
    );

  return {
    rawScore:
      round(
        rawScore,
        4,
      ),

    confidence:
      round(
        Math.min(
          confidenceTotal /
            Math.max(
              analyzedEvents.filter(
                (event) =>
                  event.approved === true &&
                  isFiniteNumber(
                    event.adjustedImpact,
                  ) &&
                  Number(
                    event.confidence ?? 0,
                  ) > 0,
              ).length,
              1,
            ),
          1,
        ),
        4,
      ),

    direction:
      classifyDirection(
        rawScore,
      ),
  };
}

/**
 * ============================================================
 * EVENT FREEZE DETECTION
 * ============================================================
 *
 * The bot may see a high trade score and still refuse to enter.
 *
 * Extreme shocks can temporarily freeze new entries.
 */

function detectEventFreeze(
  events,
) {
  const freezeReasons = [];

  for (
    const event
    of events
  ) {
    if (
      event.approved !== true
    ) {
      continue;
    }

    const severity =
      event.attributes
        ?.severity ??
      0;

    const confidence =
      event.confidence ??
      0;

    const type =
      event.type;

    const criticalTypes = [
      EVENT_TYPE.WAR,
      EVENT_TYPE
        .BANKING_CRISIS,
      EVENT_TYPE
        .FLASH_CRASH,
      EVENT_TYPE
        .EXCHANGE_OUTAGE,
      EVENT_TYPE
        .CYBERATTACK,
      EVENT_TYPE
        .TERROR_SECURITY,
      EVENT_TYPE
        .PANDEMIC,
    ];

    if (
      criticalTypes.includes(
        type,
      ) &&
      severity >= 0.8 &&
      confidence >= 0.7
    ) {
      freezeReasons.push({
        eventId:
          event.id,

        type,

        reason:
          "Extreme confirmed market event.",
      });
    }
  }

  return {
    active:
      freezeReasons.length > 0,

    reasons:
      freezeReasons,
  };
}

/**
 * ============================================================
 * DIRECTIONAL SUPPORT
 * ============================================================
 */

function calculateDirectionalSupport(
  rawScore,
) {
  const normalized =
    clamp(
      rawScore,
      -1,
      1,
    );

  return {
    long:
      round(
        (
          normalized +
          1
        ) / 2,
        4,
      ),

    short:
      round(
        (
          1 -
          normalized
        ) / 2,
        4,
      ),
  };
}

/**
 * ============================================================
 * MAIN EVENT ENGINE
 * ============================================================
 */

export function analyzeEvents({
  events = [],

  symbol = null,

  country = null,

  sector = null,

  currentTimestamp =
    Date.now(),
} = {}) {
  try {
    if (
      !Array.isArray(
        events,
      )
    ) {
      return {
        approved: false,

        engine:
          "EVENT_INTELLIGENCE",

        status:
          "ERROR",

        direction:
          EVENT_DIRECTION.UNKNOWN,

        confidence: 0,

        rawScore: 0,

        directionalSupport: {
          long: 0,
          short: 0,
        },

        eventFreeze: {
          active: false,
          reasons: [],
        },

        relevantEvents: [],

        warnings: [],

        errors: [
          "Events must be an array.",
        ],

        maximumScore: 10,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * FILTER RELEVANT EVENTS
     * ======================================================
     */

    const relevant =
      events.filter(
        (event) => {
          if (!event) {
            return false;
          }

          if (
            symbol &&
            Array.isArray(
              event.symbols,
            ) &&
            event.symbols.length >
              0 &&
            !event.symbols.includes(
              symbol,
            )
          ) {
            return false;
          }

          if (
            country &&
            Array.isArray(
              event.countries,
            ) &&
            event.countries
              .length > 0 &&
            !event.countries.includes(
              country,
            )
          ) {
            return false;
          }

          if (
            sector &&
            Array.isArray(
              event.sectors,
            ) &&
            event.sectors
              .length > 0 &&
            !event.sectors.includes(
              sector,
            )
          ) {
            return false;
          }

          return true;
        },
      );

    if (
      relevant.length === 0
    ) {
      return {
        approved: true,

        engine:
          "EVENT_INTELLIGENCE",

        status:
          "COMPLETE",

        symbol,

        country,

        sector,

        direction:
          EVENT_DIRECTION.NEUTRAL,

        confidence: 0,

        rawScore: 0,

        directionalSupport: {
          long: 0.5,
          short: 0.5,
        },

        eventFreeze: {
          active: false,
          reasons: [],
        },

        summary:
          "No relevant market-moving events were detected.",

        relevantEvents: [],

        warnings: [],

        errors: [],

        maximumScore: 10,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * ANALYZE EVENTS
     * ======================================================
     */

    const analyzed =
      relevant.map(
        (event) =>
          analyzeSingleEvent({
            event,
            currentTimestamp,
          }),
      );

    const validEvents =
      analyzed.filter(
        (event) =>
          event.approved === true,
      );

    /**
     * ======================================================
     * COMBINE
     * ======================================================
     */

    const combined =
      combineEvents(
        validEvents,
      );

    const directionalSupport =
      calculateDirectionalSupport(
        combined.rawScore,
      );

    /**
     * ======================================================
     * EVENT FREEZE
     * ======================================================
     */

    const eventFreeze =
      detectEventFreeze(
        validEvents,
      );

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    const warnings = [];

    const rumorCount =
      validEvents.filter(
        (event) =>
          event.status ===
          EVENT_STATUS.RUMOR,
      ).length;

    if (rumorCount > 0) {
      warnings.push(
        `${rumorCount} event(s) are based on rumor-level information.`,
      );
    }

    if (
      eventFreeze.active
    ) {
      warnings.push(
        "Extreme event freeze is active. New entries should be blocked until stabilization criteria are satisfied.",
      );
    }

    /**
     * ======================================================
     * SUMMARY
     * ======================================================
     */

    const summary =
      eventFreeze.active
        ? `Event conditions are ${combined.direction
            .replaceAll(
              "_",
              " ",
            )
            .toLowerCase()}, but an extreme-event freeze is active.`
        : `Relevant events currently produce a ${combined.direction
            .replaceAll(
              "_",
              " ",
            )
            .toLowerCase()} market bias.`;

    /**
     * ======================================================
     * FINAL RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "EVENT_INTELLIGENCE",

      status:
        "COMPLETE",

      symbol,

      country,

      sector,

      direction:
        combined.direction,

      confidence:
        combined.confidence,

      rawScore:
        combined.rawScore,

      directionalSupport,

      eventFreeze,

      summary,

      relevantEvents:
        validEvents,

      eventCount:
        validEvents.length,

      warnings,

      errors: [],

      maximumScore: 10,

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    /**
     * ======================================================
     * SAFE FAIL
     * ======================================================
     */

    return {
      approved: false,

      engine:
        "EVENT_INTELLIGENCE",

      status:
        "ERROR",

      symbol,

      country,

      sector,

      direction:
        EVENT_DIRECTION.UNKNOWN,

      confidence: 0,

      rawScore: 0,

      directionalSupport: {
        long: 0,
        short: 0,
      },

      eventFreeze: {
        /**
         * Conservative fail-safe:
         *
         * If the event engine crashes while
         * handling potentially live events,
         * orchestration can choose to block
         * new entries until event intelligence
         * is restored.
         */
        active: true,

        reasons: [
          {
            type:
              "ENGINE_FAILURE",

            reason:
              "Event intelligence unavailable.",
          },
        ],
      },

      summary:
        "Event analysis failed safely. No event directional evidence should be awarded.",

      relevantEvents: [],

      warnings: [
        "Event engine failure should prevent aggressive new entries.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      maximumScore: 10,

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default analyzeEvents;