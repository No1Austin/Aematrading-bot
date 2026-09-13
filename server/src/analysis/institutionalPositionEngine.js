// server/src/analysis/institutionalPositionEngine.js
//
// Canonical Institutional Position Engine.
//
// Goals:
// - fail closed when evidence is missing, invalid, future-dated, or too old;
// - expose a stable, frontend-friendly contract on EVERY return path;
// - preserve SEC and FINRA diagnostics without pretending FINRA short volume
//   is institutional ownership or short interest;
// - separate directional support (0..1) from global trade-scoring allocation;
// - explain exactly why evidence is or is not usable.

export const INSTITUTIONAL_POSITION_STATUS = Object.freeze({
  COMPLETE: "COMPLETE",
  PARTIAL: "PARTIAL",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
  STALE_DATA: "STALE_DATA",
  ERROR: "ERROR",
});

export const INSTITUTIONAL_POSITION_SIGNAL = Object.freeze({
  STRONG_ACCUMULATION: "STRONG_ACCUMULATION",
  ACCUMULATION: "ACCUMULATION",
  NEUTRAL: "NEUTRAL",
  DISTRIBUTION: "DISTRIBUTION",
  STRONG_DISTRIBUTION: "STRONG_DISTRIBUTION",
  INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
});

export const DEFAULT_INSTITUTIONAL_POSITION_CONFIG = Object.freeze({
  freshDays: 45,
  staleDays: 120,
  maximumAgeDays: 200,
  minimumInstitutions: 3,
  weights: Object.freeze({
    breadth: 0.35,
    netPositionChange: 0.30,
    newVsExited: 0.20,
    ownershipTrend: 0.15,
  }),
  strongThreshold: 0.72,
  directionalThreshold: 0.58,
});

const ENGINE = "INSTITUTIONAL_POSITION";
const SCHEMA_VERSION = "2.0";

function nowIso() {
  return new Date().toISOString();
}

function normalizeSymbol(value) {
  return String(value ?? "").trim().toUpperCase();
}

function finite(value) {
  return value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value));
}

function numberOrNull(value) {
  return finite(value) ? Number(value) : null;
}

function nonNegative(value) {
  const n = numberOrNull(value);
  return n !== null && n >= 0 ? n : 0;
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round(value, decimals = 4) {
  if (!finite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(a, b) {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

function ratioSigned(positive, negative) {
  const p = nonNegative(positive);
  const n = nonNegative(negative);
  const total = p + n;
  if (total <= 0) return 0;
  return clamp((p - n) / total, -1, 1);
}

function signedToLongSupport(score) {
  return clamp((Number(score) + 1) / 2);
}

function uniqueStrings(...values) {
  return [...new Set(
    values
      .flat(Infinity)
      .filter(value => typeof value === "string")
      .map(value => value.trim())
      .filter(Boolean),
  )];
}

function firstObject(...values) {
  return values.find(
    value => value && typeof value === "object" && !Array.isArray(value),
  ) ?? null;
}

function sourceState(raw, fallbackName) {
  const source = raw && typeof raw === "object" ? raw : null;
  const status = String(
    source?.status ??
    source?.providerStatus ??
    source?.state ??
    (source?.approved === true ? "AVAILABLE" : "UNAVAILABLE"),
  ).toUpperCase();

  const configured =
    source?.configured ??
    source?.isConfigured ??
    (status !== "NOT_CONFIGURED" && source !== null);

  const approved =
    source?.approved === true ||
    ["COMPLETE", "READY", "AVAILABLE", "PARTIAL"].includes(status);

  return {
    name: fallbackName,
    configured: Boolean(configured),
    supplied: source !== null,
    approved,
    status: source === null ? "UNAVAILABLE" : status,
    evidenceAt:
      source?.evidenceAt ??
      source?.publishedAt ??
      source?.filedAt ??
      null,
    reportingPeriodEnd: source?.reportingPeriodEnd ?? null,
    method: source?.method ?? null,
    managerCount:
      numberOrNull(source?.managerCount) ??
      numberOrNull(source?.institutionsEvaluated),
    warnings: uniqueStrings(source?.warnings),
    errors: uniqueStrings(source?.errors, source?.error),
  };
}

function extractSources(evidence) {
  const root = evidence && typeof evidence === "object" ? evidence : {};

  const sourceRoot = firstObject(
    root.sources,
    root.providers,
    root.sourceDiagnostics,
    root.providerDiagnostics,
  ) ?? {};

  const secRaw = firstObject(
    sourceRoot.sec,
    sourceRoot.SEC,
    root.sec,
    root.secEvidence,
    root.secProvider,
  );

  const finraRaw = firstObject(
    sourceRoot.finra,
    sourceRoot.FINRA,
    root.finra,
    root.finraEvidence,
    root.finraProvider,
  );

  return {
    sec: sourceState(secRaw, "SEC_EDGAR"),
    finra: sourceState(finraRaw, "FINRA_REG_SHO"),
  };
}

function getFreshness(evidenceAt, asOfTimestamp, config) {
  const evidenceDate = parseDate(evidenceAt);
  const asOfDate = parseDate(asOfTimestamp);

  if (!evidenceDate || !asOfDate) {
    return {
      approved: false,
      missingTimestamp: true,
      futureDated: false,
      stale: false,
      tooOld: false,
      ageDays: null,
      multiplier: 0,
    };
  }

  const ageDays = daysBetween(evidenceDate, asOfDate);

  if (ageDays < 0) {
    return {
      approved: false,
      missingTimestamp: false,
      futureDated: true,
      stale: false,
      tooOld: false,
      ageDays,
      multiplier: 0,
    };
  }

  if (ageDays > config.maximumAgeDays) {
    return {
      approved: false,
      missingTimestamp: false,
      futureDated: false,
      stale: true,
      tooOld: true,
      ageDays,
      multiplier: 0,
    };
  }

  if (ageDays <= config.freshDays) {
    return {
      approved: true,
      missingTimestamp: false,
      futureDated: false,
      stale: false,
      tooOld: false,
      ageDays,
      multiplier: 1,
    };
  }

  if (ageDays <= config.staleDays) {
    const progress =
      (ageDays - config.freshDays) /
      Math.max(1, config.staleDays - config.freshDays);

    return {
      approved: true,
      missingTimestamp: false,
      futureDated: false,
      stale: false,
      tooOld: false,
      ageDays,
      multiplier: clamp(1 - progress * 0.45, 0.55, 1),
    };
  }

  const progress =
    (ageDays - config.staleDays) /
    Math.max(1, config.maximumAgeDays - config.staleDays);

  return {
    approved: true,
    missingTimestamp: false,
    futureDated: false,
    stale: true,
    tooOld: false,
    ageDays,
    multiplier: clamp(0.55 - progress * 0.35, 0.20, 0.55),
  };
}

function classifySignal(longSupport, config) {
  if (longSupport >= config.strongThreshold) {
    return {
      signal: INSTITUTIONAL_POSITION_SIGNAL.STRONG_ACCUMULATION,
      direction: "LONG",
    };
  }

  if (longSupport >= config.directionalThreshold) {
    return {
      signal: INSTITUTIONAL_POSITION_SIGNAL.ACCUMULATION,
      direction: "LONG",
    };
  }

  const shortSupport = 1 - longSupport;

  if (shortSupport >= config.strongThreshold) {
    return {
      signal: INSTITUTIONAL_POSITION_SIGNAL.STRONG_DISTRIBUTION,
      direction: "SHORT",
    };
  }

  if (shortSupport >= config.directionalThreshold) {
    return {
      signal: INSTITUTIONAL_POSITION_SIGNAL.DISTRIBUTION,
      direction: "SHORT",
    };
  }

  return {
    signal: INSTITUTIONAL_POSITION_SIGNAL.NEUTRAL,
    direction: "NEUTRAL",
  };
}

function buildEvidenceSnapshot(evidence = {}) {
  const institutionsEvaluated = nonNegative(evidence?.institutionsEvaluated);
  const increasedPositions = nonNegative(evidence?.increasedPositions);
  const reducedPositions = nonNegative(evidence?.reducedPositions);
  const newPositions = nonNegative(evidence?.newPositions);
  const exitedPositions = nonNegative(evidence?.exitedPositions);
  const sharesAdded = nonNegative(evidence?.sharesAdded);
  const sharesReduced = nonNegative(evidence?.sharesReduced);
  const ownershipPercent = numberOrNull(evidence?.ownershipPercent);
  const previousOwnershipPercent =
    numberOrNull(evidence?.previousOwnershipPercent);

  return {
    institutionsEvaluated,
    increasedPositions,
    reducedPositions,
    unchangedPositions: nonNegative(evidence?.unchangedPositions),
    newPositions,
    exitedPositions,
    sharesAdded,
    sharesReduced,
    netShareChange: round(sharesAdded - sharesReduced, 2),
    ownershipPercent,
    previousOwnershipPercent,
    ownershipChangePercent:
      ownershipPercent !== null && previousOwnershipPercent !== null
        ? round(ownershipPercent - previousOwnershipPercent, 4)
        : null,
    reportingPeriodEnd: evidence?.reportingPeriodEnd ?? null,
    previousReportingPeriodEnd:
      evidence?.previousReportingPeriodEnd ?? null,
    evidenceAt:
      evidence?.evidenceAt ??
      evidence?.filedAt ??
      evidence?.publishedAt ??
      null,
  };
}

function buildCoverage(snapshot, components, sources, config) {
  const expected = [
    "BREADTH",
    "NET_POSITION_CHANGE",
    "NEW_VS_EXITED",
    "OWNERSHIP_TREND",
  ];

  const available = components.map(item => item.name);
  const missing = expected.filter(name => !available.includes(name));

  const sourceCount = [sources.sec, sources.finra]
    .filter(source => source.supplied).length;

  return {
    usable: components.length > 0,
    componentCount: components.length,
    expectedComponentCount: expected.length,
    componentCoverage: round(components.length / expected.length, 4),
    availableComponents: available,
    missingComponents: missing,
    institutionsEvaluated: snapshot.institutionsEvaluated,
    minimumInstitutions: config.minimumInstitutions,
    breadthSufficient:
      snapshot.institutionsEvaluated >= config.minimumInstitutions,
    sourceCount,
    secAvailable: sources.sec.approved,
    finraAvailable: sources.finra.approved,
  };
}

function buildBaseResult({
  symbol,
  status,
  signal = INSTITUTIONAL_POSITION_SIGNAL.INSUFFICIENT_DATA,
  direction = "NEUTRAL",
  confidence = 0,
  rawScore = null,
  directionalSupport = { long: 0.5, short: 0.5 },
  evidence = null,
  components = [],
  freshness = null,
  sources = null,
  coverage = null,
  reasons = [],
  warnings = [],
  errors = [],
  approved = true,
  asOfTimestamp = null,
} = {}) {
  const safeSources = sources ?? {
    sec: sourceState(null, "SEC_EDGAR"),
    finra: sourceState(null, "FINRA_REG_SHO"),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    approved,
    available:
      status === INSTITUTIONAL_POSITION_STATUS.COMPLETE ||
      status === INSTITUTIONAL_POSITION_STATUS.PARTIAL,
    engine: ENGINE,
    engineName: "Institutional Position Engine",
    symbol: symbol || null,
    status,
    signal,
    direction,
    confidence: round(confidence, 4) ?? 0,
    confidencePercent: round((round(confidence, 4) ?? 0) * 100, 2),
    rawScore,
    directionalSupport,
    directionalSupportPercent: {
      long:
        directionalSupport?.long === null ||
        directionalSupport?.long === undefined
          ? null
          : round(directionalSupport.long * 100, 2),
      short:
        directionalSupport?.short === null ||
        directionalSupport?.short === undefined
          ? null
          : round(directionalSupport.short * 100, 2),
    },

    // Global scoring owns the actual 7.5-point multiplication. These fields
    // merely tell the frontend what allocation this engine is expected to use.
    scoring: {
      directional: true,
      maximumPoints: 7.5,
      pointsAwarded: null,
      evidenceAvailable:
        status === INSTITUTIONAL_POSITION_STATUS.COMPLETE ||
        status === INSTITUTIONAL_POSITION_STATUS.PARTIAL,
      neutralFallbackApplied:
        status !== INSTITUTIONAL_POSITION_STATUS.COMPLETE &&
        status !== INSTITUTIONAL_POSITION_STATUS.PARTIAL,
      note:
        "Institutional Position Engine exposes directional support only. Missing, stale or errored evidence is neutral (50/50); Trade Scoring Engine awards the final 7.5-point allocation.",
    },

    evidence,
    components,
    coverage,
    freshness,
    sources: safeSources,
    providers: safeSources,

    diagnostics: {
      evidenceSupplied: evidence !== null,
      usableEvidence: Boolean(coverage?.usable),
      secConfigured: safeSources.sec.configured,
      secAvailable: safeSources.sec.approved,
      finraConfigured: safeSources.finra.configured,
      finraAvailable: safeSources.finra.approved,
      reportingPeriodEnd: evidence?.reportingPeriodEnd ?? null,
      evidenceAt: evidence?.evidenceAt ?? freshness?.evidenceAt ?? null,
      asOfTimestamp,
    },

    reasons: uniqueStrings(reasons),
    warnings: uniqueStrings(
      warnings,
      safeSources.sec.warnings,
      safeSources.finra.warnings,
    ),
    errors: uniqueStrings(
      errors,
      safeSources.sec.errors,
      safeSources.finra.errors,
    ),

    timestamp: nowIso(),
  };
}

export function analyzeInstitutionalPosition({
  symbol,
  evidence = null,
  asOfTimestamp = nowIso(),
  configOverrides = {},
} = {}) {
  const normalizedSymbol = normalizeSymbol(symbol ?? evidence?.symbol);

  try {
    const config = {
      ...DEFAULT_INSTITUTIONAL_POSITION_CONFIG,
      ...configOverrides,
      weights: {
        ...DEFAULT_INSTITUTIONAL_POSITION_CONFIG.weights,
        ...(configOverrides?.weights ?? {}),
      },
    };

    const sources = extractSources(evidence);

    if (!normalizedSymbol) {
      return buildBaseResult({
        symbol: null,
        approved: false,
        status: INSTITUTIONAL_POSITION_STATUS.ERROR,
        sources,
        reasons: ["Symbol is required."],
        errors: ["Institutional position analysis requires a symbol."],
        asOfTimestamp,
      });
    }

    if (!evidence || typeof evidence !== "object") {
      return buildBaseResult({
        symbol: normalizedSymbol,
        status: INSTITUTIONAL_POSITION_STATUS.INSUFFICIENT_DATA,
        sources,
        reasons: ["No institutional position evidence was supplied."],
        warnings: [
          "Institutional scoring was disabled because no evidence reached the engine.",
        ],
        asOfTimestamp,
      });
    }

    const snapshot = buildEvidenceSnapshot(evidence);

    const evidenceAt = snapshot.evidenceAt;
    const freshness = getFreshness(evidenceAt, asOfTimestamp, config);

    const freshnessView = {
      evidenceAt,
      reportingPeriodEnd: snapshot.reportingPeriodEnd,
      previousReportingPeriodEnd: snapshot.previousReportingPeriodEnd,
      asOfTimestamp,
      ageDays: round(freshness.ageDays, 2),
      missingTimestamp: freshness.missingTimestamp,
      stale: freshness.stale,
      tooOld: freshness.tooOld,
      futureDated: freshness.futureDated,
      multiplier: round(freshness.multiplier, 4),
    };

    if (freshness.futureDated) {
      return buildBaseResult({
        symbol: normalizedSymbol,
        status: INSTITUTIONAL_POSITION_STATUS.INSUFFICIENT_DATA,
        evidence: snapshot,
        freshness: freshnessView,
        sources,
        coverage: {
          usable: false,
          componentCount: 0,
          expectedComponentCount: 4,
          componentCoverage: 0,
          availableComponents: [],
          missingComponents: [
            "BREADTH",
            "NET_POSITION_CHANGE",
            "NEW_VS_EXITED",
            "OWNERSHIP_TREND",
          ],
          institutionsEvaluated: snapshot.institutionsEvaluated,
          minimumInstitutions: config.minimumInstitutions,
          breadthSufficient: false,
          sourceCount: 0,
          secAvailable: sources.sec.approved,
          finraAvailable: sources.finra.approved,
        },
        reasons: [
          "Institutional evidence was not publicly available at the requested analysis timestamp.",
        ],
        warnings: [
          "Future-dated institutional evidence was excluded for point-in-time safety.",
        ],
        asOfTimestamp,
      });
    }

    if (freshness.tooOld) {
      return buildBaseResult({
        symbol: normalizedSymbol,
        status: INSTITUTIONAL_POSITION_STATUS.STALE_DATA,
        evidence: snapshot,
        freshness: freshnessView,
        sources,
        coverage: {
          usable: false,
          componentCount: 0,
          expectedComponentCount: 4,
          componentCoverage: 0,
          availableComponents: [],
          missingComponents: [
            "BREADTH",
            "NET_POSITION_CHANGE",
            "NEW_VS_EXITED",
            "OWNERSHIP_TREND",
          ],
          institutionsEvaluated: snapshot.institutionsEvaluated,
          minimumInstitutions: config.minimumInstitutions,
          breadthSufficient:
            snapshot.institutionsEvaluated >= config.minimumInstitutions,
          sourceCount: [sources.sec, sources.finra]
            .filter(source => source.supplied).length,
          secAvailable: sources.sec.approved,
          finraAvailable: sources.finra.approved,
        },
        reasons: [
          "Institutional evidence is older than the maximum permitted age.",
        ],
        warnings: [
          "Stale institutional evidence was blocked from directional scoring.",
        ],
        asOfTimestamp,
      });
    }

    const components = [];

    if (snapshot.increasedPositions + snapshot.reducedPositions > 0) {
      components.push({
        name: "BREADTH",
        label: "Manager breadth",
        signedScore: ratioSigned(
          snapshot.increasedPositions,
          snapshot.reducedPositions,
        ),
        weight: config.weights.breadth,
        positiveValue: snapshot.increasedPositions,
        negativeValue: snapshot.reducedPositions,
      });
    }

    if (snapshot.sharesAdded + snapshot.sharesReduced > 0) {
      components.push({
        name: "NET_POSITION_CHANGE",
        label: "Net position change",
        signedScore: ratioSigned(
          snapshot.sharesAdded,
          snapshot.sharesReduced,
        ),
        weight: config.weights.netPositionChange,
        positiveValue: snapshot.sharesAdded,
        negativeValue: snapshot.sharesReduced,
      });
    }

    if (snapshot.newPositions + snapshot.exitedPositions > 0) {
      components.push({
        name: "NEW_VS_EXITED",
        label: "New positions vs exits",
        signedScore: ratioSigned(
          snapshot.newPositions,
          snapshot.exitedPositions,
        ),
        weight: config.weights.newVsExited,
        positiveValue: snapshot.newPositions,
        negativeValue: snapshot.exitedPositions,
      });
    }

    if (
      snapshot.ownershipPercent !== null &&
      snapshot.previousOwnershipPercent !== null
    ) {
      components.push({
        name: "OWNERSHIP_TREND",
        label: "Ownership trend",
        signedScore: clamp(
          (snapshot.ownershipPercent - snapshot.previousOwnershipPercent) / 5,
          -1,
          1,
        ),
        weight: config.weights.ownershipTrend,
        positiveValue: snapshot.ownershipPercent,
        negativeValue: snapshot.previousOwnershipPercent,
      });
    }

    const normalizedComponents = components.map(item => ({
      ...item,
      signedScore: round(item.signedScore, 4),
      contribution: round(item.signedScore * item.weight, 4),
    }));

    const coverage =
      buildCoverage(snapshot, normalizedComponents, sources, config);

    if (components.length === 0) {
      const sourceWarnings = [];

      if (!sources.sec.configured) {
        sourceWarnings.push(
          "SEC institutional source is not configured or its diagnostics were not supplied.",
        );
      } else if (!sources.sec.approved) {
        sourceWarnings.push(
          "SEC institutional source did not provide usable 13F position-change evidence.",
        );
      }

      if (!sources.finra.configured) {
        sourceWarnings.push(
          "FINRA Reg SHO source is not configured or its diagnostics were not supplied.",
        );
      }

      return buildBaseResult({
        symbol: normalizedSymbol,
        status: INSTITUTIONAL_POSITION_STATUS.INSUFFICIENT_DATA,
        evidence: snapshot,
        components: normalizedComponents,
        freshness: freshnessView,
        sources,
        coverage,
        reasons: [
          "Institutional evidence did not contain usable position-change information.",
        ],
        warnings: [
          ...sourceWarnings,
          "High institutional ownership by itself is not treated as bullish evidence.",
          "FINRA short-sale volume is a pressure proxy only and cannot substitute for SEC position-change evidence.",
        ],
        asOfTimestamp,
      });
    }

    const weightTotal =
      components.reduce((sum, item) => sum + item.weight, 0);

    const signedRaw =
      components.reduce(
        (sum, item) => sum + item.signedScore * item.weight,
        0,
      ) / (weightTotal || 1);

    const breadthMultiplier =
      snapshot.institutionsEvaluated >= config.minimumInstitutions
        ? 1
        : snapshot.institutionsEvaluated > 0
          ? clamp(
              snapshot.institutionsEvaluated / config.minimumInstitutions,
              0.35,
              1,
            )
          : 0.65;

    // Missing evidence timestamp is allowed to expose the measurements to the
    // frontend, but it cannot receive directional authority.
    if (freshness.missingTimestamp) {
      return buildBaseResult({
        symbol: normalizedSymbol,
        status: INSTITUTIONAL_POSITION_STATUS.INSUFFICIENT_DATA,
        evidence: snapshot,
        components: normalizedComponents,
        freshness: freshnessView,
        sources,
        coverage,
        reasons: [
          "Institutional position changes were measured, but their publication timestamp is unavailable.",
        ],
        warnings: [
          "Directional support was withheld because evidence freshness could not be verified.",
        ],
        asOfTimestamp,
      });
    }

    const freshnessMultiplier =
      freshness.approved ? freshness.multiplier : 0;

    const adjustedSigned = signedRaw * freshnessMultiplier;
    const longSupport = signedToLongSupport(adjustedSigned);
    const shortSupport = 1 - longSupport;

    const confidence = clamp(
      (0.45 + Math.abs(signedRaw) * 0.55) *
      breadthMultiplier *
      freshnessMultiplier,
    );

    const classification = classifySignal(longSupport, config);

    const status =
      freshness.stale ||
      snapshot.institutionsEvaluated < config.minimumInstitutions ||
      components.length < 4
        ? INSTITUTIONAL_POSITION_STATUS.PARTIAL
        : INSTITUTIONAL_POSITION_STATUS.COMPLETE;

    const reasons = [
      classification.direction === "LONG"
        ? "Institutional position changes show net accumulation."
        : classification.direction === "SHORT"
          ? "Institutional position changes show net distribution."
          : "Institutional position changes are directionally mixed.",
    ];

    if (normalizedComponents.some(
      item => item.name === "BREADTH" && item.signedScore > 0,
    )) {
      reasons.push("More evaluated managers increased than reduced positions.");
    }

    if (normalizedComponents.some(
      item => item.name === "BREADTH" && item.signedScore < 0,
    )) {
      reasons.push("More evaluated managers reduced than increased positions.");
    }

    if (snapshot.netShareChange > 0) {
      reasons.push("Reported share additions exceeded reported reductions.");
    } else if (snapshot.netShareChange < 0) {
      reasons.push("Reported share reductions exceeded reported additions.");
    }

    return buildBaseResult({
      symbol: normalizedSymbol,
      status,
      signal: classification.signal,
      direction: classification.direction,
      confidence,
      rawScore: round(adjustedSigned * 100, 2),
      directionalSupport: {
        long: round(longSupport, 4),
        short: round(shortSupport, 4),
      },
      evidence: snapshot,
      components: normalizedComponents,
      freshness: freshnessView,
      sources,
      coverage,
      reasons,
      warnings: [
        ...(freshness.stale
          ? [
              "Institutional evidence is stale and its directional influence was reduced.",
            ]
          : []),
        ...(snapshot.institutionsEvaluated < config.minimumInstitutions
          ? [
              "Institutional breadth is limited; confidence was reduced.",
            ]
          : []),
        ...(components.length < 4
          ? [
              "Institutional evidence is incomplete; only available components were scored.",
            ]
          : []),
        "Institutional filings describe positions from an earlier reporting period and must not be interpreted as real-time order flow.",
        "FINRA short-sale volume, when present, remains a pressure proxy and is not treated as institutional ownership or short interest.",
      ],
      asOfTimestamp,
    });
  } catch (error) {
    return buildBaseResult({
      symbol: normalizedSymbol || null,
      approved: false,
      status: INSTITUTIONAL_POSITION_STATUS.ERROR,
      reasons: [
        "Institutional position intelligence failed safely.",
      ],
      warnings: [
        "Institutional position intelligence cannot authorize or strengthen a trade while the engine is in an error state.",
      ],
      errors: [
        error instanceof Error ? error.message : String(error),
      ],
      asOfTimestamp,
    });
  }
}

export default analyzeInstitutionalPosition;
