/**
 * AEMA Private Futures Bot
 * Direction Engine + Direction Qualification Gate
 *
 * Internal semantics:
 * LONG  = bullish futures setup
 * SHORT = bearish futures setup
 *
 * Portal semantics:
 * LONG  -> BUY SETUP
 * SHORT -> SELL SETUP
 *
 * This engine does NOT execute trades.
 */

import BOT_CONFIG from "../config/botConfig.js";

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value) {
  return Number(value.toFixed(4));
}

export function determineBotDirection(candidate, options = {}) {
  const weights = {
    ...BOT_CONFIG.research.weights,
    ...(options.weights || {}),
  };

  const gate = {
    ...BOT_CONFIG.directionGate,
    ...(options.gate || options),
  };

  const engines = candidate?.engines || {};

  let longWeighted = 0;
  let shortWeighted = 0;
  let confidenceWeighted = 0;
  let weightUsed = 0;

  const contributions = {};

  /*
   * ---------------------------------------------------------
   * 1. COLLECT AVAILABLE ENGINE EVIDENCE
   * ---------------------------------------------------------
   *
   * Missing engines are excluded from the calculation.
   * Missing evidence is never converted to a fake neutral/zero.
   */
  for (const [key, weight] of Object.entries(weights)) {
    if (!finite(weight) || weight < 0) {
      throw new Error(
        `INVALID_DIRECTION_WEIGHT:${key}`
      );
    }

    const engine = engines[key];

    if (
      !engine?.available ||
      !finite(engine.long) ||
      !finite(engine.short)
    ) {
      contributions[key] = {
        available: false,
        weight,
      };

      continue;
    }

    longWeighted += engine.long * weight;
    shortWeighted += engine.short * weight;

    if (finite(engine.confidence)) {
      confidenceWeighted +=
        engine.confidence * weight;
    }

    weightUsed += weight;

    contributions[key] = {
      available: true,
      weight,
      long: engine.long,
      short: engine.short,
      confidence:
        finite(engine.confidence)
          ? engine.confidence
          : null,
    };
  }

  /*
   * ---------------------------------------------------------
   * 2. NO DIRECTIONAL EVIDENCE
   * ---------------------------------------------------------
   */

  if (weightUsed <= 0) {
    return {
      ...candidate,

      directionDecision: {
        direction: null,
        rawDirection: null,

        setupSignal: "NO_SETUP",
        qualified: false,

        longScore: null,
        shortScore: null,
        selectedScore: null,

        separation: null,
        confidence: 0,
        availableWeight: 0,

        reason: "NO_DIRECTIONAL_EVIDENCE",

        blockers: [
          "NO_DIRECTIONAL_EVIDENCE",
        ],

        contributions,

        diagnostics: {
          technical: null,
          marketStructure: null,

          independentAgreement: false,

          unavailable:
            Object.keys(contributions),
        },

        executionAuthority: false,
        liveExecution: false,
      },
    };
  }

  /*
   * ---------------------------------------------------------
   * 3. CALCULATE DIRECTION
   * ---------------------------------------------------------
   */

  const longScore =
    longWeighted / weightUsed;

  const shortScore =
    shortWeighted / weightUsed;

  const rawDirection =
    longScore >= shortScore
      ? "LONG"
      : "SHORT";

  const selectedScore =
    Math.max(
      longScore,
      shortScore
    );

  const separation =
    Math.abs(
      longScore - shortScore
    );

  const confidence =
    confidenceWeighted / weightUsed;

  /*
   * ---------------------------------------------------------
   * 4. CHECK INDIVIDUAL ENGINE SUPPORT
   * ---------------------------------------------------------
   */

  const supports = (key) => {
    const evidence =
      contributions[key];

    if (!evidence?.available) {
      return null;
    }

    const selected =
      rawDirection === "LONG"
        ? evidence.long
        : evidence.short;

    const opposite =
      rawDirection === "LONG"
        ? evidence.short
        : evidence.long;

    const engineSeparation =
      selected - opposite;

    return {
      selected:
        round(selected),

      opposite:
        round(opposite),

      agrees:
        selected > opposite,

      separation:
        round(engineSeparation),
    };
  };

  const technical =
    supports("technical");

  const marketStructure =
    supports("marketStructure");

  /*
   * Require meaningful independent confirmation.
   *
   * A 50.1 / 49.9 engine result should not count
   * as strong confirmation merely because it technically
   * points in the same direction.
   */
  const minimumIndependentSeparation =
    Number.isFinite(
      Number(
        gate.minimumIndependentSeparation
      )
    )
      ? Number(
          gate.minimumIndependentSeparation
        )
      : 5;

  const technicalStrongAgreement =
    technical?.agrees === true &&
    technical.separation >=
      minimumIndependentSeparation;

  const structureStrongAgreement =
    marketStructure?.agrees === true &&
    marketStructure.separation >=
      minimumIndependentSeparation;

  const independentAgreement =
    technicalStrongAgreement &&
    structureStrongAgreement;

  /*
   * ---------------------------------------------------------
   * 5. DIRECTION QUALIFICATION
   * ---------------------------------------------------------
   */

  const blockers = [];

  if (
    selectedScore <
    gate.minimumDirectionalScore
  ) {
    blockers.push(
      "DIRECTION_SCORE_TOO_LOW"
    );
  }

  if (
    separation <
    gate.minimumSeparation
  ) {
    blockers.push(
      "DIRECTION_SEPARATION_TOO_LOW"
    );
  }

  if (
    confidence <
    gate.minimumConfidence
  ) {
    blockers.push(
      "DIRECTION_CONFIDENCE_TOO_LOW"
    );
  }

  if (
    weightUsed <
    gate.minimumAvailableWeight
  ) {
    blockers.push(
      "DIRECTION_COVERAGE_TOO_LOW"
    );
  }

  /*
   * Technical evidence must exist.
   */
  if (
    gate.requireTechnical &&
    !technical
  ) {
    blockers.push(
      "TECHNICAL_EVIDENCE_UNAVAILABLE"
    );
  }

  /*
   * Market structure evidence must exist.
   */
  if (
    gate.requireMarketStructure &&
    !marketStructure
  ) {
    blockers.push(
      "MARKET_STRUCTURE_EVIDENCE_UNAVAILABLE"
    );
  }

  /*
   * Technical exists but is pointing
   * against the aggregate direction.
   */
  if (
    gate.requireIndependentAgreement &&
    technical &&
    !technical.agrees
  ) {
    blockers.push(
      "TECHNICAL_DIRECTION_DISAGREEMENT"
    );
  }

  /*
   * Structure exists but is pointing
   * against the aggregate direction.
   */
  if (
    gate.requireIndependentAgreement &&
    marketStructure &&
    !marketStructure.agrees
  ) {
    blockers.push(
      "MARKET_STRUCTURE_DIRECTION_DISAGREEMENT"
    );
  }

  /*
   * Technical direction is technically correct,
   * but the evidence is too weak.
   */
  if (
    gate.requireIndependentAgreement &&
    technical?.agrees &&
    !technicalStrongAgreement
  ) {
    blockers.push(
      "TECHNICAL_CONFIRMATION_TOO_WEAK"
    );
  }

  /*
   * Market structure direction is technically correct,
   * but the evidence is too weak.
   */
  if (
    gate.requireIndependentAgreement &&
    marketStructure?.agrees &&
    !structureStrongAgreement
  ) {
    blockers.push(
      "MARKET_STRUCTURE_CONFIRMATION_TOO_WEAK"
    );
  }

  const qualified =
    blockers.length === 0;

  /*
   * ---------------------------------------------------------
   * 6. FINAL DIRECTION RESULT
   * ---------------------------------------------------------
   */

  return {
    ...candidate,

    directionDecision: {
      /*
       * Only expose an actionable internal direction
       * after qualification.
       */
      direction:
        qualified
          ? rawDirection
          : null,

      /*
       * Preserve raw research direction for diagnostics.
       */
      rawDirection,

      setupSignal:
        qualified
          ? rawDirection === "LONG"
            ? "BUY_SETUP"
            : "SELL_SETUP"
          : "NO_SETUP",

      qualified,

      longScore:
        round(longScore),

      shortScore:
        round(shortScore),

      selectedScore:
        round(selectedScore),

      separation:
        round(separation),

      confidence:
        round(confidence),

      availableWeight:
        round(weightUsed),

      reason:
        qualified
          ? "DIRECTION_QUALIFIED"
          : "DIRECTION_NOT_STRONG_ENOUGH",

      blockers,

      contributions,

      diagnostics: {
        technical,
        marketStructure,

        technicalStrongAgreement,
        structureStrongAgreement,

        minimumIndependentSeparation,

        independentAgreement,

        unavailable:
          Object.keys(
            contributions
          ).filter(
            (key) =>
              !contributions[key]
                .available
          ),
      },

      executionAuthority: false,
      liveExecution: false,
    },
  };
}

export default determineBotDirection;