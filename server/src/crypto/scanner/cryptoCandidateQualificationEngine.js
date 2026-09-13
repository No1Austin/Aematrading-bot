/**
 * ============================================================
 * AEMA CRYPTO — CANDIDATE QUALIFICATION ENGINE — PHASE 2.4
 * ============================================================
 *
 * SEMANTICS
 * ---------
 *
 * eligible
 *   Passes hard scanner/data/tradability requirements.
 *
 * qualified
 *   Passes initial scanner qualification and may enter deep
 *   research when selected.
 *
 * highInterest
 *   Strong discovery signal:
 *   score >= minimumHighInterestScore
 *   AND direction edge >= minimumDirectionEdge
 *
 * IMPORTANT
 * ---------
 *
 * qualified !== highInterest
 * qualified !== botEligible
 *
 * This matches the intended pipeline:
 *
 * discovery
 * -> initial qualification
 * -> deep research
 * -> bot analysis (CEX only)
 * -> risk / execution standards
 */

import {
  CRYPTO_DIRECTION,
  CRYPTO_DISCOVERY_STATUS,
  CRYPTO_SCANNER_CONFIG,
} from "./cryptoScannerConfig.js";

import {
  applyCryptoCandidatePolicy,
} from "../policy/cryptoCandidateActionPolicy.js";

const finite =
  value => {
    const number =
      Number(value);

    return Number.isFinite(number)
      ? number
      : 0;
  };

const clamp =
  (
    value,
    minimum,
    maximum,
  ) =>
    Math.min(
      maximum,
      Math.max(
        minimum,
        value,
      ),
    );

const scale =
  (
    value,
    strong,
    maximum,
  ) =>
    strong > 0
      ? clamp(
          (
            Math.max(
              0,
              value,
            ) /
            strong
          ) *
            maximum,
          0,
          maximum,
        )
      : 0;

function scoreLiquidity(
  input,
  config,
) {
  return scale(
    finite(
      input?.liquidityUsd,
    ),
    config
      .liquidity
      .strongUsd,
    config
      .weights
      .liquidity,
  );
}

function scoreVolume(
  input,
  config,
) {
  return scale(
    finite(
      input?.volume24hUsd,
    ),
    config
      .volume
      .strongUsd,
    config
      .weights
      .volume,
  );
}

function scoreMomentum(
  input,
  direction,
  config,
) {
  const sign =
    direction ===
    CRYPTO_DIRECTION.LONG
      ? 1
      : -1;

  const one =
    finite(
      input?.change1hPercent,
    ) *
    sign;

  const four =
    finite(
      input?.change4hPercent ??
      input?.change6hPercent,
    ) *
    sign;

  const day =
    finite(
      input?.change24hPercent,
    ) *
    sign;

  const maximum =
    config.weights.momentum;

  let score = 0;

  if (one > 0) {
    score +=
      scale(
        one,
        config
          .momentum
          .oneHourStrongPercent,
        maximum *
          0.3,
      );
  }

  if (four > 0) {
    score +=
      scale(
        four,
        config
          .momentum
          .fourHourStrongPercent,
        maximum *
          0.3,
      );
  }

  if (day > 0) {
    score +=
      scale(
        day,
        config
          .momentum
          .twentyFourHourStrongPercent,
        maximum *
          0.4,
      );
  }

  return clamp(
    score,
    0,
    maximum,
  );
}

function scoreVolatility(
  input,
  config,
) {
  const range =
    Math.abs(
      finite(
        input?.intradayRangePercent,
      ),
    );

  const maximum =
    config.weights.volatility;

  if (range <= 0) {
    return 0;
  }

  if (range <= 4) {
    return maximum * 0.55;
  }

  if (range <= 12) {
    return maximum;
  }

  if (range <= 30) {
    return maximum * 0.7;
  }

  return maximum * 0.35;
}

function scoreTrend(
  input,
  direction,
  config,
) {
  const sign =
    direction ===
    CRYPTO_DIRECTION.LONG
      ? 1
      : -1;

  const one =
    finite(
      input?.change1hPercent,
    ) *
    sign;

  const day =
    finite(
      input?.change24hPercent,
    ) *
    sign;

  const week =
    finite(
      input?.change7dPercent,
    ) *
    sign;

  const maximum =
    config.weights.trend;

  let score = 0;

  if (one > 0) {
    score += maximum * 0.2;
  }

  if (day > 0) {
    score += maximum * 0.35;
  }

  if (week > 0) {
    score += maximum * 0.45;
  }

  return score;
}

function scoreVenue(
  input,
  config,
) {
  const maximum =
    config
      .weights
      .venueQuality;

  return clamp(
    scale(
      finite(
        input?.venueCount,
      ),
      config
        .venueQuality
        .healthyVenueCount,
      maximum * 0.5,
    ) +
      scale(
        finite(
          input?.cexCount,
        ),
        config
          .venueQuality
          .healthyCexCount,
        maximum * 0.25,
      ) +
      scale(
        finite(
          input?.dexCount,
        ),
        config
          .venueQuality
          .healthyDexCount,
        maximum * 0.25,
      ),
    0,
    maximum,
  );
}

function scoreEmerging(
  input,
  config,
) {
  const maximum =
    config
      .weights
      .emergingActivity;

  const liquidity =
    finite(
      input?.liquidityUsd,
    );

  const volume =
    finite(
      input?.volume24hUsd,
    );

  if (volume <= 0) {
    return 0;
  }

  if (liquidity <= 0) {
    return Math.min(
      maximum * 0.45,

      scale(
        volume,
        config
          .volume
          .strongUsd,
        maximum * 0.45,
      ),
    );
  }

  return scale(
    volume / liquidity,
    config
      .emerging
      .volumeToLiquidityStrong,
    maximum,
  );
}

function scoreRegime(
  input,
  direction,
  config,
) {
  const maximum =
    config.weights.regime;

  const regime =
    String(
      input?.marketRegime ??
      "NEUTRAL",
    )
      .trim()
      .toUpperCase();

  if (regime === "NEUTRAL") {
    return maximum * 0.5;
  }

  if (
    direction ===
      CRYPTO_DIRECTION.LONG &&
    [
      "RISK_ON",
      "BULLISH",
    ].includes(regime)
  ) {
    return maximum;
  }

  if (
    direction ===
      CRYPTO_DIRECTION.SHORT &&
    [
      "RISK_OFF",
      "BEARISH",
    ].includes(regime)
  ) {
    return maximum;
  }

  return maximum * 0.15;
}

function calculate(
  input,
  direction,
  config,
) {
  const breakdown = {
    liquidity:
      scoreLiquidity(
        input,
        config,
      ),

    volume:
      scoreVolume(
        input,
        config,
      ),

    momentum:
      scoreMomentum(
        input,
        direction,
        config,
      ),

    volatility:
      scoreVolatility(
        input,
        config,
      ),

    trend:
      scoreTrend(
        input,
        direction,
        config,
      ),

    venueQuality:
      scoreVenue(
        input,
        config,
      ),

    emergingActivity:
      scoreEmerging(
        input,
        config,
      ),

    regime:
      scoreRegime(
        input,
        direction,
        config,
      ),
  };

  const score =
    Object.values(
      breakdown,
    )
      .reduce(
        (
          total,
          value,
        ) =>
          total +
          value,
        0,
      );

  return {
    direction,

    score:
      Math.round(
        clamp(
          score,
          0,
          100,
        ) *
          100,
      ) /
      100,

    breakdown:
      Object.fromEntries(
        Object.entries(
          breakdown,
        )
          .map(
            ([
              key,
              value,
            ]) => [
              key,

              Math.round(
                value *
                  100,
              ) /
                100,
            ],
          ),
      ),
  };
}

export function qualifyCryptoCandidate(
  input,
  config =
    CRYPTO_SCANNER_CONFIG,
) {
  const rejectionReasons =
    [];

  const hard =
    config.hardEligibility;

  if (
    hard.requireTradable &&
    input?.tradable !== true
  ) {
    rejectionReasons.push(
      "NOT_TRADABLE",
    );
  }

  if (
    finite(
      input?.priceUsd,
    ) <
    hard.minimumPriceUsd
  ) {
    rejectionReasons.push(
      "PRICE_BELOW_MINIMUM",
    );
  }

  if (
    finite(
      input?.volume24hUsd,
    ) <
    hard.minimum24hVolumeUsd
  ) {
    rejectionReasons.push(
      "INSUFFICIENT_VOLUME",
    );
  }

  if (
    finite(
      input?.dexCount,
    ) > 0 &&
    finite(
      input?.liquidityUsd,
    ) <
      hard.minimumLiquidityUsd
  ) {
    rejectionReasons.push(
      "INSUFFICIENT_DEX_LIQUIDITY",
    );
  }

  if (
    hard.requireVenue &&
    finite(
      input?.venueCount,
    ) <= 0
  ) {
    rejectionReasons.push(
      "NO_TRADING_VENUE",
    );
  }

  if (
    hard
      .rejectCriticalIntegrityFlags &&
    Array.isArray(
      input
        ?.integrity
        ?.criticalFlags,
    ) &&
    input
      .integrity
      .criticalFlags
      .length > 0
  ) {
    rejectionReasons.push(
      "CRITICAL_INTEGRITY_FLAG",
    );
  }

  /**
   * ==========================================================
   * INITIAL QUALIFICATION
   * ==========================================================
   *
   * Passing hard requirements means the project is qualified
   * for the research pipeline.
   */
  const eligible =
    rejectionReasons.length === 0;

  const qualified =
    eligible;

  const long =
    calculate(
      input,
      CRYPTO_DIRECTION.LONG,
      config,
    );

  const short =
    calculate(
      input,
      CRYPTO_DIRECTION.SHORT,
      config,
    );

  const preferred =
    long.score >
    short.score
      ? CRYPTO_DIRECTION.LONG
      : short.score >
        long.score
        ? CRYPTO_DIRECTION.SHORT
        : CRYPTO_DIRECTION.NEUTRAL;

  const scannerScore =
    Math.max(
      long.score,
      short.score,
    );

  const directionEdge =
    Math.abs(
      long.score -
      short.score,
    );

  /**
   * ==========================================================
   * HIGH-INTEREST SIGNAL
   * ==========================================================
   */

  const highInterestReasons =
    [];

  if (
    scannerScore <
    config
      .discovery
      .minimumHighInterestScore
  ) {
    highInterestReasons.push(
      "SCANNER_SCORE_BELOW_HIGH_INTEREST",
    );
  }

  if (
    directionEdge <
    config
      .discovery
      .minimumDirectionEdge
  ) {
    highInterestReasons.push(
      "INSUFFICIENT_DIRECTION_EDGE",
    );
  }

  const highInterest =
    qualified &&
    highInterestReasons.length === 0;

  const candidate = {
    assetId:
      input?.assetId ??
      null,

    symbol:
      input?.symbol ??
      null,

    name:
      input?.name ??
      null,

    eligible,

    /*
     * Initial scanner qualification.
     */
    qualified,

    /*
     * Strong discovery conviction, separate from qualification.
     */
    highInterest,

    discoveryStatus:
      !eligible
        ? CRYPTO_DISCOVERY_STATUS.REJECTED
        : highInterest
          ? CRYPTO_DISCOVERY_STATUS.HIGH_INTEREST
          : CRYPTO_DISCOVERY_STATUS.RESEARCHABLE,

    preferredDirection:
      preferred,

    scannerScore,

    longScannerScore:
      long.score,

    shortScannerScore:
      short.score,

    directionEdge:
      Math.round(
        directionEdge *
          100,
      ) /
      100,

    longBreakdown:
      long.breakdown,

    shortBreakdown:
      short.breakdown,

    rejectionReasons,

    /*
     * Keep compatibility for existing UI/code, but these now
     * describe why the token is not HIGH_INTEREST — not why it
     * failed initial qualification.
     */
    qualificationReasons:
      highInterestReasons,

    highInterestReasons,

    venues: {
      venueCount:
        finite(
          input?.venueCount,
        ),

      cexCount:
        finite(
          input?.cexCount,
        ),

      dexCount:
        finite(
          input?.dexCount,
        ),

      primaryVenue:
        input?.primaryVenue ??
        null,

      exchanges:
        Array.isArray(
          input?.exchanges,
        )
          ? input.exchanges
          : [],
    },

    measurements:
      input,
  };

  return applyCryptoCandidatePolicy(
    candidate,
  );
}

export default
  qualifyCryptoCandidate;
