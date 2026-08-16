/**
 * ============================================================
 * HISTORICAL ANALOGUE ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Compare the current market environment with similar
 * historical environments and measure what happened afterward.
 *
 * This engine can consume outputs from:
 *
 * - Technical engine
 * - Macro engine
 * - Country engine
 * - Company engine
 * - Event engine
 * - Social engine
 * - Market regime engine
 *
 * It does NOT:
 *
 * - predict with certainty
 * - execute trades
 * - blindly copy historical outcomes
 *
 * It produces:
 *
 * - historical similarity score
 * - analogue count
 * - bullish / bearish historical frequency
 * - forward-return statistics
 * - LONG support
 * - SHORT support
 *
 * Maximum contribution:
 *
 * 5 points
 *
 * CRITICAL BACKTESTING RULE:
 *
 * Historical records used for a simulated decision must have
 * timestamps strictly earlier than the simulation timestamp.
 *
 * This prevents look-ahead bias.
 */

/**
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

export const HISTORICAL_DIRECTION =
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

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    UNKNOWN:
      "UNKNOWN",
  });

export const ANALOGUE_QUALITY =
  Object.freeze({
    EXCELLENT:
      "EXCELLENT",

    STRONG:
      "STRONG",

    MODERATE:
      "MODERATE",

    WEAK:
      "WEAK",

    INSUFFICIENT:
      "INSUFFICIENT",
  });

/**
 * ============================================================
 * DEFAULT CONFIGURATION
 * ============================================================
 *
 * These are starting research parameters.
 *
 * They should eventually be optimized through:
 *
 * - backtesting
 * - walk-forward testing
 * - out-of-sample validation
 */

export const DEFAULT_HISTORICAL_CONFIG =
  Object.freeze({
    minimumSimilarity:
      0.70,

    strongSimilarity:
      0.85,

    excellentSimilarity:
      0.92,

    minimumAnalogues:
      5,

    preferredAnalogueCount:
      15,

    maximumAnalogues:
      50,

    neutralReturnThreshold:
      0.0025,

    minimumDirectionalEdge:
      0.55,

    strongDirectionalEdge:
      0.70,

    maximumScore:
      5,

    /**
     * Feature importance.
     *
     * Must sum approximately to 1.
     */
    weights: {
      technical: 0.20,

      macro: 0.20,

      regime: 0.15,

      country: 0.10,

      company: 0.10,

      events: 0.10,

      social: 0.05,

      volatility: 0.05,

      liquidity: 0.05,
    },
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function isFiniteNumber(value) {
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

function safeAverage(values) {
  const valid =
    values.filter(
      isFiniteNumber,
    );

  if (valid.length === 0) {
    return null;
  }

  return (
    valid.reduce(
      (
        sum,
        value,
      ) =>
        sum +
        Number(value),
      0,
    ) /
    valid.length
  );
}

function median(values) {
  const valid =
    values
      .filter(
        isFiniteNumber,
      )
      .map(Number)
      .sort(
        (a, b) =>
          a - b,
      );

  if (valid.length === 0) {
    return null;
  }

  const middle =
    Math.floor(
      valid.length / 2,
    );

  if (
    valid.length %
      2 ===
    0
  ) {
    return (
      valid[middle - 1] +
      valid[middle]
    ) / 2;
  }

  return valid[middle];
}

/**
 * ============================================================
 * NORMALIZE ENGINE SCORE
 * ============================================================
 *
 * Standard internal state:
 *
 * -1 = strongly bearish
 *  0 = neutral
 * +1 = strongly bullish
 */

function normalizeEngineScore(
  result,
) {
  if (!result) {
    return null;
  }

  if (
    isFiniteNumber(
      result.rawScore,
    )
  ) {
    return clamp(
      result.rawScore,
      -1,
      1,
    );
  }

  const long =
    result
      ?.directionalSupport
      ?.long;

  const short =
    result
      ?.directionalSupport
      ?.short;

  if (
    isFiniteNumber(long) &&
    isFiniteNumber(short)
  ) {
    return clamp(
      Number(long) -
        Number(short),
      -1,
      1,
    );
  }

  return null;
}

/**
 * ============================================================
 * NORMALIZE TECHNICAL SCORE
 * ============================================================
 */

function normalizeTechnical(
  technical,
) {
  if (!technical) {
    return null;
  }

  const direction =
    technical
      ?.trend
      ?.direction;

  switch (direction) {
    case "STRONG_BULLISH":
      return 1;

    case "BULLISH":
      return 0.6;

    case "SIDEWAYS":
      return 0;

    case "BEARISH":
      return -0.6;

    case "STRONG_BEARISH":
      return -1;

    default:
      break;
  }

  return normalizeEngineScore(
    technical,
  );
}

/**
 * ============================================================
 * NORMALIZE MARKET REGIME
 * ============================================================
 */

function normalizeRegime(
  regime,
) {
  const value =
    regime?.regime ??
    regime;

  switch (value) {
    case "STRONG_BULL":
      return 1;

    case "BULL":
      return 0.6;

    case "SIDEWAYS":
      return 0;

    case "BEAR":
      return -0.6;

    case "STRONG_BEAR":
      return -1;

    case "HIGH_VOLATILITY":
      return 0;

    default:
      return null;
  }
}

/**
 * ============================================================
 * BUILD CURRENT STATE VECTOR
 * ============================================================
 */

export function buildMarketFingerprint({
  technical = null,

  macro = null,

  marketRegime = null,

  country = null,

  company = null,

  events = null,

  social = null,

  volatility = null,

  liquidity = null,
} = {}) {
  const fingerprint = {
    technical:
      normalizeTechnical(
        technical,
      ),

    macro:
      normalizeEngineScore(
        macro,
      ),

    regime:
      normalizeRegime(
        marketRegime,
      ),

    country:
      normalizeEngineScore(
        country,
      ),

    company:
      normalizeEngineScore(
        company,
      ),

    events:
      normalizeEngineScore(
        events,
      ),

    social:
      normalizeEngineScore(
        social,
      ),

    volatility:
      isFiniteNumber(
        volatility?.score,
      )
        ? clamp(
            1 -
              Number(
                volatility.score,
              ) *
                2,
            -1,
            1,
          )
        : null,

    liquidity:
      isFiniteNumber(
        liquidity?.score,
      )
        ? clamp(
            liquidity.score,
            -1,
            1,
          )
        : null,
  };

  return fingerprint;
}

/**
 * ============================================================
 * FEATURE SIMILARITY
 * ============================================================
 *
 * Values are expected between:
 *
 * -1 and +1
 *
 * Difference:
 *
 * 0 = identical
 * 2 = completely opposite
 *
 * Similarity:
 *
 * 1 = identical
 * 0 = opposite
 */

function calculateFeatureSimilarity(
  currentValue,
  historicalValue,
) {
  if (
    !isFiniteNumber(
      currentValue,
    ) ||
    !isFiniteNumber(
      historicalValue,
    )
  ) {
    return null;
  }

  const difference =
    Math.abs(
      Number(currentValue) -
      Number(historicalValue),
    );

  return clamp(
    1 -
      difference / 2,
    0,
    1,
  );
}

/**
 * ============================================================
 * STATE SIMILARITY
 * ============================================================
 */

export function calculateStateSimilarity({
  current,

  historical,

  weights =
    DEFAULT_HISTORICAL_CONFIG
      .weights,
}) {
  if (
    !current ||
    !historical
  ) {
    return {
      similarity: 0,
      coverage: 0,
      components: {},
    };
  }

  let weightedSimilarity =
    0;

  let availableWeight =
    0;

  let totalConfiguredWeight =
    0;

  const components = {};

  for (
    const [
      feature,
      weight,
    ]
    of Object.entries(
      weights,
    )
  ) {
    totalConfiguredWeight +=
      Number(weight);

    const featureSimilarity =
      calculateFeatureSimilarity(
        current[feature],
        historical[feature],
      );

    components[feature] = {
      current:
        current[
          feature
        ] ??
        null,

      historical:
        historical[
          feature
        ] ??
        null,

      similarity:
        featureSimilarity,

      weight,
    };

    if (
      featureSimilarity ===
      null
    ) {
      continue;
    }

    weightedSimilarity +=
      featureSimilarity *
      Number(weight);

    availableWeight +=
      Number(weight);
  }

  if (
    availableWeight <= 0
  ) {
    return {
      similarity: 0,
      coverage: 0,
      components,
    };
  }

  const similarity =
    weightedSimilarity /
    availableWeight;

  const coverage =
    totalConfiguredWeight > 0
      ? availableWeight /
        totalConfiguredWeight
      : 0;

  /**
   * Penalize similarity if only
   * a small portion of the state
   * could be compared.
   */

  const adjustedSimilarity =
    similarity *
    clamp(
      0.5 +
        coverage *
          0.5,
      0,
      1,
    );

  return {
    similarity:
      round(
        adjustedSimilarity,
        4,
      ),

    rawSimilarity:
      round(
        similarity,
        4,
      ),

    coverage:
      round(
        coverage,
        4,
      ),

    components,
  };
}

/**
 * ============================================================
 * HISTORICAL DATA VALIDATION
 * ============================================================
 *
 * Expected record:
 *
 * {
 *   timestamp,
 *
 *   fingerprint: {
 *     technical,
 *     macro,
 *     regime,
 *     country,
 *     company,
 *     events,
 *     social,
 *     volatility,
 *     liquidity
 *   },
 *
 *   forwardReturns: {
 *     oneHour,
 *     oneDay,
 *     fiveDay,
 *     twentyDay,
 *     sixtyDay
 *   }
 * }
 */

function validateHistoricalRecord(
  record,
) {
  if (!record) {
    return false;
  }

  const timestamp =
    new Date(
      record.timestamp,
    ).getTime();

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return false;
  }

  if (
    !record.fingerprint
  ) {
    return false;
  }

  if (
    !record.forwardReturns
  ) {
    return false;
  }

  return true;
}

/**
 * ============================================================
 * LOOK-AHEAD PROTECTION
 * ============================================================
 */

function isHistoricallyAvailable({
  record,

  asOfTimestamp,
}) {
  const recordTime =
    new Date(
      record.timestamp,
    ).getTime();

  const asOf =
    new Date(
      asOfTimestamp,
    ).getTime();

  if (
    !Number.isFinite(
      recordTime,
    ) ||
    !Number.isFinite(
      asOf,
    )
  ) {
    return false;
  }

  /**
   * Strictly earlier.
   */
  return recordTime < asOf;
}

/**
 * ============================================================
 * FIND ANALOGUES
 * ============================================================
 */

export function findHistoricalAnalogues({
  currentFingerprint,

  historicalRecords,

  asOfTimestamp =
    Date.now(),

  config =
    DEFAULT_HISTORICAL_CONFIG,
}) {
  if (
    !Array.isArray(
      historicalRecords,
    )
  ) {
    return [];
  }

  const candidates = [];

  for (
    const record
    of historicalRecords
  ) {
    if (
      !validateHistoricalRecord(
        record,
      )
    ) {
      continue;
    }

    /**
     * Prevent future data from
     * entering historical analysis.
     */

    if (
      !isHistoricallyAvailable({
        record,

        asOfTimestamp,
      })
    ) {
      continue;
    }

    const similarity =
      calculateStateSimilarity({
        current:
          currentFingerprint,

        historical:
          record.fingerprint,

        weights:
          config.weights,
      });

    if (
      similarity.similarity <
      config.minimumSimilarity
    ) {
      continue;
    }

    candidates.push({
      ...record,

      analogueSimilarity:
        similarity.similarity,

      analogueCoverage:
        similarity.coverage,

      similarityComponents:
        similarity.components,
    });
  }

  candidates.sort(
    (a, b) =>
      Number(
        b.analogueSimilarity,
      ) -
      Number(
        a.analogueSimilarity,
      ),
  );

  return candidates.slice(
    0,
    config.maximumAnalogues,
  );
}

/**
 * ============================================================
 * OUTCOME CLASSIFICATION
 * ============================================================
 */

function classifyReturn({
  value,

  neutralThreshold,
}) {
  if (!isFiniteNumber(value)) {
    return "UNKNOWN";
  }

  const number =
    Number(value);

  if (
    number >
    neutralThreshold
  ) {
    return "BULLISH";
  }

  if (
    number <
    -neutralThreshold
  ) {
    return "BEARISH";
  }

  return "NEUTRAL";
}

/**
 * ============================================================
 * ANALYZE FORWARD RETURNS
 * ============================================================
 */

function analyzeHorizon({
  analogues,

  field,

  neutralThreshold,
}) {
  const values =
    analogues
      .map(
        (item) =>
          item
            ?.forwardReturns
            ?.[field],
      )
      .filter(
        isFiniteNumber,
      )
      .map(Number);

  if (
    values.length === 0
  ) {
    return {
      sampleSize: 0,

      bullish: 0,

      bearish: 0,

      neutral: 0,

      bullishFrequency: null,

      bearishFrequency: null,

      neutralFrequency: null,

      averageReturn: null,

      medianReturn: null,
    };
  }

  let bullish = 0;
  let bearish = 0;
  let neutral = 0;

  for (
    const value
    of values
  ) {
    const classification =
      classifyReturn({
        value,

        neutralThreshold,
      });

    if (
      classification ===
      "BULLISH"
    ) {
      bullish += 1;
    } else if (
      classification ===
      "BEARISH"
    ) {
      bearish += 1;
    } else {
      neutral += 1;
    }
  }

  return {
    sampleSize:
      values.length,

    bullish,

    bearish,

    neutral,

    bullishFrequency:
      round(
        bullish /
          values.length,
        4,
      ),

    bearishFrequency:
      round(
        bearish /
          values.length,
        4,
      ),

    neutralFrequency:
      round(
        neutral /
          values.length,
        4,
      ),

    averageReturn:
      round(
        safeAverage(
          values,
        ),
        6,
      ),

    medianReturn:
      round(
        median(
          values,
        ),
        6,
      ),
  };
}

/**
 * ============================================================
 * MULTI-HORIZON ANALYSIS
 * ============================================================
 */

function analyzeForwardOutcomes({
  analogues,

  config,
}) {
  return {
    oneHour:
      analyzeHorizon({
        analogues,

        field:
          "oneHour",

        neutralThreshold:
          config
            .neutralReturnThreshold,
      }),

    oneDay:
      analyzeHorizon({
        analogues,

        field:
          "oneDay",

        neutralThreshold:
          config
            .neutralReturnThreshold,
      }),

    fiveDay:
      analyzeHorizon({
        analogues,

        field:
          "fiveDay",

        neutralThreshold:
          config
            .neutralReturnThreshold,
      }),

    twentyDay:
      analyzeHorizon({
        analogues,

        field:
          "twentyDay",

        neutralThreshold:
          config
            .neutralReturnThreshold,
      }),

    sixtyDay:
      analyzeHorizon({
        analogues,

        field:
          "sixtyDay",

        neutralThreshold:
          config
            .neutralReturnThreshold,
      }),
  };
}

/**
 * ============================================================
 * BUILD DIRECTIONAL CONSENSUS
 * ============================================================
 *
 * We give higher weight to nearer horizons
 * for a short-term trading system.
 */

function calculateHistoricalConsensus({
  outcomes,
}) {
  const horizons = [
    {
      result:
        outcomes.oneHour,

      weight: 0.15,
    },

    {
      result:
        outcomes.oneDay,

      weight: 0.25,
    },

    {
      result:
        outcomes.fiveDay,

      weight: 0.30,
    },

    {
      result:
        outcomes.twentyDay,

      weight: 0.20,
    },

    {
      result:
        outcomes.sixtyDay,

      weight: 0.10,
    },
  ];

  let bullishScore = 0;
  let bearishScore = 0;
  let activeWeight = 0;

  for (
    const horizon
    of horizons
  ) {
    if (
      horizon.result
        .sampleSize <= 0
    ) {
      continue;
    }

    bullishScore +=
      Number(
        horizon.result
          .bullishFrequency ??
          0,
      ) *
      horizon.weight;

    bearishScore +=
      Number(
        horizon.result
          .bearishFrequency ??
          0,
      ) *
      horizon.weight;

    activeWeight +=
      horizon.weight;
  }

  if (
    activeWeight <= 0
  ) {
    return {
      bullish: 0,
      bearish: 0,
      rawScore: 0,
    };
  }

  bullishScore /=
    activeWeight;

  bearishScore /=
    activeWeight;

  const rawScore =
    clamp(
      bullishScore -
        bearishScore,
      -1,
      1,
    );

  return {
    bullish:
      round(
        bullishScore,
        4,
      ),

    bearish:
      round(
        bearishScore,
        4,
      ),

    rawScore:
      round(
        rawScore,
        4,
      ),
  };
}

/**
 * ============================================================
 * ANALOGUE QUALITY
 * ============================================================
 */

function calculateAnalogueQuality({
  analogues,

  config,
}) {
  if (
    analogues.length <
    config.minimumAnalogues
  ) {
    return {
      quality:
        ANALOGUE_QUALITY
          .INSUFFICIENT,

      averageSimilarity:
        analogues.length > 0
          ? round(
              safeAverage(
                analogues.map(
                  (item) =>
                    item
                      .analogueSimilarity,
                ),
              ),
              4,
            )
          : 0,

      sampleQuality:
        clamp(
          analogues.length /
            config
              .minimumAnalogues,
          0,
          1,
        ),
    };
  }

  const similarity =
    safeAverage(
      analogues.map(
        (item) =>
          item
            .analogueSimilarity,
      ),
    ) ?? 0;

  let quality =
    ANALOGUE_QUALITY
      .MODERATE;

  if (
    similarity >=
    config
      .excellentSimilarity
  ) {
    quality =
      ANALOGUE_QUALITY
        .EXCELLENT;
  } else if (
    similarity >=
    config
      .strongSimilarity
  ) {
    quality =
      ANALOGUE_QUALITY
        .STRONG;
  } else if (
    similarity <
    config
      .minimumSimilarity +
      0.05
  ) {
    quality =
      ANALOGUE_QUALITY.WEAK;
  }

  return {
    quality,

    averageSimilarity:
      round(
        similarity,
        4,
      ),

    sampleQuality:
      round(
        clamp(
          analogues.length /
            config
              .preferredAnalogueCount,
          0,
          1,
        ),
        4,
      ),
  };
}

/**
 * ============================================================
 * CONFIDENCE
 * ============================================================
 */

function calculateHistoricalConfidence({
  analogueQuality,

  consensus,

  analogues,
}) {
  if (
    analogues.length === 0
  ) {
    return 0;
  }

  const similarityQuality =
    Number(
      analogueQuality
        .averageSimilarity ??
      0,
    );

  const sampleQuality =
    Number(
      analogueQuality
        .sampleQuality ??
      0,
    );

  const directionalConsistency =
    Math.max(
      Number(
        consensus.bullish ??
        0,
      ),
      Number(
        consensus.bearish ??
        0,
      ),
    );

  const confidence =
    (
      similarityQuality *
      0.45
    ) +
    (
      sampleQuality *
      0.25
    ) +
    (
      directionalConsistency *
      0.30
    );

  return clamp(
    confidence,
    0,
    1,
  );
}

/**
 * ============================================================
 * DIRECTION
 * ============================================================
 */

function classifyHistoricalDirection({
  consensus,

  confidence,

  analogueCount,

  config,
}) {
  if (
    analogueCount <
    config.minimumAnalogues
  ) {
    return HISTORICAL_DIRECTION
      .INSUFFICIENT_DATA;
  }

  const raw =
    Number(
      consensus.rawScore ??
      0,
    );

  if (
    raw >= 0.40 &&
    confidence >= 0.70
  ) {
    return HISTORICAL_DIRECTION
      .STRONG_BULLISH;
  }

  if (raw >= 0.12) {
    return HISTORICAL_DIRECTION
      .BULLISH;
  }

  if (
    raw <= -0.40 &&
    confidence >= 0.70
  ) {
    return HISTORICAL_DIRECTION
      .STRONG_BEARISH;
  }

  if (raw <= -0.12) {
    return HISTORICAL_DIRECTION
      .BEARISH;
  }

  return HISTORICAL_DIRECTION
    .NEUTRAL;
}

/**
 * ============================================================
 * DIRECTIONAL SUPPORT
 * ============================================================
 */

function calculateDirectionalSupport({
  consensus,

  confidence,

  analogueCount,

  config,
}) {
  /**
   * Insufficient history:
   *
   * return neutral support rather than
   * false bullish/bearish evidence.
   */

  if (
    analogueCount <
    config.minimumAnalogues
  ) {
    return {
      long: 0.5,
      short: 0.5,
    };
  }

  const raw =
    clamp(
      consensus.rawScore,
      -1,
      1,
    );

  /**
   * Confidence shrinks weak historical
   * evidence toward neutral.
   */

  const adjusted =
    raw *
    confidence;

  return {
    long:
      round(
        (
          adjusted +
          1
        ) / 2,
        4,
      ),

    short:
      round(
        (
          1 -
          adjusted
        ) / 2,
        4,
      ),
  };
}

/**
 * ============================================================
 * SCORE CONTRIBUTION
 * ============================================================
 *
 * Historical evidence is capped at 5 points.
 */

function calculatePointContribution({
  directionalSupport,

  confidence,

  maximumScore,
}) {
  return {
    long:
      round(
        Number(
          directionalSupport.long,
        ) *
        confidence *
        maximumScore,
        2,
      ),

    short:
      round(
        Number(
          directionalSupport.short,
        ) *
        confidence *
        maximumScore,
        2,
      ),
  };
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeHistoricalAnalogues({
  technical = null,

  macro = null,

  marketRegime = null,

  country = null,

  company = null,

  events = null,

  social = null,

  volatility = null,

  liquidity = null,

  historicalRecords = [],

  asOfTimestamp =
    Date.now(),

  config =
    DEFAULT_HISTORICAL_CONFIG,
} = {}) {
  try {
    const warnings = [];

    /**
     * ======================================================
     * CURRENT FINGERPRINT
     * ======================================================
     */

    const currentFingerprint =
      buildMarketFingerprint({
        technical,

        macro,

        marketRegime,

        country,

        company,

        events,

        social,

        volatility,

        liquidity,
      });

    /**
     * ======================================================
     * FIND ANALOGUES
     * ======================================================
     */

    const analogues =
      findHistoricalAnalogues({
        currentFingerprint,

        historicalRecords,

        asOfTimestamp,

        config,
      });

    /**
     * ======================================================
     * QUALITY
     * ======================================================
     */

    const analogueQuality =
      calculateAnalogueQuality({
        analogues,

        config,
      });

    /**
     * ======================================================
     * INSUFFICIENT DATA
     * ======================================================
     */

    if (
      analogues.length <
      config.minimumAnalogues
    ) {
      warnings.push(
        `Only ${analogues.length} qualifying historical analogues were found. Minimum required is ${config.minimumAnalogues}.`,
      );

      return {
        approved: true,

        engine:
          "HISTORICAL_ANALOGUE",

        status:
          "INSUFFICIENT_ANALOGUES",

        direction:
          HISTORICAL_DIRECTION
            .INSUFFICIENT_DATA,

        confidence: 0,

        rawScore: 0,

        currentFingerprint,

        analogueCount:
          analogues.length,

        analogueQuality,

        directionalSupport: {
          long: 0.5,
          short: 0.5,
        },

        pointContribution: {
          long: 0,
          short: 0,
        },

        outcomes: null,

        analogues,

        summary:
          "Historical evidence is insufficient to award directional points.",

        warnings,

        errors: [],

        maximumScore:
          config.maximumScore,

        timestamp:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * FORWARD OUTCOMES
     * ======================================================
     */

    const outcomes =
      analyzeForwardOutcomes({
        analogues,

        config,
      });

    /**
     * ======================================================
     * CONSENSUS
     * ======================================================
     */

    const consensus =
      calculateHistoricalConsensus({
        outcomes,
      });

    /**
     * ======================================================
     * CONFIDENCE
     * ======================================================
     */

    const confidence =
      calculateHistoricalConfidence({
        analogueQuality,

        consensus,

        analogues,
      });

    /**
     * ======================================================
     * DIRECTION
     * ======================================================
     */

    const direction =
      classifyHistoricalDirection({
        consensus,

        confidence,

        analogueCount:
          analogues.length,

        config,
      });

    /**
     * ======================================================
     * LONG / SHORT SUPPORT
     * ======================================================
     */

    const directionalSupport =
      calculateDirectionalSupport({
        consensus,

        confidence,

        analogueCount:
          analogues.length,

        config,
      });

    /**
     * ======================================================
     * POINTS
     * ======================================================
     */

    const pointContribution =
      calculatePointContribution({
        directionalSupport,

        confidence,

        maximumScore:
          config.maximumScore,
      });

    /**
     * ======================================================
     * WARNINGS
     * ======================================================
     */

    if (
      analogueQuality.quality ===
      ANALOGUE_QUALITY.WEAK
    ) {
      warnings.push(
        "Historical analogues only weakly exceed the minimum similarity threshold.",
      );
    }

    if (
      confidence < 0.5
    ) {
      warnings.push(
        "Historical directional confidence is low.",
      );
    }

    /**
     * ======================================================
     * SUMMARY
     * ======================================================
     */

    const bullishPercent =
      round(
        consensus.bullish *
          100,
        1,
      );

    const bearishPercent =
      round(
        consensus.bearish *
          100,
        1,
      );

    const summary =
      `Found ${analogues.length} qualifying historical analogues with ${round(
        analogueQuality.averageSimilarity *
          100,
        1,
      )}% average similarity. Historical outcomes were approximately ${bullishPercent}% bullish and ${bearishPercent}% bearish across weighted horizons.`;

    /**
     * ======================================================
     * FINAL RESULT
     * ======================================================
     */

    return {
      approved: true,

      engine:
        "HISTORICAL_ANALOGUE",

      status:
        "COMPLETE",

      direction,

      confidence:
        round(
          confidence,
          4,
        ),

      rawScore:
        consensus.rawScore,

      currentFingerprint,

      analogueCount:
        analogues.length,

      analogueQuality,

      directionalSupport,

      pointContribution,

      outcomes,

      consensus,

      /**
       * Top historical matches.
       *
       * We do not necessarily need to return
       * every historical record to the frontend.
       */
      analogues:
        analogues.slice(
          0,
          20,
        ),

      summary,

      warnings,

      errors: [],

      maximumScore:
        config.maximumScore,

      timestamp:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    /**
     * ======================================================
     * SAFE FAIL
     * ======================================================
     *
     * Historical engine failure should never
     * create bullish or bearish evidence.
     */

    return {
      approved: false,

      engine:
        "HISTORICAL_ANALOGUE",

      status:
        "ERROR",

      direction:
        HISTORICAL_DIRECTION.UNKNOWN,

      confidence: 0,

      rawScore: 0,

      analogueCount: 0,

      directionalSupport: {
        long: 0.5,
        short: 0.5,
      },

      pointContribution: {
        long: 0,
        short: 0,
      },

      outcomes: null,

      analogues: [],

      summary:
        "Historical analogue analysis failed safely. No historical points should be awarded.",

      warnings: [
        "Historical engine failure should not block the system, but its 5-point contribution must remain zero.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      maximumScore:
        config
          ?.maximumScore ??
        5,

      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default analyzeHistoricalAnalogues;