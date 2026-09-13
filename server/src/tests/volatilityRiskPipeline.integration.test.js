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


const evaluateVolatilityRiskMock =
  vi.fn();

vi.mock("../risk/volatilityRiskEngine.js", () => ({
  default: (...args) =>
    evaluateVolatilityRiskMock(
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


function volatilityApproval({
  originalShares = 100,
  approvedShares = 100,
  status = "APPROVED",
  canExecute = true,
} = {}) {
  return {
    approved: canExecute,
    engine: "VOLATILITY_RISK",
    status,
    action:
      canExecute
        ? (approvedShares < originalShares
            ? "REDUCE"
            : "ALLOW")
        : "BLOCK",
    canExecute,
    exposureMultiplier:
      canExecute
        ? approvedShares / originalShares
        : 0,
    originalShares,
    approvedShares:
      canExecute ? approvedShares : 0,
    metrics: {
      atrPercent: 2,
      realizedVolatility: 0.2,
      baselineVolatility: 0.18,
      volatilityRegime: "NORMAL",
      shockActive: false,
      evidenceCount: 4,
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
    volatility: {
      atrPercent: 2,
      realizedVolatility: 0.2,
      baselineVolatility: 0.18,
      volatilityRegime: "NORMAL",
      shockActive: false,
    },

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
  "Volatility Risk Pipeline — Orchestrator Integration",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      evaluateRiskApprovalMock
        .mockReturnValue(
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

      evaluateVolatilityRiskMock
        .mockReturnValue(
          volatilityApproval(),
        );
    });

    it(
      "allows an upstream-approved position through volatility risk",
      async () => {
        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        expect(
          evaluateVolatilityRiskMock,
        ).toHaveBeenCalledTimes(1);

        expect(
          result.results
            .volatilityRisk
            .canExecute,
        ).toBe(true);

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
      "passes Correlation Exposure's reduced shares into Volatility Risk",
      async () => {
        evaluateCorrelationExposureMock
          .mockReturnValue(
            correlationApproval({
              originalShares: 100,
              approvedShares: 60,
              status: "REDUCED",
            }),
          );

        evaluateVolatilityRiskMock
          .mockImplementation(
            ({ proposedTrade }) =>
              volatilityApproval({
                originalShares:
                  proposedTrade.shares,
                approvedShares:
                  proposedTrade.shares,
              }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        const call =
          evaluateVolatilityRiskMock
            .mock.calls[0][0];

        expect(
          call.proposedTrade.shares,
        ).toBe(60);

        expect(
          result.finalDecision
            .position
            .shares,
        ).toBe(60);
      },
    );

    it(
      "allows Volatility Risk to reduce the final position",
      async () => {
        evaluateVolatilityRiskMock
          .mockReturnValue(
            volatilityApproval({
              originalShares: 100,
              approvedShares: 50,
              status: "REDUCED",
            }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        expect(
          result.finalDecision
            .position
            .shares,
        ).toBe(50);

        expect(
          result.finalDecision
            .volatilityRiskStatus,
        ).toBe("REDUCED");
      },
    );

    it(
      "blocks paper execution when volatility risk blocks",
      async () => {
        evaluateVolatilityRiskMock
          .mockReturnValue(
            volatilityApproval({
              originalShares: 100,
              approvedShares: 0,
              status: "BLOCKED",
              canExecute: false,
            }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        expect(
          result.finalDecision
            .canProceedToPaperExecution,
        ).toBe(false);

        expect(
          result.finalDecision.position,
        ).toBeNull();
      },
    );

    it(
      "never calls volatility risk when Correlation Exposure blocks",
      async () => {
        evaluateCorrelationExposureMock
          .mockReturnValue(
            correlationApproval({
              canExecute: false,
              status: "BLOCKED",
            }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        expect(
          evaluateVolatilityRiskMock,
        ).not.toHaveBeenCalled();

        expect(
          result.finalDecision
            .canProceedToPaperExecution,
        ).toBe(false);
      },
    );

    it(
      "orchestrator blocks a volatility result that tries to increase shares",
      async () => {
        evaluateCorrelationExposureMock
          .mockReturnValue(
            correlationApproval({
              originalShares: 100,
              approvedShares: 60,
              status: "REDUCED",
            }),
          );

        evaluateVolatilityRiskMock
          .mockReturnValue(
            volatilityApproval({
              originalShares: 60,
              approvedShares: 80,
              status: "APPROVED",
            }),
          );

        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        expect(
          result.results
            .volatilityRisk
            .canExecute,
        ).toBe(false);

        expect(
          result.finalDecision
            .canProceedToPaperExecution,
        ).toBe(false);

        expect(
          result.results
            .volatilityRisk
            .reasons,
        ).toContain(
          "Volatility Risk attempted to increase an upstream-approved position.",
        );
      },
    );

    it(
      "passes real volatility evidence and technical ATR to the volatility engine",
      async () => {
        await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        const call =
          evaluateVolatilityRiskMock
            .mock.calls[0][0];

        expect(
          call.volatility.atrPercent,
        ).toBe(2);

        expect(
          call.volatility.realizedVolatility,
        ).toBe(0.2);

        expect(
          call.volatility.atr,
        ).toBe(2);
      },
    );

    it(
      "tracks and exposes Volatility Risk in orchestrator state",
      async () => {
        const result =
          await runTradingAnalysis({
  ...analysisInput(),
  stopAfter: "VOLATILITY_RISK",
});

        expect(
          result.engines
            .volatilityRisk
            .engine,
        ).toBe("VOLATILITY_RISK");

        expect(
          result.engines
            .volatilityRisk
            .status,
        ).toBe("COMPLETE");

        expect(
          result.results
            .volatilityRisk,
        ).toBeDefined();
      },
    );
  },
);
