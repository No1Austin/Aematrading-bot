import {
  getMarketUniverse,
} from "../scanner/marketUniverseProvider.js";

import {
  getMarketMovers,
} from "../data/providers/alpacaMarketMoversProvider.js";

/**
 * ============================================================
 * MARKET OVERVIEW SERVICE
 * ============================================================
 *
 * Combines:
 *
 * MarketUniverseProvider
 *        ↓
 * AlpacaMarketMoversProvider
 *
 * This service is research/display only.
 * It has no authority to execute trades.
 */

export const MARKET_OVERVIEW_STATUS =
  Object.freeze({
    COMPLETE:
      "COMPLETE",

    PARTIAL:
      "PARTIAL",

    UNAVAILABLE:
      "UNAVAILABLE",

    ERROR:
      "ERROR",
  });

function positiveInteger(
  value,
  fallback,
) {
  const number =
    Number(value);

  if (
    Number.isFinite(number) &&
    number > 0
  ) {
    return Math.floor(
      number,
    );
  }

  return fallback;
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

/**
 * Attach Alpaca universe metadata to each mover.
 *
 * This is useful particularly for losers because the UI can
 * show whether a security is actually eligible to be
 * considered as a short candidate.
 */
function enrichMovers(
  movers,
  assetMap,
) {
  if (
    !Array.isArray(
      movers,
    )
  ) {
    return [];
  }

  return movers.map(
    mover => {
      const asset =
        assetMap.get(
          mover.symbol,
        );

      return {
        ...mover,

        name:
          asset?.name ??
          null,

        exchange:
          asset?.exchange ??
          null,

        tradable:
          asset?.tradable ===
          true,

        marginable:
          asset?.marginable ===
          true,

        shortable:
          asset?.shortable ===
          true,

        borrowStatus:
          asset?.borrowStatus ??
          null,

        shortCandidateEligible:
          asset
            ?.shortCandidateEligible ===
          true,
      };
    },
  );
}

export async function getMarketOverview({
  limit = 10,

  refreshUniverse =
    false,

  feed =
    "iex",
} = {}) {
  const startedAt =
    new Date()
      .toISOString();

  try {
    /**
     * ======================================================
     * 1. LOAD REAL ALPACA UNIVERSE
     * ======================================================
     */

    const universe =
      await getMarketUniverse({
        refresh:
          refreshUniverse ===
          true,
      });

    if (
      universe?.approved !==
        true ||
      !Array.isArray(
        universe?.symbols,
      ) ||
      universe.symbols.length ===
        0
    ) {
      return {
        approved:
          false,

        service:
          "MARKET_OVERVIEW",

        status:
          MARKET_OVERVIEW_STATUS
            .UNAVAILABLE,

        universe: {
          status:
            universe?.status ??
            "UNAVAILABLE",

          assetCount:
            universe?.assetCount ??
            0,
        },

        gainers: [],

        losers: [],

        warnings:
          Array.isArray(
            universe?.warnings,
          )
            ? universe.warnings
            : [],

        errors:
          Array.isArray(
            universe?.errors,
          ) &&
          universe.errors.length >
            0
            ? universe.errors
            : [
                "Market universe is unavailable.",
              ],

        startedAt,

        completedAt:
          new Date()
            .toISOString(),
      };
    }

    /**
     * ======================================================
     * 2. LOAD SNAPSHOTS + CALCULATE MOVERS
     * ======================================================
     */

    const movers =
  await getMarketMovers({
    symbols:
      universe.symbols,

    assets:
      universe.assets,

    limit:
      positiveInteger(
        limit,
        10,
      ),

    feed,
  });

    const assetMap =
      new Map(
        universe.assets.map(
          asset => [
            asset.symbol,
            asset,
          ],
        ),
      );

    const gainers =
      enrichMovers(
        movers?.gainers,
        assetMap,
      );

    const losers =
      enrichMovers(
        movers?.losers,
        assetMap,
      );

    const approved =
      movers?.approved ===
      true;

    return {
      approved,

      service:
        "MARKET_OVERVIEW",

      status:
        approved
          ? MARKET_OVERVIEW_STATUS
              .COMPLETE
          : MARKET_OVERVIEW_STATUS
              .PARTIAL,

      feed,

      universe: {
        status:
          universe.status,

        assetCount:
          universe.assetCount,

        longEligibleCount:
          Array.isArray(
            universe
              .longEligibleSymbols,
          )
            ? universe
                .longEligibleSymbols
                .length
            : 0,

        shortEligibleCount:
          Array.isArray(
            universe
              .shortEligibleSymbols,
          )
            ? universe
                .shortEligibleSymbols
                .length
            : 0,
      },

      movers: {
        usableCount:
          movers?.usableCount ??
          0,

        universeSize:
          movers?.universeSize ??
          universe.symbols.length,
      },

      gainers,

      losers,

      warnings:
        Array.isArray(
          movers?.warnings,
        )
          ? movers.warnings
          : [],

      errors:
        Array.isArray(
          movers?.errors,
        )
          ? movers.errors
          : [],

      startedAt,

      completedAt:
        new Date()
          .toISOString(),
    };
  } catch (
    error
  ) {
    return {
      approved:
        false,

      service:
        "MARKET_OVERVIEW",

      status:
        MARKET_OVERVIEW_STATUS
          .ERROR,

      gainers: [],

      losers: [],

      warnings: [],

      errors: [
        safeErrorMessage(
          error,
        ),
      ],

      startedAt,

      completedAt:
        new Date()
          .toISOString(),
    };
  }
}

export default
  getMarketOverview;