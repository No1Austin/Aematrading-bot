/**
 * ============================================================
 * AEMA CRYPTO — DEX DISCOVERY SERVICE
 * ============================================================
 *
 * Research-only DEX discovery orchestration.
 *
 * DISCOVERY:
 *   GeckoTerminal -> broad/new pool discovery
 *
 * ENRICHMENT:
 *   DEX Screener -> token/pair market activity and verification
 *
 * IMPORTANT:
 * - CoinMarketCap is intentionally NOT used.
 * - Unknown values remain null; no fabricated zeroes.
 * - Solana/base58 addresses preserve case.
 * - EVM addresses are normalized to lower-case.
 * - Discovery is NOT the same thing as qualification.
 * - Qualification is NOT a recommendation to buy.
 * - No execution authority.
 */

import {
  getNewPoolsAcrossNetworks,
} from "../data/providers/geckoTerminalProvider.js";

import {
  getDexTokenPairs,
  getDexTokens,
  normalizeDexPair,
  selectBestDexPair,
} from "../data/providers/dexScreenerProvider.js";

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const DEFAULT_NETWORKS = [
  "solana",
  "base",
  "eth",
  "bsc",
  "arbitrum",
];

const MAX_DEXSCREENER_BATCH = 30;

const DEFAULT_ENRICHMENT_CONCURRENCY = 3;

/*
 * ============================================================
 * PRIMITIVES
 * ============================================================
 */

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function integerOrNull(value) {
  const number =
    numberOrNull(value);

  return number !== null &&
    Number.isInteger(number)
    ? number
    : null;
}

function stringOrNull(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const text =
    String(value).trim();

  return text || null;
}

function upper(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function lower(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function inferSymbolFromPoolName(name) {
  return upper(
    String(name ?? "")
      .split("/")
      ?.[0],
  );
}

function chunkArray(
  values,
  size,
) {
  const chunks = [];

  for (
    let index = 0;
    index < values.length;
    index += size
  ) {
    chunks.push(
      values.slice(
        index,
        index + size,
      ),
    );
  }

  return chunks;
}

async function mapWithConcurrency(
  items,
  concurrency,
  mapper,
) {
  const input =
    Array.isArray(items)
      ? items
      : [];

  if (
    input.length === 0
  ) {
    return [];
  }

  const limit =
    Math.max(
      1,
      Math.min(
        Number(concurrency) ||
          DEFAULT_ENRICHMENT_CONCURRENCY,
        input.length,
      ),
    );

  const output =
    new Array(
      input.length,
    );

  let cursor = 0;

  async function worker() {
    while (true) {
      const index =
        cursor++;

      if (
        index >=
        input.length
      ) {
        return;
      }

      output[index] =
        await mapper(
          input[index],
          index,
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          limit,
      },
      () => worker(),
    ),
  );

  return output;
}

/*
 * ============================================================
 * NETWORK / ADDRESS IDENTITY
 * ============================================================
 */

function normalizeNetwork(network) {
  const key =
    lower(network);

  const aliases = {
    ethereum: "eth",
    eth: "eth",

    bnb: "bsc",
    bnbchain: "bsc",
    binance: "bsc",
    bsc: "bsc",

    sol: "solana",
    solana: "solana",

    base: "base",

    arb: "arbitrum",
    arbitrumone: "arbitrum",
    arbitrum: "arbitrum",

    polygon: "polygon",
    matic: "polygon",

    optimism: "optimism",
    op: "optimism",

    avalanche: "avalanche",
    avax: "avalanche",
  };

  return aliases[key] ?? key;
}

function normalizeNetworkForDexScreener(
  network,
) {
  const normalized =
    normalizeNetwork(
      network,
    );

  const aliases = {
    eth: "ethereum",
    bsc: "bsc",
    solana: "solana",
    base: "base",
    arbitrum: "arbitrum",
    polygon: "polygon",
    optimism: "optimism",
    avalanche: "avalanche",
  };

  return (
    aliases[normalized] ??
    normalized
  );
}

function isEvmNetwork(network) {
  return new Set([
    "eth",
    "bsc",
    "base",
    "arbitrum",
    "polygon",
    "optimism",
    "avalanche",
  ]).has(
    normalizeNetwork(
      network,
    ),
  );
}

function normalizeAddress(
  value,
  network,
) {
  const address =
    stringOrNull(value);

  if (!address) {
    return null;
  }

  /*
   * Never lower-case Solana/base58 addresses.
   *
   * EVM addresses are case-insensitive for identity purposes,
   * so lower-case them to make deduplication deterministic.
   */
  return isEvmNetwork(
    network,
  )
    ? address.toLowerCase()
    : address;
}

function buildAssetId(
  network,
  contractAddress,
  poolAddress,
) {
  const normalizedNetwork =
    normalizeNetwork(
      network,
    );

  const contract =
    normalizeAddress(
      contractAddress,
      normalizedNetwork,
    );

  if (
    normalizedNetwork &&
    contract
  ) {
    return `dex:${normalizedNetwork}:${contract}`;
  }

  const pool =
    normalizeAddress(
      poolAddress,
      normalizedNetwork,
    );

  if (
    normalizedNetwork &&
    pool
  ) {
    return `dex-pool:${normalizedNetwork}:${pool}`;
  }

  return null;
}

/*
 * ============================================================
 * TIME HELPERS
 * ============================================================
 */

function createdMs(pool) {
  const direct =
    numberOrNull(
      pool?.pairCreatedAt,
    );

  if (
    direct !== null
  ) {
    return direct;
  }

  const created =
    pool?.poolCreatedAt;

  if (!created) {
    return null;
  }

  const parsed =
    Date.parse(created);

  return Number.isFinite(
    parsed,
  )
    ? parsed
    : null;
}

function ageMinutes(
  createdAtMs,
) {
  if (
    createdAtMs === null
  ) {
    return null;
  }

  return Math.max(
    0,
    (
      Date.now() -
      createdAtMs
    ) /
      60_000,
  );
}

/*
 * ============================================================
 * GECKOTERMINAL NORMALIZATION
 * ============================================================
 */

function normalizeDiscoveryPool(
  pool,
  fallbackNetwork = null,
) {
  if (
    !pool ||
    typeof pool !==
      "object"
  ) {
    return null;
  }

  const network =
    normalizeNetwork(
      pool?.network ??
      pool?.chainId ??
      fallbackNetwork,
    ) || null;

  const baseAddress =
    normalizeAddress(
      pool?.baseAddress ??
      pool?.contractAddress,
      network,
    );

  const quoteAddress =
    normalizeAddress(
      pool?.quoteAddress,
      network,
    );

  const poolAddress =
    normalizeAddress(
      pool?.poolAddress ??
      pool?.pairAddress ??
      pool?.poolId,
      network,
    );

  const pairCreatedAt =
    createdMs(pool);

  const symbol =
    upper(
      pool?.baseSymbol ??
      pool?.symbol ??
      inferSymbolFromPoolName(
        pool?.name,
      ),
    ) ||
    "UNKNOWN";

  return {
    ...pool,

    network,
    chainId:
      network,

    baseAddress,
    contractAddress:
      baseAddress,

    quoteAddress,

    poolAddress,
    pairAddress:
      poolAddress,

    baseSymbol:
      symbol,

    symbol,

    baseName:
      stringOrNull(
        pool?.baseName,
      ) ??
      stringOrNull(
        pool?.name,
      ) ??
      symbol,

    name:
      stringOrNull(
        pool?.baseName,
      ) ??
      stringOrNull(
        pool?.name,
      ) ??
      symbol,

    priceUsd:
      numberOrNull(
        pool?.priceUsd,
      ),

    liquidityUsd:
      numberOrNull(
        pool?.liquidityUsd ??
        pool?.reserveUsd,
      ),

    reserveUsd:
      numberOrNull(
        pool?.reserveUsd ??
        pool?.liquidityUsd,
      ),

    volume5mUsd:
      numberOrNull(
        pool?.volume5mUsd,
      ),

    volume1hUsd:
      numberOrNull(
        pool?.volume1hUsd,
      ),

    volume6hUsd:
      numberOrNull(
        pool?.volume6hUsd,
      ),

    volume24hUsd:
      numberOrNull(
        pool?.volume24hUsd,
      ),

    marketCapUsd:
      numberOrNull(
        pool?.marketCapUsd,
      ),

    fdvUsd:
      numberOrNull(
        pool?.fdvUsd,
      ),

    pairCreatedAt,

    poolAgeMinutes:
      ageMinutes(
        pairCreatedAt,
      ),

    discoverySource:
      pool?.source ??
      "GECKOTERMINAL",
  };
}

/*
 * ============================================================
 * DEX SCREENER MERGING
 * ============================================================
 */

function sameAddress(
  left,
  right,
  network,
) {
  const a =
    normalizeAddress(
      left,
      network,
    );

  const b =
    normalizeAddress(
      right,
      network,
    );

  return Boolean(
    a &&
    b &&
    a === b,
  );
}

function chooseBestPairForSeed(
  pairs,
  seed,
) {
  const normalizedPairs =
    (Array.isArray(pairs)
      ? pairs
      : [])
      .map(pair =>
        pair?.provider ===
          "DEXSCREENER"
          ? pair
          : normalizeDexPair(
              pair,
            ),
      )
      .filter(Boolean);

  if (
    normalizedPairs.length === 0
  ) {
    return null;
  }

  const seedNetwork =
    normalizeNetwork(
      seed?.network,
    );

  const seedPool =
    seed?.poolAddress ??
    seed?.pairAddress;

  const exactPool =
    normalizedPairs.find(
      pair =>
        sameAddress(
          pair?.pairAddress,
          seedPool,
          seedNetwork,
        ),
    );

  if (exactPool) {
    return exactPool;
  }

  /*
   * If DEX Screener has the same token on multiple pools,
   * prefer its highest-quality measurable pool.
   */
  return selectBestDexPair(
    normalizedPairs,
  );
}

function mergePool(
  seed,
  enriched,
) {
  if (!enriched) {
    return {
      ...seed,

      dexScreenerEnriched:
        false,
    };
  }

  const network =
    normalizeNetwork(
      enriched?.network ??
      seed?.network,
    ) || null;

  const merged = {
    ...seed,

    network,

    chainId:
      network,

    dexScreenerEnriched:
      true,

    enrichedBy:
      "DEXSCREENER",
  };

  const fields = [
    "exchange",
    "dexId",

    "pairAddress",
    "poolAddress",

    "baseAddress",
    "baseSymbol",
    "baseName",

    "quoteAddress",
    "quoteSymbol",
    "quoteName",

    "priceNative",
    "priceUsd",

    "liquidityUsd",
    "reserveUsd",
    "liquidityBase",
    "liquidityQuote",

    "volume5mUsd",
    "volume1hUsd",
    "volume6hUsd",
    "volume24hUsd",

    "buys5m",
    "sells5m",
    "transactions5m",

    "buys1h",
    "sells1h",
    "transactions1h",

    "buys6h",
    "sells6h",
    "transactions6h",

    "buys24h",
    "sells24h",
    "transactions24h",

    "change5mPercent",
    "change1hPercent",
    "change6hPercent",
    "change24hPercent",

    "marketCapUsd",
    "fdvUsd",

    "pairCreatedAt",
    "poolCreatedAt",

    "url",
    "labels",
    "imageUrl",
    "websites",
    "socials",

    "boostActive",
    "paidPromotion",
  ];

  for (
    const field
    of fields
  ) {
    const value =
      enriched?.[field];

    if (
      value !== null &&
      value !== undefined &&
      value !== ""
    ) {
      merged[field] =
        value;
    }
  }

  merged.baseAddress =
    normalizeAddress(
      merged.baseAddress ??
      merged.contractAddress,
      network,
    );

  merged.contractAddress =
    merged.baseAddress;

  merged.quoteAddress =
    normalizeAddress(
      merged.quoteAddress,
      network,
    );

  merged.poolAddress =
    normalizeAddress(
      merged.poolAddress ??
      merged.pairAddress,
      network,
    );

  merged.pairAddress =
    merged.poolAddress;

  merged.pairCreatedAt =
    numberOrNull(
      merged.pairCreatedAt,
    );

  merged.poolAgeMinutes =
    ageMinutes(
      merged.pairCreatedAt,
    );

  return merged;
}

/*
 * ============================================================
 * ENRICHMENT
 * ============================================================
 */

function groupPoolsByDexScreenerChain(
  pools,
) {
  const groups =
    new Map();

  for (
    const pool
    of pools
  ) {
    const chain =
      normalizeNetworkForDexScreener(
        pool?.network,
      );

    const token =
      normalizeAddress(
        pool?.baseAddress,
        pool?.network,
      );

    if (
      !chain ||
      !token
    ) {
      continue;
    }

    if (
      !groups.has(chain)
    ) {
      groups.set(
        chain,
        [],
      );
    }

    groups.get(chain).push({
      pool,
      token,
    });
  }

  return groups;
}

async function batchEnrichPools(
  pools,
  errors,
  {
    concurrency =
      DEFAULT_ENRICHMENT_CONCURRENCY,
  } = {},
) {
  const input =
    Array.isArray(pools)
      ? pools
      : [];

  const byIdentity =
    new Map();

  for (
    const pool
    of input
  ) {
    const key =
      buildAssetId(
        pool?.network,
        pool?.baseAddress,
        pool?.poolAddress,
      );

    if (key) {
      byIdentity.set(
        key,
        {
          ...pool,
        },
      );
    }
  }

  const groups =
    groupPoolsByDexScreenerChain(
      input,
    );

  const jobs = [];

  for (
    const [
      chain,
      entries,
    ]
    of groups.entries()
  ) {
    const uniqueTokens =
      [
        ...new Set(
          entries
            .map(
              item =>
                item.token,
            )
            .filter(Boolean),
        ),
      ];

    for (
      const tokens
      of chunkArray(
        uniqueTokens,
        MAX_DEXSCREENER_BATCH,
      )
    ) {
      jobs.push({
        chain,
        tokens,
        entries,
      });
    }
  }

  await mapWithConcurrency(
    jobs,
    concurrency,
    async job => {
      let rawPairs = [];

      try {
        rawPairs =
          await getDexTokens({
            chainId:
              job.chain,

            tokenAddresses:
              job.tokens,
          });
      } catch (error) {
        errors.push({
          provider:
            "DEXSCREENER",

          operation:
            "BATCH_TOKEN_ENRICHMENT",

          network:
            job.chain,

          tokenCount:
            job.tokens.length,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });

        /*
         * Fail soft. The GeckoTerminal seed remains usable.
         */
        return;
      }

      const normalizedPairs =
        (Array.isArray(rawPairs)
          ? rawPairs
          : [])
          .map(
            normalizeDexPair,
          )
          .filter(Boolean);

      for (
        const entry
        of job.entries
      ) {
        if (
          !job.tokens.includes(
            entry.token,
          )
        ) {
          continue;
        }

        const matching =
          normalizedPairs.filter(
            pair =>
              sameAddress(
                pair?.baseAddress,
                entry.token,
                entry.pool?.network,
              ),
          );

        const best =
          chooseBestPairForSeed(
            matching,
            entry.pool,
          );

        if (!best) {
          continue;
        }

        const key =
          buildAssetId(
            entry.pool?.network,
            entry.pool?.baseAddress,
            entry.pool?.poolAddress,
          );

        if (!key) {
          continue;
        }

        byIdentity.set(
          key,
          mergePool(
            entry.pool,
            best,
          ),
        );
      }
    },
  );

  /*
   * Some providers/chains may not support the batch result shape
   * we expect. For still-unenriched assets, perform bounded
   * token-pair lookup as a fallback.
   */
  const unresolved =
    [
      ...byIdentity.entries(),
    ]
      .filter(
        ([, pool]) =>
          pool
            ?.dexScreenerEnriched !==
          true,
      );

  await mapWithConcurrency(
    unresolved,
    Math.max(
      1,
      Math.min(
        concurrency,
        2,
      ),
    ),
    async ([
      key,
      pool,
    ]) => {
      const chain =
        normalizeNetworkForDexScreener(
          pool?.network,
        );

      const token =
        normalizeAddress(
          pool?.baseAddress,
          pool?.network,
        );

      if (
        !chain ||
        !token
      ) {
        return;
      }

      try {
        const raw =
          await getDexTokenPairs({
            chainId:
              chain,

            tokenAddress:
              token,
          });

        const normalized =
          (Array.isArray(raw)
            ? raw
            : [])
            .map(
              normalizeDexPair,
            )
            .filter(Boolean);

        const best =
          chooseBestPairForSeed(
            normalized,
            pool,
          );

        if (best) {
          byIdentity.set(
            key,
            mergePool(
              pool,
              best,
            ),
          );
        }
      } catch (error) {
        errors.push({
          provider:
            "DEXSCREENER",

          operation:
            "TOKEN_PAIR_FALLBACK",

          network:
            chain,

          tokenAddress:
            token,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    },
  );

  return input.map(
    pool => {
      const key =
        buildAssetId(
          pool?.network,
          pool?.baseAddress,
          pool?.poolAddress,
        );

      return (
        (
          key &&
          byIdentity.get(key)
        ) ??
        pool
      );
    },
  );
}

/*
 * ============================================================
 * DATA QUALITY / QUALIFICATION
 * ============================================================
 */

function evaluateQuality(
  pool,
  {
    minimumLiquidityUsd,
    minimumVolume24hUsd,
  },
) {
  const liquidityUsd =
    numberOrNull(
      pool?.liquidityUsd,
    );

  const volume24hUsd =
    numberOrNull(
      pool?.volume24hUsd,
    );

  const age =
    numberOrNull(
      pool?.poolAgeMinutes,
    );

  const buys1h =
    integerOrNull(
      pool?.buys1h,
    );

  const sells1h =
    integerOrNull(
      pool?.sells1h,
    );

  const reasons = [];
  const warnings = [];

  if (
    liquidityUsd !== null &&
    liquidityUsd >=
      minimumLiquidityUsd
  ) {
    reasons.push(
      "LIQUIDITY_THRESHOLD_MET",
    );
  }

  if (
    volume24hUsd !== null &&
    volume24hUsd >=
      minimumVolume24hUsd
  ) {
    reasons.push(
      "VOLUME_THRESHOLD_MET",
    );
  }

  if (
    age !== null &&
    age <= 1440
  ) {
    reasons.push(
      "NEW_POOL",
    );
  }

  if (
    buys1h !== null &&
    sells1h !== null &&
    buys1h > sells1h
  ) {
    reasons.push(
      "BUY_PRESSURE_1H",
    );
  }

  if (
    liquidityUsd === null
  ) {
    warnings.push(
      "LIQUIDITY_UNAVAILABLE",
    );
  }

  if (
    volume24hUsd === null
  ) {
    warnings.push(
      "VOLUME_UNAVAILABLE",
    );
  }

  if (
    numberOrNull(
      pool?.marketCapUsd,
    ) === null
  ) {
    warnings.push(
      "MARKET_CAP_UNAVAILABLE",
    );
  }

  if (
    numberOrNull(
      pool?.fdvUsd,
    ) === null
  ) {
    warnings.push(
      "FDV_UNAVAILABLE",
    );
  }

  if (
    age !== null &&
    age < 60
  ) {
    warnings.push(
      "VERY_NEW_POOL",
    );
  }

  if (
    pool
      ?.dexScreenerEnriched !==
    true
  ) {
    warnings.push(
      "DEXSCREENER_ENRICHMENT_UNAVAILABLE",
    );
  }

  if (
    pool?.paidPromotion ===
    true
  ) {
    warnings.push(
      "PAID_DEXSCREENER_PROMOTION",
    );
  }

  const rawChanges = [
    numberOrNull(
      pool?.change5mPercent,
    ),
    numberOrNull(
      pool?.change1hPercent,
    ),
    numberOrNull(
      pool?.change6hPercent,
    ),
    numberOrNull(
      pool?.change24hPercent,
    ),
  ].filter(
    value =>
      value !== null,
  );

  if (
    rawChanges.some(
      value =>
        Math.abs(value) >=
        1000,
    )
  ) {
    warnings.push(
      "EXTREME_PRICE_CHANGE_REQUIRES_VALIDATION",
    );
  }

  /*
   * Discovery qualification intentionally remains broad.
   *
   * A new pool can be interesting because it has either:
   * - enough liquidity, OR
   * - enough measured activity.
   *
   * The future Emerging DEX Score will be stricter and
   * multi-dimensional. Do not interpret this boolean as a
   * buy recommendation.
   */
  const qualified =
    (
      liquidityUsd !== null &&
      liquidityUsd >=
        minimumLiquidityUsd
    ) ||
    (
      volume24hUsd !== null &&
      volume24hUsd >=
        minimumVolume24hUsd
    );

  return {
    qualified,

    reasons,

    warnings,

    thresholds: {
      minimumLiquidityUsd,
      minimumVolume24hUsd,
    },
  };
}

/*
 * ============================================================
 * ASSET CONTRACT
 * ============================================================
 */

function poolToAsset(
  pool,
  thresholds,
) {
  const network =
    normalizeNetwork(
      pool?.network ??
      pool?.chainId,
    ) || null;

  const contractAddress =
    normalizeAddress(
      pool?.baseAddress ??
      pool?.contractAddress,
      network,
    );

  const poolAddress =
    normalizeAddress(
      pool?.poolAddress ??
      pool?.pairAddress,
      network,
    );

  const quoteAddress =
    normalizeAddress(
      pool?.quoteAddress,
      network,
    );

  const symbol =
    upper(
      pool?.baseSymbol ??
      pool?.symbol,
    ) ||
    "UNKNOWN";

  const pairCreatedAt =
    numberOrNull(
      pool?.pairCreatedAt,
    );

  const qualification =
    evaluateQuality(
      pool,
      thresholds,
    );

  const assetId =
    buildAssetId(
      network,
      contractAddress,
      poolAddress,
    );

  const liquidityUsd =
    numberOrNull(
      pool?.liquidityUsd ??
      pool?.reserveUsd,
    );

  const volume24hUsd =
    numberOrNull(
      pool?.volume24hUsd,
    );

  const marketDataAvailable =
    Boolean(
      numberOrNull(
        pool?.priceUsd,
      ) !== null ||
      liquidityUsd !== null ||
      volume24hUsd !== null,
    );

  return {
    assetId,

    contractAddress,

    network,

    chainId:
      network,

    symbol,

    name:
      stringOrNull(
        pool?.baseName,
      ) ??
      stringOrNull(
        pool?.name,
      ) ??
      symbol,

    priceUsd:
      numberOrNull(
        pool?.priceUsd,
      ),

    marketCapUsd:
      numberOrNull(
        pool?.marketCapUsd,
      ),

    fdvUsd:
      numberOrNull(
        pool?.fdvUsd,
      ),

    liquidityUsd,

    volume5mUsd:
      numberOrNull(
        pool?.volume5mUsd,
      ),

    volume1hUsd:
      numberOrNull(
        pool?.volume1hUsd,
      ),

    volume6hUsd:
      numberOrNull(
        pool?.volume6hUsd,
      ),

    volume24hUsd,

    buys5m:
      integerOrNull(
        pool?.buys5m,
      ),

    sells5m:
      integerOrNull(
        pool?.sells5m,
      ),

    transactions5m:
      integerOrNull(
        pool?.transactions5m,
      ),

    buys1h:
      integerOrNull(
        pool?.buys1h,
      ),

    sells1h:
      integerOrNull(
        pool?.sells1h,
      ),

    transactions1h:
      integerOrNull(
        pool?.transactions1h,
      ),

    buys6h:
      integerOrNull(
        pool?.buys6h,
      ),

    sells6h:
      integerOrNull(
        pool?.sells6h,
      ),

    transactions6h:
      integerOrNull(
        pool?.transactions6h,
      ),

    buys24h:
      integerOrNull(
        pool?.buys24h,
      ),

    sells24h:
      integerOrNull(
        pool?.sells24h,
      ),

    transactions24h:
      integerOrNull(
        pool?.transactions24h,
      ),

    change5mPercent:
      numberOrNull(
        pool?.change5mPercent,
      ),

    change1hPercent:
      numberOrNull(
        pool?.change1hPercent,
      ),

    change6hPercent:
      numberOrNull(
        pool?.change6hPercent,
      ),

    change24hPercent:
      numberOrNull(
        pool?.change24hPercent,
      ),

    pairCreatedAt,

    poolCreatedAt:
      stringOrNull(
        pool?.poolCreatedAt,
      ),

    poolAgeMinutes:
      numberOrNull(
        pool?.poolAgeMinutes,
      ) ??
      ageMinutes(
        pairCreatedAt,
      ),

    paidPromotion:
      pool?.paidPromotion ===
      true,

    boostActive:
      integerOrNull(
        pool?.boostActive,
      ),

    url:
      stringOrNull(
        pool?.url,
      ),

    labels:
      Array.isArray(
        pool?.labels,
      )
        ? pool.labels
        : [],

    imageUrl:
      stringOrNull(
        pool?.imageUrl,
      ),

    websites:
      Array.isArray(
        pool?.websites,
      )
        ? pool.websites
        : [],

    socials:
      Array.isArray(
        pool?.socials,
      )
        ? pool.socials
        : [],

    /*
     * Do not assert that a discovered pool is safely tradable.
     * This only states whether we have usable market observations.
     */
    marketDataAvailable,

    tradable:
      null,

    source:
      "DEX_DISCOVERY",

    discoverySource:
      pool?.discoverySource ??
      pool?.source ??
      "GECKOTERMINAL",

    marketDataSource:
      pool?.dexScreenerEnriched ===
        true
        ? "DEXSCREENER"
        : (
            pool?.source ??
            "GECKOTERMINAL"
          ),

    dexScreenerEnriched:
      pool?.dexScreenerEnriched ===
      true,

    qualification,

    venues: {
      venueCount: 1,

      cexCount: 0,

      dexCount: 1,

      exchanges: [
        stringOrNull(
          pool?.exchange,
        ),
      ].filter(Boolean),

      primaryVenue:
        stringOrNull(
          pool?.exchange,
        ),

      cex: [],

      dex: [
        {
          source:
            pool?.dexScreenerEnriched ===
              true
              ? "DEXSCREENER"
              : (
                  pool?.source ??
                  "GECKOTERMINAL"
                ),

          exchange:
            stringOrNull(
              pool?.exchange,
            ),

          venueType:
            "DEX",

          chainId:
            network,

          pairAddress:
            poolAddress,

          baseAddress:
            contractAddress,

          quoteAddress,

          liquidityUsd,

          volume5mUsd:
            numberOrNull(
              pool?.volume5mUsd,
            ),

          volume1hUsd:
            numberOrNull(
              pool?.volume1hUsd,
            ),

          volume6hUsd:
            numberOrNull(
              pool?.volume6hUsd,
            ),

          volume24hUsd,

          buys5m:
            integerOrNull(
              pool?.buys5m,
            ),

          sells5m:
            integerOrNull(
              pool?.sells5m,
            ),

          transactions5m:
            integerOrNull(
              pool?.transactions5m,
            ),

          buys1h:
            integerOrNull(
              pool?.buys1h,
            ),

          sells1h:
            integerOrNull(
              pool?.sells1h,
            ),

          transactions1h:
            integerOrNull(
              pool?.transactions1h,
            ),

          buys6h:
            integerOrNull(
              pool?.buys6h,
            ),

          sells6h:
            integerOrNull(
              pool?.sells6h,
            ),

          transactions6h:
            integerOrNull(
              pool?.transactions6h,
            ),

          buys24h:
            integerOrNull(
              pool?.buys24h,
            ),

          sells24h:
            integerOrNull(
              pool?.sells24h,
            ),

          transactions24h:
            integerOrNull(
              pool?.transactions24h,
            ),

          pairCreatedAt,

          paidPromotion:
            pool?.paidPromotion ===
            true,

          boostActive:
            integerOrNull(
              pool?.boostActive,
            ),
        },
      ],

      /*
       * Missing values remain null. This prevents "unknown"
       * from being misrepresented as real zero liquidity/volume.
       */
      dexLiquidityUsd:
        liquidityUsd,

      dexVolume24hUsd:
        volume24hUsd,
    },

    discoveredAt:
      new Date().toISOString(),

    researchOnly: true,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

/*
 * ============================================================
 * DEDUPLICATION
 * ============================================================
 */

function assetQualityRank(
  asset,
) {
  let score = 0;

  if (
    asset?.dexScreenerEnriched ===
    true
  ) {
    score += 100;
  }

  if (
    asset?.marketDataAvailable ===
    true
  ) {
    score += 50;
  }

  if (
    asset?.liquidityUsd !==
    null
  ) {
    score += 20;
  }

  if (
    asset?.volume24hUsd !==
    null
  ) {
    score += 10;
  }

  if (
    asset?.priceUsd !==
    null
  ) {
    score += 5;
  }

  return score;
}

function deduplicateAssets(
  assets,
) {
  const map =
    new Map();

  for (
    const asset
    of (
      Array.isArray(assets)
        ? assets
        : []
    )
  ) {
    if (!asset) {
      continue;
    }

    const key =
      asset?.assetId ??
      (
        asset?.network &&
        asset?.venues?.dex?.[0]
          ?.pairAddress
          ? `dex-pool:${asset.network}:${asset.venues.dex[0].pairAddress}`
          : null
      );

    if (!key) {
      continue;
    }

    const existing =
      map.get(key);

    if (
      !existing ||
      assetQualityRank(
        asset,
      ) >
        assetQualityRank(
          existing,
        )
    ) {
      map.set(
        key,
        asset,
      );
    }
  }

  return [
    ...map.values(),
  ];
}

/*
 * ============================================================
 * PUBLIC SERVICE
 * ============================================================
 */

export async function discoverDexAssets({
  networks =
    DEFAULT_NETWORKS,

  pagesPerNetwork = 1,

  minimumLiquidityUsd =
    10_000,

  minimumVolume24hUsd =
    10_000,

  enrichmentConcurrency =
    DEFAULT_ENRICHMENT_CONCURRENCY,
} = {}) {
  const errors = [];

  const requestedNetworks =
    [
      ...new Set(
        (
          Array.isArray(networks)
            ? networks
            : DEFAULT_NETWORKS
        )
          .map(
            normalizeNetwork,
          )
          .filter(Boolean),
      ),
    ];

  let discovery;

  try {
    discovery =
      await getNewPoolsAcrossNetworks({
        networks:
          requestedNetworks,

        pagesPerNetwork,
      });
  } catch (error) {
    errors.push({
      provider:
        "GECKOTERMINAL",

      operation:
        "NEW_POOL_DISCOVERY",

      error:
        error instanceof Error
          ? error.message
          : String(error),
    });

    return {
      approved: false,

      status:
        "UNAVAILABLE",

      provider:
        null,

      assets: [],

      qualifiedAssets: [],

      poolCount: 0,

      discoveredCount: 0,

      qualifiedCount: 0,

      providers: {
        discovery:
          "GECKOTERMINAL",

        enrichment:
          "DEXSCREENER",
      },

      errors,

      researchOnly: true,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }

  for (
    const item
    of (
      discovery?.errors ??
      []
    )
  ) {
    errors.push({
      provider:
        "GECKOTERMINAL",

      ...item,
    });
  }

  const rawPools =
    Array.isArray(
      discovery?.pools,
    )
      ? discovery.pools
      : [];

  /*
   * Preserve provider-supplied network identity. If a future
   * GeckoTerminal provider includes requestedNetwork per pool,
   * this fallback will use it as well.
   */
  const normalizedPools =
    rawPools
      .map(pool =>
        normalizeDiscoveryPool(
          pool,
          pool?.requestedNetwork ??
          pool?.networkId ??
          null,
        ),
      )
      .filter(Boolean)
      .filter(
        pool =>
          Boolean(
            pool?.network &&
            (
              pool?.baseAddress ||
              pool?.poolAddress
            ),
          ),
      );

  const enrichedPools =
    await batchEnrichPools(
      normalizedPools,
      errors,
      {
        concurrency:
          enrichmentConcurrency,
      },
    );

  const assets =
    deduplicateAssets(
      enrichedPools.map(
        pool =>
          poolToAsset(
            pool,
            {
              minimumLiquidityUsd,
              minimumVolume24hUsd,
            },
          ),
      ),
    );

  const qualifiedAssets =
    assets.filter(
      asset =>
        asset
          ?.qualification
          ?.qualified ===
        true,
    );

  const enrichedCount =
    assets.filter(
      asset =>
        asset
          ?.dexScreenerEnriched ===
        true,
    ).length;

  const measuredCount =
    assets.filter(
      asset =>
        asset
          ?.marketDataAvailable ===
        true,
    ).length;

  const status =
    assets.length === 0
      ? (
          errors.length > 0
            ? "PARTIAL"
            : "EMPTY"
        )
      : (
          errors.length > 0
            ? "PARTIAL"
            : "COMPLETE"
        );

  console.log(
    [
      "[DEX_DISCOVERY]",
      "provider=GECKOTERMINAL+DEXSCREENER",
      `pools=${rawPools.length}`,
      `normalized=${normalizedPools.length}`,
      `discovered=${assets.length}`,
      `enriched=${enrichedCount}`,
      `measured=${measuredCount}`,
      `qualified=${qualifiedAssets.length}`,
      `errors=${errors.length}`,
    ].join(" "),
  );

  return {
    approved:
      assets.length > 0,

    status,

    provider:
      "GECKOTERMINAL+DEXSCREENER",

    assets,

    qualifiedAssets,

    poolCount:
      rawPools.length,

    normalizedPoolCount:
      normalizedPools.length,

    discoveredCount:
      assets.length,

    enrichedCount,

    measuredCount,

    qualifiedCount:
      qualifiedAssets.length,

    providers: {
      discovery:
        "GECKOTERMINAL",

      enrichment:
        "DEXSCREENER",

      coinMarketCap:
        false,
    },

    networks:
      requestedNetworks,

    thresholds: {
      minimumLiquidityUsd,
      minimumVolume24hUsd,
    },

    errors,

    researchOnly: true,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default discoverDexAssets;
