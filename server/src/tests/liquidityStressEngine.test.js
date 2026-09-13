// server/src/tests/liquidityStressEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import evaluateLiquidityStress
  from "../risk/liquidityStressEngine.js";

function trade(
  overrides = {},
) {
  return {
    symbol:
      "AAPL",

    side:
      "LONG",

    shares:
      1000,

    entryPrice:
      100,

    ...overrides,
  };
}

function healthyLiquidity(
  overrides = {},
) {
  return {
    bid:
      99.95,

    ask:
      100.05,

    currentVolume:
      1000000,

    averageVolume:
      2000000,

    estimatedSlippagePercent:
      0.10,

    ...overrides,
  };
}

describe(
  "Liquidity Stress Engine — Approval",
  () => {
    test(
      "approves healthy liquidity conditions",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity(),
          });

        expect(
          result.status,
        ).toBe(
          "APPROVED",
        );

        expect(
          result.canExecute,
        ).toBe(true);

        expect(
          result.approvedShares,
        ).toBe(
          1000,
        );
      },
    );
  },
);

describe(
  "Liquidity Stress Engine — Spread",
  () => {
    test(
      "reduces for elevated spread",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                bid:
                  99.8,

                ask:
                  100.2,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );
      },
    );

    test(
      "applies severe reduction for wide spread",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                bid:
                  99.6,

                ask:
                  100.4,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );

        expect(
          result.approvedShares,
        ).toBe(500);
      },
    );

    test(
      "blocks extreme spread",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                bid:
                  99,

                ask:
                  101,
              }),
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
  "Liquidity Stress Engine — Volume Participation",
  () => {
    test(
      "reduces when order is large relative to average volume",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade({
                shares:
                  20000,
              }),

            liquidity:
              healthyLiquidity({
                averageVolume:
                  1000000,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );
      },
    );

    test(
      "blocks extreme volume participation",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade({
                shares:
                  80000,
              }),

            liquidity:
              healthyLiquidity({
                averageVolume:
                  1000000,
              }),
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
  "Liquidity Stress Engine — Relative Volume",
  () => {
    test(
      "reduces when current relative volume is weak",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                currentVolume:
                  400000,

                averageVolume:
                  1000000,
              }),
          });

        expect(
          result.metrics
            .relativeVolume,
        ).toBe(0.4);

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );
      },
    );

    test(
      "blocks when relative volume is extremely low",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                currentVolume:
                  50000,

                averageVolume:
                  1000000,
              }),
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
  "Liquidity Stress Engine — Slippage",
  () => {
    test(
      "reduces when estimated slippage is elevated",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                estimatedSlippagePercent:
                  0.4,
              }),
          });

        expect(
          result.status,
        ).toBe(
          "REDUCED",
        );
      },
    );

    test(
      "blocks extreme estimated slippage",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                estimatedSlippagePercent:
                  1.5,
              }),
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
  "Liquidity Stress Engine — Missing Data",
  () => {
    test(
      "missing liquidity is not treated as healthy",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              {},
          });

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.canExecute,
        ).toBe(false);
      },
    );
  },
);

describe(
  "Liquidity Stress Engine — Safety",
  () => {
    test(
      "never increases shares",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade({
                shares:
                  73,
              }),

            liquidity:
              healthyLiquidity({
                estimatedSlippagePercent:
                  0.4,
              }),
          });

        expect(
          result.approvedShares,
        ).toBeLessThanOrEqual(
          73,
        );
      },
    );

    test(
      "applies same protection to SHORT trades",
      () => {
        const longResult =
          evaluateLiquidityStress({
            proposedTrade:
              trade({
                side:
                  "LONG",
              }),

            liquidity:
              healthyLiquidity({
                estimatedSlippagePercent:
                  0.7,
              }),
          });

        const shortResult =
          evaluateLiquidityStress({
            proposedTrade:
              trade({
                side:
                  "SHORT",
              }),

            liquidity:
              healthyLiquidity({
                estimatedSlippagePercent:
                  0.7,
              }),
          });

        expect(
          shortResult.status,
        ).toBe(
          longResult.status,
        );

        expect(
          shortResult
            .approvedShares,
        ).toBe(
          longResult
            .approvedShares,
        );
      },
    );

    test(
      "blocks when required reduction is below minimum executable exposure",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade(),

            liquidity:
              healthyLiquidity({
                estimatedSlippagePercent:
                  0.7,
              }),

            config: {
              severeMultiplier:
                0.1,

              minimumExposureMultiplier:
                0.2,
            },
          });

        expect(
          result.status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.approvedShares,
        ).toBe(0);
      },
    );
  },
);

describe(
  "Liquidity Stress Engine — Validation",
  () => {
    test(
      "missing proposed trade safely blocks",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              null,

            liquidity:
              healthyLiquidity(),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );
      },
    );

    test(
      "invalid side safely blocks",
      () => {
        const result =
          evaluateLiquidityStress({
            proposedTrade:
              trade({
                side:
                  "SIDEWAYS",
              }),

            liquidity:
              healthyLiquidity(),
          });

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );
      },
    );
  },
);

describe(
  "Liquidity Stress Engine — Determinism",
  () => {
    test(
      "same inputs produce same decision",
      () => {
        const input = {
          proposedTrade:
            trade(),

          liquidity:
            healthyLiquidity({
              bid:
                99.8,

              ask:
                100.2,

              estimatedSlippagePercent:
                0.4,
            }),
        };

        const first =
          evaluateLiquidityStress(
            input,
          );

        const second =
          evaluateLiquidityStress(
            input,
          );

        expect(
          second,
        ).toEqual(
          first,
        );
      },
    );
  },
);
