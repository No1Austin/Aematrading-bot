import "dotenv/config";

import getFederalReserveEvents from "./federalReserveEventProvider.js";
import getMarketEvents from "./marketEventDataProvider.js";

import interpretMarketEvents from "../../analysis/eventInterpretationEngine.js";
import analyzeEvents from "../../analysis/eventIntelligenceEngine.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "FEDERAL RESERVE EVENT INTERPRETATION TEST",
  );

  console.log(
    "====================================\n",
  );

  /**
   * --------------------------------------------------------
   * 1. LOAD REAL FED EVENTS
   * --------------------------------------------------------
   */

  const fedResult =
    await getFederalReserveEvents({
      lookbackHours:
        24 * 45,
    });

  if (
    fedResult.approved !== true
  ) {
    console.error(
      "FED PROVIDER FAILED:",
      fedResult,
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Raw Fed events:",
    fedResult.eventCount,
  );

  /**
   * --------------------------------------------------------
   * 2. NORMALIZE EVENTS
   * --------------------------------------------------------
   */

  const normalized =
    await getMarketEvents({
      symbol:
        "AAPL",

      country:
        "US",

      lookbackHours:
        24 * 45,

      sourceEvents:
        fedResult.events,
    });

  if (
    normalized.approved !== true
  ) {
    console.error(
      "EVENT NORMALIZER FAILED:",
      normalized,
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Normalized events:",
    normalized.eventCount,
  );

  /**
   * --------------------------------------------------------
   * 3. INTERPRET EVENTS
   * --------------------------------------------------------
   *
   * We intentionally do not provide fabricated market
   * expectations yet.
   *
   * The engine can interpret language from the actual
   * Fed statement, but surprise may remain null.
   */

  const interpreted =
    interpretMarketEvents({
      events:
        normalized.events,

      symbol:
        "AAPL",

      country:
        "US",

      sector:
        "TECHNOLOGY",

      macro: null,

      expectationsByEvent: {},
    });

  if (
    interpreted.approved !== true
  ) {
    console.error(
      "INTERPRETATION FAILED:",
      interpreted,
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Interpreted:",
    interpreted.interpretedCount,
  );

  console.log(
    "Unresolved:",
    interpreted.unresolvedCount,
  );

  console.log(
    "\nINTERPRETED EVENTS\n",
  );

  console.dir(
    interpreted.events,
    {
      depth: null,
    },
  );

  /**
   * --------------------------------------------------------
   * 4. RUN EVENT INTELLIGENCE ENGINE
   * --------------------------------------------------------
   */

  const engineResult =
    analyzeEvents({
      events:
        interpreted.events,

      symbol:
        "AAPL",

      country:
        "US",

      sector:
        "TECHNOLOGY",

      currentTimestamp:
        Date.now(),
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
    engineResult,
    {
      depth: null,
    },
  );

  if (
    engineResult.approved !== true
  ) {
    console.error(
      "\nFAILED — Event Intelligence Engine did not approve analysis.",
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — REAL FED EVENT INTELLIGENCE",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Direction:",
    engineResult.direction,
  );

  console.log(
    "Confidence:",
    engineResult.confidence,
  );

  console.log(
    "LONG support:",
    engineResult
      ?.directionalSupport
      ?.long ??
      0,
  );

  console.log(
    "SHORT support:",
    engineResult
      ?.directionalSupport
      ?.short ??
      0,
  );

  console.log(
    "Event freeze:",
    engineResult
      ?.eventFreeze
      ?.active === true
      ? "ACTIVE"
      : "NO",
  );

  console.log(
    "Relevant events:",
    engineResult
      ?.eventCount ??
      0,
  );

  console.log(
    "====================================\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nUNHANDLED FED INTERPRETATION TEST ERROR\n",
      error,
    );

    process.exitCode = 1;
  },
);