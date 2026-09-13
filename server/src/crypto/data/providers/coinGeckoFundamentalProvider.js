/**
 * ============================================================
 * COINGECKO FUNDAMENTAL PROVIDER
 * ============================================================
 *
 * Uses the CoinGecko coin-details endpoint.
 *
 * Supports optional:
 *   COINGECKO_API_KEY
 *   COINGECKO_PRO_API_KEY
 *
 * Without a key it attempts the public/demo endpoint.
 */

const PUBLIC_BASE =
  "https://api.coingecko.com/api/v3";

const PRO_BASE =
  "https://pro-api.coingecko.com/api/v3";

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clean(value) {
  return String(value ?? "")
    .trim();
}

function resolveCoinGeckoId(candidate) {
  const candidates = [
    candidate?.coinGeckoId,
    candidate?.coingeckoId,
    candidate?.measurements?.coinGeckoId,
    candidate?.measurements?.coingeckoId,
    candidate?.measurements?.sourceId,
    candidate?.assetId,
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
  const response =
    await fetch(url, {
      headers: {
        accept: "application/json",
        ...headers,
      },
    });

  if (!response.ok) {
    throw new Error(
      `CoinGecko HTTP ${response.status}`,
    );
  }

  return response.json();
}

export async function getCoinGeckoFundamentals(
  candidate,
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

  const proKey =
    clean(
      process.env
        .COINGECKO_PRO_API_KEY,
    );

  const demoKey =
    clean(
      process.env
        .COINGECKO_API_KEY,
    );

  const base =
    proKey
      ? PRO_BASE
      : PUBLIC_BASE;

  const headers = {};

  if (proKey) {
    headers["x-cg-pro-api-key"] =
      proKey;
  } else if (demoKey) {
    headers["x-cg-demo-api-key"] =
      demoKey;
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

  try {
    const data =
      await fetchJson(
        `${base}/coins/${encodeURIComponent(
          id,
        )}?${params}`,
        headers,
      );

    const market =
      data?.market_data ?? {};

    const developer =
      data?.developer_data ?? {};

    const community =
      data?.community_data ?? {};

    return {
      approved: true,
      status: "COMPLETE",
      provider: "COINGECKO",
      id,

      evidence: {
        id:
          data?.id ?? id,

        symbol:
          data?.symbol ?? null,

        name:
          data?.name ?? null,

        categories:
          Array.isArray(
            data?.categories,
          )
            ? data.categories
            : [],

        genesisDate:
          data?.genesis_date ??
          null,

        hashingAlgorithm:
          data
            ?.hashing_algorithm ??
          null,

        description:
          data
            ?.description
            ?.en ??
          null,

        homepage:
          data
            ?.links
            ?.homepage
            ?.[0] ??
          null,

        githubRepos:
          Array.isArray(
            data
              ?.links
              ?.repos_url
              ?.github,
          )
            ? data.links
                .repos_url
                .github
            : [],

        marketCapUsd:
          finiteOrNull(
            market
              ?.market_cap
              ?.usd,
          ),

        fdvUsd:
          finiteOrNull(
            market
              ?.fully_diluted_valuation
              ?.usd,
          ),

        volume24hUsd:
          finiteOrNull(
            market
              ?.total_volume
              ?.usd,
          ),

        circulatingSupply:
          finiteOrNull(
            market
              ?.circulating_supply,
          ),

        totalSupply:
          finiteOrNull(
            market
              ?.total_supply,
          ),

        maxSupply:
          finiteOrNull(
            market
              ?.max_supply,
          ),

        developer: {
          forks:
            finiteOrNull(
              developer?.forks,
            ),

          stars:
            finiteOrNull(
              developer?.stars,
            ),

          subscribers:
            finiteOrNull(
              developer
                ?.subscribers,
            ),

          totalIssues:
            finiteOrNull(
              developer
                ?.total_issues,
            ),

          closedIssues:
            finiteOrNull(
              developer
                ?.closed_issues,
            ),

          pullRequestsMerged:
            finiteOrNull(
              developer
                ?.pull_requests_merged,
            ),

          commitCount4Weeks:
            finiteOrNull(
              developer
                ?.commit_count_4_weeks,
            ),
        },

        community: {
          redditSubscribers:
            finiteOrNull(
              community
                ?.reddit_subscribers,
            ),

          redditActive48h:
            finiteOrNull(
              community
                ?.reddit_accounts_active_48h,
            ),

          telegramUsers:
            finiteOrNull(
              community
                ?.telegram_channel_user_count,
            ),

          twitterFollowers:
            finiteOrNull(
              community
                ?.twitter_followers,
            ),
        },
      },
    };
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
  }
}

export default
  getCoinGeckoFundamentals;
