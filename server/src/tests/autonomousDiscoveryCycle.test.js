import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * ============================================================
 * HOISTED MOCKS
 * ============================================================
 */

const {
  getMarketUniverseMock,

  processUniverseMarketDataMock,

  warmAlpacaUniverseBatchMock,

  waitForIdleMock,

  getQueueStateMock,

  listCandidatesMock,

  getCandidateRegistryStatsMock,
} = vi.hoisted(() => ({
  getMarketUniverseMock:
    vi.fn(),

  processUniverseMarketDataMock:
    vi.fn(),

  warmAlpacaUniverseBatchMock:
    vi.fn(),

  waitForIdleMock:
    vi.fn(),

  getQueueStateMock:
    vi.fn(),

  listCandidatesMock:
    vi.fn(),

  getCandidateRegistryStatsMock:
    vi.fn(),
}));

/**
 * ============================================================
 * MODULE MOCKS
 * ============================================================
 */

vi.mock(
  "../scanner/marketUniverseProvider.js",
  () => ({
    getMarketUniverse:
      getMarketUniverseMock,
  }),
);

vi.mock(
  "../scanner/universeMarketDataService.js",
  () => ({
    processUniverseMarketData:
      processUniverseMarketDataMock,
  }),
);

vi.mock(
  "../scanner/alpacaUniverseWarmer.js",
  () => ({
    warmAlpacaUniverseBatch:
      warmAlpacaUniverseBatchMock,
  }),
);

vi.mock(
  "../scanner/deepResearchCoordinator.js",
  () => ({
    default: {
      waitForIdle:
        waitForIdleMock,

      getQueueState:
        getQueueStateMock,
    },
  }),
);

vi.mock(
  "../scanner/candidateRegistry.js",
  () => ({
    listCandidates:
      listCandidatesMock,

    getCandidateRegistryStats:
      getCandidateRegistryStatsMock,
  }),
);

/**
 * ============================================================
 * SYSTEM UNDER TEST
 * ============================================================
 */

import {
  DISCOVERY_CYCLE_STATUS,
  runAutonomousDiscoveryCycle,
} from "../scanner/autonomousDiscoveryCycle.js";

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

    tradable:
      true,

    shortable:
      true,

    ...overrides,
  };
}

function scannerCandidate(
  symbol,
  scannerScore = 90,
  direction = "LONG",
) {
  return {
    symbol,

    qualified:
      true,

    status:
      "QUALIFIED",

    scannerScore,

    preferredDirection:
      direction,

    researchStatus:
      "QUEUED",
  };
}

function successfulUniverse(
  symbols = [
    "NVDA",
  ],
) {
  const assets =
    symbols.map(
      symbol =>
        asset(symbol),
    );

  return {
    approved: true,

    assets,

    symbols,

    longEligibleSymbols:
      [...symbols],

    shortEligibleSymbols:
      [...symbols],

    timestamp:
      "2026-08-29T20:00:00.000Z",

    warnings: [],

    errors: [],
  };
}

function successfulMarketDataResult({
  assetsRequested = 1,

  measured =
    assetsRequested,

  warmed =
    assetsRequested,

  qualified = 0,

  submitted = 0,

  candidates = [],

  selectedCandidates = [],

  submissions = [],

  status = "COMPLETE",

  approved = true,

  errors = [],

  warnings = [],
} = {}) {
  return {
    approved,

    service:
      "UNIVERSE_MARKET_DATA_SERVICE",

    status,

    marketRegime:
      "NEUTRAL",

    assetsRequested,

    batchesProcessed:
      1,

    warmed,

    measured,

    qualified,

    selectedForDeepResearch:
      selectedCandidates.length,

    submitted,

    candidates,

    selectedCandidates,

    submissions,

    batchResults: [],

    errors,

    warnings,

    startedAt:
      "2026-08-29T20:00:00.000Z",

    completedAt:
      "2026-08-29T20:00:01.000Z",
  };
}

/**
 * ============================================================
 * RESET
 * ============================================================
 */

beforeEach(() => {
  vi.clearAllMocks();

  getQueueStateMock
    .mockReturnValue({
      pending: 0,

      running: 0,

      maximumConcurrentDeepResearch:
        1,
    });

  listCandidatesMock
    .mockReturnValue([]);

  getCandidateRegistryStatsMock
    .mockReturnValue({
      total: 0,

      byStatus: {},
    });
});

/**
 * ============================================================
 * UNIVERSE FAILURE
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Universe",
  () => {
    it(
      "fails closed when the market universe is unavailable",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue({
            approved: false,

            assets: [],

            errors: [
              "Synthetic universe failure",
            ],
          });

        const result =
          await runAutonomousDiscoveryCycle();

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          DISCOVERY_CYCLE_STATUS
            .UNIVERSE_UNAVAILABLE,
        );

        expect(
          result.errors,
        ).toContain(
          "Synthetic universe failure",
        );

        expect(
          processUniverseMarketDataMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "handles an empty but valid universe safely",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue({
            approved: true,

            assets: [],

            longEligibleSymbols:
              [],

            shortEligibleSymbols:
              [],

            errors: [],

            warnings: [],
          });

        const result =
          await runAutonomousDiscoveryCycle();

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          DISCOVERY_CYCLE_STATUS
            .NO_MEASUREMENTS,
        );

        expect(
          processUniverseMarketDataMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/**
 * ============================================================
 * NO MEASUREMENTS
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Measurements",
  () => {
    it(
      "returns NO_MEASUREMENTS when warming produces no usable scanner measurements",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "AAPL",
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                2,

              warmed:
                0,

              measured:
                0,

              approved:
                false,

              status:
                "PARTIAL",

              warnings: [
                "No usable measurements",
              ],
            }),
          );

        const result =
          await runAutonomousDiscoveryCycle();

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          DISCOVERY_CYCLE_STATUS
            .NO_MEASUREMENTS,
        );

        expect(
          result.measurements,
        ).toEqual({
          requested: 2,

          built: 0,

          unavailable: 2,
        });

        expect(
          result.warnings.length,
        ).toBeGreaterThan(0);
      },
    );
  },
);

/**
 * ============================================================
 * COMPLETE CYCLE
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Complete",
  () => {
    it(
      "runs universe → warm/measure/scan → global ranking",
      async () => {
        const universe =
          successfulUniverse([
            "NVDA",
            "AMD",
          ]);

        const nvda =
          scannerCandidate(
            "NVDA",
            94,
            "LONG",
          );

        getMarketUniverseMock
          .mockResolvedValue(
            universe,
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                2,

              warmed:
                2,

              measured:
                2,

              qualified:
                1,

              submitted:
                1,

              candidates: [
                nvda,
              ],

              selectedCandidates: [
                nvda,
              ],

              submissions: [
                {
                  symbol:
                    "NVDA",

                  accepted:
                    true,

                  scannerScore:
                    94,
                },
              ],

              status:
                "COMPLETE",

              approved:
                true,
            }),
          );

        listCandidatesMock
          .mockReturnValue([
            nvda,
          ]);

        getCandidateRegistryStatsMock
          .mockReturnValue({
            total: 1,

            byStatus: {
              QUEUED: 1,
            },
          });

        const result =
          await runAutonomousDiscoveryCycle({
            marketRegime:
              "BULLISH",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          DISCOVERY_CYCLE_STATUS
            .COMPLETE,
        );

        expect(
          getMarketUniverseMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          processUniverseMarketDataMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          processUniverseMarketDataMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            assets:
              universe.assets,

            marketRegime:
              "BULLISH",

            submitForDeepResearch:
              true,

            warmBatch:
              warmAlpacaUniverseBatchMock,
          }),
        );

        expect(
          result.scanner,
        ).toEqual({
          scanned: 2,

          qualified: 1,

          selectedForDeepResearch:
            1,

          submitted: 1,
        });

        expect(
          result.scannerCandidates,
        ).toHaveLength(1);

        expect(
          result.selectedCandidates,
        ).toHaveLength(1);
      },
    );
  },
);

/**
 * ============================================================
 * PARTIAL COVERAGE
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Partial",
  () => {
    it(
      "marks cycle PARTIAL when only some universe symbols produce measurements",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "AAPL",
              "NVDA",
              "TSLA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                3,

              warmed:
                2,

              measured:
                2,

              qualified:
                1,

              submitted:
                1,

              status:
                "PARTIAL",

              approved:
                true,
            }),
          );

        const result =
          await runAutonomousDiscoveryCycle();

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          DISCOVERY_CYCLE_STATUS
            .PARTIAL,
        );

        expect(
          result.measurements,
        ).toEqual({
          requested: 3,

          built: 2,

          unavailable: 1,
        });

        expect(
          result.marketData
            .unavailable,
        ).toBe(1);
      },
    );
  },
);

/**
 * ============================================================
 * GLOBAL CANDIDATES
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Global Ranking",
  () => {
    it(
      "preserves globally ranked scanner candidates separately from selected deep-research candidates",
      async () => {
        const high =
          scannerCandidate(
            "NVDA",
            96,
          );

        const medium =
          scannerCandidate(
            "AMD",
            87,
          );

        const lower =
          scannerCandidate(
            "PLTR",
            79,
          );

        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
              "AMD",
              "PLTR",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                3,

              warmed:
                3,

              measured:
                3,

              qualified:
                3,

              submitted:
                2,

              candidates: [
                high,
                medium,
                lower,
              ],

              selectedCandidates: [
                high,
                medium,
              ],

              submissions: [
                {
                  symbol:
                    "NVDA",

                  accepted:
                    true,
                },

                {
                  symbol:
                    "AMD",

                  accepted:
                    true,
                },
              ],
            }),
          );

        const result =
          await runAutonomousDiscoveryCycle({
            maximumCandidates:
              2,
          });

        expect(
          result.scannerCandidates
            .map(
              item =>
                item.symbol,
            ),
        ).toEqual([
          "NVDA",
          "AMD",
          "PLTR",
        ]);

        expect(
          result.selectedCandidates
            .map(
              item =>
                item.symbol,
            ),
        ).toEqual([
          "NVDA",
          "AMD",
        ]);

        expect(
          result.scanner
            .qualified,
        ).toBe(3);

        expect(
          result.scanner
            .selectedForDeepResearch,
        ).toBe(2);
      },
    );
  },
);

/**
 * ============================================================
 * DEEP RESEARCH WAIT
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Deep Research",
  () => {
    it(
      "does not wait for deep research by default",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                1,

              measured:
                1,

              warmed:
                1,

              qualified:
                1,

              submitted:
                1,
            }),
          );

        await runAutonomousDiscoveryCycle();

        expect(
          waitForIdleMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "can explicitly wait until submitted deep research becomes idle",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                1,

              warmed:
                1,

              measured:
                1,

              qualified:
                1,

              submitted:
                1,
            }),
          );

        await runAutonomousDiscoveryCycle({
          waitForDeepResearch:
            true,
        });

        expect(
          waitForIdleMock,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "does not wait when no candidate was submitted",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                1,

              warmed:
                1,

              measured:
                1,

              qualified:
                1,

              submitted:
                0,
            }),
          );

        await runAutonomousDiscoveryCycle({
          waitForDeepResearch:
            true,
        });

        expect(
          waitForIdleMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "does not wait when deep-research submission is disabled",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              assetsRequested:
                1,

              warmed:
                1,

              measured:
                1,

              qualified:
                1,

              submitted:
                0,
            }),
          );

        await runAutonomousDiscoveryCycle({
          waitForDeepResearch:
            true,

          submitForDeepResearch:
            false,
        });

        expect(
          waitForIdleMock,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/**
 * ============================================================
 * MARKET REGIME
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Market Regime",
  () => {
    it(
      "normalizes BULL to BULLISH",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult(),
          );

        const result =
          await runAutonomousDiscoveryCycle({
            marketRegime:
              "BULL",
          });

        expect(
          result.marketRegime,
        ).toBe(
          "BULLISH",
        );

        expect(
          processUniverseMarketDataMock,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            marketRegime:
              "BULLISH",
          }),
        );
      },
    );

    it(
      "normalizes BEAR to BEARISH",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult(),
          );

        const result =
          await runAutonomousDiscoveryCycle({
            marketRegime:
              "BEAR",
          });

        expect(
          result.marketRegime,
        ).toBe(
          "BEARISH",
        );
      },
    );

    it(
      "normalizes unknown regime values to NEUTRAL",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult(),
          );

        const result =
          await runAutonomousDiscoveryCycle({
            marketRegime:
              "SOMETHING_RANDOM",
          });

        expect(
          result.marketRegime,
        ).toBe(
          "NEUTRAL",
        );
      },
    );
  },
);

/**
 * ============================================================
 * CONFIG FORWARDING
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Configuration",
  () => {
    it(
      "forwards universe, batching, measurement and candidate options",
      async () => {
        const universe =
          successfulUniverse([
            "NVDA",
          ]);

        getMarketUniverseMock
          .mockResolvedValue(
            universe,
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult(),
          );

        await runAutonomousDiscoveryCycle({
          refreshUniverse:
            true,

          maximumUniverseSymbols:
            500,

          maximumCandidates:
            10,

          batchSize:
            75,

          batchConcurrency:
            2,

          maximumCandidatesPerBatch:
            15,

          includeExchanges: [
            "NASDAQ",
            "NYSE",
          ],

          excludeExchanges: [
            "OTC",
          ],

          measurementConfig: {
            minimumCandles:
              75,
          },
        });

        expect(
          getMarketUniverseMock,
        ).toHaveBeenCalledWith({
          refresh: true,

          maximumSymbols:
            500,

          includeExchanges: [
            "NASDAQ",
            "NYSE",
          ],

          excludeExchanges: [
            "OTC",
          ],

          requireTradable:
            true,
        });

        expect(
          processUniverseMarketDataMock,
        ).toHaveBeenCalledWith({
          assets:
            universe.assets,

          warmBatch:
            warmAlpacaUniverseBatchMock,

          batchSize:
            75,

          batchConcurrency:
            2,

          maximumCandidatesPerBatch:
            15,

          maximumCandidatesPerCycle:
            10,

          submitForDeepResearch:
            true,

          marketRegime:
            "NEUTRAL",

          measurementConfig: {
            minimumCandles:
              75,
          },
        });
      },
    );

    it(
      "forwards scanner-only mode to the universe service",
      async () => {
        const universe =
          successfulUniverse([
            "NVDA",
          ]);

        getMarketUniverseMock
          .mockResolvedValue(
            universe,
          );

        processUniverseMarketDataMock
          .mockResolvedValue(
            successfulMarketDataResult({
              submitted:
                0,
            }),
          );

        await runAutonomousDiscoveryCycle({
          submitForDeepResearch:
            false,
        });

        expect(
          processUniverseMarketDataMock,
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
 * FAILURE BOUNDARY
 * ============================================================
 */

describe(
  "Autonomous Discovery Cycle — Failure Boundary",
  () => {
    it(
      "fails safely when universe market-data processing throws",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockRejectedValue(
            new Error(
              "Synthetic universe processing failure",
            ),
          );

        const result =
          await runAutonomousDiscoveryCycle();

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          DISCOVERY_CYCLE_STATUS
            .ERROR,
        );

        expect(
          result.errors,
        ).toContain(
          "Synthetic universe processing failure",
        );
      },
    );

    it(
      "still returns registry and queue state after an unexpected failure",
      async () => {
        getMarketUniverseMock
          .mockResolvedValue(
            successfulUniverse([
              "NVDA",
            ]),
          );

        processUniverseMarketDataMock
          .mockRejectedValue(
            new Error(
              "Synthetic failure",
            ),
          );

        getCandidateRegistryStatsMock
          .mockReturnValue({
            total: 2,

            byStatus: {
              QUEUED: 1,

              COMPLETE: 1,
            },
          });

        getQueueStateMock
          .mockReturnValue({
            pending: 1,

            running: 1,

            maximumConcurrentDeepResearch:
              1,
          });

        const result =
          await runAutonomousDiscoveryCycle();

        expect(
          result.registry.total,
        ).toBe(2);

        expect(
          result.queue.pending,
        ).toBe(1);

        expect(
          result.queue.running,
        ).toBe(1);
      },
    );
  },
);