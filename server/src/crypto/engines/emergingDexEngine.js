/**
 * ============================================================
 * AEMA CRYPTO — EMERGING DEX ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Rank newly discovered DEX assets for deeper research.
 *
 * This engine does NOT predict that a token will "moon".
 * It scores observable early-market conditions and separately
 * reports risk/data-quality concerns.
 *
 * INPUT
 * -----
 * Assets returned by cryptoDexDiscoveryService.discoverDexAssets()
 *
 * OUTPUT
 * ------
 * {
 *   candidates,
 *   topCandidates,
 *   rejected,
 *   summary
 * }
 *
 * PUBLIC RESEARCH TERMINOLOGY
 * ---------------------------
 * Direction: BULL / BEAR / NEUTRAL
 *
 * RESEARCH ONLY — NO EXECUTION AUTHORITY.
 */

const ENGINE_VERSION = "1.0.0";

const DEFAULTS = Object.freeze({
  minimumLiquidityUsd: 5_000,
  minimumTransactions5m: 2,
  minimumTransactions1h: 3,
  maximumPoolAgeHours: 72,
  topLimit: 20,
  minimumEmergingScore: 45,
  minimumDataQualityScore: 35,
});

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function int(value) {
  const n = num(value);
  return n !== null && Number.isInteger(n) ? n : null;
}

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function safeRatio(numerator, denominator) {
  const a = num(numerator);
  const b = num(denominator);
  if (a === null || b === null || b <= 0) return null;
  return a / b;
}

function sumKnown(...values) {
  const known = values.map(num).filter(v => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

function scoreLinear(value, low, high) {
  const n = num(value);
  if (n === null) return null;
  if (high <= low) return 0;
  return clamp(((n - low) / (high - low)) * 100);
}

function scoreLog(value, low, high) {
  const n = num(value);
  if (n === null || n <= 0) return null;
  const lo = Math.log10(Math.max(low, 0.000001));
  const hi = Math.log10(Math.max(high, low + 0.000001));
  return clamp(((Math.log10(n) - lo) / (hi - lo)) * 100);
}

function weightedAverage(parts) {
  let numerator = 0;
  let denominator = 0;

  for (const part of parts) {
    if (part?.score === null || part?.score === undefined) continue;
    const weight = Number(part?.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    numerator += clamp(part.score) * weight;
    denominator += weight;
  }

  return denominator > 0 ? numerator / denominator : null;
}

function activity(asset, window) {
  return {
    buys: int(asset?.[`buys${window}`]),
    sells: int(asset?.[`sells${window}`]),
    transactions: int(asset?.[`transactions${window}`]),
    volumeUsd: num(asset?.[`volume${window}Usd`]),
  };
}

function buyPressureScore(buys, sells) {
  if (buys === null || sells === null) return null;
  const total = buys + sells;
  if (total <= 0) return null;

  const buyShare = buys / total;

  // 50% buys = neutral 50 score.
  return clamp(buyShare * 100);
}

function liquidityScore(asset) {
  return scoreLog(asset?.liquidityUsd, 2_500, 250_000);
}

function activityScore(asset) {
  const a5 = activity(asset, "5m");
  const a1 = activity(asset, "1h");

  const tx5Score = scoreLog(a5.transactions, 2, 150);
  const tx1Score = scoreLog(a1.transactions, 5, 1000);
  const vol5Score = scoreLog(a5.volumeUsd, 100, 50_000);
  const vol1Score = scoreLog(a1.volumeUsd, 500, 250_000);

  return weightedAverage([
    { score: tx5Score, weight: 0.30 },
    { score: tx1Score, weight: 0.20 },
    { score: vol5Score, weight: 0.30 },
    { score: vol1Score, weight: 0.20 },
  ]);
}

function pressureScore(asset) {
  const a5 = activity(asset, "5m");
  const a1 = activity(asset, "1h");

  return weightedAverage([
    { score: buyPressureScore(a5.buys, a5.sells), weight: 0.60 },
    { score: buyPressureScore(a1.buys, a1.sells), weight: 0.40 },
  ]);
}

function volumeAccelerationScore(asset) {
  const v5 = num(asset?.volume5mUsd);
  const v1 = num(asset?.volume1hUsd);
  const age = num(asset?.poolAgeMinutes);

  if (v5 === null || v1 === null || age === null || age <= 0) return null;

  /*
   * Do not falsely call identical lifetime volumes "acceleration"
   * when the pool itself is younger than the comparison window.
   */
  if (age <= 5) return 50;

  const effective1hMinutes = Math.min(60, age);
  if (effective1hMinutes <= 5) return 50;

  const olderWindowVolume = Math.max(0, v1 - v5);
  const olderMinutes = effective1hMinutes - 5;

  if (olderMinutes <= 0) return 50;

  const recentRate = v5 / 5;
  const olderRate = olderWindowVolume / olderMinutes;

  if (olderRate <= 0) {
    return recentRate > 0 ? 85 : 50;
  }

  const acceleration = recentRate / olderRate;

  // ~1x rate = neutral. >=4x receives near-max credit.
  return scoreLinear(acceleration, 0.25, 4);
}

function turnoverScore(asset) {
  const volume = num(asset?.volume24hUsd);
  const liquidity = num(asset?.liquidityUsd);
  const age = num(asset?.poolAgeMinutes);

  if (volume === null || liquidity === null || liquidity <= 0) return null;

  /*
   * Normalize partial-day volume for pool age only after the pool
   * has existed long enough to avoid enormous extrapolation from
   * the first few minutes.
   */
  let effectiveVolume = volume;

  if (age !== null && age >= 60 && age < 1440) {
    effectiveVolume = volume * (1440 / age);
  }

  const ratio = effectiveVolume / liquidity;

  // Very high turnover is not automatically "better".
  if (ratio > 20) return 55;
  if (ratio > 10) return 75;

  return scoreLinear(ratio, 0.05, 5);
}

function valuationContextScore(asset) {
  const marketCap = num(asset?.marketCapUsd);
  const fdv = num(asset?.fdvUsd);
  const liquidity = num(asset?.liquidityUsd);

  const valuation = marketCap ?? fdv;

  if (valuation === null || liquidity === null || valuation <= 0) return null;

  const liquidityToValuation = liquidity / valuation;

  /*
   * Context score only. Low market cap is NOT treated as proof
   * of undervaluation or future upside.
   */
  const liquidityCoverage = scoreLinear(liquidityToValuation, 0.01, 0.25);

  const sizeContext =
    valuation <= 50_000 ? 70 :
    valuation <= 250_000 ? 80 :
    valuation <= 1_000_000 ? 75 :
    valuation <= 5_000_000 ? 60 :
    valuation <= 25_000_000 ? 45 :
    30;

  return weightedAverage([
    { score: liquidityCoverage, weight: 0.65 },
    { score: sizeContext, weight: 0.35 },
  ]);
}

function momentumScore(asset) {
  const p5 = num(asset?.change5mPercent);
  const p1 = num(asset?.change1hPercent);
  const p6 = num(asset?.change6hPercent);

  /*
   * Cap score contribution only. Raw market data remains untouched.
   * Huge percentage prints in tiny/new pools should not dominate.
   */
  function component(value, scale) {
    if (value === null) return null;
    const capped = Math.max(-scale, Math.min(scale, value));
    return clamp(50 + (capped / scale) * 50);
  }

  return weightedAverage([
    { score: component(p5, 25), weight: 0.45 },
    { score: component(p1, 75), weight: 0.35 },
    { score: component(p6, 200), weight: 0.20 },
  ]);
}

function freshnessScore(asset) {
  const age = num(asset?.poolAgeMinutes);
  if (age === null) return null;

  if (age <= 5) return 95;
  if (age <= 15) return 100;
  if (age <= 60) return 95;
  if (age <= 360) return 80;
  if (age <= 1440) return 60;
  if (age <= 4320) return 35;
  return 15;
}

function crossProviderScore(asset) {
  if (asset?.dexScreenerEnriched === true) return 100;
  if (asset?.marketDataAvailable === true) return 55;
  return 20;
}

function dataQuality(asset) {
  const important = [
    asset?.network,
    asset?.contractAddress,
    asset?.priceUsd,
    asset?.liquidityUsd,
    asset?.volume1hUsd,
    asset?.volume24hUsd,
    asset?.poolAgeMinutes,
  ];

  const present =
    important.filter(
      value => value !== null && value !== undefined && value !== "",
    ).length;

  let score = (present / important.length) * 80;

  if (asset?.dexScreenerEnriched === true) score += 15;
  if (asset?.marketCapUsd !== null || asset?.fdvUsd !== null) score += 5;

  return clamp(score);
}

function calculateRisk(asset) {
  const warnings = [];
  let risk = 0;

  const liquidity = num(asset?.liquidityUsd);
  const valuation = num(asset?.marketCapUsd) ?? num(asset?.fdvUsd);
  const age = num(asset?.poolAgeMinutes);
  const tx5 = int(asset?.transactions5m);
  const tx1 = int(asset?.transactions1h);
  const change5 = num(asset?.change5mPercent);
  const change1 = num(asset?.change1hPercent);

  if (liquidity === null) {
    risk += 25;
    warnings.push("LIQUIDITY_UNKNOWN");
  } else if (liquidity < 5_000) {
    risk += 30;
    warnings.push("VERY_LOW_LIQUIDITY");
  } else if (liquidity < 15_000) {
    risk += 18;
    warnings.push("LOW_LIQUIDITY");
  } else if (liquidity < 50_000) {
    risk += 8;
  }

  if (age !== null && age < 5) {
    risk += 12;
    warnings.push("EXTREMELY_NEW_POOL");
  } else if (age !== null && age < 60) {
    risk += 7;
    warnings.push("VERY_NEW_POOL");
  }

  if (asset?.dexScreenerEnriched !== true) {
    risk += 12;
    warnings.push("SINGLE_PROVIDER_OR_UNENRICHED");
  }

  if (asset?.paidPromotion === true) {
    risk += 12;
    warnings.push("PAID_PROMOTION");
  }

  if (valuation !== null && liquidity !== null && liquidity > 0) {
    const valuationToLiquidity = valuation / liquidity;

    if (valuationToLiquidity > 100) {
      risk += 20;
      warnings.push("EXTREME_VALUATION_TO_LIQUIDITY");
    } else if (valuationToLiquidity > 30) {
      risk += 12;
      warnings.push("HIGH_VALUATION_TO_LIQUIDITY");
    }
  }

  if (
    (change5 !== null && Math.abs(change5) >= 100) ||
    (change1 !== null && Math.abs(change1) >= 300)
  ) {
    risk += 12;
    warnings.push("EXTREME_SHORT_TERM_PRICE_MOVE");
  }

  if (
    (tx5 !== null && tx5 <= 2) ||
    (tx1 !== null && tx1 <= 4)
  ) {
    risk += 8;
    warnings.push("THIN_TRANSACTION_ACTIVITY");
  }

  /*
   * We deliberately do NOT claim contract safety, holder
   * concentration safety, locked liquidity, or wallet quality
   * until dedicated on-chain providers supply that evidence.
   */
  warnings.push("CONTRACT_RISK_NOT_YET_VERIFIED");
  warnings.push("HOLDER_CONCENTRATION_NOT_YET_VERIFIED");
  warnings.push("LIQUIDITY_LOCK_NOT_YET_VERIFIED");
  warnings.push("SMART_WALLET_FLOW_NOT_YET_VERIFIED");

  return {
    score: clamp(risk),
    warnings: [...new Set(warnings)],
  };
}

function directionFromEvidence(score, pressure, momentum) {
  const p = num(pressure);
  const m = num(momentum);

  if (score >= 65 && (p === null || p >= 55) && (m === null || m >= 45)) {
    return "BULL";
  }

  if ((p !== null && p < 40) || (m !== null && m < 30)) {
    return "BEAR";
  }

  return "NEUTRAL";
}

function grade(score) {
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "E";
}

function scoreAsset(asset) {
  const components = {
    liquidity: liquidityScore(asset),
    activity: activityScore(asset),
    buyPressure: pressureScore(asset),
    volumeAcceleration: volumeAccelerationScore(asset),
    turnover: turnoverScore(asset),
    valuationContext: valuationContextScore(asset),
    momentum: momentumScore(asset),
    freshness: freshnessScore(asset),
    crossProvider: crossProviderScore(asset),
  };

  const emergingScore =
    weightedAverage([
      { score: components.liquidity, weight: 0.16 },
      { score: components.activity, weight: 0.16 },
      { score: components.buyPressure, weight: 0.14 },
      { score: components.volumeAcceleration, weight: 0.12 },
      { score: components.turnover, weight: 0.10 },
      { score: components.valuationContext, weight: 0.08 },
      { score: components.momentum, weight: 0.10 },
      { score: components.freshness, weight: 0.08 },
      { score: components.crossProvider, weight: 0.06 },
    ]) ?? 0;

  const quality = dataQuality(asset);
  const risk = calculateRisk(asset);

  const direction =
    directionFromEvidence(
      emergingScore,
      components.buyPressure,
      components.momentum,
    );

  const liquidityToFdv =
    safeRatio(
      asset?.liquidityUsd,
      asset?.fdvUsd,
    );

  const liquidityToMarketCap =
    safeRatio(
      asset?.liquidityUsd,
      asset?.marketCapUsd,
    );

  const volumeToLiquidity =
    safeRatio(
      asset?.volume24hUsd,
      asset?.liquidityUsd,
    );

  const reasons = [];

  if ((components.buyPressure ?? 0) >= 65) reasons.push("STRONG_BUY_PRESSURE");
  if ((components.activity ?? 0) >= 65) reasons.push("STRONG_EARLY_ACTIVITY");
  if ((components.volumeAcceleration ?? 0) >= 65) reasons.push("VOLUME_ACCELERATION");
  if ((components.liquidity ?? 0) >= 60) reasons.push("MEANINGFUL_LIQUIDITY");
  if ((components.freshness ?? 0) >= 80) reasons.push("EARLY_POOL");
  if (asset?.dexScreenerEnriched === true) reasons.push("CROSS_PROVIDER_ENRICHED");

  return {
    ...asset,

    emergingDex: {
      engineVersion: ENGINE_VERSION,

      score:
        round(emergingScore),

      grade:
        grade(emergingScore),

      direction,

      riskScore:
        round(risk.score),

      dataQualityScore:
        round(quality),

      components: Object.fromEntries(
        Object.entries(components).map(
          ([key, value]) => [key, round(value)],
        ),
      ),

      metrics: {
        liquidityToFdv:
          round(liquidityToFdv, 6),

        liquidityToMarketCap:
          round(liquidityToMarketCap, 6),

        volumeToLiquidity:
          round(volumeToLiquidity, 6),

        buySellRatio5m:
          round(
            safeRatio(
              asset?.buys5m,
              asset?.sells5m,
            ),
            4,
          ),

        buySellRatio1h:
          round(
            safeRatio(
              asset?.buys1h,
              asset?.sells1h,
            ),
            4,
          ),
      },

      reasons,

      warnings:
        risk.warnings,

      smartWalletScore:
        null,

      whaleFlowScore:
        null,

      contractRiskScore:
        null,

      holderConcentrationScore:
        null,

      liquiditySafetyScore:
        null,

      researchOnly:
        true,

      executionAuthority:
        false,

      liveExecution:
        false,
    },
  };
}

function passesPreFilter(asset, options) {
  const liquidity = num(asset?.liquidityUsd);
  const tx5 = int(asset?.transactions5m);
  const tx1 = int(asset?.transactions1h);
  const age = num(asset?.poolAgeMinutes);

  const reasons = [];

  if (liquidity === null || liquidity < options.minimumLiquidityUsd) {
    reasons.push("BELOW_MINIMUM_LIQUIDITY");
  }

  const hasActivity =
    (tx5 !== null && tx5 >= options.minimumTransactions5m) ||
    (tx1 !== null && tx1 >= options.minimumTransactions1h);

  if (!hasActivity) {
    reasons.push("INSUFFICIENT_TRANSACTION_ACTIVITY");
  }

  if (
    age !== null &&
    age > options.maximumPoolAgeHours * 60
  ) {
    reasons.push("POOL_TOO_OLD_FOR_EMERGING_SCAN");
  }

  if (!asset?.network || !asset?.contractAddress) {
    reasons.push("MISSING_ASSET_IDENTITY");
  }

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

export function runEmergingDexEngine(
  assets,
  options = {},
) {
  const config = {
    ...DEFAULTS,
    ...options,
  };

  const input =
    Array.isArray(assets)
      ? assets
      : [];

  const candidates = [];
  const rejected = [];

  for (const asset of input) {
    const prefilter =
      passesPreFilter(
        asset,
        config,
      );

    if (!prefilter.pass) {
      rejected.push({
        assetId: asset?.assetId ?? null,
        network: asset?.network ?? null,
        symbol: asset?.symbol ?? null,
        reasons: prefilter.reasons,
      });

      continue;
    }

    const scored =
      scoreAsset(asset);

    candidates.push(scored);
  }

  candidates.sort((a, b) => {
    const scoreDifference =
      (b?.emergingDex?.score ?? 0) -
      (a?.emergingDex?.score ?? 0);

    if (scoreDifference !== 0) return scoreDifference;

    const riskDifference =
      (a?.emergingDex?.riskScore ?? 100) -
      (b?.emergingDex?.riskScore ?? 100);

    if (riskDifference !== 0) return riskDifference;

    return (
      (b?.liquidityUsd ?? 0) -
      (a?.liquidityUsd ?? 0)
    );
  });

  const researchReady =
    candidates.filter(asset =>
      (asset?.emergingDex?.score ?? 0) >= config.minimumEmergingScore &&
      (asset?.emergingDex?.dataQualityScore ?? 0) >= config.minimumDataQualityScore
    );

  const topCandidates =
    researchReady.slice(
      0,
      Math.max(
        1,
        Number(config.topLimit) || DEFAULTS.topLimit,
      ),
    );

  const bullCount =
    candidates.filter(
      asset => asset?.emergingDex?.direction === "BULL",
    ).length;

  const bearCount =
    candidates.filter(
      asset => asset?.emergingDex?.direction === "BEAR",
    ).length;

  const neutralCount =
    candidates.filter(
      asset => asset?.emergingDex?.direction === "NEUTRAL",
    ).length;

  return {
    engine:
      "EMERGING_DEX",

    version:
      ENGINE_VERSION,

    status:
      "COMPLETE",

    inputCount:
      input.length,

    candidateCount:
      candidates.length,

    rejectedCount:
      rejected.length,

    researchReadyCount:
      researchReady.length,

    topCandidateCount:
      topCandidates.length,

    directionCounts: {
      BULL: bullCount,
      BEAR: bearCount,
      NEUTRAL: neutralCount,
    },

    config,

    candidates,

    researchReady,

    topCandidates,

    rejected,

    limitations: [
      "SMART_WALLET_DATA_NOT_CONNECTED",
      "WHALE_FLOW_DATA_NOT_CONNECTED",
      "CONTRACT_SECURITY_DATA_NOT_CONNECTED",
      "HOLDER_CONCENTRATION_DATA_NOT_CONNECTED",
      "LIQUIDITY_LOCK_DATA_NOT_CONNECTED",
    ],

    researchOnly:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,

    generatedAt:
      new Date().toISOString(),
  };
}

export default runEmergingDexEngine;
