/**
 * Phase 1 — Hard market eligibility.
 *
 * This stage answers only:
 * "Can this instrument participate in the bot pipeline?"
 *
 * It does NOT rank opportunities and does NOT decide LONG/SHORT.
 */
import BOT_CONFIG from "../config/botConfig.js";
import { assessSmartMarketQuality, buildMarketQualityContext } from "./botSmartMarketQuality.js";

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function evaluateBotHardEligibility(asset, options = {}) {
  const config = {
    ...BOT_CONFIG.eligibility,
    ...options,
  };

  const blockers = [];
  const market = asset?.market ?? {};

  if (!asset?.symbol) blockers.push("MISSING_SYMBOL");

  if (
    config.requireTradingStatus &&
    String(asset?.status || "").toUpperCase() !== "TRADING"
  ) {
    blockers.push("INSTRUMENT_NOT_TRADING");
  }

  if (
    config.requirePerpetual &&
    String(asset?.contractType || "").toUpperCase() !== "PERPETUAL"
  ) {
    blockers.push("NOT_PERPETUAL_FUTURES");
  }

  // Research-only CEX discovery may use spot instruments. Never relabel spot as futures.
  if (!config.requirePerpetual && !["SPOT", "PERPETUAL"].includes(String(asset?.contractType || "").toUpperCase())) {
    blockers.push("UNSUPPORTED_RESEARCH_INSTRUMENT");
  }

  if (
    config.requireValidPrice &&
    !(positive(market.price) > config.minimumPrice)
  ) {
    blockers.push("INVALID_PRICE");
  }

  if (config.requireMarketData) {
    if (positive(market.quoteVolume) === null) {
      blockers.push("MISSING_QUOTE_VOLUME");
    }

    if (!Number.isFinite(Number(market.priceChangePercent))) {
      blockers.push("MISSING_PRICE_CHANGE");
    }
  }

  // Dynamic pairlist is shadow-only by default: measure exclusions first.
  const dynamic = config.dynamicPairlist ?? {};
  const pairlistWarnings = [];
  if (dynamic.enabled) {
    const volume = positive(market.quoteVolume);
    const spread = market.spreadPercent == null ? null : Number(market.spreadPercent);
    const range = market.rangePercent == null ? null : Number(market.rangePercent);
    const tick = positive(asset?.priceTick);
    const price = positive(market.price);
    const parseTime = value => {
      if (value == null || value === "") return null;
      const n = Number(value);
      const ms = Number.isFinite(n) ? n * (n < 1e12 ? 1000 : 1) : Date.parse(String(value));
      return Number.isFinite(ms) ? ms : null;
    };
    const listingMs = parseTime(asset?.listingTime);
    const ageDays = listingMs == null ? null : (Date.now() - listingMs) / 86400000;
    const delistMs = parseTime(asset?.delistingTime);
    if (dynamic.minimumQuoteVolumeUsd > 0 && (volume === null || volume < dynamic.minimumQuoteVolumeUsd))
      pairlistWarnings.push("PAIRLIST_VOLUME_BELOW_MINIMUM");
    if (dynamic.maximumSpreadPercent != null && spread !== null && Number.isFinite(spread) && spread >= 0 && spread > dynamic.maximumSpreadPercent)
      pairlistWarnings.push("PAIRLIST_SPREAD_TOO_WIDE");
    if (dynamic.minimumMarketAgeDays > 0 && ageDays !== null && ageDays < dynamic.minimumMarketAgeDays)
      pairlistWarnings.push("PAIRLIST_MARKET_TOO_NEW");
    if (dynamic.minimumPriceTicks > 0 && tick !== null && price !== null && price / tick < dynamic.minimumPriceTicks)
      pairlistWarnings.push("PAIRLIST_INSUFFICIENT_PRICE_PRECISION");
    if (dynamic.maximumRangePercent24h != null && range !== null && Number.isFinite(range) && range > dynamic.maximumRangePercent24h)
      pairlistWarnings.push("PAIRLIST_EXCESSIVE_24H_RANGE");
    if (dynamic.excludeDelisting && delistMs !== null && delistMs > 0)
      pairlistWarnings.push("PAIRLIST_DELISTING_SCHEDULED");
    if (dynamic.enforce) blockers.push(...pairlistWarnings);
  }

  const smartConfig = config.smartMarketQuality ?? {};
  const smartQuality = smartConfig.enabled === false ? null : assessSmartMarketQuality(asset, options.marketQualityContext ?? {}, smartConfig, options.now ?? Date.now());
  // Smart classification is deliberately advisory. Never turn OBSERVE into a
  // hard reject or waive existing hard safety checks to meet a quota.
  const approved = blockers.length === 0;

  return {
    approved,
    status: approved ? "HARD_ELIGIBLE" : "HARD_INELIGIBLE",
    symbol: asset?.symbol ?? null,
    blockers,
    pairlistWarnings,
    smartQuality,
    pairlistMode: dynamic.enabled ? (dynamic.enforce ? "ENFORCED" : "SHADOW") : "DISABLED",
    evidence: {
      status: asset?.status ?? null,
      contractType: asset?.contractType ?? null,
      price: market.price ?? null,
      quoteVolume: market.quoteVolume ?? null,
      priceChangePercent: market.priceChangePercent ?? null,
    },
    executionAuthority: false,
    liveExecution: false,
  };
}

export function filterBotHardEligibleAssets(assets = [], options = {}) {
  const marketQualityContext = buildMarketQualityContext(assets);
  const evaluations = assets.map((asset) => ({
    asset,
    eligibility: evaluateBotHardEligibility(asset, {...options, marketQualityContext}),
  }));

  const qualityCounts = { READY: 0, EMERGING: 0, OBSERVE: 0, EXCLUDE: 0, DISABLED: 0 };
  for (const row of evaluations) qualityCounts[row.eligibility.smartQuality?.status ?? "DISABLED"]++;
  return {
    marketQualityContext,
    qualityCounts,
    evaluations,
    approved: evaluations
      .filter((row) => row.eligibility.approved)
      .map((row) => row.asset),
    rejected: evaluations.filter((row) => !row.eligibility.approved),
  };
}

export default filterBotHardEligibleAssets;
