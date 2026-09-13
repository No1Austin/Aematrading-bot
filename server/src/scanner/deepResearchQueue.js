/**
 * ============================================================
 * DEEP RESEARCH QUEUE
 * ============================================================
 *
 * Controlled queue for expensive deep-research jobs.
 *
 * Initial production configuration:
 * maximumConcurrentDeepResearch = 1
 *
 * IMPORTANT:
 * - Queue does not perform research itself.
 * - Queue does not place trades.
 * - Duplicate symbols are suppressed.
 */

import {
  MARKET_SCANNER_CONFIG,
} from "./marketScannerConfig.js";

function normalizeSymbol(symbol) {
  return String(symbol ?? "")
    .trim()
    .toUpperCase();
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }

  return structuredClone(value);
}

export class DeepResearchQueue {
  constructor({
    maximumConcurrentDeepResearch =
      MARKET_SCANNER_CONFIG
        .candidateManagement
        .maximumConcurrentDeepResearch,
  } = {}) {
    const concurrency =
      Number(
        maximumConcurrentDeepResearch,
      );

    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1
    ) {
      throw new Error(
        "[DEEP_RESEARCH_QUEUE] maximumConcurrentDeepResearch must be an integer >= 1.",
      );
    }

    this.maximumConcurrentDeepResearch =
      concurrency;

    this.queue = [];

    this.queuedSymbols =
      new Set();

    this.runningSymbols =
      new Set();

    this.worker = null;

    this.processing = false;

    this.idleWaiters = [];
  }

  setWorker(worker) {
    if (
      typeof worker !== "function"
    ) {
      throw new TypeError(
        "[DEEP_RESEARCH_QUEUE] Worker must be a function.",
      );
    }

    this.worker = worker;

    return this;
  }

  enqueue(job) {
    const symbol =
      normalizeSymbol(
        job?.symbol,
      );

    if (!symbol) {
      throw new Error(
        "[DEEP_RESEARCH_QUEUE] Job symbol is required.",
      );
    }

    if (
      this.queuedSymbols.has(symbol) ||
      this.runningSymbols.has(symbol)
    ) {
      return {
        accepted: false,
        reason: "DUPLICATE",
        symbol,
      };
    }

    const normalizedJob = {
      ...clone(job),
      symbol,
      queuedAt:
        job?.queuedAt ??
        new Date().toISOString(),
    };

    this.queue.push(
      normalizedJob,
    );

    this.queuedSymbols.add(
      symbol,
    );

    /**
     * Highest scanner score receives priority.
     */
    this.queue.sort(
      (a, b) =>
        Number(
          b.scannerScore ?? 0,
        ) -
        Number(
          a.scannerScore ?? 0,
        ),
    );

    this.#schedule();

    return {
      accepted: true,
      reason: null,
      symbol,
    };
  }

  enqueueMany(jobs = []) {
    if (!Array.isArray(jobs)) {
      throw new TypeError(
        "[DEEP_RESEARCH_QUEUE] jobs must be an array.",
      );
    }

    return jobs.map(job =>
      this.enqueue(job),
    );
  }

  has(symbol) {
    const normalized =
      normalizeSymbol(symbol);

    if (!normalized) {
      return false;
    }

    return (
      this.queuedSymbols.has(
        normalized,
      ) ||
      this.runningSymbols.has(
        normalized,
      )
    );
  }

  getPendingJobs() {
    return clone(this.queue);
  }

  getState() {
    return {
      pending:
        this.queue.length,

      running:
        this.runningSymbols.size,

      maximumConcurrentDeepResearch:
        this.maximumConcurrentDeepResearch,

      queuedSymbols:
        [...this.queuedSymbols],

      runningSymbols:
        [...this.runningSymbols],

      processing:
        this.processing,
    };
  }

  async waitForIdle() {
    if (
      this.queue.length === 0 &&
      this.runningSymbols.size === 0
    ) {
      return;
    }

    await new Promise(resolve => {
      this.idleWaiters.push(
        resolve,
      );
    });
  }

  clearPending() {
    const removed =
      this.queue.map(
        job => job.symbol,
      );

    this.queue = [];
    this.queuedSymbols.clear();

    this.#resolveIdleIfNeeded();

    return removed;
  }

  #schedule() {
    if (this.processing) {
      return;
    }

    queueMicrotask(() => {
      void this.#drain();
    });
  }

  async #drain() {
    if (this.processing) {
      return;
    }

    if (
      typeof this.worker !==
      "function"
    ) {
      return;
    }

    this.processing = true;

    try {
      while (
        this.queue.length > 0 ||
        this.runningSymbols.size > 0
      ) {
        while (
          this.queue.length > 0 &&
          this.runningSymbols.size <
            this
              .maximumConcurrentDeepResearch
        ) {
          const job =
            this.queue.shift();

          this.queuedSymbols.delete(
            job.symbol,
          );

          this.runningSymbols.add(
            job.symbol,
          );

          void this.#executeJob(
            job,
          );
        }

        if (
          this.runningSymbols.size >
          0
        ) {
          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                5,
              ),
          );
        }
      }
    } finally {
      this.processing = false;

      this.#resolveIdleIfNeeded();

      /**
       * Protect against a job being added between
       * the loop finishing and processing being reset.
       */
      if (
        this.queue.length > 0
      ) {
        this.#schedule();
      }
    }
  }

  async #executeJob(job) {
    try {
      await this.worker(
        clone(job),
      );
    } catch (error) {
      /**
       * Worker/coordinator owns domain-level error handling.
       * Queue isolation ensures one failure cannot kill the queue.
       */
      console.error(
        `[DEEP_RESEARCH_QUEUE] ${job.symbol}:`,
        error instanceof Error
          ? error.message
          : error,
      );
    } finally {
      this.runningSymbols.delete(
        job.symbol,
      );

      this.#resolveIdleIfNeeded();
    }
  }

  #resolveIdleIfNeeded() {
    if (
      this.queue.length !== 0 ||
      this.runningSymbols.size !== 0
    ) {
      return;
    }

    const waiters =
      this.idleWaiters.splice(
        0,
      );

    for (const resolve of waiters) {
      resolve();
    }
  }
}

export function createDeepResearchQueue(
  options = {},
) {
  return new DeepResearchQueue(
    options,
  );
}

export default DeepResearchQueue;