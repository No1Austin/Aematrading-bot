/**
 * ============================================================
 * AEMA CRYPTO
 * OPPORTUNITY RANKING ENGINE
 * Phase 6.20
 * ============================================================
 *
 * Purpose:
 * - rank Qualification-1-approved assets for research priority
 * - support canonical measurement field names
 * - score LONG and SHORT opportunity independently
 * - never grant trade or execution authority
 * - never manufacture directional opportunity from missing evidence
 *
 * Ranking is NOT Qualification 2 and is NOT a trade signal.
 */

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, minimum = 0, maximum = 100) {
  const number = finiteOrNull(value);
  if (number === null) return null;
  return Math.min(maximum, Math.max(minimum, number));
}

function firstFinite(...values) {
  for (const value of values) {
    const number = finiteOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function measurement(candidate, ...keys) {
  for (const key of keys) {
    const value = firstFinite(
      candidate?.measurements?.[key],
      candidate?.[key],
    );

    if (value !== null) return value;
  }

  return null;
}

/**
 * Convert absolute percentage movement to directional strength.
 *
 * LONG and SHORT are intentionally independent:
 * - positive movement contributes only to LONG support
 * - negative movement contributes only to SHORT support
 * - zero contributes to neither
 *
 * We do NOT create a neutral 50 baseline and do NOT calculate
 * SHORT as 100 - LONG.
 */
function directionalObservation({
  source,
  value,
  fullScalePercent,
  weight,
}) {
  const change = finiteOrNull(value);

  if (change === null) {
    return {
      source,
      available: false,
      weight,
      changePercent: null,
      longSupport: null,
      shortSupport: null,
    };
  }

  const scale = Math.max(
    0.000001,
    Number(fullScalePercent) || 1,
  );

  const longSupport =
    clamp(
      change > 0
        ? (change / scale) * 100
        : 0,
    );

  const shortSupport =
    clamp(
      change < 0
        ? (Math.abs(change) / scale) * 100
        : 0,
    );

  return {
    source,
    available: true,
    weight,
    changePercent: change,
    longSupport,
    shortSupport,
  };
}

function aggregateDirectionalObservations(observations) {
  let availableWeight = 0;
  let longTotal = 0;
  let shortTotal = 0;

  for (const observation of observations) {
    if (observation?.available !== true) {
      continue;
    }

    const longSupport =
      finiteOrNull(observation?.longSupport);

    const shortSupport =
      finiteOrNull(observation?.shortSupport);

    if (longSupport === null || shortSupport === null) {
      continue;
    }

    availableWeight += observation.weight;
    longTotal += longSupport * observation.weight;
    shortTotal += shortSupport * observation.weight;
  }

  if (availableWeight <= 0) {
    return {
      available: false,
      longOpportunityScore: null,
      shortOpportunityScore: null,
      directionEdge: null,
      preferredDirection: "NEUTRAL",
      coverage: 0,
      observations,
    };
  }

  const longOpportunityScore =
    clamp(longTotal / availableWeight);

  const shortOpportunityScore =
    clamp(shortTotal / availableWeight);

  const directionEdge =
    Math.abs(
      longOpportunityScore -
      shortOpportunityScore,
    );

  let preferredDirection = "NEUTRAL";

  if (longOpportunityScore > shortOpportunityScore) {
    preferredDirection = "LONG";
  } else if (shortOpportunityScore > longOpportunityScore) {
    preferredDirection = "SHORT";
  }

  return {
    available: true,

    longOpportunityScore:
      Number(longOpportunityScore.toFixed(4)),

    shortOpportunityScore:
      Number(shortOpportunityScore.toFixed(4)),

    directionEdge:
      Number(directionEdge.toFixed(4)),

    preferredDirection,

    coverage:
      Number((availableWeight * 100).toFixed(2)),

    observations,
  };
}

/**
 * Cheap, already-collected directional evidence only.
 *
 * 1h  = 20%
 * 4h  = 35%
 * 24h = 45%
 *
 * Missing horizons are excluded and available weights renormalized.
 */
export function rankCryptoOpportunityCandidate(candidate = {}) {
  if (candidate?.qualified !== true) {
    return {
      ...candidate,

      opportunityRanking: {
        available: false,
        status: "QUALIFICATION_1_REQUIRED",
        longOpportunityScore: null,
        shortOpportunityScore: null,
        preferredDirection: "NEUTRAL",
        directionEdge: null,
        coverage: 0,
        qualificationAuthority: false,
        executionAuthority: false,
        liveExecution: false,
      },

      longOpportunityScore: null,
      shortOpportunityScore: null,
      preferredDirection: "NEUTRAL",
      opportunityDirectionEdge: null,
      researchPriorityScore: null,
      researchOnly: true,
      executionAuthority: false,
      liveExecution: false,
    };
  }

  /*
   * Phase 6.20:
   * canonical measurement-provider names come first.
   * Legacy aliases remain accepted for compatibility.
   */
  const change1h =
    measurement(
      candidate,
      "change1hPercent",
      "change1hPct",
      "priceChange1hPercent",
      "priceChange1hPct",
      "change1h",
      "priceChange1h",
    );

  const change4h =
    measurement(
      candidate,
      "change4hPercent",
      "change4hPct",
      "priceChange4hPercent",
      "priceChange4hPct",
      "change4h",
      "priceChange4h",
    );

  const change24h =
    measurement(
      candidate,
      "change24hPercent",
      "change24hPct",
      "priceChange24hPercent",
      "priceChange24hPct",
      "change24h",
      "priceChange24h",
    );

  const observations = [
    directionalObservation({
      source: "PRICE_CHANGE_1H",
      value: change1h,
      fullScalePercent: 6,
      weight: 0.20,
    }),

    directionalObservation({
      source: "PRICE_CHANGE_4H",
      value: change4h,
      fullScalePercent: 12,
      weight: 0.35,
    }),

    directionalObservation({
      source: "PRICE_CHANGE_24H",
      value: change24h,
      fullScalePercent: 20,
      weight: 0.45,
    }),
  ];

  const ranking =
    aggregateDirectionalObservations(observations);

  return {
    ...candidate,

    opportunityRanking: {
      status:
        ranking.available
          ? "RANKED"
          : "DIRECTIONAL_EVIDENCE_UNAVAILABLE",

      ...ranking,

      scoringModel:
        "INDEPENDENT_LONG_SHORT_DIRECTIONAL_SUPPORT",

      qualificationAuthority: false,
      executionAuthority: false,
      liveExecution: false,
    },

    longOpportunityScore:
      ranking.longOpportunityScore,

    shortOpportunityScore:
      ranking.shortOpportunityScore,

    preferredDirection:
      ranking.preferredDirection,

    opportunityDirectionEdge:
      ranking.directionEdge,

    researchPriorityScore:
      ranking.available
        ? Math.max(
            ranking.longOpportunityScore,
            ranking.shortOpportunityScore,
          )
        : null,

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export function rankCryptoOpportunities(candidates = []) {
  const ranked =
    (Array.isArray(candidates) ? candidates : [])
      .map(rankCryptoOpportunityCandidate);

  const eligible =
    ranked.filter(
      candidate =>
        candidate?.opportunityRanking?.available === true,
    );

  const longRanked =
    [...eligible]
      .sort(
        (a, b) =>
          (
            finiteOrNull(b?.longOpportunityScore) ?? -1
          ) -
          (
            finiteOrNull(a?.longOpportunityScore) ?? -1
          ) ||
          (
            finiteOrNull(b?.opportunityRanking?.coverage) ?? 0
          ) -
          (
            finiteOrNull(a?.opportunityRanking?.coverage) ?? 0
          ),
      )
      .map((candidate, index) => ({
        ...candidate,
        longRank: index + 1,
      }));

  const shortRanked =
    [...eligible]
      .sort(
        (a, b) =>
          (
            finiteOrNull(b?.shortOpportunityScore) ?? -1
          ) -
          (
            finiteOrNull(a?.shortOpportunityScore) ?? -1
          ) ||
          (
            finiteOrNull(b?.opportunityRanking?.coverage) ?? 0
          ) -
          (
            finiteOrNull(a?.opportunityRanking?.coverage) ?? 0
          ),
      )
      .map((candidate, index) => ({
        ...candidate,
        shortRank: index + 1,
      }));

  return {
    ranked,
    longRanked,
    shortRanked,

    unavailable:
      ranked.filter(
        candidate =>
          candidate?.opportunityRanking?.available !== true,
      ),

    scoringModel:
      "INDEPENDENT_LONG_SHORT_DIRECTIONAL_SUPPORT",

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export default rankCryptoOpportunities;
