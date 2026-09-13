import "dotenv/config";

import historicalRecordsProvider, {
  clearHistoricalRecordsCache,
} from "./historicalRecordsProvider.js";

import analyzeHistoricalAnalogues from "../../analysis/historicalAnalogueEngine.js";

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log("\n====================================");
  console.log("HISTORICAL RECORDS PROVIDER TEST");
  console.log("====================================\n");

  clearHistoricalRecordsCache();

  const context = {
    symbol: "AAPL",

    bar: {
      timestamp: "2026-08-14T19:55:00.000Z",
    },

    asOfTimestamp:
      "2026-08-14T19:55:00.000Z",

    candles: [],

    historicalConfig: {
      /**
       * Keep this first real test deliberately small.
       * Each record can invoke point-in-time macro, SEC,
       * country and event providers.
       */
      lookbackDays: 240,

      sampleIntervalMinutes:
        390 * 5,

      minimumWarmupBars: 200,

      maximumRecords: 10,

      cacheTtlMs:
        60 * 60 * 1000,
    },
  };

  const records =
    await historicalRecordsProvider(
      context,
    );

  console.log(
    "Record count:",
    records.length,
  );

  assertCondition(
    Array.isArray(records),
    "Provider did not return an array.",
  );

  if (records.length === 0) {
    console.log(
      "\nProvider returned no usable historical records.",
    );

    console.log(
      "This is a safe result, but Engine 7 cannot yet award historical points.",
    );

    process.exitCode = 1;
    return;
  }

  console.log(
    "\nFIRST RECORD\n",
  );

  console.dir(
    records[0],
    {
      depth: null,
    },
  );

  const asOfMs =
    new Date(
      context.asOfTimestamp,
    ).getTime();

  for (const record of records) {
    assertCondition(
      new Date(
        record.timestamp,
      ).getTime() <
        asOfMs,
      `LOOK-AHEAD FAILURE: ${record.timestamp} is not earlier than asOfTimestamp.`,
    );

    assertCondition(
      record.fingerprint &&
        typeof record.fingerprint ===
          "object",
      "Record fingerprint is missing.",
    );

    assertCondition(
      record.forwardReturns &&
        typeof record.forwardReturns ===
          "object",
      "Record forwardReturns is missing.",
    );

    for (
      const field
      of [
        "oneHour",
        "oneDay",
        "fiveDay",
        "twentyDay",
        "sixtyDay",
      ]
    ) {
      assertCondition(
        Number.isFinite(
          Number(
            record
              .forwardReturns[field],
          ),
        ),
        `Forward return ${field} is missing or invalid.`,
      );
    }
  }

  console.log(
    "\nLOOK-AHEAD CHECK: PASS",
  );

  /**
   * Use the newest generated fingerprint as a deterministic
   * current state for the first integration validation.
   */
  const current =
    records[
      records.length - 1
    ].fingerprint;

  function scoreObject(value) {
    return value === null ||
      value === undefined
      ? null
      : {
          rawScore:
            Number(value),
        };
  }

  const marketRegime =
    current.regime === null ||
    current.regime === undefined
      ? null
      : {
          regime:
            current.regime >= 0.8
              ? "STRONG_BULL"
              : current.regime >= 0.3
                ? "BULL"
                : current.regime <= -0.8
                  ? "STRONG_BEAR"
                  : current.regime <= -0.3
                    ? "BEAR"
                    : "SIDEWAYS",
        };

  const result =
    analyzeHistoricalAnalogues({
      technical:
        scoreObject(
          current.technical,
        ),

      macro:
        scoreObject(
          current.macro,
        ),

      marketRegime,

      country:
        scoreObject(
          current.country,
        ),

      company:
        scoreObject(
          current.company,
        ),

      events:
        scoreObject(
          current.events,
        ),

      social:
        scoreObject(
          current.social,
        ),

      volatility:
        current.volatility ===
          null ||
        current.volatility ===
          undefined
          ? null
          : {
              score:
                (1 -
                  Number(
                    current.volatility,
                  )) /
                2,
            },

      liquidity:
        scoreObject(
          current.liquidity,
        ),

      historicalRecords:
        records,

      asOfTimestamp:
        context.asOfTimestamp,
    });

  console.log(
    "\n====================================",
  );

  console.log(
    "HISTORICAL ANALOGUE RESULT",
  );

  console.log(
    "====================================\n",
  );

  console.dir(
    result,
    {
      depth: null,
    },
  );

  assertCondition(
    result?.engine ===
      "HISTORICAL_ANALOGUE",
    "Historical Analogue Engine did not execute.",
  );

  assertCondition(
    Number(
      result?.maximumScore,
    ) === 5,
    "Historical Analogue maximum score must remain 5.",
  );

  const longPoints =
    Number(
      result
        ?.pointContribution
        ?.long ??
        0,
    );

  const shortPoints =
    Number(
      result
        ?.pointContribution
        ?.short ??
        0,
    );

  assertCondition(
    longPoints >= 0 &&
      longPoints <= 5,
    "LONG historical points exceeded the 0-5 range.",
  );

  assertCondition(
    shortPoints >= 0 &&
      shortPoints <= 5,
    "SHORT historical points exceeded the 0-5 range.",
  );

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — ENGINE 7 PIPELINE TEST PASSED",
  );

  console.log(
    "====================================",
  );

  console.log(
    "Records:",
    records.length,
  );

  console.log(
    "Status:",
    result.status,
  );

  console.log(
    "Analogues:",
    result.analogueCount,
  );

  console.log(
    "Direction:",
    result.direction,
  );

  console.log(
    "Confidence:",
    result.confidence,
  );

  console.log(
    "LONG points:",
    longPoints,
  );

  console.log(
    "SHORT points:",
    shortPoints,
  );

  console.log(
    "====================================\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nENGINE 7 TEST FAILED:",
    );

    console.error(error);

    process.exitCode = 1;
  },
);
