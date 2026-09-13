export function resolveDirectionalContribution({
  engineDirection,
  selectedDirection,
  maximumPoints,
  availability = "AVAILABLE",
} = {}) {
  const max =
    Number(maximumPoints);

  if (
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return {
      supportPercent: 0,
      contribution: 0,
      reason: "INVALID_MAXIMUM",
    };
  }

  const selected =
    String(
      selectedDirection ?? "",
    )
      .trim()
      .toUpperCase();

  const engine =
    String(
      engineDirection ?? "",
    )
      .trim()
      .toUpperCase();

  const state =
    String(
      availability ?? "",
    )
      .trim()
      .toUpperCase();

  const unavailableStates = new Set([
    "INSUFFICIENT_DATA",
    "INSUFFICIENT",
    "UNAVAILABLE",
    "NOT_CONFIGURED",
    "ERROR",
    "STALE_DATA",
    "STALE",
    "UNKNOWN",
  ]);

  if (
    unavailableStates.has(state)
  ) {
    return {
      supportPercent: 50,
      contribution:
        max * 0.5,
      reason:
        "UNAVAILABLE_MIDPOINT",
    };
  }

  if (
    engine === "NEUTRAL" ||
    engine === "MIXED"
  ) {
    return {
      supportPercent: 50,
      contribution:
        max * 0.5,
      reason:
        "NEUTRAL_MIDPOINT",
    };
  }

  if (
    !["LONG", "SHORT"].includes(
      selected,
    )
  ) {
    return {
      supportPercent: 50,
      contribution:
        max * 0.5,
      reason:
        "DIRECTION_UNRESOLVED",
    };
  }

  if (
    engine === selected
  ) {
    return {
      supportPercent: 100,
      contribution: max,
      reason:
        "SUPPORTS_DIRECTION",
    };
  }

  if (
    (
      engine === "LONG" &&
      selected === "SHORT"
    ) ||
    (
      engine === "SHORT" &&
      selected === "LONG"
    )
  ) {
    return {
      supportPercent: 0,
      contribution: 0,
      reason:
        "OPPOSES_DIRECTION",
    };
  }

  return {
    supportPercent: 50,
    contribution:
      max * 0.5,
    reason:
      "UNKNOWN_DIRECTION_MIDPOINT",
  };
}

export default resolveDirectionalContribution;