/**
 * AEMA Crypto — Final Market & Risk Revalidation
 * Phase 6.49
 *
 * Last validity/safety gate after Qualification 2.
 *
 * IMPORTANT:
 * - fresh evidence only
 * - missing required evidence fails closed
 * - bounded future clock skew only
 * - does not execute an order
 * - does not grant live execution
 * - may only declare a candidate eligible for the NEXT paper-authority gate
 */

const DEFAULTS = Object.freeze({
  maxMeasurementAgeMs: 120_000,
  maxFutureClockSkewMs: 5_000,
  minVolume24hUsd: 50_000,
  minLiquidityUsd: 25_000,
  maxSpreadPct: 3,
  maxPriceDriftPct: 4,
  minRiskScore: 45,
  minRiskConfidence: 40,
  requireTradable: true,
  requireVenue: true,
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function boolOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const n = numberOrNull(value);
    if (n !== null) return n;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return null;
}

function parseTime(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function fail(code, detail = null) {
  return { code, detail };
}

function normalizeDirection(value) {
  const d = String(value || "").toUpperCase();
  return d === "LONG" || d === "SHORT" ? d : "NO_TRADE";
}

function measurementView(fresh = {}) {
  const m = fresh?.measurements ?? fresh;

  return {
    priceUsd: firstNumber(m?.priceUsd, m?.price, fresh?.priceUsd, fresh?.price),
    volume24hUsd: firstNumber(
      m?.volume24hUsd, m?.volume24h, fresh?.volume24hUsd, fresh?.volume24h,
    ),
    liquidityUsd: firstNumber(
      m?.liquidityUsd, m?.liquidity, fresh?.liquidityUsd, fresh?.liquidity,
    ),
    spreadPct: firstNumber(
      m?.spreadPct, m?.spreadPercentage, fresh?.spreadPct, fresh?.spreadPercentage,
    ),
    tradable: boolOrNull(m?.tradable) ?? boolOrNull(fresh?.tradable),
    venue: firstText(m?.primaryVenue, m?.venue, fresh?.primaryVenue, fresh?.venue),
    timestamp: firstText(
      m?.measuredAt, m?.timestamp, m?.updatedAt, m?.lastUpdated,
      fresh?.measuredAt, fresh?.timestamp, fresh?.updatedAt, fresh?.lastUpdated,
    ),
  };
}

function riskView(freshRisk = {}) {
  const available =
    freshRisk?.availability?.available === true ||
    freshRisk?.available === true ||
    String(freshRisk?.status || "").toUpperCase() === "READY";

  return {
    available,
    score: firstNumber(freshRisk?.score),
    confidence: firstNumber(freshRisk?.confidence, freshRisk?.evidenceConfidence),
    status: freshRisk?.status ?? null,
  };
}

export function revalidateCryptoOpportunity({
  candidate = {},
  qualification2 = candidate?.qualification2 ?? null,
  freshMeasurements = null,
  freshRisk = null,
  nowMs = Date.now(),
  options = {},
} = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const failures = [];
  const warnings = [];

  if (qualification2?.qualified !== true) {
    failures.push(fail(
      "QUALIFICATION_2_REQUIRED",
      "Candidate must pass Qualification 2 before final revalidation.",
    ));
  }

  const direction = normalizeDirection(qualification2?.decision);
  if (direction === "NO_TRADE") {
    failures.push(fail("QUALIFICATION_2_DIRECTION_REQUIRED", qualification2?.decision ?? null));
  }

  if (!freshMeasurements) {
    failures.push(fail(
      "FRESH_MARKET_MEASUREMENTS_REQUIRED",
      "No fresh market measurement snapshot was supplied.",
    ));
  }

  const market = measurementView(freshMeasurements ?? {});
  const risk = riskView(freshRisk ?? {});

  const measuredAt = parseTime(market.timestamp);
  const signedAgeMs = measuredAt === null ? null : nowMs - measuredAt;
  const futureSkewMs =
    signedAgeMs !== null && signedAgeMs < 0 ? Math.abs(signedAgeMs) : 0;
  const ageMs =
    signedAgeMs === null ? null : Math.max(0, signedAgeMs);

  if (measuredAt === null) {
    failures.push(fail(
      "MARKET_DATA_TIMESTAMP_REQUIRED",
      "Freshness cannot be verified without a measurement timestamp.",
    ));
  } else if (futureSkewMs > cfg.maxFutureClockSkewMs) {
    failures.push(fail(
      "MARKET_DATA_TIMESTAMP_IN_FUTURE",
      {
        futureSkewMs,
        maximumFutureClockSkewMs: cfg.maxFutureClockSkewMs,
      },
    ));
  } else if (ageMs > cfg.maxMeasurementAgeMs) {
    failures.push(fail(
      "MARKET_DATA_STALE",
      { ageMs, maximumAgeMs: cfg.maxMeasurementAgeMs },
    ));
  }

  if (market.priceUsd === null || market.priceUsd <= 0) {
    failures.push(fail("LIVE_PRICE_REQUIRED", market.priceUsd));
  }

  if (market.volume24hUsd === null || market.volume24hUsd < cfg.minVolume24hUsd) {
    failures.push(fail(
      "LIVE_VOLUME_INSUFFICIENT",
      { actual: market.volume24hUsd, required: cfg.minVolume24hUsd },
    ));
  }

  if (market.liquidityUsd !== null && market.liquidityUsd < cfg.minLiquidityUsd) {
    failures.push(fail(
      "LIVE_LIQUIDITY_INSUFFICIENT",
      { actual: market.liquidityUsd, required: cfg.minLiquidityUsd },
    ));
  }

  if (market.spreadPct !== null && market.spreadPct > cfg.maxSpreadPct) {
    failures.push(fail(
      "LIVE_SPREAD_TOO_WIDE",
      { actual: market.spreadPct, maximum: cfg.maxSpreadPct },
    ));
  }

  if (cfg.requireTradable && market.tradable !== true) {
    failures.push(fail("ASSET_NOT_CONFIRMED_TRADABLE", market.tradable));
  }

  if (cfg.requireVenue && !market.venue) {
    failures.push(fail("EXECUTION_VENUE_REQUIRED", null));
  }

  const researchPrice = firstNumber(
    candidate?.measurements?.priceUsd,
    candidate?.priceUsd,
    candidate?.asset?.priceUsd,
    candidate?.asset?.price,
  );

  let priceDriftPct = null;

  if (researchPrice !== null && researchPrice > 0 && market.priceUsd !== null) {
    priceDriftPct = ((market.priceUsd - researchPrice) / researchPrice) * 100;

    if (Math.abs(priceDriftPct) > cfg.maxPriceDriftPct) {
      failures.push(fail(
        "PRICE_DRIFT_EXCEEDED",
        {
          researchPrice,
          currentPrice: market.priceUsd,
          driftPct: Number(priceDriftPct.toFixed(4)),
          maximumAbsoluteDriftPct: cfg.maxPriceDriftPct,
        },
      ));
    }
  } else {
    warnings.push(fail(
      "PRICE_DRIFT_NOT_COMPARABLE",
      "Research-time price was unavailable.",
    ));
  }

  if (!freshRisk) {
    failures.push(fail("FRESH_RISK_REVALIDATION_REQUIRED", null));
  } else if (!risk.available || risk.score === null) {
    failures.push(fail("FRESH_RISK_EVIDENCE_UNAVAILABLE", risk.status));
  } else {
    if (risk.score < cfg.minRiskScore) {
      failures.push(fail(
        "RISK_QUALITY_BELOW_MINIMUM",
        { actual: risk.score, required: cfg.minRiskScore },
      ));
    }

    if (risk.confidence === null || risk.confidence < cfg.minRiskConfidence) {
      failures.push(fail(
        "RISK_CONFIDENCE_INSUFFICIENT",
        { actual: risk.confidence, required: cfg.minRiskConfidence },
      ));
    }
  }

  const approved = failures.length === 0;

  return {
    engine: "CRYPTO_FINAL_MARKET_RISK_REVALIDATION",
    version: "6.49",
    status: approved ? "REVALIDATED" : "NO_TRADE",
    approved,
    decision: approved ? direction : "NO_TRADE",
    qualification2Decision: direction,
    market: {
      ...market,
      ageMs,
      signedAgeMs,
      futureSkewMs,
      maximumFutureClockSkewMs: cfg.maxFutureClockSkewMs,
      researchPriceUsd: researchPrice,
      priceDriftPct:
        priceDriftPct === null ? null : Number(priceDriftPct.toFixed(4)),
    },
    risk,
    failures,
    warnings,
    nextStage: approved ? "PAPER_EXECUTION_AUTHORITY_GATE" : "NONE",
    revalidationAuthority: true,
    paperExecutionAuthority: false,
    executionAuthority: false,
    liveExecution: false,
    researchOnly: true,
  };
}

export default revalidateCryptoOpportunity;
