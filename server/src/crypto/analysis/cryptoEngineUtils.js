export const finite = (v, f = 0) =>
  Number.isFinite(Number(v)) ? Number(v) : f;

export const clamp = (v, a = 0, b = 100) =>
  Math.min(b, Math.max(a, finite(v)));

export const round = (v, d = 2) => {
  const p = 10 ** d;
  return Math.round(finite(v) * p) / p;
};

function normalizeConfidence(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    !Number.isFinite(Number(value))
  ) {
    return round(clamp(fallback), 4);
  }

  const n = Number(value);

  // Engine contract stores confidence in normalized 0..1 form.
  if (n >= 0 && n <= 1) {
    return round(n, 4);
  }

  return round(clamp(n) / 100, 4);
}

/**
 * COMPLETE analysis result.
 *
 * score      = directional / quality signal (0..100)
 * confidence = certainty in the evidence supporting that signal (0..1)
 *
 * Confidence is deliberately independent from score.
 */
export function complete(
  engine,
  score,
  direction = "LONG",
  evidence = {},
  confidence = null,
) {
  const s = round(clamp(score));
  const x = String(direction ?? "NEUTRAL").toUpperCase();

  const c = normalizeConfidence(
    confidence,
    0,
  );

  return {
    approved: true,
    engine,
    status: "COMPLETE",
    score: s,
    confidence: c,
    direction: x,

    directionalSupport:
      x === "SHORT"
        ? {
            long: round((1 - s / 100) * 0.35, 4),
            short: round(s / 100, 4),
          }
        : {
            long: round(s / 100, 4),
            short: round((1 - s / 100) * 0.35, 4),
          },

    evidence,
    warnings: [],
    errors: [],
  };
}

export const insufficient = (
  engine,
  evidence = {},
  warning = "REAL_PROVIDER_DATA_REQUIRED",
) => ({
  approved: false,
  engine,
  status: "INSUFFICIENT_DATA",
  score: null,
  confidence: 0,
  direction: "NEUTRAL",
  directionalSupport: {
    long: 0,
    short: 0,
  },
  evidence,
  warnings: [warning],
  errors: [],
});
