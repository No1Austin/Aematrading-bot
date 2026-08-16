import axios from "axios";

import getUSMacroData from "./usMacroDataProvider.js";

/**
 * U.S. COUNTRY RISK DATA PROVIDER
 *
 * Adds verified supplemental FRED series while keeping
 * unavailable dimensions null rather than manufacturing data.
 */

const FRED_BASE_URL =
  "https://api.stlouisfed.org/fred";

export const COUNTRY_FRED_SERIES =
  Object.freeze({
    BROAD_DOLLAR:
      "DTWEXBGS",

    DEBT_TO_GDP:
      "GFDEGDQ188S",

    TRADE_BALANCE:
      "BOPGSTB",

    FINANCIAL_STRESS:
      "STLFSI4",
  });

const CACHE_TTL_MS =
  30 * 60 * 1000;

const supplementalCache =
  new Map();

function getApiKey() {
  const key =
    process.env
      .FRED_API_KEY;

  if (!key) {
    throw new Error(
      "FRED_API_KEY is required.",
    );
  }

  return key;
}

function numberOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "."
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function clamp(
  value,
  min,
  max,
) {
  const number =
    numberOrNull(
      value,
    );

  if (number === null) {
    return null;
  }

  return Math.min(
    Math.max(
      number,
      min,
    ),
    max,
  );
}

function round(
  value,
  decimals = 4,
) {
  const number =
    numberOrNull(
      value,
    );

  if (number === null) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        number +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
}

function percentChange(
  current,
  previous,
) {
  const currentValue =
    numberOrNull(
      current,
    );

  const previousValue =
    numberOrNull(
      previous,
    );

  if (
    currentValue === null ||
    previousValue === null ||
    previousValue === 0
  ) {
    return null;
  }

  return (
    (
      currentValue -
      previousValue
    ) /
    Math.abs(
      previousValue,
    )
  );
}

function determineTrend({
  latest,
  previous,
  tolerance = 0,
}) {
  const a =
    numberOrNull(
      latest,
    );

  const b =
    numberOrNull(
      previous,
    );

  if (
    a === null ||
    b === null
  ) {
    return "UNKNOWN";
  }

  const difference =
    a - b;

  if (
    Math.abs(
      difference,
    ) <= tolerance
  ) {
    return "STABLE";
  }

  return difference > 0
    ? "RISING"
    : "FALLING";
}

function standardDeviation(
  values,
) {
  const usable =
    Array.isArray(values)
      ? values
          .map(numberOrNull)
          .filter(
            (value) =>
              value !== null,
          )
      : [];

  if (
    usable.length < 2
  ) {
    return null;
  }

  const mean =
    usable.reduce(
      (
        total,
        value,
      ) =>
        total +
        value,
      0,
    ) /
    usable.length;

  const variance =
    usable.reduce(
      (
        total,
        value,
      ) =>
        total +
        (
          value -
          mean
        ) ** 2,
      0,
    ) /
    usable.length;

  return Math.sqrt(
    variance,
  );
}

function getCacheKey(
  asOfDate,
) {
  if (!asOfDate) {
    return "LIVE";
  }

  const date =
    new Date(
      asOfDate,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    throw new Error(
      `Invalid asOfDate: ${asOfDate}`,
    );
  }

  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

function createFredClient() {
  return axios.create({
    baseURL:
      FRED_BASE_URL,

    timeout:
      30_000,

    headers: {
      Accept:
        "application/json",
    },
  });
}

async function fetchSeries({
  seriesId,
  asOfDate = null,
  limit = 30,
}) {
  const client =
    createFredClient();

  const params = {
    series_id:
      seriesId,

    api_key:
      getApiKey(),

    file_type:
      "json",

    sort_order:
      "desc",

    limit,
  };

  if (asOfDate) {
    const date =
      new Date(
        asOfDate,
      );

    if (
      Number.isNaN(
        date.getTime(),
      )
    ) {
      throw new Error(
        `Invalid asOfDate: ${asOfDate}`,
      );
    }

    const dateOnly =
      date
        .toISOString()
        .slice(
          0,
          10,
        );

    params.observation_end =
      dateOnly;

    params.realtime_start =
      dateOnly;

    params.realtime_end =
      dateOnly;
  }

  const response =
    await client.get(
      "/series/observations",
      {
        params,
      },
    );

  const observations =
    Array.isArray(
      response
        ?.data
        ?.observations,
    )
      ? response
          .data
          .observations
      : [];

  return observations
    .map(
      (item) => ({
        date:
          item.date,

        value:
          numberOrNull(
            item.value,
          ),

        realtimeStart:
          item
            .realtime_start ??
          null,

        realtimeEnd:
          item
            .realtime_end ??
          null,
      }),
    )
    .filter(
      (item) =>
        item.value !== null,
    );
}

async function safeFetchSeries({
  name,
  seriesId,
  asOfDate,
  limit,
}) {
  try {
    const observations =
      await fetchSeries({
        seriesId,
        asOfDate,
        limit,
      });

    if (
      observations.length === 0
    ) {
      return {
        name,
        seriesId,
        approved:
          false,
        observations: [],
        warning:
          `${name} returned no usable observations.`,
      };
    }

    return {
      name,
      seriesId,
      approved:
        true,
      observations,
      warning:
        null,
    };
  } catch (error) {
    return {
      name,
      seriesId,
      approved:
        false,
      observations: [],
      warning:
        `${name} unavailable: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
    };
  }
}

function buildConsumer({
  confidence,
  spending,
}) {
  const confidenceValue =
    numberOrNull(
      confidence?.value,
    );

  const spendingGrowth =
    numberOrNull(
      spending?.growth,
    );

  if (
    confidenceValue === null &&
    spendingGrowth === null
  ) {
    return null;
  }

  let score = 0;
  let components = 0;

  if (
    confidenceValue !== null
  ) {
    const confidenceScore =
      clamp(
        (
          confidenceValue -
          75
        ) /
          35,
        -1,
        1,
      );

    if (
      confidenceScore !== null
    ) {
      score +=
        confidenceScore;

      components +=
        1;
    }
  }

  if (
    spendingGrowth !== null
  ) {
    const spendingScore =
      clamp(
        spendingGrowth /
          2,
        -1,
        1,
      );

    if (
      spendingScore !== null
    ) {
      score +=
        spendingScore;

      components +=
        1;
    }
  }

  if (
    components === 0
  ) {
    return null;
  }

  return {
    strengthScore:
      round(
        score /
          components,
        4,
      ),

    trend:
      confidence?.trend ??
      spending?.trend ??
      "UNKNOWN",

    source:
      "FRED",
  };
}

function buildCurrency(
  observations,
) {
  if (
    !Array.isArray(
      observations,
    ) ||
    observations.length < 2
  ) {
    return null;
  }

  const latest =
    numberOrNull(
      observations[0]
        ?.value,
    );

  const lookbackIndex =
    Math.min(
      observations.length - 1,
      20,
    );

  const lookback =
    numberOrNull(
      observations[
        lookbackIndex
      ]?.value,
    );

  if (
    latest === null ||
    lookback === null
  ) {
    return null;
  }

  const change =
    percentChange(
      latest,
      lookback,
    );

  const strengthScore =
    change === null
      ? null
      : clamp(
          change /
            0.05,
          -1,
          1,
        );

  const returns = [];

  for (
    let index = 0;
    index <
      observations.length - 1;
    index += 1
  ) {
    const dailyReturn =
      percentChange(
        observations[index]
          ?.value,
        observations[
          index + 1
        ]?.value,
      );

    if (
      dailyReturn !== null
    ) {
      returns.push(
        dailyReturn,
      );
    }
  }

  const volatility =
    standardDeviation(
      returns,
    );

  const volatilityScore =
    volatility === null
      ? null
      : clamp(
          volatility /
            0.01,
          0,
          1,
        );

  if (
    strengthScore === null &&
    volatilityScore === null
  ) {
    return null;
  }

  return {
    strengthScore:
      round(
        strengthScore,
        4,
      ),

    volatilityScore:
      round(
        volatilityScore,
        4,
      ),

    indexLevel:
      latest,

    changePercent:
      change === null
        ? null
        : round(
            change * 100,
            4,
          ),

    trend:
      determineTrend({
        latest,
        previous:
          lookback,
        tolerance:
          0.05,
      }),

    period:
      observations[0]
        ?.date ??
      null,

    source:
      "FRED",

    series:
      COUNTRY_FRED_SERIES
        .BROAD_DOLLAR,
  };
}

function buildFiscal(
  observations,
) {
  if (
    !Array.isArray(
      observations,
    ) ||
    observations.length === 0
  ) {
    return null;
  }

  const latest =
    numberOrNull(
      observations[0]
        ?.value,
    );

  const previous =
    numberOrNull(
      observations[1]
        ?.value,
    );

  if (
    latest === null
  ) {
    return null;
  }

  const pressureScore =
    clamp(
      (
        latest -
        60
      ) /
        100,
      0,
      1,
    );

  return {
    pressureScore:
      round(
        pressureScore,
        4,
      ),

    debtToGDP:
      round(
        latest,
        4,
      ),

    trend:
      determineTrend({
        latest,
        previous,
        tolerance:
          0.25,
      }),

    period:
      observations[0]
        ?.date ??
      null,

    source:
      "FRED",

    series:
      COUNTRY_FRED_SERIES
        .DEBT_TO_GDP,
  };
}

function buildTrade(
  observations,
) {
  if (
    !Array.isArray(
      observations,
    ) ||
    observations.length === 0
  ) {
    return null;
  }

  const latest =
    numberOrNull(
      observations[0]
        ?.value,
    );

  const previous =
    numberOrNull(
      observations[1]
        ?.value,
    );

  if (
    latest === null
  ) {
    return null;
  }

  const deficitMagnitude =
    latest < 0
      ? Math.abs(
          latest,
        )
      : 0;

  const stressScore =
    clamp(
      deficitMagnitude /
        250_000,
      0,
      1,
    );

  let trend =
    "UNKNOWN";

  if (
    previous !== null
  ) {
    const latestStress =
      latest < 0
        ? Math.abs(
            latest,
          )
        : 0;

    const previousStress =
      previous < 0
        ? Math.abs(
            previous,
          )
        : 0;

    trend =
      determineTrend({
        latest:
          latestStress,
        previous:
          previousStress,
        tolerance:
          2_500,
      });
  }

  return {
    stressScore:
      round(
        stressScore,
        4,
      ),

    balanceMillions:
      latest,

    trend,

    period:
      observations[0]
        ?.date ??
      null,

    source:
      "FRED",

    series:
      COUNTRY_FRED_SERIES
        .TRADE_BALANCE,
  };
}

function buildBanking(
  observations,
) {
  if (
    !Array.isArray(
      observations,
    ) ||
    observations.length === 0
  ) {
    return null;
  }

  const latest =
    numberOrNull(
      observations[0]
        ?.value,
    );

  const previous =
    numberOrNull(
      observations[1]
        ?.value,
    );

  if (
    latest === null
  ) {
    return null;
  }

  const stressScore =
    clamp(
      Math.max(
        0,
        latest,
      ) /
        3,
      0,
      1,
    );

  return {
    stressScore:
      round(
        stressScore,
        4,
      ),

    indexValue:
      latest,

    trend:
      determineTrend({
        latest,
        previous,
        tolerance:
          0.05,
      }),

    period:
      observations[0]
        ?.date ??
      null,

    source:
      "FRED",

    series:
      COUNTRY_FRED_SERIES
        .FINANCIAL_STRESS,
  };
}

async function loadSupplementalData({
  asOfDate,
}) {
  const cacheKey =
    getCacheKey(
      asOfDate,
    );

  const cached =
    supplementalCache.get(
      cacheKey,
    );

  const now =
    Date.now();

  if (
    cached &&
    now -
      cached.cachedAt <
      CACHE_TTL_MS
  ) {
    return cached.value;
  }

  const results =
    await Promise.all([
      safeFetchSeries({
        name:
          "Broad U.S. dollar index",
        seriesId:
          COUNTRY_FRED_SERIES
            .BROAD_DOLLAR,
        asOfDate,
        limit:
          30,
      }),

      safeFetchSeries({
        name:
          "Federal debt to GDP",
        seriesId:
          COUNTRY_FRED_SERIES
            .DEBT_TO_GDP,
        asOfDate,
        limit:
          8,
      }),

      safeFetchSeries({
        name:
          "U.S. trade balance",
        seriesId:
          COUNTRY_FRED_SERIES
            .TRADE_BALANCE,
        asOfDate,
        limit:
          12,
      }),

      safeFetchSeries({
        name:
          "St. Louis Fed Financial Stress Index",
        seriesId:
          COUNTRY_FRED_SERIES
            .FINANCIAL_STRESS,
        asOfDate,
        limit:
          12,
      }),
    ]);

  const bySeries =
    Object.fromEntries(
      results.map(
        (result) => [
          result.seriesId,
          result,
        ],
      ),
    );

  const value = {
    currency:
      buildCurrency(
        bySeries[
          COUNTRY_FRED_SERIES
            .BROAD_DOLLAR
        ]?.observations ??
          [],
      ),

    fiscal:
      buildFiscal(
        bySeries[
          COUNTRY_FRED_SERIES
            .DEBT_TO_GDP
        ]?.observations ??
          [],
      ),

    trade:
      buildTrade(
        bySeries[
          COUNTRY_FRED_SERIES
            .TRADE_BALANCE
        ]?.observations ??
          [],
      ),

    banking:
      buildBanking(
        bySeries[
          COUNTRY_FRED_SERIES
            .FINANCIAL_STRESS
        ]?.observations ??
          [],
      ),

    warnings:
      results
        .filter(
          (result) =>
            result.warning,
        )
        .map(
          (result) =>
            result.warning,
        ),

    seriesStatus:
      Object.fromEntries(
        results.map(
          (result) => [
            result.name,
            {
              approved:
                result.approved,

              seriesId:
                result.seriesId,

              observationCount:
                result
                  .observations
                  .length,
            },
          ],
        ),
      ),
  };

  supplementalCache.set(
    cacheKey,
    {
      cachedAt:
        now,

      value,
    },
  );

  return value;
}

export async function getUSCountryRiskData({
  asOfDate = null,

  macroData = null,
} = {}) {
  const fetchedAt =
    new Date()
      .toISOString();

  try {
    let macro =
      macroData;

    const warnings = [];

    if (!macro) {
      const result =
        await getUSMacroData({
          asOfDate,
        });

      if (
        result.approved !== true ||
        !result.data
      ) {
        return {
          approved: false,

          provider:
            "US_COUNTRY_RISK",

          status:
            "INSUFFICIENT_DATA",

          country:
            "US",

          indicatorCount:
            0,

          data:
            null,

          warnings: [
            "Verified U.S. macro data was unavailable.",
            ...(
              result.warnings ??
              []
            ),
          ],

          errors:
            result.errors ??
            [],

          fetchedAt,
        };
      }

      macro =
        result.data;

      warnings.push(
        ...(
          result.warnings ??
          []
        ),
      );
    }

    const supplemental =
      await loadSupplementalData({
        asOfDate,
      });

    warnings.push(
      ...(
        supplemental
          .warnings ??
        []
      ),
    );

    const data = {
      country:
        "US",

      economicGrowth:
        macro.gdp
          ? {
              growth:
                macro.gdp
                  .growth,

              trend:
                macro.gdp
                  .trend,

              period:
                macro.gdp
                  .period ??
                null,

              source:
                "FRED",
            }
          : null,

      inflation:
        macro.inflation
          ? {
              rate:
                macro.inflation
                  .rate,

              target:
                macro.inflation
                  .target,

              trend:
                macro.inflation
                  .trend,

              period:
                macro.inflation
                  .period ??
                null,

              source:
                "FRED",
            }
          : null,

      interestRates:
        macro.policyRate
          ? {
              rate:
                macro.policyRate
                  .rate,

              trend:
                macro.policyRate
                  .trend,

              period:
                macro.policyRate
                  .period ??
                null,

              source:
                "FRED",
            }
          : null,

      credit:
        macro.creditConditions
          ? {
              state:
                macro
                  .creditConditions
                  .state,

              source:
                macro
                  .creditConditions
                  .source ??
                "FRED",
            }
          : null,

      consumer:
        buildConsumer({
          confidence:
            macro
              .consumerConfidence,

          spending:
            macro
              .consumerSpending,
        }),

      currency:
        supplemental
          .currency ??
        null,

      fiscal:
        supplemental
          .fiscal ??
        null,

      trade:
        supplemental
          .trade ??
        null,

      banking:
        supplemental
          .banking ??
        null,

      capitalFlows:
        null,

      sovereignRisk:
        null,

      political:
        null,

      source: {
        provider:
          "US_COUNTRY_RISK",

        macroProvider:
          "FRED",

        supplementalProvider:
          "FRED",

        asOfDate:
          asOfDate ??
          null,

        retrievedAt:
          fetchedAt,

        seriesStatus:
          supplemental
            .seriesStatus ??
          {},
      },
    };

    const connectedDimensions = {
      economicGrowth:
        data.economicGrowth,

      inflation:
        data.inflation,

      interestRates:
        data.interestRates,

      currency:
        data.currency,

      fiscal:
        data.fiscal,

      trade:
        data.trade,

      credit:
        data.credit,

      consumer:
        data.consumer,

      banking:
        data.banking,
    };

    const usableIndicators =
      Object.entries(
        connectedDimensions,
      )
        .filter(
          (
            [
              ,
              value,
            ],
          ) =>
            Boolean(value),
        )
        .map(
          (
            [
              name,
            ],
          ) =>
            name,
        );

    const missingIndicators =
      Object.entries(
        connectedDimensions,
      )
        .filter(
          (
            [
              ,
              value,
            ],
          ) =>
            !value,
        )
        .map(
          (
            [
              name,
            ],
          ) =>
            name,
        );

    if (
      usableIndicators.length === 0
    ) {
      return {
        approved: false,

        provider:
          "US_COUNTRY_RISK",

        status:
          "INSUFFICIENT_DATA",

        country:
          "US",

        indicatorCount:
          0,

        usableIndicators:
          [],

        missingIndicators,

        data:
          null,

        warnings: [
          "No verified country-risk indicators are available.",
          ...warnings,
        ],

        errors: [],

        fetchedAt,
      };
    }

    const expectedCount =
      Object.keys(
        connectedDimensions,
      ).length;

    warnings.push(
      "Capital flows, sovereign-risk scoring and political-risk scoring remain intentionally unconnected; null means unavailable, not neutral.",
    );

    return {
      approved: true,

      provider:
        "US_COUNTRY_RISK",

      status:
        usableIndicators.length ===
          expectedCount
          ? "READY"
          : "PARTIAL",

      country:
        "US",

      indicatorCount:
        usableIndicators.length,

      expectedConnectedIndicatorCount:
        expectedCount,

      coverage:
        round(
          usableIndicators.length /
            expectedCount,
          4,
        ),

      usableIndicators,

      missingIndicators,

      data,

      warnings: [
        ...new Set(
          warnings.filter(
            Boolean,
          ),
        ),
      ],

      errors: [],

      fetchedAt,
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "US_COUNTRY_RISK",

      status:
        "ERROR",

      country:
        "US",

      indicatorCount:
        0,

      usableIndicators:
        [],

      missingIndicators:
        [],

      data:
        null,

      warnings: [
        "U.S. country-risk data is unavailable.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      fetchedAt,
    };
  }
}

export default getUSCountryRiskData;
