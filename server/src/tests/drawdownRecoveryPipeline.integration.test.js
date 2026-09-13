import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  technical: vi.fn(), macro: vi.fn(), country: vi.fn(), company: vi.fn(), events: vi.fn(), social: vi.fn(), historical: vi.fn(), liquidity: vi.fn(), regime: vi.fn(), decision: vi.fn(), risk: vi.fn(), consensus: vi.fn(), scoring: vi.fn(), riskReward: vi.fn(), fingerprint: vi.fn(), similarity: vi.fn(), outcome: vi.fn(), portfolio: vi.fn(), correlation: vi.fn(), volatility: vi.fn(), drawdown: vi.fn(),
}));

vi.mock("../analysis/technicalIndicatorEngine.js", () => ({ default: mocks.technical }));
vi.mock("../analysis/macroRegimeEngine.js", () => ({ default: mocks.macro }));
vi.mock("../analysis/countryRiskEngine.js", () => ({ default: mocks.country }));
vi.mock("../analysis/companyFundamentalEngine.js", () => ({ default: mocks.company }));
vi.mock("../analysis/eventIntelligenceEngine.js", () => ({ default: mocks.events }));
vi.mock("../analysis/socialSentimentEngine.js", () => ({ default: mocks.social }));
vi.mock("../analysis/historicalAnalogueEngine.js", () => ({ default: mocks.historical }));
vi.mock("../analysis/liquidityExecutionEngine.js", () => ({ default: mocks.liquidity }));
vi.mock("../regime/marketRegimeEngine.js", () => ({ default: mocks.regime }));
vi.mock("../strategy/tradeDecisionGate.js", () => ({ default: mocks.decision }));
vi.mock("../risk/tradeRiskAdapter.js", () => ({ default: mocks.risk }));
vi.mock("../analysis/crossEngineConsensusEngine.js", () => ({ default: mocks.consensus }));
vi.mock("../strategy/tradeScoringEngine.js", () => ({ default: mocks.scoring }));
vi.mock("../analysis/riskRewardEngine.js", () => ({ default: mocks.riskReward }));
vi.mock("../history/tradeSetupFingerprint.js", () => ({ default: mocks.fingerprint }));
vi.mock("../history/tradeSimilarityEngine.js", () => ({ default: mocks.similarity }));
vi.mock("../history/tradeHistoryOutcomeEngine.js", () => ({ default: mocks.outcome }));
vi.mock("../risk/portfolioRiskEngine.js", () => ({ default: mocks.portfolio }));
vi.mock("../risk/correlationExposureEngine.js", () => ({ default: mocks.correlation }));
vi.mock("../risk/volatilityRiskEngine.js", () => ({ default: mocks.volatility }));
vi.mock("../risk/drawdownRecoveryEngine.js", () => ({ default: mocks.drawdown }));

import runTradingAnalysis from "../orchestration/engineOrchestrator.js";

function account(overrides = {}) {
  return {
    balance: 100000, equity: 100000, peakEquity: 100000, startingEquity: 100000,
    buyingPower: 100000, riskPercent: 1, status: "ACTIVE", shortingEnabled: true,
    tradingBlocked: false, accountBlocked: false, dailyPnL: 0, dailyLossLimit: 2000,
    portfolioExposure: 0, consecutiveLosses: 0, openPositions: [], recentTrades: [],
    ...overrides,
  };
}

function installHealthyPipeline() {
  mocks.technical.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG", confidence: 0.9, indicators: { atr: { value: 2 } }, directionalSupport: { long: .9, short: .1 } });
  mocks.macro.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG", confidence: .8 });
  mocks.country.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG" });
  mocks.company.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG", sector: "TECH" });
  mocks.events.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG", eventFreeze: { active: false } });
  mocks.social.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG" });
  mocks.liquidity.mockReturnValue({ approved: true, status: "COMPLETE", executionDecision: "ALLOW" });
  mocks.riskReward.mockReturnValue({ approved: true, status: "COMPLETE" });
  mocks.regime.mockReturnValue({ approved: true, status: "COMPLETE", regime: "BULL", direction: "LONG" });
  mocks.historical.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG" });
  mocks.fingerprint.mockReturnValue({ approved: true, status: "COMPLETE", fingerprint: { symbol: "AAPL", side: "LONG", asOfTimestamp: "2026-08-23T15:00:00.000Z" } });
  mocks.similarity.mockReturnValue({ approved: true, status: "COMPLETE", matches: [], evaluatedTrades: 0, qualifyingTrades: 0 });
  mocks.outcome.mockReturnValue({ approved: true, status: "COMPLETE", signal: "NEUTRAL" });
  mocks.consensus.mockReturnValue({ approved: true, status: "COMPLETE", direction: "LONG" });
  mocks.scoring.mockReturnValue({ approved: true, status: "COMPLETE", preferredSide: "LONG", preferredScore: 90, long: { score: 90 }, short: { score: 10 }, tradeEligible: true });
  mocks.decision.mockReturnValue({ approved: true, status: "APPROVED", canProceedToRiskManager: true, side: "LONG", score: 90, reasons: [], warnings: [] });
  mocks.risk.mockReturnValue({ approved: true, status: "APPROVED", canExecute: true, position: { symbol: "AAPL", side: "LONG", shares: 100, entryPrice: 100 }, reasons: [], warnings: [] });
  mocks.portfolio.mockReturnValue({ approved: true, status: "APPROVED", action: "ALLOW", canExecute: true, originalShares: 100, approvedShares: 100, reasons: [], warnings: [] });
  mocks.correlation.mockReturnValue({ approved: true, status: "APPROVED", action: "ALLOW", canExecute: true, originalShares: 100, approvedShares: 100, reasons: [], warnings: [] });
  mocks.volatility.mockReturnValue({ approved: true, status: "APPROVED", action: "ALLOW", canExecute: true, originalShares: 100, approvedShares: 100, reasons: [], warnings: [] });
  mocks.drawdown.mockReturnValue({ approved: true, status: "APPROVED", action: "ALLOW", mode: "NORMAL", canExecute: true, exposureMultiplier: 1, originalShares: 100, approvedShares: 100, metrics: {}, reasons: [], warnings: [] });
}

async function run(overrides = {}) {
  return runTradingAnalysis({
    stopAfter: "DRAWDOWN_RECOVERY",
    symbol: "AAPL", account: account(), candles: [], volatility: {},
    liquidity: { price: 100 }, riskReward: { entryPrice: 100 },
    historicalRecords: [], asOfTimestamp: "2026-08-23T15:00:00.000Z",
    ...overrides,
  });
}

beforeEach(() => { vi.clearAllMocks(); installHealthyPipeline(); });

describe("Drawdown Recovery Pipeline — Orchestrator Integration", () => {
  test("allows an upstream-approved position through drawdown recovery", async () => {
    const result = await run();
    expect(mocks.drawdown).toHaveBeenCalledOnce();
    expect(result.finalDecision.canProceedToPaperExecution).toBe(true);
    expect(result.finalDecision.position.shares).toBe(100);
    expect(result.results.drawdownRecovery.status).toBe("APPROVED");
  });

  test("passes Volatility Risk's reduced shares into Drawdown Recovery", async () => {
    mocks.volatility.mockReturnValue({ approved: true, status: "REDUCED", action: "REDUCE", canExecute: true, originalShares: 100, approvedShares: 60, reasons: [], warnings: [] });
    mocks.drawdown.mockImplementation(({ proposedTrade }) => ({ approved: true, status: "APPROVED", action: "ALLOW", mode: "NORMAL", canExecute: true, originalShares: proposedTrade.shares, approvedShares: proposedTrade.shares, reasons: [], warnings: [] }));
    const result = await run();
    expect(mocks.drawdown.mock.calls[0][0].proposedTrade.shares).toBe(60);
    expect(result.finalDecision.position.shares).toBe(60);
  });

  test("allows Drawdown Recovery to reduce the final position", async () => {
    mocks.drawdown.mockReturnValue({ approved: true, status: "REDUCED", action: "REDUCE", mode: "DEFENSIVE", canExecute: true, exposureMultiplier: .5, originalShares: 100, approvedShares: 50, metrics: {}, reasons: ["Recovery sizing active."], warnings: [] });
    const result = await run();
    expect(result.finalDecision.canProceedToPaperExecution).toBe(true);
    expect(result.finalDecision.position.shares).toBe(50);
    expect(result.finalDecision.drawdownRecoveryStatus).toBe("REDUCED");
  });

  test("blocks paper execution when Drawdown Recovery blocks", async () => {
    mocks.drawdown.mockReturnValue({ approved: false, status: "BLOCKED", action: "BLOCK", mode: "BLOCKED", canExecute: false, originalShares: 100, approvedShares: 0, reasons: ["Hard drawdown limit reached."], warnings: [] });
    const result = await run();
    expect(result.finalDecision.canProceedToPaperExecution).toBe(false);
    expect(result.finalDecision.position).toBeNull();
    expect(result.finalDecision.decision).toBe("NO_TRADE");
  });

  test("never calls Drawdown Recovery engine when Volatility Risk blocks", async () => {
    mocks.volatility.mockReturnValue({ approved: false, status: "BLOCKED", action: "BLOCK", canExecute: false, originalShares: 100, approvedShares: 0, reasons: [], warnings: [] });
    const result = await run();
    expect(mocks.drawdown).not.toHaveBeenCalled();
    expect(result.finalDecision.canProceedToPaperExecution).toBe(false);
  });

  test("orchestrator blocks a Drawdown Recovery result that tries to increase shares", async () => {
    mocks.drawdown.mockReturnValue({ approved: true, status: "APPROVED", action: "ALLOW", mode: "NORMAL", canExecute: true, originalShares: 100, approvedShares: 150, reasons: [], warnings: [] });
    const result = await run();
    expect(result.results.drawdownRecovery.canExecute).toBe(false);
    expect(result.results.drawdownRecovery.status).toBe("BLOCKED");
    expect(result.finalDecision.canProceedToPaperExecution).toBe(false);
  });

  test("passes real account recovery state and recent trade history to the engine", async () => {
    const acct = account({ equity: 92000, peakEquity: 100000, startingEquity: 95000, consecutiveLosses: 2, recentTrades: [{ id: "t1", outcome: "LOSS" }, { id: "t2", outcome: "LOSS" }] });
    await run({ account: acct });
    const input = mocks.drawdown.mock.calls[0][0];
    expect(input.account).toBe(acct);
    expect(input.recentTrades).toEqual(acct.recentTrades);
  });

  test("tracks and exposes Drawdown Recovery in orchestrator state", async () => {
    const result = await run();
    expect(result.engines.drawdownRecovery.engine).toBe("DRAWDOWN_RECOVERY");
    expect(result.engines.drawdownRecovery.status).toBe("COMPLETE");
    expect(result.results.drawdownRecovery).toBeTruthy();
  });
});
