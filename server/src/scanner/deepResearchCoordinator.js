/**
 * ============================================================
 * DEEP RESEARCH COORDINATOR
 * ============================================================
 *
 * Bridge:
 *
 * scanner candidate
 *      ↓
 * candidate registry
 *      ↓
 * research queue
 *      ↓
 * runLiveStockAnalysis()
 *      ↓
 * registry result
 *
 * IMPORTANT:
 * - Scanner direction is advisory only.
 * - Deep research may disagree with scanner direction.
 * - Coordinator NEVER places an order.
 */

import {
  runLiveStockAnalysis,
} from "../services/liveStockAnalysisService.js";

import {
  upsertCandidate,
  getCandidate,
  markCandidateQueued,
  markCandidateRunning,
  markCandidateComplete,
  markCandidateRejected,
  markCandidateError,
} from "./candidateRegistry.js";

import {
  createDeepResearchQueue,
} from "./deepResearchQueue.js";

import {
  MARKET_SCANNER_CONFIG,
} from "./marketScannerConfig.js";

/**
 * ============================================================
 * RESULT EXTRACTION
 * ============================================================
 *
 * Keep extraction defensive because the live-analysis result
 * contains multiple layers.
 */

function finiteOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function firstFinite(
  ...values
) {
  for (const value of values) {
    const number =
      finiteOrNull(value);

    if (number !== null) {
      return number;
    }
  }

  return null;
}

function extractDeepScore(result) {
  return firstFinite(
    result?.finalScore,
    result?.score,
    result?.deepScore,
    result?.analysis?.finalScore,
    result?.analysis?.score,
    result?.consensus?.score,
    result?.decision?.score,
    result?.finalDecision?.score,
  );
}

function extractFinalDecision(
  result,
) {
  return (
    result?.finalDecision ??
    result?.decision ??
    result?.analysis
      ?.finalDecision ??
    null
  );
}

/**
 * We deliberately prefer explicit approval signals.
 *
 * Absence of approval is NOT interpreted as approval.
 */
function deepResearchApproved(
  result,
) {
  if (
    result?.approved === true
  ) {
    return true;
  }

  if (
    result?.finalDecision
      ?.approved === true
  ) {
    return true;
  }

  if (
    result?.decision
      ?.approved === true
  ) {
    return true;
  }

  if (
    result?.analysis
      ?.approved === true
  ) {
    return true;
  }

  /**
   * executionReady is stronger than scanner qualification,
   * but we do NOT use it to place an order here.
   */
  if (
    result?.executionReady ===
    true
  ) {
    return true;
  }

  return false;
}

/**
 * ============================================================
 * COORDINATOR
 * ============================================================
 */

export class DeepResearchCoordinator {
  constructor({
    researchFunction =
      runLiveStockAnalysis,

    maximumConcurrentDeepResearch =
      MARKET_SCANNER_CONFIG
        .candidateManagement
        .maximumConcurrentDeepResearch,

    researchOptions = {},
  } = {}) {
    if (
      typeof researchFunction !==
      "function"
    ) {
      throw new TypeError(
        "[DEEP_RESEARCH_COORDINATOR] researchFunction must be a function.",
      );
    }

    this.researchFunction =
      researchFunction;

    this.researchOptions = {
      ...researchOptions,
    };

    this.queue =
      createDeepResearchQueue({
        maximumConcurrentDeepResearch,
      });

    this.queue.setWorker(
      job =>
        this.#processJob(
          job,
        ),
    );
  }

  /**
   * Submit one already-qualified scanner result.
   */
  submitCandidate(
    scannerResult,
    {
      requeue = false,
    } = {},
  ) {
    if (
      !scannerResult ||
      scannerResult.qualified !==
        true
    ) {
      return {
        accepted: false,
        reason:
          "CANDIDATE_NOT_QUALIFIED",
        symbol:
          scannerResult?.symbol ??
          null,
      };
    }

    const candidate =
      upsertCandidate(
        scannerResult,
        {
          requeue,
        },
      );

    /**
     * Do not automatically rerun terminal research
     * unless explicitly requeued.
     */
    if (
      requeue !== true &&
      [
        "COMPLETE",
        "REJECTED",
      ].includes(
        candidate.researchStatus,
      )
    ) {
      return {
        accepted: false,
        reason:
          "ALREADY_RESEARCHED",
        symbol:
          candidate.symbol,
      };
    }

    if (
      candidate.researchStatus ===
      "ERROR" &&
      requeue !== true
    ) {
      return {
        accepted: false,
        reason:
          "PREVIOUS_RESEARCH_ERROR",
        symbol:
          candidate.symbol,
      };
    }

    const queueResult =
      this.queue.enqueue({
        symbol:
          candidate.symbol,

        scannerScore:
          candidate.scannerScore,

        preferredDirection:
          candidate.preferredDirection,

        scannerCandidate:
          candidate,
      });

    if (
      queueResult.accepted
    ) {
      markCandidateQueued(
        candidate.symbol,
      );
    }

    return queueResult;
  }

  submitCandidates(
    scannerResults = [],
    options = {},
  ) {
    if (
      !Array.isArray(
        scannerResults,
      )
    ) {
      throw new TypeError(
        "[DEEP_RESEARCH_COORDINATOR] scannerResults must be an array.",
      );
    }

    return scannerResults.map(
      result =>
        this.submitCandidate(
          result,
          options,
        ),
    );
  }

  getQueueState() {
    return this.queue.getState();
  }

  async waitForIdle() {
    await this.queue.waitForIdle();
  }

  clearPending() {
    return this.queue.clearPending();
  }

  async #processJob(job) {
    const symbol =
      job.symbol;

    markCandidateRunning(
      symbol,
    );

    try {
      /**
       * Scanner direction is intentionally NOT passed as
       * an instruction to the research engines.
       *
       * The deep-research system must independently decide
       * LONG / SHORT / NO-TRADE.
       */
      const result =
        await this.researchFunction({
          symbol,

          ...this.researchOptions,
        });

      const deepScore =
        extractDeepScore(
          result,
        );

      const finalDecision =
        extractFinalDecision(
          result,
        );

      const approved =
        deepResearchApproved(
          result,
        );

      if (approved) {
        markCandidateComplete(
          symbol,
          {
            deepScore,
            finalDecision,
            deepResearchResult:
              result,
          },
        );
      } else {
        markCandidateRejected(
          symbol,
          {
            deepScore,
            finalDecision,
            deepResearchResult:
              result,
          },
        );
      }

      return result;
    } catch (error) {
      markCandidateError(
        symbol,
        error,
      );

      /**
       * Do not rethrow.
       *
       * A provider failure for NVDA must not prevent AMD
       * from being researched next.
       */
      console.error(
        `[DEEP_RESEARCH_COORDINATOR] ${symbol}:`,
        error instanceof Error
          ? error.message
          : error,
      );

      return null;
    }
  }

  getCandidate(symbol) {
    return getCandidate(
      symbol,
    );
  }
}

/**
 * Production singleton.
 *
 * Concurrency currently resolves to 1 from scanner config.
 */
export const deepResearchCoordinator =
  new DeepResearchCoordinator();

export default deepResearchCoordinator;