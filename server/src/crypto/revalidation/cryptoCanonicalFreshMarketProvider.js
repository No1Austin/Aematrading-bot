/**
 * AEMA Crypto — Phase 6.14
 * Canonical Fresh-Market Provider
 *
 * Refreshes the canonical universe, then identity-matches the requested
 * candidate against that NEW snapshot.
 *
 * No stale candidate fallback.
 * No execution authority.
 */

import {
  getCryptoUniverse,
} from "../universe/cryptoUniverseProvider.js";

function text(v) {
  return String(v ?? "").trim();
}

function lower(v) {
  return text(v).toLowerCase();
}

function upper(v) {
  return text(v).toUpperCase();
}

function candidateIdentity(candidate = {}) {
  const asset = candidate?.asset ?? candidate;

  return {
    assetId: lower(
      asset?.assetId ??
      candidate?.assetId,
    ),
    network: lower(
      asset?.network ??
      candidate?.network,
    ),
    contractAddress: lower(
      asset?.contractAddress ??
      candidate?.contractAddress,
    ),
    symbol: upper(
      asset?.symbol ??
      candidate?.symbol,
    ),
    name: lower(
      asset?.name ??
      candidate?.name,
    ),
    candidateType: upper(
      candidate?.candidateType ??
      candidate?.marketType ??
      asset?.candidateType ??
      asset?.marketType,
    ),
  };
}

function rowIdentity(row = {}) {
  return {
    assetId: lower(row?.assetId),
    network: lower(row?.network),
    contractAddress: lower(row?.contractAddress),
    symbol: upper(row?.symbol),
    name: lower(row?.name),
  };
}

function exactContractMatch(target, row) {
  return Boolean(
    target.network &&
    target.contractAddress &&
    row.network === target.network &&
    row.contractAddress === target.contractAddress
  );
}

function exactIdMatch(target, row) {
  return Boolean(
    target.assetId &&
    row.assetId &&
    target.assetId === row.assetId
  );
}

function safeCexSymbolMatch(target, row) {
  const cexSafe =
    target.candidateType === "CEX" ||
    target.candidateType === "CEX_DEX";

  return Boolean(
    cexSafe &&
    target.symbol &&
    row.symbol === target.symbol &&
    (!target.name || !row.name || target.name === row.name)
  );
}

export async function refreshCanonicalCryptoAsset(
  candidate,
  {
    maximumAssets = 1000,
    coinGeckoPages = 3,
    includeDexDiscovery = true,
  } = {},
) {
  const target = candidateIdentity(candidate);

  if (
    !target.assetId &&
    !(target.network && target.contractAddress) &&
    !target.symbol
  ) {
    return null;
  }

  /*
   * refresh:true is mandatory. This bypasses the universe cache and
   * reconstructs provider/venue discovery before identity matching.
   */
  const universe =
    await getCryptoUniverse({
      refresh: true,
      maximumAssets,
      coinGeckoPages,
      includeDexDiscovery,
    });

  const assets =
    Array.isArray(universe?.assets)
      ? universe.assets
      : [];

  // Strongest identity: chain + contract.
  let match =
    assets.find(row =>
      exactContractMatch(
        target,
        rowIdentity(row),
      ),
    );

  // Canonical provider ID is safe for CoinGecko/CEX universe assets.
  if (!match && target.assetId) {
    match =
      assets.find(row =>
        exactIdMatch(
          target,
          rowIdentity(row),
        ),
      );
  }

  /*
   * Symbol fallback is deliberately restricted to CEX/CEX_DEX candidates.
   * DEX-only/emerging assets never inherit another token's data by ticker.
   */
  if (!match) {
    match =
      assets.find(row =>
        safeCexSymbolMatch(
          target,
          rowIdentity(row),
        ),
      );
  }

  if (!match) {
    return null;
  }

  /*
   * Preserve the actual provider timestamp where present.
   * generatedAt is NOT substituted as the market-data timestamp because
   * it only proves when AEMA assembled the universe.
   */
  return {
    ...match,

    refreshMetadata: {
      refreshed: true,
      universeStatus:
        universe?.status ?? null,
      universeGeneratedAt:
        universe?.generatedAt ?? null,
      matchedBy:
        exactContractMatch(
          target,
          rowIdentity(match),
        )
          ? "NETWORK_CONTRACT"
          : exactIdMatch(
              target,
              rowIdentity(match),
            )
            ? "ASSET_ID"
            : "CEX_SYMBOL_NAME",
      executionAuthority: false,
      liveExecution: false,
    },
  };
}

export default refreshCanonicalCryptoAsset;
