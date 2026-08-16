import "dotenv/config";

import getFederalRegisterEvents from "../data/providers/federalRegisterEventProvider.js";

import getMarketEvents from "../data/providers/marketEventDataProvider.js";

import filterRelevantEvents from "./eventRelevanceEngine.js";

/**
 * ============================================================
 * FEDERAL REGISTER MARKET RELEVANCE TEST
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Verify the complete relevance pipeline:
 *
 * Federal Register
 *      ↓
 * Market event normalization
 *      ↓
 * Market / sector / symbol relevance
 *
 * IMPORTANT
 * ---------
 *
 * This test does NOT assign bullish or bearish direction.
 *
 * It only determines which events deserve further
 * interpretation.
 */

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "FEDERAL REGISTER MARKET RELEVANCE TEST",
  );

  console.log(
    "====================================\n",
  );

  /**
   * ========================================================
   * 1. LOAD REAL FEDERAL REGISTER EVENTS
   * ========================================================
   */

  const source =
    await getFederalRegisterEvents({
      lookbackHours:
        24 * 14,

      perPage:
        100,
    });

  if (
    source.approved !== true
  ) {
    console.error(
      "\nSOURCE FAILED\n",
    );

    console.dir(
      source,
      {
        depth: null,
      },
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Source events:",
    source.eventCount,
  );

  /**
   * ========================================================
   * 2. NORMALIZE EVENTS
   * ========================================================
   */

  const normalized =
    await getMarketEvents({
      symbol:
        "AAPL",

      country:
        "US",

      lookbackHours:
        24 * 14,

      sourceEvents:
        source.events,
    });

  if (
    normalized.approved !== true
  ) {
    console.error(
      "\nNORMALIZATION FAILED\n",
    );

    console.dir(
      normalized,
      {
        depth: null,
      },
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Normalized events:",
    normalized.eventCount,
  );

  /**
   * ========================================================
   * 3. RUN RELEVANCE ENGINE
   * ========================================================
   */

  const result =
    filterRelevantEvents({
      events:
        normalized.events,

      symbol:
        "AAPL",

      sector:
        "TECHNOLOGY",

      country:
        "US",

      minimumScore:
        0.4,
    });

  if (
    result.approved !== true
  ) {
    console.error(
      "\nRELEVANCE ENGINE FAILED\n",
    );

    console.dir(
      result,
      {
        depth: null,
      },
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "\n====================================",
  );

  console.log(
    "RELEVANCE SUMMARY",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Original:",
    result.originalCount,
  );

  console.log(
    "Relevant:",
    result.relevantCount,
  );

  console.log(
    "Filtered:",
    result.filteredCount,
  );

  console.log(
    "Minimum score:",
    result.minimumScore,
  );

  /**
   * ========================================================
   * 4. SHOW RELEVANT EVENTS
   * ========================================================
   */

  console.log(
    "\n====================================",
  );

  console.log(
    "RELEVANT EVENTS",
  );

  console.log(
    "====================================\n",
  );

  for (
    const event
    of result.events
  ) {
    console.log({
      eventKey:
        event.eventKey,

      title:
        event.title,

      type:
        event.type,

      score:
        event
          ?.relevance
          ?.score ??
        null,

      level:
        event
          ?.relevance
          ?.level ??
        null,

      reasons:
        event
          ?.relevance
          ?.reasons ??
        [],
    });
  }

  /**
   * ========================================================
   * 5. RELEVANCE LEVEL COUNTS
   * ========================================================
   */

  const levelCounts = {};

  for (
    const event
    of result.events
  ) {
    const level =
      event
        ?.relevance
        ?.level ??
      "UNKNOWN";

    levelCounts[level] =
      (
        levelCounts[level] ??
        0
      ) + 1;
  }

  console.log(
    "\nRELEVANCE LEVEL COUNTS\n",
  );

  console.dir(
    levelCounts,
    {
      depth: null,
    },
  );

  /**
   * ========================================================
   * 6. CRITICAL / HIGH EVENTS
   * ========================================================
   */

  const priorityEvents =
    result.events.filter(
      (event) =>
        [
          "CRITICAL",
          "HIGH",
        ].includes(
          event
            ?.relevance
            ?.level,
        ),
    );

  console.log(
    "\n====================================",
  );

  console.log(
    "HIGH-PRIORITY EVENTS",
  );

  console.log(
    "====================================\n",
  );

  if (
    priorityEvents.length ===
    0
  ) {
    console.log(
      "No HIGH or CRITICAL events found.",
    );
  } else {
    for (
      const event
      of priorityEvents
    ) {
      console.log({
        title:
          event.title,

        type:
          event.type,

        score:
          event
            ?.relevance
            ?.score,

        level:
          event
            ?.relevance
            ?.level,

        reasons:
          event
            ?.relevance
            ?.reasons,
      });
    }
  }

  /**
   * ========================================================
   * 7. FALSE-POSITIVE DIAGNOSTIC
   * ========================================================
   *
   * Specifically detect suspicious AAPL "ai" matches.
   *
   * After the relevance engine is corrected, this section
   * should normally return zero suspicious records.
   */

  const suspiciousAiMatches =
    result.events.filter(
      (event) => {
        const reasons =
          event
            ?.relevance
            ?.reasons ??
          [];

        const hasAiReason =
          reasons.some(
            (reason) =>
              String(
                reason,
              ).toLowerCase()
                .includes(
                  "symbol-sensitive terms for aapl: ai",
                ),
          );

        if (!hasAiReason) {
          return false;
        }

        const text =
          [
            event.title,
            event.summary,
            event.content,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        /**
         * Real standalone AI references.
         */

        const hasRealAi =
          /\bartificial intelligence\b/i.test(
            text,
          ) ||
          /\bai\b/i.test(
            text,
          );

        return !hasRealAi;
      },
    );

  console.log(
    "\n====================================",
  );

  console.log(
    "SUSPICIOUS AI MATCHES",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Count:",
    suspiciousAiMatches.length,
  );

  for (
    const event
    of suspiciousAiMatches
  ) {
    console.log({
      title:
        event.title,

      score:
        event
          ?.relevance
          ?.score,

      reasons:
        event
          ?.relevance
          ?.reasons,
    });
  }

  /**
   * ========================================================
   * SUCCESS
   * ========================================================
   */

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — MARKET RELEVANCE FILTER COMPLETE",
  );

  console.log(
    "====================================",
  );

  console.log(
    `Original: ${result.originalCount}`,
  );

  console.log(
    `Relevant: ${result.relevantCount}`,
  );

  console.log(
    `Filtered: ${result.filteredCount}`,
  );

  console.log(
    `High priority: ${priorityEvents.length}`,
  );

  console.log(
    `Suspicious AI matches: ${suspiciousAiMatches.length}`,
  );

  console.log(
    "====================================\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\n====================================",
    );

    console.error(
      "UNHANDLED EVENT RELEVANCE TEST ERROR",
    );

    console.error(
      "====================================\n",
    );

    console.error(
      error instanceof Error
        ? error.stack ??
          error.message
        : String(error),
    );

    process.exitCode = 1;
  },
);