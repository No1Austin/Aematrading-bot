/**
 * ============================================================
 * AEMA CRYPTO DISCOVERY CYCLE — PHASE 2.4
 * ============================================================
 */

import {
  getCryptoUniverse,
} from "../universe/cryptoUniverseProvider.js";

import {
  buildCryptoMeasurements,
} from "./cryptoMeasurementProvider.js";

import {
  scanCryptoMarket,
} from "./cryptoScanner.js";

import {
  upsertCryptoCandidate,
  listCryptoCandidates,
  listCryptoCexCandidates,
  listCryptoEmergingCandidates,
  getCryptoCandidateRegistryStats,
} from "./cryptoCandidateRegistry.js";

import {
  CRYPTO_SCANNER_CONFIG,
} from "./cryptoScannerConfig.js";

import {
  buildCryptoDiscoveryIntelligence,
} from "../analysis/cryptoDiscoveryIntelligence.js";

export async function runCryptoDiscoveryCycle({
  refreshUniverse = true,

  maximumUniverseAssets =
    CRYPTO_SCANNER_CONFIG
      .cycle
      .maximumUniverseAssets,

  maximumCandidates =
    CRYPTO_SCANNER_CONFIG
      .discovery
      .maximumCandidates,

  includeDexDiscovery =
    true,
} = {}) {
  const startedAt =
    new Date()
      .toISOString();

  try {
    const universe =
      await getCryptoUniverse({
        refresh:
          refreshUniverse,

        maximumAssets:
          maximumUniverseAssets,

        includeDexDiscovery,
      });

    const measurements =
      buildCryptoMeasurements({
        assets:
          universe.assets,
      });

    const enrichedMeasurements =
      measurements.map(
        measurement => {
          const intelligence =
            buildCryptoDiscoveryIntelligence(
              measurement,
            );

          return {
            ...measurement,

            discoveryIntelligence:
              intelligence,

            integrity: {
              score:
                intelligence
                  ?.projectIntegrity
                  ?.score ??
                null,

              criticalFlags:
                intelligence
                  ?.projectIntegrity
                  ?.criticalFlags ??
                [],
            },
          };
        },
      );

    const scanner =
      await scanCryptoMarket({
        measurements:
          enrichedMeasurements,

        maximumCandidates,
      });

    const selectedCandidates =
      scanner.candidates.map(
        candidate => ({
          ...candidate,

          intelligence:
            candidate
              ?.measurements
              ?.discoveryIntelligence ??
            null,
        }),
      );

    for (
      const candidate
      of selectedCandidates
    ) {
      upsertCryptoCandidate(
        candidate,
      );
    }

    const registryStats =
      getCryptoCandidateRegistryStats();

    return {
      approved:
        scanner.approved,

      status:
        scanner.approved
          ? universe.status
          : "PARTIAL",

      universe: {
        status:
          universe.status,

        assetCount:
          universe.assetCount,

        providers:
          universe.providers,

        composition:
          universe.composition,
      },

      measurements: {
        built:
          measurements.length,

        enriched:
          enrichedMeasurements.length,

        dexMeasured:
          enrichedMeasurements.filter(
            measurement =>
              (
                measurement
                  ?.dexCount ??
                0
              ) > 0,
          ).length,

        cexMeasured:
          enrichedMeasurements.filter(
            measurement =>
              (
                measurement
                  ?.cexCount ??
                0
              ) > 0,
          ).length,
      },

      scanner: {
        scanned:
          scanner.scanned,

        qualified:
          scanner.qualified,

        researchable:
          scanner.researchable,

        highInterest:
          scanner.highInterest,

        selected:
          selectedCandidates.length,

        cexSelected:
          scanner.cexSelected,

        emergingSelected:
          scanner.emergingSelected,

        deepResearchEligible:
          scanner.deepResearchEligible,

        botEligibleNow:
          scanner.botEligibleNow,
      },

      selectedCandidates,

      cexCandidates:
        scanner.cexCandidates,

      emergingCandidates:
        scanner.emergingCandidates,

      deepResearchCandidates:
        scanner.deepResearchCandidates,

      highInterestCandidates:
        scanner.highInterestCandidates,

      registry: {
        stats:
          registryStats,

        all:
          listCryptoCandidates({
            limit:
              maximumCandidates,
          }),

        cex:
          listCryptoCexCandidates({
            limit:
              maximumCandidates,
          }),

        emerging:
          listCryptoEmergingCandidates({
            limit:
              maximumCandidates,
          }),
      },

      warnings:
        universe.warnings,

      errors:
        universe.errors,

      startedAt,

      completedAt:
        new Date()
          .toISOString(),
    };
  } catch (error) {
    return {
      approved:
        false,

      status:
        "ERROR",

      universe: {
        assetCount:
          0,

        providers:
          {},

        composition:
          {},
      },

      measurements: {
        built:
          0,

        enriched:
          0,

        dexMeasured:
          0,

        cexMeasured:
          0,
      },

      scanner: {
        scanned:
          0,

        qualified:
          0,

        researchable:
          0,

        highInterest:
          0,

        selected:
          0,

        cexSelected:
          0,

        emergingSelected:
          0,

        deepResearchEligible:
          0,

        botEligibleNow:
          0,
      },

      selectedCandidates:
        [],

      cexCandidates:
        [],

      emergingCandidates:
        [],

      deepResearchCandidates:
        [],

      highInterestCandidates:
        [],

      registry: {
        stats:
          {},

        all:
          [],

        cex:
          [],

        emerging:
          [],
      },

      warnings:
        [],

      errors: [
        error instanceof Error
          ? error.message
          : String(error),
      ],

      startedAt,

      completedAt:
        new Date()
          .toISOString(),
    };
  }
}

export default
  runCryptoDiscoveryCycle;
