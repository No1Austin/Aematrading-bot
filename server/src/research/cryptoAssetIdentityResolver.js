/**
 * AEMA CRYPTO — ASSET IDENTITY RESOLVER
 * Phase 1.2
 *
 * Fail-closed identity layer for exchange research.
 * A matching ticker symbol is NOT proof that two DEX tokens are the same asset.
 * Research-only; no execution authority.
 */

import { lower, upper } from "./cryptoMarketNormalizer.js";

function clean(value) {
  const v = String(value ?? "").trim();
  return v || null;
}

function sameText(a, b) {
  const x = lower(a);
  const y = lower(b);
  return Boolean(x && y && x === y);
}

export function buildRequestedIdentity(asset = {}) {
  return {
    symbol: upper(asset.symbol ?? asset.query) || null,
    assetId: clean(asset.assetId),
    chainId: lower(asset.chainId ?? asset.network) || null,
    address: lower(asset.address ?? asset.tokenAddress) || null,
  };
}

export function resolveMarketIdentity(market = {}, asset = {}) {
  const requested = buildRequestedIdentity(asset);
  const venueType = upper(market.venueType);
  const baseSymbol = upper(market.baseSymbol);
  const chainId = lower(market.chainId) || null;
  const baseAddress = lower(
    market.baseAddress ?? market.address ?? market.raw?.baseToken?.address,
  ) || null;

  if (!requested.symbol || baseSymbol !== requested.symbol) {
    return {
      verified: false,
      status: "IDENTITY_REJECTED",
      reason: "BASE_SYMBOL_MISMATCH",
      method: null,
    };
  }

  // Centralized products are canonical venue products for the requested ticker.
  // They do not prove equivalence to an arbitrary on-chain token.
  if (venueType === "CEX") {
    return {
      verified: true,
      status: "IDENTITY_VERIFIED",
      reason: null,
      method: "CEX_CANONICAL_PRODUCT",
    };
  }

  if (venueType !== "DEX") {
    return {
      verified: false,
      status: "IDENTITY_UNVERIFIED",
      reason: "UNKNOWN_VENUE_TYPE",
      method: null,
    };
  }

  // Strongest DEX proof currently available: caller supplied contract/mint.
  if (requested.address) {
    if (!baseAddress) {
      return {
        verified: false,
        status: "IDENTITY_UNVERIFIED",
        reason: "DEX_BASE_ADDRESS_MISSING",
        method: null,
      };
    }

    if (!sameText(baseAddress, requested.address)) {
      return {
        verified: false,
        status: "IDENTITY_REJECTED",
        reason: "DEX_CONTRACT_MISMATCH",
        method: null,
      };
    }

    if (requested.chainId && chainId && !sameText(chainId, requested.chainId)) {
      return {
        verified: false,
        status: "IDENTITY_REJECTED",
        reason: "DEX_CHAIN_MISMATCH",
        method: null,
      };
    }

    return {
      verified: true,
      status: "IDENTITY_VERIFIED",
      reason: null,
      method: "CHAIN_CONTRACT_MATCH",
    };
  }

  // Symbol-only DEX discovery is useful research evidence, but cannot be used
  // as arbitrage proof because tickers are freely reused across chains/tokens.
  return {
    verified: false,
    status: "IDENTITY_UNVERIFIED",
    reason: requested.assetId
      ? "CANONICAL_CONTRACT_MAPPING_REQUIRED"
      : "SYMBOL_ONLY_DEX_MATCH",
    method: null,
  };
}

export function attachMarketIdentity(markets = [], asset = {}) {
  return markets.map(market => ({
    ...market,
    identity: resolveMarketIdentity(market, asset),
  }));
}

export function marketEligibleForArbitrage(market = {}) {
  return market?.identity?.verified === true;
}

export default {
  buildRequestedIdentity,
  resolveMarketIdentity,
  attachMarketIdentity,
  marketEligibleForArbitrage,
};
