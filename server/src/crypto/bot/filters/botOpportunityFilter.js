/**
 * Phase 1 — Cheap comparative FUTURES opportunity filter.
 *
 * Objective:
 * Reduce the hard-eligible perpetual futures universe to the TOP 20
 * candidates worth spending deeper research resources on.
 *
 * Uses:
 * - 24h turnover
 * - spread/liquidity
 * - 24h range
 * - price movement
 * - open-interest value
 *
 * IMPORTANT:
 * - No fixed "75 = trade" threshold.
 * - This is comparative ranking only.
 * - No BULL/BEAR decision.
 * - No setup generation.
 * - No execution authority.
 */
import BOT_CONFIG from "../config/botConfig.js";

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function number(value, fallback = 0) {
  const n = finiteOrNull(value);
  return n === null ? fallback : n;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function logNormalize(value, floor, ceiling) {
  const parsed = finiteOrNull(value);

  if (parsed === null || parsed <= 0) {
    return null;
  }

  const v = Math.max(parsed, 0);

  if (v <= floor) return 0;
  if (v >= ceiling) return 1;

  const a = Math.log10(Math.max(floor, 1));
  const b = Math.log10(Math.max(ceiling, floor + 1));
  const x = Math.log10(Math.max(v, 1));

  return clamp01((x - a) / (b - a));
}

function linearNormalize(value, floor, ceiling) {
  const parsed = finiteOrNull(value);

  if (parsed === null) {
    return null;
  }

  if (parsed <= floor) return 0;
  if (parsed >= ceiling) return 1;

  return clamp01(
    (parsed - floor) / (ceiling - floor)
  );
}

function spreadQuality(spreadPercent) {
  const spread = finiteOrNull(spreadPercent);

  if (spread === null) {
    return null;
  }

  if (spread <= 0.02) return 1;
  if (spread >= 0.50) return 0;

  return clamp01(
    1 - (spread - 0.02) / 0.48
  );
}

/**
 * Weighted score using only dimensions that actually have evidence.
 *
 * This prevents unavailable evidence from silently becoming zero
 * and unfairly reducing an instrument's score.
 */
function weightedAvailableScore(dimensions, weights) {
  let weightedScore = 0;
  let availableWeight = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = dimensions[key];

    if (!Number.isFinite(value)) {
      continue;
    }

    weightedScore += value * weight;
    availableWeight += weight;
  }

  if (availableWeight <= 0) {
    return {
      score01: 0,
      availableWeight: 0,
    };
  }

  return {
    score01: weightedScore / availableWeight,
    availableWeight,
  };
}

export function scoreBotOpportunity(asset, options = {}) {
  const config = {
    ...BOT_CONFIG.opportunity,
    ...options,

    weights: {
      ...BOT_CONFIG.opportunity.weights,
      ...(options.weights ?? {}),
    },
  };

  const market = asset?.market ?? {};

  const quoteVolume = finiteOrNull(
    market.quoteVolume
  );

  const priceChangePercent = finiteOrNull(
    market.priceChangePercent
  );

  const absoluteChange =
    priceChangePercent === null
      ? null
      : Math.abs(priceChangePercent);

  const rangePercentRaw = finiteOrNull(
    market.rangePercent
  );

  const rangePercent =
    rangePercentRaw === null
      ? null
      : Math.abs(rangePercentRaw);

  const spreadPercent = finiteOrNull(
    market.spreadPercent
  );

  const openInterestValue = finiteOrNull(
    market.openInterestValue
  );

  /*
   * FUTURES OPPORTUNITY DIMENSIONS
   *
   * participation replaces the previous trade-count activity metric.
   * It measures how much notional open interest exists in the
   * perpetual contract.
   */
  const dimensions = {
    volume: logNormalize(
      quoteVolume,
      1_000_000,
      5_000_000_000
    ),

    liquidity: spreadQuality(
      spreadPercent
    ),

    volatility: linearNormalize(
      rangePercent,
      0.5,
      15
    ),

    momentum: linearNormalize(
      absoluteChange,
      0.25,
      15
    ),

    participation: logNormalize(
      openInterestValue,
      500_000,
      5_000_000_000
    ),
  };

  /*
   * Keep compatibility with the existing BOT_CONFIG where the
   * fifth weight is still named "activity".
   *
   * We use that weight for futures participation/OI instead.
   */
  const scoringWeights = {
    volume: number(config.weights.volume),
    liquidity: number(config.weights.liquidity),
    volatility: number(config.weights.volatility),
    momentum: number(config.weights.momentum),

    participation: number(
      config.weights.participation ??
      config.weights.activity
    ),
  };

  const {
    score01,
    availableWeight,
  } = weightedAvailableScore(
    dimensions,
    scoringWeights
  );

  const blockers = [];

  if (
    quoteVolume === null ||
    quoteVolume < config.minimumQuoteVolumeUsd
  ) {
    blockers.push(
      "QUOTE_VOLUME_BELOW_OPPORTUNITY_MINIMUM"
    );
  }

  if (
    absoluteChange === null
  ) {
    blockers.push(
      "PRICE_CHANGE_UNAVAILABLE"
    );
  } else if (
    absoluteChange <
    config.minimumAbsoluteChangePercent
  ) {
    blockers.push(
      "MOVEMENT_BELOW_OPPORTUNITY_MINIMUM"
    );
  }

  return {
    symbol: asset?.symbol ?? null,

    qualified: blockers.length === 0,

    opportunityScore: Number(
      (score01 * 100).toFixed(4)
    ),

    dimensions,

    availableWeight: Number(
      availableWeight.toFixed(4)
    ),

    evidence: {
      quoteVolume,
      absoluteChangePercent: absoluteChange,
      rangePercent,
      spreadPercent,
      openInterest: finiteOrNull(
        market.openInterest
      ),
      openInterestValue,
      fundingRate: finiteOrNull(
        market.fundingRate
      ),
      markPrice: finiteOrNull(
        market.markPrice
      ),
      indexPrice: finiteOrNull(
        market.indexPrice
      ),
    },

    blockers,

    executionAuthority: false,
    liveExecution: false,
  };
}

export function rankBotOpportunities(
  assets = [],
  options = {}
) {
  const topN = Number(
    options.topN ??
    BOT_CONFIG.opportunity.topN
  );

  const evaluated = assets
    .map((asset) => ({
      asset,
      opportunity: scoreBotOpportunity(
        asset,
        options
      ),
    }))
    .sort(
      (a, b) =>
        b.opportunity.opportunityScore -
        a.opportunity.opportunityScore
    );

  const qualified = evaluated.filter(
    (row) => row.opportunity.qualified
  );

  return {
    evaluated,
    qualified,

    topCandidates: qualified.slice(
      0,
      topN
    ),

    topN,

    executionAuthority: false,
    liveExecution: false,
  };
}

export default rankBotOpportunities;