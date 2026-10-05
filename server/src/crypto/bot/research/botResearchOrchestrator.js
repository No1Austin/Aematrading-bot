/**
 * AEMA Private Futures Research Bot
 * Research Orchestrator
 *
 * Responsibilities:
 * - Receive Top-20 opportunity candidates
 * - Fetch fresh research evidence
 * - Run all research engines
 * - Preserve unavailable evidence honestly
 * - Isolate per-symbol research failures
 *
 * This module does NOT:
 * - decide direction
 * - build setups
 * - execute trades
 */

import getBotResearchMarketEvidence from "./botResearchMarketProvider.js";
import { runAllBotResearchEngines } from "./botResearchEngines.js";

/*
 * ---------------------------------------------------------
 * RESEARCH ONE CANDIDATE
 * ---------------------------------------------------------
 */

export async function researchBotCandidate(
  candidate,
  options = {}
) {
  if (!candidate) {
    throw new Error(
      "BOT_RESEARCH_CANDIDATE_REQUIRED"
    );
  }

  const asset =
    candidate?.asset;

  if (!asset) {
    throw new Error(
      "BOT_RESEARCH_ASSET_REQUIRED"
    );
  }

  const symbol =
    candidate?.symbol ??
    asset?.symbol ??
    null;

  if (!symbol) {
    throw new Error(
      "BOT_RESEARCH_SYMBOL_REQUIRED"
    );
  }

  /*
   * -------------------------------------------------------
   * 1. FETCH FRESH RESEARCH EVIDENCE
   * -------------------------------------------------------
   */

  const evidence =
    await getBotResearchMarketEvidence(
      asset,
      options
    );

  if (!evidence) {
    throw new Error(
      `BOT_RESEARCH_EVIDENCE_UNAVAILABLE:${symbol}`
    );
  }

  /*
   * -------------------------------------------------------
   * 2. RUN RESEARCH ENGINES
   * -------------------------------------------------------
   *
   * Engine-level unavailable evidence should remain
   * unavailable. It should NOT be converted to fake
   * bullish/bearish or zero evidence here.
   */

  const engines =
    runAllBotResearchEngines(
      asset,
      evidence
    );

  if (
    !engines ||
    typeof engines !== "object"
  ) {
    throw new Error(
      `BOT_RESEARCH_ENGINES_INVALID:${symbol}`
    );
  }

  /*
   * -------------------------------------------------------
   * 3. RESEARCH DIAGNOSTICS
   * -------------------------------------------------------
   */

  const engineEntries =
    Object.entries(engines);

  const availableEngines =
    engineEntries
      .filter(
        ([, engine]) =>
          engine?.available === true
      )
      .map(
        ([name]) => name
      );

  const unavailableEngines =
    engineEntries
      .filter(
        ([, engine]) =>
          engine?.available !== true
      )
      .map(
        ([name]) => name
      );

  /*
   * Do not fail the entire candidate merely because
   * an optional research engine is unavailable.
   *
   * The direction gate later decides whether enough
   * evidence exists to qualify the candidate.
   */
  return {
    ...candidate,

    symbol,

    researchEvidence:
      evidence,

    engines,

    researchDiagnostics: {
      engineCount:
        engineEntries.length,

      availableEngineCount:
        availableEngines.length,

      unavailableEngineCount:
        unavailableEngines.length,

      availableEngines,

      unavailableEngines,
    },
  };
}

/*
 * ---------------------------------------------------------
 * RESEARCH TOP-20
 * ---------------------------------------------------------
 */

export async function researchBotTop20(
  candidates = [],
  options = {}
) {
  if (!Array.isArray(candidates)) {
    throw new Error(
      "BOT_RESEARCH_CANDIDATES_MUST_BE_ARRAY"
    );
  }

  /*
   * Sequential intentionally.
   *
   * This keeps:
   * - API usage controlled
   * - logs deterministic
   * - failures attributable to individual symbols
   *
   * We can introduce controlled concurrency later if
   * research latency becomes a problem.
   */

  const researched = [];
  const failed = [];

  for (const candidate of candidates) {
    const symbol =
      candidate?.symbol ??
      candidate?.asset?.symbol ??
      null;

    try {
      const result =
        await researchBotCandidate(
          candidate,
          options
        );

      researched.push(
        result
      );
    } catch (error) {
      failed.push({
        symbol,

        rank:
          candidate?.rank ??
          null,

        error:
          error?.message ||
          String(error),
      });
    }
  }

  return {
    researched,

    failed,

    requested:
      candidates.length,

    completed:
      researched.length,

    failureCount:
      failed.length,
  };
}

export default researchBotTop20;