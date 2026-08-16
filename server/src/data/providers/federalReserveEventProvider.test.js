import "dotenv/config";

import getFederalReserveEvents from "./federalReserveEventProvider.js";

import getMarketEvents from "./marketEventDataProvider.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "FEDERAL RESERVE REAL EVENT TEST",
  );

  console.log(
    "====================================\n",
  );

  const fed =
    await getFederalReserveEvents({
      /**
       * Use a larger test window because there may
       * not have been a Fed announcement this week.
       */
      lookbackHours:
        24 * 45,
    });

  if (
    fed.approved !== true
  ) {
    console.error(
      "FED PROVIDER FAILED:",
      fed,
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Provider:",
    fed.provider,
  );

  console.log(
    "Status:",
    fed.status,
  );

  console.log(
    "Raw events:",
    fed.eventCount,
  );

  const normalized =
    await getMarketEvents({
      symbol:
        "AAPL",

      country:
        "US",

      lookbackHours:
        24 * 45,

      sourceEvents:
        fed.events,
    });

  if (
    normalized.approved !==
    true
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

  console.log(
    "\nEVENTS\n",
  );

  console.dir(
    normalized.events,
    {
      depth: null,
    },
  );

  console.log(
    "\nSUCCESS — REAL FEDERAL RESERVE EVENTS RECEIVED\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nUNHANDLED FED EVENT TEST ERROR\n",
      error,
    );

    process.exitCode = 1;
  },
);