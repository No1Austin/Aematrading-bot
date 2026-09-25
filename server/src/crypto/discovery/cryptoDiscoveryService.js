/**
 * ============================================================
 * AEMA CRYPTO DISCOVERY SERVICE — PHASE 6.4
 * ============================================================
 *
 * Purpose
 * -------
 * Build the Discovery command-center dataset WITHOUT invoking the
 * six-engine scanner. Discovery remains upstream of deep research.
 *
 * Pipeline
 * --------
 * universe -> measurements -> deterministic qualification
 * -> ranked CEX/DEX pools -> bounded GPT trend enrichment
 * -> discovery lists / research queue
 *
 * GPT never grants eligibility, bot authority or execution authority.
 */

import { getCryptoUniverse } from "../universe/cryptoUniverseProvider.js";
import { buildCryptoMeasurements } from "../scanner/cryptoMeasurementProvider.js";
import qualifyCryptoCandidate from "../scanner/cryptoCandidateQualificationEngine.js";
import { buildCryptoDiscoveryIntelligence } from "../analysis/cryptoDiscoveryIntelligence.js";
import { buildCryptoScannerGptIntelligence } from "../intelligence/cryptoGptIntelligenceProvider.js";
import { CRYPTO_SCANNER_CONFIG } from "../scanner/cryptoScannerConfig.js";
import { CRYPTO_CANDIDATE_TYPE } from "../policy/cryptoCandidateActionPolicy.js";

const CACHE_MS = Number(process.env.AEMA_DISCOVERY_CACHE_MS) || 5 * 60 * 1000;
const GPT_CEX_LIMIT = Number(process.env.AEMA_DISCOVERY_GPT_CEX_LIMIT) || 8;
const GPT_DEX_LIMIT = Number(process.env.AEMA_DISCOVERY_GPT_DEX_LIMIT) || 12;
const GPT_CONCURRENCY = Math.max(1, Number(process.env.AEMA_DISCOVERY_GPT_CONCURRENCY) || 3);

let cache = null;
let inFlight = null;

const finite = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const finiteOrNull = value => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const clamp = value => Math.min(100, Math.max(0, finite(value)));

function keyFor(candidate) {
  return String(candidate?.assetId ?? candidate?.symbol ?? "").trim().toLowerCase();
}

function marketQualityScore(candidate) {
  // Preserve the deterministic scanner score as the canonical discovery
  // market-quality score. GPT does not replace hard qualification.
  return clamp(candidate?.scannerScore);
}

function gptTrendScore(intelligence) {
  const buckets = [
    [intelligence?.socialNarrative, 0.40],
    [intelligence?.news, 0.35],
    [intelligence?.events, 0.25],
  ].filter(([bucket]) => bucket?.available === true && finiteOrNull(bucket?.score) !== null);

  if (!buckets.length) {
    return { available: false, score: null, confidence: 0, coverage: 0 };
  }

  const availableWeight = buckets.reduce((sum, [, weight]) => sum + weight, 0);
  const score = buckets.reduce(
    (sum, [bucket, weight]) => sum + Number(bucket.score) * weight,
    0,
  ) / availableWeight;
  const confidence = buckets.reduce(
    (sum, [bucket, weight]) => sum + finite(bucket.confidence) * weight,
    0,
  ) / availableWeight;

  return {
    available: true,
    score: Math.round(score * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    coverage: Math.round((availableWeight / 1.0) * 10000) / 100,
  };
}

function activity(candidate) {
  const m = candidate?.measurements ?? {};
  const buys = finite(m?.buys24h ?? m?.buys);
  const sells = finite(m?.sells24h ?? m?.sells);
  const transactions = finite(m?.transactions24h ?? m?.txns24h ?? m?.transactions);
  const uniqueTraders = finiteOrNull(m?.uniqueTraders24h ?? m?.uniqueTraders);

  return {
    buys,
    sells,
    transactions,
    uniqueTraders,
    multipleTradersVerified: uniqueTraders !== null ? uniqueTraders > 1 : null,
  };
}

function compactCandidate(candidate) {
  const m = candidate?.measurements ?? {};
  const intel = candidate?.intelligence ?? null;
  const gpt = candidate?.gptDiscoveryIntelligence ?? null;
  const trend = candidate?.trendIntelligence ?? { available: false, score: null, confidence: 0, coverage: 0 };

  return {
    assetId: candidate?.assetId ?? null,
    symbol: candidate?.symbol ?? null,
    name: candidate?.name ?? null,
    candidateType: candidate?.candidateType ?? null,
    discoveryStatus: candidate?.discoveryStatus ?? null,
    eligible: candidate?.eligible === true,
    qualified: candidate?.qualified === true,
    highInterest: candidate?.highInterest === true,
    preferredDirection: candidate?.preferredDirection ?? null,
    discoveryScore: marketQualityScore(candidate),
    scannerScore: candidate?.scannerScore ?? null,
    directionEdge: candidate?.directionEdge ?? null,
    priceUsd: finiteOrNull(m?.priceUsd),
    volume24hUsd: finiteOrNull(m?.volume24hUsd),
    liquidityUsd: finiteOrNull(m?.liquidityUsd),
    change1hPercent: finiteOrNull(m?.change1hPercent),
    change24hPercent: finiteOrNull(m?.change24hPercent),
    change7dPercent: finiteOrNull(m?.change7dPercent),
    marketCapUsd: finiteOrNull(m?.marketCapUsd),
    venueCount: finite(m?.venueCount),
    cexCount: finite(m?.cexCount),
    dexCount: finite(m?.dexCount),
    primaryVenue: m?.primaryVenue ?? null,
    exchanges: Array.isArray(m?.exchanges) ? m.exchanges : [],
    network: m?.network ?? null,
    contractAddress: m?.contractAddress ?? null,
    activity: activity(candidate),
    deterministicIntelligence: intel,
    trendIntelligence: trend,
    gpt: gpt
      ? {
          status: candidate?.gptDiscoveryStatus ?? "READY",
          news: gpt.news ?? null,
          events: gpt.events ?? null,
          socialNarrative: gpt.socialNarrative ?? null,
          contradictions: gpt.contradictions ?? [],
          sources: gpt.sources ?? [],
          generatedAt: gpt.generatedAt ?? null,
          cache: gpt.cache ?? null,
        }
      : null,
    deepResearchEligible: candidate?.deepResearchEligible === true,
    botEligible: false,
    executionEligible: false,
    researchOnly: true,
  };
}

function rankMarketQuality(rows) {
  return [...rows].sort((a, b) =>
    marketQualityScore(b) - marketQualityScore(a) ||
    finite(b?.measurements?.volume24hUsd) - finite(a?.measurements?.volume24hUsd) ||
    finite(b?.measurements?.liquidityUsd) - finite(a?.measurements?.liquidityUsd)
  );
}

function rankEmerging(rows) {
  return [...rows].sort((a, b) => {
    const bt = b?.trendIntelligence?.available ? finite(b.trendIntelligence.score) : -1;
    const at = a?.trendIntelligence?.available ? finite(a.trendIntelligence.score) : -1;
    return bt - at ||
      finite(b?.measurements?.volume24hUsd) - finite(a?.measurements?.volume24hUsd) ||
      finite(b?.measurements?.liquidityUsd) - finite(a?.measurements?.liquidityUsd) ||
      marketQualityScore(b) - marketQualityScore(a);
  });
}

async function mapConcurrent(rows, limit, worker) {
  const output = new Array(rows.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, rows.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= rows.length) break;
      output[index] = await worker(rows[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

async function enrichWithGpt(candidate) {
  const asset = candidate?.measurements ?? candidate;
  const result = await buildCryptoScannerGptIntelligence(asset);

  if (result?.approved !== true || !result?.intelligence) {
    return {
      ...candidate,
      gptDiscoveryStatus: result?.status ?? "GPT_INTELLIGENCE_UNAVAILABLE",
      gptDiscoveryError: result?.error ?? null,
      gptDiscoveryIntelligence: null,
      trendIntelligence: { available: false, score: null, confidence: 0, coverage: 0 },
    };
  }

  return {
    ...candidate,
    gptDiscoveryStatus: result.status,
    gptDiscoveryError: null,
    gptDiscoveryIntelligence: result.intelligence,
    trendIntelligence: gptTrendScore(result.intelligence),
  };
}

async function buildDiscovery({ refreshUniverse = false, refresh = false } = {}) {
  const startedAt = new Date().toISOString();

  const universe = await getCryptoUniverse({
    refresh: refreshUniverse,
    maximumAssets: CRYPTO_SCANNER_CONFIG.cycle.maximumUniverseAssets,
    includeDexDiscovery: true,
  });

  const measurements = buildCryptoMeasurements({ assets: universe?.assets ?? [] });

  const qualified = measurements
    .map(measurement => {
      const intelligence = buildCryptoDiscoveryIntelligence(measurement);
      const enrichedMeasurement = {
        ...measurement,
        discoveryIntelligence: intelligence,
        integrity: {
          score: intelligence?.projectIntegrity?.score ?? null,
          criticalFlags: intelligence?.projectIntegrity?.criticalFlags ?? [],
        },
      };
      const candidate = qualifyCryptoCandidate(enrichedMeasurement);
      return {
        ...candidate,
        intelligence,
      };
    })
    .filter(candidate => candidate?.qualified === true);

  const cexPool = rankMarketQuality(
    qualified.filter(candidate => candidate?.candidateType === CRYPTO_CANDIDATE_TYPE.CEX),
  );
  const dexPool = rankMarketQuality(
    qualified.filter(candidate => candidate?.candidateType === CRYPTO_CANDIDATE_TYPE.EMERGING),
  );

  // GPT is intentionally bounded. We do not web-research the entire universe.
  const gptShortlist = [
    ...cexPool.slice(0, GPT_CEX_LIMIT),
    ...dexPool.slice(0, GPT_DEX_LIMIT),
  ];

  const enrichedShortlist = await mapConcurrent(
    gptShortlist,
    GPT_CONCURRENCY,
    enrichWithGpt,
  );

  const enrichedByKey = new Map(enrichedShortlist.map(candidate => [keyFor(candidate), candidate]));
  const merge = candidate => enrichedByKey.get(keyFor(candidate)) ?? {
    ...candidate,
    gptDiscoveryStatus: "NOT_REQUESTED",
    gptDiscoveryIntelligence: null,
    trendIntelligence: { available: false, score: null, confidence: 0, coverage: 0 },
  };

  const cex = cexPool.map(merge);
  const dex = dexPool.map(merge);
  const all = rankMarketQuality([...cex, ...dex]);

  const top20Overall = all.slice(0, 20).map(compactCandidate);
  const top20Cex = cex.slice(0, 20).map(compactCandidate);
  const top20Dex = dex.slice(0, 20).map(compactCandidate);

  const emergingDexTrends = rankEmerging(
    dex.filter(candidate =>
      candidate?.trendIntelligence?.available === true &&
      finite(candidate?.measurements?.volume24hUsd) >= CRYPTO_SCANNER_CONFIG.hardEligibility.minimum24hVolumeUsd &&
      finite(candidate?.measurements?.liquidityUsd) >= CRYPTO_SCANNER_CONFIG.hardEligibility.minimumLiquidityUsd
    ),
  )
    .slice(0, 20)
    .map(compactCandidate);

  // This is a queue, not an approval to execute. The existing six-engine scanner
  // remains the next stage and decides research results independently.
  const researchQueue = rankMarketQuality(
    all.filter(candidate => candidate?.deepResearchEligible === true),
  )
    .slice(0, CRYPTO_SCANNER_CONFIG.discovery.maximumCandidates)
    .map(compactCandidate);

  const result = {
    approved: true,
    status: universe?.status ?? "COMPLETE",
    pipeline: "DISCOVERY_QUALIFICATION",
    universe: {
      assetCount: universe?.assetCount ?? measurements.length,
      providers: universe?.providers ?? {},
      composition: universe?.composition ?? {},
    },
    qualification: {
      measured: measurements.length,
      qualified: qualified.length,
      cexQualified: cex.length,
      dexQualified: dex.length,
      highInterest: qualified.filter(candidate => candidate?.highInterest === true).length,
    },
    gpt: {
      enabled: String(process.env.AEMA_GPT_INTELLIGENCE_ENABLED ?? "true").toLowerCase() !== "false",
      shortlisted: gptShortlist.length,
      cexLimit: GPT_CEX_LIMIT,
      dexLimit: GPT_DEX_LIMIT,
      concurrency: GPT_CONCURRENCY,
      note: "GPT enriches a bounded shortlist; it never overrides hard eligibility.",
    },
    top20Overall,
    top20Cex,
    top20Dex,
    emergingDexTrends,
    researchQueue,
    warnings: universe?.warnings ?? [],
    errors: universe?.errors ?? [],
    researchOnly: true,
    executionAuthority: false,
    liveExecution: false,
    startedAt,
    completedAt: new Date().toISOString(),
  };

  cache = { value: result, createdAt: Date.now() };
  return result;
}

export async function getCryptoDiscoveryOverview({ refresh = false, refreshUniverse = false } = {}) {
  const now = Date.now();
  if (!refresh && cache?.value && now - cache.createdAt < CACHE_MS) {
    return {
      ...cache.value,
      cache: { hit: true, ageMs: now - cache.createdAt },
    };
  }

  if (!refresh && inFlight) return inFlight;

  inFlight = buildDiscovery({ refreshUniverse, refresh })
    .then(value => ({ ...value, cache: { hit: false, ageMs: 0 } }))
    .finally(() => { inFlight = null; });

  return inFlight;
}

export function getCryptoDiscoveryCacheStatus() {
  return {
    cached: Boolean(cache?.value),
    ageMs: cache?.createdAt ? Date.now() - cache.createdAt : null,
    ttlMs: CACHE_MS,
    inFlight: Boolean(inFlight),
  };
}

export function clearCryptoDiscoveryCache() {
  cache = null;
}

export default getCryptoDiscoveryOverview;
