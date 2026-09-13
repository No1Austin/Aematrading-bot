import axios from "axios";

import getMarketauxNews
  from "./marketauxNewsProvider.js";

/**
 * ============================================================
 * REAL COMPANY FUNDAMENTAL DATA PROVIDER
 * ============================================================
 *
 * PROVIDERS:
 * Alpha Vantage + Marketaux classification enrichment
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

const REQUEST_SPACING_MS =
  Number(
    process.env
      .ALPHA_VANTAGE_REQUEST_SPACING_MS ??
    1200,
  );

const CACHE_TTL_MS =
  Number(
    process.env
      .ALPHA_VANTAGE_FUNDAMENTAL_CACHE_TTL_MS ??
    60 * 60 * 1000,
  );

const providerCache =
  new Map();

function sleep(
  milliseconds,
) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds,
      ),
  );
}

function getCachedResult(
  symbol,
) {
  const entry =
    providerCache.get(
      symbol,
    );

  if (!entry) {
    return null;
  }

  if (
    Date.now() -
      entry.cachedAt >
    CACHE_TTL_MS
  ) {
    providerCache.delete(
      symbol,
    );

    return null;
  }

  return structuredClone(
    entry.value,
  );
}

function setCachedResult(
  symbol,
  value,
) {
  providerCache.set(
    symbol,
    {
      cachedAt:
        Date.now(),

      value:
        structuredClone(
          value,
        ),
    },
  );
}

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
 * RATE-SAFE ENDPOINT FETCHING
 * ============================================================
 *
 * Alpha Vantage free plans can reject burst traffic.
 * We therefore:
 * - request endpoints sequentially
 * - wait between calls
 * - keep failures endpoint-local
 * - preserve partial evidence
 */

async function safeRequestFunction({
  functionName,
  symbol,
}) {
  try {
    const data =
      await requestFunction({
        functionName,
        symbol,
      });

    return {
      approved: true,
      functionName,
      data,
      error: null,
    };
  } catch (error) {
    return {
      approved: false,
      functionName,
      data: null,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}

async function fetchCompanyDatasets(
  symbol,
) {
  const definitions = [
    "OVERVIEW",
    "INCOME_STATEMENT",
    "BALANCE_SHEET",
    "CASH_FLOW",
    "EARNINGS",
  ];

  const results = {};

  for (
    let index = 0;
    index < definitions.length;
    index += 1
  ) {
    const functionName =
      definitions[index];

    const result =
      await safeRequestFunction({
        functionName,
        symbol,
      });

    results[functionName] =
      result;

    if (
      index <
      definitions.length - 1
    ) {
      await sleep(
        Math.max(
          0,
          REQUEST_SPACING_MS,
        ),
      );
    }
  }

  return results;
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

  if (
    capitalExpenditures ===
    null
  ) {
    return null;
  }

  const freeCashFlow =
    operatingCashFlow -
    Math.abs(
      capitalExpenditures,
    );

  const previousFCF =
    previousOperating !==
      null &&
    previousCapex !==
      null
      ? previousOperating -
        Math.abs(
          previousCapex,
        )
      : null;

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

  const grossProfit =
    numberOrNull(
      latest
        .grossProfit,
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

  const grossMargin =
    safeDivide(
      grossProfit,
      revenue,
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
    grossMargin ===
      null &&
    operatingMargin ===
      null &&
    netMargin === null
  ) {
    return null;
  }

  return {
    grossMargin:
      round(
        grossMargin,
      ),

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
    totalDebt !==
      null &&
    cash !==
      null
      ? totalDebt -
        cash
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
 * ALPHA / MARKETAUX FIELD COMPARISON
 * ============================================================
 *
 * Alpha Vantage remains authoritative for actual fundamental
 * metrics. Marketaux may fill only legitimate company identity
 * / classification gaps. Missing values remain null.
 */

function textOrNull(
  value,
) {
  const text =
    String(
      value ?? "",
    ).trim();

  return text ||
    null;
}

function normalizeComparableText(
  value,
) {
  const text =
    textOrNull(
      value,
    );

  return text
    ? text
        .replace(
          /[^A-Za-z0-9]/g,
          "",
        )
        .toUpperCase()
    : null;
}

function normalizeCountryCode(
  value,
) {
  const raw =
    textOrNull(
      value,
    );

  if (!raw) {
    return null;
  }

  const normalized =
    raw
      .replaceAll(
        ".",
        "",
      )
      .trim()
      .toUpperCase();

  if (
    [
      "US",
      "USA",
      "UNITED STATES",
      "UNITED STATES OF AMERICA",
    ].includes(
      normalized,
    )
  ) {
    return "US";
  }

  return normalized;
}

function compareTextSource({
  alphaValue,
  marketauxValue,
  normalize =
    normalizeComparableText,
} = {}) {
  const alpha =
    textOrNull(
      alphaValue,
    );

  const marketaux =
    textOrNull(
      marketauxValue,
    );

  const selectedSource =
    alpha !==
      null
      ? "ALPHA_VANTAGE"
      : marketaux !==
          null
        ? "MARKETAUX"
        : null;

  const selected =
    selectedSource ===
      "ALPHA_VANTAGE"
      ? alpha
      : selectedSource ===
          "MARKETAUX"
        ? marketaux
        : null;

  const normalizedAlpha =
    alpha !==
      null
      ? normalize(
          alpha,
        )
      : null;

  const normalizedMarketaux =
    marketaux !==
      null
      ? normalize(
          marketaux,
        )
      : null;

  return {
    alphaVantage:
      alpha,

    marketaux,

    selected,

    selectedSource,

    agreement:
      normalizedAlpha !==
        null &&
      normalizedMarketaux !==
        null
        ? normalizedAlpha ===
            normalizedMarketaux
        : null,
  };
}

function compareNumericSource({
  alphaValue,
  marketauxValue = null,
} = {}) {
  const alpha =
    numberOrNull(
      alphaValue,
    );

  const marketaux =
    numberOrNull(
      marketauxValue,
    );

  const selectedSource =
    alpha !==
      null
      ? "ALPHA_VANTAGE"
      : marketaux !==
          null
        ? "MARKETAUX"
        : null;

  const selected =
    selectedSource ===
      "ALPHA_VANTAGE"
      ? alpha
      : selectedSource ===
          "MARKETAUX"
        ? marketaux
        : null;

  return {
    alphaVantage:
      alpha,

    marketaux,

    selected,

    selectedSource,

    agreement:
      alpha !==
        null &&
      marketaux !==
        null
        ? Math.abs(
            alpha -
            marketaux,
          ) <=
          Math.max(
            Math.abs(
              alpha,
            ) *
              0.01,
            0.000001,
          )
        : null,
  };
}

function buildSourceComparison({
  metadata,
  marketauxProfile,
} = {}) {
  return {
    industry:
      compareTextSource({
        alphaValue:
          metadata
            ?.industry,

        marketauxValue:
          marketauxProfile
            ?.industry,
      }),

    country:
      compareTextSource({
        alphaValue:
          metadata
            ?.countryCode,

        marketauxValue:
          marketauxProfile
            ?.country,

        normalize:
          normalizeCountryCode,
      }),

    pe:
      compareNumericSource({
        alphaValue:
          metadata
            ?.peRatio,

        // Marketaux entity/news data does not provide P/E.
        marketauxValue:
          null,
      }),

    roe:
      compareNumericSource({
        alphaValue:
          metadata
            ?.returnOnEquity,

        // Marketaux entity/news data does not provide ROE.
        marketauxValue:
          null,
      }),
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

    trailingPE:
      numberOrNull(
        overview
          ?.TrailingPE,
      ),

    forwardPE:
      numberOrNull(
        overview
          ?.ForwardPE,
      ),

    pegRatio:
      numberOrNull(
        overview
          ?.PEGRatio,
      ),

    priceToBook:
      numberOrNull(
        overview
          ?.PriceToBookRatio,
      ),

    priceToSales:
      numberOrNull(
        overview
          ?.PriceToSalesRatioTTM,
      ),

    evToRevenue:
      numberOrNull(
        overview
          ?.EVToRevenue,
      ),

    evToEbitda:
      numberOrNull(
        overview
          ?.EVToEBITDA,
      ),

    dividendYield:
      numberOrNull(
        overview
          ?.DividendYield,
      ),

    returnOnEquity:
      numberOrNull(
        overview
          ?.ReturnOnEquityTTM,
      ),

    returnOnAssets:
      numberOrNull(
        overview
          ?.ReturnOnAssetsTTM,
      ),

    analystTargetPrice:
      numberOrNull(
        overview
          ?.AnalystTargetPrice,
      ),

    analystRatings: {
      strongBuy:
        numberOrNull(
          overview
            ?.AnalystRatingStrongBuy,
        ),

      buy:
        numberOrNull(
          overview
            ?.AnalystRatingBuy,
        ),

      hold:
        numberOrNull(
          overview
            ?.AnalystRatingHold,
        ),

      sell:
        numberOrNull(
          overview
            ?.AnalystRatingSell,
        ),

      strongSell:
        numberOrNull(
          overview
            ?.AnalystRatingStrongSell,
        ),
    },
  };
}

/**
 * ============================================================
 * VALUATION
 * ============================================================
 */

function buildValuation(
  overview,
) {
  const valuation = {
    pe:
      numberOrNull(
        overview
          ?.PERatio,
      ),

    trailingPE:
      numberOrNull(
        overview
          ?.TrailingPE,
      ),

    forwardPE:
      numberOrNull(
        overview
          ?.ForwardPE,
      ),

    peg:
      numberOrNull(
        overview
          ?.PEGRatio,
      ),

    priceToBook:
      numberOrNull(
        overview
          ?.PriceToBookRatio,
      ),

    priceToSales:
      numberOrNull(
        overview
          ?.PriceToSalesRatioTTM,
      ),

    evToRevenue:
      numberOrNull(
        overview
          ?.EVToRevenue,
      ),

    evToEbitda:
      numberOrNull(
        overview
          ?.EVToEBITDA,
      ),

    marketCapitalization:
      numberOrNull(
        overview
          ?.MarketCapitalization,
      ),

    dividendYield:
      numberOrNull(
        overview
          ?.DividendYield,
      ),
  };

  const hasValue =
    Object.values(
      valuation,
    )
      .some(
        value =>
          value !==
            null &&
          value !==
            undefined,
      );

  return hasValue
    ? valuation
    : null;
}

/**
 * ============================================================
 * PROFITABILITY / RETURNS
 * ============================================================
 */

function buildProfitability(
  overview,
) {
  const profitability = {
    roe:
      numberOrNull(
        overview
          ?.ReturnOnEquityTTM,
      ),

    roa:
      numberOrNull(
        overview
          ?.ReturnOnAssetsTTM,
      ),

    roic: null,
  };

  const hasValue =
    Object.values(
      profitability,
    )
      .some(
        value =>
          value !==
            null &&
          value !==
            undefined,
      );

  return hasValue
    ? profitability
    : null;
}

/**
 * ============================================================
 * BALANCE SHEET QUALITY
 * ============================================================
 */

function buildBalanceSheetQuality(
  balanceReports,
) {
  const latest =
    latestReports(
      balanceReports,
      1,
    )[0];

  if (!latest) {
    return null;
  }

  const currentAssets =
    numberOrNull(
      latest
        .totalCurrentAssets,
    );

  const currentLiabilities =
    numberOrNull(
      latest
        .totalCurrentLiabilities,
    );

  const inventory =
    numberOrNull(
      latest
        .inventory,
    );

  const currentRatio =
    safeDivide(
      currentAssets,
      currentLiabilities,
    );

  const quickAssets =
    currentAssets !==
      null &&
    inventory !==
      null
      ? currentAssets -
        inventory
      : null;

  const quickRatio =
    safeDivide(
      quickAssets,
      currentLiabilities,
    );

  if (
    currentRatio ===
      null &&
    quickRatio ===
      null
  ) {
    return null;
  }

  return {
    currentRatio:
      round(
        currentRatio,
      ),

    quickRatio:
      round(
        quickRatio,
      ),
  };
}

/**
 * ============================================================
 * CAPITAL ALLOCATION
 * ============================================================
 */

function buildCapitalAllocation({
  balanceReports,
  overview,
}) {
  const [
    latest,
    previous,
  ] =
    latestReports(
      balanceReports,
      2,
    );

  const currentShares =
    numberOrNull(
      latest
        ?.commonStockSharesOutstanding,
    ) ??
    numberOrNull(
      overview
        ?.SharesOutstanding,
    );

  const previousShares =
    numberOrNull(
      previous
        ?.commonStockSharesOutstanding,
    );

  const shareCountChange =
    calculateGrowth(
      currentShares,
      previousShares,
    );

  const dividendYield =
    numberOrNull(
      overview
        ?.DividendYield,
    );

  if (
    shareCountChange ===
      null &&
    dividendYield ===
      null
  ) {
    return null;
  }

  return {
    shareCountChange:
      round(
        shareCountChange,
      ),

    buybackYield:
      shareCountChange !==
        null &&
      shareCountChange <
        0
        ? round(
            Math.abs(
              shareCountChange,
            ),
          )
        : null,

    dividendYield:
      round(
        dividendYield,
      ),
  };
}

/**
 * ============================================================
 * FORWARD OUTLOOK
 * ============================================================
 *
 * Alpha Vantage OVERVIEW does not provide full forward revenue
 * and EPS growth estimates, but analyst ratings and target price
 * are useful raw context. We expose only observed values here.
 */

function buildForwardOutlook(
  overview,
) {
  const forward = {
    analystTargetPrice:
      numberOrNull(
        overview
          ?.AnalystTargetPrice,
      ),

    ratings: {
      strongBuy:
        numberOrNull(
          overview
            ?.AnalystRatingStrongBuy,
        ),

      buy:
        numberOrNull(
          overview
            ?.AnalystRatingBuy,
        ),

      hold:
        numberOrNull(
          overview
            ?.AnalystRatingHold,
        ),

      sell:
        numberOrNull(
          overview
            ?.AnalystRatingSell,
        ),

      strongSell:
        numberOrNull(
          overview
            ?.AnalystRatingStrongSell,
        ),
    },

    revenueGrowthEstimate:
      null,

    epsGrowthEstimate:
      null,

    estimateRevisionDirection:
      null,
  };

  const ratingValues =
    Object.values(
      forward.ratings,
    );

  const hasRatings =
    ratingValues.some(
      value =>
        value !==
          null &&
        value !==
          undefined,
    );

  const hasTarget =
    forward
      .analystTargetPrice !==
    null;

  return (
    hasRatings ||
    hasTarget
  )
    ? forward
    : null;
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

    const cached =
      getCachedResult(
        normalizedSymbol,
      );

    if (cached) {
      return {
        ...cached,

        cache: {
          hit: true,
          ttlMs:
            CACHE_TTL_MS,
        },

        fetchedAt:
          new Date()
            .toISOString(),
      };
    }

    const [
      endpointResults,
      marketauxResult,
    ] =
      await Promise.all([
        fetchCompanyDatasets(
          normalizedSymbol,
        ),

        getMarketauxNews({
          symbols: [
            normalizedSymbol,
          ],

          limit: 3,

          includeContent:
            false,
        }),
      ]);

    const marketauxProfile =
      marketauxResult
        ?.companyProfile ??
      marketauxResult
        ?.companyProfiles
        ?.[
          normalizedSymbol
        ] ??
      null;

    const overview =
      endpointResults
        .OVERVIEW
        ?.data ??
      null;

    const income =
      endpointResults
        .INCOME_STATEMENT
        ?.data ??
      null;

    const balance =
      endpointResults
        .BALANCE_SHEET
        ?.data ??
      null;

    const cashflow =
      endpointResults
        .CASH_FLOW
        ?.data ??
      null;

    const earnings =
      endpointResults
        .EARNINGS
        ?.data ??
      null;

    const endpointWarnings =
      Object.values(
        endpointResults,
      )
        .filter(
          result =>
            result?.approved !==
            true,
        )
        .map(
          result =>
            `${result.functionName} unavailable: ${result.error}`,
        );

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

    const sourceComparison =
      buildSourceComparison({
        metadata,
        marketauxProfile,
      });

    const data = {
      symbol:
        normalizedSymbol,

      sector:
        metadata.sector,

      industry:
        sourceComparison
          .industry
          .selected,

      countryCode:
        sourceComparison
          .country
          .selected,

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

      profitability:
        buildProfitability(
          overview,
        ),

      balanceSheet:
        buildBalanceSheetQuality(
          balanceReports,
        ),

      valuation:
        buildValuation(
          overview,
        ),

      capitalAllocation:
        buildCapitalAllocation({
          balanceReports,
          overview,
        }),

      forward:
        buildForwardOutlook(
          overview,
        ),

      /**
       * Guidance and economic sensitivity still require
       * separate reliable evidence. Unknown stays null.
       */
      guidance: null,

      sensitivity: null,

      sourceComparison,

      marketauxProfile,

      metadata: {
        ...metadata,

        industry:
          sourceComparison
            .industry
            .selected,

        countryCode:
          sourceComparison
            .country
            .selected,
      },

      source: {
        provider:
          "ALPHA_VANTAGE",

        retrievedAt:
          new Date()
            .toISOString(),

        marketaux: {
          approved:
            marketauxResult
              ?.approved ===
            true,

          status:
            marketauxResult
              ?.status ??
            null,

          articleCount:
            marketauxResult
              ?.count ??
            0,
        },
      },
    };

    const hasMarketauxClassification =
      [
        marketauxProfile
          ?.industry,
        marketauxProfile
          ?.country,
        marketauxProfile
          ?.name,
        marketauxProfile
          ?.exchange,
      ]
        .some(
          value =>
            textOrNull(
              value,
            ) !==
            null,
        );

    const evidenceFields = [
      data.revenue,
      data.earnings,
      data.freeCashFlow,
      data.operatingCashFlow,
      data.margins,
      data.debt,
      data.interestCoverage,
      data.earningsSurprise,
      data.profitability,
      data.balanceSheet,
      data.valuation,
      data.capitalAllocation,
      data.forward,
      data.guidance,
    ].filter(Boolean);

    if (
      evidenceFields.length ===
        0 &&
      !hasMarketauxClassification
    ) {
      return {
        approved: false,

        provider:
          "ALPHA_VANTAGE",

        status:
          "INSUFFICIENT_DATA",

        symbol:
          normalizedSymbol,

        indicatorCount: 0,

        data: null,

        cache: {
          hit: false,
          ttlMs:
            CACHE_TTL_MS,
        },

        endpointStatus:
          Object.fromEntries(
            Object.entries(
              endpointResults,
            ).map(
              (
                [
                  key,
                  value,
                ],
              ) => [
                key,
                {
                  approved:
                    value
                      ?.approved ===
                    true,

                  error:
                    value
                      ?.error ??
                    null,
                },
              ],
            ),
          ),

        errors: [],

        warnings: [
          "No usable fundamental indicators were returned.",
          ...endpointWarnings,
        ],

        fetchedAt:
          new Date()
            .toISOString(),
      };
    }

    const status =
      endpointWarnings.length >
        0 ||
      evidenceFields.length ===
        0
        ? "PARTIAL"
        : "COMPLETE";

    const result = {
      approved: true,

      provider:
        "ALPHA_VANTAGE",

      status,

      symbol:
        normalizedSymbol,

      indicatorCount:
        evidenceFields.length,

      data,

      cache: {
        hit: false,
        ttlMs:
          CACHE_TTL_MS,
      },

      endpointStatus:
        Object.fromEntries(
          Object.entries(
            endpointResults,
          ).map(
            (
              [
                key,
                value,
              ],
            ) => [
              key,
              {
                approved:
                  value
                    ?.approved ===
                  true,

                error:
                  value
                    ?.error ??
                  null,
              },
            ],
          ),
        ),

      providers: {
        alphaVantage: {
          approved:
            evidenceFields.length >
            0,

          endpointStatus:
            Object.fromEntries(
              Object.entries(
                endpointResults,
              ).map(
                (
                  [
                    key,
                    value,
                  ],
                ) => [
                  key,
                  {
                    approved:
                      value
                        ?.approved ===
                      true,

                    error:
                      value
                        ?.error ??
                      null,
                  },
                ],
              ),
            ),
        },

        marketaux: {
          approved:
            marketauxResult
              ?.approved ===
            true,

          status:
            marketauxResult
              ?.status ??
            null,

          articleCount:
            marketauxResult
              ?.count ??
            0,

          companyProfile:
            marketauxProfile,
        },
      },

      sourceComparison,

      warnings: [
        ...(evidenceFields.length <
          5
          ? [
              "Fewer than five fundamental indicators are available.",
            ]
          : []),

        ...(
          marketauxResult
            ?.approved ===
          true
            ? []
            : [
                `Marketaux classification unavailable: ${
                  marketauxResult
                    ?.errors
                    ?.[0] ??
                  marketauxResult
                    ?.warnings
                    ?.[0] ??
                  marketauxResult
                    ?.status ??
                  "UNKNOWN"
                }`,
              ]
        ),

        ...endpointWarnings,
      ],

      errors: [],

      fetchedAt:
        new Date()
          .toISOString(),
    };

    setCachedResult(
      normalizedSymbol,
      result,
    );

    return result;
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