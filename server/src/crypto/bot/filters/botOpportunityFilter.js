/**
 * Phase 1 — Cheap comparative opportunity filter.
 *
 * Objective:
 * Reduce the hard-eligible futures universe to the TOP 20 candidates
 * worth spending deeper research resources on.
 *
 * IMPORTANT:
 * - No fixed "75 = trade" threshold.
 * - This is comparative ranking.
 * - No LONG/SHORT decision.
 * - No execution authority.
 */
import BOT_CONFIG from "../config/botConfig.js";

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function logNormalize(value, floor, ceiling) {
  const v = Math.max(number(value), 0);
  if (v <= floor) return 0;
  if (v >= ceiling) return 1;

  const a = Math.log10(Math.max(floor, 1));
  const b = Math.log10(Math.max(ceiling, floor + 1));
  const x = Math.log10(Math.max(v, 1));
  return clamp01((x - a) / (b - a));
}

function linearNormalize(value, floor, ceiling) {
  const v = number(value);
  if (v <= floor) return 0;
  if (v >= ceiling) return 1;
  return clamp01((v - floor) / (ceiling - floor));
}

function spreadQuality(spreadPercent) {
  const spread = number(spreadPercent, Number.POSITIVE_INFINITY);
  if (!Number.isFinite(spread)) return 0;
  if (spread <= 0.02) return 1;
  if (spread >= 0.50) return 0;
  return clamp01(1 - (spread - 0.02) / 0.48);
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
  const quoteVolume = number(market.quoteVolume);
  const absoluteChange = Math.abs(number(market.priceChangePercent));
  const rangePercent = Math.abs(number(market.rangePercent));
  const tradeCount = number(market.tradeCount24h);
  const spreadPercent = market.spreadPercent;

  const dimensions = {
    volume: logNormalize(quoteVolume, 1_000_000, 5_000_000_000),
    liquidity: spreadQuality(spreadPercent),
    volatility: linearNormalize(rangePercent, 0.5, 15),
    momentum: linearNormalize(absoluteChange, 0.25, 15),
    activity: logNormalize(tradeCount, 1_000, 5_000_000),
  };

  const score01 =
    dimensions.volume * config.weights.volume +
    dimensions.liquidity * config.weights.liquidity +
    dimensions.volatility * config.weights.volatility +
    dimensions.momentum * config.weights.momentum +
    dimensions.activity * config.weights.activity;

  const blockers = [];

  if (quoteVolume < config.minimumQuoteVolumeUsd) {
    blockers.push("QUOTE_VOLUME_BELOW_OPPORTUNITY_MINIMUM");
  }

  if (absoluteChange < config.minimumAbsoluteChangePercent) {
    blockers.push("MOVEMENT_BELOW_OPPORTUNITY_MINIMUM");
  }

  return {
    symbol: asset?.symbol ?? null,
    qualified: blockers.length === 0,
    opportunityScore: Number((score01 * 100).toFixed(4)),
    dimensions,
    evidence: {
      quoteVolume,
      absoluteChangePercent: absoluteChange,
      rangePercent,
      tradeCount24h: tradeCount,
      spreadPercent: Number.isFinite(Number(spreadPercent))
        ? Number(spreadPercent)
        : null,
    },
    blockers,
    executionAuthority: false,
    liveExecution: false,
  };
}

export function rankBotOpportunities(assets = [], options = {}) {
  const topN = Number(options.topN ?? BOT_CONFIG.opportunity.topN);

  const evaluated = assets
    .map((asset) => ({
      asset,
      opportunity: scoreBotOpportunity(asset, options),
    }))
    .sort(
      (a, b) =>
        b.opportunity.opportunityScore -
        a.opportunity.opportunityScore
    );

  const qualified = evaluated.filter((row) => row.opportunity.qualified);

  return {
    evaluated,
    qualified,
    topCandidates: qualified.slice(0, topN),
    topN,
    executionAuthority: false,
    liveExecution: false,
  };
}

export default rankBotOpportunities;
