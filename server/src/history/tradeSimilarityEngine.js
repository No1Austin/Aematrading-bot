// server/src/history/tradeSimilarityEngine.js

/**
 * ============================================================
 * TRADE SIMILARITY ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Compare a current trade-setup fingerprint against historical
 * completed trades and identify the strongest historical
 * analogues.
 *
 * Core principles:
 *
 * 1. Point-in-time safe.
 * 2. Missing data is ignored, not treated as zero.
 * 3. Similarity is always bounded between 0 and 1.
 * 4. LONG/SHORT direction is respected.
 * 5. Cross-symbol analogues are allowed.
 * 6. Every similarity score is explainable.
 * 7. Historical outcome does NOT affect similarity itself.
 */

export const TRADE_SIMILARITY_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    NO_MATCHES: "NO_MATCHES",
    INVALID_CANDIDATE:
      "INVALID_CANDIDATE",
    ERROR: "ERROR",
  });

export const DEFAULT_SIMILARITY_CONFIG =
  Object.freeze({
    minimumSimilarity: 0.7,

    maximumMatches: 10,

    requireSameSide: true,

    allowCrossSymbol: true,

    minimumCoverage: 0.4,

    weights: {
      technical: 15,
      macro: 10,
      marketRegime: 15,
      events: 10,
      company: 8,
      country: 5,
      social: 5,
      historical: 5,
      liquidity: 7,
      consensus: 10,
      scoring: 10,
    },
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
  min = 0,
  max = 1,
) {
  if (!isFiniteNumber(value)) {
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
      ) *
        factor,
    ) / factor
  );
}

function normalizeSide(side) {
  const normalized =
    String(side ?? "")
      .trim()
      .toUpperCase();

  if (
    normalized === "LONG" ||
    normalized === "SHORT"
  ) {
    return normalized;
  }

  return null;
}

function normalizeSymbol(symbol) {
  const normalized =
    String(symbol ?? "")
      .trim()
      .toUpperCase();

  return normalized || null;
}

/**
 * ============================================================
 * NUMERIC SIMILARITY
 * ============================================================
 *
 * Both values are expected to represent normalized support
 * values between 0 and 1.
 *
 * 1.0 vs 1.0 => 1
 * 0.8 vs 0.7 => 0.9
 * 1.0 vs 0.0 => 0
 */

function normalizedNumberSimilarity(
  left,
  right,
) {
  if (
    !isFiniteNumber(left) ||
    !isFiniteNumber(right)
  ) {
    return null;
  }

  const a =
    clamp(left);

  const b =
    clamp(right);

  return clamp(
    1 -
      Math.abs(
        a - b,
      ),
  );
}

/**
 * ============================================================
 * SCORE SIMILARITY
 * ============================================================
 *
 * Trading scores normally operate from 0-100.
 */

function scoreSimilarity(
  left,
  right,
) {
  if (
    !isFiniteNumber(left) ||
    !isFiniteNumber(right)
  ) {
    return null;
  }

  const a =
    Math.min(
      Math.max(
        Number(left),
        0,
      ),
      100,
    );

  const b =
    Math.min(
      Math.max(
        Number(right),
        0,
      ),
      100,
    );

  return clamp(
    1 -
      Math.abs(
        a - b,
      ) /
        100,
  );
}

/**
 * ============================================================
 * COMPONENT LOOKUP
 * ============================================================
 */

function componentMap(
  fingerprint,
) {
  /**
   * ==========================================================
   * CANONICAL FINGERPRINT SHAPE
   * ==========================================================
   *
   * createTradeSetupFingerprint() stores engine components
   * directly on the fingerprint object:
   *
   * fingerprint.technical
   * fingerprint.macro
   * fingerprint.marketRegime
   * ...
   *
   * Older fixtures/tests may still use:
   *
   * fingerprint.components.technical
   *
   * The similarity engine must support BOTH shapes.
   *
   * IMPORTANT:
   * Missing data stays missing. We do not synthesize values.
   */

  const legacyComponents =
    fingerprint
      ?.components;

  if (
    Array.isArray(
      legacyComponents,
    )
  ) {
    return Object.fromEntries(
      legacyComponents
        .filter(
          (component) =>
            component?.name,
        )
        .map(
          (component) => [
            component.name,
            component,
          ],
        ),
    );
  }

  if (
    legacyComponents &&
    typeof legacyComponents ===
      "object"
  ) {
    return legacyComponents;
  }

  /**
   * Canonical production shape emitted by
   * tradeSetupFingerprint.js.
   */
  if (
    fingerprint &&
    typeof fingerprint ===
      "object"
  ) {
    return {
      technical:
        fingerprint
          .technical,

      macro:
        fingerprint
          .macro,

      marketRegime:
        fingerprint
          .marketRegime,

      events:
        fingerprint
          .events,

      company:
        fingerprint
          .company,

      country:
        fingerprint
          .country,

      social:
        fingerprint
          .social,

      historical:
        fingerprint
          .historical,

      liquidity:
        fingerprint
          .liquidity,

      riskReward:
        fingerprint
          .riskReward,

      consensus:
        fingerprint
          .consensus,

      scoring:
        fingerprint
          .scoring,
    };
  }

  return {};
}

/**
 * ============================================================
 * COMPONENT SIMILARITY
 * ============================================================
 */

function compareDirectionalComponent(
  candidateComponent,
  historicalComponent,
) {
  if (
    !candidateComponent ||
    !historicalComponent
  ) {
    return null;
  }

  if (
    candidateComponent
      .available === false ||
    historicalComponent
      .available === false
  ) {
    return null;
  }

  const aligned =
    normalizedNumberSimilarity(
      candidateComponent
        .alignedSupport,
      historicalComponent
        .alignedSupport,
    );

  const opposite =
    normalizedNumberSimilarity(
      candidateComponent
        .oppositeSupport,
      historicalComponent
        .oppositeSupport,
    );

  const available = [
    aligned,
    opposite,
  ].filter(
    (value) =>
      isFiniteNumber(value),
  );

  if (
    available.length === 0
  ) {
    return null;
  }

  return (
    available.reduce(
      (sum, value) =>
        sum +
        Number(value),
      0,
    ) /
    available.length
  );
}

/**
 * ============================================================
 * SCORING SIMILARITY
 * ============================================================
 */

function compareScoring(
  candidate,
  historical,
) {
  const candidateScoring =
    candidate?.scoring ??
    candidate?.scores ??
    {};

  const historicalScoring =
    historical?.scoring ??
    historical?.scores ??
    {};

  const comparisons = [
    scoreSimilarity(
      candidateScoring
        ?.alignedScore,
      historicalScoring
        ?.alignedScore,
    ),

    scoreSimilarity(
      candidateScoring
        ?.oppositeScore,
      historicalScoring
        ?.oppositeScore,
    ),

    scoreSimilarity(
      candidateScoring
        ?.scoreGap,
      historicalScoring
        ?.scoreGap,
    ),
  ].filter(
    (value) =>
      isFiniteNumber(value),
  );

  if (
    comparisons.length === 0
  ) {
    return null;
  }

  return (
    comparisons.reduce(
      (sum, value) =>
        sum +
        Number(value),
      0,
    ) /
    comparisons.length
  );
}

/**
 * ============================================================
 * EXTRACT FINGERPRINT
 * ============================================================
 */

function extractHistoricalFingerprint(
  record,
) {
  return (
    record?.entryFingerprint ??
    record?.fingerprint ??
    record?.setupFingerprint ??
    record
      ?.tradeSetupFingerprint ??
    null
  );
}

/**
 * ============================================================
 * COMPARE TWO FINGERPRINTS
 * ============================================================
 */

export function compareTradeFingerprints({
  candidate,
  historical,
  config = {},
} = {}) {
  try {
    const mergedConfig = {
      ...DEFAULT_SIMILARITY_CONFIG,
      ...config,

      weights: {
        ...DEFAULT_SIMILARITY_CONFIG
          .weights,

        ...(
          config?.weights ??
          {}
        ),
      },
    };

    const candidateSymbol =
      normalizeSymbol(
        candidate?.symbol,
      );

    const historicalSymbol =
      normalizeSymbol(
        historical?.symbol,
      );

    const candidateSide =
      normalizeSide(
        candidate?.side,
      );

    const historicalSide =
      normalizeSide(
        historical?.side,
      );

    if (
      !candidateSymbol ||
      !candidateSide ||
      !historicalSymbol ||
      !historicalSide
    ) {
      return {
        approved: false,
        status:
          TRADE_SIMILARITY_STATUS
            .INVALID_CANDIDATE,

        similarity: null,
        coverage: 0,

        components: [],

        reasons: [
          "Candidate or historical fingerprint is incomplete.",
        ],

        warnings: [],
        errors: [],
      };
    }

    if (
      mergedConfig
        .requireSameSide &&
      candidateSide !==
        historicalSide
    ) {
      return {
        approved: true,

        status:
          TRADE_SIMILARITY_STATUS
            .NO_MATCHES,

        similarity: 0,

        coverage: 1,

        sameSide: false,

        sameSymbol:
          candidateSymbol ===
          historicalSymbol,

        components: [],

        reasons: [
          "Trade direction does not match.",
        ],

        warnings: [],
        errors: [],
      };
    }

    if (
      mergedConfig
        .allowCrossSymbol ===
        false &&
      candidateSymbol !==
        historicalSymbol
    ) {
      return {
        approved: true,

        status:
          TRADE_SIMILARITY_STATUS
            .NO_MATCHES,

        similarity: 0,

        coverage: 1,

        sameSide:
          candidateSide ===
          historicalSide,

        sameSymbol: false,

        components: [],

        reasons: [
          "Cross-symbol historical matching is disabled.",
        ],

        warnings: [],
        errors: [],
      };
    }

    const candidateComponents =
      componentMap(
        candidate,
      );

    const historicalComponents =
      componentMap(
        historical,
      );

    const componentResults = [];

    let weightedSimilarity = 0;
    let availableWeight = 0;
    let totalWeight = 0;

    const directionalNames = [
      "technical",
      "macro",
      "marketRegime",
      "events",
      "company",
      "country",
      "social",
      "historical",
      "liquidity",
      "consensus",
    ];

    for (
      const name
      of directionalNames
    ) {
      const weight =
        Number(
          mergedConfig
            .weights[
              name
            ] ??
          0,
        );

      if (
        !isFiniteNumber(weight) ||
        weight <= 0
      ) {
        continue;
      }

      totalWeight +=
        weight;

      const similarity =
        compareDirectionalComponent(
          candidateComponents[
            name
          ],
          historicalComponents[
            name
          ],
        );

      const available =
        isFiniteNumber(
          similarity,
        );

      componentResults.push({
        name,

        weight,

        available,

        similarity:
          available
            ? round(
                similarity,
                4,
              )
            : null,
      });

      if (!available) {
        continue;
      }

      availableWeight +=
        weight;

      weightedSimilarity +=
        Number(similarity) *
        weight;
    }

    /**
     * Scoring is treated separately because
     * its values generally use a 0-100 scale.
     */

    const scoringWeight =
      Number(
        mergedConfig
          .weights
          .scoring ??
        0,
      );

    if (
      isFiniteNumber(
        scoringWeight,
      ) &&
      scoringWeight > 0
    ) {
      totalWeight +=
        scoringWeight;

      const scoringSimilarity =
        compareScoring(
          candidate,
          historical,
        );

      const scoringAvailable =
        isFiniteNumber(
          scoringSimilarity,
        );

      componentResults.push({
        name: "scoring",

        weight:
          scoringWeight,

        available:
          scoringAvailable,

        similarity:
          scoringAvailable
            ? round(
                scoringSimilarity,
                4,
              )
            : null,
      });

      if (
        scoringAvailable
      ) {
        availableWeight +=
          scoringWeight;

        weightedSimilarity +=
          Number(
            scoringSimilarity,
          ) *
          scoringWeight;
      }
    }

    const coverage =
      totalWeight > 0
        ? availableWeight /
          totalWeight
        : 0;

    const similarity =
      availableWeight > 0
        ? weightedSimilarity /
          availableWeight
        : null;

    const warnings = [];

    if (
      coverage <
      mergedConfig
        .minimumCoverage
    ) {
      warnings.push(
        `Historical similarity coverage is low (${round(
          coverage * 100,
          2,
        )}%).`,
      );
    }

    const qualifies =
      similarity !== null &&
      similarity >=
        mergedConfig
          .minimumSimilarity &&
      coverage >=
        mergedConfig
          .minimumCoverage;

    return {
      approved: true,

      status:
        qualifies
          ? TRADE_SIMILARITY_STATUS
              .COMPLETE
          : TRADE_SIMILARITY_STATUS
              .NO_MATCHES,

      similarity:
        similarity !== null
          ? round(
              clamp(
                similarity,
              ),
              4,
            )
          : null,

      similarityPercent:
        similarity !== null
          ? round(
              clamp(
                similarity,
              ) *
                100,
              2,
            )
          : null,

      coverage:
        round(
          coverage,
          4,
        ),

      sameSide:
        candidateSide ===
        historicalSide,

      sameSymbol:
        candidateSymbol ===
        historicalSymbol,

      candidateSymbol,

      historicalSymbol,

      candidateSide,

      historicalSide,

      qualifies,

      components:
        componentResults,

      reasons:
        qualifies
          ? [
              "Historical setup satisfies similarity and coverage requirements.",
            ]
          : [
              "Historical setup did not satisfy similarity and coverage requirements.",
            ],

      warnings,

      errors: [],
    };
  } catch (error) {
    return {
      approved: false,

      status:
        TRADE_SIMILARITY_STATUS
          .ERROR,

      similarity: null,

      coverage: 0,

      components: [],

      reasons: [],

      warnings: [],

      errors: [
        error?.message ??
          "Unknown trade similarity error.",
      ],
    };
  }
}

/**
 * ============================================================
 * FIND HISTORICAL ANALOGUES
 * ============================================================
 */

export function findHistoricalAnalogues({
  candidate,
  historicalTrades = [],
  config = {},
} = {}) {
  try {
    const mergedConfig = {
      ...DEFAULT_SIMILARITY_CONFIG,
      ...config,

      weights: {
        ...DEFAULT_SIMILARITY_CONFIG
          .weights,

        ...(
          config?.weights ??
          {}
        ),
      },
    };

    const candidateSymbol =
      normalizeSymbol(
        candidate?.symbol,
      );

    const candidateSide =
      normalizeSide(
        candidate?.side,
      );

    if (
      !candidateSymbol ||
      !candidateSide
    ) {
      return {
        approved: false,

        status:
          TRADE_SIMILARITY_STATUS
            .INVALID_CANDIDATE,

        matches: [],

        evaluatedTrades: 0,

        qualifyingTrades: 0,

        reasons: [
          "Candidate fingerprint is invalid.",
        ],

        warnings: [],

        errors: [],
      };
    }

    const records =
      Array.isArray(
        historicalTrades,
      )
        ? historicalTrades
        : [];

    const matches = [];

    let evaluatedTrades = 0;

    for (
      const record
      of records
    ) {
      const fingerprint =
        extractHistoricalFingerprint(
          record,
        );

      if (!fingerprint) {
        continue;
      }

      /**
       * Point-in-time protection.
       *
       * If both timestamps exist, the historical trade must
       * have completed before the candidate setup existed.
       */

      const candidateTimestamp =
        candidate
          ?.asOfTimestamp ??
        candidate
          ?.timestamp ??
        null;

      const historicalClosedAt =
        record
          ?.closedAt ??
        record
          ?.closeTimestamp ??
        record
          ?.exitTimestamp ??
        null;

      if (
        candidateTimestamp &&
        historicalClosedAt
      ) {
        const candidateTime =
          new Date(
            candidateTimestamp,
          ).getTime();

        const closedTime =
          new Date(
            historicalClosedAt,
          ).getTime();

        if (
          Number.isFinite(
            candidateTime,
          ) &&
          Number.isFinite(
            closedTime,
          ) &&
          closedTime >=
            candidateTime
        ) {
          continue;
        }
      }

      evaluatedTrades += 1;

      const comparison =
        compareTradeFingerprints({
          candidate,

          historical:
            fingerprint,

          config:
            mergedConfig,
        });

      if (
        comparison
          ?.approved !== true ||
        comparison
          ?.qualifies !== true
      ) {
        continue;
      }

      matches.push({
        tradeId:
          record?.id ??
          record?.tradeId ??
          null,

        symbol:
          record?.symbol ??
          fingerprint
            ?.symbol ??
          null,

        side:
          record?.side ??
          fingerprint
            ?.side ??
          null,

        outcome:
          record?.outcome ??
          null,

        realizedPnL:
          isFiniteNumber(
            record
              ?.realizedPnL,
          )
            ? Number(
                record
                  .realizedPnL,
              )
            : null,

        realizedR: (() => {
  const value =
    record?.realizedR ??
    record?.finalR ??
    record?.rMultiple ??
    null;

  return isFiniteNumber(
    value,
  )
    ? Number(value)
    : null;
})(),

        closedAt:
          historicalClosedAt,

        similarity:
          comparison
            .similarity,

        similarityPercent:
          comparison
            .similarityPercent,

        coverage:
          comparison
            .coverage,

        sameSymbol:
          comparison
            .sameSymbol,

        components:
          comparison
            .components,
      });
    }

    matches.sort(
      (left, right) => {
        const similarityDifference =
          Number(
            right
              ?.similarity ??
            0,
          ) -
          Number(
            left
              ?.similarity ??
            0,
          );

        if (
          similarityDifference !==
          0
        ) {
          return similarityDifference;
        }

        const rightTime =
          new Date(
            right
              ?.closedAt ??
            0,
          ).getTime();

        const leftTime =
          new Date(
            left
              ?.closedAt ??
            0,
          ).getTime();

        return (
          (
            Number.isFinite(
              rightTime,
            )
              ? rightTime
              : 0
          ) -
          (
            Number.isFinite(
              leftTime,
            )
              ? leftTime
              : 0
          )
        );
      },
    );

    const limitedMatches =
      matches.slice(
        0,
        Math.max(
          0,
          Number(
            mergedConfig
              .maximumMatches,
          ) || 10,
        ),
      );

    return {
      approved: true,

      status:
        limitedMatches.length >
        0
          ? TRADE_SIMILARITY_STATUS
              .COMPLETE
          : TRADE_SIMILARITY_STATUS
              .NO_MATCHES,

      candidateSymbol,

      candidateSide,

      evaluatedTrades,

      qualifyingTrades:
        matches.length,

      returnedMatches:
        limitedMatches.length,

      matches:
        limitedMatches,

      bestMatch:
        limitedMatches[0] ??
        null,

      reasons:
        limitedMatches.length >
        0
          ? [
              `${limitedMatches.length} historical analogue(s) returned.`,
            ]
          : [
              "No historical trades satisfied the configured similarity threshold.",
            ],

      warnings: [],

      errors: [],
    };
  } catch (error) {
    return {
      approved: false,

      status:
        TRADE_SIMILARITY_STATUS
          .ERROR,

      matches: [],

      evaluatedTrades: 0,

      qualifyingTrades: 0,

      reasons: [],

      warnings: [],

      errors: [
        error?.message ??
          "Unknown historical analogue search error.",
      ],
    };
  }
}

export default
  findHistoricalAnalogues;