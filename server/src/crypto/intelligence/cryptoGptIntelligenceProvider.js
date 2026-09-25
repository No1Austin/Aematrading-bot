/**
 * AEMA CRYPTO — GPT INTELLIGENCE PROVIDER
 * Phase 6.48 — GPT request timeout 45s — 15s bounded web-research request.\n * One cached web-research snapshot feeds News, Events and Social/Narrative.
 * Research only. No execution authority.
 */

const cache = new Map();

const MODEL =
  process.env.AEMA_GPT_INTELLIGENCE_MODEL ||
  "gpt-5.6-luna";

const CACHE_MS =
  Number(process.env.AEMA_GPT_INTELLIGENCE_CACHE_MS) ||
  15 * 60 * 1000;

const MAX_FRESH_AGE_MS =
  Number(process.env.AEMA_GPT_INTELLIGENCE_MAX_FRESH_AGE_MS) ||
  CACHE_MS;

const REQUEST_TIMEOUT_MS =
  Math.max(
    1000,
    Number(
      process.env.AEMA_GPT_INTELLIGENCE_REQUEST_TIMEOUT_MS ??
      45000,
    ) || 45000,
  );

function freshnessFromGeneratedAt(generatedAt, now = Date.now()) {
  const timestamp = Date.parse(String(generatedAt ?? ""));

  if (!Number.isFinite(timestamp)) {
    return {
      fresh: false,
      ageMs: null,
      maxAgeMs: MAX_FRESH_AGE_MS,
      reason: "GENERATED_AT_MISSING_OR_INVALID",
    };
  }

  const ageMs = Math.max(0, now - timestamp);

  return {
    fresh: ageMs <= MAX_FRESH_AGE_MS,
    ageMs,
    maxAgeMs: MAX_FRESH_AGE_MS,
    reason:
      ageMs <= MAX_FRESH_AGE_MS
        ? null
        : "GPT_INTELLIGENCE_STALE",
  };
}

function applyFreshnessContract(value, now = Date.now()) {
  const freshness =
    freshnessFromGeneratedAt(value?.generatedAt, now);

  const gateBucket = bucket => {
    const normalized = normalizeBucket(bucket);

    if (freshness.fresh) {
      return {
        ...normalized,
        freshness,
      };
    }

    return {
      available: false,
      score: null,
      confidence: 0,
      coverage: 0,
      evidenceCoverage: 0,
      coverageAuthority:
        normalized.coverageAuthority,
      summary: normalized.summary,
      evidence: normalized.evidence,
      warnings: [
        ...normalized.warnings,
        freshness.reason,
      ].filter(Boolean),
      freshness,
    };
  };

  return {
    ...value,
    freshness,
    news: gateBucket(value?.news),
    events: gateBucket(value?.events),
    socialNarrative:
      gateBucket(value?.socialNarrative),
  };
}

function clamp(value) {
  const n = Number(value);
  return Number.isFinite(n)
    ? Math.min(100, Math.max(0, n))
    : null;
}

function normalizeBucket(value = {}) {
  const score = clamp(value?.score);

  /*
   * Phase 6.46 — explicit Supporting evidence coverage.
   *
   * Coverage is supplied by the research response itself and normalized here.
   * It is never inferred from evidence count, availability, score or confidence.
   * Missing/invalid coverage fails closed to 0 represented evidence.
   */
  const coverage =
    clamp(
      value?.coverage ??
      value?.evidenceCoverage,
    ) ?? 0;

  return {
    available:
      value?.available === true &&
      score !== null,

    score,

    confidence:
      clamp(value?.confidence) ?? 0,

    coverage,

    evidenceCoverage:
      coverage,

    coverageAuthority:
      "GPT_EXPLICIT_RESEARCH_COVERAGE",

    summary:
      String(value?.summary ?? "").trim() ||
      null,

    evidence:
      Array.isArray(value?.evidence)
        ? value.evidence
        : [],

    warnings:
      Array.isArray(value?.warnings)
        ? value.warnings
        : [],
  };
}

function cacheKey(asset = {}) {
  return [
    asset?.assetId,
    asset?.symbol,
    asset?.network,
    asset?.contractAddress,
  ]
    .map(value =>
      String(value ?? "")
        .trim()
        .toLowerCase(),
    )
    .join("|");
}

function extractSources(response) {
  const sources = [];

  for (const item of response?.output ?? []) {
    if (item?.type !== "web_search_call") {
      continue;
    }

    for (const source of item?.action?.sources ?? []) {
      sources.push({
        title: source?.title ?? null,
        url: source?.url ?? null,
        type: source?.type ?? null,
      });
    }
  }

  const seen = new Set();

  return sources.filter(source => {
    const key =
      source?.url ??
      `${source?.title}|${source?.type}`;

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}


function extractOutputText(
  response,
) {
  if (
    typeof response?.output_text ===
      "string" &&
    response.output_text.trim()
  ) {
    return response.output_text;
  }

  const parts = [];

  for (
    const item of
      response?.output ?? []
  ) {
    if (
      item?.type !== "message"
    ) {
      continue;
    }

    for (
      const content of
        item?.content ?? []
    ) {
      if (
        content?.type ===
          "output_text" &&
        typeof content?.text ===
          "string"
      ) {
        parts.push(
          content.text,
        );
      }
    }
  }

  return parts
    .join("\n")
    .trim();
}


function parseOutput(value) {
  const raw =
    String(value ?? "").trim();

  if (!raw) {
    throw new Error(
      "GPT_INTELLIGENCE_EMPTY_RESPONSE",
    );
  }

  try {
    return JSON.parse(raw);
  } catch {
    const match =
      raw.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error(
        "GPT_INTELLIGENCE_INVALID_JSON",
      );
    }

    return JSON.parse(match[0]);
  }
}

async function requestIntelligence(asset) {
  const apiKey =
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY_REQUIRED",
    );
  }

  if (
    String(
      process.env
        .AEMA_GPT_INTELLIGENCE_ENABLED ??
      "true",
    ).toLowerCase() === "false"
  ) {
    throw new Error(
      "GPT_INTELLIGENCE_DISABLED",
    );
  }

  const identity = {
    symbol:
      asset?.symbol ?? null,

    name:
      asset?.name ?? null,

    assetId:
      asset?.assetId ?? null,

    network:
      asset?.network ?? null,

    contractAddress:
      asset?.contractAddress ?? null,
  };

  const instructions = `
You are AEMA Crypto's evidence-research layer.

Research CURRENT web information about the exact crypto asset supplied.
Use web search and independently produce NEWS, EVENTS, and SOCIAL/NARRATIVE evidence.

Rules:
- Model memory is not evidence.
- Never invent claims, sources, dates or social activity.
- Prefer primary sources: regulators, government, official project material,
  exchange announcements, filings and protocol documentation.
- Prefer established financial/news sources over aggregators.
- Social/narrative means publicly verifiable web-visible discussion. Never claim
  comprehensive access to X, Telegram, Reddit or private communities.
- Watch for symbol collisions. Evidence must concern this exact asset.
- Distinguish publication date from event date.
- Identify contradictions and corroboration.
- score is 0..100 directional evidence. 50 means genuinely balanced evidence,
  never missing-data fallback.
- If evidence is inadequate: available=false and score=null.
- confidence is 0..100 based on source quality, recency, diversity and corroboration.
- coverage is 0..100 and measures how completely the CURRENT web research represents the requested evidence domain for this exact asset.
- Coverage is NOT confidence, NOT sentiment strength, NOT evidence count, and NOT availability.
- Base coverage on whether the search found sufficiently recent, identity-matched, source-diverse and corroborated evidence for the domain.
- Reduce coverage for narrow source diversity, weak corroboration, stale material, identity ambiguity, material contradictions, or important evidence gaps.
- Never infer full coverage merely because evidence exists. If coverage cannot be established, return 0.
- Do not provide trading advice, entries, exits, position sizes or execution instructions.
- Return ONLY valid JSON.

Return:
{
  "news": {
    "available": boolean,
    "score": number|null,
    "confidence": number,
    "coverage": number,
    "summary": string|null,
    "evidence": [{
      "claim": string,
      "stance": "POSITIVE"|"NEGATIVE"|"NEUTRAL",
      "sourceTitle": string|null,
      "sourceUrl": string|null,
      "publishedAt": string|null,
      "eventAt": string|null,
      "sourceClass": "PRIMARY"|"HIGH_QUALITY"|"SECONDARY"|"SOCIAL"|"UNKNOWN",
      "corroborated": boolean
    }],
    "warnings": [string]
  },
  "events": {
    "available": boolean,
    "score": number|null,
    "confidence": number,
    "coverage": number,
    "summary": string|null,
    "evidence": [{
      "claim": string,
      "stance": "POSITIVE"|"NEGATIVE"|"NEUTRAL",
      "sourceTitle": string|null,
      "sourceUrl": string|null,
      "publishedAt": string|null,
      "eventAt": string|null,
      "sourceClass": "PRIMARY"|"HIGH_QUALITY"|"SECONDARY"|"SOCIAL"|"UNKNOWN",
      "corroborated": boolean
    }],
    "warnings": [string]
  },
  "socialNarrative": {
    "available": boolean,
    "score": number|null,
    "confidence": number,
    "coverage": number,
    "summary": string|null,
    "evidence": [{
      "claim": string,
      "stance": "POSITIVE"|"NEGATIVE"|"NEUTRAL",
      "sourceTitle": string|null,
      "sourceUrl": string|null,
      "publishedAt": string|null,
      "eventAt": string|null,
      "sourceClass": "PRIMARY"|"HIGH_QUALITY"|"SECONDARY"|"SOCIAL"|"UNKNOWN",
      "corroborated": boolean
    }],
    "warnings": [string]
  },
  "contradictions": [string]
}`;

  const controller = new AbortController();
  const requestTimeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  let response;

  try {
    response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          Authorization:
            `Bearer ${apiKey}`,

          "Content-Type":
            "application/json",
        },

        signal: controller.signal,

        body: JSON.stringify({
          model: MODEL,

          tools: [
            {
              type: "web_search",
            },
          ],

          include: [
            "web_search_call.action.sources",
          ],

          instructions,

          input:
            `Research this crypto asset now: ${JSON.stringify(identity)}`,
        }),
      },
    );
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("GPT_INTELLIGENCE_TIMEOUT");
    }
    throw error;
  } finally {
    clearTimeout(requestTimeoutId);
  }

  const body =
    await response
      .json()
      .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `OPENAI_RESPONSES_${response.status}: ${
        body?.error?.message ??
        "Request failed"
      }`,
    );
  }

  const outputText =
  extractOutputText(
    body,
  );

if (!outputText) {
  console.error(
    "GPT RESPONSE DIAGNOSTIC:",
    JSON.stringify(
      {
        id:
          body?.id ??
          null,

        status:
          body?.status ??
          null,

        model:
          body?.model ??
          null,

        error:
          body?.error ??
          null,

        incompleteDetails:
          body?.incomplete_details ??
          null,

        outputTypes:
          Array.isArray(
            body?.output,
          )
            ? body.output.map(
                item =>
                  item?.type ??
                  null,
              )
            : [],
      },
      null,
      2,
    ),
  );

  throw new Error(
    "GPT_INTELLIGENCE_EMPTY_RESPONSE",
  );
}

const parsed =
  parseOutput(
    outputText,
  );

  return {
    approved: true,
    status: "COMPLETE",
    provider:
      "OPENAI_WEB_RESEARCH",
    model: MODEL,
    asset: identity,
    generatedAt:
      new Date().toISOString(),

    news:
      normalizeBucket(
        parsed?.news,
      ),

    events:
      normalizeBucket(
        parsed?.events,
      ),

    socialNarrative:
      normalizeBucket(
        parsed?.socialNarrative,
      ),

    contradictions:
      Array.isArray(
        parsed?.contradictions,
      )
        ? parsed.contradictions
        : [],

    sources:
      extractSources(body),

    executionAuthority:
      false,

    liveExecution:
      false,
  };
}

export async function getCryptoGptIntelligence(
  asset,
  {
    refresh = false,
    cacheMs = CACHE_MS,
  } = {},
) {
  if (
    !asset?.symbol &&
    !asset?.assetId &&
    !asset?.contractAddress
  ) {
    throw new Error(
      "CRYPTO_ASSET_REQUIRED",
    );
  }

  const key =
    cacheKey(asset);

  const now =
    Date.now();

  const existing =
    cache.get(key);

  if (
    !refresh &&
    existing?.value &&
    now - existing.createdAt <
      cacheMs
  ) {
    return {
      ...applyFreshnessContract(
        existing.value,
        now,
      ),

      cache: {
        hit: true,
        ageMs:
          now -
          existing.createdAt,
      },
    };
  }

  if (
    !refresh &&
    existing?.promise
  ) {
    return existing.promise;
  }

  const promise =
    requestIntelligence(asset)
      .then(value => {
        cache.set(
          key,
          {
            value,
            createdAt:
              Date.now(),
            promise:
              null,
          },
        );

        return {
          ...applyFreshnessContract(
            value,
            Date.now(),
          ),

          cache: {
            hit: false,
            ageMs: 0,
          },
        };
      })
      .catch(error => {
        cache.delete(key);
        throw error;
      });

  cache.set(
    key,
    {
      value:
        existing?.value ??
        null,

      createdAt:
        existing?.createdAt ??
        0,

      promise,
    },
  );

  return promise;
}


/**
 * Phase 5.50 scan-level intelligence helper.
 *
 * Produces one cached GPT/web-research snapshot for an asset.
 * Consumers should pass the returned intelligence object through
 * the scanner context rather than requesting it independently.
 */
export async function buildCryptoScannerGptIntelligence(
  asset,
  options = {},
) {
  try {
    const intelligence =
      await getCryptoGptIntelligence(
        asset,
        options,
      );

    return {
      approved: true,
      status:
        "GPT_INTELLIGENCE_READY",
      intelligence,
      error:
        null,
    };
  } catch (error) {
    return {
      approved: false,
      status:
        "GPT_INTELLIGENCE_UNAVAILABLE",
      intelligence:
        null,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
  }
}



/**
 * Read-only dashboard feed built ONLY from intelligence already present
 * in the shared GPT cache. This function never triggers a GPT request.
 */
export function getCachedCryptoNewsFeed({
  limit = 12,
  maximumAgeMs = MAX_FRESH_AGE_MS,
} = {}) {
  const now = Date.now();
  const rows = [];

  for (const [key, entry] of cache.entries()) {
    const value = entry?.value;
    const news = value?.news;

    if (!value || !news || news?.available !== true) continue;

    const generatedAt = value?.generatedAt ?? null;
    const generatedAtMs = Date.parse(String(generatedAt ?? ""));

    if (
      !Number.isFinite(generatedAtMs) ||
      now - generatedAtMs > maximumAgeMs
    ) {
      continue;
    }

    const asset = value?.asset ?? {};
    const evidence = Array.isArray(news?.evidence)
      ? news.evidence
      : [];

    for (const item of evidence) {
      const headline =
        String(item?.claim ?? "").trim();

      if (!headline) continue;

      rows.push({
        id: [
          asset?.assetId ?? asset?.symbol ?? key,
          item?.sourceUrl ?? item?.sourceTitle ?? headline,
          item?.publishedAt ?? generatedAt,
        ].join("|"),

        symbol: asset?.symbol ?? null,
        assetName: asset?.name ?? null,
        assetId: asset?.assetId ?? null,
        network: asset?.network ?? null,

        headline,
        summary:
          String(news?.summary ?? "").trim() ||
          null,

        stance:
          item?.stance ?? "NEUTRAL",

        sourceTitle:
          item?.sourceTitle ?? null,

        sourceUrl:
          item?.sourceUrl ?? null,

        sourceClass:
          item?.sourceClass ?? "UNKNOWN",

        publishedAt:
          item?.publishedAt ?? null,

        eventAt:
          item?.eventAt ?? null,

        generatedAt,

        corroborated:
          item?.corroborated === true,

        confidence:
          Number.isFinite(Number(news?.confidence))
            ? Number(news.confidence)
            : 0,

        coverage:
          Number.isFinite(Number(news?.coverage))
            ? Number(news.coverage)
            : 0,

        provider:
          value?.provider ?? "OPENAI_WEB_RESEARCH",
      });
    }
  }

  const seen = new Set();

  return rows
    .sort((a, b) => {
      const aTime =
        Date.parse(String(a?.publishedAt ?? a?.eventAt ?? a?.generatedAt ?? "")) || 0;
      const bTime =
        Date.parse(String(b?.publishedAt ?? b?.eventAt ?? b?.generatedAt ?? "")) || 0;

      if (bTime !== aTime) return bTime - aTime;

      if (a.corroborated !== b.corroborated) {
        return Number(b.corroborated) - Number(a.corroborated);
      }

      return Number(b.confidence ?? 0) - Number(a.confidence ?? 0);
    })
    .filter(item => {
      const dedupeKey =
        String(item?.sourceUrl ?? item?.headline ?? "")
          .trim()
          .toLowerCase();

      if (!dedupeKey || seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 12)));
}

export default
  getCryptoGptIntelligence;
