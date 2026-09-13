import {
  buildCryptoDirectionalResult,
  buildInsufficientDirectionalResult,
  CRYPTO_ENGINE_ROLE,
  CRYPTO_TIME_HORIZON,
} from "../contracts/cryptoDirectionalEngineContract.js";

const finite = (v) =>
  Number.isFinite(Number(v)) ? Number(v) : null;

const clamp = (v, a = 0, b = 100) =>
  Math.min(b, Math.max(a, Number(v) || 0));

const sign = (v) => {
  const x = finite(v);
  if (x === null || x === 0) return 0;
  return x > 0 ? 1 : -1;
};

const magnitude = (v, strong) => {
  const x = finite(v);
  if (x === null) return null;

  return clamp((Math.abs(x) / strong) * 100);
};

/**
 * AEMA CRYPTO TRADING MOMENTUM ENGINE
 *
 * Purpose:
 * Determine whether directional momentum is:
 *
 * - accelerating LONG
 * - accelerating SHORT
 * - continuing
 * - decelerating
 * - reversing
 * - conflicting
 *
 * IMPORTANT:
 * This is a Phase 5 trading engine.
 *
 * It does NOT determine whether the asset is a good project.
 * It does NOT determine research eligibility.
 * It does NOT execute trades.
 *
 * It measures the quality and persistence of the current move.
 */

export default async function run(candidate) {
  const m = candidate?.measurements ?? {};

  const h1 = finite(m.change1hPercent);
  const h4 = finite(m.change4hPercent);
  const d1 = finite(m.change24hPercent);
  const d7 = finite(m.change7dPercent);

  const available = [h1, h4, d1, d7].filter(
    (v) => v !== null
  ).length;

  if (available < 3) {
    return buildInsufficientDirectionalResult({
      engine: "CRYPTO_TRADING_MOMENTUM",
      role: CRYPTO_ENGINE_ROLE.DIRECTIONAL,
      horizon: CRYPTO_TIME_HORIZON.INTRADAY,
      reasons: ["INSUFFICIENT_MULTI_TIMEFRAME_MOMENTUM"],
      evidence: {
        change1hPercent: h1,
        change4hPercent: h4,
        change24hPercent: d1,
        change7dPercent: d7,
      },
    });
  }

  let longSupport = 0;
  let shortSupport = 0;

  const reasons = [];
  const risks = [];

  /*
   * --------------------------------------------------
   * 1. RAW MOMENTUM
   * --------------------------------------------------
   */

  const components = [
    {
      value: h1,
      strong: 4,
      weight: 0.30,
      name: "1H",
    },
    {
      value: h4,
      strong: 7,
      weight: 0.30,
      name: "4H",
    },
    {
      value: d1,
      strong: 12,
      weight: 0.25,
      name: "24H",
    },
    {
      value: d7,
      strong: 25,
      weight: 0.15,
      name: "7D",
    },
  ];

  for (const component of components) {
    if (component.value === null) continue;

    const strength = magnitude(
      component.value,
      component.strong
    );

    const points = strength * component.weight;

    if (component.value > 0) {
      longSupport += points;
    } else if (component.value < 0) {
      shortSupport += points;
    }
  }

  /*
   * --------------------------------------------------
   * 2. TIMEFRAME ALIGNMENT
   * --------------------------------------------------
   */

  const directions = [h1, h4, d1, d7]
    .filter((v) => v !== null)
    .map(sign);

  const bullish = directions.filter((x) => x > 0).length;
  const bearish = directions.filter((x) => x < 0).length;

  if (bullish === available) {
    longSupport += 14;
    reasons.push("FULL_BULLISH_TIMEFRAME_ALIGNMENT");
  } else if (bearish === available) {
    shortSupport += 14;
    reasons.push("FULL_BEARISH_TIMEFRAME_ALIGNMENT");
  } else if (bullish >= 3) {
    longSupport += 8;
    reasons.push("BROAD_BULLISH_TIMEFRAME_ALIGNMENT");
  } else if (bearish >= 3) {
    shortSupport += 8;
    reasons.push("BROAD_BEARISH_TIMEFRAME_ALIGNMENT");
  } else {
    risks.push("MOMENTUM_TIMEFRAME_CONFLICT");
  }

  /*
   * --------------------------------------------------
   * 3. ACCELERATION / DECELERATION
   * --------------------------------------------------
   *
   * Convert longer-window moves into approximate
   * comparable hourly velocity.
   */

  const velocity1h =
    h1 !== null ? h1 : null;

  const velocity4h =
    h4 !== null ? h4 / 4 : null;

  const velocity24h =
    d1 !== null ? d1 / 24 : null;

  let acceleration = null;

  if (
    velocity1h !== null &&
    velocity4h !== null
  ) {
    acceleration = velocity1h - velocity4h;

    if (
      velocity1h > 0 &&
      velocity4h > 0
    ) {
      if (velocity1h > velocity4h * 1.25) {
        longSupport += 12;
        reasons.push("BULLISH_MOMENTUM_ACCELERATING");
      } else if (velocity1h < velocity4h * 0.50) {
        risks.push("BULLISH_MOMENTUM_DECELERATING");
      }
    }

    if (
      velocity1h < 0 &&
      velocity4h < 0
    ) {
      if (
        Math.abs(velocity1h) >
        Math.abs(velocity4h) * 1.25
      ) {
        shortSupport += 12;
        reasons.push("BEARISH_MOMENTUM_ACCELERATING");
      } else if (
        Math.abs(velocity1h) <
        Math.abs(velocity4h) * 0.50
      ) {
        risks.push("BEARISH_MOMENTUM_DECELERATING");
      }
    }
  }

  /*
   * --------------------------------------------------
   * 4. SHORT-TERM REVERSAL DETECTION
   * --------------------------------------------------
   */

  if (
    h1 !== null &&
    h4 !== null
  ) {
    if (h4 < 0 && h1 > 0) {
      longSupport += 8;
      risks.push("POSSIBLE_BULLISH_REVERSAL");
    }

    if (h4 > 0 && h1 < 0) {
      shortSupport += 8;
      risks.push("POSSIBLE_BEARISH_REVERSAL");
    }
  }

  /*
   * --------------------------------------------------
   * 5. 24H TREND CONFIRMATION
   * --------------------------------------------------
   */

  if (
    h4 !== null &&
    d1 !== null
  ) {
    if (h4 > 0 && d1 > 0) {
      longSupport += 7;
      reasons.push("BULLISH_4H_24H_CONFIRMATION");
    }

    if (h4 < 0 && d1 < 0) {
      shortSupport += 7;
      reasons.push("BEARISH_4H_24H_CONFIRMATION");
    }
  }

  /*
   * --------------------------------------------------
   * 6. LONGER TREND CONFIRMATION
   * --------------------------------------------------
   */

  if (
    d1 !== null &&
    d7 !== null
  ) {
    if (d1 > 0 && d7 > 0) {
      longSupport += 5;
      reasons.push("BULLISH_24H_7D_CONFIRMATION");
    }

    if (d1 < 0 && d7 < 0) {
      shortSupport += 5;
      reasons.push("BEARISH_24H_7D_CONFIRMATION");
    }
  }

  /*
   * --------------------------------------------------
   * 7. EXHAUSTION DETECTION
   * --------------------------------------------------
   */

  if (
    h1 !== null &&
    h4 !== null &&
    d1 !== null
  ) {
    if (
      d1 > 12 &&
      h4 > 0 &&
      h1 < 0
    ) {
      longSupport *= 0.82;
      shortSupport += 10;

      risks.push("BULLISH_MOVE_SHOWING_EXHAUSTION");
    }

    if (
      d1 < -12 &&
      h4 < 0 &&
      h1 > 0
    ) {
      shortSupport *= 0.82;
      longSupport += 10;

      risks.push("BEARISH_MOVE_SHOWING_EXHAUSTION");
    }
  }

  /*
   * --------------------------------------------------
   * 8. EXTREME MOMENTUM PROTECTION
   * --------------------------------------------------
   *
   * Very large moves should not automatically become
   * extremely strong continuation signals.
   */

  if (h1 !== null && Math.abs(h1) > 8) {
    risks.push("EXTREME_1H_MOVE");
  }

  if (d1 !== null && Math.abs(d1) > 25) {
    risks.push("EXTREME_24H_MOVE");

    if (d1 > 0) {
      longSupport *= 0.88;
    } else {
      shortSupport *= 0.88;
    }
  }

  longSupport = clamp(longSupport);
  shortSupport = clamp(shortSupport);

  /*
   * --------------------------------------------------
   * 9. CONFIDENCE
   * --------------------------------------------------
   */

  const separation =
    Math.abs(longSupport - shortSupport);

  const dominant =
    Math.max(bullish, bearish);

  const alignment =
    dominant / Math.max(1, available);

  const coverage =
    available / 4;

  const confidence = clamp(
    (
      coverage * 0.30 +
      alignment * 0.40 +
      Math.min(1, separation / 55) * 0.30
    ) * 100
  ) / 100;

  const quality = clamp(
    coverage * 45 +
    alignment * 35 +
    Math.min(1, separation / 50) * 20
  );

  return buildCryptoDirectionalResult({
    engine: "CRYPTO_TRADING_MOMENTUM",

    role:
      CRYPTO_ENGINE_ROLE.DIRECTIONAL,

    horizon:
      CRYPTO_TIME_HORIZON.INTRADAY,

    longSupport,
    shortSupport,
    confidence,
    quality,

    reasons,
    risks,

    evidence: {
      change1hPercent: h1,
      change4hPercent: h4,
      change24hPercent: d1,
      change7dPercent: d7,

      velocity1h,
      velocity4h,
      velocity24h,
      acceleration,

      bullishTimeframes: bullish,
      bearishTimeframes: bearish,
      availableTimeframes: available,
    },
  });
}