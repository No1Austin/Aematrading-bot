import "dotenv/config";

import getSocialSentimentData from "./socialSentimentDataProvider.js";

import analyzeSocialSentiment from "../../analysis/socialSentimentEngine.js";

function assertCondition(
  condition,
  message,
) {
  if (!condition) {
    throw new Error(
      message,
    );
  }
}

async function run() {
  console.log(
    "\n====================================",
  );

  console.log(
    "SOCIAL SENTIMENT PROVIDER TEST",
  );

  console.log(
    "====================================\n",
  );

  /**
   * These are injected VERIFIED-SHAPE platform snapshots
   * for testing the normalization and engine integration.
   *
   * This test does NOT claim live Reddit/StockTwits access.
   */

  const providerResult =
    await getSocialSentimentData({
      symbol:
        "AAPL",

      platformSnapshots: [
        {
          platform:
            "REDDIT",

          sentiment: {
            bullish:
              0.56,

            bearish:
              0.28,

            neutral:
              0.16,
          },

          mentions: {
            currentCount:
              120,

            currentWindowHours:
              1,

            baselineCount:
              1_200,

            baselineWindowHours:
              24,

            previousVelocity:
              90,
          },

          manipulation: {
            botProbability:
              null,

            spamProbability:
              0.12,

            coordinatedActivityScore:
              null,

            influencerConcentration:
              0.18,

            abnormalMentionSpike:
              0.25,
          },

          observedAt:
            new Date()
              .toISOString(),

          source:
            "TEST_REDDIT_ADAPTER",
        },

        {
          platform:
            "STOCKTWITS",

          sentiment: {
            bullish:
              0.61,

            bearish:
              0.24,

            neutral:
              0.15,
          },

          mentions: {
            currentCount:
              85,

            currentWindowHours:
              1,

            baselineCount:
              900,

            baselineWindowHours:
              24,

            previousVelocity:
              70,
          },

          manipulation: {
            botProbability:
              null,

            spamProbability:
              0.08,

            coordinatedActivityScore:
              null,

            influencerConcentration:
              0.22,

            abnormalMentionSpike:
              0.2,
          },

          observedAt:
            new Date()
              .toISOString(),

          source:
            "TEST_STOCKTWITS_ADAPTER",
        },
      ],
    });

  console.log(
    "PROVIDER RESULT\n",
  );

  console.dir(
    providerResult,
    {
      depth: null,
    },
  );

  assertCondition(
    providerResult.approved ===
      true,
    "Provider should approve valid normalized platform snapshots.",
  );

  assertCondition(
    providerResult.platformCount ===
      2,
    "Expected two valid platform snapshots.",
  );

  assertCondition(
    providerResult.data
      ?.sentiment,
    "Aggregated sentiment is missing.",
  );

  assertCondition(
    Array.isArray(
      providerResult.data
        ?.platforms,
    ) &&
    providerResult.data
      .platforms
      .length ===
      2,
    "Cross-platform sentiment data is missing.",
  );

  const engineResult =
    analyzeSocialSentiment({
      symbol:
        "AAPL",

      ...providerResult.data,
    });

  console.log(
    "\n====================================",
  );

  console.log(
    "SOCIAL SENTIMENT ENGINE RESULT",
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

  assertCondition(
    engineResult.approved ===
      true,
    "Social Sentiment Engine should approve usable sentiment data.",
  );

  assertCondition(
    engineResult.direction !==
      "UNKNOWN",
    "Social Sentiment Engine returned UNKNOWN direction despite usable sentiment.",
  );

  assertCondition(
    engineResult
      ?.platformAgreement
      ?.platformCount ===
      2,
    "Expected two platforms in cross-platform agreement.",
  );

  /**
   * Fail-closed no-source test.
   */

  const emptyResult =
    await getSocialSentimentData({
      symbol:
        "AAPL",

      platformSnapshots:
        [],
    });

  assertCondition(
    emptyResult.approved ===
      false,
    "Provider must fail closed when no verified platform data exists.",
  );

  assertCondition(
    emptyResult.status ===
      "INSUFFICIENT_DATA",
    "No-source result should be INSUFFICIENT_DATA.",
  );

  console.log(
    "\n====================================",
  );

  console.log(
    "SUCCESS — SOCIAL PROVIDER PIPELINE PASSED",
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
    "Crowd state:",
    engineResult.crowdState,
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
    "Platforms:",
    engineResult
      ?.platformAgreement
      ?.platformCount ??
      0,
  );

  console.log(
    "Manipulation coverage:",
    providerResult
      ?.data
      ?.manipulationCoverage
      ?.coverage ??
      null,
  );

  console.log(
    "====================================\n",
  );
}

run().catch(
  (error) => {
    console.error(
      "\nSOCIAL PROVIDER TEST FAILED:",
      error,
    );

    process.exitCode =
      1;
  },
);
