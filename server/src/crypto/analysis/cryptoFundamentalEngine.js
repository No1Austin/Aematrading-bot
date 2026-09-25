/**
 * ============================================================
 * AEMA CRYPTO
 * FUNDAMENTAL ENGINE
 * Phase 6.28 — confidence & directional coverage correction
 * ============================================================
 *
 * Canonical fundamental research engine.
 *
 * Weights:
 *  - Network / Protocol Usage       20%
 *  - Token Economics                20%
 *  - Liquidity & Market Quality     15%
 *  - Adoption & Ecosystem           15%
 *  - Valuation                      10%
 *  - Project / Development Quality  10%
 *  - Security & Decentralization    10%
 *
 * PRINCIPLES
 * - Missing evidence is not 0 and is not neutral 50.
 * - Unavailable metrics are excluded from scoring.
 * - Available weights are renormalized.
 * - Fundamental quality and directional thesis are separate.
 * - Weak fundamentals may support SHORT; they do not automatically
 *   mean "reject".
 * - Confidence is evidence quality/coverage, not bullishness.
 * - Research only. No execution authority.
 *
 * INPUT
 * Fundamental evidence produced by:
 * cryptoFundamentalEvidenceProvider.js
 */

const WEIGHTS = Object.freeze({
  networkProtocolUsage: 0.20,
  tokenEconomics: 0.20,
  liquidityMarketQuality: 0.15,
  adoptionEcosystem: 0.15,
  valuation: 0.10,
  projectDevelopmentQuality: 0.10,
  securityDecentralization: 0.10,
});

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clamp = (value, min = 0, max = 100) => {
  const number = finite(value);
  if (number === null) return null;
  return Math.min(max, Math.max(min, number));
};

const logScore = (value, low, high) => {
  const number = finite(value);
  if (number === null || number <= 0) return null;
  const x = Math.log10(number);
  return clamp(((x - low) / Math.max(0.0001, high - low)) * 100);
};

const metricValue = (metric) =>
  metric?.available === true ? finite(metric.value) : null;

const arrayValue = (metric) =>
  metric?.available === true && Array.isArray(metric.value)
    ? metric.value
    : null;

const textValue = (metric) =>
  metric?.available === true && String(metric.value ?? "").trim()
    ? String(metric.value).trim()
    : null;

function observation({
  key,
  metric,
  score,
  weight,
  bullish = null,
  bearish = null,
  note = null,
}) {
  const value =
    metric?.available === true
      ? metric.value
      : null;

  const numericScore = finite(score);

  if (metric?.available !== true || numericScore === null) return null;

  return {
    key,
    value,
    score: clamp(numericScore),
    weight,
    bullish: finite(bullish) === null ? null : clamp(bullish),
    bearish: finite(bearish) === null ? null : clamp(bearish),
    source: metric?.source ?? null,
    note,
  };
}

function unavailableKeys(area) {
  return Object.entries(area ?? {})
    .filter(([, metric]) => metric?.available !== true)
    .map(([key, metric]) => ({
      key,
      reason: metric?.reason ?? "UNAVAILABLE",
      source: metric?.source ?? null,
    }));
}

function finalizePillar({
  id,
  label,
  configuredWeight,
  area,
  observations,
  bullishEvidence = [],
  bearishEvidence = [],
}) {
  /*
   * Only scored observations represent available evidence.
   *
   * Placeholder rows such as { weight: 0.15 } exist only so the
   * denominator can retain the configured metric weight. They MUST NOT
   * be treated as available evidence. Previously filter(Boolean) kept
   * those placeholders, which caused:
   *
   * - represented weight to become 100%
   * - undefined scores to produce NaN
   * - clamp(NaN) to become 0
   *
   * The result was the false 0 score / 100 confidence / 100 coverage
   * seen across every Fundamental pillar.
   */
  const rows = observations.filter(
    (row) =>
      row &&
      finite(row.score) !== null,
  );

  if (!rows.length) {
    return {
      id,
      label,
      configuredWeight,
      available: false,
      score: null,
      confidence: 0,
      coverage: 0,
      direction: "NEUTRAL",
      directionStrength: 0,
      bullishStrength: null,
      bearishStrength: null,
      directionalCoverage: 0,
      observations: [],
      bullishEvidence,
      bearishEvidence,
      unavailableEvidence: unavailableKeys(area),
    };
  }

  const represented = rows.reduce((sum, row) => sum + row.weight, 0);
  const score =
    rows.reduce((sum, row) => sum + row.score * row.weight, 0) /
    represented;

  const configuredMetricWeight = observations.reduce(
    (sum, row) => sum + (row?.weight ?? 0),
    0,
  );

  /*
   * Most pillar builders below intentionally include placeholder
   * observation slots for unavailable metrics. That makes coverage
   * represent evidence completeness without assigning those metrics
   * a fake score.
   */
  const coverage =
    configuredMetricWeight > 0
      ? clamp((represented / configuredMetricWeight) * 100)
      : 100;

  const directionalRows = rows.filter(
    (row) => row.bullish !== null || row.bearish !== null,
  );

  const directionalWeight = directionalRows.reduce(
    (sum, row) => sum + row.weight,
    0,
  );

  const bullishStrength =
    directionalWeight > 0
      ? directionalRows.reduce(
          (sum, row) => sum + (row.bullish ?? 50) * row.weight,
          0,
        ) / directionalWeight
      : null;

  const bearishStrength =
    directionalWeight > 0
      ? directionalRows.reduce(
          (sum, row) => sum + (row.bearish ?? 50) * row.weight,
          0,
        ) / directionalWeight
      : null;

  const edge =
    (bullishStrength ?? 50) - (bearishStrength ?? 50);

  const direction =
    edge >= 8 ? "LONG" : edge <= -8 ? "SHORT" : "NEUTRAL";

  /*
   * Phase 6.28:
   * Confidence must be proportional to represented evidence.
   * The old row-count bonus could make a thin pillar look more certain
   * than its actual evidence coverage justified.
   */
  const confidence =
    clamp(coverage);

  /*
   * Directional coverage is narrower than general pillar coverage:
   * only observations carrying explicit bullish/bearish semantics count.
   */
  const directionalCoverage =
    configuredMetricWeight > 0
      ? clamp(
          (directionalWeight /
            configuredMetricWeight) *
            100,
        )
      : 0;

  return {
    id,
    label,
    configuredWeight,
    available: true,
    score: clamp(score),
    confidence,
    coverage,
    direction,
    directionStrength: clamp(Math.abs(edge) * 2),
    bullishStrength:
      bullishStrength === null ? null : clamp(bullishStrength),
    bearishStrength:
      bearishStrength === null ? null : clamp(bearishStrength),
    directionalCoverage,
    observations: rows,
    bullishEvidence,
    bearishEvidence,
    unavailableEvidence: unavailableKeys(area),
  };
}

function networkProtocolUsage(area = {}) {
  const tvl = metricValue(area.tvlUsd);
  const d1 = metricValue(area.tvlChange1dPercent);
  const d7 = metricValue(area.tvlChange7dPercent);
  const chains = arrayValue(area.chains);

  const tvlScore = logScore(tvl, 5, 10);
  const d1Direction = d1 === null ? null : clamp(50 + d1 * 2.5);
  const d7Direction = d7 === null ? null : clamp(50 + d7 * 1.5);
  const chainScore =
    chains === null ? null : clamp(40 + Math.min(50, chains.length * 10));

  const bullish = [];
  const bearish = [];

  if (d1 !== null && d1 > 2) bullish.push(`TVL 1d +${d1.toFixed(2)}%`);
  if (d1 !== null && d1 < -2) bearish.push(`TVL 1d ${d1.toFixed(2)}%`);
  if (d7 !== null && d7 > 5) bullish.push(`TVL 7d +${d7.toFixed(2)}%`);
  if (d7 !== null && d7 < -5) bearish.push(`TVL 7d ${d7.toFixed(2)}%`);

  const slots = [
    observation({
      key: "tvlUsd",
      metric: area.tvlUsd,
      score: tvlScore,
      weight: 0.20,
      bullish: tvlScore,
      bearish: tvlScore === null ? null : 100 - tvlScore,
    }),
    observation({
      key: "tvlChange1dPercent",
      metric: area.tvlChange1dPercent,
      score: d1 === null ? null : clamp(65 - Math.min(35, Math.abs(d1 - 3))),
      weight: 0.10,
      bullish: d1Direction,
      bearish: d1Direction === null ? null : 100 - d1Direction,
    }),
    observation({
      key: "tvlChange7dPercent",
      metric: area.tvlChange7dPercent,
      score: d7 === null ? null : clamp(65 - Math.min(35, Math.abs(d7 - 7))),
      weight: 0.15,
      bullish: d7Direction,
      bearish: d7Direction === null ? null : 100 - d7Direction,
    }),
    observation({
      key: "chains",
      metric: area.chains,
      score: chainScore,
      weight: 0.10,
      bullish: chainScore,
      bearish: chainScore === null ? null : 100 - chainScore,
    }),

    // Reserved evidence weights. Null slots affect coverage only.
    area.activeAddresses?.available === true
      ? observation({
          key: "activeAddresses",
          metric: area.activeAddresses,
          score: logScore(metricValue(area.activeAddresses), 3, 8),
          weight: 0.15,
        })
      : { weight: 0.15 },

    area.transactions?.available === true
      ? observation({
          key: "transactions",
          metric: area.transactions,
          score: logScore(metricValue(area.transactions), 3, 8),
          weight: 0.10,
        })
      : { weight: 0.10 },

    area.fees?.available === true
      ? observation({
          key: "fees",
          metric: area.fees,
          score: logScore(metricValue(area.fees), 3, 8),
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.revenue?.available === true
      ? observation({
          key: "revenue",
          metric: area.revenue,
          score: logScore(metricValue(area.revenue), 3, 8),
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.utilization?.available === true
      ? observation({
          key: "utilization",
          metric: area.utilization,
          score: metricValue(area.utilization),
          weight: 0.05,
        })
      : { weight: 0.05 },
  ];

  return finalizePillar({
    id: "networkProtocolUsage",
    label: "Network / Protocol Usage",
    configuredWeight: WEIGHTS.networkProtocolUsage,
    area,
    observations: slots,
    bullishEvidence: bullish,
    bearishEvidence: bearish,
  });
}

function tokenEconomics(area = {}) {
  const ratio = metricValue(area.circulatingSupplyRatioPercent);

  const supplyScore =
    ratio === null ? null : clamp(25 + ratio * 0.75);

  const bullish = [];
  const bearish = [];

  if (ratio !== null && ratio >= 75) {
    bullish.push(`Circulating supply ratio ${ratio.toFixed(1)}%`);
  }

  if (ratio !== null && ratio < 35) {
    bearish.push(`Only ${ratio.toFixed(1)}% of supply circulating`);
  }

  const slots = [
    observation({
      key: "circulatingSupplyRatioPercent",
      metric: area.circulatingSupplyRatioPercent,
      score: supplyScore,
      weight: 0.30,
      bullish: supplyScore,
      bearish: supplyScore === null ? null : 100 - supplyScore,
    }),

    area.inflationRate?.available === true
      ? observation({
          key: "inflationRate",
          metric: area.inflationRate,
          score: clamp(100 - Math.max(0, metricValue(area.inflationRate)) * 4),
          weight: 0.15,
        })
      : { weight: 0.15 },

    area.emissions?.available === true
      ? observation({
          key: "emissions",
          metric: area.emissions,
          score: null,
          weight: 0.10,
        })
      : { weight: 0.10 },

    area.unlocks?.available === true
      ? observation({
          key: "unlocks",
          metric: area.unlocks,
          score: null,
          weight: 0.15,
        })
      : { weight: 0.15 },

    area.burns?.available === true
      ? observation({
          key: "burns",
          metric: area.burns,
          score: null,
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.staking?.available === true
      ? observation({
          key: "staking",
          metric: area.staking,
          score: null,
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.tokenUtility?.available === true
      ? observation({
          key: "tokenUtility",
          metric: area.tokenUtility,
          score: null,
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.holderConcentration?.available === true
      ? observation({
          key: "holderConcentration",
          metric: area.holderConcentration,
          score: null,
          weight: 0.075,
        })
      : { weight: 0.075 },
  ];

  return finalizePillar({
    id: "tokenEconomics",
    label: "Token Economics",
    configuredWeight: WEIGHTS.tokenEconomics,
    area,
    observations: slots,
    bullishEvidence: bullish,
    bearishEvidence: bearish,
  });
}

function liquidityMarketQuality(area = {}) {
  const volume = metricValue(area.volume24hUsd);
  const liquidity = metricValue(area.liquidityUsd);
  const venues = metricValue(area.venueCount);
  const cex = metricValue(area.cexCount);
  const dex = metricValue(area.dexCount);
  const turnover = metricValue(area.volumeToMarketCap);
  const trades = metricValue(area.futuresTradeCount);

  const volumeScore = logScore(volume, 4.7, 9.5);
  const liquidityScore = logScore(liquidity, 4.4, 8.5);
  const venueScore =
    venues === null
      ? null
      : clamp(35 + venues * 9 + (cex ?? 0) * 4 + (dex ?? 0) * 3);

  const turnoverScore =
    turnover === null
      ? null
      : turnover >= 0.03 && turnover <= 1.5
        ? 85
        : turnover >= 0.01 && turnover <= 3
          ? 68
          : turnover > 5
            ? 35
            : 50;

  const tradeScore = logScore(trades, 2, 6);

  const bullish = [];
  const bearish = [];

  if (turnover !== null && turnover >= 0.03 && turnover <= 1.5) {
    bullish.push("Healthy volume relative to market capitalization");
  }

  if (turnover !== null && turnover > 5) {
    bearish.push("Extreme turnover requires volume-quality scrutiny");
  }

  const slots = [
    observation({
      key: "volume24hUsd",
      metric: area.volume24hUsd,
      score: volumeScore,
      weight: 0.25,
      bullish: volumeScore,
      bearish: volumeScore === null ? null : 100 - volumeScore,
    }),
    observation({
      key: "liquidityUsd",
      metric: area.liquidityUsd,
      score: liquidityScore,
      weight: 0.20,
      bullish: liquidityScore,
      bearish: liquidityScore === null ? null : 100 - liquidityScore,
    }),
    observation({
      key: "venueCount",
      metric: area.venueCount,
      score: venueScore,
      weight: 0.15,
      bullish: venueScore,
      bearish: venueScore === null ? null : 100 - venueScore,
    }),
    observation({
      key: "volumeToMarketCap",
      metric: area.volumeToMarketCap,
      score: turnoverScore,
      weight: 0.15,
      bullish: turnoverScore,
      bearish: turnoverScore === null ? null : 100 - turnoverScore,
    }),
    observation({
      key: "futuresTradeCount",
      metric: area.futuresTradeCount,
      score: tradeScore,
      weight: 0.05,
      bullish: tradeScore,
      bearish: tradeScore === null ? null : 100 - tradeScore,
    }),

    area.spread?.available === true
      ? observation({
          key: "spread",
          metric: area.spread,
          score: clamp(100 - metricValue(area.spread) * 25),
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.orderBookDepth?.available === true
      ? observation({
          key: "orderBookDepth",
          metric: area.orderBookDepth,
          score: logScore(metricValue(area.orderBookDepth), 4, 9),
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.suspiciousVolume?.available === true
      ? observation({
          key: "suspiciousVolume",
          metric: area.suspiciousVolume,
          score: clamp(100 - metricValue(area.suspiciousVolume)),
          weight: 0.05,
        })
      : { weight: 0.05 },
  ];

  return finalizePillar({
    id: "liquidityMarketQuality",
    label: "Liquidity & Market Quality",
    configuredWeight: WEIGHTS.liquidityMarketQuality,
    area,
    observations: slots,
    bullishEvidence: bullish,
    bearishEvidence: bearish,
  });
}

function adoptionEcosystem(area = {}) {
  const chains = arrayValue(area.chainReach);
  const galaxy = metricValue(area.socialGalaxyScore);
  const socialVolume = metricValue(area.socialVolume);
  const interactions = metricValue(area.socialInteractions);
  const dominance = metricValue(area.socialDominance);

  const chainScore =
    chains === null ? null : clamp(40 + chains.length * 10);

  const galaxyScore =
    galaxy === null ? null : clamp(galaxy);

  const socialVolumeScore =
    logScore(socialVolume, 1, 7);

  const interactionScore =
    logScore(interactions, 2, 9);

  const dominanceScore =
    dominance === null
      ? null
      : clamp(35 + Math.log10(Math.max(1e-8, dominance) + 1) * 30);

  const slots = [
    observation({
      key: "chainReach",
      metric: area.chainReach,
      score: chainScore,
      weight: 0.15,
      bullish: chainScore,
      bearish: chainScore === null ? null : 100 - chainScore,
    }),
    observation({
      key: "socialGalaxyScore",
      metric: area.socialGalaxyScore,
      score: galaxyScore,
      weight: 0.10,
      bullish: galaxyScore,
      bearish: galaxyScore === null ? null : 100 - galaxyScore,
    }),
    observation({
      key: "socialVolume",
      metric: area.socialVolume,
      score: socialVolumeScore,
      weight: 0.075,
    }),
    observation({
      key: "socialInteractions",
      metric: area.socialInteractions,
      score: interactionScore,
      weight: 0.075,
    }),
    observation({
      key: "socialDominance",
      metric: area.socialDominance,
      score: dominanceScore,
      weight: 0.05,
    }),

    area.developerActivity?.available === true
      ? observation({
          key: "developerActivity",
          metric: area.developerActivity,
          score: metricValue(area.developerActivity),
          weight: 0.20,
        })
      : { weight: 0.20 },

    area.integrations?.available === true
      ? observation({
          key: "integrations",
          metric: area.integrations,
          score: metricValue(area.integrations),
          weight: 0.15,
        })
      : { weight: 0.15 },

    area.applications?.available === true
      ? observation({
          key: "applications",
          metric: area.applications,
          score: metricValue(area.applications),
          weight: 0.10,
        })
      : { weight: 0.10 },

    area.stablecoinActivity?.available === true
      ? observation({
          key: "stablecoinActivity",
          metric: area.stablecoinActivity,
          score: metricValue(area.stablecoinActivity),
          weight: 0.075,
        })
      : { weight: 0.075 },

    area.ecosystemGrowth?.available === true
      ? observation({
          key: "ecosystemGrowth",
          metric: area.ecosystemGrowth,
          score: metricValue(area.ecosystemGrowth),
          weight: 0.025,
        })
      : { weight: 0.025 },
  ];

  return finalizePillar({
    id: "adoptionEcosystem",
    label: "Adoption & Ecosystem",
    configuredWeight: WEIGHTS.adoptionEcosystem,
    area,
    observations: slots,
  });
}

function valuation(area = {}) {
  const fdvRatio = metricValue(area.fdvToMarketCap);
  const mcTvl = metricValue(area.marketCapToTvl);

  const fdvScore =
    fdvRatio === null
      ? null
      : fdvRatio <= 1.25
        ? 92
        : fdvRatio <= 1.75
          ? 78
          : fdvRatio <= 2.5
            ? 60
            : fdvRatio <= 5
              ? 38
              : 15;

  const mcTvlScore =
    mcTvl === null
      ? null
      : mcTvl <= 1
        ? 90
        : mcTvl <= 3
          ? 78
          : mcTvl <= 7
            ? 62
            : mcTvl <= 15
              ? 45
              : 28;

  const bullish = [];
  const bearish = [];

  if (fdvRatio !== null && fdvRatio <= 1.5) {
    bullish.push(`Low FDV/market-cap dilution gap ${fdvRatio.toFixed(2)}x`);
  }
  if (fdvRatio !== null && fdvRatio > 3) {
    bearish.push(`High FDV/market-cap dilution gap ${fdvRatio.toFixed(2)}x`);
  }
  if (mcTvl !== null && mcTvl <= 3) {
    bullish.push(`Market-cap/TVL ${mcTvl.toFixed(2)}x`);
  }
  if (mcTvl !== null && mcTvl > 15) {
    bearish.push(`High market-cap/TVL ${mcTvl.toFixed(2)}x`);
  }

  const slots = [
    observation({
      key: "fdvToMarketCap",
      metric: area.fdvToMarketCap,
      score: fdvScore,
      weight: 0.30,
      bullish: fdvScore,
      bearish: fdvScore === null ? null : 100 - fdvScore,
    }),
    observation({
      key: "marketCapToTvl",
      metric: area.marketCapToTvl,
      score: mcTvlScore,
      weight: 0.25,
      bullish: mcTvlScore,
      bearish: mcTvlScore === null ? null : 100 - mcTvlScore,
    }),

    area.fdvToRevenue?.available === true
      ? observation({
          key: "fdvToRevenue",
          metric: area.fdvToRevenue,
          score: null,
          weight: 0.15,
        })
      : { weight: 0.15 },

    area.marketCapToRevenue?.available === true
      ? observation({
          key: "marketCapToRevenue",
          metric: area.marketCapToRevenue,
          score: null,
          weight: 0.15,
        })
      : { weight: 0.15 },

    area.feesToValuation?.available === true
      ? observation({
          key: "feesToValuation",
          metric: area.feesToValuation,
          score: null,
          weight: 0.10,
        })
      : { weight: 0.10 },

    area.peerComparison?.available === true
      ? observation({
          key: "peerComparison",
          metric: area.peerComparison,
          score: metricValue(area.peerComparison),
          weight: 0.05,
        })
      : { weight: 0.05 },
  ];

  return finalizePillar({
    id: "valuation",
    label: "Valuation",
    configuredWeight: WEIGHTS.valuation,
    area,
    observations: slots,
    bullishEvidence: bullish,
    bearishEvidence: bearish,
  });
}

function projectDevelopmentQuality(area = {}) {
  const category = textValue(area.protocolCategory);
  const url = textValue(area.protocolUrl);

  const categoryScore = category ? 60 : null;
  const urlScore = url ? 60 : null;

  const slots = [
    observation({
      key: "protocolCategory",
      metric: area.protocolCategory,
      score: categoryScore,
      weight: 0.075,
    }),
    observation({
      key: "protocolUrl",
      metric: area.protocolUrl,
      score: urlScore,
      weight: 0.025,
    }),

    area.developerActivity?.available === true
      ? observation({
          key: "developerActivity",
          metric: area.developerActivity,
          score: metricValue(area.developerActivity),
          weight: 0.25,
        })
      : { weight: 0.25 },

    area.releases?.available === true
      ? observation({
          key: "releases",
          metric: area.releases,
          score: metricValue(area.releases),
          weight: 0.15,
        })
      : { weight: 0.15 },

    area.audits?.available === true
      ? observation({
          key: "audits",
          metric: area.audits,
          score: metricValue(area.audits),
          weight: 0.20,
        })
      : { weight: 0.20 },

    area.governance?.available === true
      ? observation({
          key: "governance",
          metric: area.governance,
          score: metricValue(area.governance),
          weight: 0.10,
        })
      : { weight: 0.10 },

    area.documentation?.available === true
      ? observation({
          key: "documentation",
          metric: area.documentation,
          score: metricValue(area.documentation),
          weight: 0.10,
        })
      : { weight: 0.10 },

    area.protocolMaturity?.available === true
      ? observation({
          key: "protocolMaturity",
          metric: area.protocolMaturity,
          score: metricValue(area.protocolMaturity),
          weight: 0.10,
        })
      : { weight: 0.10 },
  ];

  return finalizePillar({
    id: "projectDevelopmentQuality",
    label: "Project / Development Quality",
    configuredWeight: WEIGHTS.projectDevelopmentQuality,
    area,
    observations: slots,
  });
}

function securityDecentralization(area = {}) {
  const definitions = [
    ["exploitHistory", 0.20],
    ["validatorConcentration", 0.15],
    ["adminKeyRisk", 0.15],
    ["bridgeDependencies", 0.10],
    ["oracleDependencies", 0.10],
    ["contractRisk", 0.15],
    ["governanceConcentration", 0.15],
  ];

  const slots = definitions.map(([key, weight]) => {
    const metric = area[key];

    if (metric?.available !== true) return { weight };

    const value = metricValue(metric);

    return observation({
      key,
      metric,
      /*
       * Future providers should normalize these risk metrics so that
       * high values mean healthier/lower risk before reaching this engine.
       */
      score: value,
      weight,
      bullish: value,
      bearish: value === null ? null : 100 - value,
    });
  });

  return finalizePillar({
    id: "securityDecentralization",
    label: "Security & Decentralization",
    configuredWeight: WEIGHTS.securityDecentralization,
    area,
    observations: slots,
  });
}

function aggregate(pillars) {
  const all =
    Object.values(pillars);

  const available =
    all.filter(
      pillar =>
        pillar.available &&
        finite(pillar.score) !== null,
    );

  /*
   * General represented evidence:
   * configured pillar weight × internal pillar coverage.
   */
  const representedWeight =
    available.reduce(
      (sum, pillar) =>
        sum +
        pillar.configuredWeight *
          (pillar.coverage / 100),
      0,
    );

  if (
    !available.length ||
    representedWeight <= 0
  ) {
    return {
      available: false,
      score: null,
      confidence: 0,
      coverage: 0,
      representedWeight: 0,
      direction: "NEUTRAL",
      directionStrength: 0,
      bullishStrength: null,
      bearishStrength: null,
      directionalCoverage: 0,
      directionalRepresentedWeight: 0,
      trend: "UNKNOWN",
    };
  }

  /*
   * Fundamental quality score remains re-normalized over available
   * configured pillar weights. Missing evidence is NOT converted to zero.
   * Phase 6.28 changes confidence/directional evidence weighting, not this
   * established score contract.
   */
  const scoreWeight =
    available.reduce(
      (sum, pillar) =>
        sum +
        pillar.configuredWeight,
      0,
    );

  const score =
    scoreWeight > 0
      ? available.reduce(
          (sum, pillar) =>
            sum +
            pillar.score *
              pillar.configuredWeight,
          0,
        ) / scoreWeight
      : null;

  const coverage =
    clamp(
      representedWeight *
        100,
    );

  /*
   * Confidence numerator and denominator now use the SAME represented
   * evidence weight. A 20%-configured pillar with 25% internal coverage
   * contributes 5%, not the full 20%.
   */
  const confidence =
    representedWeight > 0
      ? available.reduce(
          (sum, pillar) => {
            const represented =
              pillar.configuredWeight *
              (pillar.coverage / 100);

            return (
              sum +
              pillar.confidence *
                represented
            );
          },
          0,
        ) /
        representedWeight
      : 0;

  const directional =
    available.filter(
      pillar =>
        (
          finite(
            pillar.bullishStrength,
          ) !== null ||
          finite(
            pillar.bearishStrength,
          ) !== null
        ) &&
        finite(
          pillar.directionalCoverage,
        ) !== null &&
        pillar.directionalCoverage > 0,
    );

  /*
   * Directional represented weight uses directional evidence coverage,
   * NOT general pillar coverage. This prevents non-directional evidence
   * from inflating LONG/SHORT authority.
   */
  const directionalRepresentedWeight =
    directional.reduce(
      (sum, pillar) =>
        sum +
        pillar.configuredWeight *
          (
            pillar.directionalCoverage /
            100
          ),
      0,
    );

  const bullishStrength =
    directionalRepresentedWeight > 0
      ? directional.reduce(
          (sum, pillar) => {
            const represented =
              pillar.configuredWeight *
              (
                pillar.directionalCoverage /
                100
              );

            return (
              sum +
              (
                finite(
                  pillar.bullishStrength,
                ) ??
                50
              ) *
                represented
            );
          },
          0,
        ) /
        directionalRepresentedWeight
      : null;

  const bearishStrength =
    directionalRepresentedWeight > 0
      ? directional.reduce(
          (sum, pillar) => {
            const represented =
              pillar.configuredWeight *
              (
                pillar.directionalCoverage /
                100
              );

            return (
              sum +
              (
                finite(
                  pillar.bearishStrength,
                ) ??
                50
              ) *
                represented
            );
          },
          0,
        ) /
        directionalRepresentedWeight
      : null;

  const edge =
    (bullishStrength ?? 50) -
    (bearishStrength ?? 50);

  const direction =
    edge >= 8
      ? "LONG"
      : edge <= -8
        ? "SHORT"
        : "NEUTRAL";

  const directionalCoverage =
    clamp(
      directionalRepresentedWeight *
        100,
    );

  return {
    available: true,
    score:
      score === null
        ? null
        : clamp(score),
    confidence:
      clamp(confidence),
    coverage,
    representedWeight,
    direction,
    directionStrength:
      clamp(
        Math.abs(edge) *
          2,
      ),
    bullishStrength:
      bullishStrength === null
        ? null
        : clamp(
            bullishStrength,
          ),
    bearishStrength:
      bearishStrength === null
        ? null
        : clamp(
            bearishStrength,
          ),
    directionalCoverage,
    directionalRepresentedWeight,
    trend:
      direction === "LONG"
        ? "IMPROVING"
        : direction === "SHORT"
          ? "DETERIORATING"
          : "MIXED",
  };
}

export async function runCryptoFundamentalEngine(
  candidate,
  {
    fundamentalEvidence = null,
  } = {},
) {
  const areas =
    fundamentalEvidence?.areas ??
    {};

  const pillars = {
    networkProtocolUsage:
      networkProtocolUsage(
        areas.networkProtocolUsage,
      ),

    tokenEconomics:
      tokenEconomics(
        areas.tokenEconomics,
      ),

    liquidityMarketQuality:
      liquidityMarketQuality(
        areas.liquidityMarketQuality,
      ),

    adoptionEcosystem:
      adoptionEcosystem(
        areas.adoptionEcosystem,
      ),

    valuation:
      valuation(
        areas.valuation,
      ),

    projectDevelopmentQuality:
      projectDevelopmentQuality(
        areas.projectDevelopmentQuality,
      ),

    securityDecentralization:
      securityDecentralization(
        areas.securityDecentralization,
      ),
  };

  const result = aggregate(pillars);

  const bullishEvidence =
    Object.values(pillars).flatMap(
      (pillar) => pillar.bullishEvidence ?? [],
    );

  const bearishEvidence =
    Object.values(pillars).flatMap(
      (pillar) => pillar.bearishEvidence ?? [],
    );

  const unavailableEvidence =
    Object.values(pillars).flatMap(
      (pillar) =>
        (pillar.unavailableEvidence ?? []).map(
          (entry) => ({
            pillar: pillar.id,
            ...entry,
          }),
        ),
    );

  return {
    engine: "CRYPTO_FUNDAMENTAL",
    version: "6.28",

    status:
      result.available
        ? "READY"
        : "INSUFFICIENT_EVIDENCE",

    available:
      result.available,

    score:
      result.score,

    confidence:
      result.confidence,

    coverage:
      result.coverage,

    representedWeight:
      result.representedWeight,

    configuredWeight:
      1,

    direction:
      result.direction,

    directionStrength:
      result.directionStrength,

    bullishStrength:
      result.bullishStrength,

    bearishStrength:
      result.bearishStrength,

    directionalCoverage:
      result.directionalCoverage,

    directionalRepresentedWeight:
      result.directionalRepresentedWeight,

    trend:
      result.trend,

    pillars,

    evidence: {
      bullish:
        bullishEvidence,

      bearish:
        bearishEvidence,

      unavailable:
        unavailableEvidence,

      identity:
        fundamentalEvidence
          ?.identity ??
        null,

      attribution:
        fundamentalEvidence
          ?.attribution ??
        null,

      freshness:
        fundamentalEvidence
          ?.freshness ??
        null,
    },

    evidenceContract: {
      phase:
        "6.28",
      confidenceWeighting:
        "REPRESENTED_EVIDENCE_WEIGHT",
      directionalWeighting:
        "DIRECTIONAL_REPRESENTED_EVIDENCE_WEIGHT",
      missingEvidencePolicy:
        "EXCLUDED_NOT_ZERO_OR_NEUTRAL",
      scoreSemanticsChanged:
        false,
      executionAuthority:
        false,
    },

    /*
     * Qualification 2 will consume this engine later.
     * The engine itself has no authority to approve execution.
     */
    qualification: {
      researchEligible:
        result.available,

      directional:
        result.direction !==
        "NEUTRAL",

      qualification2Authority:
        false,
    },

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export default runCryptoFundamentalEngine;
