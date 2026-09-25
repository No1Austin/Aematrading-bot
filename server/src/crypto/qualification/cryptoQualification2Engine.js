/**
 * AEMA Crypto — Qualification 2
 * Phase 6.25
 *
 * Deep-research directional decision gate.
 *
 * Technical and Fundamental are mandatory independent pillars.
 * LONG and SHORT are evaluated independently from Deep Research.
 * Discovery ranking may prioritize research, but cannot dictate Q2 direction.
 * Supporting evidence is contextual and cannot rescue a mandatory pillar.
 *
 * This module NEVER grants execution authority.
 */

const DEFAULTS = Object.freeze({
  minTechnicalCoverage: 0.50,
  minFundamentalCoverage: 0.50,
  minTechnicalConfidence: 45,
  minFundamentalConfidence: 45,
  minSupportingCoverage: 0.25,
  minDirectionalEdge: 8,
  minDirectionalSupport: 52,

  /*
   * If both LONG and SHORT independently pass, require enough separation
   * between the two mandatory-pillar cases to select one. Otherwise NO_TRADE.
   */
  minSideSeparation: 4,
});

function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pct01(v) {
  const n = num(v);
  if (n === null) return null;
  return n > 1
    ? Math.max(0, Math.min(1, n / 100))
    : Math.max(0, Math.min(1, n));
}

function confidence(v) {
  const n = num(v);
  return n === null
    ? null
    : Math.max(0, Math.min(100, n));
}

function normalizeDirection(v) {
  const x = String(v || "").toUpperCase();
  return x === "LONG" || x === "SHORT" ? x : "NEUTRAL";
}

function engineReady(engine) {
  if (!engine || engine.available === false) return false;
  if (
    engine.availability &&
    engine.availability.available === false
  ) {
    return false;
  }

  if (
    engine.status &&
    !["READY", "COMPLETE"].includes(
      String(engine.status).toUpperCase(),
    )
  ) {
    return false;
  }

  return num(engine.score) !== null;
}

function engineCoverage(engine) {
  return pct01(
    engine?.coverage ??
    engine?.evidenceCoverage ??
    engine?.availability?.coverage ??
    engine?.evidence?.coverage,
  );
}

function engineConfidence(engine) {
  return confidence(
    engine?.confidence ??
    engine?.evidenceConfidence ??
    engine?.availability?.confidence,
  );
}

/**
 * Direction is never inferred from quality score.
 *
 * Explicit bullish/bearish strengths are preferred.
 * Legacy direction + directionStrength remains supported.
 */
function directionStrength(engine, side) {
  if (!engine) return null;

  const explicit =
    side === "LONG"
      ? num(
          engine.bullishStrength ??
          engine.longStrength,
        )
      : num(
          engine.bearishStrength ??
          engine.shortStrength,
        );

  if (explicit !== null) {
    return Math.max(0, Math.min(100, explicit));
  }

  const d = normalizeDirection(engine.direction);
  const s = num(engine.directionStrength);

  if (s !== null && d !== "NEUTRAL") {
    return d === side
      ? Math.max(0, Math.min(100, s))
      : Math.max(0, Math.min(100, 100 - s));
  }

  return null;
}

function supportingDirection(supporting, side) {
  if (!supporting) return null;

  const direct =
    side === "LONG"
      ? num(
          supporting.bullishStrength ??
          supporting.longStrength,
        )
      : num(
          supporting.bearishStrength ??
          supporting.shortStrength,
        );

  if (direct !== null) {
    return Math.max(0, Math.min(100, direct));
  }

  const d = normalizeDirection(supporting.direction);
  const s = num(supporting.directionStrength);

  if (s !== null && d !== "NEUTRAL") {
    return d === side
      ? Math.max(0, Math.min(100, s))
      : Math.max(0, Math.min(100, 100 - s));
  }

  return null;
}

function failure(code, detail) {
  return { code, detail };
}

function evaluateSide({
  side,
  technical,
  fundamental,
  supporting,
  cfg,
}) {
  const tSide = directionStrength(technical, side);
  const fSide = directionStrength(fundamental, side);
  const sSide = supportingDirection(supporting, side);

  const failures = [];
  const warnings = [];

  if (
    tSide === null ||
    tSide < cfg.minDirectionalSupport
  ) {
    failures.push(
      failure(
        "TECHNICAL_DIRECTION_NOT_CONFIRMED",
        {
          direction: side,
          strength: tSide,
          required: cfg.minDirectionalSupport,
        },
      ),
    );
  }

  if (
    fSide === null ||
    fSide < cfg.minDirectionalSupport
  ) {
    failures.push(
      failure(
        "FUNDAMENTAL_DIRECTION_NOT_CONFIRMED",
        {
          direction: side,
          strength: fSide,
          required: cfg.minDirectionalSupport,
        },
      ),
    );
  }

  if (sSide !== null && sSide < 40) {
    warnings.push(
      failure(
        "SUPPORTING_EVIDENCE_OPPOSES_CASE",
        {
          direction: side,
          strength: sSide,
        },
      ),
    );
  }

  const mandatoryDirectional =
    tSide !== null && fSide !== null
      ? (tSide + fSide) / 2
      : null;

  const directionalEdge =
    mandatoryDirectional === null
      ? null
      : Math.abs(
          mandatoryDirectional - 50,
        ) * 2;

  if (
    directionalEdge !== null &&
    directionalEdge < cfg.minDirectionalEdge
  ) {
    failures.push(
      failure(
        "DIRECTIONAL_EDGE_INSUFFICIENT",
        {
          direction: side,
          actual:
            Number(
              directionalEdge.toFixed(2),
            ),
          required:
            cfg.minDirectionalEdge,
        },
      ),
    );
  }

  return {
    side,
    qualified:
      failures.length === 0,

    technicalSupport:
      tSide,

    fundamentalSupport:
      fSide,

    supportingSupport:
      sSide,

    mandatoryDirectional:
      mandatoryDirectional === null
        ? null
        : Number(
            mandatoryDirectional.toFixed(2),
          ),

    directionalEdge:
      directionalEdge === null
        ? null
        : Number(
            directionalEdge.toFixed(2),
          ),

    failures,
    warnings,
  };
}

function chooseDirectionalCase(
  longCase,
  shortCase,
  cfg,
) {
  if (
    longCase.qualified &&
    !shortCase.qualified
  ) {
    return {
      direction: "LONG",
      selectedCase: longCase,
      reason: "LONG_ONLY_QUALIFIED",
      ambiguous: false,
    };
  }

  if (
    shortCase.qualified &&
    !longCase.qualified
  ) {
    return {
      direction: "SHORT",
      selectedCase: shortCase,
      reason: "SHORT_ONLY_QUALIFIED",
      ambiguous: false,
    };
  }

  if (
    !longCase.qualified &&
    !shortCase.qualified
  ) {
    return {
      direction: "NEUTRAL",
      selectedCase: null,
      reason: "NO_DIRECTIONAL_CASE_QUALIFIED",
      ambiguous: false,
    };
  }

  /*
   * Both passed independently. Select only if the mandatory evidence
   * itself clearly separates the cases. Discovery ranking is not used.
   */
  const longStrength =
    num(longCase.mandatoryDirectional);

  const shortStrength =
    num(shortCase.mandatoryDirectional);

  if (
    longStrength === null ||
    shortStrength === null
  ) {
    return {
      direction: "NEUTRAL",
      selectedCase: null,
      reason: "DIRECTIONAL_CASE_AMBIGUOUS",
      ambiguous: true,
    };
  }

  const separation =
    Math.abs(
      longStrength - shortStrength,
    );

  if (separation < cfg.minSideSeparation) {
    return {
      direction: "NEUTRAL",
      selectedCase: null,
      reason: "DIRECTIONAL_CASE_AMBIGUOUS",
      ambiguous: true,
      separation:
        Number(separation.toFixed(2)),
    };
  }

  return longStrength > shortStrength
    ? {
        direction: "LONG",
        selectedCase: longCase,
        reason: "LONG_STRONGER_AFTER_INDEPENDENT_EVALUATION",
        ambiguous: false,
        separation:
          Number(separation.toFixed(2)),
      }
    : {
        direction: "SHORT",
        selectedCase: shortCase,
        reason: "SHORT_STRONGER_AFTER_INDEPENDENT_EVALUATION",
        ambiguous: false,
        separation:
          Number(separation.toFixed(2)),
      };
}

export function evaluateCryptoQualification2(
  candidate = {},
  deepResearch = {},
  options = {},
) {
  const cfg = {
    ...DEFAULTS,
    ...options,
  };

  const technical =
    deepResearch?.technical ??
    deepResearch?.pillars?.technical ??
    candidate?.pillars?.technical ??
    null;

  const fundamental =
    deepResearch?.fundamental ??
    deepResearch?.pillars?.fundamental ??
    candidate?.pillars?.fundamental ??
    null;

  const supporting =
    deepResearch?.supporting ??
    deepResearch?.pillars?.supporting ??
    candidate?.pillars?.supporting ??
    candidate?.supporting ??
    null;

  const failures = [];
  const warnings = [];

  const technicalReady =
    engineReady(technical);

  const fundamentalReady =
    engineReady(fundamental);

  if (!technicalReady) {
    failures.push(
      failure(
        "TECHNICAL_REQUIRED",
        "Technical pillar is unavailable or not ready.",
      ),
    );
  }

  if (!fundamentalReady) {
    failures.push(
      failure(
        "FUNDAMENTAL_REQUIRED",
        "Fundamental pillar is unavailable or not ready.",
      ),
    );
  }

  const tCoverage =
    engineCoverage(technical);

  const fCoverage =
    engineCoverage(fundamental);

  const sCoverage =
    engineCoverage(supporting);

  const tConfidence =
    engineConfidence(technical);

  const fConfidence =
    engineConfidence(fundamental);

  const sConfidence =
    engineConfidence(supporting);

  if (
    technicalReady &&
    (
      tCoverage === null ||
      tCoverage < cfg.minTechnicalCoverage
    )
  ) {
    failures.push(
      failure(
        "TECHNICAL_COVERAGE_INSUFFICIENT",
        {
          actual: tCoverage,
          required: cfg.minTechnicalCoverage,
        },
      ),
    );
  }

  if (
    fundamentalReady &&
    (
      fCoverage === null ||
      fCoverage < cfg.minFundamentalCoverage
    )
  ) {
    failures.push(
      failure(
        "FUNDAMENTAL_COVERAGE_INSUFFICIENT",
        {
          actual: fCoverage,
          required: cfg.minFundamentalCoverage,
        },
      ),
    );
  }

  if (
    technicalReady &&
    (
      tConfidence === null ||
      tConfidence < cfg.minTechnicalConfidence
    )
  ) {
    failures.push(
      failure(
        "TECHNICAL_CONFIDENCE_INSUFFICIENT",
        {
          actual: tConfidence,
          required: cfg.minTechnicalConfidence,
        },
      ),
    );
  }

  if (
    fundamentalReady &&
    (
      fConfidence === null ||
      fConfidence < cfg.minFundamentalConfidence
    )
  ) {
    failures.push(
      failure(
        "FUNDAMENTAL_CONFIDENCE_INSUFFICIENT",
        {
          actual: fConfidence,
          required: cfg.minFundamentalConfidence,
        },
      ),
    );
  }

  if (
    sCoverage === null ||
    sCoverage < cfg.minSupportingCoverage
  ) {
    warnings.push(
      failure(
        "SUPPORTING_COVERAGE_LOW",
        {
          actual: sCoverage,
          required: cfg.minSupportingCoverage,
        },
      ),
    );
  }

  /*
   * Both cases are always evaluated from Deep Research.
   * candidate.preferredDirection is intentionally NOT used here.
   */
  const longCase =
    evaluateSide({
      side: "LONG",
      technical,
      fundamental,
      supporting,
      cfg,
    });

  const shortCase =
    evaluateSide({
      side: "SHORT",
      technical,
      fundamental,
      supporting,
      cfg,
    });

  const selection =
    chooseDirectionalCase(
      longCase,
      shortCase,
      cfg,
    );

  /*
   * Global mandatory-pillar failures invalidate both sides.
   */
  if (failures.length === 0) {
    if (
      selection.direction === "NEUTRAL"
    ) {
      failures.push(
        failure(
          selection.reason,
          {
            longQualified:
              longCase.qualified,
            shortQualified:
              shortCase.qualified,
            longStrength:
              longCase.mandatoryDirectional,
            shortStrength:
              shortCase.mandatoryDirectional,
            separation:
              selection.separation ??
              null,
          },
        ),
      );
    }
  }

  if (
    selection.selectedCase?.warnings
      ?.length
  ) {
    warnings.push(
      ...selection.selectedCase.warnings,
    );
  }

  const qualified =
    failures.length === 0 &&
    (
      selection.direction === "LONG" ||
      selection.direction === "SHORT"
    );

  const selectedCase =
    qualified
      ? selection.selectedCase
      : null;

  const discoveryPreferredDirection =
    normalizeDirection(
      candidate?.preferredDirection ??
      candidate?.opportunityRanking
        ?.preferredDirection,
    );

  return {
    engine:
      "CRYPTO_QUALIFICATION_2",

    version:
      "6.25",

    status:
      qualified
        ? "QUALIFIED"
        : "NO_TRADE",

    qualified,

    decision:
      qualified
        ? selection.direction
        : "NO_TRADE",

    proposedDirection:
      qualified
        ? selection.direction
        : "NEUTRAL",

    /*
     * Discovery direction is retained for diagnostics only.
     * It has zero decision authority in Qualification 2.
     */
    discoveryPreferredDirection,

    discoveryDirectionAuthority:
      false,

    directionalSelectionReason:
      selection.reason,

    directionalCases: {
      long:
        longCase,

      short:
        shortCase,
    },

    mandatoryPillars: {
      technical: {
        available:
          technicalReady,
        score:
          num(technical?.score),
        coverage:
          tCoverage,
        confidence:
          tConfidence,
        direction:
          normalizeDirection(
            technical?.direction,
          ),
        longSupport:
          directionStrength(
            technical,
            "LONG",
          ),
        shortSupport:
          directionStrength(
            technical,
            "SHORT",
          ),
        directionalSupport:
          selectedCase
            ?.technicalSupport ??
          null,
      },

      fundamental: {
        available:
          fundamentalReady,
        score:
          num(fundamental?.score),
        coverage:
          fCoverage,
        confidence:
          fConfidence,
        direction:
          normalizeDirection(
            fundamental?.direction,
          ),
        longSupport:
          directionStrength(
            fundamental,
            "LONG",
          ),
        shortSupport:
          directionStrength(
            fundamental,
            "SHORT",
          ),
        directionalSupport:
          selectedCase
            ?.fundamentalSupport ??
          null,
      },
    },

    supporting: {
      available:
        !!supporting,
      score:
        num(supporting?.score),
      coverage:
        sCoverage,
      confidence:
        sConfidence,
      direction:
        normalizeDirection(
          supporting?.direction,
        ),
      longSupport:
        supportingDirection(
          supporting,
          "LONG",
        ),
      shortSupport:
        supportingDirection(
          supporting,
          "SHORT",
        ),
      directionalSupport:
        selectedCase
          ?.supportingSupport ??
        null,
      authority:
        "CONTEXT_ONLY",
    },

    directionalEdge:
      selectedCase
        ?.directionalEdge ??
      null,

    coverageContract: {
      phase: "6.25",
      normalizedScale: "0_TO_1",
      acceptedInputScales: [
        "0_TO_1",
        "0_TO_100",
      ],
      thresholds: {
        technical:
          cfg.minTechnicalCoverage,
        fundamental:
          cfg.minFundamentalCoverage,
        supporting:
          cfg.minSupportingCoverage,
      },
      actual: {
        technical:
          tCoverage,
        fundamental:
          fCoverage,
        supporting:
          sCoverage,
      },
      mandatory: {
        technical: true,
        fundamental: true,
        supporting: false,
      },
      supportingAuthority:
        "CONTEXT_ONLY",
      discoveryDirectionAuthority:
        false,
    },

    failures,
    warnings,

    nextStage:
      qualified
        ? "FINAL_MARKET_RISK_REVALIDATION"
        : "NONE",

    researchOnly:
      true,

    qualificationAuthority:
      true,

    executionAuthority:
      false,

    liveExecution:
      false,

    paperExecutionAuthority:
      false,
  };
}

export default
  evaluateCryptoQualification2;
