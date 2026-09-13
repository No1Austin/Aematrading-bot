import {
  describe,
  expect,
  test,
} from "vitest";

import {
  normalizeAdanosPlatformResponse,
} from "./adanosSocialAdapter.js";

import getSocialSentimentData
  from "../socialSentimentDataProvider.js";

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

    total_upvotes: 12000,

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

function snapshots() {
  return [
    normalizeAdanosPlatformResponse({
      platform:
        "REDDIT",

      response:
        redditResponse(),

      observedAt:
        OBSERVED_AT,
    }),

    normalizeAdanosPlatformResponse({
      platform:
        "X",

      response:
        xResponse(),

      observedAt:
        OBSERVED_AT,
    }),
  ];
}

describe(
  "Adanos → Social Sentiment Provider Integration",
  () => {
    test(
      "aggregates Reddit and X into READY social data",
      async () => {
        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots:
              snapshots(),

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "READY",
        );

        expect(
          result.platformCount,
        ).toBe(2);
      },
    );

    test(
      "preserves both social sources",
      async () => {
        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots:
              snapshots(),

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.data.platforms,
        ).toHaveLength(2);

        expect(
          result.data.sources
            .map(
              (source) =>
                source.platform,
            ),
        ).toEqual([
          "REDDIT",
          "X",
        ]);
      },
    );

    test(
      "produces weighted aggregate sentiment",
      async () => {
        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots:
              snapshots(),

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.data.sentiment
            .bullish,
        ).toBeGreaterThan(
          result.data.sentiment
            .bearish,
        );

        expect(
          result.data.sentiment
            .bullish,
        ).toBeGreaterThan(
          0.45,
        );
      },
    );

    test(
      "produces real mention velocity",
      async () => {
        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots:
              snapshots(),

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.data.mentions
            .velocity,
        ).toBeGreaterThan(0);

        expect(
          result.data.mentions
            .baselineVelocity,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "produces positive acceleration for rising activity",
      async () => {
        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots:
              snapshots(),

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.data.mentions
            .acceleration,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "keeps unavailable manipulation signals unknown",
      async () => {
        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots:
              snapshots(),

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.data.manipulation
            .botProbability,
        ).toBeNull();

        expect(
          result.data.manipulation
            .spamProbability,
        ).toBeNull();

        expect(
          result.data
            .manipulationCoverage
            .fullyObserved,
        ).toBe(false);
      },
    );

    test(
      "preserves abnormal mention spike as observed manipulation evidence",
      async () => {
        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots:
              snapshots(),

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.data.manipulation
            .abnormalMentionSpike,
        ).not.toBeNull();

        expect(
          result.data.manipulation
            .abnormalMentionSpike,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "falls back to PARTIAL with one usable platform",
      async () => {
        const [reddit] =
          snapshots();

        const result =
          await getSocialSentimentData({
            symbol:
              "AAPL",

            platformSnapshots: [
              reddit,
            ],

            fetchedAt:
              OBSERVED_AT,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "PARTIAL",
        );

        expect(
          result.platformCount,
        ).toBe(1);
      },
    );
  },
);