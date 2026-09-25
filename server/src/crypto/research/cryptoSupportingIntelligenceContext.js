/**
 * AEMA CRYPTO — SUPPORTING INTELLIGENCE CONTEXT
 * Phase 6.50 — fail-proof multi-shape on-chain evidence normalization
 *
 * Rules:
 * - Score measured evidence only.
 * - Missing evidence never becomes an analytical 0 or neutral 50.
 * - NOT_APPLICABLE families are excluded from coverage.
 * - Prefer historical Coin Metrics trends over absolute network size.
 * - DefiLlama remains the DeFi/protocol feeder.
 * - No execution authority.
 */

const finite = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const clamp = (v, lo=0, hi=100) => {
  const n=finite(v);
  return n===null ? null : Math.min(hi,Math.max(lo,n));
};
const norm=(v)=>String(v??"").trim().toLowerCase();


/**
 * Phase 6.50 — provider-shape compatibility layer.
 *
 * External/provider evidence has changed shape across scanner phases.  The
 * scoring layer must not silently discard valid evidence merely because a
 * wrapper moved from `onChainEvidence.coinMetrics` to
 * `providers.coinMetricsOnChain.data` (or vice versa).
 *
 * These helpers unwrap known transport envelopes WITHOUT inventing values.
 */
function objectOrNull(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function firstObject(...values) {
  for (const value of values) {
    const object = objectOrNull(value);
    if (object) return object;
  }
  return null;
}

function hasCoinMetricsPayload(value) {
  const v = objectOrNull(value);
  if (!v) return false;
  return Boolean(
    objectOrNull(v.metrics) ||
    objectOrNull(v.trends) ||
    objectOrNull(v.derived) ||
    Array.isArray(v.history)
  );
}

function unwrapCoinMetrics(value) {
  const root = objectOrNull(value);
  if (!root) return null;

  const candidates = [
    root,
    root.data,
    root.evidence,
    root.result,
    root.snapshot,
    root.payload,
    root.onChain,
    root.coinMetrics,
    root.coinMetricsOnChain,
    root.data?.coinMetrics,
    root.data?.coinMetricsOnChain,
    root.evidence?.coinMetrics,
    root.evidence?.coinMetricsOnChain,
  ];

  for (const candidate of candidates) {
    if (hasCoinMetricsPayload(candidate)) return candidate;
  }

  return null;
}

function hasProtocolPayload(value) {
  const v = objectOrNull(value);
  if (!v) return false;
  return Boolean(
    Array.isArray(v.chains) ||
    finite(v.tvlUsd) !== null ||
    finite(v.tvl) !== null ||
    finite(v.change1d) !== null ||
    finite(v.change7d) !== null ||
    finite(v.stakingUsd) !== null ||
    v.category ||
    v.slug ||
    v.name
  );
}

function normalizeProtocol(value) {
  const root = objectOrNull(value);
  if (!root) return null;

  const candidates = [
    root,
    root.data,
    root.evidence,
    root.result,
    root.protocol,
    root.data?.protocol,
    root.evidence?.protocol,
  ];

  for (const candidate of candidates) {
    if (!hasProtocolPayload(candidate)) continue;
    return {
      ...candidate,
      tvlUsd: finite(candidate?.tvlUsd) ?? finite(candidate?.tvl),
      change1d:
        finite(candidate?.change1d) ??
        finite(candidate?.change_1d) ??
        finite(candidate?.change1Day),
      change7d:
        finite(candidate?.change7d) ??
        finite(candidate?.change_7d) ??
        finite(candidate?.change7Days),
      stakingUsd:
        finite(candidate?.stakingUsd) ??
        finite(candidate?.staking) ??
        finite(candidate?.stakingTVL),
      chains: Array.isArray(candidate?.chains) ? candidate.chains : [],
    };
  }

  return null;
}

function resolveOnChainEvidence(fundamentalEvidence) {
  const root = objectOrNull(fundamentalEvidence) ?? {};
  const handoff = objectOrNull(root.onChainEvidence) ?? {};
  const providers = objectOrNull(root.providers) ?? {};

  const coinMetricsCandidates = [
    handoff.coinMetrics,
    handoff.coinMetricsOnChain,
    root.coinMetrics,
    root.coinMetricsOnChain,
    providers.coinMetricsOnChain,
    providers.coinMetrics,
    providers.coinMetricsNetwork,
  ];

  let coinMetrics = null;
  let coinMetricsPath = null;
  const coinMetricPaths = [
    "onChainEvidence.coinMetrics",
    "onChainEvidence.coinMetricsOnChain",
    "coinMetrics",
    "coinMetricsOnChain",
    "providers.coinMetricsOnChain",
    "providers.coinMetrics",
    "providers.coinMetricsNetwork",
  ];

  for (let i = 0; i < coinMetricsCandidates.length; i += 1) {
    const unwrapped = unwrapCoinMetrics(coinMetricsCandidates[i]);
    if (unwrapped) {
      coinMetrics = unwrapped;
      coinMetricsPath = coinMetricPaths[i];
      break;
    }
  }

  const protocolCandidates = [
    handoff.protocol,
    handoff.defiLlamaProtocol,
    root.protocol,
    providers.defiLlamaProtocol,
    providers.defiLlama,
  ];
  const protocolPaths = [
    "onChainEvidence.protocol",
    "onChainEvidence.defiLlamaProtocol",
    "protocol",
    "providers.defiLlamaProtocol",
    "providers.defiLlama",
  ];

  let protocol = null;
  let protocolPath = null;
  for (let i = 0; i < protocolCandidates.length; i += 1) {
    const normalized = normalizeProtocol(protocolCandidates[i]);
    if (normalized) {
      protocol = normalized;
      protocolPath = protocolPaths[i];
      break;
    }
  }

  return {
    coinMetrics,
    protocol,
    diagnostics: {
      fundamentalStatus: root.status ?? null,
      handoffPresent: Boolean(root.onChainEvidence),
      providerKeys: Object.keys(providers),
      coinMetricsResolved: Boolean(coinMetrics),
      coinMetricsPath,
      coinMetricsApproved:
        coinMetrics?.approved === true ||
        providers?.coinMetricsOnChain?.approved === true ||
        providers?.coinMetrics?.approved === true,
      coinMetricsStatus:
        coinMetrics?.status ??
        providers?.coinMetricsOnChain?.status ??
        providers?.coinMetrics?.status ??
        null,
      coinMetricsMetricCount: Object.keys(coinMetrics?.metrics ?? {}).length,
      coinMetricsTrendCount: Object.keys(coinMetrics?.trends ?? {}).length,
      coinMetricsDerivedCount: Object.keys(coinMetrics?.derived ?? {}).length,
      protocolResolved: Boolean(protocol),
      protocolPath,
      defiLlamaStatus:
        providers?.defiLlamaProtocol?.status ??
        providers?.defiLlama?.status ??
        null,
    },
  };
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

function scoreTrend(percent, sensitivity=1) {
  const p=finite(percent);
  if(p===null) return null;
  return clamp(50 + Math.max(-50,Math.min(50,p*sensitivity)));
}
function scoreInverseTrend(percent, sensitivity=1) {
  const p=finite(percent);
  if(p===null) return null;
  return clamp(50 - Math.max(-50,Math.min(50,p*sensitivity)));
}
function weightedScore(parts=[]) {
  const usable=parts.filter(p=>finite(p?.score)!==null && finite(p?.weight)>0);
  if(!usable.length) return null;
  const w=usable.reduce((s,p)=>s+p.weight,0);
  return clamp(usable.reduce((s,p)=>s+p.score*p.weight,0)/w);
}
function available(name, observations, parts) {
  const score=weightedScore(parts);
  if(score===null) return {name,status:"UNAVAILABLE",score:null,coverage:0,observations};
  const possible=parts.reduce((s,p)=>s+(finite(p?.weight)>0?p.weight:0),0);
  const represented=parts
    .filter(p=>finite(p?.score)!==null)
    .reduce((s,p)=>s+p.weight,0);
  return {
    name,status:"AVAILABLE",score,
    coverage:possible>0?represented/possible:0,
    observations,
    scoredSignals:parts.filter(p=>finite(p?.score)!==null).map(p=>p.name),
  };
}
function unavailable(name, observations={}) {
  return {name,status:"UNAVAILABLE",score:null,coverage:0,observations};
}
function notApplicable(name, observations={}) {
  return {name,status:"NOT_APPLICABLE",score:null,coverage:null,observations};
}

function buildFamilies({coinMetrics=null,protocol=null}={}) {
  const m=coinMetrics?.metrics ?? {};
  const t=coinMetrics?.trends ?? {};
  const d=coinMetrics?.derived ?? {};
  const chains=Array.isArray(protocol?.chains)?protocol.chains:[];

  const networkActivity=available("Network Activity",{
    activeAddresses:finite(m.AdrActCnt),
    blocks:finite(m.BlkCnt),
    hashRate:finite(m.HashRate),
    activeAddressesChange7dPercent:finite(d.activeAddressesChange7dPercent),
    blockCountChange7dPercent:finite(d.blockCountChange7dPercent),
    hashRateChange7dPercent:finite(d.hashRateChange7dPercent),
  },[
    {name:"active-address-trend",score:scoreTrend(d.activeAddressesChange7dPercent,1.5),weight:0.55},
    // Block count is noisy; use only a small weight.
    {name:"block-production-trend",score:scoreTrend(d.blockCountChange7dPercent,0.35),weight:0.10},
    {name:"hash-rate-trend",score:scoreTrend(d.hashRateChange7dPercent,0.75),weight:0.35},
  ]);

  const usageTransactions=available("Usage / Transactions",{
    transactionCount:finite(m.TxCnt),
    transferCount:finite(m.TxTfrCnt),
    feesNative:finite(m.FeeTotNtv),
    transactionCountChange7dPercent:finite(d.transactionCountChange7dPercent),
    transferCountChange7dPercent:finite(d.transferCountChange7dPercent),
    feeChange7dPercent:finite(d.feeChange7dPercent),
  },[
    {name:"transaction-trend",score:scoreTrend(d.transactionCountChange7dPercent,1.25),weight:0.45},
    {name:"transfer-trend",score:scoreTrend(d.transferCountChange7dPercent,1.0),weight:0.35},
    {name:"fee-trend",score:scoreTrend(d.feeChange7dPercent,0.6),weight:0.20},
  ]);

  /*
   * Issuance is evidence, but short-term block/issuance variation is not
   * automatically bullish/bearish. Current supply is informational only.
   * Score only if a longer-term issuance trend exists; otherwise preserve
   * the family as evidence-bearing but analytically unavailable.
   */
  const issuance30=finite(t?.IssTotNtv?.change30dPercent);
  const supplyIssuance = issuance30===null
    ? unavailable("Supply / Issuance",{
        currentSupply:finite(m.SplyCur),
        issuanceNative:finite(m.IssTotNtv),
        issuanceUsd:finite(m.IssTotUSD),
        issuanceChange7dPercent:finite(d.issuanceNativeChange7dPercent),
        reason:"LONGER_TERM_ISSUANCE_TREND_REQUIRED",
      })
    : available("Supply / Issuance",{
        currentSupply:finite(m.SplyCur),
        issuanceNative:finite(m.IssTotNtv),
        issuanceUsd:finite(m.IssTotUSD),
        issuanceChange30dPercent:issuance30,
      },[
        // Lower issuance pressure is directionally constructive; higher is dilutive.
        {name:"issuance-pressure-30d",score:scoreInverseTrend(issuance30,0.5),weight:1},
      ]);

  const holderDistribution=available("Holder / Distribution",{
    addressesWithBalance:finite(m.AdrBalCnt),
    addressesWithBalanceChange7dPercent:finite(d.addressBalanceCountChange7dPercent),
  },[
    {name:"balance-address-growth",score:scoreTrend(d.addressBalanceCountChange7dPercent,2),weight:1},
  ]);

  const securityParts=[];
  if(finite(d.hashRateChange7dPercent)!==null){
    securityParts.push({
      name:"hash-rate-trend",
      score:scoreTrend(d.hashRateChange7dPercent,0.75),
      weight:1,
    });
  }
  const securityDecentralization=securityParts.length
    ? available("Security / Decentralization",{
        hashRate:finite(m.HashRate),
        hashRateChange7dPercent:finite(d.hashRateChange7dPercent),
        note:"HASH_RATE_IS_SECURITY_EVIDENCE_NOT_A_COMPLETE_DECENTRALIZATION_MEASURE",
      },securityParts)
    : unavailable("Security / Decentralization",{
        reason:"SECURITY_DECENTRALIZATION_EVIDENCE_UNAVAILABLE",
      });

  const netFlowUsd=finite(d.exchangeNetFlowUsd);
  const exchangeSupply7=finite(d.exchangeSupplyUsdChange7dPercent);
  const exchangeParts=[];
  /*
   * Net exchange outflow (negative net flow) is treated as lower immediate
   * exchange-side supply pressure; inflow is the inverse. Keep sensitivity
   * deliberately bounded because flows can represent many behaviours.
   */
  if(netFlowUsd!==null){
    const scale=Math.max(
      1,
      Math.abs(finite(m.FlowInExUSD)??0)+Math.abs(finite(m.FlowOutExUSD)??0)
    );
    const normalized=(netFlowUsd/scale)*100;
    exchangeParts.push({
      name:"net-exchange-flow",
      score:scoreInverseTrend(normalized,2),
      weight:0.65,
    });
  }
  if(exchangeSupply7!==null){
    exchangeParts.push({
      name:"exchange-supply-trend",
      score:scoreInverseTrend(exchangeSupply7,1.5),
      weight:0.35,
    });
  }
  const exchangeFlows=exchangeParts.length
    ? available("Exchange / Flow Evidence",{
        inflowUsd:finite(m.FlowInExUSD),
        outflowUsd:finite(m.FlowOutExUSD),
        netFlowUsd,
        exchangeSupplyUsd:finite(m.SplyExUSD),
        exchangeSupplyChange7dPercent:exchangeSupply7,
        interpretation:"FLOW_CONTEXT_ONLY_NOT_STANDALONE_TRADING_SIGNAL",
      },exchangeParts)
    : unavailable("Exchange / Flow Evidence",{reason:"EXCHANGE_FLOW_EVIDENCE_UNAVAILABLE"});

  const hasHashRate=finite(m.HashRate)!==null;
  const stakingUsd=finite(protocol?.stakingUsd);
  const staking = stakingUsd!==null
    ? unavailable("Staking",{stakingUsd,reason:"STAKING_TREND_REQUIRED_FOR_DIRECTIONAL_SCORE"})
    : hasHashRate
      ? notApplicable("Staking",{reason:"POW_NETWORK_NO_NATIVE_STAKING_EVIDENCE"})
      : unavailable("Staking",{reason:"STAKING_EVIDENCE_UNAVAILABLE"});

  let defiProtocol;
  if(!hasMeaningfulProtocolEvidence(protocol)){
    defiProtocol=notApplicable("DeFi / Protocol Metrics",{
      reason:"NO_APPLICABLE_DEFILLAMA_PROTOCOL_METRICS"
    });
  }else{
    const tvl=finite(protocol.tvlUsd);
    const d1=finite(protocol.change1d);
    const d7=finite(protocol.change7d);
    const parts=[
      {name:"tvl-1d-trend",score:scoreTrend(d1,1),weight:0.30},
      {name:"tvl-7d-trend",score:scoreTrend(d7,0.75),weight:0.60},
      // chain count is informational; do not treat more chains as bullish.
    ];
    defiProtocol=(tvl!==null || d1!==null || d7!==null)
      ? available("DeFi / Protocol Metrics",{tvlUsd:tvl,change1d:d1,change7d:d7,chains},parts)
      : notApplicable("DeFi / Protocol Metrics",{
          chains,
          reason:"NO_APPLICABLE_DEFILLAMA_PROTOCOL_METRICS",
        });
  }

  return {
    networkActivity,
    usageTransactions,
    supplyIssuance,
    holderDistribution,
    securityDecentralization,
    exchangeFlows,
    staking,
    defiProtocol,
  };
}

function aggregateFamilies(families) {
  const all=Object.values(families);
  const applicable=all.filter(f=>f.status!=="NOT_APPLICABLE");
  const availableFamilies=applicable.filter(f=>f.status==="AVAILABLE" && finite(f.score)!==null);
  if(!availableFamilies.length) return null;

  // Equal family weighting avoids double-counting a family merely because
  // its provider exposes more raw metrics.
  const score=availableFamilies.reduce((s,f)=>s+f.score,0)/availableFamilies.length;
  const coverage=applicable.length ? availableFamilies.length/applicable.length : 0;

  return {
    score:clamp(score),
    coverage,
    evidence:{
      families,
      familyCounts:{
        available:availableFamilies.length,
        unavailable:applicable.length-availableFamilies.length,
        notApplicable:all.filter(f=>f.status==="NOT_APPLICABLE").length,
        applicable:applicable.length,
        total:all.length,
      },
      evidenceCount:availableFamilies.reduce(
        (sum,f)=>sum+(Array.isArray(f.scoredSignals)?f.scoredSignals.length:0),0
      ),
      scoringPolicy:{
        missingEvidence:"EXCLUDED_NOT_ZERO_OR_NEUTRAL",
        notApplicable:"EXCLUDED_FROM_COVERAGE",
        familyWeighting:"EQUAL_ACROSS_AVAILABLE_FAMILIES",
        trendWindow:"PREFER_7D_WITH_30D_WHERE_SEMANTICALLY_REQUIRED",
      },
    },
  };
}

export function buildOnChainSupportingIntelligenceFromEvidence(fundamentalEvidence) {
  const resolved = resolveOnChainEvidence(fundamentalEvidence);
  const { coinMetrics, protocol, diagnostics } = resolved;

  const families = buildFamilies({ coinMetrics, protocol });
  const onChain = aggregateFamilies(families);

  const timestamps = [
    coinMetrics?.observedAt,
    coinMetrics?.fetchedAt,
    fundamentalEvidence?.onChainEvidence?.fetchedAt,
    fundamentalEvidence?.fetchedAt,
  ]
    .filter(Boolean)
    .map((x) => Date.parse(x))
    .filter(Number.isFinite);

  const newest = timestamps.length
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;

  const sources = [];
  if (coinMetrics && (
    coinMetrics?.approved === true ||
    Object.keys(coinMetrics?.metrics ?? {}).length > 0 ||
    Object.keys(coinMetrics?.trends ?? {}).length > 0 ||
    Object.keys(coinMetrics?.derived ?? {}).length > 0
  )) {
    sources.push("COIN_METRICS");
  }
  if (hasMeaningfulProtocolEvidence(protocol)) {
    sources.push("DEFILLAMA_PROTOCOLS");
  }

  return {
    onChain,
    families,
    diagnostics: {
      ...diagnostics,
      sourceList: sources,
      familyCounts: onChain?.evidence?.familyCounts ?? {
        available: 0,
        unavailable: Object.values(families)
          .filter((family) => family?.status === "UNAVAILABLE").length,
        notApplicable: Object.values(families)
          .filter((family) => family?.status === "NOT_APPLICABLE").length,
        applicable: Object.values(families)
          .filter((family) => family?.status !== "NOT_APPLICABLE").length,
        total: Object.keys(families).length,
      },
      reason: onChain
        ? null
        : coinMetrics
          ? "COIN_METRICS_PRESENT_BUT_NO_SCORABLE_ON_CHAIN_FAMILIES"
          : protocol
            ? "PROTOCOL_PRESENT_BUT_NO_SCORABLE_ON_CHAIN_FAMILIES"
            : "NO_SUPPORTED_ON_CHAIN_PROVIDER_PAYLOAD",
    },
    freshness: {
      source: sources.join("+") || null,
      fetchedAt: newest,
      sourceTimestamp: newest,
      timestampAuthority: "MULTI_PROVIDER_EVIDENCE_TIME",
    },
  };
}

/* Legacy bulk-snapshot compatibility. */
function scoreIntegrity(e) {
  const m=e?.market,p=e?.protocol;
  if(!m&&!p)return null;
  let s=55,signals=0; const flags=[];
  const mc=finite(m?.marketCapUsd),vol=finite(m?.volume24hUsd),fdv=finite(m?.fdvUsd);
  if(mc!==null){s+=10;signals++;}
  if(vol!==null&&mc>0){s+=vol/mc>=.02?10:-5;signals++;}
  if(mc>0&&fdv!==null){const r=fdv/mc;if(r>5){s-=20;flags.push("EXTREME_FDV_DILUTION");}else if(r<=2)s+=8;signals++;}
  if(p?.category){s+=7;signals++;}
  return signals?{score:clamp(s),evidence:{criticalFlags:flags,marketCapUsd:mc,fdvUsd:fdv,volume24hUsd:vol}}:null;
}
function scoreHistorical(e){
  const m=e?.market;if(!m)return null;
  const vals=[finite(m.change1hPercent),finite(m.change24hPercent),finite(m.change7dPercent)].filter(v=>v!==null);
  if(!vals.length)return null;
  const momentum=vals.reduce((a,b)=>a+b,0)/vals.length;
  return {score:clamp(55+Math.max(-20,Math.min(20,momentum))*1.2),evidence:{momentum}};
}
export function buildCandidateSupportingIntelligence(candidate,fundamentalSnapshot){
  const i=fundamentalSnapshot?.index;if(!i)return{};
  const id=norm(candidate?.assetId??candidate?.coinGeckoId),sym=norm(candidate?.symbol);
  const market=(id?i.byId?.get(id):null)??(sym?i.bySymbol?.get(sym):null)??null;
  const protocol=(market?.id?i.llamaByGecko?.get(norm(market.id)):id?i.llamaByGecko?.get(id):null)??(sym?i.llamaBySymbol?.get(sym):null)??null;
  const families=buildFamilies({protocol});
  return {onChain:aggregateFamilies(families),projectIntegrity:scoreIntegrity({market,protocol}),historical:scoreHistorical({market})};
}
export default buildCandidateSupportingIntelligence;
