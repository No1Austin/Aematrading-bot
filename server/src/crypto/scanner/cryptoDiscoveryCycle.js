/**
 * ============================================================
 * AEMA CRYPTO DISCOVERY CYCLE — PHASE 2.4 / EXECUTABLE WIRING
 * ============================================================
 *
 * Discovery remains responsible for universe -> measurements -> scanner.
 *
 * IMPORTANT:
 * - this module does NOT manufacture execution/risk evidence
 * - executable evidence is supplied by direct contexts or providers
 * - missing evidence remains missing and downstream gates fail closed
 * - no paper/live execution authority is granted here
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

  includeDexDiscovery = true,

  /**
   * Final-revalidation refresh authority.
   * If absent, final revalidation remains fail-closed.
   */
  refreshCandidateAsset = null,

  /**
   * Existing paper-runtime authorities.
   * These are only forwarded. This discovery cycle never grants authority.
   */
  paperLedger = null,
  paperRuntime = null,
  runtimeSupervisor = null,
  paperExecutionGateOptions = {},

  /**
   * Executable opportunity configuration.
   * Existing callers may supply the complete coordinator contract here.
   */
  executableOpportunityOptions = {},

  /**
   * Direct executable evidence.
   * Providers are preferred when evidence is symbol-specific/fresh.
   */
  executableMarket = {},
  executableAccount = {},
  executableExecutionContext = {},
  executableEntryRiskContext = {},

  /**
   * Per-candidate evidence providers.
   *
   * Their names intentionally match the coordinator contract:
   * marketProvider
   * accountProvider
   * executionContextProvider
   * entryRiskContextProvider
   */
  executableMarketProvider = null,
  executableAccountProvider = null,
  executableExecutionContextProvider = null,
  executableEntryRiskContextProvider = null,
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

        refreshCandidateAsset,

        paperLedger,
        paperRuntime,
        runtimeSupervisor,
        paperExecutionGateOptions,

        executableOpportunityOptions,

        executableMarket,
        executableAccount,
        executableExecutionContext,
        executableEntryRiskContext,

        executableMarketProvider,
        executableAccountProvider,
        executableExecutionContextProvider,
        executableEntryRiskContextProvider,
      });

    const selectedCandidates =
      (
        Array.isArray(
          scanner?.candidates,
        )
          ? scanner.candidates
          : []
      ).map(
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

        executableOpportunityCoordination:
          scanner
            ?.executableOpportunityCoordination ??
          null,

        paperExecutionAuthorityGate:
          scanner
            ?.paperExecutionAuthorityGate ??
          null,
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

      /**
       * Preserve the post-revalidation/executable diagnostics so the
       * continuous runtime can show exactly why a trade did/did not progress.
       */
      finalRevalidatedCandidates:
        scanner
          ?.finalRevalidatedCandidates ??
        [],

      executableOpportunityEvaluations:
        scanner
          ?.executableOpportunityEvaluations ??
        [],

      executableSelectedOpportunities:
        scanner
          ?.executableSelectedOpportunities ??
        [],

      executableSelectedCandidates:
        scanner
          ?.executableSelectedCandidates ??
        [],

      paperExecutionEvaluations:
        scanner
          ?.paperExecutionEvaluations ??
        [],

      paperAuthorizedCandidates:
        scanner
          ?.paperAuthorizedCandidates ??
        [],

      paperBlockedCandidates:
        scanner
          ?.paperBlockedCandidates ??
        [],

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

      evidenceWiring: {
        refreshCandidateAssetConfigured:
          typeof refreshCandidateAsset ===
          "function",

        marketProviderConfigured:
          typeof executableMarketProvider ===
          "function",

        accountProviderConfigured:
          typeof executableAccountProvider ===
          "function",

        executionContextProviderConfigured:
          typeof executableExecutionContextProvider ===
          "function",

        entryRiskContextProviderConfigured:
          typeof executableEntryRiskContextProvider ===
          "function",

        paperRuntimeAuthoritiesConfigured:
          Boolean(
            paperLedger &&
            paperRuntime &&
            runtimeSupervisor,
          ),

        failClosed:
          true,

        syntheticEvidence:
          false,
      },

      executionAuthority:
        false,

      liveExecution:
        false,

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

      finalRevalidatedCandidates:
        [],

      executableOpportunityEvaluations:
        [],

      executableSelectedOpportunities:
        [],

      executableSelectedCandidates:
        [],

      paperExecutionEvaluations:
        [],

      paperAuthorizedCandidates:
        [],

      paperBlockedCandidates:
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

      evidenceWiring: {
        failClosed:
          true,

        syntheticEvidence:
          false,
      },

      executionAuthority:
        false,

      liveExecution:
        false,

      startedAt,

      completedAt:
        new Date()
          .toISOString(),
    };
  }
}

export default
  runCryptoDiscoveryCycle;
