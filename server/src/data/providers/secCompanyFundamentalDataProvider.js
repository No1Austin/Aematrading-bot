import axios from "axios";

/**
 * ============================================================
 * SEC COMPANY FUNDAMENTAL DATA PROVIDER
 * ============================================================
 *
 * SOURCE:
 * U.S. SEC EDGAR / data.sec.gov
 *
 * PURPOSE
 * -------
 *
 * Fetch official company financial statement facts and
 * normalize them for companyFundamentalEngine.js.
 *
 * Advantages:
 *
 * - Official source
 * - No API key required
 * - Point-in-time filing dates
 * - 10-K / 10-Q data
 * - XBRL normalized facts
 */

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const SEC_DATA_BASE_URL =
  "https://data.sec.gov";

const SEC_TICKER_URL =
  "https://www.sec.gov/files/company_tickers.json";

/**
 * SEC asks automated clients to identify themselves.
 *
 * Put this in .env:
 *
 * SEC_USER_AGENT="TradingBot your-email@example.com"
 */

function getUserAgent() {
  const value =
    process.env.SEC_USER_AGENT;

  if (!value) {
    throw new Error(
      "SEC_USER_AGENT is required. Example: TradingBot your-email@example.com",
    );
  }

  return value;
}

/**
 * ============================================================
 * CLIENT
 * ============================================================
 */

function createSecClient(
  baseURL,
) {
  return axios.create({
    baseURL,

    timeout: 30_000,

    headers: {
      "User-Agent":
        getUserAgent(),

      Accept:
        "application/json",

      "Accept-Encoding":
        "gzip, deflate",
    },
  });
}

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function normalizeSymbol(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

function numberOrNull(
  value,
) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : null;
}

function calculateGrowth(
  current,
  previous,
) {
  const a =
    numberOrNull(current);

  const b =
    numberOrNull(previous);

  if (
    a === null ||
    b === null ||
    b === 0
  ) {
    return null;
  }

  return (
    a - b
  ) /
    Math.abs(b);
}

function safeDivide(
  numerator,
  denominator,
) {
  const a =
    numberOrNull(
      numerator,
    );

  const b =
    numberOrNull(
      denominator,
    );

  if (
    a === null ||
    b === null ||
    b === 0
  ) {
    return null;
  }

  return a / b;
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
      ) * factor,
    ) / factor
  );
}

/**
 * ============================================================
 * CIK CACHE
 * ============================================================
 */

let tickerCache =
  null;

let tickerCacheTime =
  null;

const TICKER_CACHE_MS =
  24 *
  60 *
  60 *
  1000;

/**
 * ============================================================
 * LOAD TICKER DIRECTORY
 * ============================================================
 */

async function loadTickerDirectory() {
  if (
    tickerCache &&
    tickerCacheTime &&
    Date.now() -
      tickerCacheTime <
      TICKER_CACHE_MS
  ) {
    return tickerCache;
  }

  const client =
    createSecClient(
      "https://www.sec.gov",
    );

  const response =
    await client.get(
      "/files/company_tickers.json",
    );

  tickerCache =
    response.data;

  tickerCacheTime =
    Date.now();

  return tickerCache;
}

/**
 * ============================================================
 * RESOLVE SYMBOL → CIK
 * ============================================================
 */

export async function getCompanyCIK(
  symbol,
) {
  const normalized =
    normalizeSymbol(
      symbol,
    );

  const directory =
    await loadTickerDirectory();

  const companies =
    Object.values(
      directory ?? {},
    );

  const company =
    companies.find(
      (item) =>
        normalizeSymbol(
          item?.ticker,
        ) ===
        normalized,
    );

  if (!company) {
    return null;
  }

  return String(
    company.cik_str,
  ).padStart(
    10,
    "0",
  );
}

/**
 * ============================================================
 * COMPANY FACTS
 * ============================================================
 */

async function fetchCompanyFacts(
  cik,
) {
  const client =
    createSecClient(
      SEC_DATA_BASE_URL,
    );

  const response =
    await client.get(
      `/api/xbrl/companyfacts/CIK${cik}.json`,
    );

  return response.data;
}

/**
 * ============================================================
 * GET US-GAAP FACT
 * ============================================================
 */

function getFact(
  companyFacts,
  names,
) {
  const gaap =
    companyFacts
      ?.facts
      ?.["us-gaap"];

  if (!gaap) {
    return null;
  }

  for (
    const name
    of names
  ) {
    if (gaap[name]) {
      return gaap[name];
    }
  }

  return null;
}






/**
 * ============================================================
 * FACT PERIOD HELPERS
 * ============================================================
 *
 * SEC 10-Q facts may contain:
 *
 * - true quarterly values
 * - six-month cumulative values
 * - nine-month cumulative values
 *
 * We must not compare periods of different duration.
 */

function dateDiffDays(
  start,
  end,
) {
  if (
    !start ||
    !end
  ) {
    return null;
  }

  const startTime =
    new Date(
      start,
    ).getTime();

  const endTime =
    new Date(
      end,
    ).getTime();

  if (
    !Number.isFinite(
      startTime,
    ) ||
    !Number.isFinite(
      endTime,
    )
  ) {
    return null;
  }

  return Math.round(
    (
      endTime -
      startTime
    ) /
      (
        1000 *
        60 *
        60 *
        24
      ),
  );
}

function getFactDurationDays(
  item,
) {
  return dateDiffDays(
    item?.start,
    item?.end,
  );
}

/**
 * A normal fiscal quarter is approximately
 * 80–100 days.
 */

function isQuarterlyDuration(
  item,
) {
  const days =
    getFactDurationDays(
      item,
    );

  return (
    days !== null &&
    days >= 75 &&
    days <= 105
  );
}

/**
 * Annual periods are approximately one year.
 */

function isAnnualDuration(
  item,
) {
  const days =
    getFactDurationDays(
      item,
    );

  return (
    days !== null &&
    days >= 330 &&
    days <= 380
  );
}
/**
 * ============================================================
 * SELECT POINT-IN-TIME VALUES
 * ============================================================
 *
 * IMPORTANT:
 *
 * We use filed date, not only fiscal-period date.
 *
 * This prevents historical simulations from seeing
 * information before the company actually filed it.
 */

function getFiledValues({
  fact,

  asOfDate = null,

  forms = [
    "10-Q",
    "10-K",
  ],

  limit = 8,

  periodType =
    "ANY",
}) {
  if (!fact?.units) {
    return [];
  }

  const allUnits =
    Object.values(
      fact.units,
    ).flat();

  let values =
    allUnits.filter(
      (item) =>
        forms.includes(
          item.form,
        ) &&
        item.val !==
          undefined &&
        item.filed,
    );

  /**
   * ========================================================
   * POINT-IN-TIME PROTECTION
   * ========================================================
   */

  if (asOfDate) {
    const cutoff =
      new Date(
        asOfDate,
      ).getTime();

    values =
      values.filter(
        (item) =>
          new Date(
            item.filed,
          ).getTime() <=
          cutoff,
      );
  }

  /**
   * ========================================================
   * PERIOD TYPE
   * ========================================================
   *
   * Prevent:
   *
   * Q1 quarter
   * vs
   * 9-month cumulative period
   */

  if (
    periodType ===
    "QUARTER"
  ) {
    values =
      values.filter(
        isQuarterlyDuration,
      );
  }

  if (
    periodType ===
    "ANNUAL"
  ) {
    values =
      values.filter(
        isAnnualDuration,
      );
  }

  /**
   * Newest economic period first.
   *
   * Use period END first, filing date second.
   */

  values.sort(
    (a, b) => {
      const endDifference =
        new Date(
          b.end ??
          0,
        ).getTime() -
        new Date(
          a.end ??
          0,
        ).getTime();

      if (
        endDifference !==
        0
      ) {
        return endDifference;
      }

      return (
        new Date(
          b.filed ??
          0,
        ).getTime() -
        new Date(
          a.filed ??
          0,
        ).getTime()
      );
    },
  );

  /**
   * ========================================================
   * DEDUPLICATE
   * ========================================================
   *
   * Amendments can repeat the same economic period.
   */

  const deduplicated =
    new Map();

  for (
    const item
    of values
  ) {
    const key =
      [
        item.start ??
          "instant",

        item.end ??
          "unknown",

        item.fp ??
          "unknown",
      ].join("|");

    if (
      !deduplicated.has(
        key,
      )
    ) {
      deduplicated.set(
        key,
        item,
      );
    }
  }

  return [
    ...deduplicated.values(),
  ].slice(
    0,
    limit,
  );
}

/**
 * ============================================================
 * REVENUE
 * ============================================================
 */

function buildRevenue({
  companyFacts,
  asOfDate,
}) {
  const fact =
    getFact(
      companyFacts,
      [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "Revenues",
      ],
    );

  const values =
    getFiledValues({
      fact,

      asOfDate,

      forms: [
        "10-Q",
      ],

      periodType:
        "QUARTER",

      limit: 8,
    });

  if (
    values.length <
    2
  ) {
    return null;
  }

  const current =
    values[0]?.val;

  /**
   * Try year-over-year comparison.
   *
   * If enough quarters are available, compare q0 to q4.
   */

  const previous =
    values[4]?.val ??
    values[1]?.val;

  const growth =
    calculateGrowth(
      current,
      previous,
    );

  let acceleration =
    null;

  if (
    values.length >= 6
  ) {
    const previousGrowth =
      calculateGrowth(
        values[1]?.val,
        values[5]?.val,
      );

    if (
      growth !== null &&
      previousGrowth !== null
    ) {
      acceleration =
        growth -
        previousGrowth;
    }
  }

  return {
  growth:
    round(growth),

  acceleration:
    round(acceleration),

  latestValue:
    numberOrNull(
      current,
    ),

  periodEnd:
    values[0]?.end ??
    null,

  filedAt:
    values[0]?.filed ??
    null,
};
}

/**
 * ============================================================
 * NET INCOME
 * ============================================================
 */

function buildEarnings({
  companyFacts,
  asOfDate,
}) {
  const fact =
    getFact(
      companyFacts,
      [
        "NetIncomeLoss",
        "ProfitLoss",
      ],
    );

  const values =
    getFiledValues({
      fact,

      asOfDate,

      forms: [
        "10-Q",
      ],

      periodType:
        "QUARTER",

      limit: 8,
    });

  if (
    values.length <
    2
  ) {
    return null;
  }

  const current =
    values[0]?.val;

  const previous =
    values[4]?.val ??
    values[1]?.val;

  const growth =
    calculateGrowth(
      current,
      previous,
    );

  return {
    /**
     * Your existing engine calls this epsGrowth.
     *
     * Until we add diluted EPS facts separately,
     * this represents earnings growth.
     */

    epsGrowth:
      round(growth),

    filedAt:
      values[0]?.filed ??
      null,
  };
}

/**
 * ============================================================
 * OPERATING CASH FLOW
 * ============================================================
 */

function getOperatingCashFlow({
  companyFacts,
  asOfDate,
}) {
  const fact =
    getFact(
      companyFacts,
      [
        "NetCashProvidedByUsedInOperatingActivities",
      ],
    );

  return getFiledValues({
    fact,
    asOfDate,
    limit: 6,
  });
}

/**
 * ============================================================
 * CAPITAL EXPENDITURE
 * ============================================================
 */

function getCapitalExpenditure({
  companyFacts,
  asOfDate,
}) {
  const fact =
    getFact(
      companyFacts,
      [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsForProceedsFromOtherPropertyPlantAndEquipment",
      ],
    );

  return getFiledValues({
    fact,
    asOfDate,
    limit: 6,
  });
}

/**
 * ============================================================
 * FREE CASH FLOW
 * ============================================================
 */

function buildFreeCashFlow({
  companyFacts,
  asOfDate,
  revenue,
}) {
  const ocf =
    getOperatingCashFlow({
      companyFacts,
      asOfDate,
    });

  const capex =
    getCapitalExpenditure({
      companyFacts,
      asOfDate,
    });

  if (
    ocf.length === 0
  ) {
    return null;
  }

  const currentOCF =
    numberOrNull(
      ocf[0]?.val,
    );

  const currentCapex =
    numberOrNull(
      capex[0]?.val,
    ) ?? 0;

  if (
    currentOCF ===
    null
  ) {
    return null;
  }

  const currentFCF =
    currentOCF -
    Math.abs(
      currentCapex,
    );

  const previousOCF =
    numberOrNull(
      ocf[4]?.val ??
      ocf[1]?.val,
    );

  const previousCapex =
    numberOrNull(
      capex[4]?.val ??
      capex[1]?.val,
    ) ?? 0;

  const previousFCF =
    previousOCF !==
      null
      ? previousOCF -
        Math.abs(
          previousCapex,
        )
      : null;

  return {
  value:
    currentFCF,

  /**
   * SEC interim cash-flow statements are often
   * cumulative year-to-date values.
   *
   * Until we convert those cumulative values into
   * comparable individual quarters, do not calculate
   * either growth or margin.
   */

  growth: null,

  margin: null,

  filedAt:
    ocf[0]?.filed ??
    null,
};
}

/**
 * ============================================================
 * OPERATING CASH FLOW GROWTH
 * ============================================================
 */

function buildOperatingCashFlow({
  companyFacts,
  asOfDate,
}) {
  const values =
    getOperatingCashFlow({
      companyFacts,
      asOfDate,
    });

  if (
    values.length === 0
  ) {
    return null;
  }

  /**
   * SEC 10-Q cash-flow values are frequently
   * cumulative year-to-date.
   *
   * Returning a growth rate here without first
   * converting cumulative periods into comparable
   * quarterly periods could create false signals.
   */

  return null;
}

/**
 * ============================================================
 * MARGINS
 * ============================================================
 */
function buildMargins({
  companyFacts,
  asOfDate,
  revenue,
}) {
  if (
    !revenue?.latestValue
  ) {
    return null;
  }

  const operatingIncomeFact =
    getFact(
      companyFacts,
      [
        "OperatingIncomeLoss",
      ],
    );

  const netIncomeFact =
    getFact(
      companyFacts,
      [
        "NetIncomeLoss",
        "ProfitLoss",
      ],
    );

  const operatingValues =
    getFiledValues({
      fact:
        operatingIncomeFact,

      asOfDate,

      forms: [
        "10-Q",
      ],

      periodType:
        "QUARTER",

      limit: 8,
    });

  const netValues =
    getFiledValues({
      fact:
        netIncomeFact,

      asOfDate,

      forms: [
        "10-Q",
      ],

      periodType:
        "QUARTER",

      limit: 8,
    });

  /**
   * ========================================================
   * MATCH REVENUE PERIOD
   * ========================================================
   *
   * Prefer matching by fiscal period end date.
   *
   * Filing date alone is not sufficient because one
   * filing can contain several XBRL facts covering
   * different durations.
   */

  const revenueEnd =
    revenue?.periodEnd ??
    null;

  const revenueFiledAt =
    revenue?.filedAt ??
    null;

  const operatingCurrent =
    operatingValues.find(
      (item) =>
        revenueEnd &&
        item.end ===
          revenueEnd,
    ) ??
    operatingValues.find(
      (item) =>
        revenueFiledAt &&
        item.filed ===
          revenueFiledAt,
    ) ??
    operatingValues[0] ??
    null;

  const netCurrent =
    netValues.find(
      (item) =>
        revenueEnd &&
        item.end ===
          revenueEnd,
    ) ??
    netValues.find(
      (item) =>
        revenueFiledAt &&
        item.filed ===
          revenueFiledAt,
    ) ??
    netValues[0] ??
    null;

  /**
   * ========================================================
   * PERIOD INTEGRITY
   * ========================================================
   */

  if (
    revenueEnd &&
    operatingCurrent?.end &&
    operatingCurrent.end !==
      revenueEnd
  ) {
    return null;
  }

  if (
    revenueEnd &&
    netCurrent?.end &&
    netCurrent.end !==
      revenueEnd
  ) {
    return null;
  }

  const operatingMargin =
    safeDivide(
      operatingCurrent?.val,
      revenue.latestValue,
    );

  const netMargin =
    safeDivide(
      netCurrent?.val,
      revenue.latestValue,
    );

  if (
    operatingMargin ===
      null &&
    netMargin ===
      null
  ) {
    return null;
  }

  /**
   * ========================================================
   * SANITY GUARDRAILS
   * ========================================================
   *
   * Extreme margins usually indicate incompatible
   * XBRL periods or units.
   *
   * Fail safely instead of sending bad evidence into
   * the company engine.
   */

  const validOperatingMargin =
    operatingMargin !==
      null &&
    operatingMargin >=
      -2 &&
    operatingMargin <=
      2;

  const validNetMargin =
    netMargin !==
      null &&
    netMargin >=
      -2 &&
    netMargin <=
      2;

  if (
    !validOperatingMargin &&
    !validNetMargin
  ) {
    return null;
  }

  return {
    operatingMargin:
      validOperatingMargin
        ? round(
            operatingMargin,
          )
        : null,

    netMargin:
      validNetMargin
        ? round(
            netMargin,
          )
        : null,

    trend: null,

    periodEnd:
      revenueEnd,

    filedAt:
      revenueFiledAt,
  };
}
/**
 * ============================================================
 * DEBT
 * ============================================================
 */

function buildDebt({
  companyFacts,
  asOfDate,
}) {
  const debtFact =
    getFact(
      companyFacts,
      [
        "LongTermDebtAndFinanceLeaseObligationsCurrent",
        "LongTermDebtCurrent",
        "LongTermDebt",
      ],
    );

  const equityFact =
    getFact(
      companyFacts,
      [
        "StockholdersEquity",
      ],
    );

  const debt =
    getFiledValues({
      fact:
        debtFact,

      asOfDate,

      limit: 1,
    })[0]?.val;

  const equity =
    getFiledValues({
      fact:
        equityFact,

      asOfDate,

      limit: 1,
    })[0]?.val;

  const debtToEquity =
    safeDivide(
      debt,
      equity,
    );

  if (
    debtToEquity ===
    null
  ) {
    return null;
  }

  return {
    debtToEquity:
      round(
        debtToEquity,
      ),

    /**
     * Needs EBITDA calculation.
     */
    netDebtToEbitda:
      null,
  };
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getSecCompanyFundamentalData({
  symbol,
  asOfDate = null,
} = {}) {
  const normalizedSymbol =
    normalizeSymbol(
      symbol,
    );

  if (!normalizedSymbol) {
    return {
      approved: false,

      provider:
        "SEC_EDGAR",

      status:
        "INVALID_REQUEST",

      data: null,

      errors: [
        "Symbol is required.",
      ],

      warnings: [],
    };
  }

  try {
    const cik =
      await getCompanyCIK(
        normalizedSymbol,
      );

    if (!cik) {
      return {
        approved: false,

        provider:
          "SEC_EDGAR",

        status:
          "NOT_FOUND",

        symbol:
          normalizedSymbol,

        data: null,

        errors: [
          "Unable to resolve SEC CIK for symbol.",
        ],

        warnings: [],
      };
    }

    const companyFacts =
      await fetchCompanyFacts(
        cik,
      );

    const revenue =
      buildRevenue({
        companyFacts,
        asOfDate,
      });

    const earnings =
      buildEarnings({
        companyFacts,
        asOfDate,
      });

    const data = {
      symbol:
        normalizedSymbol,

      sector: null,

      countryCode:
        "US",

      revenue,

      earnings,

      freeCashFlow:
        buildFreeCashFlow({
          companyFacts,
          asOfDate,
          revenue,
        }),

      operatingCashFlow:
        buildOperatingCashFlow({
          companyFacts,
          asOfDate,
        }),

      margins:
        buildMargins({
          companyFacts,
          asOfDate,
          revenue,
        }),

      debt:
        buildDebt({
          companyFacts,
          asOfDate,
        }),

      /**
       * Add these later from appropriate facts/sources.
       */

      interestCoverage:
        null,

      earningsSurprise:
        null,

      guidance:
        null,

      valuation:
        null,

      sensitivity:
        null,

      source: {
        provider:
          "SEC_EDGAR",

        cik,

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
        data.revenue,
        data.earnings,
        data.freeCashFlow,
        data.operatingCashFlow,
        data.margins,
        data.debt,
      ].filter(Boolean);

    return {
      approved:
        indicators.length >
        0,

      provider:
        "SEC_EDGAR",

      status:
        indicators.length >
        0
          ? "COMPLETE"
          : "INSUFFICIENT_DATA",

      symbol:
        normalizedSymbol,

      cik,

      indicatorCount:
        indicators.length,

      data:
        indicators.length >
        0
          ? data
          : null,

      warnings:
        indicators.length <
        5
          ? [
              "Fewer than five SEC fundamental indicators were available.",
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
        "SEC_EDGAR",

      status:
        "ERROR",

      symbol:
        normalizedSymbol,

      data: null,

      warnings: [
        "SEC fundamental data unavailable. No company directional points should be awarded.",
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

export default getSecCompanyFundamentalData;