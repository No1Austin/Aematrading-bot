import "dotenv/config";

import getUSMacroData from "./usMacroDataProvider.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "FRED REAL U.S. MACRO DATA TEST",
  );

  console.log(
    "====================================\n",
  );

  const result =
    await getUSMacroData({
      forceRefresh: true,
    });

  if (
    result.approved !== true
  ) {
    console.error(
      "FAILED:",
      result,
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Provider:",
    result.provider,
  );

  console.log(
    "Country:",
    result.country,
  );

  console.log(
    "Indicators:",
    result.indicatorCount,
  );

  console.log(
    "\nMACRO DATA\n",
  );

  console.dir(
    result.data,
    {
      depth: null,
    },
  );

  console.log(
    "\nSUCCESS — REAL U.S. MACRO DATA RECEIVED\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nUNHANDLED TEST ERROR\n",
      error,
    );

    process.exitCode = 1;
  },
);