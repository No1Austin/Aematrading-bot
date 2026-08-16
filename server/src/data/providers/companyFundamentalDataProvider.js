import axios from "axios";

/**
 * ============================================================
 * REAL COMPANY FUNDAMENTAL DATA PROVIDER
 * ============================================================
 *
 * PROVIDER:
 * Alpha Vantage
 *
 * PURPOSE
 * -------
 *
 * Fetch real company financial information and transform it
 * into the exact structure expected by:
 *
 * companyFundamentalEngine.js
 *
 * DATA SOURCES
 * ------------
 *
 * OVERVIEW
 * INCOME_STATEMENT
 * BALANCE_SHEET
 * CASH_FLOW
 * EARNINGS
 *
 * IMPORTANT
 * ---------
 *
 * This provider DOES NOT score companies.
 *
 * It only:
 *
 * - fetches
 * - validates
 * - calculates basic financial changes/ratios
 * - normalizes data
 *
 * companyFundamentalEngine.js remains responsible for
 * interpreting the data.
 */

const BASE_URL =
  "https://www.alphavantage.co/query";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  symbol,
) {
  return String(
    symbol ?? "",
  )
    .trim()
    .toUpperCase();
}

function numberOrNull(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === "None" ||
    value === "-"
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

function safeDivide(
  numerator,
  denominator,
) {
  const n =
    numberOrNull(
      numerator,
    );

  const d =
    numberOrNull(
      denominator,
    );

  if (
    n === null ||
    d === null ||
    d === 0
  ) {
    return null;
  }

  return n / d;
}

/**
 * Growth:
 *
 * current - previous
 * ------------------
 *      previous
 */

function calculateGrowth(
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
    currentValue -
    previousValue
  ) /
    Math.abs(
      previousValue,
    );
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
    ) / factor
  );
}

/**
 * ============================================================
 * API KEY
 * ============================================================
 */

function getApiKey() {
  const key =
    process.env
      .ALPHA_VANTAGE_API_KEY;

  if (!key) {
    throw new Error(
      "ALPHA_VANTAGE_API_KEY is required.",
    );
  }

  return key;
}

/**
 * ============================================================
 * API CLIENT
 * ============================================================
 */

async function requestFunction({
  functionName,
  symbol,
}) {
  const response =
    await axios.get(
      BASE_URL,
      {
        timeout: 30_000,

        params: {
          function:
            functionName,

          symbol,

          apikey:
            getApiKey(),
        },
      },
    );

  const data =
    response.data;

  /**
   * Alpha Vantage can return informational/rate messages
   * as JSON instead of normal data.
   */

  if (
    data?.["Error Message"]
  ) {
    throw new Error(
      data[
        "Error Message"
      ],
    );
  }

  if (data?.Note) {
    throw new Error(
      data.Note,
    );
  }

  if (
    data?.Information
  ) {
    throw new Error(
      data.Information,
    );
  }

  return data;
}

/**
 * ============================================================
 * REPORT HELPERS
 * ============================================================
 */

function latestReports(
  reports,
  count = 3,
) {
  if (
    !Array.isArray(
      reports,
    )
  ) {
    return [];
  }

  return reports
    .filter(Boolean)
    .sort(
      (a, b) =>
        new Date(
          b.fiscalDateEnding ??
          0,
        ).getTime() -
        new Date(
          a.fiscalDateEnding ??
          0,
        ).getTime(),
    )
    .slice(
      0,
      count,
    );
}

/**
 * ============================================================
 * REVENUE
 * ============================================================
 */

function buildRevenue(
  incomeReports,
) {
  const [
    latest,
    previous,
    older,
  ] =
    latestReports(
      incomeReports,
      3,
    );

  if (!latest) {
    return null;
  }

  const currentRevenue =
    numberOrNull(
      latest.totalRevenue,
    );

  const previousRevenue =
    numberOrNull(
      previous
        ?.totalRevenue,
    );

  const olderRevenue =
    numberOrNull(
      older
        ?.totalRevenue,
    );

  const growth =
    calculateGrowth(
      currentRevenue,
      previousRevenue,
    );

  const previousGrowth =
    calculateGrowth(
      previousRevenue,
      olderRevenue,
    );

  const acceleration =
    growth !== null &&
    previousGrowth !== null
      ? growth -
        previousGrowth
      : null;

  if (
    growth === null &&
    acceleration === null
  ) {
    return null;
  }

  return {
    growth:
      round(
        growth,
      ),

    acceleration:
      round(
        acceleration,
      ),

    currentRevenue,

    previousRevenue,
  };
}

/**
 * ============================================================
 * EARNINGS
 * ============================================================
 */

function buildEarnings(
  earningsData,
) {
  const quarterly =
    Array.isArray(
      earningsData
        ?.quarterlyEarnings,
    )
      ? earningsData
          .quarterlyEarnings
      : [];

  if (
    quarterly.length <
    2
  ) {
    return null;
  }

  const latest =
    quarterly[0];

  /**
   * Prefer year-over-year quarter comparison when available.
   */

  const sameQuarterLastYear =
    quarterly.length >= 5
      ? quarterly[4]
      : quarterly[1];

  const currentEPS =
    numberOrNull(
      latest.reportedEPS,
    );

  const previousEPS =
    numberOrNull(
      sameQuarterLastYear
        ?.reportedEPS,
    );

  const epsGrowth =
    calculateGrowth(
      currentEPS,
      previousEPS,
    );

  if (
    epsGrowth === null
  ) {
    return null;
  }

  return {
    epsGrowth:
      round(
        epsGrowth,
      ),

    currentEPS,

    previousEPS,
  };
}

/**
 * ============================================================
 * EARNINGS SURPRISE
 * ============================================================
 */

function buildEarningsSurprise(
  earningsData,
) {
  const latest =
    earningsData
      ?.quarterlyEarnings
      ?.[0];

  if (!latest) {
    return null;
  }

  const surprisePercent =
    numberOrNull(
      latest
        .surprisePercentage,
    );

  if (
    surprisePercent ===
    null
  ) {
    return null;
  }

  /**
   * API percentage → decimal.
   *
   * Example:
   *
   * 8.2%
   * becomes
   * 0.082
   */

  return {
    percent:
      round(
        surprisePercent /
          100,
      ),
  };
}

/**
 * ============================================================
 * FREE CASH FLOW
 * ============================================================
 */

function buildFreeCashFlow(
  cashflowReports,
  incomeReports,
) {
  const [
    latest,
    previous,
  ] =
    latestReports(
      cashflowReports,
      2,
    );

  const latestIncome =
    latestReports(
      incomeReports,
      1,
    )[0];

  if (!latest) {
    return null;
  }

  const operatingCashFlow =
    numberOrNull(
      latest
        .operatingCashflow,
    );

  const capitalExpenditures =
    numberOrNull(
      latest
        .capitalExpenditures,
    );

  const previousOperating =
    numberOrNull(
      previous
        ?.operatingCashflow,
    );

  const previousCapex =
    numberOrNull(
      previous
        ?.capitalExpenditures,
    );

  if (
    operatingCashFlow ===
    null
  ) {
    return null;
  }

  /**
   * Alpha Vantage capex can be reported as positive
   * or negative depending on mapping.
   *
   * Use absolute capex as cash consumed.
   */

  const freeCashFlow =
    capitalExpenditures !==
      null
      ? operatingCashFlow -
        Math.abs(
          capitalExpenditures,
        )
      : operatingCashFlow;

  let previousFCF =
    null;

  if (
    previousOperating !==
    null
  ) {
    previousFCF =
      previousCapex !==
        null
        ? previousOperating -
          Math.abs(
            previousCapex,
          )
        : previousOperating;
  }

  const growth =
    calculateGrowth(
      freeCashFlow,
      previousFCF,
    );

  const revenue =
    numberOrNull(
      latestIncome
        ?.totalRevenue,
    );

  const margin =
    safeDivide(
      freeCashFlow,
      revenue,
    );

  return {
    value:
      freeCashFlow,

    growth:
      round(
        growth,
      ),

    margin:
      round(
        margin,
      ),
  };
}

/**
 * ============================================================
 * OPERATING CASH FLOW
 * ============================================================
 */

function buildOperatingCashFlow(
  cashflowReports,
) {
  const [
    latest,
    previous,
  ] =
    latestReports(
      cashflowReports,
      2,
    );

  if (!latest) {
    return null;
  }

  const growth =
    calculateGrowth(
      latest
        .operatingCashflow,

      previous
        ?.operatingCashflow,
    );

  if (
    growth === null
  ) {
    return null;
  }

  return {
    growth:
      round(
        growth,
      ),
  };
}

/**
 * ============================================================
 * MARGINS
 * ============================================================
 */

function buildMargins(
  incomeReports,
) {
  const [
    latest,
    previous,
  ] =
    latestReports(
      incomeReports,
      2,
    );

  if (!latest) {
    return null;
  }

  const revenue =
    numberOrNull(
      latest.totalRevenue,
    );

  const operatingIncome =
    numberOrNull(
      latest
        .operatingIncome,
    );

  const netIncome =
    numberOrNull(
      latest.netIncome,
    );

  const previousRevenue =
    numberOrNull(
      previous
        ?.totalRevenue,
    );

  const previousOperating =
    numberOrNull(
      previous
        ?.operatingIncome,
    );

  const operatingMargin =
    safeDivide(
      operatingIncome,
      revenue,
    );

  const netMargin =
    safeDivide(
      netIncome,
      revenue,
    );

  const previousOperatingMargin =
    safeDivide(
      previousOperating,
      previousRevenue,
    );

  const trend =
    operatingMargin !==
      null &&
    previousOperatingMargin !==
      null
      ? operatingMargin -
        previousOperatingMargin
      : null;

  if (
    operatingMargin ===
      null &&
    netMargin === null
  ) {
    return null;
  }

  return {
    operatingMargin:
      round(
        operatingMargin,
      ),

    netMargin:
      round(
        netMargin,
      ),

    trend:
      round(
        trend,
      ),
  };
}

/**
 * ============================================================
 * DEBT
 * ============================================================
 */

function buildDebt(
  balanceReports,
  incomeReports,
) {
  const latestBalance =
    latestReports(
      balanceReports,
      1,
    )[0];

  const latestIncome =
    latestReports(
      incomeReports,
      1,
    )[0];

  if (!latestBalance) {
    return null;
  }

  const totalDebt =
    numberOrNull(
      latestBalance
        .shortLongTermDebtTotal ??
      latestBalance
        .longTermDebt,
    );

  const equity =
    numberOrNull(
      latestBalance
        .totalShareholderEquity,
    );

  const debtToEquity =
    safeDivide(
      totalDebt,
      equity,
    );

  /**
   * Approximate EBITDA when direct EBITDA is not supplied.
   */

  const ebitda =
    numberOrNull(
      latestIncome?.ebitda,
    );

  const cash =
    numberOrNull(
      latestBalance
        .cashAndCashEquivalentsAtCarryingValue,
    );

  const netDebt =
    totalDebt !== null
      ? totalDebt -
        (
          cash ?? 0
        )
      : null;

  const netDebtToEbitda =
    safeDivide(
      netDebt,
      ebitda,
    );

  if (
    debtToEquity ===
      null &&
    netDebtToEbitda ===
      null
  ) {
    return null;
  }

  return {
    debtToEquity:
      round(
        debtToEquity,
      ),

    netDebtToEbitda:
      round(
        netDebtToEbitda,
      ),
  };
}

/**
 * ============================================================
 * INTEREST COVERAGE
 * ============================================================
 */

function buildInterestCoverage(
  incomeReports,
) {
  const latest =
    latestReports(
      incomeReports,
      1,
    )[0];

  if (!latest) {
    return null;
  }

  const operatingIncome =
    numberOrNull(
      latest
        .operatingIncome,
    );

  const interestExpense =
    numberOrNull(
      latest
        .interestExpense,
    );

  if (
    operatingIncome ===
      null ||
    interestExpense ===
      null ||
    interestExpense === 0
  ) {
    return null;
  }

  return {
    ratio:
      round(
        Math.abs(
          operatingIncome /
          interestExpense,
        ),
      ),
  };
}

/**
 * ============================================================
 * COMPANY METADATA
 * ============================================================
 */

function buildCompanyMetadata(
  overview,
) {
  return {
    sector:
      overview?.Sector ??
      null,

    industry:
      overview?.Industry ??
      null,

    countryCode:
      overview?.Country ??
      null,

    marketCapitalization:
      numberOrNull(
        overview
          ?.MarketCapitalization,
      ),

    peRatio:
      numberOrNull(
        overview
          ?.PERatio,
      ),

    priceToBook:
      numberOrNull(
        overview
          ?.PriceToBookRatio,
      ),

    dividendYield:
      numberOrNull(
        overview
          ?.DividendYield,
      ),
  };
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getCompanyFundamentalData({
  symbol,
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (!normalizedSymbol) {
    return {
      approved: false,

      provider:
        "ALPHA_VANTAGE",

      status:
        "INVALID_REQUEST",

      symbol: null,

      data: null,

      errors: [
        "Symbol is required.",
      ],

      warnings: [],
    };
  }

  try {
    /**
     * Fetch all company datasets together.
     */

    const [
      overview,
      income,
      balance,
      cashflow,
      earnings,
    ] =
      await Promise.all([
        requestFunction({
          functionName:
            "OVERVIEW",

          symbol:
            normalizedSymbol,
        }),

        requestFunction({
          functionName:
            "INCOME_STATEMENT",

          symbol:
            normalizedSymbol,
        }),

        requestFunction({
          functionName:
            "BALANCE_SHEET",

          symbol:
            normalizedSymbol,
        }),

        requestFunction({
          functionName:
            "CASH_FLOW",

          symbol:
            normalizedSymbol,
        }),

        requestFunction({
          functionName:
            "EARNINGS",

          symbol:
            normalizedSymbol,
        }),
      ]);

    const incomeReports =
      income
        ?.quarterlyReports ??
      [];

    const balanceReports =
      balance
        ?.quarterlyReports ??
      [];

    const cashflowReports =
      cashflow
        ?.quarterlyReports ??
      [];

    const metadata =
      buildCompanyMetadata(
        overview,
      );

    const data = {
      symbol:
        normalizedSymbol,

      sector:
        metadata.sector,

      industry:
        metadata.industry,

      countryCode:
        metadata.countryCode,

      revenue:
        buildRevenue(
          incomeReports,
        ),

      earnings:
        buildEarnings(
          earnings,
        ),

      freeCashFlow:
        buildFreeCashFlow(
          cashflowReports,
          incomeReports,
        ),

      operatingCashFlow:
        buildOperatingCashFlow(
          cashflowReports,
        ),

      margins:
        buildMargins(
          incomeReports,
        ),

      debt:
        buildDebt(
          balanceReports,
          incomeReports,
        ),

      interestCoverage:
        buildInterestCoverage(
          incomeReports,
        ),

      earningsSurprise:
        buildEarningsSurprise(
          earnings,
        ),

      /**
       * We deliberately leave these null for now.
       *
       * Guidance requires another reliable source.
       * Valuation should eventually be peer-relative
       * rather than based on arbitrary absolute P/E thresholds.
       */

      guidance: null,

      valuation: null,

      sensitivity: null,

      metadata,

      source: {
        provider:
          "ALPHA_VANTAGE",

        retrievedAt:
          new Date()
            .toISOString(),
      },
    };

    const evidenceFields = [
      data.revenue,
      data.earnings,
      data.freeCashFlow,
      data.operatingCashFlow,
      data.margins,
      data.debt,
      data.interestCoverage,
      data.earningsSurprise,
    ].filter(Boolean);

    if (
      evidenceFields.length ===
      0
    ) {
      return {
        approved: false,

        provider:
          "ALPHA_VANTAGE",

        status:
          "INSUFFICIENT_DATA",

        symbol:
          normalizedSymbol,

        data: null,

        errors: [],

        warnings: [
          "No usable fundamental indicators were returned.",
        ],
      };
    }

    return {
      approved: true,

      provider:
        "ALPHA_VANTAGE",

      status:
        "COMPLETE",

      symbol:
        normalizedSymbol,

      indicatorCount:
        evidenceFields.length,

      data,

      warnings:
        evidenceFields.length <
          5
          ? [
              "Fewer than five fundamental indicators are available.",
            ]
          : [],

      errors: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved: false,

      provider:
        "ALPHA_VANTAGE",

      status:
        "ERROR",

      symbol:
        normalizedSymbol,

      data: null,

      warnings: [
        "Company fundamental data is unavailable. The company engine should not receive directional points from this provider.",
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

export default getCompanyFundamentalData;