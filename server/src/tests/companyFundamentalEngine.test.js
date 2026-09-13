import {
  describe,
  test,
  expect,
} from "vitest";

import {
  analyzeCompanyFundamentals,
} from "../analysis/companyFundamentalEngine.js";

/**
 * ============================================================
 * COMPANY FUNDAMENTAL ENGINE
 * UNIT CONTRACT TESTS
 * ============================================================
 *
 * IMPORTANT
 * ---------
 *
 * Provider percentage-like values use DECIMAL RATIOS.
 *
 * Examples:
 *
 *  20%  =>  0.20
 *  10%  =>  0.10
 *   5%  =>  0.05
 * -10%  => -0.10
 *
 * These tests intentionally protect that contract.
 */

const SYMBOL =
  "TEST";

function analyze(
  input = {},
) {
  return analyzeCompanyFundamentals({
    symbol:
      SYMBOL,

    ...input,
  });
}

function getEvidence(
  result,
  factor,
) {
  return (
    result
      ?.evidence
      ?.find(
        (item) =>
          item?.factor ===
          factor,
      ) ??
    null
  );
}

function expectFiniteScore(
  evidence,
) {
  expect(
    evidence,
  ).not.toBeNull();

  expect(
    Number.isFinite(
      evidence.score,
    ),
  ).toBe(true);
}

/**
 * ============================================================
 * BASIC ENGINE CONTRACT
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Basic Contract",
  () => {
    test(
      "fails closed when no usable fundamental evidence exists",
      () => {
        const result =
          analyze();

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.rawScore,
        ).toBeNull();

        expect(
          result.fundamentalScore,
        ).toBeNull();

        expect(
          result.evidence,
        ).toEqual([]);

        expect(
          result.directionalSupport,
        ).toEqual({
          long: null,
          short: null,
        });
      },
    );

    test(
      "reports a maximum fundamental allocation of thirty points",
      () => {
        const result =
          analyze();

        expect(
          result.maximumScore,
        ).toBe(30);
      },
    );
  },
);

/**
 * ============================================================
 * REVENUE
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Revenue Ratio Contract",
  () => {
    test(
      "interprets 0.20 as positive twenty percent revenue growth",
      () => {
        const result =
          analyze({
            revenue: {
              growth: 0.20,
            },
          });

        const evidence =
          getEvidence(
            result,
            "REVENUE_GROWTH",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "twenty percent revenue growth scores stronger than ten percent",
      () => {
        const twenty =
          getEvidence(
            analyze({
              revenue: {
                growth: 0.20,
              },
            }),
            "REVENUE_GROWTH",
          );

        const ten =
          getEvidence(
            analyze({
              revenue: {
                growth: 0.10,
              },
            }),
            "REVENUE_GROWTH",
          );

        expectFiniteScore(
          twenty,
        );

        expectFiniteScore(
          ten,
        );

        expect(
          twenty.score,
        ).toBeGreaterThan(
          ten.score,
        );
      },
    );

    test(
      "ten percent revenue growth scores stronger than five percent",
      () => {
        const ten =
          getEvidence(
            analyze({
              revenue: {
                growth: 0.10,
              },
            }),
            "REVENUE_GROWTH",
          );

        const five =
          getEvidence(
            analyze({
              revenue: {
                growth: 0.05,
              },
            }),
            "REVENUE_GROWTH",
          );

        expectFiniteScore(
          ten,
        );

        expectFiniteScore(
          five,
        );

        expect(
          ten.score,
        ).toBeGreaterThan(
          five.score,
        );
      },
    );

    test(
      "zero revenue growth does not receive positive evidence",
      () => {
        const evidence =
          getEvidence(
            analyze({
              revenue: {
                growth: 0,
              },
            }),
            "REVENUE_GROWTH",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeLessThanOrEqual(
          0,
        );
      },
    );

    test(
      "negative ten percent revenue growth is negative evidence",
      () => {
        const evidence =
          getEvidence(
            analyze({
              revenue: {
                growth: -0.10,
              },
            }),
            "REVENUE_GROWTH",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeLessThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * EARNINGS
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Earnings Ratio Contract",
  () => {
    test(
      "interprets 0.25 as positive twenty-five percent EPS growth",
      () => {
        const evidence =
          getEvidence(
            analyze({
              earnings: {
                epsGrowth: 0.25,
              },
            }),
            "EARNINGS_GROWTH",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "twenty-five percent EPS growth scores stronger than ten percent",
      () => {
        const strong =
          getEvidence(
            analyze({
              earnings: {
                epsGrowth: 0.25,
              },
            }),
            "EARNINGS_GROWTH",
          );

        const moderate =
          getEvidence(
            analyze({
              earnings: {
                epsGrowth: 0.10,
              },
            }),
            "EARNINGS_GROWTH",
          );

        expectFiniteScore(
          strong,
        );

        expectFiniteScore(
          moderate,
        );

        expect(
          strong.score,
        ).toBeGreaterThan(
          moderate.score,
        );
      },
    );

    test(
      "negative twenty percent EPS growth is negative evidence",
      () => {
        const evidence =
          getEvidence(
            analyze({
              earnings: {
                epsGrowth: -0.20,
              },
            }),
            "EARNINGS_GROWTH",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeLessThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * FREE CASH FLOW
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Free Cash Flow Ratio Contract",
  () => {
    test(
      "interprets 0.20 as twenty percent free cash flow growth",
      () => {
        const evidence =
          getEvidence(
            analyze({
              freeCashFlow: {
                value:
                  1_000_000,

                growth:
                  0.20,

                margin:
                  null,
              },
            }),
            "FREE_CASH_FLOW",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "interprets 0.20 as a twenty percent free cash flow margin",
      () => {
        const evidence =
          getEvidence(
            analyze({
              freeCashFlow: {
                value:
                  1_000_000,

                growth:
                  null,

                margin:
                  0.20,
              },
            }),
            "FREE_CASH_FLOW",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "positive free cash flow is stronger with twenty percent growth than zero growth",
      () => {
        const growing =
          getEvidence(
            analyze({
              freeCashFlow: {
                value:
                  1_000_000,

                growth:
                  0.20,

                margin:
                  0.10,
              },
            }),
            "FREE_CASH_FLOW",
          );

        const flat =
          getEvidence(
            analyze({
              freeCashFlow: {
                value:
                  1_000_000,

                growth:
                  0,

                margin:
                  0.10,
              },
            }),
            "FREE_CASH_FLOW",
          );

        expectFiniteScore(
          growing,
        );

        expectFiniteScore(
          flat,
        );

        expect(
          growing.score,
        ).toBeGreaterThan(
          flat.score,
        );
      },
    );
  },
);

/**
 * ============================================================
 * OPERATING CASH FLOW
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Operating Cash Flow Ratio Contract",
  () => {
    test(
      "interprets 0.15 as positive fifteen percent operating cash flow growth",
      () => {
        const evidence =
          getEvidence(
            analyze({
              operatingCashFlow: {
                growth: 0.15,
              },
            }),
            "OPERATING_CASH_FLOW",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "negative fifteen percent operating cash flow growth is negative evidence",
      () => {
        const evidence =
          getEvidence(
            analyze({
              operatingCashFlow: {
                growth: -0.15,
              },
            }),
            "OPERATING_CASH_FLOW",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeLessThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * MARGINS
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Margin Ratio Contract",
  () => {
    test(
      "interprets 0.25 as a twenty-five percent operating margin",
      () => {
        const evidence =
          getEvidence(
            analyze({
              margins: {
                operatingMargin:
                  0.25,

                netMargin:
                  null,

                trend:
                  null,
              },
            }),
            "MARGINS",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "twenty-five percent operating margin scores stronger than eight percent",
      () => {
        const strong =
          getEvidence(
            analyze({
              margins: {
                operatingMargin:
                  0.25,
              },
            }),
            "MARGINS",
          );

        const weak =
          getEvidence(
            analyze({
              margins: {
                operatingMargin:
                  0.08,
              },
            }),
            "MARGINS",
          );

        expectFiniteScore(
          strong,
        );

        expectFiniteScore(
          weak,
        );

        expect(
          strong.score,
        ).toBeGreaterThan(
          weak.score,
        );
      },
    );
  },
);

/**
 * ============================================================
 * EARNINGS SURPRISE
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Earnings Surprise Ratio Contract",
  () => {
    test(
      "interprets 0.10 as a positive ten percent earnings surprise",
      () => {
        const evidence =
          getEvidence(
            analyze({
              earningsSurprise: {
                percent: 0.10,
              },
            }),
            "EARNINGS_SURPRISE",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "ten percent positive surprise scores stronger than five percent",
      () => {
        const ten =
          getEvidence(
            analyze({
              earningsSurprise: {
                percent: 0.10,
              },
            }),
            "EARNINGS_SURPRISE",
          );

        const five =
          getEvidence(
            analyze({
              earningsSurprise: {
                percent: 0.05,
              },
            }),
            "EARNINGS_SURPRISE",
          );

        expectFiniteScore(
          ten,
        );

        expectFiniteScore(
          five,
        );

        expect(
          ten.score,
        ).toBeGreaterThan(
          five.score,
        );
      },
    );

    test(
      "negative ten percent earnings surprise is negative evidence",
      () => {
        const evidence =
          getEvidence(
            analyze({
              earningsSurprise: {
                percent: -0.10,
              },
            }),
            "EARNINGS_SURPRISE",
          );

        expectFiniteScore(
          evidence,
        );

        expect(
          evidence.score,
        ).toBeLessThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * MULTI-FACTOR CONTRACT
 * ============================================================
 */

describe(
  "Company Fundamental Engine — Multi Factor",
  () => {
    test(
      "strong decimal-ratio fundamentals produce positive directional support",
      () => {
        const result =
          analyze({
            revenue: {
              growth: 0.20,
            },

            earnings: {
              epsGrowth: 0.25,
            },

            freeCashFlow: {
              value:
                5_000_000,

              growth:
                0.20,

              margin:
                0.20,
            },

            operatingCashFlow: {
              growth: 0.15,
            },

            margins: {
              operatingMargin:
                0.25,

              netMargin:
                0.15,

              trend:
                0.02,
            },

            earningsSurprise: {
              percent: 0.10,
            },
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.rawScore,
        ).toBeGreaterThan(0);

        expect(
          result.directionalSupport
            .long,
        ).toBeGreaterThan(
          result.directionalSupport
            .short,
        );
      },
    );

    test(
      "fundamental engine never reports more than its thirty point allocation",
      () => {
        const result =
          analyze({
            revenue: {
              growth: 0.50,
              acceleration: 0.20,
            },

            earnings: {
              epsGrowth: 0.50,
            },

            freeCashFlow: {
              value:
                10_000_000,

              growth:
                0.50,

              margin:
                0.40,
            },

            operatingCashFlow: {
              growth: 0.40,
            },

            margins: {
              operatingMargin:
                0.40,

              netMargin:
                0.30,

              trend:
                0.10,
            },

            debt: {
              debtToEquity:
                0.10,

              netDebtToEbitda:
                0.20,
            },

            interestCoverage: {
              ratio: 20,
            },

            earningsSurprise: {
              percent: 0.20,
            },
          });

        expect(
          result.maximumScore,
        ).toBe(30);

        expect(
          result.rawScore,
        ).toBeLessThanOrEqual(
          1,
        );

        expect(
          result.fundamentalScore,
        ).toBeLessThanOrEqual(
          30,
        );
      },
    );
  },
);