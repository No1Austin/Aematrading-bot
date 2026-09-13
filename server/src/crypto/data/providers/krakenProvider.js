/**
 * ============================================================
 * AEMA CRYPTO — KRAKEN PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 * Fetch and normalize Kraken spot-market trading pairs.
 *
 * This provider is responsible only for Kraken market/venue
 * discovery. It does not score or qualify crypto candidates.
 * ============================================================
 */

const KRAKEN_API_BASE =
  "https://api.kraken.com/0/public";

/**
 * Normalize a symbol returned by Kraken.
 */
function normalizeSymbol(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

/**
 * Kraken sometimes uses legacy asset names.
 * Convert the most common ones into standard symbols.
 */
function normalizeKrakenAsset(value) {
  const symbol =
    normalizeSymbol(value);

  const replacements = {
    XBT: "BTC",
    XXBT: "BTC",

    XETH: "ETH",

    XXRP: "XRP",

    XLTC: "LTC",

    XXLM: "XLM",

    XETC: "ETC",

    ZUSD: "USD",
    ZEUR: "EUR",
    ZGBP: "GBP",
    ZJPY: "JPY",
    ZCAD: "CAD",
    ZAUD: "AUD",
  };

  return (
    replacements[symbol] ??
    symbol
  );
}

/**
 * ============================================================
 * FETCH JSON
 * ============================================================
 */

async function fetchJson(
  url,
) {
  const response =
    await fetch(url, {
      headers: {
        accept:
          "application/json",
      },
    });

  if (!response.ok) {
    throw new Error(
      `Kraken HTTP ${response.status}: ${
        response.statusText
      }`,
    );
  }

  const payload =
    await response.json();

  if (
    Array.isArray(
      payload?.error,
    ) &&
    payload.error.length > 0
  ) {
    throw new Error(
      `Kraken API: ${payload.error.join(
        ", ",
      )}`,
    );
  }

  return payload;
}

/**
 * ============================================================
 * NORMALIZE KRAKEN PAIR
 * ============================================================
 */

export function normalizeKrakenPair(
  pairId,
  pair,
) {
  const wsname =
    String(
      pair?.wsname ?? "",
    ).trim();

  const wsParts =
    wsname
      ? wsname.split("/")
      : [];

  /*
   * Parentheses are intentional here.
   *
   * JavaScript does not permit:
   *
   * value || other ?? null
   *
   * without explicitly grouping the expression.
   */

  const rawBase =
    wsParts[0] ||
    (pair?.base ?? null);

  const rawQuote =
    wsParts[1] ||
    (pair?.quote ?? null);

  const base =
    normalizeKrakenAsset(
      rawBase,
    );

  const quote =
    normalizeKrakenAsset(
      rawQuote,
    );

  const altname =
    String(
      pair?.altname ??
        pairId ??
        "",
    ).trim();

  return {
    exchange:
      "KRAKEN",

    venueType:
      "CEX",

    productId:
      pairId ?? null,

    altname:
      altname || null,

    wsname:
      wsname || null,

    base:
      base || null,

    baseSymbol:
      base || null,

    quote:
      quote || null,

    quoteSymbol:
      quote || null,

    tradable: true,

    status:
      pair?.status ??
      "online",

    orderMinimum:
      Number.isFinite(
        Number(
          pair?.ordermin,
        ),
      )
        ? Number(
            pair.ordermin,
          )
        : null,

    costMinimum:
      Number.isFinite(
        Number(
          pair?.costmin,
        ),
      )
        ? Number(
            pair.costmin,
          )
        : null,

    priceDecimals:
      Number.isFinite(
        Number(
          pair?.pair_decimals,
        ),
      )
        ? Number(
            pair.pair_decimals,
          )
        : null,

    lotDecimals:
      Number.isFinite(
        Number(
          pair?.lot_decimals,
        ),
      )
        ? Number(
            pair.lot_decimals,
          )
        : null,

    source:
      "KRAKEN",

    raw:
      pair,
  };
}

/**
 * ============================================================
 * GET KRAKEN ASSET PAIRS
 * ============================================================
 */

export async function getKrakenAssetPairs({
  quoteCurrencies = [
    "USD",
    "USDT",
    "USDC",
    "EUR",
    "CAD",
  ],
} = {}) {
  const payload =
    await fetchJson(
      `${KRAKEN_API_BASE}/AssetPairs`,
    );

  const result =
    payload?.result ?? {};

  const allowedQuotes =
    new Set(
      quoteCurrencies.map(
        normalizeKrakenAsset,
      ),
    );

  return Object.entries(
    result,
  )
    .map(
      ([
        pairId,
        pair,
      ]) =>
        normalizeKrakenPair(
          pairId,
          pair,
        ),
    )
    .filter(
      pair =>
        Boolean(
          pair.baseSymbol,
        ) &&
        Boolean(
          pair.quoteSymbol,
        ),
    )
    .filter(
      pair =>
        allowedQuotes.size ===
          0 ||
        allowedQuotes.has(
          pair.quoteSymbol,
        ),
    )
    .filter(
      pair =>
        pair.status !==
        "cancel_only",
    );
}

/**
 * ============================================================
 * BUILD KRAKEN VENUE MAP
 * ============================================================
 */

export async function getKrakenVenueMap(
  options = {},
) {
  const pairs =
    await getKrakenAssetPairs(
      options,
    );

  const map =
    new Map();

  for (
    const pair
    of pairs
  ) {
    const symbol =
      pair.baseSymbol;

    if (!symbol) {
      continue;
    }

    if (
      !map.has(
        symbol,
      )
    ) {
      map.set(
        symbol,
        [],
      );
    }

    map
      .get(symbol)
      .push(pair);
  }

  return map;
}

/**
 * ============================================================
 * DEFAULT EXPORT
 * ============================================================
 */

export default {
  getKrakenAssetPairs,
  getKrakenVenueMap,
  normalizeKrakenPair,
};