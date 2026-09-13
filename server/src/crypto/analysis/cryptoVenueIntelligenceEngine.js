/**
 * ============================================================
 * CRYPTO VENUE INTELLIGENCE ENGINE
 * ============================================================
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

export function analyzeCryptoVenues(
  measurement,
) {
  const venueCount =
    finite(
      measurement
        ?.venueCount,
    );

  const cexCount =
    finite(
      measurement
        ?.cexCount,
    );

  const dexCount =
    finite(
      measurement
        ?.dexCount,
    );

  const exchanges =
    Array.isArray(
      measurement
        ?.exchanges,
    )
      ? measurement.exchanges
      : [];

  let score = 0;

  const positives = [];
  const risks = [];

  score +=
    Math.min(
      35,
      venueCount * 10,
    );

  score +=
    Math.min(
      25,
      cexCount * 8,
    );

  score +=
    Math.min(
      25,
      dexCount * 10,
    );

  if (
    cexCount >
      0 &&
    dexCount >
      0
  ) {
    score += 15;

    positives.push(
      "Asset trades across both centralized and decentralized venues.",
    );
  }

  if (
    venueCount ===
    1
  ) {
    risks.push(
      "Trading activity is concentrated on a single venue.",
    );
  }

  if (
    venueCount >=
    3
  ) {
    positives.push(
      "Multi-venue market access improves price confirmation.",
    );
  }

  return {
    status:
      "COMPLETE",

    score:
      Math.round(
        clamp(score) *
        100,
      ) / 100,

    venueCount,
    cexCount,
    dexCount,

    primaryVenue:
      measurement
        ?.primaryVenue ??
      null,

    exchanges,

    accessibility:
      venueCount >=
      3
        ? "HIGH"
        : venueCount >=
          1
          ? "LIMITED"
          : "NONE",

    marketStructure:
      cexCount >
        0 &&
      dexCount >
        0
        ? "CEX_AND_DEX"
        : dexCount >
          0
          ? "DEX_LED"
          : cexCount >
            0
            ? "CEX_LED"
            : "UNKNOWN",

    positives,
    risks,
  };
}

export default
  analyzeCryptoVenues;
