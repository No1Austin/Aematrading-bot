import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  clearCandidateRegistry,
  getCandidate,
  listCandidates,
  RESEARCH_STATUS,
} from "../scanner/candidateRegistry.js";

import {
  DeepResearchCoordinator,
} from "../scanner/deepResearchCoordinator.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function scannerCandidate({
  symbol = "AAPL",
  scannerScore = 80,
  direction = "LONG",
  qualified = true,
} = {}) {
  return {
    symbol,

    qualified,

    status:
      qualified
        ? "QUALIFIED"
        : "REJECTED",

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
      "Synthetic scanner qualification",
    ],

    longScores: {
      tradabilityLiquidity: 20,
      volume: 12,
      momentum:
        direction === "LONG"
          ? 18
          : 3,
      volatility: 8,
      trend:
        direction === "LONG"
          ? 13
          : 3,
      priceAction:
        direction === "LONG"
          ? 12
          : 2,
      marketRegime: 4,
    },

    shortScores: {
      tradabilityLiquidity: 20,
      volume: 12,
      momentum:
        direction === "SHORT"
          ? 18
          : 3,
      volatility: 8,
      trend:
        direction === "SHORT"
          ? 13
          : 3,
      priceAction:
        direction === "SHORT"
          ? 12
          : 2,
      marketRegime: 4,
    },

    measurements: {
      price: 100,
      relativeVolume: 2,
      marketRegime: "NEUTRAL",
    },

    qualifiedAt:
      new Date().toISOString(),
  };
}

function approvedResearchResult({
  symbol,
  score = 85,
  side = "LONG",
} = {}) {
  return {
    approved: true,

    symbol,

    status: "COMPLETE",

    executionReady: false,

    finalDecision: {
      approved: true,

      side,

      score,

      decision:
        "APPROVED_FOR_RESEARCH",
    },
  };
}

function rejectedResearchResult({
  symbol,
  score = 55,
} = {}) {
  return {
    approved: false,

    symbol,

    status:
      "INSUFFICIENT_DATA",

    executionReady: false,

    finalDecision: {
      approved: false,

      score,

      decision:
        "NO_TRADE",
    },
  };
}

function createDeferred() {
  let resolve;
  let reject;

  const promise =
    new Promise(
      (res, rej) => {
        resolve = res;
        reject = rej;
      },
    );

  return {
    promise,
    resolve,
    reject,
  };
}

/**
 * ============================================================
 * RESET
 * ============================================================
 */

beforeEach(() => {
  clearCandidateRegistry();

  vi.restoreAllMocks();
});

/**
 * ============================================================
 * REGISTRY / SUBMISSION CONTRACT
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Submission Contract",
  () => {
    it(
      "rejects a scanner result that is not qualified",
      () => {
        const researchFunction =
          vi.fn();

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        const result =
          coordinator.submitCandidate(
            scannerCandidate({
              symbol: "AAPL",
              qualified: false,
            }),
          );

        expect(
          result.accepted,
        ).toBe(false);

        expect(
          result.reason,
        ).toBe(
          "CANDIDATE_NOT_QUALIFIED",
        );

        expect(
          researchFunction,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "registers an accepted candidate as queued",
      async () => {
        const gate =
          createDeferred();

        const researchFunction =
          vi.fn(
            async () =>
              gate.promise,
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        const result =
          coordinator.submitCandidate(
            scannerCandidate({
              symbol: "NVDA",
              scannerScore: 88,
            }),
          );

        expect(
          result.accepted,
        ).toBe(true);

        const candidate =
          getCandidate("NVDA");

        expect(candidate).not.toBeNull();

        expect(
          [
            RESEARCH_STATUS.QUEUED,
            RESEARCH_STATUS.RUNNING,
          ],
        ).toContain(
          candidate.researchStatus,
        );

        gate.resolve(
          approvedResearchResult({
            symbol: "NVDA",
          }),
        );

        await coordinator.waitForIdle();
      },
    );
  },
);

/**
 * ============================================================
 * SEQUENTIAL RESEARCH
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Sequential Processing",
  () => {
    it(
      "processes only one deep-research job at a time when concurrency is one",
      async () => {
        let active = 0;
        let maximumActive = 0;

        const executionOrder = [];

        const researchFunction =
          vi.fn(
            async ({ symbol }) => {
              active += 1;

              maximumActive =
                Math.max(
                  maximumActive,
                  active,
                );

              executionOrder.push(
                `START:${symbol}`,
              );

              await new Promise(
                resolve =>
                  setTimeout(
                    resolve,
                    5,
                  ),
              );

              executionOrder.push(
                `END:${symbol}`,
              );

              active -= 1;

              return approvedResearchResult({
                symbol,
              });
            },
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,

            maximumConcurrentDeepResearch:
              1,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "NVDA",
            scannerScore: 90,
          }),
        );

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "AMD",
            scannerScore: 85,
          }),
        );

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "TSLA",
            scannerScore: 80,
          }),
        );

        await coordinator.waitForIdle();

        expect(
          maximumActive,
        ).toBe(1);

        expect(
          executionOrder,
        ).toEqual([
          "START:NVDA",
          "END:NVDA",

          "START:AMD",
          "END:AMD",

          "START:TSLA",
          "END:TSLA",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * PRIORITY
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Queue Priority",
  () => {
    it(
      "prioritizes higher scanner scores among waiting candidates",
      async () => {
        const firstGate =
          createDeferred();

        const executionOrder = [];

        const researchFunction =
          vi.fn(
            async ({ symbol }) => {
              executionOrder.push(
                symbol,
              );

              if (
                symbol === "FIRST"
              ) {
                await firstGate.promise;
              }

              return approvedResearchResult({
                symbol,
              });
            },
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,

            maximumConcurrentDeepResearch:
              1,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "FIRST",
            scannerScore: 99,
          }),
        );

        /**
         * Let FIRST begin running.
         */
        await Promise.resolve();

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "LOW",
            scannerScore: 72,
          }),
        );

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "HIGH",
            scannerScore: 92,
          }),
        );

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "MID",
            scannerScore: 82,
          }),
        );

        firstGate.resolve(
          approvedResearchResult({
            symbol: "FIRST",
          }),
        );

        await coordinator.waitForIdle();

        expect(
          executionOrder,
        ).toEqual([
          "FIRST",
          "HIGH",
          "MID",
          "LOW",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * DUPLICATE PROTECTION
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Duplicate Protection",
  () => {
    it(
      "does not launch duplicate research for the same queued or running symbol",
      async () => {
        const gate =
          createDeferred();

        const researchFunction =
          vi.fn(
            async ({ symbol }) => {
              await gate.promise;

              return approvedResearchResult({
                symbol,
              });
            },
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        const first =
          coordinator.submitCandidate(
            scannerCandidate({
              symbol: "NVDA",
              scannerScore: 90,
            }),
          );

        const second =
          coordinator.submitCandidate(
            scannerCandidate({
              symbol: "nvda",
              scannerScore: 91,
            }),
          );

        expect(
          first.accepted,
        ).toBe(true);

        expect(
          second.accepted,
        ).toBe(false);

        expect(
          second.reason,
        ).toBe("DUPLICATE");

        gate.resolve(
          approvedResearchResult({
            symbol: "NVDA",
          }),
        );

        await coordinator.waitForIdle();

        expect(
          researchFunction,
        ).toHaveBeenCalledTimes(1);
      },
    );
  },
);

/**
 * ============================================================
 * SUCCESSFUL COMPLETION
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Completion",
  () => {
    it(
      "moves an approved research result to COMPLETE",
      async () => {
        const researchFunction =
          vi.fn(
            async ({ symbol }) =>
              approvedResearchResult({
                symbol,
                score: 87,
                side: "LONG",
              }),
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "NVDA",
            scannerScore: 90,
          }),
        );

        await coordinator.waitForIdle();

        const candidate =
          getCandidate("NVDA");

        expect(
          candidate.researchStatus,
        ).toBe(
          RESEARCH_STATUS.COMPLETE,
        );

        expect(
          candidate.deepScore,
        ).toBe(87);

        expect(
          candidate.finalDecision
            ?.side,
        ).toBe("LONG");

        expect(
          candidate.deepResearchResult,
        ).not.toBeNull();

        expect(
          candidate.researchStartedAt,
        ).not.toBeNull();

        expect(
          candidate.researchCompletedAt,
        ).not.toBeNull();
      },
    );
  },
);

/**
 * ============================================================
 * REJECTION
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Rejection",
  () => {
    it(
      "moves a non-approved research result to REJECTED",
      async () => {
        const researchFunction =
          vi.fn(
            async ({ symbol }) =>
              rejectedResearchResult({
                symbol,
                score: 58,
              }),
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "AMD",
            scannerScore: 82,
          }),
        );

        await coordinator.waitForIdle();

        const candidate =
          getCandidate("AMD");

        expect(
          candidate.researchStatus,
        ).toBe(
          RESEARCH_STATUS.REJECTED,
        );

        expect(
          candidate.deepScore,
        ).toBe(58);

        expect(
          candidate.finalDecision
            ?.decision,
        ).toBe("NO_TRADE");
      },
    );
  },
);

/**
 * ============================================================
 * ERROR ISOLATION
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Failure Isolation",
  () => {
    it(
      "marks a failed stock ERROR and continues with the next candidate",
      async () => {
        const consoleError =
          vi.spyOn(
            console,
            "error",
          )
            .mockImplementation(
              () => {},
            );

        const executionOrder = [];

        const researchFunction =
          vi.fn(
            async ({ symbol }) => {
              executionOrder.push(
                symbol,
              );

              if (
                symbol === "BAD"
              ) {
                throw new Error(
                  "Synthetic research failure",
                );
              }

              return approvedResearchResult({
                symbol,
              });
            },
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "BAD",
            scannerScore: 90,
          }),
        );

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "GOOD",
            scannerScore: 80,
          }),
        );

        await coordinator.waitForIdle();

        const bad =
          getCandidate("BAD");

        const good =
          getCandidate("GOOD");

        expect(
          bad.researchStatus,
        ).toBe(
          RESEARCH_STATUS.ERROR,
        );

        expect(
          bad.researchError,
        ).toContain(
          "Synthetic research failure",
        );

        expect(
          good.researchStatus,
        ).toBe(
          RESEARCH_STATUS.COMPLETE,
        );

        expect(
          executionOrder,
        ).toEqual([
          "BAD",
          "GOOD",
        ]);

        consoleError.mockRestore();
      },
    );
  },
);

/**
 * ============================================================
 * TERMINAL CANDIDATE PROTECTION
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Terminal Candidate Protection",
  () => {
    it(
      "does not automatically research an already completed candidate again",
      async () => {
        const researchFunction =
          vi.fn(
            async ({ symbol }) =>
              approvedResearchResult({
                symbol,
              }),
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "NVDA",
            scannerScore: 90,
          }),
        );

        await coordinator.waitForIdle();

        expect(
          researchFunction,
        ).toHaveBeenCalledTimes(1);

        const second =
          coordinator.submitCandidate(
            scannerCandidate({
              symbol: "NVDA",
              scannerScore: 95,
            }),
          );

        expect(
          second.accepted,
        ).toBe(false);

        expect(
          second.reason,
        ).toBe(
          "ALREADY_RESEARCHED",
        );

        await coordinator.waitForIdle();

        expect(
          researchFunction,
        ).toHaveBeenCalledTimes(1);
      },
    );

    it(
      "allows an explicit requeue of a completed candidate",
      async () => {
        const researchFunction =
          vi.fn(
            async ({ symbol }) =>
              approvedResearchResult({
                symbol,
              }),
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "NVDA",
            scannerScore: 90,
          }),
        );

        await coordinator.waitForIdle();

        const second =
          coordinator.submitCandidate(
            scannerCandidate({
              symbol: "NVDA",
              scannerScore: 93,
            }),
            {
              requeue: true,
            },
          );

        expect(
          second.accepted,
        ).toBe(true);

        await coordinator.waitForIdle();

        expect(
          researchFunction,
        ).toHaveBeenCalledTimes(2);

        const candidate =
          getCandidate("NVDA");

        expect(
          candidate.researchStatus,
        ).toBe(
          RESEARCH_STATUS.COMPLETE,
        );

        expect(
          candidate.scannerScore,
        ).toBe(93);
      },
    );
  },
);

/**
 * ============================================================
 * SCANNER / DEEP RESEARCH SEPARATION
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Direction Independence",
  () => {
    it(
      "does not force scanner direction into the deep-research function",
      async () => {
        const receivedOptions = [];

        const researchFunction =
          vi.fn(
            async options => {
              receivedOptions.push(
                options,
              );

              return approvedResearchResult({
                symbol:
                  options.symbol,

                /**
                 * Deliberately disagree with scanner.
                 */
                side: "SHORT",
              });
            },
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "NVDA",
            scannerScore: 90,
            direction: "LONG",
          }),
        );

        await coordinator.waitForIdle();

        expect(
          receivedOptions,
        ).toHaveLength(1);

        expect(
          receivedOptions[0],
        ).toEqual({
          symbol: "NVDA",
        });

        const candidate =
          getCandidate("NVDA");

        expect(
          candidate.preferredDirection,
        ).toBe("LONG");

        expect(
          candidate.finalDecision
            ?.side,
        ).toBe("SHORT");
      },
    );
  },
);

/**
 * ============================================================
 * REGISTRY OUTPUT FOR WEBSITE
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Website Registry",
  () => {
    it(
      "keeps scanner score and deep score as separate values",
      async () => {
        const researchFunction =
          vi.fn(
            async ({ symbol }) =>
              approvedResearchResult({
                symbol,
                score: 88,
              }),
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "NVDA",
            scannerScore: 93,
          }),
        );

        await coordinator.waitForIdle();

        const candidate =
          getCandidate("NVDA");

        expect(
          candidate.scannerScore,
        ).toBe(93);

        expect(
          candidate.deepScore,
        ).toBe(88);

        expect(
          candidate.scannerScore,
        ).not.toBe(
          candidate.deepScore,
        );
      },
    );

    it(
      "returns candidates ranked by scanner score",
      async () => {
        const researchFunction =
          vi.fn(
            async ({ symbol }) =>
              approvedResearchResult({
                symbol,
              }),
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "LOW",
            scannerScore: 72,
          }),
        );

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "HIGH",
            scannerScore: 94,
          }),
        );

        coordinator.submitCandidate(
          scannerCandidate({
            symbol: "MID",
            scannerScore: 83,
          }),
        );

        await coordinator.waitForIdle();

        const candidates =
          listCandidates();

        expect(
          candidates.map(
            candidate =>
              candidate.symbol,
          ),
        ).toEqual([
          "HIGH",
          "MID",
          "LOW",
        ]);
      },
    );
  },
);

/**
 * ============================================================
 * QUEUE IDLE CONTRACT
 * ============================================================
 */

describe(
  "Deep Research Coordinator — Queue State",
  () => {
    it(
      "returns to a fully idle state after all candidates are processed",
      async () => {
        const researchFunction =
          vi.fn(
            async ({ symbol }) =>
              approvedResearchResult({
                symbol,
              }),
          );

        const coordinator =
          new DeepResearchCoordinator({
            researchFunction,
          });

        coordinator.submitCandidates([
          scannerCandidate({
            symbol: "AAPL",
            scannerScore: 90,
          }),

          scannerCandidate({
            symbol: "MSFT",
            scannerScore: 85,
          }),

          scannerCandidate({
            symbol: "NVDA",
            scannerScore: 80,
          }),
        ]);

        await coordinator.waitForIdle();

        const state =
          coordinator.getQueueState();

        expect(
          state.pending,
        ).toBe(0);

        expect(
          state.running,
        ).toBe(0);

        expect(
          state.queuedSymbols,
        ).toEqual([]);

        expect(
          state.runningSymbols,
        ).toEqual([]);
      },
    );
  },
);