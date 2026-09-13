// server/src/tests/correlationExposureEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import evaluateCorrelationExposure, {
  calculateCorrelation,
} from "../risk/correlationExposureEngine.js";

const candidateReturns = [
  0.010, 0.012, -0.004, 0.008, 0.015,
  -0.006, 0.011, 0.009, -0.003, 0.014,
  0.006, -0.005, 0.013, 0.007, 0.010,
  -0.002, 0.016, 0.005, 0.009, 0.012,
  -0.004, 0.011, 0.006, 0.014, -0.003,
  0.008, 0.013, -0.005, 0.010, 0.015,
];

const inverseReturns =
  candidateReturns.map(
    (value) => -value,
  );

const lowCorrelationReturns = [
  -0.004, 0.009, 0.003, -0.008, 0.006,
  0.011, -0.002, 0.004, -0.007, 0.005,
  0.001, 0.008, -0.006, 0.010, -0.003,
  0.007, 0.002, -0.009, 0.004, 0.006,
  -0.005, 0.003, 0.009, -0.002, 0.001,
  -0.007, 0.005, 0.002, -0.004, 0.008,
];

function account(overrides = {}) {
  return {
    equity: 100000,
    balance: 100000,
    ...overrides,
  };
}

function trade(overrides = {}) {
  return {
    symbol: "AAPL",
    side: "LONG",
    shares: 100,
    entryPrice: 100,
    returns: candidateReturns,
    ...overrides,
  };
}

function position({
  symbol = "MSFT",
  side = "LONG",
  shares = 100,
  currentPrice = 100,
  returns = candidateReturns,
} = {}) {
  return {
    symbol,
    side,
    shares,
    currentPrice,
    returns,
  };
}

describe(
  "Correlation Exposure Engine — Correlation Math",
  () => {
    test(
      "identical return series have correlation 1",
      () => {
        expect(
          calculateCorrelation(
            candidateReturns,
            candidateReturns,
            20,
          ),
        ).toBe(1);
      },
    );

    test(
      "inverse return series have correlation -1",
      () => {
        expect(
          calculateCorrelation(
            candidateReturns,
            inverseReturns,
            20,
          ),
        ).toBe(-1);
      },
    );

    test(
      "insufficient observations return null",
      () => {
        expect(
          calculateCorrelation(
            [0.01, 0.02],
            [0.01, 0.02],
            20,
          ),
        ).toBeNull();
      },
    );
  },
);

describe(
  "Correlation Exposure Engine — Validation",
  () => {
    test(
      "missing account safely blocks",
      () => {
        const result =
          evaluateCorrelationExposure({
            proposedTrade:
              trade(),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );

    test(
      "missing proposed trade safely blocks",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Correlation Exposure Engine — Approval",
  () => {
    test(
      "approves when there are no open positions",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade(),

            openPositions: [],
          });

        expect(
          result.status,
        ).toBe(
          "APPROVED",
        );

        expect(
          result.approvedShares,
        ).toBe(100);
      },
    );

    test(
      "approves diversified low-correlation exposure",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade(),

            openPositions: [
              position({
                returns:
                  lowCorrelationReturns,
              }),
            ],
          });

        expect(
          result.canExecute,
        ).toBe(true);

        expect(
          result.approvedShares,
        ).toBeLessThanOrEqual(
          100,
        );
      },
    );
  },
);

describe(
  "Correlation Exposure Engine — Reduction",
  () => {
    test(
      "reduces candidate correlated with too many positions",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade({
                shares: 200,
              }),

            openPositions: [
              position({
                symbol: "MSFT",
                shares: 50,
              }),

              position({
                symbol: "NVDA",
                shares: 50,
              }),

              position({
                symbol: "GOOGL",
                shares: 50,
              }),
            ],

            config: {
              blockWeightedCorrelation:
                1.01,
              hardCorrelatedExposurePercent:
                1,
            },
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBeLessThan(
          result.originalShares,
        );
      },
    );

    test(
      "correlation engine never increases shares",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade({
                shares: 73,
              }),

            openPositions: [
              position({
                returns:
                  candidateReturns,
              }),
            ],
          });

        expect(
          result.approvedShares,
        ).toBeLessThanOrEqual(
          73,
        );
      },
    );
  },
);

describe(
  "Correlation Exposure Engine — Blocking",
  () => {
    test(
      "blocks extreme correlated portfolio concentration",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade({
                shares: 100,
              }),

            openPositions: [
              position({
                symbol: "MSFT",
                shares: 250,
              }),

              position({
                symbol: "NVDA",
                shares: 250,
              }),
            ],
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.canExecute,
        ).toBe(false);

        expect(
          result.approvedShares,
        ).toBe(0);
      },
    );
  },
);

describe(
  "Correlation Exposure Engine — Missing Data",
  () => {
    test(
      "missing returns are not treated as zero correlation",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade(),

            openPositions: [
              position({
                returns: [],
              }),
            ],
          });

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.metrics
            .usableCorrelations,
        ).toBe(0);

        expect(
          result.warnings.length,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "partial coverage is reported explicitly",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade(),

            openPositions: [
              position({
                symbol: "MSFT",
                returns:
                  candidateReturns,
              }),

              position({
                symbol: "NVDA",
                returns: [],
              }),

              position({
                symbol: "GOOGL",
                returns: [],
              }),
            ],
          });

        expect(
          result.metrics.coverage,
        ).toBeCloseTo(
          1 / 3,
          5,
        );

        expect(
          result.warnings.length,
        ).toBeGreaterThan(0);
      },
    );
  },
);

describe(
  "Correlation Exposure Engine — Symmetry",
  () => {
    test(
      "SHORT candidates receive the same concentration protection",
      () => {
        const result =
          evaluateCorrelationExposure({
            account:
              account(),

            proposedTrade:
              trade({
                side: "SHORT",
              }),

            openPositions: [
              position({
                symbol: "MSFT",
                side: "SHORT",
                shares: 250,
              }),

              position({
                symbol: "NVDA",
                side: "SHORT",
                shares: 250,
              }),
            ],
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );
      },
    );
  },
);

describe(
  "Correlation Exposure Engine — Determinism",
  () => {
    test(
      "same inputs produce same decision",
      () => {
        const input = {
          account:
            account(),

          proposedTrade:
            trade(),

          openPositions: [
            position({
              returns:
                lowCorrelationReturns,
            }),
          ],
        };

        const first =
          evaluateCorrelationExposure(
            input,
          );

        const second =
          evaluateCorrelationExposure(
            input,
          );

        expect(
          second,
        ).toEqual(first);
      },
    );
  },
);
