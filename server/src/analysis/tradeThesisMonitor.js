// server/src/analysis/tradeThesisMonitor.js

import {
  TRADE_SIDE,
} from "../config/riskConfig.js";

export const THESIS_STATUS =
  Object.freeze({
    HEALTHY: "HEALTHY",
    SOFT_WEAKENING: "SOFT_WEAKENING",
    MATERIAL_WEAKENING: "MATERIAL_WEAKENING",
    SEVERE_WEAKENING: "SEVERE_WEAKENING",
    INVALIDATED: "INVALIDATED",
    INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
    ERROR: "ERROR",
  });

export const EXPOSURE_ACTION =
  Object.freeze({
    HOLD: "HOLD",
    REDUCE_25: "REDUCE_25",
    REDUCE_50: "REDUCE_50",
    REDUCE_75: "REDUCE_75",
    EXIT: "EXIT",
  });

export const DEFAULT_TRADE_THESIS_CONFIG =
  Object.freeze({
    weights: {
      technical: 20,
      macro: 10,
      marketRegime: 15,
      events: 15,
      company: 10,
      country: 5,
      social: 5,
      historical: 5,
      liquidity: 5,
      consensus: 10,
    },

    alignedSupport: 0.58,

    oppositeWarning: 0.55,
    oppositeMaterial: 0.65,
    oppositeSevere: 0.75,
    oppositeExit: 0.82,

    healthyConviction: 0.66,
    softWeakeningConviction: 0.56,
    materialWeakeningConviction: 0.46,
    severeWeakeningConviction: 0.36,

    softDeterioration: 0.12,
    materialDeterioration: 0.22,
    severeDeterioration: 0.32,
    invalidationDeterioration: 0.45,

    criticalEngines: [
      "technical",
      "marketRegime",
      "events",
      "consensus",
    ],

    minimumCoverage: 0.55,

    exposureMultipliers: {
      HOLD: 1,
      REDUCE_25: 0.75,
      REDUCE_50: 0.50,
      REDUCE_75: 0.25,
      EXIT: 0,
    },
  });

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

function clamp(value, min, max) {
  return Math.min(
    Math.max(
      Number(value),
      min,
    ),
    max,
  );
}

function round(value, decimals = 4) {
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
    value === TRADE_SIDE.LONG ||
    value === TRADE_SIDE.SHORT
  ) {
    return value;
  }

  return null;
}

function oppositeSide(side) {
  return side === TRADE_SIDE.LONG
    ? TRADE_SIDE.SHORT
    : TRADE_SIDE.LONG;
}

function getDirectionalSupport({
  result,
  side,
}) {
  if (
    !result ||
    result.approved === false
  ) {
    return null;
  }

  const support =
    side === TRADE_SIDE.LONG
      ? result
          ?.directionalSupport
          ?.long
      : result
          ?.directionalSupport
          ?.short;

  if (isFiniteNumber(support)) {
    return clamp(
      support,
      0,
      1,
    );
  }

  if (
    isFiniteNumber(
      result?.qualityScore,
    )
  ) {
    return clamp(
      result.qualityScore,
      0,
      1,
    );
  }

  return null;
}

function buildComponentSnapshot({
  name,
  result,
  side,
  weight,
}) {
  const aligned =
    getDirectionalSupport({
      result,
      side,
    });

  const opposite =
    getDirectionalSupport({
      result,
      side:
        oppositeSide(side),
    });

  return {
    name,
    available:
      aligned !== null,
    weight:
      Number(weight),
    status:
      result?.status ??
      null,
    alignedSupport:
      aligned !== null
        ? round(
            aligned,
            4,
          )
        : null,
    oppositeSupport:
      opposite !== null
        ? round(
            opposite,
            4,
          )
        : null,
  };
}

function buildSnapshotComponents({
  side,
  technical,
  macro,
  marketRegime,
  events,
  company,
  country,
  social,
  historical,
  liquidity,
  consensus,
  config,
}) {
  const inputs = {
    technical,
    macro,
    marketRegime,
    events,
    company,
    country,
    social,
    historical,
    liquidity,
    consensus,
  };

  return Object.entries(
    config.weights,
  ).map(
    ([name, weight]) =>
      buildComponentSnapshot({
        name,
        result:
          inputs[name] ??
          null,
        side,
        weight,
      }),
  );
}

function calculateWeightedSupport(
  components,
  field,
) {
  let weighted = 0;
  let availableWeight = 0;

  for (
    const component
    of components
  ) {
    const value =
      component[field];

    if (
      !isFiniteNumber(
        value,
      )
    ) {
      continue;
    }

    weighted +=
      Number(value) *
      Number(
        component.weight,
      );

    availableWeight +=
      Number(
        component.weight,
      );
  }

  if (availableWeight <= 0) {
    return {
      value: null,
      availableWeight: 0,
      coverage: 0,
    };
  }

  return {
    value:
      clamp(
        weighted /
          availableWeight,
        0,
        1,
      ),
    availableWeight,
    coverage:
      clamp(
        availableWeight /
          100,
        0,
        1,
      ),
  };
}

export function createEntryThesisSnapshot({
  symbol = null,
  side,
  entryScore = null,
  originalShares = null,
  technical = null,
  macro = null,
  marketRegime = null,
  events = null,
  company = null,
  country = null,
  social = null,
  historical = null,
  liquidity = null,
  consensus = null,
  asOfTimestamp =
    new Date()
      .toISOString(),
  config =
    DEFAULT_TRADE_THESIS_CONFIG,
} = {}) {
  const normalizedSide =
    normalizeSide(side);

  if (!normalizedSide) {
    return {
      approved: false,
      engine:
        "TRADE_THESIS_MONITOR",
      status:
        THESIS_STATUS.ERROR,
      errors: [
        "Entry thesis requires LONG or SHORT side.",
      ],
    };
  }

  const components =
    buildSnapshotComponents({
      side:
        normalizedSide,
      technical,
      macro,
      marketRegime,
      events,
      company,
      country,
      social,
      historical,
      liquidity,
      consensus,
      config,
    });

  const aligned =
    calculateWeightedSupport(
      components,
      "alignedSupport",
    );

  const opposite =
    calculateWeightedSupport(
      components,
      "oppositeSupport",
    );

  return {
    approved: true,
    engine:
      "TRADE_THESIS_MONITOR",
    type:
      "ENTRY_THESIS_SNAPSHOT",
    symbol,
    side:
      normalizedSide,
    entryScore:
      isFiniteNumber(
        entryScore,
      )
        ? Number(
            entryScore,
          )
        : null,
    originalShares:
      isFiniteNumber(
        originalShares,
      )
        ? Math.max(
            0,
            Math.floor(
              Number(
                originalShares,
              ),
            ),
          )
        : null,
    entryConviction:
      aligned.value !== null
        ? round(
            aligned.value,
            4,
          )
        : null,
    entryOppositeStrength:
      opposite.value !== null
        ? round(
            opposite.value,
            4,
          )
        : null,
    coverage:
      round(
        aligned.coverage,
        4,
      ),
    components,
    createdAt:
      new Date(
        asOfTimestamp,
      ).toISOString(),
  };
}

function classifyThesis({
  currentConviction,
  deterioration,
  oppositeStrength,
  config,
}) {
  if (
    oppositeStrength >=
      config.oppositeExit ||
    deterioration >=
      config
        .invalidationDeterioration
  ) {
    return {
      thesisStatus:
        THESIS_STATUS.INVALIDATED,
      exposureAction:
        EXPOSURE_ACTION.EXIT,
    };
  }

  if (
    oppositeStrength >=
      config.oppositeSevere ||
    currentConviction <
      config
        .severeWeakeningConviction ||
    deterioration >=
      config.severeDeterioration
  ) {
    return {
      thesisStatus:
        THESIS_STATUS
          .SEVERE_WEAKENING,
      exposureAction:
        EXPOSURE_ACTION
          .REDUCE_75,
    };
  }

  if (
    oppositeStrength >=
      config.oppositeMaterial ||
    currentConviction <
      config
        .materialWeakeningConviction ||
    deterioration >=
      config.materialDeterioration
  ) {
    return {
      thesisStatus:
        THESIS_STATUS
          .MATERIAL_WEAKENING,
      exposureAction:
        EXPOSURE_ACTION
          .REDUCE_50,
    };
  }

  if (
    oppositeStrength >=
      config.oppositeWarning ||
    currentConviction <
      config
        .softWeakeningConviction ||
    deterioration >=
      config.softDeterioration
  ) {
    return {
      thesisStatus:
        THESIS_STATUS
          .SOFT_WEAKENING,
      exposureAction:
        EXPOSURE_ACTION
          .REDUCE_25,
    };
  }

  return {
    thesisStatus:
      THESIS_STATUS.HEALTHY,
    exposureAction:
      EXPOSURE_ACTION.HOLD,
  };
}

function resolveCurrentExposureMultiplier({
  currentExposureMultiplier,
  originalShares,
  remainingShares,
}) {
  if (
    isFiniteNumber(
      currentExposureMultiplier,
    )
  ) {
    return clamp(
      currentExposureMultiplier,
      0,
      1,
    );
  }

  if (
    isFiniteNumber(
      originalShares,
    ) &&
    Number(originalShares) > 0 &&
    isFiniteNumber(
      remainingShares,
    )
  ) {
    return clamp(
      Number(
        remainingShares,
      ) /
      Number(
        originalShares,
      ),
      0,
      1,
    );
  }

  return 1;
}

export function analyzeTradeThesis({
  symbol = null,
  side,
  entryThesis,
  currentExposureMultiplier = null,
  originalShares = null,
  remainingShares = null,
  technical = null,
  macro = null,
  marketRegime = null,
  events = null,
  company = null,
  country = null,
  social = null,
  historical = null,
  liquidity = null,
  consensus = null,
  asOfTimestamp =
    new Date()
      .toISOString(),
  config =
    DEFAULT_TRADE_THESIS_CONFIG,
} = {}) {
  try {
    const normalizedSide =
      normalizeSide(
        side ??
        entryThesis?.side,
      );

    if (!normalizedSide) {
      return {
        approved: false,
        engine:
          "TRADE_THESIS_MONITOR",
        status:
          THESIS_STATUS.ERROR,
        symbol,
        thesisStatus:
          THESIS_STATUS.ERROR,
        exposureAction:
          EXPOSURE_ACTION.HOLD,
        recommendedExposureMultiplier:
          null,
        errors: [
          "Open trade side must be LONG or SHORT.",
        ],
        warnings: [],
        timestamp:
          new Date()
            .toISOString(),
      };
    }

    if (
      !entryThesis ||
      entryThesis.approved !==
        true
    ) {
      return {
        approved: false,
        engine:
          "TRADE_THESIS_MONITOR",
        status:
          THESIS_STATUS
            .INSUFFICIENT_DATA,
        symbol,
        side:
          normalizedSide,
        thesisStatus:
          THESIS_STATUS
            .INSUFFICIENT_DATA,
        exposureAction:
          EXPOSURE_ACTION.HOLD,
        recommendedExposureMultiplier:
          null,
        errors: [
          "Valid entry thesis snapshot is required.",
        ],
        warnings: [
          "Exposure was not increased or directionally changed.",
        ],
        timestamp:
          new Date()
            .toISOString(),
      };
    }

    const components =
      buildSnapshotComponents({
        side:
          normalizedSide,
        technical,
        macro,
        marketRegime,
        events,
        company,
        country,
        social,
        historical,
        liquidity,
        consensus,
        config,
      });

    const aligned =
      calculateWeightedSupport(
        components,
        "alignedSupport",
      );

    const opposite =
      calculateWeightedSupport(
        components,
        "oppositeSupport",
      );

    const currentMultiplier =
      resolveCurrentExposureMultiplier({
        currentExposureMultiplier,
        originalShares:
          originalShares ??
          entryThesis
            ?.originalShares,
        remainingShares,
      });

    const entryConviction =
      isFiniteNumber(
        entryThesis
          ?.entryConviction,
      )
        ? clamp(
            entryThesis
              .entryConviction,
            0,
            1,
          )
        : null;

    const currentConviction =
      aligned.value;

    const oppositeStrength =
      opposite.value ?? 0;

    const deterioration =
      (
        entryConviction !== null &&
        currentConviction !== null
      )
        ? Math.max(
            0,
            entryConviction -
              currentConviction,
          )
        : 0;

    const missingCritical =
      config
        .criticalEngines
        .filter(
          (name) => {
            const component =
              components.find(
                (item) =>
                  item.name ===
                  name,
              );

            return (
              !component ||
              component.available !==
                true
            );
          },
        );

    const warnings = [];

    if (
      aligned.coverage <
      config.minimumCoverage
    ) {
      warnings.push(
        `Trade thesis coverage is low (${round(
          aligned.coverage *
            100,
          2,
        )}%).`,
      );
    }

    if (
      missingCritical.length > 0
    ) {
      warnings.push(
        `Critical thesis inputs unavailable: ${missingCritical.join(
          ", ",
        )}.`,
      );
    }

    if (
      currentConviction === null ||
      aligned.coverage <
        config.minimumCoverage
    ) {
      const defensiveTarget =
        Math.min(
          currentMultiplier,
          0.75,
        );

      return {
        approved: true,
        engine:
          "TRADE_THESIS_MONITOR",
        status:
          THESIS_STATUS
            .INSUFFICIENT_DATA,
        symbol,
        side:
          normalizedSide,
        thesisStatus:
          THESIS_STATUS
            .INSUFFICIENT_DATA,
        convictionScore:
          currentConviction !== null
            ? round(
                currentConviction,
                4,
              )
            : null,
        deteriorationScore:
          round(
            deterioration,
            4,
          ),
        oppositeDirectionStrength:
          round(
            oppositeStrength,
            4,
          ),
        coverage:
          round(
            aligned.coverage,
            4,
          ),
        exposureAction:
          defensiveTarget <
          currentMultiplier
            ? EXPOSURE_ACTION
                .REDUCE_25
            : EXPOSURE_ACTION.HOLD,
        currentExposureMultiplier:
          round(
            currentMultiplier,
            4,
          ),
        recommendedExposureMultiplier:
          round(
            defensiveTarget,
            4,
          ),
        missingCritical,
        components,
        reasons: [
          "Ongoing trade thesis cannot be fully verified from current data.",
        ],
        warnings,
        errors: [],
        timestamp:
          new Date(
            asOfTimestamp,
          ).toISOString(),
      };
    }

    const classification =
      classifyThesis({
        currentConviction,
        deterioration,
        oppositeStrength,
        config,
      });

    const desiredMultiplier =
      config
        .exposureMultipliers[
          classification
            .exposureAction
        ] ?? 1;

    const recommendedMultiplier =
      Math.min(
        currentMultiplier,
        desiredMultiplier,
      );

    let exposureAction =
      classification
        .exposureAction;

    if (
      recommendedMultiplier ===
        currentMultiplier &&
      desiredMultiplier >
        currentMultiplier
    ) {
      exposureAction =
        EXPOSURE_ACTION.HOLD;
    }

    const reasons = [];

    if (
      deterioration >=
      config.softDeterioration
    ) {
      reasons.push(
        `Trade conviction deteriorated by ${round(
          deterioration *
            100,
          2,
        )} percentage points from entry.`,
      );
    }

    if (
      oppositeStrength >=
      config.oppositeWarning
    ) {
      reasons.push(
        `Opposite-direction evidence reached ${round(
          oppositeStrength *
            100,
          2,
        )}%.`,
      );
    }

    const weakenedEngines =
      components
        .filter(
          (component) =>
            component.available &&
            isFiniteNumber(
              component
                .alignedSupport,
            ) &&
            Number(
              component
                .alignedSupport,
            ) <
              config
                .alignedSupport,
        )
        .map(
          (component) =>
            component.name,
        );

    if (
      weakenedEngines.length > 0
    ) {
      reasons.push(
        `Weak aligned support from: ${weakenedEngines.join(
          ", ",
        )}.`,
      );
    }

    if (reasons.length === 0) {
      reasons.push(
        "Entry thesis remains broadly aligned with the open trade.",
      );
    }

    return {
      approved: true,
      engine:
        "TRADE_THESIS_MONITOR",
      status:
        "COMPLETE",
      symbol,
      side:
        normalizedSide,
      thesisStatus:
        classification
          .thesisStatus,
      convictionScore:
        round(
          currentConviction,
          4,
        ),
      entryConviction:
        entryConviction !==
        null
          ? round(
              entryConviction,
              4,
            )
          : null,
      deteriorationScore:
        round(
          deterioration,
          4,
        ),
      oppositeDirectionStrength:
        round(
          oppositeStrength,
          4,
        ),
      coverage:
        round(
          aligned.coverage,
          4,
        ),
      exposureAction,
      currentExposureMultiplier:
        round(
          currentMultiplier,
          4,
        ),
      recommendedExposureMultiplier:
        round(
          recommendedMultiplier,
          4,
        ),
      missingCritical,
      weakenedEngines,
      components,
      reasons,
      warnings,
      errors: [],
      timestamp:
        new Date(
          asOfTimestamp,
        ).toISOString(),
    };
  } catch (error) {
    return {
      approved: false,
      engine:
        "TRADE_THESIS_MONITOR",
      status:
        THESIS_STATUS.ERROR,
      symbol,
      thesisStatus:
        THESIS_STATUS.ERROR,
      exposureAction:
        EXPOSURE_ACTION.HOLD,
      recommendedExposureMultiplier:
        null,
      reasons: [],
      warnings: [
        "Trade thesis monitoring failed safely. Exposure was not increased.",
      ],
      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],
      timestamp:
        new Date()
          .toISOString(),
    };
  }
}

export default analyzeTradeThesis;
