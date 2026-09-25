/**
 * ============================================================
 * AEMA CRYPTO
 * FUNDAMENTAL EVIDENCE PROVIDER
 * Phase 6.46 — fail-closed multi-provider evidence
 * ============================================================
 *
 * PURPOSE
 * Builds one normalized evidence contract for the future
 * cryptoFundamentalEngine.js without fabricating unavailable data.
 *
 * Evidence providers:
 * - CoinGecko candidate detail fundamentals
 * - DefiLlama protocol fundamentals
 * - Crypto Final Intelligence Snapshot
 * - optional legacy bulk snapshot fallback when supplied by caller
 *
 * IMPORTANT
 * - Candidate-specific CoinGecko detail evidence is cached by provider.
 * - Missing evidence stays null / unavailable.
 * - A missing metric is NEVER converted to 0 or neutral 50.
 * - Symbol-only matching is restricted for EMERGING/DEX-only assets.
 * - This provider supplies evidence. It does not qualify trades.
 * - No execution authority.
 */

import {
  lookupCryptoFundamentals,
} from "./cryptoFundamentalSnapshotProvider.js";

import getCoinGeckoFundamentals from "./coinGeckoFundamentalProvider.js";
import getDefiLlamaFundamentals from "./defiLlamaFundamentalProvider.js";
import getCoinMetricsOnChainEvidence from "./coinMetricsOnChainProvider.js";
import buildCryptoFinalIntelligenceSnapshot from "./cryptoFinalIntelligenceSnapshotProvider.js";

const DEFAULT_TTL_MS =
  Number(process.env.CRYPTO_FUNDAMENTAL_EVIDENCE_TTL_MS) ||
  15 * 60 * 1000;

const cache = new Map();
const inflight = new Map();

const finite = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const text = (value) => String(value ?? "").trim();
const norm = (value) => text(value).toLowerCase();

function providerFailure(source, error) {
  return {
    approved: false,
    status: "INSUFFICIENT_EVIDENCE",
    reason: error?.name === "AbortError"
      ? `${source}_TIMEOUT`
      : `${source}_PROVIDER_ERROR`,
    error: error?.message ? String(error.message).slice(0, 500) : null,
    fetchedAt: new Date().toISOString(),
    source,
    executionAuthority: false,
    liveExecution: false,
  };
}

async function safeProvider(source, work) {
  try {
    return await work();
  } catch (error) {
    return providerFailure(source, error);
  }
}

function hasMeaningfulProtocolEvidence(protocol) {
  if (!protocol) return false;
  const chains = Array.isArray(protocol?.chains) ? protocol.chains : [];
  const tvl = finite(protocol?.tvlUsd);
  const d1 = finite(protocol?.change1d);
  const d7 = finite(protocol?.change7d);
  const staking = finite(protocol?.stakingUsd);
  return Boolean(
    chains.length > 0 ||
    (tvl !== null && tvl > 0) ||
    d1 !== null ||
    d7 !== null ||
    (staking !== null && staking > 0)
  );
}

function hasUsableCoinMetrics(result) {
  return Boolean(
    result?.approved === true &&
    Number(result?.availableMetricCount) > 0 &&
    result?.metrics &&
    typeof result.metrics === "object"
  );
}

function candidateType(candidate) {
  return text(
    candidate?.candidateType ??
      candidate?.type ??
      candidate?.policy?.candidateType,
  ).toUpperCase();
}

function candidateIdentity(candidate) {
  return {
    assetId:
      candidate?.assetId ??
      candidate?.coinGeckoId ??
      candidate?.measurements?.assetId ??
      null,

    symbol:
      text(
        candidate?.symbol ??
          candidate?.measurements?.symbol,
      ).toUpperCase() || null,

    name:
      candidate?.name ??
      candidate?.measurements?.name ??
      null,

    contractAddress:
      candidate?.contractAddress ??
      candidate?.contract ??
      candidate?.measurements?.contractAddress ??
      candidate?.measurements?.contract ??
      null,

    network:
      candidate?.network ??
      candidate?.chain ??
      candidate?.measurements?.network ??
      candidate?.measurements?.chain ??
      null,

    candidateType:
      candidateType(candidate) || "UNKNOWN",
  };
}

function cacheKey(candidate) {
  const id = candidateIdentity(candidate);

  return [
    norm(id.assetId),
    norm(id.contractAddress),
    norm(id.network),
    norm(id.symbol),
    norm(id.candidateType),
  ].join("|");
}

function unavailable(reason, source = null) {
  return {
    available: false,
    value: null,
    source,
    reason,
  };
}

function available(value, source, extra = {}) {
  const number = finite(value);

  if (number === null) {
    return unavailable("VALUE_UNAVAILABLE", source);
  }

  return {
    available: true,
    value: number,
    source,
    reason: null,
    ...extra,
  };
}

function availableText(value, source, extra = {}) {
  const valueText = text(value);

  if (!valueText) {
    return unavailable("VALUE_UNAVAILABLE", source);
  }

  return {
    available: true,
    value: valueText,
    source,
    reason: null,
    ...extra,
  };
}

function availableArray(value, source, extra = {}) {
  if (!Array.isArray(value) || value.length === 0) {
    return unavailable("VALUE_UNAVAILABLE", source);
  }

  return {
    available: true,
    value,
    source,
    reason: null,
    ...extra,
  };
}

function getMeasurements(candidate) {
  return candidate?.measurements ?? {};
}

function resolveBinanceSymbol(identity, candidate) {
  const explicit =
    candidate?.binanceSymbol ??
    candidate?.measurements?.binanceSymbol ??
    null;

  if (explicit) {
    return text(explicit).toUpperCase();
  }

  /*
   * We may infer SYMBOLUSDT only for a CEX candidate.
   * This is used solely to look up an already-loaded Binance futures
   * snapshot. DEX-only/emerging assets must not inherit evidence by ticker.
   */
  if (
    identity.candidateType === "CEX" &&
    identity.symbol
  ) {
    return `${identity.symbol}USDT`;
  }

  return null;
}

function lookupFinalIntelligence(
  snapshot,
  candidate,
  identity,
) {
  const index = snapshot?.index ?? {};

  const result = {
    binanceTicker: null,
    binancePremium: null,
    lunar: null,
    events: [],
    matches: {
      binance: "NONE",
      lunar: "NONE",
      events: "NONE",
    },
  };

  const binanceSymbol =
    resolveBinanceSymbol(identity, candidate);

  if (binanceSymbol) {
    result.binanceTicker =
      index.tickerBySymbol?.get(binanceSymbol) ??
      null;

    result.binancePremium =
      index.premiumBySymbol?.get(binanceSymbol) ??
      null;

    if (
      result.binanceTicker ||
      result.binancePremium
    ) {
      result.matches.binance =
        "CEX_SYMBOL_PAIR";
    }
  }

  /*
   * LunarCrush in the existing snapshot is indexed by symbol/name.
   * Restrict fallback matching to CEX candidates. Contract-only emerging
   * assets cannot safely inherit social/project evidence from a ticker.
   */
  if (identity.candidateType === "CEX") {
    if (identity.symbol) {
      result.lunar =
        index.lunarBySymbol?.get(
          norm(identity.symbol),
        ) ??
        null;

      if (result.lunar) {
        result.matches.lunar =
          "CEX_SYMBOL";
      }
    }

    if (
      !result.lunar &&
      identity.name
    ) {
      result.lunar =
        index.lunarByName?.get(
          norm(identity.name),
        ) ??
        null;

      if (result.lunar) {
        result.matches.lunar =
          "CEX_NAME";
      }
    }

    const slug =
      norm(
        candidate?.slug ??
          candidate?.coinGeckoId ??
          identity.assetId,
      );

    if (slug) {
      result.events =
        index.eventsBySlug?.get(slug) ??
        [];

      if (result.events.length) {
        result.matches.events =
          "PROJECT_SLUG";
      }
    }

    if (
      !result.events.length &&
      identity.symbol
    ) {
      result.events =
        index.eventsBySymbol?.get(
          norm(identity.symbol),
        ) ??
        [];

      if (result.events.length) {
        result.matches.events =
          "CEX_SYMBOL";
      }
    }
  }

  return result;
}

function buildNetworkProtocolUsage({
  protocol,
}) {
  return {
    activeAddresses:
      unavailable(
        "ACTIVE_ADDRESS_PROVIDER_NOT_CONFIGURED",
      ),

    activeUsers:
      unavailable(
        "ACTIVE_USER_PROVIDER_NOT_CONFIGURED",
      ),

    transactions:
      unavailable(
        "TRANSACTION_COUNT_PROVIDER_NOT_CONFIGURED",
      ),

    transactionGrowth:
      unavailable(
        "TRANSACTION_GROWTH_PROVIDER_NOT_CONFIGURED",
      ),

    fees:
      unavailable(
        "DEFILLAMA_FEES_NOT_IN_CURRENT_PROVIDER",
        "DEFILLAMA",
      ),

    revenue:
      unavailable(
        "DEFILLAMA_REVENUE_NOT_IN_CURRENT_PROVIDER",
        "DEFILLAMA",
      ),

    tvlUsd:
      available(
        protocol?.tvlUsd,
        "DEFILLAMA",
      ),

    tvlChange1dPercent:
      available(
        protocol?.change1d,
        "DEFILLAMA",
      ),

    tvlChange7dPercent:
      available(
        protocol?.change7d,
        "DEFILLAMA",
      ),

    chains:
      availableArray(
        protocol?.chains,
        "DEFILLAMA",
      ),

    utilization:
      unavailable(
        "UTILIZATION_PROVIDER_NOT_CONFIGURED",
      ),
  };
}

function buildTokenEconomics({
  market,
}) {
  const circulating =
    finite(market?.circulatingSupply);

  const total =
    finite(market?.totalSupply);

  const max =
    finite(market?.maxSupply);

  const supplyBase =
    max !== null && max > 0
      ? max
      : total !== null && total > 0
        ? total
        : null;

  const circulatingRatio =
    circulating !== null &&
    supplyBase !== null &&
    supplyBase > 0
      ? (circulating / supplyBase) * 100
      : null;

  return {
    circulatingSupply:
      available(
        circulating,
        "COINGECKO",
      ),

    totalSupply:
      available(
        total,
        "COINGECKO",
      ),

    maxSupply:
      available(
        max,
        "COINGECKO",
      ),

    circulatingSupplyRatioPercent:
      available(
        circulatingRatio,
        "DERIVED_COINGECKO",
      ),

    inflationRate:
      unavailable(
        "INFLATION_PROVIDER_NOT_CONFIGURED",
      ),

    emissions:
      unavailable(
        "EMISSION_SCHEDULE_PROVIDER_NOT_CONFIGURED",
      ),

    unlocks:
      unavailable(
        "TOKEN_UNLOCK_PROVIDER_NOT_CONFIGURED",
      ),

    burns:
      unavailable(
        "BURN_DATA_PROVIDER_NOT_CONFIGURED",
      ),

    staking:
      unavailable(
        "STAKING_ECONOMICS_PROVIDER_NOT_CONFIGURED",
      ),

    tokenUtility:
      unavailable(
        "TOKEN_UTILITY_EVIDENCE_NOT_CONFIGURED",
      ),

    holderConcentration:
      unavailable(
        "HOLDER_CONCENTRATION_PROVIDER_NOT_CONFIGURED",
      ),
  };
}

function buildLiquidityMarketQuality({
  candidate,
  market,
  finalEvidence,
}) {
  const m = getMeasurements(candidate);

  const volume =
    finite(
      m.volume24hUsd ??
        candidate?.volume24hUsd ??
        market?.volume24hUsd,
    );

  const liquidity =
    finite(
      m.liquidityUsd ??
        candidate?.liquidityUsd,
    );

  const venueCount =
    finite(
      m.venueCount ??
        candidate?.venueCount ??
        candidate?.venues?.venueCount,
    );

  const cexCount =
    finite(
      m.cexCount ??
        candidate?.cexCount ??
        candidate?.venues?.cexCount,
    );

  const dexCount =
    finite(
      m.dexCount ??
        candidate?.dexCount ??
        candidate?.venues?.dexCount,
    );

  const marketCap =
    finite(
      m.marketCapUsd ??
        candidate?.marketCapUsd ??
        market?.marketCapUsd,
    );

  const volumeToMarketCap =
    volume !== null &&
    volume > 0 &&
    marketCap !== null &&
    marketCap > 0
      ? volume / marketCap
      : null;

  const futuresTradeCount =
    finite(
      finalEvidence
        ?.binanceTicker
        ?.tradeCount,
    );

  return {
    volume24hUsd:
      available(
        volume,
        "MARKET_MEASUREMENT",
      ),

    liquidityUsd:
      liquidity !== null &&
      liquidity > 0
        ? available(
            liquidity,
            "MARKET_MEASUREMENT",
          )
        : unavailable(
            "EXPLICIT_LIQUIDITY_NOT_AVAILABLE",
            "MARKET_MEASUREMENT",
          ),

    venueCount:
      available(
        venueCount,
        "VENUE_RESOLVER",
      ),

    cexCount:
      available(
        cexCount,
        "VENUE_RESOLVER",
      ),

    dexCount:
      available(
        dexCount,
        "VENUE_RESOLVER",
      ),

    volumeToMarketCap:
      available(
        volumeToMarketCap,
        "DERIVED_MARKET_DATA",
      ),

    futuresTradeCount:
      available(
        futuresTradeCount,
        "BINANCE_FUTURES",
      ),

    spread:
      unavailable(
        "ORDER_BOOK_SPREAD_NOT_IN_CURRENT_PROVIDER",
      ),

    orderBookDepth:
      unavailable(
        "ORDER_BOOK_DEPTH_NOT_IN_CURRENT_PROVIDER",
      ),

    suspiciousVolume:
      unavailable(
        "WASH_TRADING_DETECTION_NOT_CONFIGURED",
      ),

    uniqueTraders:
      unavailable(
        "UNIQUE_TRADER_PROVIDER_NOT_CONFIGURED",
      ),
  };
}

function buildAdoptionEcosystem({
  protocol,
  finalEvidence,
}) {
  const lunar =
    finalEvidence?.lunar ??
    null;

  return {
    developerActivity:
      unavailable(
        "DEVELOPER_ACTIVITY_PROVIDER_NOT_CONFIGURED",
      ),

    integrations:
      unavailable(
        "INTEGRATION_PROVIDER_NOT_CONFIGURED",
      ),

    applications:
      unavailable(
        "APPLICATION_ECOSYSTEM_PROVIDER_NOT_CONFIGURED",
      ),

    stablecoinActivity:
      unavailable(
        "STABLECOIN_ACTIVITY_PROVIDER_NOT_CONFIGURED",
      ),

    ecosystemGrowth:
      unavailable(
        "ECOSYSTEM_GROWTH_PROVIDER_NOT_CONFIGURED",
      ),

    chainReach:
      availableArray(
        protocol?.chains,
        "DEFILLAMA",
      ),

    socialGalaxyScore:
      available(
        lunar?.galaxyScore,
        "LUNARCRUSH",
      ),

    socialAltRank:
      available(
        lunar?.altRank,
        "LUNARCRUSH",
      ),

    socialVolume:
      available(
        lunar?.socialVolume,
        "LUNARCRUSH",
      ),

    socialInteractions:
      available(
        lunar?.interactions,
        "LUNARCRUSH",
      ),

    socialDominance:
      available(
        lunar?.socialDominance,
        "LUNARCRUSH",
      ),
  };
}

function buildValuation({
  market,
  protocol,
}) {
  const marketCap =
    finite(
      market?.marketCapUsd ??
        protocol?.mcapUsd,
    );

  const fdv =
    finite(market?.fdvUsd);

  const tvl =
    finite(protocol?.tvlUsd);

  const fdvToMarketCap =
    fdv !== null &&
    fdv > 0 &&
    marketCap !== null &&
    marketCap > 0
      ? fdv / marketCap
      : null;

  const marketCapToTvl =
    marketCap !== null &&
    marketCap > 0 &&
    tvl !== null &&
    tvl > 0
      ? marketCap / tvl
      : null;

  return {
    marketCapUsd:
      available(
        marketCap,
        "COINGECKO",
      ),

    fdvUsd:
      available(
        fdv,
        "COINGECKO",
      ),

    tvlUsd:
      available(
        tvl,
        "DEFILLAMA",
      ),

    fdvToMarketCap:
      available(
        fdvToMarketCap,
        "DERIVED_COINGECKO",
      ),

    marketCapToTvl:
      available(
        marketCapToTvl,
        "DERIVED_COINGECKO_DEFILLAMA",
      ),

    fdvToRevenue:
      unavailable(
        "REVENUE_EVIDENCE_NOT_AVAILABLE",
      ),

    marketCapToRevenue:
      unavailable(
        "REVENUE_EVIDENCE_NOT_AVAILABLE",
      ),

    feesToValuation:
      unavailable(
        "FEE_EVIDENCE_NOT_AVAILABLE",
      ),

    peerComparison:
      unavailable(
        "PEER_VALUATION_MODEL_NOT_CONFIGURED",
      ),
  };
}

function buildProjectDevelopmentQuality({
  protocol,
  finalEvidence,
}) {
  const events =
    Array.isArray(finalEvidence?.events)
      ? finalEvidence.events
      : [];

  return {
    protocolCategory:
      availableText(
        protocol?.category,
        "DEFILLAMA",
      ),

    protocolUrl:
      availableText(
        protocol?.url,
        "DEFILLAMA",
      ),

    upcomingEvents:
      events.length
        ? {
            available: true,
            value: events,
            count: events.length,
            source: "COINMARKETCAL",
            reason: null,
          }
        : unavailable(
            "NO_MATCHED_EVENT_EVIDENCE",
            "COINMARKETCAL",
          ),

    developerActivity:
      unavailable(
        "DEVELOPER_ACTIVITY_PROVIDER_NOT_CONFIGURED",
      ),

    releases:
      unavailable(
        "RELEASE_PROVIDER_NOT_CONFIGURED",
      ),

    audits:
      unavailable(
        "AUDIT_PROVIDER_NOT_CONFIGURED",
      ),

    governance:
      unavailable(
        "GOVERNANCE_QUALITY_PROVIDER_NOT_CONFIGURED",
      ),

    documentation:
      unavailable(
        "DOCUMENTATION_QUALITY_PROVIDER_NOT_CONFIGURED",
      ),

    protocolMaturity:
      unavailable(
        "PROTOCOL_MATURITY_MODEL_NOT_CONFIGURED",
      ),
  };
}

function buildSecurityDecentralization() {
  return {
    exploitHistory:
      unavailable(
        "EXPLOIT_HISTORY_PROVIDER_NOT_CONFIGURED",
      ),

    validatorConcentration:
      unavailable(
        "VALIDATOR_CONCENTRATION_PROVIDER_NOT_CONFIGURED",
      ),

    adminKeyRisk:
      unavailable(
        "ADMIN_KEY_PROVIDER_NOT_CONFIGURED",
      ),

    bridgeDependencies:
      unavailable(
        "BRIDGE_DEPENDENCY_PROVIDER_NOT_CONFIGURED",
      ),

    oracleDependencies:
      unavailable(
        "ORACLE_DEPENDENCY_PROVIDER_NOT_CONFIGURED",
      ),

    contractRisk:
      unavailable(
        "CONTRACT_RISK_PROVIDER_NOT_CONFIGURED",
      ),

    governanceConcentration:
      unavailable(
        "GOVERNANCE_CONCENTRATION_PROVIDER_NOT_CONFIGURED",
      ),
  };
}

function countEvidence(area) {
  const rows =
    Object.values(area ?? {});

  return {
    available:
      rows.filter(
        (x) => x?.available === true,
      ).length,

    unavailable:
      rows.filter(
        (x) => x?.available === false,
      ).length,

    total:
      rows.length,
  };
}

function evidenceSummary(areas) {
  const perArea =
    Object.fromEntries(
      Object.entries(areas)
        .map(
          ([key, value]) => [
            key,
            countEvidence(value),
          ],
        ),
    );

  const total =
    Object.values(perArea)
      .reduce(
        (sum, x) => sum + x.total,
        0,
      );

  const availableCount =
    Object.values(perArea)
      .reduce(
        (sum, x) => sum + x.available,
        0,
      );

  return {
    perArea,
    availableCount,
    total,
    rawCoverage:
      total > 0
        ? availableCount / total
        : 0,

    /*
     * rawCoverage is informational only.
     * The Fundamental Engine will calculate weighted/applicable coverage.
     */
  };
}


function normalizeDirectCoinGecko(result) {
  const e =
    result?.approved === true
      ? result?.evidence ?? null
      : null;

  if (!e) return null;

  return {
    assetId: e.id ?? result?.id ?? null,
    symbol: e.symbol ?? null,
    name: e.name ?? null,
    marketCapUsd: finite(e.marketCapUsd),
    fdvUsd: finite(e.fdvUsd),
    volume24hUsd: finite(e.volume24hUsd),
    circulatingSupply: finite(e.circulatingSupply),
    totalSupply: finite(e.totalSupply),
    maxSupply: finite(e.maxSupply),
    categories: Array.isArray(e.categories) ? e.categories : [],
    genesisDate: e.genesisDate ?? null,
    hashingAlgorithm: e.hashingAlgorithm ?? null,
    description: e.description ?? null,
    homepage: e.homepage ?? null,
    githubRepos: Array.isArray(e.githubRepos) ? e.githubRepos : [],
    developer: e.developer ?? null,
    community: e.community ?? null,
    source: "COINGECKO_DETAILS",
  };
}

function normalizeDirectDefiLlama(result) {
  const e =
    result?.approved === true
      ? result?.evidence ?? null
      : null;

  if (!e) return null;

  return {
    id: e.id ?? null,
    slug: e.slug ?? null,
    name: e.name ?? null,
    symbol: e.symbol ?? null,
    category: e.category ?? null,
    chains: Array.isArray(e.chains) ? e.chains : [],
    tvlUsd: finite(e.tvlUsd),
    mcapUsd: finite(e.marketCapUsd),
    change1h: finite(e.change1hPercent),
    change1d: finite(e.change1dPercent),
    change7d: finite(e.change7dPercent),
    stakingUsd: finite(e.stakingUsd),
    pool2Usd: finite(e.pool2Usd),
    source: "DEFILLAMA_PROTOCOLS",
  };
}

function mergePreferPrimary(primary, fallback) {
  if (!primary) return fallback ?? null;
  if (!fallback) return primary;

  const merged = {
    ...fallback,
    ...primary,
  };

  for (const [key, value] of Object.entries(primary)) {
    if (
      value === null ||
      value === undefined ||
      (Array.isArray(value) && value.length === 0)
    ) {
      if (fallback[key] !== undefined) {
        merged[key] = fallback[key];
      }
    }
  }

  return merged;
}

async function buildEvidence(
  candidate,
  {
    refresh = false,
    fundamentalSnapshot = null,
    finalIntelligenceSnapshot = null,
  } = {},
) {
  const identity =
    candidateIdentity(candidate);

  /*
   * Phase 6.7:
   * Prefer the candidate-specific detail providers for richer evidence.
   * The legacy bulk snapshot is accepted as an optional fallback only;
   * it is no longer fetched here automatically.
   */
  const [
    coinGeckoResult,
    defiLlamaResult,
    coinMetricsResult,
    finalIntelligence,
  ] = await Promise.all([
    safeProvider("COINGECKO_DETAILS", () =>
      getCoinGeckoFundamentals(candidate)
    ),
    safeProvider("DEFILLAMA_PROTOCOLS", () =>
      getDefiLlamaFundamentals(candidate)
    ),
    safeProvider("COIN_METRICS", () =>
      getCoinMetricsOnChainEvidence(candidate, { refresh })
    ),
    finalIntelligenceSnapshot
      ? Promise.resolve(finalIntelligenceSnapshot)
      : safeProvider("FINAL_INTELLIGENCE", () =>
          buildCryptoFinalIntelligenceSnapshot({ refresh })
        ),
  ]);

  const fundamentals =
    fundamentalSnapshot
      ? lookupCryptoFundamentals(
          fundamentalSnapshot,
          candidate,
        )
      : null;

  const market =
    mergePreferPrimary(
      normalizeDirectCoinGecko(
        coinGeckoResult,
      ),
      fundamentals?.market ?? null,
    );

  const protocol =
    mergePreferPrimary(
      normalizeDirectDefiLlama(
        defiLlamaResult,
      ),
      fundamentals?.protocol ?? null,
    );

  const finalEvidence =
    lookupFinalIntelligence(
      finalIntelligence,
      candidate,
      identity,
    );

  const areas = {
    networkProtocolUsage:
      buildNetworkProtocolUsage({
        protocol,
      }),

    tokenEconomics:
      buildTokenEconomics({
        market,
      }),

    liquidityMarketQuality:
      buildLiquidityMarketQuality({
        candidate,
        market,
        finalEvidence,
      }),

    adoptionEcosystem:
      buildAdoptionEcosystem({
        protocol,
        finalEvidence,
      }),

    valuation:
      buildValuation({
        market,
        protocol,
      }),

    projectDevelopmentQuality:
      buildProjectDevelopmentQuality({
        protocol,
        finalEvidence,
      }),

    securityDecentralization:
      buildSecurityDecentralization(),
  };

  const summary =
    evidenceSummary(areas);

  return {
    approved: true,

    status:
      summary.availableCount > 0
        ? "READY"
        : "INSUFFICIENT_EVIDENCE",

    provider:
      "AEMA_CRYPTO_FUNDAMENTAL_EVIDENCE",

    version:
      "6.46",

    generatedAt:
      new Date().toISOString(),

    identity,

    attribution: {
      fundamental:
        fundamentals?.identity ??
        {
          coinGeckoId:
            market?.assetId ?? null,
          defiLlamaId:
            protocol?.id ?? null,
          defiLlamaSlug:
            protocol?.slug ?? null,
        },

      finalIntelligenceMatches:
        finalEvidence.matches,
    },

    freshness: {
      fundamental:
        market || protocol
          ? "LIVE_OR_CACHED_PROVIDER_DATA"
          : fundamentals?.freshness ??
            "UNKNOWN",

      fundamentalSnapshotAt:
        fundamentals?.snapshotAt ??
        null,

      defiLlamaFetchedAt:
        defiLlamaResult?.fetchedAt ??
        null,

      coinMetricsObservedAt:
        coinMetricsResult?.observedAt ??
        null,

      coinMetricsFetchedAt:
        coinMetricsResult?.fetchedAt ??
        null,

      finalIntelligenceAt:
        finalIntelligence?.fetchedAt ??
        null,
    },

    /*
     * Direct On-Chain handoff.
     * Preserve complete Coin Metrics trend/derived evidence.
     */
    onChainEvidence:
      hasUsableCoinMetrics(coinMetricsResult) || protocol
        ? {
            protocol: protocol
              ? {
                  id: protocol?.id ?? null,
                  slug: protocol?.slug ?? null,
                  name: protocol?.name ?? null,
                  symbol: protocol?.symbol ?? null,
                  category: protocol?.category ?? null,
                  chains: Array.isArray(protocol?.chains) ? protocol.chains : [],
                  tvlUsd: finite(protocol?.tvlUsd),
                  change1d: finite(protocol?.change1d),
                  change7d: finite(protocol?.change7d),
                  stakingUsd: finite(protocol?.stakingUsd),
                }
              : null,

            coinMetrics: hasUsableCoinMetrics(coinMetricsResult)
              ? {
                  approved: true,
                  status: coinMetricsResult?.status ?? "READY",
                  reason: coinMetricsResult?.reason ?? null,
                  asset: coinMetricsResult?.asset ?? null,
                  metrics:
                    coinMetricsResult?.metrics &&
                    typeof coinMetricsResult.metrics === "object"
                      ? coinMetricsResult.metrics
                      : {},
                  trends:
                    coinMetricsResult?.trends &&
                    typeof coinMetricsResult.trends === "object"
                      ? coinMetricsResult.trends
                      : {},
                  derived:
                    coinMetricsResult?.derived &&
                    typeof coinMetricsResult.derived === "object"
                      ? coinMetricsResult.derived
                      : {},
                  availableMetrics:
                    Array.isArray(coinMetricsResult?.availableMetrics)
                      ? coinMetricsResult.availableMetrics
                      : [],
                  availableMetricCount:
                    Number.isFinite(Number(coinMetricsResult?.availableMetricCount))
                      ? Number(coinMetricsResult.availableMetricCount)
                      : 0,
                  requestedMetrics:
                    Array.isArray(coinMetricsResult?.requestedMetrics)
                      ? coinMetricsResult.requestedMetrics
                      : [],
                  requestedMetricCount:
                    Number.isFinite(Number(coinMetricsResult?.requestedMetricCount))
                      ? Number(coinMetricsResult.requestedMetricCount)
                      : 0,
                  catalog: coinMetricsResult?.catalog ?? null,
                  history: coinMetricsResult?.history ?? null,
                  observedAt: coinMetricsResult?.observedAt ?? null,
                  fetchedAt: coinMetricsResult?.fetchedAt ?? null,
                  source: coinMetricsResult?.source ?? "COIN_METRICS",
                  executionAuthority: false,
                  liveExecution: false,
                }
              : null,

            fetchedAt:
              coinMetricsResult?.fetchedAt ??
              defiLlamaResult?.fetchedAt ??
              fundamentals?.snapshotAt ??
              null,

            source: [
              hasUsableCoinMetrics(coinMetricsResult) ? "COIN_METRICS" : null,
              hasMeaningfulProtocolEvidence(protocol) ? "DEFILLAMA_PROTOCOLS" : null,
            ].filter(Boolean).join("+") || null,

            providerStatus: {
              coinMetrics: {
                approved: coinMetricsResult?.approved === true,
                status: coinMetricsResult?.status ?? "UNKNOWN",
                reason: coinMetricsResult?.reason ?? null,
              },
              defiLlama: {
                approved: defiLlamaResult?.approved === true,
                status: defiLlamaResult?.status ?? "UNKNOWN",
                reason: defiLlamaResult?.reason ?? null,
                applicable: hasMeaningfulProtocolEvidence(protocol),
              },
            },

            executionAuthority: false,
            liveExecution: false,
          }
        : null,

    providers: {
      fundamentalSnapshot: fundamentalSnapshot?.providers ?? null,

      coinGeckoDetails: {
        approved: coinGeckoResult?.approved === true,
        status: coinGeckoResult?.status ?? "UNKNOWN",
        reason: coinGeckoResult?.reason ?? null,
      },

      defiLlamaProtocol: {
        approved: defiLlamaResult?.approved === true,
        status: defiLlamaResult?.status ?? "UNKNOWN",
        reason: defiLlamaResult?.reason ?? null,
        applicable: hasMeaningfulProtocolEvidence(protocol),
      },

      coinMetricsOnChain: {
        approved: coinMetricsResult?.approved === true,
        status: coinMetricsResult?.status ?? "UNKNOWN",
        reason: coinMetricsResult?.reason ?? null,
        observedAt: coinMetricsResult?.observedAt ?? null,
        fetchedAt: coinMetricsResult?.fetchedAt ?? null,
        availableMetricCount:
          Number.isFinite(Number(coinMetricsResult?.availableMetricCount))
            ? Number(coinMetricsResult.availableMetricCount)
            : 0,
      },

      finalIntelligence: finalIntelligence?.providers ?? null,
    },

    areas,
    summary,

    policy: {
      researchOnly: true,
      qualificationAuthority: false,
      executionAuthority: false,
      liveExecution: false,
      missingEvidencePolicy: "UNAVAILABLE_NOT_ZERO_OR_NEUTRAL",
      providerFailurePolicy: "FAIL_CLOSED_CONTINUE_WITH_OTHER_EVIDENCE",
      onChainPolicy: "COIN_METRICS_TRENDS_PLUS_DEFILLAMA_PROTOCOL_EVIDENCE",
      symbolMatchingPolicy: "RESTRICTED_FOR_EMERGING_AND_DEX_ONLY_ASSETS",
    },
  };
}

/**
 * Returns normalized fundamental evidence for one candidate.
 *
 * The network/provider work is still bulk/shared:
 * buildCryptoFundamentalSnapshot and
 * buildCryptoFinalIntelligenceSnapshot both cache their snapshots.
 */
export async function getCryptoFundamentalEvidence(
  candidate,
  {
    refresh = false,
    ttlMs = DEFAULT_TTL_MS,
    fundamentalSnapshot = null,
    finalIntelligenceSnapshot = null,
  } = {},
) {
  const key =
    cacheKey(candidate);

  const now =
    Date.now();

  const existing =
    cache.get(key);

  if (
    !refresh &&
    existing &&
    existing.expiresAt > now
  ) {
    return existing.value;
  }

  if (
    !refresh &&
    inflight.has(key)
  ) {
    return inflight.get(key);
  }

  const promise =
    buildEvidence(
      candidate,
      {
        refresh,
        fundamentalSnapshot,
        finalIntelligenceSnapshot,
      },
    )
      .then((value) => {
        cache.set(
          key,
          {
            value,
            expiresAt:
              Date.now() +
              Math.max(
                1_000,
                Number(ttlMs) ||
                  DEFAULT_TTL_MS,
              ),
          },
        );

        return value;
      })
      .finally(() => {
        inflight.delete(key);
      });

  inflight.set(
    key,
    promise,
  );

  return promise;
}

/**
 * Preferred batch API for Deep Research.
 *
 * Build the two expensive shared snapshots ONCE, then normalize
 * candidate evidence without additional provider HTTP requests.
 */
export async function buildCryptoFundamentalEvidenceBatch(
  candidates = [],
  {
    refresh = false,
  } = {},
) {
  const list =
    Array.isArray(candidates)
      ? candidates
      : [];

  /*
   * Build Final Intelligence once for the batch.
   * CoinGecko detail calls are candidate-specific and cached by their
   * provider. DefiLlama and Coin Metrics are also provider-cached.
   *
   * We deliberately do NOT fetch the legacy multi-page fundamental
   * snapshot here. That removes the slow 3-page CoinGecko bulk dependency
   * from the canonical Fundamental path.
   */
  const finalIntelligenceSnapshot =
    await buildCryptoFinalIntelligenceSnapshot({
      refresh,
    });

  const results =
    await Promise.all(
      list.map(
        (candidate) =>
          getCryptoFundamentalEvidence(
            candidate,
            {
              refresh,
              fundamentalSnapshot: null,
              finalIntelligenceSnapshot,
            },
          ),
      ),
    );

  const fundamentalSnapshot = null;

  return {
    approved: true,
    status:
      results.length
        ? "READY"
        : "EMPTY",

    generatedAt:
      new Date().toISOString(),

    candidateCount:
      results.length,

    providers: {
      fundamentalSnapshot:
        fundamentalSnapshot
          ?.providers ??
        null,

      finalIntelligence:
        finalIntelligenceSnapshot
          ?.providers ??
        null,
    },

    results,

    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
  };
}

export function clearCryptoFundamentalEvidenceCache() {
  cache.clear();
  inflight.clear();
}

export function getCryptoFundamentalEvidenceCacheStatus() {
  const now =
    Date.now();

  const entries =
    [...cache.entries()]
      .map(
        ([key, value]) => ({
          key,
          expiresInMs:
            Math.max(
              0,
              value.expiresAt - now,
            ),
        }),
      );

  return {
    cachedCandidates:
      entries.length,

    inFlight:
      inflight.size,

    entries,
  };
}

export default getCryptoFundamentalEvidence;
