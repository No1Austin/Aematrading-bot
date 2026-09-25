/**
 * Phase 1 — Hard market eligibility.
 *
 * This stage answers only:
 * "Can this instrument participate in the bot pipeline?"
 *
 * It does NOT rank opportunities and does NOT decide LONG/SHORT.
 */
import BOT_CONFIG from "../config/botConfig.js";

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

  const approved = blockers.length === 0;

  return {
    approved,
    status: approved ? "HARD_ELIGIBLE" : "HARD_INELIGIBLE",
    symbol: asset?.symbol ?? null,
    blockers,
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
  const evaluations = assets.map((asset) => ({
    asset,
    eligibility: evaluateBotHardEligibility(asset, options),
  }));

  return {
    evaluations,
    approved: evaluations
      .filter((row) => row.eligibility.approved)
      .map((row) => row.asset),
    rejected: evaluations.filter((row) => !row.eligibility.approved),
  };
}

export default filterBotHardEligibleAssets;
