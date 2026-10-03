/**
 * ============================================================
 * AEMA CRYPTO — COINMARKETCAP KEYLESS DEX PROVIDER
 * ============================================================
 *
 * Broad DEX discovery fallback.
 *
 * Uses CoinMarketCap's documented keyless public DEX API.
 */

const BASE =
  "https://pro-api.coinmarketcap.com/public-api";

function numberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const n =
    Number(value);

  return Number.isFinite(n)
    ? n
    : null;
}

function normalizeAddress(value) {
  return String(
    value ?? "",
  )
    .trim()
    .toLowerCase();
}

function normalizeSymbol(value) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

async function fetchJson(
  path,
  {
    timeoutMs = 15000,
  } = {},
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const response =
      await fetch(
        `${BASE}${path}`,
        {
          headers: {
            accept:
              "application/json",

            "User-Agent":
              "AEMA-Research/1.0",
          },

          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      const body =
        await response
          .text()
          .catch(
            () => "",
          );

      throw new Error(
        `CMC_DEX_HTTP_${response.status}:${body.slice(0, 250)}`,
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function extractRows(payload) {
  if (
    Array.isArray(payload)
  ) {
    return payload;
  }

  if (
    Array.isArray(
      payload?.data,
    )
  ) {
    return payload.data;
  }

  if (
    Array.isArray(
      payload?.data?.pairs,
    )
  ) {
    return payload.data.pairs;
  }

  return [];
}

function quoteObject(row) {
  if (
    Array.isArray(
      row?.quote,
    )
  ) {
    return (
      row.quote.find(
        item =>
          String(
            item
              ?.name ??
            item
              ?.symbol ??
            item
              ?.convert ??
            "",
          ).toUpperCase() ===
            "USD",
      ) ??
      row.quote[0] ??
      {}
    );
  }

  if (
    row?.quote &&
    typeof row.quote ===
      "object"
  ) {
    return (
      row.quote.USD ??
      row.quote.usd ??
      row.quote
    );
  }

  return {};
}

export function normalizeCoinMarketCapDexPair(
  row = {},
) {
  const quote =
    quoteObject(row);

  const buys24h =
    numberOrNull(
      row?.["24h_no_of_buys"] ??
      row?.buys_24h ??
      row?.num_buys_24h,
    );

  const sells24h =
    numberOrNull(
      row?.["24h_no_of_sells"] ??
      row?.sells_24h ??
      row?.num_sells_24h,
    );

  const transactions24h =
    numberOrNull(
      row?.num_transactions_24h,
    ) ??
    (
      buys24h !== null &&
      sells24h !== null
        ? buys24h +
          sells24h
        : null
    );

  const poolCreated =
    row?.pool_created ??
    row?.created_at ??
    null;

  return {
    source:
      "COINMARKETCAP_DEX",

    venueType:
      "DEX",

    exchange:
      String(
        row?.dex_slug ??
        row?.dex_id ??
        "DEX",
      )
        .trim()
        .toUpperCase(),

    network:
      row?.network_slug ??
      row?.network_id ??
      null,

    chainId:
      row?.network_slug ??
      row?.network_id ??
      null,

    poolId:
      row?.contract_address ??
      null,

    poolAddress:
      row?.contract_address ??
      null,

    pairAddress:
      row?.contract_address ??
      null,

    name:
      row?.name ??
      (
        row?.base_asset_symbol &&
        row?.quote_asset_symbol
          ? `${row.base_asset_symbol}/${row.quote_asset_symbol}`
          : null
      ),

    baseAddress:
      normalizeAddress(
        row
          ?.base_asset_contract_address,
      ),

    quoteAddress:
      normalizeAddress(
        row
          ?.quote_asset_contract_address,
      ),

    baseSymbol:
      normalizeSymbol(
        row
          ?.base_asset_symbol,
      ),

    baseName:
      row
        ?.base_asset_name ??
      null,

    quoteSymbol:
      normalizeSymbol(
        row
          ?.quote_asset_symbol,
      ),

    priceUsd:
      numberOrNull(
        quote?.price,
      ),

    reserveUsd:
      numberOrNull(
        quote?.liquidity,
      ),

    liquidityUsd:
      numberOrNull(
        quote?.liquidity,
      ),

    volume24hUsd:
      numberOrNull(
        quote?.volume_24h,
      ),

    volume6hUsd:
      null,

    volume1hUsd:
      null,

    change1hPercent:
      numberOrNull(
        quote
          ?.percent_change_price_1h,
      ),

    change6hPercent:
      null,

    change24hPercent:
      numberOrNull(
        quote
          ?.percent_change_price_24h,
      ),

    marketCapUsd:
      null,

    fdvUsd:
      numberOrNull(
        quote
          ?.fully_diluted_value,
      ),

    buys24h,

    sells24h,

    transactions24h,

    pairCreatedAt:
      poolCreated
        ? Date.parse(
            poolCreated,
          )
        : null,

    poolCreatedAt:
      poolCreated,

    raw:
      row,
  };
}

export async function getLatestDexPairs({
  network,
  limit = 100,
} = {}) {
  if (!network) {
    throw new Error(
      "CMC_DEX_NETWORK_REQUIRED",
    );
  }

  const params =
    new URLSearchParams({
      network_slug:
        String(network),

      limit:
        String(
          Math.max(
            1,
            Math.min(
              100,
              Number(limit) ||
              100,
            ),
          ),
        ),

      convert:
        "USD",
    });

  const payload =
    await fetchJson(
      `/v4/dex/spot-pairs/latest?${params}`,
    );

  return extractRows(
    payload,
  ).map(
    normalizeCoinMarketCapDexPair,
  );
}

export async function getLatestDexPairsAcrossNetworks({
  networks = [
    "solana",
    "base",
    "ethereum",
    "bnb",
    "arbitrum",
  ],

  limitPerNetwork = 100,
} = {}) {
  const pools = [];
  const errors = [];

  for (
    const network
    of networks
  ) {
    try {
      const rows =
        await getLatestDexPairs({
          network,
          limit:
            limitPerNetwork,
        });

      pools.push(
        ...rows,
      );
    } catch (error) {
      errors.push({
        network,

        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }
  }

  return {
    pools,
    errors,
  };
}

export default {
  getLatestDexPairs,
  getLatestDexPairsAcrossNetworks,
  normalizeCoinMarketCapDexPair,
};