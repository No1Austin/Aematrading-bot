import { TRADE_SIDE } from "../config/riskConfig.js";

/**
 * ============================================================
 * CROSS-ENGINE CONSENSUS ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Measure agreement between independent analysis engines.
 *
 * This module DOES NOT calculate the final 100-point trade score.
 * Final opportunity scoring belongs to the trade scoring layer.
 *
 * Expected inputs:
 * - technical
 * - macro
 * - marketRegime
 * - country
 * - company
 * - events
 * - social
 * - institutional (optional; included only when supplied)
 * - historical
 * - liquidity
 * - riskReward
 */

export const CONSENSUS_DIRECTION = Object.freeze({
  LONG: "LONG",
  SHORT: "SHORT",
  NEUTRAL: "NEUTRAL",
  CONFLICTED: "CONFLICTED",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});

export const DEFAULT_CONSENSUS_CONFIG = Object.freeze({
  minimumEngines: 4,
  minimumCoverage: 0.4,
  directionalThreshold: 0.58,
  minimumDirectionalEdge: 0.12,
  conflictThreshold: 0.42,

  // These are consensus influence weights, NOT final trade-score points.
  weights: Object.freeze({
    technical: 1.25,
    macro: 1.0,
    marketRegime: 1.25,
    country: 0.75,
    company: 1.0,
    events: 1.0,
    social: 0.5,
    institutional: 0.75,
    historical: 0.75,
    liquidity: 0.5,
    riskReward: 1.0,
  }),
});

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function clamp(value, min = 0, max = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function round(value, decimals = 4) {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizeDirection(value) {
  const direction = String(value ?? "").trim().toUpperCase();

  if (["LONG", "BUY", "BULL", "BULLISH", "STRONG_BULL", "STRONG_BULLISH"].includes(direction)) {
    return CONSENSUS_DIRECTION.LONG;
  }

  if (["SHORT", "SELL", "BEAR", "BEARISH", "STRONG_BEAR", "STRONG_BEARISH"].includes(direction)) {
    return CONSENSUS_DIRECTION.SHORT;
  }

  if (["NEUTRAL", "SIDEWAYS", "MIXED", "NONE"].includes(direction)) {
    return CONSENSUS_DIRECTION.NEUTRAL;
  }

  return null;
}

function supportFromDirection(direction, confidence = 0.65) {
  const normalized = normalizeDirection(direction);
  const strength = clamp(isFiniteNumber(confidence) ? confidence : 0.65);
  const edge = strength * 0.5;

  if (normalized === CONSENSUS_DIRECTION.LONG) {
    return { long: 0.5 + edge, short: 0.5 - edge };
  }

  if (normalized === CONSENSUS_DIRECTION.SHORT) {
    return { long: 0.5 - edge, short: 0.5 + edge };
  }

  if (normalized === CONSENSUS_DIRECTION.NEUTRAL) {
    return { long: 0.5, short: 0.5 };
  }

  return null;
}

function extractDirectionalSupport(result) {
  if (!result || result.approved === false || result.status === "ERROR") {
    return null;
  }

  const long = result?.directionalSupport?.long;
  const short = result?.directionalSupport?.short;

  if (isFiniteNumber(long) && isFiniteNumber(short)) {
    const l = clamp(long);
    const s = clamp(short);
    const total = l + s;

    if (total > 0) {
      return { long: l / total, short: s / total };
    }
  }

  const direction =
    result.direction ??
    result.preferredSide ??
    result.bias?.direction ??
    result.trend?.direction ??
    result.signal ??
    null;

  const confidence =
    result.confidence ??
    result.qualityScore ??
    result.score ??
    null;

  return supportFromDirection(direction, confidence);
}

function buildEvidence(name, result, weight) {
  const support = extractDirectionalSupport(result);

  if (!support) {
    return {
      name,
      available: false,
      weight,
      status: result?.status ?? "UNAVAILABLE",
      approved: result?.approved ?? false,
      direction: null,
      confidence: 0,
      directionalSupport: null,
    };
  }

  const edge = support.long - support.short;
  const direction =
    edge > 0.08
      ? CONSENSUS_DIRECTION.LONG
      : edge < -0.08
        ? CONSENSUS_DIRECTION.SHORT
        : CONSENSUS_DIRECTION.NEUTRAL;

  return {
    name,
    available: true,
    weight,
    status: result?.status ?? "COMPLETE",
    approved: result?.approved !== false,
    direction,
    confidence: round(Math.abs(edge), 4),
    directionalSupport: {
      long: round(support.long, 4),
      short: round(support.short, 4),
    },
  };
}

function determineDirection({ longSupport, shortSupport, config }) {
  const edge = longSupport - shortSupport;

  if (
    longSupport >= config.conflictThreshold &&
    shortSupport >= config.conflictThreshold &&
    Math.abs(edge) < config.minimumDirectionalEdge
  ) {
    return CONSENSUS_DIRECTION.CONFLICTED;
  }

  if (
    longSupport >= config.directionalThreshold &&
    edge >= config.minimumDirectionalEdge
  ) {
    return CONSENSUS_DIRECTION.LONG;
  }

  if (
    shortSupport >= config.directionalThreshold &&
    -edge >= config.minimumDirectionalEdge
  ) {
    return CONSENSUS_DIRECTION.SHORT;
  }

  return CONSENSUS_DIRECTION.NEUTRAL;
}

export function analyzeCrossEngineConsensus({
  technical = null,
  macro = null,
  marketRegime = null,
  country = null,
  company = null,
  events = null,
  social = null,
  institutional = null,
  historical = null,
  liquidity = null,
  riskReward = null,
  config = DEFAULT_CONSENSUS_CONFIG,
} = {}) {
  try {
    const weights = {
      ...DEFAULT_CONSENSUS_CONFIG.weights,
      ...(config?.weights ?? {}),
    };

    const effectiveConfig = {
      ...DEFAULT_CONSENSUS_CONFIG,
      ...config,
      weights,
    };

    const evidence = [
      buildEvidence("TECHNICAL", technical, weights.technical),
      buildEvidence("MACRO", macro, weights.macro),
      buildEvidence("MARKET_REGIME", marketRegime, weights.marketRegime),
      buildEvidence("COUNTRY", country, weights.country),
      buildEvidence("COMPANY", company, weights.company),
      buildEvidence("EVENTS", events, weights.events),
      buildEvidence("SOCIAL", social, weights.social),

      /**
       * Institutional positioning is optional and deliberately bounded.
       *
       * Backward compatibility:
       * - when no institutional result is supplied, the historical
       *   10-engine consensus denominator is preserved exactly;
       * - when supplied, institutional evidence becomes an independent
       *   0.75-weight consensus vote;
       * - it cannot independently authorize a trade and it does not add
       *   points to the 100-point trade-scoring budget.
       */
      ...(institutional !== null && institutional !== undefined
        ? [
            buildEvidence(
              "INSTITUTIONAL",
              institutional,
              weights.institutional,
            ),
          ]
        : []),

      buildEvidence("HISTORICAL", historical, weights.historical),
      buildEvidence("LIQUIDITY", liquidity, weights.liquidity),
      buildEvidence("RISK_REWARD", riskReward, weights.riskReward),
    ];

    const available = evidence.filter((item) => item.available);
    const totalPossibleWeight = evidence.reduce((sum, item) => sum + item.weight, 0);
    const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);
    const coverage = totalPossibleWeight > 0 ? availableWeight / totalPossibleWeight : 0;

    if (
      available.length < effectiveConfig.minimumEngines ||
      coverage < effectiveConfig.minimumCoverage
    ) {
      return {
        approved: false,
        engine: "CROSS_ENGINE_CONSENSUS",
        status: "INSUFFICIENT_DATA",
        direction: CONSENSUS_DIRECTION.INSUFFICIENT_DATA,
        confidence: 0,
        rawScore: 0,
        directionalSupport: { long: 0.5, short: 0.5 },
        coverage: round(coverage, 4),
        availableEngines: available.length,
        totalEngines: evidence.length,
        evidence,
        warnings: [
          `Consensus requires at least ${effectiveConfig.minimumEngines} usable engines and ${round(effectiveConfig.minimumCoverage * 100, 0)}% weighted coverage.`,
        ],
        errors: [],
        summary: "Cross-engine consensus has insufficient independent evidence.",
        timestamp: new Date().toISOString(),
      };
    }

    let weightedLong = 0;
    let weightedShort = 0;

    for (const item of available) {
      weightedLong += item.directionalSupport.long * item.weight;
      weightedShort += item.directionalSupport.short * item.weight;
    }

    const longSupport = availableWeight > 0 ? weightedLong / availableWeight : 0.5;
    const shortSupport = availableWeight > 0 ? weightedShort / availableWeight : 0.5;
    const rawScore = longSupport - shortSupport; // -1 SHORT ... +1 LONG

    const direction = determineDirection({
      longSupport,
      shortSupport,
      config: effectiveConfig,
    });

    const directionalAgreement = Math.abs(rawScore);
    const confidence = clamp(directionalAgreement * coverage);

    const longVotes = available.filter((item) => item.direction === CONSENSUS_DIRECTION.LONG).length;
    const shortVotes = available.filter((item) => item.direction === CONSENSUS_DIRECTION.SHORT).length;
    const neutralVotes = available.filter((item) => item.direction === CONSENSUS_DIRECTION.NEUTRAL).length;

    const warnings = [];

    if (direction === CONSENSUS_DIRECTION.CONFLICTED) {
      warnings.push("Independent engines are materially divided between LONG and SHORT evidence.");
    }

    if (direction === CONSENSUS_DIRECTION.NEUTRAL) {
      warnings.push("No sufficiently strong directional consensus is present.");
    }

    if (coverage < 0.75) {
      warnings.push("Consensus coverage is incomplete; confidence has been reduced.");
    }

    const summary =
      direction === CONSENSUS_DIRECTION.LONG
        ? `Cross-engine evidence favors LONG with ${round(longSupport * 100, 1)}% weighted support.`
        : direction === CONSENSUS_DIRECTION.SHORT
          ? `Cross-engine evidence favors SHORT with ${round(shortSupport * 100, 1)}% weighted support.`
          : direction === CONSENSUS_DIRECTION.CONFLICTED
            ? "Cross-engine evidence is conflicted. No directional consensus should be assumed."
            : "Cross-engine evidence is neutral. No directional consensus should be assumed.";

    return {
      approved: true,
      engine: "CROSS_ENGINE_CONSENSUS",
      status: direction === CONSENSUS_DIRECTION.CONFLICTED ? "CONFLICTED" : "COMPLETE",
      direction,
      confidence: round(confidence, 4),
      rawScore: round(rawScore, 4),
      directionalSupport: {
        long: round(longSupport, 4),
        short: round(shortSupport, 4),
      },
      coverage: round(coverage, 4),
      availableEngines: available.length,
      totalEngines: evidence.length,
      votes: {
        long: longVotes,
        short: shortVotes,
        neutral: neutralVotes,
      },
      evidence,
      warnings,
      errors: [],
      summary,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      approved: false,
      engine: "CROSS_ENGINE_CONSENSUS",
      status: "ERROR",
      direction: CONSENSUS_DIRECTION.INSUFFICIENT_DATA,
      confidence: 0,
      rawScore: 0,
      directionalSupport: { long: 0.5, short: 0.5 },
      coverage: 0,
      availableEngines: 0,
      totalEngines: 10,
      evidence: [],
      warnings: ["Consensus engine failed safely. No directional agreement should be assumed."],
      errors: [error instanceof Error ? error.message : String(error)],
      summary: "Cross-engine consensus failed safely.",
      timestamp: new Date().toISOString(),
    };
  }
}

// Alias retained for compatibility with code that prefers a verb-neutral name.
export const calculateCrossEngineConsensus = analyzeCrossEngineConsensus;

export default analyzeCrossEngineConsensus;
