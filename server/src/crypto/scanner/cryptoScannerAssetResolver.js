/**
 * ============================================================
 * AEMA CRYPTO
 * SCANNER ASSET RESOLVER
 * Phase 5.34
 * ============================================================
 *
 * Resolves a user scanner query into an existing AEMA crypto
 * asset/candidate.
 *
 * Resolution order:
 *
 * 1. Candidate registry
 * 2. Cached / normal crypto universe
 * 3. Explicit unavailable / not-found result
 *
 * Supports:
 *
 * - symbol
 * - assetId
 * - contract address
 * - network + contract address
 *
 * IMPORTANT:
 *
 * - Uses existing AEMA providers.
 * - Does not fabricate market data.
 * - Does not create execution authority.
 * - Does not place trades.
 */

import {
  getCryptoCandidate,
  listCryptoCandidates,
} from "./cryptoCandidateRegistry.js";

import {
  getCryptoUniverse,
} from "../universe/cryptoUniverseProvider.js";


/**
 * ============================================================
 * NORMALIZATION
 * ============================================================
 */

function normalizeText(
  value,
) {
  return String(
    value ??
    "",
  )
    .trim();
}


function normalizeLower(
  value,
) {
  return normalizeText(
    value,
  ).toLowerCase();
}


function normalizeSymbol(
  value,
) {
  return normalizeText(
    value,
  ).toUpperCase();
}


/**
 * ============================================================
 * QUERY NORMALIZATION
 * ============================================================
 */

function normalizeQuery(
  input = {},
) {
  if (
    typeof input ===
    "string"
  ) {
    return {
      query:
        normalizeText(
          input,
        ),

      symbol:
        normalizeSymbol(
          input,
        ),

      assetId:
        normalizeLower(
          input,
        ),

      contractAddress:
        normalizeLower(
          input,
        ),

      network:
        null,
    };
  }


  const query =
    normalizeText(
      input?.query ??
      input?.symbol ??
      input?.assetId ??
      input?.contractAddress,
    );


  return {
    query,

    symbol:
      normalizeSymbol(
        input?.symbol ??
        query,
      ),

    assetId:
      normalizeLower(
        input?.assetId ??
        query,
      ),

    contractAddress:
      normalizeLower(
        input?.contractAddress ??
        query,
      ),

    network:
      normalizeLower(
        input?.network,
      ) ||
      null,
  };
}


/**
 * ============================================================
 * MATCH HELPERS
 * ============================================================
 */

function symbolMatches(
  asset,
  query,
) {
  if (!query?.symbol) {
    return false;
  }


  return (
    normalizeSymbol(
      asset?.symbol,
    ) ===
    query.symbol
  );
}


function assetIdMatches(
  asset,
  query,
) {
  if (!query?.assetId) {
    return false;
  }


  return (
    normalizeLower(
      asset?.assetId,
    ) ===
    query.assetId
  );
}


function contractMatches(
  asset,
  query,
) {
  if (
    !query
      ?.contractAddress
  ) {
    return false;
  }


  const addressMatches =
    normalizeLower(
      asset
        ?.contractAddress,
    ) ===
    query.contractAddress;


  if (!addressMatches) {
    return false;
  }


  if (!query?.network) {
    return true;
  }


  return (
    normalizeLower(
      asset?.network,
    ) ===
    query.network
  );
}


function matchesAsset(
  asset,
  query,
) {
  if (!asset) {
    return false;
  }


  return (
    assetIdMatches(
      asset,
      query,
    ) ||
    contractMatches(
      asset,
      query,
    ) ||
    symbolMatches(
      asset,
      query,
    )
  );
}


/**
 * ============================================================
 * MATCH QUALITY
 * ============================================================
 *
 * Contract + network is strongest.
 * Asset ID is next.
 * Symbol is fallback.
 */

function getMatchQuality(
  asset,
  query,
) {
  if (
    contractMatches(
      asset,
      query,
    )
  ) {
    return query?.network
      ? 300
      : 250;
  }


  if (
    assetIdMatches(
      asset,
      query,
    )
  ) {
    return 200;
  }


  if (
    symbolMatches(
      asset,
      query,
    )
  ) {
    return 100;
  }


  return 0;
}


/**
 * ============================================================
 * ASSET QUALITY
 * ============================================================
 *
 * Used only to break ties when multiple assets share a symbol.
 */

function getAssetQuality(
  asset,
) {
  const volume =
    Number(
      asset?.volume24hUsd,
    ) ||
    0;


  const liquidity =
    Number(
      asset
        ?.venues
        ?.dexLiquidityUsd,
    ) ||
    0;


  const venueCount =
    Number(
      asset
        ?.venues
        ?.venueCount,
    ) ||
    0;


  const tradableBonus =
    asset?.tradable ===
    true
      ? 25
      : 0;


  return (
    Math.log10(
      1 +
      Math.max(
        volume,
        0,
      ),
    ) *
      10 +

    Math.log10(
      1 +
      Math.max(
        liquidity,
        0,
      ),
    ) *
      8 +

    venueCount *
      5 +

    tradableBonus
  );
}


/**
 * ============================================================
 * FIND BEST MATCH
 * ============================================================
 */

function findBestMatch(
  assets,
  query,
) {
  const rows =
    Array.isArray(
      assets,
    )
      ? assets
      : [];


  const matches =
    rows
      .filter(
        asset =>
          matchesAsset(
            asset,
            query,
          ),
      )
      .map(
        asset => ({
          asset,

          matchQuality:
            getMatchQuality(
              asset,
              query,
            ),

          assetQuality:
            getAssetQuality(
              asset,
            ),
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.matchQuality -
            a.matchQuality ||
          b.assetQuality -
            a.assetQuality,
      );


  return (
    matches[0]
      ?.asset ??
    null
  );
}


/**
 * ============================================================
 * REGISTRY LOOKUP
 * ============================================================
 */

function resolveFromRegistry(
  query,
) {
  /*
   * Direct registry lookup is cheap.
   */

  const directKeys =
    [
      query?.assetId,
      query?.symbol,
      query?.query,
    ]
      .filter(Boolean);


  for (
    const key
    of directKeys
  ) {
    const candidate =
      getCryptoCandidate(
        key,
      );


    if (
      candidate &&
      matchesAsset(
        candidate,
        query,
      )
    ) {
      return candidate;
    }
  }


  /*
   * Candidate registry is intentionally small.
   *
   * Search it for contract-address matches as well.
   */

  const candidates =
    listCryptoCandidates({
      limit:
        1000,
    });


  return findBestMatch(
    candidates,
    query,
  );
}


/**
 * ============================================================
 * UNIVERSE LOOKUP
 * ============================================================
 */

async function resolveFromUniverse(
  query,
  {
    refresh = false,
    maximumAssets = 1000,
  } = {},
) {
  const universe =
    await getCryptoUniverse({
      refresh,
      maximumAssets,
    });


  const asset =
    findBestMatch(
      universe?.assets,
      query,
    );


  return {
    asset,

    universe,
  };
}


/**
 * ============================================================
 * PUBLIC RESOLVER
 * ============================================================
 */

export async function resolveCryptoScannerAsset(
  input = {},
) {
  const query =
    normalizeQuery(
      input,
    );


  if (!query.query) {
    return {
      approved:
        false,

      status:
        "CRYPTO_SCANNER_ASSET_QUERY_REQUIRED",

      asset:
        null,

      source:
        null,

      query,

      warnings: [
        "CRYPTO_ASSET_QUERY_REQUIRED",
      ],

      errors: [],

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ----------------------------------------------------------
   * 1. CANDIDATE REGISTRY
   * ----------------------------------------------------------
   */

  const registryAsset =
    resolveFromRegistry(
      query,
    );


  if (registryAsset) {
    return {
      approved:
        true,

      status:
        "CRYPTO_SCANNER_ASSET_RESOLVED",

      asset:
        registryAsset,

      source:
        "CANDIDATE_REGISTRY",

      query,

      refreshed:
        false,

      executionAuthority:
        false,

      liveExecution:
        false,
    };
  }


  /**
   * ----------------------------------------------------------
   * 2. EXISTING / CACHED UNIVERSE
   * ----------------------------------------------------------
   */

  let cachedResult =
    null;


  try {
    cachedResult =
      await resolveFromUniverse(
        query,
        {
          refresh:
            false,
        },
      );


    if (
      cachedResult?.asset
    ) {
      return {
        approved:
          true,

        status:
          "CRYPTO_SCANNER_ASSET_RESOLVED",

        asset:
          cachedResult.asset,

        source:
          "CRYPTO_UNIVERSE",

        query,

        universeStatus:
          cachedResult
            ?.universe
            ?.status ??
          null,

        refreshed:
          false,

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }
  } catch (error) {
    /*
     * Do not stop here.
     *
     * A refresh may still recover the asset.
     */
  }


  /**
   * ----------------------------------------------------------
   * 3. ASSET NOT FOUND / UNIVERSE UNAVAILABLE
   * ----------------------------------------------------------
   *
   * Do not force-refresh the complete crypto universe from an
   * interactive scanner request.
   *
   * getCryptoUniverse({ refresh: false }) can populate the normal
   * universe cache when needed. A second forced refresh duplicates
   * bulk provider traffic and can trigger CoinGecko / GeckoTerminal
   * rate limits.
   *
   * Background discovery/runtime services are responsible for
   * refreshing and warming the universe.
   */

  const universe =
    cachedResult?.universe ??
    null;

  const universeErrors =
    Array.isArray(
      universe?.errors,
    )
      ? universe.errors
      : [];

  const universeWarnings =
    Array.isArray(
      universe?.warnings,
    )
      ? universe.warnings
      : [];

  const universeUnavailable =
    universe?.approved ===
      false ||
    universe?.status ===
      "ERROR";

  return {
    approved:
      false,

    status:
      universeUnavailable
        ? "CRYPTO_SCANNER_UNIVERSE_UNAVAILABLE"
        : "CRYPTO_SCANNER_ASSET_NOT_FOUND",

    asset:
      null,

    source:
      universe
        ? "CRYPTO_UNIVERSE"
        : null,

    query,

    universeStatus:
      universe?.status ??
      null,

    refreshed:
      false,

    warnings: [
      ...universeWarnings,

      universeUnavailable
        ? "CRYPTO_UNIVERSE_UNAVAILABLE"
        : "CRYPTO_ASSET_NOT_FOUND",
    ],

    errors:
      universeErrors,

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}


export default
  resolveCryptoScannerAsset;