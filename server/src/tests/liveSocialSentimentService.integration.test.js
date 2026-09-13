// server/src/tests/liveSocialSentimentService.integration.test.js

import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import getLiveSocialSentiment
  from "../services/liveSocialSentimentService.js";

import {
  clearAdanosSocialCache,
} from "../data/providers/social/adanosSocialAdapter.js";

const NOW =
  Date.parse(
    "2026-08-23T18:00:00.000Z",
  );

function redditBody(
  overrides = {},
) {
  return {
    ticker:
      "AAPL",

    company_name:
      "Apple Inc.",

    found:
      true,

    buzz_score:
      75,

    mentions:
      140,

    sentiment_score:
      0.31,

    unique_posts:
      55,

    subreddit_count:
      7,

    trend:
      "rising",

    bullish_pct:
      52,

    bearish_pct:
      21,

    period_days:
      7,

    daily_trend: [
      {
        date:
          "2026-08-17",
        mentions:
          50,
      },
      {
        date:
          "2026-08-18",
        mentions:
          60,
      },
      {
        date:
          "2026-08-19",
        mentions:
          70,
      },
      {
        date:
          "2026-08-20",
        mentions:
          80,
      },
      {
        date:
          "2026-08-21",
        mentions:
          90,
      },
      {
        date:
          "2026-08-22",
        mentions:
          100,
      },
      {
        date:
          "2026-08-23",
        mentions:
          140,
      },
    ],

    ...overrides,
  };
}

function xBody(
  overrides = {},
) {
  return {
    ticker:
      "AAPL",

    company_name:
      "Apple Inc.",

    found:
      true,

    buzz_score:
      68,

    mentions:
      220,

    sentiment_score:
      0.22,

    unique_tweets:
      175,

    trend:
      "stable",

    bullish_pct:
      47,

    bearish_pct:
      25,

    period_days:
      7,

    daily_trend: [
      {
        date:
          "2026-08-17",
        mentions:
          140,
      },
      {
        date:
          "2026-08-18",
        mentions:
          150,
      },
      {
        date:
          "2026-08-19",
        mentions:
          155,
      },
      {
        date:
          "2026-08-20",
        mentions:
          160,
      },
      {
        date:
          "2026-08-21",
        mentions:
          170,
      },
      {
        date:
          "2026-08-22",
        mentions:
          180,
      },
      {
        date:
          "2026-08-23",
        mentions:
          220,
      },
    ],

    ...overrides,
  };
}

function response(
  body,
  {
    ok = true,
    status = 200,
  } = {},
) {
  return {
    ok,
    status,

    json:
      async () =>
        body,
  };
}

function healthyFetch() {
  return vi.fn(
    async (url) =>
      response(
        String(url)
          .includes(
            "/reddit/",
          )
          ? redditBody()
          : xBody(),
      ),
  );
}

beforeEach(
  () => {
    clearAdanosSocialCache();
  },
);

describe(
  "Live Social Sentiment Service — Full Path",
  () => {
    test(
      "runs live-shaped Adanos Reddit + X through provider and engine",
      async () => {
        const fetchImpl =
          healthyFetch();

        const result =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW,

            fetchImpl,
          });

        expect(
          result.approved,
        ).toBe(true);

        expect(
          result.status,
        ).toBe(
          "COMPLETE",
        );

        expect(
          result.sourceResult
            .status,
        ).toBe(
          "READY",
        );

        expect(
          result.providerResult
            .status,
        ).toBe(
          "READY",
        );

        expect(
          result.engineResult
            .engine,
        ).toBe(
          "SOCIAL_SENTIMENT",
        );

        expect(
          result.engineResult
            .status,
        ).toBe(
          "COMPLETE",
        );
      },
    );

    test(
      "returns compact social intelligence for orchestration",
      async () => {
        const result =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW,

            fetchImpl:
              healthyFetch(),
          });

        expect(
          result.social,
        ).toBeTruthy();

        expect(
          result.social
            .rawScore,
        ).toBeGreaterThan(
          0,
        );

        expect(
          result.social
            .directionalSupport
            .long,
        ).toBeGreaterThan(
          result.social
            .directionalSupport
            .short,
        );

        expect(
          result.social
            .platformCount,
        ).toBe(2);
      },
    );

    test(
      "preserves live source and provider evidence",
      async () => {
        const result =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW,

            fetchImpl:
              healthyFetch(),
          });

        expect(
          result.sourceResult
            .snapshots,
        ).toHaveLength(2);

        expect(
          result.providerResult
            .data
            .sources,
        ).toHaveLength(2);

        expect(
          result.social
            .activity
            .velocity,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "returns PARTIAL when one Adanos platform fails but the other is usable",
      async () => {
        const fetchImpl =
          vi.fn(
            async (url) => {
              if (
                String(url)
                  .includes(
                    "/reddit/",
                  )
              ) {
                return response(
                  redditBody(),
                );
              }

              return response(
                {
                  detail:
                    "X temporarily unavailable",
                },
                {
                  ok: false,
                  status: 503,
                },
              );
            },
          );

        const result =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW,

            fetchImpl,
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
          result.social
            .platformCount,
        ).toBe(1);

        expect(
          result.warnings.length,
        ).toBeGreaterThan(0);
      },
    );

    test(
      "fails closed when Adanos returns no usable social evidence",
      async () => {
        const fetchImpl =
          vi.fn(
            async () =>
              response({
                found:
                  false,
              }),
          );

        const result =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW,

            fetchImpl,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.social,
        ).toBeFalsy();

        expect(
          result.status,
        ).toBe(
          "INSUFFICIENT_DATA",
        );
      },
    );

    test(
      "fails safely when API key is missing without spending a request",
      async () => {
        const fetchImpl =
          vi.fn();

        const result =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              null,

            now:
              NOW,

            fetchImpl,
          });

        expect(
          result.approved,
        ).toBe(false);

        expect(
          result.status,
        ).toBe(
          "CONFIG_ERROR",
        );

        expect(
          fetchImpl,
        ).not.toHaveBeenCalled();
      },
    );

    test(
      "reuses Adanos cache on repeated analysis",
      async () => {
        const fetchImpl =
          healthyFetch();

        const first =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW,

            fetchImpl,
          });

        const second =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW +
              60_000,

            fetchImpl,
          });

        expect(
          first.approved,
        ).toBe(true);

        expect(
          second.approved,
        ).toBe(true);

        expect(
          second.sourceResult
            .cached,
        ).toBe(true);

        /**
         * Only the first run spends two calls:
         * Reddit + X.
         */
        expect(
          fetchImpl,
        ).toHaveBeenCalledTimes(
          2,
        );
      },
    );

    test(
      "can run Reddit-only mode to conserve free-plan calls",
      async () => {
        const fetchImpl =
          vi.fn(
            async () =>
              response(
                redditBody(),
              ),
          );

        const result =
          await getLiveSocialSentiment({
            symbol:
              "AAPL",

            apiKey:
              "test_key",

            now:
              NOW,

            adanosConfig: {
              includeReddit:
                true,

              includeX:
                false,
            },

            fetchImpl,
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
          result.social
            .platformCount,
        ).toBe(1);

        expect(
          fetchImpl,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);
