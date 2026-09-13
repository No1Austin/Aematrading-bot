// server/src/tests/manualOverridePaperSession.integration.test.js

import {
  describe,
  expect,
  test,
  vi,
} from "vitest";

import createPaperTradingSession from "../execution/paperTradingSession.js";

function belowThresholdAnalysis() {
  return {
    approved: true,
    symbol: "AAPL",
    finalDecision: {
      symbol: "AAPL",
      preferredSide: "LONG",
      preferredScore: 78,
      canProceedToPaperExecution: false,
      timestamp: "2026-08-30T12:00:00.000Z",
    },
    results: {
      scoring: {
        approved: true,
        status: "COMPLETE",
        preferredSide: "LONG",
        preferredScore: 78,
        minimumRequiredScore: 80,
        requiredEnginesReady: true,
        eventFreeze: false,
        ambiguous: false,
      },
      events: {
        approved: true,
        status: "COMPLETE",
        eventFreeze: { active: false },
      },
      riskApproval: {
        canExecute: false,
      },
    },
  };
}

function manualPosition() {
  return {
    id: "manual-aapl-1",
    symbol: "AAPL",
    side: "LONG",
    shares: 10,
    entryPrice: 100,
    currentPrice: 100,
    stopPrice: 95,
    status: "OPEN",
    entryMode: "HUMAN_OVERRIDE",
    managementMode: "BOT",
    managedByBot: true,
  };
}

describe(
  "Paper Trading Session — Manual Override Lifecycle",
  () => {
    test(
      "78 remains blocked on the normal autonomous opening path",
      () => {
        const session =
          createPaperTradingSession();

        const result =
          session.openApprovedTrade({
            analysis:
              belowThresholdAnalysis(),
            currentPrice: 100,
          });

        expect(result.approved)
          .toBe(false);

        expect(
          session.getState()
            .hasOpenPosition,
        ).toBe(false);
      },
    );

    test(
      "one-time human override opens the position and hands management to the bot",
      () => {
        const manualOverrideCoordinator =
          vi.fn(() => ({
            approved: true,
            status: "EXECUTED",
            executed: true,
            entryAuthorized: true,
            riskApproved: true,
            overrideScope:
              "ONE_ENTRY_ONLY",
            position:
              manualPosition(),
          }));

        const session =
          createPaperTradingSession({
            manualOverrideCoordinator,
          });

        const result =
          session.openManualOverrideTrade({
            analysis:
              belowThresholdAnalysis(),
            currentPrice: 100,
          });

        expect(
          manualOverrideCoordinator,
        ).toHaveBeenCalledTimes(1);

        expect(result.approved)
          .toBe(true);

        expect(result.executed)
          .toBe(true);

        expect(
          result.position.entryMode,
        ).toBe("HUMAN_OVERRIDE");

        expect(
          result.position.managementMode,
        ).toBe("BOT");

        expect(
          result.position.managedByBot,
        ).toBe(true);

        expect(
          session.getState()
            .hasOpenPosition,
        ).toBe(true);
      },
    );

    test(
      "manual position uses the same normal position-update pipeline",
      async () => {
        const manualOverrideCoordinator =
          vi.fn(() => ({
            approved: true,
            status: "EXECUTED",
            executed: true,
            position:
              manualPosition(),
          }));

        const processPaperPositionUpdate =
          vi.fn(async ({
            position,
            currentPrice,
          }) => ({
            approved: true,
            status: "POSITION_UPDATED",
            position: {
              ...position,
              currentPrice,
            },
          }));

        const session =
          createPaperTradingSession({
            manualOverrideCoordinator,
            executionCoordinator: {
              executeApprovedPaperTrade:
                vi.fn(),
              processPaperPositionUpdate,
            },
          });

        session.openManualOverrideTrade({
          analysis:
            belowThresholdAnalysis(),
          currentPrice: 100,
        });

        const update =
          await session
            .updateOpenPosition({
              currentPrice: 104,
            });

        expect(
          processPaperPositionUpdate,
        ).toHaveBeenCalledTimes(1);

        expect(
          processPaperPositionUpdate
            .mock.calls[0][0]
            .position
            .entryMode,
        ).toBe("HUMAN_OVERRIDE");

        expect(
          update.position.currentPrice,
        ).toBe(104);

        expect(
          session.position.managedByBot,
        ).toBe(true);
      },
    );

    test(
      "rejected override creates no position",
      () => {
        const session =
          createPaperTradingSession({
            manualOverrideCoordinator:
              vi.fn(() => ({
                approved: false,
                status: "BLOCKED",
                executed: false,
                position: null,
                errors: [],
                warnings: [],
              })),
          });

        const result =
          session.openManualOverrideTrade({
            analysis:
              belowThresholdAnalysis(),
            currentPrice: 100,
          });

        expect(result.approved)
          .toBe(false);

        expect(
          session.getState()
            .hasOpenPosition,
        ).toBe(false);
      },
    );

    test(
      "second manual position is blocked before coordinator is called again",
      () => {
        const coordinator =
          vi.fn(() => ({
            approved: true,
            status: "EXECUTED",
            executed: true,
            position:
              manualPosition(),
          }));

        const session =
          createPaperTradingSession({
            manualOverrideCoordinator:
              coordinator,
          });

        const analysis =
          belowThresholdAnalysis();

        expect(
          session.openManualOverrideTrade({
            analysis,
            currentPrice: 100,
          }).approved,
        ).toBe(true);

        expect(
          session.openManualOverrideTrade({
            analysis,
            currentPrice: 101,
          }).approved,
        ).toBe(false);

        expect(coordinator)
          .toHaveBeenCalledTimes(1);
      },
    );

    test(
      "override does not mutate autonomous threshold or decision",
      () => {
        const analysis =
          belowThresholdAnalysis();

        const session =
          createPaperTradingSession({
            manualOverrideCoordinator:
              vi.fn(() => ({
                approved: true,
                status: "EXECUTED",
                executed: true,
                position:
                  manualPosition(),
              })),
          });

        session.openManualOverrideTrade({
          analysis,
          currentPrice: 100,
        });

        expect(
          analysis.results.scoring
            .minimumRequiredScore,
        ).toBe(80);

        expect(
          analysis.finalDecision
            .canProceedToPaperExecution,
        ).toBe(false);
      },
    );
  },
);
