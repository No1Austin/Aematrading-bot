import {
  describe,
  test,
  expect,
} from "vitest";

import analyzeTradeHistoryOutcomes, {
  HISTORY_OUTCOME_STATUS,
  HISTORY_OUTCOME_SIGNAL,
  HISTORY_CONFIDENCE,
} from "../history/tradeHistoryOutcomeEngine.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildMatch({
  id = "trade-1",
  symbol = "AAPL",
  side = "LONG",
  similarity = 0.9,
  outcome = "WIN",
  realizedR = 1.5,
  realizedPnL = 100,
  sameSymbol = true,
} = {}) {
  return {
    tradeId: id,
    symbol,
    side,
    similarity,
    similarityPercent:
      similarity * 100,
    coverage: 1,
    outcome,
    realizedR,
    realizedPnL,
    sameSymbol,
    closedAt:
      "2026-08-20T15:00:00.000Z",
  };
}

/**
 * ============================================================
 * NO DATA
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — No Data",
  () => {
    test(
      "returns NO_MATCHES when no historical analogues exist",
      () => {
        const result =
          analyzeTradeHistoryOutcomes({
            matches: [],
            side: "LONG",
            symbol: "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          HISTORY_OUTCOME_STATUS
            .NO_MATCHES,
        );

        expect(
          result.signal,
        ).toBe(
          HISTORY_OUTCOME_SIGNAL
            .INSUFFICIENT_DATA,
        );

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .INSUFFICIENT,
        );
      },
    );

    test(
      "rejects non-array matches",
      () => {
        const result =
          analyzeTradeHistoryOutcomes({
            matches:
              "invalid",
            side: "LONG",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          HISTORY_OUTCOME_STATUS
            .INVALID_INPUT,
        );
      },
    );
  },
);

/**
 * ============================================================
 * SAMPLE SIZE SAFETY
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Sample Size",
  () => {
    test(
      "tiny sample remains insufficient even if every trade won",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            realizedR: 3,
          }),

          buildMatch({
            id: "2",
            realizedR: 2,
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
            symbol: "AAPL",
          });

        expect(
          result.status,
        ).toBe(
          HISTORY_OUTCOME_STATUS
            .INSUFFICIENT_DATA,
        );

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .INSUFFICIENT,
        );

        expect(
          result.signal,
        ).toBe(
          HISTORY_OUTCOME_SIGNAL
            .INSUFFICIENT_DATA,
        );
      },
    );

    test(
      "three good matches can produce low-confidence usable signal",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            realizedR: 1.2,
          }),

          buildMatch({
            id: "2",
            realizedR: 1.1,
          }),

          buildMatch({
            id: "3",
            realizedR: 0.9,
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.status,
        ).toBe(
          HISTORY_OUTCOME_STATUS
            .COMPLETE,
        );

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .LOW,
        );
      },
    );
  },
);

/**
 * ============================================================
 * SUPPORTIVE HISTORY
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Supportive History",
  () => {
    test(
      "strong winning history becomes strongly supportive",
      () => {
        const matches =
          Array.from(
            {
              length: 12,
            },
            (
              _,
              index,
            ) =>
              buildMatch({
                id:
                  `win-${index}`,

                similarity:
                  0.9,

                outcome:
                  "WIN",

                realizedR:
                  1.5,
              }),
          );

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
            symbol: "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          HISTORY_OUTCOME_STATUS
            .COMPLETE,
        );

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .HIGH,
        );

        expect(
          result.signal,
        ).toBe(
          HISTORY_OUTCOME_SIGNAL
            .STRONGLY_SUPPORTIVE,
        );

        expect(
          result.stats
            .weightedWinRate,
        ).toBe(1);

        expect(
          result.stats
            .expectancyR,
        ).toBe(1.5);

        expect(
          result.directionalSupport
            .long,
        ).toBeGreaterThan(
          0.8,
        );

        expect(
          result.directionalSupport
            .short,
        ).toBeLessThan(
          0.2,
        );
      },
    );

    test(
      "moderately positive history becomes supportive",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            outcome: "WIN",
            realizedR: 1,
          }),

          buildMatch({
            id: "2",
            outcome: "WIN",
            realizedR: 0.8,
          }),

          buildMatch({
            id: "3",
            outcome: "WIN",
            realizedR: 0.7,
          }),

          buildMatch({
            id: "4",
            outcome: "LOSS",
            realizedR: -0.4,
          }),

          buildMatch({
            id: "5",
            outcome: "WIN",
            realizedR: 0.6,
          }),

          buildMatch({
            id: "6",
            outcome: "LOSS",
            realizedR: -0.3,
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.status,
        ).toBe(
          HISTORY_OUTCOME_STATUS
            .COMPLETE,
        );

        expect(
          result.signal,
        ).toBe(
          HISTORY_OUTCOME_SIGNAL
            .SUPPORTIVE,
        );

        expect(
          result.stats
            .expectancyR,
        ).toBeGreaterThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * NEGATIVE HISTORY
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Negative History",
  () => {
    test(
      "bad historical expectancy produces strongly negative signal",
      () => {
        const matches =
          Array.from(
            {
              length: 12,
            },
            (
              _,
              index,
            ) =>
              buildMatch({
                id:
                  `loss-${index}`,

                similarity:
                  0.9,

                outcome:
                  "LOSS",

                realizedR:
                  -1,
              }),
          );

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .HIGH,
        );

        expect(
          result.signal,
        ).toBe(
          HISTORY_OUTCOME_SIGNAL
            .STRONGLY_NEGATIVE,
        );

        expect(
          result.stats
            .weightedWinRate,
        ).toBe(0);

        expect(
          result.stats
            .expectancyR,
        ).toBe(-1);

        expect(
          result.directionalSupport
            .long,
        ).toBeLessThan(
          0.3,
        );
      },
    );

    test(
      "moderately weak history produces caution",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            outcome: "LOSS",
            realizedR: -0.5,
          }),

          buildMatch({
            id: "2",
            outcome: "LOSS",
            realizedR: -0.4,
          }),

          buildMatch({
            id: "3",
            outcome: "WIN",
            realizedR: 0.3,
          }),

          buildMatch({
            id: "4",
            outcome: "LOSS",
            realizedR: -0.2,
          }),

          buildMatch({
            id: "5",
            outcome: "WIN",
            realizedR: 0.2,
          }),

          buildMatch({
            id: "6",
            outcome: "LOSS",
            realizedR: -0.3,
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.signal,
        ).toBe(
          HISTORY_OUTCOME_SIGNAL
            .CAUTION,
        );
      },
    );
  },
);

/**
 * ============================================================
 * SIMILARITY WEIGHTING
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Similarity Weighting",
  () => {
    test(
      "more similar trades contribute more strongly to weighted expectancy",
      () => {
        const matches = [
          buildMatch({
            id:
              "strong-match-win",

            similarity:
              0.95,

            outcome:
              "WIN",

            realizedR:
              2,
          }),

          buildMatch({
            id:
              "weak-match-loss",

            similarity:
              0.72,

            outcome:
              "LOSS",

            realizedR:
              -1,
          }),

          buildMatch({
            id:
              "third",

            similarity:
              0.8,

            outcome:
              "WIN",

            realizedR:
              0.5,
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.stats
            .expectancyR,
        ).toBeGreaterThan(
          (
            2 +
            -1 +
            0.5
          ) / 3,
        );
      },
    );
  },
);

/**
 * ============================================================
 * R-MULTIPLE STATS
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — R Statistics",
  () => {
    test(
      "calculates average median best and worst R",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            realizedR: -1,
          }),

          buildMatch({
            id: "2",
            realizedR: 0.5,
          }),

          buildMatch({
            id: "3",
            realizedR: 1,
          }),

          buildMatch({
            id: "4",
            realizedR: 2,
          }),

          buildMatch({
            id: "5",
            realizedR: 3,
          }),

          buildMatch({
            id: "6",
            realizedR: 1.5,
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.stats
            .averageR,
        ).toBe(1.1667);

        expect(
          result.stats
            .medianR,
        ).toBe(1.25);

        expect(
          result.stats
            .bestR,
        ).toBe(3);

        expect(
          result.stats
            .worstR,
        ).toBe(-1);

        expect(
          result.stats
            .rObservationCount,
        ).toBe(6);
      },
    );
  },
);

/**
 * ============================================================
 * NULL SAFETY
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Missing R Safety",
  () => {
    test(
      "missing R values are not converted into zero",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            realizedR: null,
            outcome: "WIN",
          }),

          buildMatch({
            id: "2",
            realizedR: null,
            outcome: "WIN",
          }),

          buildMatch({
            id: "3",
            realizedR: null,
            outcome: "WIN",
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.stats
            .expectancyR,
        ).toBeNull();

        expect(
          result.stats
            .averageR,
        ).toBeNull();

        expect(
          result.stats
            .rObservationCount,
        ).toBe(0);

        expect(
          result.warnings,
        ).toContain(
          "Historical R-multiple sample is limited.",
        );
      },
    );
  },
);

/**
 * ============================================================
 * LONG / SHORT ORIENTATION
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Direction",
  () => {
    test(
      "supportive SHORT history strengthens SHORT support",
      () => {
        const matches =
          Array.from(
            {
              length: 6,
            },
            (
              _,
              index,
            ) =>
              buildMatch({
                id:
                  `short-${index}`,

                side:
                  "SHORT",

                outcome:
                  "WIN",

                realizedR:
                  1,
              }),
          );

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "SHORT",
          });

        expect(
          result.directionalSupport
            .short,
        ).toBeGreaterThan(
          result.directionalSupport
            .long,
        );
      },
    );

    test(
      "supportive LONG history strengthens LONG support",
      () => {
        const matches =
          Array.from(
            {
              length: 6,
            },
            (
              _,
              index,
            ) =>
              buildMatch({
                id:
                  `long-${index}`,

                side:
                  "LONG",

                outcome:
                  "WIN",

                realizedR:
                  1,
              }),
          );

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.directionalSupport
            .long,
        ).toBeGreaterThan(
          result.directionalSupport
            .short,
        );
      },
    );
  },
);

/**
 * ============================================================
 * CONFIDENCE
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Confidence",
  () => {
    test(
      "six qualifying matches produce MEDIUM confidence",
      () => {
        const matches =
          Array.from(
            {
              length: 6,
            },
            (
              _,
              index,
            ) =>
              buildMatch({
                id:
                  `medium-${index}`,

                similarity:
                  0.8,
              }),
          );

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .MEDIUM,
        );
      },
    );

    test(
      "twelve highly similar matches produce HIGH confidence",
      () => {
        const matches =
          Array.from(
            {
              length: 12,
            },
            (
              _,
              index,
            ) =>
              buildMatch({
                id:
                  `high-${index}`,

                similarity:
                  0.9,
              }),
          );

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .HIGH,
        );
      },
    );

    test(
      "many weakly similar matches do not produce confidence",
      () => {
        const matches =
          Array.from(
            {
              length: 20,
            },
            (
              _,
              index,
            ) =>
              buildMatch({
                id:
                  `weak-${index}`,

                similarity:
                  0.6,
              }),
          );

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.confidence,
        ).toBe(
          HISTORY_CONFIDENCE
            .INSUFFICIENT,
        );

        expect(
          result.status,
        ).toBe(
          HISTORY_OUTCOME_STATUS
            .INSUFFICIENT_DATA,
        );
      },
    );
  },
);

/**
 * ============================================================
 * SYMBOL MIX
 * ============================================================
 */

describe(
  "Trade History Outcome Engine — Symbol Mix",
  () => {
    test(
      "tracks same-symbol and cross-symbol analogue counts",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            sameSymbol: true,
          }),

          buildMatch({
            id: "2",
            sameSymbol: true,
          }),

          buildMatch({
            id: "3",
            sameSymbol: false,
          }),

          buildMatch({
            id: "4",
            sameSymbol: false,
          }),

          buildMatch({
            id: "5",
            sameSymbol: false,
          }),

          buildMatch({
            id: "6",
            sameSymbol: true,
          }),
        ];

        const result =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          result.stats
            .sameSymbolCount,
        ).toBe(3);

        expect(
          result.stats
            .crossSymbolCount,
        ).toBe(3);
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
  "Trade History Outcome Engine — Determinism",
  () => {
    test(
      "same historical evidence produces same analytical result",
      () => {
        const matches = [
          buildMatch({
            id: "1",
            realizedR: 1,
          }),

          buildMatch({
            id: "2",
            realizedR: -0.5,
            outcome: "LOSS",
          }),

          buildMatch({
            id: "3",
            realizedR: 2,
          }),

          buildMatch({
            id: "4",
            realizedR: 0.8,
          }),

          buildMatch({
            id: "5",
            realizedR: -0.25,
            outcome: "LOSS",
          }),

          buildMatch({
            id: "6",
            realizedR: 1.1,
          }),
        ];

        const first =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        const second =
          analyzeTradeHistoryOutcomes({
            matches,
            side: "LONG",
          });

        expect(
          first.signal,
        ).toBe(
          second.signal,
        );

        expect(
          first.confidence,
        ).toBe(
          second.confidence,
        );

        expect(
          first.stats,
        ).toEqual(
          second.stats,
        );

        expect(
          first.directionalSupport,
        ).toEqual(
          second.directionalSupport,
        );
      },
    );
  },
);