import getAlphaVantageCompanyFundamentalData
  from "./companyFundamentalDataProvider.js";

import getSecCompanyFundamentalData
  from "./secCompanyFundamentalDataProvider.js";

/**
 * ============================================================
 * COMPANY FUNDAMENTAL AGGREGATOR
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Combine independent company-fundamental data sources into one
 * normalized input for companyFundamentalEngine.js.
 *
 * CURRENT SOURCES
 * ---------------
 *
 * 1. SEC EDGAR / CompanyFacts
 * 2. Alpha Vantage
 *
 * SOURCE POLICY
 * -------------
 *
 * Filed accounting facts:
 *   Prefer SEC EDGAR.
 *
 * Provider-specific enrichment:
 *   Prefer Alpha Vantage for fields the SEC provider does not
 *   currently derive, such as earnings surprise and interest
 *   coverage.
 *
 * SAFETY
 * ------
 *
 * - Never averages conflicting financial facts into a fabricated
 *   number.
 * - Never treats an unavailable provider as positive evidence.
 * - One provider may fail without invalidating valid evidence from
 *   another provider.
 * - Field-level provenance is preserved.
 * - Material source disagreement creates warnings.
 * - Decimal-ratio units are preserved exactly.
 * - Historical/as-of requests are point-in-time safe by default:
 *   Alpha Vantage is skipped because the current provider is not
 *   point-in-time aware.
 *
 * IMPORTANT UNIT CONTRACT
 * -----------------------
 *
 * Percentage-like values are DECIMAL RATIOS:
 *
 *   20%  =>  0.20
 *   5%   =>  0.05
 *  -10%  => -0.10
 */

export const COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    INSUFFICIENT_DATA:
      "INSUFFICIENT_DATA",

    INVALID_REQUEST:
      "INVALID_REQUEST",

    ERROR:
      "ERROR",
  });

export const COMPANY_FUNDAMENTAL_SOURCE =
  Object.freeze({
    SEC:
      "SEC_EDGAR",

    ALPHA_VANTAGE:
      "ALPHA_VANTAGE",
  });

const CORE_FIELDS =
  Object.freeze([
    "revenue",
    "earnings",
    "freeCashFlow",
    "operatingCashFlow",
    "margins",
    "debt",
    "interestCoverage",
    "earningsSurprise",
    "guidance",
    "valuation",
    "sensitivity",

    // Optional enrichment fields. Existing providers may return null;
    // future providers can populate these without changing the engine API.
    "profitability",
    "returns",
    "cashFlowQuality",
    "balanceSheet",
    "capitalAllocation",
    "forward",
    "businessQuality",
  ]);

const SEC_PRIMARY_FIELDS =
  new Set([
    "revenue",
    "earnings",
    "freeCashFlow",
    "operatingCashFlow",
    "margins",
    "debt",
  ]);

const ALPHA_PRIMARY_FIELDS =
  new Set([
    "interestCoverage",
    "earningsSurprise",
  ]);

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function now() {
  return new Date()
    .toISOString();
}

function normalizeSymbol(
  value,
) {
  const symbol =
    String(
      value ?? "",
    )
      .trim()
      .toUpperCase();

  return symbol ||
    null;
}

function safeArray(
  value,
) {
  return Array.isArray(
    value,
  )
    ? value
    : [];
}

function isPlainObject(
  value,
) {
  return (
    value !== null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value,
    )
  );
}

function numberOrNull(
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
    Number(value);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function clone(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  return structuredClone(
    value,
  );
}

function normalizeProviderResult({
  providerName,
  result,
  error = null,
}) {
  const approved =
    result
      ?.approved ===
    true;

  return {
    provider:
      providerName,

    approved,

    status:
      result
        ?.status ??
      (
        error
          ? "ERROR"
          : approved
            ? "COMPLETE"
            : "UNAVAILABLE"
      ),

    indicatorCount:
      Number.isFinite(
        Number(
          result
            ?.indicatorCount,
        ),
      )
        ? Number(
            result
              .indicatorCount,
          )
        : 0,

    data:
      approved &&
      isPlainObject(
        result?.data,
      )
        ? clone(
            result.data,
          )
        : null,

    warnings:
      safeArray(
        result?.warnings,
      ),

    errors:
      [
        ...safeArray(
          result?.errors,
        ),

        ...(error
          ? [
              error instanceof Error
                ? error.message
                : String(error),
            ]
          : []),
      ],

    raw:
      result ??
      null,
  };
}

async function callProvider({
  providerName,
  provider,
  args,
}) {
  if (
    typeof provider !==
    "function"
  ) {
    return normalizeProviderResult({
      providerName,

      result: {
        approved: false,

        status:
          "UNAVAILABLE",

        warnings: [
          `${providerName} provider is not configured.`,
        ],

        errors: [],
      },
    });
  }

  try {
    const result =
      await provider(
        args,
      );

    return normalizeProviderResult({
      providerName,
      result,
    });
  } catch (error) {
    return normalizeProviderResult({
      providerName,
      result: null,
      error,
    });
  }
}

function getPath(
  object,
  path,
) {
  let current =
    object;

  for (
    const key
    of path
  ) {
    if (
      current ===
        null ||
      current ===
        undefined
    ) {
      return null;
    }

    current =
      current[key];
  }

  return current ??
    null;
}

/**
 * Detect a material disagreement between two finite numeric values.
 *
 * The rule intentionally avoids pretending that tiny rounding
 * differences are meaningful:
 *
 * - absolute difference <= 0.01 is ignored
 * - otherwise >25% relative difference is considered material
 *
 * For values near zero, a 0.05 absolute difference is considered
 * material.
 */
function materiallyDifferent(
  left,
  right,
) {
  const a =
    numberOrNull(
      left,
    );

  const b =
    numberOrNull(
      right,
    );

  if (
    a === null ||
    b === null
  ) {
    return false;
  }

  const absoluteDifference =
    Math.abs(
      a - b,
    );

  if (
    absoluteDifference <=
    0.01
  ) {
    return false;
  }

  const scale =
    Math.max(
      Math.abs(a),
      Math.abs(b),
    );

  if (scale < 0.10) {
    return (
      absoluteDifference >
      0.05
    );
  }

  return (
    absoluteDifference /
      scale >
    0.25
  );
}

const COMPARISON_PATHS =
  Object.freeze({
    revenue: [
      ["growth"],
      ["acceleration"],
    ],

    earnings: [
      ["epsGrowth"],
    ],

    freeCashFlow: [
      ["value"],
      ["growth"],
      ["margin"],
    ],

    operatingCashFlow: [
      ["growth"],
    ],

    margins: [
      ["operatingMargin"],
      ["netMargin"],
    ],

    debt: [
      ["debtToEquity"],
      ["netDebtToEbitda"],
    ],

    interestCoverage: [
      ["ratio"],
    ],

    earningsSurprise: [
      ["percent"],
    ],

    profitability: [
      ["roe"],
      ["roa"],
      ["roic"],
    ],

    balanceSheet: [
      ["currentRatio"],
      ["quickRatio"],
      ["netDebt"],
    ],

    valuation: [
      ["pe"],
      ["forwardPE"],
      ["peg"],
      ["priceToSales"],
      ["evToEbitda"],
      ["priceToFCF"],
      ["fcfYield"],
    ],
  });

function compareFieldSources({
  field,
  selectedProvider,
  primaryData,
  secondaryData,
}) {
  const paths =
    COMPARISON_PATHS[
      field
    ] ??
    [];

  const conflicts = [];

  for (
    const path
    of paths
  ) {
    const primaryValue =
      getPath(
        primaryData,
        path,
      );

    const secondaryValue =
      getPath(
        secondaryData,
        path,
      );

    if (
      materiallyDifferent(
        primaryValue,
        secondaryValue,
      )
    ) {
      conflicts.push({
        metric:
          `${field}.${path.join(".")}`,

        selectedProvider,

        selectedValue:
          numberOrNull(
            primaryValue,
          ),

        alternateValue:
          numberOrNull(
            secondaryValue,
          ),
      });
    }
  }

  return conflicts;
}

function hasUsableValue(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== ""
  );
}

function preferredProvidersForField(field) {
  if (ALPHA_PRIMARY_FIELDS.has(field)) {
    return [
      COMPANY_FUNDAMENTAL_SOURCE.ALPHA_VANTAGE,
      COMPANY_FUNDAMENTAL_SOURCE.SEC,
    ];
  }

  return [
    COMPANY_FUNDAMENTAL_SOURCE.SEC,
    COMPANY_FUNDAMENTAL_SOURCE.ALPHA_VANTAGE,
  ];
}

function providerValue(provider, secValue, alphaValue) {
  return provider === COMPANY_FUNDAMENTAL_SOURCE.SEC
    ? secValue
    : alphaValue;
}

/**
 * Merge a financial object metric-by-metric rather than selecting an
 * entire provider object. This preserves authoritative SEC facts while
 * allowing Alpha Vantage to fill genuinely missing enrichment metrics.
 *
 * IMPORTANT: 0 is usable evidence. Only null/undefined/"" mean missing.
 */
function mergeObjectField({
  field,
  secValue,
  alphaValue,
  preferredProviders,
}) {
  const keys = new Set([
    ...Object.keys(isPlainObject(secValue) ? secValue : {}),
    ...Object.keys(isPlainObject(alphaValue) ? alphaValue : {}),
  ]);

  if (keys.size === 0) {
    return null;
  }

  const merged = {};
  const metricSources = {};

  for (const key of keys) {
    const secMetric = isPlainObject(secValue)
      ? secValue[key]
      : null;
    const alphaMetric = isPlainObject(alphaValue)
      ? alphaValue[key]
      : null;

    let selected = null;
    let selectedProvider = null;

    for (const provider of preferredProviders) {
      const candidate = providerValue(
        provider,
        secMetric,
        alphaMetric,
      );

      if (hasUsableValue(candidate)) {
        selected = clone(candidate);
        selectedProvider = provider;
        break;
      }
    }

    if (selectedProvider !== null) {
      merged[key] = selected;
      metricSources[key] = selectedProvider;
    } else {
      // Preserve the provider contract for known-but-unavailable metrics.
      merged[key] = null;
      metricSources[key] = null;
    }
  }

  const hasAnyUsableMetric = Object.values(merged)
    .some(hasUsableValue);

  if (!hasAnyUsableMetric) {
    return null;
  }

  return {
    value: merged,
    metricSources,
  };
}

function chooseField({
  field,
  secData,
  alphaData,
}) {
  const secValue = secData?.[field] ?? null;
  const alphaValue = alphaData?.[field] ?? null;
  const preferredProviders = preferredProvidersForField(field);

  const availableProviders = [
    ...(hasUsableValue(secValue)
      ? [COMPANY_FUNDAMENTAL_SOURCE.SEC]
      : []),
    ...(hasUsableValue(alphaValue)
      ? [COMPANY_FUNDAMENTAL_SOURCE.ALPHA_VANTAGE]
      : []),
  ];

  const conflicts = (
    hasUsableValue(secValue) &&
    hasUsableValue(alphaValue)
  )
    ? compareFieldSources({
        field,
        selectedProvider: preferredProviders[0],
        primaryData: providerValue(
          preferredProviders[0],
          secValue,
          alphaValue,
        ),
        secondaryData: providerValue(
          preferredProviders[1],
          secValue,
          alphaValue,
        ),
      })
    : [];

  let selectedValue = null;
  let selectedProvider = null;
  let alternateProvider = null;
  let metricSources = {};

  if (
    isPlainObject(secValue) ||
    isPlainObject(alphaValue)
  ) {
    const merged = mergeObjectField({
      field,
      secValue,
      alphaValue,
      preferredProviders,
    });

    if (merged) {
      selectedValue = merged.value;
      metricSources = merged.metricSources;

      const usedProviders = [
        ...new Set(
          Object.values(metricSources)
            .filter(Boolean),
        ),
      ];

      selectedProvider = usedProviders[0] ?? null;
      alternateProvider = usedProviders.find(
        (provider) => provider !== selectedProvider,
      ) ?? null;
    }
  } else {
    for (const provider of preferredProviders) {
      const candidate = providerValue(
        provider,
        secValue,
        alphaValue,
      );

      if (hasUsableValue(candidate)) {
        selectedValue = clone(candidate);
        selectedProvider = provider;
        break;
      }
    }

    alternateProvider = availableProviders.find(
      (provider) => provider !== selectedProvider,
    ) ?? null;
  }

  return {
    value: selectedValue,
    provenance: {
      selectedProvider,
      alternateProvider,
      availableProviders,
      metricSources,
      conflict: conflicts.length > 0,
      conflicts,
    },
  };
}

function selectMetadata({
  secData,
  alphaData,
}) {
  /*
   * Marketaux is NOT treated as a third financial provider here.
   * It is enrichment already carried by the Alpha provider response.
   * SEC/Alpha remain the only sources used by the financial metric merge.
   */
  const marketauxProfile =
    alphaData?.marketauxProfile ??
    null;

  const sourceComparison =
    alphaData?.sourceComparison ??
    null;

  return {
    sector:
      alphaData?.sector ??
      secData?.sector ??
      null,

    industry:
      alphaData?.industry ??
      secData?.industry ??
      sourceComparison
        ?.industry
        ?.selected ??
      marketauxProfile
        ?.industry ??
      null,

    countryCode:
      secData
        ?.countryCode ??
      alphaData
        ?.countryCode ??
      sourceComparison
        ?.country
        ?.selected ??
      marketauxProfile
        ?.country ??
      null,

    sourceComparison,

    marketauxProfile,
  };
}

/**
 * ============================================================
 * METRIC-LEVEL FUNDAMENTAL COVERAGE
 * ============================================================
 *
 * Top-level object count alone can overstate completeness. This
 * coverage model checks the actual financial metrics available.
 */

const FUNDAMENTAL_METRIC_PATHS = Object.freeze([
  ["revenue", "growth"],
  ["revenue", "acceleration"],
  ["earnings", "epsGrowth"],
  ["freeCashFlow", "value"],
  ["freeCashFlow", "growth"],
  ["freeCashFlow", "margin"],
  ["operatingCashFlow", "growth"],
  ["margins", "grossMargin"],
  ["margins", "operatingMargin"],
  ["margins", "netMargin"],
  ["debt", "debtToEquity"],
  ["debt", "netDebtToEbitda"],
  ["interestCoverage", "ratio"],
  ["earningsSurprise", "percent"],
  ["valuation", "score"],
  ["valuation", "pe"],
  ["valuation", "forwardPE"],
  ["valuation", "peg"],
  ["valuation", "priceToSales"],
  ["valuation", "evToEbitda"],
  ["valuation", "priceToFCF"],
  ["valuation", "fcfYield"],
  ["profitability", "roe"],
  ["profitability", "roa"],
  ["profitability", "roic"],
  ["balanceSheet", "currentRatio"],
  ["balanceSheet", "quickRatio"],
  ["capitalAllocation", "shareCountChange"],
  ["capitalAllocation", "buybackYield"],
  ["capitalAllocation", "dividendYield"],
  ["forward", "revenueGrowthEstimate"],
  ["forward", "epsGrowthEstimate"],
  ["forward", "estimateRevisionDirection"],
  ["guidance", "direction"],
]);

function hasUsableMetric(data, path) {
  const value = getPath(data, path);
  return value !== null && value !== undefined && value !== "";
}

function buildFundamentalCoverage(data) {
  const availableMetrics = FUNDAMENTAL_METRIC_PATHS
    .filter((path) => hasUsableMetric(data, path))
    .map((path) => path.join("."));

  const totalMetrics = FUNDAMENTAL_METRIC_PATHS.length;
  const availableCount = availableMetrics.length;
  const coverage = totalMetrics > 0
    ? availableCount / totalMetrics
    : 0;

  return {
    availableCount,
    totalMetrics,
    coverage,
    dataCoverage: coverage,
    availableMetrics,
    missingMetrics: FUNDAMENTAL_METRIC_PATHS
      .map((path) => path.join("."))
      .filter((name) => !availableMetrics.includes(name)),
  };
}

/**
 * ============================================================
 * FACTORY
 * ============================================================
 *
 * Dependency injection keeps the aggregator fully testable and
 * avoids real external requests inside unit tests.
 */

export function createCompanyFundamentalAggregator({
  secProvider =
    getSecCompanyFundamentalData,

  alphaProvider =
    getAlphaVantageCompanyFundamentalData,
} = {}) {
  return async function aggregateCompanyFundamentals({
    symbol,

    asOfDate = null,

    /**
     * Alpha Vantage currently returns current company data and is
     * not point-in-time aware.
     *
     * Historical/replay callers therefore skip Alpha by default.
     * This flag exists only for controlled research/testing.
     */
    allowCurrentAlphaForHistorical =
      false,
  } = {}) {
    const startedAt =
      now();

    const normalizedSymbol =
      normalizeSymbol(
        symbol,
      );

    if (!normalizedSymbol) {
      return {
        approved: false,

        provider:
          "COMPANY_FUNDAMENTAL_AGGREGATOR",

        status:
          COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS
            .INVALID_REQUEST,

        symbol: null,

        indicatorCount: 0,

        data: null,

        provenance: {},

        conflicts: [],

        providers: {},

        warnings: [],

        errors: [
          "Symbol is required.",
        ],

        startedAt,

        fetchedAt:
          now(),
      };
    }

    try {
      const historicalRequest =
        asOfDate !==
          null &&
        asOfDate !==
          undefined;

      const alphaAllowed =
        !historicalRequest ||
        allowCurrentAlphaForHistorical ===
          true;

      const [
        sec,
        alpha,
      ] =
        await Promise.all([
          callProvider({
            providerName:
              COMPANY_FUNDAMENTAL_SOURCE.SEC,

            provider:
              secProvider,

            args: {
              symbol:
                normalizedSymbol,

              asOfDate,
            },
          }),

          alphaAllowed
            ? callProvider({
                providerName:
                  COMPANY_FUNDAMENTAL_SOURCE
                    .ALPHA_VANTAGE,

                provider:
                  alphaProvider,

                args: {
                  symbol:
                    normalizedSymbol,
                },
              })
            : Promise.resolve(
                normalizeProviderResult({
                  providerName:
                    COMPANY_FUNDAMENTAL_SOURCE
                      .ALPHA_VANTAGE,

                  result: {
                    approved:
                      false,

                    status:
                      "SKIPPED_POINT_IN_TIME_SAFETY",

                    warnings: [
                      "Alpha Vantage was skipped for a historical/as-of request because the current provider is not point-in-time aware.",
                    ],

                    errors: [],
                  },
                }),
              ),
        ]);

      const secData =
        sec.approved
          ? sec.data
          : null;

      const alphaData =
        alpha.approved
          ? alpha.data
          : null;

      const metadata =
        selectMetadata({
          secData,
          alphaData,
        });

      const data = {
        symbol:
          normalizedSymbol,

        sector:
          metadata.sector,

        industry:
          metadata.industry,

        countryCode:
          metadata.countryCode,

        /*
         * Source-comparison diagnostics only.
         * These are deliberately outside CORE_FIELDS and therefore
         * cannot increase indicatorCount or fundamentalCoverage.
         */
        sourceComparison:
          metadata.sourceComparison,

        marketauxProfile:
          metadata.marketauxProfile,
      };

      const provenance = {};
      const conflicts = [];

      for (
        const field
        of CORE_FIELDS
      ) {
        const selection =
          chooseField({
            field,
            secData,
            alphaData,
          });

        data[field] =
          selection.value;

        provenance[field] =
          selection
            .provenance;

        conflicts.push(
          ...selection
            .provenance
            .conflicts,
        );
      }

      data.source = {
        provider:
          "COMPANY_FUNDAMENTAL_AGGREGATOR",

        retrievedAt:
          now(),

        asOfDate,

        providersUsed:
          [
            ...(sec.approved
              ? [
                  COMPANY_FUNDAMENTAL_SOURCE.SEC,
                ]
              : []),

            ...(alpha.approved
              ? [
                  COMPANY_FUNDAMENTAL_SOURCE
                    .ALPHA_VANTAGE,
                ]
              : []),
          ],
      };

      const fundamentalCoverage =
        buildFundamentalCoverage(
          data,
        );

      data.fundamentalCoverage =
        fundamentalCoverage;

      const indicatorCount =
        CORE_FIELDS.filter(
          (field) =>
            data[field] !==
            null &&
            data[field] !==
            undefined,
        ).length;

      const warnings = [];

      if (
        historicalRequest &&
        !alphaAllowed
      ) {
        warnings.push(
          "Historical point-in-time mode is active; current Alpha Vantage fundamentals were not used.",
        );
      }

      for (
        const providerResult
        of [
          sec,
          alpha,
        ]
      ) {
        if (
          providerResult
            .approved !==
          true &&
          providerResult
            .status !==
          "SKIPPED_POINT_IN_TIME_SAFETY"
        ) {
          warnings.push(
            `${providerResult.provider} did not provide approved company evidence.`,
          );
        }

        warnings.push(
          ...providerResult
            .warnings,
        );
      }

      if (
        conflicts.length >
        0
      ) {
        warnings.push(
          `${conflicts.length} material cross-source company-fundamental conflict(s) were detected. Preferred-source values were retained and confidence should be interpreted cautiously.`,
        );
      }

      if (
        indicatorCount <
        5 &&
        indicatorCount >
        0
      ) {
        warnings.push(
          "Combined company analysis contains fewer than five usable fundamental indicators.",
        );
      }

      if (
        fundamentalCoverage.coverage <
        0.35 &&
        fundamentalCoverage.availableCount >
        0
      ) {
        warnings.push(
          `Metric-level fundamental coverage is only ${Math.round(fundamentalCoverage.coverage * 100)}%.`,
        );
      }

      const approved =
        indicatorCount >
        0;

      return {
        approved,

        provider:
          "COMPANY_FUNDAMENTAL_AGGREGATOR",

        status:
          !approved
            ? COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS
                .INSUFFICIENT_DATA
            : indicatorCount >=
                5 &&
                fundamentalCoverage.coverage >=
                0.35
              ? COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS
                  .COMPLETE
              : COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS
                  .PARTIAL,

        symbol:
          normalizedSymbol,

        indicatorCount,

        fundamentalCoverage,

        data:
          approved
            ? data
            : null,

        provenance,

        conflicts,

        providers: {
          sec: {
            approved:
              sec.approved,

            status:
              sec.status,

            indicatorCount:
              sec
                .indicatorCount,

            warnings:
              sec.warnings,

            errors:
              sec.errors,
          },

          alphaVantage: {
            approved:
              alpha.approved,

            status:
              alpha.status,

            indicatorCount:
              alpha
                .indicatorCount,

            warnings:
              alpha.warnings,

            errors:
              alpha.errors,
          },
        },

        warnings:
          [
            ...new Set(
              warnings,
            ),
          ],

        errors: [],

        startedAt,

        fetchedAt:
          now(),
      };
    } catch (error) {
      return {
        approved: false,

        provider:
          "COMPANY_FUNDAMENTAL_AGGREGATOR",

        status:
          COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS
            .ERROR,

        symbol:
          normalizedSymbol,

        indicatorCount: 0,

        data: null,

        provenance: {},

        conflicts: [],

        providers: {},

        warnings: [
          "Company fundamental aggregation failed safely. No company directional evidence should be awarded from this result.",
        ],

        errors: [
          error instanceof Error
            ? error.message
            : String(error),
        ],

        startedAt,

        fetchedAt:
          now(),
      };
    }
  };
}

/**
 * ============================================================
 * PRODUCTION AGGREGATOR
 * ============================================================
 */

export const getAggregatedCompanyFundamentalData =
  createCompanyFundamentalAggregator();

export default
getAggregatedCompanyFundamentalData;
