// server/src/data/providers/social/adanosSocialAdapter.test.js

import {
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

import getAdanosSocialSnapshots, {
  clearAdanosSocialCache,
  normalizeAdanosPlatformResponse,
} from "./adanosSocialAdapter.js";

const NOW = Date.parse("2026-08-23T18:00:00.000Z");

const redditResponse = (overrides = {}) => ({
  ticker: "AAPL",
  company_name: "Apple Inc.",
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
    { date: "2026-08-17", mentions: 50 },
    { date: "2026-08-18", mentions: 60 },
    { date: "2026-08-19", mentions: 70 },
    { date: "2026-08-20", mentions: 80 },
    { date: "2026-08-21", mentions: 90 },
    { date: "2026-08-22", mentions: 100 },
    { date: "2026-08-23", mentions: 140 },
  ],
  ...overrides,
});

const xResponse = (overrides = {}) => ({
  ticker: "AAPL",
  company_name: "Apple Inc.",
  found: true,
  buzz_score: 68,
  mentions: 220,
  sentiment_score: 0.22,
  total_upvotes: 18000,
  unique_tweets: 175,
  trend: "stable",
  bullish_pct: 47,
  bearish_pct: 25,
  period_days: 7,
  daily_trend: [
    { date: "2026-08-17", mentions: 140 },
    { date: "2026-08-18", mentions: 150 },
    { date: "2026-08-19", mentions: 155 },
    { date: "2026-08-20", mentions: 160 },
    { date: "2026-08-21", mentions: 170 },
    { date: "2026-08-22", mentions: 180 },
    { date: "2026-08-23", mentions: 220 },
  ],
  ...overrides,
});

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

beforeEach(() => {
  clearAdanosSocialCache();
});

describe("Adanos Social Adapter — Normalization", () => {
  test("normalizes Reddit into social provider snapshot contract", () => {
    const snapshot = normalizeAdanosPlatformResponse({
      platform: "REDDIT",
      response: redditResponse(),
      observedAt: "2026-08-23T18:00:00.000Z",
    });

    expect(snapshot.platform).toBe("REDDIT");
    expect(snapshot.sentiment.bullish).toBe(0.52);
    expect(snapshot.sentiment.bearish).toBe(0.21);
    expect(snapshot.sentiment.neutral).toBeCloseTo(0.27);
    expect(snapshot.mentions.currentCount).toBe(140);
    expect(
  snapshot.mentions.previousVelocity,
).toBeCloseTo(
  100 / 24,
  6,
);
    expect(snapshot.source).toBe("ADANOS_REDDIT");
  });

  test("normalizes X response separately", () => {
    const snapshot = normalizeAdanosPlatformResponse({
      platform: "X",
      response: xResponse(),
    });

    expect(snapshot.platform).toBe("X");
    expect(snapshot.metadata.uniquePosts).toBe(175);
    expect(snapshot.source).toBe("ADANOS_X");
  });

  test("does not fabricate missing manipulation signals", () => {
    const snapshot = normalizeAdanosPlatformResponse({
      platform: "REDDIT",
      response: redditResponse(),
    });

    expect(snapshot.manipulation.botProbability).toBeNull();
    expect(snapshot.manipulation.spamProbability).toBeNull();
    expect(snapshot.manipulation.coordinatedActivityScore).toBeNull();
    expect(snapshot.manipulation.influencerConcentration).toBeNull();
  });

  test("uses buzz only as abnormal mention spike evidence", () => {
    const snapshot = normalizeAdanosPlatformResponse({
      platform: "REDDIT",
      response: redditResponse({ buzz_score: 75 }),
    });

    expect(snapshot.manipulation.abnormalMentionSpike).toBe(0.5);
  });

  test("returns null when provider reports found false", () => {
    expect(
      normalizeAdanosPlatformResponse({
        platform: "REDDIT",
        response: redditResponse({ found: false }),
      }),
    ).toBeNull();
  });
});

describe("Adanos Social Adapter — Fetch", () => {
  test("fetches Reddit and X with one key", async () => {
    const fetchImpl = vi.fn(async (url) =>
      jsonResponse(
        String(url).includes("/reddit/")
          ? redditResponse()
          : xResponse(),
      ),
    );

    const result = await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: "test_key",
      now: NOW,
      fetchImpl,
    });

    expect(result.status).toBe("READY");
    expect(result.snapshots).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers["X-API-Key"]).toBe("test_key");
  });

  test("uses official Reddit and X stock endpoints", async () => {
    const fetchImpl = vi.fn(async (url) =>
      jsonResponse(
        String(url).includes("/reddit/")
          ? redditResponse()
          : xResponse(),
      ),
    );

    await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: "test_key",
      now: NOW,
      fetchImpl,
    });

    const urls = fetchImpl.mock.calls.map(([url]) => String(url));

    expect(
      urls.some((url) =>
        url.includes("/reddit/stocks/v1/stock/AAPL"),
      ),
    ).toBe(true);

    expect(
      urls.some((url) =>
        url.includes("/x/stocks/v1/stock/AAPL"),
      ),
    ).toBe(true);
  });

  test("returns partial when one source fails", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("/reddit/")) {
        return jsonResponse(redditResponse());
      }

      return jsonResponse(
        { detail: "temporary failure" },
        { ok: false, status: 503 },
      );
    });

    const result = await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: "test_key",
      now: NOW,
      fetchImpl,
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.snapshots).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("fails safely when both sources are unusable", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        found: false,
        bullish_pct: null,
        bearish_pct: null,
      }),
    );

    const result = await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: "test_key",
      now: NOW,
      fetchImpl,
    });

    expect(result.approved).toBe(false);
    expect(result.status).toBe("INSUFFICIENT_DATA");
  });
});

describe("Adanos Social Adapter — Cost Control", () => {
  test("uses cache to avoid duplicate calls", async () => {
    const fetchImpl = vi.fn(async (url) =>
      jsonResponse(
        String(url).includes("/reddit/")
          ? redditResponse()
          : xResponse(),
      ),
    );

    const first = await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: "test_key",
      now: NOW,
      fetchImpl,
    });

    const second = await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: "test_key",
      now: NOW + 60_000,
      fetchImpl,
    });

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("can fetch only Reddit to conserve credits", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(redditResponse()),
    );

    const result = await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: "test_key",
      now: NOW,
      config: {
        includeReddit: true,
        includeX: false,
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.snapshots[0].platform).toBe("REDDIT");
  });
});

describe("Adanos Social Adapter — Validation", () => {
  test("missing API key fails safely without network call", async () => {
    const fetchImpl = vi.fn();

    const result = await getAdanosSocialSnapshots({
      symbol: "AAPL",
      apiKey: null,
      now: NOW,
      fetchImpl,
    });

    expect(result.status).toBe("CONFIG_ERROR");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("missing symbol fails safely", async () => {
    const fetchImpl = vi.fn();

    const result = await getAdanosSocialSnapshots({
      symbol: null,
      apiKey: "test_key",
      now: NOW,
      fetchImpl,
    });

    expect(result.status).toBe("INVALID_INPUT");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Adanos Social Adapter — Determinism", () => {
  test("same provider response normalizes identically", () => {
    const input = {
      platform: "REDDIT",
      response: redditResponse(),
      observedAt: "2026-08-23T18:00:00.000Z",
    };

    expect(
      normalizeAdanosPlatformResponse(input),
    ).toEqual(
      normalizeAdanosPlatformResponse(input),
    );
  });
});
