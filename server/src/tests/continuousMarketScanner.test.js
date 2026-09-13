import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  ContinuousMarketScanner,
  CONTINUOUS_SCANNER_STATUS,
} from "../scanner/continuousMarketScanner.js";

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

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

function successfulCycleResult(
  overrides = {},
) {
  return {
    approved: true,

    service:
      "AUTONOMOUS_DISCOVERY_CYCLE",

    status:
      "COMPLETE",

    scanner: {
      scanned: 100,
      qualified: 5,
      selectedForDeepResearch: 3,
      submitted: 3,
    },

    ...overrides,
  };
}

/**
 * ============================================================
 * TIMER SETUP
 * ============================================================
 */

beforeEach(() => {
  vi.useFakeTimers();
});

/**
 * ============================================================
 * BASIC CONTRACT
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Basic Contract",
  () => {
    it(
      "starts in STOPPED state",
      () => {
        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction:
              vi.fn(),
          });

        const state =
          scanner.getState();

        expect(
          state.status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .STOPPED,
        );

        expect(
          state.active,
        ).toBe(false);

        expect(
          state.runningCycle,
        ).toBe(false);
      },
    );

    it(
      "rejects non-function discovery dependency",
      () => {
        expect(
          () =>
            new ContinuousMarketScanner({
              discoveryFunction:
                null,
            }),
        ).toThrow(
          /discoveryFunction/,
        );
      },
    );
  },
);

/**
 * ============================================================
 * START
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Start",
  () => {
    it(
      "runs an immediate discovery cycle by default",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            intervalMs:
              60_000,
          });

        const state =
          await scanner.start();

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          state.status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .RUNNING,
        );

        expect(
          state.cycleCount,
        ).toBe(1);

        expect(
          state.lastResult
            ?.approved,
        ).toBe(true);

        await scanner.stop();
      },
    );

    it(
      "can start without an immediate cycle",
      async () => {
        const discoveryFunction =
          vi.fn();

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            runImmediately:
              false,

            intervalMs:
              60_000,
          });

        const state =
          await scanner.start();

        expect(
          discoveryFunction,
        ).not.toHaveBeenCalled();

        expect(
          state.status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .RUNNING,
        );

        expect(
          state.nextCycleAt,
        ).not.toBeNull();

        await scanner.stop();
      },
    );

    it(
      "is idempotent when start is called twice",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            intervalMs:
              60_000,
          });

        await scanner.start();
        await scanner.start();

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          1,
        );

        await scanner.stop();
      },
    );
  },
);

/**
 * ============================================================
 * SCHEDULING
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Scheduling",
  () => {
    it(
      "runs another cycle after the configured interval",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            intervalMs:
              60_000,
          });

        await scanner.start();

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          1,
        );

        await vi.advanceTimersByTimeAsync(
          60_000,
        );

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          scanner
            .getState()
            .cycleCount,
        ).toBe(2);

        await scanner.stop();
      },
    );

    it(
      "continues scheduling subsequent cycles",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            intervalMs:
              10_000,
          });

        await scanner.start();

        await vi.advanceTimersByTimeAsync(
          30_000,
        );

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          4,
        );

        expect(
          scanner
            .getState()
            .cycleCount,
        ).toBe(4);

        await scanner.stop();
      },
    );
  },
);

/**
 * ============================================================
 * OVERLAP PROTECTION
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Overlap Protection",
  () => {
    it(
      "does not allow two discovery cycles to run simultaneously",
      async () => {
        const gate =
          createDeferred();

        const discoveryFunction =
          vi.fn(
            async () => {
              await gate.promise;

              return successfulCycleResult();
            },
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            runImmediately:
              false,
          });

        await scanner.start();

        const first =
          scanner.runCycle();

        await Promise.resolve();

        const second =
          await scanner.runCycle();

        expect(
          second,
        ).toEqual({
          skipped: true,

          reason:
            "DISCOVERY_CYCLE_ALREADY_RUNNING",
        });

        expect(
          scanner
            .getState()
            .skippedCycles,
        ).toBe(1);

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          1,
        );

        gate.resolve(
          successfulCycleResult(),
        );

        await first;

        await scanner.stop();
      },
    );
  },
);

/**
 * ============================================================
 * STOP
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Stop",
  () => {
    it(
      "stops cleanly and cancels future scheduled cycles",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            intervalMs:
              10_000,
          });

        await scanner.start();

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          1,
        );

        const state =
          await scanner.stop();

        expect(
          state.status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .STOPPED,
        );

        expect(
          state.active,
        ).toBe(false);

        expect(
          state.nextCycleAt,
        ).toBeNull();

        await vi.advanceTimersByTimeAsync(
          30_000,
        );

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "can wait for an active discovery cycle before stopping",
      async () => {
        const gate =
          createDeferred();

        const discoveryFunction =
          vi.fn(
            async () => {
              await gate.promise;

              return successfulCycleResult();
            },
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            runImmediately:
              false,
          });

        await scanner.start();

        const cyclePromise =
          scanner.runCycle();

        await Promise.resolve();

        const stopPromise =
          scanner.stop({
            waitForCurrentCycle:
              true,
          });

        expect(
          scanner
            .getState()
            .status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .STOPPING,
        );

        gate.resolve(
          successfulCycleResult(),
        );

        await cyclePromise;

        const finalState =
          await stopPromise;

        expect(
          finalState.status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .STOPPED,
        );
      },
    );
  },
);

/**
 * ============================================================
 * FAILURE RECOVERY
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Failure Recovery",
  () => {
    it(
      "captures discovery errors without permanently stopping the scanner",
      async () => {
        const discoveryFunction =
          vi.fn()
            .mockRejectedValueOnce(
              new Error(
                "Synthetic discovery failure",
              ),
            )
            .mockResolvedValueOnce(
              successfulCycleResult(),
            );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            intervalMs:
              10_000,
          });

        await scanner.start();

        let state =
          scanner.getState();

        expect(
          state.status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .RUNNING,
        );

        expect(
          state.lastError,
        ).toContain(
          "Synthetic discovery failure",
        );

        await vi.advanceTimersByTimeAsync(
          10_000,
        );

        state =
          scanner.getState();

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          state.cycleCount,
        ).toBe(1);

        expect(
          state.lastResult
            ?.approved,
        ).toBe(true);

        await scanner.stop();
      },
    );
  },
);

/**
 * ============================================================
 * MANUAL CYCLE
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Manual Cycle",
  () => {
    it(
      "can force a diagnostic cycle while the scanner is stopped",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,
          });

        const result =
          await scanner.runCycle({
            force: true,
          });

        expect(
          result.skipped,
        ).toBe(false);

        expect(
          discoveryFunction,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          scanner
            .getState()
            .cycleCount,
        ).toBe(1);
      },
    );

    it(
      "does not run a normal manual cycle while stopped",
      async () => {
        const discoveryFunction =
          vi.fn();

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,
          });

        const result =
          await scanner.runCycle();

        expect(
          result,
        ).toEqual({
          skipped: true,

          reason:
            "CONTINUOUS_SCANNER_NOT_RUNNING",
        });

        expect(
          discoveryFunction,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/**
 * ============================================================
 * DISCOVERY OPTIONS
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Discovery Configuration",
  () => {
    it(
      "forwards discovery options to every cycle",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            runImmediately:
              false,

            discoveryOptions: {
              marketRegime:
                "BULLISH",

              maximumCandidates:
                10,

              batchSize:
                50,
            },
          });

        await scanner.start();

        await scanner.runCycle();

        expect(
          discoveryFunction,
        ).toHaveBeenCalledWith({
          maximumUniverseSymbols:
            null,

          maximumCandidates:
            10,

          batchSize:
            50,

          batchConcurrency:
            1,

          maximumCandidatesPerBatch:
            20,

          submitForDeepResearch:
            true,

          waitForDeepResearch:
            false,

          marketRegime:
            "BULLISH",
        });

        await scanner.stop();
      },
    );

    it(
      "can update discovery options while running",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult(),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            runImmediately:
              false,
          });

        await scanner.start();

        scanner
          .updateDiscoveryOptions({
            maximumCandidates:
              5,

            marketRegime:
              "BEARISH",
          });

        await scanner.runCycle();

        expect(
          discoveryFunction,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            maximumCandidates:
              5,

            marketRegime:
              "BEARISH",
          }),
        );

        await scanner.stop();
      },
    );
  },
);

/**
 * ============================================================
 * INTERVAL UPDATE
 * ============================================================
 */

describe(
  "Continuous Market Scanner — Interval Configuration",
  () => {
    it(
      "can update the scan interval",
      async () => {
        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction:
              vi.fn(
                async () =>
                  successfulCycleResult(),
              ),

            runImmediately:
              false,

            intervalMs:
              60_000,
          });

        await scanner.start();

        const updated =
          scanner.setIntervalMs(
            30_000,
          );

        expect(
          updated,
        ).toBe(30_000);

        expect(
          scanner
            .getState()
            .intervalMs,
        ).toBe(30_000);

        await scanner.stop();
      },
    );
  },
);

/**
 * ============================================================
 * STATE REPORTING
 * ============================================================
 */

describe(
  "Continuous Market Scanner — State",
  () => {
    it(
      "reports useful website/API state",
      async () => {
        const discoveryFunction =
          vi.fn(
            async () =>
              successfulCycleResult({
                scanner: {
                  scanned: 500,
                  qualified: 10,
                  selectedForDeepResearch:
                    5,
                  submitted: 5,
                },
              }),
          );

        const scanner =
          new ContinuousMarketScanner({
            discoveryFunction,

            intervalMs:
              60_000,
          });

        await scanner.start();

        const state =
          scanner.getState();

        expect(
          state.service,
        ).toBe(
          "CONTINUOUS_MARKET_SCANNER",
        );

        expect(
          state.status,
        ).toBe(
          CONTINUOUS_SCANNER_STATUS
            .RUNNING,
        );

        expect(
          state.cycleCount,
        ).toBe(1);

        expect(
          state.lastCycleStartedAt,
        ).not.toBeNull();

        expect(
          state.lastCycleCompletedAt,
        ).not.toBeNull();

        expect(
          state.lastResult
            ?.scanner
            ?.scanned,
        ).toBe(500);

        expect(
          state.nextCycleAt,
        ).not.toBeNull();

        await scanner.stop();
      },
    );
  },
);