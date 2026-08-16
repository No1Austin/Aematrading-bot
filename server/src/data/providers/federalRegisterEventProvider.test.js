import "dotenv/config";

import getFederalRegisterEvents from "./federalRegisterEventProvider.js";

import getMarketEvents from "./marketEventDataProvider.js";

/**
 * ============================================================
 * FEDERAL REGISTER REAL EVENT TEST
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * 1. Call the real Federal Register provider.
 * 2. Verify that real regulatory/government events are returned.
 * 3. Pass those events through marketEventDataProvider.js.
 * 4. Confirm that the normalized event schema is valid.
 *
 * This test does NOT yet allow Federal Register events
 * to influence live trading decisions.
 */

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "FEDERAL REGISTER REAL EVENT TEST",
  );

  console.log(
    "====================================\n",
  );

  /**
   * ----------------------------------------------------------
   * 1. LOAD REAL FEDERAL REGISTER EVENTS
   * ----------------------------------------------------------
   */

  const result =
    await getFederalRegisterEvents({
      /**
       * Use a 14-day window for testing so there is a
       * reasonable chance of receiving published documents.
       */
      lookbackHours:
        24 * 14,

      /**
       * Keep the first test reasonably small.
       */
      perPage:
        100,
    });

  /**
   * ----------------------------------------------------------
   * PROVIDER FAILURE
   * ----------------------------------------------------------
   */

  if (
    result.approved !== true
  ) {
    console.error(
      "\nFEDERAL REGISTER PROVIDER FAILED\n",
    );

    console.dir(
      {
        provider:
          result.provider,

        status:
          result.status,

        warnings:
          result.warnings ??
          [],

        errors:
          result.errors ??
          [],

        fetchedAt:
          result.fetchedAt ??
          null,
      },
      {
        depth: null,
      },
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Provider:",
    result.provider,
  );

  console.log(
    "Status:",
    result.status,
  );

  console.log(
    "Raw events:",
    result.eventCount,
  );

  /**
   * ----------------------------------------------------------
   * 2. HANDLE NO EVENTS
   * ----------------------------------------------------------
   *
   * NO_EVENTS is not necessarily a provider failure.
   */

  if (
    result.eventCount === 0
  ) {
    console.log(
      "\nNo Federal Register events were found in the requested window.",
    );

    console.log(
      "\nProvider warnings:",
      result.warnings ??
      [],
    );

    return;
  }

  /**
   * ----------------------------------------------------------
   * 3. NORMALIZE EVENTS
   * ----------------------------------------------------------
   */

  const normalized =
    await getMarketEvents({
      symbol:
        "AAPL",

      country:
        "US",

      /**
       * Use the same time window as the source provider.
       */
      lookbackHours:
        24 * 14,

      sourceEvents:
        result.events,
    });

  if (
    normalized.approved !== true
  ) {
    console.error(
      "\nFEDERAL REGISTER NORMALIZATION FAILED\n",
    );

    console.dir(
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
   * ----------------------------------------------------------
   * 4. SHOW SAMPLE EVENTS
   * ----------------------------------------------------------
   */

  console.log(
    "\n====================================",
  );

  console.log(
    "SAMPLE NORMALIZED EVENTS",
  );

  console.log(
    "====================================\n",
  );

  console.dir(
    normalized.events.slice(
      0,
      10,
    ),
    {
      depth: null,

      colors: true,
    },
  );

  /**
   * ----------------------------------------------------------
   * 5. BASIC EVENT SUMMARY
   * ----------------------------------------------------------
   */

  const typeCounts = {};

  for (
    const event
    of normalized.events
  ) {
    const type =
      event?.type ??
      "UNKNOWN";

    typeCounts[type] =
      (
        typeCounts[type] ??
        0
      ) + 1;
  }

  console.log(
    "\nEVENT TYPE COUNTS\n",
  );

  console.dir(
    typeCounts,
    {
      depth: null,
    },
  );

  /**
   * ----------------------------------------------------------
   * SUCCESS
   * ----------------------------------------------------------
   */

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — REAL FEDERAL REGISTER EVENTS RECEIVED",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Raw events:",
    result.eventCount,
  );

  console.log(
    "Normalized events:",
    normalized.eventCount,
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
      "UNHANDLED FEDERAL REGISTER TEST ERROR",
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