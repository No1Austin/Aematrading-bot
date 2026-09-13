import {
  describe,
  test,
  expect,
} from "vitest";

import createTradeSetupFingerprint from
  "../history/tradeSetupFingerprint.js";

/**
 * ============================================================
 * TEST HELPERS
 * ============================================================
 */

function directional({
  long = 0.8,
  short = 0.2,
  approved = true,
  status = "COMPLETE",
} = {}) {
  return {
    approved,
    status,

    directionalSupport: {
      long,
      short,
    },
  };
}

function technical({
  long = 0.8,
  short = 0.2,
  trend = "BULLISH",
  bias = "LONG",
  rsi = 62,
  atrPercent = 0.018,
  volumeRatio = 1.4,
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",

    directionalSupport: {
      long,
      short,
    },

    trend: {
      direction:
        trend,
    },

    bias: {
      direction:
        bias,
    },

    indicators: {
      rsi: {
        value:
          rsi,
      },

      macd: {
        analysis: {
          direction:
            bias,
        },
      },

      atr: {
        percent:
          atrPercent,
      },

      volume: {
        volumeRatio,
      },
    },

    confirmation: {
      aboveVWAP:
        bias === "LONG",

      belowVWAP:
        bias === "SHORT",
    },
  };
}

function liquidity({
  qualityScore = 0.9,
  spreadPercent = 0.001,
  averageDailyVolume = 5_000_000,
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",

    qualityScore,
    spreadPercent,
    averageDailyVolume,
  };
}

function riskReward({
  long = 0.85,
  short = 0.15,
  rewardRiskRatio = 3,
} = {}) {
  return {
    approved: true,
    status: "COMPLETE",

    directionalSupport: {
      long,
      short,
    },

    rewardRiskRatio,
  };
}

function scoring({
  preferredSide = "LONG",
  preferredScore = 90,
  longScore = 90,
  shortScore = 20,
} = {}) {
  return {
    approved: true,
    status: "TRADE_CANDIDATE",

    preferredSide,
    preferredScore,

    long: {
      score:
        longScore,
    },

    short: {
      score:
        shortScore,
    },
  };
}

function decisionGate({
  side = "LONG",
  score = 90,
  canProceedToRiskManager = true,
} = {}) {
  return {
    approved: true,

    side,
    score,

    canProceedToRiskManager,
  };
}

function buildFullInput({
  symbol = "AAPL",
  side = "LONG",
  asOfTimestamp =
    "2026-08-22T18:00:00.000Z",
} = {}) {
  const long =
    side === "LONG"
      ? 0.9
      : 0.1;

  const short =
    side === "SHORT"
      ? 0.9
      : 0.1;

  return {
    symbol,
    side,

    technical:
      technical({
        long,
        short,

        trend:
          side === "LONG"
            ? "BULLISH"
            : "BEARISH",

        bias:
          side,
      }),

    macro:
      directional({
        long,
        short,
      }),

    marketRegime:
      directional({
        long,
        short,
      }),

    events:
      directional({
        long,
        short,
      }),

    company:
      directional({
        long,
        short,
      }),

    country:
      directional({
        long,
        short,
      }),

    social:
      directional({
        long,
        short,
      }),

    historical:
      directional({
        long,
        short,
      }),

    liquidity:
      liquidity(),

    riskReward:
      riskReward({
        long,
        short,
      }),

    consensus:
      directional({
        long,
        short,
      }),

    scoring:
      scoring({
        preferredSide:
          side,

        preferredScore: 92,

        longScore:
          side === "LONG"
            ? 92
            : 8,

        shortScore:
          side === "SHORT"
            ? 92
            : 8,
      }),

    decisionGate:
      decisionGate({
        side,
        score: 92,
      }),

    entryPrice: 100,
    stopPrice:
      side === "LONG"
        ? 98
        : 102,

    targetPrice:
      side === "LONG"
        ? 106
        : 94,

    asOfTimestamp,
  };
}

/**
 * ============================================================
 * BASIC VALIDATION
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — Validation",
  () => {
    test(
      "rejects missing symbol",
      () => {
        const result =
          createTradeSetupFingerprint({
            side: "LONG",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INVALID_INPUT",
        );

        expect(
          result.fingerprint,
        ).toBeNull();

        expect(
          result.errors.length,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "rejects invalid side",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",
            side: "BUY",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.errors,
        ).toContain(
          "Trade side must be LONG or SHORT.",
        );
      },
    );

    test(
      "accepts lowercase side and normalizes it",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "aapl",
            side: "long",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.fingerprint.side,
        ).toBe("LONG");

        expect(
          result.fingerprint.symbol,
        ).toBe("AAPL");
      },
    );
  },
);

/**
 * ============================================================
 * COMPLETE LONG FINGERPRINT
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — LONG",
  () => {
    test(
      "creates a complete normalized LONG fingerprint",
      () => {
        const result =
          createTradeSetupFingerprint(
            buildFullInput({
              side: "LONG",
            }),
          );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe("COMPLETE");

        expect(
          result.fingerprint.version,
        ).toBe(1);

        expect(
          result.fingerprint.symbol,
        ).toBe("AAPL");

        expect(
          result.fingerprint.side,
        ).toBe("LONG");

        expect(
          result.fingerprint
            .technical
            .alignedSupport,
        ).toBe(0.9);

        expect(
          result.fingerprint
            .technical
            .oppositeSupport,
        ).toBe(0.1);

        expect(
          result.fingerprint
            .technical
            .trend,
        ).toBe("BULLISH");

        expect(
          result.fingerprint
            .technical
            .bias,
        ).toBe("LONG");

        expect(
          result.fingerprint
            .priceGeometry
            .entryPrice,
        ).toBe(100);

        expect(
          result.fingerprint
            .priceGeometry
            .stopPrice,
        ).toBe(98);

        expect(
          result.fingerprint
            .priceGeometry
            .targetPrice,
        ).toBe(106);

        expect(
          result.coverage,
        ).toBe(1);

        expect(
          result.missingEngines,
        ).toHaveLength(0);
      },
    );
  },
);

/**
 * ============================================================
 * COMPLETE SHORT FINGERPRINT
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — SHORT",
  () => {
    test(
      "correctly flips aligned and opposite support for SHORT",
      () => {
        const result =
          createTradeSetupFingerprint(
            buildFullInput({
              side: "SHORT",
            }),
          );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.fingerprint.side,
        ).toBe("SHORT");

        expect(
          result.fingerprint
            .technical
            .alignedSupport,
        ).toBe(0.9);

        expect(
          result.fingerprint
            .technical
            .oppositeSupport,
        ).toBe(0.1);

        expect(
          result.fingerprint
            .technical
            .trend,
        ).toBe("BEARISH");

        expect(
          result.fingerprint
            .technical
            .bias,
        ).toBe("SHORT");

        expect(
          result.fingerprint
            .priceGeometry
            .stopPrice,
        ).toBe(102);

        expect(
          result.fingerprint
            .priceGeometry
            .targetPrice,
        ).toBe(94);
      },
    );
  },
);

/**
 * ============================================================
 * DETERMINISM
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — Determinism",
  () => {
    test(
      "identical setup produces identical fingerprint",
      () => {
        const input =
          buildFullInput({
            symbol: "MSFT",
            side: "LONG",
            asOfTimestamp:
              "2026-08-22T18:00:00.000Z",
          });

        const first =
          createTradeSetupFingerprint(
            input,
          );

        const second =
          createTradeSetupFingerprint(
            input,
          );

        expect(
          first.approved,
        ).toBe(true);

        expect(
          second.approved,
        ).toBe(true);

        expect(
          first.fingerprint,
        ).toEqual(
          second.fingerprint,
        );
      },
    );

    test(
      "different timestamp changes only point-in-time identity",
      () => {
        const first =
          createTradeSetupFingerprint(
            buildFullInput({
              asOfTimestamp:
                "2026-08-22T18:00:00.000Z",
            }),
          );

        const second =
          createTradeSetupFingerprint(
            buildFullInput({
              asOfTimestamp:
                "2026-08-22T18:05:00.000Z",
            }),
          );

        expect(
          first.fingerprint
            .asOfTimestamp,
        ).not.toBe(
          second.fingerprint
            .asOfTimestamp,
        );

        const {
          asOfTimestamp:
            firstTimestamp,
          ...firstComparable
        } =
          first.fingerprint;

        const {
          asOfTimestamp:
            secondTimestamp,
          ...secondComparable
        } =
          second.fingerprint;

        expect(
          firstComparable,
        ).toEqual(
          secondComparable,
        );

        expect(
          firstTimestamp,
        ).toBeTruthy();

        expect(
          secondTimestamp,
        ).toBeTruthy();
      },
    );
  },
);

/**
 * ============================================================
 * MISSING DATA SAFETY
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — Missing Data",
  () => {
    test(
      "allows non-critical engine data to be missing",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",

            side: "LONG",

            technical:
              technical(),

            entryPrice: 100,

            stopPrice: 98,

            targetPrice: 106,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe("COMPLETE");

        expect(
          result.coverage,
        ).toBeGreaterThan(0);

        expect(
          result.coverage,
        ).toBeLessThan(1);

        expect(
          result.missingEngines
            .length,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "returns low coverage warning when too much data is missing",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",
            side: "LONG",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.coverage,
        ).toBe(0);

        expect(
          result.warnings,
        ).toContain(
          "Trade setup fingerprint has low engine coverage.",
        );
      },
    );
  },
);

/**
 * ============================================================
 * NUMERIC NORMALIZATION
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — Numeric Normalization",
  () => {
    test(
      "clamps directional support into 0 to 1 range",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",

            side: "LONG",

            technical:
              technical({
                long: 1.5,
                short: -0.25,
              }),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.fingerprint
            .technical
            .alignedSupport,
        ).toBe(1);

        expect(
          result.fingerprint
            .technical
            .oppositeSupport,
        ).toBe(0);
      },
    );

    test(
      "preserves null instead of converting it to zero",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",
            side: "LONG",

            technical: {
              approved: true,
              status: "COMPLETE",

              directionalSupport: {
                long: null,
                short: null,
              },
            },

            entryPrice: null,
            stopPrice: null,
            targetPrice: null,
          });

        expect(
          result.fingerprint
            .technical
            .alignedSupport,
        ).toBeNull();

        expect(
          result.fingerprint
            .priceGeometry
            .entryPrice,
        ).toBeNull();

        expect(
          result.fingerprint
            .priceGeometry
            .stopPrice,
        ).toBeNull();

        expect(
          result.fingerprint
            .priceGeometry
            .targetPrice,
        ).toBeNull();
      },
    );
  },
);

/**
 * ============================================================
 * SCORING NORMALIZATION
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — Scoring",
  () => {
    test(
      "stores aligned score and score gap for LONG",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",
            side: "LONG",

            scoring:
              scoring({
                preferredSide:
                  "LONG",

                preferredScore:
                  91,

                longScore:
                  91,

                shortScore:
                  23,
              }),
          });

        expect(
          result.fingerprint
            .scoring
            .sideScore,
        ).toBe(91);

        expect(
          result.fingerprint
            .scoring
            .oppositeScore,
        ).toBe(23);

        expect(
          result.fingerprint
            .scoring
            .scoreGap,
        ).toBe(68);
      },
    );

    test(
      "stores aligned score and score gap for SHORT",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "TSLA",
            side: "SHORT",

            scoring:
              scoring({
                preferredSide:
                  "SHORT",

                preferredScore:
                  88,

                longScore:
                  19,

                shortScore:
                  88,
              }),
          });

        expect(
          result.fingerprint
            .scoring
            .sideScore,
        ).toBe(88);

        expect(
          result.fingerprint
            .scoring
            .oppositeScore,
        ).toBe(19);

        expect(
          result.fingerprint
            .scoring
            .scoreGap,
        ).toBe(69);
      },
    );
  },
);

/**
 * ============================================================
 * POINT-IN-TIME SAFETY
 * ============================================================
 */

describe(
  "Trade Setup Fingerprint — Point In Time",
  () => {
    test(
      "preserves explicit asOfTimestamp",
      () => {
        const timestamp =
          "2026-08-22T13:15:00.000Z";

        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",
            side: "LONG",

            asOfTimestamp:
              timestamp,
          });

        expect(
          result.fingerprint
            .asOfTimestamp,
        ).toBe(timestamp);
      },
    );

    test(
      "invalid timestamp safely falls back to a valid ISO timestamp",
      () => {
        const result =
          createTradeSetupFingerprint({
            symbol: "AAPL",
            side: "LONG",

            asOfTimestamp:
              "not-a-date",
          });

        expect(
          Number.isNaN(
            new Date(
              result
                .fingerprint
                .asOfTimestamp,
            ).getTime(),
          ),
        ).toBe(false);
      },
    );
  },
);