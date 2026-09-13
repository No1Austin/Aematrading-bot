import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/**
 * ============================================================
 * CORRELATION EXPOSURE PIPELINE INTEGRATION
 * ============================================================
 *
 * Verifies the orchestrator boundary:
 *
 * Decision Gate
 *   -> Trade Risk
 *   -> Portfolio Risk
 *   -> Correlation Exposure
 *   -> Final paper-execution authorization
 *
 * The standalone correlation engine has its own unit tests.
 * These tests focus on orchestration and safety invariants.
 */

vi.mock("../analysis/technicalIndicatorEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    confidence: 0.9,
    directionalSupport: {
      long: 0.9,
      short: 0.1,
    },
    indicators: {
      atr: {
        value: 2,
      },
    },
  })),
}));

vi.mock("../analysis/macroRegimeEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    confidence: 0.85,
    rawScore: 12,
  })),
}));

vi.mock("../analysis/countryRiskEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    confidence: 0.8,
    rawScore: 8,
  })),
}));

vi.mock("../analysis/companyFundamentalEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    confidence: 0.8,
    rawScore: 8,
    sector: "TECHNOLOGY",
  })),
}));

vi.mock("../analysis/eventIntelligenceEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "NEUTRAL",
    confidence: 0.8,
    rawScore: 8,
    eventFreeze: {
      active: false,
      reasons: [],
    },
  })),
}));

vi.mock("../analysis/socialSentimentEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    confidence: 0.75,
    rawScore: 4,
  })),
}));

vi.mock("../analysis/historicalAnalogueEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    confidence: 0.8,
    rawScore: 4,
    directionalSupport: {
      long: 0.8,
      short: 0.2,
    },
  })),
}));

vi.mock("../analysis/liquidityExecutionEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    executionDecision: "ALLOW",
    qualityScore: 90,
    directionalSupport: {
      long: 0.8,
      short: 0.2,
    },
  })),
}));

vi.mock("../analysis/riskRewardEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    rawScore: 5,
  })),
}));

vi.mock("../regime/marketRegimeEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    regime: "BULL",
    direction: "LONG",
    confidence: 0.9,
    rawScore: 10,
  })),
}));

vi.mock("../analysis/crossEngineConsensusEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    direction: "LONG",
    confidence: 0.9,
    rawScore: 5,
    directionalSupport: {
      long: 0.9,
      short: 0.1,
    },
  })),
}));

vi.mock("../strategy/tradeScoringEngine.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "COMPLETE",
    symbol: "AAPL",
    preferredSide: "LONG",
    preferredScore: 90,
    tradeEligible: true,
    long: {
      score: 90,
    },
    short: {
      score: 20,
    },
  })),
}));

vi.mock("../strategy/tradeDecisionGate.js", () => ({
  default: vi.fn(async () => ({
    approved: true,
    status: "APPROVED",
    decision: "TRADE",
    canProceedToRiskManager: true,
    side: "LONG",
    score: 90,
    reasons: [
      "Decision Gate approved candidate.",
    ],
    warnings: [],
  })),
}));

vi.mock("../history/tradeSetupFingerprint.js", () => ({
  default: vi.fn(async ({
    symbol,
    side,
    asOfTimestamp,
  }) => ({
    approved: true,
    engine: "TRADE_SETUP_FINGERPRINT",
    status: "COMPLETE",
    fingerprint: {
      version: 1,
      symbol,
      side,
      asOfTimestamp,
    },
    warnings: [],
    errors: [],
  })),
}));

vi.mock("../history/tradeSimilarityEngine.js", () => ({
  default: vi.fn(() => ({
    approved: false,
    engine: "TRADE_HISTORY_SIMILARITY",
    status: "INSUFFICIENT_DATA",
    matches: [],
    evaluatedTrades: 0,
    qualifyingTrades: 0,
    warnings: [],
    errors: [],
  })),
}));

vi.mock("../history/tradeHistoryOutcomeEngine.js", () => ({
  default: vi.fn(() => ({
    approved: false,
    engine: "TRADE_HISTORY_OUTCOME",
    status: "INSUFFICIENT_DATA",
    signal: "INSUFFICIENT_DATA",
    confidence: "INSUFFICIENT",
    stats: null,
    directionalSupport: {
      long: null,
      short: null,
    },
    warnings: [],
    errors: [],
  })),
}));

const evaluateRiskApprovalMock =
  vi.fn();

vi.mock("../risk/tradeRiskAdapter.js", () => ({
  default: (...args) =>
    evaluateRiskApprovalMock(
      ...args,
    ),
}));

const evaluatePortfolioRiskMock =
  vi.fn();

vi.mock("../risk/portfolioRiskEngine.js", () => ({
  default: (...args) =>
    evaluatePortfolioRiskMock(
      ...args,
    ),
}));

const evaluateCorrelationExposureMock =
  vi.fn();

vi.mock("../risk/correlationExposureEngine.js", () => ({
  default: (...args) =>
    evaluateCorrelationExposureMock(
      ...args,
    ),
}));

import runTradingAnalysis
  from "../orchestration/engineOrchestrator.js";

function riskApproval({
  shares = 100,
  side = "LONG",
} = {}) {
  return {
    approved: true,
    engine: "TRADE_RISK_APPROVAL",
    status: "APPROVED",
    canExecute: true,
    position: {
      symbol: "AAPL",
      side,
      sector: "TECHNOLOGY",
      shares,
      entryPrice: 100,
      stopPrice:
        side === "LONG"
          ? 99
          : 101,
      riskPerShare: 1,
      dollarRisk: shares,
    },
    reasons: [
      "Trade-level risk approved.",
    ],
    warnings: [],
  };
}

function portfolioApproval({
  originalShares = 100,
  approvedShares = 100,
  status = "APPROVED",
  canExecute = true,
} = {}) {
  return {
    approved:
      canExecute,
    engine:
      "PORTFOLIO_RISK",
    status,
    action:
      canExecute
        ? (
            approvedShares <
            originalShares
              ? "REDUCE"
              : "ALLOW"
          )
        : "BLOCK",
    canExecute,
    exposureMultiplier:
      canExecute
        ? (
            approvedShares /
            originalShares
          )
        : 0,
    originalShares,
    approvedShares:
      canExecute
        ? approvedShares
        : 0,
    reasons: [],
    warnings: [],
  };
}

function correlationApproval({
  originalShares = 100,
  approvedShares = 100,
  status = "APPROVED",
  canExecute = true,
} = {}) {
  return {
    approved:
      canExecute,
    engine:
      "CORRELATION_EXPOSURE",
    status,
    action:
      canExecute
        ? (
            approvedShares <
            originalShares
              ? "REDUCE"
              : "ALLOW"
          )
        : "BLOCK",
    canExecute,
    exposureMultiplier:
      canExecute
        ? (
            approvedShares /
            originalShares
          )
        : 0,
    originalShares,
    approvedShares:
      canExecute
        ? approvedShares
        : 0,
    metrics: {
      evaluatedPositions: 1,
      usableCorrelations: 1,
      coverage: 1,
    },
    reasons: [],
    warnings: [],
    errors: [],
  };
}

function healthyAccount(
  overrides = {},
) {
  return {
    balance: 100000,
    equity: 100000,
    startingEquity: 100000,
    buyingPower: 100000,
    riskPercent: 1,
    status: "ACTIVE",
    tradingBlocked: false,
    accountBlocked: false,
    shortingEnabled: true,
    dailyPnL: 0,
    consecutiveLosses: 0,
    openPositions: [],
    ...overrides,
  };
}

const returnsA = [
  0.01, 0.012, -0.004, 0.008, 0.015,
  -0.006, 0.011, 0.009, -0.003, 0.014,
  0.006, -0.005, 0.013, 0.007, 0.01,
  -0.002, 0.016, 0.005, 0.009, 0.012,
];

const returnsB =
  returnsA.map(
    (value) =>
      value * 0.9,
  );

function analysisInput({
  account =
    healthyAccount(),
  candidateReturns =
    returnsA,
  positionReturns = {},
} = {}) {
  return {
    symbol: "AAPL",
    account,

    correlationInput: {
      candidateReturns,
      positionReturns,
    },

    candles: [],
    breadth: {},
    volatility: {},

    liquidity: {
      price: 100,
      bid: 99.99,
      ask: 100.01,
      currentVolume: 1000000,
      averageVolume: 900000,
      positionValue: 10000,
      volatilityPercent: 1,
      session: "REGULAR",
    },

    riskReward: {
      entryPrice: 100,
      longStopPrice: 99,
      shortStopPrice: 101,
      longTargetPrice: 103,
      shortTargetPrice: 97,
      longTargetR: 3,
      shortTargetR: 3,
      longWinProbability: 0.6,
      shortWinProbability: 0.4,
    },

    macroInput: {},
    countryInput: {},

    companyInput: {
      sector: "TECHNOLOGY",
    },

    events: [],
    socialInput: {},
    historicalRecords: [],

    asOfTimestamp:
      Date.parse(
        "2026-08-22T18:00:00.000Z",
      ),
  };
}

describe(
  "Correlation Exposure Pipeline — Orchestrator Integration",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      evaluateRiskApprovalMock
        .mockResolvedValue(
          riskApproval(),
        );

      evaluatePortfolioRiskMock
        .mockReturnValue(
          portfolioApproval(),
        );

      evaluateCorrelationExposureMock
        .mockReturnValue(
          correlationApproval(),
        );
    });

    it(
      "allows an upstream-approved position through correlation exposure",
      async () => {
        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "CORRELATION_EXPOSURE",
});

        expect(
          result.results
            .correlationExposure
            .status,
        ).toBe(
          "APPROVED",
        );

        expect(
          result.finalDecision
            .canProceedToPaperExecution,
        ).toBe(true);

        expect(
          result.finalDecision
            .position
            .shares,
        ).toBe(100);
      },
    );

    it(
      "passes Portfolio Risk's reduced shares into Correlation Exposure",
      async () => {
        evaluatePortfolioRiskMock
          .mockReturnValueOnce(
            portfolioApproval({
              originalShares: 100,
              approvedShares: 70,
              status: "REDUCED",
            }),
          );

        evaluateCorrelationExposureMock
          .mockImplementationOnce(
            ({
              proposedTrade,
            }) => {
              expect(
                proposedTrade.shares,
              ).toBe(70);

              return correlationApproval({
                originalShares: 70,
                approvedShares: 45,
                status: "REDUCED",
              });
            },
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "CORRELATION_EXPOSURE",
});

        expect(
          result.results
            .portfolioRisk
            .approvedShares,
        ).toBe(70);

        expect(
          result.results
            .correlationExposure
            .approvedShares,
        ).toBe(45);

        expect(
          result.finalDecision
            .position
            .shares,
        ).toBe(45);

        expect(
          result.finalDecision
            .position
            .portfolioRisk
            .approvedShares,
        ).toBe(70);

        expect(
          result.finalDecision
            .position
            .correlationExposure
            .approvedShares,
        ).toBe(45);
      },
    );

    it(
      "blocks paper execution when correlation exposure blocks",
      async () => {
        evaluateCorrelationExposureMock
          .mockReturnValueOnce(
            correlationApproval({
              originalShares: 100,
              approvedShares: 0,
              status: "BLOCKED",
              canExecute: false,
            }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "CORRELATION_EXPOSURE",
});

        expect(
          result.results
            .portfolioRisk
            .canExecute,
        ).toBe(true);

        expect(
          result.results
            .correlationExposure
            .canExecute,
        ).toBe(false);

        expect(
          result.finalDecision
            .canProceedToPaperExecution,
        ).toBe(false);

        expect(
          result.finalDecision
            .decision,
        ).toBe(
          "NO_TRADE",
        );

        expect(
          result.finalDecision
            .position,
        ).toBeNull();
      },
    );

    it(
      "never calls correlation engine when Portfolio Risk blocks",
      async () => {
        evaluatePortfolioRiskMock
          .mockReturnValueOnce(
            portfolioApproval({
              originalShares: 100,
              approvedShares: 0,
              status: "BLOCKED",
              canExecute: false,
            }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "CORRELATION_EXPOSURE",
});

        expect(
          evaluateCorrelationExposureMock,
        ).not.toHaveBeenCalled();

        expect(
          result.results
            .correlationExposure
            .status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.finalDecision
            .canProceedToPaperExecution,
        ).toBe(false);
      },
    );

    it(
      "orchestrator blocks a correlation result that tries to increase shares",
      async () => {
        evaluatePortfolioRiskMock
          .mockReturnValueOnce(
            portfolioApproval({
              originalShares: 100,
              approvedShares: 70,
              status: "REDUCED",
            }),
          );

        evaluateCorrelationExposureMock
          .mockReturnValueOnce(
            correlationApproval({
              originalShares: 70,
              approvedShares: 90,
              status: "APPROVED",
            }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "CORRELATION_EXPOSURE",
});

        expect(
          result.results
            .correlationExposure
            .status,
        ).toBe(
          "BLOCKED",
        );

        expect(
          result.results
            .correlationExposure
            .canExecute,
        ).toBe(false);

        expect(
          result.finalDecision
            .position,
        ).toBeNull();

        expect(
          result.finalDecision
            .canProceedToPaperExecution,
        ).toBe(false);
      },
    );

    it(
      "passes real candidate and open-position return arrays to the correlation engine",
      async () => {
        const account =
          healthyAccount({
            openPositions: [
              {
                symbol: "MSFT",
                side: "LONG",
                shares: 50,
                currentPrice: 100,
                entryPrice: 100,
              },
            ],
          });

        await runTradingAnalysis({
  ...analysisInput({
            account,

            candidateReturns:
              returnsA,

            positionReturns: {
              MSFT:
                returnsB,
            },
          }),
  stopAfter: "CORRELATION_EXPOSURE",
});

        expect(
          evaluateCorrelationExposureMock,
        ).toHaveBeenCalledTimes(1);

        const call =
          evaluateCorrelationExposureMock
            .mock
            .calls[0][0];

        expect(
          call.proposedTrade
            .returns,
        ).toEqual(
          returnsA,
        );

        expect(
          call.openPositions[0]
            .returns,
        ).toEqual(
          returnsB,
        );
      },
    );

    it(
      "does not fabricate missing return data",
      async () => {
        const account =
          healthyAccount({
            openPositions: [
              {
                symbol: "MSFT",
                side: "LONG",
                shares: 50,
                currentPrice: 100,
              },
            ],
          });

        await runTradingAnalysis({
  ...analysisInput({
            account,
            candidateReturns: [],
            positionReturns: {},
          }),
  stopAfter: "CORRELATION_EXPOSURE",
});

        const call =
          evaluateCorrelationExposureMock
            .mock
            .calls[0][0];

        expect(
          call.proposedTrade
            .returns,
        ).toEqual([]);

        expect(
          call.openPositions[0]
            .returns,
        ).toEqual([]);
      },
    );

    it(
      "tracks and exposes Correlation Exposure in orchestrator state",
      async () => {
        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "CORRELATION_EXPOSURE",
});

        expect(
          result.engines
            .correlationExposure
            .engine,
        ).toBe(
          "CORRELATION_EXPOSURE",
        );

        expect(
          result.engines
            .correlationExposure
            .result,
        ).toEqual(
          result.results
            .correlationExposure,
        );

        expect(
          result.finalDecision
            .correlationExposureStatus,
        ).toBe(
          "APPROVED",
        );
      },
    );
  },
);
