import {
  describe,
  test,
  expect,
  vi,
} from "vitest";

import {
  createCompanyFundamentalAggregator,
  COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS,
} from "../data/providers/companyFundamentalAggregator.js";

const SYMBOL =
  "AAPL";

function providerResult({
  provider,
  data = null,
  approved =
    data !== null,
  status = null,
  indicatorCount = null,
  warnings = [],
  errors = [],
} = {}) {
  const count =
    indicatorCount ??
    (
      data &&
      typeof data ===
        "object"
        ? Object
            .entries(
              data,
            )
            .filter(
              ([
                key,
                value,
              ]) =>
                ![
                  "symbol",
                  "sector",
                  "industry",
                  "countryCode",
                  "source",
                ].includes(
                  key,
                ) &&
                value !==
                  null &&
                value !==
                  undefined,
            )
            .length
        : 0
    );

  return {
    approved,

    provider,

    status:
      status ??
      (
        approved
          ? "COMPLETE"
          : "INSUFFICIENT_DATA"
      ),

    symbol:
      SYMBOL,

    indicatorCount:
      count,

    data:
      approved
        ? data
        : null,

    warnings,

    errors,
  };
}

function secData(
  overrides = {},
) {
  return {
    symbol:
      SYMBOL,

    sector: null,

    countryCode:
      "US",

    revenue: {
      growth: 0.20,
      acceleration: 0.03,
    },

    earnings: {
      epsGrowth: 0.25,
    },

    freeCashFlow: {
      value:
        10_000_000,

      growth: null,

      margin: null,
    },

    operatingCashFlow:
      null,

    margins: {
      operatingMargin:
        0.25,

      netMargin:
        0.18,

      trend: null,
    },

    debt: {
      debtToEquity:
        0.40,

      netDebtToEbitda:
        null,
    },

    interestCoverage:
      null,

    earningsSurprise:
      null,

    guidance: null,

    valuation: null,

    sensitivity: null,

    ...overrides,
  };
}

function alphaData(
  overrides = {},
) {
  return {
    symbol:
      SYMBOL,

    sector:
      "TECHNOLOGY",

    industry:
      "CONSUMER ELECTRONICS",

    countryCode:
      "US",

    revenue: {
      growth: 0.18,
      acceleration: 0.02,
    },

    earnings: {
      epsGrowth: 0.22,
    },

    freeCashFlow: {
      value:
        9_500_000,

      growth:
        0.15,

      margin:
        0.20,
    },

    operatingCashFlow: {
      growth:
        0.12,
    },

    margins: {
      operatingMargin:
        0.24,

      netMargin:
        0.17,

      trend:
        0.01,
    },

    debt: {
      debtToEquity:
        0.45,

      netDebtToEbitda:
        0.80,
    },

    interestCoverage: {
      ratio: 12,
    },

    earningsSurprise: {
      percent:
        0.10,
    },

    guidance: null,

    valuation: null,

    sensitivity: null,

    ...overrides,
  };
}

function createHarness({
  secResult,
  alphaResult,
  secError = null,
  alphaError = null,
} = {}) {
  const secProvider =
    vi.fn(
      async () => {
        if (secError) {
          throw secError;
        }

        return (
          secResult ??
          providerResult({
            provider:
              "SEC_EDGAR",

            data:
              secData(),
          })
        );
      },
    );

  const alphaProvider =
    vi.fn(
      async () => {
        if (alphaError) {
          throw alphaError;
        }

        return (
          alphaResult ??
          providerResult({
            provider:
              "ALPHA_VANTAGE",

            data:
              alphaData(),
          })
        );
      },
    );

  return {
    secProvider,
    alphaProvider,

    aggregate:
      createCompanyFundamentalAggregator({
        secProvider,
        alphaProvider,
      }),
  };
}

describe(
  "Company Fundamental Aggregator — Basic Contract",
  () => {
    test(
      "fails closed when symbol is missing",
      async () => {
        const {
          aggregate,
          secProvider,
          alphaProvider,
        } =
          createHarness();

        const result =
          await aggregate();

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS
            .INVALID_REQUEST,
        );

        expect(
          result.data,
        ).toBeNull();

        expect(
          secProvider,
        ).not.toHaveBeenCalled();

        expect(
          alphaProvider,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "returns insufficient data when neither provider has approved evidence",
      async () => {
        const {
          aggregate,
        } =
          createHarness({
            secResult:
              providerResult({
                provider:
                  "SEC_EDGAR",

                approved:
                  false,
              }),

            alphaResult:
              providerResult({
                provider:
                  "ALPHA_VANTAGE",

                approved:
                  false,
              }),
          });

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          COMPANY_FUNDAMENTAL_AGGREGATOR_STATUS
            .INSUFFICIENT_DATA,
        );

        expect(
          result.indicatorCount,
        ).toBe(0);

        expect(
          result.data,
        ).toBeNull();
      },
    );
  },
);

describe(
  "Company Fundamental Aggregator — Source Priority",
  () => {
    test(
      "prefers SEC for filed revenue facts",
      async () => {
        const {
          aggregate,
        } =
          createHarness();

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.data
            .revenue
            .growth,
        ).toBe(0.20);

        expect(
          result.provenance
            .revenue
            .selectedProvider,
        ).toBe(
          "SEC_EDGAR",
        );
      },
    );

    test(
      "uses Alpha Vantage when SEC lacks a filed field",
      async () => {
        const {
          aggregate,
        } =
          createHarness({
            secResult:
              providerResult({
                provider:
                  "SEC_EDGAR",

                data:
                  secData({
                    operatingCashFlow:
                      null,
                  }),
              }),
          });

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.data
            .operatingCashFlow
            .growth,
        ).toBe(0.12);

        expect(
          result.provenance
            .operatingCashFlow
            .selectedProvider,
        ).toBe(
          "ALPHA_VANTAGE",
        );
      },
    );

    test(
      "prefers Alpha Vantage for earnings surprise and interest coverage",
      async () => {
        const {
          aggregate,
        } =
          createHarness();

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.data
            .earningsSurprise
            .percent,
        ).toBe(0.10);

        expect(
          result.data
            .interestCoverage
            .ratio,
        ).toBe(12);

        expect(
          result.provenance
            .earningsSurprise
            .selectedProvider,
        ).toBe(
          "ALPHA_VANTAGE",
        );

        expect(
          result.provenance
            .interestCoverage
            .selectedProvider,
        ).toBe(
          "ALPHA_VANTAGE",
        );
      },
    );
  },
);


describe(
  "Company Fundamental Aggregator — Metric Level Merge",
  () => {
    test(
      "fills missing SEC FCF growth and margin from Alpha without replacing SEC FCF value",
      async () => {
        const { aggregate } = createHarness();

        const result = await aggregate({
          symbol: SYMBOL,
        });

        expect(result.data.freeCashFlow.value)
          .toBe(10_000_000);
        expect(result.data.freeCashFlow.growth)
          .toBe(0.15);
        expect(result.data.freeCashFlow.margin)
          .toBe(0.20);

        expect(
          result.provenance.freeCashFlow.metricSources.value,
        ).toBe("SEC_EDGAR");
        expect(
          result.provenance.freeCashFlow.metricSources.growth,
        ).toBe("ALPHA_VANTAGE");
        expect(
          result.provenance.freeCashFlow.metricSources.margin,
        ).toBe("ALPHA_VANTAGE");
      },
    );

    test(
      "fills missing SEC margin trend and debt leverage submetrics from Alpha",
      async () => {
        const { aggregate } = createHarness();

        const result = await aggregate({ symbol: SYMBOL });

        expect(result.data.margins.operatingMargin).toBe(0.25);
        expect(result.data.margins.netMargin).toBe(0.18);
        expect(result.data.margins.trend).toBe(0.01);
        expect(result.data.debt.debtToEquity).toBe(0.40);
        expect(result.data.debt.netDebtToEbitda).toBe(0.80);
      },
    );

    test(
      "preserves a measured zero instead of treating it as missing",
      async () => {
        const { aggregate } = createHarness({
          secResult: providerResult({
            provider: "SEC_EDGAR",
            data: secData({
              freeCashFlow: {
                value: 10_000_000,
                growth: 0,
                margin: null,
              },
            }),
          }),
        });

        const result = await aggregate({ symbol: SYMBOL });

        expect(result.data.freeCashFlow.growth).toBe(0);
        expect(
          result.provenance.freeCashFlow.metricSources.growth,
        ).toBe("SEC_EDGAR");
      },
    );

    test(
      "metric-level enrichment improves coverage without fabricating unavailable values",
      async () => {
        const { aggregate } = createHarness();
        const result = await aggregate({ symbol: SYMBOL });

        expect(result.fundamentalCoverage.availableMetrics)
          .toEqual(expect.arrayContaining([
            "freeCashFlow.growth",
            "freeCashFlow.margin",
            "operatingCashFlow.growth",
            "debt.netDebtToEbitda",
            "interestCoverage.ratio",
            "earningsSurprise.percent",
          ]));

        expect(result.data.valuation).toBeNull();
        expect(result.data.guidance).toBeNull();
      },
    );
  },
);

describe(
  "Company Fundamental Aggregator — Provider Failure",
  () => {
    test(
      "Alpha failure does not invalidate valid SEC evidence",
      async () => {
        const {
          aggregate,
        } =
          createHarness({
            alphaError:
              new Error(
                "Alpha unavailable",
              ),
          });

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.data
            .revenue
            .growth,
        ).toBe(0.20);

        expect(
          result.providers
            .alphaVantage
            .approved,
        ).toBe(false);
      },
    );

    test(
      "SEC failure falls back to valid Alpha evidence",
      async () => {
        const {
          aggregate,
        } =
          createHarness({
            secError:
              new Error(
                "SEC unavailable",
              ),
          });

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.data
            .revenue
            .growth,
        ).toBe(0.18);

        expect(
          result.provenance
            .revenue
            .selectedProvider,
        ).toBe(
          "ALPHA_VANTAGE",
        );
      },
    );
  },
);

describe(
  "Company Fundamental Aggregator — Unit Contract",
  () => {
    test(
      "preserves decimal-ratio units without multiplying by one hundred",
      async () => {
        const {
          aggregate,
        } =
          createHarness();

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.data
            .revenue
            .growth,
        ).toBe(0.20);

        expect(
          result.data
            .earnings
            .epsGrowth,
        ).toBe(0.25);

        expect(
          result.data
            .earningsSurprise
            .percent,
        ).toBe(0.10);

        expect(
          result.data
            .margins
            .operatingMargin,
        ).toBe(0.25);
      },
    );
  },
);

describe(
  "Company Fundamental Aggregator — Conflict Detection",
  () => {
    test(
      "flags material source disagreement but retains preferred SEC value",
      async () => {
        const {
          aggregate,
        } =
          createHarness({
            alphaResult:
              providerResult({
                provider:
                  "ALPHA_VANTAGE",

                data:
                  alphaData({
                    revenue: {
                      growth:
                        -0.20,

                      acceleration:
                        -0.10,
                    },
                  }),
              }),
          });

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.data
            .revenue
            .growth,
        ).toBe(0.20);

        expect(
          result.provenance
            .revenue
            .conflict,
        ).toBe(true);

        expect(
          result.conflicts
            .length,
        ).toBeGreaterThan(0);

        expect(
          result.warnings
            .some(
              (warning) =>
                warning.includes(
                  "conflict",
                ),
            ),
        ).toBe(true);
      },
    );
  },
);

describe(
  "Company Fundamental Aggregator — Point In Time Safety",
  () => {
    test(
      "historical asOfDate skips current Alpha Vantage evidence by default",
      async () => {
        const {
          aggregate,
          secProvider,
          alphaProvider,
        } =
          createHarness();

        const result =
          await aggregate({
            symbol:
              SYMBOL,

            asOfDate:
              "2025-06-30T00:00:00.000Z",
          });

        expect(
          secProvider,
        ).toHaveBeenCalledTimes(1);

        expect(
          alphaProvider,
        ).not.toHaveBeenCalled();

        expect(
          result.providers
            .alphaVantage
            .status,
        ).toBe(
          "SKIPPED_POINT_IN_TIME_SAFETY",
        );

        expect(
          result.data
            .revenue
            .growth,
        ).toBe(0.20);
      },
    );

    test(
      "controlled research can explicitly permit current Alpha data for historical requests",
      async () => {
        const {
          aggregate,
          alphaProvider,
        } =
          createHarness();

        await aggregate({
          symbol:
            SYMBOL,

          asOfDate:
            "2025-06-30T00:00:00.000Z",

          allowCurrentAlphaForHistorical:
            true,
        });

        expect(
          alphaProvider,
        ).toHaveBeenCalledTimes(1);
      },
    );
  },
);

describe(
  "Company Fundamental Aggregator — Provenance",
  () => {
    test(
      "preserves field-level source provenance",
      async () => {
        const {
          aggregate,
        } =
          createHarness();

        const result =
          await aggregate({
            symbol:
              SYMBOL,
          });

        expect(
          result.provenance
            .revenue
            .availableProviders,
        ).toContain(
          "SEC_EDGAR",
        );

        expect(
          result.provenance
            .revenue
            .availableProviders,
        ).toContain(
          "ALPHA_VANTAGE",
        );

        expect(
          result.data
            .source
            .providersUsed,
        ).toEqual(
          expect.arrayContaining([
            "SEC_EDGAR",
            "ALPHA_VANTAGE",
          ]),
        );
      },
    );
  },
);
