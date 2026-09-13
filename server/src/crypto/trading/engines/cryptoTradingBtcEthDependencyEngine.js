import {
  buildCryptoDirectionalResult,
  buildInsufficientDirectionalResult,
  CRYPTO_ENGINE_ROLE,
  CRYPTO_TIME_HORIZON,
} from "../contracts/cryptoDirectionalEngineContract.js";

/**
 * AEMA CRYPTO TRADING — BTC / ETH DEPENDENCY ENGINE
 *
 * PURPOSE
 * ------------------------------------------------------------
 * Measures:
 *  - historical/current movement relationship with BTC and ETH
 *  - leader confirmation
 *  - leader opposition
 *  - relative independence
 *  - systemic pressure
 *
 * IMPORTANT DESIGN RULE
 * ------------------------------------------------------------
 * Dependency and directional agreement are NOT the same thing.
 *
 * If an alt is rising while BTC is falling:
 *
 *   dependency may appear low,
 *   BUT leader conflict still exists.
 *
 * Therefore:
 *
 *   dependency = how similarly they are behaving
 *   conflict   = whether leaders oppose candidate direction
 *
 * Counter-market movement must NOT disappear simply because
 * measured dependency is low.
 *
 * This engine does NOT choose the trade by itself.
 */

const finite = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number(value) || 0));

const round = (value, places = 2) => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  const factor = 10 ** places;

  return Math.round(n * factor) / factor;
};

const sign = (value) => {
  const n = finite(value);

  if (n === null || Math.abs(n) < 0.000001) {
    return 0;
  }

  return n > 0 ? 1 : -1;
};

const average = (values) => {
  const valid = values
    .map(finite)
    .filter((value) => value !== null);

  if (!valid.length) {
    return null;
  }

  return (
    valid.reduce((sum, value) => sum + value, 0) /
    valid.length
  );
};

const TIMEFRAMES = Object.freeze([
  {
    key: "change1hPercent",
    weight: 0.30,
  },
  {
    key: "change4hPercent",
    weight: 0.30,
  },
  {
    key: "change24hPercent",
    weight: 0.25,
  },
  {
    key: "change7dPercent",
    weight: 0.15,
  },
]);

/**
 * ------------------------------------------------------------
 * Weighted directional movement
 * ------------------------------------------------------------
 */

function weightedDirection(measurements) {
  let score = 0;
  let availableWeight = 0;

  for (const timeframe of TIMEFRAMES) {
    const value = finite(
      measurements?.[timeframe.key],
    );

    if (value === null) {
      continue;
    }

    score += value * timeframe.weight;
    availableWeight += timeframe.weight;
  }

  if (availableWeight <= 0) {
    return {
      available: false,
      score: 0,
      direction: "NEUTRAL",
    };
  }

  const normalized = score / availableWeight;

  return {
    available: true,
    score: normalized,

    direction:
      normalized > 0.05
        ? "LONG"
        : normalized < -0.05
          ? "SHORT"
          : "NEUTRAL",
  };
}

/**
 * ------------------------------------------------------------
 * Magnitude similarity
 * ------------------------------------------------------------
 */

function magnitudeSimilarity(
  candidateMove,
  leaderMove,
) {
  const candidate = finite(candidateMove);
  const leader = finite(leaderMove);

  if (
    candidate === null ||
    leader === null
  ) {
    return null;
  }

  const a = Math.abs(candidate);
  const b = Math.abs(leader);

  if (a < 0.05 && b < 0.05) {
    return 1;
  }

  const maximum = Math.max(a, b);

  if (maximum <= 0) {
    return 1;
  }

  return Math.max(
    0,
    1 - Math.abs(a - b) / maximum,
  );
}

/**
 * ------------------------------------------------------------
 * Relationship with one leader
 * ------------------------------------------------------------
 */

function calculateLeaderRelationship(
  candidateMeasurements,
  leaderMeasurements,
) {
  let availableWeight = 0;

  let alignedWeight = 0;
  let opposedWeight = 0;
  let magnitudeWeight = 0;

  let alignedTimeframes = 0;
  let opposedTimeframes = 0;

  const evidence = [];

  for (const timeframe of TIMEFRAMES) {
    const candidateMove = finite(
      candidateMeasurements?.[timeframe.key],
    );

    const leaderMove = finite(
      leaderMeasurements?.[timeframe.key],
    );

    if (
      candidateMove === null ||
      leaderMove === null
    ) {
      continue;
    }

    const candidateSign = sign(candidateMove);
    const leaderSign = sign(leaderMove);

    const aligned =
      candidateSign !== 0 &&
      leaderSign !== 0 &&
      candidateSign === leaderSign;

    const opposed =
      candidateSign !== 0 &&
      leaderSign !== 0 &&
      candidateSign !== leaderSign;

    if (aligned) {
      alignedWeight += timeframe.weight;
      alignedTimeframes += 1;
    }

    if (opposed) {
      opposedWeight += timeframe.weight;
      opposedTimeframes += 1;
    }

    const similarity =
      magnitudeSimilarity(
        candidateMove,
        leaderMove,
      );

    magnitudeWeight +=
      (similarity ?? 0) *
      timeframe.weight;

    availableWeight += timeframe.weight;

    evidence.push({
      timeframe: timeframe.key,

      candidateMove,
      leaderMove,

      aligned,
      opposed,

      magnitudeSimilarity:
        similarity === null
          ? null
          : round(similarity, 4),
    });
  }

  if (availableWeight <= 0) {
    return {
      available: false,

      dependency: 0,
      alignment: 0,
      opposition: 0,
      magnitudeSimilarity: 0,

      alignedTimeframes: 0,
      opposedTimeframes: 0,

      evidence: [],
    };
  }

  const alignment =
    alignedWeight /
    availableWeight;

  const opposition =
    opposedWeight /
    availableWeight;

  const magnitude =
    magnitudeWeight /
    availableWeight;

  /*
   * Dependency describes similarity of movement.
   *
   * Opposition is intentionally NOT converted into dependency.
   * It is preserved separately as systemic conflict evidence.
   */

  const dependency =
    alignment * 0.70 +
    magnitude * 0.30;

  return {
    available: true,

    dependency:
      clamp(dependency * 100),

    alignment:
      clamp(alignment * 100),

    opposition:
      clamp(opposition * 100),

    magnitudeSimilarity:
      clamp(magnitude * 100),

    alignedTimeframes,
    opposedTimeframes,

    evidence,
  };
}

/**
 * ------------------------------------------------------------
 * MAIN ENGINE
 * ------------------------------------------------------------
 */

export default async function runCryptoTradingBtcEthDependencyEngine(
  candidate,
  {
    marketContext = null,
  } = {},
) {
  const measurements =
    candidate?.measurements ?? {};

  const btcMeasurements =
    marketContext?.btc ?? null;

  const ethMeasurements =
    marketContext?.eth ?? null;

  if (
    !btcMeasurements &&
    !ethMeasurements
  ) {
    return buildInsufficientDirectionalResult({
      engine:
        "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

      role:
        CRYPTO_ENGINE_ROLE.DIRECTIONAL,

      horizon:
        CRYPTO_TIME_HORIZON.INTRADAY,

      reasons: [
        "BTC_ETH_CONTEXT_UNAVAILABLE",
      ],
    });
  }

  const candidateDirection =
    weightedDirection(measurements);

  if (!candidateDirection.available) {
    return buildInsufficientDirectionalResult({
      engine:
        "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

      role:
        CRYPTO_ENGINE_ROLE.DIRECTIONAL,

      horizon:
        CRYPTO_TIME_HORIZON.INTRADAY,

      reasons: [
        "CANDIDATE_DIRECTION_UNAVAILABLE",
      ],
    });
  }

  const btcDirection =
    weightedDirection(
      btcMeasurements ?? {},
    );

  const ethDirection =
    weightedDirection(
      ethMeasurements ?? {},
    );

  const btcRelationship =
    calculateLeaderRelationship(
      measurements,
      btcMeasurements ?? {},
    );

  const ethRelationship =
    calculateLeaderRelationship(
      measurements,
      ethMeasurements ?? {},
    );

  if (
    !btcRelationship.available &&
    !ethRelationship.available
  ) {
    return buildInsufficientDirectionalResult({
      engine:
        "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

      role:
        CRYPTO_ENGINE_ROLE.DIRECTIONAL,

      horizon:
        CRYPTO_TIME_HORIZON.INTRADAY,

      reasons: [
        "INSUFFICIENT_LEADER_COMPARISON_DATA",
      ],
    });
  }

  /**
   * ----------------------------------------------------------
   * Overall dependency
   * ----------------------------------------------------------
   */

  const dependencyValues = [];

  if (btcRelationship.available) {
    dependencyValues.push(
      btcRelationship.dependency,
    );
  }

  if (ethRelationship.available) {
    dependencyValues.push(
      ethRelationship.dependency,
    );
  }

  const overallDependency =
    average(dependencyValues) ?? 0;

  let dependencyClass = "INDEPENDENT";

  if (overallDependency >= 75) {
    dependencyClass =
      "HIGH_DEPENDENCY";
  } else if (
    overallDependency >= 50
  ) {
    dependencyClass =
      "MODERATE_DEPENDENCY";
  } else if (
    overallDependency >= 30
  ) {
    dependencyClass =
      "LOW_DEPENDENCY";
  }

  /**
   * ----------------------------------------------------------
   * Explicit leader alignment / conflict
   * ----------------------------------------------------------
   */

  const btcConfirms =
    btcDirection.available &&
    btcDirection.direction !== "NEUTRAL" &&
    btcDirection.direction ===
      candidateDirection.direction;

  const ethConfirms =
    ethDirection.available &&
    ethDirection.direction !== "NEUTRAL" &&
    ethDirection.direction ===
      candidateDirection.direction;

  const btcOpposes =
    btcDirection.available &&
    btcDirection.direction !== "NEUTRAL" &&
    candidateDirection.direction !== "NEUTRAL" &&
    btcDirection.direction !==
      candidateDirection.direction;

  const ethOpposes =
    ethDirection.available &&
    ethDirection.direction !== "NEUTRAL" &&
    candidateDirection.direction !== "NEUTRAL" &&
    ethDirection.direction !==
      candidateDirection.direction;

  const leadersAligned =
    btcDirection.available &&
    ethDirection.available &&
    btcDirection.direction !== "NEUTRAL" &&
    btcDirection.direction ===
      ethDirection.direction;

  const systemicAlignment =
    leadersAligned &&
    btcDirection.direction ===
      candidateDirection.direction;

  /*
   * CRITICAL FIX:
   *
   * Conflict does NOT require high dependency.
   *
   * If BTC and ETH are clearly moving opposite the candidate,
   * that fact must survive even if dependency mathematics falls.
   */

  const systemicConflict =
    btcOpposes ||
    ethOpposes;

  const broadSystemicConflict =
    btcOpposes &&
    ethOpposes;

  /**
   * ----------------------------------------------------------
   * Directional support
   * ----------------------------------------------------------
   *
   * IMPORTANT:
   *
   * This engine describes systemic support FOR THE CANDIDATE'S
   * direction.
   *
   * It must not accidentally turn a LONG candidate into SHORT
   * simply because BTC is bearish.
   *
   * Leader opposition becomes:
   *
   *   - reduced support
   *   - lower compatibility
   *   - risk flags
   *
   * not an automatic opposite trade signal.
   */

  let candidateSupport = 0;

  const reasons = [];
  const risks = [];

  /**
   * BTC confirmation
   */

  if (btcConfirms) {
    const strength =
      Math.max(
        0.35,
        btcRelationship.dependency / 100,
      );

    candidateSupport +=
      45 * strength;

    reasons.push(
      candidateDirection.direction === "LONG"
        ? "BTC_CONFIRMS_CANDIDATE_LONG"
        : "BTC_CONFIRMS_CANDIDATE_SHORT",
    );
  }

  /**
   * ETH confirmation
   */

  if (ethConfirms) {
    const strength =
      Math.max(
        0.30,
        ethRelationship.dependency / 100,
      );

    candidateSupport +=
      35 * strength;

    reasons.push(
      candidateDirection.direction === "LONG"
        ? "ETH_CONFIRMS_CANDIDATE_LONG"
        : "ETH_CONFIRMS_CANDIDATE_SHORT",
    );
  }

  /**
   * Systemic confirmation bonus
   */

  if (systemicAlignment) {
    candidateSupport += 15;

    reasons.push(
      candidateDirection.direction === "LONG"
        ? "BTC_ETH_SYSTEMIC_LONG_CONFIRMATION"
        : "BTC_ETH_SYSTEMIC_SHORT_CONFIRMATION",
    );
  }

  /**
   * BTC opposition
   */

  if (btcOpposes) {
    risks.push(
      candidateDirection.direction === "LONG"
        ? "CANDIDATE_LONG_AGAINST_BTC"
        : "CANDIDATE_SHORT_AGAINST_BTC",
    );
  }

  /**
   * ETH opposition
   */

  if (ethOpposes) {
    risks.push(
      candidateDirection.direction === "LONG"
        ? "CANDIDATE_LONG_AGAINST_ETH"
        : "CANDIDATE_SHORT_AGAINST_ETH",
    );
  }

  /**
   * Broad opposition
   */

  if (broadSystemicConflict) {
    risks.push(
      "BROAD_LEADER_CONFLICT",
    );
  }

  /**
   * BTC / ETH disagreement
   */

  const leaderDivergence =
    btcDirection.available &&
    ethDirection.available &&
    btcDirection.direction !== "NEUTRAL" &&
    ethDirection.direction !== "NEUTRAL" &&
    btcDirection.direction !==
      ethDirection.direction;

  if (leaderDivergence) {
    risks.push(
      "BTC_ETH_LEADER_DIVERGENCE",
    );
  }

  /**
   * Relative independence
   */

  if (overallDependency < 30) {
    reasons.push(
      "CANDIDATE_SHOWS_RELATIVE_MARKET_INDEPENDENCE",
    );
  }

  /**
   * High dependency
   */

  if (overallDependency >= 75) {
    reasons.push(
      "HIGH_SYSTEMIC_DEPENDENCY",
    );
  }

  /**
   * ----------------------------------------------------------
   * Compatibility
   * ----------------------------------------------------------
   *
   * This will become very useful later for exposure sizing.
   */

  let compatibility = 0.5;

  if (systemicAlignment) {
    compatibility += 0.35;
  }

  if (btcConfirms) {
    compatibility += 0.08;
  }

  if (ethConfirms) {
    compatibility += 0.07;
  }

  if (btcOpposes) {
    compatibility -=
      overallDependency >= 50
        ? 0.15
        : 0.07;
  }

  if (ethOpposes) {
    compatibility -=
      overallDependency >= 50
        ? 0.12
        : 0.06;
  }

  if (broadSystemicConflict) {
    compatibility -= 0.08;
  }

  if (leaderDivergence) {
    compatibility -= 0.05;
  }

  /*
   * Independent candidates should not receive a huge penalty
   * merely because leaders disagree.
   */

  if (
    overallDependency < 30 &&
    systemicConflict
  ) {
    compatibility += 0.08;

    reasons.push(
      "LOW_DEPENDENCY_REDUCES_SYSTEMIC_CONFLICT_PENALTY",
    );
  }

  compatibility =
    Math.min(
      1,
      Math.max(
        0.1,
        compatibility,
      ),
    );

  /**
   * ----------------------------------------------------------
   * Directional result
   * ----------------------------------------------------------
   */

  candidateSupport =
    clamp(candidateSupport);

  let longSupport = 0;
  let shortSupport = 0;

  if (
    candidateDirection.direction ===
    "LONG"
  ) {
    longSupport =
      candidateSupport;
  }

  if (
    candidateDirection.direction ===
    "SHORT"
  ) {
    shortSupport =
      candidateSupport;
  }

  /**
   * Do not return zero directional evidence for a valid
   * counter-market candidate.
   *
   * The engine still acknowledges the candidate direction,
   * but with weak systemic support.
   */

  if (
    candidateDirection.direction ===
      "LONG" &&
    longSupport === 0
  ) {
    longSupport = 10;
  }

  if (
    candidateDirection.direction ===
      "SHORT" &&
    shortSupport === 0
  ) {
    shortSupport = 10;
  }

  /**
   * ----------------------------------------------------------
   * Confidence
   * ----------------------------------------------------------
   */

  const availableLeaders =
    Number(
      btcRelationship.available,
    ) +
    Number(
      ethRelationship.available,
    );

  const coverage =
    availableLeaders / 2;

  const leaderClarity =
    leadersAligned
      ? 1
      : leaderDivergence
        ? 0.55
        : 0.7;

  const confidence =
    Math.min(
      1,
      Math.max(
        0,

        coverage * 0.45 +
          leaderClarity * 0.25 +
          Math.min(
            1,
            Math.abs(
              candidateDirection.score,
            ) / 5,
          ) *
            0.30,
      ),
    );

  const quality =
    clamp(
      coverage * 60 +
        leaderClarity * 25 +
        Math.min(
          1,
          overallDependency / 70,
        ) *
          15,
    );

  const result =
    buildCryptoDirectionalResult({
      engine:
        "CRYPTO_TRADING_BTC_ETH_DEPENDENCY",

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
        candidate: {
          direction:
            candidateDirection.direction,

          weightedMove:
            round(
              candidateDirection.score,
              4,
            ),
        },

        btc: {
          direction:
            btcDirection.direction,

          weightedMove:
            round(
              btcDirection.score,
              4,
            ),

          dependency:
            round(
              btcRelationship.dependency,
            ),

          alignment:
            round(
              btcRelationship.alignment,
            ),

          opposition:
            round(
              btcRelationship.opposition,
            ),

          magnitudeSimilarity:
            round(
              btcRelationship.magnitudeSimilarity,
            ),

          confirms:
            btcConfirms,

          opposes:
            btcOpposes,
        },

        eth: {
          direction:
            ethDirection.direction,

          weightedMove:
            round(
              ethDirection.score,
              4,
            ),

          dependency:
            round(
              ethRelationship.dependency,
            ),

          alignment:
            round(
              ethRelationship.alignment,
            ),

          opposition:
            round(
              ethRelationship.opposition,
            ),

          magnitudeSimilarity:
            round(
              ethRelationship.magnitudeSimilarity,
            ),

          confirms:
            ethConfirms,

          opposes:
            ethOpposes,
        },

        overallDependency:
          round(
            overallDependency,
          ),

        dependencyClass,

        compatibility:
          round(
            compatibility,
            4,
          ),

        leadersAligned,

        leaderDivergence,

        systemicAlignment,

        systemicConflict,

        broadSystemicConflict,
      },
    });

  return {
    ...result,

    btcDependency:
      round(
        btcRelationship.dependency,
      ),

    ethDependency:
      round(
        ethRelationship.dependency,
      ),

    overallDependency:
      round(
        overallDependency,
      ),

    dependencyClass,

    compatibility:
      round(
        compatibility,
        4,
      ),

    systemicAlignment,

    systemicConflict,

    broadSystemicConflict,

    leaderDivergence,
  };
}