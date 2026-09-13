// server/src/data/providers/social/adanosSocialAdapter.js

const DEFAULT_BASE_URL = "https://api.adanos.org";

export const DEFAULT_ADANOS_SOCIAL_CONFIG = Object.freeze({
  lookbackDays: 7,
  currentWindowHours: 24,
  baselineWindowHours: 24 * 7,
  cacheTtlMs: 5 * 60 * 1000,
  timeoutMs: 8000,
  includeReddit: true,
  includeX: true,
});

const memoryCache = new Map();

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function nonNegativeNumber(value) {
  const n = finiteNumber(value);
  return n !== null && n >= 0 ? n : null;
}

function clamp(value, min, max) {
  const n = finiteNumber(value);
  return n === null ? null : Math.min(max, Math.max(min, n));
}

function round(value, decimals = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeSymbol(value) {
  const symbol = String(value ?? "").trim().toUpperCase().replace(/^\$/, "");
  return symbol || null;
}

function dateOnlyUtc(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addUtcDays(timestamp, days) {
  const date = new Date(timestamp);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnlyUtc(date.getTime());
}

function sentimentFromPercentages(response) {
  const bullishPct = clamp(response?.bullish_pct, 0, 100);
  const bearishPct = clamp(response?.bearish_pct, 0, 100);
  if (bullishPct === null || bearishPct === null) return null;

  const bullish = bullishPct / 100;
  const bearish = bearishPct / 100;
  const neutral = Math.max(0, 1 - bullish - bearish);
  const total = bullish + bearish + neutral;
  if (total <= 0) return null;

  return {
    bullish: round(bullish / total),
    bearish: round(bearish / total),
    neutral: round(neutral / total),
  };
}

function normalizedDailyTrend(
  rows,
) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map(
      (row) => ({
        date:
          row?.date ?? "",

        mentions:
          nonNegativeNumber(
            row?.mentions,
          ),
      }),
    )
    .filter(
      (row) =>
        row.mentions !==
        null,
    )
    .sort(
      (a, b) =>
        String(a.date)
          .localeCompare(
            String(b.date),
          ),
    );
}

function currentMentionsFromDailyTrend(
  rows,
) {
  const values =
    normalizedDailyTrend(
      rows,
    );

  if (
    values.length ===
    0
  ) {
    return null;
  }

  return values[
    values.length - 1
  ].mentions;
}

function baselineCountFromDailyTrend(
  rows,
) {
  const values =
    normalizedDailyTrend(
      rows,
    );

  if (
    values.length <=
    1
  ) {
    return null;
  }

  return values
    .slice(
      0,
      -1,
    )
    .reduce(
      (
        total,
        row,
      ) =>
        total +
        row.mentions,
      0,
    );
}

function baselineHoursFromDailyTrend(
  rows,
) {
  const values =
    normalizedDailyTrend(
      rows,
    );

  const baselineDays =
    Math.max(
      0,
      values.length -
        1,
    );

  return baselineDays > 0
    ? baselineDays * 24
    : null;
}

function previousVelocityFromDailyTrend(
  rows,
) {
  const values =
    normalizedDailyTrend(
      rows,
    );

  if (
    values.length < 2
  ) {
    return null;
  }

  const previousDailyMentions =
    values[
      values.length - 2
    ].mentions;

  /**
   * socialSentimentDataProvider compares previousVelocity
   * against currentCount / currentWindowHours.
   *
   * Adanos daily_trend reports daily mention counts, so convert
   * the previous day's count into mentions/hour.
   */
  return round(
    previousDailyMentions /
      24,
    6,
  );
}

function abnormalMentionSpikeFromBuzz(buzzScore) {
  const score = clamp(buzzScore, 0, 100);
  if (score === null) return null;

  // Adanos documents buzz_score as activity/attention, not manipulation.
  // We only map excess activity above 50 into the existing spike field.
  return round(clamp((score - 50) / 50, 0, 1));
}

export function normalizeAdanosPlatformResponse({
  platform,
  response,
  observedAt,
  currentWindowHours = 24,
  baselineWindowHours = 24 * 7,
} = {}) {
  if (!response || typeof response !== "object" || response.found === false) {
    return null;
  }

  const rawPlatform = String(platform ?? "").trim().toUpperCase();
  if (!["REDDIT", "X", "TWITTER"].includes(rawPlatform)) return null;

  const sentiment = sentimentFromPercentages(response);
  if (!sentiment) return null;

  const canonicalPlatform = rawPlatform === "REDDIT" ? "REDDIT" : "X";

  const dailyTrend =
    response.daily_trend;

  const currentCount =
    currentMentionsFromDailyTrend(
      dailyTrend,
    ) ??
    nonNegativeNumber(
      response.mentions,
    );

  const baselineCount =
    baselineCountFromDailyTrend(
      dailyTrend,
    );

  const calculatedBaselineHours =
    baselineHoursFromDailyTrend(
      dailyTrend,
    );

  return {
    platform: canonicalPlatform,

    sentiment,

    mentions: {
      /**
       * Adanos response.mentions is the total over the requested
       * multi-day range. Prefer the latest daily_trend bucket for
       * the current 24-hour window so velocity is not inflated.
       */
      currentCount,

      currentWindowHours:
        currentWindowHours > 0
          ? currentWindowHours
          : 24,

      /**
       * Baseline excludes the latest day. This compares the current
       * day against the preceding historical window using the same
       * mentions/hour unit expected by socialSentimentDataProvider.
       */
      baselineCount,

      baselineWindowHours:
        calculatedBaselineHours ??
        baselineWindowHours,

      previousVelocity:
        previousVelocityFromDailyTrend(
          dailyTrend,
        ),
    },

    manipulation: {
      botProbability: null,
      spamProbability: null,
      coordinatedActivityScore: null,
      influencerConcentration: null,
      abnormalMentionSpike: abnormalMentionSpikeFromBuzz(response.buzz_score),
    },

    observedAt: observedAt ?? new Date().toISOString(),
    source: canonicalPlatform === "REDDIT" ? "ADANOS_REDDIT" : "ADANOS_X",

    metadata: {
      provider: "ADANOS",
      ticker: response.ticker ?? null,
      companyName: response.company_name ?? null,
      buzzScore: finiteNumber(response.buzz_score),
      sentimentScore: finiteNumber(response.sentiment_score),
      trend: String(response.trend ?? "").trim().toLowerCase() || null,
      uniquePosts: nonNegativeNumber(response.unique_posts ?? response.unique_tweets),
      subredditCount: nonNegativeNumber(response.subreddit_count),
      totalUpvotes: nonNegativeNumber(response.total_upvotes),
      periodDays: nonNegativeNumber(response.period_days),
    },
  };
}

async function fetchJsonWithTimeout({ url, apiKey, fetchImpl, timeoutMs }) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/json",
      },
      ...(controller ? { signal: controller.signal } : {}),
    });

    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }

    if (!response.ok) {
      const message =
        body?.detail?.message ??
        body?.detail ??
        `Adanos request failed with HTTP ${response.status}.`;

      const error = new Error(String(message));
      error.status = response.status;
      throw error;
    }

    return body;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cacheKey({ symbol, from, to, includeReddit, includeX }) {
  return [symbol, from, to, includeReddit ? "R1" : "R0", includeX ? "X1" : "X0"].join(":");
}

export function clearAdanosSocialCache() {
  memoryCache.clear();
}

export default async function getAdanosSocialSnapshots({
  symbol,
  apiKey = process.env.ADANOS_API_KEY,
  from = null,
  to = null,
  now = Date.now(),
  config = {},
  fetchImpl = globalThis.fetch,
} = {}) {
  const cfg = {
    ...DEFAULT_ADANOS_SOCIAL_CONFIG,
    ...(config && typeof config === "object" ? config : {}),
  };

  const normalizedSymbol = normalizeSymbol(symbol);
  const fetchedAt = new Date(now).toISOString();

  if (!normalizedSymbol) {
    return {
      approved: false,
      provider: "ADANOS_SOCIAL",
      status: "INVALID_INPUT",
      symbol: null,
      snapshots: [],
      warnings: [],
      errors: ["A valid stock symbol is required."],
      fetchedAt,
    };
  }

  if (!apiKey || typeof apiKey !== "string") {
    return {
      approved: false,
      provider: "ADANOS_SOCIAL",
      status: "CONFIG_ERROR",
      symbol: normalizedSymbol,
      snapshots: [],
      warnings: [],
      errors: ["ADANOS_API_KEY is required."],
      fetchedAt,
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      approved: false,
      provider: "ADANOS_SOCIAL",
      status: "CONFIG_ERROR",
      symbol: normalizedSymbol,
      snapshots: [],
      warnings: [],
      errors: ["A fetch implementation is required."],
      fetchedAt,
    };
  }

  const effectiveTo = to ?? dateOnlyUtc(now);
  const lookbackDays = Math.max(1, Number(cfg.lookbackDays) || 7);
  const effectiveFrom = from ?? addUtcDays(now, -lookbackDays + 1);

  const key = cacheKey({
    symbol: normalizedSymbol,
    from: effectiveFrom,
    to: effectiveTo,
    includeReddit: cfg.includeReddit === true,
    includeX: cfg.includeX === true,
  });

  const cached = memoryCache.get(key);
  const ttl = Math.max(0, Number(cfg.cacheTtlMs) || 0);

  if (cached && now - cached.createdAt <= ttl) {
    return { ...cached.value, cached: true };
  }

  const baseUrl = String(cfg.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const encodedSymbol = encodeURIComponent(normalizedSymbol);
  const query = new URLSearchParams({ from: effectiveFrom, to: effectiveTo });

  const jobs = [];

  if (cfg.includeReddit === true) {
    jobs.push({
      platform: "REDDIT",
      url: `${baseUrl}/reddit/stocks/v1/stock/${encodedSymbol}?${query.toString()}`,
    });
  }

  if (cfg.includeX === true) {
    jobs.push({
      platform: "X",
      url: `${baseUrl}/x/stocks/v1/stock/${encodedSymbol}?${query.toString()}`,
    });
  }

  if (jobs.length === 0) {
    return {
      approved: false,
      provider: "ADANOS_SOCIAL",
      status: "CONFIG_ERROR",
      symbol: normalizedSymbol,
      snapshots: [],
      warnings: [],
      errors: ["At least one Adanos social source must be enabled."],
      fetchedAt,
    };
  }

  const settled = await Promise.allSettled(
    jobs.map(async (job) => ({
      platform: job.platform,
      body: await fetchJsonWithTimeout({
        url: job.url,
        apiKey,
        fetchImpl,
        timeoutMs: Math.max(1, Number(cfg.timeoutMs) || 8000),
      }),
    })),
  );

  const snapshots = [];
  const warnings = [];

  settled.forEach((result, index) => {
    const platform = jobs[index].platform;

    if (result.status === "rejected") {
      warnings.push(
        `${platform} social source failed: ${result.reason?.message ?? "unknown error"}`,
      );
      return;
    }

    const snapshot = normalizeAdanosPlatformResponse({
      platform,
      response: result.value.body,
      observedAt: fetchedAt,
      currentWindowHours: Number(cfg.currentWindowHours) || 24,
      baselineWindowHours: Number(cfg.baselineWindowHours) || 24 * 7,
    });

    if (snapshot) snapshots.push(snapshot);
    else warnings.push(`${platform} returned no usable stock-social snapshot.`);
  });

  const value = {
    approved: snapshots.length > 0,
    provider: "ADANOS_SOCIAL",
    status:
      snapshots.length === jobs.length
        ? "READY"
        : snapshots.length > 0
          ? "PARTIAL"
          : "INSUFFICIENT_DATA",
    symbol: normalizedSymbol,
    snapshots,
    sourcesRequested: jobs.map((job) => job.platform),
    sourcesReady: snapshots.map((snapshot) => snapshot.platform),
    warnings,
    errors: [],
    cached: false,
    fetchedAt,
    window: {
      from: effectiveFrom,
      to: effectiveTo,
    },
  };

  memoryCache.set(key, {
    createdAt: now,
    value,
  });

  return value;
}
