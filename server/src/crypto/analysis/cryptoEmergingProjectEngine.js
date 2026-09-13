/**
 * ============================================================
 * CRYPTO EMERGING PROJECT ENGINE
 * ============================================================
 *
 * Market age is context, never a hard rejection criterion.
 */

function finite(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function hoursSince(
  timestamp,
) {
  const value =
    Number(timestamp);

  if (
    !Number.isFinite(value) ||
    value <=
    0
  ) {
    return null;
  }

  return Math.max(
    0,
    (
      Date.now() -
      value
    ) /
      3_600_000,
  );
}

function clamp(
  value,
) {
  return Math.max(
    0,
    Math.min(
      100,
      value,
    ),
  );
}

export function analyzeEmergingProject(
  measurement,
) {
  const volume =
    finite(
      measurement
        ?.volume24hUsd,
    );

  const liquidity =
    finite(
      measurement
        ?.liquidityUsd,
    );

  const change1h =
    finite(
      measurement
        ?.change1hPercent,
    );

  const change24h =
    finite(
      measurement
        ?.change24hPercent,
    );

  const venueCount =
    finite(
      measurement
        ?.venueCount,
    );

  const pairAgeHours =
    hoursSince(
      measurement
        ?.pairCreatedAt,
    );

  let score = 0;

  const signals = [];
  const risks = [];

  if (
    volume >=
    1_000_000
  ) {
    score += 25;
    signals.push(
      "Strong early dollar-volume activity.",
    );
  } else if (
    volume >=
    250_000
  ) {
    score += 18;
  } else if (
    volume >=
    50_000
  ) {
    score += 10;
  }

  if (
    liquidity >
    0
  ) {
    const velocity =
      volume /
      liquidity;

    if (
      velocity >=
      3
    ) {
      score += 25;

      signals.push(
        "High volume velocity relative to available liquidity.",
      );
    } else if (
      velocity >=
      1
    ) {
      score += 17;
    }
  }

  if (
    change1h >=
    3
  ) {
    score += 15;

    signals.push(
      "Strong short-term price acceleration.",
    );
  }

  if (
    change24h >=
    12
  ) {
    score += 15;
  }

  if (
    venueCount >=
    3
  ) {
    score += 12;

    signals.push(
      "Project is expanding across multiple trading venues.",
    );
  } else if (
    venueCount >=
    1
  ) {
    score += 5;
  }

  if (
    pairAgeHours !==
      null &&
    pairAgeHours <=
      72
  ) {
    score += 8;

    signals.push(
      "Newly-created trading market with measurable activity.",
    );
  }

  if (
    pairAgeHours !==
      null &&
    pairAgeHours <=
      24 &&
    liquidity <
      50_000
  ) {
    risks.push(
      "Very new market with limited liquidity.",
    );
  }

  const finalScore =
    Math.round(
      clamp(score) *
      100,
    ) / 100;

  return {
    status:
      "COMPLETE",

    score:
      finalScore,

    pairAgeHours,

    classification:
      finalScore >=
      80
        ? "RAPID_EXPANSION"
        : finalScore >=
          65
          ? "EMERGING"
          : finalScore >=
            45
            ? "EARLY_ACTIVITY"
            : "ESTABLISHED_OR_LOW_SIGNAL",

    signals,
    risks,
  };
}

export default
  analyzeEmergingProject;
