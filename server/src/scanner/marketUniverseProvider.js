/**
 * ============================================================
 * MARKET UNIVERSE PROVIDER
 * ============================================================
 *
 * PURPOSE
 * -------
 *
 * Discover the active US-equity universe available through
 * Alpaca.
 *
 * This provider answers:
 *
 *   "What stocks can the scanner consider?"
 *
 * It does NOT:
 *
 * - score stocks
 * - run deep research
 * - make LONG/SHORT decisions
 * - place orders
 *
 * The scanner consumes the returned universe.
 */

/**
 * ============================================================
 * CONFIG
 * ============================================================
 */

const DEFAULT_ALPACA_TRADING_BASE_URL =
  "https://paper-api.alpaca.markets";

const DEFAULT_CACHE_TTL_MS =
  6 * 60 * 60 * 1000;

export const MARKET_UNIVERSE_STATUS =
  Object.freeze({
    COMPLETE: "COMPLETE",
    INVALID_REQUEST:
      "INVALID_REQUEST",
    AUTH_MISSING:
      "AUTH_MISSING",
    PROVIDER_ERROR:
      "PROVIDER_ERROR",
  });

/**
 * ============================================================
 * INTERNAL CACHE
 * ============================================================
 */

let cachedUniverse = null;

let inFlightRequest = null;

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function nowIso() {
  return new Date()
    .toISOString();
}

function normalizeSymbol(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}

function normalizeString(
  value,
) {
  const normalized =
    String(
      value ?? "",
    )
      .trim();

  return normalized ||
    null;
}

function positiveInteger(
  value,
  fallback,
) {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  )
    ? number
    : fallback;
}

function clone(value) {
  if (
    typeof structuredClone ===
    "function"
  ) {
    return structuredClone(
      value,
    );
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}

function safeErrorMessage(
  error,
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return String(error);
}

function getAlpacaCredentials() {
  return {
    key:
      process.env
        .ALPACA_API_KEY ??
      null,

    secret:
      process.env
        .ALPACA_SECRET_KEY ??
      null,
  };
}

function getBaseUrl() {
  return (
    process.env
      .ALPACA_TRADING_BASE_URL ??
    DEFAULT_ALPACA_TRADING_BASE_URL
  )
    .replace(
      /\/+$/,
      "",
    );
}

/**
 * ============================================================
 * ASSET NORMALIZATION
 * ============================================================
 */

function normalizeAsset(
  asset,
) {
  const symbol =
    normalizeSymbol(
      asset?.symbol,
    );

  if (!symbol) {
    return null;
  }

  const assetClass =
    normalizeString(
      asset?.class ??
      asset?.asset_class,
    );

  const status =
    normalizeString(
      asset?.status,
    );

  const exchange =
    normalizeString(
      asset?.exchange,
    );

  const borrowStatus =
    normalizeString(
      asset?.borrow_status,
    );

  /**
   * Compatibility:
   *
   * borrow_status is the modern Alpaca field.
   *
   * easy_to_borrow is retained only as a fallback
   * because older responses / fixtures may still contain it.
   */
  const easyToBorrow =
    asset?.easy_to_borrow ===
      true;

  const shortable =
    asset?.shortable ===
      true;

  return {
    id:
      normalizeString(
        asset?.id,
      ),

    symbol,

    name:
      normalizeString(
        asset?.name,
      ),

    assetClass,

    exchange,

    status,

    tradable:
      asset?.tradable ===
      true,

    marginable:
      asset?.marginable ===
      true,

    shortable,

    borrowStatus,

    /**
     * Legacy compatibility only.
     */
    easyToBorrow,

    fractionable:
      asset?.fractionable ===
      true,

    attributes:
      Array.isArray(
        asset?.attributes,
      )
        ? [
            ...asset.attributes,
          ]
        : [],

    /**
     * Scanner-level SHORT usability.
     *
     * This does NOT guarantee that a future broker
     * locate/order will succeed.
     */
    shortCandidateEligible:
      shortable &&
      (
        borrowStatus === null ||
        borrowStatus
          .toLowerCase() !==
          "unavailable"
      ),

    source:
      "ALPACA_ASSETS",
  };
}

/**
 * ============================================================
 * FILTERING
 * ============================================================
 */

function filterUniverse({
  assets,
  includeExchanges = null,
  excludeExchanges = [
    "OTC",
  ],
  requireTradable = true,
} = {}) {
  const included =
    Array.isArray(
      includeExchanges,
    )
      ? new Set(
          includeExchanges
            .map(
              exchange =>
                String(
                  exchange,
                )
                  .trim()
                  .toUpperCase(),
            )
            .filter(Boolean),
        )
      : null;

  const excluded =
    new Set(
      Array.isArray(
        excludeExchanges,
      )
        ? excludeExchanges
            .map(
              exchange =>
                String(
                  exchange,
                )
                  .trim()
                  .toUpperCase(),
            )
            .filter(Boolean)
        : [],
    );

  return assets.filter(
    asset => {
      if (
        asset.assetClass !==
        "us_equity"
      ) {
        return false;
      }

      if (
        asset.status !==
        "active"
      ) {
        return false;
      }

      if (
        requireTradable &&
        asset.tradable !==
          true
      ) {
        return false;
      }

      if (
        asset.exchange &&
        excluded.has(
          asset.exchange
            .toUpperCase(),
        )
      ) {
        return false;
      }

      if (
        included &&
        (
          !asset.exchange ||
          !included.has(
            asset.exchange
              .toUpperCase(),
          )
        )
      ) {
        return false;
      }

      return true;
    },
  );
}

/**
 * ============================================================
 * ALPACA REQUEST
 * ============================================================
 */

async function fetchAlpacaAssets() {
  const {
    key,
    secret,
  } =
    getAlpacaCredentials();

  if (
    !key ||
    !secret
  ) {
    throw new Error(
      "Alpaca API credentials are missing.",
    );
  }

  const url =
    new URL(
      `${getBaseUrl()}/v2/assets`,
    );

  url.searchParams.set(
    "status",
    "active",
  );

  url.searchParams.set(
    "asset_class",
    "us_equity",
  );

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        headers: {
          "APCA-API-KEY-ID":
            key,

          "APCA-API-SECRET-KEY":
            secret,

          Accept:
            "application/json",
        },
      },
    );

  if (!response.ok) {
    const body =
      await response.text();

    throw new Error(
      `Alpaca assets request failed (${response.status}): ${body.slice(
        0,
        500,
      )}`,
    );
  }

  const payload =
    await response.json();

  if (
    !Array.isArray(
      payload,
    )
  ) {
    throw new Error(
      "Alpaca assets response was not an array.",
    );
  }

  return payload;
}

/**
 * ============================================================
 * CACHE
 * ============================================================
 */

function getCachedUniverse({
  cacheTtlMs,
} = {}) {
  if (
    !cachedUniverse
  ) {
    return null;
  }

  if (
    Date.now() -
      cachedUniverse.cachedAt >
    cacheTtlMs
  ) {
    cachedUniverse =
      null;

    return null;
  }

  return clone(
    cachedUniverse.result,
  );
}

function setCachedUniverse(
  result,
) {
  cachedUniverse = {
    cachedAt:
      Date.now(),

    result:
      clone(result),
  };
}

export function clearMarketUniverseCache() {
  cachedUniverse =
    null;
}

export function getMarketUniverseCacheStatus() {
  return {
    cached:
      Boolean(
        cachedUniverse,
      ),

    cachedAt:
      cachedUniverse
        ? new Date(
            cachedUniverse
              .cachedAt,
          )
            .toISOString()
        : null,

    inFlight:
      Boolean(
        inFlightRequest,
      ),
  };
}

/**
 * ============================================================
 * MAIN PROVIDER
 * ============================================================
 */

export async function getMarketUniverse({
  refresh = false,

  cacheTtlMs =
    DEFAULT_CACHE_TTL_MS,

  includeExchanges = null,

  excludeExchanges = [
    "OTC",
  ],

  requireTradable = true,

  maximumSymbols = null,
} = {}) {
  const ttl =
    positiveInteger(
      cacheTtlMs,
      DEFAULT_CACHE_TTL_MS,
    );

  /**
   * ----------------------------------------------------------
   * COMPLETED CACHE
   * ----------------------------------------------------------
   */

  if (
    refresh !== true
  ) {
    const cached =
      getCachedUniverse({
        cacheTtlMs:
          ttl,
      });

    if (cached) {
      return cached;
    }
  }

  /**
   * ----------------------------------------------------------
   * IN-FLIGHT DEDUPLICATION
   * ----------------------------------------------------------
   */

  if (inFlightRequest) {
    try {
      return await inFlightRequest;
    } catch {
      return {
        approved: false,

        provider:
          "MARKET_UNIVERSE",

        status:
          MARKET_UNIVERSE_STATUS
            .PROVIDER_ERROR,

        assets: [],

        symbols: [],

        longEligibleSymbols:
          [],

        shortEligibleSymbols:
          [],

        errors: [
          "Market universe request failed.",
        ],

        warnings: [],

        timestamp:
          nowIso(),
      };
    }
  }

  const buildPromise =
    (async () => {
      const credentials =
        getAlpacaCredentials();

      if (
        !credentials.key ||
        !credentials.secret
      ) {
        return {
          approved: false,

          provider:
            "MARKET_UNIVERSE",

          status:
            MARKET_UNIVERSE_STATUS
              .AUTH_MISSING,

          assets: [],

          symbols: [],

          longEligibleSymbols:
            [],

          shortEligibleSymbols:
            [],

          errors: [
            "ALPACA_API_KEY and ALPACA_SECRET_KEY are required.",
          ],

          warnings: [],

          timestamp:
            nowIso(),
        };
      }

      const rawAssets =
        await fetchAlpacaAssets();

      const normalized =
        rawAssets
          .map(
            normalizeAsset,
          )
          .filter(Boolean);

      let assets =
        filterUniverse({
          assets:
            normalized,

          includeExchanges,

          excludeExchanges,

          requireTradable,
        });

      assets.sort(
        (a, b) =>
          a.symbol
            .localeCompare(
              b.symbol,
            ),
      );

      if (
        Number.isInteger(
          maximumSymbols,
        ) &&
        maximumSymbols > 0
      ) {
        assets =
          assets.slice(
            0,
            maximumSymbols,
          );
      }

      const symbols =
        assets.map(
          asset =>
            asset.symbol,
        );

      const longEligibleSymbols =
        assets
          .filter(
            asset =>
              asset.tradable ===
              true,
          )
          .map(
            asset =>
              asset.symbol,
          );

      const shortEligibleSymbols =
        assets
          .filter(
            asset =>
              asset
                .shortCandidateEligible ===
              true,
          )
          .map(
            asset =>
              asset.symbol,
          );

      const result = {
        approved: true,

        provider:
          "MARKET_UNIVERSE",

        status:
          MARKET_UNIVERSE_STATUS
            .COMPLETE,

        assetCount:
          assets.length,

        assets,

        symbols,

        longEligibleSymbols,

        shortEligibleSymbols,

        errors: [],

        warnings: [],

        timestamp:
          nowIso(),
      };

      setCachedUniverse(
        result,
      );

      return result;
    })();

  inFlightRequest =
    buildPromise;

  try {
    return await buildPromise;
  } catch (error) {
    return {
      approved: false,

      provider:
        "MARKET_UNIVERSE",

      status:
        MARKET_UNIVERSE_STATUS
          .PROVIDER_ERROR,

      assets: [],

      symbols: [],

      longEligibleSymbols:
        [],

      shortEligibleSymbols:
        [],

      errors: [
        safeErrorMessage(
          error,
        ),
      ],

      warnings: [],

      timestamp:
        nowIso(),
    };
  } finally {
    if (
      inFlightRequest ===
      buildPromise
    ) {
      inFlightRequest =
        null;
    }
  }
}

export default
  getMarketUniverse;