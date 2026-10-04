/**
 * AEMA CRYPTO — RESEARCH ROUTES
 * Phase 2.0
 *
 * Public research API.
 *
 * Includes:
 * - Exchange intelligence
 * - Emerging DEX discovery/research
 * - Individual Emerging DEX asset lookup
 * - Solana on-chain research
 *
 * IMPORTANT:
 * - Research only
 * - No execution authority
 * - Helius/on-chain analysis stays server-side
 */

import express from "express";

import {
  getCryptoExchangeIntelligence,
} from "../research/cryptoExchangeIntelligenceService.js";

import {
  discoverDexAssets,
} from "../discovery/cryptoDexDiscoveryService.js";

import {
  runEmergingDexEngine,
} from "../engines/emergingDexEngine.js";

import {
  runSolanaOnChainResearch,
} from "../engines/solanaCombinedOnChainResearchEngine.js";

const router = express.Router();

/**
 * ============================================================
 * HELPERS
 * ============================================================
 */

function assetFromRequest(req) {
  const body = req.body ?? {};
  const query = req.query ?? {};

  return {
    symbol:
      body.symbol ??
      body.query ??
      query.symbol ??
      query.query,

    name:
      body.name ??
      query.name ??
      null,

    assetId:
      body.assetId ??
      query.assetId ??
      null,

    chainId:
      body.chainId ??
      body.network ??
      query.chainId ??
      query.network ??
      null,

    address:
      body.address ??
      body.tokenAddress ??
      query.address ??
      query.tokenAddress ??
      null,
  };
}

function normalizeNetwork(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/**
 * IMPORTANT:
 *
 * EVM addresses are case-insensitive for our matching purposes.
 * Solana addresses are case-sensitive and MUST NOT be lowercased.
 */
function normalizeAddress(value, network) {
  const address = String(value ?? "").trim();

  if (!address) {
    return "";
  }

  const normalizedNetwork =
    normalizeNetwork(network);

  if (
    normalizedNetwork === "eth" ||
    normalizedNetwork === "ethereum" ||
    normalizedNetwork === "base" ||
    normalizedNetwork === "bsc" ||
    normalizedNetwork === "binance-smart-chain" ||
    normalizedNetwork === "arbitrum"
  ) {
    return address.toLowerCase();
  }

  return address;
}

function networkOf(asset) {
  return normalizeNetwork(
    asset?.network ??
    asset?.chain ??
    asset?.chainId
  );
}

function contractOf(asset) {
  return (
    asset?.contractAddress ??
    asset?.address ??
    asset?.tokenAddress ??
    asset?.mint ??
    null
  );
}

function sameContract(
  asset,
  network,
  contract
) {
  const assetNetwork =
    networkOf(asset);

  const requestedNetwork =
    normalizeNetwork(network);

  if (
    assetNetwork !== requestedNetwork
  ) {
    return false;
  }

  const assetContract =
    normalizeAddress(
      contractOf(asset),
      assetNetwork
    );

  const requestedContract =
    normalizeAddress(
      contract,
      requestedNetwork
    );

  return (
    Boolean(assetContract) &&
    Boolean(requestedContract) &&
    assetContract === requestedContract
  );
}

function extractDiscoveredAssets(
  discovery
) {
  if (Array.isArray(discovery)) {
    return discovery;
  }

  const candidates = [
    discovery?.assets,
    discovery?.qualifiedAssets,
    discovery?.results,
    discovery?.candidates,
  ];

  return (
    candidates.find(Array.isArray) ??
    []
  );
}

function emergingCandidates(
  result
) {
  if (!result) {
    return [];
  }

  if (Array.isArray(result)) {
    return result;
  }

  const candidates = [
    result?.candidates,
    result?.researchReady,
    result?.topCandidates,
    result?.results,
    result?.assets,
  ];

  return (
    candidates.find(Array.isArray) ??
    []
  );
}

async function buildEmergingDexResearch() {
  const discovery =
    await discoverDexAssets();

  const assets =
    extractDiscoveredAssets(
      discovery
    );

  const emerging =
    runEmergingDexEngine(
      assets
    );

  return {
    discovery,
    assets,
    emerging,
  };
}

function publicDiscoverySummary(
  discovery,
  assets
) {
  return {
    status:
      discovery?.status ??
      "UNKNOWN",

    provider:
      discovery?.provider ??
      discovery?.providers ??
      null,

    discovered:
      discovery?.discoveredCount ??
      discovery?.assetCount ??
      assets.length,

    measured:
      discovery?.measuredCount ??
      null,

    qualified:
      discovery?.qualifiedCount ??
      (
        Array.isArray(
          discovery?.qualifiedAssets
        )
          ? discovery
              .qualifiedAssets
              .length
          : null
      ),

    errors:
      Array.isArray(
        discovery?.errors
      )
        ? discovery.errors
        : [],
  };
}

/**
 * ============================================================
 * EXCHANGE INTELLIGENCE
 * ============================================================
 */

router.get(
  "/exchange-intelligence",
  async (req, res) => {
    try {
      const result =
        await getCryptoExchangeIntelligence(
          assetFromRequest(req)
        );

      return res
        .status(
          result.approved
            ? 200
            : 422
        )
        .json(result);

    } catch (error) {
      return res
        .status(500)
        .json({
          approved: false,
          status: "FAILED",

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
    }
  }
);

router.post(
  "/exchange-intelligence",
  async (req, res) => {
    try {
      const result =
        await getCryptoExchangeIntelligence(
          assetFromRequest(req),
          {
            arbitrage:
              req.body
                ?.arbitrage ??
              {},
          }
        );

      return res
        .status(
          result.approved
            ? 200
            : 422
        )
        .json(result);

    } catch (error) {
      return res
        .status(500)
        .json({
          approved: false,
          status: "FAILED",

          error:
            error instanceof Error
              ? error.message
              : String(error),
        });
    }
  }
);

/**
 * ============================================================
 * EMERGING DEX — LIST
 * ============================================================
 *
 * GET
 * /api/crypto/research/emerging-dex
 *
 * Runs:
 *
 * DEX discovery
 *      ↓
 * Emerging DEX Engine
 *      ↓
 * ranked research candidates
 *
 * Does NOT run Helius for every asset.
 */

router.get(
  "/emerging-dex",
  async (req, res) => {
    try {
      const {
        discovery,
        assets,
        emerging,
      } =
        await buildEmergingDexResearch();

      return res
        .status(200)
        .json({
          approved: true,

          status:
            emerging?.status ??
            "COMPLETE",

          engine:
            emerging?.engine ??
            "EMERGING_DEX_ENGINE",

          version:
            emerging?.version ??
            null,

          summary: {
            discovery:
              publicDiscoverySummary(
                discovery,
                assets
              ),

            inputCount:
              emerging?.inputCount ??
              assets.length,

            candidateCount:
              emerging
                ?.candidateCount ??
              emergingCandidates(
                emerging
              ).length,

            researchReadyCount:
              emerging
                ?.researchReadyCount ??
              (
                Array.isArray(
                  emerging
                    ?.researchReady
                )
                  ? emerging
                      .researchReady
                      .length
                  : null
              ),

            topCandidateCount:
              emerging
                ?.topCandidateCount ??
              (
                Array.isArray(
                  emerging
                    ?.topCandidates
                )
                  ? emerging
                      .topCandidates
                      .length
                  : null
              ),

            directionCounts:
              emerging
                ?.directionCounts ??
              null,
          },

          /**
           * Complete candidate list.
           *
           * Useful for frontend filters,
           * sorting and chain-specific views.
           */
          candidates:
            emerging
              ?.candidates ??
            [],

          /**
           * Candidates satisfying the
           * research-ready thresholds.
           */
          researchReady:
            emerging
              ?.researchReady ??
            [],

          /**
           * Highest-ranked candidates.
           */
          topCandidates:
            emerging
              ?.topCandidates ??
            [],

          rejectedCount:
            emerging
              ?.rejectedCount ??
            null,

          limitations:
            emerging
              ?.limitations ??
            [],

          researchOnly: true,

          executionAuthority:
            false,

          liveExecution:
            false,

          generatedAt:
            emerging
              ?.generatedAt ??
            new Date()
              .toISOString(),
        });

    } catch (error) {
      console.error(
        "[EMERGING_DEX_ROUTE_FAILED]",
        error
      );

      return res
        .status(500)
        .json({
          approved: false,
          status: "FAILED",

          error:
            error instanceof Error
              ? error.message
              : String(error),

          researchOnly: true,
          executionAuthority: false,
        });
    }
  }
);

/**
 * ============================================================
 * EMERGING DEX — SINGLE ASSET
 * ============================================================
 *
 * GET
 * /api/crypto/research/emerging-dex/:network/:contract
 *
 * Returns market research only.
 *
 * Does NOT invoke Helius.
 */

router.get(
  "/emerging-dex/:network/:contract",
  async (req, res) => {
    try {
      const network =
        normalizeNetwork(
          req.params.network
        );

      const contract =
        String(
          req.params.contract ??
          ""
        ).trim();

      if (
        !network ||
        !contract
      ) {
        return res
          .status(400)
          .json({
            approved: false,
            status:
              "INVALID_REQUEST",
            error:
              "network and contract are required.",
          });
      }

      const {
        discovery,
        assets,
        emerging,
      } =
        await buildEmergingDexResearch();

      const candidates =
        emergingCandidates(
          emerging
        );

      const asset =
        candidates.find(
          candidate =>
            sameContract(
              candidate,
              network,
              contract
            )
        );

      if (!asset) {
        return res
          .status(404)
          .json({
            approved: false,

            status:
              "EMERGING_DEX_ASSET_NOT_FOUND",

            network,
            contract,

            discovery:
              publicDiscoverySummary(
                discovery,
                assets
              ),

            researchOnly: true,
            executionAuthority:
              false,
          });
      }

      return res
        .status(200)
        .json({
          approved: true,

          status: "COMPLETE",

          asset,

          researchOnly: true,

          executionAuthority:
            false,

          generatedAt:
            new Date()
              .toISOString(),
        });

    } catch (error) {
      console.error(
        "[EMERGING_DEX_ASSET_ROUTE_FAILED]",
        error
      );

      return res
        .status(500)
        .json({
          approved: false,
          status: "FAILED",

          error:
            error instanceof Error
              ? error.message
              : String(error),

          researchOnly: true,
          executionAuthority:
            false,
        });
    }
  }
);

/**
 * ============================================================
 * SOLANA ON-CHAIN RESEARCH
 * ============================================================
 *
 * GET
 * /api/crypto/research/emerging-dex/solana/:contract/onchain
 *
 * IMPORTANT:
 * This is deliberately a separate request because it performs
 * more expensive RPC/on-chain research.
 */

router.get(
  "/emerging-dex/solana/:contract/onchain",
  async (req, res) => {
    try {
      const contract =
        String(
          req.params.contract ??
          ""
        ).trim();

      if (!contract) {
        return res
          .status(400)
          .json({
            approved: false,
            status:
              "INVALID_REQUEST",
            error:
              "Solana contract address is required.",
          });
      }

      /**
       * Find the asset from fresh
       * Emerging DEX research first.
       *
       * This means we don't accept arbitrary
       * browser-supplied market metrics.
       */
      const {
        emerging,
      } =
        await buildEmergingDexResearch();

      const candidates =
        emergingCandidates(
          emerging
        );

      const asset =
        candidates.find(
          candidate =>
            sameContract(
              candidate,
              "solana",
              contract
            )
        );

      if (!asset) {
        return res
          .status(404)
          .json({
            approved: false,

            status:
              "SOLANA_EMERGING_ASSET_NOT_FOUND",

            network:
              "solana",

            contract,

            researchOnly:
              true,

            executionAuthority:
              false,
          });
      }

      const result =
        await runSolanaOnChainResearch({
          asset: {
            ...asset,

            network:
              "solana",

            contractAddress:
              contractOf(
                asset
              ),

            /**
             * Current combined engine expects
             * emergingScore at the top level.
             */
            emergingScore:
              asset
                ?.emergingDex
                ?.score ??
              null,
          },

          holderLimit: 5,

          signaturesPerAddress:
            8,

          maxTransactions:
            12,
        });

      return res
        .status(200)
        .json({
          approved: true,

          status:
            result?.status ??
            "COMPLETE",

          asset,

          onChain:
            result,

          researchOnly:
            true,

          executionAuthority:
            false,

          generatedAt:
            new Date()
              .toISOString(),
        });

    } catch (error) {
      console.error(
        "[SOLANA_ONCHAIN_ROUTE_FAILED]",
        error
      );

      return res
        .status(500)
        .json({
          approved: false,

          status: "FAILED",

          error:
            error instanceof Error
              ? error.message
              : String(error),

          researchOnly: true,

          executionAuthority:
            false,
        });
    }
  }
);

export default router;