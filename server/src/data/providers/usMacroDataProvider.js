import axios from "axios";

/**
 * ============================================================
 * U.S. MACRO DATA PROVIDER
 * ============================================================
 *
 * SOURCE
 * ------
 * FRED / Federal Reserve Bank of St. Louis
 *
 * PURPOSE
 * -------
 *
 * Supply real U.S. macroeconomic information to:
 *
 * src/analysis/macroRegimeEngine.js
 *
 * This provider DOES NOT decide whether to buy or sell.
 *
 * It only:
 *
 * - fetches economic data
 * - applies point-in-time filtering
 * - calculates growth / trends
 * - normalizes values
 * - fails safely
 */

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const FRED_BASE_URL =
  "https://api.stlouisfed.org/fred";

/**
 * Real macro series.
 */
export const FRED_SERIES =
  Object.freeze({
    /**
     * Consumer Price Index.
     */
    CPI:
      "CPIAUCSL",

    /**
     * Effective Federal Funds Rate.
     */
    POLICY_RATE:
      "FEDFUNDS",

    /**
     * Real GDP.
     */
    REAL_GDP:
      "GDPC1",

    /**
     * U.S. unemployment rate.
     */
    UNEMPLOYMENT:
      "UNRATE",

    /**
     * Total nonfarm payrolls.
     */
    EMPLOYMENT:
      "PAYEMS",

    /**
     * University of Michigan
     * Consumer Sentiment.
     */
    CONSUMER_CONFIDENCE:
      "UMCSENT",

    /**
     * Personal Consumption Expenditures.
     */
    CONSUMER_SPENDING:
      "PCE",

    /**
     * 10-year Treasury minus
     * 2-year Treasury spread.
     */
    YIELD_CURVE:
      "T10Y2Y",

    /**
     * Chicago Fed National
     * Financial Conditions Index.
     */
    FINANCIAL_CONDITIONS:
      "NFCI",

    /**
     * Federal Reserve total assets.
     *
     * Used as one measure of
     * system liquidity direction.
     */
    LIQUIDITY:
      "WALCL",
  });

export const DATA_TREND =
  Object.freeze({
    RISING:
      "RISING",

    FALLING:
      "FALLING",

    STABLE:
      "STABLE",

    UNKNOWN:
      "UNKNOWN",
  });

/**
 * ============================================================
 * CACHE
 * ============================================================
 *
 * Macro data does not need to be fetched on every
 * five-minute stock bar.
 */

const CACHE_TTL_MS =
  30 *
  60 *
  1000;

let currentCache =
  null;

let currentCacheTime =
  0;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

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

function round(
  value,
  decimals = 6,
) {
  if (
    !Number.isFinite(
      Number(value),
    )
  ) {
    return null;
  }

  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
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

function annualizedQuarterlyGrowth(
  current,
  previous,
) {
  const growth =
    percentChange(
      current,
      previous,
    );

  if (growth === null) {
    return null;
  }

  /**
   * Annualized quarterly rate:
   *
   * (1 + qoq)^4 - 1
   */

  return (
    Math.pow(
      1 + growth,
      4,
    ) -
    1
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
    return DATA_TREND.UNKNOWN;
  }

  const difference =
    a - b;

  if (
    Math.abs(
      difference,
    ) <= tolerance
  ) {
    return DATA_TREND.STABLE;
  }

  return difference > 0
    ? DATA_TREND.RISING
    : DATA_TREND.FALLING;
}

function latestValue(
  observations,
  offset = 0,
) {
  return (
    observations?.[offset]
      ?.value ??
    null
  );
}

function latestDate(
  observations,
) {
  return (
    observations?.[0]
      ?.date ??
    null
  );
}

/**
 * ============================================================
 * FRED HTTP CLIENT
 * ============================================================
 */

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

/**
 * ============================================================
 * FETCH SERIES
 * ============================================================
 */

async function fetchSeries({
  seriesId,

  asOfDate = null,

  limit = 24,
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

  /**
   * ========================================================
   * POINT-IN-TIME MODE
   * ========================================================
   *
   * observation_end prevents values dated after
   * the simulated date.
   *
   * realtime_start / realtime_end ask FRED for the
   * information associated with that real-time vintage.
   */

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
        item.value !==
        null,
    );
}

/**
 * ============================================================
 * INFLATION
 * ============================================================
 */

function buildInflation(
  observations,
) {
  if (
    observations.length <
    13
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const yearAgo =
    latestValue(
      observations,
      12,
    );

  const previousMonth =
    latestValue(
      observations,
      1,
    );

  const yoy =
    percentChange(
      latest,
      yearAgo,
    );

  return {
    rate:
      round(
        yoy !== null
          ? yoy * 100
          : null,
        3,
      ),

    target:
      2,

    trend:
      determineTrend({
        latest,

        previous:
          previousMonth,

        tolerance:
          0.01,
      }),

    latestIndex:
      latest,

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * POLICY RATE
 * ============================================================
 */

function buildPolicyRate(
  observations,
) {
  if (
    observations.length ===
    0
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  return {
    rate:
      latest,

    trend:
      determineTrend({
        latest,

        previous,

        tolerance:
          0.02,
      }),

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * GDP
 * ============================================================
 */

function buildGDP(
  observations,
) {
  if (
    observations.length <
    2
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  const older =
    latestValue(
      observations,
      2,
    );

  const growth =
    annualizedQuarterlyGrowth(
      latest,
      previous,
    );

  const previousGrowth =
    annualizedQuarterlyGrowth(
      previous,
      older,
    );

  return {
    growth:
      round(
        growth !== null
          ? growth * 100
          : null,
        3,
      ),

    trend:
      determineTrend({
        latest:
          growth,

        previous:
          previousGrowth,

        tolerance:
          0.002,
      }),

    level:
      latest,

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * UNEMPLOYMENT
 * ============================================================
 */

function buildUnemployment(
  observations,
) {
  if (
    observations.length ===
    0
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  return {
    rate:
      latest,

    trend:
      determineTrend({
        latest,

        previous,

        tolerance:
          0.05,
      }),

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * EMPLOYMENT
 * ============================================================
 */

function buildEmployment(
  observations,
) {
  if (
    observations.length <
    2
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  const older =
    latestValue(
      observations,
      2,
    );

  const growth =
    percentChange(
      latest,
      previous,
    );

  const previousGrowth =
    percentChange(
      previous,
      older,
    );

  return {
    growth:
      round(
        growth !== null
          ? growth * 100
          : null,
        4,
      ),

    trend:
      determineTrend({
        latest:
          growth,

        previous:
          previousGrowth,

        tolerance:
          0.0001,
      }),

    payrollLevel:
      latest,

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * CONSUMER CONFIDENCE
 * ============================================================
 */

function buildConsumerConfidence(
  observations,
) {
  if (
    observations.length ===
    0
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  return {
    value:
      latest,

    trend:
      determineTrend({
        latest,

        previous,

        tolerance:
          0.2,
      }),

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * CONSUMER SPENDING
 * ============================================================
 */

function buildConsumerSpending(
  observations,
) {
  if (
    observations.length <
    2
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  const older =
    latestValue(
      observations,
      2,
    );

  const growth =
    percentChange(
      latest,
      previous,
    );

  const previousGrowth =
    percentChange(
      previous,
      older,
    );

  return {
    growth:
      round(
        growth !== null
          ? growth * 100
          : null,
        4,
      ),

    trend:
      determineTrend({
        latest:
          growth,

        previous:
          previousGrowth,

        tolerance:
          0.0001,
      }),

    level:
      latest,

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * YIELD CURVE
 * ============================================================
 */

function buildYieldCurve(
  observations,
) {
  if (
    observations.length ===
    0
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  return {
    /**
     * FRED series already represents:
     *
     * 10Y Treasury - 2Y Treasury
     */
    spread:
      latest,

    trend:
      determineTrend({
        latest,

        previous,

        tolerance:
          0.02,
      }),

    inverted:
      latest < 0,

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * FINANCIAL CONDITIONS
 * ============================================================
 */

function buildFinancialConditions(
  observations,
) {
  if (
    observations.length ===
    0
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  return {
    index:
      latest,

    trend:
      determineTrend({
        latest,

        previous,

        tolerance:
          0.01,
      }),

    /**
     * NFCI convention:
     *
     * positive = tighter than average
     * negative = looser than average
     */
    state:
      latest > 0
        ? "TIGHT"
        : latest < 0
          ? "LOOSE"
          : "NORMAL",

    period:
      latestDate(
        observations,
      ),
  };
}

/**
 * ============================================================
 * CREDIT CONDITIONS
 * ============================================================
 *
 * For version one, derive a conservative state from
 * financial conditions rather than pretending we have a
 * separate credit-standard series.
 *
 * We can later replace this with Senior Loan Officer data.
 */

function buildCreditConditions(
  financialConditions,
) {
  if (
    !financialConditions
  ) {
    return null;
  }

  const index =
    numberOrNull(
      financialConditions
        .index,
    );

  const trend =
    financialConditions
      .trend;

  if (
    index === null
  ) {
    return null;
  }

  if (
    index > 0.5 ||
    (
      index > 0 &&
      trend ===
        DATA_TREND.RISING
    )
  ) {
    return {
      state:
        "TIGHTENING",

      source:
        "NFCI_PROXY",
    };
  }

  if (
    index < -0.5 ||
    (
      index < 0 &&
      trend ===
        DATA_TREND.FALLING
    )
  ) {
    return {
      state:
        "EASING",

      source:
        "NFCI_PROXY",
    };
  }

  return {
    state:
      "STABLE",

    source:
      "NFCI_PROXY",
  };
}

/**
 * ============================================================
 * SYSTEM LIQUIDITY
 * ============================================================
 */

function buildLiquidity(
  observations,
) {
  if (
    observations.length <
    2
  ) {
    return null;
  }

  const latest =
    latestValue(
      observations,
      0,
    );

  const previous =
    latestValue(
      observations,
      1,
    );

  return {
    trend:
      determineTrend({
        latest,

        previous,

        /**
         * WALCL is very large,
         * so use relative direction rather than
         * arbitrary absolute thresholds.
         */
        tolerance: 0,
      }),

    level:
      latest,

    period:
      latestDate(
        observations,
      ),

    source:
      "WALCL",
  };
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getUSMacroData({
  asOfDate = null,

  forceRefresh =
    false,
} = {}) {
  /**
   * Current/live cache only.
   *
   * Historical requests must remain point-in-time.
   */

  if (
    !asOfDate &&
    !forceRefresh &&
    currentCache &&
    Date.now() -
      currentCacheTime <
      CACHE_TTL_MS
  ) {
    return {
      ...currentCache,

      cached: true,
    };
  }

  try {
    const [
      cpi,
      policyRate,
      gdp,
      unemployment,
      employment,
      confidence,
      spending,
      yieldCurve,
      financialConditions,
      liquidity,
    ] =
      await Promise.all([
        fetchSeries({
          seriesId:
            FRED_SERIES.CPI,

          asOfDate,

          limit: 24,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .POLICY_RATE,

          asOfDate,

          limit: 12,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES.REAL_GDP,

          asOfDate,

          limit: 12,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .UNEMPLOYMENT,

          asOfDate,

          limit: 12,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .EMPLOYMENT,

          asOfDate,

          limit: 12,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .CONSUMER_CONFIDENCE,

          asOfDate,

          limit: 12,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .CONSUMER_SPENDING,

          asOfDate,

          limit: 12,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .YIELD_CURVE,

          asOfDate,

          limit: 20,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .FINANCIAL_CONDITIONS,

          asOfDate,

          limit: 12,
        }),

        fetchSeries({
          seriesId:
            FRED_SERIES
              .LIQUIDITY,

          asOfDate,

          limit: 12,
        }),
      ]);

    const financialConditionsData =
      buildFinancialConditions(
        financialConditions,
      );

    const data = {
      country:
        "US",

      inflation:
        buildInflation(
          cpi,
        ),

      policyRate:
        buildPolicyRate(
          policyRate,
        ),

      gdp:
        buildGDP(
          gdp,
        ),

      unemployment:
        buildUnemployment(
          unemployment,
        ),

      employment:
        buildEmployment(
          employment,
        ),

      consumerConfidence:
        buildConsumerConfidence(
          confidence,
        ),

      consumerSpending:
        buildConsumerSpending(
          spending,
        ),

      yieldCurve:
        buildYieldCurve(
          yieldCurve,
        ),

      financialConditions:
        financialConditionsData,

      creditConditions:
        buildCreditConditions(
          financialConditionsData,
        ),

      liquidity:
        buildLiquidity(
          liquidity,
        ),

      source: {
        provider:
          "FRED",

        asOfDate:
          asOfDate ??
          new Date()
            .toISOString(),

        retrievedAt:
          new Date()
            .toISOString(),
      },
    };

    const indicators =
      [
        data.inflation,
        data.policyRate,
        data.gdp,
        data.unemployment,
        data.employment,
        data.consumerConfidence,
        data.consumerSpending,
        data.yieldCurve,
        data.financialConditions,
        data.creditConditions,
        data.liquidity,
      ].filter(Boolean);

    if (
      indicators.length ===
      0
    ) {
      return {
        approved: false,

        provider:
          "FRED",

        status:
          "INSUFFICIENT_DATA",

        country:
          "US",

        indicatorCount: 0,

        data: null,

        warnings: [
          "No usable U.S. macroeconomic indicators were returned.",
        ],

        errors: [],

        fetchedAt:
          new Date()
            .toISOString(),
      };
    }

    const result = {
      approved: true,

      provider:
        "FRED",

      status:
        "COMPLETE",

      country:
        "US",

      indicatorCount:
        indicators.length,

      data,

      cached: false,

      warnings:
        indicators.length <
          5
          ? [
              "Macro analysis has fewer than five usable indicators.",
            ]
          : [],

      errors: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };

    if (!asOfDate) {
      currentCache =
        result;

      currentCacheTime =
        Date.now();
    }

    return result;
  } catch (error) {
    return {
      approved: false,

      provider:
        "FRED",

      status:
        "ERROR",

      country:
        "US",

      indicatorCount: 0,

      data: null,

      cached: false,

      warnings: [
        "U.S. macroeconomic data is unavailable. The macro engine should not receive directional points.",
      ],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  }
}

export default getUSMacroData;