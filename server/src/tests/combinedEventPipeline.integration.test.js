import "dotenv/config";

import getFederalReserveEvents from "../data/providers/federalReserveEventProvider.js";

import getFederalRegisterEvents from "../data/providers/federalRegisterEventProvider.js";

import getMarketEvents from "../data/providers/marketEventDataProvider.js";

import filterRelevantEvents from "../analysis/eventRelevanceEngine.js";

import interpretMarketEvents from "../analysis/eventInterpretationEngine.js";

import analyzeEvents from "../analysis/eventIntelligenceEngine.js";

import getUSMacroData from "../data/providers/usMacroDataProvider.js";

/**
 * ============================================================
 * COMBINED EVENT PIPELINE INTEGRATION TEST
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Test the complete real-data event path:
 *
 * Federal Reserve
 *      +
 * Federal Register
 *      ↓
 * normalization
 *      ↓
 * relevance filtering
 *      ↓
 * interpretation
 *      ↓
 * combined event intelligence
 *
 * This test does NOT place trades.
 */

const SYMBOL =
  "AAPL";

const COUNTRY =
  "US";

const SECTOR =
  "TECHNOLOGY";

const LOOKBACK_HOURS =
  72;

async function loadMacro() {
  const result =
    await getUSMacroData();

  if (
    result.approved !== true ||
    !result.data
  ) {
    console.warn(
      "[TEST MACRO] Real FRED macro data unavailable.",
      {
        status:
          result.status ??
          "UNKNOWN",

        warnings:
          result.warnings ??
          [],

        errors:
          result.errors ??
          [],
      },
    );

    /**
     * Safe fail:
     *
     * Do not fabricate macro data.
     */
    return null;
  }

  console.log(
    `[TEST MACRO] ${result.indicatorCount ?? 0} real FRED indicators loaded.`,
  );

  return result.data;
}

async function loadFederalReservePipeline({
  macro,
  asOfTimestamp,
}) {
  console.log(
    "\n====================================",
  );

  console.log(
    "FEDERAL RESERVE PIPELINE",
  );

  console.log(
    "====================================",
  );

  const source =
    await getFederalReserveEvents({
      asOfTimestamp,

      lookbackHours:
        LOOKBACK_HOURS,
    });

  if (
    source.approved !== true
  ) {
    console.warn(
      "[FED TEST] Provider unavailable.",
      {
        status:
          source.status,

        warnings:
          source.warnings ??
          [],

        errors:
          source.errors ??
          [],
      },
    );

    return [];
  }

  console.log(
    "Raw Fed events:",
    source.eventCount,
  );

  if (
    source.eventCount ===
    0
  ) {
    return [];
  }

  const normalized =
    await getMarketEvents({
      symbol:
        SYMBOL,

      country:
        COUNTRY,

      asOfTimestamp,

      lookbackHours:
        LOOKBACK_HOURS,

      sourceEvents:
        source.events,
    });

  if (
    normalized.approved !== true
  ) {
    console.warn(
      "[FED TEST] Normalization failed.",
      {
        status:
          normalized.status,

        warnings:
          normalized.warnings ??
          [],

        errors:
          normalized.errors ??
          [],
      },
    );

    return [];
  }

  console.log(
    "Normalized Fed events:",
    normalized.eventCount,
  );

  const interpretation =
    interpretMarketEvents({
      events:
        normalized.events,

      symbol:
        SYMBOL,

      country:
        COUNTRY,

      sector:
        SECTOR,

      macro,

      expectationsByEvent:
        {},
    });

  if (
    interpretation.approved !==
      true
  ) {
    console.warn(
      "[FED TEST] Interpretation failed.",
      {
        status:
          interpretation.status,

        warnings:
          interpretation.warnings ??
          [],

        errors:
          interpretation.errors ??
          [],
      },
    );

    return [];
  }

  console.log(
    "Fed interpreted:",
    interpretation.interpretedCount,
  );

  console.log(
    "Fed unresolved:",
    interpretation.unresolvedCount,
  );

  return (
    interpretation.events ??
    []
  );
}

async function loadFederalRegisterPipeline({
  macro,
  asOfTimestamp,
}) {
  console.log(
    "\n====================================",
  );

  console.log(
    "FEDERAL REGISTER PIPELINE",
  );

  console.log(
    "====================================",
  );

  const source =
    await getFederalRegisterEvents({
      asOfTimestamp,

      lookbackHours:
        LOOKBACK_HOURS,

      perPage:
        100,
    });

  if (
    source.approved !== true
  ) {
    console.warn(
      "[REGISTER TEST] Provider unavailable.",
      {
        status:
          source.status,

        warnings:
          source.warnings ??
          [],

        errors:
          source.errors ??
          [],
      },
    );

    return [];
  }

  console.log(
    "Raw Register events:",
    source.eventCount,
  );

  if (
    source.eventCount ===
    0
  ) {
    return [];
  }

  const normalized =
    await getMarketEvents({
      symbol:
        SYMBOL,

      country:
        COUNTRY,

      asOfTimestamp,

      lookbackHours:
        LOOKBACK_HOURS,

      sourceEvents:
        source.events,
    });

  if (
    normalized.approved !== true
  ) {
    console.warn(
      "[REGISTER TEST] Normalization failed.",
      {
        status:
          normalized.status,

        warnings:
          normalized.warnings ??
          [],

        errors:
          normalized.errors ??
          [],
      },
    );

    return [];
  }

  console.log(
    "Normalized Register events:",
    normalized.eventCount,
  );

  const relevance =
    filterRelevantEvents({
      events:
        normalized.events,

      symbol:
        SYMBOL,

      sector:
        SECTOR,

      country:
        COUNTRY,

      minimumScore:
        0.4,
    });

  if (
    relevance.approved !== true
  ) {
    console.warn(
      "[REGISTER TEST] Relevance filtering failed.",
      {
        status:
          relevance.status,

        warnings:
          relevance.warnings ??
          [],

        errors:
          relevance.errors ??
          [],
      },
    );

    return [];
  }

  console.log(
    "Register relevant:",
    relevance.relevantCount,
  );

  console.log(
    "Register filtered:",
    relevance.filteredCount,
  );

  if (
    relevance.relevantCount ===
    0
  ) {
    return [];
  }

  const interpretation =
    interpretMarketEvents({
      events:
        relevance.events,

      symbol:
        SYMBOL,

      country:
        COUNTRY,

      sector:
        SECTOR,

      macro,

      expectationsByEvent:
        {},
    });

  if (
    interpretation.approved !==
      true
  ) {
    console.warn(
      "[REGISTER TEST] Interpretation failed.",
      {
        status:
          interpretation.status,

        warnings:
          interpretation.warnings ??
          [],

        errors:
          interpretation.errors ??
          [],
      },
    );

    return [];
  }

  console.log(
    "Register interpreted:",
    interpretation.interpretedCount,
  );

  console.log(
    "Register unresolved:",
    interpretation.unresolvedCount,
  );

  return (
    interpretation.events ??
    []
  );
}

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "COMBINED REAL EVENT PIPELINE TEST",
  );

  console.log(
    "====================================\n",
  );

  const asOfTimestamp =
    new Date()
      .toISOString();

  const macro =
    await loadMacro();

  /**
   * ----------------------------------------------------------
   * SOURCE PIPELINES
   * ----------------------------------------------------------
   */

  const [
    fedEvents,
    registerEvents,
  ] =
    await Promise.all([
      loadFederalReservePipeline({
        macro,
        asOfTimestamp,
      }),

      loadFederalRegisterPipeline({
        macro,
        asOfTimestamp,
      }),
    ]);

  /**
   * ----------------------------------------------------------
   * COMBINE VERIFIED EVENTS
   * ----------------------------------------------------------
   */

  const combinedEvents = [
    ...fedEvents,
    ...registerEvents,
  ];

  console.log(
    "\n====================================",
  );

  console.log(
    "COMBINED EVENT SUMMARY",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Federal Reserve events:",
    fedEvents.length,
  );

  console.log(
    "Federal Register events:",
    registerEvents.length,
  );

  console.log(
    "Combined events:",
    combinedEvents.length,
  );

  if (
    combinedEvents.length ===
    0
  ) {
    console.warn(
      "\nNo verified events were available for intelligence analysis.",
    );

    return;
  }

  /**
   * ----------------------------------------------------------
   * EVENT INTELLIGENCE ENGINE
   * ----------------------------------------------------------
   */

  const intelligence =
    analyzeEvents({
      events:
        combinedEvents,

      symbol:
        SYMBOL,

      country:
        COUNTRY,

      sector:
        SECTOR,

      asOfTimestamp,

      maximumScore:
        10,
    });

  console.log(
    "\n====================================",
  );

  console.log(
    "EVENT INTELLIGENCE RESULT",
  );

  console.log(
    "====================================\n",
  );

  console.dir(
    intelligence,
    {
      depth: null,
    },
  );

  /**
   * ----------------------------------------------------------
   * BASIC SAFETY ASSERTIONS
   * ----------------------------------------------------------
   */

  if (
    intelligence.approved !==
      true
  ) {
    throw new Error(
      "Combined Event Intelligence did not approve the analysis.",
    );
  }

  if (
    ![
      "STRONG_BULLISH",
      "BULLISH",
      "NEUTRAL",
      "BEARISH",
      "STRONG_BEARISH",
      "MIXED",
      "UNKNOWN",
    ].includes(
      intelligence.direction,
    )
  ) {
    throw new Error(
      `Unexpected event direction: ${intelligence.direction}`,
    );
  }

  /**
   * Unknown events must not silently become directional.
   */

  const suspiciousUnknowns =
    (
      intelligence.relevantEvents ??
      []
    ).filter(
      (event) =>
        event.rawImpact ===
          null &&
        (
          event.direction ===
            "BULLISH" ||
          event.direction ===
            "BEARISH" ||
          event.direction ===
            "STRONG_BULLISH" ||
          event.direction ===
            "STRONG_BEARISH"
        ),
    );

  if (
    suspiciousUnknowns.length >
    0
  ) {
    console.error(
      "\nSUSPICIOUS UNKNOWN EVENTS\n",
    );

    console.dir(
      suspiciousUnknowns,
      {
        depth: null,
      },
    );

    throw new Error(
      "Unknown events were incorrectly converted into directional evidence.",
    );
  }

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — COMBINED EVENT PIPELINE PASSED",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Direction:",
    intelligence.direction,
  );

  console.log(
    "Confidence:",
    intelligence.confidence,
  );

  console.log(
    "LONG support:",
    intelligence
      ?.directionalSupport
      ?.long ??
      null,
  );

  console.log(
    "SHORT support:",
    intelligence
      ?.directionalSupport
      ?.short ??
      null,
  );

  console.log(
    "Relevant events:",
    intelligence.eventCount,
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
      "COMBINED EVENT PIPELINE FAILED",
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