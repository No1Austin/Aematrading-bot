// server/src/tests/liquidityStressPipeline.integration.test.js

import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  technical: vi.fn(),
  macro: vi.fn(),
  country: vi.fn(),
  company: vi.fn(),
  events: vi.fn(),
  social: vi.fn(),
  historical: vi.fn(),
  liquidity: vi.fn(),
  regime: vi.fn(),
  decision: vi.fn(),
  risk: vi.fn(),
  consensus: vi.fn(),
  scoring: vi.fn(),
  riskReward: vi.fn(),
  fingerprint: vi.fn(),
  similarity: vi.fn(),
  outcome: vi.fn(),
  portfolio: vi.fn(),
  correlation: vi.fn(),
  volatility: vi.fn(),
  drawdown: vi.fn(),
  liquidityStress: vi.fn(),
  executionTiming: vi.fn(),
}));

vi.mock(
  "../analysis/technicalIndicatorEngine.js",
  () => ({
    default:
      mocks.technical,
  }),
);

vi.mock(
  "../analysis/macroRegimeEngine.js",
  () => ({
    default:
      mocks.macro,
  }),
);

vi.mock(
  "../analysis/countryRiskEngine.js",
  () => ({
    default:
      mocks.country,
  }),
);

vi.mock(
  "../analysis/companyFundamentalEngine.js",
  () => ({
    default:
      mocks.company,
  }),
);

vi.mock(
  "../analysis/eventIntelligenceEngine.js",
  () => ({
    default:
      mocks.events,
  }),
);

vi.mock(
  "../analysis/socialSentimentEngine.js",
  () => ({
    default:
      mocks.social,
  }),
);

vi.mock(
  "../analysis/historicalAnalogueEngine.js",
  () => ({
    default:
      mocks.historical,
  }),
);

vi.mock(
  "../analysis/liquidityExecutionEngine.js",
  () => ({
    default:
      mocks.liquidity,
  }),
);

vi.mock(
  "../regime/marketRegimeEngine.js",
  () => ({
    default:
      mocks.regime,
  }),
);

vi.mock(
  "../strategy/tradeDecisionGate.js",
  () => ({
    default:
      mocks.decision,
  }),
);

vi.mock(
  "../risk/tradeRiskAdapter.js",
  () => ({
    default:
      mocks.risk,
  }),
);

vi.mock(
  "../analysis/crossEngineConsensusEngine.js",
  () => ({
    default:
      mocks.consensus,
  }),
);

vi.mock(
  "../strategy/tradeScoringEngine.js",
  () => ({
    default:
      mocks.scoring,
  }),
);

vi.mock(
  "../analysis/riskRewardEngine.js",
  () => ({
    default:
      mocks.riskReward,
  }),
);

vi.mock(
  "../history/tradeSetupFingerprint.js",
  () => ({
    default:
      mocks.fingerprint,
  }),
);

vi.mock(
  "../history/tradeSimilarityEngine.js",
  () => ({
    default:
      mocks.similarity,
  }),
);

vi.mock(
  "../history/tradeHistoryOutcomeEngine.js",
  () => ({
    default:
      mocks.outcome,
  }),
);

vi.mock(
  "../risk/portfolioRiskEngine.js",
  () => ({
    default:
      mocks.portfolio,
  }),
);

vi.mock(
  "../risk/correlationExposureEngine.js",
  () => ({
    default:
      mocks.correlation,
  }),
);

vi.mock(
  "../risk/volatilityRiskEngine.js",
  () => ({
    default:
      mocks.volatility,
  }),
);

vi.mock(
  "../risk/drawdownRecoveryEngine.js",
  () => ({
    default:
      mocks.drawdown,
  }),
);

vi.mock(
  "../risk/liquidityStressEngine.js",
  () => ({
    default:
      mocks.liquidityStress,
  }),
);

vi.mock(
  "../risk/executionTimingEngine.js",
  () => ({
    default:
      mocks.executionTiming,
  }),
);

import runTradingAnalysis
  from "../orchestration/engineOrchestrator.js";

function account(
  overrides = {},
) {
  return {
    balance:
      100000,

    equity:
      100000,

    peakEquity:
      100000,

    startingEquity:
      100000,

    buyingPower:
      100000,

    riskPercent:
      1,

    status:
      "ACTIVE",

    shortingEnabled:
      true,

    tradingBlocked:
      false,

    accountBlocked:
      false,

    dailyPnL:
      0,

    dailyLossLimit:
      2000,

    portfolioExposure:
      0,

    consecutiveLosses:
      0,

    openPositions:
      [],

    recentTrades:
      [],

    ...overrides,
  };
}

function installHealthyPipeline() {
  mocks.technical
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",

      confidence:
        0.9,

      indicators: {
        atr: {
          value:
            2,
        },
      },

      directionalSupport: {
        long:
          0.9,

        short:
          0.1,
      },
    });

  mocks.macro
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",

      confidence:
        0.8,
    });

  mocks.country
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",
    });

  mocks.company
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",

      sector:
        "TECH",
    });

  mocks.events
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",

      eventFreeze: {
        active:
          false,
      },
    });

  mocks.social
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",
    });

  mocks.liquidity
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      executionDecision:
        "ALLOW",
    });

  mocks.riskReward
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",
    });

  mocks.regime
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      regime:
        "BULL",

      direction:
        "LONG",
    });

  mocks.historical
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",
    });

  mocks.fingerprint
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      fingerprint: {
        symbol:
          "AAPL",

        side:
          "LONG",

        asOfTimestamp:
          "2026-08-23T15:00:00.000Z",
      },
    });

  mocks.similarity
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      matches:
        [],

      evaluatedTrades:
        0,

      qualifyingTrades:
        0,
    });

  mocks.outcome
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      signal:
        "NEUTRAL",
    });

  mocks.consensus
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      direction:
        "LONG",
    });

  mocks.scoring
    .mockReturnValue({
      approved:
        true,

      status:
        "COMPLETE",

      preferredSide:
        "LONG",

      preferredScore:
        90,

      long: {
        score:
          90,
      },

      short: {
        score:
          10,
      },

      tradeEligible:
        true,
    });

  mocks.decision
    .mockReturnValue({
      approved:
        true,

      status:
        "APPROVED",

      canProceedToRiskManager:
        true,

      side:
        "LONG",

      score:
        90,

      reasons:
        [],

      warnings:
        [],
    });

  mocks.risk
    .mockReturnValue({
      approved:
        true,

      status:
        "APPROVED",

      canExecute:
        true,

      position: {
        symbol:
          "AAPL",

        side:
          "LONG",

        shares:
          100,

        entryPrice:
          100,
      },

      reasons:
        [],

      warnings:
        [],
    });

  mocks.portfolio
    .mockReturnValue({
      approved:
        true,

      status:
        "APPROVED",

      action:
        "ALLOW",

      canExecute:
        true,

      originalShares:
        100,

      approvedShares:
        100,

      reasons:
        [],

      warnings:
        [],
    });

  mocks.correlation
    .mockReturnValue({
      approved:
        true,

      status:
        "APPROVED",

      action:
        "ALLOW",

      canExecute:
        true,

      originalShares:
        100,

      approvedShares:
        100,

      reasons:
        [],

      warnings:
        [],
    });

  mocks.volatility
    .mockReturnValue({
      approved:
        true,

      status:
        "APPROVED",

      action:
        "ALLOW",

      canExecute:
        true,

      originalShares:
        100,

      approvedShares:
        100,

      reasons:
        [],

      warnings:
        [],
    });

  mocks.drawdown
    .mockReturnValue({
      approved:
        true,

      status:
        "APPROVED",

      action:
        "ALLOW",

      mode:
        "NORMAL",

      canExecute:
        true,

      exposureMultiplier:
        1,

      originalShares:
        100,

      approvedShares:
        100,

      metrics:
        {},

      reasons:
        [],

      warnings:
        [],
    });

  mocks.liquidityStress
    .mockReturnValue({
      approved:
        true,

      status:
        "APPROVED",

      action:
        "ALLOW",

      canExecute:
        true,

      exposureMultiplier:
        1,

      originalShares:
        100,

      approvedShares:
        100,

      metrics:
        {},

      reasons:
        [],

      warnings:
        [],

      errors:
        [],
    });

  mocks.executionTiming
    .mockImplementation(({ proposedTrade }) => ({
      approved: true,
      engine: "EXECUTION_TIMING",
      status: "APPROVED",
      action: "ALLOW",
      canExecute: true,
      exposureMultiplier: 1,
      originalShares: proposedTrade.shares,
      approvedShares: proposedTrade.shares,
      metrics: {},
      reasons: [],
      warnings: [],
      errors: [],
    }));
}

async function run(
  overrides = {},
) {
  return runTradingAnalysis({
    stopAfter: "EXECUTION_TIMING",
    symbol:
      "AAPL",

    account:
      account(),

    candles:
      [],

    volatility:
      {},

    liquidity: {
      price:
        100,

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
    },

    riskReward: {
      entryPrice:
        100,
    },

    historicalRecords:
      [],

    asOfTimestamp:
      "2026-08-23T15:00:00.000Z",

    ...overrides,
  });
}

beforeEach(
  () => {
    vi.clearAllMocks();

    installHealthyPipeline();
  },
);

describe(
  "Execution Timing Pipeline — Orchestrator Integration",
  () => {
    test("allows an upstream-approved position through execution timing", async () => {
      const result = await run();
      expect(mocks.executionTiming).toHaveBeenCalledOnce();
      expect(result.finalDecision.canProceedToPaperExecution).toBe(true);
      expect(result.finalDecision.position.shares).toBe(100);
      expect(result.results.executionTiming.status).toBe("APPROVED");
    });

    test("passes Liquidity Stress's reduced shares into Execution Timing", async () => {
      mocks.liquidityStress.mockReturnValue({
        approved: true, status: "REDUCED", action: "REDUCE", canExecute: true,
        exposureMultiplier: 0.6, originalShares: 100, approvedShares: 60,
        metrics: {}, reasons: [], warnings: [], errors: [],
      });
      const result = await run();
      expect(mocks.executionTiming.mock.calls[0][0].proposedTrade.shares).toBe(60);
      expect(result.finalDecision.position.shares).toBe(60);
    });

    test("allows Execution Timing to reduce the final position", async () => {
      mocks.executionTiming.mockReturnValue({
        approved: true, engine: "EXECUTION_TIMING", status: "REDUCED",
        action: "REDUCE", canExecute: true, exposureMultiplier: 0.5,
        originalShares: 100, approvedShares: 50, metrics: {},
        reasons: ["Timing risk requires lower size."], warnings: [], errors: [],
      });
      const result = await run();
      expect(result.finalDecision.canProceedToPaperExecution).toBe(true);
      expect(result.finalDecision.position.shares).toBe(50);
      expect(result.finalDecision.executionTimingStatus).toBe("REDUCED");
    });

    test("blocks paper execution when Execution Timing blocks", async () => {
      mocks.executionTiming.mockReturnValue({
        approved: false, engine: "EXECUTION_TIMING", status: "BLOCKED",
        action: "BLOCK", canExecute: false, exposureMultiplier: 0,
        originalShares: 100, approvedShares: 0, metrics: {},
        reasons: ["Execution timing is unsafe."], warnings: [], errors: [],
      });
      const result = await run();
      expect(result.finalDecision.canProceedToPaperExecution).toBe(false);
      expect(result.finalDecision.position).toBeNull();
      expect(result.finalDecision.decision).toBe("NO_TRADE");
    });

    test("never calls Execution Timing when Liquidity Stress blocks", async () => {
      mocks.liquidityStress.mockReturnValue({
        approved: false, status: "BLOCKED", action: "BLOCK", canExecute: false,
        exposureMultiplier: 0, originalShares: 100, approvedShares: 0,
        metrics: {}, reasons: [], warnings: [], errors: [],
      });
      const result = await run();
      expect(mocks.executionTiming).not.toHaveBeenCalled();
      expect(result.finalDecision.canProceedToPaperExecution).toBe(false);
    });

    test("orchestrator blocks an Execution Timing result that tries to increase shares", async () => {
      mocks.executionTiming.mockReturnValue({
        approved: true, engine: "EXECUTION_TIMING", status: "APPROVED",
        action: "ALLOW", canExecute: true, exposureMultiplier: 1.5,
        originalShares: 100, approvedShares: 150, metrics: {},
        reasons: [], warnings: [], errors: [],
      });
      const result = await run();
      expect(result.results.executionTiming.canExecute).toBe(false);
      expect(result.results.executionTiming.status).toBe("BLOCKED");
      expect(result.finalDecision.canProceedToPaperExecution).toBe(false);
    });

    test("passes real timing evidence to the Execution Timing engine", async () => {
      const timingInput = {
        timestamp: "2026-08-23T14:40:00.000Z",
        scheduledEventAt: "2026-08-23T14:48:00.000Z",
        minutesUntilScheduledEvent: 8,
        config: { reduceOpeningMinutes: 20 },
      };
      await run({ executionTiming: timingInput });
      const input = mocks.executionTiming.mock.calls[0][0];
      expect(input.timestamp).toBe(timingInput.timestamp);
      expect(input.scheduledEventAt).toBe(timingInput.scheduledEventAt);
      expect(input.minutesUntilScheduledEvent).toBe(8);
      expect(input.config).toEqual(timingInput.config);
      expect(input.proposedTrade.shares).toBe(100);
    });

    test("tracks and exposes Execution Timing in orchestrator state", async () => {
      const result = await run();
      expect(result.engines.executionTiming.engine).toBe("EXECUTION_TIMING");
      expect(result.engines.executionTiming.status).toBe("COMPLETE");
      expect(result.results.executionTiming).toBeTruthy();
      expect(result.finalDecision.executionTimingStatus).toBe("APPROVED");
    });
  },
);
