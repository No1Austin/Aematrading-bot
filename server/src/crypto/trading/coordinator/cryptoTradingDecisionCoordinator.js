const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const round = (value, places = 2) => {
  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  const factor = 10 ** places;
  return Math.round(n * factor) / factor;
};

/**
 * ============================================================
 * AEMA CRYPTO PHASE 5.6
 * DIRECTIONAL DECISION COORDINATOR
 * ============================================================
 *
 * This coordinator does NOT execute trades.
 *
 * Its job is to combine independent crypto trading engines into
 * one directional trade thesis.
 *
 * Core rule:
 *
 * LONG evidence  -> LONG bucket only
 * SHORT evidence -> SHORT bucket only
 *
 * We never do:
 *
 * bullish fundamentals 30
 * bearish technicals   30
 * ------------------------
 * trade score          60   <-- WRONG
 *
 * Instead:
 *
 * LONG  = 30
 * SHORT = 30
 *
 * Separation = 0
 * Decision   = NO_TRADE_CONFLICT
 *
 * Context engines such as market regime and BTC/ETH dependency
 * modify compatibility / exposure. They do not blindly create
 * directional conviction.
 */

const DEFAULT_WEIGHTS = Object.freeze({
  technical: 18,
  momentum: 16,
  marketStructure: 14,
  derivatives: 16,
  onChainFlow: 12,

  // Optional future directional engines.
  orderFlow: 10,
  liquidation: 8,
  sentiment: 6,
});

/**
 * Engines that may vote directionally.
 *
 * Market regime and BTC/ETH dependency are deliberately excluded
 * because they are handled as context below.
 */
const DIRECTIONAL_KEYS = Object.freeze([
  "technical",
  "momentum",
  "marketStructure",
  "derivatives",
  "onChainFlow",
  "orderFlow",
  "liquidation",
  "sentiment",
]);

function isComplete(result) {
  if (!result) return false;

  if (
    result.status &&
    result.status !== "COMPLETE"
  ) {
    return false;
  }

  return (
    finite(result.longSupport) !== null ||
    finite(result.shortSupport) !== null
  );
}

function normalizeConfidence(result) {
  const c = finite(result?.confidence);

  if (c === null) return 0.5;

  return clamp(c, 0, 1);
}

function normalizeQuality(result) {
  const q = finite(result?.quality);

  if (q === null) return 0.75;

  return clamp(q, 0, 100) / 100;
}

function engineContribution(
  key,
  result,
  weight,
) {
  if (!isComplete(result)) {
    return {
      key,
      available: false,
      weight,
      effectiveWeight: 0,

      direction: "NEUTRAL",

      longSupport: 0,
      shortSupport: 0,

      confidence: 0,
      quality: 0,

      longPoints: 0,
      shortPoints: 0,

      reasons: [],
      risks: [],
    };
  }

  const longSupport =
    clamp(result?.longSupport);

  const shortSupport =
    clamp(result?.shortSupport);

  const confidence =
    normalizeConfidence(result);

  const quality =
    normalizeQuality(result);

  /**
   * Do not completely destroy an otherwise valid engine merely
   * because confidence or quality is moderate.
   *
   * Both act as reliability multipliers.
   */
  const reliability =
    0.55 +
    confidence * 0.25 +
    quality * 0.20;

  const effectiveWeight =
    weight * reliability;

  const longPoints =
    effectiveWeight *
    (longSupport / 100);

  const shortPoints =
    effectiveWeight *
    (shortSupport / 100);

  let direction = "NEUTRAL";

  if (
    longSupport >
    shortSupport + 5
  ) {
    direction = "LONG";
  } else if (
    shortSupport >
    longSupport + 5
  ) {
    direction = "SHORT";
  }

  return {
    key,

    available: true,

    weight:
      round(weight),

    effectiveWeight:
      round(effectiveWeight),

    direction,

    longSupport:
      round(longSupport),

    shortSupport:
      round(shortSupport),

    confidence:
      round(confidence, 4),

    quality:
      round(quality * 100),

    longPoints:
      round(longPoints),

    shortPoints:
      round(shortPoints),

    reasons:
      Array.isArray(result?.reasons)
        ? result.reasons
        : [],

    risks:
      Array.isArray(result?.risks)
        ? result.risks
        : [],
  };
}

function regimeContext(result) {
  if (!result) {
    return {
      available: false,
      regime: "UNKNOWN",

      longCompatibility: 1,
      shortCompatibility: 1,

      exposureMultiplier: 1,

      stress: false,
      volatility: "UNKNOWN",

      risks: [],
    };
  }

  return {
    available: true,

    regime:
      result.regime ??
      result?.evidence?.regime ??
      "UNKNOWN",

    longCompatibility:
      clamp(
        finite(
          result.longCompatibility ??
          result.longCompat ??
          result?.evidence?.longCompatibility,
        ) ?? 1,
        0,
        1,
      ),

    shortCompatibility:
      clamp(
        finite(
          result.shortCompatibility ??
          result.shortCompat ??
          result?.evidence?.shortCompatibility,
        ) ?? 1,
        0,
        1,
      ),

    exposureMultiplier:
      clamp(
        finite(
          result.exposureMultiplier ??
          result.exposure ??
          result?.evidence?.exposureMultiplier,
        ) ?? 1,
        0,
        1,
      ),

    stress:
      Boolean(
        result.stress ??
        result?.evidence?.stress,
      ),

    volatility:
      result.volatility ??
      result?.evidence?.volatility ??
      "UNKNOWN",

    risks:
      Array.isArray(result.risks)
        ? result.risks
        : [],
  };
}

function dependencyContext(result) {
  if (!result) {
    return {
      available: false,

      aligned: false,
      conflict: false,

      dependencyClass: "UNKNOWN",
      overallDependency: null,

      longCompatibility: 1,
      shortCompatibility: 1,

      risks: [],
    };
  }

  const conflict =
    Boolean(result.conflict);

  const aligned =
    Boolean(result.aligned);

  const dependency =
    finite(
      result.overallDependency ??
      result?.evidence?.overallDependency,
    );

  /**
   * BTC/ETH dependency is contextual.
   *
   * If the dependency engine itself provides compatibility values,
   * use them. Otherwise infer a soft penalty from its directional
   * support.
   */

  let longCompatibility = 1;
  let shortCompatibility = 1;

  const explicitLong =
    finite(
      result.longCompatibility ??
      result.longCompat,
    );

  const explicitShort =
    finite(
      result.shortCompatibility ??
      result.shortCompat,
    );

  if (explicitLong !== null) {
    longCompatibility =
      clamp(explicitLong, 0, 1);
  }

  if (explicitShort !== null) {
    shortCompatibility =
      clamp(explicitShort, 0, 1);
  }

  if (
    explicitLong === null &&
    explicitShort === null
  ) {
    const longSupport =
      clamp(result.longSupport);

    const shortSupport =
      clamp(result.shortSupport);

    if (
      shortSupport >
      longSupport + 10
    ) {
      longCompatibility =
        clamp(
          1 -
          ((shortSupport - longSupport) / 100) *
            0.45,
          0.45,
          1,
        );
    }

    if (
      longSupport >
      shortSupport + 10
    ) {
      shortCompatibility =
        clamp(
          1 -
          ((longSupport - shortSupport) / 100) *
            0.45,
          0.45,
          1,
        );
    }
  }

  /**
   * Conflict is deliberately NOT a hard veto.
   *
   * A genuinely independent altcoin can move against BTC/ETH.
   */
  if (conflict) {
    longCompatibility =
      Math.max(
        0.5,
        longCompatibility * 0.9,
      );

    shortCompatibility =
      Math.max(
        0.5,
        shortCompatibility * 0.9,
      );
  }

  return {
    available: true,

    aligned,
    conflict,

    dependencyClass:
      result.dependencyClass ??
      result?.evidence?.dependencyClass ??
      "UNKNOWN",

    overallDependency:
      dependency,

    longCompatibility:
      round(longCompatibility, 4),

    shortCompatibility:
      round(shortCompatibility, 4),

    risks:
      Array.isArray(result.risks)
        ? result.risks
        : [],
  };
}

function determineDecision({
  longScore,
  shortScore,
  separation,
  agreement,
  availableEngines,
  preferredDirection,
  regime,
}) {
  if (availableEngines < 3) {
    return {
      decision: "INSUFFICIENT_DATA",
      tradeable: false,
      reason: "TOO_FEW_DIRECTIONAL_ENGINES",
    };
  }

  const winnerScore =
    Math.max(
      longScore,
      shortScore,
    );

  if (winnerScore < 45) {
    return {
      decision: "NO_TRADE_WEAK",
      tradeable: false,
      reason: "DIRECTIONAL_CONVICTION_TOO_LOW",
    };
  }

  if (separation < 8) {
    return {
      decision: "NO_TRADE_CONFLICT",
      tradeable: false,
      reason: "LONG_SHORT_SEPARATION_TOO_SMALL",
    };
  }

  /**
   * We deliberately do not require every engine to agree.
   *
   * Crypto frequently has transitional states. Requiring perfect
   * agreement would produce a system that almost never trades.
   */
  if (
    agreement < 0.45 &&
    separation < 18
  ) {
    return {
      decision: "NO_TRADE_CONFLICT",
      tradeable: false,
      reason: "ENGINE_AGREEMENT_TOO_LOW",
    };
  }

  if (
    regime.stress &&
    regime.exposureMultiplier <= 0.2
  ) {
    return {
      decision: "NO_TRADE_RISK",
      tradeable: false,
      reason: "EXTREME_MARKET_STRESS",
    };
  }

  return {
    decision:
      preferredDirection === "LONG"
        ? "LONG_CANDIDATE"
        : "SHORT_CANDIDATE",

    tradeable: true,
    reason: "DIRECTIONAL_CONSENSUS",
  };
}

export function coordinateCryptoTradingDecision(
  engineResults = {},
  {
    weights = {},
  } = {},
) {
  const resolvedWeights = {
    ...DEFAULT_WEIGHTS,
    ...weights,
  };

  const breakdown = {};

  let totalAvailableWeight = 0;

  let rawLongPoints = 0;
  let rawShortPoints = 0;

  let availableEngines = 0;

  for (
    const key
    of DIRECTIONAL_KEYS
  ) {
    const weight =
      finite(resolvedWeights[key]) ??
      0;

    if (weight <= 0) {
      continue;
    }

    const contribution =
      engineContribution(
        key,
        engineResults[key],
        weight,
      );

    breakdown[key] =
      contribution;

    if (!contribution.available) {
      continue;
    }

    availableEngines += 1;

    totalAvailableWeight +=
      contribution.effectiveWeight;

    rawLongPoints +=
      contribution.longPoints;

    rawShortPoints +=
      contribution.shortPoints;
  }

  let rawLongScore = 0;
  let rawShortScore = 0;

  if (
    totalAvailableWeight >
    0
  ) {
    rawLongScore =
      clamp(
        rawLongPoints /
          totalAvailableWeight *
          100,
      );

    rawShortScore =
      clamp(
        rawShortPoints /
          totalAvailableWeight *
          100,
      );
  }

  const regime =
    regimeContext(
      engineResults.marketRegime,
    );

  const dependency =
    dependencyContext(
      engineResults.btcEthDependency,
    );

  /**
   * ----------------------------------------------------------
   * CONTEXT MODIFIERS
   * ----------------------------------------------------------
   *
   * These do not create direction.
   * They modify existing directional conviction.
   */

  const longCompatibility =
    clamp(
      regime.longCompatibility *
        dependency.longCompatibility,
      0,
      1,
    );

  const shortCompatibility =
    clamp(
      regime.shortCompatibility *
        dependency.shortCompatibility,
      0,
      1,
    );

  const longScore =
    clamp(
      rawLongScore *
        (
          0.65 +
          0.35 *
            longCompatibility
        ),
    );

  const shortScore =
    clamp(
      rawShortScore *
        (
          0.65 +
          0.35 *
            shortCompatibility
        ),
    );

  const separation =
    Math.abs(
      longScore -
      shortScore,
    );

  let preferredDirection =
    "NEUTRAL";

  if (
    longScore >
    shortScore
  ) {
    preferredDirection =
      "LONG";
  } else if (
    shortScore >
    longScore
  ) {
    preferredDirection =
      "SHORT";
  }

  /**
   * ----------------------------------------------------------
   * ENGINE AGREEMENT
   * ----------------------------------------------------------
   */

  const available =
    Object.values(
      breakdown,
    ).filter(
      x => x.available,
    );

  const agreeing =
    available.filter(
      x =>
        x.direction ===
        preferredDirection,
    );

  const opposing =
    available.filter(
      x =>
        x.direction !==
          "NEUTRAL" &&
        x.direction !==
          preferredDirection,
    );

  const neutral =
    available.filter(
      x =>
        x.direction ===
        "NEUTRAL",
    );

  const agreement =
    available.length
      ? agreeing.length /
        available.length
      : 0;

  /**
   * ----------------------------------------------------------
   * CONFIDENCE
   * ----------------------------------------------------------
   */

  const separationConfidence =
    clamp(
      separation / 45,
      0,
      1,
    );

  const coverage =
    clamp(
      availableEngines /
        5,
      0,
      1,
    );

  let confidence =
    (
      separationConfidence *
        0.45 +
      agreement *
        0.35 +
      coverage *
        0.20
    );

  if (
    dependency.conflict
  ) {
    confidence *= 0.92;
  }

  if (
    regime.regime ===
    "CHOPPY"
  ) {
    confidence *= 0.88;
  }

  if (
    regime.stress
  ) {
    confidence *= 0.78;
  }

  confidence =
    clamp(
      confidence,
      0,
      1,
    );

  /**
   * ----------------------------------------------------------
   * EXPOSURE
   * ----------------------------------------------------------
   *
   * This is a recommendation to the future risk/execution layer,
   * NOT an order size.
   */

  let exposureMultiplier =
    regime.exposureMultiplier;

  if (
    dependency.conflict
  ) {
    exposureMultiplier *=
      0.8;
  }

  if (
    confidence <
    0.55
  ) {
    exposureMultiplier *=
      0.7;
  }

  if (
    separation <
    15
  ) {
    exposureMultiplier *=
      0.75;
  }

  exposureMultiplier =
    clamp(
      exposureMultiplier,
      0,
      1,
    );

  const decisionResult =
    determineDecision({
      longScore,
      shortScore,
      separation,
      agreement,
      availableEngines,
      preferredDirection,
      regime,
    });

  const risks = [
    ...new Set([
      ...available.flatMap(
        x => x.risks,
      ),

      ...regime.risks,

      ...dependency.risks,

      ...(opposing.length
        ? [
            "DIRECTIONAL_ENGINE_CONFLICT",
          ]
        : []),

      ...(dependency.conflict
        ? [
            "BTC_ETH_CONTEXT_CONFLICT",
          ]
        : []),

      ...(regime.regime ===
      "CHOPPY"
        ? [
            "CHOPPY_MARKET_REGIME",
          ]
        : []),
    ]),
  ];

  return {
    status:
      availableEngines >= 3
        ? "COMPLETE"
        : "INSUFFICIENT_DATA",

    decision:
      decisionResult.decision,

    tradeable:
      decisionResult.tradeable,

    decisionReason:
      decisionResult.reason,

    preferredDirection,

    scores: {
      rawLong:
        round(rawLongScore),

      rawShort:
        round(rawShortScore),

      long:
        round(longScore),

      short:
        round(shortScore),

      separation:
        round(separation),
    },

    consensus: {
      availableEngines,

      agreeingEngines:
        agreeing.length,

      opposingEngines:
        opposing.length,

      neutralEngines:
        neutral.length,

      agreement:
        round(
          agreement,
          4,
        ),

      confidence:
        round(
          confidence,
          4,
        ),
    },

    context: {
      regime,

      btcEthDependency:
        dependency,

      longCompatibility:
        round(
          longCompatibility,
          4,
        ),

      shortCompatibility:
        round(
          shortCompatibility,
          4,
        ),
    },

    risk: {
      exposureMultiplier:
        round(
          exposureMultiplier,
          4,
        ),

      risks,
    },

    breakdown,

    noExecutionAuthority:
      true,
  };
}

export default coordinateCryptoTradingDecision;