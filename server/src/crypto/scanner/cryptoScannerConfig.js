/**
 * ============================================================
 * AEMA CRYPTO SCANNER CONFIG — PHASE 2.1 FIXED
 * ============================================================
 *
 * IMPORTANT
 * ---------
 * This file preserves all Phase-1 / Phase-2 scoring configuration
 * required by cryptoCandidateQualificationEngine.js while adding
 * Phase-2.1 DEX universe reservation and emerging-candidate policy.
 *
 * Market age remains informational only.
 */

export const CRYPTO_DIRECTION =
  Object.freeze({
    LONG:
      "LONG",

    SHORT:
      "SHORT",

    NEUTRAL:
      "NEUTRAL",
  });

export const CRYPTO_DISCOVERY_STATUS =
  Object.freeze({
    REJECTED:
      "REJECTED",

    RESEARCHABLE:
      "RESEARCHABLE",

    HIGH_INTEREST:
      "HIGH_INTEREST",
  });

export const CRYPTO_SCANNER_CONFIG =
  Object.freeze({
    /* ========================================================
       01. HARD ELIGIBILITY
       ======================================================== */

    hardEligibility: {
      requireTradable:
        true,

      minimumPriceUsd:
        0.00000001,

      minimum24hVolumeUsd:
        50_000,

      minimumLiquidityUsd:
        25_000,

      maximumSpreadPercent:
        3.0,

      requireVenue:
        true,

      /*
       * No minimum market-age rejection.
       */
      minimumMarketAgeMs:
        null,

      /*
       * Critical integrity/security evidence may hard reject.
       */
      rejectCriticalIntegrityFlags:
        true,
    },

    /* ========================================================
       02. DISCOVERY / TOP 20
       ======================================================== */

    discovery: {
      minimumHighInterestScore:
        75,

      minimumDirectionEdge:
        8,

      maximumCandidates:
        20,

      /*
       * Allows eligible emerging DEX projects to receive
       * representation in the final research pool without
       * altering their actual scanner scores.
       */
      candidateComposition: {
        maximumEmergingCandidates:
          5,

        minimumEmergingIntelligenceScore:
          45,

        requireDexForEmergingSlot:
          true,
      },
    },

    /* ========================================================
       03. UNIVERSE COMPOSITION
       ======================================================== */

    universe: {
      /*
       * Reserve scan capacity for DEX-discovered projects
       * BEFORE mature CEX assets consume the universe limit.
       */
      minimumDexReservedAssets:
        100,

      maximumDexReservedAssets:
        250,
    },

    /* ========================================================
       04. DISCOVERY SCORE WEIGHTS
       ======================================================== */

    weights: {
      liquidity:
        15,

      volume:
        15,

      momentum:
        20,

      volatility:
        10,

      trend:
        15,

      venueQuality:
        10,

      emergingActivity:
        10,

      regime:
        5,
    },

    /* ========================================================
       05. VOLUME SCORING BENCHMARKS
       ======================================================== */

    volume: {
      interestingUsd:
        250_000,

      strongUsd:
        2_000_000,

      exceptionalUsd:
        20_000_000,
    },

    /* ========================================================
       06. LIQUIDITY SCORING BENCHMARKS
       ======================================================== */

    liquidity: {
      interestingUsd:
        100_000,

      strongUsd:
        1_000_000,

      exceptionalUsd:
        10_000_000,
    },

    /* ========================================================
       07. MOMENTUM BENCHMARKS
       ======================================================== */

    momentum: {
      oneHourStrongPercent:
        3,

      fourHourStrongPercent:
        7,

      twentyFourHourStrongPercent:
        12,
    },

    /* ========================================================
       08. VENUE QUALITY
       ======================================================== */

    venueQuality: {
      healthyCexCount:
        2,

      healthyDexCount:
        2,

      healthyVenueCount:
        3,
    },

    /* ========================================================
       09. EMERGING ACTIVITY
       ======================================================== */

    emerging: {
      volumeToLiquidityInteresting:
        1.0,

      volumeToLiquidityStrong:
        3.0,

      /*
       * Informational only.
       * New-pair age does not determine eligibility.
       */
      newPairHours:
        72,
    },

    /* ========================================================
       10. CONTINUOUS SCANNER
       ======================================================== */

    cycle: {
      intervalMs:
        60_000,

      runImmediately:
        true,

      maximumUniverseAssets:
        1000,
    },
  });

export default
  CRYPTO_SCANNER_CONFIG;
