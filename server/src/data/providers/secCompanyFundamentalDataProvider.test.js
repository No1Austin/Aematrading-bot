import "dotenv/config";

import getSecCompanyFundamentalData from "./secCompanyFundamentalDataProvider.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "SEC REAL COMPANY FUNDAMENTALS TEST",
  );

  console.log(
    "====================================\n",
  );

  const result =
    await getSecCompanyFundamentalData({
      symbol: "AAPL",
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
    "Symbol:",
    result.symbol,
  );

  console.log(
    "CIK:",
    result.cik,
  );

  console.log(
    "Indicators:",
    result.indicatorCount,
  );

  console.log(
    "\nFUNDAMENTAL DATA\n",
  );

  console.dir(
    result.data,
    {
      depth: null,
    },
  );

  console.log(
    "\nSUCCESS — REAL SEC FUNDAMENTALS RECEIVED\n",
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