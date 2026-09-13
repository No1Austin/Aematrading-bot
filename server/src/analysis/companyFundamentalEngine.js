// server/src/analysis/companyFundamentalEngine.js

/**
 * ============================================================
 * COMPANY FUNDAMENTAL ENGINE — 30-POINT STOCK PILLAR MODEL
 * ============================================================
 *
 * PURPOSE
 * -------
 * Convert normalized company fundamentals into:
 * - fundamental quality
 * - fundamental momentum
 * - valuation/expectations context
 * - LONG / SHORT directional support
 * - pillar-level coverage and explanations
 *
 * IMPORTANT
 * ---------
 * - This engine does NOT fetch data.
 * - This engine does NOT execute trades.
 * - Missing data is NOT negative evidence.
 * - Neutral evidence maps to 50% directional support.
 * - Provider failure / insufficient evidence remains unavailable.
 *
 * BACKWARD COMPATIBILITY
 * ----------------------
 * Preserves the fields consumed by the existing orchestrator and
 * scoring engine: approved, status, direction, health, confidence,
 * rawScore, directionalSupport, evidence, maximumScore, warnings,
 * errors, timestamp.
 */

export const COMPANY_DIRECTION = Object.freeze({
  STRONG_BULLISH: "STRONG_BULLISH",
  BULLISH: "BULLISH",
  NEUTRAL: "NEUTRAL",
  BEARISH: "BEARISH",
  STRONG_BEARISH: "STRONG_BEARISH",
  UNKNOWN: "UNKNOWN",
});

export const FUNDAMENTAL_HEALTH = Object.freeze({
  EXCELLENT: "EXCELLENT",
  STRONG: "STRONG",
  FAIR: "FAIR",
  WEAK: "WEAK",
  DISTRESSED: "DISTRESSED",
  UNKNOWN: "UNKNOWN",
});

export const FUNDAMENTAL_PILLAR = Object.freeze({
  GROWTH: "growth",
  PROFITABILITY: "profitability",
  CASH_FLOW: "cashFlow",
  BALANCE_SHEET: "balanceSheet",
  VALUATION: "valuation",
  FORWARD_OUTLOOK: "forwardOutlook",
  ECONOMIC_EXPOSURE: "economicExposure",
});

export const FUNDAMENTAL_MAXIMUM_SCORE = 30;

export const DEFAULT_FUNDAMENTAL_PILLAR_POINTS = Object.freeze({
  [FUNDAMENTAL_PILLAR.GROWTH]: 5,
  [FUNDAMENTAL_PILLAR.PROFITABILITY]: 5,
  [FUNDAMENTAL_PILLAR.CASH_FLOW]: 5,
  [FUNDAMENTAL_PILLAR.BALANCE_SHEET]: 4,
  [FUNDAMENTAL_PILLAR.VALUATION]: 4,
  [FUNDAMENTAL_PILLAR.FORWARD_OUTLOOK]: 4,
  [FUNDAMENTAL_PILLAR.ECONOMIC_EXPOSURE]: 3,
});

export const DEFAULT_FUNDAMENTAL_PILLAR_WEIGHTS = Object.freeze(
  Object.fromEntries(
    Object.entries(DEFAULT_FUNDAMENTAL_PILLAR_POINTS).map(
      ([key, points]) => [key, points / FUNDAMENTAL_MAXIMUM_SCORE],
    ),
  ),
);

const PILLAR_LABELS = Object.freeze({
  growth: "Growth",
  profitability: "Profitability",
  cashFlow: "Cash Flow",
  balanceSheet: "Balance Sheet",
  valuation: "Valuation",
  forwardOutlook: "Forward Outlook",
  economicExposure: "Economic Exposure",
});

function now() {
  return new Date().toISOString();
}

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

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min = 0, max = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
}

function round(value, decimals = 4) {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizeText(value) {
  return String(value ?? "").trim().toUpperCase();
}

function firstFinite(
  ...values
) {
  for (
    const value
    of values
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    const parsed =
      Number(
        value,
      );

    if (
      Number.isFinite(
        parsed,
      )
    ) {
      return parsed;
    }
  }

  return null;
}

function createEvidence({
  factor,
  pillar,
  score,
  confidence = 0.75,
  value = null,
  summary,
}) {
  return {
    factor,
    pillar,
    score: clamp(score, -1, 1),
    confidence: clamp(confidence, 0, 1),
    value,
    summary,
  };
}

function scoreGrowthRate(value, {
  excellent = 0.20,
  strong = 0.10,
  positive = 0.03,
  severeDecline = -0.15,
} = {}) {
  if (!isFiniteNumber(value)) return null;
  const v = Number(value);

  if (v >= excellent) return 1;
  if (v >= strong) return 0.75;
  if (v >= positive) return 0.4;
  if (v > 0) return 0.15;
  if (v <= severeDecline) return -1;
  if (v < 0) return -0.5;
  return 0;
}

function analyzeRevenue(revenue) {
  if (!revenue || typeof revenue !== "object") return null;

  const growth = firstFinite(
    revenue.growth,
    revenue.revenueGrowthYoY,
    revenue.yoyGrowth,
  );

  if (growth === null) return null;

  let score = scoreGrowthRate(growth);
  const acceleration = firstFinite(
    revenue.acceleration,
    revenue.growthAcceleration,
  );

  if (acceleration !== null) {
    if (acceleration > 0.02) score += 0.1;
    if (acceleration < -0.02) score -= 0.1;
  }

  return createEvidence({
    factor: "REVENUE_GROWTH",
    pillar: FUNDAMENTAL_PILLAR.GROWTH,
    score,
    confidence: 0.9,
    value: { growth, acceleration },
    summary:
      growth >= 0.10
        ? "Revenue growth is strong."
        : growth > 0
          ? "Revenue is growing."
          : growth < 0
            ? "Revenue is contracting."
            : "Revenue growth is flat.",
  });
}

function analyzeEarnings(earnings) {
  if (!earnings || typeof earnings !== "object") return null;

  const epsGrowth = firstFinite(
    earnings.epsGrowth,
    earnings.epsGrowthYoY,
    earnings.growth,
  );

  if (epsGrowth === null) return null;

  return createEvidence({
    factor: "EARNINGS_GROWTH",
    pillar: FUNDAMENTAL_PILLAR.GROWTH,
    score: scoreGrowthRate(epsGrowth, {
      excellent: 0.25,
      strong: 0.10,
      positive: 0.02,
      severeDecline: -0.20,
    }),
    confidence: 0.9,
    value: epsGrowth,
    summary:
      epsGrowth >= 0.10
        ? "Earnings growth is strong."
        : epsGrowth > 0
          ? "Earnings are improving."
          : epsGrowth < 0
            ? "Earnings are deteriorating."
            : "Earnings growth is flat.",
  });
}

function analyzeMargins(margins) {
  if (!margins || typeof margins !== "object") return null;

  const gross = firstFinite(margins.grossMargin);
  const operating = firstFinite(margins.operatingMargin);
  const net = firstFinite(margins.netMargin);
  const usable = [gross, operating, net].filter(isFiniteNumber);

  if (usable.length === 0) return null;

  const normalizedScores = [];

  if (gross !== null) {
    normalizedScores.push(
      gross >= 0.60 ? 1 : gross >= 0.40 ? 0.75 : gross >= 0.25 ? 0.4 : gross > 0 ? 0.1 : -0.8,
    );
  }

  if (operating !== null) {
    normalizedScores.push(
      operating >= 0.25 ? 1 : operating >= 0.15 ? 0.75 : operating >= 0.08 ? 0.4 : operating > 0 ? 0.1 : -0.9,
    );
  }

  if (net !== null) {
    normalizedScores.push(
      net >= 0.20 ? 1 : net >= 0.10 ? 0.7 : net >= 0.05 ? 0.35 : net > 0 ? 0.1 : -0.9,
    );
  }

  let score = normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length;
  const trend = normalizeText(margins.trend ?? margins.marginTrend);

  if (["IMPROVING", "RISING", "EXPANDING"].includes(trend)) score += 0.12;
  if (["WORSENING", "FALLING", "COMPRESSING"].includes(trend)) score -= 0.15;

  return createEvidence({
    factor: "MARGINS",
    pillar: FUNDAMENTAL_PILLAR.PROFITABILITY,
    score,
    confidence: 0.88,
    value: { grossMargin: gross, operatingMargin: operating, netMargin: net, trend: trend || null },
    summary:
      score >= 0.6
        ? "Profitability margins are strong."
        : score >= 0
          ? "Profitability is positive but not exceptional."
          : "Profitability margins are weak.",
  });
}

function analyzeReturns({ profitability = null, returns = null } = {}) {
  const source = returns ?? profitability;
  if (!source || typeof source !== "object") return null;

  const roe = firstFinite(source.roe, source.returnOnEquity);
  const roa = firstFinite(source.roa, source.returnOnAssets);
  const roic = firstFinite(source.roic, source.returnOnInvestedCapital);

  const evidence = [];
  if (roe !== null) evidence.push(roe >= 0.25 ? 1 : roe >= 0.15 ? 0.7 : roe >= 0.08 ? 0.3 : roe > 0 ? 0.1 : -0.8);
  if (roa !== null) evidence.push(roa >= 0.12 ? 1 : roa >= 0.07 ? 0.65 : roa >= 0.03 ? 0.25 : roa > 0 ? 0.1 : -0.8);
  if (roic !== null) evidence.push(roic >= 0.20 ? 1 : roic >= 0.12 ? 0.7 : roic >= 0.07 ? 0.3 : roic > 0 ? 0.1 : -0.8);

  if (evidence.length === 0) return null;

  const score = evidence.reduce((a, b) => a + b, 0) / evidence.length;
  return createEvidence({
    factor: "CAPITAL_RETURNS",
    pillar: FUNDAMENTAL_PILLAR.PROFITABILITY,
    score,
    confidence: 0.82,
    value: { roe, roa, roic },
    summary: score >= 0.6 ? "Returns on capital are strong." : score >= 0 ? "Returns on capital are acceptable." : "Returns on capital are weak.",
  });
}

function analyzeFreeCashFlow(freeCashFlow) {
  if (!freeCashFlow || typeof freeCashFlow !== "object") return null;

  const value = firstFinite(freeCashFlow.value, freeCashFlow.freeCashFlow);
  if (value === null) return null;

  const growth = firstFinite(freeCashFlow.growth, freeCashFlow.growthYoY);
  const margin = firstFinite(freeCashFlow.margin, freeCashFlow.freeCashFlowMargin);

  let score = value > 0 ? 0.45 : -0.85;
  if (growth !== null) score += growth >= 0.20 ? 0.35 : growth > 0 ? 0.18 : growth < -0.10 ? -0.3 : growth < 0 ? -0.15 : 0;
  if (margin !== null) score += margin >= 0.20 ? 0.20 : margin >= 0.10 ? 0.10 : margin < 0 ? -0.2 : margin < 0.05 ? -0.1 : 0;

  return createEvidence({
    factor: "FREE_CASH_FLOW",
    pillar: FUNDAMENTAL_PILLAR.CASH_FLOW,
    score,
    confidence: 0.95,
    value: { value, growth, margin },
    summary: value > 0 ? "The company generates positive free cash flow." : "The company is consuming free cash flow.",
  });
}

function analyzeOperatingCashFlow(operatingCashFlow) {
  if (!operatingCashFlow || typeof operatingCashFlow !== "object") return null;

  const growth = firstFinite(operatingCashFlow.growth, operatingCashFlow.growthYoY);
  const value = firstFinite(operatingCashFlow.value, operatingCashFlow.operatingCashFlow);

  if (growth === null && value === null) return null;

  let score = 0;
  if (growth !== null) score = growth >= 0.15 ? 0.9 : growth > 0 ? 0.45 : growth <= -0.15 ? -0.9 : growth < 0 ? -0.4 : 0;
  else score = value > 0 ? 0.35 : -0.7;

  return createEvidence({
    factor: "OPERATING_CASH_FLOW",
    pillar: FUNDAMENTAL_PILLAR.CASH_FLOW,
    score,
    confidence: 0.82,
    value: { value, growth },
    summary: score > 0 ? "Operating cash flow is supportive." : score < 0 ? "Operating cash flow is weakening." : "Operating cash flow is neutral.",
  });
}

function analyzeCashConversion({ freeCashFlow = null, earnings = null, cashFlowQuality = null } = {}) {
  const explicit = firstFinite(cashFlowQuality?.cashConversion, cashFlowQuality?.ratio);
  const fcf = firstFinite(freeCashFlow?.value);
  const netIncome = firstFinite(earnings?.netIncome);
  const ratio = explicit ?? (fcf !== null && netIncome !== null && netIncome !== 0 ? fcf / netIncome : null);

  if (ratio === null) return null;

  const score = ratio >= 1 ? 0.9 : ratio >= 0.8 ? 0.6 : ratio >= 0.5 ? 0.15 : ratio >= 0 ? -0.35 : -0.8;

  return createEvidence({
    factor: "CASH_CONVERSION",
    pillar: FUNDAMENTAL_PILLAR.CASH_FLOW,
    score,
    confidence: 0.78,
    value: ratio,
    summary: score >= 0.6 ? "Reported earnings convert well into cash." : score >= 0 ? "Cash conversion is adequate." : "Cash conversion is weak.",
  });
}

function analyzeDebt(debt) {
  if (!debt || typeof debt !== "object") return null;

  const debtToEquity = firstFinite(debt.debtToEquity);
  const netDebtToEbitda = firstFinite(debt.netDebtToEbitda);
  const scores = [];

  if (debtToEquity !== null) scores.push(debtToEquity <= 0.5 ? 0.8 : debtToEquity <= 1 ? 0.45 : debtToEquity <= 2 ? -0.25 : -0.8);
  if (netDebtToEbitda !== null) scores.push(netDebtToEbitda <= 1 ? 0.85 : netDebtToEbitda <= 2 ? 0.4 : netDebtToEbitda <= 3 ? -0.25 : -0.9);

  if (scores.length === 0) return null;
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;

  return createEvidence({
    factor: "DEBT_BURDEN",
    pillar: FUNDAMENTAL_PILLAR.BALANCE_SHEET,
    score,
    confidence: 0.88,
    value: { debtToEquity, netDebtToEbitda },
    summary: score > 0.4 ? "Debt levels appear manageable." : score < -0.4 ? "Debt burden is elevated." : "Debt levels are moderate.",
  });
}

function analyzeLiquidityRatios(balanceSheet) {
  if (!balanceSheet || typeof balanceSheet !== "object") return null;

  const currentRatio = firstFinite(balanceSheet.currentRatio);
  const quickRatio = firstFinite(balanceSheet.quickRatio);
  const netDebt = firstFinite(balanceSheet.netDebt);
  const scores = [];

  if (currentRatio !== null) scores.push(currentRatio >= 2 ? 0.8 : currentRatio >= 1.2 ? 0.5 : currentRatio >= 1 ? 0.1 : -0.7);
  if (quickRatio !== null) scores.push(quickRatio >= 1.5 ? 0.8 : quickRatio >= 1 ? 0.45 : quickRatio >= 0.7 ? 0 : -0.7);
  if (netDebt !== null) scores.push(netDebt <= 0 ? 0.7 : 0);

  if (scores.length === 0) return null;
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;

  return createEvidence({
    factor: "BALANCE_SHEET_LIQUIDITY",
    pillar: FUNDAMENTAL_PILLAR.BALANCE_SHEET,
    score,
    confidence: 0.78,
    value: { currentRatio, quickRatio, netDebt },
    summary: score >= 0.5 ? "Near-term balance-sheet liquidity is strong." : score >= 0 ? "Balance-sheet liquidity is adequate." : "Balance-sheet liquidity is weak.",
  });
}

function analyzeInterestCoverage(interestCoverage) {
  if (!interestCoverage || typeof interestCoverage !== "object") return null;
  const ratio = firstFinite(interestCoverage.ratio, interestCoverage.interestCoverage);
  if (ratio === null) return null;

  const score = ratio >= 8 ? 1 : ratio >= 4 ? 0.7 : ratio >= 2 ? 0.2 : ratio >= 1 ? -0.5 : -1;

  return createEvidence({
    factor: "INTEREST_COVERAGE",
    pillar: FUNDAMENTAL_PILLAR.BALANCE_SHEET,
    score,
    confidence: 0.9,
    value: ratio,
    summary: ratio >= 4 ? "The company has strong ability to service interest expense." : ratio >= 2 ? "Interest coverage is adequate." : "Debt-service capacity is weak.",
  });
}

function valuationMetricScore(value, thresholds) {
  if (!isFiniteNumber(value)) return null;
  const v = Number(value);
  if (v <= 0) return null;

  if (v <= thresholds.cheap) return 0.9;
  if (v <= thresholds.fair) return 0.35;
  if (v <= thresholds.expensive) return -0.3;
  return -0.8;
}

function analyzeValuation(valuation) {
  if (!valuation || typeof valuation !== "object") return null;

  const explicitScore = firstFinite(valuation.score, valuation.valuationScore);
  const scores = [];

  if (explicitScore !== null) scores.push(clamp(explicitScore, -1, 1));

  const pe = firstFinite(valuation.pe, valuation.trailingPE, valuation.priceToEarnings);
  const forwardPe = firstFinite(valuation.forwardPE, valuation.forwardPe);
  const peg = firstFinite(valuation.peg, valuation.pegRatio);
  const ps = firstFinite(valuation.priceToSales, valuation.ps);
  const evEbitda = firstFinite(valuation.evToEbitda, valuation.evEbitda);
  const priceToFcf = firstFinite(valuation.priceToFCF, valuation.priceToFcf);
  const fcfYield = firstFinite(valuation.fcfYield, valuation.freeCashFlowYield);

  const peScore = valuationMetricScore(pe, { cheap: 15, fair: 25, expensive: 40 });
  const forwardPeScore = valuationMetricScore(forwardPe, { cheap: 15, fair: 25, expensive: 40 });
  const pegScore = valuationMetricScore(peg, { cheap: 1, fair: 1.8, expensive: 3 });
  const psScore = valuationMetricScore(ps, { cheap: 2, fair: 5, expensive: 10 });
  const evEbitdaScore = valuationMetricScore(evEbitda, { cheap: 10, fair: 18, expensive: 30 });
  const pFcfScore = valuationMetricScore(priceToFcf, { cheap: 15, fair: 25, expensive: 40 });

  for (const s of [peScore, forwardPeScore, pegScore, psScore, evEbitdaScore, pFcfScore]) {
    if (s !== null) scores.push(s);
  }

  if (fcfYield !== null) {
    scores.push(fcfYield >= 0.08 ? 0.9 : fcfYield >= 0.04 ? 0.4 : fcfYield >= 0.02 ? -0.2 : -0.7);
  }

  if (scores.length === 0) return null;
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;

  return createEvidence({
    factor: "VALUATION",
    pillar: FUNDAMENTAL_PILLAR.VALUATION,
    score,
    confidence: explicitScore !== null ? 0.82 : 0.68,
    value: { pe, forwardPe, peg, priceToSales: ps, evToEbitda: evEbitda, priceToFCF: priceToFcf, fcfYield, explicitScore },
    summary: score >= 0.45 ? "Valuation appears attractive." : score <= -0.45 ? "Valuation appears expensive." : "Valuation appears broadly balanced.",
  });
}

function analyzeCapitalAllocation(capitalAllocation) {
  if (!capitalAllocation || typeof capitalAllocation !== "object") return null;

  const shareChange = firstFinite(capitalAllocation.shareCountChange, capitalAllocation.shareChangeYoY);
  const buybackYield = firstFinite(capitalAllocation.buybackYield);
  const dividendYield = firstFinite(capitalAllocation.dividendYield);
  const payoutRatio = firstFinite(capitalAllocation.payoutRatio);
  const stockBasedComp = firstFinite(capitalAllocation.stockBasedCompensationRatio, capitalAllocation.sbcToRevenue);
  const scores = [];

  if (shareChange !== null) scores.push(shareChange <= -0.03 ? 0.8 : shareChange < 0 ? 0.4 : shareChange <= 0.02 ? 0 : shareChange <= 0.05 ? -0.35 : -0.75);
  if (buybackYield !== null) scores.push(buybackYield >= 0.03 ? 0.65 : buybackYield > 0 ? 0.25 : 0);
  if (dividendYield !== null) scores.push(dividendYield >= 0.02 ? 0.3 : 0);
  if (payoutRatio !== null) scores.push(payoutRatio > 1 ? -0.7 : payoutRatio >= 0 && payoutRatio <= 0.75 ? 0.25 : 0);
  if (stockBasedComp !== null) scores.push(stockBasedComp <= 0.03 ? 0.4 : stockBasedComp <= 0.08 ? 0 : -0.55);

  if (scores.length === 0) return null;
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;

  return createEvidence({
    factor: "CAPITAL_ALLOCATION",
    pillar: FUNDAMENTAL_PILLAR.BALANCE_SHEET,
    score,
    confidence: 0.70,
    value: { shareChange, buybackYield, dividendYield, payoutRatio, stockBasedCompensationRatio: stockBasedComp },
    summary: score >= 0.4 ? "Capital allocation is shareholder-supportive." : score <= -0.4 ? "Capital allocation is dilutive or inefficient." : "Capital allocation is broadly neutral.",
  });
}

function analyzeEarningsSurprise(earningsSurprise) {
  if (!earningsSurprise || typeof earningsSurprise !== "object") return null;
  const percent = firstFinite(earningsSurprise.percent, earningsSurprise.surprisePercent);
  if (percent === null) return null;

  const score = percent >= 0.10 ? 1 : percent >= 0.05 ? 0.75 : percent > 0 ? 0.4 : percent <= -0.10 ? -1 : percent <= -0.05 ? -0.75 : percent < 0 ? -0.3 : 0;

  return createEvidence({
    factor: "EARNINGS_SURPRISE",
    pillar: FUNDAMENTAL_PILLAR.FORWARD_OUTLOOK,
    score,
    confidence: 0.82,
    value: percent,
    summary: percent > 0 ? "Earnings exceeded expectations." : percent < 0 ? "Earnings missed expectations." : "Earnings matched expectations.",
  });
}

function analyzeGuidance(guidance) {
  if (!guidance || typeof guidance !== "object") return null;
  const direction = normalizeText(guidance.direction);
  const strength = clamp(firstFinite(guidance.strength) ?? 0.6, 0, 1);

  if (["RAISED", "POSITIVE", "IMPROVING"].includes(direction)) {
    return createEvidence({ factor: "GUIDANCE", pillar: FUNDAMENTAL_PILLAR.FORWARD_OUTLOOK, score: 0.85, confidence: strength, value: direction, summary: "Management guidance is positive." });
  }
  if (["LOWERED", "NEGATIVE", "WEAKENING"].includes(direction)) {
    return createEvidence({ factor: "GUIDANCE", pillar: FUNDAMENTAL_PILLAR.FORWARD_OUTLOOK, score: -0.9, confidence: strength, value: direction, summary: "Management guidance has weakened." });
  }
  if (["MAINTAINED", "NEUTRAL", "UNCHANGED"].includes(direction)) {
    return createEvidence({ factor: "GUIDANCE", pillar: FUNDAMENTAL_PILLAR.FORWARD_OUTLOOK, score: 0, confidence: strength, value: direction, summary: "Management guidance is unchanged." });
  }
  return null;
}

function analyzeForwardEstimates(forward) {
  if (!forward || typeof forward !== "object") return null;

  const rev = firstFinite(forward.revenueGrowthEstimate, forward.revenueGrowth);
  const eps = firstFinite(forward.epsGrowthEstimate, forward.epsGrowth);
  const revisions = normalizeText(forward.estimateRevisionDirection ?? forward.revisions);
  const scores = [];

  const revScore = scoreGrowthRate(rev, { excellent: 0.15, strong: 0.08, positive: 0.02, severeDecline: -0.10 });
  const epsScore = scoreGrowthRate(eps, { excellent: 0.20, strong: 0.10, positive: 0.02, severeDecline: -0.15 });
  if (revScore !== null) scores.push(revScore);
  if (epsScore !== null) scores.push(epsScore);
  if (["UP", "POSITIVE", "RISING", "IMPROVING"].includes(revisions)) scores.push(0.65);
  if (["DOWN", "NEGATIVE", "FALLING", "DETERIORATING"].includes(revisions)) scores.push(-0.7);
  if (["FLAT", "NEUTRAL", "UNCHANGED"].includes(revisions)) scores.push(0);

  if (scores.length === 0) return null;
  const score = scores.reduce((a, b) => a + b, 0) / scores.length;

  return createEvidence({
    factor: "FORWARD_ESTIMATES",
    pillar: FUNDAMENTAL_PILLAR.FORWARD_OUTLOOK,
    score,
    confidence: 0.72,
    value: { revenueGrowthEstimate: rev, epsGrowthEstimate: eps, estimateRevisionDirection: revisions || null },
    summary: score >= 0.4 ? "Forward estimates are supportive." : score <= -0.4 ? "Forward estimates are deteriorating." : "Forward estimates are mixed or neutral.",
  });
}

function analyzeBusinessQuality(businessQuality) {
  if (!businessQuality || typeof businessQuality !== "object") return null;
  const score100 = firstFinite(businessQuality.score, businessQuality.qualityScore);
  const normalized = score100 === null ? null : score100 > 1 ? (score100 / 50) - 1 : clamp(score100, -1, 1);
  if (normalized === null) return null;

  return createEvidence({
    factor: "BUSINESS_QUALITY",
    pillar: FUNDAMENTAL_PILLAR.FORWARD_OUTLOOK,
    score: normalized,
    confidence: clamp(firstFinite(businessQuality.confidence) ?? 0.65, 0, 1),
    value: businessQuality,
    summary: normalized >= 0.4 ? "Business quality and competitive position are strong." : normalized <= -0.4 ? "Business quality is weak or highly vulnerable." : "Business quality is mixed.",
  });
}

function analyzeEconomicSensitivity({ sensitivity, macro, country }) {
  if (!sensitivity || typeof sensitivity !== "object") return null;

  const recession = clamp(firstFinite(sensitivity.recession) ?? 0, 0, 1);
  const rates = clamp(firstFinite(sensitivity.interestRates, sensitivity.rates) ?? 0, 0, 1);
  const consumer = clamp(firstFinite(sensitivity.consumer) ?? 0, 0, 1);
  const currency = clamp(firstFinite(sensitivity.currency) ?? 0, 0, 1);
  const trade = clamp(firstFinite(sensitivity.trade) ?? 0, 0, 1);

  let score = 0;
  let weight = 0;

  const recessionRisk = firstFinite(macro?.recessionRisk?.score);
  if (recessionRisk !== null && recession > 0) {
    score += -(recessionRisk / 100) * recession;
    weight += recession;
  }

  const macroScore = firstFinite(macro?.rawScore);
  if (macroScore !== null && rates > 0) {
    score += macroScore * rates * 0.5;
    weight += rates * 0.5;
  }

  const countryScore = firstFinite(country?.rawScore);
  const combinedExposure = (consumer + currency + trade) / 3;
  if (countryScore !== null && combinedExposure > 0) {
    score += countryScore * combinedExposure;
    weight += combinedExposure;
  }

  if (weight <= 0) return null;

  const normalized = clamp(score / weight, -1, 1);
  return createEvidence({
    factor: "ECONOMIC_SENSITIVITY",
    pillar: FUNDAMENTAL_PILLAR.ECONOMIC_EXPOSURE,
    score: normalized,
    confidence: clamp(weight / 3, 0, 1),
    value: { recession, rates, consumer, currency, trade },
    summary: normalized >= 0.25 ? "Current economic conditions are supportive for this company's exposure profile." : normalized <= -0.25 ? "Current economic conditions pressure this company's exposure profile." : "Economic exposure is currently mixed.",
  });
}

function combineEvidence(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { score: null, confidence: 0, evidenceCount: 0 };
  }

  let numerator = 0;
  let denominator = 0;
  for (const item of items) {
    const confidence = clamp(item?.confidence ?? 0, 0, 1);
    numerator += Number(item?.score ?? 0) * confidence;
    denominator += confidence;
  }

  if (denominator <= 0) return { score: null, confidence: 0, evidenceCount: items.length };

  return {
    score: round(clamp(numerator / denominator, -1, 1), 4),
    confidence: round(clamp(denominator / items.length, 0, 1), 4),
    evidenceCount: items.length,
  };
}

function buildPillars(evidence, weights) {
  const pillars = {};

  for (const [key, weight] of Object.entries(weights)) {
    const items = evidence.filter(item => item.pillar === key);
    const combined = combineEvidence(items);
    const score100 = combined.score === null ? null : round(((combined.score + 1) / 2) * 100, 2);

    const maximumPoints =
      round(Number(weight) * FUNDAMENTAL_MAXIMUM_SCORE, 4);

    const pointsEarned =
      combined.score === null
        ? null
        : round(((combined.score + 1) / 2) * maximumPoints, 4);

    pillars[key] = {
      key,
      label: PILLAR_LABELS[key] ?? key,
      weight,
      maximumPoints,
      pointsEarned,
      available: items.length > 0 && combined.score !== null,
      score: score100,
      percentage: score100,
      rawScore: combined.score,
      confidence: combined.confidence,
      evidenceCount: items.length,
      evidence: items,
    };
  }

  return pillars;
}

function combinePillars(pillars, weights) {
  let weightedScore = 0;
  let availableWeight = 0;
  let weightedConfidence = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const pillar = pillars[key];
    if (!pillar?.available || !isFiniteNumber(pillar.rawScore)) continue;

    weightedScore += Number(pillar.rawScore) * weight;
    weightedConfidence += Number(pillar.confidence ?? 0) * weight;
    availableWeight += weight;
  }

  if (availableWeight <= 0) {
    return { rawScore: null, confidence: 0, coverage: 0 };
  }

  return {
    rawScore: round(clamp(weightedScore / availableWeight, -1, 1), 4),
    confidence: round(clamp(weightedConfidence / availableWeight, 0, 1), 4),
    coverage: round(clamp(availableWeight, 0, 1), 4),
  };
}

function determineDirection(rawScore) {
  if (!isFiniteNumber(rawScore)) return COMPANY_DIRECTION.UNKNOWN;
  const value = Number(rawScore);
  if (value >= 0.65) return COMPANY_DIRECTION.STRONG_BULLISH;
  if (value >= 0.20) return COMPANY_DIRECTION.BULLISH;
  if (value <= -0.65) return COMPANY_DIRECTION.STRONG_BEARISH;
  if (value <= -0.20) return COMPANY_DIRECTION.BEARISH;
  return COMPANY_DIRECTION.NEUTRAL;
}

function determineHealth(qualityScore) {
  if (!isFiniteNumber(qualityScore)) return FUNDAMENTAL_HEALTH.UNKNOWN;
  const value = Number(qualityScore);
  if (value >= 85) return FUNDAMENTAL_HEALTH.EXCELLENT;
  if (value >= 70) return FUNDAMENTAL_HEALTH.STRONG;
  if (value >= 45) return FUNDAMENTAL_HEALTH.FAIR;
  if (value >= 25) return FUNDAMENTAL_HEALTH.WEAK;
  return FUNDAMENTAL_HEALTH.DISTRESSED;
}

function calculateDirectionalSupport(rawScore) {
  if (!isFiniteNumber(rawScore)) {
    return { long: null, short: null };
  }

  const value = clamp(rawScore, -1, 1);
  return {
    long: round((value + 1) / 2, 4),
    short: round((1 - value) / 2, 4),
  };
}

function deriveFundamentalMomentum(evidence) {
  const momentumFactors = new Set([
    "REVENUE_GROWTH",
    "EARNINGS_GROWTH",
    "FREE_CASH_FLOW",
    "OPERATING_CASH_FLOW",
    "MARGINS",
    "EARNINGS_SURPRISE",
    "GUIDANCE",
    "FORWARD_ESTIMATES",
  ]);

  const combined = combineEvidence(evidence.filter(item => momentumFactors.has(item.factor)));
  if (combined.score === null) {
    return { available: false, score: null, rawScore: null, direction: "UNKNOWN" };
  }

  return {
    available: true,
    score: round(((combined.score + 1) / 2) * 100, 2),
    rawScore: combined.score,
    direction: combined.score >= 0.20 ? "IMPROVING" : combined.score <= -0.20 ? "DETERIORATING" : "STABLE",
  };
}

function summarizeStrengthsWeaknesses(evidence) {
  const sorted = [...evidence].sort((a, b) => Math.abs(Number(b.score)) - Math.abs(Number(a.score)));
  const strengths = sorted.filter(item => Number(item.score) >= 0.30).slice(0, 5).map(item => item.summary);
  const weaknesses = sorted.filter(item => Number(item.score) <= -0.30).slice(0, 5).map(item => item.summary);
  return { strengths, weaknesses };
}

export function analyzeCompanyFundamentals({
  symbol = null,
  sector = null,
  industry = null,
  countryCode = null,
  revenue = null,
  earnings = null,
  freeCashFlow = null,
  operatingCashFlow = null,
  margins = null,
  profitability = null,
  returns = null,
  cashFlowQuality = null,
  debt = null,
  balanceSheet = null,
  interestCoverage = null,
  earningsSurprise = null,
  guidance = null,
  valuation = null,
  capitalAllocation = null,
  forward = null,
  businessQuality = null,
  sensitivity = null,
  macro = null,
  country = null,
  fundamentalCoverage = null,
  pillarWeights = DEFAULT_FUNDAMENTAL_PILLAR_WEIGHTS,
} = {}) {
  const timestamp = now();

  try {
    const evidence = [
      analyzeRevenue(revenue),
      analyzeEarnings(earnings),
      analyzeMargins(margins),
      analyzeReturns({ profitability, returns }),
      analyzeFreeCashFlow(freeCashFlow),
      analyzeOperatingCashFlow(operatingCashFlow),
      analyzeCashConversion({ freeCashFlow, earnings, cashFlowQuality }),
      analyzeDebt(debt),
      analyzeLiquidityRatios(balanceSheet),
      analyzeInterestCoverage(interestCoverage),
      analyzeValuation(valuation),
      analyzeCapitalAllocation(capitalAllocation),
      analyzeEarningsSurprise(earningsSurprise),
      analyzeGuidance(guidance),
      analyzeForwardEstimates(forward),
      analyzeBusinessQuality(businessQuality),
      analyzeEconomicSensitivity({ sensitivity, macro, country }),
    ].filter(Boolean);

    if (evidence.length === 0) {
      return {
        approved: false,
        engine: "COMPANY_FUNDAMENTALS",
        status: "INSUFFICIENT_DATA",
        symbol,
        sector,
        industry,
        countryCode,
        direction: COMPANY_DIRECTION.UNKNOWN,
        health: FUNDAMENTAL_HEALTH.UNKNOWN,
        confidence: 0,
        rawScore: null,
        qualityScore: null,
        fundamentalQualityScore: null,
        fundamentalScore: null,
        score: null,
        scorePercentage: null,
        fundamentalMomentum: { available: false, score: null, rawScore: null, direction: "UNKNOWN" },
        directionalSupport: { long: null, short: null },
        coverage: 0,
        dataCoverage: 0,
        pillars: {},
        evidence: [],
        strengths: [],
        weaknesses: [],
        summary: "No usable company fundamental data was supplied.",
        warnings: ["No usable company fundamental data was supplied."],
        errors: [],
        maximumScore: FUNDAMENTAL_MAXIMUM_SCORE,
        timestamp,
      };
    }

    const pillars = buildPillars(evidence, pillarWeights);
    const combined = combinePillars(pillars, pillarWeights);
    const qualityScore =
      combined.rawScore === null
        ? null
        : round(((combined.rawScore + 1) / 2) * 100, 2);

    const fundamentalScore =
      qualityScore === null
        ? null
        : round((qualityScore / 100) * FUNDAMENTAL_MAXIMUM_SCORE, 4);

    const direction = determineDirection(combined.rawScore);
    const health = determineHealth(qualityScore);
    const directionalSupport = calculateDirectionalSupport(combined.rawScore);
    const fundamentalMomentum = deriveFundamentalMomentum(evidence);
    const { strengths, weaknesses } = summarizeStrengthsWeaknesses(evidence);

    const aggregatorCoverage = firstFinite(
      fundamentalCoverage?.coverage,
      fundamentalCoverage?.ratio,
      fundamentalCoverage?.dataCoverage,
    );

    const dataCoverage = aggregatorCoverage !== null
      ? round(clamp(aggregatorCoverage, 0, 1), 4)
      : combined.coverage;

    const confidence = round(clamp(combined.confidence * (0.55 + 0.45 * dataCoverage), 0, 1), 4);
    const warnings = [];

    if (dataCoverage < 0.50) warnings.push("Fundamental data coverage is below 50%; company confidence is reduced.");
    if (evidence.length < 5) warnings.push("Company analysis is based on fewer than five usable fundamental indicators.");
    if (health === FUNDAMENTAL_HEALTH.DISTRESSED) warnings.push("Company fundamentals indicate financial distress.");
    if (pillars.valuation && !pillars.valuation.available) warnings.push("Valuation evidence is unavailable; directional company support excludes valuation.");

    const symbolLabel = symbol ? String(symbol).toUpperCase() : "COMPANY";
    const status = dataCoverage >= 0.65 && evidence.length >= 5 ? "COMPLETE" : "PARTIAL";

    const summary =
      `${symbolLabel} fundamental score is ${
        fundamentalScore === null
          ? "unavailable"
          : `${fundamentalScore.toFixed(2)}/${FUNDAMENTAL_MAXIMUM_SCORE} (${qualityScore.toFixed(1)}%)`
      } (${health.toLowerCase()}) with a ${
        direction.replaceAll("_", " ").toLowerCase()
      } directional bias. Data coverage is ${(dataCoverage * 100).toFixed(0)}%.`;

    return {
      approved: true,
      engine: "COMPANY_FUNDAMENTALS",
      status,
      symbol,
      sector,
      industry,
      countryCode,
      direction,
      health,
      confidence,
      rawScore: combined.rawScore,
      qualityScore,
      fundamentalQualityScore: qualityScore,
      fundamentalScore,
      score: fundamentalScore,
      scorePercentage: qualityScore,
      fundamentalMomentum,
      directionalSupport,
      coverage: dataCoverage,
      dataCoverage,
      pillarCoverage: combined.coverage,
      pillars,
      evidence,
      strengths,
      weaknesses,
      summary,
      warnings,
      errors: [],
      maximumScore: FUNDAMENTAL_MAXIMUM_SCORE,
      timestamp,
    };
  } catch (error) {
    return {
      approved: false,
      engine: "COMPANY_FUNDAMENTALS",
      status: "ERROR",
      symbol,
      sector,
      industry,
      countryCode,
      direction: COMPANY_DIRECTION.UNKNOWN,
      health: FUNDAMENTAL_HEALTH.UNKNOWN,
      confidence: 0,
      rawScore: null,
      qualityScore: null,
      fundamentalQualityScore: null,
      fundamentalScore: null,
      score: null,
      scorePercentage: null,
      fundamentalMomentum: { available: false, score: null, rawScore: null, direction: "UNKNOWN" },
      directionalSupport: { long: null, short: null },
      coverage: 0,
      dataCoverage: 0,
      pillars: {},
      evidence: [],
      strengths: [],
      weaknesses: [],
      summary: "Company fundamental analysis failed safely. No fundamental directional evidence should be awarded.",
      warnings: ["Company engine failure should reduce confidence in the final decision."],
      errors: [error instanceof Error ? error.message : String(error)],
      maximumScore: FUNDAMENTAL_MAXIMUM_SCORE,
      timestamp,
    };
  }
}

export default analyzeCompanyFundamentals;
