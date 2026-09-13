// server/src/analysis/companyEconomicExposureEngine.js

/**
 * ============================================================
 * COMPANY ECONOMIC EXPOSURE ENGINE
 * ============================================================
 *
 * PURPOSE
 * -------
 * Derive company-specific sensitivity to:
 * - recession
 * - interest rates
 * - consumer conditions
 * - currency
 * - trade / supply-chain conditions
 *
 * This engine does NOT score current macro conditions.
 * It estimates how exposed THIS company is to those conditions.
 *
 * In the directional scoring architecture, this exposure profile is used
 * to translate current macro conditions into company-specific macro impact.
 * Macro carries 10/100 directional points; this engine itself does not
 * manufacture macro evidence or authorize trades.
 *
 * Output is intentionally compatible with
 * companyFundamentalEngine.js:
 *
 * sensitivity: {
 *   recession,
 *   interestRates,
 *   consumer,
 *   currency,
 *   trade
 * }
 *
 * IMPORTANT
 * ---------
 * - Missing company classification is NOT neutral evidence.
 * - Unknown exposure is never converted to 0.
 * - Sector/industry rules are transparent heuristics, not facts.
 * - Explicit measured/curated overrides take precedence.
 * - This engine never authorizes trades.
 */

export const COMPANY_ECONOMIC_EXPOSURE_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    PARTIAL: "PARTIAL",
    INSUFFICIENT_DATA: "INSUFFICIENT_DATA",
    ERROR: "ERROR",
  });

const EXPOSURE_KEYS =
  Object.freeze([
    "recession",
    "interestRates",
    "consumer",
    "currency",
    "trade",
  ]);

function now() {
  return new Date()
    .toISOString();
}

function normalizeText(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

function finiteNumberOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function clamp01(
  value,
) {
  const parsed =
    finiteNumberOrNull(
      value,
    );

  if (parsed === null) {
    return null;
  }

  return Math.min(
    Math.max(
      parsed,
      0,
    ),
    1,
  );
}

function round(
  value,
  decimals = 4,
) {
  const parsed =
    finiteNumberOrNull(
      value,
    );

  if (parsed === null) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        parsed +
        Number.EPSILON
      ) *
      factor,
    ) /
    factor
  );
}

function average(
  values,
) {
  const usable =
    values
      .map(
        finiteNumberOrNull,
      )
      .filter(
        value =>
          value !== null,
      );

  if (
    usable.length ===
    0
  ) {
    return null;
  }

  return (
    usable.reduce(
      (
        total,
        value,
      ) =>
        total +
        value,
      0,
    ) /
    usable.length
  );
}

function mergeExposure(
  base,
  overlay,
) {
  const result = {
    ...base,
  };

  for (
    const key
    of EXPOSURE_KEYS
  ) {
    const value =
      clamp01(
        overlay?.[key],
      );

    if (
      value !== null
    ) {
      result[key] =
        value;
    }
  }

  return result;
}

/**
 * ============================================================
 * SECTOR BASELINES
 * ============================================================
 *
 * 0 = little direct exposure
 * 1 = very high exposure
 *
 * These are intentionally broad priors. Industry rules below
 * refine them. Explicit overrides always win.
 */

const SECTOR_PROFILES =
  Object.freeze({
    technology: {
      recession: 0.45,
      interestRates: 0.65,
      consumer: 0.35,
      currency: 0.65,
      trade: 0.60,
    },

    "information technology": {
      recession: 0.45,
      interestRates: 0.65,
      consumer: 0.35,
      currency: 0.65,
      trade: 0.60,
    },

    "consumer discretionary": {
      recession: 0.85,
      interestRates: 0.65,
      consumer: 0.95,
      currency: 0.45,
      trade: 0.55,
    },

    "consumer cyclical": {
      recession: 0.85,
      interestRates: 0.65,
      consumer: 0.95,
      currency: 0.45,
      trade: 0.55,
    },

    "consumer staples": {
      recession: 0.25,
      interestRates: 0.30,
      consumer: 0.35,
      currency: 0.45,
      trade: 0.45,
    },

    healthcare: {
      recession: 0.25,
      interestRates: 0.35,
      consumer: 0.20,
      currency: 0.45,
      trade: 0.35,
    },

    financials: {
      recession: 0.75,
      interestRates: 0.90,
      consumer: 0.55,
      currency: 0.25,
      trade: 0.20,
    },

    financial: {
      recession: 0.75,
      interestRates: 0.90,
      consumer: 0.55,
      currency: 0.25,
      trade: 0.20,
    },

    industrials: {
      recession: 0.75,
      interestRates: 0.55,
      consumer: 0.40,
      currency: 0.55,
      trade: 0.75,
    },

    energy: {
      recession: 0.70,
      interestRates: 0.35,
      consumer: 0.30,
      currency: 0.55,
      trade: 0.80,
    },

    materials: {
      recession: 0.80,
      interestRates: 0.40,
      consumer: 0.30,
      currency: 0.60,
      trade: 0.85,
    },

    utilities: {
      recession: 0.20,
      interestRates: 0.80,
      consumer: 0.15,
      currency: 0.15,
      trade: 0.20,
    },

    "real estate": {
      recession: 0.70,
      interestRates: 0.95,
      consumer: 0.45,
      currency: 0.15,
      trade: 0.15,
    },

    "communication services": {
      recession: 0.50,
      interestRates: 0.45,
      consumer: 0.45,
      currency: 0.45,
      trade: 0.30,
    },

    telecommunications: {
      recession: 0.35,
      interestRates: 0.60,
      consumer: 0.25,
      currency: 0.30,
      trade: 0.30,
    },
  });

/**
 * ============================================================
 * INDUSTRY REFINEMENTS
 * ============================================================
 *
 * These rules intentionally modify only the dimensions for
 * which the industry classification gives useful information.
 */

const INDUSTRY_RULES =
  Object.freeze([
    {
      match: [
        "semiconductor",
        "semiconductors",
        "chip",
      ],
      exposure: {
        recession: 0.65,
        interestRates: 0.60,
        currency: 0.75,
        trade: 0.95,
      },
      reason:
        "Semiconductor businesses are cyclical and highly exposed to global supply chains and trade restrictions.",
    },

    {
      match: [
        "consumer electronics",
        "electronic computers",
        "computer hardware",
        "communication equipment",
      ],
      exposure: {
        recession: 0.65,
        consumer: 0.75,
        currency: 0.75,
        trade: 0.90,
      },
      reason:
        "Hardware businesses depend materially on discretionary demand, global manufacturing, foreign currencies, and trade flows.",
    },

    {
      match: [
        "software",
        "application software",
        "infrastructure software",
        "software services",
      ],
      exposure: {
        recession: 0.45,
        interestRates: 0.70,
        consumer: 0.25,
        currency: 0.55,
        trade: 0.20,
      },
      reason:
        "Software demand is less supply-chain dependent, while long-duration valuations can remain rate-sensitive.",
    },

    {
      match: [
        "bank",
        "banks",
        "credit services",
        "consumer finance",
      ],
      exposure: {
        recession: 0.90,
        interestRates: 0.95,
        consumer: 0.70,
        currency: 0.20,
        trade: 0.15,
      },
      reason:
        "Banks and lenders are highly exposed to credit cycles, recession risk, and interest-rate conditions.",
    },

    {
      match: [
        "insurance",
      ],
      exposure: {
        recession: 0.45,
        interestRates: 0.75,
        consumer: 0.35,
        currency: 0.20,
        trade: 0.10,
      },
      reason:
        "Insurers are sensitive to investment yields and economic conditions but generally less trade-sensitive.",
    },

    {
      match: [
        "retail",
        "specialty retail",
        "department stores",
        "restaurants",
        "apparel",
        "automobile",
        "automotive",
      ],
      exposure: {
        recession: 0.90,
        interestRates: 0.65,
        consumer: 0.95,
        currency: 0.45,
        trade: 0.65,
      },
      reason:
        "Discretionary retail and consumer businesses are highly sensitive to household demand and economic slowdowns.",
    },

    {
      match: [
        "pharmaceutical",
        "biotechnology",
        "biotech",
        "medical devices",
      ],
      exposure: {
        recession: 0.20,
        interestRates: 0.40,
        consumer: 0.15,
        currency: 0.50,
        trade: 0.30,
      },
      reason:
        "Healthcare demand is comparatively defensive, though global companies retain currency and supply exposure.",
    },

    {
      match: [
        "oil",
        "gas",
        "exploration",
        "integrated oil",
      ],
      exposure: {
        recession: 0.80,
        interestRates: 0.30,
        consumer: 0.30,
        currency: 0.65,
        trade: 0.90,
      },
      reason:
        "Energy producers are highly cyclical and exposed to global commodity demand and trade conditions.",
    },

    {
      match: [
        "reit",
        "real estate investment trust",
        "real estate",
      ],
      exposure: {
        recession: 0.70,
        interestRates: 0.95,
        consumer: 0.40,
        currency: 0.15,
        trade: 0.10,
      },
      reason:
        "Property businesses are highly financing-sensitive and exposed to economic occupancy and asset-value cycles.",
    },

    {
      match: [
        "utility",
        "electric utilities",
        "regulated electric",
      ],
      exposure: {
        recession: 0.15,
        interestRates: 0.85,
        consumer: 0.10,
        currency: 0.10,
        trade: 0.15,
      },
      reason:
        "Utilities are defensive operationally but often highly sensitive to financing costs.",
    },

    {
      match: [
        "aerospace",
        "defense",
        "industrial machinery",
        "construction",
        "transportation",
        "freight",
      ],
      exposure: {
        recession: 0.75,
        interestRates: 0.50,
        consumer: 0.30,
        currency: 0.55,
        trade: 0.80,
      },
      reason:
        "Industrial businesses are cyclical and materially exposed to global investment and trade flows.",
    },
  ]);

function findSectorProfile(
  sector,
) {
  const normalized =
    normalizeText(
      sector,
    );

  if (!normalized) {
    return null;
  }

  if (
    SECTOR_PROFILES[
      normalized
    ]
  ) {
    return {
      exposure: {
        ...SECTOR_PROFILES[
          normalized
        ],
      },

      reason:
        `Sector baseline derived from ${sector}.`,
    };
  }

  for (
    const [
      key,
      profile,
    ]
    of Object.entries(
      SECTOR_PROFILES,
    )
  ) {
    if (
      normalized.includes(
        key,
      ) ||
      key.includes(
        normalized,
      )
    ) {
      return {
        exposure: {
          ...profile,
        },

        reason:
          `Sector baseline derived from ${sector}.`,
      };
    }
  }

  return null;
}

function findIndustryProfile(
  industry,
) {
  const normalized =
    normalizeText(
      industry,
    );

  if (!normalized) {
    return null;
  }

  for (
    const rule
    of INDUSTRY_RULES
  ) {
    if (
      rule.match.some(
        term =>
          normalized.includes(
            term,
          ),
      )
    ) {
      return {
        exposure: {
          ...rule.exposure,
        },

        reason:
          rule.reason,
      };
    }
  }

  return null;
}

function normalizeExplicitSensitivity(
  sensitivity,
) {
  if (
    !sensitivity ||
    typeof sensitivity !==
      "object"
  ) {
    return {};
  }

  return {
    recession:
      clamp01(
        sensitivity
          .recession,
      ),

    interestRates:
      clamp01(
        sensitivity
          .interestRates ??
        sensitivity
          .rates,
      ),

    consumer:
      clamp01(
        sensitivity
          .consumer,
      ),

    currency:
      clamp01(
        sensitivity
          .currency,
      ),

    trade:
      clamp01(
        sensitivity
          .trade,
      ),
  };
}

function availableExposureKeys(
  exposure,
) {
  return EXPOSURE_KEYS
    .filter(
      key =>
        clamp01(
          exposure?.[key],
        ) !==
        null,
    );
}

/**
 * ============================================================
 * MAIN ENGINE
 * ============================================================
 */

export function analyzeCompanyEconomicExposure({
  symbol = null,
  sector = null,
  industry = null,

  /**
   * Optional explicit/curated company-specific sensitivity.
   * These values override sector and industry priors.
   */
  explicitSensitivity =
    null,
} = {}) {
  const timestamp =
    now();

  try {
    const sectorProfile =
      findSectorProfile(
        sector,
      );

    const industryProfile =
      findIndustryProfile(
        industry,
      );

    const explicit =
      normalizeExplicitSensitivity(
        explicitSensitivity,
      );

    let exposure = {};

    const reasons = [];
    const sources = {};

    if (
      sectorProfile
    ) {
      exposure =
        mergeExposure(
          exposure,
          sectorProfile
            .exposure,
        );

      reasons.push(
        sectorProfile
          .reason,
      );

      for (
        const key
        of availableExposureKeys(
          sectorProfile
            .exposure,
        )
      ) {
        sources[key] =
          "SECTOR_PROFILE";
      }
    }

    if (
      industryProfile
    ) {
      exposure =
        mergeExposure(
          exposure,
          industryProfile
            .exposure,
        );

      reasons.push(
        industryProfile
          .reason,
      );

      for (
        const key
        of availableExposureKeys(
          industryProfile
            .exposure,
        )
      ) {
        sources[key] =
          "INDUSTRY_PROFILE";
      }
    }

    exposure =
      mergeExposure(
        exposure,
        explicit,
      );

    for (
      const key
      of availableExposureKeys(
        explicit,
      )
    ) {
      sources[key] =
        "EXPLICIT_COMPANY_EVIDENCE";
    }

    const availableKeys =
      availableExposureKeys(
        exposure,
      );

    if (
      availableKeys.length ===
      0
    ) {
      return {
        approved: false,

        engine:
          "COMPANY_ECONOMIC_EXPOSURE",

        status:
          COMPANY_ECONOMIC_EXPOSURE_STATUS
            .INSUFFICIENT_DATA,

        symbol,
        sector,
        industry,

        sensitivity: null,

        confidence: 0,

        coverage: 0,

        averageSensitivity:
          null,

        sources: {},

        reasons: [
          "No usable sector, industry, or explicit company economic-exposure evidence was available.",
        ],

        warnings: [
          "Economic exposure remains unavailable and must not be treated as neutral evidence.",
        ],

        errors: [],

        timestamp,
      };
    }

    const normalizedSensitivity = {
      recession:
        clamp01(
          exposure.recession,
        ),

      interestRates:
        clamp01(
          exposure.interestRates,
        ),

      consumer:
        clamp01(
          exposure.consumer,
        ),

      currency:
        clamp01(
          exposure.currency,
        ),

      trade:
        clamp01(
          exposure.trade,
        ),
    };

    const coverage =
      availableKeys.length /
      EXPOSURE_KEYS.length;

    /**
     * Confidence reflects evidence specificity:
     * explicit > industry > sector.
     */
    let confidenceBase =
      sectorProfile
        ? 0.58
        : 0;

    if (
      industryProfile
    ) {
      confidenceBase =
        Math.max(
          confidenceBase,
          0.72,
        );
    }

    if (
      availableExposureKeys(
        explicit,
      ).length >
      0
    ) {
      confidenceBase =
        Math.max(
          confidenceBase,
          0.88,
        );

      reasons.push(
        "Explicit company-specific exposure evidence overrides generic classification priors where supplied.",
      );
    }

    const confidence =
      round(
        Math.min(
          1,
          confidenceBase *
            (
              0.65 +
              0.35 *
                coverage
            ),
        ),
      );

    const averageSensitivity =
      round(
        average(
          Object.values(
            normalizedSensitivity,
          ),
        ),
      );

    const status =
      coverage >= 1
        ? COMPANY_ECONOMIC_EXPOSURE_STATUS
            .COMPLETE
        : COMPANY_ECONOMIC_EXPOSURE_STATUS
            .PARTIAL;

    return {
      approved: true,

      engine:
        "COMPANY_ECONOMIC_EXPOSURE",

      status,

      symbol,
      sector,
      industry,

      sensitivity:
        normalizedSensitivity,

      confidence,

      coverage:
        round(
          coverage,
        ),

      averageSensitivity,

      sources,

      reasons,

      warnings:
        explicitSensitivity
          ? []
          : [
              "Economic sensitivities are classification-based priors until company-specific exposure evidence is supplied.",
            ],

      errors: [],

      timestamp,
    };
  } catch (
    error
  ) {
    return {
      approved: false,

      engine:
        "COMPANY_ECONOMIC_EXPOSURE",

      status:
        COMPANY_ECONOMIC_EXPOSURE_STATUS
          .ERROR,

      symbol,
      sector,
      industry,

      sensitivity: null,

      confidence: 0,

      coverage: 0,

      averageSensitivity:
        null,

      sources: {},

      reasons: [],

      warnings: [
        "Company economic-exposure analysis failed safely.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      ],

      timestamp,
    };
  }
}

export default
  analyzeCompanyEconomicExposure;
