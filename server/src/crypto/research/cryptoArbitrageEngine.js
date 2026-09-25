/**
 * AEMA CRYPTO — ARBITRAGE RESEARCH ENGINE
 * Phase 1.4 — canonical asset identity
 *
 * IMPORTANT:
 * - Detects cross-market price dislocations.
 * - Never assumes unknown fees are zero.
 * - Never calls an opportunity DEPTH_CONFIRMED without depth evidence.
 * - Research only; no order placement/execution.
 */

import { finite } from "./cryptoMarketNormalizer.js";

const DEFAULT_MIN_RAW_SPREAD_PCT = 0.15;
const DEFAULT_MAX_AGE_MS = 30_000;

function ageMs(market, now = Date.now()) {
  const time = Date.parse(market?.observedAt ?? "");
  return Number.isFinite(time) ? Math.max(0, now - time) : null;
}

function routeType(buy, sell) {
  return `${buy.venueType}_TO_${sell.venueType}`;
}

function executableBuyPrice(market) {
  return finite(market.askUsd) ?? finite(market.priceUsd);
}

function executableSellPrice(market) {
  return finite(market.bidUsd) ?? finite(market.priceUsd);
}

function feePct(market, side) {
  return finite(
    market?.fee?.[`${side}Pct`] ??
    market?.fee?.takerPct ??
    market?.feePct,
  );
}

function hasDepthEvidence(market) {
  return Boolean(
    market?.depth &&
    (
      finite(market.depth.usdWithin1Pct) !== null ||
      finite(market.depth.availableNotionalUsd) !== null
    ),
  );
}

function slippagePct(market, notionalUsd, side) {
  const exact = finite(market?.depth?.slippageByNotional?.[String(notionalUsd)]?.[`${side}Pct`]);
  return exact;
}

export function findArbitrage(markets = [], options = {}) {
  const minRawSpreadPct =
    finite(options.minRawSpreadPct) ?? DEFAULT_MIN_RAW_SPREAD_PCT;
  const maxAgeMs =
    finite(options.maxAgeMs) ?? DEFAULT_MAX_AGE_MS;
  const notionals =
    Array.isArray(options.notionals) && options.notionals.length
      ? options.notionals.map(finite).filter(v => v !== null && v > 0)
      : [1000, 10000, 50000, 100000];

  const now = Date.now();

  const identityEligible = market => {
    // CEX products are allowed to participate in CEX↔CEX research.
    // DEX products require explicit verified identity. Symbol equality is not enough.
    if (market?.venueType === "DEX") {
      return market?.arbitrageEligible === true && market?.identity?.verified === true;
    }
    return market?.venueType === "CEX";
  };

  const excludedByIdentity = markets.filter(m =>
    m?.venueType === "DEX" && !identityEligible(m),
  );

  const usable = markets.filter(m =>
    identityEligible(m) &&
    m.tradable !== false &&
    finite(m.priceUsd) !== null &&
    finite(m.priceUsd) > 0,
  );

  const routes = [];

  for (let i = 0; i < usable.length; i += 1) {
    for (let j = 0; j < usable.length; j += 1) {
      if (i === j) continue;

      const buy = usable[i];
      const sell = usable[j];

      if (
        buy.venue === sell.venue &&
        buy.productId === sell.productId &&
        buy.venueType === sell.venueType
      ) continue;

      // Canonical asset-equivalence guard. Ticker equality is never enough.
      const sameCanonicalAsset = Boolean(
        buy.canonicalAssetId &&
        sell.canonicalAssetId &&
        buy.canonicalAssetId === sell.canonicalAssetId
      );
      if (!sameCanonicalAsset) continue;

      if (buy.venueType === "DEX" && sell.venueType === "DEX") {
        // DEX↔DEX must be the exact same verified representation. Cross-chain
        // wrapped/bridged equivalence requires separate bridge evidence.
        const sameVerifiedRepresentation =
          buy.identity?.verified === true &&
          sell.identity?.verified === true &&
          buy.chainId && sell.chainId && buy.chainId === sell.chainId &&
          buy.baseAddress && sell.baseAddress && buy.baseAddress === sell.baseAddress;
        if (!sameVerifiedRepresentation) continue;
      }

      if (buy.venueType !== sell.venueType) {
        const dex = buy.venueType === "DEX" ? buy : sell;
        const cex = buy.venueType === "CEX" ? buy : sell;
        const representationEquivalent =
          dex.identity?.verified === true &&
          dex.identity?.cexEquivalent === true &&
          cex.identity?.verified === true;
        if (!representationEquivalent) continue;
      }

      const buyPrice = executableBuyPrice(buy);
      const sellPrice = executableSellPrice(sell);
      if (!(buyPrice > 0) || !(sellPrice > buyPrice)) continue;

      const rawSpreadPct = ((sellPrice - buyPrice) / buyPrice) * 100;
      if (rawSpreadPct < minRawSpreadPct) continue;

      const buyAge = ageMs(buy, now);
      const sellAge = ageMs(sell, now);
      const stale =
        buyAge === null ||
        sellAge === null ||
        buyAge > maxAgeMs ||
        sellAge > maxAgeMs;

      const buyFeePct = feePct(buy, "buy");
      const sellFeePct = feePct(sell, "sell");
      const knownTradingFees =
        buyFeePct !== null && sellFeePct !== null;

      const sameChain =
        buy.chainId && sell.chainId
          ? buy.chainId === sell.chainId
          : null;

      const transferKnown =
        buy?.transfer?.withdrawEnabled !== undefined &&
        sell?.transfer?.depositEnabled !== undefined;

      const transferFeasible =
        transferKnown
          ? buy.transfer.withdrawEnabled === true &&
            sell.transfer.depositEnabled === true
          : null;

      const depthConfirmed = hasDepthEvidence(buy) && hasDepthEvidence(sell);

      const sizeAnalysis = notionals.map(notionalUsd => {
        const buySlip = slippagePct(buy, notionalUsd, "buy");
        const sellSlip = slippagePct(sell, notionalUsd, "sell");
        const knownSlippage = buySlip !== null && sellSlip !== null;

        const networkCostPct = finite(
          buy?.transfer?.networkCostPct ??
          sell?.transfer?.networkCostPct,
        );

        const allCostsKnown =
          knownTradingFees &&
          knownSlippage &&
          networkCostPct !== null;

        const netSpreadPct = allCostsKnown
          ? rawSpreadPct -
            buyFeePct -
            sellFeePct -
            buySlip -
            sellSlip -
            networkCostPct
          : null;

        return {
          notionalUsd,
          buySlippagePct: buySlip,
          sellSlippagePct: sellSlip,
          networkCostPct,
          netSpreadPct,
          costAdjusted: allCostsKnown,
          positiveAfterKnownCosts: netSpreadPct !== null ? netSpreadPct > 0 : null,
        };
      });

      let status = "OBSERVED";
      const reasons = [];

      if (stale) {
        status = "STALE";
        reasons.push("STALE_MARKET_DATA");
      } else if (transferFeasible === false) {
        status = "NOT_EXECUTABLE";
        reasons.push("TRANSFER_ROUTE_DISABLED");
      } else if (
        sizeAnalysis.some(row => row.costAdjusted && row.netSpreadPct > 0) &&
        depthConfirmed
      ) {
        status = "DEPTH_CONFIRMED";
      } else if (
        sizeAnalysis.some(row => row.costAdjusted && row.netSpreadPct > 0)
      ) {
        status = "COST_ADJUSTED";
        reasons.push("DEPTH_NOT_CONFIRMED");
      } else {
        if (!knownTradingFees) reasons.push("TRADING_FEES_UNKNOWN");
        if (!depthConfirmed) reasons.push("DEPTH_NOT_CONFIRMED");
        if (!transferKnown) reasons.push("TRANSFER_FEASIBILITY_UNKNOWN");
        if (sameChain === false) reasons.push("CROSS_CHAIN_ROUTE_REQUIRES_BRIDGE_EVIDENCE");
        if (reasons.length) status = "INCOMPLETE";
      }

      routes.push({
        routeType: routeType(buy, sell),
        status,
        rawSpreadPct,
        buy: {
          venue: buy.venue,
          venueType: buy.venueType,
          pair: `${buy.baseSymbol}/${buy.quoteSymbol}`,
          priceUsd: buyPrice,
          chainId: buy.chainId,
          productId: buy.productId,
        },
        sell: {
          venue: sell.venue,
          venueType: sell.venueType,
          pair: `${sell.baseSymbol}/${sell.quoteSymbol}`,
          priceUsd: sellPrice,
          chainId: sell.chainId,
          productId: sell.productId,
        },
        buyFeePct,
        sellFeePct,
        transferFeasible,
        sameChain,
        depthConfirmed,
        dataAgeMs: { buy: buyAge, sell: sellAge },
        sizeAnalysis,
        reasons,
      });
    }
  }

  const unique = new Map();
  for (const route of routes) {
    const key = [
      route.buy.venueType,
      route.buy.venue,
      route.buy.productId,
      route.sell.venueType,
      route.sell.venue,
      route.sell.productId,
    ].join("|");
    const old = unique.get(key);
    if (!old || route.rawSpreadPct > old.rawSpreadPct) unique.set(key, route);
  }

  const all = [...unique.values()]
    .sort((a, b) => b.rawSpreadPct - a.rawSpreadPct)
    .slice(0, 100);

  return {
    status: all.length ? "READY" : "NO_DISLOCATION",
    observedCount: all.length,
    depthConfirmedCount: all.filter(r => r.status === "DEPTH_CONFIRMED").length,
    costAdjustedCount: all.filter(r => r.status === "COST_ADJUSTED").length,
    identityFilter: {
      inputMarketCount: markets.length,
      eligibleMarketCount: usable.length,
      excludedDexMarketCount: excludedByIdentity.length,
      excludedDexMarkets: excludedByIdentity.slice(0, 100).map(m => ({
        venue: m.venue,
        pair: `${m.baseSymbol}/${m.quoteSymbol}`,
        chainId: m.chainId ?? null,
        productId: m.productId ?? null,
        baseAddress: m.baseAddress ?? null,
        reason: m.arbitrageExclusionReason ?? "DEX_ASSET_IDENTITY_UNVERIFIED",
      })),
    },
    routes: all,
    byType: {
      cexToCex: all.filter(r => r.routeType === "CEX_TO_CEX"),
      cexToDex: all.filter(r => r.routeType === "CEX_TO_DEX"),
      dexToCex: all.filter(r => r.routeType === "DEX_TO_CEX"),
      dexToDex: all.filter(r => r.routeType === "DEX_TO_DEX"),
    },
    policy: {
      researchOnly: true,
      executionAuthority: false,
      unknownFeesAreZero: false,
      unknownSlippageIsZero: false,
      rawSpreadIsArbitrageProof: false,
      symbolEqualityIsAssetIdentity: false,
      dexRequiresVerifiedIdentity: true,
      cexDexTickerOnlyComparisonAllowed: false,
    },
  };
}

export default { findArbitrage };
