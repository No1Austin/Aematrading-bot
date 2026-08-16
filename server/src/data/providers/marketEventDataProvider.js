import {
  EVENT_TYPE,
  EVENT_STATUS,
  EVENT_SEVERITY,
  AUTHORITY_LEVEL,
} from "../../analysis/eventIntelligenceEngine.js";

/**
 * ============================================================
 * MARKET EVENT DATA PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Central normalization layer for real-world market events.
 *
 * Future source adapters may include:
 *
 * - SEC
 * - Federal Reserve
 * - BLS
 * - BEA
 * - U.S. Treasury
 * - NOAA / FEMA
 * - financial news providers
 *
 * This provider:
 *
 * - validates events
 * - normalizes event types
 * - normalizes status
 * - normalizes severity
 * - normalizes authority
 * - clamps numerical scores
 * - normalizes symbols / sectors / countries
 * - rejects unusable records
 * - removes duplicates
 *
 * IMPORTANT
 * ---------
 *
 * This layer does NOT invent:
 *
 * - direction
 * - severity
 * - credibility
 * - market impact
 *
 * Missing information remains missing or conservative.
 */

/**
 * ============================================================
 * VALID ENUM VALUES
 * ============================================================
 */

const VALID_EVENT_TYPES =
  new Set(
    Object.values(
      EVENT_TYPE,
    ),
  );

const VALID_EVENT_STATUSES =
  new Set(
    Object.values(
      EVENT_STATUS,
    ),
  );

const VALID_EVENT_SEVERITIES =
  new Set(
    Object.values(
      EVENT_SEVERITY,
    ),
  );

const VALID_AUTHORITY_LEVELS =
  new Set(
    Object.values(
      AUTHORITY_LEVEL,
    ),
  );

/**
 * ============================================================
 * BASIC HELPERS
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

function normalizeString(
  value,
) {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  const normalized =
    value.trim();

  return normalized ||
    null;
}

function normalizeUpperString(
  value,
) {
  const normalized =
    normalizeString(
      value,
    );

  return normalized
    ? normalized.toUpperCase()
    : null;
}

function normalizeStringArray(
  value,
) {
  if (
    !Array.isArray(value)
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          normalizeString,
        )
        .filter(Boolean),
    ),
  ];
}

function normalizeUpperArray(
  value,
) {
  return normalizeStringArray(
    value,
  ).map(
    (item) =>
      item.toUpperCase(),
  );
}

function normalizeTimestamp(
  value,
) {
  if (!value) {
    return null;
  }

  const timestamp =
    new Date(value);

  if (
    Number.isNaN(
      timestamp.getTime(),
    )
  ) {
    return null;
  }

  return timestamp
    .toISOString();
}

/**
 * ============================================================
 * ENUM NORMALIZATION
 * ============================================================
 */

function normalizeEventType(
  value,
) {
  const normalized =
    normalizeUpperString(
      value,
    );

  if (
    normalized &&
    VALID_EVENT_TYPES.has(
      normalized,
    )
  ) {
    return normalized;
  }

  return EVENT_TYPE.OTHER;
}

function normalizeEventStatus(
  value,
) {
  const normalized =
    normalizeUpperString(
      value,
    );

  if (
    normalized &&
    VALID_EVENT_STATUSES.has(
      normalized,
    )
  ) {
    return normalized;
  }

  return EVENT_STATUS.UNKNOWN;
}

function normalizeEventSeverity(
  value,
) {
  const normalized =
    normalizeUpperString(
      value,
    );

  if (
    normalized &&
    VALID_EVENT_SEVERITIES.has(
      normalized,
    )
  ) {
    return normalized;
  }

  return EVENT_SEVERITY.UNKNOWN;
}

function normalizeAuthority(
  value,
) {
  const normalized =
    normalizeUpperString(
      value,
    );

  if (
    normalized &&
    VALID_AUTHORITY_LEVELS.has(
      normalized,
    )
  ) {
    return normalized;
  }

  return AUTHORITY_LEVEL.UNKNOWN;
}

/**
 * ============================================================
 * EVENT IDENTITY
 * ============================================================
 */

function buildEventKey(
  event,
) {
  const externalId =
    normalizeString(
      event.externalId,
    );

  if (externalId) {
    return [
      event.source ??
        "UNKNOWN",
      externalId,
    ].join(":");
  }

  return [
    event.source ??
      "UNKNOWN",

    event.type ??
      EVENT_TYPE.OTHER,

    event.timestamp ??
      "UNKNOWN_TIME",

    event.title ??
      event.summary ??
      "UNTITLED",
  ]
    .join("|")
    .toLowerCase();
}

/**
 * ============================================================
 * NORMALIZE ONE EVENT
 * ============================================================
 */

export function normalizeMarketEvent(
  rawEvent,
) {
  if (
    !rawEvent ||
    typeof rawEvent !==
      "object"
  ) {
    return null;
  }

  const timestamp =
    normalizeTimestamp(
      rawEvent.timestamp ??
        rawEvent.publishedAt ??
        rawEvent.date,
    );

  /**
   * An event without a valid timestamp cannot safely
   * participate in freshness calculations.
   */

  if (!timestamp) {
    return null;
  }

  const title =
  normalizeString(
    rawEvent.title,
  );

const summary =
  normalizeString(
    rawEvent.summary ??
      rawEvent.description,
  );

const content =
  normalizeString(
    rawEvent.content,
  );

  /**
   * Require some human-readable description.
   */

  if (
  !title &&
  !summary &&
  !content
) {
  return null;
}

const event = {
  externalId:
    normalizeString(
      rawEvent.externalId ??
        rawEvent.id,
    ),
    
    type:
      normalizeEventType(
        rawEvent.type,
      ),

    timestamp,

    title,

    summary,

    /**
     * Preserve the full official document body so the
     * interpretation engine can analyze source content.
     */
    content,

    source:
      normalizeString(
        rawEvent.source,
      ) ??
      "UNKNOWN",

    sourceTier:
      clamp(
        rawEvent.sourceTier,
        0,
        1,
      ),

    credibility:
      clamp(
        rawEvent.credibility,
        0,
        1,
      ),

    authority:
      normalizeAuthority(
        rawEvent.authority,
      ),

    status:
      normalizeEventStatus(
        rawEvent.status,
      ),

    severity:
      normalizeEventSeverity(
        rawEvent.severity,
      ),

    surprise:
      clamp(
        rawEvent.surprise,
        0,
        1,
      ),

    /**
     * rawImpact:
     *
     * -1 = strongly bearish
     *  0 = neutral / mixed
     * +1 = strongly bullish
     *
     * We do NOT manufacture this value.
     */

    rawImpact:
      clamp(
        rawEvent.rawImpact,
        -1,
        1,
      ),

    countries:
      normalizeUpperArray(
        rawEvent.countries,
      ),

    sectors:
      normalizeUpperArray(
        rawEvent.sectors,
      ),

    symbols:
      normalizeUpperArray(
        rawEvent.symbols,
      ),

    url:
      normalizeString(
        rawEvent.url,
      ),

    metadata:
      rawEvent.metadata &&
      typeof rawEvent.metadata ===
        "object"
        ? {
            ...rawEvent.metadata,
          }
        : {},
  };

  event.eventKey =
    buildEventKey(
      event,
    );

  return event;
}

/**
 * ============================================================
 * DEDUPLICATION
 * ============================================================
 */

function deduplicateEvents(
  events,
) {
  const seen =
    new Set();

  const output = [];

  for (
    const event of events
  ) {
    if (
      !event?.eventKey
    ) {
      continue;
    }

    if (
      seen.has(
        event.eventKey,
      )
    ) {
      continue;
    }

    seen.add(
      event.eventKey,
    );

    output.push(
      event,
    );
  }

  return output;
}

/**
 * ============================================================
 * RELEVANCE FILTER
 * ============================================================
 */

function isRelevantEvent(
  event,
  {
    symbol = null,
    country = null,
  } = {},
) {
  if (!event) {
    return false;
  }

  const normalizedSymbol =
    normalizeUpperString(
      symbol,
    );

  const normalizedCountry =
    normalizeUpperString(
      country,
    );

  /**
   * Events with no explicit scope are allowed because
   * broad macro/geopolitical events may affect the
   * entire market.
   */

  const hasScopedTargets =
    event.symbols.length >
      0 ||
    event.countries.length >
      0;

  if (!hasScopedTargets) {
    return true;
  }

  if (
    normalizedSymbol &&
    event.symbols.includes(
      normalizedSymbol,
    )
  ) {
    return true;
  }

  if (
    normalizedCountry &&
    event.countries.includes(
      normalizedCountry,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getMarketEvents({
  symbol = null,

  country = "US",

  asOfTimestamp =
    new Date()
      .toISOString(),

  lookbackHours = 72,

  sourceEvents = [],
} = {}) {
  try {
    const asOf =
      new Date(
        asOfTimestamp,
      );

    if (
      Number.isNaN(
        asOf.getTime(),
      )
    ) {
      throw new Error(
        "Invalid asOfTimestamp.",
      );
    }

    const safeLookbackHours =
      Math.max(
        1,
        Number(
          lookbackHours,
        ) || 72,
      );

    const cutoff =
      asOf.getTime() -
      safeLookbackHours *
        60 *
        60 *
        1000;

    const normalized =
      sourceEvents
        .map(
          normalizeMarketEvent,
        )
        .filter(Boolean)
        .filter(
          (event) => {
            const time =
              new Date(
                event.timestamp,
              ).getTime();

            return (
              time >= cutoff &&
              time <=
                asOf.getTime()
            );
          },
        )
        .filter(
          (event) =>
            isRelevantEvent(
              event,
              {
                symbol,
                country,
              },
            ),
        );

    const events =
      deduplicateEvents(
        normalized,
      ).sort(
        (a, b) =>
          new Date(
            b.timestamp,
          ).getTime() -
          new Date(
            a.timestamp,
          ).getTime(),
      );

    return {
      approved: true,

      provider:
        "MARKET_EVENT_DATA",

      status:
        events.length > 0
          ? "READY"
          : "NO_EVENTS",

      symbol:
        normalizeUpperString(
          symbol,
        ),

      country:
        normalizeUpperString(
          country,
        ),

      eventCount:
        events.length,

      events,

      warnings:
        events.length === 0
          ? [
              "No verified market events were supplied for the requested window.",
            ]
          : [],

      errors: [],

      asOfTimestamp:
        asOf.toISOString(),

      fetchedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "MARKET_EVENT_DATA",

      status:
        "ERROR",

      symbol:
        normalizeUpperString(
          symbol,
        ),

      country:
        normalizeUpperString(
          country,
        ),

      eventCount: 0,

      events: [],

      warnings: [
        "Market events could not be normalized.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  }
}

export default getMarketEvents;