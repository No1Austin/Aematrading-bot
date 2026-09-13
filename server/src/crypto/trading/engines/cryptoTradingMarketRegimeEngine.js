const finite = (value) => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
};

const clamp = (
  value,
  min = 0,
  max = 100,
) =>
  Math.min(
    max,
    Math.max(
      min,
      Number(value) || 0,
    ),
  );

const average = (
  values = [],
) => {
  const valid =
    values
      .map(finite)
      .filter(
        (value) =>
          value !== null,
      );

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce(
      (sum, value) =>
        sum + value,
      0,
    ) /
    valid.length
  );
};

const directionFromScores = (
  longSupport,
  shortSupport,
  threshold = 8,
) => {
  const separation =
    longSupport -
    shortSupport;

  if (
    separation >=
    threshold
  ) {
    return "LONG";
  }

  if (
    separation <=
    -threshold
  ) {
    return "SHORT";
  }

  return "NEUTRAL";
};

/**
 * ============================================================
 * AEMA CRYPTO TRADING MARKET REGIME ENGINE
 * ============================================================
 *
 * PURPOSE
 *
 * Determine the market-wide crypto environment in which a
 * candidate is being traded.
 *
 * This is NOT:
 *
 * - a Phase 4 research engine
 * - an entry authority
 * - an execution authority
 * - a hard directional veto
 *
 * It determines:
 *
 * - broad market direction
 * - market regime
 * - volatility regime
 * - derivatives stress
 * - LONG compatibility
 * - SHORT compatibility
 * - exposure multiplier
 *
 * Counter-regime trades remain possible.
 *
 * ============================================================
 *
 * EXPECTED MARKET CONTEXT
 *
 * {
 *   btc: {
 *     change1hPercent,
 *     change4hPercent,
 *     change24hPercent,
 *     change7dPercent
 *   },
 *
 *   eth: {
 *     change1hPercent,
 *     change4hPercent,
 *     change24hPercent,
 *     change7dPercent
 *   },
 *
 *   breadth: {
 *     advancingPercent,
 *     decliningPercent
 *   },
 *
 *   volatility: {
 *     realizedVolatility,
 *     averageAbsolute24hMove
 *   },
 *
 *   derivatives: {
 *     fundingStress,
 *     liquidationStress
 *   }
 * }
 * ============================================================
 */

export default async function runCryptoTradingMarketRegimeEngine(
  candidate,
  {
    marketContext = null,
  } = {},
) {
  /*
   * ==========================================================
   * MARKET CONTEXT REQUIRED
   * ==========================================================
   */

  if (!marketContext) {
    return {
      engine:
        "CRYPTO_TRADING_MARKET_REGIME",

      status:
        "INSUFFICIENT_DATA",

      direction:
        "NEUTRAL",

      regime:
        "UNKNOWN",

      longSupport:
        0,

      shortSupport:
        0,

      longCompatibility:
        0.5,

      shortCompatibility:
        0.5,

      confidence:
        0,

      quality:
        0,

      volatilityRegime:
        "UNKNOWN",

      marketStress:
        false,

      exposureMultiplier:
        0.5,

      reasons:
        [],

      risks: [
        "MARKET_CONTEXT_UNAVAILABLE",
      ],

      evidence:
        {},
    };
  }

  const btc =
    marketContext?.btc ??
    {};

  const eth =
    marketContext?.eth ??
    {};

  const breadth =
    marketContext?.breadth ??
    {};

  const volatility =
    marketContext?.volatility ??
    {};

  const derivatives =
    marketContext?.derivatives ??
    {};

  /*
   * ==========================================================
   * BTC
   * ==========================================================
   */

  const btc1h =
    finite(
      btc.change1hPercent,
    );

  const btc4h =
    finite(
      btc.change4hPercent,
    );

  const btc24h =
    finite(
      btc.change24hPercent,
    );

  const btc7d =
    finite(
      btc.change7dPercent,
    );

  /*
   * ==========================================================
   * ETH
   * ==========================================================
   */

  const eth1h =
    finite(
      eth.change1hPercent,
    );

  const eth4h =
    finite(
      eth.change4hPercent,
    );

  const eth24h =
    finite(
      eth.change24hPercent,
    );

  const eth7d =
    finite(
      eth.change7dPercent,
    );

  /*
   * ==========================================================
   * BREADTH
   * ==========================================================
   */

  const advancing =
    finite(
      breadth.advancingPercent,
    );

  const declining =
    finite(
      breadth.decliningPercent,
    );

  /*
   * ==========================================================
   * VOLATILITY
   * ==========================================================
   */

  const realizedVolatility =
    finite(
      volatility.realizedVolatility,
    );

  const avgAbs24hMove =
    finite(
      volatility.averageAbsolute24hMove,
    );

  /*
   * ==========================================================
   * DERIVATIVES STRESS
   * ==========================================================
   */

  const fundingStress =
    finite(
      derivatives.fundingStress,
    );

  const liquidationStress =
    finite(
      derivatives.liquidationStress,
    );

  /*
   * ==========================================================
   * DATA COVERAGE
   * ==========================================================
   */

  const availableDirectionalValues =
    [
      btc1h,
      btc4h,
      btc24h,
      btc7d,

      eth1h,
      eth4h,
      eth24h,
      eth7d,
    ]
      .filter(
        (value) =>
          value !== null,
      );

  if (
    availableDirectionalValues.length <
    4
  ) {
    return {
      engine:
        "CRYPTO_TRADING_MARKET_REGIME",

      status:
        "INSUFFICIENT_DATA",

      direction:
        "NEUTRAL",

      regime:
        "UNKNOWN",

      longSupport:
        0,

      shortSupport:
        0,

      longCompatibility:
        0.5,

      shortCompatibility:
        0.5,

      confidence:
        0,

      quality:
        0,

      volatilityRegime:
        "UNKNOWN",

      marketStress:
        false,

      exposureMultiplier:
        0.5,

      reasons:
        [],

      risks: [
        "INSUFFICIENT_MARKET_DIRECTION_DATA",
      ],

      evidence: {
        availableDirectionalValues:
          availableDirectionalValues.length,
      },
    };
  }

  let longSupport =
    0;

  let shortSupport =
    0;

  const reasons =
    [];

  const risks =
    [];

  /*
   * ==========================================================
   * BTC TREND
   * ==========================================================
   *
   * BTC gets the highest market-regime influence because it
   * remains the dominant systemic crypto asset.
   */

  const btcWeighted =
    (
      btc1h ??
      0
    ) *
      0.15 +
    (
      btc4h ??
      0
    ) *
      0.30 +
    (
      btc24h ??
      0
    ) *
      0.35 +
    (
      btc7d ??
      0
    ) *
      0.20;

  if (
    btcWeighted >
    0
  ) {
    longSupport +=
      clamp(
        Math.abs(
          btcWeighted,
        ) *
          12,
        0,
        30,
      );
  }

  if (
    btcWeighted <
    0
  ) {
    shortSupport +=
      clamp(
        Math.abs(
          btcWeighted,
        ) *
          12,
        0,
        30,
      );
  }

  /*
   * ==========================================================
   * ETH TREND
   * ==========================================================
   */

  const ethWeighted =
    (
      eth1h ??
      0
    ) *
      0.15 +
    (
      eth4h ??
      0
    ) *
      0.30 +
    (
      eth24h ??
      0
    ) *
      0.35 +
    (
      eth7d ??
      0
    ) *
      0.20;

  if (
    ethWeighted >
    0
  ) {
    longSupport +=
      clamp(
        Math.abs(
          ethWeighted,
        ) *
          10,
        0,
        25,
      );
  }

  if (
    ethWeighted <
    0
  ) {
    shortSupport +=
      clamp(
        Math.abs(
          ethWeighted,
        ) *
          10,
        0,
        25,
      );
  }

  /*
   * ==========================================================
   * BTC / ETH ALIGNMENT
   * ==========================================================
   */

  if (
    btcWeighted >
      0 &&
    ethWeighted >
      0
  ) {
    longSupport +=
      15;

    reasons.push(
      "BTC_ETH_BULLISH_ALIGNMENT",
    );
  }

  if (
    btcWeighted <
      0 &&
    ethWeighted <
      0
  ) {
    shortSupport +=
      15;

    reasons.push(
      "BTC_ETH_BEARISH_ALIGNMENT",
    );
  }

  if (
    Math.sign(
      btcWeighted,
    ) !==
      Math.sign(
        ethWeighted,
      ) &&
    btcWeighted !==
      0 &&
    ethWeighted !==
      0
  ) {
    risks.push(
      "BTC_ETH_DIRECTIONAL_DIVERGENCE",
    );
  }

  /*
   * ==========================================================
   * MARKET BREADTH
   * ==========================================================
   */

  if (
    advancing !==
    null
  ) {
    if (
      advancing >=
      70
    ) {
      longSupport +=
        20;

      reasons.push(
        "STRONG_POSITIVE_MARKET_BREADTH",
      );
    } else if (
      advancing >=
      58
    ) {
      longSupport +=
        12;

      reasons.push(
        "POSITIVE_MARKET_BREADTH",
      );
    }
  }

  if (
    declining !==
    null
  ) {
    if (
      declining >=
      70
    ) {
      shortSupport +=
        20;

      reasons.push(
        "STRONG_NEGATIVE_MARKET_BREADTH",
      );
    } else if (
      declining >=
      58
    ) {
      shortSupport +=
        12;

      reasons.push(
        "NEGATIVE_MARKET_BREADTH",
      );
    }
  }

  /*
   * ==========================================================
   * MARKET ACCELERATION
   * ==========================================================
   */

  const shortTermAverage =
    average([
      btc1h,
      btc4h,
      eth1h,
      eth4h,
    ]);

  const mediumTermAverage =
    average([
      btc24h,
      eth24h,
    ]);

  if (
    shortTermAverage !==
      null &&
    mediumTermAverage !==
      null
  ) {
    /*
     * Bullish acceleration.
     */

    if (
      shortTermAverage >
        0 &&
      mediumTermAverage >
        0 &&
      shortTermAverage >
        mediumTermAverage
    ) {
      longSupport +=
        10;

      reasons.push(
        "BULLISH_MARKET_ACCELERATION",
      );
    }

    /*
     * Bearish acceleration.
     */

    if (
      shortTermAverage <
        0 &&
      mediumTermAverage <
        0 &&
      shortTermAverage <
        mediumTermAverage
    ) {
      shortSupport +=
        10;

      reasons.push(
        "BEARISH_MARKET_ACCELERATION",
      );
    }

    /*
     * Potential reversals.
     */

    if (
      mediumTermAverage >
        0 &&
      shortTermAverage <
        0
    ) {
      risks.push(
        "POSSIBLE_MARKET_BEARISH_REVERSAL",
      );
    }

    if (
      mediumTermAverage <
        0 &&
      shortTermAverage >
        0
    ) {
      risks.push(
        "POSSIBLE_MARKET_BULLISH_REVERSAL",
      );
    }
  }

  longSupport =
    clamp(
      longSupport,
    );

  shortSupport =
    clamp(
      shortSupport,
    );

  /*
   * ==========================================================
   * VOLATILITY REGIME
   * ==========================================================
   */

  let volatilityRegime =
    "NORMAL";

  if (
    (
      avgAbs24hMove !==
        null &&
      avgAbs24hMove >=
        10
    ) ||
    (
      realizedVolatility !==
        null &&
      realizedVolatility >=
        80
    )
  ) {
    volatilityRegime =
      "EXTREME";

    risks.push(
      "EXTREME_MARKET_VOLATILITY",
    );
  } else if (
    (
      avgAbs24hMove !==
        null &&
      avgAbs24hMove >=
        6
    ) ||
    (
      realizedVolatility !==
        null &&
      realizedVolatility >=
        60
    )
  ) {
    volatilityRegime =
      "HIGH";

    risks.push(
      "HIGH_MARKET_VOLATILITY",
    );
  } else if (
    avgAbs24hMove !==
      null &&
    avgAbs24hMove <=
      1.5
  ) {
    volatilityRegime =
      "LOW";
  }

  /*
   * ==========================================================
   * DERIVATIVES STRESS
   * ==========================================================
   */

  let stress =
    false;

  if (
    (
      liquidationStress !==
        null &&
      liquidationStress >=
        70
    ) ||
    (
      fundingStress !==
        null &&
      fundingStress >=
        80
    )
  ) {
    stress =
      true;

    risks.push(
      "DERIVATIVES_MARKET_STRESS",
    );
  }

  /*
   * ==========================================================
   * DIRECTIONAL REGIME CLASSIFICATION
   * ==========================================================
   *
   * IMPORTANT:
   *
   * Separation alone is not enough.
   *
   * Example:
   *
   * LONG 15
   * SHORT 0
   *
   * technically has a separation of 15, but there is not enough
   * absolute evidence to call the entire crypto environment
   * RISK_ON.
   *
   * We therefore require both:
   *
   * 1. meaningful dominant support
   * 2. meaningful separation
   */

  const separation =
    Math.abs(
      longSupport -
      shortSupport,
    );

  const dominantSupport =
    Math.max(
      longSupport,
      shortSupport,
    );

  const combinedSupport =
    longSupport +
    shortSupport;

  let direction =
    directionFromScores(
      longSupport,
      shortSupport,
    );

  let regime =
    "NEUTRAL";

  /*
   * Weak absolute evidence = no meaningful market direction.
   */

  const meaningfulDirectionalSupport =
    dominantSupport >=
    25;

  /*
   * Strong trend.
   */

  const strongTrend =
    dominantSupport >=
      60 &&
    separation >=
      30;

  /*
   * Moderate directional regime.
   */

  const directionalRegime =
    dominantSupport >=
      25 &&
    separation >=
      12;

  /*
   * High conflict.
   *
   * Example:
   *
   * LONG 48
   * SHORT 44
   *
   * This is not directional simply because LONG wins by 4.
   */

  const highlyConflicted =
    longSupport >=
      35 &&
    shortSupport >=
      35 &&
    separation <
      15;

  if (
    !meaningfulDirectionalSupport ||
    highlyConflicted
  ) {
    direction =
      "NEUTRAL";
  }

  /*
   * Stress has priority because it changes the execution/risk
   * environment even when directional evidence exists.
   */

  if (stress) {
    regime =
      "LIQUIDATION_STRESS";
  } else if (
    direction ===
      "LONG" &&
    strongTrend
  ) {
    regime =
      "BULL_TREND";
  } else if (
    direction ===
      "SHORT" &&
    strongTrend
  ) {
    regime =
      "BEAR_TREND";
  } else if (
    direction ===
      "LONG" &&
    directionalRegime
  ) {
    regime =
      "RISK_ON";
  } else if (
    direction ===
      "SHORT" &&
    directionalRegime
  ) {
    regime =
      "RISK_OFF";
  } else {
    regime =
      "CHOPPY";

    if (
      highlyConflicted
    ) {
      risks.push(
        "HIGH_DIRECTIONAL_REGIME_CONFLICT",
      );
    }
  }

  /*
   * ==========================================================
   * LONG / SHORT COMPATIBILITY
   * ==========================================================
   *
   * Compatibility is deliberately non-binary.
   *
   * Counter-regime trades are allowed.
   *
   * A very strong candidate-specific LONG can still be taken
   * during a bearish regime, but later systems may:
   *
   * - reduce exposure
   * - require stronger confirmation
   * - use tighter invalidation
   */

  const totalSupport =
    longSupport +
    shortSupport;

  let longCompatibility =
    0.5;

  let shortCompatibility =
    0.5;

  if (
    totalSupport >
    0
  ) {
    longCompatibility =
      clamp(
        50 +
          (
            longSupport -
            shortSupport
          ) *
            0.5,
      ) /
      100;

    shortCompatibility =
      clamp(
        50 +
          (
            shortSupport -
            longSupport
          ) *
            0.5,
      ) /
      100;
  }

  /*
   * Never completely kill the counter-regime side.
   */

  longCompatibility =
    Math.max(
      0.25,
      longCompatibility,
    );

  shortCompatibility =
    Math.max(
      0.25,
      shortCompatibility,
    );

  /*
   * ==========================================================
   * CONFIDENCE
   * ==========================================================
   */

  const completeness =
    availableDirectionalValues.length /
    8;

  let confidence =
    clamp(
      45 +
        separation *
          0.4 +
        completeness *
          25,
    ) /
    100;

  /*
   * Directionless/choppy environments should not report the same
   * directional confidence as strong trend regimes.
   */

  if (
    direction ===
    "NEUTRAL"
  ) {
    confidence *=
      0.72;
  }

  confidence =
    Math.max(
      0,
      Math.min(
        1,
        confidence,
      ),
    );

  /*
   * ==========================================================
   * EXPOSURE MULTIPLIER
   * ==========================================================
   *
   * This does NOT size a position.
   *
   * It only tells the future risk/exposure manager how friendly
   * the broad market environment currently is.
   */

  let exposureMultiplier =
    1;

  if (
    volatilityRegime ===
    "HIGH"
  ) {
    exposureMultiplier *=
      0.8;
  }

  if (
    volatilityRegime ===
    "EXTREME"
  ) {
    exposureMultiplier *=
      0.55;
  }

  if (stress) {
    exposureMultiplier *=
      0.6;
  }

  if (
    regime ===
    "CHOPPY"
  ) {
    exposureMultiplier *=
      0.75;
  }

  if (
    highlyConflicted
  ) {
    exposureMultiplier *=
      0.85;
  }

  exposureMultiplier =
    Math.max(
      0.25,
      Math.min(
        1.15,
        exposureMultiplier,
      ),
    );

  /*
   * ==========================================================
   * RESULT
   * ==========================================================
   */

  return {
    engine:
      "CRYPTO_TRADING_MARKET_REGIME",

    status:
      "COMPLETE",

    direction,

    regime,

    longSupport:
      Number(
        longSupport
          .toFixed(
            2,
          ),
      ),

    shortSupport:
      Number(
        shortSupport
          .toFixed(
            2,
          ),
      ),

    longCompatibility:
      Number(
        longCompatibility
          .toFixed(
            4,
          ),
      ),

    shortCompatibility:
      Number(
        shortCompatibility
          .toFixed(
            4,
          ),
      ),

    confidence:
      Number(
        confidence
          .toFixed(
            4,
          ),
      ),

    quality:
      Number(
        (
          completeness *
          100
        ).toFixed(
          2,
        ),
      ),

    volatilityRegime,

    marketStress:
      stress,

    exposureMultiplier:
      Number(
        exposureMultiplier
          .toFixed(
            3,
          ),
      ),

    reasons,

    risks,

    evidence: {
      btc: {
        weightedTrend:
          Number(
            btcWeighted
              .toFixed(
                4,
              ),
          ),

        change1hPercent:
          btc1h,

        change4hPercent:
          btc4h,

        change24hPercent:
          btc24h,

        change7dPercent:
          btc7d,
      },

      eth: {
        weightedTrend:
          Number(
            ethWeighted
              .toFixed(
                4,
              ),
          ),

        change1hPercent:
          eth1h,

        change4hPercent:
          eth4h,

        change24hPercent:
          eth24h,

        change7dPercent:
          eth7d,
      },

      breadth: {
        advancingPercent:
          advancing,

        decliningPercent:
          declining,
      },

      volatility: {
        realizedVolatility,

        averageAbsolute24hMove:
          avgAbs24hMove,
      },

      derivatives: {
        fundingStress,

        liquidationStress,
      },

      shortTermAverage:
        shortTermAverage ===
          null
          ? null
          : Number(
              shortTermAverage
                .toFixed(
                  4,
                ),
            ),

      mediumTermAverage:
        mediumTermAverage ===
          null
          ? null
          : Number(
              mediumTermAverage
                .toFixed(
                  4,
                ),
            ),

      separation:
        Number(
          separation
            .toFixed(
              2,
            ),
        ),

      dominantSupport:
        Number(
          dominantSupport
            .toFixed(
              2,
            ),
        ),

      combinedSupport:
        Number(
          combinedSupport
            .toFixed(
              2,
            ),
        ),

      highlyConflicted,
    },
  };
}