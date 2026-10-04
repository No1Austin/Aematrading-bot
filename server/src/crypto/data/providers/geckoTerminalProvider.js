/**
 * ============================================================
 * AEMA CRYPTO — GECKOTERMINAL PROVIDER (HARDENED)
 * ============================================================
 *
 * PURPOSE
 * -------
 * Broad/new DEX pool discovery for AEMA Research.
 *
 * DATA INTEGRITY
 * --------------
 * - Preserves Solana/base58 address case.
 * - Lower-cases EVM addresses only.
 * - Derives network from GeckoTerminal IDs when relationship
 *   metadata does not contain a network relationship.
 * - Preserves unavailable numeric values as null, never fake 0.
 * - Exposes 5m/1h/6h/24h activity where available.
 * - Retries temporary HTTP/rate-limit failures.
 * - Research only. No execution authority.
 */

const BASE =
  process.env.GECKOTERMINAL_BASE_URL ??
  "https://api.geckoterminal.com/api/v2";

const REQUEST_TIMEOUT_MS =
  Math.max(
    1_000,
    Number(process.env.GECKOTERMINAL_TIMEOUT_MS) || 12_000,
  );

const MAX_RETRIES =
  Math.max(
    0,
    Number(process.env.GECKOTERMINAL_MAX_RETRIES) || 2,
  );

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
  const number = numberOrNull(value);

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

  const text = String(value).trim();

  return text || null;
}

function normalizeNetwork(value) {
  const key =
    String(value ?? "")
      .trim()
      .toLowerCase();

  const aliases = {
    sol: "solana",
    solana: "solana",

    ethereum: "eth",
    eth: "eth",

    bnb: "bsc",
    bnbchain: "bsc",
    binance: "bsc",
    bsc: "bsc",

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

function isEvmNetwork(network) {
  return new Set([
    "eth",
    "bsc",
    "base",
    "arbitrum",
    "polygon",
    "optimism",
    "avalanche",
  ]).has(normalizeNetwork(network));
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

  return isEvmNetwork(network)
    ? address.toLowerCase()
    : address;
}

/*
 * GeckoTerminal relationship IDs use forms such as:
 *
 * solana_<address>
 * eth_<address>
 * base_<address>
 *
 * Split only on the first underscore so the address itself
 * is not accidentally modified.
 */
function parseGeckoId(id) {
  const text =
    stringOrNull(id);

  if (!text) {
    return {
      network: null,
      address: null,
    };
  }

  const separator =
    text.indexOf("_");

  if (separator <= 0) {
    return {
      network: null,
      address: text,
    };
  }

  return {
    network:
      normalizeNetwork(
        text.slice(
          0,
          separator,
        ),
      ) || null,

    address:
      stringOrNull(
        text.slice(
          separator + 1,
        ),
      ),
  };
}

function inferNetwork({
  item,
  requestedNetwork,
  baseTokenId,
  quoteTokenId,
} = {}) {
  const relationshipNetwork =
    item
      ?.relationships
      ?.network
      ?.data
      ?.id;

  if (relationshipNetwork) {
    return (
      normalizeNetwork(
        relationshipNetwork,
      ) || null
    );
  }

  if (requestedNetwork) {
    return (
      normalizeNetwork(
        requestedNetwork,
      ) || null
    );
  }

  const poolIdNetwork =
    parseGeckoId(
      item?.id,
    ).network;

  if (poolIdNetwork) {
    return poolIdNetwork;
  }

  const baseNetwork =
    parseGeckoId(
      baseTokenId,
    ).network;

  if (baseNetwork) {
    return baseNetwork;
  }

  return (
    parseGeckoId(
      quoteTokenId,
    ).network ??
    null
  );
}

function transactionWindow(
  attributes,
  window,
) {
  const row =
    attributes
      ?.transactions
      ?.[window] ??
    {};

  const buys =
    integerOrNull(
      row?.buys,
    );

  const sells =
    integerOrNull(
      row?.sells,
    );

  const buyers =
    integerOrNull(
      row?.buyers,
    );

  const sellers =
    integerOrNull(
      row?.sellers,
    );

  const transactions =
    buys !== null &&
    sells !== null
      ? buys + sells
      : null;

  return {
    buys,
    sells,
    buyers,
    sellers,
    transactions,
  };
}

function sleep(ms) {
  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms,
      ),
  );
}

function retryAfterMs(response) {
  const header =
    response.headers.get(
      "retry-after",
    );

  if (!header) {
    return null;
  }

  const seconds =
    Number(header);

  if (
    Number.isFinite(seconds)
  ) {
    return Math.max(
      0,
      seconds * 1000,
    );
  }

  const timestamp =
    Date.parse(header);

  if (
    Number.isFinite(timestamp)
  ) {
    return Math.max(
      0,
      timestamp - Date.now(),
    );
  }

  return null;
}

async function fetchJson(
  url,
  {
    timeoutMs =
      REQUEST_TIMEOUT_MS,

    retries =
      MAX_RETRIES,
  } = {},
) {
  let lastError = null;

  for (
    let attempt = 0;
    attempt <= retries;
    attempt += 1
  ) {
    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        timeoutMs,
      );

    try {
      const response =
        await fetch(
          url,
          {
            headers: {
              accept:
                "application/json",
            },

            signal:
              controller.signal,
          },
        );

      if (response.ok) {
        return await response.json();
      }

      const body =
        await response.text();

      const retryable =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500;

      lastError =
        new Error(
          `GeckoTerminal ${response.status}: ${body.slice(0, 500)}`,
        );

      if (
        !retryable ||
        attempt >= retries
      ) {
        throw lastError;
      }

      const waitMs =
        retryAfterMs(response) ??
        Math.min(
          4_000,
          500 *
            2 ** attempt,
        );

      await sleep(waitMs);
    } catch (error) {
      lastError = error;

      const retryable =
        error?.name ===
          "AbortError" ||
        error instanceof TypeError;

      if (
        !retryable ||
        attempt >= retries
      ) {
        if (
          error?.name ===
          "AbortError"
        ) {
          throw new Error(
            `GeckoTerminal request timed out after ${timeoutMs}ms`,
          );
        }

        throw error;
      }

      await sleep(
        Math.min(
          4_000,
          500 *
            2 ** attempt,
        ),
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ??
    new Error(
      "GeckoTerminal request failed",
    )
  );
}

export function normalizeGeckoTerminalPool(
  item,
  {
    requestedNetwork = null,
  } = {},
) {
  if (
    !item ||
    typeof item !== "object"
  ) {
    return null;
  }

  const attributes =
    item?.attributes ?? {};

  const relationships =
    item?.relationships ?? {};

  const baseTokenId =
    stringOrNull(
      relationships
        ?.base_token
        ?.data
        ?.id,
    );

  const quoteTokenId =
    stringOrNull(
      relationships
        ?.quote_token
        ?.data
        ?.id,
    );

  const dexId =
    stringOrNull(
      relationships
        ?.dex
        ?.data
        ?.id,
    );

  const network =
    inferNetwork({
      item,
      requestedNetwork,
      baseTokenId,
      quoteTokenId,
    });

  const parsedBase =
    parseGeckoId(
      baseTokenId,
    );

  const parsedQuote =
    parseGeckoId(
      quoteTokenId,
    );

  const parsedPool =
    parseGeckoId(
      item?.id,
    );

  const poolAddress =
    normalizeAddress(
      attributes?.address ??
      parsedPool.address,
      network,
    );

  const baseAddress =
    normalizeAddress(
      parsedBase.address,
      network,
    );

  const quoteAddress =
    normalizeAddress(
      parsedQuote.address,
      network,
    );

  const tx5m =
    transactionWindow(
      attributes,
      "m5",
    );

  const tx1h =
    transactionWindow(
      attributes,
      "h1",
    );

  const tx6h =
    transactionWindow(
      attributes,
      "h6",
    );

  const tx24h =
    transactionWindow(
      attributes,
      "h24",
    );

  return {
    source:
      "GECKOTERMINAL",

    provider:
      "GECKOTERMINAL",

    venueType:
      "DEX",

    exchange:
      String(
        dexId ??
        "DEX",
      )
        .trim()
        .toUpperCase(),

    dexId,

    network,

    chainId:
      network,

    requestedNetwork:
      requestedNetwork
        ? normalizeNetwork(
            requestedNetwork,
          )
        : null,

    poolId:
      stringOrNull(
        item?.id,
      ),

    poolAddress,

    pairAddress:
      poolAddress,

    name:
      stringOrNull(
        attributes?.name,
      ),

    baseTokenId,
    quoteTokenId,

    baseAddress,
    contractAddress:
      baseAddress,

    quoteAddress,

    priceUsd:
      numberOrNull(
        attributes
          ?.base_token_price_usd,
      ),

    priceNative:
      numberOrNull(
        attributes
          ?.base_token_price_native_currency,
      ),

    quotePriceUsd:
      numberOrNull(
        attributes
          ?.quote_token_price_usd,
      ),

    reserveUsd:
      numberOrNull(
        attributes
          ?.reserve_in_usd,
      ),

    liquidityUsd:
      numberOrNull(
        attributes
          ?.reserve_in_usd,
      ),

    volume5mUsd:
      numberOrNull(
        attributes
          ?.volume_usd
          ?.m5,
      ),

    volume1hUsd:
      numberOrNull(
        attributes
          ?.volume_usd
          ?.h1,
      ),

    volume6hUsd:
      numberOrNull(
        attributes
          ?.volume_usd
          ?.h6,
      ),

    volume24hUsd:
      numberOrNull(
        attributes
          ?.volume_usd
          ?.h24,
      ),

    change5mPercent:
      numberOrNull(
        attributes
          ?.price_change_percentage
          ?.m5,
      ),

    change1hPercent:
      numberOrNull(
        attributes
          ?.price_change_percentage
          ?.h1,
      ),

    change6hPercent:
      numberOrNull(
        attributes
          ?.price_change_percentage
          ?.h6,
      ),

    change24hPercent:
      numberOrNull(
        attributes
          ?.price_change_percentage
          ?.h24,
      ),

    transactions5m:
      tx5m.transactions,

    buys5m:
      tx5m.buys,

    sells5m:
      tx5m.sells,

    buyers5m:
      tx5m.buyers,

    sellers5m:
      tx5m.sellers,

    transactions1h:
      tx1h.transactions,

    buys1h:
      tx1h.buys,

    sells1h:
      tx1h.sells,

    buyers1h:
      tx1h.buyers,

    sellers1h:
      tx1h.sellers,

    transactions6h:
      tx6h.transactions,

    buys6h:
      tx6h.buys,

    sells6h:
      tx6h.sells,

    buyers6h:
      tx6h.buyers,

    sellers6h:
      tx6h.sellers,

    transactions24h:
      tx24h.transactions,

    buys24h:
      tx24h.buys,

    sells24h:
      tx24h.sells,

    buyers24h:
      tx24h.buyers,

    sellers24h:
      tx24h.sellers,

    poolCreatedAt:
      stringOrNull(
        attributes
          ?.pool_created_at,
      ),

    /*
     * Keep FDV and market cap distinct.
     * If GeckoTerminal says market_cap_usd = null,
     * this remains null rather than becoming 0.
     */
    fdvUsd:
      numberOrNull(
        attributes
          ?.fdv_usd,
      ),

    marketCapUsd:
      numberOrNull(
        attributes
          ?.market_cap_usd,
      ),

    observedAt:
      new Date().toISOString(),

    researchOnly: true,

    executionAuthority:
      false,

    liveExecution:
      false,

    raw:
      item,
  };
}

export async function getNewPools({
  network = null,
  page = 1,
} = {}) {
  const normalizedNetwork =
    network
      ? normalizeNetwork(
          network,
        )
      : null;

  const path =
    normalizedNetwork
      ? `/networks/${encodeURIComponent(
          normalizedNetwork,
        )}/new_pools`
      : "/networks/new_pools";

  const params =
    new URLSearchParams({
      page:
        String(
          Math.max(
            1,
            Number(page) || 1,
          ),
        ),
    });

  const payload =
    await fetchJson(
      `${BASE}${path}?${params}`,
    );

  return Array.isArray(
    payload?.data,
  )
    ? payload.data
        .map(item =>
          normalizeGeckoTerminalPool(
            item,
            {
              requestedNetwork:
                normalizedNetwork,
            },
          ),
        )
        .filter(Boolean)
    : [];
}

export async function getNewPoolsAcrossNetworks({
  networks = [
    "solana",
    "base",
    "eth",
    "bsc",
    "arbitrum",
  ],

  pagesPerNetwork = 1,
} = {}) {
  const pools = [];
  const errors = [];

  const normalizedNetworks =
    [
      ...new Set(
        (
          Array.isArray(networks)
            ? networks
            : []
        )
          .map(
            normalizeNetwork,
          )
          .filter(Boolean),
      ),
    ];

  const pages =
    Math.max(
      1,
      Number(
        pagesPerNetwork,
      ) || 1,
    );

  /*
   * Keep requests sequential by default. New-pool discovery
   * is not latency critical enough to justify unnecessary
   * burst traffic against the public API.
   */
  for (
    const network
    of normalizedNetworks
  ) {
    for (
      let page = 1;
      page <= pages;
      page += 1
    ) {
      try {
        const rows =
          await getNewPools({
            network,
            page,
          });

        pools.push(
          ...rows,
        );
      } catch (error) {
        errors.push({
          provider:
            "GECKOTERMINAL",

          network,

          page,

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
      }
    }
  }

  return {
    pools,
    errors,

    networks:
      normalizedNetworks,

    pagesPerNetwork:
      pages,

    poolCount:
      pools.length,

    researchOnly: true,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export default {
  getNewPools,
  getNewPoolsAcrossNetworks,
  normalizeGeckoTerminalPool,
};
