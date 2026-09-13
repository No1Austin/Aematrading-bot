// server/src/tests/crossEngineConsensusEngine.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import analyzeCrossEngineConsensus, {
  CONSENSUS_DIRECTION,
  DEFAULT_CONSENSUS_CONFIG,
} from "../analysis/crossEngineConsensusEngine.js";

/**
 * ============================================================
 * TEST HELPERS
 * ============================================================
 */

function directional({
  long = 0.5,
  short = 0.5,
  approved = true,
  status = "COMPLETE",
  ...rest
} = {}) {
  return {
    approved,
    status,
    directionalSupport: {
      long,
      short,
    },
    ...rest,
  };
}

function longEvidence(
  long = 0.8,
  short = 0.2,
) {
  return directional({
    long,
    short,
  });
}

function shortEvidence(
  long = 0.2,
  short = 0.8,
) {
  return directional({
    long,
    short,
  });
}

function neutralEvidence() {
  return directional({
    long: 0.5,
    short: 0.5,
  });
}

function unavailableEvidence(
  status = "INSUFFICIENT_DATA",
) {
  return {
    approved: true,
    status,
    directionalSupport: {
      long: null,
      short: null,
    },
  };
}

function buildStrongLongInputs(
  overrides = {},
) {
  return {
    technical:
      longEvidence(0.9, 0.1),

    macro:
      longEvidence(0.8, 0.2),

    marketRegime:
      longEvidence(0.85, 0.15),

    country:
      longEvidence(0.75, 0.25),

    company:
      longEvidence(0.8, 0.2),

    events:
      longEvidence(0.75, 0.25),

    social:
      longEvidence(0.7, 0.3),

    historical:
      longEvidence(0.75, 0.25),

    liquidity:
      longEvidence(0.7, 0.3),

    riskReward:
      longEvidence(0.85, 0.15),

    ...overrides,
  };
}

function buildStrongShortInputs(
  overrides = {},
) {
  return {
    technical:
      shortEvidence(0.1, 0.9),

    macro:
      shortEvidence(0.2, 0.8),

    marketRegime:
      shortEvidence(0.15, 0.85),

    country:
      shortEvidence(0.25, 0.75),

    company:
      shortEvidence(0.2, 0.8),

    events:
      shortEvidence(0.25, 0.75),

    social:
      shortEvidence(0.3, 0.7),

    historical:
      shortEvidence(0.25, 0.75),

    liquidity:
      shortEvidence(0.3, 0.7),

    riskReward:
      shortEvidence(0.15, 0.85),

    ...overrides,
  };
}

function findEvidence(
  result,
  name,
) {
  return result.evidence.find(
    (item) =>
      item.name === name,
  );
}

/**
 * ============================================================
 * BASE CONSENSUS BEHAVIOUR
 * ============================================================
 */

describe(
  "Cross Engine Consensus — Base Behaviour",
  () => {
    test(
      "strong aligned evidence produces LONG consensus",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs(),
          );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe("COMPLETE");

        expect(
          result.direction,
        ).toBe(
          CONSENSUS_DIRECTION.LONG,
        );

        expect(
          result.directionalSupport
            .long,
        ).toBeGreaterThan(
          result.directionalSupport
            .short,
        );

        expect(
          result.rawScore,
        ).toBeGreaterThan(0);

        expect(
          result.availableEngines,
        ).toBe(10);

        expect(
          result.totalEngines,
        ).toBe(10);
      },
    );

    test(
      "strong aligned evidence produces SHORT consensus",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongShortInputs(),
          );

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.direction,
        ).toBe(
          CONSENSUS_DIRECTION.SHORT,
        );

        expect(
          result.directionalSupport
            .short,
        ).toBeGreaterThan(
          result.directionalSupport
            .long,
        );

        expect(
          result.rawScore,
        ).toBeLessThan(0);
      },
    );

    test(
      "balanced opposing evidence can become conflicted",
      () => {
        const result =
          analyzeCrossEngineConsensus({
            technical:
              longEvidence(0.9, 0.1),

            macro:
              shortEvidence(0.1, 0.9),

            marketRegime:
              longEvidence(0.9, 0.1),

            country:
              shortEvidence(0.1, 0.9),

            company:
              shortEvidence(0.1, 0.9),

            events:
              longEvidence(0.9, 0.1),

            social:
              neutralEvidence(),

            historical:
              neutralEvidence(),

            liquidity:
              neutralEvidence(),

            riskReward:
              neutralEvidence(),
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          [
            CONSENSUS_DIRECTION
              .CONFLICTED,
            CONSENSUS_DIRECTION
              .NEUTRAL,
          ],
        ).toContain(
          result.direction,
        );

        expect(
          Math.abs(
            result.rawScore,
          ),
        ).toBeLessThan(
          DEFAULT_CONSENSUS_CONFIG
            .minimumDirectionalEdge,
        );
      },
    );

    test(
      "insufficient independent evidence fails safely",
      () => {
        const result =
          analyzeCrossEngineConsensus({
            technical:
              longEvidence(),

            macro:
              longEvidence(),

            marketRegime:
              unavailableEvidence(),

            country:
              unavailableEvidence(),

            company:
              unavailableEvidence(),

            events:
              unavailableEvidence(),

            social:
              unavailableEvidence(),

            historical:
              unavailableEvidence(),

            liquidity:
              unavailableEvidence(),

            riskReward:
              unavailableEvidence(),
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );

        expect(
          result.direction,
        ).toBe(
          CONSENSUS_DIRECTION
            .INSUFFICIENT_DATA,
        );

        expect(
          result.directionalSupport,
        ).toEqual({
          long: 0.5,
          short: 0.5,
        });
      },
    );

    test(
      "failed engine result is not counted as available evidence",
      () => {
        const inputs =
          buildStrongLongInputs({
            company: {
              approved: false,
              status: "ERROR",
              direction:
                "LONG",
              confidence: 1,
              directionalSupport: {
                long: 1,
                short: 0,
              },
            },
          });

        const result =
          analyzeCrossEngineConsensus(
            inputs,
          );

        const company =
          findEvidence(
            result,
            "COMPANY",
          );

        expect(
          company.available,
        ).toBe(false);

        expect(
          result.availableEngines,
        ).toBe(9);
      },
    );
  },
);

/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

describe(
  "Cross Engine Consensus — Normalization",
  () => {
    test(
      "directional support is normalized before weighting",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              social:
                directional({
                  long: 8,
                  short: 2,
                }),
            }),
          );

        const social =
          findEvidence(
            result,
            "SOCIAL",
          );

        expect(
          social.available,
        ).toBe(true);

        /**
         * Values are clamped before
         * normalization:
         *
         * long 8 -> 1
         * short 2 -> 1
         *
         * therefore 0.5 / 0.5.
         */
        expect(
          social.directionalSupport,
        ).toEqual({
          long: 0.5,
          short: 0.5,
        });
      },
    );

    test(
      "direction plus confidence can be converted into support",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              social: {
                approved: true,
                status:
                  "COMPLETE",
                direction:
                  "LONG",
                confidence:
                  0.8,
              },
            }),
          );

        const social =
          findEvidence(
            result,
            "SOCIAL",
          );

        expect(
          social.available,
        ).toBe(true);

        expect(
          social.direction,
        ).toBe(
          CONSENSUS_DIRECTION.LONG,
        );

        expect(
          social.directionalSupport
            .long,
        ).toBeGreaterThan(0.5);
      },
    );
  },
);

/**
 * ============================================================
 * INSTITUTIONAL POSITION INTEGRATION
 * ============================================================
 */

describe(
  "Cross Engine Consensus — Institutional Position",
  () => {
    test(
      "institutional evidence is optional and preserves the legacy 10-engine denominator when omitted",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs(),
          );

        expect(
          result.totalEngines,
        ).toBe(10);

        expect(
          result.evidence.some(
            (item) =>
              item.name ===
              "INSTITUTIONAL",
          ),
        ).toBe(false);
      },
    );

    test(
      "supplied institutional evidence becomes an independent eleventh engine",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional:
                longEvidence(
                  0.9,
                  0.1,
                ),
            }),
          );

        expect(
          result.totalEngines,
        ).toBe(11);

        expect(
          result.availableEngines,
        ).toBe(11);

        const institutional =
          findEvidence(
            result,
            "INSTITUTIONAL",
          );

        expect(
          institutional,
        ).toBeDefined();

        expect(
          institutional.available,
        ).toBe(true);

        expect(
          institutional.weight,
        ).toBe(
          DEFAULT_CONSENSUS_CONFIG
            .weights
            .institutional,
        );

        expect(
          institutional.direction,
        ).toBe(
          CONSENSUS_DIRECTION.LONG,
        );
      },
    );

    test(
      "institutional accumulation strengthens LONG consensus",
      () => {
        const baseline =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs(),
          );

        const withInstitutional =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional:
                longEvidence(
                  0.98,
                  0.02,
                ),
            }),
          );

        expect(
          withInstitutional
            .direction,
        ).toBe(
          CONSENSUS_DIRECTION.LONG,
        );

        expect(
          withInstitutional
            .directionalSupport
            .long,
        ).toBeGreaterThan(
          baseline
            .directionalSupport
            .long,
        );
      },
    );

    test(
      "institutional distribution can reduce LONG consensus but cannot independently create execution authority",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional:
                shortEvidence(
                  0.02,
                  0.98,
                ),
            }),
          );

        const institutional =
          findEvidence(
            result,
            "INSTITUTIONAL",
          );

        expect(
          institutional.direction,
        ).toBe(
          CONSENSUS_DIRECTION.SHORT,
        );

        expect(
          result.engine,
        ).toBe(
          "CROSS_ENGINE_CONSENSUS",
        );

        expect(
          result,
        ).not.toHaveProperty(
          "canExecute",
        );

        expect(
          result,
        ).not.toHaveProperty(
          "tradeEligible",
        );

        expect(
          result,
        ).not.toHaveProperty(
          "canProceedToRiskManager",
        );
      },
    );

    test(
      "institutional insufficient-data result does not become usable evidence",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional:
                unavailableEvidence(),
            }),
          );

        const institutional =
          findEvidence(
            result,
            "INSTITUTIONAL",
          );

        expect(
          result.totalEngines,
        ).toBe(11);

        expect(
          result.availableEngines,
        ).toBe(10);

        expect(
          institutional.available,
        ).toBe(false);

        expect(
          institutional.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );
      },
    );

    test(
      "institutional ERROR result is excluded from directional consensus",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional: {
                approved: false,
                status:
                  "ERROR",
                direction:
                  "LONG",
                confidence:
                  1,
                directionalSupport: {
                  long: 1,
                  short: 0,
                },
              },
            }),
          );

        const institutional =
          findEvidence(
            result,
            "INSTITUTIONAL",
          );

        expect(
          institutional.available,
        ).toBe(false);

        expect(
          result.availableEngines,
        ).toBe(10);
      },
    );

    test(
      "institutional evidence uses consensus influence weight and does not add trade-score points",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional:
                longEvidence(
                  0.9,
                  0.1,
                ),
            }),
          );

        const institutional =
          findEvidence(
            result,
            "INSTITUTIONAL",
          );

        expect(
          institutional.weight,
        ).toBe(0.75);

        expect(
          institutional,
        ).not.toHaveProperty(
          "points",
        );

        expect(
          result,
        ).not.toHaveProperty(
          "score",
        );

        expect(
          result,
        ).not.toHaveProperty(
          "maximumScore",
        );
      },
    );
  },
);

/**
 * ============================================================
 * COVERAGE
 * ============================================================
 */

describe(
  "Cross Engine Consensus — Coverage",
  () => {
    test(
      "optional institutional engine changes denominator only when supplied",
      () => {
        const withoutInstitutional =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs(),
          );

        const withInstitutional =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional:
                unavailableEvidence(),
            }),
          );

        expect(
          withoutInstitutional
            .totalEngines,
        ).toBe(10);

        expect(
          withInstitutional
            .totalEngines,
        ).toBe(11);

        expect(
          withInstitutional
            .coverage,
        ).toBeLessThan(
          withoutInstitutional
            .coverage,
        );
      },
    );

    test(
      "all usable engines produce full weighted coverage",
      () => {
        const result =
          analyzeCrossEngineConsensus(
            buildStrongLongInputs({
              institutional:
                longEvidence(),
            }),
          );

        expect(
          result.coverage,
        ).toBe(1);

        expect(
          result.availableEngines,
        ).toBe(
          result.totalEngines,
        );
      },
    );
  },
);
