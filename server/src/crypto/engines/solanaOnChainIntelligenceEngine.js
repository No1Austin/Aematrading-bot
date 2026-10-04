/**
 * AEMA CRYPTO — SOLANA ON-CHAIN INTELLIGENCE ENGINE
 *
 * First-stage whale/holder intelligence for Emerging DEX.
 *
 * IMPORTANT:
 * - LARGE_FLOW / LARGE_HOLDER is observable size, not "smart money".
 * - SMART_WALLET remains unavailable until wallet history/performance is measured.
 * - Holder concentration is only treated as definitive when the holder snapshot
 *   is complete. Partial snapshots remain explicitly partial.
 * - No fake neutral scores for unavailable evidence.
 */

import {
  getTokenHolderSnapshot,
} from "../data/providers/heliusSolanaProvider.js";

const VERSION = "1.0.0";

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
}

function sumTop(holders, count) {
  return holders.slice(0, count).reduce((sum, row) => sum + (num(row.amountRaw) ?? 0), 0);
}

function concentrationFromObserved(snapshot) {
  const total = num(snapshot?.observedAmountRaw);
  const holders = Array.isArray(snapshot?.holders) ? snapshot.holders : [];

  if (total === null || total <= 0 || !holders.length) {
    return {
      top1ObservedPercent: null,
      top5ObservedPercent: null,
      top10ObservedPercent: null,
    };
  }

  return {
    top1ObservedPercent: round((sumTop(holders, 1) / total) * 100),
    top5ObservedPercent: round((sumTop(holders, 5) / total) * 100),
    top10ObservedPercent: round((sumTop(holders, 10) / total) * 100),
  };
}

function concentrationRisk(snapshot, concentration) {
  /*
   * A partial holder snapshot is not enough to claim whole-supply
   * concentration. Return null rather than misleading the scorer.
   */
  if (snapshot?.complete !== true) return null;

  const top10 = num(concentration?.top10ObservedPercent);
  const top1 = num(concentration?.top1ObservedPercent);

  if (top10 === null || top1 === null) return null;

  let risk = 0;

  if (top1 >= 50) risk += 50;
  else if (top1 >= 25) risk += 35;
  else if (top1 >= 15) risk += 20;
  else if (top1 >= 8) risk += 10;

  if (top10 >= 90) risk += 45;
  else if (top10 >= 75) risk += 30;
  else if (top10 >= 60) risk += 20;
  else if (top10 >= 40) risk += 10;

  return clamp(risk);
}

function classifyLargeHolders(snapshot) {
  const total = num(snapshot?.observedAmountRaw);
  const holders = Array.isArray(snapshot?.holders) ? snapshot.holders : [];

  if (total === null || total <= 0) return [];

  return holders.slice(0, 25).map(row => {
    const shareObservedPercent = ((num(row.amountRaw) ?? 0) / total) * 100;

    return {
      wallet: row.owner,
      classification:
        shareObservedPercent >= 5
          ? "LARGE_HOLDER"
          : "HOLDER",
      shareObservedPercent: round(shareObservedPercent, 4),
      amountRaw: row.amountRaw,
      tokenAccountCount: row.tokenAccountCount,
      smartWallet: null,
      walletPerformanceScore: null,
    };
  });
}

export async function analyzeSolanaAssetOnChain(
  asset,
  {
    holderMaxPages = 3,
    holderPageSize = 1000,
  } = {},
) {
  if (asset?.network !== "solana") {
    return {
      status: "NOT_APPLICABLE",
      network: asset?.network ?? null,
      assetId: asset?.assetId ?? null,
      reason: "SOLANA_ONLY_ENGINE",
    };
  }

  const mint = String(asset?.contractAddress ?? "").trim();

  if (!mint) {
    return {
      status: "UNAVAILABLE",
      network: "solana",
      assetId: asset?.assetId ?? null,
      reason: "MISSING_TOKEN_MINT",
    };
  }

  try {
    const snapshot = await getTokenHolderSnapshot(mint, {
      maxPages: holderMaxPages,
      pageSize: holderPageSize,
    });

    const concentration = concentrationFromObserved(snapshot);
    const holderConcentrationRiskScore =
      concentrationRisk(snapshot, concentration);

    const largeHolders =
      classifyLargeHolders(snapshot);

    const warnings = [];

    if (snapshot.partial) {
      warnings.push("HOLDER_SNAPSHOT_PARTIAL");
    }

    if (holderConcentrationRiskScore !== null && holderConcentrationRiskScore >= 60) {
      warnings.push("HIGH_HOLDER_CONCENTRATION");
    }

    warnings.push("KNOWN_PROGRAM_OR_LP_WALLETS_NOT_YET_EXCLUDED");
    warnings.push("SMART_WALLET_HISTORY_NOT_YET_MEASURED");
    warnings.push("WALLET_PNL_NOT_YET_MEASURED");
    warnings.push("LIQUIDITY_LOCK_NOT_YET_VERIFIED");
    warnings.push("MINT_AUTHORITY_NOT_YET_VERIFIED");
    warnings.push("FREEZE_AUTHORITY_NOT_YET_VERIFIED");

    return {
      status: snapshot.errors.length ? "PARTIAL" : "COMPLETE",
      engine: "SOLANA_ONCHAIN_INTELLIGENCE",
      version: VERSION,
      provider: "HELIUS",
      network: "solana",
      assetId: asset?.assetId ?? null,
      symbol: asset?.symbol ?? null,
      mint,

      holderSnapshot: {
        complete: snapshot.complete,
        partial: snapshot.partial,
        pagesFetched: snapshot.pagesFetched,
        uniqueHolderCountObserved: snapshot.uniqueHolderCountObserved,
        observedAmountRaw: snapshot.observedAmountRaw,
      },

      concentration: {
        ...concentration,
        scope:
          snapshot.complete
            ? "COMPLETE_HOLDER_SET"
            : "OBSERVED_PARTIAL_SET",
      },

      holderConcentrationRiskScore,

      largeHolders,

      whaleFlowScore: null,
      smartWalletScore: null,
      smartWalletCount: null,
      walletPerformanceAvailable: false,

      warnings,
      errors: snapshot.errors,

      researchOnly: true,
      executionAuthority: false,
      liveExecution: false,
      observedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "UNAVAILABLE",
      engine: "SOLANA_ONCHAIN_INTELLIGENCE",
      version: VERSION,
      provider: "HELIUS",
      network: "solana",
      assetId: asset?.assetId ?? null,
      symbol: asset?.symbol ?? null,
      mint,
      holderConcentrationRiskScore: null,
      whaleFlowScore: null,
      smartWalletScore: null,
      warnings: ["SOLANA_ONCHAIN_DATA_UNAVAILABLE"],
      errors: [
        error instanceof Error ? error.message : String(error),
      ],
      researchOnly: true,
      executionAuthority: false,
      liveExecution: false,
      observedAt: new Date().toISOString(),
    };
  }
}

export async function analyzeSolanaCandidates(
  assets,
  {
    limit = 10,
    concurrency = 2,
    holderMaxPages = 3,
    holderPageSize = 1000,
  } = {},
) {
  const input = (Array.isArray(assets) ? assets : [])
    .filter(asset => asset?.network === "solana")
    .slice(0, Math.max(1, Number(limit) || 10));

  const results = new Array(input.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= input.length) return;

      results[index] = await analyzeSolanaAssetOnChain(input[index], {
        holderMaxPages,
        holderPageSize,
      });
    }
  }

  const workerCount =
    Math.min(
      input.length || 1,
      Math.max(1, Number(concurrency) || 1),
    );

  await Promise.all(
    Array.from({ length: workerCount }, () => worker()),
  );

  return {
    engine: "SOLANA_ONCHAIN_INTELLIGENCE_BATCH",
    version: VERSION,
    status: "COMPLETE",
    inputCount: input.length,
    completeCount: results.filter(r => r?.status === "COMPLETE").length,
    partialCount: results.filter(r => r?.status === "PARTIAL").length,
    unavailableCount: results.filter(r => r?.status === "UNAVAILABLE").length,
    results,
    researchOnly: true,
    executionAuthority: false,
    generatedAt: new Date().toISOString(),
  };
}

export default {
  analyzeSolanaAssetOnChain,
  analyzeSolanaCandidates,
};
