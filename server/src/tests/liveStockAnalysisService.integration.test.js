import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * ============================================================
 * MOCK STOCK ANALYSIS RUNNER
 * ============================================================
 */

const runStockAnalysisMock =
  vi.fn();

vi.mock(
  "../services/stockAnalysisRunner.js",
  () => ({
    default:
      runStockAnalysisMock,
  }),
);

/**
 * ============================================================
 * MOCK LIVE PROVIDERS
 * ============================================================
 */

const companyProviderMock =
  vi.fn();

const macroProviderMock =
  vi.fn();

const countryProviderMock =
  vi.fn();

const eventsProviderMock =
  vi.fn();

vi.mock(
  "../data/providers/companyFundamentalAggregator.js",
  () => ({
    getAggregatedCompanyFundamentalData:
      companyProviderMock,

    default:
      companyProviderMock,
  }),
);

vi.mock(
  "../data/providers/usMacroDataProvider.js",
  () => ({
    getUSMacroData:
      macroProviderMock,
  }),
);

vi.mock(
  "../data/providers/usCountryRiskDataProvider.js",
  () => ({
    getUSCountryRiskData:
      countryProviderMock,
  }),
);

vi.mock(
  "../data/providers/marketEventDataProvider.js",
  () => ({
    getMarketEvents:
      eventsProviderMock,
  }),
);

const {
  default: runLiveStockAnalysis,

  runLiveStockAnalysisOnly,

  LIVE_STOCK_PROVIDERS,
} =
  await import(
    "../services/liveStockAnalysisService.js"
  );

/**
 * ============================================================
 * FIXTURES
 * ============================================================
 */

function approvedRunnerResult({
  executionReady =
    true,

  approved =
    true,
} = {}) {
  return {
    approved,

    service:
      "STOCK_ANALYSIS_RUNNER",

    status:
      executionReady
        ? "COMPLETE"
        : "ANALYSIS_ONLY",

    symbol:
      "AAPL",

    executionReady,

    market: {
      quoteFresh:
        true,
    },

    providers: {
      company: {
        approved:
          true,
      },

      macro: {
        approved:
          true,
      },

      country: {
        approved:
          true,
      },

      events: {
        approved:
          true,
      },
    },

    analysis: {
      approved:
        true,
    },

    finalDecision: {
      canProceedToPaperExecution:
        executionReady,

      decision:
        executionReady
          ? "APPROVED_FOR_PAPER_EXECUTION"
          : "NO_TRADE",
    },

    warnings: [],

    errors: [],
  };
}

function rejectedRunnerResult() {
  return {
    approved:
      true,

    service:
      "STOCK_ANALYSIS_RUNNER",

    status:
      "ANALYSIS_ONLY",

    symbol:
      "AAPL",

    executionReady:
      false,

    market: {
      quoteFresh:
        true,
    },

    providers: {},

    analysis: {
      approved:
        true,
    },

    finalDecision: {
      canProceedToPaperExecution:
        false,

      decision:
        "NO_TRADE",
    },

    warnings: [],

    errors: [],
  };
}

/**
 * ============================================================
 * TESTS
 * ============================================================
 */

describe(
  "Live Stock Analysis Service",
  () => {
    beforeEach(
      () => {
        vi.clearAllMocks();

        runStockAnalysisMock
          .mockResolvedValue(
            approvedRunnerResult(),
          );

        companyProviderMock
          .mockResolvedValue({
            approved:
              true,

            data: {
              symbol:
                "AAPL",
            },
          });

        macroProviderMock
          .mockResolvedValue({
            approved:
              true,

            data: {
              regime:
                "EXPANSION",
            },
          });

        countryProviderMock
          .mockResolvedValue({
            approved:
              true,

            data: {
              country:
                "US",
            },
          });

        eventsProviderMock
          .mockResolvedValue({
            approved:
              true,

            events: [],
          });
      },
    );

    it(
      "fails closed when symbol is missing",
      async () => {
        const result =
          await runLiveStockAnalysis({
            symbol:
              "",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INVALID_REQUEST",
        );

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          runStockAnalysisMock,
        ).not
          .toHaveBeenCalled();
      },
    );

    it(
      "injects the real provider set into stockAnalysisRunner",
      async () => {
        await runLiveStockAnalysis({
          symbol:
            "aapl",
        });

        expect(
          runStockAnalysisMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const call =
          runStockAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.symbol,
        ).toBe(
          "AAPL",
        );

        expect(
          call.providers.company,
        ).toBe(
          LIVE_STOCK_PROVIDERS
            .company,
        );

        expect(
          call.providers.macro,
        ).toBe(
          LIVE_STOCK_PROVIDERS
            .macro,
        );

        expect(
          call.providers.country,
        ).toBe(
          LIVE_STOCK_PROVIDERS
            .country,
        );

        expect(
          call.providers.events,
        ).toBe(
          LIVE_STOCK_PROVIDERS
            .events,
        );
      },
    );

    it(
      "forwards live social configuration",
      async () => {
        await runLiveStockAnalysis({
          symbol:
            "AAPL",

          useLiveSocial:
            true,

          liveSocialConfig: {
            sources: [
              "REDDIT",
            ],
          },
        });

        const call =
          runStockAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.useLiveSocial,
        ).toBe(true);

        expect(
          call.liveSocialConfig,
        ).toEqual({
          sources: [
            "REDDIT",
          ],
        });
      },
    );

    it(
      "forwards explicit analysis inputs",
      async () => {
        const inputs = {
          breadth: {
            advancers:
              100,

            decliners:
              80,
          },

          account: {
            equity:
              100_000,
          },
        };

        await runLiveStockAnalysis({
          symbol:
            "AAPL",

          inputs,
        });

        const call =
          runStockAnalysisMock
            .mock
            .calls[0][0];

    expect(
  call.inputs,
).toEqual({
  ...inputs,

  historicalRecords: [],
});

      },
    );

    it(
      "requires runner approval before execution readiness",
      async () => {
        runStockAnalysisMock
          .mockResolvedValue(
            approvedRunnerResult({
              executionReady:
                true,

              approved:
                false,
            }),
          );

        const result =
          await runLiveStockAnalysis({
            symbol:
              "AAPL",
          });

        expect(
          result.executionReady,
        ).toBe(false);
      },
    );

    it(
      "requires runner execution readiness",
      async () => {
        runStockAnalysisMock
          .mockResolvedValue(
            rejectedRunnerResult(),
          );

        const result =
          await runLiveStockAnalysis({
            symbol:
              "AAPL",
          });

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_ONLY",
        );
      },
    );

    it(
      "requires finalDecision canProceedToPaperExecution",
      async () => {
        const runner =
          approvedRunnerResult({
            executionReady:
              true,
          });

        runner
          .finalDecision
          .canProceedToPaperExecution =
          false;

        runStockAnalysisMock
          .mockResolvedValue(
            runner,
          );

        const result =
          await runLiveStockAnalysis({
            symbol:
              "AAPL",
          });

        expect(
          result.executionReady,
        ).toBe(false);
      },
    );

    it(
      "allows execution readiness only when all live-service gates agree",
      async () => {
        runStockAnalysisMock
          .mockResolvedValue(
            approvedRunnerResult({
              executionReady:
                true,

              approved:
                true,
            }),
          );

        const result =
          await runLiveStockAnalysis({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.executionReady,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "COMPLETE",
        );
      },
    );

    it(
      "stopAfter always disables execution readiness",
      async () => {
        runStockAnalysisMock
          .mockResolvedValue(
            approvedRunnerResult({
              executionReady:
                true,
            }),
          );

        const result =
          await runLiveStockAnalysis({
            symbol:
              "AAPL",

            stopAfter:
              "VOLATILITY_RISK",
          });

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_ONLY",
        );
      },
    );

    it(
      "analysis-only convenience function always disables execution",
      async () => {
        runStockAnalysisMock
          .mockResolvedValue(
            approvedRunnerResult({
              executionReady:
                true,
            }),
          );

        const result =
          await runLiveStockAnalysisOnly({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ANALYSIS_ONLY",
        );
      },
    );

    it(
      "fails safely when stockAnalysisRunner throws",
      async () => {
        runStockAnalysisMock
          .mockRejectedValue(
            new Error(
              "Runner exploded",
            ),
          );

        const result =
          await runLiveStockAnalysis({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ERROR",
        );

        expect(
          result.errors,
        ).toContain(
          "Runner exploded",
        );
      },
    );

    it(
      "fails safely when runner returns null",
      async () => {
        runStockAnalysisMock
          .mockResolvedValue(
            null,
          );

        const result =
          await runLiveStockAnalysis({
            symbol:
              "AAPL",
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.executionReady,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "ERROR",
        );
      },
    );

    it(
      "normalizes invalid liveSocialConfig to an empty object",
      async () => {
        await runLiveStockAnalysis({
          symbol:
            "AAPL",

          liveSocialConfig:
            "bad-config",
        });

        const call =
          runStockAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.liveSocialConfig,
        ).toEqual({});
      },
    );

    it(
      "normalizes invalid inputs to an empty object",
      async () => {
        await runLiveStockAnalysis({
          symbol:
            "AAPL",

          inputs:
            "bad-input",
        });

        const call =
          runStockAnalysisMock
            .mock
            .calls[0][0];

     expect(
  call.inputs,
).toEqual({
  historicalRecords: [],
});

      },
    );

    it(
      "coerces invalid timeout configuration back to safe defaults",
      async () => {
        await runLiveStockAnalysis({
          symbol:
            "AAPL",

          providerTimeoutMs:
            -10,

          engineTimeoutMs:
            0,

          runnerTimeoutMs:
            "bad",

          minimumCandles:
            -5,
        });

        const call =
          runStockAnalysisMock
            .mock
            .calls[0][0];

        expect(
          call.providerTimeoutMs,
        ).toBe(
          30_000,
        );

        expect(
          call.engineTimeoutMs,
        ).toBe(
          30_000,
        );

        expect(
          call.runnerTimeoutMs,
        ).toBe(
          45_000,
        );

        expect(
          call.minimumCandles,
        ).toBe(
          50,
        );
      },
    );

    it(
      "LIVE_STOCK_PROVIDERS call the underlying production providers",
      async () => {
        await LIVE_STOCK_PROVIDERS
          .company({
            symbol:
              "AAPL",
          });

        await LIVE_STOCK_PROVIDERS
          .macro({
            asOfDate:
              "2026-08-20",
          });

        await LIVE_STOCK_PROVIDERS
          .country({
            asOfDate:
              "2026-08-20",
          });

        await LIVE_STOCK_PROVIDERS
          .events({
            symbol:
              "AAPL",

            country:
              "US",

            asOfTimestamp:
              "2026-08-20T12:00:00.000Z",
          });

     expect(
  companyProviderMock,
).toHaveBeenCalledWith({
  symbol:
    "AAPL",

  asOfDate:
    null,
});

        expect(
          macroProviderMock,
        ).toHaveBeenCalledWith({
          asOfDate:
            "2026-08-20",
        });

        expect(
          countryProviderMock,
        ).toHaveBeenCalledWith({
          asOfDate:
            "2026-08-20",
        });

        expect(
          eventsProviderMock,
        ).toHaveBeenCalledWith({
          symbol:
            "AAPL",

          country:
            "US",

          asOfTimestamp:
            "2026-08-20T12:00:00.000Z",
        });
      },
    );
  },
);