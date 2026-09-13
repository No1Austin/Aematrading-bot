// server/src/tests/adanosSocialSentimentEngine.integration.test.js

import {
  describe,
  expect,
  test,
} from "vitest";

import {
  normalizeAdanosPlatformResponse,
} from "../data/providers/social/adanosSocialAdapter.js";

import getSocialSentimentData
  from "../data/providers/socialSentimentDataProvider.js";

import analyzeSocialSentiment
  from "../analysis/socialSentimentEngine.js";

const OBSERVED_AT =
  "2026-08-23T18:00:00.000Z";

function redditResponse(
  overrides = {},
) {
  return {
    ticker: "AAPL",

    company_name:
      "Apple Inc.",

    found: true,

    buzz_score: 75,

    mentions: 140,

    sentiment_score: 0.31,

    unique_posts: 55,

    subreddit_count: 7,

    trend: "rising",

    bullish_pct: 52,

    bearish_pct: 21,

    period_days: 7,

    daily_trend: [
      {
        date:
          "2026-08-17",

        mentions: 50,
      },
      {
        date:
          "2026-08-18",

        mentions: 60,
      },
      {
        date:
          "2026-08-19",

        mentions: 70,
      },
      {
        date:
          "2026-08-20",

        mentions: 80,
      },
      {
        date:
          "2026-08-21",

        mentions: 90,
      },
      {
        date:
          "2026-08-22",

        mentions: 100,
      },
      {
        date:
          "2026-08-23",

        mentions: 140,
      },
    ],

    ...overrides,
  };
}

function xResponse(
  overrides = {},
) {
  return {
    ticker: "AAPL",

    company_name:
      "Apple Inc.",

    found: true,

    buzz_score: 68,

    mentions: 220,

    sentiment_score: 0.22,

    unique_tweets: 175,

    trend: "stable",

    bullish_pct: 47,

    bearish_pct: 25,

    period_days: 7,

    daily_trend: [
      {
        date:
          "2026-08-17",

        mentions: 140,
      },
      {
        date:
          "2026-08-18",

        mentions: 150,
      },
      {
        date:
          "2026-08-19",

        mentions: 155,
      },
      {
        date:
          "2026-08-20",

        mentions: 160,
      },
      {
        date:
          "2026-08-21",

        mentions: 170,
      },
      {
        date:
          "2026-08-22",

        mentions: 180,
      },
      {
        date:
          "2026-08-23",

        mentions: 220,
      },
    ],

    ...overrides,
  };
}

function buildSnapshots({
  includeX = true,
  redditOverrides = {},
  xOverrides = {},
} = {}) {
  const snapshots = [
    normalizeAdanosPlatformResponse({
      platform:
        "REDDIT",

      response:
        redditResponse(
          redditOverrides,
        ),

      observedAt:
        OBSERVED_AT,
    }),
  ];

  if (includeX) {
    snapshots.push(
      normalizeAdanosPlatformResponse({
        platform:
          "X",

        response:
          xResponse(
            xOverrides,
          ),

        observedAt:
          OBSERVED_AT,
      }),
    );
  }

  return snapshots;
}

async function runSocialEngine({
  includeX = true,
  redditOverrides = {},
  xOverrides = {},
} = {}) {
  const providerResult =
    await getSocialSentimentData({
      symbol:
        "AAPL",

      platformSnapshots:
        buildSnapshots({
          includeX,
          redditOverrides,
          xOverrides,
        }),

      fetchedAt:
        OBSERVED_AT,
    });

  if (
    providerResult
      .approved !== true
  ) {
    return {
      providerResult,

      engineResult:
        null,
    };
  }

  const engineResult =
    analyzeSocialSentiment({
      symbol:
        "AAPL",

      sentiment:
        providerResult
          .data
          .sentiment,

      mentions:
        providerResult
          .data
          .mentions,

      platforms:
        providerResult
          .data
          .platforms,

      manipulation:
        providerResult
          .data
          .manipulation,

      manipulationCoverage:
        providerResult
          .data
          .manipulationCoverage,
    });

  return {
    providerResult,
    engineResult,
  };
}

describe(
  "Adanos → Social Sentiment Engine Integration",
  () => {
    test(
      "produces a complete SOCIAL_SENTIMENT result",
      async () => {
        const {
          engineResult,
        } =
          await runSocialEngine();

        expect(
          engineResult
            .approved,
        ).toBe(true);

        expect(
          engineResult
            .engine,
        ).toBe(
          "SOCIAL_SENTIMENT",
        );

        expect(
          engineResult
            .status,
        ).toBe(
          "COMPLETE",
        );
      },
    );

    test(
      "bullish Adanos evidence produces positive social score",
      async () => {
        const {
          engineResult,
        } =
          await runSocialEngine();

        expect(
          engineResult
            .rawScore,
        ).toBeGreaterThan(
          0,
        );

        expect(
          engineResult
            .directionalSupport
            .long,
        ).toBeGreaterThan(
          engineResult
            .directionalSupport
            .short,
        );
      },
    );

    test(
      "rising social activity is preserved by the engine",
      async () => {
        const {
          engineResult,
        } =
          await runSocialEngine();

        expect(
          engineResult
            .activity
            .velocity,
        ).toBeGreaterThan(
          0,
        );

        expect(
          engineResult
            .activity
            .baselineVelocity,
        ).toBeGreaterThan(
          0,
        );

        expect(
          engineResult
            .activity
            .acceleration,
        ).toBeGreaterThan(
          0,
        );
      },
    );

    test(
      "cross-platform agreement sees Reddit and X",
      async () => {
        const {
          engineResult,
        } =
          await runSocialEngine();

        expect(
          engineResult
            .platformAgreement
            .platformCount,
        ).toBe(2);
      },
    );

    test(
      "incomplete manipulation evidence remains explicitly unsafe",
      async () => {
        const {
          engineResult,
        } =
          await runSocialEngine();

        expect(
          engineResult
            .manipulationRisk
            .coverage
            .fullyObserved,
        ).toBe(false);

        expect(
          engineResult
            .warnings
            .some(
              (warning) =>
                warning.includes(
                  "Manipulation coverage",
                ),
            ),
        ).toBe(true);
      },
    );

    test(
      "unknown bot and spam evidence is not silently treated as verified safe",
      async () => {
        const {
          providerResult,
          engineResult,
        } =
          await runSocialEngine();

        expect(
          providerResult
            .data
            .manipulation
            .botProbability,
        ).toBeNull();

        expect(
          providerResult
            .data
            .manipulation
            .spamProbability,
        ).toBeNull();

        expect(
          engineResult
            .manipulationRisk,
        ).toBeTruthy();
      },
    );

    test(
      "one-platform evidence remains usable but loses cross-platform confirmation",
      async () => {
        const {
          providerResult,
          engineResult,
        } =
          await runSocialEngine({
            includeX:
              false,
          });

        expect(
          providerResult
            .status,
        ).toBe(
          "PARTIAL",
        );

        expect(
          engineResult
            .approved,
        ).toBe(true);

        expect(
          engineResult
            .platformAgreement
            .platformCount,
        ).toBe(1);

        expect(
          engineResult
            .warnings
            .some(
              (warning) =>
                warning.includes(
                  "Cross-platform",
                ),
            ),
        ).toBe(true);
      },
    );

    test(
      "same Adanos evidence produces deterministic social analysis apart from timestamp",
      async () => {
        const first =
          await runSocialEngine();

        const second =
          await runSocialEngine();

        const {
          timestamp:
            _firstTimestamp,

          ...firstComparable
        } =
          first.engineResult;

        const {
          timestamp:
            _secondTimestamp,

          ...secondComparable
        } =
          second.engineResult;

        expect(
          firstComparable,
        ).toEqual(
          secondComparable,
        );
      },
    );
  },
);