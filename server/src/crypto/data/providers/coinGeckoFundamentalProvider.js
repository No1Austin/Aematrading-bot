/**
 * ============================================================
 * AEMA CRYPTO — COINGECKO FUNDAMENTAL PROVIDER
 * Phase 6.7
 * ============================================================
 *
 * Uses the CoinGecko coin-details endpoint.
 * Supports optional COINGECKO_API_KEY / COINGECKO_PRO_API_KEY.
 *
 * Missing data remains null. Provider errors do not become neutral
 * or zero-valued evidence.
 */

const PUBLIC_BASE =
  "https://api.coingecko.com/api/v3";

const PRO_BASE =
  "https://pro-api.coingecko.com/api/v3";

const CACHE_MS =
  Number(process.env.COINGECKO_FUNDAMENTAL_CACHE_MS) ||
  15 * 60 * 1000;

const TIMEOUT_MS =
  Number(process.env.CRYPTO_PROVIDER_TIMEOUT_MS) ||
  10_000;

const cache = new Map();
const inflight = new Map();

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clean(value) {
  return String(value ?? "").trim();
}

function resolveCoinGeckoId(candidate) {
  const candidates = [
    candidate?.coinGeckoId,
    candidate?.coingeckoId,
    candidate?.measurements?.coinGeckoId,
    candidate?.measurements?.coingeckoId,
    candidate?.measurements?.sourceId,
    candidate?.measurements?.assetId,
    candidate?.assetId,
    candidate?.asset?.coinGeckoId,
    candidate?.asset?.assetId,
  ];

  for (const value of candidates) {
    const id = clean(value);

    if (
      id &&
      !id.includes(":") &&
      id.length < 128
    ) {
      return id.toLowerCase();
    }
  }

  return null;
}

async function fetchJson(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    TIMEOUT_MS,
  );

  try {
    const response =
      await fetch(url, {
        headers: {
          accept: "application/json",
          ...headers,
        },
        signal: controller.signal,
      });

    if (!response.ok) {
      throw new Error(
        `CoinGecko HTTP ${response.status}`,
      );
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCoinDetails(id) {
  const proKey =
    clean(process.env.COINGECKO_PRO_API_KEY);

  const demoKey =
    clean(process.env.COINGECKO_API_KEY);

  const base =
    proKey
      ? PRO_BASE
      : PUBLIC_BASE;

  const headers = {};

  if (proKey) {
    headers["x-cg-pro-api-key"] = proKey;
  } else if (demoKey) {
    headers["x-cg-demo-api-key"] = demoKey;
  }

  const params =
    new URLSearchParams({
      localization: "false",
      tickers: "false",
      market_data: "true",
      community_data: "true",
      developer_data: "true",
      sparkline: "false",
    });

  return fetchJson(
    `${base}/coins/${encodeURIComponent(id)}?${params}`,
    headers,
  );
}

export async function getCoinGeckoFundamentals(
  candidate,
  { refresh = false } = {},
) {
  const id =
    resolveCoinGeckoId(candidate);

  if (!id) {
    return {
      approved: false,
      status: "INSUFFICIENT_DATA",
      reason: "COINGECKO_ID_UNAVAILABLE",
      evidence: null,
    };
  }

  const now = Date.now();
  const existing = cache.get(id);

  if (
    !refresh &&
    existing &&
    existing.expiresAt > now
  ) {
    return existing.value;
  }

  if (!refresh && inflight.has(id)) {
    return inflight.get(id);
  }

  const promise = (async () => {
    try {
      const data =
        await fetchCoinDetails(id);

      const market =
        data?.market_data ?? {};

      const developer =
        data?.developer_data ?? {};

      const community =
        data?.community_data ?? {};

      const value = {
        approved: true,
        status: "COMPLETE",
        provider: "COINGECKO",
        id,
        evidence: {
          id: data?.id ?? id,
          symbol: data?.symbol ?? null,
          name: data?.name ?? null,
          categories:
            Array.isArray(data?.categories)
              ? data.categories
              : [],
          genesisDate: data?.genesis_date ?? null,
          hashingAlgorithm: data?.hashing_algorithm ?? null,
          description: data?.description?.en ?? null,
          homepage: data?.links?.homepage?.[0] ?? null,
          githubRepos:
            Array.isArray(data?.links?.repos_url?.github)
              ? data.links.repos_url.github
              : [],
          marketCapUsd:
            finiteOrNull(market?.market_cap?.usd),
          fdvUsd:
            finiteOrNull(
              market?.fully_diluted_valuation?.usd,
            ),
          volume24hUsd:
            finiteOrNull(market?.total_volume?.usd),
          circulatingSupply:
            finiteOrNull(market?.circulating_supply),
          totalSupply:
            finiteOrNull(market?.total_supply),
          maxSupply:
            finiteOrNull(market?.max_supply),
          developer: {
            forks: finiteOrNull(developer?.forks),
            stars: finiteOrNull(developer?.stars),
            subscribers: finiteOrNull(developer?.subscribers),
            totalIssues: finiteOrNull(developer?.total_issues),
            closedIssues: finiteOrNull(developer?.closed_issues),
            pullRequestsMerged:
              finiteOrNull(developer?.pull_requests_merged),
            commitCount4Weeks:
              finiteOrNull(developer?.commit_count_4_weeks),
          },
          community: {
            redditSubscribers:
              finiteOrNull(community?.reddit_subscribers),
            redditActive48h:
              finiteOrNull(
                community?.reddit_accounts_active_48h,
              ),
            telegramUsers:
              finiteOrNull(
                community?.telegram_channel_user_count,
              ),
            twitterFollowers:
              finiteOrNull(community?.twitter_followers),
          },
        },
      };

      cache.set(id, {
        value,
        expiresAt: Date.now() + CACHE_MS,
      });

      return value;
    } catch (error) {
      return {
        approved: false,
        status: "ERROR",
        reason:
          error instanceof Error
            ? error.message
            : String(error),
        id,
        evidence: null,
      };
    } finally {
      inflight.delete(id);
    }
  })();

  inflight.set(id, promise);
  return promise;
}

export function clearCoinGeckoFundamentalCache() {
  cache.clear();
  inflight.clear();
}

export default getCoinGeckoFundamentals;
