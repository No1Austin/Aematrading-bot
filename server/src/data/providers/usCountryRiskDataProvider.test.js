import "dotenv/config";

import getUSCountryRiskData from "./usCountryRiskDataProvider.js";

import analyzeCountryRisk from "../../analysis/countryRiskEngine.js";

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "REAL U.S. COUNTRY RISK TEST",
  );

  console.log(
    "====================================\n",
  );

  /**
   * ========================================================
   * LOAD REAL COUNTRY DATA
   * ========================================================
   */

  const providerResult =
  await getUSCountryRiskData();

  if (
    providerResult.approved !==
      true ||
    !providerResult.data
  ) {
    console.error(
      "COUNTRY PROVIDER FAILED:",
      providerResult,
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "Provider:",
    providerResult.provider,
  );

  console.log(
    "Status:",
    providerResult.status,
  );

  console.log(
    "Country:",
    providerResult.country,
  );

  console.log(
    "Indicators:",
    providerResult.indicatorCount,
  );

  console.log(
    "\nCOUNTRY DATA\n",
  );

  console.dir(
    providerResult.data,
    {
      depth: null,
    },
  );

  /**
   * ========================================================
   * RUN COUNTRY RISK ENGINE
   * ========================================================
   */

  const data =
    providerResult.data;

  const engineResult =
    analyzeCountryRisk({
      country:
        data.country,

      economicGrowth:
        data.economicGrowth,

      inflation:
        data.inflation,

      interestRates:
        data.interestRates,

      currency:
        data.currency,

      capitalFlows:
        data.capitalFlows,

      sovereignRisk:
        data.sovereignRisk,

      fiscal:
        data.fiscal,

      political:
        data.political,

      trade:
        data.trade,

      credit:
        data.credit,

      consumer:
        data.consumer,

      banking:
        data.banking,
    });

  console.log(
    "\n====================================",
  );

  console.log(
    "COUNTRY RISK ENGINE RESULT",
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

  /**
   * ========================================================
   * SAFE VALIDATION
   * ========================================================
   */

  if (
    engineResult.approved !==
    true
  ) {
    console.error(
      "\nFAILED — Country Risk Engine did not approve analysis.",
    );

    process.exitCode = 1;

    return;
  }

  if (
    !engineResult.direction
  ) {
    console.error(
      "\nFAILED — Country Risk Engine returned no direction.",
    );

    process.exitCode = 1;

    return;
  }

  if (
    !engineResult
      .directionalSupport
  ) {
    console.error(
      "\nFAILED — Directional support is missing.",
    );

    process.exitCode = 1;

    return;
  }

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — REAL U.S. COUNTRY RISK ANALYSIS",
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
    "Country Risk:",
    engineResult
      ?.risk
      ?.level ??
      "UNKNOWN",
  );

  console.log(
    "Risk Score:",
    engineResult
      ?.risk
      ?.score ??
      null,
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
    "Evidence count:",
    engineResult
      ?.evidence
      ?.length ??
      0,
  );

  console.log(
    "====================================\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nUNHANDLED COUNTRY TEST ERROR:",
    );

    console.error(
      error instanceof Error
        ? error.stack
        : error,
    );

    process.exitCode = 1;
  },
);