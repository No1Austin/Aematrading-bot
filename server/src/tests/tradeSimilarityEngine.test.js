import {
  describe,
  test,
  expect,
} from "vitest";

import {
  compareTradeFingerprints,
  findHistoricalAnalogues,
  TRADE_SIMILARITY_STATUS,
} from "../history/tradeSimilarityEngine.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function buildFingerprint({
  symbol = "AAPL",
  side = "LONG",
  support = 0.8,
  opposite = 0.2,
  alignedScore = 90,
  oppositeScore = 20,
  scoreGap = 70,
  timestamp = "2026-01-10T15:00:00.000Z",
  missing = [],
} = {}) {
  const componentNames = [
    "technical",
    "macro",
    "marketRegime",
    "events",
    "company",
    "country",
    "social",
    "historical",
    "liquidity",
    "consensus",
  ];

  const components = {};

  for (const name of componentNames) {
    if (missing.includes(name)) {
      components[name] = {
        name,
        available: false,
        alignedSupport: null,
        oppositeSupport: null,
      };

      continue;
    }

    components[name] = {
      name,
      available: true,
      alignedSupport: support,
      oppositeSupport: opposite,
    };
  }

  return {
    approved: true,

    version: "1.0",

    symbol,
    side,

    asOfTimestamp:
      timestamp,

    components,

    scoring: {
      alignedScore,
      oppositeScore,
      scoreGap,
    },
  };
}

function buildHistoricalTrade({
  id = "trade-1",
  symbol = "AAPL",
  side = "LONG",
  support = 0.8,
  opposite = 0.2,
  alignedScore = 90,
  oppositeScore = 20,
  scoreGap = 70,
  closedAt = "2026-01-09T15:00:00.000Z",
  outcome = "WIN",
  realizedPnL = 500,
  realizedR = 2,
  missing = [],
} = {}) {
  return {
    id,
    tradeId: id,

    symbol,
    side,

    status: "CLOSED",

    closedAt,

    outcome,

    realizedPnL,
    realizedR,

    fingerprint:
      buildFingerprint({
        symbol,
        side,
        support,
        opposite,
        alignedScore,
        oppositeScore,
        scoreGap,

        timestamp:
          closedAt,

        missing,
      }),
  };
}

/**
 * ============================================================
 * VALIDATION
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Validation",
  () => {
    test(
      "rejects invalid candidate fingerprint",
      () => {
        const historical =
          buildFingerprint();

        const result =
          compareTradeFingerprints({
            candidate: {
              side: "LONG",
            },

            historical,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          TRADE_SIMILARITY_STATUS
            .INVALID_CANDIDATE,
        );
      },
    );

    test(
      "rejects invalid historical fingerprint safely",
      () => {
        const candidate =
          buildFingerprint();

        const result =
          compareTradeFingerprints({
            candidate,

            historical: {
              symbol: "AAPL",
            },
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.similarity,
        ).toBeNull();
      },
    );
  },
);

/**
 * ============================================================
 * IDENTICAL SETUPS
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Identical Setup",
  () => {
    test(
      "identical fingerprints produce similarity of 1",
      () => {
        const candidate =
          buildFingerprint();

        const historical =
          buildFingerprint();

        const result =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          TRADE_SIMILARITY_STATUS
            .COMPLETE,
        );

        expect(
          result.similarity,
        ).toBe(1);

        expect(
          result.similarityPercent,
        ).toBe(100);

        expect(
          result.coverage,
        ).toBe(1);

        expect(
          result.qualifies,
        ).toBe(true);
      },
    );
  },
);

/**
 * ============================================================
 * SIDE SAFETY
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Side Safety",
  () => {
    test(
      "LONG does not match SHORT by default",
      () => {
        const candidate =
          buildFingerprint({
            side: "LONG",
          });

        const historical =
          buildFingerprint({
            side: "SHORT",
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          TRADE_SIMILARITY_STATUS
            .NO_MATCHES,
        );

        expect(
          result.similarity,
        ).toBe(0);

        expect(
          result.sameSide,
        ).toBe(false);
      },
    );

    test(
      "same SHORT setup can match another SHORT setup",
      () => {
        const candidate =
          buildFingerprint({
            side: "SHORT",
          });

        const historical =
          buildFingerprint({
            side: "SHORT",
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        expect(
          result.qualifies,
        ).toBe(true);

        expect(
          result.similarity,
        ).toBe(1);
      },
    );
  },
);

/**
 * ============================================================
 * CROSS SYMBOL
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Cross Symbol",
  () => {
    test(
      "allows highly similar cross-symbol analogue",
      () => {
        const candidate =
          buildFingerprint({
            symbol: "AAPL",
          });

        const historical =
          buildFingerprint({
            symbol: "MSFT",
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.qualifies,
        ).toBe(true);

        expect(
          result.sameSymbol,
        ).toBe(false);

        expect(
          result.similarity,
        ).toBe(1);
      },
    );

    test(
      "can disable cross-symbol matching",
      () => {
        const candidate =
          buildFingerprint({
            symbol: "AAPL",
          });

        const historical =
          buildFingerprint({
            symbol: "NVDA",
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,

            config: {
              allowCrossSymbol:
                false,
            },
          });

        expect(
          result.status,
        ).toBe(
          TRADE_SIMILARITY_STATUS
            .NO_MATCHES,
        );

        expect(
          result.similarity,
        ).toBe(0);
      },
    );
  },
);

/**
 * ============================================================
 * SIMILARITY DIFFERENCES
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Similarity",
  () => {
    test(
      "small setup differences remain highly similar",
      () => {
        const candidate =
          buildFingerprint({
            support: 0.8,
            opposite: 0.2,
            alignedScore: 90,
          });

        const historical =
          buildFingerprint({
            support: 0.75,
            opposite: 0.25,
            alignedScore: 85,
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        expect(
          result.similarity,
        ).toBeGreaterThan(
          0.9,
        );

        expect(
          result.qualifies,
        ).toBe(true);
      },
    );

    test(
      "strongly different setup falls below strict threshold",
      () => {
        const candidate =
          buildFingerprint({
            support: 0.9,
            opposite: 0.1,
            alignedScore: 95,
            oppositeScore: 10,
            scoreGap: 85,
          });

        const historical =
          buildFingerprint({
            support: 0.1,
            opposite: 0.9,
            alignedScore: 15,
            oppositeScore: 90,
            scoreGap: 5,
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,

            config: {
              minimumSimilarity:
                0.8,
            },
          });

        expect(
          result.similarity,
        ).toBeLessThan(
          0.8,
        );

        expect(
          result.qualifies,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * MISSING DATA
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Missing Data",
  () => {
    test(
      "missing component is ignored instead of treated as zero",
      () => {
        const candidate =
          buildFingerprint();

        const historical =
          buildFingerprint({
            missing: [
              "social",
            ],
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.similarity,
        ).toBe(1);

        expect(
          result.coverage,
        ).toBeLessThan(1);

        expect(
          result.coverage,
        ).toBeGreaterThan(
          0.9,
        );
      },
    );

    test(
      "low coverage prevents setup from qualifying",
      () => {
        const missing = [
          "technical",
          "macro",
          "marketRegime",
          "events",
          "company",
          "country",
          "social",
          "historical",
          "liquidity",
          "consensus",
        ];

        const candidate =
          buildFingerprint({
            missing,
          });

        const historical =
          buildFingerprint({
            missing,
          });

        const result =
          compareTradeFingerprints({
            candidate,
            historical,

            config: {
              minimumCoverage:
                0.5,
            },
          });

        expect(
          result.coverage,
        ).toBeLessThan(
          0.5,
        );

        expect(
          result.qualifies,
        ).toBe(false);
      },
    );
  },
);

/**
 * ============================================================
 * ANALOGUE SEARCH
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Historical Analogues",
  () => {
    test(
      "returns strongest historical analogue first",
      () => {
        const candidate =
          buildFingerprint({
            timestamp:
              "2026-01-10T15:00:00.000Z",
          });

        const weak =
          buildHistoricalTrade({
            id: "weak",

            support: 0.55,
            opposite: 0.45,

            alignedScore: 65,
            oppositeScore: 45,
            scoreGap: 20,
          });

        const strongest =
          buildHistoricalTrade({
            id: "strongest",

            support: 0.8,
            opposite: 0.2,

            alignedScore: 90,
            oppositeScore: 20,
            scoreGap: 70,
          });

        const medium =
          buildHistoricalTrade({
            id: "medium",

            support: 0.7,
            opposite: 0.3,

            alignedScore: 80,
            oppositeScore: 30,
            scoreGap: 50,
          });

        const result =
          findHistoricalAnalogues({
            candidate,

            historicalTrades: [
              weak,
              strongest,
              medium,
            ],

            config: {
              minimumSimilarity:
                0.5,
            },
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.matches.length,
        ).toBe(3);

        expect(
          result.matches[0]
            .tradeId,
        ).toBe(
          "strongest",
        );

        expect(
          result.bestMatch
            .tradeId,
        ).toBe(
          "strongest",
        );
      },
    );

    test(
      "maximumMatches limits returned analogues",
      () => {
        const candidate =
          buildFingerprint();

        const trades = [
          buildHistoricalTrade({
            id: "1",
          }),

          buildHistoricalTrade({
            id: "2",
          }),

          buildHistoricalTrade({
            id: "3",
          }),
        ];

        const result =
          findHistoricalAnalogues({
            candidate,

            historicalTrades:
              trades,

            config: {
              maximumMatches: 2,
            },
          });

        expect(
          result.matches.length,
        ).toBe(2);

        expect(
          result.qualifyingTrades,
        ).toBe(3);
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
  "Trade Similarity Engine — Point In Time Safety",
  () => {
    test(
      "future completed trade cannot influence earlier candidate",
      () => {
        const candidate =
          buildFingerprint({
            timestamp:
              "2026-01-10T15:00:00.000Z",
          });

        const futureTrade =
          buildHistoricalTrade({
            id:
              "future-trade",

            closedAt:
              "2026-01-11T15:00:00.000Z",
          });

        const result =
          findHistoricalAnalogues({
            candidate,

            historicalTrades: [
              futureTrade,
            ],
          });

        expect(
          result.evaluatedTrades,
        ).toBe(0);

        expect(
          result.matches.length,
        ).toBe(0);
      },
    );

    test(
      "trade closing exactly at candidate timestamp is excluded",
      () => {
        const timestamp =
          "2026-01-10T15:00:00.000Z";

        const candidate =
          buildFingerprint({
            timestamp,
          });

        const historical =
          buildHistoricalTrade({
            id: "same-time",
            closedAt: timestamp,
          });

        const result =
          findHistoricalAnalogues({
            candidate,

            historicalTrades: [
              historical,
            ],
          });

        expect(
          result.evaluatedTrades,
        ).toBe(0);

        expect(
          result.matches,
        ).toHaveLength(0);
      },
    );

    test(
      "trade completed before candidate is eligible",
      () => {
        const candidate =
          buildFingerprint({
            timestamp:
              "2026-01-10T15:00:00.000Z",
          });

        const historical =
          buildHistoricalTrade({
            id: "past-trade",

            closedAt:
              "2026-01-09T15:00:00.000Z",
          });

        const result =
          findHistoricalAnalogues({
            candidate,

            historicalTrades: [
              historical,
            ],
          });

        expect(
          result.evaluatedTrades,
        ).toBe(1);

        expect(
          result.matches,
        ).toHaveLength(1);

        expect(
          result.matches[0]
            .tradeId,
        ).toBe(
          "past-trade",
        );
      },
    );
  },
);

/**
 * ============================================================
 * OUTCOME INDEPENDENCE
 * ============================================================
 */

describe(
  "Trade Similarity Engine — Outcome Independence",
  () => {
    test(
      "WIN and LOSS with identical setups have same similarity",
      () => {
        const candidate =
          buildFingerprint();

        const winner =
          buildHistoricalTrade({
            id: "winner",
            outcome: "WIN",
            realizedR: 2,
          });

        const loser =
          buildHistoricalTrade({
            id: "loser",
            outcome: "LOSS",
            realizedR: -1,
          });

        const result =
          findHistoricalAnalogues({
            candidate,

            historicalTrades: [
              winner,
              loser,
            ],
          });

        expect(
          result.matches,
        ).toHaveLength(2);

        expect(
          result.matches[0]
            .similarity,
        ).toBe(
          result.matches[1]
            .similarity,
        );
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
  "Trade Similarity Engine — Determinism",
  () => {
    test(
      "same inputs always produce same similarity result",
      () => {
        const candidate =
          buildFingerprint({
            support: 0.82,
            opposite: 0.18,
          });

        const historical =
          buildFingerprint({
            support: 0.76,
            opposite: 0.24,
          });

        const first =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        const second =
          compareTradeFingerprints({
            candidate,
            historical,
          });

        expect(
          first.similarity,
        ).toBe(
          second.similarity,
        );

        expect(
          first.coverage,
        ).toBe(
          second.coverage,
        );

        expect(
          first.components,
        ).toEqual(
          second.components,
        );
      },
    );
  },
);
/**
 * ============================================================
 * TRADE HISTORY STORE COMPATIBILITY
 * ============================================================
 */

describe(
  "Trade Similarity Engine — History Store Compatibility",
  () => {
    test(
      "accepts entryFingerprint and finalR from TradeHistoryStore records",
      () => {
        const candidate =
          buildFingerprint({
            symbol: "AAPL",
            side: "LONG",
            timestamp:
              "2026-01-10T15:00:00.000Z",
          });

        const fingerprint =
          buildFingerprint({
            symbol: "AAPL",
            side: "LONG",
            timestamp:
              "2026-01-09T14:00:00.000Z",
          });

        const storedRecord = {
          id:
            "stored-history-1",

          symbol:
            "AAPL",

          side:
            "LONG",

          status:
            "CLOSED",

          closedAt:
            "2026-01-09T15:00:00.000Z",

          outcome:
            "WIN",

          realizedPnL:
            250,

          finalR:
            2.5,

          entryFingerprint:
            fingerprint,
        };

        const result =
          findHistoricalAnalogues({
            candidate,

            historicalTrades: [
              storedRecord,
            ],
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.matches,
        ).toHaveLength(1);

        expect(
          result.matches[0]
            .tradeId,
        ).toBe(
          "stored-history-1",
        );

        expect(
          result.matches[0]
            .realizedR,
        ).toBe(2.5);

        expect(
          result.matches[0]
            .similarity,
        ).toBe(1);
      },
    );
  },
);