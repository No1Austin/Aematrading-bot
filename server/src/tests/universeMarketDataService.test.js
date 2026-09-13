import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const {
  buildMarketMeasurementsMock,
  scanMarketMock,
  submitCandidateMock,
} = vi.hoisted(() => ({
  buildMarketMeasurementsMock:
    vi.fn(),

  scanMarketMock:
    vi.fn(),

  submitCandidateMock:
    vi.fn(),
}));

vi.mock(
  "../scanner/marketMeasurementProvider.js",
  () => ({
    buildMarketMeasurements:
      buildMarketMeasurementsMock,
  }),
);

vi.mock(
  "../scanner/marketScanner.js",
  () => ({
    scanMarket:
      scanMarketMock,
  }),
);

vi.mock(
  "../scanner/deepResearchCoordinator.js",
  () => ({
    default: {
      submitCandidate:
        submitCandidateMock,
    },
  }),
);

import {
  processUniverseMarketData,
  UNIVERSE_DATA_STATUS,
} from "../scanner/universeMarketDataService.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function asset(
  symbol,
  overrides = {},
) {
  return {
    symbol,
    tradable: true,
    shortable: true,

    ...overrides,
  };
}

function measurement(
  symbol,
) {
  return {
    symbol,

    price: 100,

    averageDailyVolume:
      2_000_000,

    dollarVolume:
      200_000_000,

    relativeVolume:
      2,

    change5mPercent:
      1,

    change15mPercent:
      2,

    change60mPercent:
      3,

    atrPercent:
      2,

    intradayRangePercent:
      4,

    vwap: 98,

    ema20: 99,

    ema50: 95,

    recentHigh: 99,

    recentLow: 90,

    tradable: true,

    shortable: true,

    marketRegime:
      "BULLISH",
  };
}

function candidate(
  symbol,
  scannerScore,
  {
    direction = "LONG",
  } = {},
) {
  return {
    symbol,

    qualified: true,

    status:
      "QUALIFIED",

    scannerScore,

    longScannerScore:
      direction === "LONG"
        ? scannerScore
        : 25,

    shortScannerScore:
      direction === "SHORT"
        ? scannerScore
        : 25,

    directionEdge:
      scannerScore - 25,

    preferredDirection:
      direction,

    reasons: [
      "Synthetic test candidate",
    ],

    measurements: {
      price: 100,
    },
  };
}

function successfulWarmResult(
  assets,
) {
  return {
    approved: true,

    symbolsRequested:
      assets.length,

    symbolsWarmed:
      assets.length,

    warmedSymbols:
      assets.map(
        item =>
          item.symbol,
      ),

    failedSymbols: [],

    errors: [],

    warnings: [],
  };
}

function createWarmBatchMock() {
  return vi.fn(
    async ({
      assets,
    }) =>
      successfulWarmResult(
        assets,
      ),
  );
}

/**
 * ============================================================
 * RESET
 * ============================================================
 */

beforeEach(() => {
  vi.clearAllMocks();

  submitCandidateMock
    .mockImplementation(
      candidateResult => ({
        accepted: true,

        symbol:
          candidateResult.symbol,

        reason: null,
      }),
    );
});

/**
 * ============================================================
 * EMPTY UNIVERSE
 * ============================================================
 */

describe(
  "Universe Market Data Service — Empty Input",
  () => {
    it(
      "returns a safe EMPTY result",
      async () => {
        const result =
          await processUniverseMarketData({
            assets: [],
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          UNIVERSE_DATA_STATUS.EMPTY,
        );

        expect(
          result.assetsRequested,
        ).toBe(0);

        expect(
          result.candidates,
        ).toEqual([]);

        expect(
          submitCandidateMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/**
 * ============================================================
 * ASSET NORMALIZATION
 * ============================================================
 */

describe(
  "Universe Market Data Service — Asset Normalization",
  () => {
    it(
      "normalizes symbols and removes duplicate assets",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        scanMarketMock
          .mockResolvedValue({
            scanned: 2,

            qualified: 0,

            submitted: 0,

            candidates: [],
          });

        const result =
          await processUniverseMarketData({
            assets: [
              asset("nvda"),
              asset("NVDA"),
              asset(" amd "),
            ],

            warmBatch,

            submitForDeepResearch:
              false,
          });

        expect(
          result.assetsRequested,
        ).toBe(2);

        expect(
          warmBatch,
        ).toHaveBeenCalledTimes(1);

        const firstCall =
          warmBatch.mock.calls[0][0];

        expect(
          firstCall.symbols,
        ).toEqual([
          "NVDA",
          "AMD",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * BATCHING
 * ============================================================
 */

describe(
  "Universe Market Data Service — Single Warm + Local Batching",
  () => {
    it(
      "warms the selected universe once while splitting scanner processing into configured batches",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        scanMarketMock
          .mockResolvedValue({
            scanned: 2,

            qualified: 0,

            submitted: 0,

            candidates: [],
          });

        const assets =
          Array.from(
            {
              length: 5,
            },
            (
              _,
              index,
            ) =>
              asset(
                `SYM${index}`,
              ),
          );

        const result =
          await processUniverseMarketData({
            assets,

            warmBatch,

            batchSize: 2,

            submitForDeepResearch:
              false,
          });

        expect(
          result.batchesProcessed,
        ).toBe(3);

        expect(
          warmBatch,
        ).toHaveBeenCalledTimes(1);

        const warmCall =
          warmBatch.mock.calls[0][0];

        expect(
          warmCall.symbols,
        ).toEqual([
          "SYM0",
          "SYM1",
          "SYM2",
          "SYM3",
          "SYM4",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * SCANNER SUBMISSION IS DELAYED
 * ============================================================
 */

describe(
  "Universe Market Data Service — Delayed Submission",
  () => {
    it(
      "scans every batch with deep-research submission disabled",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        scanMarketMock
          .mockResolvedValue({
            scanned: 1,

            qualified: 1,

            submitted: 0,

            candidates: [
              candidate(
                "NVDA",
                90,
              ),
            ],
          });

        await processUniverseMarketData({
          assets: [
            asset("NVDA"),
          ],

          warmBatch,

          batchSize: 1,

          submitForDeepResearch:
            true,
        });

        expect(
          scanMarketMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            submitForDeepResearch:
              false,
          }),
        );
      },
    );
  },
);

/**
 * ============================================================
 * GLOBAL RANKING
 * ============================================================
 */

describe(
  "Universe Market Data Service — Global Ranking",
  () => {
    it(
      "ranks a higher-scoring candidate from a later batch above an earlier weaker candidate",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        scanMarketMock
          .mockImplementation(
            async ({
              measurements,
            }) => {
              const symbol =
                measurements[0]
                  .symbol;

              if (
                symbol === "EARLY"
              ) {
                return {
                  scanned: 1,

                  qualified: 1,

                  submitted: 0,

                  candidates: [
                    candidate(
                      "EARLY",
                      80,
                    ),
                  ],
                };
              }

              if (
                symbol === "LATE"
              ) {
                return {
                  scanned: 1,

                  qualified: 1,

                  submitted: 0,

                  candidates: [
                    candidate(
                      "LATE",
                      96,
                    ),
                  ],
                };
              }

              return {
                scanned: 1,

                qualified: 0,

                submitted: 0,

                candidates: [],
              };
            },
          );

        const result =
          await processUniverseMarketData({
            assets: [
              asset("EARLY"),
              asset("LATE"),
            ],

            warmBatch,

            batchSize: 1,

            maximumCandidatesPerCycle:
              2,

            submitForDeepResearch:
              false,
          });

        expect(
          result.candidates.map(
            item =>
              item.symbol,
          ),
        ).toEqual([
          "LATE",
          "EARLY",
        ]);

        expect(
          result.candidates[0]
            .scannerScore,
        ).toBe(96);

        expect(
          result.candidates[1]
            .scannerScore,
        ).toBe(80);
      },
    );
  },
);

/**
 * ============================================================
 * GLOBAL TOP-N SELECTION
 * ============================================================
 */

describe(
  "Universe Market Data Service — Global Selection",
  () => {
    it(
      "selects only the top candidates from the entire market pass",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        const scoreBySymbol = {
          AAA: 75,
          BBB: 95,
          CCC: 88,
          DDD: 82,
        };

        scanMarketMock
          .mockImplementation(
            async ({
              measurements,
            }) => {
              const symbol =
                measurements[0]
                  .symbol;

              return {
                scanned: 1,

                qualified: 1,

                submitted: 0,

                candidates: [
                  candidate(
                    symbol,
                    scoreBySymbol[
                      symbol
                    ],
                  ),
                ],
              };
            },
          );

        const result =
          await processUniverseMarketData({
            assets: [
              asset("AAA"),
              asset("BBB"),
              asset("CCC"),
              asset("DDD"),
            ],

            warmBatch,

            batchSize: 1,

            maximumCandidatesPerCycle:
              2,

            submitForDeepResearch:
              false,
          });

        expect(
          result.selectedCandidates.map(
            item =>
              item.symbol,
          ),
        ).toEqual([
          "BBB",
          "CCC",
        ]);

        expect(
          result.selectedForDeepResearch,
        ).toBe(2);
      },
    );
  },
);

/**
 * ============================================================
 * GLOBAL SUBMISSION ORDER
 * ============================================================
 */

describe(
  "Universe Market Data Service — Submission Order",
  () => {
    it(
      "submits strongest candidates first after global ranking",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        const scores = {
          LOW: 78,
          HIGH: 97,
          MID: 86,
        };

        scanMarketMock
          .mockImplementation(
            async ({
              measurements,
            }) => {
              const symbol =
                measurements[0]
                  .symbol;

              return {
                scanned: 1,

                qualified: 1,

                submitted: 0,

                candidates: [
                  candidate(
                    symbol,
                    scores[
                      symbol
                    ],
                  ),
                ],
              };
            },
          );

        const result =
          await processUniverseMarketData({
            assets: [
              asset("LOW"),
              asset("HIGH"),
              asset("MID"),
            ],

            warmBatch,

            batchSize: 1,

            maximumCandidatesPerCycle:
              3,

            submitForDeepResearch:
              true,
          });

        expect(
          submitCandidateMock
            .mock.calls
            .map(
              call =>
                call[0]
                  .symbol,
            ),
        ).toEqual([
          "HIGH",
          "MID",
          "LOW",
        ]);

        expect(
          result.submitted,
        ).toBe(3);
      },
    );
  },
);

/**
 * ============================================================
 * NO SUBMISSION MODE
 * ============================================================
 */

describe(
  "Universe Market Data Service — Scanner Only Mode",
  () => {
    it(
      "does not submit candidates when submission is disabled",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockReturnValue([
            measurement(
              "NVDA",
            ),
          ]);

        scanMarketMock
          .mockResolvedValue({
            scanned: 1,

            qualified: 1,

            submitted: 0,

            candidates: [
              candidate(
                "NVDA",
                92,
              ),
            ],
          });

        const result =
          await processUniverseMarketData({
            assets: [
              asset("NVDA"),
            ],

            warmBatch,

            submitForDeepResearch:
              false,
          });

        expect(
          submitCandidateMock,
        ).not.toHaveBeenCalled();

        expect(
          result.submitted,
        ).toBe(0);

        expect(
          result.selectedCandidates,
        ).toHaveLength(1);
      },
    );
  },
);

/**
 * ============================================================
 * DUPLICATE CANDIDATE PROTECTION
 * ============================================================
 */

describe(
  "Universe Market Data Service — Candidate Deduplication",
  () => {
    it(
      "keeps only the strongest result when duplicate symbols appear across batches",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        let call = 0;

        scanMarketMock
          .mockImplementation(
            async () => {
              call += 1;

              return {
                scanned: 1,

                qualified: 1,

                submitted: 0,

                candidates: [
                  candidate(
                    "NVDA",
                    call === 1
                      ? 82
                      : 94,
                  ),
                ],
              };
            },
          );

        const result =
          await processUniverseMarketData({
            assets: [
              asset("AAA"),
              asset("BBB"),
            ],

            warmBatch,

            batchSize: 1,

            submitForDeepResearch:
              false,
          });

        expect(
          result.candidates,
        ).toHaveLength(1);

        expect(
          result.candidates[0]
            .symbol,
        ).toBe("NVDA");

        expect(
          result.candidates[0]
            .scannerScore,
        ).toBe(94);
      },
    );
  },
);

/**
 * ============================================================
 * DETERMINISTIC TIE BREAK
 * ============================================================
 */

describe(
  "Universe Market Data Service — Deterministic Ranking",
  () => {
    it(
      "uses symbol ordering when scanner scores are equal",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        scanMarketMock
          .mockImplementation(
            async ({
              measurements,
            }) => ({
              scanned: 1,

              qualified: 1,

              submitted: 0,

              candidates: [
                candidate(
                  measurements[0]
                    .symbol,
                  90,
                ),
              ],
            }),
          );

        const result =
          await processUniverseMarketData({
            assets: [
              asset("ZZZ"),
              asset("AAA"),
              asset("MMM"),
            ],

            warmBatch,

            batchSize: 1,

            submitForDeepResearch:
              false,
          });

        expect(
          result.candidates.map(
            item =>
              item.symbol,
          ),
        ).toEqual([
          "AAA",
          "MMM",
          "ZZZ",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * PARTIAL MARKET DATA
 * ============================================================
 */

describe(
  "Universe Market Data Service — Partial Data",
  () => {
    it(
      "continues when only some assets produce usable measurements",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) => {
              if (
                assets[0]
                  .symbol ===
                "BAD"
              ) {
                return [];
              }

              return [
                measurement(
                  assets[0]
                    .symbol,
                ),
              ];
            },
          );

        scanMarketMock
          .mockResolvedValue({
            scanned: 1,

            qualified: 0,

            submitted: 0,

            candidates: [],
          });

        const result =
          await processUniverseMarketData({
            assets: [
              asset("GOOD"),
              asset("BAD"),
            ],

            warmBatch,

            batchSize: 1,

            submitForDeepResearch:
              false,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          UNIVERSE_DATA_STATUS
            .PARTIAL,
        );

        expect(
          result.measured,
        ).toBe(1);
      },
    );
  },
);

/**
 * ============================================================
 * BATCH FAILURE ISOLATION
 * ============================================================
 */

describe(
  "Universe Market Data Service — Batch Failure Isolation",
  () => {
    it(
      "does not destroy the whole market pass when one batch warmer fails",
      async () => {
        const warmBatch =
          vi.fn(
            async ({
              assets,
            }) => {
              if (
                assets[0]
                  .symbol ===
                "BAD"
              ) {
                throw new Error(
                  "Synthetic warm failure",
                );
              }

              return successfulWarmResult(
                assets,
              );
            },
          );

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) => {
              if (
                assets[0]
                  .symbol ===
                "BAD"
              ) {
                return [];
              }

              return [
                measurement(
                  assets[0]
                    .symbol,
                ),
              ];
            },
          );

        scanMarketMock
          .mockResolvedValue({
            scanned: 1,

            qualified: 1,

            submitted: 0,

            candidates: [
              candidate(
                "GOOD",
                90,
              ),
            ],
          });

        const result =
          await processUniverseMarketData({
            assets: [
              asset("BAD"),
              asset("GOOD"),
            ],

            warmBatch,

            batchSize: 1,

            submitForDeepResearch:
              false,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.candidates.some(
            item =>
              item.symbol ===
              "GOOD",
          ),
        ).toBe(true);

        expect(
          result.errors.some(
            message =>
              message.includes(
                "Synthetic warm failure",
              ),
          ),
        ).toBe(true);
      },
    );
  },
);

/**
 * ============================================================
 * SUBMISSION FAILURE ISOLATION
 * ============================================================
 */

describe(
  "Universe Market Data Service — Submission Failure",
  () => {
    it(
      "continues submitting later candidates when one coordinator submission throws",
      async () => {
        const warmBatch =
          createWarmBatchMock();

        buildMarketMeasurementsMock
          .mockImplementation(
            ({
              assets,
            }) =>
              assets.map(
                item =>
                  measurement(
                    item.symbol,
                  ),
              ),
          );

        scanMarketMock
          .mockImplementation(
            async ({
              measurements,
            }) => ({
              scanned: 1,

              qualified: 1,

              submitted: 0,

              candidates: [
                candidate(
                  measurements[0]
                    .symbol,
                  measurements[0]
                    .symbol ===
                    "BAD"
                    ? 95
                    : 90,
                ),
              ],
            }),
          );

        submitCandidateMock
          .mockImplementation(
            candidateResult => {
              if (
                candidateResult
                  .symbol ===
                "BAD"
              ) {
                throw new Error(
                  "Synthetic submit failure",
                );
              }

              return {
                accepted: true,
                reason: null,
              };
            },
          );

        const result =
          await processUniverseMarketData({
            assets: [
              asset("BAD"),
              asset("GOOD"),
            ],

            warmBatch,

            batchSize: 1,

            maximumCandidatesPerCycle:
              2,

            submitForDeepResearch:
              true,
          });

        expect(
          submitCandidateMock,
        ).toHaveBeenCalledTimes(2);

        expect(
          result.submitted,
        ).toBe(1);

        expect(
          result.submissions,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              symbol: "BAD",
              accepted: false,
            }),

            expect.objectContaining({
              symbol: "GOOD",
              accepted: true,
            }),
          ]),
        );
      },
    );
  },
);