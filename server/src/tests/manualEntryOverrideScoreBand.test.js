// server/src/tests/manualEntryOverrideScoreBand.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import {
  evaluateManualEntryOverride,
  DEFAULT_MANUAL_OVERRIDE_CONFIG,
} from "../execution/manualEntryOverrideCoordinator.js";

function buildAnalysis({
  score,
  autonomousThreshold = 80,
} = {}) {
  return {
    approved: true,

    symbol: "AAPL",

    finalDecision: {
      symbol: "AAPL",

      preferredSide:
        "LONG",

      preferredScore:
        score,

      timestamp:
        "2026-08-30T16:00:00.000Z",
    },

    results: {
      scoring: {
        approved: true,

        status:
          "BELOW_THRESHOLD",

        symbol: "AAPL",

        preferredSide:
          "LONG",

        preferredScore:
          score,

        minimumRequiredScore:
          autonomousThreshold,

        eventFreeze:
          false,

        ambiguous:
          false,

        requiredEnginesReady:
          true,
      },

      events: {
        approved: true,

        status:
          "COMPLETE",

        eventFreeze: {
          active: false,
        },
      },
    },
  };
}

function buildAccount() {
  return {
    balance:
      10_000,

    equity:
      10_000,

    buyingPower:
      10_000,

    status:
      "ACTIVE",

    tradingBlocked:
      false,

    accountBlocked:
      false,

    shortingEnabled:
      true,

    openPositions:
      [],
  };
}

describe(
  "Manual Entry Override — Score Authority Band",
  () => {
    test(
      "configured manual score floor is zero",
      () => {
        expect(
          DEFAULT_MANUAL_OVERRIDE_CONFIG
            .minimumOverrideScore,
        ).toBe(0);
      },
    );

    test.each([
      0,
      1,
      15,
      45,
      69,
      70,
      75,
      78,
      79,
      79.99,
    ])(
      "score %s is eligible for one-time human override",
      score => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.entryAuthorized,
        ).toBe(true);

        expect(
          result.overrideScope,
        ).toBe(
          "ONE_ENTRY_ONLY",
        );

        expect(
          result.autonomousApproved,
        ).toBe(false);

        expect(
          result.autonomousThreshold,
        ).toBe(80);
      },
    );

    test.each([
      80,
      81,
      90,
      100,
    ])(
      "score %s belongs to the autonomous path, not manual override",
      score => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.reasons.some(
            reason =>
              reason.includes(
                "autonomous score threshold",
              ),
          ),
        ).toBe(true);
      },
    );

    test.each([
      -0.01,
      -1,
      100.01,
      101,
    ])(
      "malformed out-of-range score %s is rejected",
      score => {
        const result =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score,
              }),

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.reasons,
        ).toContain(
          "Trade score must be between 0 and 100.",
        );
      },
    );

    test(
      "manual entry does not alter the autonomous threshold",
      () => {
        const analysis =
          buildAnalysis({
            score: 20,
          });

        const result =
          evaluateManualEntryOverride({
            analysis,

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          analysis
            .results
            .scoring
            .minimumRequiredScore,
        ).toBe(80);
      },
    );

    test(
      "the manual band follows the configured autonomous threshold",
      () => {
        const below =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score: 84,

                autonomousThreshold:
                  85,
              }),

            account:
              buildAccount(),
          });

        const atThreshold =
          evaluateManualEntryOverride({
            analysis:
              buildAnalysis({
                score: 85,

                autonomousThreshold:
                  85,
              }),

            account:
              buildAccount(),
          });

        expect(
          below.approved,
        ).toBe(true);

        expect(
          atThreshold.approved,
        ).toBe(false);
      },
    );

    /**
     * Score authority and safety authority are separate.
     *
     * A score of zero can be manually authorized from a SCORE
     * perspective, but unrelated safety gates still remain valid.
     */
    test(
      "score zero does not bypass an event freeze",
      () => {
        const analysis =
          buildAnalysis({
            score: 0,
          });

        analysis
          .results
          .events
          .eventFreeze
          .active =
          true;

        const result =
          evaluateManualEntryOverride({
            analysis,

            account:
              buildAccount(),
          });

        expect(
          result.approved,
        ).toBe(false);
      },
    );
  },
);
