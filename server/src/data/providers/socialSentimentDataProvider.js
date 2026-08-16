/**
 * ============================================================
 * SOCIAL SENTIMENT DATA PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Aggregate normalized social-platform snapshots into the
 * schema expected by:
 *
 * src/analysis/socialSentimentEngine.js
 *
 * IMPORTANT
 * ---------
 *
 * This provider is FAIL-CLOSED:
 *
 * - it never invents bullish/bearish sentiment
 * - it never treats missing manipulation data as verified-safe
 * - it can operate with one or many independently supplied
 *   platform snapshots
 * - when no verified platform data exists, approved=false
 *
 * LIVE PLATFORM ADAPTERS
 * ----------------------
 *
 * This file intentionally does NOT scrape undocumented
 * endpoints.
 *
 * Platform-specific adapters should be added separately and
 * their normalized results passed into this provider.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const SOCIAL_PROVIDER_STATUS =
  Object.freeze({
    READY:
      "READY",

    PARTIAL:
      "PARTIAL",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    ERROR:
      "ERROR",
  });

export const SOCIAL_PLATFORM =
  Object.freeze({
    REDDIT:
      "REDDIT",

    STOCKTWITS:
      "STOCKTWITS",

    X:
      "X",

    OTHER:
      "OTHER",
  });

const DEFAULT_BASELINE_HOURS =
  24 * 7;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(
  value,
) {
  return Number.isFinite(
    Number(value),
  );
}

function numberOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function clamp(
  value,
  min,
  max,
) {
  const number =
    numberOrNull(
      value,
    );

  if (
    number === null
  ) {
    return null;
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
    numberOrNull(
      value,
    );

  if (
    number === null
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

function normalizePlatformName(
  value,
) {
  const normalized =
    String(
      value ??
      "",
    )
      .trim()
      .toUpperCase();

  if (
    normalized ===
    "REDDIT"
  ) {
    return SOCIAL_PLATFORM.REDDIT;
  }

  if (
    normalized ===
      "STOCKTWITS" ||
    normalized ===
      "STOCK_TWITS"
  ) {
    return SOCIAL_PLATFORM.STOCKTWITS;
  }

  if (
    normalized ===
      "X" ||
    normalized ===
      "TWITTER"
  ) {
    return SOCIAL_PLATFORM.X;
  }

  return normalized
    ? normalized
    : SOCIAL_PLATFORM.OTHER;
}

function average(
  values,
) {
  const usable =
    values
      .map(
        numberOrNull,
      )
      .filter(
        (value) =>
          value !== null,
      );

  if (
    usable.length === 0
  ) {
    return null;
  }

  return (
    usable.reduce(
      (
        total,
        value,
      ) =>
        total +
        value,
      0,
    ) /
    usable.length
  );
}

function weightedAverage(
  items,
) {
  let numerator = 0;
  let denominator = 0;

  for (
    const item
    of items
  ) {
    const value =
      numberOrNull(
        item?.value,
      );

    const weight =
      numberOrNull(
        item?.weight,
      );

    if (
      value === null ||
      weight === null ||
      weight <= 0
    ) {
      continue;
    }

    numerator +=
      value *
      weight;

    denominator +=
      weight;
  }

  if (
    denominator <= 0
  ) {
    return null;
  }

  return (
    numerator /
    denominator
  );
}

/**
 * ============================================================
 * NORMALIZE ONE PLATFORM SNAPSHOT
 * ============================================================
 *
 * Expected adapter snapshot:
 *
 * {
 *   platform: "REDDIT",
 *
 *   sentiment: {
 *     bullish: 0.52,
 *     bearish: 0.31,
 *     neutral: 0.17
 *   },
 *
 *   mentions: {
 *     currentCount: 120,
 *     currentWindowHours: 1,
 *     baselineCount: 720,
 *     baselineWindowHours: 24,
 *     previousVelocity: 80
 *   },
 *
 *   manipulation: {
 *     botProbability: null,
 *     spamProbability: 0.10,
 *     coordinatedActivityScore: null,
 *     influencerConcentration: 0.20,
 *     abnormalMentionSpike: 0.30
 *   },
 *
 *   observedAt: "...",
 *   source: "..."
 * }
 */

function normalizePlatformSnapshot(
  snapshot,
) {
  if (
    !snapshot ||
    typeof snapshot !==
      "object"
  ) {
    return null;
  }

  const platform =
    normalizePlatformName(
      snapshot.platform,
    );

  const bullish =
    clamp(
      snapshot
        ?.sentiment
        ?.bullish,
      0,
      1,
    );

  const bearish =
    clamp(
      snapshot
        ?.sentiment
        ?.bearish,
      0,
      1,
    );

  let neutral =
    clamp(
      snapshot
        ?.sentiment
        ?.neutral,
      0,
      1,
    );

  if (
    bullish === null ||
    bearish === null
  ) {
    return null;
  }

  if (
    neutral === null
  ) {
    neutral =
      clamp(
        1 -
          bullish -
          bearish,
        0,
        1,
      );
  }

  const sentimentTotal =
    bullish +
    bearish +
    neutral;

  if (
    sentimentTotal <= 0
  ) {
    return null;
  }

  /**
   * Re-normalize proportions so provider adapters do not
   * accidentally send a sum slightly above/below 1.
   */
  const normalizedBullish =
    bullish /
    sentimentTotal;

  const normalizedBearish =
    bearish /
    sentimentTotal;

  const normalizedNeutral =
    neutral /
    sentimentTotal;

  const sentimentScore =
    clamp(
      normalizedBullish -
        normalizedBearish,
      -1,
      1,
    );

  const currentCount =
    numberOrNull(
      snapshot
        ?.mentions
        ?.currentCount,
    );

  const currentWindowHours =
    numberOrNull(
      snapshot
        ?.mentions
        ?.currentWindowHours,
    );

  const baselineCount =
    numberOrNull(
      snapshot
        ?.mentions
        ?.baselineCount,
    );

  const baselineWindowHours =
    numberOrNull(
      snapshot
        ?.mentions
        ?.baselineWindowHours,
    ) ??
    DEFAULT_BASELINE_HOURS;

  const previousVelocity =
    numberOrNull(
      snapshot
        ?.mentions
        ?.previousVelocity,
    );

  const velocity =
    (
      currentCount !==
        null &&
      currentWindowHours !==
        null &&
      currentWindowHours > 0
    )
      ? currentCount /
        currentWindowHours
      : null;

  const baselineVelocity =
    (
      baselineCount !==
        null &&
      baselineWindowHours !==
        null &&
      baselineWindowHours > 0
    )
      ? baselineCount /
        baselineWindowHours
      : null;

  let acceleration =
    null;

  if (
    velocity !== null &&
    previousVelocity !==
      null &&
    previousVelocity !==
      0
  ) {
    acceleration =
      (
        velocity -
        previousVelocity
      ) /
      Math.abs(
        previousVelocity,
      );
  }

  const manipulation =
    snapshot.manipulation &&
    typeof snapshot.manipulation ===
      "object"
      ? {
          botProbability:
            clamp(
              snapshot
                .manipulation
                .botProbability,
              0,
              1,
            ),

          spamProbability:
            clamp(
              snapshot
                .manipulation
                .spamProbability,
              0,
              1,
            ),

          coordinatedActivityScore:
            clamp(
              snapshot
                .manipulation
                .coordinatedActivityScore,
              0,
              1,
            ),

          influencerConcentration:
            clamp(
              snapshot
                .manipulation
                .influencerConcentration,
              0,
              1,
            ),

          abnormalMentionSpike:
            clamp(
              snapshot
                .manipulation
                .abnormalMentionSpike,
              0,
              1,
            ),
        }
      : null;

  const manipulationObserved =
    manipulation
      ? Object.values(
          manipulation,
        )
          .filter(
            (value) =>
              value !== null,
          )
          .length
      : 0;

  return {
    platform,

    sentiment: {
      bullish:
        round(
          normalizedBullish,
          6,
        ),

      bearish:
        round(
          normalizedBearish,
          6,
        ),

      neutral:
        round(
          normalizedNeutral,
          6,
        ),

      sentimentScore:
        round(
          sentimentScore,
          6,
        ),
    },

    mentions: {
      currentCount,

      currentWindowHours,

      baselineCount,

      baselineWindowHours,

      velocity:
        round(
          velocity,
          6,
        ),

      baselineVelocity:
        round(
          baselineVelocity,
          6,
        ),

      previousVelocity,

      acceleration:
        round(
          acceleration,
          6,
        ),
    },

    manipulation,

    manipulationObserved,

    observedAt:
      snapshot.observedAt ??
      null,

    source:
      snapshot.source ??
      platform,

    metadata:
      snapshot.metadata ??
      null,
  };
}

/**
 * ============================================================
 * AGGREGATE SENTIMENT
 * ============================================================
 */

function aggregateSentiment(
  platforms,
) {
  const items =
    platforms.map(
      (platform) => {
        /**
         * Prefer mention count as weighting when available.
         * Fall back to 1 so a valid platform is not discarded.
         */
        const weight =
          numberOrNull(
            platform
              ?.mentions
              ?.currentCount,
          );

        return {
          platform,

          weight:
            weight !== null &&
            weight > 0
              ? weight
              : 1,
        };
      },
    );

  const bullish =
    weightedAverage(
      items.map(
        ({
          platform,
          weight,
        }) => ({
          value:
            platform
              .sentiment
              .bullish,

          weight,
        }),
      ),
    );

  const bearish =
    weightedAverage(
      items.map(
        ({
          platform,
          weight,
        }) => ({
          value:
            platform
              .sentiment
              .bearish,

          weight,
        }),
      ),
    );

  const neutral =
    weightedAverage(
      items.map(
        ({
          platform,
          weight,
        }) => ({
          value:
            platform
              .sentiment
              .neutral,

          weight,
        }),
      ),
    );

  if (
    bullish === null ||
    bearish === null
  ) {
    return null;
  }

  return {
    bullish:
      round(
        bullish,
        6,
      ),

    bearish:
      round(
        bearish,
        6,
      ),

    neutral:
      round(
        neutral ?? 0,
        6,
      ),
  };
}

/**
 * ============================================================
 * AGGREGATE MENTION ACTIVITY
 * ============================================================
 */

function aggregateMentions(
  platforms,
) {
  const velocity =
    platforms.reduce(
      (
        total,
        platform,
      ) => {
        const value =
          numberOrNull(
            platform
              ?.mentions
              ?.velocity,
          );

        return (
          total +
          (
            value ??
            0
          )
        );
      },
      0,
    );

  const baselineVelocity =
    platforms.reduce(
      (
        total,
        platform,
      ) => {
        const value =
          numberOrNull(
            platform
              ?.mentions
              ?.baselineVelocity,
          );

        return (
          total +
          (
            value ??
            0
          )
        );
      },
      0,
    );

  const acceleration =
    average(
      platforms.map(
        (platform) =>
          platform
            ?.mentions
            ?.acceleration,
      ),
    );

  const hasVelocity =
    platforms.some(
      (platform) =>
        isFiniteNumber(
          platform
            ?.mentions
            ?.velocity,
        ),
    );

  const hasBaseline =
    platforms.some(
      (platform) =>
        isFiniteNumber(
          platform
            ?.mentions
            ?.baselineVelocity,
        ),
    );

  if (
    !hasVelocity &&
    !hasBaseline
  ) {
    return null;
  }

  return {
    velocity:
      hasVelocity
        ? round(
            velocity,
            6,
          )
        : null,

    baselineVelocity:
      hasBaseline
        ? round(
            baselineVelocity,
            6,
          )
        : null,

    acceleration:
      acceleration !== null
        ? round(
            acceleration,
            6,
          )
        : null,
  };
}

/**
 * ============================================================
 * AGGREGATE OBSERVED MANIPULATION SIGNALS
 * ============================================================
 *
 * Missing signals stay null.
 *
 * socialSentimentEngine currently defaults missing values to 0,
 * so we also return manipulationCoverage to preserve whether the
 * zero is actually observed or simply unavailable.
 */

function aggregateManipulation(
  platforms,
) {
  const fields = [
    "botProbability",
    "spamProbability",
    "coordinatedActivityScore",
    "influencerConcentration",
    "abnormalMentionSpike",
  ];

  const result = {};

  let observedFieldCount = 0;

  for (
    const field
    of fields
  ) {
    const values =
      platforms
        .map(
          (platform) =>
            platform
              ?.manipulation
              ?.[field],
        )
        .map(
          numberOrNull,
        )
        .filter(
          (value) =>
            value !== null,
        );

    if (
      values.length === 0
    ) {
      result[field] =
        null;

      continue;
    }

    /**
     * Manipulation risk is safety-sensitive.
     *
     * Use the maximum observed platform value rather than
     * averaging away a suspicious platform.
     */
    result[field] =
      round(
        Math.max(
          ...values,
        ),
        6,
      );

    observedFieldCount +=
      1;
  }

  const totalFieldCount =
    fields.length;

  return {
    manipulation:
      result,

    manipulationCoverage: {
      observedFieldCount,

      totalFieldCount,

      coverage:
        round(
          observedFieldCount /
            totalFieldCount,
          4,
        ),

      fullyObserved:
        observedFieldCount ===
        totalFieldCount,
    },
  };
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getSocialSentimentData({
  symbol = null,

  platformSnapshots = [],

  fetchedAt = null,
} = {}) {
  const timestamp =
    fetchedAt ??
    new Date()
      .toISOString();

  try {
    const normalizedSymbol =
      String(
        symbol ??
        "",
      )
        .trim()
        .toUpperCase();

    if (!normalizedSymbol) {
      return {
        approved: false,

        provider:
          "SOCIAL_SENTIMENT_DATA",

        status:
          SOCIAL_PROVIDER_STATUS
            .INSUFFICIENT_DATA,

        symbol:
          null,

        platformCount:
          0,

        data:
          null,

        warnings: [
          "A symbol is required for social sentiment aggregation.",
        ],

        errors: [],

        fetchedAt:
          timestamp,
      };
    }

    const rawSnapshots =
      Array.isArray(
        platformSnapshots,
      )
        ? platformSnapshots
        : [];

    const normalizedPlatforms =
      rawSnapshots
        .map(
          normalizePlatformSnapshot,
        )
        .filter(Boolean);

    if (
      normalizedPlatforms.length ===
      0
    ) {
      return {
        approved: false,

        provider:
          "SOCIAL_SENTIMENT_DATA",

        status:
          SOCIAL_PROVIDER_STATUS
            .INSUFFICIENT_DATA,

        symbol:
          normalizedSymbol,

        platformCount:
          0,

        data:
          null,

        warnings: [
          "No verified social-platform snapshots were supplied.",
        ],

        errors: [],

        fetchedAt:
          timestamp,
      };
    }

    const sentiment =
      aggregateSentiment(
        normalizedPlatforms,
      );

    if (!sentiment) {
      return {
        approved: false,

        provider:
          "SOCIAL_SENTIMENT_DATA",

        status:
          SOCIAL_PROVIDER_STATUS
            .INSUFFICIENT_DATA,

        symbol:
          normalizedSymbol,

        platformCount:
          normalizedPlatforms
            .length,

        data:
          null,

        warnings: [
          "Verified platform snapshots did not contain usable sentiment proportions.",
        ],

        errors: [],

        fetchedAt:
          timestamp,
      };
    }

    const mentions =
      aggregateMentions(
        normalizedPlatforms,
      );

    const {
      manipulation,
      manipulationCoverage,
    } =
      aggregateManipulation(
        normalizedPlatforms,
      );

    const platforms =
      normalizedPlatforms
        .map(
          (platform) => ({
            platform:
              platform.platform,

            sentimentScore:
              platform
                .sentiment
                .sentimentScore,

            mentionVelocity:
              platform
                .mentions
                .velocity,

            source:
              platform.source,

            observedAt:
              platform
                .observedAt,
          }),
        );

    const warnings = [];

    if (
      normalizedPlatforms.length ===
      1
    ) {
      warnings.push(
        "Only one verified social platform is available; cross-platform agreement is not independently confirmed.",
      );
    }

    if (
      manipulationCoverage
        .fullyObserved !==
      true
    ) {
      warnings.push(
        "Manipulation-risk coverage is incomplete. Missing manipulation fields mean unknown, not verified low risk.",
      );
    }

    return {
      approved: true,

      provider:
        "SOCIAL_SENTIMENT_DATA",

      status:
        normalizedPlatforms.length >=
          2
          ? SOCIAL_PROVIDER_STATUS
              .READY
          : SOCIAL_PROVIDER_STATUS
              .PARTIAL,

      symbol:
        normalizedSymbol,

      platformCount:
        normalizedPlatforms
          .length,

      data: {
        sentiment,

        mentions,

        platforms,

        /**
         * socialSentimentEngine expects this object.
         *
         * Null fields are retained intentionally.
         */
        manipulation,

        /**
         * Extra metadata ignored by the current engine but
         * useful for the runner/frontend and future hardening.
         */
        manipulationCoverage,

        sources:
          normalizedPlatforms
            .map(
              (platform) => ({
                platform:
                  platform.platform,

                source:
                  platform.source,

                observedAt:
                  platform
                    .observedAt,

                manipulationObserved:
                  platform
                    .manipulationObserved,
              }),
            ),
      },

      warnings,

      errors: [],

      fetchedAt:
        timestamp,
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "SOCIAL_SENTIMENT_DATA",

      status:
        SOCIAL_PROVIDER_STATUS
          .ERROR,

      symbol:
        symbol ??
        null,

      platformCount:
        0,

      data:
        null,

      warnings: [
        "Social sentiment data aggregation failed safely.",
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

export default getSocialSentimentData;
