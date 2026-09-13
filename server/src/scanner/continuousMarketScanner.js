/**
 * ============================================================
 * CONTINUOUS MARKET SCANNER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Repeatedly run the already-tested autonomous discovery cycle.
 *
 * Flow:
 *
 *   timer
 *      ↓
 *   runAutonomousDiscoveryCycle()
 *      ↓
 *   universe
 *      ↓
 *   Alpaca market-data warmup
 *      ↓
 *   scanner measurements
 *      ↓
 *   LONG / SHORT qualification
 *      ↓
 *   global ranking
 *      ↓
 *   deep-research queue
 *
 * IMPORTANT
 * ---------
 *
 * This module:
 *
 * - does NOT place orders
 * - does NOT bypass deep research
 * - does NOT allow overlapping discovery cycles
 * - can be started/stopped cleanly
 * - exposes scanner state for APIs / website
 */

import {
  runAutonomousDiscoveryCycle,
} from "./autonomousDiscoveryCycle.js";

/**
 * ============================================================
 * STATUS
 * ============================================================
 */

export const CONTINUOUS_SCANNER_STATUS =
  Object.freeze({
    STOPPED:
      "STOPPED",

    STARTING:
      "STARTING",

    RUNNING:
      "RUNNING",

    SCANNING:
      "SCANNING",

    STOPPING:
      "STOPPING",

    ERROR:
      "ERROR",
  });

/**
 * ============================================================
 * DEFAULT CONFIG
 * ============================================================
 */

const DEFAULT_CONFIG =
  Object.freeze({
    /**
     * Five minutes initially.
     *
     * This aligns naturally with the scanner's 5-minute market
     * measurements.
     */
    intervalMs:
      5 * 60 * 1000,

    /**
     * Run immediately after start().
     */
    runImmediately:
      true,

    /**
     * Production discovery defaults.
     */
    maximumUniverseSymbols:
      null,

    maximumCandidates:
      20,

    batchSize:
      100,

    batchConcurrency:
      1,

    maximumCandidatesPerBatch:
      20,

    submitForDeepResearch:
      true,

    /**
     * Continuous scanning should not block waiting for every
     * research job.
     *
     * The research queue operates independently.
     */
    waitForDeepResearch:
      false,

    marketRegime:
      "NEUTRAL",
  });

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function nowIso() {
  return new Date()
    .toISOString();
}

function positiveInteger(
  value,
  fallback,
) {
  const number =
    Number(value);

  if (
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return fallback;
  }

  return number;
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

function clone(value) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    typeof structuredClone ===
    "function"
  ) {
    return structuredClone(
      value,
    );
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


/**
 * ============================================================
 * ENVIRONMENT / DIAGNOSTIC HELPERS
 * ============================================================
 */

function booleanFromEnv(
  value,
  fallback = false,
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (
    [
      "1",
      "true",
      "yes",
      "on",
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    [
      "0",
      "false",
      "no",
      "off",
    ].includes(normalized)
  ) {
    return false;
  }

  return fallback;
}

function shouldAutoStartScanner() {
  /*
   * Tests should never start background discovery implicitly.
   */
  if (
    process.env.NODE_ENV ===
    "test"
  ) {
    return false;
  }

  /*
   * Explicit environment control wins.
   *
   * Set:
   *   AEMA_SCANNER_AUTO_START=true
   *
   * on Render / production.
   */
  return booleanFromEnv(
    process.env
      .AEMA_SCANNER_AUTO_START,
    false,
  );
}

function summarizeDiscoveryResult(
  result,
) {
  return {
    status:
      result?.status ??
      null,

    approved:
      result?.approved ===
      true,

    universe:
      result?.universe
        ?.assetCount ??
      0,

    warmed:
      result?.marketData
        ?.warmed ??
      0,

    measured:
      result?.measurements
        ?.built ??
      0,

    researchable:
      result?.scanner
        ?.researchable ??
      result?.scannerCandidates
        ?.length ??
      0,

    qualified:
      result?.scanner
        ?.qualified ??
      0,

    selected:
      result?.selectedCandidates
        ?.length ??
      0,

    submitted:
      result?.scanner
        ?.submitted ??
      0,

    registryCandidates:
      result?.candidates
        ?.length ??
      0,

    queuePending:
      result?.queue
        ?.pending ??
      0,

    queueRunning:
      result?.queue
        ?.running ??
      0,

    warnings:
      Array.isArray(
        result?.warnings,
      )
        ? result.warnings.length
        : 0,

    errors:
      Array.isArray(
        result?.errors,
      )
        ? result.errors.length
        : 0,
  };
}

/**
 * ============================================================
 * CONTINUOUS SCANNER CLASS
 * ============================================================
 */

export class ContinuousMarketScanner {
  constructor({
    discoveryFunction =
      runAutonomousDiscoveryCycle,

    intervalMs =
      DEFAULT_CONFIG.intervalMs,

    runImmediately =
      DEFAULT_CONFIG.runImmediately,

    discoveryOptions =
      {},
  } = {}) {
    if (
      typeof discoveryFunction !==
      "function"
    ) {
      throw new TypeError(
        "[CONTINUOUS_MARKET_SCANNER] discoveryFunction must be a function.",
      );
    }

    this.discoveryFunction =
      discoveryFunction;

    this.intervalMs =
      positiveInteger(
        intervalMs,
        DEFAULT_CONFIG.intervalMs,
      );

    this.runImmediately =
      runImmediately !==
      false;

    this.discoveryOptions = {
      maximumUniverseSymbols:
        DEFAULT_CONFIG
          .maximumUniverseSymbols,

      maximumCandidates:
        DEFAULT_CONFIG
          .maximumCandidates,

      batchSize:
        DEFAULT_CONFIG
          .batchSize,

      batchConcurrency:
        DEFAULT_CONFIG
          .batchConcurrency,

      maximumCandidatesPerBatch:
        DEFAULT_CONFIG
          .maximumCandidatesPerBatch,

      submitForDeepResearch:
        DEFAULT_CONFIG
          .submitForDeepResearch,

      waitForDeepResearch:
        DEFAULT_CONFIG
          .waitForDeepResearch,

      marketRegime:
        DEFAULT_CONFIG
          .marketRegime,

      ...discoveryOptions,
    };

    this.status =
      CONTINUOUS_SCANNER_STATUS
        .STOPPED;

    this.startedAt =
      null;

    this.stoppedAt =
      null;

    this.lastCycleStartedAt =
      null;

    this.lastCycleCompletedAt =
      null;

    this.nextCycleAt =
      null;

    this.lastResult =
      null;

    this.lastError =
      null;

    this.cycleCount =
      0;

    this.skippedCycles =
      0;

    this.runningCycle =
      false;

    /**
     * Promise for the discovery operation currently in flight.
     *
     * stop() waits on this promise directly instead of polling
     * with timers. This also behaves correctly under fake timers.
     */
    this.currentCyclePromise =
      null;

    this.timer =
      null;

    this.startPromise =
      null;

    this.stopRequested =
      false;
  }

  /**
   * ==========================================================
   * START
   * ==========================================================
   */

  async start() {
    /**
     * If startup is already in progress, share the same startup
     * promise so simultaneous callers observe the same completion.
     */
    if (
      this.startPromise
    ) {
      return this.startPromise;
    }

    /**
     * Idempotent start.
     */
    if (
      this.status !==
        CONTINUOUS_SCANNER_STATUS
          .STOPPED &&
      this.status !==
        CONTINUOUS_SCANNER_STATUS
          .ERROR
    ) {
      return this.getState();
    }

    this.startPromise =
      this.#startInternal();

    try {
      return await this.startPromise;
    } finally {
      this.startPromise =
        null;
    }
  }

  async #startInternal() {
    this.status =
      CONTINUOUS_SCANNER_STATUS
        .STARTING;

    this.stopRequested =
      false;

    this.startedAt =
      nowIso();

    this.stoppedAt =
      null;

    this.lastError =
      null;

    console.log(
      "[AEMA_SCANNER_STARTING]",
      {
        startedAt:
          this.startedAt,

        intervalMs:
          this.intervalMs,

        runImmediately:
          this.runImmediately,

        discoveryOptions:
          clone(
            this.discoveryOptions,
          ),
      },
    );

    this.status =
      CONTINUOUS_SCANNER_STATUS
        .RUNNING;

    /**
     * Run immediately if configured.
     */
    if (
      this.runImmediately
    ) {
      await this.runCycle();
    }

    /**
     * User may call stop() while the initial cycle is running.
     */
    if (
      this.stopRequested
    ) {
      this.status =
        CONTINUOUS_SCANNER_STATUS
          .STOPPED;

      return this.getState();
    }

    this.#scheduleNext();

    console.log(
      "[AEMA_SCANNER_STARTED]",
      {
        status:
          this.status,

        cycleCount:
          this.cycleCount,

        nextCycleAt:
          this.nextCycleAt,
      },
    );

    return this.getState();
  }

  /**
   * ==========================================================
   * RUN ONE CYCLE
   * ==========================================================
   */

  async runCycle({
    force = false,
  } = {}) {
    /**
     * Never overlap discovery cycles.
     */
    if (
      this.runningCycle
    ) {
      this.skippedCycles +=
        1;

      return {
        skipped: true,

        reason:
          "DISCOVERY_CYCLE_ALREADY_RUNNING",
      };
    }

    /**
     * Normal scheduled calls require the service to be running.
     *
     * force=true allows a manual diagnostic cycle.
     */
    if (
      force !== true &&
      ![
        CONTINUOUS_SCANNER_STATUS
          .RUNNING,

        CONTINUOUS_SCANNER_STATUS
          .SCANNING,

        CONTINUOUS_SCANNER_STATUS
          .STARTING,
      ].includes(
        this.status,
      )
    ) {
      return {
        skipped: true,

        reason:
          "CONTINUOUS_SCANNER_NOT_RUNNING",
      };
    }

    const statusBeforeCycle =
      this.status;

    const forcedWhileStopped =
      force === true &&
      statusBeforeCycle ===
        CONTINUOUS_SCANNER_STATUS
          .STOPPED;

    this.runningCycle =
      true;

    this.status =
      CONTINUOUS_SCANNER_STATUS
        .SCANNING;

    this.lastCycleStartedAt =
      nowIso();

    this.lastError =
      null;

    console.log(
      "[AEMA_SCANNER_CYCLE_START]",
      {
        cycle:
          this.cycleCount + 1,

        startedAt:
          this.lastCycleStartedAt,

        options:
          clone(
            this.discoveryOptions,
          ),
      },
    );

    try {
      /**
       * Keep a handle to the exact in-flight operation. stop() can
       * await this directly, avoiding timer-based polling.
       */
      const cyclePromise =
        Promise.resolve().then(
          () =>
            this.discoveryFunction({
              ...this.discoveryOptions,
            }),
        );

      this.currentCyclePromise =
        cyclePromise;

      const result =
        await cyclePromise;

      this.lastResult =
        clone(result);

      this.cycleCount +=
        1;

      this.lastCycleCompletedAt =
        nowIso();

      console.log(
        "[AEMA_SCANNER_CYCLE_RESULT]",
        {
          cycle:
            this.cycleCount,

          completedAt:
            this.lastCycleCompletedAt,

          ...summarizeDiscoveryResult(
            result,
          ),
        },
      );

      if (
        forcedWhileStopped
      ) {
        /**
         * A forced diagnostic cycle must not silently start the
         * continuous scheduler.
         */
        this.status =
          CONTINUOUS_SCANNER_STATUS
            .STOPPED;
      } else if (
        this.stopRequested
      ) {
        /**
         * stop({ waitForCurrentCycle: false }) may already have
         * finalized STOPPED while this cycle was still finishing.
         * Do not regress STOPPED back to STOPPING.
         */
        if (
          this.status !==
            CONTINUOUS_SCANNER_STATUS
              .STOPPED
        ) {
          this.status =
            CONTINUOUS_SCANNER_STATUS
              .STOPPING;
        }
      } else {
        this.status =
          CONTINUOUS_SCANNER_STATUS
            .RUNNING;
      }

      return {
        skipped: false,

        result:
          clone(result),
      };
    } catch (error) {
      /**
       * Autonomous discovery itself already fails safely, but
       * preserve a final scheduler-level boundary.
       */
      this.lastError =
        safeErrorMessage(
          error,
        );

      this.lastCycleCompletedAt =
        nowIso();

      console.error(
        "[AEMA_SCANNER_CYCLE_ERROR]",
        {
          cycle:
            this.cycleCount + 1,

          completedAt:
            this.lastCycleCompletedAt,

          error:
            this.lastError,
        },
      );

      if (
        forcedWhileStopped
      ) {
        this.status =
          CONTINUOUS_SCANNER_STATUS
            .STOPPED;
      } else if (
        this.stopRequested
      ) {
        if (
          this.status !==
            CONTINUOUS_SCANNER_STATUS
              .STOPPED
        ) {
          this.status =
            CONTINUOUS_SCANNER_STATUS
              .STOPPING;
        }
      } else {
        /**
         * One cycle failure should not permanently stop
         * continuous discovery.
         */
        this.status =
          CONTINUOUS_SCANNER_STATUS
            .RUNNING;
      }

      return {
        skipped: false,

        result: null,

        error:
          this.lastError,
      };
    } finally {
      this.runningCycle =
        false;

      this.currentCyclePromise =
        null;
    }
  }

  /**
   * ==========================================================
   * SCHEDULING
   * ==========================================================
   */

  #scheduleNext() {
    this.#clearTimer();

    if (
      this.stopRequested ||
      this.status ===
        CONTINUOUS_SCANNER_STATUS
          .STOPPED
    ) {
      this.nextCycleAt =
        null;

      return;
    }

    const nextTime =
      Date.now() +
      this.intervalMs;

    this.nextCycleAt =
      new Date(
        nextTime,
      )
        .toISOString();

    console.log(
      "[AEMA_SCANNER_NEXT_CYCLE]",
      {
        nextCycleAt:
          this.nextCycleAt,

        intervalMs:
          this.intervalMs,
      },
    );

    this.timer =
      setTimeout(
        () => {
          this.timer =
            null;

          void this.#scheduledCycle();
        },
        this.intervalMs,
      );

    /**
     * Do not keep Node alive solely because of this timer.
     */
    if (
      typeof this.timer
        ?.unref ===
      "function"
    ) {
      this.timer.unref();
    }
  }

  async #scheduledCycle() {
    if (
      this.stopRequested
    ) {
      return;
    }

    await this.runCycle();

    if (
      !this.stopRequested
    ) {
      this.#scheduleNext();
    }
  }

  /**
   * ==========================================================
   * STOP
   * ==========================================================
   */

  async stop({
    waitForCurrentCycle =
      true,
  } = {}) {
    if (
      this.status ===
        CONTINUOUS_SCANNER_STATUS
          .STOPPED
    ) {
      return this.getState();
    }

    this.stopRequested =
      true;

    this.status =
      CONTINUOUS_SCANNER_STATUS
        .STOPPING;

    this.#clearTimer();

    /**
     * Do not cancel an active market-discovery call halfway.
     *
     * That could leave external market-data operations in an
     * unknown state.
     *
     * Instead allow the current cycle to finish.
     */
    if (
      waitForCurrentCycle ===
        true &&
      this.currentCyclePromise
    ) {
      /**
       * Capture the promise before awaiting it because runCycle()
       * clears currentCyclePromise in its finally block.
       */
      const activeCyclePromise =
        this.currentCyclePromise;

      try {
        await activeCyclePromise;
      } catch {
        /**
         * runCycle() owns cycle-level failure handling. A failed
         * discovery operation must never prevent shutdown.
         */
      }
    }

    this.status =
      CONTINUOUS_SCANNER_STATUS
        .STOPPED;

    this.stoppedAt =
      nowIso();

    console.log(
      "[AEMA_SCANNER_STOPPED]",
      {
        stoppedAt:
          this.stoppedAt,

        cycleCount:
          this.cycleCount,

        skippedCycles:
          this.skippedCycles,
      },
    );

    this.nextCycleAt =
      null;

    return this.getState();
  }

  /**
   * ==========================================================
   * CONFIGURATION
   * ==========================================================
   */

  setIntervalMs(
    intervalMs,
  ) {
    this.intervalMs =
      positiveInteger(
        intervalMs,
        this.intervalMs,
      );

    /**
     * If already running, restart only the timer.
     *
     * Do not interrupt an active discovery cycle.
     */
    if (
      this.status ===
        CONTINUOUS_SCANNER_STATUS
          .RUNNING
    ) {
      this.#scheduleNext();
    }

    return this.intervalMs;
  }

  updateDiscoveryOptions(
    options = {},
  ) {
    if (
      !options ||
      typeof options !==
        "object"
    ) {
      return clone(
        this.discoveryOptions,
      );
    }

    this.discoveryOptions = {
      ...this.discoveryOptions,

      ...options,
    };

    return clone(
      this.discoveryOptions,
    );
  }

  /**
   * ==========================================================
   * STATE
   * ==========================================================
   */

  getState() {
    return {
      service:
        "CONTINUOUS_MARKET_SCANNER",

      status:
        this.status,

      active:
        this.status !==
        CONTINUOUS_SCANNER_STATUS
          .STOPPED,

      runningCycle:
        this.runningCycle,

      intervalMs:
        this.intervalMs,

      cycleCount:
        this.cycleCount,

      skippedCycles:
        this.skippedCycles,

      startedAt:
        this.startedAt,

      stoppedAt:
        this.stoppedAt,

      lastCycleStartedAt:
        this.lastCycleStartedAt,

      lastCycleCompletedAt:
        this.lastCycleCompletedAt,

      nextCycleAt:
        this.nextCycleAt,

      lastError:
        this.lastError,

      discoveryOptions:
        clone(
          this.discoveryOptions,
        ),

      lastResult:
        clone(
          this.lastResult,
        ),
    };
  }

  /**
   * ==========================================================
   * INTERNAL TIMER CLEANUP
   * ==========================================================
   */

  #clearTimer() {
    if (
      this.timer
    ) {
      clearTimeout(
        this.timer,
      );

      this.timer =
        null;
    }

    this.nextCycleAt =
      null;
  }
}

/**
 * ============================================================
 * PRODUCTION SINGLETON
 * ============================================================
 */

export const continuousMarketScanner =
  new ContinuousMarketScanner();

export default
  continuousMarketScanner;