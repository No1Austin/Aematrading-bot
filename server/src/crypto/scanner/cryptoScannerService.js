/**
 * ============================================================
 * AEMA CRYPTO
 * CRYPTO TOKEN SCANNER SERVICE
 * Phase 6.11 — scanner GPT 45s timeout propagation
 * ============================================================
 *
 * Purpose:
 * - accept a crypto symbol, pair, or contract-address query
 * - run the asset through configured research engines
 * - preserve evidence availability explicitly
 * - never fabricate market / on-chain / news data
 * - use neutral midpoint scoring only when evidence is unavailable
 * - aggregate engine results into one research score
 *
 * IMPORTANT:
 * - research only
 * - no execution authority
 * - no live execution
 */

import runCryptoValuationEngine
  from "../analysis/cryptoValuationEngine.js";

import {
  researchCryptoCandidate,
} from "./cryptoScanner.js";

const DEFAULT_NEUTRAL_SCORE = 50;

const DEFAULT_ENGINE_WEIGHTS = {
  momentum: 0.20,
  liquidity: 0.20,
  onChain: 0.18,
  narrative: 0.12,
  news: 0.12,
  risk: 0.18,
};

const ENGINE_KEYS =
  Object.freeze([
    "momentum",
    "liquidity",
    "onChain",
    "narrative",
    "news",
    "risk",
  ]);


function nowIso() {
  return new Date()
    .toISOString();
}


function elapsedMs(startedAt) {
  return Math.max(0, Date.now() - startedAt);
}

async function runValuationWithBudget(context, metadata) {
  /*
   * Valuation has 0% canonical weight. It must never hold the canonical
   * Technical/Fundamental/Supporting response open for a slow provider.
   */
  const timeoutMs =
    Math.max(
      500,
      Number(
        process.env.CRYPTO_VALUATION_TIMEOUT_MS ??
        2500,
      ) || 2500,
    );

  let timeoutId = null;

  try {
    const timeoutPromise =
      new Promise((_, reject) => {
        timeoutId =
          setTimeout(
            () =>
              reject(
                new Error(
                  "VALUATION_TIMEOUT",
                ),
              ),
            timeoutMs,
          );
      });

    return await Promise.race([
      runCryptoValuationEngine({
        ...context,
        metadata: clone(metadata),
      }),
      timeoutPromise,
    ]);
  } catch (error) {
    return {
      approved: true,
      status: "EVIDENCE_UNAVAILABLE",
      score: DEFAULT_NEUTRAL_SCORE,
      confidence: 0,
      canonicalWeight: 0,
      affectsCanonicalScore: false,
      availability: {
        available: false,
        source: "CRYPTO_VALUATION",
        reason:
          error instanceof Error
            ? error.message
            : "VALUATION_UNAVAILABLE",
        evidenceCount: 0,
      },
      evidence: [],
      warnings: [
        error instanceof Error
          ? error.message
          : "VALUATION_UNAVAILABLE",
      ],
      errors: [],
      researchOnly: true,
      executionAuthority: false,
      liveExecution: false,
    };
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}


function finite(
  value,
  fallback = null,
) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}


function clampScore(
  value,
  fallback = DEFAULT_NEUTRAL_SCORE,
) {
  const number =
    finite(
      value,
      fallback,
    );

  return Math.max(
    0,
    Math.min(
      100,
      number,
    ),
  );
}


function normalizeQuery(
  value,
) {
  return String(
    value ?? "",
  )
    .trim();
}


function normalizeSymbol(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}


function normalizeStatus(
  value,
) {
  return String(
    value ?? "",
  )
    .trim()
    .toUpperCase();
}


function clone(
  value,
) {
  if (
    value === undefined
  ) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value),
  );
}


function isContractLike(
  query,
) {
  const value =
    normalizeQuery(
      query,
    );

  if (
    !value
  ) {
    return false;
  }

  if (
    /^0x[a-fA-F0-9]{40}$/.test(
      value,
    )
  ) {
    return true;
  }

  if (
    value.length >= 32 &&
    !/\s/.test(value)
  ) {
    return true;
  }

  return false;
}


function inferSymbol(
  query,
) {
  const normalized =
    normalizeQuery(
      query,
    );

  if (
    !normalized
  ) {
    return "";
  }

  if (
    isContractLike(
      normalized,
    )
  ) {
    return normalized;
  }

  return normalizeSymbol(
    normalized
      .replace(
        /[^A-Za-z0-9/_-]/g,
        "",
      ),
  );
}


function availabilityRecord({
  available = false,
  source = null,
  reason = null,
  evidenceCount = 0,
} = {}) {
  return {
    available:
      Boolean(
        available,
      ),

    source:
      source ??
      null,

    reason:
      reason ??
      (
        available
          ? null
          : "EVIDENCE_UNAVAILABLE"
      ),

    evidenceCount:
      Math.max(
        0,
        Number(
          evidenceCount,
        ) || 0,
      ),
  };
}


function unavailableEngineResult({
  key,
  reason =
    "ENGINE_NOT_CONFIGURED",
} = {}) {
  return {
    key,

    approved:
      true,

    status:
      "EVIDENCE_UNAVAILABLE",

    score:
      DEFAULT_NEUTRAL_SCORE,

    availability:
      availabilityRecord({
        available:
          false,

        reason,

        evidenceCount:
          0,
      }),

    confidence:
      0,

    summary:
      null,

    evidence:
      [],

    warnings: [
      reason,
    ],

    errors:
      [],
  };
}


function normalizeEngineResult({
  key,
  result,
} = {}) {
  if (
    !result ||
    typeof result !==
      "object"
  ) {
    return unavailableEngineResult({
      key,
      reason:
        "ENGINE_RETURNED_NO_RESULT",
    });
  }

  const available =
    result
      ?.availability
      ?.available === true ||
    result
      ?.available === true ||
    normalizeStatus(
      result
        ?.status,
    ) ===
      "READY";

  const score =
    available
      ? clampScore(
          result
            ?.score,
        )
      : DEFAULT_NEUTRAL_SCORE;

  return {
    key,

    approved:
      result
        ?.approved !== false,

    status:
      available
        ? (
            result
              ?.status ??
            "READY"
          )
        : "EVIDENCE_UNAVAILABLE",

    score,

    availability:
      availabilityRecord({
        available,

        source:
          result
            ?.availability
            ?.source ??
          result
            ?.source ??
          null,

        reason:
          available
            ? null
            : (
                result
                  ?.availability
                  ?.reason ??
                result
                  ?.blocker ??
                result
                  ?.reason ??
                "EVIDENCE_UNAVAILABLE"
              ),

        evidenceCount:
          result
            ?.availability
            ?.evidenceCount ??
          result
            ?.evidence
            ?.length ??
          0,
      }),

    confidence:
      available
        ? clampScore(
            result
              ?.confidence ??
            0,
            0,
          )
        : 0,

    summary:
      result
        ?.summary ??
      null,

    evidence:
      Array.isArray(
        result
          ?.evidence,
      )
        ? clone(
            result
              .evidence,
          )
        : [],

    warnings:
      Array.isArray(
        result
          ?.warnings,
      )
        ? clone(
            result
              .warnings,
          )
        : [],

    errors:
      Array.isArray(
        result
          ?.errors,
      )
        ? clone(
            result
              .errors,
          )
        : [],
  };
}


function normalizeWeights(
  weights = {},
) {
  const output = {};

  let total =
    0;

  for (
    const key
    of ENGINE_KEYS
  ) {
    const weight =
      Math.max(
        0,
        finite(
          weights
            ?.[key],
          DEFAULT_ENGINE_WEIGHTS[
            key
          ],
        ),
      );

    output[
      key
    ] =
      weight;

    total +=
      weight;
  }

  if (
    total <= 0
  ) {
    return {
      ...DEFAULT_ENGINE_WEIGHTS,
    };
  }

  for (
    const key
    of ENGINE_KEYS
  ) {
    output[
      key
    ] =
      output[
        key
      ] / total;
  }

  return output;
}


function aggregateScores({
  engines,
  weights,
} = {}) {
  let weightedScore =
    0;

  let weightedAvailableScore =
    0;

  let availableWeight =
    0;

  let availableCount =
    0;

  for (
    const key
    of ENGINE_KEYS
  ) {
    const engine =
      engines
        ?.[key] ??
      unavailableEngineResult({
        key,
      });

    const weight =
      weights
        ?.[key] ??
      0;

    weightedScore +=
      engine.score *
      weight;

    if (
      engine
        ?.availability
        ?.available === true
    ) {
      weightedAvailableScore +=
        engine.score *
        weight;

      availableWeight +=
        weight;

      availableCount +=
        1;
    }
  }

  const evidenceAdjustedScore =
    availableWeight > 0
      ? (
          weightedAvailableScore /
          availableWeight
        )
      : DEFAULT_NEUTRAL_SCORE;

  const canonicalScore =
    clampScore(
      evidenceAdjustedScore,
    );

  return {
    /*
     * Canonical research score:
     * unavailable engines have zero analytical influence and
     * available engine weights are re-normalized.
     */
    overallScore:
      canonicalScore,

    /*
     * Compatibility alias retained for existing consumers.
     */
    evidenceAdjustedScore:
      canonicalScore,

    /*
     * Presentation-only score preserves neutral midpoint 50
     * for unavailable engines. Never use this for bias,
     * qualification, execution, or research conclusions.
     */
    presentationScore:
      clampScore(
        weightedScore,
      ),

    availableEngineCount:
      availableCount,

    totalEngineCount:
      ENGINE_KEYS.length,

    availableWeight:
      Number(
        availableWeight
          .toFixed(6),
      ),
  };
}


function classifyBias(
  score,
) {
  if (
    score >= 70
  ) {
    return "BULLISH";
  }

  if (
    score <= 40
  ) {
    return "BEARISH";
  }

  return "NEUTRAL";
}


function classifyConfidence({
  availableEngineCount,
  averageConfidence,
} = {}) {
  if (
    availableEngineCount >= 5 &&
    averageConfidence >= 70
  ) {
    return "HIGH";
  }

  if (
    availableEngineCount >= 3 &&
    averageConfidence >= 40
  ) {
    return "MODERATE";
  }

  return "LOW";
}


async function safelyRunEngine({
  key,
  engine,
  context,
} = {}) {
  if (
    typeof engine !==
      "function"
  ) {
    return unavailableEngineResult({
      key,
      reason:
        "ENGINE_NOT_CONFIGURED",
    });
  }

  try {
    const result =
      await engine(
        context,
      );

    return normalizeEngineResult({
      key,
      result,
    });
  } catch (error) {
    return unavailableEngineResult({
      key,

      reason:
        error instanceof Error
          ? `ENGINE_FAILED:${error.message}`
          : "ENGINE_FAILED",
    });
  }
}


export function createCryptoScannerService({
  engines = {},
  engineWeights =
    DEFAULT_ENGINE_WEIGHTS,
  resolveAsset = null,
  resolveMarketContext = null,
} = {}) {
  const weights =
    normalizeWeights(
      engineWeights,
    );


  async function resolveContext({
    query,
  } = {}) {
    let asset =
      null;

    let assetResolution =
      null;

    let market =
      null;


    /**
     * ========================================================
     * ASSET RESOLUTION
     * ========================================================
     *
     * Resolvers may return either:
     *
     * 1. A raw asset object
     *
     * OR
     *
     * 2. A resolver envelope:
     *
     * {
     *   approved,
     *   status,
     *   asset,
     *   source,
     *   ...
     * }
     *
     * Scanner engines must receive the actual asset object,
     * not the resolver envelope.
     */

    if (
      typeof resolveAsset ===
      "function"
    ) {
      try {
        const resolved =
          await resolveAsset({
            query,
          });


        assetResolution =
          resolved;


        asset =
          resolved
            ?.asset ??
          resolved ??
          null;


        if (
          resolved &&
          typeof resolved ===
            "object" &&
          resolved
            ?.approved ===
            false
        ) {
          asset =
            null;
        }
      } catch (
        error
      ) {
        asset =
          null;

        assetResolution = {
          approved:
            false,

          status:
            "CRYPTO_SCANNER_ASSET_RESOLUTION_FAILED",

          error:
            error instanceof Error
              ? error.message
              : String(
                  error,
                ),
        };
      }
    }


    /**
     * ========================================================
     * MARKET CONTEXT
     * ========================================================
     */

    if (
      typeof resolveMarketContext ===
      "function"
    ) {
      try {
        market =
          await resolveMarketContext({
            query,
            asset,
          });
      } catch {
        market =
          null;
      }
    }


    /**
     * ========================================================
     * SYMBOL / MARKET TYPE / VENUE
     * ========================================================
     */

    const symbol =
      normalizeSymbol(
        asset
          ?.symbol ??
        market
          ?.symbol ??
        inferSymbol(
          query,
        ),
      );


    const cexCount =
      Number(
        asset
          ?.venues
          ?.cexCount,
      ) ||
      0;


    const dexCount =
      Number(
        asset
          ?.venues
          ?.dexCount,
      ) ||
      0;


    let inferredMarketType =
      "UNKNOWN";


    if (
      cexCount > 0 &&
      dexCount > 0
    ) {
      inferredMarketType =
        "CEX_DEX";
    } else if (
      cexCount > 0
    ) {
      inferredMarketType =
        "CEX";
    } else if (
      dexCount > 0
    ) {
      inferredMarketType =
        "DEX";
    } else if (
      isContractLike(
        query,
      )
    ) {
      inferredMarketType =
        "DEX";
    }


    const marketType =
      market
        ?.type ??
      asset
        ?.marketType ??
      inferredMarketType;


    const venue =
      market
        ?.venue ??
      asset
        ?.venue ??
      asset
        ?.venues
        ?.primaryVenue ??
      null;


    /**
     * ========================================================
     * ENGINE CONTEXT
     * ========================================================
     */

    return {
      query,

      symbol,

      asset:
        clone(
          asset,
        ),

      assetResolution:
        assetResolution
          ? {
              approved:
                assetResolution
                  ?.approved,

              status:
                assetResolution
                  ?.status,

              source:
                assetResolution
                  ?.source,

              refreshed:
                assetResolution
                  ?.refreshed,

              universeStatus:
                assetResolution
                  ?.universeStatus,
            }
          : null,

      market:
        clone(
          market,
        ),

      marketType,

      venue,

      venues:
        clone(
          asset
            ?.venues ??
          {},
        ),

      requestedAt:
        nowIso(),
    };
  }

  async function scan({
    query,
    metadata = {},
  } = {}) {
    const normalizedQuery =
      normalizeQuery(
        query,
      );

    if (
      !normalizedQuery
    ) {
      return {
        approved:
          false,

        status:
          "CRYPTO_SCAN_REJECTED",

        blocker:
          "QUERY_REQUIRED",

        executionAuthority:
          false,

        liveExecution:
          false,
      };
    }

    const scanStartedAt = Date.now();

    const resolveStartedAt = Date.now();
    const context =
      await resolveContext({
        query:
          normalizedQuery,
      });
    const resolveContextMs = elapsedMs(resolveStartedAt);

    /**
     * ========================================================
     * CANONICAL DEEP RESEARCH
     * ========================================================
     *
     * One research authority feeds both the automatic discovery scanner and
     * the manual Engines endpoint. This does NOT invoke discovery selection,
     * final revalidation, paper authority, or execution.
     */
    let deepResearch = null;
    const deepResearchStartedAt = Date.now();

    try {
      const resolvedAsset =
        context?.asset && typeof context.asset === "object"
          ? context.asset
          : {};

      deepResearch =
        await researchCryptoCandidate({
          /*
           * Fundamental/market providers expect canonical identity and
           * market fields at the candidate root. Flatten the resolved asset
           * into the research candidate while retaining the nested asset.
           */
          ...resolvedAsset,
          ...context,

          asset:
            context?.asset ??
            resolvedAsset,

          assetId:
            context?.assetId ??
            resolvedAsset?.assetId ??
            resolvedAsset?.id ??
            resolvedAsset?.coinGeckoId ??
            null,

          coinGeckoId:
            context?.coinGeckoId ??
            resolvedAsset?.coinGeckoId ??
            resolvedAsset?.assetId ??
            resolvedAsset?.id ??
            null,

          symbol:
            context?.symbol ??
            resolvedAsset?.symbol ??
            null,

          name:
            context?.name ??
            resolvedAsset?.name ??
            null,

          candidateType:
            context?.candidateType ??
            resolvedAsset?.candidateType ??
            resolvedAsset?.type ??
            (
              resolvedAsset?.tradable === true ||
              Number(resolvedAsset?.venues?.cexCount ?? 0) > 0
                ? "CEX"
                : "UNKNOWN"
            ),

          /*
           * Do not manufacture a measurements contract from the raw asset.
           * If a genuine normalized measurement contract already exists,
           * preserve it. Otherwise the adapters are allowed to build it.
           */
          ...(context?.measurements
            ? {
                measurements:
                  context.measurements,
              }
            : {}),

          metadata: {
            ...clone(metadata),
            gptIntelligenceTimeoutMs:
              Math.max(
                1000,
                Number(
                  process.env.CRYPTO_GPT_SCANNER_TIMEOUT_MS ??
                  45000,
                ) || 45000,
              ),
          },

          researchOnly: true,
          executionAuthority: false,
          liveExecution: false,
        });
    } catch (error) {
      deepResearch = {
        researchStatus: "RESEARCH_ERROR",
        researchError:
          error instanceof Error
            ? error.message
            : String(error),
        pillars: {},
        engines: {},
        researchOnly: true,
        executionAuthority: false,
        liveExecution: false,
      };
    }

    const deepResearchMs = elapsedMs(deepResearchStartedAt);

    const engineResults = {
      ...(deepResearch?.engines ?? {}),
    };

    /*
     * Valuation is optional research depth (0% canonical weight).
     * Keep it out of the critical path beyond a small bounded budget.
     */
    const valuationStartedAt = Date.now();
    const valuation =
      await runValuationWithBudget(
        context,
        metadata,
      );
    const valuationMs = elapsedMs(valuationStartedAt);

    engineResults.valuation = valuation;

    const aggregate =
      aggregateScores({
        engines:
          engineResults,

        weights,
      });

    const availableConfidences =
      ENGINE_KEYS
        .map(
          key =>
            engineResults[
              key
            ],
        )
        .filter(
          engine =>
            engine
              ?.availability
              ?.available ===
            true,
        )
        .map(
          engine =>
            finite(
              engine
                ?.confidence,
              0,
            ),
        );

    const averageConfidence =
      availableConfidences
        .length > 0
        ? (
            availableConfidences
              .reduce(
                (
                  total,
                  value,
                ) =>
                  total +
                  value,
                0,
              ) /
            availableConfidences
              .length
          )
        : 0;

    const completeness =
      (
        aggregate
          .availableEngineCount /
        aggregate
          .totalEngineCount
      ) * 100;

    const overallScore =
      aggregate
        .overallScore;

    return {
      approved:
        true,

      status:
        "CRYPTO_SCAN_COMPLETE",

      timestamp:
        nowIso(),

      query:
        normalizedQuery,

      symbol:
        context
          .symbol,

      asset:
        context
          .asset,

      market:
        context
          .market,

      marketType:
        context
          .marketType,

      venue:
        context
          .venue,

      overallScore,

      evidenceAdjustedScore:
        aggregate
          .evidenceAdjustedScore,

      presentationScore:
        aggregate
          .presentationScore,

      bias:
        classifyBias(
          overallScore,
        ),

      confidence:
        classifyConfidence({
          availableEngineCount:
            aggregate
              .availableEngineCount,

          averageConfidence,
        }),

      confidenceScore:
        Number(
          averageConfidence
            .toFixed(2),
        ),

      // Canonical Deep Research contract used by CryptoEngines.jsx.
      researchScore:
        deepResearch?.researchScore ?? null,

      researchConfidence:
        deepResearch?.researchConfidence ?? 0,

      researchCoverage:
        deepResearch?.researchCoverage ?? 0,

      researchAvailableWeight:
        deepResearch?.researchAvailableWeight ?? 0,

      researchRepresentedEvidenceWeight:
        deepResearch?.researchRepresentedEvidenceWeight ?? 0,

      researchWeights:
        deepResearch?.researchWeights ?? {
          technical: 0.20,
          fundamental: 0.20,
          supporting: 0.60,
        },

      pillars:
        deepResearch?.pillars ?? {},

      qualification2:
        deepResearch?.qualification2 ?? null,

      qualification2Readiness:
        deepResearch?.qualification2Readiness ?? null,

      // Expose canonical pillars alongside diagnostics for frontend detail cards.
      engines: {
        technical:
          deepResearch?.pillars?.technical ?? null,
        fundamental:
          deepResearch?.pillars?.fundamental ?? null,
        supporting:
          deepResearch?.pillars?.supporting ?? null,
        ...engineResults,
      },

      weights,

      availability: {
        status:
          aggregate
            .availableEngineCount ===
          aggregate
            .totalEngineCount
            ? "COMPLETE"
            : aggregate
                .availableEngineCount >
              0
              ? "PARTIAL"
              : "UNAVAILABLE",

        availableEngineCount:
          aggregate
            .availableEngineCount,

        totalEngineCount:
          aggregate
            .totalEngineCount,

        completeness:
          Number(
            completeness
              .toFixed(2),
          ),

        unavailableEngines:
          ENGINE_KEYS.filter(
            key =>
              engineResults[
                key
              ]
                ?.availability
                ?.available !==
              true,
          ),
      },

      warnings:
        ENGINE_KEYS.flatMap(
          key =>
            engineResults[
              key
            ]
              ?.warnings ??
            [],
        ),

      errors:
        ENGINE_KEYS.flatMap(
          key =>
            engineResults[
              key
            ]
              ?.errors ??
            [],
        ),

      researchArchitecture:
        deepResearch?.researchArchitecture ??
        "TECHNICAL_20_FUNDAMENTAL_20_SUPPORTING_60",

      canonicalDeepResearchArchitecture:
        "TECHNICAL_20_FUNDAMENTAL_20_SUPPORTING_60",

      performance: {
        resolveContextMs,
        deepResearchMs,
        valuationMs,
        totalMs: elapsedMs(scanStartedAt),
        valuationBudgetMs:
          Math.max(
            500,
            Number(
              process.env.CRYPTO_VALUATION_TIMEOUT_MS ??
              2500,
            ) || 2500,
          ),
      },

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  function getCapabilities() {
    return {
      approved:
        true,

      status:
        "CRYPTO_SCANNER_CAPABILITIES_READY",

      engines:
        ENGINE_KEYS.map(
          key => ({
            key,

            configured:
              typeof engines
                ?.[key] ===
              "function",

            weight:
              weights[
                key
              ],
          }),
        ),

      researchDepthEngines: [
        {
          key: "valuation",
          configured: true,
          canonicalWeight: 0,
          affectsCanonicalScore: false,
        },
      ],

      neutralUnavailableScore:
        DEFAULT_NEUTRAL_SCORE,

      paperExecution:
        true,

      liveExecution:
        false,

      executionAuthority:
        false,
    };
  }


  return {
    scan,
    getCapabilities,

    engineKeys: [
      ...ENGINE_KEYS,
    ],

    weights:
      clone(
        weights,
      ),

    paperExecution:
      true,

    liveExecution:
      false,

    executionAuthority:
      false,
  };
}


export default createCryptoScannerService;
