import {
  describe,
  expect,
  it,
} from "vitest";

import qualifyScannerCandidate from
  "../scanner/candidateQualificationEngine.js";

import {
  MARKET_SCANNER_CONFIG,
  SCANNER_DIRECTION,
  SCANNER_STATUS,
} from
  "../scanner/marketScannerConfig.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function baseInput(
  overrides = {},
) {
  return {
    symbol: "TEST",

    price: 100,

    bid: 99.95,
    ask: 100.05,

    averageDailyVolume:
      2_000_000,

    dollarVolume:
      200_000_000,

    spreadPercent:
      0.001,

    relativeVolume:
      1.5,

    change5mPercent:
      0,

    change15mPercent:
      0,

    change60mPercent:
      0,

    atrPercent:
      2,

    intradayRangePercent:
      3,

    vwap:
      100,

    ema20:
      100,

    ema50:
      100,

    recentHigh:
      105,

    recentLow:
      95,

    tradable:
      true,

    shortable:
      true,

    marketRegime:
      "NEUTRAL",

    ...overrides,
  };
}

/**
 * ============================================================
 * BASIC CONTRACT
 * ============================================================
 */

describe(
  "Candidate Qualification Engine — Basic Contract",
  () => {
    it(
      "fails closed when symbol is missing",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              symbol: "",
            }),
          );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          SCANNER_STATUS.REJECTED,
        );

        expect(
          result.preferredDirection,
        ).toBe(
          SCANNER_DIRECTION.NEUTRAL,
        );

        expect(
          result.rejectionReasons,
        ).toContain(
          "SYMBOL_REQUIRED",
        );
      },
    );

    it(
      "never produces a score above 100",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              relativeVolume: 10,

              change5mPercent: 10,
              change15mPercent: 20,
              change60mPercent: 30,

              price: 120,

              vwap: 100,
              ema20: 105,
              ema50: 95,

              recentHigh: 110,

              marketRegime:
                "BULLISH",
            }),
          );

        expect(
          result.longScannerScore,
        ).toBeLessThanOrEqual(
          100,
        );

        expect(
          result.shortScannerScore,
        ).toBeLessThanOrEqual(
          100,
        );

        expect(
          result.scannerScore,
        ).toBeLessThanOrEqual(
          100,
        );
      },
    );
  },
);

/**
 * ============================================================
 * LONG QUALIFICATION
 * ============================================================
 */

describe(
  "Candidate Qualification Engine — LONG",
  () => {
    it(
      "qualifies a strong bullish candidate",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              price: 110,

              relativeVolume:
                2.5,

              change5mPercent:
                0.8,

              change15mPercent:
                1.6,

              change60mPercent:
                3,

              atrPercent:
                2,

              intradayRangePercent:
                4,

              vwap: 106,

              ema20: 105,

              ema50: 101,

              recentHigh:
                108,

              recentLow:
                98,

              marketRegime:
                "BULLISH",
            }),
          );

        expect(
          result.qualified,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          SCANNER_STATUS.QUALIFIED,
        );

        expect(
          result.preferredDirection,
        ).toBe(
          SCANNER_DIRECTION.LONG,
        );

        expect(
          result.longScannerScore,
        ).toBeGreaterThan(
          result.shortScannerScore,
        );

        expect(
          result.scannerScore,
        ).toBeGreaterThanOrEqual(
          MARKET_SCANNER_CONFIG
            .minimumScannerScore,
        );
      },
    );

    it(
      "can qualify LONG even in a bearish broad regime",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              price: 112,

              relativeVolume:
                3,

              change5mPercent:
                1,

              change15mPercent:
                2,

              change60mPercent:
                4,

              vwap: 107,

              ema20: 106,

              ema50: 102,

              recentHigh:
                109,

              marketRegime:
                "BEARISH",
            }),
          );

        expect(
          result.preferredDirection,
        ).toBe(
          SCANNER_DIRECTION.LONG,
        );

        expect(
          result.longScannerScore,
        ).toBeGreaterThan(
          result.shortScannerScore,
        );

        expect(
          result.qualified,
        ).toBe(true);
      },
    );
  },
);

/**
 * ============================================================
 * SHORT QUALIFICATION
 * ============================================================
 */

describe(
  "Candidate Qualification Engine — SHORT",
  () => {
    it(
      "qualifies a strong bearish candidate",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              price: 90,

              relativeVolume:
                2.7,

              change5mPercent:
                -0.8,

              change15mPercent:
                -1.7,

              change60mPercent:
                -3.2,

              atrPercent:
                2.3,

              intradayRangePercent:
                4.5,

              vwap: 94,

              ema20: 95,

              ema50: 100,

              recentLow:
                92,

              recentHigh:
                104,

              marketRegime:
                "BEARISH",
            }),
          );

        expect(
          result.qualified,
        ).toBe(true);

        expect(
          result.preferredDirection,
        ).toBe(
          SCANNER_DIRECTION.SHORT,
        );

        expect(
          result.shortScannerScore,
        ).toBeGreaterThan(
          result.longScannerScore,
        );
      },
    );

    it(
      "can qualify SHORT even in a bullish broad regime",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              price: 88,

              relativeVolume:
                3,

              change5mPercent:
                -1,

              change15mPercent:
                -2,

              change60mPercent:
                -4,

              vwap: 94,

              ema20: 93,

              ema50: 98,

              recentLow:
                90,

              marketRegime:
                "BULLISH",
            }),
          );

        expect(
          result.preferredDirection,
        ).toBe(
          SCANNER_DIRECTION.SHORT,
        );

        expect(
          result.shortScannerScore,
        ).toBeGreaterThan(
          result.longScannerScore,
        );

        expect(
          result.qualified,
        ).toBe(true);
      },
    );

    it(
      "rejects an otherwise strong SHORT when the asset is not shortable",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              price: 90,

              relativeVolume:
                3,

              change5mPercent:
                -1,

              change15mPercent:
                -2,

              change60mPercent:
                -4,

              vwap: 94,

              ema20: 95,

              ema50: 100,

              recentLow:
                92,

              marketRegime:
                "BEARISH",

              shortable:
                false,
            }),
          );

        expect(
          result.preferredDirection,
        ).toBe(
          SCANNER_DIRECTION.SHORT,
        );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.rejectionReasons,
        ).toContain(
          "NOT_SHORTABLE",
        );
      },
    );
  },
);

/**
 * ============================================================
 * HARD GATES
 * ============================================================
 */

describe(
  "Candidate Qualification Engine — Hard Gates",
  () => {
    it(
      "rejects a non-tradable asset",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              tradable: false,
            }),
          );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.rejectionReasons,
        ).toContain(
          "NOT_TRADABLE",
        );
      },
    );

    it(
      "rejects price below minimum",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              price: 2,
            }),
          );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.rejectionReasons,
        ).toContain(
          "PRICE_BELOW_MINIMUM",
        );
      },
    );

    it(
      "rejects insufficient average volume",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              averageDailyVolume:
                100_000,
            }),
          );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.rejectionReasons,
        ).toContain(
          "INSUFFICIENT_AVERAGE_VOLUME",
        );
      },
    );

    it(
      "rejects insufficient dollar volume",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              dollarVolume:
                1_000_000,
            }),
          );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.rejectionReasons,
        ).toContain(
          "INSUFFICIENT_DOLLAR_VOLUME",
        );
      },
    );

    it(
      "rejects an excessively wide spread",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              spreadPercent:
                0.03,
            }),
          );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.rejectionReasons,
        ).toContain(
          "SPREAD_TOO_WIDE",
        );
      },
    );
  },
);

/**
 * ============================================================
 * DIRECTIONAL AMBIGUITY
 * ============================================================
 */

describe(
  "Candidate Qualification Engine — Direction Edge",
  () => {
    it(
      "rejects a noisy setup with insufficient LONG/SHORT separation",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              relativeVolume:
                1.3,

              change5mPercent:
                0,

              change15mPercent:
                0,

              change60mPercent:
                0,

              vwap: 100,

              ema20: 100,

              ema50: 100,

              recentHigh:
                105,

              recentLow:
                95,

              marketRegime:
                "NEUTRAL",
            }),
          );

        expect(
          result.qualified,
        ).toBe(false);

        expect(
          result.rejectionReasons,
        ).toContain(
          "INSUFFICIENT_DIRECTION_EDGE",
        );
      },
    );
  },
);

/**
 * ============================================================
 * VOLATILITY SAFETY
 * ============================================================
 */

describe(
  "Candidate Qualification Engine — Volatility",
  () => {
    it(
      "does not reward pathological ATR volatility",
      () => {
        const normal =
          qualifyScannerCandidate(
            baseInput({
              price: 110,

              relativeVolume:
                2.5,

              change5mPercent:
                0.8,

              change15mPercent:
                1.6,

              change60mPercent:
                3,

              atrPercent:
                2,

              intradayRangePercent:
                4,

              vwap: 106,
              ema20: 105,
              ema50: 101,

              recentHigh:
                108,

              marketRegime:
                "BULLISH",
            }),
          );

        const pathological =
          qualifyScannerCandidate(
            baseInput({
              price: 110,

              relativeVolume:
                2.5,

              change5mPercent:
                0.8,

              change15mPercent:
                1.6,

              change60mPercent:
                3,

              atrPercent:
                30,

              intradayRangePercent:
                35,

              vwap: 106,
              ema20: 105,
              ema50: 101,

              recentHigh:
                108,

              marketRegime:
                "BULLISH",
            }),
          );

        expect(
          pathological
            .longScores
            .volatility,
        ).toBe(0);

        expect(
          pathological
            .longScannerScore,
        ).toBeLessThan(
          normal
            .longScannerScore,
        );
      },
    );
  },
);

/**
 * ============================================================
 * SCORE EXPLAINABILITY
 * ============================================================
 */

describe(
  "Candidate Qualification Engine — Explainability",
  () => {
    it(
      "returns component scores and measurements",
      () => {
        const result =
          qualifyScannerCandidate(
            baseInput({
              price: 110,

              relativeVolume:
                2.5,

              change5mPercent:
                0.8,

              change15mPercent:
                1.6,

              change60mPercent:
                3,

              vwap: 106,
              ema20: 105,
              ema50: 101,

              recentHigh:
                108,

              marketRegime:
                "BULLISH",
            }),
          );

        expect(
          result.longScores,
        ).toHaveProperty(
          "tradabilityLiquidity",
        );

        expect(
          result.longScores,
        ).toHaveProperty(
          "volume",
        );

        expect(
          result.longScores,
        ).toHaveProperty(
          "momentum",
        );

        expect(
          result.longScores,
        ).toHaveProperty(
          "trend",
        );

        expect(
          result.measurements,
        ).toHaveProperty(
          "relativeVolume",
        );

        expect(
          result.measurements,
        ).toHaveProperty(
          "marketRegime",
        );
      },
    );
  },
);