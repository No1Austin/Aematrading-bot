import "dotenv/config";

import getCompanyFundamentalData from "./companyFundamentalDataProvider.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "REAL COMPANY FUNDAMENTAL DATA TEST",
  );

  console.log(
    "====================================\n",
  );

  const result =
    await getCompanyFundamentalData({
      symbol: "AAPL",
    });

  if (
    result.approved !==
    true
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
    "Indicators:",
    result.indicatorCount,
  );

  console.log(
    "\nCOMPANY DATA\n",
  );

  console.dir(
    result.data,
    {
      depth: null,
    },
  );

  console.log(
    "\nSUCCESS — REAL FUNDAMENTALS RECEIVED\n",
  );
}

run().catch(
  (error) => {
    console.error(
      error,
    );

    process.exitCode = 1;
  },
);