/**
 * AEMA CRYPTO — CANONICAL ASSET RESOLVER
 * Phase 1.4
 *
 * Purpose:
 * - Resolve a searched asset into a stable canonical identity.
 * - Provide only explicitly verified DEX representations.
 * - Never infer identity from ticker equality alone.
 *
 * IMPORTANT:
 * Registry entries below are protocol-stable contract/mint identifiers, not
 * prices or market data. Unknown assets remain unresolved unless the caller
 * supplies an exact chain + contract/mint address.
 */

function upper(v) { return v == null ? null : String(v).trim().toUpperCase() || null; }
function lower(v) { return v == null ? null : String(v).trim().toLowerCase() || null; }
function text(v) { return v == null ? null : String(v).trim() || null; }

const CORE_ASSETS = Object.freeze({
  SOL: Object.freeze({
    canonicalAssetId: "solana",
    symbol: "SOL",
    name: "Solana",
    cexSymbols: ["SOL"],
    dexRepresentations: [
      Object.freeze({
        chainId: "solana",
        address: "So11111111111111111111111111111111111111112",
        observedSymbols: ["SOL", "WSOL"],
        representation: "WRAPPED_NATIVE",
        cexEquivalent: true,
      }),
    ],
  }),
  ETH: Object.freeze({
    canonicalAssetId: "ethereum",
    symbol: "ETH",
    name: "Ethereum",
    cexSymbols: ["ETH"],
    dexRepresentations: [
      Object.freeze({
        chainId: "ethereum",
        address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        observedSymbols: ["WETH"],
        representation: "WRAPPED_NATIVE",
        cexEquivalent: true,
      }),
    ],
  }),
  BNB: Object.freeze({
    canonicalAssetId: "binancecoin",
    symbol: "BNB",
    name: "BNB",
    cexSymbols: ["BNB"],
    dexRepresentations: [
      Object.freeze({
        chainId: "bsc",
        address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
        observedSymbols: ["WBNB"],
        representation: "WRAPPED_NATIVE",
        cexEquivalent: true,
      }),
    ],
  }),
  BTC: Object.freeze({
    canonicalAssetId: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    cexSymbols: ["BTC", "XBT"],
    // Native BTC has no canonical ERC-20/SPL contract. Wrapped/custodial BTC
    // products are intentionally NOT treated as BTC-equivalent by default.
    dexRepresentations: [],
  }),
});

export function resolveCanonicalAsset(asset = {}) {
  const symbol = upper(asset.symbol ?? asset.query);
  const requestedChain = lower(asset.chainId ?? asset.network);
  const requestedAddress = lower(asset.address ?? asset.tokenAddress);
  const registry = symbol ? CORE_ASSETS[symbol] ?? null : null;

  // Exact caller-supplied identity always wins for arbitrary tokens.
  if (requestedChain && requestedAddress) {
    const matchingRepresentation = registry?.dexRepresentations?.find(rep =>
      lower(rep.chainId) === requestedChain && lower(rep.address) === requestedAddress,
    ) ?? null;

    return {
      status: "RESOLVED",
      method: matchingRepresentation ? "REGISTRY_EXACT" : "CALLER_EXACT_CHAIN_AND_ADDRESS",
      canonicalAssetId: registry?.canonicalAssetId ?? text(asset.assetId) ?? `${requestedChain}:${requestedAddress}`,
      symbol: registry?.symbol ?? symbol,
      name: registry?.name ?? text(asset.name),
      cexSymbols: registry?.cexSymbols ?? (symbol ? [symbol] : []),
      dexRepresentations: matchingRepresentation
        ? [matchingRepresentation]
        : [{
            chainId: requestedChain,
            address: requestedAddress,
            observedSymbols: symbol ? [symbol] : [],
            representation: "EXACT_TOKEN",
            cexEquivalent: false,
          }],
      requestedChain,
      requestedAddress,
      registryBacked: Boolean(registry),
    };
  }

  if (registry) {
    return {
      status: "RESOLVED",
      method: "CORE_ASSET_REGISTRY",
      canonicalAssetId: registry.canonicalAssetId,
      symbol: registry.symbol,
      name: registry.name,
      cexSymbols: [...registry.cexSymbols],
      dexRepresentations: registry.dexRepresentations.map(rep => ({ ...rep })),
      requestedChain: null,
      requestedAddress: null,
      registryBacked: true,
    };
  }

  return {
    status: "UNRESOLVED",
    method: "NO_CANONICAL_IDENTITY",
    canonicalAssetId: text(asset.assetId),
    symbol,
    name: text(asset.name),
    cexSymbols: symbol ? [symbol] : [],
    dexRepresentations: [],
    requestedChain,
    requestedAddress,
    registryBacked: false,
  };
}

export function matchCanonicalDexRepresentation(market = {}, canonical = {}) {
  const chainId = lower(market.chainId ?? market.network);
  const address = lower(market.baseAddress ?? market.address ?? market.tokenAddress);
  const symbol = upper(market.baseSymbol ?? market.symbol);

  const representation = (canonical.dexRepresentations ?? []).find(rep => {
    const chainMatch = lower(rep.chainId) === chainId;
    const addressMatch = lower(rep.address) === address;
    const symbols = (rep.observedSymbols ?? []).map(upper).filter(Boolean);
    const symbolMatch = symbols.length === 0 || symbols.includes(symbol);
    return chainMatch && addressMatch && symbolMatch;
  }) ?? null;

  return {
    verified: Boolean(representation),
    representation,
    chainId,
    address,
    symbol,
  };
}

export function annotateCanonicalCexMarket(market = {}, canonical = {}) {
  const baseSymbol = upper(market.baseSymbol);
  const allowed = (canonical.cexSymbols ?? []).map(upper).filter(Boolean);
  const verified = Boolean(canonical.canonicalAssetId && baseSymbol && allowed.includes(baseSymbol));

  return {
    ...market,
    canonicalAssetId: verified ? canonical.canonicalAssetId : null,
    identity: verified ? {
      status: "VERIFIED",
      method: "CEX_CANONICAL_SYMBOL",
      verified: true,
      canonicalAssetId: canonical.canonicalAssetId,
      representation: "NATIVE_CEX",
      cexEquivalent: true,
    } : market.identity ?? null,
    arbitrageEligible: verified,
    arbitrageExclusionReason: verified ? null : "CEX_CANONICAL_IDENTITY_UNVERIFIED",
  };
}

export default {
  resolveCanonicalAsset,
  matchCanonicalDexRepresentation,
  annotateCanonicalCexMarket,
};
