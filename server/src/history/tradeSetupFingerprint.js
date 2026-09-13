// server/src/history/tradeSetupFingerprint.js

/**
 * ============================================================
 * TRADE SETUP FINGERPRINT
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Convert a trade candidate / completed trade setup into a
 * normalized structure that can be compared against historical
 * trades taken by the bot.
 *
 * IMPORTANT
 * ---------
 *
 * This module does NOT decide whether to trade.
 *
 * It only creates a stable representation of the setup.
 *
 * The fingerprint should be:
 *
 * - deterministic
 * - comparable
 * - direction-aware
 * - tolerant of missing non-critical data
 * - safe for backtesting
 * - free of future information
 */

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

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

function clamp(
  value,
  min,
  max,
) {
  return Math.min(
    Math.max(
      Number(value),
      Number(min),
    ),
    Number(max),
  );
}

function round(
  value,
  decimals = 4,
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) * factor,
    ) / factor
  );
}

function normalizeSide(side) {
  const value =
    String(side ?? "")
      .trim()
      .toUpperCase();

  if (
    value === "LONG" ||
    value === "SHORT"
  ) {
    return value;
  }

  return null;
}

function normalizeDirectionalSupport({
  input,
  side,
}) {
  if (!input) {
    return {
      available: false,

      alignedSupport:
        null,

      oppositeSupport:
        null,
    };
  }

  const longSupport =
    isFiniteNumber(
      input
        ?.directionalSupport
        ?.long,
    )
      ? clamp(
          input
            .directionalSupport
            .long,
          0,
          1,
        )
      : null;

  const shortSupport =
    isFiniteNumber(
      input
        ?.directionalSupport
        ?.short,
    )
      ? clamp(
          input
            .directionalSupport
            .short,
          0,
          1,
        )
      : null;

  if (
    longSupport === null ||
    shortSupport === null
  ) {
    return {
      available: false,

      alignedSupport:
        null,

      oppositeSupport:
        null,
    };
  }

  if (side === "LONG") {
    return {
      available: true,

      alignedSupport:
        round(
          longSupport,
        ),

      oppositeSupport:
        round(
          shortSupport,
        ),
    };
  }

  if (side === "SHORT") {
    return {
      available: true,

      alignedSupport:
        round(
          shortSupport,
        ),

      oppositeSupport:
        round(
          longSupport,
        ),
    };
  }

  return {
    available: false,

    alignedSupport:
      null,

    oppositeSupport:
      null,
  };
}

function normalizeNumber(
  value,
  {
    min = null,
    max = null,
    decimals = 4,
  } = {},
) {
  if (!isFiniteNumber(value)) {
    return null;
  }

  let normalized =
    Number(value);

  if (isFiniteNumber(min)) {
    normalized =
      Math.max(
        normalized,
        Number(min),
      );
  }

  if (isFiniteNumber(max)) {
    normalized =
      Math.min(
        normalized,
        Number(max),
      );
  }

  return round(
    normalized,
    decimals,
  );
}

function normalizeText(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  return String(value)
    .trim()
    .toUpperCase();
}

/**
 * ============================================================
 * TECHNICAL FINGERPRINT
 * ============================================================
 */

function buildTechnicalFingerprint({
  technical,
  side,
}) {
  const directional =
    normalizeDirectionalSupport({
      input:
        technical,

      side,
    });

  return {
    available:
      technical
        ?.approved === true,

    alignedSupport:
      directional
        .alignedSupport,

    oppositeSupport:
      directional
        .oppositeSupport,

    trend:
      normalizeText(
        technical
          ?.trend
          ?.direction,
      ),

    bias:
      normalizeText(
        technical
          ?.bias
          ?.direction,
      ),

    rsi:
      normalizeNumber(
        technical
          ?.indicators
          ?.rsi
          ?.value ??
        technical
          ?.indicators
          ?.rsi,
        {
          min: 0,
          max: 100,
          decimals: 2,
        },
      ),

    macdDirection:
      normalizeText(
        technical
          ?.indicators
          ?.macd
          ?.analysis
          ?.direction,
      ),

    atrPercent:
      normalizeNumber(
        technical
          ?.indicators
          ?.atr
          ?.percent,
        {
          min: 0,
          decimals: 6,
        },
      ),

    volumeRatio:
      normalizeNumber(
        technical
          ?.indicators
          ?.volume
          ?.volumeRatio,
        {
          min: 0,
          decimals: 4,
        },
      ),

    aboveVWAP:
      technical
        ?.confirmation
        ?.aboveVWAP ===
      true,

    belowVWAP:
      technical
        ?.confirmation
        ?.belowVWAP ===
      true,
  };
}

/**
 * ============================================================
 * GENERIC ENGINE FINGERPRINT
 * ============================================================
 */

function buildDirectionalEngineFingerprint({
  engine,
  side,
}) {
  const directional =
    normalizeDirectionalSupport({
      input:
        engine,

      side,
    });

  return {
    available:
      engine
        ?.approved === true ||
      engine
        ?.status ===
        "COMPLETE",

    alignedSupport:
      directional
        .alignedSupport,

    oppositeSupport:
      directional
        .oppositeSupport,

    status:
      normalizeText(
        engine?.status,
      ),
  };
}

/**
 * ============================================================
 * LIQUIDITY FINGERPRINT
 * ============================================================
 */

function buildLiquidityFingerprint({
  liquidity,
}) {
  return {
    available:
      liquidity
        ?.approved === true ||
      liquidity
        ?.status ===
        "COMPLETE",

    qualityScore:
      normalizeNumber(
        liquidity
          ?.qualityScore,
        {
          min: 0,
          max: 1,
        },
      ),

    spreadPercent:
      normalizeNumber(
        liquidity
          ?.spreadPercent,
        {
          min: 0,
          decimals: 6,
        },
      ),

    averageDailyVolume:
      normalizeNumber(
        liquidity
          ?.averageDailyVolume,
        {
          min: 0,
          decimals: 0,
        },
      ),
  };
}

/**
 * ============================================================
 * RISK / REWARD FINGERPRINT
 * ============================================================
 */

function buildRiskRewardFingerprint({
  riskReward,
  side,
}) {
  const directional =
    normalizeDirectionalSupport({
      input:
        riskReward,

      side,
    });

  const ratio =
    side === "LONG"
      ? (
          riskReward
            ?.long
            ?.rewardRiskRatio ??
          riskReward
            ?.longRewardRiskRatio ??
          riskReward
            ?.rewardRiskRatio
        )
      : (
          riskReward
            ?.short
            ?.rewardRiskRatio ??
          riskReward
            ?.shortRewardRiskRatio ??
          riskReward
            ?.rewardRiskRatio
        );

  return {
    available:
      riskReward
        ?.approved === true ||
      riskReward
        ?.status ===
        "COMPLETE",

    alignedSupport:
      directional
        .alignedSupport,

    oppositeSupport:
      directional
        .oppositeSupport,

    rewardRiskRatio:
      normalizeNumber(
        ratio,
        {
          min: 0,
          decimals: 4,
        },
      ),
  };
}

/**
 * ============================================================
 * SCORING FINGERPRINT
 * ============================================================
 */

function buildScoringFingerprint({
  scoring,
  side,
}) {
  const preferredSide =
    normalizeSide(
      scoring
        ?.preferredSide,
    );

  const sideScore =
    side === "LONG"
      ? scoring
          ?.long
          ?.score
      : scoring
          ?.short
          ?.score;

  const oppositeScore =
    side === "LONG"
      ? scoring
          ?.short
          ?.score
      : scoring
          ?.long
          ?.score;

  return {
    available:
      scoring
        ?.approved === true,

    preferredSide,

    preferredScore:
      normalizeNumber(
        scoring
          ?.preferredScore,
        {
          min: 0,
          max: 100,
          decimals: 2,
        },
      ),

    sideScore:
      normalizeNumber(
        sideScore,
        {
          min: 0,
          max: 100,
          decimals: 2,
        },
      ),

    oppositeScore:
      normalizeNumber(
        oppositeScore,
        {
          min: 0,
          max: 100,
          decimals: 2,
        },
      ),

    scoreGap:
      (
        isFiniteNumber(
          sideScore,
        ) &&
        isFiniteNumber(
          oppositeScore,
        )
      )
        ? round(
            Number(sideScore) -
            Number(oppositeScore),
            2,
          )
        : null,
  };
}

/**
 * ============================================================
 * MAIN FINGERPRINT BUILDER
 * ============================================================
 */

export function createTradeSetupFingerprint({
  symbol,

  side,

  technical = null,

  macro = null,

  marketRegime = null,

  events = null,

  company = null,

  country = null,

  social = null,

  historical = null,

  liquidity = null,

  riskReward = null,

  consensus = null,

  scoring = null,

  decisionGate = null,

  entryPrice = null,

  stopPrice = null,

  targetPrice = null,

  asOfTimestamp = null,
} = {}) {
  const normalizedSide =
    normalizeSide(
      side,
    );

  const errors = [];

  if (!normalizedSide) {
    errors.push(
      "Trade side must be LONG or SHORT.",
    );
  }

  if (
    !symbol ||
    String(symbol)
      .trim()
      .length === 0
  ) {
    errors.push(
      "Trade symbol is required.",
    );
  }

  if (
    errors.length > 0
  ) {
    return {
      approved: false,

      engine:
        "TRADE_SETUP_FINGERPRINT",

      status:
        "INVALID_INPUT",

      fingerprint:
        null,

      errors,

      warnings: [],

      timestamp:
        new Date()
          .toISOString(),
    };
  }

  const timestamp =
    asOfTimestamp
      ? new Date(
          asOfTimestamp,
        )
      : new Date();

  const safeTimestamp =
    Number.isNaN(
      timestamp.getTime(),
    )
      ? new Date()
      : timestamp;

  const fingerprint = {
    version: 1,

    symbol:
      String(symbol)
        .trim()
        .toUpperCase(),

    side:
      normalizedSide,

    asOfTimestamp:
      safeTimestamp
        .toISOString(),

    priceGeometry: {
      entryPrice:
        normalizeNumber(
          entryPrice,
          {
            min: 0,
            decimals: 4,
          },
        ),

      stopPrice:
        normalizeNumber(
          stopPrice,
          {
            min: 0,
            decimals: 4,
          },
        ),

      targetPrice:
        normalizeNumber(
          targetPrice,
          {
            min: 0,
            decimals: 4,
          },
        ),
    },

    technical:
      buildTechnicalFingerprint({
        technical,
        side:
          normalizedSide,
      }),

    macro:
      buildDirectionalEngineFingerprint({
        engine:
          macro,
        side:
          normalizedSide,
      }),

    marketRegime:
      buildDirectionalEngineFingerprint({
        engine:
          marketRegime,
        side:
          normalizedSide,
      }),

    events:
      buildDirectionalEngineFingerprint({
        engine:
          events,
        side:
          normalizedSide,
      }),

    company:
      buildDirectionalEngineFingerprint({
        engine:
          company,
        side:
          normalizedSide,
      }),

    country:
      buildDirectionalEngineFingerprint({
        engine:
          country,
        side:
          normalizedSide,
      }),

    social:
      buildDirectionalEngineFingerprint({
        engine:
          social,
        side:
          normalizedSide,
      }),

    historical:
      buildDirectionalEngineFingerprint({
        engine:
          historical,
        side:
          normalizedSide,
      }),

    liquidity:
      buildLiquidityFingerprint({
        liquidity,
      }),

    riskReward:
      buildRiskRewardFingerprint({
        riskReward,
        side:
          normalizedSide,
      }),

    consensus:
      buildDirectionalEngineFingerprint({
        engine:
          consensus,
        side:
          normalizedSide,
      }),

    scoring:
      buildScoringFingerprint({
        scoring,
        side:
          normalizedSide,
      }),

    decision: {
      side:
        normalizeSide(
          decisionGate
            ?.side,
        ),

      score:
        normalizeNumber(
          decisionGate
            ?.score,
          {
            min: 0,
            max: 100,
            decimals: 2,
          },
        ),

      canProceedToRiskManager:
        decisionGate
          ?.canProceedToRiskManager ===
        true,
    },
  };

  const engineKeys = [
    "technical",
    "macro",
    "marketRegime",
    "events",
    "company",
    "country",
    "social",
    "historical",
    "liquidity",
    "riskReward",
    "consensus",
    "scoring",
  ];

  const availableEngines =
    engineKeys.filter(
      (key) =>
        fingerprint[key]
          ?.available === true,
    );

  const coverage =
    engineKeys.length > 0
      ? (
          availableEngines
            .length /
          engineKeys.length
        )
      : 0;

  return {
    approved: true,

    engine:
      "TRADE_SETUP_FINGERPRINT",

    status:
      "COMPLETE",

    fingerprint,

    coverage:
      round(
        coverage,
        4,
      ),

    availableEngines,

    missingEngines:
      engineKeys.filter(
        (key) =>
          !availableEngines
            .includes(key),
      ),

    errors: [],

    warnings:
      coverage < 0.5
        ? [
            "Trade setup fingerprint has low engine coverage.",
          ]
        : [],

    timestamp:
      new Date()
        .toISOString(),
  };
}

export default createTradeSetupFingerprint;