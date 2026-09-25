/**
 * AEMA CRYPTO — VALUATION / MARKET-CAP SCALER
 * Research-depth engine only. Canonical weight: 0%.
 * It never grants execution authority and never changes the 20/20/60 score.
 */

const MULTIPLIERS = Object.freeze([1, 1.5, 2, 3, 5, 10]);

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function round(value, digits = 8) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function firstFinite(...values) {
  for (const value of values) {
    const n = finite(value);
    if (n !== null) return n;
  }
  return null;
}

function classifyDilution(circulatingSupply, totalSupply, marketCap, fdv) {
  let circulatingPercent = null;
  if (circulatingSupply !== null && totalSupply !== null && totalSupply > 0) {
    circulatingPercent = (circulatingSupply / totalSupply) * 100;
  }

  let fdvToMarketCap = null;
  if (fdv !== null && marketCap !== null && marketCap > 0) {
    fdvToMarketCap = fdv / marketCap;
  }

  let risk = "UNKNOWN";
  if (circulatingPercent !== null || fdvToMarketCap !== null) {
    if ((circulatingPercent !== null && circulatingPercent >= 80) || (fdvToMarketCap !== null && fdvToMarketCap <= 1.25)) risk = "LOW";
    else if ((circulatingPercent !== null && circulatingPercent >= 50) || (fdvToMarketCap !== null && fdvToMarketCap <= 2)) risk = "MODERATE";
    else risk = "HIGH";
  }

  return {
    circulatingPercent: circulatingPercent === null ? null : round(circulatingPercent, 2),
    fdvToMarketCap: fdvToMarketCap === null ? null : round(fdvToMarketCap, 3),
    risk,
  };
}

function scenarioFeasibility({ multiplier, requiredMarketCap, volumeToMarketCap, dilutionRisk }) {
  // This is a valuation-feasibility heuristic, NOT a probability of future price appreciation.
  if (requiredMarketCap === null) return "INSUFFICIENT_DATA";

  let score = 50;
  if (multiplier <= 2) score += 15;
  else if (multiplier <= 3) score += 5;
  else if (multiplier >= 10) score -= 20;
  else if (multiplier >= 5) score -= 10;

  if (requiredMarketCap >= 1e12) score -= 30;
  else if (requiredMarketCap >= 250e9) score -= 20;
  else if (requiredMarketCap >= 50e9) score -= 10;
  else if (requiredMarketCap < 1e9) score += 5;

  if (volumeToMarketCap !== null) {
    if (volumeToMarketCap >= 0.10) score += 10;
    else if (volumeToMarketCap < 0.01) score -= 10;
  }

  if (dilutionRisk === "LOW") score += 10;
  if (dilutionRisk === "HIGH") score -= 15;

  if (score >= 70) return "HIGH";
  if (score >= 45) return "MODERATE";
  return "LOW";
}

export default async function runCryptoValuationEngine(context = {}) {
  const asset = context?.asset ?? context ?? {};

  const priceUsd = firstFinite(asset?.priceUsd, asset?.price, context?.priceUsd, context?.price);
  const circulatingSupply = firstFinite(asset?.circulatingSupply, asset?.circulating_supply);
  const totalSupply = firstFinite(asset?.totalSupply, asset?.total_supply);
  const maxSupply = firstFinite(asset?.maxSupply, asset?.max_supply);
  const volume24hUsd = firstFinite(asset?.volume24hUsd, asset?.totalVolumeUsd, asset?.volume24h);

  let marketCapUsd = firstFinite(asset?.marketCapUsd, asset?.marketCap, asset?.market_cap);
  if (marketCapUsd === null && priceUsd !== null && circulatingSupply !== null) {
    marketCapUsd = priceUsd * circulatingSupply;
  }

  let fdvUsd = firstFinite(asset?.fdvUsd, asset?.fullyDilutedValuationUsd, asset?.fully_diluted_valuation);
  if (fdvUsd === null && priceUsd !== null) {
    const supplyForFdv = maxSupply ?? totalSupply;
    if (supplyForFdv !== null) fdvUsd = priceUsd * supplyForFdv;
  }

  const available = priceUsd !== null && marketCapUsd !== null && marketCapUsd > 0;
  if (!available) {
    return {
      approved: true,
      status: "EVIDENCE_UNAVAILABLE",
      engine: "CRYPTO_VALUATION",
      role: "RESEARCH_DEPTH",
      canonicalWeight: 0,
      affectsCanonicalScore: false,
      availability: { available: false, reason: "PRICE_OR_MARKET_CAP_UNAVAILABLE", evidenceCount: 0 },
      current: { priceUsd, marketCapUsd, fdvUsd, volume24hUsd, circulatingSupply, totalSupply, maxSupply },
      scenarios: [],
      warnings: ["PRICE_OR_MARKET_CAP_UNAVAILABLE"],
      executionAuthority: false,
      liveExecution: false,
    };
  }

  const dilution = classifyDilution(circulatingSupply, totalSupply, marketCapUsd, fdvUsd);
  const volumeToMarketCap = volume24hUsd !== null && marketCapUsd > 0
    ? volume24hUsd / marketCapUsd
    : null;

  const scenarios = MULTIPLIERS.map(multiplier => {
    const impliedPriceUsd = priceUsd * multiplier;
    const requiredMarketCapUsd = marketCapUsd * multiplier;
    const impliedFdvUsd = fdvUsd === null ? null : fdvUsd * multiplier;

    return {
      multiplier,
      impliedPriceUsd: round(impliedPriceUsd),
      requiredMarketCapUsd: round(requiredMarketCapUsd, 2),
      impliedMarketCapIncreaseUsd: round(requiredMarketCapUsd - marketCapUsd, 2),
      impliedFdvUsd: impliedFdvUsd === null ? null : round(impliedFdvUsd, 2),
      feasibility: scenarioFeasibility({
        multiplier,
        requiredMarketCap: requiredMarketCapUsd,
        volumeToMarketCap,
        dilutionRisk: dilution.risk,
      }),
    };
  });

  // Screening signal only. It deliberately does not assert that an asset is intrinsically undervalued.
  const candidateSignals = [];
  if (dilution.risk === "LOW") candidateSignals.push("LOW_DILUTION");
  if (volumeToMarketCap !== null && volumeToMarketCap >= 0.05) candidateSignals.push("HEALTHY_VOLUME_TO_MARKET_CAP");
  if (marketCapUsd < 10e9) candidateSignals.push("NON_MEGA_CAP_VALUATION");

  const valuationCandidate =
    candidateSignals.includes("LOW_DILUTION") &&
    candidateSignals.includes("HEALTHY_VOLUME_TO_MARKET_CAP");

  return {
    approved: true,
    status: "READY",
    engine: "CRYPTO_VALUATION",
    role: "RESEARCH_DEPTH",
    canonicalWeight: 0,
    affectsCanonicalScore: false,
    availability: { available: true, reason: null, evidenceCount: [priceUsd, marketCapUsd, fdvUsd, volume24hUsd, circulatingSupply, totalSupply, maxSupply].filter(v => v !== null).length },
    current: {
      priceUsd: round(priceUsd),
      marketCapUsd: round(marketCapUsd, 2),
      fdvUsd: fdvUsd === null ? null : round(fdvUsd, 2),
      volume24hUsd: volume24hUsd === null ? null : round(volume24hUsd, 2),
      circulatingSupply,
      totalSupply,
      maxSupply,
      marketCapRank: firstFinite(asset?.marketCapRank, asset?.market_cap_rank),
      volumeToMarketCap: volumeToMarketCap === null ? null : round(volumeToMarketCap, 4),
    },
    dilution,
    scenarios,
    screening: {
      valuationCandidate,
      label: valuationCandidate ? "RELATIVE_VALUE_CANDIDATE" : "NOT_FLAGGED",
      signals: candidateSignals,
      note: "Screening signal only; peer/category evidence is required before describing an asset as undervalued.",
    },
    methodology: {
      priceFormula: "IMPLIED_PRICE = CURRENT_PRICE × MULTIPLIER",
      marketCapFormula: "REQUIRED_MARKET_CAP = CURRENT_MARKET_CAP × MULTIPLIER",
      capitalFlowWarning: "Market-cap increase is an implied valuation change, not the amount of cash that must enter the asset.",
      feasibilityIsProbability: false,
    },
    executionAuthority: false,
    liveExecution: false,
  };
}
